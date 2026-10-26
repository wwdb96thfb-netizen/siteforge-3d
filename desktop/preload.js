const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sentinelDesktop', {
  isDesktop: true,
  version: () => ipcRenderer.invoke('app-version'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data }),
  onOpenFile: cb => ipcRenderer.on('open-project-file', (_e, f) => cb(f)),
  onUpdate: cb => ipcRenderer.on('update-status', (_e, s) => cb(s)),
  onBeforeUpdate: cb => ipcRenderer.on('before-update', () => cb()),
  licence: () => ipcRenderer.invoke('lic-info'),
  activate: key => ipcRenderer.invoke('lic-activate', key),
  openKeyFile: () => ipcRenderer.invoke('lic-open-file'),
  continueToApp: () => ipcRenderer.invoke('lic-continue'),
  removeLicence: () => ipcRenderer.invoke('lic-remove'),
  quickStatus: id => ipcRenderer.invoke('quick-status', id),
  quickSet: (id, o) => ipcRenderer.invoke('quick-set', id, o),
  quickClear: id => ipcRenderer.invoke('quick-clear', id),
  quickClearAll: () => ipcRenderer.invoke('quick-clear-all'),
  quickTouch: id => ipcRenderer.invoke('quick-touch', id),
  quickPin: (id, pin) => ipcRenderer.invoke('quick-pin', id, pin)
});
