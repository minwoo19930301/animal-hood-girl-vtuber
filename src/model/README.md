# src/model — VRM 휴머노이드 + 프로시저럴 플라밍고 후드

> 2026-07 룩 업데이트: avatar.vrm(리페인트 VRoid)에서 후드 상시 켬, AccessoryNeck(보타이)
> 런타임 숨김, 드로스트링 슬림화(골드 링 제거·카라 기부 앵커), smile → closed-lip 리매핑.
> 긴팔은 Body 텍스처(15) 팔 스트립을 화이트+코랄 커프로 페인트해 표현(메쉬 연장 없음).

`createMingo(): MingoModel` (계약: `src/contract.ts`). **동기 생성 + `ready` 프라미스**로
VRM 비동기 로드 — 로드 전 `apply()`는 no-op, 로드 후 `height`/`hitMeshes` 실측 갱신
(호출측은 `ready` 후 카메라 재프레이밍). `Math.random()` 없음 — 2차 모션은 전부 dt 기반 스프링.

## VRM 교체 방법 (사용자 VRoid 모델)

1. `.vrm` 파일을 `public/models/` 에 넣는다.
2. `src/model/index.ts` 상단의 `MODEL_URL` 상수를 그 경로로 바꾼다
   (현재 `./models/placeholder.vrm` — VRoid 샘플 Sendagaya Shino).
3. 끝. VRM0/VRM1 모두 지원:
   - `VRMUtils.rotateVRM0()`로 VRM0(-Z 정면)을 계약 정면(+Z)으로 회전.
   - 리깅 부호는 `S = metaVersion==='0' ? +1 : -1` 하나로 흡수 (머리 회전·팔·손가락·후드 플립).
   - 후드/FX 스케일은 로드 시 **머리 바운딩 실측**(crownH = 모델 최고점 − head 본 y,
     hw = 눈 본 간격×1.35, 얼굴 평면 frontZ/halfW = 목보다 완전히 위에 있는 메시의
     월드 바운딩 → 후드 프레임 변환)에서 자동 산출 — 모델이 바뀌어도 후드가 맞는다.
   - 표정은 preset 존재 여부를 로드 시 캐시(`blinkLeft/blinkRight` 없으면 `blink` 폴백,
     `surprised` 없으면 skip).

## 파일

| 파일 | 역할 |
|---|---|
| `index.ts` | VRM 로드(GLTFLoader+VRMLoaderPlugin), MToon 튜닝, 리그 캡처, `apply()` 전체 배선 |
| `armSolver.ts` | 계약 v2 ArmPose 방향벡터 → 정규화 본 FK 솔버 (스윙-트위스트 롤 안정화, 팔꿈치 힌지, 손목 기저+클램프) + `armSolverSelfTest()` |
| `hood.ts` | 프로시저럴 플라밍고 후드 (셸+안감+부리+눈+속눈썹+눈물점), `HOOD_COL` 색상 |
| `fx.ts` | FX 빌보드: 하트 2개(눈앞)·땀방울(관자놀이)·분노 십자(후드 이마) |
| `materials.ts` | 후드용 2톤 hue-shift 툰 ShaderMaterial + inverted-hull 아웃라인(`addOutline`) |
| `geo.ts` | taperedTube/teardrop/heart 등 프로시저럴 지오메트리 헬퍼 |
| `springs.ts` | 감쇠 조화진동 `Spring` + 지연 팔로워 `Follower` (후드 출렁임) |

## 렌더/룩 (v1: MToon 튜닝 + 고정 조명)

- 조명은 **모델 모듈 소유**: `root`에 DirectionalLight(`TOON.lightDir`, 1.25) + Ambient 0.55.
  절대 안 움직임. 커스텀 SDF 페이스 셰이딩은 다음 라운드.
- `tuneMToon()`: 모든 MToon 머티리얼 순회 — shadeColorFactor를 어둡게가 아니라
  **hue-shift**(마젠타 쪽 −0.045, 명도 +) 방향으로, `shadingToonyFactor ≥ 0.92`로 셀 경계
  크리스프, 기존 아웃라인이 있는 머티리얼만 폭 ×1.3 + 검보라(0x3a2040)로 통일.
- 후드는 씬 라이트 무시하는 자체 툰 셰이더(`toonMat`) — 항상 동일한 셀 룩.

## 후드 구조 (`hood.ts`, head 본 로컬 프레임: 정면 -Z 기준으로 빌드)

```
pivot (정규화 head 본에 어태치; VRM1이면 y π 플립)
├─ fx.group (하트/땀/분노 — 스프링 회전 없음)
└─ shellPivot (Follower: 고개 pitch/yaw 지연 추종 ×0.35/0.28)
   ├─ 셸: cutShellGeo(SHELL_AP: ax=0.98, ayUp=0.52, ayDown=1.05) — 타원 콘 안쪽 버텍스를
   │  림으로 collapse **+ 전부-내부 삼각형 인덱스 드롭** (드롭 없으면 축 근처 φ π-점프로
   │  림 반대편을 잇는 "웹" 페이스가 개구부를 덮어 얼굴을 가린다 — v2 P0 버그).
   │  위(ayUp) 림은 얼굴 평면(face.frontZ, index.ts가 목 위 메시 바운딩으로 실측)보다
   │  앞(-Z)에서 앞머리 위로 드리움 — rz 하한 (C.z−frontZ+0.05·crownH)/cos(ayUp−TILT).
   │  측면 림은 얼굴 평면보다 뒤 — 얼굴이 개구부 밖으로 살짝 나온 느낌.
   │  아래(ayDown)는 바닥 컷과 합쳐져 턱 밑 오픈. rx=max(rz, hw·1.9·GROW,
   │  (halfW+0.06·crownH)/sin(ax)), ry=crownH·0.8·GROW, C=(0, .42, .08)·crownH, GROW=1.08
   ├─ 안감: 같은 지오메트리(LINING_AP: ax 0.90/ayUp 0.46 — 셸보다 ~0.06rad 좁게) ×0.985,
   │  DoubleSide 진핑크 → 림 안쪽 얇은 밴드로만 보이고 얼굴은 절대 안 덮음
   ├─ 눈×2: a=±0.54, e=0.30 방향 셸 표면 (개구부 밖 단단한 면) — 검정 눈판+흰 하이라이트
   │  +핑크 림+속눈썹 3가닥(병합 1메시)+노란 눈물점. Re=crownH·0.125
   └─ beakPivot (추가 Follower, pitch ×0.32 — 숙일 때 부리 끝이 눈썹 아래로 안 내려오게)
      ├─ 메인: taperedTube 연핑크, 반경 0.33→0.16 crownH (통통한 벌브가 아래로 드리움)
      └─ 팁: taperedTube 검보라 딥, 눈썹 위까지만 훅. 메인과 살짝 오버랩해 심 은폐
```
아웃라인: 전부 inverted hull `PALETTE.nightPurple`, 폭 crownH×0.018~0.030.
색은 `refs/target-human.png` 샘플: 겉 `0xf2799e`, 안감 `0xd94f6f`, 부리 살몬 `0xf78fa7`
+ 팁 `0x28202e` (`HOOD_COL`).

## apply() 리그 매핑

- **머리**: pitch/yaw/roll → 정규화 neck 40% + head 60% (roll은 30/70).
  부호: `rotation.set(S·pitch, yaw, S·roll)` — S는 위의 VRM0/1 부호.
- **gaze** → `vrm.lookAt.yaw/pitch` (deg): `yaw = gaze.x·14`, `pitch = −gaze.y·11`
  (three-vrm은 pitch+가 아래).
- **표정**: blinkL/R→`blinkLeft/Right`(폴백 `blink`에 max), mouthOpen→`aa`,
  smile>0→**closed-lip 리매핑**: `relaxed`(VRoid Fun, 입꼬리 상승)×0.8 주 채널 +
  `happy`(Joy, jaw-open 포함)는 min(×0.5, **0.12 캡**) — 다문 입꼬리 미소(레퍼런스).
  smile<0→`sad`×0.4, fx.happy→`happy` 1.0(이벤트만 풀 Joy), browRaise>0→`surprised`×0.3.
- **호흡**: raw chest 균일 스케일 ±0.6% + 어깨 들썩 0.02 + 몸통 최상단 본 회전 x ±0.012·sin
  (lean/twist 오일러에 합산 — 아래 BodyPose).
- **FX**: visible 토글 + t 기반 펄스/바운스 (하트 스케일 ±10%, 땀 y 바운스, 분노 ±6%).
- 매 프레임 끝에 `vrm.update(dt)` (정규화→raw 복사·expression·lookAt·스프링본).

## 팔 = ArmPose 방향벡터 FK (계약 v2, `armSolver.ts`)

트래킹이 캐릭터 공간 방향벡터(upperDir/lowerDir/palmNormal/handDir)를 내면 모델이
rest pose 기준 FK 솔브 — "raise/out 의도" 방식(v1 `ARM` 상수)은 폐기.

- **좌표 흡수**: S 부호 가지치기 대신 리그 루트(normalizedHumanBonesRoot) 월드
  쿼터니언⁻¹(charToRig) 하나로 VRM0/1 차이를 통째로 흡수. rest 방향(상완/하완/손/손바닥
  기저·팔꿈치 힌지축)은 로드 시 1회, 정규화 본 **위치**에서 실측.
- **upperArm**: swing(setFromUnitVectors) + 힌지축(u×l) 정렬 트위스트 — 스윙-트위스트
  분해로 롤이 팔꿈치 힌지에 종속돼 팔을 앞으로 들어도 겨드랑이가 안 뒤틀린다.
  팔이 곧으면(sin<0.1) lastHinge 히스테리시스 유지.
- **lowerArm**: 순수 힌지(자체 롤 0 — 전완 비틀림은 손목 담당).
- **hand**: (handDir, palmNormal) 직교 기저 → 손목 회전, 전완축 스윙-트위스트 분해 후
  굽힘 ±80° / 비틀림 ±90° 클램프 (`WRIST_BEND_MAX`/`WRIST_TWIST_MAX`).
- **몸통 기준 해석**: 부모 워크는 팔이 매달린 몸통 본 직전까지 — 트래킹의 어깨라인
  기저(몸통 기준) 사실이므로 몸통 lean/twist에 팔이 같이 실린다.
- **present 크로스페이드**: 팔별 pSm(시정수 0.12s)로 `neutralArm`(계약 idle)↔트래킹을
  성분 lerp+재정규화, 본 회전은 slerp 22/s 완충 — 스냅 없음.
- **손가락 개별**: `fingers[5]`([엄지,검지,중지,약지,새끼] 0..1) → 손가락별 본 체인
  비례 회전. `FINGER_CURL`(proximal 1.28/intermediate 1.5/distal 0.95, rotation.z),
  `THUMB_CURL`(0.36/0.55/0.70, **rotation.y — 엄지는 축이 다름**), spread는 proximal
  rotation.y ±0.13·계수(검지 +1…소지 −1).
- **wave**(idle 전용 채널): 캐릭터 z축 둘레 방향벡터 진자 스윙 + 전완 위상차(+1.1rad)
  휩 — t 기반이라 결정적.
- 핫패스 할당 0 — 쿼터니언/벡터 스크래치 전부 인스턴스/모듈 필드 재사용.

## BodyPose (`BODY` 상수, `index.ts`)

- shrugL/R → shoulder 본 z 리프트(≤0.28rad) + 팔 높이 들기 보조(`raiseAssist`).
- lean/twist → spine 0.45 / chest 0.35 / upperChest 0.20 분배
  (upperChest 없으면 chest 0.55). 로컬 = (−S·world_x, world_y, −S·world_z) 규약.
- hipShift → hips x 이동(다리 길이×0.06) + 미세 롤(0.06rad).
- knee → 허벅지 전방 회전(≤1.8rad — 트래킹 kneeFullRad 2.2와 스케일 정합, knee=0.5≈52° 반스쿼트)·정강이 수직 유지(발바닥 접지 지오메트리 보장),
  짧아진 만큼 hips y 하강 보정. **legsPresent 게이팅**(4/s 평활) — 상반신샷이면 idle 스탠스.
- 채널 전체 10/s 지수 평활 — 하네스 스텝 입력에도 스냅 없음.
- 손목밴드는 정규화 hand 본 자식이라 솔버 손목 회전을 그대로 상속(별도 배선 없음).

## 검증 (BRIEF v3)

하네스가 계약 v2 파라미터를 아직 지원하지 않아, `armSolverSelfTest()`(armSolver.ts)가
합성 본 체인(VRM1형/VRM0형 π 플립/몸통 twist/손목 클램프)으로 수치 검증하고 콘솔에
PASS/FAIL을 남긴다 (createMingo 1회 호출). 스크린샷 샷 리스트(armL=fwd/side/up,
palmL, fingersL, shrug/lean/twist/knee)는 통합 후 판정관이 수행.
구버전 메모: 대용량 VRM 로드 때문에 Chrome `--virtual-time-budget=8000`이 간헐적으로
빈 스크린샷(≈4KB)을 만든다 — 재시도하거나 버짓을 늘리면 해결.
