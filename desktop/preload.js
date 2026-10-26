const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sentinelDesktop', {
  isDesktop: true,
  version: () => ipcRenderer.invoke('app-version'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data }),
  onOpenFile: cb => ipcRenderer.on('open-project-file', (_e, f) => cb(f)),
  onUpdate: cb => ipcRenderer.on('update-status', (_e, s) => cb(s)),
  onBeforeUpdate: cb => ipcRenderer.on('before-update', () => cb())
});
