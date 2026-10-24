import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base '/' and absolute asset paths: the packaged app is served from spin://app/ by main.ts, not file://,
// because Haru's renderer fetches her faces from /emotions/.
export default defineConfig({
  base: '/', plugins: [react(), {
    // React Fast Refresh injects an inline preamble and talks over a websocket, both only in dev.
    name: 'spin-development-csp', apply: 'serve',
    transformIndexHtml: html => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5185 ws://localhost:5185 ws://[::1]:5185"),
  }],
  server: { host: '127.0.0.1', port: 5185, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
