/**
 * 리액션 타임라인이 매 프레임 채우는 "목표"(Target)와 타임라인 명세(Spec) 타입.
 *
 * 한 리액션 = 시간(초)만 받는 순수 함수 eval(tl, tg) + 시간순 FX 이벤트 목록.
 * 엔진이 목표를 트래킹 프레임 위에 엔벨로프 가중치로 섞는다 (index.ts).
 *  - 얼굴 채널(눈 깜빡임·시선·입)은 덮어쓴다. NaN = 건드리지 않음 (트래킹 값이 그대로 흐른다).
 *  - 표정 가중치(happy/sad/…)는 max로 합친다 (모델이 트래킹 값과 다시 max).
 *  - 머리·몸통(lean/twist/shrug)은 더한다. 트래킹이 계속 살아 있다.
 *  - 다리(knee/hipShift)는 목표 값으로 섞는다 (legs 가중치 × w) — 트래킹 무릎이 0이 아닐 수 있어 더하지 않는다.
 *  - 몸 움직임(bounce/shiftX/lift/kick/out/bow)은 가중치를 곱해 합친다. 자전(spin)만 따로 다룬다 (index.ts).
 *  - 팔은 armW(0..1) 만큼 목표 자세로 방향을 섞는다.
 */
import type { Dir3 } from '../contract'
import type { Fx } from './fx'

export const KEEP = Number.NaN

export interface ArmTarget {
  upper: Dir3
  lower: Dir3
  hand: Dir3
  palm: Dir3
  fingers: [number, number, number, number, number]
  spread: number
}

export interface Target {
  /** 얼굴 채널 — NaN 이면 트래킹/idle 값 유지 */
  blink: number
  /** 한쪽 눈만 (윙크) — blink 위에 덮어쓴다. L = 캐릭터 왼쪽 눈 */
  winkL: number
  winkR: number
  gazeX: number
  gazeY: number
  mouthOpen: number
  mouthSmile: number
  /** 표정 오버라이드 가중치 0..1 (모델 expr) */
  happy: number
  sad: number
  angry: number
  surprised: number
  relaxed: number
  /** 볼 홍조 0..1 */
  blush: number
  /** 모델 머리 FX 플래그 (하트 눈 · 땀방울 · 분노 마크) — 가중치가 문턱을 넘은 리액션 하나가 정한다 */
  heart: boolean
  sweat: boolean
  anger: boolean
  /** 머리 (더함, rad) */
  headPitch: number
  headYaw: number
  headRoll: number
  /** 몸통 (더함, rad / 0..1) */
  leanX: number
  leanZ: number
  twist: number
  shrugL: number
  shrugR: number
  /** 다리 강제 강도 0..1 — legsPresent 를 이만큼(×w)으로 올리고 아래 kneeL/kneeR/hipShift 를 목표로 섞는다 */
  legs: number
  kneeL: number
  kneeR: number
  hipShift: number
  /** 몸 전체 움직임 (키 대비 비율 / rad) */
  bounce: number
  spin: number
  shiftX: number
  liftL: number
  liftR: number
  kickL: number
  kickR: number
  outL: number
  outR: number
  /** 허리 숙임 (rad, +앞) — 골반을 접는 꾸벅 인사. 상체는 곧게 둔 채 숙이고 다리·발은 제자리다 (leanZ 와 달리 척추를 굽히지 않는다) */
  bow: number
  /** 팔 덮어쓰기 강도 0..1 (L = 캐릭터 왼팔, R = 캐릭터 오른팔) */
  armW: [number, number]
  arms: [ArmTarget, ArmTarget]
}

function armTarget(): ArmTarget {
  return {
    upper: { x: 0, y: -1, z: 0 },
    lower: { x: 0, y: -1, z: 0 },
    hand: { x: 0, y: -1, z: 0 },
    palm: { x: 0, y: 0, z: 1 },
    fingers: [0, 0, 0, 0, 0],
    spread: 0,
  }
}

export function createTarget(): Target {
  const t = {
    armW: [0, 0],
    arms: [armTarget(), armTarget()],
  } as Target
  resetTarget(t)
  return t
}

/** 매 평가 전에 중립으로 되돌린다 (팔 벡터는 armW 가 0 이면 쓰이지 않아 그대로 둔다) */
export function resetTarget(t: Target): void {
  t.blink = KEEP; t.winkL = KEEP; t.winkR = KEEP; t.gazeX = KEEP; t.gazeY = KEEP; t.mouthOpen = KEEP; t.mouthSmile = KEEP
  t.happy = 0; t.sad = 0; t.angry = 0; t.surprised = 0; t.relaxed = 0
  t.blush = 0
  t.heart = false; t.sweat = false; t.anger = false
  t.headPitch = 0; t.headYaw = 0; t.headRoll = 0
  t.leanX = 0; t.leanZ = 0; t.twist = 0; t.shrugL = 0; t.shrugR = 0
  t.legs = 0; t.kneeL = 0; t.kneeR = 0; t.hipShift = 0
  t.bounce = 0; t.spin = 0; t.shiftX = 0
  t.liftL = 0; t.liftR = 0; t.kickL = 0; t.kickR = 0; t.outL = 0; t.outR = 0; t.bow = 0
  t.armW[0] = 0; t.armW[1] = 0
}

/** FX 이벤트: 타임라인 시각 t 에 한 번 실행된다. rng 는 트리거마다 시드가 정해진 결정적 난수 */
export interface FxEvent {
  t: number
  run(fx: Fx, rng: () => number): void
}

export interface Spec {
  /** 1..10 (키 1~9, 0 = 10) */
  id: number
  /** 키보드 숫자 ('1'..'9', '0') */
  key: string
  /** 한국어 이름 (메뉴·디버그) */
  name: string
  /** 전체 길이(초). 끝나기 직전 0.35초가 서서히 사라지는 구간이다 */
  dur: number
  /** 시트·미리보기용 대표 시각(초) */
  peak: number
  /** 카메라를 뒤로 빼는 정도 (0..0.25) — 만세·점프가 창 밖으로 잘리지 않게 (엔벨로프만큼 적용) */
  pull: number
  eval(tl: number, tg: Target): void
  events: readonly FxEvent[]
}
