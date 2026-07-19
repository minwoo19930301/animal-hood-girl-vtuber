# src/tracking — 웹캠 → RigFrame 트래킹 (계약 v2: ArmPose/BodyPose)

MediaPipe Tasks(JS/WASM, 로컬 에셋)로 얼굴 변환행렬·52 블렌드셰이프·양손 21관절·
포즈 33관절(worldLandmarks, 미터)을 뽑아 `RigFrame`(src/contract.ts)으로 매핑한다.
모든 수학은 `math.ts` 순수 함수에 있고(`index.ts`는 I/O·스케줄링·상태만),
필터는 `oneEuro.ts`의 One Euro 구현을 쓴다.

## 파일

| 파일 | 역할 |
|---|---|
| `index.ts` | `createTracker()`. mediapipe 초기화(GPU→CPU 폴백), rVFC 루프, 케이던스, 필터/기준선 상태, 더블버퍼, present 감쇠 |
| `math.ts` | 행렬 분해, 블렌드셰이프 매핑, 몸통 기저(그람-슈미트)+거울 매핑, 손 기저/외적 부호, 손가락 관절각, BodyPose 기하 — 순수 함수 |
| `oneEuro.ts` | One Euro 필터 (Casiez et al., CHI 2012) 순수 클래스 |

## 케이던스 (BRIEF §2)

- 얼굴: 매 프레임(rVFC). 포즈: 짝수 프레임, 손: 홀수 프레임 — 교차 ≈15Hz@30fps.
- mediapipe 타임스탬프는 `max(last+1, floor(now))`로 단조 증가 보장 (세 태스크 공유 가능).
- 부재 백오프: 10s+ 얼굴 미검출 시 얼굴 1/4 케이던스, 포즈/손 완전 스킵
  (팔/몸은 present 감쇠로 idle 복귀, 재획득은 얼굴부터).

## 좌표계와 거울 매핑 (핵심 — math.ts 주석에 전체 유도)

- mp world: +x=이미지 오른쪽(=사용자 왼쪽), +y=아래, +z=카메라에서 멂
  (d.ts: "smaller z = closer to camera"). pose 원점=엉덩이 중점, hand 원점=손 중심 —
  방향벡터(차분)만 쓰므로 원점 차이는 소거.
- 몸통 기저(그람-슈미트): bx=어깨 12→11(사용자 왼쪽), by=월드 위(0,-1,0)를 bx에
  직교화, bz=bx×by(카메라 쪽). 퇴화 시 `CAMERA_BASIS` 폴백.
- 거울 매핑: `char = (-d·bx, d·by, d·bz)` — 좌우 성분만 반전하는 반사(행렬식 -1).
  검산 3종: 차렷 (-0.17,0.98,0)→(0.17,-0.98,0), T자 (-1,0,0)→(1,0,0),
  앞으로 (0,0,-1)→(0,0,1). 모두 계약 주석 예시와 일치.

## ArmPose

| 채널 | 소스 | 계산 |
|---|---|---|
| `upperDir/lowerDir` | pose world (팔 체인은 pose 기준 — BRIEF §4) | 어깨→팔꿈치 / 팔꿈치→손목을 기저 변환+거울. armL=사용자 오른팔(12,14,16) |
| `handDir/palmNormal` | hand world (손 자세는 hand 기준) | handDir=손목0→중지MCP9, palmRef=검지5→새끼17, palmNormal=오른손 `handDir×palmRef` / 왼손 `palmRef×handDir` (외적 부호 유도는 math.ts — 왼/오른손은 카이랄리티가 반대) |
| `fingers[5]` | hand world 3D 관절각 | 손가락=∠MCP+∠PIP+∠DIP 합 [0.6..4.0rad], 엄지=BRIEF식 2관절 [0.25..1.5] |
| `spread` | hand world | 검지 기절골(5→6) vs 새끼 기절골(17→18) 방향각 [0.3..0.95rad] |
| `present` | pose visibility | min(어깨,팔꿈치,손목 vis) 히스테리시스(0.6/0.45) + 등장 0.12s/소실 0.4s. **포즈 실패 시 0** (BRIEF §8) |
| `wave` | — | 항상 0 (계약: aliveness 전용) |

손↔팔 매칭: 1순위 포즈 손목(이미지 좌표) 최근접(반경 0.2), 2순위 handedness 라벨
이중반전(셀피 가정 스왑 × 거울 = 라벨 'Left'→armL). 필터 후 palmNormal은
handDir에 그람-슈미트로 재직교화.

## BodyPose

| 채널 | 계산 (모두 pose world, 부호 유도는 math.ts `bodyRawFromPose`) |
|---|---|
| `shrugL/R` | 귀↔어깨 거리(몸통 up 사영)의 기준선 대비 감소 / (0.2×기준선). 기준선=비대칭 엔벨로프 EMA(이완 3s / 으쓱 25s) — BRIEF §6 캘리브레이션 |
| `lean.x` | 어깨라인 vs 수평면 각. 사용자 오른쪽 기울임 → + (거울) |
| `lean.z` | 어깨중심 vs 엉덩이중심 z차 각. 앞(카메라)으로 숙임 → + |
| `twist` | 어깨라인 vs 엉덩이라인 y회전차. 사용자 오른쪽 돌기 → + |
| `hipShift` | (엉덩이중심-발목중심)·bx / 0.09m, 부호 반전(+캐릭터 왼발). world 원점이 엉덩이라 절대이동이 없어 **발목 기준 필수**. 발목 비가시 시 이미지 엉덩이 x 기준선(EMA 8s) 폴백 |
| `legsPresent` | min(무릎25,26 vis) 히스테리시스(0.55/0.45) + 등장/소실 감쇠 (BRIEF §6 ">0.5") |
| `kneeL/R` | ∠(엉덩이→무릎, 무릎→발목) / 2.2rad. kneeL=사용자 오른다리(24,26,28) |

## 필터·타이밍

| 항목 | 값 | 근거 |
|---|---|---|
| 머리 pitch/yaw/roll | 1.0 / 0.05 | beta↑: 빠른 끄덕임에 지연 없이 |
| blink | 3.0 / 0.05 | 0.1s급 고속 신호 — 과평활 시 눈이 안 감김 |
| 방향벡터 (upper/lower/palm/hand) | 성분별 1.2 / 0.04 → **재정규화** | BRIEF §7. 퇴화 시 이전 값 유지 |
| fingers/spread | 0.8 / 0.015 | BRIEF §7 "살짝 느리게" |
| shrug | 1.5 / 0.05 | 빠른 제스처 |
| lean/twist/hipShift | 0.8 / 0.02, knee 1.0 / 0.03 | 저속 자세 — 지터 억제 우선 |
| tracked | 상승 0.15s / 감쇠 0.5s | BRIEF |
| present (팔/몸/다리) | 상승 0.12s / 감쇠 0.4s | BRIEF §7 "0.4s 감쇠, 스냅 금지" |
| 필터 리셋 | 소실 1s 초과 후 재획득 | One Euro 미분 스파이크 방지. shrug/hip 기준선은 유지 |

## 머리 포즈 / 표정 (기존과 동일)

행렬 분해 `R=Ry·Rx·Rz`, column-major 자동 판별, 거울 부호(pitch=-φ, yaw=-θ, roll=+ψ),
블렌드셰이프 좌우 스왑 — `math.ts` §1~2 주석 참조. 검증:
`window.__mingoTracking.lastMatrix`의 data[12..14]에 cm 평행이동(z≈-30)이 있어야 한다.

## 디버그

`window.__mingoTracking = { fps, lastBlendshapes, lastMatrix, lastPoseVis }` —
`lastPoseVis`로 팔/몸/다리 visibility 게이팅 상태 관찰.

## 알려진 한계

1. **부호의 실기기 검증 미완**: 웹캠 없는 환경에서 작성. 유도·수치검증(순수 함수에
   합성 랜드마크 주입, 27케이스)은 통과했으나 실기기에서 반대로 보이면:
   팔/손 좌우 전체 → `charDirFromWorld`의 `-u` 한 곳, 손바닥 앞뒤 →
   `handOrientFromWorld`의 외적 순서, 몸통 채널 → `bodyRawFromPose` 해당 식.
2. **handedness 라벨**: 포즈 손목 최근접 매칭이 1순위라 라벨 오분류에는 강건하지만,
   포즈 비가시 상태에서는 라벨 이중반전 가정('Left'→armL)에 의존.
3. **pose 관절 정체성**: 무반전 피드에서 인덱스 11=사용자 왼어깨로 신뢰. 실기기에서
   좌우가 반대면 `ARM_POSE_IDX`/`bodyRawFromPose`의 L/R 인덱스만 스왑.
4. **정규화 상수는 휴리스틱**: `FINGER_TUNING`/`BODY_TUNING`에 집약 — 체형·카메라에
   따라 재튜닝 여지.
5. **shrug 기준선 크리프**: 으쓱을 ~25s 이상 유지하면 기준선이 따라와 값이 준다
   (비대칭 τ로 완화).
6. **격프레임 포즈/손**: 빠른 팔 휘두름에서 ~66ms 지연. 손 프레임의 몸통 기저는
   ≤2프레임 이전 포즈 것을 사용.
