# Runtime and Ports

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/package.json`
- `/Users/devonwoodson/Documents/GitHub/chatty/scripts/keep-running.sh`
- `/Users/devonwoodson/Documents/GitHub/chatty/scripts/open-chatty-standalone.sh`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/server.js`

Supersedes:
- `docs/CHATTY_STARTUP_CONTRACT.md`
- `docs/guides/PORTS_AND_URLS.md`
- the startup sections previously duplicated in `README.md`

## Dev Ports

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5050`
- Backend health: `http://127.0.0.1:5050/api/health`

## Primary Commands

- `./bin/chatty` for operator-facing startup
- `./bin/chatty-cli` for the operator-facing terminal CLI
- `npm run dev` for frontend-only Vite
- `npm run server` for backend-only
- `npm run dev:full` for raw foreground full stack
- `npm run cli` for the raw repo-local Chatty CLI
- `npm run terminal` as an alias for the same raw CLI path
- `npm run runtime:up` for the managed background runtime
- `npm run runtime:down` to stop the managed runtime

## Contract

- The browser entrypoint is `5173`.
- The launcher should only report success after the backend is healthy.
- The global `chatty-cli` command should resolve to the same wrapper as `./bin/chatty-cli`.
- The CLI should keep file operations rooted to the caller directory and keep persistent state under `~/.chatty-cli/`.
- Docs that mention frontend `3000` or backend `5000` as the default local web runtime are historical and not canonical for the current repo.

## See Also

- [../how-to/local-startup.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/how-to/local-startup.md)
- [../how-to/chatty-cli.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/how-to/chatty-cli.md)
- [../reports/closure-ledger-2026-04-07.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reports/closure-ledger-2026-04-07.md)
