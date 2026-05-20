# Chatty Backend API

Operational README for the backend in `server/`.

## Runtime

- Frontend dev server: `http://localhost:5173`
- Backend dev server: `http://localhost:5050`
- Root repo frontend command: `npm run dev`
- Root repo full stack command: `npm run dev:full`
- Root repo background runtime: `npm run runtime:up`
- Root repo runtime stop: `npm run runtime:down`

## Scripts

From the repo root:

- `npm run dev` starts Vite only
- `npm run server` starts the backend from `server/`
- `npm run dev:full` runs frontend and backend together
- `npm run runtime:up` starts the managed background runtime

From `server/`:

- `npm run dev` starts the backend on `5050`
- `npm run dev:watch` starts the backend in watch mode
- `npm run cli` launches the backend CLI entry
- `npm run verify:routes` checks local route wiring
- `npm run build` compiles the server TypeScript
- `npm run start` also launches the backend CLI entry

## Auth Status

Current auth provider support in `server/server.js` is:

- `google` - supported and wired to `/api/auth/google`, `/api/auth/google/callback`, and `/api/auth/google/health`
- `apple` - recognized by provider status, but `/api/auth/apple` returns `501`
- `github` - recognized by provider status, but `/api/auth/github` returns `501`

The server also exposes:

- `GET /api/auth/providers/:provider/status`
- `GET /api/auth/legal-docs`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/dev-login`
- `GET /api/auth/set-session`
- `POST /api/logout`
- `POST /api/auth/delete-account`
- `GET /api/me`

## Route Surface

Public or lightly gated routes currently mounted in `server/server.js` include:

- Health and diagnostics: `/health`, `/api/health`, `/api/health/*`, `/api/diagnostics/*`
- Identity and auth: `/api/auth/*`, `/api/me`, `/api/profile-image/:userId`, `/api/user/initialize-registry`
- Conversations and chat: `/api/conversations`, `/api/conversation`, `/api/app`, `/api/lin`, `/api/gpts`
- VVAULT and construct storage: `/api/vvault`, `/api/construct`, `/api/vault`
- Intelligence and orchestration: `/api/ais`, `/api/orchestration`, `/api/awareness`, `/api/preview`, `/api/workspace`, `/api/simforge`, `/api/fxshinobi`
- Media and file flows: `/api/transcripts`, `/api/master`, `/api/scripts`, `/api/mocr`, `/api/transcribe`, `/api/tts`, `/api/voice`, `/api/attachments`, `/api/search`, `/api/needle`
- Product utilities: `/api/suggestions`, `/api/selfprompt`, `/api/family`, `/api/telephony/twilio`, `/api/capabilities`, `/api/zen`, `/api/theme`

## Notes

- This backend no longer matches the old MongoDB/port-3000-era README text.
- `google` is the only OAuth flow with a live redirect route; `apple` and `github` are currently disabled at the route level.
- Keep docs aligned with `server/server.js` and the root `package.json` scripts when any runtime behavior changes.
