# Spin desktop

Spin on the PC: the same library as the phone app ([spin-ios](https://github.com/Toomiiverse/spin-ios)), streamed
from Jellyfin on haruserver, laid out like a Zenless Zone Zero agent screen with Haru on the card. Electron, React,
TypeScript, Vite; Windows.

## Start

    npm install
    npm run dev        # Vite on 5185 plus Electron
    npm run package    # release/Spin Setup 0.1.0.exe

Pushes build the installer on GitHub Actions (`build.yml`); it is the `Spin-windows` artifact.

## How it fits together

- **The main process owns every HTTP call and the token.** `electron/jellyfin.ts` talks to Jellyfin
  (`https://haruserver.tail6da04d.ts.net:8920`); `electron/sources.ts` talks to yubal and spin-sources
  (`…:8930`, `…:8930/sources`), which send no CORS headers, so a renderer could not. The renderer gets JSON over
  `spin:*` IPC (`electron/preload.ts`) and only ever loads `<audio src>` and `<img src>` itself.
- **Streams are the file itself** (`/Audio/{id}/stream?static=true`): Chromium plays mp3, aac, flac and wav
  directly. If one fails to decode, the same song is asked for again as AAC. The phone's HLS route does not play
  in Chromium.
- **The deck's rules** (`src/transport.ts`) are the phone's: next wraps, previous goes back only in the first
  three seconds, repeat off stops at the end of the disc, shuffle keeps the current song first. `npm test` pins them.
- **Haru** is her portrait screen from haru-desktop (the rig on her vertical monitor: `PortraitWindow` and its
  art), copied verbatim into `haru/` by `node scripts/sync-haru.mjs`. Run it again when her portrait changes.
  `src/haru.ts` stands in for haru-desktop's bridge and feeds it only a mood and the pointer.
- **Settings** live in `%APPDATA%\Spin\config.json`; the token is encrypted by Windows (`safeStorage`) and is
  forgotten on a 401.
- **Playlists** are Jellyfin's. **Add music** searches YouTube Music and SoundCloud through spin-sources, downloads
  through yubal (YouTube) or spin-sources (SoundCloud), and polls both job lists every two seconds. **Edit**, cover
  and **delete** go through spin-sources, which only accepts a Jellyfin administrator's token.

## Checks

`npm test` is the queue and clock logic. Everything else you check by playing a song: the deck spins, the
counter and up-next ring follow the queue, media keys work with the window in the background.
