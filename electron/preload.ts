import { contextBridge } from 'electron';

// Sandboxed preloads may only require Electron, so this bridge stays self-contained.
const api = {};

export type SpinAPI = typeof api;
contextBridge.exposeInMainWorld('spin', api);
