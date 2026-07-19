/**
 * 룩덱(look-dev) 하네스 — 결정적 스크린샷 전용.
 * URL 파라미터로 포즈 지정, 애니메이션 없이 단일 렌더 후 title=READY.
 *
 * 예: harness.html?pitch=0.3&yaw=-0.2&blink=1&mouth=0.5&t=1.25&bg=1
 *   pitch/yaw/roll (rad), blink, blinkL, blinkR, mouth, smile,
 *   browL, browR, gazeX, gazeY,
 *   wingRaiseL/R, wingOutL/R, wingCurlL/R, wingSpreadL/R,
 *   heart/happy/sweat/anger (=1), breath, t (초; 2차모션 정착용 프리롤), bg (=1 라군 배경)
 *   cam: full(기본)|face  — face는 상반신 클로즈업
 */
import * as THREE from 'three'
import { createMingo } from './model/index'
import { neutralFrame } from './contract'
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

const w = window.innerWidth, h = window.innerHeight
renderer.setSize(w, h, false)
camera.aspect = w / h

const mode = q.get('cam') ?? 'full'
if (mode === 'face') {
  const fitH = mingo.height * 0.62
  const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  camera.position.set(0, mingo.height * 0.72, dist)
  camera.lookAt(0, mingo.height * 0.72, 0)
} else {
  const fitH = mingo.height * 1.06
  const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  camera.position.set(0, mingo.height * 0.52, dist)
  camera.lookAt(0, mingo.height * 0.52, 0)
}
camera.updateProjectionMatrix()

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
f.wingL.raise = num('wingRaiseL')
f.wingR.raise = num('wingRaiseR')
f.wingL.out = num('wingOutL')
f.wingR.out = num('wingOutR')
f.wingL.curl = num('wingCurlL', 0.35)
f.wingR.curl = num('wingCurlR', 0.35)
f.wingL.spread = num('wingSpreadL', 0.2)
f.wingR.spread = num('wingSpreadR', 0.2)
f.wingL.present = f.wingL.raise > 0 || f.wingL.out > 0 ? 1 : 0
f.wingR.present = f.wingR.raise > 0 || f.wingR.out > 0 ? 1 : 0
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
