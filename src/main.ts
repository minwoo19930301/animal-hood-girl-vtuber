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
// VRM 등 비동기 모델은 로드 완료 후 실측 높이로 재프레이밍
mingo.ready?.then(frameCamera)

// ---------- 트래킹 + 생명감 ----------
const tracker = createTracker()
const aliveness = createAliveness()
let trackingUp = false
let camStream: MediaStream | null = null
let camBusy = false
let camWanted = true // visibilitychange로 토글 — await 도중 hide되면 startCam이 스스로 정리

async function startCam() {
  if (camBusy || trackingUp) return
  camBusy = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 30 },
      audio: false,
    })
    if (!camWanted) {
      for (const tr of stream.getTracks()) tr.stop()
      return
    }
    camStream = stream
    video.srcObject = stream
    await video.play()
    await tracker.start(video)
    if (!camWanted) {
      stopCam()
      return
    }
    trackingUp = true
    console.log('[mingo] tracking started')
  } catch (err) {
    console.warn('[mingo] camera/tracking unavailable — idle mode', err)
  } finally {
    camBusy = false
  }
}

/** 트래커 + 카메라 완전 정지 (카메라 LED off) */
function stopCam() {
  trackingUp = false
  tracker.stop()
  if (camStream) {
    for (const tr of camStream.getTracks()) tr.stop()
    camStream = null
  }
  video.srcObject = null
}
startCam()

// ---------- 커서(전역) → 시선 + 히트테스트 + 드래그 ----------
let cursor: CursorInfo | null = null
let cursorInWindow = false
let cursorWin = { x: 0, y: 0 }

const clampUnit = (v: number) => Math.max(-1, Math.min(1, v))

window.mingo?.onCursor((p) => {
  // 계약(contract.ts CursorInfo): "아바타 기준" -1..1 — 윈도 중심에서 커서까지의
  // 오프셋을 화면 반폭/반높이로 감쇠 정규화 (화면 절대 좌표 기준이 아님).
  const dx = p.wx - p.winW / 2
  const dy = p.wy - p.winH / 2
  cursor = {
    nx: clampUnit(dx / (p.screenW / 2)),
    ny: clampUnit(dy / (p.screenH / 2)),
  }
  cursorInWindow = p.inWindow
  cursorWin = { x: p.wx, y: p.wy }
  // 히트테스트는 커서 데이터가 갱신될 때만 (≤30Hz), 위치 불변이면 skip
  if (p.wx !== lastHitWx || p.wy !== lastHitWy) {
    lastHitWx = p.wx
    lastHitWy = p.wy
    updateHitTest()
  }
})

// 아바타 픽셀 위에서만 클릭 받기 (레이캐스트 히트테스트)
// onCursor 콜백에서만 실행 (≤30Hz + 위치 불변 시 skip) — rAF 레이트 재계산 방지
const raycaster = new THREE.Raycaster()
const hitNdc = new THREE.Vector2() // 매 호출 할당 방지 (모듈 스코프 재사용)
let clickThrough = true
let lastHitWx = Number.NaN
let lastHitWy = Number.NaN
function updateHitTest() {
  if (!window.mingo) return
  // 드래그 중에는 클릭스루 OFF 유지 — 한 프레임 레이캐스트 미스로
  // 클릭스루가 켜지면 mouseup을 영구 유실(폭주 드래그)한다.
  if (dragging) return
  let hit = false
  if (cursorInWindow) {
    hitNdc.set(
      (cursorWin.x / window.innerWidth) * 2 - 1,
      -(cursorWin.y / window.innerHeight) * 2 + 1,
    )
    raycaster.setFromCamera(hitNdc, camera)
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
  // mouseup이 유실된 경우(클릭스루 전환 등) 버튼 상태로 드래그 종료 감지
  if (e.buttons === 0) {
    dragging = false
    return
  }
  window.mingo?.dragBy(e.screenX - lastDrag.x, e.screenY - lastDrag.y)
  lastDrag = { x: e.screenX, y: e.screenY }
})
window.addEventListener('mouseup', () => { dragging = false })
window.addEventListener('blur', () => { dragging = false })

// ---------- 메인 루프 ----------
// rAF는 디스플레이 주사율(ProMotion 120Hz)을 따르므로 시간 게이트로 프레임 캡:
// idle 30fps(데이터 소스가 30Hz + 모션 주기 3.6~11s라 시각 차이 없음),
// tracked 60fps(30Hz 트래킹의 스무딩 필터 보간용 상한).
const IDLE_FRAME_MS = 1000 / 30
const TRACKED_FRAME_MS = 1000 / 60
const clock = new THREE.Clock()
let rafId = 0
let lastRenderMs = 0
let lastTracked = 0
function loop() {
  rafId = requestAnimationFrame(loop)
  const nowMs = performance.now()
  const targetMs = lastTracked > 0.5 ? TRACKED_FRAME_MS : IDLE_FRAME_MS
  // -1ms 허용 오차: rAF 틱 양자화(8.33/16.7ms)로 캡이 한 틱씩 밀리는 것 방지
  if (nowMs - lastRenderMs < targetMs - 1) return
  lastRenderMs = nowMs

  const dt = Math.min(clock.getDelta(), 0.1)
  const t = clock.elapsedTime

  const raw = trackingUp ? tracker.latest() : neutralFrame()
  const frame = aliveness.compose(raw, dt, t, cursor)
  lastTracked = frame.tracked
  mingo.apply(frame, dt, t)

  renderer.render(scene, camera)
}
loop()

// ---------- 가시성 연동 (Cmd+Shift+M 퀵 하이드) ----------
// backgroundThrottling:false라 hide 후에도 rAF가 계속 돌고, visibilityState도
// 'visible'로 남는다(Electron 문서화 동작) — main 프로세스가 방송하는
// mingo:visibility로 전체 파이프라인(루프+트래커+카메라 LED)을 멈추고 복귀 시 재시작.
let pipelinePaused = false
function setPipelineVisible(visible: boolean) {
  if (visible === !pipelinePaused) return // 중복 이벤트 무시 (idempotent)
  if (!visible) {
    pipelinePaused = true
    cancelAnimationFrame(rafId)
    camWanted = false
    stopCam()
  } else {
    pipelinePaused = false
    camWanted = true
    startCam()
    clock.getDelta() // 숨김 기간 델타 플러시 (복귀 프레임 점프 방지)
    cancelAnimationFrame(rafId) // 중복 루프 방지
    loop()
  }
}
window.mingo?.onVisibility?.((visible) => setPipelineVisible(visible))
// 브라우저 dev 실행 등 브리지 부재 환경 폴백
document.addEventListener('visibilitychange', () => setPipelineVisible(!document.hidden))
