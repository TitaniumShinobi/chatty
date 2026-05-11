# OAuth Configuration (Google)

This project uses Google OAuth for user authentication.  A common source of
confusion is the set of **Authorized redirect URIs** that must be registered in
the Google Cloud Console.  Once the client is created you *must* add every URI
that the application might use, including development addresses.  The server
generates the redirect value at runtime from environment variables, which are
usually set via `.env`.

## Development values

During development the server will advertise a redirect URI that matches
whatever origin the browser used to reach the app, provided that origin is
`localhost:5173` or `127.0.0.1:5173`.  Vite’s dev server proxies `/api` to the
backend on port 5050, so even though the URI appears to point at the frontend,
the request actually ends up at the server where the session cookie is set.

Typical `.env` entries look like:

```env
# in chatty/.env (or equivalent)
CANONICAL_DOMAIN=localhost:5000       # used by production only
FRONTEND_URL=http://localhost:5173    # where the React app is served
PUBLIC_CALLBACK_BASE=http://localhost:5000
CALLBACK_PATH=/api/auth/google/callback
```

Given that configuration the `redirect_uri` sent to Google will be either

```
http://localhost:5173/api/auth/google/callback
```

or

```
http://127.0.0.1:5173/api/auth/google/callback
```

(depending on whether the browser used the literal 127 address).  Make sure
that one or both of those strings is registered in the Google Cloud Console
under **Authorized redirect URIs** for your OAuth client.  The frontend origin
entries under “Authorized JavaScript origins” may remain as `http://localhost:5173`.

Optionally, you can also add the backend URI
`http://localhost:5050/api/auth/google/callback` if you ever run the server
without the Vite proxy, but it is not required for normal local development.

As of the time of writing, the console for the `Chatty` web client should
include at least the development callback plus whatever production/replit
URIs you use, for example:

```
http://localhost:5050/api/auth/google/callback
https://chatty.thewreck.org/api/auth/google/callback
# (plus any preview URLs or other domains you run on)
```

These entries are *static* and do not update automatically; changes can take
several minutes to propagate, and the console will continue to display the
previous values until Google’s backend has finished syncing.  Once the correct
URI is present, it will not be necessary to re‑explain this in the future.

## Notes for maintainers

- If you add new environments (e.g. another Replit preview URL, a staging
  domain, etc.), make sure to add the corresponding redirect URI here.
- Setting `CANONICAL_DOMAIN`/`REPLIT_DEV_DOMAIN` affects which URI the server
  advertises; `'localhost:5173'` is only valid when running the frontend at
  that host.
- The code contains debug logging at startup (`REDIRECT_URI`,
  `REPLIT_REDIRECT_URI`) and in the `/api/auth/google` handler, which can be
  used to confirm the value being sent to Google.
- After editing the Cloud Console, wait ~5‑10 minutes before retrying a login;
  the warning shown on the Google page about propagation delay is accurate.

Documenting this once in the repo should eliminate repeated questions.

## Local `401 /api/me` runbook (no URI changes)

If `http://localhost:5173/api/me` returns `401`, the browser does not have a
valid `sid` cookie yet. Run this sequence exactly:

1. Start local services from `chatty/` with `npm run dev:full`.
2. Use only `http://localhost:5173` in the browser for that session.
3. Verify health endpoint:
   - `GET /api/auth/google/health`
   - Check `oauth_configured`, `client_id_present`, `client_secret_present`,
     and `effective_local_redirect_uri`.
4. Start auth from `GET /api/auth/google`.
5. Confirm redirect chain:
   - `/api/auth/google` -> Google (`302`)
   - `/api/auth/google/callback?...` (`302`)
   - `/api/auth/set-session?code=...` (`302`, sets `sid`)
6. Re-check `GET /api/me` (should be `200` after cookie is set).

### Correlation ID tracing

OAuth logs now include a correlation token (`cid`) threaded across:

- `/api/auth/google`
- `/api/auth/google/callback`
- `/api/auth/set-session`

Look for log tags like `[cid:abc123...]` to follow one login attempt end-to-end.

### Branch diagnosis map

- `/?error=invalid_state` after callback:
  stale/replayed state token. Retry with a fresh incognito window and one active login attempt.
- `/?error=oauth_token_exchange_failed`:
  Google token exchange rejected. Confirm `effective_local_redirect_uri` from `/api/auth/google/health` matches the runtime callback URI.
- OAuth callback log includes `users.findOneAndUpdate() buffering timed out`:
  Mongo is unavailable during login. Chatty now falls back to in-memory user upsert in local/dev mode so callback can continue to session issuance.
- `/?error=invalid_or_expired_code` from `/api/auth/set-session`:
  exchange code expired or stale. Retry immediately and avoid restarting backend between callback and set-session.

## Vite `ETIMEDOUT` read failures runbook (overlay stays enabled)

If Vite shows errors like `ETIMEDOUT ... readFileHandle` or
`Cannot read file "package.json": operation timed out`, treat this as a local
filesystem pressure issue first, not an OAuth issue.

1. Check free space on the data volume:
   - `df -h /System/Volumes/Data`
2. Enforce guardrails:
   - hard floor: keep at least `5 GiB` free
   - preferred: keep at least `10 GiB` free
3. If below threshold, clean safe transient files first:
   - stale `/tmp/chatty-*.log` and `/tmp/chatty-*.pid`
   - `node_modules/.vite`
   - optionally `npm cache clean --force` if still constrained
4. Re-test raw reads from `chatty/`:
   - `node -e "const fs=require('fs');(async()=>{for(let i=0;i<30;i++)await fs.promises.readFile('index.html');console.log('ok')})().catch(e=>{console.error(e);process.exit(1)})"`
   - `node -e "const fs=require('fs');(async()=>{for(let i=0;i<30;i++)await fs.promises.readFile('package.json');console.log('ok')})().catch(e=>{console.error(e);process.exit(1)})"`
5. Restart with `npm run dev:full` and verify no recurring `ETIMEDOUT` in logs.

Keep `server.hmr.overlay` enabled so real failures stay visible.
