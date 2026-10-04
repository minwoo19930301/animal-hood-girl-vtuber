/**
 * 숫자키 리액션 10종의 타임라인 (전신 VRoid 소녀용).
 *
 *   1 기쁨   2 슬픔   3 화남   4 놀람   5 사랑   6 인사   7 부끄러움   8 축하   9 신나는 춤   0 귀여운 춤
 *
 * 각 리액션은 시간(초) → 목표(Target) 순수 함수 + FX 이벤트 목록이다. 난수는 FX 이벤트의 rng(시드 고정)로만 쓴다.
 * 들어올 때 0.15초, 나갈 때 0.35초는 엔진이 엔벨로프로 처리하므로 여기서는 시간 윈도(ss)를 그 안쪽에 둔다.
 * 춤과 전신 리액션은 tg.legs = 1 로 다리를 강제하고 무릎·발 들기·hipShift 로 하체를 쓴다 (모델은 legsPresent 로 게이팅한다).
 */
import { Anchor } from './fx'
import {
  R, angerMark, confettiBurst, dustPuffs, exclaimAt, flowerBurst, noteUp, risingHearts, sparkleAt, sparkleRing, steam, tearDrop,
} from './fxlib'
import { G, SIDES, armBlendTo, armSet, armSetMix, hop, nudge } from './poses'
import type { FxEvent, Spec, Target } from './types'
import { TAU, bell, ss } from './util'

const ev = (t: number, run: FxEvent['run']): FxEvent => ({ t, run })

/** 부채꼴의 "위" 방향 각 (rad) */
const UP = Math.PI / 2

/** 발 구르기 한 번: T 에서 쾅. 직전 0.22초 동안 발을 들고, 내려찍은 뒤 무릎이 충격을 먹는다 */
function stomp(tg: Target, tl: number, T: number, side: 0 | 1, h = 0.8): void {
  const lift = ss(T - 0.22, T - 0.06, tl) * (tl < T ? 1 : 0)
  if (side === 0) tg.liftL += lift * h
  else tg.liftR += lift * h
  const tau = tl - T
  if (tau >= 0 && tau < 0.5) {
    const k = 0.22 * Math.exp(-tau / 0.09) * (0.5 + 0.5 * Math.cos((TAU * tau) / 0.24))
    tg.kneeL += k; tg.kneeR += k
  }
  if (lift > 0 || (tau >= 0 && tau < 0.5)) tg.legs = 1
}

/* ---------------- 1 기쁨 ---------------- */

const joy: Spec = {
  id: 1,
  key: '1',
  name: '기쁨',
  dur: 2.8,
  peak: 0.9,
  pull: 0.12,
  eval(tl, tg) {
    tg.legs = 1
    tg.happy = 0.9
    tg.mouthSmile = 1
    tg.mouthOpen = 0.3 + 0.1 * Math.sin(TAU * 4 * tl)
    tg.blush = 0.35
    const e = ss(0.1, 0.4, tl)
    tg.headRoll = 0.1 * Math.sin(TAU * 1.7 * tl) * e
    tg.headPitch = 0.1 * e
    tg.twist = 0.12 * Math.sin(TAU * 1.7 * tl + 1) * e
    // 깡충 세 번 (+마지막은 조금 더 크게)
    hop(tg, tl, 0.25, 0.34, 0.05)
    hop(tg, tl, 0.85, 0.34, 0.05)
    hop(tg, tl, 1.45, 0.4, 0.07)
    hop(tg, tl, 2.05, 0.3, 0.035)
    // 양팔을 번쩍 들고 번갈아 펌프
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      const k = 0.5 + 0.5 * Math.sin(TAU * 1.7 * tl + i * Math.PI)
      armSetMix(tg, i, ss(0.05, 0.3, tl), G.hurray, G.cheer, k)
      nudge(tg, i, 'hand', 0.2 * Math.sin(TAU * 3.4 * tl + i))
    }
  },
  events: [
    ev(0.2, (fx, rng) => { sparkleRing(fx, rng, 6); flowerBurst(fx, rng, 7, 3) }),
    ev(1.3, (fx, rng) => { sparkleRing(fx, rng, 5); flowerBurst(fx, rng, 5, 3) }),
  ],
}

/* ---------------- 2 슬픔 ---------------- */

const sadEvents: FxEvent[] = []
for (let k = 0; k < 8; k++) {
  const t = 0.7 + 0.31 * k
  sadEvents.push(ev(t, (fx, rng) => {
    tearDrop(fx, rng, Anchor.eyeL, R(rng, -0.004, 0.012))
    tearDrop(fx, rng, Anchor.eyeR, R(rng, -0.012, 0.004), 0.022, 0.06)
  }))
}

const sad: Spec = {
  id: 2,
  key: '2',
  name: '슬픔',
  dur: 3.4,
  peak: 1.4,
  pull: 0.03,
  eval(tl, tg) {
    tg.legs = 1
    const e = ss(0.1, 0.7, tl)
    tg.sad = 1
    tg.mouthSmile = -0.75
    tg.mouthOpen = 0.04 + 0.04 * Math.sin(TAU * 1.1 * tl)
    tg.blink = 0.28
    tg.gazeY = -0.5
    tg.headPitch = -0.18 * e
    tg.headRoll = 0.08 * Math.sin(TAU * 0.5 * tl) * e
    tg.leanZ = 0.16 * e
    tg.leanX = 0.04 * Math.sin(TAU * 0.5 * tl) * e
    // 흐느낌: 어깨가 들썩
    const sob = ss(0.6, 1.0, tl) * (1 - ss(2.7, 3.1, tl))
    const sh = 0.12 + 0.12 * Math.max(0, Math.sin(TAU * 2.2 * tl)) * sob
    tg.shrugL = sh; tg.shrugR = sh
    // 힘이 풀려 무릎이 살짝 꺾인다
    tg.legs = 1
    tg.kneeL = tg.kneeR = 0.12 * e + 0.03 * Math.sin(TAU * 2.2 * tl) * sob
    tg.hipShift = 0.2 * Math.sin(TAU * 0.5 * tl)
    // 두 손으로 눈가를 번갈아 훔친다
    const w = ss(0.25, 0.75, tl) * (1 - ss(2.8, 3.2, tl))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      armSet(tg, i, w, G.eyes)
      const rub = Math.sin(TAU * 1.4 * tl + i * Math.PI) * ss(0.9, 1.3, tl)
      nudge(tg, i, 'lower', 0.06 * rub, 0.05 * rub)
      nudge(tg, i, 'hand', 0.12 * rub)
    }
  },
  events: sadEvents,
}

/* ---------------- 3 화남 ---------------- */

const angry: Spec = {
  id: 3,
  key: '3',
  name: '화남',
  dur: 2.8,
  peak: 1.05,
  pull: 0.06,
  eval(tl, tg) {
    tg.legs = 1
    tg.angry = 1
    tg.mouthSmile = -0.9
    tg.mouthOpen = 0.12 + 0.12 * Math.max(0, Math.sin(TAU * 5 * tl))
    tg.blush = 0.55
    const tr = ss(0.08, 0.25, tl) * (1 - ss(2.1, 2.45, tl))
    // 부들부들 떨며 노려본다
    tg.headRoll = 0.05 * Math.sin(TAU * 13 * tl + 1) * tr
    tg.headYaw = 0.04 * Math.sin(TAU * 11 * tl) * tr
    tg.headPitch = -0.12 * tr
    tg.leanZ = 0.1 * tr
    tg.shiftX = 0.006 * Math.sin(TAU * 17 * tl) * tr
    tg.shrugL = tg.shrugR = 0.35 * tr
    // 발 구르기 세 번 (오른발 → 왼발 → 오른발)
    stomp(tg, tl, 0.62, 1)
    stomp(tg, tl, 1.1, 0, 0.9)
    stomp(tg, tl, 1.6, 1, 1)
    // 주먹을 꽉 쥐고 부들
    const w = ss(0.1, 0.3, tl) * (1 - ss(2.1, 2.45, tl))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      armSet(tg, i, w, G.fistDown)
      nudge(tg, i, 'lower', 0, 0.05 * Math.sin(TAU * 16 * tl + i * 1.7) * tr)
      nudge(tg, i, 'upper', 0.03 * Math.sin(TAU * 14 * tl + i) * tr)
    }
  },
  events: [
    ev(0.2, (fx) => angerMark(fx, Anchor.head, 0.15, 0.17, 0.075, 2.0)),
    ev(0.45, (fx, rng) => steam(fx, rng)),
    ev(0.62, (fx) => dustPuffs(fx, Anchor.footR)),
    ev(1.1, (fx) => dustPuffs(fx, Anchor.footL)),
    ev(1.25, (fx, rng) => steam(fx, rng)),
    ev(1.6, (fx) => dustPuffs(fx, Anchor.footR, 0.065)),
    ev(1.8, (fx, rng) => steam(fx, rng)),
  ],
}

/* ---------------- 4 놀람 ---------------- */

const surprise: Spec = {
  id: 4,
  key: '4',
  name: '놀람',
  dur: 2.4,
  peak: 0.4,
  pull: 0.1,
  eval(tl, tg) {
    tg.legs = 1
    tg.surprised = 1
    tg.mouthOpen = 0.55 - 0.15 * ss(0.3, 0.9, tl)
    tg.mouthSmile = -0.3
    tg.blink = 0
    tg.blush = 0.15
    tg.sweat = tl > 0.55
    // 깜짝 놀라 뒤로 껑충 (몸이 젖혀지고 고개가 들린다)
    hop(tg, tl, 0.06, 0.36, 0.05, 0.25)
    const back = bell(0.0, 0.7, tl)
    tg.leanZ = -0.22 * back
    tg.headPitch = 0.16 * bell(0.02, 0.9, tl)
    tg.shrugL = tg.shrugR = 0.5 * bell(0.0, 1.2, tl)
    // 두 손이 번쩍 → 가슴 앞으로 모아 쥔다
    const w = ss(0.04, 0.2, tl) * (1 - ss(1.7, 2.05, tl))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      armSet(tg, i, w, G.startle)
      nudge(tg, i, 'lower', 0.03 * Math.sin(TAU * 9 * tl + i) * (1 - ss(0.9, 1.4, tl)))
      armBlendTo(tg, i, G.clasp, ss(1.0, 1.45, tl))
    }
  },
  events: [
    ev(0.1, (fx) => exclaimAt(fx, Anchor.head, 0.16, 0.2, 0.12)),
    ev(0.44, (fx) => dustPuffs(fx, Anchor.footL, 0.04)),
  ],
}

/* ---------------- 5 사랑 ---------------- */

const love: Spec = {
  id: 5,
  key: '5',
  name: '사랑',
  dur: 3.2,
  peak: 1.2,
  pull: 0.08,
  eval(tl, tg) {
    tg.legs = 1
    tg.happy = 0.3
    tg.relaxed = 0.6
    tg.heart = true
    tg.mouthSmile = 0.9
    tg.mouthOpen = 0
    tg.blush = 0.9
    const e = ss(0.1, 0.5, tl)
    const sw = Math.sin(TAU * 0.8 * tl)
    tg.leanX = 0.07 * sw * e
    tg.twist = 0.14 * Math.cos(TAU * 0.8 * tl) * e
    tg.headRoll = 0.14 * Math.sin(TAU * 0.8 * tl + 0.5) * e
    tg.legs = 1
    tg.hipShift = 0.5 * sw * e
    tg.kneeL = tg.kneeR = 0.1 + 0.07 * Math.sin(TAU * 1.6 * tl)
    hop(tg, tl, 1.75, 0.3, 0.03)
    // 가슴 앞 하트 손 → 머리 위 큰 하트
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      armSet(tg, i, ss(0.1, 0.5, tl) * (1 - ss(2.7, 3.1, tl)), G.heartChest)
      armBlendTo(tg, i, G.ballet, ss(1.7, 2.1, tl) * (1 - ss(2.5, 2.8, tl)))
    }
  },
  events: [
    ev(0.3, (fx, rng) => risingHearts(fx, rng, Anchor.head, 3, 0.05, 0.08)),
    ev(0.85, (fx, rng) => risingHearts(fx, rng, Anchor.head, 2, 0.04, 0.07)),
    ev(1.3, (fx, rng) => risingHearts(fx, rng, Anchor.head, 3, 0.05, 0.09)),
    ev(1.8, (fx, rng) => { sparkleRing(fx, rng, 6); risingHearts(fx, rng, Anchor.head, 3, 0.05, 0.09) }),
    ev(2.3, (fx, rng) => risingHearts(fx, rng, Anchor.head, 2, 0.04, 0.07)),
  ],
}

/* ---------------- 6 인사 ---------------- */

const hello: Spec = {
  id: 6,
  key: '6',
  name: '인사',
  dur: 3.0,
  peak: 1.1,
  pull: 0.06,
  eval(tl, tg) {
    tg.legs = 1
    tg.relaxed = 0.5
    tg.happy = 0.2 * ss(0.3, 0.6, tl)
    tg.mouthSmile = 0.85
    tg.mouthOpen = 0.12 * ss(0.2, 0.5, tl)
    tg.blush = 0.25
    tg.headRoll = 0.14 * ss(0.1, 0.4, tl) * (1 - ss(1.8, 2.1, tl))
    const bow = bell(1.75, 2.7, tl)
    tg.leanZ = 0.36 * bow
    tg.headPitch = -0.18 * bow
    // 체중을 한쪽에 싣고 손 흔드는 박자로 무릎이 살짝 출렁
    tg.legs = 1
    tg.hipShift = 0.35 * ss(0.1, 0.5, tl)
    tg.kneeL = tg.kneeR = 0.07 + 0.07 * Math.sin(TAU * 2.8 * tl) * ss(0.3, 0.6, tl)
    tg.liftR = 0.1 * ss(0.1, 0.5, tl)
    // 큰 손인사: 팔꿈치를 옆으로 들고 전완을 좌우로
    const w = ss(0.08, 0.32, tl) * (1 - ss(1.8, 2.1, tl))
    const amp = ss(0.3, 0.55, tl)
    const ph = TAU * 2.8 * (tl - 0.3)
    armSet(tg, 0, w, G.wave)
    nudge(tg, 0, 'lower', 0.45 * Math.sin(ph) * amp, 0.03)
    nudge(tg, 0, 'hand', 0.45 * Math.sin(ph + 0.5) * amp)
    // 인사 끝에 두 손을 앞에 모으고 숙인다
    armBlendTo(tg, 0, G.clasp, ss(1.8, 2.15, tl) * (1 - ss(2.65, 2.95, tl)))
    armSet(tg, 1, ss(1.6, 1.95, tl) * (1 - ss(2.65, 2.95, tl)), G.clasp)
  },
  events: [
    ev(0.5, (fx, rng) => sparkleAt(fx, rng, Anchor.handL, 0.03, 0.08, 0.05, 1.2)),
    ev(0.95, (fx, rng) => sparkleAt(fx, rng, Anchor.handL, 0.05, 0.1, 0.04, 1.1)),
    ev(1.4, (fx, rng) => sparkleAt(fx, rng, Anchor.handL, 0.02, 0.12, 0.045, 1.1)),
  ],
}

/* ---------------- 7 부끄러움 ---------------- */

const shy: Spec = {
  id: 7,
  key: '7',
  name: '부끄러움',
  dur: 3.2,
  peak: 1.3,
  pull: 0.04,
  eval(tl, tg) {
    tg.legs = 1
    const e = ss(0.1, 0.5, tl)
    tg.relaxed = 0.7
    tg.blush = 1
    tg.mouthSmile = 0.45
    tg.mouthOpen = 0
    tg.blink = 0.18
    tg.gazeX = 0.9
    tg.gazeY = -0.5
    tg.headYaw = -0.3 * e
    tg.headRoll = 0.16 * e
    tg.headPitch = -0.15 * e
    // 몸을 배배 꼰다
    const sw = Math.sin(TAU * 0.9 * tl)
    tg.twist = 0.35 * sw * e
    tg.leanX = 0.07 * Math.sin(TAU * 0.9 * tl + 1) * e
    tg.shrugL = tg.shrugR = 0.3 * e
    tg.legs = 1
    tg.hipShift = 0.7 * sw * e
    tg.kneeL = tg.kneeR = 0.08 + 0.05 * Math.sin(TAU * 1.8 * tl)
    tg.outL = -0.1 * e; tg.outR = -0.1 * e // 살짝 안짱다리
    // 두 손으로 볼을 감싼다
    const w = ss(0.15, 0.5, tl) * (1 - ss(2.8, 3.15, tl))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      armSet(tg, i, w, G.cheeks)
      nudge(tg, i, 'lower', 0.03 * sw, 0.02 * Math.sin(TAU * 1.8 * tl + i))
    }
  },
  events: [
    ev(0.5, (fx, rng) => risingHearts(fx, rng, Anchor.head, 2, 0.03, 0.045, 0.16, 0.14)),
    ev(1.4, (fx, rng) => { sparkleRing(fx, rng, 4, 0.22, 0.14, 0.05, 0.025, 0.045); risingHearts(fx, rng, Anchor.head, 2, 0.03, 0.045, 0.16, 0.14) }),
    ev(2.2, (fx, rng) => risingHearts(fx, rng, Anchor.head, 2, 0.03, 0.045, 0.16, 0.14)),
  ],
}

/* ---------------- 8 축하 ---------------- */

const celebrate: Spec = {
  id: 8,
  key: '8',
  name: '축하',
  dur: 3.2,
  peak: 1.7,
  pull: 0.14,
  eval(tl, tg) {
    tg.legs = 1
    tg.happy = 0.85
    tg.mouthSmile = 1
    tg.mouthOpen = 0.45 + 0.12 * Math.sin(TAU * 4.5 * tl)
    tg.blush = 0.4
    const e = ss(0.1, 0.4, tl)
    tg.headRoll = 0.08 * Math.sin(TAU * 2.2 * tl) * e
    tg.headPitch = 0.14 * e
    hop(tg, tl, 0.3, 0.5, 0.09, 0.4)
    hop(tg, tl, 1.35, 0.5, 0.1, 0.4)
    hop(tg, tl, 2.3, 0.4, 0.06, 0.3)
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      const k = 0.5 + 0.5 * Math.sin(TAU * 2.2 * tl + i * Math.PI)
      armSetMix(tg, i, ss(0.05, 0.28, tl), G.hurray, G.cheerWide, 0.4 + 0.6 * k)
      nudge(tg, i, 'hand', 0.25 * Math.sin(TAU * 4.4 * tl + i))
    }
  },
  events: [
    ev(0.3, (fx, rng) => {
      confettiBurst(fx, rng, Anchor.handL, 9, 1, 0.02, 0.05, UP - 0.5, 0.5)
      confettiBurst(fx, rng, Anchor.handR, 9, 1, -0.02, 0.05, UP + 0.5, 0.5)
      sparkleRing(fx, rng, 6)
    }),
    ev(1.35, (fx, rng) => {
      confettiBurst(fx, rng, Anchor.handL, 9, 1.1, 0.02, 0.05, UP - 0.6, 0.55)
      confettiBurst(fx, rng, Anchor.handR, 9, 1.1, -0.02, 0.05, UP + 0.6, 0.55)
      confettiBurst(fx, rng, Anchor.head, 7, 0.9, 0, 0.18, UP, 0.7)
    }),
    ev(2.3, (fx, rng) => {
      confettiBurst(fx, rng, Anchor.handL, 6, 0.9, 0.02, 0.05, UP - 0.5, 0.5)
      confettiBurst(fx, rng, Anchor.handR, 6, 0.9, -0.02, 0.05, UP + 0.5, 0.5)
      sparkleRing(fx, rng, 5)
    }),
  ],
}

/* ---------------- 9 신나는 춤 ---------------- */

/** 120 BPM: 한 박 0.5초, 좌우 한 사이클 1초 */
const B1 = 0.5
const CYC1 = 1.0

const danceEvents: FxEvent[] = []
for (let k = 0; k < 8; k++) {
  const side = k % 2 === 0 ? 1 : -1
  danceEvents.push(ev(0.2 + B1 * k, (fx, rng) => noteUp(fx, rng, Anchor.head, side * R(rng, 0.14, 0.24), R(rng, 0.0, 0.14), side, 0.065)))
}
danceEvents.push(ev(1.5, (fx, rng) => sparkleRing(fx, rng, 5)))
danceEvents.push(ev(3.0, (fx, rng) => sparkleRing(fx, rng, 6)))

const dance: Spec = {
  id: 9,
  key: '9',
  name: '신나는 춤',
  dur: 4.3,
  peak: 1.2,
  pull: 0.14,
  eval(tl, tg) {
    tg.legs = 1
    const e = ss(0.0, 0.3, tl) * (1 - ss(3.9, 4.25, tl))
    const ph = (TAU * tl) / CYC1 // 좌우 한 사이클
    const bp = (TAU * tl) / B1 // 박자
    const sw = Math.sin(ph)
    tg.happy = 0.55
    tg.mouthSmile = 1
    tg.mouthOpen = 0.3 + 0.1 * Math.cos(bp)
    tg.blush = 0.3
    // 사이드 스텝: 몸이 좌우로 옮겨 가고 뒤따르는 발이 들린다 (step-touch)
    tg.legs = 1
    tg.shiftX = 0.1 * sw * e
    tg.hipShift = 1 * sw * e
    const cs = Math.cos(ph)
    tg.liftR = 0.75 * Math.max(0, cs) * e
    tg.liftL = 0.75 * Math.max(0, -cs) * e
    // 박마다 무릎 바운스
    const dip = 0.5 + 0.5 * Math.cos(bp)
    tg.kneeL = tg.kneeR = (0.1 + 0.3 * dip) * e
    tg.bounce = 0.02 * (1 - dip) * e
    // 머리 까딱, 상체 트위스트
    tg.headPitch = 0.1 * Math.cos(bp) * e
    tg.headRoll = 0.1 * sw * e
    tg.twist = 0.28 * Math.cos(ph) * e
    tg.leanX = -0.07 * sw * e
    tg.leanZ = 0.05 * Math.cos(bp) * e
    // 팔: 번갈아 펌프 → 머리 위 웨이브 → 박수/만세 → 만세 피니시
    const a = ss(0.05, 0.3, tl) * (1 - ss(4.0, 4.28, tl))
    const pumpS = ss(1.35, 1.65, tl) // 펌프 → 웨이브
    const clapS = ss(2.85, 3.1, tl) // → 박수/만세 교차
    const finS = ss(3.7, 3.95, tl)
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      const alt = 0.5 + 0.5 * Math.sin(ph + i * Math.PI)
      armSetMix(tg, i, a, G.pump, G.pumpUp, alt)
      armBlendTo(tg, i, G.hurray, pumpS)
      nudge(tg, i, 'lower', 0.25 * Math.sin(ph + i * 0.6) * pumpS * (1 - clapS))
      // 박수: 박마다 가슴 앞 ↔ 위
      const hit = Math.pow(0.5 + 0.5 * Math.cos(bp), 2)
      armBlendTo(tg, i, G.clap, clapS * (1 - finS) * hit)
      armBlendTo(tg, i, G.cheerWide, finS)
    }
  },
  events: danceEvents,
}

/* ---------------- 0 귀여운 춤 ---------------- */

/** 100 BPM: 한 박 0.6초 */
const B0 = 0.6

const cuteEvents: FxEvent[] = []
cuteEvents.push(ev(0.3, (fx, rng) => sparkleRing(fx, rng, 4, 0.22, 0.14, 0.05, 0.03, 0.05)))
cuteEvents.push(ev(1.5, (fx, rng) => risingHearts(fx, rng, Anchor.head, 3, 0.05, 0.08)))
cuteEvents.push(ev(2.25, (fx, rng) => sparkleRing(fx, rng, 6)))
cuteEvents.push(ev(2.9, (fx, rng) => sparkleRing(fx, rng, 6, 0.28, 0.2, 0.08, 0.04, 0.07)))
for (let k = 0; k < 5; k++) {
  const side = k % 2 === 0 ? 1 : -1
  cuteEvents.push(ev(0.45 + 0.6 * k, (fx, rng) => noteUp(fx, rng, Anchor.head, side * R(rng, 0.14, 0.24), R(rng, 0, 0.1), side, 0.055)))
}
cuteEvents.push(ev(3.5, (fx, rng) => { sparkleRing(fx, rng, 7, 0.3, 0.2, 0.08, 0.04, 0.07); risingHearts(fx, rng, Anchor.head, 3, 0.05, 0.08) }))

const cute: Spec = {
  id: 10,
  key: '0',
  name: '귀여운 춤',
  dur: 4.4,
  peak: 3.65,
  pull: 0.14,
  eval(tl, tg) {
    tg.legs = 1
    const e = ss(0.0, 0.3, tl) * (1 - ss(4.0, 4.35, tl))
    const bp = (TAU * tl) / B0
    tg.mouthSmile = 1
    tg.mouthOpen = 0.2
    tg.blush = 0.55
    // 구간 가중치
    const A = 1 - ss(1.1, 1.3, tl) // 0 ~ 1.2: 볼 손 + 좌우 스웨이 + 토탭
    const Bh = ss(1.1, 1.3, tl) * (1 - ss(2.1, 2.3, tl)) // 1.2 ~ 2.2: 하트 손 + 킥
    const Cc = ss(2.1, 2.3, tl) * (1 - ss(3.0, 3.15, tl)) // 2.2 ~ 3.1: 트월 + 발레 팔
    const Dd = ss(3.0, 3.2, tl) // 3.1 ~ : 엔딩 포즈
    const sw = Math.sin(TAU * tl / (B0 * 2))
    // 웃는 눈은 엔딩에서 걷고 윙크를 위해 한쪽 눈을 연다
    tg.happy = 0.5 * (1 - Dd) + 0.05 * Dd
    tg.relaxed = 0.4
    tg.winkL = tl > 3.15 ? ss(3.2, 3.3, tl) * (1 - ss(3.95, 4.05, tl)) : NaN
    // 좌우 스웨이 (전 구간 바탕)
    tg.hipShift = 0.6 * sw * (1 - Dd) * e
    tg.shiftX = 0.04 * sw * (1 - Cc) * (1 - Dd) * e
    tg.twist = 0.18 * Math.cos(TAU * tl / (B0 * 2)) * (1 - Dd) * e
    tg.headRoll = 0.14 * sw * (1 - Dd) * e + 0.18 * Dd
    tg.headPitch = 0.06 * Math.cos(bp) * (1 - Dd) * e
    const dip = 0.5 + 0.5 * Math.cos(bp)
    tg.kneeL = tg.kneeR = (0.08 + 0.18 * dip) * (1 - Dd) * e + 0.1 * Dd
    // 토탭: 구간 A 에서 박마다 안쪽 발끝을 톡
    const tap = Math.pow(0.5 + 0.5 * Math.cos(bp * 0.5), 3)
    tg.liftL += 0.5 * tap * A * Math.max(0, sw) * e
    tg.liftR += 0.5 * tap * A * Math.max(0, -sw) * e
    // 킥: 1.5초 오른발 옆 킥, 1.9초 왼발 킥
    const kickR = bell(1.3, 1.75, tl)
    const kickL = bell(1.7, 2.15, tl)
    tg.kickR += 0.7 * kickR; tg.outR += 0.35 * kickR
    tg.kickL += 0.7 * kickL; tg.outL += 0.35 * kickL
    // 트월: 2.25초부터 0.8초 동안 360°
    tg.spin = TAU * ss(2.25, 3.05, tl)
    tg.bounce += 0.03 * bell(2.2, 2.9, tl) * 1
    tg.liftR += 0.5 * Cc
    // 엔딩: 왼발에 체중, 오른발 뒤로 들고 윙크 + V
    tg.liftR += 0.7 * Dd * e
    tg.hipShift += 0.5 * Dd * e
    // 팔
    const a = ss(0.05, 0.3, tl) * (1 - ss(4.05, 4.35, tl))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      // A: 볼 손 → 살랑살랑
      armSet(tg, i, a, G.cheeks)
      nudge(tg, i, 'lower', 0.06 * Math.sin(TAU * tl / B0 + i * Math.PI) * A, 0.04 * Math.cos(TAU * tl / B0 + i) * A)
      // B: 하트 손
      armBlendTo(tg, i, G.heartChest, Bh)
      // C: 발레 팔
      armBlendTo(tg, i, G.ballet, Cc)
      // D: 왼팔 V 윙크, 오른팔 허리
      armBlendTo(tg, i, i === 0 ? G.peaceEye : G.hip, Dd)
    }
  },
  events: cuteEvents,
}

export const SPECS: readonly Spec[] = [joy, sad, angry, surprise, love, hello, shy, celebrate, dance, cute]