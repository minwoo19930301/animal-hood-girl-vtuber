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
    ipcRenderer.send('mingo:renderer-ready')
  },
  onDebugCommand(cb) {
    ipcRenderer.on('mingo:debug-command', (_e, command) => cb(command))
  },
  showAvatarMenu(currentSlug) {
    ipcRenderer.send('mingo:avatar-menu', currentSlug)
  },
  dragBy(dx, dy) {
    ipcRenderer.send('mingo:drag-by', dx, dy)
  },
  quit() {
    ipcRenderer.send('mingo:quit')
  },
})
