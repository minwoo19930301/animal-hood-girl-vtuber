/**
 * 룩덱(look-dev) 하네스 — 결정적 스크린샷 전용.
 * URL 파라미터로 포즈 지정, 애니메이션 없이 단일 렌더 후 title=READY.
 *
 * 예: harness.html?pitch=0.3&yaw=-0.2&blink=1&mouth=0.5&t=1.25&bg=1
 *   pitch/yaw/roll (rad), blink, blinkL, blinkR, mouth, smile,
 *   browL, browR, gazeX, gazeY,
 *   heart/happy/sweat/anger (=1), breath, t (초; 2차모션 정착용 프리롤), bg (=1 라군 배경)
 *   cam: full(기본)|face  — face는 상반신 클로즈업
 *   orbit (rad): 모델 중심 y축 둘레 카메라 궤도 — 측면 검증용 (예: orbit=1.2)
 *   armL/armR=up 지정 시 풀샷 프레이밍이 자동으로 넓어져 올린 손이 잘리지 않는다
 *
 * 계약 v2 (ArmPose/BodyPose — BRIEF-fullbody.md "하네스"):
 *   armL/armR = fwd|side|up|down  팔 프리셋 (neutralArm 변형; 지정 시 present=1)
 *   elbowL/elbowR = 0..1          팔꿈치 굽힘 오버라이드 (0.9 ≈ 직각)
 *   palmL/palmR = front|down|in   손바닥 방향 (handDir는 법선과 직교하게 재정렬)
 *   fingersL/fingersR = 1,0,0,0,1 손가락 개별 curl 콤마 5값 [엄지,검지,중지,약지,새끼]
 *   spreadL/spreadR = 0..1        손가락 벌림
 *   shrug= lean= leanZ= twist= hipShift= knee=   BodyPose 채널
 *   legsPresent (지정 시 1; knee 지정만으로도 켜짐)
 */
import * as THREE from 'three'
import { createMingo } from './model/index'
import { neutralFrame, neutralArm, type ArmPose, type Dir3 } from './contract'
import { PALETTE } from './palette'

const q = new URLSearchParams(location.search)
const num = (k: string, d = 0) => (q.has(k) ? parseFloat(q.get(k)!) : d)
const flag = (k: string) => q.get(k) === '1'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
const bg = flag('bg')
renderer.setClearColor(bg ? PALETTE.lagoonBG : 0x000000, bg ? 1 : 0)
renderer.setPixelRatio(1)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(17, 1, 0.1, 100)

const mingo = createMingo()
scene.add(mingo.root)
if (mingo.ready) await mingo.ready // VRM 등 비동기 로드 대기 (모듈 TLA)

const w = window.innerWidth, h = window.innerHeight
renderer.setSize(w, h, false)
camera.aspect = w / h

const mode = q.get('cam') ?? 'full'
// 만세(armL/armR=up)는 손이 정수리 위로 나가므로 풀샷 프레이밍에 여유를 준다
const armUp = q.get('armL') === 'up' || q.get('armR') === 'up'
let fitH: number, lookY: number
if (mode === 'face') {
  fitH = mingo.height * 0.62
  lookY = mingo.height * 0.72
} else {
  fitH = mingo.height * (armUp ? 1.30 : 1.06)
  lookY = mingo.height * (armUp ? 0.60 : 0.52)
}
const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
// orbit=<rad>: 모델 중심 y축 둘레 카메라 궤도 (+ = 카메라가 캐릭터 왼쪽으로 돎 → 측면 검증)
const orbit = num('orbit')
camera.position.set(Math.sin(orbit) * dist, lookY, Math.cos(orbit) * dist)
camera.lookAt(0, lookY, 0)
camera.updateProjectionMatrix()

/* ============ ArmPose 프리셋 (neutralArm 변형 — 계약 v2 방향벡터) ============ */

/** elbow=1 굽힘각 (rad) — elbow=0.9 ≈ 90° (BRIEF 검증샷 "팔꿈치 직각") */
const ELBOW_MAX = 1.745

const norm = (v: Dir3): Dir3 => {
  const L = Math.hypot(v.x, v.y, v.z)
  return L < 1e-8 ? { x: 0, y: -1, z: 0 } : { x: v.x / L, y: v.y / L, z: v.z / L }
}
const dot = (a: Dir3, b: Dir3) => a.x * b.x + a.y * b.y + a.z * b.z
/** b에서 a 성분 제거 (직교화) */
const rej = (b: Dir3, a: Dir3): Dir3 => {
  const d = dot(b, a)
  return { x: b.x - d * a.x, y: b.y - d * a.y, z: b.z - d * a.z }
}

/**
 * 프리셋 → { 상완 방향, 팔꿈치 굽힘 목표 방향(하완이 굽으며 향하는 쪽), 기본 손바닥 법선 }.
 * 캐릭터 공간: x=캐릭터 왼쪽+, y=위+, z=앞(카메라)+. side: 캐릭터왼팔 +1 / 오른팔 -1.
 */
function presetOf(name: string, side: 1 | -1): { u: Dir3; bend: Dir3; palm: Dir3 } | null {
  switch (name) {
    case 'fwd':  return { u: { x: 0, y: 0, z: 1 },    bend: { x: 0, y: 1, z: 0 }, palm: { x: 0, y: -1, z: 0 } }
    case 'side': return { u: { x: side, y: 0, z: 0 }, bend: { x: 0, y: 0, z: 1 }, palm: { x: 0, y: -1, z: 0 } }
    case 'up':   return { u: { x: 0, y: 1, z: 0 },    bend: { x: 0, y: 0, z: 1 }, palm: { x: 0, y: 0, z: 1 } }
    case 'down': {
      const n = neutralArm(side)
      return { u: n.upperDir, bend: { x: 0, y: 0, z: 1 }, palm: n.palmNormal }
    }
    default: return null
  }
}

function palmOf(name: string, side: 1 | -1): Dir3 | null {
  switch (name) {
    case 'front': return { x: 0, y: 0, z: 1 }
    case 'down':  return { x: 0, y: -1, z: 0 }
    case 'in':    return { x: -side, y: 0, z: 0 } // 손바닥이 몸통 쪽
    default: return null
  }
}

/** URL 파라미터 한 팔 분량 → ArmPose (아무 파라미터도 없으면 null = idle 유지) */
function buildArm(side: 1 | -1, sfx: 'L' | 'R'): ArmPose | null {
  const presetName = q.get(`arm${sfx}`)
  const palmName = q.get(`palm${sfx}`)
  const fingersStr = q.get(`fingers${sfx}`)
  const hasElbow = q.has(`elbow${sfx}`)
  const hasSpread = q.has(`spread${sfx}`)
  if (!presetName && !palmName && !fingersStr && !hasElbow && !hasSpread) return null

  const a = neutralArm(side)
  a.present = 1
  const p = presetOf(presetName ?? 'down', side) ?? presetOf('down', side)!

  a.upperDir = norm(p.u)
  if (presetName || hasElbow) {
    // 곧은 팔에서 시작해 팔꿈치를 굽힘 평면(bend) 쪽으로 접는다
    const theta = Math.max(0, Math.min(1, num(`elbow${sfx}`))) * ELBOW_MAX
    const perp = norm(rej(p.bend, a.upperDir))
    const c = Math.cos(theta), s = Math.sin(theta)
    a.lowerDir = norm({
      x: a.upperDir.x * c + perp.x * s,
      y: a.upperDir.y * c + perp.y * s,
      z: a.upperDir.z * c + perp.z * s,
    })
    a.handDir = { ...a.lowerDir }
    a.palmNormal = norm(rej(p.palm, a.handDir))
  }

  const palm = palmName ? palmOf(palmName, side) : null
  if (palm) {
    a.palmNormal = palm
    // handDir는 손바닥 법선과 직교해야 기저가 성립 — 법선 성분 제거 후 재정규화
    const hd = rej(a.handDir, palm)
    if (Math.hypot(hd.x, hd.y, hd.z) > 0.15) a.handDir = norm(hd)
    // 퇴화 폴백(팔축∥법선, 예: armL=fwd&palmL=front): 손끝을 위쪽 우선으로 세워
    // "정지 손바닥" 제스처로 솔브 — 아래로 처지면 손등이 카메라를 향해 읽힘
    else a.handDir = norm(rej({ x: side * 0.2, y: 0.6, z: 0.5 }, palm))
  }

  if (fingersStr) {
    const v = fingersStr.split(',').map((s) => parseFloat(s))
    for (let i = 0; i < 5; i++) {
      const x = v[i]
      a.fingers[i] = Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : a.fingers[i]
    }
  }
  if (hasSpread) a.spread = Math.max(0, Math.min(1, num(`spread${sfx}`)))
  return a
}

// 프레임 구성
const f = neutralFrame()
f.tracked = 1
f.head.pitch = num('pitch')
f.head.yaw = num('yaw')
f.head.roll = num('roll')
f.blinkL = num('blinkL', num('blink'))
f.blinkR = num('blinkR', num('blink'))
f.browL = num('browL')
f.browR = num('browR')
f.mouthOpen = num('mouth')
f.mouthSmile = num('smile', 0.15)
f.gaze.x = num('gazeX')
f.gaze.y = num('gazeY')

// ---- 팔 (계약 v2: 방향벡터 ArmPose — 파라미터 없으면 neutralArm/present=0 유지) ----
const armL = buildArm(1, 'L')
const armR = buildArm(-1, 'R')
if (armL) f.armL = armL
if (armR) f.armR = armR

// ---- 몸통/다리 (BodyPose) ----
f.body.shrugL = f.body.shrugR = Math.max(0, Math.min(1, num('shrug')))
f.body.lean.x = num('lean')
f.body.lean.z = num('leanZ')
f.body.twist = num('twist')
f.body.hipShift = Math.max(-1, Math.min(1, num('hipShift')))
f.body.kneeL = f.body.kneeR = Math.max(0, Math.min(1, num('knee')))
f.body.legsPresent = q.has('legsPresent') || q.has('knee') ? 1 : 0
f.body.present =
  q.has('shrug') || q.has('lean') || q.has('leanZ') || q.has('twist') ||
  q.has('hipShift') || q.has('knee') || q.has('legsPresent') ? 1 : 0

f.fx.heart = flag('heart')
f.fx.happy = flag('happy')
f.fx.sweat = flag('sweat')
f.fx.anger = flag('anger')
f.breath = num('breath')

// 2차 모션(스프링) 정착 프리롤: 고정 스텝으로 결정적 시뮬레이션
const t = num('t', 1.0)
const STEP = 1 / 60
let sim = 0
while (sim < t) {
  mingo.apply(f, STEP, sim)
  sim += STEP
}
renderer.render(scene, camera)
document.title = 'READY'
