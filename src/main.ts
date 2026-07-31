import * as THREE from 'three'
import { createMingo } from './model/index'
import { createTracker } from './tracking/index'
import { createAliveness } from './aliveness/index'
import { neutralFrame, type CursorInfo } from './contract'
import {
  AVATAR_CATALOG,
  AVATAR_KEYS,
  isAvatarSlug,
  type AvatarSlug,
} from './model/animals/registry'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement
const chipEl = document.getElementById('avatar-chip') as HTMLButtonElement | null
const chipEmoji = document.getElementById('chip-emoji')
const chipLabel = document.getElementById('chip-label')
const pickerEl = document.getElementById('avatar-picker')
const gridEl = document.getElementById('avatar-grid')

/** 종별 이모지 (칩/피커 UI용 — 카탈로그 외 장식) */
const AVATAR_EMOJI: Readonly<Record<AvatarSlug, string>> = {
  bear: '🐻',
  monkey: '🐵',
  turtle: '🐢',
  rabbit: '🐰',
  fox: '🦊',
  panda: '🐼',
  penguin: '🐧',
  owl: '🦉',
  cat: '🐱',
  dog: '🐶',
  tiger: '🐯',
  elephant: '🐘',
  giraffe: '🦒',
  flamingo: '🦩',
}

const avatarKeys: Readonly<Record<string, AvatarSlug>> = AVATAR_KEYS
const requestedAvatar = new URLSearchParams(location.search).get('avatar')
const storedAvatar = localStorage.getItem('mingo-avatar')
const avatar: AvatarSlug = isAvatarSlug(requestedAvatar)
  ? requestedAvatar
  : isAvatarSlug(storedAvatar) ? storedAvatar : 'bear'
localStorage.setItem('mingo-avatar', avatar)

// clickThrough는 히트테스트/피커가 공유 — 선언을 UI 핸들러보다 앞에 둔다
let clickThrough = true
let pickerOpen = false
// updateHitTest는 아래에서 정의 — setPickerOpen 호출 시점에만 참조
let updateHitTest: () => void = () => {}

function switchToAvatar(next: AvatarSlug) {
  if (next === avatar) {
    setPickerOpen(false)
    return
  }
  localStorage.setItem('mingo-avatar', next)
  const url = new URL(location.href)
  url.searchParams.set('avatar', next)
  location.replace(url.toString())
}

function setPickerOpen(open: boolean) {
  pickerOpen = open
  pickerEl?.classList.toggle('open', open)
  // 피커가 열려 있으면 클릭스루 OFF 유지
  if (open && window.mingo && clickThrough) {
    clickThrough = false
    window.mingo.setClickThrough(false)
  }
  if (!open) updateHitTest()
}

function isOverUi(clientX: number, clientY: number): boolean {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el) return false
  return !!(el.closest('#avatar-chip') || el.closest('#avatar-picker'))
}

function refreshChip() {
  if (chipEmoji) chipEmoji.textContent = AVATAR_EMOJI[avatar] ?? '🐾'
  if (chipLabel) chipLabel.textContent = AVATAR_CATALOG.find((e) => e.slug === avatar)?.label ?? avatar
}

// 인앱 피커 그리드 구성 (13종 전부)
if (gridEl) {
  for (const entry of AVATAR_CATALOG) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.slug = entry.slug
    if (entry.slug === avatar) btn.classList.add('active')
    btn.innerHTML =
      `<span class="emoji">${AVATAR_EMOJI[entry.slug] ?? '🐾'}</span>` +
      `<span class="label">${entry.label}</span>` +
      `<span class="key">${entry.key}</span>`
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      switchToAvatar(entry.slug)
    })
    gridEl.appendChild(btn)
  }
}
refreshChip()

chipEl?.addEventListener('click', (e) => {
  e.stopPropagation()
  // 좌클릭: 인앱 그리드 토글 (한눈에 13종)
  setPickerOpen(!pickerOpen)
})
chipEl?.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  e.stopPropagation()
  // 우클릭: 전체 옵션 메뉴 (캐릭터 + 아바타 크기 + 종료)
  if (window.mingo?.showAvatarMenu) window.mingo.showAvatarMenu(avatar)
  else setPickerOpen(true)
})

// 아바타 위 우클릭 → 전체 옵션 메뉴 (예전 보기 옵션 포함)
window.addEventListener('contextmenu', (e) => {
  if (isOverUi(e.clientX, e.clientY)) return
  e.preventDefault()
  if (window.mingo?.showAvatarMenu) {
    window.mingo.showAvatarMenu(avatar)
  } else {
    setPickerOpen(true)
  }
})

// 바깥 클릭 시 피커 닫기
window.addEventListener('pointerdown', (e) => {
  if (!pickerOpen) return
  if (isOverUi(e.clientX, e.clientY)) return
  setPickerOpen(false)
})

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

const mingo = createMingo(avatar)
scene.add(mingo.root)

// 빠른 캐릭터 전환: catalog의 1..9, 0, -, =, ` 키 + C(피커 토글).
// 리로드 시 카메라 스트림도 정상 재초기화되며 선택값은 로컬에만 저장된다.
window.addEventListener('keydown', (event) => {
  // 입력 필드 포커스 중이면 무시 (현재 없음, 방어)
  const tag = (event.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  if (event.key === 'c' || event.key === 'C' || event.key === 'Escape') {
    if (event.key === 'Escape') setPickerOpen(false)
    else setPickerOpen(!pickerOpen)
    return
  }

  const next = avatarKeys[event.key]
  if (!next || next === avatar) return
  switchToAvatar(next)
})

/** 아바타 줌 (1 = 기본, 클수록 멀리 = 더 작게) — 예전 MingoMate 옵션 복원 */
let avatarZoom = 1.0
function setAvatarZoom(z: number) {
  avatarZoom = Math.min(1.8, Math.max(0.7, z))
  frameCamera()
}

function frameCamera() {
  const w = Math.max(1, window.innerWidth)
  const h = Math.max(1, window.innerHeight)
  // updateStyle=true: CSS 크기를 논리 픽셀(w×h)로 맞춤. false면 Retina에서
  // canvas 속성이 버퍼 픽셀(2×)로 남아 창에 반만 보인다.
  renderer.setSize(w, h, true)
  camera.aspect = w / h
  const bodyH = Math.max(0.5, mingo.height || 1.5)
  const lookY = bodyH * 0.52
  // 전신 + 동물 후드/귀 여유. avatarZoom↑ = 더 작게 보임
  const fitH = bodyH * 1.35 * Math.max(0.85, avatarZoom)
  const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  camera.position.set(0, lookY, dist)
  camera.lookAt(0, lookY, 0)
  camera.near = 0.1
  camera.far = Math.max(100, dist * 10)
  camera.updateProjectionMatrix()
}
frameCamera()
window.addEventListener('resize', frameCamera)
// VRM 등 비동기 모델은 로드 완료 후 실측 높이로 재프레이밍
mingo.ready?.then(() => {
  console.log('[mingo] model ready height=', mingo.height, 'hits=', mingo.hitMeshes.length)
  frameCamera()
})

// Electron 메뉴 바 / 우클릭 / 단축키 → 옵션 실행
window.mingo?.onDebugCommand?.((cmd) => {
  if (cmd === 'avatar-smaller') setAvatarZoom(avatarZoom + 0.1)
  else if (cmd === 'avatar-larger') setAvatarZoom(avatarZoom - 0.1)
  else if (cmd === 'avatar-reset' || cmd === 'reset-layout') {
    avatarZoom = 1
    frameCamera()
  } else if (cmd === 'quit') {
    window.mingo?.quit()
  }
})

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
let lastHitWx = Number.NaN
let lastHitWy = Number.NaN
updateHitTest = () => {
  if (!window.mingo) return
  // 드래그 중 / 피커 오픈 중에는 클릭스루 OFF 유지 — 한 프레임 레이캐스트 미스로
  // 클릭스루가 켜지면 mouseup을 영구 유실(폭주 드래그)한다.
  if (dragging || pickerOpen) {
    if (clickThrough) {
      clickThrough = false
      window.mingo.setClickThrough(false)
    }
    return
  }
  let hit = false
  if (cursorInWindow) {
    // UI 칩/피커 위면 항상 히트 (클릭스루 OFF)
    if (isOverUi(cursorWin.x, cursorWin.y)) {
      hit = true
    } else if (mingo.hitMeshes.length > 0) {
      const iw = Math.max(1, window.innerWidth)
      const ih = Math.max(1, window.innerHeight)
      hitNdc.set(
        (cursorWin.x / iw) * 2 - 1,
        -(cursorWin.y / ih) * 2 + 1,
      )
      raycaster.setFromCamera(hitNdc, camera)
      hit = raycaster.intersectObjects(mingo.hitMeshes, true).length > 0
      // 메시 가장자리 빗나감 완화: 창 중앙 근처(아바타 영역) 소프트 히트
      if (!hit) {
        const nx = (cursorWin.x / iw) * 2 - 1
        const ny = -((cursorWin.y / ih) * 2 - 1)
        // 세로로 긴 타원 — 머리~몸통 대략 커버
        hit = (nx * nx) / (0.55 * 0.55) + (ny * ny) / (0.85 * 0.85) <= 1
      }
    }
  }
  const wantThrough = !hit
  if (wantThrough !== clickThrough) {
    clickThrough = wantThrough
    window.mingo.setClickThrough(wantThrough)
  }
}

// 드래그로 위치 이동 (화면 좌표 델타 → Electron setBounds)
let dragging = false
let lastDrag = { x: 0, y: 0 }
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  // 칩/피커 UI 클릭은 창 드래그로 취급하지 않음
  if (isOverUi(e.clientX, e.clientY)) return
  dragging = true
  lastDrag = { x: e.screenX, y: e.screenY }
  // 드래그 시작 즉시 클릭스루 OFF — 레이캐스트 레이스 방지
  if (window.mingo && clickThrough) {
    clickThrough = false
    window.mingo.setClickThrough(false)
  }
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
