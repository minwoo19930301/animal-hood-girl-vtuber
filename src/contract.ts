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

/** 새 날개는 사람 손가락 5개가 아니라 "의도(intent)"로 구동한다. */
export interface WingPose {
  /** 이 손이 카메라에 보이는 정도 0..1 (없으면 0 → idle 포즈로 복귀) */
  present: number
  /** 날개를 위로 드는 정도 0..1 (어깨 기준) */
  raise: number
  /** 몸통에서 옆으로 벌리는 정도 0..1 */
  out: number
  /** 깃털 손가락 3개의 말림 0(펴짐)..1(주먹) */
  curl: number
  /** 깃털 손가락 벌림 0..1 */
  spread: number
  /** 흔들기(인사) 진동 위상 구동 0..1 — 지속적 좌우 웨이브 강도 */
  wave: number
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
  mouthOpen: number  // 0..1 (부리 벌림)
  mouthSmile: number // -1..1
  wingL: WingPose
  wingR: WingPose
  fx: FxState
  /** 호흡 위상 0..1 (aliveness가 채움; 모델은 가슴 fluff 스케일 등에 사용) */
  breath: number
}

export function neutralFrame(): RigFrame {
  const wing = (): WingPose => ({ present: 0, raise: 0, out: 0, curl: 0.35, spread: 0.2, wave: 0 })
  return {
    tracked: 0,
    head: { pitch: 0, yaw: 0, roll: 0 },
    gaze: { x: 0, y: 0 },
    blinkL: 0, blinkR: 0,
    browL: 0, browR: 0,
    mouthOpen: 0, mouthSmile: 0.15,
    wingL: wing(), wingR: wing(),
    fx: { heart: false, happy: false, sweat: false, anger: false },
    breath: 0,
  }
}

/** 모델 구현이 반드시 제공해야 하는 API (src/model/index.ts) */
export interface MingoModel {
  /** 씬에 추가할 루트. 발 밑 원점, 캐릭터 정면 = +Z(카메라 방향) */
  root: import('three').Group
  /** 전체 높이(월드 단위). 카메라 프레이밍용 */
  height: number
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
