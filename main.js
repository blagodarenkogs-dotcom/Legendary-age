/* Главный процесс Electron.
   Обычный запуск:                 окно лаунчера
   --server                        окно лаунчера + сервер игры на этом компьютере (порт 8080)
   --server-only                   только сервер, без окна */
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

const withServer = process.argv.includes('--server') || process.argv.includes('--server-only');
const headless = process.argv.includes('--server-only');
let server = null;

function startServer() {
  try {
    const { start } = require('./server.js');
    server = start({ dataDir: path.join(app.getPath('userData'), 'data') });
  } catch (e) {
    console.error('Не удалось запустить сервер:', e);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#070816',
    title: 'Legendary Age',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));

  // F12 - консоль разработчика, F11 - полный экран
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}

app.whenReady().then(() => {
  if (withServer) startServer();
  if (!headless) {
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }
});

app.on('window-all-closed', () => {
  if (!headless && process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { if (server) server.stop(); });
