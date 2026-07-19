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
  dragBy(dx, dy) {
    ipcRenderer.send('mingo:drag-by', dx, dy)
  },
  quit() {
    ipcRenderer.send('mingo:quit')
  },
})
