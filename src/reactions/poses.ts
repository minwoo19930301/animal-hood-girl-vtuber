/**
 * 리액션 팔 제스처 라이브러리와 보조 함수.
 *
 * 제스처는 {상완 방향 u, 팔꿈치 굽힘 평면 bend, 굽힘각 elbow, 손바닥 법선 palm, (손 방향 hand)} 로 적는다.
 * 전완은 곧은 팔에서 bend 쪽으로 elbow 만큼 접어 얻고, 손 방향은 손바닥 법선과 직교하게 재정렬해서
 * 솔버가 요구하는 직교 기저(palmNormal ⊥ handDir)를 항상 만족한다 (하네스 buildArm 과 같은 규칙).
 *
 * 좌표: 캐릭터 공간 x=캐릭터 왼쪽+(화면 오른쪽), y=위+, z=앞(카메라)+. 제스처는 캐릭터 왼팔(side +1) 기준으로 적고
 * 오른팔은 x 를 뒤집는다. 손가락은 [엄지, 검지, 중지, 약지, 새끼] 0(폄)..1(접힘).
 */
import { neutralArm, type Dir3 } from '../contract'
import { type ArmTarget, type Target } from './types'
import { slerpInto } from './util'

type V3 = readonly [number, number, number]
type F5 = readonly [number, number, number, number, number]

export interface Gesture {
  upper: V3
  lower: V3
  hand: V3
  palm: V3
  fingers: F5
  spread: number
}

const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm3 = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
/** b 에서 a(단위) 성분 제거 */
const rej3 = (b: V3, a: V3): V3 => {
  const d = dot3(b, a)
  return [b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]
}

const OPEN: F5 = [0, 0, 0, 0, 0]
const RELAX: F5 = [0.25, 0.2, 0.22, 0.28, 0.34]
const FIST: F5 = [0.85, 1, 1, 1, 1]
const SOFT: F5 = [0.3, 0.35, 0.35, 0.4, 0.45]
const PEACE: F5 = [0.8, 0, 0, 1, 1]

interface GOpts {
  fingers?: F5
  spread?: number
  /** 전완과 다른 손 방향 (손목 꺾임) — 손바닥 법선과 직교하게 재정렬된다 */
  hand?: V3
  /** 전완 방향을 직접 지정 (지정하면 bend/elbow 계산을 건너뛴다) — 얼굴·가슴에 손을 정확히 대는 제스처용 */
  lower?: V3
}

/** {u, bend, elbow, palm} → 솔버 안전 제스처 (모듈 로드 시 1회 계산, 핫패스 아님) */
function gest(u: V3, bend: V3, elbow: number, palm: V3, o: GOpts = {}): Gesture {
  const U = norm3(u)
  const perp = norm3(rej3(bend, U))
  const c = Math.cos(elbow), s = Math.sin(elbow)
  const L = o.lower ? norm3(o.lower) : norm3([U[0] * c + perp[0] * s, U[1] * c + perp[1] * s, U[2] * c + perp[2] * s])
  const P = norm3(palm)
  let H = norm3(rej3(o.hand ?? L, P))
  // 퇴화(손 방향 ∥ 손바닥 법선): 위쪽 우선으로 세운다
  if (Math.hypot(...rej3(o.hand ?? L, P)) < 0.15) H = norm3(rej3([0.2, 0.9, 0.3], P))
  return { upper: U, lower: L, hand: H, palm: P, fingers: o.fingers ?? OPEN, spread: o.spread ?? 0.3 }
}

const nA = neutralArm(1)
const asV = (d: Dir3): V3 => [d.x, d.y, d.z]

export const G = {
  /** 차렷 (idle 기본과 같은 방향) */
  down: { upper: asV(nA.upperDir), lower: asV(nA.lowerDir), hand: asV(nA.handDir), palm: asV(nA.palmNormal), fingers: RELAX, spread: 0.15 } as Gesture,
  /** 만세 V: 곧은 팔을 옆 위로 */
  cheer: gest([0.5, 0.86, 0.05], [0, 0, 1], 0.12, [0, 0.1, 1], { spread: 0.7 }),
  /** 더 크게 벌린 만세 (축하) */
  cheerWide: gest([0.78, 0.62, 0.05], [0, 0, 1], 0.1, [0, 0.1, 1], { spread: 0.85 }),
  /** 팔꿈치를 옆으로 벌리고 전완을 세운 환호 (손바닥 앞) */
  hurray: gest([0.9, 0.3, 0.1], [0, 1, 0], 1.25, [0, 0, 1], { spread: 0.8 }),
  /** 주먹 펌프: 팔꿈치 앞 아래, 전완 위, 주먹이 어깨 앞 */
  pump: gest([0.55, -0.35, 0.45], [0, 1, 0.1], 1.75, [-0.9, 0.2, 0.35], { fingers: FIST, spread: 0.1 }),
  /** 주먹 펌프 위로 쭉 (레이즈 더 루프) */
  pumpUp: gest([0.35, 0.85, 0.2], [0, 0, 1], 0.3, [-0.8, 0, 0.6], { fingers: FIST, spread: 0.1 }),
  /** 손 흔들기: 팔꿈치를 옆으로 들고 전완이 위로 (손바닥 앞) */
  wave: gest([0.85, 0.22, 0.2], [0, 1, 0], 1.3, [0, 0, 1], { spread: 0.55 }),
  /** 가슴 앞 하트 손: 팔꿈치는 옆 아래, 전완이 안쪽으로 모이고 손끝이 가운데에서 맞닿는다 */
  heartChest: gest([0.7, -0.7, 0.2], [0, 1, 0], 0, [-0.3, 0.1, 0.95], { lower: [-0.8, 0.45, 0.35], spread: 0.1, fingers: [0.15, 0.2, 0.2, 0.25, 0.3], hand: [-0.35, 0.9, 0.15] }),
  /** 볼에 손: 팔꿈치가 낮고 전완이 위로, 손바닥이 볼 옆면 */
  cheeks: gest([0.45, -0.72, 0.5], [0, 1, 0], 0, [-0.95, 0.1, 0.3], { lower: [-0.3, 0.85, 0.42], fingers: SOFT, spread: 0.15, hand: [-0.05, 1, 0.1] }),
  /** 눈가에 손 (울기): 손목이 눈 높이, 손끝이 눈 쪽 */
  eyes: gest([0.2, -0.35, 0.9], [0, 1, 0], 0, [-0.7, 0.1, 0.7], { lower: [-0.5, 0.8, 0.3], fingers: SOFT, spread: 0.1, hand: [-0.3, 0.9, 0.1] }),
  /** 허리에 손 */
  hip: gest([0.55, -0.8, -0.1], [-0.6, -0.5, 0.4], 1.5, [0.2, 0.3, 0.9], { fingers: RELAX, spread: 0.2 }),
  /** 가슴 앞 박수 (손바닥끼리 마주봄) */
  clap: gest([0.25, -0.5, 0.8], [-1, 0.5, 0.2], 1.7, [-1, 0, 0.1], { fingers: OPEN, spread: 0.1, hand: [-0.2, 0.95, 0.2] }),
  /** 깜짝: 어깨 높이에서 손바닥이 앞 (손 번쩍) */
  startle: gest([0.6, -0.4, 0.4], [0.2, 1, 0.5], 1.6, [0, 0.1, 1], { spread: 0.95 }),
  /** 앞에 모은 손 (인사 숙임·부끄러움) */
  clasp: gest([0.2, -0.85, 0.35], [-0.5, 0.2, 0.9], 1.1, [-0.5, 0.6, 0.6], { fingers: [0.4, 0.45, 0.45, 0.5, 0.55], spread: 0.05, hand: [-0.6, 0.4, 0.6] }),
  /** 머리 위 발레 팔 (둥글게) */
  ballet: gest([0.55, 0.78, 0.15], [-1, 0.2, 0.2], 0.9, [0, -0.3, 0.9], { spread: 0.25, fingers: SOFT, hand: [-0.6, 0.6, 0.2] }),
  /** 브이(피스)를 눈 옆에 */
  peaceEye: gest([0.45, -0.4, 0.55], [-0.5, 1, 0.3], 1.95, [-0.2, 0.1, 1], { fingers: PEACE, spread: 0.6, hand: [-0.3, 0.9, 0.2] }),
  /** 주먹을 쥔 채 내린 팔 (화남): 팔꿈치 약간 굽히고 주먹이 허리 앞 */
  fistDown: gest([0.4, -0.9, 0.15], [0, 0, 1], 0.85, [-0.8, 0.1, 0.55], { fingers: FIST, spread: 0.1 }),
  /** 팔을 옆으로 쭉 (T 자 비슷, 손바닥 아래) */
  side: gest([1, -0.05, 0.05], [0, 0, 1], 0.1, [0, -1, 0], { fingers: RELAX, spread: 0.4 }),
} as const

/** 양팔 순회용 (eval 이 프레임마다 배열 리터럴을 만들지 않게) */
export const SIDES = [0, 1] as const

const norm = (out: Dir3, x: number, y: number, z: number): void => {
  const l = Math.sqrt(x * x + y * y + z * z) || 1
  out.x = x / l
  out.y = y / l
  out.z = z / l
}

/**
 * 한쪽 팔(i: 0 = 캐릭터 왼팔, 1 = 오른팔)의 목표를 제스처로 채우고 덮어쓰기 강도를 w 로 둔다.
 * 오른팔은 x 성분을 뒤집는다. 이후 nudge 로 흔들림을 얹는다.
 */
export function armSet(tg: Target, i: 0 | 1, w: number, g: Gesture): void {
  const s = i === 0 ? 1 : -1
  const a: ArmTarget = tg.arms[i]
  tg.armW[i] = w
  norm(a.upper, s * g.upper[0], g.upper[1], g.upper[2])
  norm(a.lower, s * g.lower[0], g.lower[1], g.lower[2])
  norm(a.hand, s * g.hand[0], g.hand[1], g.hand[2])
  norm(a.palm, s * g.palm[0], g.palm[1], g.palm[2])
  for (let k = 0; k < 5; k++) a.fingers[k] = g.fingers[k]
  a.spread = g.spread
}

const mixA: Dir3 = { x: 0, y: 0, z: 1 }
const mixB: Dir3 = { x: 0, y: 0, z: 1 }

/** v1 → v2 를 각도 기준(구면 보간)으로 k 만큼 섞어(좌우 부호 s 적용) out 에 쓴다 */
function mixDir(out: Dir3, v1: V3, v2: V3, s: number, k: number): void {
  norm(mixA, s * v1[0], v1[1], v1[2])
  norm(mixB, s * v2[0], v2[1], v2[2])
  slerpInto(out, mixA, mixB, k, s)
}

/** 두 제스처 사이를 k(0..1)로 섞어 채운다 (방향은 구면 보간) */
export function armSetMix(tg: Target, i: 0 | 1, w: number, g1: Gesture, g2: Gesture, k: number): void {
  const s = i === 0 ? 1 : -1
  const a: ArmTarget = tg.arms[i]
  tg.armW[i] = w
  mixDir(a.upper, g1.upper, g2.upper, s, k)
  mixDir(a.lower, g1.lower, g2.lower, s, k)
  mixDir(a.hand, g1.hand, g2.hand, s, k)
  mixDir(a.palm, g1.palm, g2.palm, s, k)
  for (let n = 0; n < 5; n++) a.fingers[n] = g1.fingers[n] + (g2.fingers[n] - g1.fingers[n]) * k
  a.spread = g1.spread + (g2.spread - g1.spread) * k
}

/** 지금 목표(armSet 이후)를 제스처 g 쪽으로 k(0..1) 만큼 구면 보간한다 — 구간별 제스처를 이어 붙일 때 */
export function armBlendTo(tg: Target, i: 0 | 1, g: Gesture, k: number): void {
  if (k <= 0) return
  const s = i === 0 ? 1 : -1
  const a: ArmTarget = tg.arms[i]
  norm(mixB, s * g.upper[0], g.upper[1], g.upper[2]); slerpInto(a.upper, a.upper, mixB, k, s)
  norm(mixB, s * g.lower[0], g.lower[1], g.lower[2]); slerpInto(a.lower, a.lower, mixB, k, s)
  norm(mixB, s * g.hand[0], g.hand[1], g.hand[2]); slerpInto(a.hand, a.hand, mixB, k, s)
  norm(mixB, s * g.palm[0], g.palm[1], g.palm[2]); slerpInto(a.palm, a.palm, mixB, k, s)
  for (let n = 0; n < 5; n++) a.fingers[n] += (g.fingers[n] - a.fingers[n]) * k
  a.spread += (g.spread - a.spread) * k
}

/** 방향 d 에 (dx, dy, dz) 를 더해 다시 정규화. dx 는 캐릭터 왼팔 기준이고 오른팔(i = 1)이면 부호를 뒤집는다 */
export function nudge(tg: Target, i: 0 | 1, which: 'upper' | 'lower' | 'hand', dx: number, dy = 0, dz = 0): void {
  const d = tg.arms[i][which]
  norm(d, d.x + (i === 0 ? dx : -dx), d.y + dy, d.z + dz)
}

/** 손가락 말림을 [엄지..새끼] 한꺼번에 덮어쓴다 (제스처 위에 손짓을 얹을 때) */
export function setFingers(tg: Target, i: 0 | 1, f: F5): void {
  const a = tg.arms[i]
  for (let k = 0; k < 5; k++) a.fingers[k] = f[k]
}

/**
 * 점프 한 번을 목표에 더한다. 웅크림(무릎) → 도약(bounce, 발 접기) → 공중 → 착지(무릎 충격) → 정착.
 * t0 = 도약 시각, dur = 체공 시간, h = 높이(키 대비 비율). 높이는 포물선이라 위에서 느리고 아래에서 빠르다.
 * 무릎·발 접기는 tg.kneeL/R 와 tg.liftL/R 에 더하고 tg.legs 를 1 로 올린다.
 */
export function hop(tg: Target, tl: number, t0: number, dur: number, h: number, crouch = 0.35): void {
  const ANT = 0.12
  const u = (tl - t0) / dur
  let knee = 0
  let tuck = 0
  if (tl >= t0 - ANT && tl < t0) {
    // 웅크리기
    const p = (tl - (t0 - ANT)) / ANT
    knee = crouch * (p * p * (3 - 2 * p))
  } else if (u >= 0 && u < 1) {
    tg.bounce += 4 * h * u * (1 - u)
    // 공중: 무릎이 풀리며 발을 살짝 접는다
    const air = Math.sin(Math.PI * u)
    tuck = 0.5 * air
    knee = crouch * (1 - Math.min(1, u * 4))
  } else if (u >= 1) {
    // 착지: 무릎이 충격을 먹고 감쇠 스프링으로 정착
    const tau = tl - (t0 + dur)
    if (tau < 0.6) knee = crouch * 0.9 * Math.exp(-tau / 0.11) * (0.5 + 0.5 * Math.cos((Math.PI * 2 * tau) / 0.28))
  }
  if (knee !== 0 || tuck !== 0) {
    tg.legs = 1
    tg.kneeL += knee; tg.kneeR += knee
    tg.liftL += tuck; tg.liftR += tuck
  }
}
