const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mingo', {
  /** Node의 process.platform ('darwin' | 'win32' | 'linux') — 렌더러가 OS별 단축키·안내 문구를 고를 때 쓴다 */
  platform: process.platform,
  setClickThrough(enabled) {
    ipcRenderer.send('mingo:click-through', enabled)
  },
  onCursor(cb) {
    ipcRenderer.on('mingo:cursor', (_e, p) => cb(p))
  },
  onVisibility(cb) {
    ipcRenderer.on('mingo:visibility', (_e, visible) => cb(visible))
    // 구독을 마쳤음을 알려 현재 가시성을 한 번 받는다 (숨김 상태로 시작한 경우 카메라를 켜지 않기 위해)
    ipcRenderer.send('mingo:renderer-ready')
  },
  /** Electron 메뉴/단축키 → 렌더러 명령 (아바타 줌, 리액션 등) */
  onDebugCommand(cb) {
    ipcRenderer.on('mingo:debug-command', (_e, cmd) => cb(cmd))
  },
  dragBy(dx, dy) {
    ipcRenderer.send('mingo:drag-by', dx, dy)
  },
  quit() {
    ipcRenderer.send('mingo:quit')
  },
  /** 우클릭/칩용 전체 옵션 메뉴 (캐릭터 + 리액션 + 보기 + 종료) */
  showAvatarMenu(currentSlug) {
    ipcRenderer.send('mingo:options-menu', currentSlug)
  },
})
