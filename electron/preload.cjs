const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mingo', {
  setClickThrough(enabled) {
    ipcRenderer.send('mingo:click-through', enabled)
  },
  onCursor(cb) {
    ipcRenderer.on('mingo:cursor', (_e, p) => cb(p))
  },
  onVisibility(cb) {
    ipcRenderer.on('mingo:visibility', (_e, visible) => cb(visible))
  },
  /** Electron 메뉴/단축키 → 렌더러 명령 (아바타 줌 등) */
  onDebugCommand(cb) {
    ipcRenderer.on('mingo:debug-cmd', (_e, cmd) => cb(cmd))
  },
  dragBy(dx, dy) {
    ipcRenderer.send('mingo:drag-by', dx, dy)
  },
  quit() {
    ipcRenderer.send('mingo:quit')
  },
  /** 우클릭/칩용 전체 옵션 메뉴 (캐릭터 + 보기 + 종료) */
  showAvatarMenu(currentSlug) {
    ipcRenderer.send('mingo:options-menu', currentSlug)
  },
})
