import { app, BrowserWindow, Menu, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The built page is served from its own origin rather than file://: Haru's renderer fetches her faces from
// /emotions/, and fetch() has no file:// support.
protocol.registerSchemesAsPrivileged([{ scheme: 'spin', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function createWindow() {
  const window = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1280, minHeight: 800, title: 'Spin', backgroundColor: '#000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const dev = process.env.VITE_DEV_SERVER_URL;
  void window.loadURL(dev ?? 'spin://app/index.html');
  return window;
}

app.whenReady().then(() => {
  const dist = path.join(__dirname, '../dist');
  protocol.handle('spin', request => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = path.normalize(path.join(dist, pathname));
    if (!file.startsWith(dist)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
