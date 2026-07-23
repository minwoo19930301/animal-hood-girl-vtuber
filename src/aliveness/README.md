# aliveness — 생명감 레이어

트래킹이 있든 없든 밍고가 항상 살아 있게 만드는 레이어.
`createAliveness(): Aliveness` (계약: `src/contract.ts` v2 — ArmPose/BodyPose) 하나만 외부에 노출된다.
`compose(raw, dt, t, cursor)`는 raw를 변형하지 않고 매 프레임 새 `RigFrame`을 반환한다
(60fps GC 압박 때문에 `structuredClone` 대신 명시적 복사/객체 리터럴).

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `index.ts` | 진입점. 채널별 크로스페이드로 idle ↔ 트래킹 융합 (팔/몸통은 자체 present 램프), 미소 반응 래치 |
| `state.ts` | 상태 머신 (IDLE/TRACKED/RETURNING) + 가중치 램프 + 동결 포즈 스냅샷 |
| `idle.ts` | idle 스택: 깜빡임·sway·시선(커서/사카드/한눈팔기)·랜덤 idle 모션·idle 팔(ArmPose)·idle 몸통(BodyPose) |
| `fade.ts` | 스프링/이징 유틸 (지수 스무딩, 비대칭 램프, 범프, 키프레임 트랙) |
| `vec.ts` | Dir3 유틸 — 성분 lerp 후 재정규화 (`lerpDir`/`lerpDirInto`/`setNorm`) |
| `rng.ts` | 시드 고정 mulberry32 RNG (`Math.random` 사용 금지 규칙 준수) |
| `constants.ts` | 아래 타이밍 상수표의 단일 출처 |

## 상태 머신

```
                 raw.tracked ≥ 0.5 (TRACK_ON)
        ┌───────────────────────────────────────────┐
        │                                           ▼
   ┌────────┐                                  ┌─────────┐
   │  IDLE  │                                  │ TRACKED │◀─┐ 유지: raw.tracked ≥ 0.1
   └────────┘                                  └─────────┘──┘ (TRACK_OFF, 히스테리시스)
        ▲                                           │
        │ weight ≈ 0                                │ raw.tracked < 0.1
        │ (release 1.2s 완료)                        │ (마지막 트래킹 프레임 동결)
        │                                           ▼
        │                                    ┌───────────┐
        └────────────────────────────────────│ RETURNING │
                                             └───────────┘
                                                    │
                       raw.tracked ≥ 0.5 재획득 ────┘──▶ TRACKED
                       (현재 블렌드 지점에서 attack 0.25s 재상승)
```

- **weight**: `AsymRamp`(상승 0.25s / 하강 1.2s)로 레이트 제한 후 `smoothstep` 셰이핑.
  어느 전환에서도 스냅 없음. 최종 프레임의 `tracked` 필드로도 내보낸다.
- **RETURNING**: 소실 직전 raw를 동결(frozen)해 블렌드 소스로 쓰므로,
  "현재 포즈에서" idle 포즈로 1.2s에 걸쳐 귀환한다. idle 스택은 트래킹 중에도 계속
  갱신되므로(시선/드리프트 스프링 연속성) 복귀 지점에서 점프가 없다.
- 중간 `tracked` 값(0.1~1)은 그대로 크로스페이드 계수가 된다 (계약의 "중간값: 크로스페이드").

## idle 팔 (ArmPose 방향벡터 — 계약 v2)

`neutralArm(side)`을 기준으로 매 프레임 스크래치 객체에 in-place 생성 (할당 없음):

1. **호흡 sway**: `sin(2π t / BREATH_PERIOD)` — `breath` 위상과 같은 시계라 가슴 스케일과
   팔이 동기해 숨쉰다. 들숨에 upperDir이 바깥(±x)·앞(+z)으로 미세하게 벌어지고
   (lowerDir/handDir은 0.5배), 손가락 curl도 ±0.03 미세 변조.
2. **미세 드리프트**: 4~9s마다 RNG로 upperDir x/z 목표 오프셋(±0.04)을 재선정,
   시간상수 1.8s 지수 수렴 — "완전히 정지한 팔" 방지.
3. 성분 가산 후 **재정규화**(`setNorm`) — 항상 단위 벡터 유지.

## 랜덤 idle 모션 (동시 발동 금지: 한 번에 하나)

| 모션 | 효과 | 길이 |
| --- | --- | --- |
| `TILT` | 고개 갸웃 (head.roll +0.25 bump) | 1.2 s |
| `STRETCH` | 목 스트레치 (pitch +0.3 → -0.1 → 0) | 1.6 s |
| `SHRUG` | 어깨 으쓱 — `body.shrugL/R` 0.5 bump (구 날개 들썩 대체) | 0.6 s |
| `HAPPY` | 행복눈 ∪∪ | 1.0 s |
| `REACH` | **팔 앞으로 기지개** — 양팔 upperDir을 {0,0,1} 근처로 성분 lerp+재정규화, 팔꿈치 폄, 손바닥 아래로, 손가락 쫙(curl→0.05, spread→0.55). bump 엔벨로프로 2초 이징 왕복 | 2.0 s |

## 트래킹 융합 (계약 v2 규칙)

- **ArmPose**: 팔별 유효 가중치 `aw = AsymRamp(팔 present × 전역 w)`.
  방향벡터 4종(upperDir/lowerDir/palmNormal/handDir)은 **성분 lerp 후 재정규화**(`lerpDir`),
  `fingers` 5개는 **개별 lerp**, spread/wave도 lerp. 출력 `present = aw`
  (모델은 이 값으로 idle↔트래킹 크로스페이드 — BRIEF 모델 4항).
- **BodyPose**: `bw = AsymRamp(body.present × 전역 w)`. shrug/lean/twist/hipShift는
  idle 몸통(sway 포함)과 채널별 lerp. `legsPresent/knee`는 idle측 0 고정
  (미트래킹 시 모델이 idle 스탠스 유지 — 계약).
- 퇴화 보호: lerp 결과가 영벡터 근처면 목표측 벡터로 스냅 (`vec.ts`).

## 타이밍 상수표 (`constants.ts`와 동기)

| 상수 | 값 | 의미 |
| --- | --- | --- |
| `RNG_SEED` | `0x4d4e474f` | 결정성 보장 고정 시드 ("MNGO") |
| `BREATH_PERIOD` | 3.6 s | 호흡 사인 주기 (트래킹 여부 무관 항상 레이어, idle 팔 sway와 공유) |
| `BLINK_GAP_MIN/MAX` | 2.0 / 6.0 s | 깜빡임 랜덤 간격 |
| `BLINK_DOUBLE_CHANCE` | 10 % | 더블 블링크 확률 |
| `BLINK_DOUBLE_GAP` | 0.12 s | 더블 블링크 사이 간격 |
| `BLINK_CLOSE / OPEN` | 0.08 / 0.18 s | 비대칭 커브: 빨리 감고 천천히 뜬다 |
| `SWAY_ROLL_PERIOD/AMP` | 7 s / ±0.03 rad | 무게중심 리사주 (head.roll, body.lean.x도 공유) |
| `SWAY_YAW_PERIOD/AMP` | 11 s / ±0.04 rad | 무게중심 리사주 (head.yaw) |
| `GAZE_LAG` | 0.15 s | 커서 팔로우 지연 스프링 시간상수 |
| `GAZE_GAIN` | 0.85 | 커서→gaze 게인 (동공 가장자리 고정 방지) |
| `SACCADE_GAP_MIN/MAX` | 0.5 / 2.0 s | 마이크로 사카드 간격 |
| `SACCADE_AMP` | ±0.05 | 사카드 점프 진폭 |
| `DISTRACT_GAP_MIN/MAX` | 8 / 20 s | 한눈팔기 발동 간격 |
| `DISTRACT_LEN_MIN/MAX` | 1 / 2 s | 한눈팔기 지속 |
| `MOTION_GAP_MIN/MAX` | 20 / 60 s | 랜덤 idle 모션 간격 (직전 모션 종료 기준, 동시 발동 금지) |
| `TILT_ROLL / TILT_LEN` | 0.25 rad / 1.2 s | 고개 갸웃 |
| `STRETCH_PITCH_UP/DOWN / LEN` | +0.3 / -0.1 rad / 1.6 s | 목 스트레치 (위→아래→복귀) |
| `SHRUG_AMT / SHRUG_LEN` | 0.5 / 0.6 s | 어깨 으쓱 (BodyPose.shrugL/R) |
| `HAPPY_LEN` | 1.0 s | 행복눈 ∪∪ |
| `REACH_LEN` | 2.0 s | 팔 앞으로 기지개 왕복 (bump 엔벨로프) |
| `REACH_CURL / REACH_SPREAD` | 0.05 / 0.55 | 기지개 시 손가락 curl/spread 목표 |
| `ARM_SWAY_X / Z` | 0.035 / 0.02 | 호흡 sway upperDir 성분 진폭 |
| `ARM_SWAY_LOWER` | ×0.5 | lowerDir/handDir sway 배율 |
| `ARM_SWAY_FINGER` | ±0.03 | 손가락 curl 호흡 변조 |
| `ARM_DRIFT_AMP` | ±0.04 | 드리프트 목표 오프셋 진폭 |
| `ARM_DRIFT_GAP_MIN/MAX` | 4 / 9 s | 드리프트 목표 재선정 간격 |
| `ARM_DRIFT_TAU` | 1.8 s | 드리프트 수렴 시간상수 |
| `BODY_LEAN_AMP` | 0.02 rad | idle lean.x sway 진폭 |
| `HIP_SWAY_AMP / PERIOD` | 0.06 / 13 s | idle 체중 이동 sway |
| `TRACK_ATTACK` | 0.25 s | 트래킹 획득 크로스페이드 (전역 w + 팔/몸통 램프 공용) |
| `TRACK_RELEASE` | 1.2 s | 트래킹 소실 릴리즈 = idle 복귀 시간 |
| `TRACK_ON / TRACK_OFF` | 0.5 / 0.1 | TRACKED 진입/유지 임계 (히스테리시스) |
| `BLINK_SNAP_START / GAIN` | 0.7 / ×2 | 트래킹 blink 0.7 초과 시 1.0 스냅 가속 (0.85에서 완전 감김) |
| `SMILE_THRESH / HOLD / RELEASE` | 0.7 / 0.3 s / 0.5 s | 미소 반응 → fx.happy 래치 |

## 좌표 규약 메모

- 커서 `ny`는 화면 기준 +아래(main.ts에서 `sy/screenH*2-1`). gaze는 `head.pitch`(+위)
  규약과 정합하도록 **부호 반전**해서 채운다 (`gaze.y = -ny * GAZE_GAIN`).
- `gaze.x = +nx`: 뷰어 오른쪽 = 캐릭터 자기 왼쪽(+), `head.yaw` 규약과 동일.
- ArmPose 방향벡터는 캐릭터 공간 (x=캐릭터 왼쪽+, y=위+, z=앞+), 항상 정규화.

## 결정성 자가 검증

시드 고정 mulberry32만 사용하므로 동일 (raw, dt, t, cursor) 시퀀스를 두 번 재생하면
출력이 비트 단위로 같아야 한다. 브라우저 콘솔(vite dev) 또는 번들 후 Node에서:

```ts
import { createAliveness } from './src/aliveness/index'
import { neutralFrame } from './src/contract'

function run(): string {
  const a = createAliveness()
  const out: number[] = []
  let t = 0
  for (let i = 0; i < 21600; i++) { // 6분 @60fps — REACH 모션 포함 보장
    t += 1 / 60
    const f = a.compose(neutralFrame(), 1 / 60, t, { nx: Math.sin(i * 0.017), ny: Math.cos(i * 0.011) })
    if (i % 60 === 0) out.push(f.blinkL, f.head.roll, f.gaze.x, f.armL.upperDir.x, f.armL.upperDir.z, f.armL.fingers[1], f.body.shrugL, f.body.hipShift, f.breath)
  }
  return JSON.stringify(out)
}
console.assert(run() === run(), 'aliveness determinism broken')
```

(트래킹 융합 경로까지 포함하려면 중간 구간에서 `raw.tracked=1`인 프레임을 섞어도
결과는 동일해야 한다 — 상태는 전부 입력 시퀀스의 순수 함수. 방향벡터는 전 구간에서
`|len-1| < 1e-12`가 유지되어야 한다.)
