import { contextBridge, ipcRenderer } from 'electron';
import type { MainAPI } from './main';

// Sandboxed preloads may only require Electron, so this bridge stays self-contained: every call is one
// invoke on its spin: channel, and the error comes back as the server's own words, not Electron's wrapper.
const invoke = (name: string) => (...args: unknown[]) =>
  ipcRenderer.invoke(`spin:${name}`, ...args).catch((error: Error) => {
    throw new Error(String(error.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  });

type Bridge = { [K in keyof MainAPI]: MainAPI[K] };
const names: (keyof MainAPI)[] = ['session', 'login', 'logout', 'songs', 'playlists', 'playlistItems', 'createPlaylist', 'addToPlaylist', 'removeFromPlaylist', 'deletePlaylist'];
const api = Object.fromEntries(names.map(name => [name, invoke(name)])) as Bridge;

export type SpinAPI = Bridge;
contextBridge.exposeInMainWorld('spin', api);
