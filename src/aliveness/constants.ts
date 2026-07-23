/**
 * 생명감 레이어 타이밍 상수 — 단일 출처.
 * README.md의 표와 반드시 동기 유지할 것.
 */
export const TIMING = {
  /** 결정성 보장용 고정 시드 ("MNGO") */
  RNG_SEED: 0x4d4e474f,

  // ---- 호흡 ----
  /** 호흡 사인 주기 (s) */
  BREATH_PERIOD: 3.6,

  // ---- 깜빡임 (idle) ----
  /** 다음 깜빡임까지 랜덤 간격 (s) */
  BLINK_GAP_MIN: 2.0,
  BLINK_GAP_MAX: 6.0,
  /** 더블 블링크 확률 */
  BLINK_DOUBLE_CHANCE: 0.1,
  /** 더블 블링크 1회차-2회차 사이 간격 (s) */
  BLINK_DOUBLE_GAP: 0.12,
  /** 눈 감는 시간 (s) — 비대칭 커브의 빠른 쪽 */
  BLINK_CLOSE: 0.08,
  /** 눈 뜨는 시간 (s) — 느린 쪽 */
  BLINK_OPEN: 0.18,

  // ---- 무게중심 sway (리사주) ----
  SWAY_ROLL_PERIOD: 7,
  SWAY_YAW_PERIOD: 11,
  SWAY_ROLL_AMP: 0.03,
  SWAY_YAW_AMP: 0.04,

  // ---- 시선 ----
  /** 커서 팔로우 지연 스프링 시간상수 (s) */
  GAZE_LAG: 0.15,
  /** 커서→gaze 게인 (동공이 가장자리에 붙는 것 방지) */
  GAZE_GAIN: 0.85,
  /** 마이크로 사카드 간격 (s) */
  SACCADE_GAP_MIN: 0.5,
  SACCADE_GAP_MAX: 2.0,
  /** 사카드 점프 진폭 (±) */
  SACCADE_AMP: 0.05,
  /** 한눈팔기(커서 무시) 발동 간격 (s) */
  DISTRACT_GAP_MIN: 8,
  DISTRACT_GAP_MAX: 20,
  /** 한눈팔기 지속 (s) */
  DISTRACT_LEN_MIN: 1,
  DISTRACT_LEN_MAX: 2,

  // ---- 랜덤 idle 모션 (동시 발동 금지: 한 번에 하나) ----
  /** 다음 모션까지 간격 (s) — 직전 모션 종료 시점 기준 */
  MOTION_GAP_MIN: 20,
  MOTION_GAP_MAX: 60,
  /** 고개 갸웃: roll 목표(rad) / 길이(s) */
  TILT_ROLL: 0.25,
  TILT_LEN: 1.2,
  /** 목 스트레치: pitch +0.3 → -0.1 → 0 / 길이(s) */
  STRETCH_PITCH_UP: 0.3,
  STRETCH_PITCH_DOWN: -0.1,
  STRETCH_LEN: 1.6,
  /** 어깨 으쓱 (BodyPose.shrugL/R): 목표 강도 / 길이(s) */
  SHRUG_AMT: 0.5,
  SHRUG_LEN: 0.6,
  /** 행복눈 ∪∪ 지속 (s) */
  HAPPY_LEN: 1.0,
  /** 팔 앞으로 기지개(REACH): 왕복 길이(s) — 1s 뻗고 1s 복귀 (2초 이징 왕복) */
  REACH_LEN: 2.0,
  /** 기지개 시 손가락: curl 목표(거의 폄) / spread 목표 */
  REACH_CURL: 0.05,
  REACH_SPREAD: 0.55,

  // ---- idle 팔 (ArmPose 방향벡터 — neutralArm 기반) ----
  /** 호흡 sway: upperDir x(바깥쪽)/z(앞뒤) 성분 진폭 (재정규화 전 가산량) */
  ARM_SWAY_X: 0.035,
  ARM_SWAY_Z: 0.02,
  /** 하완(lowerDir)은 상완 sway의 이 배율 */
  ARM_SWAY_LOWER: 0.5,
  /** 호흡에 실리는 손가락 curl 미세 변조 진폭 */
  ARM_SWAY_FINGER: 0.03,
  /** 미세 드리프트: 목표 오프셋 진폭(성분) / 재선정 간격(s) / 수렴 시간상수(s) */
  ARM_DRIFT_AMP: 0.04,
  ARM_DRIFT_GAP_MIN: 4,
  ARM_DRIFT_GAP_MAX: 9,
  ARM_DRIFT_TAU: 1.8,

  // ---- idle 몸통 (BodyPose) ----
  /** lean.x 미세 sway 진폭 (rad) — head sway와 같은 주기(SWAY_ROLL_PERIOD) */
  BODY_LEAN_AMP: 0.02,
  /** 체중 이동 sway: 진폭(-1..1) / 주기(s) */
  HIP_SWAY_AMP: 0.06,
  HIP_SWAY_PERIOD: 13,

  // ---- 트래킹 융합 ----
  /** 트래킹 획득 크로스페이드 (s) */
  TRACK_ATTACK: 0.25,
  /** 트래킹 소실 릴리즈 = idle 복귀 시간 (s) */
  TRACK_RELEASE: 1.2,
  /** TRACKED 진입 임계 (raw.tracked) */
  TRACK_ON: 0.5,
  /** TRACKED 유지 하한 (히스테리시스) */
  TRACK_OFF: 0.1,
  /** 트래킹 blink가 이 값을 넘으면 1.0으로 스냅 가속 */
  BLINK_SNAP_START: 0.7,
  /** 스냅 가속 게인 (0.7→0.85 구간에서 1.0 도달) */
  BLINK_SNAP_GAIN: 2.0,
  /** 미소 반응: mouthSmile 임계 / 지속 요구 (s) / 릴리즈 (s) */
  SMILE_THRESH: 0.7,
  SMILE_HOLD: 0.3,
  SMILE_RELEASE: 0.5,
} as const
