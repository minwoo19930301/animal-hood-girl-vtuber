/**
 * 숫자키 리액션 10종의 타임라인 (전신 VRoid 소녀용).
 *
 *   1 기쁨   2 슬픔   3 화남   4 놀람   5 사랑   6 인사   7 부끄러움   8 축하   9 꾸벅 인사   0 귀여운 춤
 *
 * 각 리액션은 시간(초) → 목표(Target) 순수 함수 + FX 이벤트 목록이다. 난수는 FX 이벤트의 rng(시드 고정)로만 쓴다.
 * 들어올 때 0.15초, 나갈 때 0.35초는 엔진이 엔벨로프로 처리하므로 여기서는 시간 윈도(ss)를 그 안쪽에 둔다.
 * 모든 리액션은 tg.legs = 1 로 다리를 강제하고 무릎·발 들기·hipShift 로 하체를 쓴다 (모델은 legsPresent 로 게이팅한다). 꾸벅 인사(9)는 하체를 움직이지 않고 tg.bow 로 허리만 접는다.
 */
import { Anchor } from './fx'
import {
  R, angerMark, confettiBurst, dustPuffs, exclaimAt, flowerBurst, noteUp, risingHearts, sparkleAt, sparkleRing, tearDrop,
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
    const k = 0.4 * Math.exp(-tau / 0.09) * (0.5 + 0.5 * Math.cos((TAU * tau) / 0.24))
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
  peak: 1.02,
  pull: 0.12,
  eval(tl, tg) {
    tg.legs = 1
    tg.happy = 0.9
    tg.mouthSmile = 1
    tg.mouthOpen = 0.3 + 0.1 * Math.sin(TAU * 4 * tl)
    tg.blush = 0.35
    const e = ss(0.1, 0.4, tl)
    const sw = Math.sin(TAU * 1.7 * tl)
    // 깡충 네 번 (가운데 둘이 크다): 뛸 때마다 몸이 좌우로 기울고 고개가 까딱
    tg.headRoll = 0.14 * sw * e
    tg.headPitch = 0.1 * e
    tg.twist = 0.14 * Math.sin(TAU * 1.7 * tl + 1) * e
    tg.leanX = 0.1 * sw * e
    tg.hipShift = 0.35 * sw * e
    hop(tg, tl, 0.25, 0.34, 0.05, 0.4)
    hop(tg, tl, 0.85, 0.36, 0.075, 0.45)
    hop(tg, tl, 1.45, 0.4, 0.085, 0.45)
    hop(tg, tl, 2.05, 0.3, 0.04)
    // 주먹을 꽉 쥐고 번갈아 펌프 (한쪽 위 · 한쪽 앞) — 만세와 구별되는 기쁨의 자세
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      const k = 0.5 + 0.5 * Math.sin(TAU * 1.7 * tl + i * Math.PI)
      armSetMix(tg, i, ss(0.05, 0.3, tl) * (1 - ss(2.55, 2.8, tl)), G.pump, G.pumpUp, k)
      nudge(tg, i, 'hand', 0.15 * Math.sin(TAU * 3.4 * tl + i))
    }
  },
  events: [
    ev(0.2, (fx, rng) => { sparkleRing(fx, rng, 6, 0.2, 0.14, 0.05); flowerBurst(fx, rng, 6, 3) }),
    ev(1.3, (fx, rng) => { sparkleRing(fx, rng, 5, 0.2, 0.14, 0.05); flowerBurst(fx, rng, 5, 3) }),
  ],
}

/* ---------------- 2 슬픔 ---------------- */

const sadEvents: FxEvent[] = []
for (let k = 0; k < 8; k++) {
  const t = 0.7 + 0.31 * k
  // 눈물은 볼 바깥쪽에서 나와 턱선까지만 흘러내린다 (몸 위로 쏟아지지 않게)
  sadEvents.push(ev(t, (fx, rng) => {
    tearDrop(fx, rng, Anchor.eyeL, R(rng, 0.008, 0.02), 0.034)
    tearDrop(fx, rng, Anchor.eyeR, R(rng, -0.02, -0.008), 0.034, 0.06)
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
    // 고개를 푹 떨구고 어깨가 앞으로 말린다
    tg.headPitch = -0.26 * e
    tg.headRoll = 0.1 * Math.sin(TAU * 0.4 * tl) * e
    tg.leanZ = 0.26 * e
    tg.leanX = 0.04 * Math.sin(TAU * 0.4 * tl) * e
    // 흐느낌: 어깨가 들썩
    const sob = ss(0.6, 1.0, tl) * (1 - ss(2.7, 3.1, tl))
    const sh = 0.22 + 0.14 * Math.max(0, Math.sin(TAU * 2.2 * tl)) * sob
    tg.shrugL = sh; tg.shrugR = sh
    // 힘이 풀려 무릎이 꺾인다
    tg.legs = 1
    tg.kneeL = tg.kneeR = 0.18 * e + 0.03 * Math.sin(TAU * 2.2 * tl) * sob
    tg.hipShift = 0.1 * Math.sin(TAU * 0.4 * tl)
    // 한 손씩 번갈아 눈가를 훔친다 (쉬는 손은 배 앞에 늘어뜨림 — 표정이 가려지지 않는다)
    const w = ss(0.25, 0.75, tl) * (1 - ss(2.8, 3.2, tl))
    const wipeL = ss(0.3, 0.7, 0.5 + 0.5 * Math.sin(TAU * 0.4 * (tl - 0.35)))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      const act = i === 0 ? wipeL : 1 - wipeL
      armSet(tg, i, w, G.clasp)
      armBlendTo(tg, i, G.eyes, act)
      const rub = Math.sin(TAU * 1.6 * tl + i * Math.PI) * ss(0.9, 1.3, tl) * act
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
  peak: 1.04,
  pull: 0.06,
  eval(tl, tg) {
    tg.legs = 1
    tg.angry = 1
    tg.mouthSmile = -0.9
    tg.mouthOpen = 0.12 + 0.12 * Math.max(0, Math.sin(TAU * 5 * tl))
    tg.blush = 0.55
    const tr = ss(0.08, 0.25, tl) * (1 - ss(2.1, 2.45, tl))
    // 앞으로 숙여 노려보고 부들부들 떤다 (머리·몸통이 같이)
    tg.headRoll = 0.1 * Math.sin(TAU * 13 * tl + 1) * tr
    tg.headYaw = 0.08 * Math.sin(TAU * 11 * tl) * tr
    tg.headPitch = -0.14 * tr
    tg.leanZ = 0.25 * tr
    tg.twist = 0.06 * Math.sin(TAU * 9 * tl + 2) * tr
    tg.shiftX = 0.01 * Math.sin(TAU * 17 * tl) * tr
    tg.shrugL = tg.shrugR = 0.4 * tr
    // 발 구르기 세 번 (오른발 → 왼발 → 오른발): 내려찍는 순간 몸이 푹 꺼진다
    stomp(tg, tl, 0.6, 1)
    stomp(tg, tl, 1.0, 0, 0.9)
    stomp(tg, tl, 1.45, 1, 1)
    // 주먹을 꽉 쥐고 가슴 앞으로 끌어올려 부들
    const w = ss(0.1, 0.3, tl) * (1 - ss(2.1, 2.45, tl))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      armSet(tg, i, w, G.fistChest)
      nudge(tg, i, 'lower', 0.02 * Math.sin(TAU * 16 * tl + i * 1.7) * tr, 0.08 * Math.sin(TAU * 16 * tl + i * 1.7) * tr)
      nudge(tg, i, 'upper', 0.05 * Math.sin(TAU * 14 * tl + i) * tr)
    }
  },
  events: [
    ev(0.2, (fx) => angerMark(fx, Anchor.head, 0.1, 0.1, 0.13, 2.1, 0.12)),
    ev(0.66, (fx) => dustPuffs(fx, Anchor.footR, 0.075)), // 발이 바닥에 닿은 뒤에 (앵커는 직전 프레임 포즈라 같은 프레임에 쏘면 들린 발 높이에서 나온다)
    ev(1.06, (fx) => dustPuffs(fx, Anchor.footL, 0.075)),
    ev(1.51, (fx) => dustPuffs(fx, Anchor.footR, 0.09)),
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
    tg.hipShift = 0.3 * sw * e
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
    ev(0.3, (fx, rng) => risingHearts(fx, rng, Anchor.head, 3, 0.045, 0.07, 0.15, 0.06, 0.7)),
    ev(0.85, (fx, rng) => risingHearts(fx, rng, Anchor.head, 2, 0.04, 0.065, 0.15, 0.06, 0.7)),
    ev(1.3, (fx, rng) => risingHearts(fx, rng, Anchor.head, 3, 0.045, 0.075, 0.15, 0.06, 0.7)),
    ev(1.8, (fx, rng) => { sparkleRing(fx, rng, 6); risingHearts(fx, rng, Anchor.head, 3, 0.045, 0.075, 0.15, 0.06, 0.7) }),
    ev(2.3, (fx, rng) => risingHearts(fx, rng, Anchor.head, 2, 0.04, 0.065, 0.15, 0.06, 0.7)),
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
    tg.hipShift = 0.2 * ss(0.1, 0.5, tl)
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
    tg.hipShift = 0.4 * sw * e
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
    tg.headRoll = 0.06 * Math.sin(TAU * 2.2 * tl) * e
    tg.headPitch = 0.14 * e
    // 푹 웅크렸다가 점프 (웅크릴 때 팔이 아래로 모였다가 번쩍 올라간다)
    hop(tg, tl, 0.3, 0.5, 0.09, 0.6)
    hop(tg, tl, 1.35, 0.5, 0.1, 0.6)
    hop(tg, tl, 2.3, 0.4, 0.06, 0.4)
    const up = Math.max(bell(0.12, 0.8, tl), bell(1.17, 1.85, tl), bell(2.15, 2.7, tl))
    // 웅크리는 순간(점프 직전) 팔이 아래로 모였다가 도약과 함께 번쩍 올라간다
    const dip = Math.max(bell(0.12, 0.32, tl), bell(1.17, 1.37, tl), bell(2.12, 2.32, tl))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      // 점프 순간엔 거의 수직으로 쭉, 사이에는 크게 벌린 만세를 유지
      armSetMix(tg, i, ss(0.05, 0.28, tl), G.cheerWide, G.cheer, up)
      armBlendTo(tg, i, G.down, 0.8 * dip)
      nudge(tg, i, 'hand', 0.12 * Math.sin(TAU * 4.4 * tl + i))
    }
  },
  events: [
    ev(0.3, (fx, rng) => {
      confettiBurst(fx, rng, Anchor.handL, 14, 1, 0.02, 0.05, UP - 0.5, 0.5)
      confettiBurst(fx, rng, Anchor.handR, 14, 1, -0.02, 0.05, UP + 0.5, 0.5)
      sparkleRing(fx, rng, 6)
    }),
    ev(1.35, (fx, rng) => {
      confettiBurst(fx, rng, Anchor.handL, 14, 1.1, 0.02, 0.05, UP - 0.6, 0.55)
      confettiBurst(fx, rng, Anchor.handR, 14, 1.1, -0.02, 0.05, UP + 0.6, 0.55)
      confettiBurst(fx, rng, Anchor.head, 12, 0.9, 0, 0.18, UP, 0.8)
    }),
    ev(2.3, (fx, rng) => {
      confettiBurst(fx, rng, Anchor.handL, 8, 0.9, 0.02, 0.05, UP - 0.5, 0.5)
      confettiBurst(fx, rng, Anchor.handR, 8, 0.9, -0.02, 0.05, UP + 0.5, 0.5)
      sparkleRing(fx, rng, 5)
    }),
  ],
}

/* ---------------- 9 꾸벅 인사 ---------------- */

/** 허리를 숙이는 각 (rad) — 보통 절 30~35°. 이보다 깊으면 정면(카메라)에서 후드 윗면만 보이고 얼굴이 가려진다 */
const BOW_ANGLE = 0.6
/** 고개가 허리보다 더 숙이는 각 (rad) — 조금만 준다. 많이 주면 후드 개구부가 아래로 돌아가 정면에서 얼굴이 사라진다 */
const BOW_HEAD = 0.06

const bowing: Spec = {
  id: 9,
  key: '9',
  name: '꾸벅 인사',
  dur: 2.6,
  peak: 1.3,
  pull: 0.04,
  eval(tl, tg) {
    tg.legs = 1
    // 두 손을 모은 뒤(0~0.5) 0.5초에 걸쳐 숙이고(0.5~1.0), 0.6초 머물렀다가(1.0~1.6) 0.55초에 걸쳐 일어선다(1.6~2.15). 오르내림은 ease-in-out
    const k = ss(0.5, 1.0, tl) * (1 - ss(1.6, 2.15, tl))
    // 인사와 사과에 같이 쓰도록 표정은 차분하게: 웃지 않고 입은 다물고, 숙인 동안 눈을 내리깐다 (홍조·반짝이 없음)
    tg.relaxed = 0.25
    tg.mouthSmile = 0.15
    tg.mouthOpen = 0
    tg.blush = 0
    tg.gazeX = 0
    tg.gazeY = -0.6 * k
    if (k > 0.02) tg.blink = 0.7 * k
    // 허리에서 접는 직선 숙임 — 척추는 굽히지 않고(leanZ 0) 고개만 조금 더 숙인다. 다리는 곧게, 발은 그 자리
    tg.bow = BOW_ANGLE * k
    tg.headPitch = -BOW_HEAD * k
    // 아랫배 앞에 두 손을 가지런히 모으고, 숙이는 동안 팔을 곧게 펴 손이 허벅지 앞으로 내려오게 한다
    const w = ss(0.02, 0.45, tl) * (1 - ss(2.15, 2.55, tl))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      armSet(tg, i, w, G.bowHands)
      armBlendTo(tg, i, G.bowHold, k)
    }
  },
  events: [],
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
  dur: 4.75,
  peak: 3.75,
  pull: 0.14,
  eval(tl, tg) {
    tg.legs = 1
    const e = ss(0.0, 0.3, tl) * (1 - ss(4.3, 4.7, tl))
    const bp = (TAU * tl) / B0
    tg.mouthSmile = 1
    tg.mouthOpen = 0.2
    tg.blush = 0.55
    // 구간 가중치
    const A = 1 - ss(1.1, 1.3, tl) // 0 ~ 1.2: 볼 손 + 좌우 스웨이 + 토탭
    const Bh = ss(1.1, 1.3, tl) * (1 - ss(2.1, 2.3, tl)) // 1.2 ~ 2.2: 하트 손 + 킥
    const Cc = ss(2.1, 2.3, tl) * (1 - ss(2.95, 3.1, tl)) // 2.2 ~ 3.0: 트월 + 비대칭 팔 (한 팔 위 · 한 손 허리)
    const Dd = ss(3.0, 3.2, tl) // 3.1 ~ : 엔딩 포즈 (정면을 보고 한 박 이상 멈춘다)
    const sw = Math.sin(TAU * tl / (B0 * 2))
    // 웃는 눈은 엔딩에서 걷고 윙크를 위해 한쪽 눈을 연다
    tg.happy = 0.5 * (1 - Dd) + 0.05 * Dd
    tg.relaxed = 0.4
    tg.winkL = tl > 3.15 ? ss(3.2, 3.3, tl) * (1 - ss(4.2, 4.3, tl)) : NaN
    // 좌우 스웨이 (전 구간 바탕)
    tg.hipShift = 0.6 * sw * (1 - Dd) * e
    tg.shiftX = 0.04 * sw * (1 - Cc) * (1 - Dd) * e
    tg.twist = 0.18 * Math.cos(TAU * tl / (B0 * 2)) * (1 - Dd) * e
    tg.headRoll = 0.14 * sw * (1 - Dd) * e + 0.18 * Dd * (1 - ss(3.3, 3.6, tl)) * e
    tg.headPitch = 0.06 * Math.cos(bp) * (1 - Dd) * e
    const dip = 0.5 + 0.5 * Math.cos(bp)
    tg.kneeL = tg.kneeR = (0.08 + 0.18 * dip) * (1 - Dd) * e + 0.1 * Dd
    // 토탭: 구간 A 에서 박마다 안쪽 발끝을 톡
    const tap = Math.pow(0.5 + 0.5 * Math.cos(bp * 0.5), 3)
    tg.liftL += 0.5 * tap * A * Math.max(0, sw) * e
    tg.liftR += 0.5 * tap * A * Math.max(0, -sw) * e
    // 토 탭: 1.3~1.75초 오른발, 1.7~2.15초 왼발을 앞·옆으로 살짝 내밀어 톡. 반대쪽 다리가 체중을 받는다 (골반이 그쪽으로 옮겨 간다)
    const kickR = bell(1.3, 1.75, tl)
    const kickL = bell(1.7, 2.15, tl)
    tg.kickR += 0.35 * kickR; tg.outR += 0.12 * kickR
    tg.kickL += 0.35 * kickL; tg.outL += 0.12 * kickL
    tg.hipShift += (0.4 * kickR - 0.4 * kickL) * e
    tg.leanX += (-0.06 * kickR + 0.06 * kickL) * e
    // 트월: 2.05~2.25초 웅크렸다가 점프하며 0.6초 동안 360° (도약 중 양발을 접는다)
    tg.kneeL += 0.4 * bell(2.0, 2.3, tl) * e; tg.kneeR += 0.4 * bell(2.0, 2.3, tl) * e
    hop(tg, tl, 2.25, 0.45, 0.06, 0.3)
    tg.spin = TAU * ss(2.25, 2.85, tl)
    // 엔딩: 왼발에 체중, 오른발 뒤로 들고 윙크 + V
    tg.liftR += 0.7 * Dd * e
    tg.hipShift += 0.5 * Dd * e
    // 팔
    const a = ss(0.05, 0.3, tl) * (1 - ss(4.35, 4.7, tl))
    for (let si = 0; si < 2; si++) {
      const i = SIDES[si]
      // A: 볼 손 → 살랑살랑
      armSet(tg, i, a, G.cheeks)
      nudge(tg, i, 'lower', 0.06 * Math.sin(TAU * tl / B0 + i * Math.PI) * A, 0.04 * Math.cos(TAU * tl / B0 + i) * A)
      // B: 하트 손
      armBlendTo(tg, i, G.heartChest, Bh)
      // C: 한 팔은 머리 위로 둥글게, 한 손은 허리 (돌 때 팔이 머리를 가리지 않게)
      armBlendTo(tg, i, i === 0 ? G.ballet : G.hip, Cc)
      // D: 왼팔 V 윙크, 오른팔 허리
      armBlendTo(tg, i, i === 0 ? G.peaceEye : G.hip, Dd)
    }
  },
  events: cuteEvents,
}

export const SPECS: readonly Spec[] = [joy, sad, angry, surprise, love, hello, shy, celebrate, bowing, cute]