# Chatty Electron Packaging Guide

This guide captures how the Quantum Electron shell wraps the existing Chatty workspace into a cross-platform desktop experience (macOS `.dmg`, Windows `.exe`, and Linux AppImage). The shell launches both the Vite frontend and Express backend, keeps them alive, and offers Safari-inspired chrome with sidebar awareness.

## Prerequisites

1. `npm install` (project root). `electron`, `electron-builder`, `ts-node`, and `wait-on` are installed via `devDependencies`.
2. Build the web client: `npm run build`. The production server serves `dist/` assets from `server/server.js`.
3. Ensure `scripts/envSnapshot.js` exists (see Environment Snapshots section) and is runnable.

## Running in Development

```bash
npm run electron:dev -- --mode=dev
```

- Spawns `npm run dev:full` (Vite + Express) as a background process and waits for `http://localhost:5173` and `http://localhost:3000/api/health` before showing the window.
*- `--snapshot-before-launch` can be appended to run `scripts/envSnapshot.js --tag=electron-shell` before the UI appears.*
*- The shell uses `titleBarStyle: 'hiddenInset'`, vibrancy, and a wide viewport to emulate the Safari+Codex aesthetic with a consistent sidebar load area.*

## Running a Production Build

```bash
npm run build
npm run electron:prod -- --mode=prod
```

The shell waits for `http://localhost:3000/api/health` (the Express backend that serves the built assets) and then loads `http://localhost:3000`. The background process launched is `npm run start:prod`.

## Packaging for Distribution

1. Compile the Electron entry point:
   ```bash
   npm run electron:compile
   ```
   This runs `tsc -p electron/tsconfig.json` and emits `electron/dist/main.js`.
2. Package installers:
   ```bash
   npm run electron:package
   ```

`electron-builder` reads `electron/electron-builder.yml` and produces:

| Platform | Output |
| --- | --- |
| macOS | `build_electron/*.dmg` |
| Windows | `build_electron/*.nsis.exe` |
| Linux | `build_electron/*.AppImage` |

Auto-update metadata is staged under `publish.url` (`https://assets.thewreck.org/chatty/releases`). No App Store signing is configured; add custom `entitlements` or `certificate` entries in `electron-builder.yml` when necessary.

## Additional Flags

- `--mode=dev|prod` (default `dev`) controls which npm script runs.  
- `--snapshot-before-launch` runs the environment snapshot routine before spawning the backend.

## New UI Considerations

- The Electron shell now exposes the same `chatty/` folder structure so the sidebar (threads/automations/skills) renders inside the BrowserWindow just as it would in Safari.  
- The shell ships with a transparent-ish background color (`#080808`) and hidden inset traffic lights to mimic Safari’s look and the Codex app aesthetic.  
- Any external packaging steps (icons, auto-update URLs, publishing to `.zip`/`.dmg`) should still point to the `build_electron/` output folder.

## Runbook Notes

- Before signing/building on CI, ensure `npm run build` and `npm run electron:compile` succeed locally.  
- If the snapshot script changes, append new tags/metadata to the `scripts/envSnapshot.js` CLI so Electron can request fresh state with `--snapshot-before-launch`.  
- Updating `WEBSITE_TO_APP_WRAP.md` keeps downstream developers aligned with packaging options (Nativefier/Electron/Plash) and how this `electron` workflow replaces prior Automator-only instructions.
