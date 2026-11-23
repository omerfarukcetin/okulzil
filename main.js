// Electron kabuğu: sunucuyu başlatır, panoyu TV'lere tam ekran açar.
const path = require('path');
const { app, BrowserWindow, globalShortcut, powerSaveBlocker, dialog } = require('electron');
const { startServer } = require('./server/server');

const PORT = Number(process.env.ZIL_PORT) || 3000;

// Tarayıcı kuralı: kullanıcı tıklamadan ses çalınmaz. Zil için bunu kapatıyoruz.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let pano = null;
let panel = null;
let server = null;

function createPano() {
  pano = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0E1A2B',
    webPreferences: { backgroundThrottling: false }
  });
  pano.loadURL(`http://localhost:${PORT}/pano/?audio=1`);

  // Pano çökerse ya da donarsa kendini yeniden yükler
  pano.webContents.on('render-process-gone', () => setTimeout(() => pano && pano.reload(), 2000));
  pano.on('unresponsive', () => pano && pano.reload());
  pano.webContents.on('did-fail-load', () => setTimeout(() => pano && pano.reload(), 3000));
  pano.on('closed', () => { pano = null; });
}

// Ctrl+Shift+P: sistem odasındaki bilgisayarda küçük kontrol paneli.
// Not: Ekran çoğaltıcı ile TV'lere yansıdığı için kısa süre açık tutun.
function togglePanel() {
  if (panel) { panel.close(); return; }
  panel = new BrowserWindow({ width: 440, height: 820, alwaysOnTop: true, autoHideMenuBar: true, title: 'Zil Paneli' });
  panel.loadURL(`http://localhost:${PORT}/panel/`);
  let idle = setTimeout(() => panel && panel.close(), 3 * 60 * 1000);
  panel.webContents.on('before-input-event', () => {
    clearTimeout(idle);
    idle = setTimeout(() => panel && panel.close(), 3 * 60 * 1000);
  });
  panel.on('closed', () => { clearTimeout(idle); panel = null; });
}

app.whenReady().then(() => {
  try {
    server = startServer({
      dataDir: app.getPath('userData'),
      port: PORT,
      bundledSoundsDir: path.join(__dirname, 'sounds')
    });
  } catch (e) {
    dialog.showErrorBox('Sunucu başlatılamadı', String(e && e.message));
    app.quit();
    return;
  }

  // Ekran ve bilgisayar uykuya geçmesin
  powerSaveBlocker.start('prevent-display-sleep');

  // Windows açılınca otomatik başla (paketlenmiş sürümde)
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  setTimeout(createPano, 500);

  globalShortcut.register('Control+Shift+P', togglePanel);
  // Programdan çıkış (kiosk modunda başka yol yok)
  globalShortcut.register('Control+Shift+Alt+Q', () => {
    const r = dialog.showMessageBoxSync({ type: 'warning', buttons: ['Vazgeç', 'Kapat'], defaultId: 0, message: 'Zil programı kapatılsın mı? Kapalıyken zil çalmaz.' });
    if (r === 1) app.exit(0);
  });
});

app.on('second-instance', () => { if (pano) pano.focus(); });
app.on('window-all-closed', () => {
  // Pano kapanırsa yeniden aç; zil sistemi kapanmamalı
  setTimeout(() => { if (!pano) createPano(); }, 1000);
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (server) server.close();
});
