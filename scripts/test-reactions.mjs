#!/usr/bin/env node
/**
 * 리액션 엔진 단위 검증 (브라우저·WebGL 없이): node scripts/test-reactions.mjs   (npm run test:reactions)
 *
 * Vite ssrLoadModule 로 TS 를 그대로 불러오고, 캔버스는 아무 일도 안 하는 가짜로 대신한다 (텍스처 그리기는 여기서 검증 대상이 아니다).
 * 확인하는 것:
 *  - 결정성 (같은 트리거·같은 시각 → 같은 프레임·FX), Math.random/Date.now 부재
 *  - 엔벨로프(시작·끝에서 베이스로 복귀), 교차(다른 키)·재시작(같은 키)의 연속성, 취소, 취소 중 자전이 가장 가까운 정수 바퀴로 풀림
 *  - 트래킹 통과 (덮어쓰지 않는 채널)
 *  - 10종 전부: 유한한 값, 범위, 끝나면 자전 0, compose 가 같은 프레임 객체를 돌려주고 motion/expr 영구 객체를 재사용
 *  - 춤(9, 0)은 다리를 쓴다: legsPresent ≥ 0.9, 무릎·발 들기·hipShift 가 실제로 움직임
 *  - 전신 리액션 전부 legsPresent 를 올리고, 취소·종료 뒤 FX 소멸·anchorsOn 해제
 *  - 프레임당 객체 할당 없음(워밍업 뒤 힙 증가량), shared/reactions.json ↔ 타임라인, electron 키 규약
 */
import { createServer } from 'vite'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import v8 from 'node:v8'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// 가짜 DOM 캔버스 — Proxy 가 모든 2D 컨텍스트 호출을 삼킨다
const ctxStub = new Proxy(function () {}, {
  get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : ctxStub),
  set: () => true,
  apply: () => ctxStub,
})
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }) }

const vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let failed = 0
const check = (name, ok, extra = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`)
}

try {
  const { createReactions } = await vite.ssrLoadModule('/src/reactions/index.ts')
  const { neutralFrame } = await vite.ssrLoadModule('/src/contract.ts')
  const DT = 1 / 60
  const TAU = Math.PI * 2

  /** 한 프레임 스냅샷 (비교용 평탄 배열) */
  const snap = (f) => {
    const a = [
      f.blinkL, f.blinkR, f.gaze.x, f.gaze.y, f.mouthOpen, f.mouthSmile, f.head.pitch, f.head.yaw, f.head.roll,
      f.body.lean.x, f.body.lean.z, f.body.twist, f.body.shrugL, f.body.shrugR, f.body.legsPresent, f.body.kneeL, f.body.kneeR, f.body.hipShift,
      f.fx.blush ?? 0,
    ]
    for (const arm of [f.armL, f.armR]) {
      a.push(arm.present, arm.upperDir.x, arm.upperDir.y, arm.upperDir.z, arm.lowerDir.x, arm.lowerDir.y, arm.lowerDir.z, arm.handDir.x, arm.handDir.y, arm.handDir.z, arm.palmNormal.x, arm.palmNormal.y, arm.palmNormal.z, ...arm.fingers, arm.spread)
    }
    const m = f.motion
    a.push(m ? m.bounce : 0, m ? m.spin : 0, m ? m.shiftX : 0, m ? m.liftL : 0, m ? m.liftR : 0, m ? m.kickL : 0, m ? m.kickR : 0, m ? m.outL : 0, m ? m.outR : 0, m ? m.snap : 0)
    const e = f.expr
    a.push(e ? e.happy : 0, e ? e.sad : 0, e ? e.angry : 0, e ? e.surprised : 0, e ? e.relaxed : 0)
    return a
  }
  const flags = (f) => [f.fx.happy, f.fx.heart, f.fx.sweat, f.fx.anger].map(Number).join('')
  const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0)
  const run = (rx, from, to, onFrame) => {
    let t = from
    let last = null
    while (t < to - 1e-9) {
      t += DT
      const f = rx.compose(neutralFrame(), DT, t)
      last = f
      if (onFrame) onFrame(f, t)
    }
    return last
  }
  const base = snap(neutralFrame())
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
  const visibleFx = (R) => R.fxRoot.children.filter((c) => c.visible).length

  const probe = createReactions()
  const SPECS = probe.specs
  probe.dispose()
  const IDS = SPECS.map((s) => s.id)

  // 0) 10종이 1..10 으로 다 있고 키가 1..9,0
  check('명세: 10종, id 1..10, 키 1..9·0 이 한 번씩', SPECS.length === 10 && IDS.join() === '1,2,3,4,5,6,7,8,9,10' && SPECS.map((s) => s.key).join('') === '1234567890')

  // 1) 결정성: 같은 트리거·같은 시각 → 같은 값 (프레임과 FX 스프라이트)
  for (const id of [9, 10, 8]) {
    const A = createReactions()
    const B = createReactions()
    A.trigger(id, 0); B.trigger(id, 0)
    const fa = run(A, 0, 1.6)
    const fb = run(B, 0, 1.6)
    const fxState = (R) => JSON.stringify(R.fxRoot.children.map((c) => [c.visible, c.position.x, c.position.y, c.scale.x, c.material.opacity]))
    check(`결정성 ${id}: 두 엔진의 같은 시각 프레임이 일치`, maxDiff(snap(fa), snap(fb)) === 0)
    check(`결정성 ${id}: 같은 시각 FX 스프라이트 상태가 일치`, fxState(A) === fxState(B) && visibleFx(A) > 0)
    A.dispose(); B.dispose()
  }

  // 1b) 코드에 Math.random / Date.now / performance.now 가 없다 (src/reactions/**)
  {
    const files = []
    const walk = (d) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|mjs|js)$/.test(n)) files.push(p)
      }
    }
    walk(join(root, 'src/reactions'))
    const bad = files.filter((p) => /Math\.random|Date\.now|performance\.now/.test(readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')))
    check('결정성: src/reactions/** 에 Math.random·Date.now·performance.now 없음', files.length >= 8 && bad.length === 0, bad.join(','))
  }

  // 2) 엔벨로프: 시작은 베이스, 끝나면 정확히 베이스로 복귀, active 는 끝나면 null, motion/expr 제거
  for (const id of IDS) {
    const spec = SPECS.find((s) => s.id === id)
    const R = createReactions()
    R.trigger(id, 0)
    const f0 = R.compose(neutralFrame(), 1e-6, 1e-6)
    check(`엔벨로프 ${id} ${spec.name}: 트리거 직후 프레임은 베이스와 거의 같다`, maxDiff(snap(f0), base) < 1e-3)
    run(R, 1e-6, 0.4)
    check(`엔벨로프 ${id} ${spec.name}: 재생 중 active() = ${id}`, R.active() === id)
    const end = run(R, 0.4, spec.dur + 0.2)
    const d = maxDiff(snap(end), base)
    check(`엔벨로프 ${id} ${spec.name}: 끝나면 모든 채널이 베이스로 복귀`, d < 1e-6 && flags(end) === '0000', `diff=${d}`)
    check(`엔벨로프 ${id} ${spec.name}: active() = null, motion·expr 미설정`, R.active() === null && end.motion === undefined && end.expr === undefined)
    run(R, spec.dur + 0.2, spec.dur + 3.5)
    check(`엔벨로프 ${id} ${spec.name}: FX 소멸, busy() = false`, R.busy() === false && visibleFx(R) === 0)
    R.dispose()
  }

  // 3) 교차: 9 → 3, 10 → 6, 1 → 4 (재생 중 다른 키) — 값이 연속이고 active 가 바뀐다
  {
    const dirs = (f) => [f.armL.upperDir, f.armL.lowerDir, f.armL.handDir, f.armL.palmNormal, f.armR.upperDir, f.armR.lowerDir, f.armR.handDir, f.armR.palmNormal].map((d) => [d.x, d.y, d.z])
    const scal = (f) => {
      const m = f.motion
      return [f.blinkL, f.mouthOpen, f.mouthSmile, f.head.pitch, f.head.roll, f.fx.blush ?? 0, f.body.kneeL, f.body.hipShift, f.body.legsPresent, m ? m.bounce : 0, m ? m.shiftX : 0, m ? m.liftL : 0, m ? m.liftR : 0, ...f.armL.fingers, f.armL.spread]
    }
    for (const [a, b, at] of [[9, 3, 1.0], [10, 6, 1.5], [1, 4, 1.0]]) {
      const R = createReactions()
      R.trigger(a, 0)
      run(R, 0, at)
      R.trigger(b, at)
      let prevS = null
      let prevD = null
      let worstS = 0
      let worstA = 0
      run(R, at, at + 0.6, (f) => {
        const s = scal(f)
        const d = dirs(f)
        if (prevS) {
          worstS = Math.max(worstS, maxDiff(s, prevS))
          for (let i = 0; i < d.length; i++) worstA = Math.max(worstA, ang(d[i], prevD[i]))
        }
        prevS = s
        prevD = d
      })
      check(`교차 ${a} → ${b}: active() = ${b}`, R.active() === b)
      check(`교차 ${a} → ${b}: 스칼라 채널 프레임 간 최대 변화 < 0.4 (미소 -1..1 이 0.15초에 오가는 정도)`, worstS < 0.4, `worst=${worstS.toFixed(3)}`)
      check(`교차 ${a} → ${b}: 팔 방향 프레임당 회전 < 0.6rad (휙 돌지 않는다)`, worstA < 0.6, `worst=${worstA.toFixed(3)}rad`)
      R.dispose()
    }
  }

  // 3b) 처음 들어올 때도 팔이 휙 돌지 않는다 (내린 팔 → 만세 같은 정반대 방향 보간)
  for (const id of [8, 1, 10]) {
    const R = createReactions()
    R.trigger(id, 0)
    let prev = null
    let worst = 0
    run(R, 0, 0.5, (f) => {
      const d = [f.armL.upperDir, f.armL.lowerDir, f.armR.upperDir, f.armR.lowerDir].map((v) => [v.x, v.y, v.z])
      if (prev) for (let i = 0; i < d.length; i++) worst = Math.max(worst, ang(d[i], prev[i]))
      prev = d
    })
    check(`입장 ${id}: 팔의 프레임당 회전 < 0.6rad`, worst < 0.6, `worst=${worst.toFixed(3)}rad`)
    R.dispose()
  }

  // 4) 같은 키 재시작: 타임라인이 0 초부터 다시 돌고 FX 이벤트가 다시 발생한다
  {
    const R = createReactions()
    R.trigger(5, 0)
    run(R, 0, 1.45)
    const before = visibleFx(R)
    R.trigger(5, 1.45)
    run(R, 1.45, 1.45 + 0.45)
    const after = visibleFx(R)
    check('재시작: 같은 키 active() 유지', R.active() === 5)
    check('재시작: 하트 이벤트가 처음부터 다시 발생 (보이는 FX 증가)', after > before, `${before} -> ${after}`)
    R.dispose()
  }

  // 5) 취소: 0.5초 안에 베이스 복귀, FX 도 사라진다. 도는 도중 취소해도 자전은 가장 가까운 정수 바퀴로 풀려 반 바퀴 넘게 되감기지 않는다
  {
    const R = createReactions()
    R.trigger(9, 0)
    run(R, 0, 0.9)
    R.cancel(0.9)
    const f = run(R, 0.9, 0.9 + 0.5)
    check('취소: 0.5초 뒤 베이스로 복귀', maxDiff(snap(f), base) < 1e-6, `diff=${maxDiff(snap(f), base)}`)
    check('취소: active() = null', R.active() === null)
    run(R, 1.4, 3.0)
    check('취소: FX 소멸', R.busy() === false && visibleFx(R) === 0)
    R.dispose()

    // 10번 트월 중간(2.55초, 자전 ≈ 1.4π)에 취소
    const C = createReactions()
    C.trigger(10, 0)
    run(C, 0, 2.55)
    let spinAtCancel = 0
    const cur = C.compose(neutralFrame(), DT, 2.55 + DT)
    spinAtCancel = cur.motion ? cur.motion.spin : 0
    C.cancel(2.55 + DT)
    let minSpin = spinAtCancel
    let maxSpin = spinAtCancel
    let t = 2.55 + DT
    let tail = null
    while (t < 2.55 + DT + 0.6) {
      t += DT
      const f = C.compose(neutralFrame(), DT, t)
      if (f.motion) { minSpin = Math.min(minSpin, f.motion.spin); maxSpin = Math.max(maxSpin, f.motion.spin) }
      tail = f
    }
    const nearest = TAU * Math.round(spinAtCancel / TAU)
    check('취소(트월 중): 자전이 가장 가까운 정수 바퀴 쪽으로만 움직인다 (반 바퀴 이내)', spinAtCancel > 1 && Math.abs(spinAtCancel - nearest) <= Math.PI + 1e-6 && Math.abs(minSpin - nearest) <= Math.PI + 1e-6 && Math.abs(maxSpin - nearest) <= Math.PI + 1e-6, `spin ${spinAtCancel.toFixed(2)} → ${nearest.toFixed(2)}`)
    check('취소(트월 중): 0.6초 뒤 베이스 복귀', tail.motion === undefined && maxDiff(snap(tail), base) < 1e-6)
    C.dispose()
  }

  // 6) 트래킹 통과: 덮어쓰지 않는 채널(머리 yaw·시선)은 인사 중 트래킹 값 그대로, 더하는 채널은 트래킹 값 + 리액션
  {
    const R = createReactions()
    R.trigger(6, 0)
    let ok = true
    let t = 0
    for (let i = 0; i < 150; i++) {
      t += DT
      const f = neutralFrame()
      f.head.yaw = 0.3
      f.gaze.x = 0.4
      f.armR.present = 1
      R.compose(f, DT, t)
      if (Math.abs(f.head.yaw - 0.3) > 1e-9 || Math.abs(f.gaze.x - 0.4) > 1e-9) ok = false
    }
    check('트래킹 통과: 인사 중에도 머리 yaw·시선 x 는 트래킹 값 그대로', ok)
    R.dispose()

    const S = createReactions()
    S.trigger(7, 0)
    t = 0
    let diffYaw = 0
    for (let i = 0; i < 90; i++) {
      t += DT
      const f = neutralFrame()
      f.head.yaw = 0.2
      S.compose(f, DT, t)
      diffYaw = f.head.yaw - 0.2
    }
    check('트래킹 통과: 더하는 채널(머리 yaw)은 트래킹 값 위에 리액션이 얹힌다 (부끄러움 -0.3rad)', Math.abs(diffYaw + 0.3) < 0.02, `diff=${diffYaw.toFixed(3)}`)
    S.dispose()

    // 다리: 웹캠이 상반신만 비춰도(legsPresent 0) 춤은 다리를 쓴다 — 트래킹이 무릎 0.9 를 내도 리액션이 목표값으로 섞는다
    const T = createReactions()
    T.trigger(9, 0)
    t = 0
    let lastKnee = -1
    for (let i = 0; i < 40; i++) {
      t += DT
      const f = neutralFrame()
      f.body.kneeL = 0.9
      T.compose(f, DT, t)
      lastKnee = f.body.kneeL
    }
    check('트래킹 통과: 춤 중 무릎은 트래킹 값이 아니라 리액션 목표로 섞인다 (0.9 → <0.7)', lastKnee < 0.7, `kneeL=${lastKnee.toFixed(2)}`)
    T.dispose()
  }

  // 7) 10종 전부: 유한한 값, 범위, 자전 복귀, compose 가 같은 프레임 객체를 돌려줌, motion·expr 영구 객체 재사용
  const stats = {}
  for (const id of IDS) {
    const R = createReactions()
    const spec = SPECS.find((s) => s.id === id)
    R.trigger(id, 0)
    let finite = true
    let inRange = true
    let sameObj = true
    let motionRef = null
    let exprRef = null
    let stable = true
    let endSpin = 0
    let maxSpin = 0
    let maxLegs = 0
    let maxFx = 0
    const mx = { kneeL: 0, kneeR: 0, liftL: 0, liftR: 0, kickL: 0, kickR: 0, hip: 0, shift: 0, bounce: 0 }
    let legsAtMid = 0
    let t = 0
    const end = spec.dur + 0.6
    while (t < end) {
      t += DT
      const f0 = neutralFrame()
      const f = R.compose(f0, DT, t)
      if (f !== f0) sameObj = false
      const s = snap(f)
      if (!s.every(Number.isFinite)) finite = false
      maxLegs = Math.max(maxLegs, f.body.legsPresent)
      maxFx = Math.max(maxFx, visibleFx(R))
      mx.kneeL = Math.max(mx.kneeL, f.body.kneeL); mx.kneeR = Math.max(mx.kneeR, f.body.kneeR)
      mx.hip = Math.max(mx.hip, Math.abs(f.body.hipShift))
      if (t > 0.6 && t < spec.dur - 0.6) legsAtMid = Math.max(legsAtMid, f.body.legsPresent)
      const m = f.motion
      const e = f.expr
      if (m) {
        mx.liftL = Math.max(mx.liftL, m.liftL); mx.liftR = Math.max(mx.liftR, m.liftR)
        mx.kickL = Math.max(mx.kickL, m.kickL); mx.kickR = Math.max(mx.kickR, m.kickR)
        mx.shift = Math.max(mx.shift, Math.abs(m.shiftX)); mx.bounce = Math.max(mx.bounce, m.bounce)
        if (m.bounce < -1e-9 || m.bounce > 0.2) inRange = false
        if (Math.abs(m.shiftX) > 0.2) inRange = false
        if (m.liftL < -1e-9 || m.liftL > 1.5 || m.liftR < -1e-9 || m.liftR > 1.5 || m.kickL < -1e-9 || m.kickL > 1.5 || m.kickR < -1e-9 || m.kickR > 1.5) inRange = false
        if (Math.abs(m.outL) > 1 || Math.abs(m.outR) > 1) inRange = false
        if (m.snap < 0 || m.snap > 1 + 1e-9) inRange = false
        if (!motionRef) motionRef = m
        else if (motionRef !== m) stable = false
        endSpin = m.spin
        maxSpin = Math.max(maxSpin, Math.abs(m.spin))
      }
      if (e) {
        if (![e.happy, e.sad, e.angry, e.surprised, e.relaxed].every((v) => v >= -1e-9 && v <= 1 + 1e-9)) inRange = false
        if (!exprRef) exprRef = e
        else if (exprRef !== e) stable = false
      }
      const b = f.fx.blush ?? 0
      if (b < -1e-9 || b > 1 + 1e-9) inRange = false
      if (f.body.kneeL < -1e-9 || f.body.kneeL > 1 + 1e-9 || f.body.kneeR < -1e-9 || f.body.kneeR > 1 + 1e-9 || Math.abs(f.body.hipShift) > 1 + 1e-9 || f.body.legsPresent > 1 + 1e-9) inRange = false
    }
    stats[id] = { ...mx, maxSpin, maxLegs, legsAtMid, maxFx }
    const label = `${id} ${spec.name}`
    check(`${label}: 값이 모두 유한`, finite)
    check(`${label}: 몸 움직임·표정·무릎 범위 (바닥 아래로 안 내려감, 한도 안)`, inRange)
    check(`${label}: compose 가 입력 프레임을 그대로 돌려줌, motion·expr 객체 재사용`, sameObj && stable && motionRef !== null && exprRef !== null)
    check(`${label}: 끝나면 자전이 정수 바퀴`, Math.abs(endSpin - TAU * Math.round(endSpin / TAU)) < 1e-6, `endSpin=${endSpin.toFixed(3)}`)
    check(`${label}: 다리를 쓴다 (재생 중 legsPresent ≥ 0.9)`, legsAtMid >= 0.9, `legs=${legsAtMid.toFixed(2)}`)
    check(`${label}: FX 풀이 넘치지 않는다 (동시 스프라이트 < 128)`, maxFx < 128, `max=${maxFx}`)
    R.dispose()
  }

  // 7b) 춤은 하체가 실제로 움직인다 (무릎·발 들기·hipShift·좌우 이동), 트월은 한 바퀴
  for (const id of [9, 10]) {
    const s = stats[id]
    const name = SPECS.find((x) => x.id === id).name
    check(`${id} ${name}: 무릎이 굽는다 (kneeL·kneeR 최대 > 0.25)`, s.kneeL > 0.25 && s.kneeR > 0.25, `L=${s.kneeL.toFixed(2)} R=${s.kneeR.toFixed(2)}`)
    check(`${id} ${name}: 발이 들린다 (liftL·liftR 또는 kick 최대 > 0.3)`, Math.max(s.liftL, s.kickL) > 0.3 && Math.max(s.liftR, s.kickR) > 0.3, `liftL=${s.liftL.toFixed(2)} liftR=${s.liftR.toFixed(2)} kickL=${s.kickL.toFixed(2)} kickR=${s.kickR.toFixed(2)}`)
    check(`${id} ${name}: 골반 체중 이동 (|hipShift| 최대 > 0.4)`, s.hip > 0.4, `hip=${s.hip.toFixed(2)}`)
  }
  check('9 신나는 춤: 좌우 이동 (shiftX 최대 ≥ 0.04)', stats[9].shift >= 0.04, `shift=${stats[9].shift.toFixed(3)}`)
  check('9 신나는 춤: 박마다 통통 (bounce 최대 > 0.03)', stats[9].bounce > 0.03, `bounce=${stats[9].bounce.toFixed(3)}`)
  // 번갈아 스텝: 체중이 왼쪽(hipShift>0)일 때 오른발이, 오른쪽일 때 왼발이 들린다 (한 발은 항상 바닥)
  {
    const R = createReactions()
    R.trigger(9, 0)
    let okL = 0, okR = 0, nL = 0, nR = 0, both = 0
    run(R, 0, 3.6, (f, t) => {
      if (t < 0.4 || t > 3.4) return
      const m = f.motion
      if (f.body.hipShift > 0.6) { nL++; if (m.liftR > 0.35 && m.liftL < 0.2) okL++ }
      if (f.body.hipShift < -0.6) { nR++; if (m.liftL > 0.35 && m.liftR < 0.2) okR++ }
      if (m.liftL > 0.5 && m.liftR > 0.5) both++
    })
    check('9 신나는 춤: 번갈아 스텝 (체중 반대쪽 발이 들림)', nL > 30 && nR > 30 && okL / nL > 0.8 && okR / nR > 0.8 && both === 0, `L ${okL}/${nL} R ${okR}/${nR} 양발동시=${both}`)
    R.dispose()
  }
  check('0 귀여운 춤: 360° 트월 (자전 최대 ≥ 2π)', stats[10].maxSpin >= TAU - 1e-3, `spin=${stats[10].maxSpin.toFixed(2)}`)
  check('8 축하·1 기쁨: 도약 (bounce 최대 > 0.04)', stats[8].bounce > 0.04 && stats[1].bounce > 0.02, `8=${stats[8].bounce.toFixed(3)} 1=${stats[1].bounce.toFixed(3)}`)
  check('3 화남: 발 구르기 (liftL·liftR 최대 > 0.5)', stats[3].liftL > 0.5 && stats[3].liftR > 0.5)

  // 8) 앵커: 가짜 모델 — 트리거가 anchorsOn 을 켜고, 끝나면 끈다. 입자는 모델 앵커(월드)를 키로 나눠 따라간다
  {
    const { Anchor } = await vite.ssrLoadModule('/src/reactions/fx.ts')
    const THREE = await vite.ssrLoadModule('three')
    const anchors = { body: new THREE.Vector3(), head: new THREE.Vector3(0, 1.4, 0), eyeL: new THREE.Vector3(0.03, 1.4, 0.1), eyeR: new THREE.Vector3(-0.03, 1.4, 0.1), handL: new THREE.Vector3(0.3, 0.8, 0), handR: new THREE.Vector3(-0.3, 0.8, 0), footL: new THREE.Vector3(0.1, 0, 0), footR: new THREE.Vector3(-0.1, 0, 0) }
    const model = { height: 1.6, anchors, anchorsOn: false }
    const R = createReactions(model)
    check('앵커: 시작 전 anchorsOn = false', model.anchorsOn === false)
    R.trigger(10, 0)
    check('앵커: 트리거하면 anchorsOn = true', model.anchorsOn === true)
    run(R, 0, 0.5)
    check('앵커: FX 루트가 키만큼 스케일', Math.abs(R.fxRoot.scale.x - 1.6) < 1e-9)
    // 머리 위 반짝이가 머리 앵커(1.4/1.6 = 0.875) 근처에 태어난다
    const ys = R.fxRoot.children.filter((c) => c.visible).map((c) => c.position.y)
    check('앵커: 머리 FX 가 머리 앵커(키 단위 0.875) 근처', ys.length > 0 && ys.every((y) => y > 0.6 && y < 1.6), `ys=${ys.map((y) => y.toFixed(2)).join(',')}`)
    run(R, 0.5, 4.4 + 4)
    check('앵커: 끝나고 FX 가 사라지면 anchorsOn = false', model.anchorsOn === false && R.busy() === false)
    R.dispose()
    // 눈물은 눈 앵커 높이에서 시작
    const S = createReactions(model)
    S.trigger(2, 0)
    run(S, 0, 1.0)
    const tears = S.fxRoot.children.filter((c) => c.visible && c.position.y > 0.7 && c.position.y < 1.0)
    check('앵커: 눈물 FX 가 눈 앵커 높이(0.875) 근처에 있다', tears.length > 0, `n=${tears.length}`)
    void Anchor
    S.dispose()
  }

  // 9) 프레임당 객체 할당 없음: 충분히 워밍업(JIT)한 뒤 힙 증가량을 잰다 (GC 를 막고).
  //    JS 가 비인라인 호출 사이로 넘기는 실수를 박싱(HeapNumber 16 B)해서 이 엔진도 프레임당 수백 B(≈800)는 나온다.
  //    한도는 2 KB — 프레임마다 Vector3·배열·클로저를 만들면(활성 스프라이트 수십 개 × 수십 B 만 돼도) 넘는다.
  {
    v8.setFlagsFromString('--expose-gc')
    const gc = vm.runInNewContext('gc')
    const R = createReactions({ height: 1.6, anchors: undefined, anchorsOn: false })
    const f = neutralFrame()
    let t = 0
    const cycle = (n) => {
      for (let k = 0; k < n; k++) {
        R.trigger(IDS[k % IDS.length], t)
        for (let i = 0; i < 400; i++) { t += DT; R.compose(f, DT, t) }
      }
    }
    cycle(50) // 20000 프레임 워밍업 (JIT·텍스처·풀)
    gc()
    const before = process.memoryUsage().heapUsed
    cycle(50)
    const after = process.memoryUsage().heapUsed
    const perFrame = (after - before) / 20000
    check('할당: compose 가 프레임당 객체를 만들지 않는다 (< 2 KB/프레임, 실수 박싱 포함)', perFrame < 2048, `${perFrame.toFixed(0)} B/프레임`)
    R.dispose()
  }

  // 10) shared/reactions.json ↔ 타임라인, electron 키 규약 (전역 단축키·메뉴 accelerator)
  {
    const cat = JSON.parse(readFileSync(join(root, 'shared/reactions.json'), 'utf8'))
    const same = cat.length === SPECS.length && cat.every((c, i) => c.id === SPECS[i].id && c.key === SPECS[i].key && c.name === SPECS[i].name)
    check('shared/reactions.json 이 타임라인(id·키·이름)과 일치', same)
    const avatars = JSON.parse(readFileSync(join(root, 'shared/avatar-catalog.json'), 'utf8'))
    const keys = await import(join(root, 'electron/keys.mjs'))
    const rxAcc = cat.map((c) => keys.reactionAccelerator(c))
    const avAcc = avatars.map((a) => keys.avatarAccelerator(a.key))
    check('전역 리액션 단축키: Ctrl+Alt+숫자 10개, 중복 없음', rxAcc.length === 10 && new Set(rxAcc).size === 10 && rxAcc.every((a) => /^Ctrl\+Alt\+[0-9]$/.test(a)), rxAcc.join(' '))
    check('전역 취소 단축키는 숫자가 아니다 (0 이 리액션)', !/[0-9]$/.test(keys.REACTION_CANCEL_ACCELERATOR) && !rxAcc.includes(keys.REACTION_CANCEL_ACCELERATOR), keys.REACTION_CANCEL_ACCELERATOR)
    check('캐릭터 메뉴 accelerator: 모두 Cmd+카탈로그 키, 중복 없음 (맨 숫자는 리액션 몫)', avAcc.length === avatars.length && new Set(avAcc).size === avAcc.length && avAcc.every((a) => /^Cmd\+[0-9\-=`\[]$/.test(a)), avAcc.join(' '))
    check('명령 문자열: reaction-<id> / reaction-cancel', keys.reactionCommand(cat[9]) === 'reaction-10' && keys.REACTION_CANCEL_COMMAND === 'reaction-cancel')
  }
} finally {
  await vite.close()
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
