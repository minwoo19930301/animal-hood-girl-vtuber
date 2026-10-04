/**
 * 리액션 엔진 — 숫자키 1~9, 0 으로 재생하는 결정적 타임라인 10종 (docs/REACTIONS.md).
 *
 * 파이프라인에서의 자리: tracking → aliveness → **reactions.compose** → model.apply.
 * 트래킹은 리액션 아래에서 계속 살아 있고, 엔벨로프가 0 으로 돌아가면 부드럽게 다시 넘겨받는다.
 *
 * - 리액션 하나 = Layer 하나 (타임라인 + 엔벨로프 가중치 w). 다른 키를 누르면 이전 레이어는 0.22초에 걸쳐 나가고 새 레이어가 0.15초에 걸쳐 들어온다 (교차).
 *   같은 키를 다시 누르면 새 레이어가 0 초부터 다시 시작한다. 레이어는 최대 3개이고, 오래된 것부터 차례로 겹쳐 쓴다.
 * - 얼굴 채널은 w 만큼 덮어쓰고, 표정 가중치는 max, 머리·몸통은 더하고, 다리는 목표 값으로 섞고, 팔은 목표 자세 쪽으로 방향을 섞는다.
 *   모델 머리 FX 플래그(하트·땀·분노)는 w 가 문턱을 넘은 가장 최근 레이어가 정한다.
 * - 같은 (트리거 순서, 시각) 이면 같은 결과다: 시간은 호출자가 넘기는 t 뿐이고 난수는 트리거마다 시드가 정해진 mulberry32 뿐이다.
 * - compose() 는 aliveness 가 새로 만든 프레임을 그 자리에서 고쳐 쓴다 (프레임당 할당 없음). frame.motion / frame.expr 는 엔진이 소유한
 *   영구 객체를 참조로 꽂는다 — 리액션이 없으면 프레임을 건드리지 않고 두 필드도 만들지 않는다.
 */
import * as THREE from 'three'
import { neutralExpr, neutralMotion, type ArmPose, type BodyMotion, type ExprOverride, type ModelAnchors, type RigFrame } from '../contract'
import { mulberry32 } from '../aliveness/rng'
import { Anchor, createFx, type Fx } from './fx'
import { SPECS } from './timelines'
import { createTarget, resetTarget, type ArmTarget, type Spec, type Target } from './types'
import { TAU, slerpInto, ss } from './util'

export type { Spec } from './types'

/** 레이어 하나의 현재 상태 (디버그·테스트용). 엔진이 compose 마다 제자리에서 채운다 (할당 없음) */
export interface LayerView {
  /** 재생 중인 리액션 번호(1..10), 비어 있으면 -1 */
  id: number
  /** 이 리액션을 트리거한 뒤 지난 시간(초) */
  tl: number
  /** 엔벨로프 가중치 0..1 (smoothstep) */
  w: number
  /** 교체·취소·종료로 나가는 중이면 true */
  leaving: boolean
}

/** 엔진이 모델에서 읽는 것 (MingoModel 의 부분집합 — 테스트에서 가짜로 바꿔 끼우기 쉽다) */
export interface ReactionModel {
  height: number
  anchors?: ModelAnchors
  anchorsOn?: boolean
}

export interface Reactions {
  /** id 1..10 재생 시작 (이미 재생 중이면 처음부터 다시, 다른 번호면 교차). t = 현재 시각(초) */
  trigger(id: number, t: number): void
  /** 재생 중인 리액션을 모두 접는다 (0.3초에 걸쳐 사라진다) */
  cancel(t: number): void
  /** aliveness 출력 위에 리액션을 합성한다. frame 을 그 자리에서 고쳐 쓰고 그대로 돌려준다 */
  compose(frame: RigFrame, dt: number, t: number): RigFrame
  /** 하트·꽃·색종이 등 FX 루트. 씬에 추가한다 (main.ts, harness.ts) */
  fxRoot: THREE.Group
  /** 레이어 3개의 상태 (직전 compose 기준) */
  layers: readonly LayerView[]
  /** 지금 재생 중인(교체·취소·종료로 나가는 중이 아닌) 리액션 번호, 없으면 null */
  active(): number | null
  /** 리액션이 아직 화면에 영향을 주고 있으면 true (나가는 중인 레이어와 떠 있는 FX 포함). 렌더 루프가 프레임 상한을 올리는 데 쓴다 */
  busy(): boolean
  /** 카메라를 뒤로 빼는 정도 0..0.25 (직전 compose 기준, 엔벨로프로 부드럽게). main.ts 가 프레이밍에 곱한다 */
  cameraPull(): number
  /** 모든 리액션 명세 (메뉴·하네스 시트용) */
  specs: readonly Spec[]
  dispose(): void
}

const IN_SEC = 0.15
const OUT_SEC = 0.35
const SWAP_OUT_SEC = 0.22
const CANCEL_SEC = 0.3
/**
 * 모델 머리 FX 플래그를 쓰는 문턱. 들어올 때는 0.35 부터 켜고, 나갈 때는 0.12 까지 유지한다.
 * 같은 문턱을 쓰면 나가는 길에 플래그만 먼저 꺼져서 표정은 남았는데 하트·땀이 먼저 사라진다.
 */
const FLAG_ON = 0.35
const FLAG_OFF = 0.12
const LAYERS = 3

interface Layer {
  spec: Spec | null
  t0: number
  /** 선형 엔벨로프 0..1 (가중치 w = smoothstep(raw)) */
  raw: number
  target: 0 | 1
  outSec: number
  /** 다음에 실행할 FX 이벤트 번호 */
  ev: number
  rng: () => number
  /** 시작 순서 (겹쳐 쓰는 순서) */
  seq: number
}

const mix = (a: number, b: number, w: number): number => a + (b - a) * w
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export function createReactions(model?: ReactionModel): Reactions {
  const fx: Fx = createFx()
  const layers: Layer[] = []
  for (let i = 0; i < LAYERS; i++) {
    layers.push({ spec: null, t0: 0, raw: 0, target: 0, outSec: OUT_SEC, ev: 0, rng: mulberry32(1), seq: 0 })
  }
  const order: Layer[] = layers.slice() // 겹쳐 쓰는 순서 (오래된 것 먼저), 프레임마다 제자리 정렬
  const views: LayerView[] = []
  for (let i = 0; i < LAYERS; i++) views.push({ id: -1, tl: 0, w: 0, leaving: false })
  const tg: Target = createTarget()
  const motion: BodyMotion = neutralMotion()
  const expr: ExprOverride = neutralExpr()
  let seq = 0
  let triggers = 0
  let pull = 0
  let wasBusy = false

  const byId = new Map<number, Spec>()
  for (const s of SPECS) byId.set(s.id, s)

  // 모델 앵커가 아직 없을 때(로드 전·테스트)의 기본값 — 키 단위, 발밑 0 · 머리 ≈0.88
  const setDefaultAnchors = (): void => {
    const A = fx.anchors
    const put = (id: number, x: number, y: number, z = 0): void => { A.x[id] = x; A.y[id] = y; A.z[id] = z }
    put(Anchor.body, 0, 0)
    put(Anchor.head, 0, 0.9)
    put(Anchor.eyeL, 0.02, 0.9, 0.05); put(Anchor.eyeR, -0.02, 0.9, 0.05)
    put(Anchor.handL, 0.16, 0.48); put(Anchor.handR, -0.16, 0.48)
    put(Anchor.footL, 0.05, 0.02); put(Anchor.footR, -0.05, 0.02)
  }
  setDefaultAnchors()

  /** 모델 앵커(월드)를 키 단위로 나눠 FX 앵커에 복사 + FX 루트를 키만큼 스케일 */
  const syncAnchors = (): void => {
    if (!model) return
    const H = Math.max(0.5, model.height)
    fx.root.scale.setScalar(H)
    const a = model.anchors
    if (!a || a.head.y < 0.05) return // 아직 한 번도 갱신되지 않음 → 기본값 유지
    const A = fx.anchors
    const put = (id: number, v: THREE.Vector3): void => { A.x[id] = v.x / H; A.y[id] = v.y / H; A.z[id] = v.z / H }
    put(Anchor.body, a.body); put(Anchor.head, a.head)
    put(Anchor.eyeL, a.eyeL); put(Anchor.eyeR, a.eyeR)
    put(Anchor.handL, a.handL); put(Anchor.handR, a.handR)
    put(Anchor.footL, a.footL); put(Anchor.footR, a.footR)
  }

  const blendArm = (a: ArmPose, g: ArmTarget, w: number, outward: number): void => {
    slerpInto(a.upperDir, a.upperDir, g.upper, w, outward)
    slerpInto(a.lowerDir, a.lowerDir, g.lower, w, outward)
    slerpInto(a.handDir, a.handDir, g.hand, w, outward)
    slerpInto(a.palmNormal, a.palmNormal, g.palm, w, outward)
    for (let k = 0; k < 5; k++) a.fingers[k] = mix(a.fingers[k], g.fingers[k], w)
    a.spread = mix(a.spread, g.spread, w)
    if (a.present < w) a.present = w
  }

  const sortOrder = (): void => {
    // 3개짜리 삽입 정렬 (seq 오름차순)
    for (let i = 1; i < order.length; i++) {
      const x = order[i]
      let j = i - 1
      while (j >= 0 && order[j].seq > x.seq) {
        order[j + 1] = order[j]
        j--
      }
      order[j + 1] = x
    }
  }

  const resetAcc = (): void => {
    motion.bounce = 0; motion.spin = 0; motion.shiftX = 0
    motion.liftL = 0; motion.liftR = 0; motion.kickL = 0; motion.kickR = 0; motion.outL = 0; motion.outR = 0
    motion.snap = 0
    expr.happy = 0; expr.sad = 0; expr.angry = 0; expr.surprised = 0; expr.relaxed = 0
  }

  return {
    fxRoot: fx.root,
    layers: views,
    specs: SPECS,

    trigger(id, t) {
      const spec = byId.get(Math.round(id))
      if (!spec) return
      // 지금 재생 중인 레이어는 모두 나가게 한다
      for (const L of layers) {
        if (L.spec && L.target === 1) {
          L.target = 0
          L.outSec = SWAP_OUT_SEC
        }
      }
      // 빈 슬롯, 없으면 가장 약한 레이어를 재사용
      let slot = layers[0]
      for (const L of layers) {
        if (!L.spec) {
          slot = L
          break
        }
        if (L.raw < slot.raw) slot = L
      }
      triggers++
      slot.spec = spec
      slot.t0 = t
      slot.raw = 0
      slot.target = 1
      slot.outSec = OUT_SEC
      slot.ev = 0
      slot.rng = mulberry32(spec.id * 7919 + triggers * 104729 + 12345)
      slot.seq = ++seq
      if (model) model.anchorsOn = true // 다음 apply 부터 앵커 갱신 (이벤트가 앵커를 읽는다)
    },

    cancel(t) {
      for (const L of layers) {
        if (L.spec && L.target === 1) {
          L.target = 0
          L.outSec = CANCEL_SEC
        }
      }
      fx.fadeAll(t, CANCEL_SEC)
    },

    compose(frame, dt, t) {
      fx.now = t
      let any = false
      sortOrder()
      resetAcc()
      let blush = frame.fx.blush ?? 0
      let pullNow = 0

      for (let li = 0; li < LAYERS; li++) {
        const L = order[li]
        const spec = L.spec
        const view = views[li]
        view.id = -1; view.w = 0
        if (!spec) continue
        const tl = t - L.t0
        if (L.target === 1 && tl >= spec.dur - OUT_SEC) {
          L.target = 0
          L.outSec = OUT_SEC
        }
        if (L.target === 1) L.raw = Math.min(1, L.raw + dt / IN_SEC)
        else L.raw = Math.max(0, L.raw - dt / L.outSec)
        if (L.target === 0 && L.raw <= 0) {
          L.spec = null
          continue
        }
        any = true
        const w = ss(0, 1, L.raw)
        view.id = spec.id; view.tl = tl; view.w = w; view.leaving = L.target === 0
        resetTarget(tg)
        spec.eval(tl, tg)
        pullNow = Math.max(pullNow, spec.pull * w)

        // ---- 얼굴: 덮어쓰기 (NaN 은 건드리지 않음) ----
        if (tg.blink === tg.blink) { frame.blinkL = mix(frame.blinkL, tg.blink, w); frame.blinkR = mix(frame.blinkR, tg.blink, w) }
        if (tg.gazeX === tg.gazeX) frame.gaze.x = mix(frame.gaze.x, tg.gazeX, w)
        if (tg.gazeY === tg.gazeY) frame.gaze.y = mix(frame.gaze.y, tg.gazeY, w)
        if (tg.mouthOpen === tg.mouthOpen) frame.mouthOpen = mix(frame.mouthOpen, tg.mouthOpen, w)
        if (tg.mouthSmile === tg.mouthSmile) frame.mouthSmile = mix(frame.mouthSmile, tg.mouthSmile, w)
        blush = mix(blush, tg.blush, w)

        // ---- 표정 가중치: max (모델이 트래킹 값과 다시 max) ----
        expr.happy = Math.max(expr.happy, tg.happy * w)
        expr.sad = Math.max(expr.sad, tg.sad * w)
        expr.angry = Math.max(expr.angry, tg.angry * w)
        expr.surprised = Math.max(expr.surprised, tg.surprised * w)
        expr.relaxed = Math.max(expr.relaxed, tg.relaxed * w)

        if (w >= (L.target === 1 ? FLAG_ON : FLAG_OFF)) {
          const f = frame.fx
          f.heart = tg.heart; f.sweat = tg.sweat; f.anger = tg.anger
        }

        // ---- 머리·몸통: 더하기 (트래킹이 계속 살아 있다) ----
        frame.head.pitch += tg.headPitch * w
        frame.head.yaw += tg.headYaw * w
        frame.head.roll += tg.headRoll * w
        frame.body.lean.x += tg.leanX * w
        frame.body.lean.z += tg.leanZ * w
        frame.body.twist += tg.twist * w
        frame.body.shrugL = clamp01(frame.body.shrugL + tg.shrugL * w)
        frame.body.shrugR = clamp01(frame.body.shrugR + tg.shrugR * w)

        // ---- 다리: 강제 + 목표 값으로 섞기 (웹캠이 상반신만 비춰도 춤은 다리를 쓴다) ----
        const lw = w * tg.legs
        if (lw > 1e-4) {
          const b = frame.body
          if (b.legsPresent < lw) b.legsPresent = lw
          b.kneeL = mix(b.kneeL, tg.kneeL, lw)
          b.kneeR = mix(b.kneeR, tg.kneeR, lw)
          b.hipShift = mix(b.hipShift, tg.hipShift, lw)
          if (b.present < lw) b.present = lw
        }

        // ---- 몸 움직임: 가중 합. 자전은 나가는 중에 가장 가까운 정수 바퀴로 풀려 돌아온다 (뒤로 감기는 각도가 최대 반 바퀴) ----
        motion.bounce += tg.bounce * w
        motion.shiftX += tg.shiftX * w
        motion.liftL += tg.liftL * w; motion.liftR += tg.liftR * w
        motion.kickL += tg.kickL * w; motion.kickR += tg.kickR * w
        motion.outL += tg.outL * w; motion.outR += tg.outR * w
        if (motion.snap < w) motion.snap = w
        if (L.target === 1) motion.spin += tg.spin
        else {
          const whole = TAU * Math.round(tg.spin / TAU)
          motion.spin += whole + (tg.spin - whole) * w
        }

        // ---- 팔 ----
        const aL = w * tg.armW[0]
        const aR = w * tg.armW[1]
        if (aL > 1e-4) blendArm(frame.armL, tg.arms[0], aL, 1)
        if (aR > 1e-4) blendArm(frame.armR, tg.arms[1], aR, -1)
      }

      pull = pullNow
      if (any) {
        frame.fx.blush = blush
        frame.motion = motion
        frame.expr = expr
      }
      // FX: 앵커를 모델 포즈에 맞추고 이벤트를 실행한 뒤 입자를 갱신한다
      syncAnchors()
      for (let li = 0; li < LAYERS; li++) {
        const L = order[li]
        const spec = L.spec
        if (!spec || L.target !== 1) continue
        const tl = t - L.t0
        const evs = spec.events
        while (L.ev < evs.length && evs[L.ev].t <= tl) {
          evs[L.ev].run(fx, L.rng)
          L.ev++
        }
      }
      fx.update(t)
      // 앵커 갱신은 비용이 있어 리액션이 도는 동안(떠 있는 FX 포함)만 켠다
      const busyNow = any || fx.alive() > 0
      if (model && busyNow !== wasBusy) model.anchorsOn = busyNow
      wasBusy = busyNow
      return frame
    },

    active() {
      let best: Layer | null = null
      for (let i = 0; i < LAYERS; i++) {
        const L = layers[i]
        if (L.spec && L.target === 1 && (!best || L.seq > best.seq)) best = L
      }
      return best && best.spec ? best.spec.id : null
    },

    busy() {
      if (fx.alive() > 0) return true
      for (let i = 0; i < LAYERS; i++) if (layers[i].spec) return true
      return false
    },

    cameraPull() {
      return pull
    },

    dispose() {
      fx.dispose()
    },
  }
}
