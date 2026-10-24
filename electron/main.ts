import { app, BrowserWindow, ipcMain, Menu, net, protocol, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { jellyfin, type Session } from './jellyfin';

// The built page is served from its own origin rather than file://: Haru's renderer fetches her faces from
// /emotions/, and fetch() has no file:// support.
protocol.registerSchemesAsPrivileged([{ scheme: 'spin', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// Settings are one JSON file in userData; the token is kept encrypted by the OS account (safeStorage).
type Settings = { server?: string; userId?: string; deviceId: string; token?: string };
const settingsPath = () => path.join(app.getPath('userData'), 'config.json');
function loadSettings(): Settings {
  try { return { deviceId: randomUUID(), ...JSON.parse(readFileSync(settingsPath(), 'utf8')) }; }
  catch { return { deviceId: randomUUID() }; }
}
function saveSettings(settings: Settings) {
  mkdirSync(path.dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

let settings: Settings;
let token = '';
const session = (): Session => ({ server: settings.server ?? '', userId: settings.userId ?? '', deviceId: settings.deviceId, token });
const server = jellyfin(session);

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

// A 401 means the token died (server restart, password change): forget it so the renderer shows the login.
const guarded = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A) => {
  try { return await fn(...args); }
  catch (error) {
    if (String((error as Error).message).startsWith('401')) { token = ''; delete settings.token; saveSettings(settings); }
    throw error;
  }
};

const api = {
  session: async () => ({ ...session(), token: token || undefined }),
  async login(typedServer: string, username: string, password: string) {
    const reply = await server.login(typedServer, settings.deviceId, username, password);
    token = reply.token;
    settings = { ...settings, server: reply.server, userId: reply.userId, token: safeStorage.encryptString(reply.token).toString('base64') };
    saveSettings(settings);
    return api.session();
  },
  async logout() {
    token = '';
    settings = { deviceId: settings.deviceId, server: settings.server };
    saveSettings(settings);
  },
  songs: guarded(server.songs),
  playlists: guarded(server.playlists),
  playlistItems: guarded(server.playlistItems),
  createPlaylist: guarded(server.createPlaylist),
  addToPlaylist: guarded(server.addToPlaylist),
  removeFromPlaylist: guarded(server.removeFromPlaylist),
  deletePlaylist: guarded(server.deletePlaylist),
};
export type MainAPI = typeof api;

app.whenReady().then(() => {
  settings = loadSettings();
  try { token = settings.token ? safeStorage.decryptString(Buffer.from(settings.token, 'base64')) : ''; }
  catch { token = ''; }
  for (const [name, fn] of Object.entries(api)) ipcMain.handle(`spin:${name}`, (_event, ...args) => (fn as (...a: unknown[]) => unknown)(...args));

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
