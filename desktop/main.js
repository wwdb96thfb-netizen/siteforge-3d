// Sentinel 3D desktop shell — offline, hardened, self-updating
const { app, BrowserWindow, protocol, net, shell, dialog, Menu, session, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

const APP_DIR = path.join(__dirname, 'app');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

let win = null;
let pendingFile = null;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

function fileArg(argv) { return (argv || []).find(a => /\.(s3d|g3d|json)$/i.test(a) && fs.existsSync(a)) || null; }
pendingFile = fileArg(process.argv);

app.on('second-instance', (_e, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); const f = fileArg(argv); if (f) sendFile(f); } });
app.on('open-file', (e, f) => { e.preventDefault(); if (win) sendFile(f); else pendingFile = f; });

function sendFile(f) { try { const data = fs.readFileSync(f, 'utf8'); win.webContents.send('open-project-file', { name: path.basename(f), data }); } catch (err) { dialog.showErrorBox('Sentinel 3D', 'Could not open the file:\n' + err.message); } }

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    backgroundColor: '#030b1a', title: 'Sentinel 3D', show: false,
    icon: path.join(__dirname, 'app', 'sentinel-icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, spellcheck: false,
      devTools: !app.isPackaged
    }
  });
  win.once('ready-to-show', () => { win.show(); if (pendingFile) { const f = pendingFile; pendingFile = null; setTimeout(() => sendFile(f), 2500); } });
  win.loadURL('app://sentinel/index.html');
  // never navigate away or open new windows inside the app
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', e => e.preventDefault());
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ label: 'Sentinel 3D', submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Check for Updates…', click: () => checkUpdates(true) }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { label: 'Help', submenu: [...(isMac ? [] : [{ label: 'Check for Updates…', click: () => checkUpdates(true) }]), { label: 'About Sentinel 3D', click: () => dialog.showMessageBox(win, { type: 'info', title: 'Sentinel 3D', message: 'Sentinel 3D ' + app.getVersion(), detail: 'Tactical Site Planning\nCopyright © 2026 Syed Iftikhar Shah. All rights reserved.' }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

// ---------------- automatic updates ----------------
let updater = null, manualCheck = false;
function setupUpdater() {
  try { updater = require('electron-updater').autoUpdater; } catch (e) { return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', info => { if (win) win.webContents.send('update-status', { state: 'downloading', version: info.version }); });
  updater.on('update-not-available', () => { if (manualCheck) dialog.showMessageBox(win, { type: 'info', message: 'Sentinel 3D is up to date.', detail: 'Version ' + app.getVersion() }); manualCheck = false; });
  updater.on('download-progress', p => { if (win) win.webContents.send('update-status', { state: 'progress', percent: Math.round(p.percent) }); });
  updater.on('update-downloaded', async info => {
    if (win) win.webContents.send('update-status', { state: 'ready', version: info.version });
    const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['Restart and update now', 'Later'], defaultId: 0, cancelId: 1, title: 'Update ready', message: 'Sentinel 3D ' + info.version + ' is ready to install.', detail: 'Save your work. The app will close, install the update, and open again.' });
    if (r.response === 0) { try { win.webContents.send('before-update'); } catch (_) {} setTimeout(() => updater.quitAndInstall(false, true), 1200); }
  });
  updater.on('error', err => {
    if (manualCheck) {
      if (process.platform === 'darwin') offerManualDownload();
      else dialog.showMessageBox(win, { type: 'warning', message: 'Could not check for updates.', detail: String(err && err.message || err).slice(0, 300) });
    }
    manualCheck = false;
  });
  setTimeout(() => checkUpdates(false), 8000);
  setInterval(() => checkUpdates(false), 6 * 60 * 60 * 1000);
}
function checkUpdates(manual) {
  if (!updater || !app.isPackaged) { if (manual) dialog.showMessageBox(win, { message: 'Updates work in the installed app.' }); return; }
  manualCheck = manual;
  if (!net.isOnline()) { if (manual) dialog.showMessageBox(win, { type: 'info', message: 'You are offline.', detail: 'Sentinel 3D will look for updates the next time this computer is online.' }); return; }
  updater.checkForUpdates().catch(() => {});
}
async function offerManualDownload() {
  const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['Open download page', 'Cancel'], message: 'Download the latest Sentinel 3D for Mac', detail: 'Open the download page, download the .dmg, and drag Sentinel 3D into Applications to replace the old version. Your projects are kept.' });
  if (r.response === 0) shell.openExternal('https://github.com/wwdb96thfb-netizen/siteforge-3d/releases/latest');
}

app.whenReady().then(() => {
  // serve the bundled app files only — nothing is loaded from the internet
  protocol.handle('app', req => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const full = path.normalize(path.join(APP_DIR, rel));
    if (!full.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });
  // block every request that is not part of the app (no data can leave the computer)
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
    const ok = d.url.startsWith('app://') || d.url.startsWith('data:') || d.url.startsWith('blob:') || d.url.startsWith('devtools://');
    cb({ cancel: !ok });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write' || perm === 'fullscreen'));
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    cb({ responseHeaders: Object.assign({}, d.responseHeaders, { 'Content-Security-Policy': ["default-src 'self' app:; script-src 'self' app: 'unsafe-inline' 'unsafe-eval'; style-src 'self' app: 'unsafe-inline'; img-src 'self' app: data: blob:; font-src 'self' app: data:; connect-src 'self' app: data: blob:; worker-src 'self' app: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"] }) });
  });
  ipcMain.handle('app-version', () => app.getVersion());
  ipcMain.handle('check-updates', () => checkUpdates(true));
  ipcMain.handle('save-file', async (_e, { name, data }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: name });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, Buffer.from(data));
    return true;
  });
  buildMenu();
  createWindow();
  setupUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
