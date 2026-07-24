// mingo-mate — macOS 데스크톱 마스코트 셸
// 리서치 검증된 레시피: transparent + frame:false + type:'panel' + screen-saver level
// + visibleOnFullScreen + setIgnoreMouseEvents(forward) + 렌더러 히트테스트 토글
import { app, BrowserWindow, ipcMain, screen, globalShortcut, session, Menu } from 'electron'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const avatarCatalog = JSON.parse(
  readFileSync(join(__dirname, '../shared/avatar-catalog.json'), 'utf8'),
)
if (!Array.isArray(avatarCatalog) || avatarCatalog.length !== 12) {
  throw new Error('shared/avatar-catalog.json must contain exactly 12 avatars')
}

const WIN_W = 420
const WIN_H = 580

/** @type {BrowserWindow | null} */
let win = null
let cursorTimer = null

function switchAvatar(slug) {
  if (!win || win.isDestroyed()) return
  const script = `localStorage.setItem('mingo-avatar', ${JSON.stringify(slug)});` +
    `const u=new URL(location.href);u.searchParams.set('avatar',${JSON.stringify(slug)});location.replace(u.toString())`
  void win.webContents.executeJavaScript(script)
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()

  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: workArea.x + workArea.width - WIN_W - 24,
    y: workArea.y + workArea.height - WIN_H - 8,
    transparent: true,
    frame: false,
    type: 'panel', // NSPanel: 풀스크린 앱 위에도 뜸 (electron#36364 회피)
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (win.setHiddenInMissionControl) win.setHiddenInMissionControl(true)
  // 기본은 클릭스루 ON — 렌더러가 아바타 위에서만 OFF로 토글
  win.setIgnoreMouseEvents(true, { forward: true })

  const devServer = process.env.VITE_DEV_SERVER
  if (devServer) win.loadURL(devServer + '/index.html')
  else win.loadFile(join(__dirname, '../dist/index.html'))

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

app.whenReady().then(() => {
  // 카메라 권한 자동 허용 (macOS 시스템 프롬프트는 별도로 1회 뜸)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media')
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'MingoMate',
      submenu: [
        { label: 'Mingo 숨기기/보이기', accelerator: 'Cmd+Shift+M', click: () => { if (win) win.isVisible() ? win.hide() : win.show() } },
        {
          label: '캐릭터',
          submenu: avatarCatalog.map((entry) => ({
            label: `${entry.label} (${entry.key})`,
            accelerator: /^[0-9]$/.test(entry.key) ? entry.key : undefined,
            click: () => switchAvatar(entry.slug),
          })),
        },
        { role: 'reload' },
        { role: 'toggleDevTools' }, // 주의: 투명창은 detached 모드로만
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ]))

  createWindow()

  // 방송 화면공유 대비 퀵 하이드 (setContentProtection은 macOS 15+에서 무력)
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (win) win.isVisible() ? win.hide() : win.show()
  })
})

ipcMain.on('mingo:click-through', (_e, enabled) => {
  if (!win) return
  win.setIgnoreMouseEvents(!!enabled, { forward: true })
})

ipcMain.on('mingo:drag-by', (_e, dx, dy) => {
  if (!win) return
  const b = win.getBounds()
  win.setBounds({ ...b, x: Math.round(b.x + dx), y: Math.round(b.y + dy) })
})

ipcMain.on('mingo:quit', () => app.quit())

app.on('will-quit', () => {
  if (cursorTimer) clearInterval(cursorTimer)
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => app.quit())
