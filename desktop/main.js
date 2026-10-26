// Sentinel 3D desktop shell — offline, hardened, self-updating
const { app, BrowserWindow, protocol, net, shell, dialog, Menu, session, ipcMain, safeStorage, systemPreferences } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const crypto = require('crypto');
const LC = require('./licence-core');

// ---------------- licence ----------------
// Public check code from the owner's private Key Generator. It can only CHECK keys, never make them.
const LICENCE_CHECK_CODE = 'S3DPUB-PENDING';
const SHELL_DIR = path.join(__dirname, 'shell');
const LIC = { ok: false, why: 'none', lic: null, code: null };
function licPub() { const c = (!app.isPackaged && process.env.S3D_TEST_CHECK_CODE) || LICENCE_CHECK_CODE; return LC.checkCodeToPub(c); }
function licFile() { return path.join(app.getPath('userData'), 'licence.s3dkey'); }
function clockFile() { return path.join(app.getPath('userData'), 'ls.dat'); }
const CLK = 'sentinel3d-clock-v1';
function clockOk() {
  // refuse if the computer clock has been wound back to stretch an expiry date
  const now = Date.now(); let t = 0;
  try { const o = JSON.parse(fs.readFileSync(clockFile(), 'utf8')); if (crypto.createHmac('sha256', CLK + LIC.code).update(String(o.t)).digest('hex') === o.h) t = +o.t; } catch (_) {}
  if (t && now < t - 2 * 86400000) return false;
  const nt = Math.max(t, now);
  try { fs.writeFileSync(clockFile(), JSON.stringify({ t: nt, h: crypto.createHmac('sha256', CLK + LIC.code).update(String(nt)).digest('hex') })); } catch (_) {}
  return true;
}
function evalLicence(keyText) {
  LIC.code = LIC.code || LC.machineCode();
  if (!LIC.code) return Object.assign(LIC, { ok: false, why: 'nomachine', lic: null });
  const pub = licPub(); if (!pub) return Object.assign(LIC, { ok: false, why: 'unconfigured', lic: null });
  if (keyText == null) { try { keyText = fs.readFileSync(licFile(), 'utf8'); } catch (_) { return Object.assign(LIC, { ok: false, why: 'none', lic: null }); } }
  const r = LC.checkLicence(keyText, pub, LIC.code);
  if (r.ok && r.lic.x && !clockOk()) return Object.assign(LIC, { ok: false, why: 'clock', lic: r.lic });
  return Object.assign(LIC, { ok: r.ok, why: r.ok ? '' : r.why, lic: r.lic || null });
}
// ---------------- Touch ID / PIN quick unlock ----------------
// The project data key is kept encrypted by the operating system's keychain (macOS Keychain / Windows DPAPI).
// A PIN is checked here, in the main process, with a strict limit on wrong tries.
function quickFile() { return path.join(app.getPath('userData'), 'quick.dat'); }
// (automated tests on a computer without a keychain use a stand-in; never in the installed app)
const QTEST = !app.isPackaged && process.env.S3D_TEST_QUICK === '1';
const SS = QTEST ? { isEncryptionAvailable: () => true, encryptString: t => Buffer.from('T' + Buffer.from(t).toString('base64')), decryptString: b => Buffer.from(b.toString().slice(1), 'base64').toString() } : safeStorage;
function quickAvail() { try { return SS.isEncryptionAvailable(); } catch (_) { return false; } }
function quickRead() { try { return JSON.parse(SS.decryptString(fs.readFileSync(quickFile()))); } catch (_) { return {}; } }
function quickWrite(o) { try { fs.writeFileSync(quickFile(), SS.encryptString(JSON.stringify(o)), { mode: 0o600 }); return true; } catch (_) { return false; } }
function canTouch() { try { return process.platform === 'darwin' && systemPreferences.canPromptTouchID(); } catch (_) { return false; } }
function pinHash(pin, salt) { return crypto.pbkdf2Sync(String(pin), Buffer.from(salt, 'base64'), 200000, 32, 'sha256').toString('base64'); }
const QID = id => /^[a-z0-9]{4,40}$/i.test(String(id || ''));

function licInfo() { const l = LIC.lic; return { ok: LIC.ok, why: LIC.why, code: LIC.code, name: l && l.n, company: l && l.c, edition: l && l.ed, id: l && l.id, issued: l && l.i, expiry: l && l.x, daysLeft: l && l.x ? Math.ceil((new Date(l.x + 'T23:59:59') - Date.now()) / 86400000) : null }; }

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
  win.loadURL(LIC.ok ? 'app://sentinel/index.html' : 'app://shell/activate.html');
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
    { label: 'Help', submenu: [{ label: 'Getting Started guide (PDF)', click: () => shell.openPath(path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, 'docs'), 'Sentinel-3D-Getting-Started.pdf')) }, { type: 'separator' }, ...(isMac ? [] : [{ label: 'Check for Updates…', click: () => checkUpdates(true) }]), { label: 'About Sentinel 3D', click: () => dialog.showMessageBox(win, { type: 'info', title: 'Sentinel 3D', message: 'Sentinel 3D ' + app.getVersion(), detail: 'Tactical Site Planning\n' + (LIC.ok && LIC.lic ? 'Licensed to ' + LIC.lic.n + (LIC.lic.c ? ', ' + LIC.lic.c : '') + '\nLicence ' + LIC.lic.id + (LIC.lic.x ? ' · valid until ' + LIC.lic.x : ' · no expiry') + '\n' : '') + 'Copyright © 2026 Syed Iftikhar Shah. All rights reserved.' }) }] }
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
    // the planning app itself is only served once this computer holds a valid licence
    const root = u.host === 'shell' ? SHELL_DIR : (u.host === 'sentinel' && LIC.ok ? APP_DIR : null);
    if (!root) return new Response('Forbidden', { status: 403 });
    const full = path.normalize(path.join(root, rel));
    if (!full.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
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
  ipcMain.handle('lic-info', () => licInfo());
  ipcMain.handle('quick-status', (_e, id) => { if (!QID(id)) return null; const a = quickAvail(); const u = a ? (quickRead()[id] || {}) : {}; return { available: a, canTouch: canTouch(), touchHardware: process.platform === 'darwin', hasTouch: !!u.touch && !!u.dek, hasPin: !!u.pin && !!u.dek }; });
  ipcMain.handle('quick-set', (_e, id, o) => {
    if (!QID(id) || !quickAvail() || !o || typeof o.dek !== 'string' || o.dek.length > 100) return { ok: false, why: 'unavailable' };
    const all = quickRead(); const u = all[id] || {};
    u.dek = o.dek; if (o.touch !== undefined) u.touch = !!o.touch && canTouch();
    if (o.pin) { if (!/^\d{4,8}$/.test(String(o.pin))) return { ok: false, why: 'pin' }; const salt = crypto.randomBytes(16).toString('base64'); u.pin = { salt, h: pinHash(o.pin, salt) }; u.fails = 0; }
    else if (!o.keepPin) delete u.pin;
    all[id] = u; return { ok: quickWrite(all) };
  });
  ipcMain.handle('quick-clear', (_e, id) => { if (!QID(id)) return false; const all = quickRead(); delete all[id]; return quickWrite(all); });
  ipcMain.handle('quick-clear-all', () => { try { fs.unlinkSync(quickFile()); } catch (_) {} return true; });
  ipcMain.handle('quick-touch', async (_e, id) => {
    if (!QID(id) || !canTouch()) return { ok: false, why: 'unavailable' };
    const u = quickRead()[id]; if (!u || !u.touch || !u.dek) return { ok: false, why: 'none' };
    try { await systemPreferences.promptTouchID('unlock Sentinel 3D'); } catch (_) { return { ok: false, why: 'cancel' }; }
    return { ok: true, dek: u.dek };
  });
  ipcMain.handle('quick-pin', (_e, id, pin) => {
    if (!QID(id)) return { ok: false };
    const all = quickRead(); const u = all[id]; if (!u || !u.pin || !u.dek) return { ok: false, why: 'none' };
    if (pinHash(String(pin || '').slice(0, 12), u.pin.salt) === u.pin.h) { u.fails = 0; quickWrite(all); return { ok: true, dek: u.dek }; }
    u.fails = (u.fails || 0) + 1;
    if (u.fails >= 5) { delete u.pin; quickWrite(all); return { ok: false, why: 'locked' }; }
    quickWrite(all); return { ok: false, why: 'wrong', left: 5 - u.fails };
  });
  ipcMain.handle('lic-activate', (_e, keyText) => {
    const saved = Object.assign({}, LIC);
    evalLicence(String(keyText || '').slice(0, 4000));
    if (LIC.ok) { try { fs.writeFileSync(licFile(), LC.cleanKey(keyText)); } catch (e) { return { ok: false, why: 'write' }; } return licInfo(); }
    const out = licInfo(); if (saved.ok) Object.assign(LIC, saved); return out;
  });
  ipcMain.handle('lic-open-file', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open licence key file', filters: [{ name: 'Sentinel 3D licence', extensions: ['s3dkey', 'txt'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    try { const st = fs.statSync(r.filePaths[0]); if (st.size > 8000) return null; return fs.readFileSync(r.filePaths[0], 'utf8'); } catch (_) { return null; }
  });
  ipcMain.handle('lic-continue', () => { if (LIC.ok && win) win.loadURL('app://sentinel/index.html'); return LIC.ok; });
  ipcMain.handle('lic-remove', async () => {
    const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Remove licence', 'Cancel'], defaultId: 1, cancelId: 1, message: 'Remove the licence from this computer?', detail: 'Sentinel 3D will lock until a licence key is entered again. Your projects are kept.' });
    if (r.response !== 0) return false;
    try { fs.unlinkSync(licFile()); } catch (_) {}
    LIC.ok = false; LIC.why = 'none'; LIC.lic = null; win.loadURL('app://shell/activate.html'); return true;
  });
  ipcMain.handle('check-updates', () => checkUpdates(true));
  ipcMain.handle('save-file', async (_e, { name, data }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: name });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, Buffer.from(data));
    return true;
  });
  evalLicence();
  // re-check every hour so an expiry date is honoured even if the app is left open
  setInterval(() => { const was = LIC.ok; evalLicence(); if (was && !LIC.ok && win) win.loadURL('app://shell/activate.html'); }, 60 * 60 * 1000);
  buildMenu();
  createWindow();
  setupUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
