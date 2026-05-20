# Local Startup

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/scripts/open-chatty-standalone.sh`
- `/Users/devonwoodson/Documents/GitHub/chatty/scripts/keep-running.sh`
- `/Users/devonwoodson/Documents/GitHub/chatty/package.json`

Supersedes:
- `docs/CHATTY_STARTUP_CONTRACT.md`
- `docs/guides/PORTS_AND_URLS.md`

## Recommended Path

Use `./bin/chatty` when you want the browser-first operator flow.

Expected behavior:

1. Reuse Chatty if it is already live on `5173`
2. Start the managed runtime if it is not live
3. Start or reuse Ollama on `11434` for the local Lin seat runtime by default
4. Wait for backend health on `5050`
5. Open the browser to `http://localhost:5173`

If you intentionally want Chatty to come up without the local Ollama lane, set `CHATTY_REQUIRE_OLLAMA=0` before launching.

## Raw Dev Paths

- `npm run dev` for frontend only
- `npm run server` for backend only
- `npm run dev:full` for foreground full stack
- `npm run runtime:up` and `npm run runtime:down` for the managed runtime
- For the terminal-first Chatty CLI path, use [chatty-cli.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/how-to/chatty-cli.md).

## Verification

- `http://localhost:5173` loads the app
- `http://127.0.0.1:5050/api/health` returns healthy backend status
- `http://127.0.0.1:11434/api/tags` returns the local model catalog when local Lin mode is required
- a second `./bin/chatty` run reuses the existing app
