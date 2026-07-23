/**
 * mingo-mate 모듈 간 계약 (BINDING CONTRACT)
 *
 * 파이프라인:  tracking → RigFrame → aliveness.compose() → RigFrame → model.apply()
 *
 * 좌표/이름 규칙:
 *  - Left/Right 는 항상 "캐릭터 기준" (미러링은 tracking 매퍼가 처리:
 *    사용자의 오른손 = 캐릭터의 왼쪽 날개, 거울처럼).
 *  - 각도는 라디안. head.pitch: +위를 봄 / head.yaw: +캐릭터가 자기 왼쪽(화면상 뷰어 오른쪽)을 봄 /
 *    head.roll: +머리가 캐릭터 왼쪽으로 기움.
 *  - 모든 강도값은 0..1, 좌우 대칭값은 -1..1.
 */

export interface HeadPose {
  pitch: number // -0.6..+0.6 rad 권장 클램프
  yaw: number   // -0.7..+0.7
  roll: number  // -0.5..+0.5
}

/** 정규화 방향벡터 (캐릭터 몸통 기준: x=캐릭터 왼쪽+, y=위+, z=앞(카메라)+) */
export interface Dir3 { x: number; y: number; z: number }

/**
 * 팔 자세 v2 — "의도"가 아니라 골격 트래킹의 기하학적 사실.
 * 트래킹이 캐릭터 공간 방향벡터를 내면 모델이 자기 rest pose 기준으로 FK 솔브한다.
 * 모든 방향은 정규화, 좌우는 캐릭터 기준(거울 매핑은 트래킹 담당).
 */
export interface ArmPose {
  /** 이 팔의 트래킹 신뢰도 0..1 (0 → idle 포즈로 크로스페이드) */
  present: number
  /** 상완 방향: 어깨→팔꿈치. 예) 차렷 {0,-1,0}, 옆으로 T {±1,0,0}, 앞으로 나란히 {0,0,1} */
  upperDir: Dir3
  /** 하완 방향: 팔꿈치→손목 (팔꿈치 굽힘은 upperDir와의 각으로 모델이 계산) */
  lowerDir: Dir3
  /** 손바닥 법선 (손등 반대쪽). 예) 손바닥 카메라향 {0,0,1}, 바닥향 {0,-1,0} */
  palmNormal: Dir3
  /** 손 방향: 손목→중지 MCP (palmNormal과 직교 기저를 이룸) */
  handDir: Dir3
  /** 손가락 개별 말림 [엄지, 검지, 중지, 약지, 새끼] 0(펴짐)..1(완전 접힘) */
  fingers: [number, number, number, number, number]
  /** 검지~새끼 벌림 0..1 */
  spread: number
  /** 인사 웨이브 강도 0..1 (aliveness/idle 전용 — 트래킹 중엔 0) */
  wave: number
}

/** 상체·하체 골격 (Pose Landmarker 33점 기반) */
export interface BodyPose {
  /** 상체 트래킹 신뢰도 0..1 */
  present: number
  /** 어깨 으쓱 0..1 (캐릭터 기준 좌/우) */
  shrugL: number
  shrugR: number
  /** 상체 기울기: x=옆으로(+캐릭터왼쪽), z=앞뒤(+앞) — 라디안, 소량 */
  lean: { x: number; z: number }
  /** 상체 y축 비틀림 라디안 (+캐릭터 왼쪽으로 돌음) */
  twist: number
  /** 체중 이동 -1(캐릭터오른발)..+1(캐릭터왼발) */
  hipShift: number
  /** 다리 가시성 0..1 (웹캠 상반신샷이면 0 → 모델은 idle 스탠스 유지) */
  legsPresent: number
  /** 무릎 굽힘 0..1 (legsPresent>0 일 때만 유효) */
  kneeL: number
  kneeR: number
}

export interface FxState {
  heart: boolean  // 하트 눈
  happy: boolean  // ∪∪ 행복 눈
  sweat: boolean  // 땀방울
  anger: boolean  // 분노 마크
}

/** 트래킹→모델로 흐르는 단일 프레임. 모든 필드는 항상 채워져 있다(널 없음). */
export interface RigFrame {
  /** 얼굴 트래킹 신뢰도 0..1. 0이면 aliveness가 완전 idle 제어 */
  tracked: number
  head: HeadPose
  /** 시선 오프셋 -1..1 (동공 위치). 미트래킹 시 aliveness가 커서 추적으로 채움 */
  gaze: { x: number; y: number }
  blinkL: number // 0(뜸)..1(감음)
  blinkR: number
  browL: number  // -1(찌푸림)..+1(치켜올림)
  browR: number
  mouthOpen: number  // 0..1 (입 벌림)
  mouthSmile: number // -1..1
  armL: ArmPose
  armR: ArmPose
  body: BodyPose
  fx: FxState
  /** 호흡 위상 0..1 (aliveness가 채움; 모델은 가슴 스케일 등에 사용) */
  breath: number
}

/** 차렷 자세 팔 (idle 기본): 팔 아래로, 살짝 바깥, 손바닥 몸쪽, 손가락 릴랙스 */
export function neutralArm(side: 1 | -1): ArmPose {
  return {
    present: 0,
    upperDir: { x: side * 0.17, y: -0.98, z: 0.02 },
    lowerDir: { x: side * 0.12, y: -0.97, z: 0.20 },
    palmNormal: { x: -side * 0.9, y: 0, z: -0.44 },
    handDir: { x: side * 0.1, y: -0.98, z: 0.18 },
    fingers: [0.35, 0.3, 0.3, 0.32, 0.35],
    spread: 0.15,
    wave: 0,
  }
}

export function neutralBody(): BodyPose {
  return {
    present: 0,
    shrugL: 0, shrugR: 0,
    lean: { x: 0, z: 0 },
    twist: 0,
    hipShift: 0,
    legsPresent: 0,
    kneeL: 0, kneeR: 0,
  }
}

export function neutralFrame(): RigFrame {
  return {
    tracked: 0,
    head: { pitch: 0, yaw: 0, roll: 0 },
    gaze: { x: 0, y: 0 },
    blinkL: 0, blinkR: 0,
    browL: 0, browR: 0,
    mouthOpen: 0, mouthSmile: 0.15,
    armL: neutralArm(1), armR: neutralArm(-1),
    body: neutralBody(),
    fx: { heart: false, happy: false, sweat: false, anger: false },
    breath: 0,
  }
}

/** 모델 구현이 반드시 제공해야 하는 API (src/model/index.ts) */
export interface MingoModel {
  /** 씬에 추가할 루트. 발 밑 원점, 캐릭터 정면 = +Z(카메라 방향) */
  root: import('three').Group
  /** 전체 높이(월드 단위). 카메라 프레이밍용 — ready 이후 확정값 */
  height: number
  /** 비동기 에셋(VRM 등) 로드 완료. 없으면 동기 모델. 호출측은 완료 후 카메라 재프레이밍 */
  ready?: Promise<void>
  /** 매 프레임 호출. t는 앱 시작 후 초. 내부 스프링/2차 모션도 여기서 갱신 */
  apply(frame: RigFrame, dt: number, t: number): void
  /** 히트테스트(클릭스루 토글)용 — 레이캐스트 대상 메시들 */
  hitMeshes: import('three').Object3D[]
}

/** 트래킹 구현 API (src/tracking/index.ts) */
export interface Tracker {
  /** 웹캠 열고 mediapipe 시작. 실패 시 throw — 호출측에서 idle 모드 유지 */
  start(video: HTMLVideoElement): Promise<void>
  stop(): void
  /** 가장 최근 프레임. 아직 없거나 얼굴 미검출이면 tracked=0인 프레임 */
  latest(): RigFrame
}

/** aliveness 구현 API (src/aliveness/index.ts) */
export interface Aliveness {
  /**
   * 트래킹 프레임 위에 생명감을 합성해 최종 프레임 생성.
   * - tracked≈0: 완전 idle(호흡+랜덤 깜빡임+미세 sway+커서 시선)
   * - tracked≈1: 트래킹 존중, 호흡/보정만 레이어
   * - 중간값: 크로스페이드
   */
  compose(raw: RigFrame, dt: number, t: number, cursor: CursorInfo | null): RigFrame
}

export interface CursorInfo {
  /** 화면 전체 기준 커서 위치를 아바타 기준 -1..1로 정규화 (x: 좌우, y: 상하) */
  nx: number
  ny: number
}

/* ============ Electron preload 브리지 (electron/preload.cjs가 노출) ============ */
export interface MingoBridge {
  setClickThrough(enabled: boolean): void
  /** 전역 커서 위치 구독 (스크린 좌표 + 윈도우 상대 좌표) */
  onCursor(cb: (p: { sx: number; sy: number; wx: number; wy: number; inWindow: boolean; winW: number; winH: number; screenW: number; screenH: number }) => void): void
  /**
   * 윈도우 hide/show 구독. backgroundThrottling:false 때문에 renderer의
   * visibilitychange가 발화하지 않으므로 main 프로세스가 명시적으로 방송한다.
   * (구버전 preload 호환을 위해 optional)
   */
  onVisibility?(cb: (visible: boolean) => void): void
  dragBy(dx: number, dy: number): void
  quit(): void
}

declare global {
  interface Window { mingo?: MingoBridge }
}
