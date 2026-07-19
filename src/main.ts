import * as THREE from 'three'
import { createMingo } from './model/index'
import { createTracker } from './tracking/index'
import { createAliveness } from './aliveness/index'
import { neutralFrame, type CursorInfo } from './contract'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  premultipliedAlpha: true,
  powerPreference: 'low-power',
})
renderer.setClearColor(0x000000, 0) // 완전 투명 배경
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const scene = new THREE.Scene()

// 좁은 FOV(준직교) — 2D 일러처럼 읽히는 핵심 (리서치: 원근 왜곡 제거)
const camera = new THREE.PerspectiveCamera(17, 1, 0.1, 100)

const mingo = createMingo()
scene.add(mingo.root)

function frameCamera() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // 캐릭터 전체가 여백 6%로 프레임에 들어오도록 거리 계산
  const fitH = mingo.height * 1.06
  const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  camera.position.set(0, mingo.height * 0.52, dist)
  camera.lookAt(0, mingo.height * 0.52, 0)
  camera.updateProjectionMatrix()
}
frameCamera()
window.addEventListener('resize', frameCamera)

// ---------- 트래킹 + 생명감 ----------
const tracker = createTracker()
const aliveness = createAliveness()
let trackingUp = false

async function startCam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 30 },
      audio: false,
    })
    video.srcObject = stream
    await video.play()
    await tracker.start(video)
    trackingUp = true
    console.log('[mingo] tracking started')
  } catch (err) {
    console.warn('[mingo] camera/tracking unavailable — idle mode', err)
  }
}
startCam()

// ---------- 커서(전역) → 시선 + 히트테스트 + 드래그 ----------
let cursor: CursorInfo | null = null
let cursorInWindow = false
let cursorWin = { x: 0, y: 0 }

window.mingo?.onCursor((p) => {
  // 화면 기준 -1..1 정규화 (아바타 시선용)
  cursor = {
    nx: (p.sx / p.screenW) * 2 - 1,
    ny: (p.sy / p.screenH) * 2 - 1,
  }
  cursorInWindow = p.inWindow
  cursorWin = { x: p.wx, y: p.wy }
})

// 아바타 픽셀 위에서만 클릭 받기 (레이캐스트 히트테스트)
const raycaster = new THREE.Raycaster()
let clickThrough = true
function updateHitTest() {
  if (!window.mingo) return
  let hit = false
  if (cursorInWindow) {
    const ndc = new THREE.Vector2(
      (cursorWin.x / window.innerWidth) * 2 - 1,
      -(cursorWin.y / window.innerHeight) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, camera)
    hit = raycaster.intersectObjects(mingo.hitMeshes, true).length > 0
  }
  const wantThrough = !hit
  if (wantThrough !== clickThrough) {
    clickThrough = wantThrough
    window.mingo.setClickThrough(wantThrough)
  }
}

// 드래그로 위치 이동
let dragging = false
let lastDrag = { x: 0, y: 0 }
window.addEventListener('mousedown', (e) => {
  dragging = true
  lastDrag = { x: e.screenX, y: e.screenY }
})
window.addEventListener('mousemove', (e) => {
  if (!dragging) return
  window.mingo?.dragBy(e.screenX - lastDrag.x, e.screenY - lastDrag.y)
  lastDrag = { x: e.screenX, y: e.screenY }
})
window.addEventListener('mouseup', () => { dragging = false })

// ---------- 메인 루프 ----------
const clock = new THREE.Clock()
function loop() {
  requestAnimationFrame(loop)
  const dt = Math.min(clock.getDelta(), 0.1)
  const t = clock.elapsedTime

  const raw = trackingUp ? tracker.latest() : neutralFrame()
  const frame = aliveness.compose(raw, dt, t, cursor)
  mingo.apply(frame, dt, t)

  updateHitTest()
  renderer.render(scene, camera)
}
loop()
