// mingo-mate — macOS·Windows 데스크톱 마스코트 셸
// 공통 레시피: transparent + frame:false + screen-saver level + setIgnoreMouseEvents(forward) + 렌더러 히트테스트 토글
// macOS 추가(리서치 검증): type:'panel' + visibleOnFullScreen (풀스크린 앱 위에도 뜸)
// Windows 추가: backgroundColor '#00000000', 크기 고정, 작업 표시줄 버튼 + 트레이 아이콘
import { app, BrowserWindow, ipcMain, screen, globalShortcut, session, Menu, Tray, systemPreferences, dialog, shell } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import {
  REACTION_CANCEL_ACCELERATOR,
  REACTION_CANCEL_COMMAND,
  avatarAccelerator,
  reactionAccelerator,
  reactionCommand,
} from './keys.mjs'
import { isCameraRequest, isTrustedAppUrl } from './policy.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

// Windows: 작업 표시줄 그룹·알림이 이 앱으로 묶이게 (macOS 번들 ID와 같은 값)
if (isWin) app.setAppUserModelId('com.minwokim.animal-hood-vtuber')

const avatarCatalog = JSON.parse(
  readFileSync(join(__dirname, '../shared/avatar-catalog.json'), 'utf8'),
)
// 팩 크기는 카탈로그가 결정한다 (v3: 12종 + 플라밍고 = 13)
if (!Array.isArray(avatarCatalog) || avatarCatalog.length === 0) {
  throw new Error('shared/avatar-catalog.json must contain at least one avatar')
}
// 숫자키 리액션 10종 (id 1..10, 키 1..9·0) — 렌더러 src/reactions 와 같은 번호 (scripts/test-reactions.mjs 가 일치 검사)
const reactions = JSON.parse(
  readFileSync(join(__dirname, '../shared/reactions.json'), 'utf8'),
)
if (!Array.isArray(reactions) || reactions.length === 0) {
  throw new Error('shared/reactions.json must contain at least one reaction')
}

// 동물 후드/귀 여유 — 기본 420×580은 머리 장식이 잘리는 경우가 있어 키움
const WIN_W = 560
const WIN_H = 780
// 신뢰하는 앱 문서 — 런처 번들(file:// import)로 띄워도 __dirname 이 저장소 electron/ 이라 같은 dist 를 가리킨다
const appUrl = process.env.VITE_DEV_SERVER
  ? new URL('index.html', process.env.VITE_DEV_SERVER.replace(/\/?$/, '/')).href
  : pathToFileURL(join(__dirname, '../dist/index.html')).href

/** @type {BrowserWindow | null} */
let win = null
let cursorTimer = null
/** @type {Tray | null} */
let tray = null
// 만들 때 정한 창 크기 — 크기 조절이 없는 Windows에서 이동할 때 그대로 되돌려 주는 값 (drag-by)
let fixedSize = { width: WIN_W, height: WIN_H }

/** Windows 아이콘(.ico): 패키징된 앱은 electron/icon.ico, 저장소에서 실행하면 build/icon.ico */
function windowsIconPath() {
  for (const p of [join(__dirname, 'icon.ico'), join(__dirname, '../build/icon.ico')]) if (existsSync(p)) return p
  return undefined
}

function trustedEvent(event) {
  return win && !win.isDestroyed() && event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame && isTrustedAppUrl(event.senderFrame.url, appUrl)
}

function switchAvatar(slug) {
  if (!win || win.isDestroyed()) return
  if (!avatarCatalog.some((entry) => entry.slug === slug)) return
  const script = `localStorage.setItem('mingo-avatar', ${JSON.stringify(slug)});` +
    `const u=new URL(location.href);u.searchParams.set('avatar',${JSON.stringify(slug)});location.replace(u.toString())`
  void win.webContents.executeJavaScript(script)
}

function sendDebug(cmd) {
  if (win && !win.isDestroyed()) win.webContents.send('mingo:debug-command', cmd)
}

function toggleVisible() {
  if (win && !win.isDestroyed()) win.isVisible() ? win.hide() : win.show()
}

/**
 * 캐릭터 전환 메뉴. 단축키는 ⌘(맥)/Ctrl(Windows)+카탈로그 키 (1..9, 0, -, =, `, [) — 숫자만 맨 키로 쓰던 때와 달리
 * 이제 맨 숫자 키는 리액션이다. 메뉴 라벨엔 키를 적지 않는다 (accelerator 가 알아서 ⌘1 / Ctrl+1 로 표시된다).
 */
function avatarMenuTemplate(currentSlug) {
  return avatarCatalog.map((entry) => ({
    label: entry.label,
    type: 'radio',
    checked: entry.slug === currentSlug,
    accelerator: avatarAccelerator(entry.key),
    click: () => switchAvatar(entry.slug),
  }))
}

/**
 * 리액션 메뉴(메뉴 바 + 우클릭 팝업 공유). 단축키는 전역 등록(globalShortcut)이 처리하므로 메뉴에는 표시만 하고
 * 따로 등록하지 않는다 (registerAccelerator: false — 같은 키가 두 번 발동하지 않게).
 * 숨겨진 동안(카메라·렌더 루프 정지)에는 보내지 않는다 — 다시 보일 때 옛 리액션이 갑자기 재생되지 않게.
 */
function sendReaction(cmd) {
  if (win && !win.isDestroyed() && win.isVisible()) sendDebug(cmd)
}

function reactionMenuItems() {
  return [
    ...reactions.map((r) => ({
      label: `${r.key}  ${r.name}`,
      accelerator: reactionAccelerator(r),
      registerAccelerator: false,
      click: () => sendReaction(reactionCommand(r)),
    })),
    { type: 'separator' },
    {
      label: '리액션 취소',
      accelerator: REACTION_CANCEL_ACCELERATOR,
      registerAccelerator: false,
      click: () => sendReaction(REACTION_CANCEL_COMMAND),
    },
  ]
}

/** 우클릭/칩 — 예전 옵션 + 캐릭터 전환 통합 메뉴 */
function popupOptionsMenu(currentSlug) {
  if (!win || win.isDestroyed()) return
  const menu = Menu.buildFromTemplate([
    {
      label: '캐릭터',
      submenu: avatarMenuTemplate(currentSlug),
    },
    { label: '리액션', submenu: reactionMenuItems() },
    { type: 'separator' },
    { label: '아바타 작게', accelerator: 'CommandOrControl+Shift+-', click: () => sendDebug('avatar-smaller') },
    { label: '아바타 크게', accelerator: 'CommandOrControl+Shift+=', click: () => sendDebug('avatar-larger') },
    { label: '아바타 크기 리셋', click: () => sendDebug('avatar-reset') },
    { type: 'separator' },
    { label: 'Mingo 숨기기/보이기', accelerator: 'CommandOrControl+Shift+M', click: toggleVisible },
    { role: 'reload' },
    { type: 'separator' },
    { label: '종료', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
  ])
  menu.popup({ window: win })
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const windowIcon = isWin ? windowsIconPath() : undefined
  // Windows 노트북(1080p 배율 150% = 작업 영역 높이 ≈ 680 DIP)에서는 780이 화면보다 커서 머리가 잘린다 → 작업 영역 안으로 줄인다.
  // 크기를 못 바꾸는 창이라 처음에 맞춰 둬야 한다. 맥은 그대로 780.
  const winH = isMac ? WIN_H : Math.min(WIN_H, workArea.height - 8)
  fixedSize = { width: WIN_W, height: winH }

  win = new BrowserWindow({
    width: WIN_W,
    height: winH,
    x: workArea.x + workArea.width - WIN_W - 24,
    y: workArea.y + workArea.height - winH - 8,
    transparent: true,
    frame: false,
    hasShadow: false,
    ...(isMac
      ? { type: 'panel' } // NSPanel: 풀스크린 앱 위에도 뜸 (electron#36364 회피)
      : {
          backgroundColor: '#00000000', // Windows: 완전 투명 (없으면 합성 단계에서 흰/검은 배경이 비칠 수 있다)
          skipTaskbar: false, // 프레임 없는 창이라 작업 표시줄 버튼이 앱을 찾는 단서다
          ...(windowIcon ? { icon: windowIcon } : {}),
        }),
    // Electron 문서: 투명 창에 resizable:true 를 주면 Windows에서 투명이 깨질 수 있다. 맥은 지금 그대로 둔다.
    // Windows는 창 크기를 고정한다 (이동은 아래 drag-by IPC, 아바타 크기는 메뉴의 줌으로 조절).
    resizable: isMac,
    minWidth: 420,
    minHeight: Math.min(640, winH),
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  if (isMac) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    if (win.setHiddenInMissionControl) win.setHiddenInMissionControl(true)
  }
  // 기본은 클릭스루 ON — 렌더러가 아바타 위에서만 OFF로 토글
  win.setIgnoreMouseEvents(true, { forward: true })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url, appUrl)) event.preventDefault()
  })
  // 기본 아바타는 렌더러 localStorage / ?avatar= 쿼리가 결정 (강제 고정 없음)
  void win.loadURL(appUrl)

  // backgroundThrottling:false면 hide 후에도 renderer의 visibilityState가 'visible'로
  // 남아 visibilitychange가 발화하지 않는다 (Electron 문서화 동작).
  // → hide/show를 명시적 IPC로 방송해 renderer가 렌더 루프·웹캠·MediaPipe를 멈추게 한다.
  win.on('hide', () => { if (win && !win.isDestroyed()) win.webContents.send('mingo:visibility', false) })
  win.on('show', () => { if (win && !win.isDestroyed()) win.webContents.send('mingo:visibility', true) })

  // 전역 커서 방송 (시선 추적 + 히트테스트용) — 30Hz
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return
    const p = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const d = screen.getPrimaryDisplay()
    win.webContents.send('mingo:cursor', {
      sx: p.x, sy: p.y,
      wx: p.x - b.x, wy: p.y - b.y,
      inWindow: p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height,
      winW: b.width, winH: b.height,
      screenW: d.size.width, screenH: d.size.height,
    })
  }, 33)
}

/**
 * Windows 카메라 권한. Windows에는 앱별 권한 창(TCC)이 없고 "설정 > 개인 정보 및 보안 > 카메라"의 전역 스위치
 * ("카메라 액세스", "데스크톱 앱이 카메라에 액세스하도록 허용")만 있다. 꺼져 있으면 getUserMedia가
 * NotAllowedError/NotReadableError로 실패하므로, 'denied'로 읽힐 때만 미리 안내한다 (모르겠으면 조용히 통과 —
 * 그때는 렌더러가 getUserMedia 실패를 보고 상태 줄로 알려 준다: src/cameraHelp.ts).
 */
async function ensureCameraAccessWindows() {
  let status = 'unknown'
  try {
    status = systemPreferences.getMediaAccessStatus('camera')
  } catch {
    return
  }
  if (status !== 'denied') return
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: '카메라를 쓸 수 없습니다',
    detail: 'Windows 설정 > 개인 정보 및 보안 > 카메라에서 "카메라 액세스"와 "데스크톱 앱이 카메라에 액세스하도록 허용"을 켠 뒤 다시 실행해 주세요. 카메라 없이도 idle 동작과 리액션은 됩니다.',
    buttons: ['카메라 설정 열기', '닫기'],
    defaultId: 0,
  })
  if (response === 0) void shell.openExternal('ms-settings:privacy-webcam')
}

/**
 * macOS 카메라 권한(TCC). Electron은 Chromium과 달리 OS 권한 창을 스스로 띄우지 않는다 —
 * 상태가 not-determined면 getUserMedia가 트랙은 주지만 프레임이 0인 채로 멈춘다(smiley-vtuber 실측).
 * 창을 만들기 전에 한 번 묻고, 거부돼 있으면 시스템 설정으로 안내한다.
 */
async function ensureCameraAccess() {
  if (isWin) return ensureCameraAccessWindows()
  if (!isMac) return
  const status = systemPreferences.getMediaAccessStatus('camera')
  if (status === 'granted') return
  if (status === 'not-determined') {
    const ok = await systemPreferences.askForMediaAccess('camera')
    console.log(`[mingo] camera access ${ok ? 'granted' : 'denied'}`)
    if (ok) return
  }
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: '카메라를 쓸 수 없습니다',
    detail: '시스템 설정 > 개인정보 보호 및 보안 > 카메라에서 이 앱(또는 실행한 터미널)을 켠 뒤 다시 실행해 주세요. 카메라 없이도 idle 동작과 리액션은 됩니다.',
    buttons: ['카메라 설정 열기', '닫기'],
    defaultId: 0,
  })
  if (response === 0) void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera')
}

/**
 * Windows 트레이 아이콘. 창에 프레임이 없고 hide()하면 작업 표시줄 버튼도 사라져서,
 * 숨긴 아바타를 되살리는 눈에 보이는 길이 필요하다 (전역 단축키 말고도).
 * 왼쪽 클릭은 숨기기/보이기, 오른쪽 클릭은 메뉴.
 */
function createTray() {
  if (!isWin) return
  const iconPath = windowsIconPath()
  if (!iconPath) return
  // 트레이는 편의 기능이다 — 아이콘을 못 읽어도 뒤따르는 전역 단축키 등록까지 막지 않는다
  try {
    tray = new Tray(iconPath)
    tray.setToolTip('Animal Hood VTuber')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Mingo 숨기기/보이기', click: toggleVisible },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]))
    tray.on('click', toggleVisible)
  } catch (error) {
    tray = null
    console.warn('[mingo] 트레이 아이콘을 만들지 못했습니다', error)
  }
}

app.whenReady().then(async () => {
  // 이 앱의 메인 프레임이 요청한 카메라(video)만 허용 — 마이크·혼합 요청·다른 문서는 거부.
  // (macOS OS 권한은 아래 ensureCameraAccess가 담당)
  session.defaultSession.setPermissionRequestHandler((contents, permission, cb, details) => {
    cb(contents === win?.webContents && details.isMainFrame &&
      isTrustedAppUrl(details.requestingUrl, appUrl) && isCameraRequest(permission, details.mediaTypes))
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    return contents === win?.webContents && details.isMainFrame &&
      isTrustedAppUrl(details.requestingUrl, appUrl) && permission === 'media' && details.mediaType === 'video'
  })
  await ensureCameraAccess()

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'MingoMate',
      submenu: [
        { label: 'Mingo 숨기기/보이기', accelerator: 'CommandOrControl+Shift+M', click: toggleVisible },
        { role: 'reload' },
        { role: 'toggleDevTools' }, // 주의: 투명창은 detached 모드로만
        { type: 'separator' },
        { label: 'MingoMate 종료', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
      ],
    },
    {
      label: '캐릭터',
      submenu: avatarMenuTemplate(null),
    },
    { label: '리액션', submenu: reactionMenuItems() },
    {
      // 예전 04/MingoMate 앱에 있던 보기 옵션 복원
      label: '보기',
      submenu: [
        { label: '아바타 작게', accelerator: 'CommandOrControl+Shift+-', click: () => sendDebug('avatar-smaller') },
        { label: '아바타 크게', accelerator: 'CommandOrControl+Shift+=', click: () => sendDebug('avatar-larger') },
        { label: '아바타 크기 리셋', accelerator: 'CommandOrControl+Shift+0', click: () => sendDebug('avatar-reset') },
      ],
    },
  ]))

  createWindow()
  createTray()

  // 방송 화면공유 대비 퀵 하이드 (setContentProtection은 macOS 15+에서 무력)
  globalShortcut.register('CommandOrControl+Shift+M', toggleVisible)

  // 숫자키 리액션: Ctrl+Option(맥)/Ctrl+Alt(Windows)+1..9, 0 재생, +Esc 취소 — 전역이라 다른 앱을 쓰는 중에도 먹는다
  // (오버레이 창은 클릭스루라 평소에는 포커스가 없어서 이 경로가 주 경로다)
  const taken = []
  for (const r of reactions) {
    if (!globalShortcut.register(reactionAccelerator(r), () => sendReaction(reactionCommand(r)))) {
      taken.push(reactionAccelerator(r))
    }
  }
  if (!globalShortcut.register(REACTION_CANCEL_ACCELERATOR, () => sendReaction(REACTION_CANCEL_COMMAND))) {
    taken.push(REACTION_CANCEL_ACCELERATOR)
  }
  if (taken.length > 0) {
    console.warn(`[mingo] 전역 단축키를 못 잡았습니다 (다른 앱이 쓰는 중): ${taken.join(', ')}`)
  }
})

ipcMain.on('mingo:click-through', (event, enabled) => {
  if (!trustedEvent(event) || typeof enabled !== 'boolean') return
  win.setIgnoreMouseEvents(!!enabled, { forward: true })
})

ipcMain.on('mingo:drag-by', (event, dx, dy) => {
  if (!trustedEvent(event) || !Number.isFinite(dx) || !Number.isFinite(dy)) return
  if (Math.abs(dx) > 4096 || Math.abs(dy) > 4096) return
  const b = win.getBounds()
  const next = { ...b, x: Math.round(b.x + dx), y: Math.round(b.y + dy) }
  // Windows(배율 125·150%)는 getBounds→setBounds 왕복마다 DIP↔픽셀 반올림으로 창 크기가 조금씩 변한다.
  // 크기 조절이 없는 Windows에서는 만들 때의 크기를 그대로 넘겨 이동만 하게 한다.
  if (!isMac) { next.width = fixedSize.width; next.height = fixedSize.height }
  win.setBounds(next)
})

// 렌더러 우클릭/칩 → 통합 옵션 메뉴
ipcMain.on('mingo:options-menu', (event, currentSlug) => {
  if (!trustedEvent(event)) return
  popupOptionsMenu(typeof currentSlug === 'string' ? currentSlug : null)
})
// 구 이름 호환
ipcMain.on('mingo:avatar-menu', (event, currentSlug) => {
  if (!trustedEvent(event)) return
  popupOptionsMenu(typeof currentSlug === 'string' ? currentSlug : null)
})

ipcMain.on('mingo:quit', (event) => { if (trustedEvent(event)) app.quit() })
// 렌더러가 구독을 마치면 현재 가시성을 한 번 알려 준다 (숨김 상태로 시작했을 때 카메라가 안 켜지게)
ipcMain.on('mingo:renderer-ready', (event) => {
  if (trustedEvent(event)) win.webContents.send('mingo:visibility', win.isVisible())
})

app.on('will-quit', () => {
  if (cursorTimer) clearInterval(cursorTimer)
  globalShortcut.unregisterAll()
  tray?.destroy() // 안 지우면 Windows 트레이에 죽은 아이콘이 남는다
})

app.on('window-all-closed', () => app.quit())
