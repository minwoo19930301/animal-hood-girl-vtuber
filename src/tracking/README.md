# src/tracking — 웹캠 → RigFrame 트래킹

MediaPipe Tasks(JS/WASM, 로컬 에셋)로 얼굴 변환행렬·52 블렌드셰이프·양손 21관절을 뽑아
`RigFrame`(src/contract.ts)으로 매핑한다. 모든 수학은 `math.ts` 순수 함수에 있고
(`index.ts`는 I/O·스케줄링만), 필터는 `oneEuro.ts`의 One Euro 구현을 쓴다.

## 파일

| 파일 | 역할 |
|---|---|
| `index.ts` | `createTracker()`. mediapipe 초기화(GPU→CPU 폴백), rVFC 루프, 더블버퍼, 감쇠 |
| `math.ts` | 행렬 분해, 블렌드셰이프 매핑, 손→날개 intent, EMA/approach — 순수 함수 |
| `oneEuro.ts` | One Euro 필터 (Casiez et al., CHI 2012) 순수 클래스 |

## 머리 포즈: 행렬 분해와 부호 근거

- MediaPipe Face Geometry 좌표계: 오른손 좌표계, 가상 카메라가 원점에서 **-Z**를 봄
  (얼굴의 평행이동 z는 음수 cm), +X=이미지 오른쪽(=사용자의 왼쪽), +Y=위.
- `Matrix.data`는 **column-major** (proto 기본 layout, tasks-vision JS는 그대로 복사;
  three.js `fromArray` 기반 공식 데모와 일치). 동차행렬 마지막 행 (0,0,0,1)이
  어느 슬롯에 있는지로 layout을 **런타임 자동 판별** — 전치로 잘못 읽으면 모든 각의
  부호가 뒤집히기 때문(`decomposeHeadMatrix`의 주석 참조).
- 분해: `R = Ry(θ)·Rx(φ)·Rz(ψ)`. 계약(거울 모드) 매핑:

| 계약 채널 | 식 | 근거(요약) |
|---|---|---|
| `pitch` (+위) | `-φ = asin(r12)` | Rx(+φ)는 코를 아래로 → 위를 보면 φ<0. 거울은 상하 불변 |
| `yaw` (+캐릭터 자기 왼쪽=뷰어 오른쪽) | `-θ`, θ=atan2(r02,r22) | Ry(+θ)=코가 이미지 오른쪽(사용자 왼쪽). 거울 모드에서 사용자 오른쪽 응시 → +yaw |
| `roll` (+캐릭터 왼쪽으로 기움) | `+ψ`, ψ=atan2(r10,r11) | Rz(+ψ)=사용자가 자기 오른쪽으로 기움. 거울은 카이랄리티와 "캐릭터 왼쪽" 정의를 동시에 뒤집어 부호 유지 |

검증 방법(실기기): 콘솔에서 `window.__mingoTracking.lastMatrix` 확인 —
`data[12..14]`에 평행이동(cm, z≈-30)이 있으면 column-major 가정이 맞는 것.
고개를 위로 들면 `latest().head.pitch > 0`이어야 한다.

## 표정 매핑 (거울: 사용자 왼쪽 = 캐릭터 오른쪽)

| RigFrame | 소스 블렌드셰이프 | 비고 |
|---|---|---|
| `blinkL` | `eyeBlinkRight` | 사용자 오른눈 → 캐릭터 왼눈 |
| `blinkR` | `eyeBlinkLeft` | |
| `browL` | `max(browInnerUp, browOuterUpRight) - browDownRight` | -1..1 |
| `browR` | `max(browInnerUp, browOuterUpLeft) - browDownLeft` | |
| `mouthOpen` | `jawOpen` | 0..1 |
| `mouthSmile` | `avg(smileL,R) - avg(frownL,R)` | -1..1 |
| `gaze.x` | `avg(eyeLookInLeft, eyeLookOutRight) - avg(eyeLookOutLeft, eyeLookInRight)` | +=뷰어 오른쪽 (yaw와 동일 방향) |
| `gaze.y` | `avg(eyeLookUp*) - avg(eyeLookDown*)` | **+위** (pitch 계약과 동일 방향으로 통일) |

## 손 → 날개 intent

라벨→날개: Tasks 문서상 handedness는 **셀피(좌우 반전) 입력 가정**으로 예측되는데
우리 `<video>`는 무반전 피드라 라벨을 한 번 스왑해야 하고(라벨 'Left'=실제 오른손),
계약의 거울 매핑(사용자 오른손→`wingL`)으로 한 번 더 뒤집혀 **결국
라벨 'Left'→`wingL`, 'Right'→`wingR`** (index.ts 해당 주석 참조).

| intent | 계산 (math.ts `computeWingIntents`) |
|---|---|
| `raise` | 손목이 어깨선(턱+0.9·faceH) 위로 오른 정도 / 1.6·faceH |
| `out` | \|손목x − 얼굴중심x\| 에서 몸통 데드존(0.5·faceH) 제외 / 1.4·faceH |
| `curl` | 4손끝↔손바닥중심 평균거리 / 손크기(손목→중지MCP) 비율을 [1.15(펴짐)..0.45(주먹)]에서 역정규화 |
| `spread` | 검지 방향(MCP→끝) vs 약지 방향(MCP→끝) 각도를 [0.1..0.55 rad]로 정규화 — 손목 기준 각은 주먹에서도 안 줄어들어(MCP 간격 지배) 방향 벡터 사용 |
| `wave` | \|손목 x 속도\|의 EMA(τ=0.25s) / 1.0 화면폭/초 — 부호 상쇄 없이 "흔드는 세기"만 |
| `present` | handedness score 게이팅(등장 0.7 / 유지 0.5 히스테리시스) + 등장 0.12s / 소실 0.4s 선형 감쇠 |

## 필터·타이밍 튜닝 상수

| 항목 | 값 | 근거 |
|---|---|---|
| One Euro 기본 | minCutoff 1.0 / beta 0.007 | BRIEF 기본값 (논문 권장 시작점) |
| 머리 pitch/yaw/roll | 1.0 / **0.05** | beta↑: 빠른 끄덕임에 지연 없이 (BRIEF "머리는 민감하게") |
| blink | **3.0** / 0.05 | 0.1s급 고속 신호 — 과평활 시 눈이 안 감김 |
| gaze | 0.8 / 0.02, brow·mouth | 1.5 / 0.01~0.02 | 지터 억제 우선 |
| 날개 intents | **0.5** / 0.007 | minCutoff↓: 부드럽게 (BRIEF) |
| tracked | 상승 0.15s / 감쇠 0.5s | BRIEF "얼굴 미검출 ~0.5s 감쇠" |
| present | 상승 0.12s / 감쇠 0.4s | BRIEF "손 소실 ~0.4s, 스냅 금지" |
| 손 실행 주기 | 격프레임 (~15Hz@30fps) | BRIEF 부하 절감 허용. 미검출 판정 유예 300ms |
| 필터 리셋 | 소실 1s 초과 후 재획득 시 | One Euro 미분 스파이크 방지 |

## 루프/버퍼 설계

- `video.requestVideoFrameCallback` 구동. mediapipe 타임스탬프는 `max(last+1, floor(now))`로
  단조 증가 보장.
- 더블버퍼: back 버퍼를 완전히 채운 뒤 front 인덱스만 교체 → `latest()`는 항상 완성 프레임.
- 디버그: `window.__mingoTracking = { fps, lastBlendshapes, lastMatrix }`.

## 알려진 한계

1. **부호의 실기기 검증 미완**: 이 코드는 웹캠이 없는 환경에서 작성됨. 유도는 주석에
   남겼으나, 실기기에서 yaw/roll 방향이 반대로 보이면 `decomposeHeadMatrix`의
   `yaw: -theta` / `roll: psi` 부호만 뒤집으면 된다 (한 곳 수정).
2. **handedness 스왑 가정**: 문서 기준 "셀피 가정 → 무반전 피드는 스왑"을 적용했다.
   날개가 좌우 반대면 index.ts의 `side` 결정 한 줄만 뒤집을 것.
3. **정규화 좌표 종횡비**: intent 계산에서 x/y가 픽셀 종횡비(4:3)만큼 단위가 다르다.
   전부 클램프되는 휴리스틱이라 실용상 문제없지만 `out`/`spread` 스케일이 약간 달라질 수 있다.
4. **curl/spread 상수는 휴리스틱**: 손 모양·카메라 각도에 따라 재튜닝 여지
   (`HAND_TUNING` 한 곳에 모아둠).
5. **어깨선 근사**: 포즈 모델 없이 얼굴 기준(턱+0.9·faceH)으로 근사 — 몸을 기울이면 오차.
6. **격프레임 손 추적**: 빠른 손동작에서 wave 속도 추정이 약간 과소평가될 수 있다.
