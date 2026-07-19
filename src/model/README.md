# src/model — VRM 휴머노이드 + 프로시저럴 플라밍고 후드

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
  smile>0→`happy`×0.6 / <0→`sad`×0.4, fx.happy→`happy` 1.0, browRaise>0→`surprised`×0.3.
- **호흡**: 정규화 chest 회전 x ±0.012·sin + raw chest 균일 스케일 ±0.6% + 어깨 들썩 0.02.
- **FX**: visible 토글 + t 기반 펄스/바운스 (하트 스케일 ±10%, 땀 y 바운스, 분노 ±6%).
- 매 프레임 끝에 `vrm.update(dt)` (정규화→raw 복사·expression·lookAt·스프링본).

## 팔 포즈 튜닝 상수 (`index.ts` export)

`ARM` (rad): `idleDown 1.12`(T포즈→차렷 A포즈; **VRM은 T포즈라 이 값이 0이면 팔벌림 잔재**),
`raiseSwing 1.55`, `outSwing 0.80`, `minDown −0.85`(위 스윙 한계), `shoulderRaise 0.20`,
`elbowIdle 0.35`, `waveAmp 0.26`, `waveHz 9`.

- present=0 → 차렷(idle), raise/out은 present로 게이트.
- **curl/spread는 present와 무관하게 항상 적용** (주먹 intent 단독 사용:
  `wingCurlR=1`만으로 오른손 주먹). `FINGER_CURL`(proximal 1.28/intermediate 1.5/
  distal 0.95, rotation.z)과 `THUMB_CURL`(0.36/0.55/0.70, **rotation.y — 엄지는 축이 다름**)로
  손가락 본 15개/손 전부 비례 회전. spread는 proximal rotation.y ±0.13·계수(검지 +1…소지 −1).
- wave: 어깨 z 사인 진동 + 팔꿈치 위상차(+1.1rad) 휩 — t 기반이라 결정적.

## 검증 (BRIEF v2의 7샷)

`npm run shot -- harness.html shots/v2-*.png "..."` — front/face/pitch/yaw/blink-mouth/
arms/fx 전부 확인 완료. 대용량 VRM 로드 때문에 Chrome `--virtual-time-budget=8000`이
간헐적으로 빈 스크린샷(≈4KB)을 만든다 — 재시도하거나 버짓을 늘리면 해결.
