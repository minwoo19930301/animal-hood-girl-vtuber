/**
 * 리액션 FX 이벤트 보조 — 타임라인의 events 가 부르는 입자 발사기들.
 * 좌표는 앵커 기준 오프셋, 단위는 아바타 키(1 = 발끝~머리 꼭대기). +x 화면 오른쪽, +y 위.
 * 난수는 반드시 호출자가 넘기는 rng(트리거마다 시드 고정) — Math.random 금지.
 */
import { Anchor, CONFETTI_COLORS, FxKind, type AnchorId, type Fx, type FxKindId } from './fx'
import { TAU } from './util'

export type Rng = () => number
export const R = (rng: Rng, a: number, b: number): number => a + (b - a) * rng()

const FLOWERS: readonly FxKindId[] = [FxKind.flowerA, FxKind.flowerB, FxKind.flowerC]

/** 한 점에서 반짝이 하나 */
export function sparkleAt(fx: Fx, rng: Rng, anchor: AnchorId, ox: number, oy: number, size: number, life = 1.2, follow = 0.6): void {
  const p = fx.emit(FxKind.sparkle, anchor, ox, oy)
  if (!p) return
  p.life = life
  p.size = size
  p.twinkle = 0.5
  p.swayPh = R(rng, 0, TAU)
  p.spin = R(rng, -0.5, 0.5)
  p.vy = 0.02
  p.follow = follow
}

/** 머리 둘레에 반짝이를 흩뿌린다 (원호 위, 안쪽에서 바깥으로 살짝 퍼짐) */
export function sparkleRing(fx: Fx, rng: Rng, n: number, rx = 0.25, ry = 0.16, cy = 0.07, size0 = 0.035, size1 = 0.065): void {
  for (let i = 0; i < n; i++) {
    const th = (TAU * (i + R(rng, 0, 0.6))) / n
    const p = fx.emit(FxKind.sparkle, Anchor.head, Math.cos(th) * rx, cy + Math.sin(th) * ry)
    if (!p) return
    p.vx = Math.cos(th) * 0.05
    p.vy = Math.sin(th) * 0.04 + 0.02
    p.life = R(rng, 0.9, 1.4)
    p.size = R(rng, size0, size1)
    p.twinkle = 0.55
    p.swayPh = R(rng, 0, TAU)
    p.spin = R(rng, -0.7, 0.7)
    p.delay = R(rng, 0, 0.25)
    p.follow = 0.8
  }
}

/** 머리 위 부채꼴에서 꽃·반짝이를 터뜨린다 */
export function flowerBurst(fx: Fx, rng: Rng, flowers: number, sparkles: number, lifeScale = 1): void {
  for (let i = 0; i < flowers; i++) {
    const th = R(rng, 0.08 * Math.PI, 0.92 * Math.PI)
    const r0 = R(rng, 0.14, 0.2)
    const p = fx.emit(FLOWERS[Math.floor(rng() * 3) % 3], Anchor.head, Math.cos(th) * r0, 0.1 + Math.sin(th) * r0)
    if (!p) return
    const v = R(rng, 0.16, 0.34)
    p.vx = Math.cos(th) * v
    p.vy = Math.sin(th) * v + 0.04
    p.kx = 2; p.ky = 2
    p.g = R(rng, 0.06, 0.14)
    p.life = R(rng, 1.3, 1.8) * lifeScale
    p.size = R(rng, 0.045, 0.075)
    p.spin = R(rng, -2.2, 2.2)
    p.rot = R(rng, 0, TAU)
    p.delay = R(rng, 0, 0.18)
    p.shrink = 0.25
    p.follow = 0.4
  }
  for (let i = 0; i < sparkles; i++) {
    const th = R(rng, 0.1 * Math.PI, 0.9 * Math.PI)
    const r0 = R(rng, 0.2, 0.3)
    const p = fx.emit(FxKind.sparkle, Anchor.head, Math.cos(th) * r0, 0.1 + Math.sin(th) * r0)
    if (!p) return
    p.vy = R(rng, 0.02, 0.08)
    p.life = R(rng, 1.0, 1.5) * lifeScale
    p.size = R(rng, 0.045, 0.075)
    p.twinkle = 0.55
    p.swayPh = R(rng, 0, TAU)
    p.spin = R(rng, -0.6, 0.6)
    p.delay = R(rng, 0, 0.3)
    p.follow = 0.6
  }
}

/**
 * 색종이 한 번 터짐. (ox, oy) = 터지는 자리(앵커 기준), 부채꼴은 center(rad, π/2 = 위)를 가운데로 ±half.
 * 도톰하고 둥근 알약 모양으로 (가는 막대 수십 개는 잡음으로 보인다).
 */
export function confettiBurst(fx: Fx, rng: Rng, anchor: AnchorId, n: number, power: number, ox: number, oy: number, center: number, half: number): void {
  for (let i = 0; i < n; i++) {
    const p = fx.emit(FxKind.confetti, anchor, ox + R(rng, -0.02, 0.02), oy + R(rng, -0.02, 0.02))
    if (!p) return
    const th = center + R(rng, -half, half)
    const sp = R(rng, 0.45, 1.0) * power
    p.vx = Math.cos(th) * sp
    p.vy = Math.sin(th) * sp
    p.kx = 1.15; p.ky = 1.2
    p.g = R(rng, 0.45, 0.7)
    p.life = R(rng, 1.8, 2.4)
    p.size = R(rng, 0.02, 0.032)
    p.aspect = R(rng, 0.55, 0.9)
    p.rot = R(rng, 0, TAU)
    p.spin = R(rng, -4, 4)
    p.flutter = 0.28
    p.flutterF = R(rng, 8, 13)
    p.flutterPh = R(rng, 0, TAU)
    p.swayAmp = R(rng, 0.004, 0.012)
    p.swayF = R(rng, 1.5, 2.6)
    p.swayPh = R(rng, 0, TAU)
    p.color = CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length) % CONFETTI_COLORS.length]
    p.pop = 0.05
    p.fadeAt = 0.8
    p.delay = R(rng, 0, 0.1)
  }
}

/** 하트가 앵커 위에서 떠오른다 */
export function risingHearts(fx: Fx, rng: Rng, anchor: AnchorId, n: number, minSize: number, maxSize: number, spreadX = 0.2, oy = 0.12): void {
  for (let i = 0; i < n; i++) {
    const p = fx.emit(FxKind.heart, anchor, R(rng, -spreadX, spreadX), oy + R(rng, 0, 0.08))
    if (!p) return
    p.vy = R(rng, 0.14, 0.22)
    p.vx = R(rng, -0.03, 0.04)
    p.ky = 0.6; p.kx = 1
    p.g = 0
    p.life = R(rng, 1.6, 2.1)
    p.size = R(rng, minSize, maxSize)
    p.swayAmp = R(rng, 0.01, 0.025)
    p.swayF = R(rng, 0.8, 1.4)
    p.swayPh = R(rng, 0, TAU)
    p.rot = R(rng, -0.35, 0.35)
    p.spin = R(rng, -0.4, 0.4)
    p.delay = R(rng, 0, 0.16)
    p.shrink = 0.2
    p.follow = 0.5
  }
}

/** 음표 ♪♫ 하나가 위로 떠오른다 (side = 좌우 어느 쪽으로 흩날릴지 -1/+1) */
export function noteUp(fx: Fx, rng: Rng, anchor: AnchorId, ox: number, oy: number, side: number, size = 0.06): void {
  const p = fx.emit(rng() < 0.5 ? FxKind.noteA : FxKind.noteB, anchor, ox, oy)
  if (!p) return
  p.vx = side * R(rng, 0.05, 0.1)
  p.vy = R(rng, 0.16, 0.24)
  p.kx = 1; p.ky = 0.7
  p.life = R(rng, 1.3, 1.7)
  p.size = size * R(rng, 0.9, 1.15)
  p.swayAmp = R(rng, 0.01, 0.02)
  p.swayF = R(rng, 0.9, 1.5)
  p.swayPh = R(rng, 0, TAU)
  p.rot = R(rng, -0.3, 0.3)
  p.spin = R(rng, -0.5, 0.5)
  p.pop = 0.16
  p.shrink = 0.15
  p.follow = 0.4
}

/** 눈물방울: 눈 아래에서 흘러내리다 떨어진다 (eyeL/eyeR) */
export function tearDrop(fx: Fx, rng: Rng, anchor: AnchorId, ox: number, size = 0.022, delay = 0): void {
  const p = fx.emit(FxKind.drop, anchor, ox, -0.012, 0.04)
  if (!p) return
  p.vy = -0.02
  p.ky = 0.1
  p.g = R(rng, 0.45, 0.65)
  p.life = R(rng, 0.7, 0.95)
  p.size = size * R(rng, 0.85, 1.15)
  p.aspect = 1.25
  p.pop = 0.1
  p.fadeAt = 0.55
  p.delay = delay
  p.follow = 1
}

/** 발밑 먼지 (착지·발 구르기) */
export function dustPuffs(fx: Fx, anchor: AnchorId, size = 0.05): void {
  for (const sx of [-1, 1]) {
    const p = fx.emit(FxKind.puff, anchor, sx * 0.03, 0.01, 0.03)
    if (!p) return
    p.vx = sx * 0.16
    p.vy = 0.03
    p.kx = 3; p.ky = 3
    p.size = size
    p.grow = 0.9
    p.life = 0.5
    p.alpha = 0.85
    p.pop = 0.06
    p.fadeAt = 0.3
  }
}

/** 느낌표 하나 (머리 위 오른쪽) */
export function exclaimAt(fx: Fx, anchor: AnchorId, ox: number, oy: number, size = 0.11): void {
  const p = fx.emit(FxKind.exclaim, anchor, ox, oy)
  if (!p) return
  p.size = size
  p.rot = -0.18
  p.life = 1.25
  p.follow = 1
  p.pop = 0.16
  p.pulseAmp = 0.06
  p.pulseF = 3
  p.fadeAt = 0.78
}

/** 분노 마크 💢 (머리 옆) */
export function angerMark(fx: Fx, anchor: AnchorId, ox: number, oy: number, size = 0.09, life = 1.9, oz = 0): void {
  const p = fx.emit(FxKind.anger, anchor, ox, oy, oz)
  if (!p) return
  p.size = size
  p.rot = 0.12
  p.life = life
  p.pop = 0.14
  p.follow = 1
  p.pulseAmp = 0.16
  p.pulseF = 2.8
  p.fadeAt = 0.82
}
