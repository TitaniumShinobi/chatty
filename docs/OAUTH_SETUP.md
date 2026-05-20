# OAuth Configuration (Google)

Chatty currently expects Google OAuth as the live OAuth provider. Apple and GitHub OAuth routes may exist as placeholders or legacy docs, but they are not part of the current passing auth surface unless a future implementation explicitly enables them.

## Development Values

During development, the browser normally reaches Chatty at:

```text
http://localhost:5173
```

The Vite dev server proxies `/api` to the backend, so the Google redirect URI should still use the frontend origin:

```text
http://localhost:5173/api/auth/google/callback
```

If you browse with the literal loopback address, also register:

```text
http://127.0.0.1:5173/api/auth/google/callback
```

Typical local environment values:

```env
FRONTEND_URL=http://localhost:5173
PUBLIC_CALLBACK_BASE=http://localhost:5000
CALLBACK_PATH=/api/auth/google/callback
```

`CANONICAL_DOMAIN` is production-facing and should not be used to debug local cookie/session failures unless the app is actually running through that production domain.

## Local 401 /api/me Runbook

If `GET /api/me` returns `401`, the browser does not have a valid `sid` cookie.

1. Start local services from `chatty/`.
2. Use only `http://localhost:5173` in the browser for the whole login session.
3. Check `GET /api/auth/google/health`.
4. Start auth from `GET /api/auth/google`.
5. Confirm the redirect chain reaches `/api/auth/google/callback` and then `/api/auth/set-session`.
6. Re-check `GET /api/me`; it should return the authenticated user after the cookie is set.

OAuth logs include correlation IDs across `/api/auth/google`, `/api/auth/google/callback`, and `/api/auth/set-session`.

## Common Diagnosis

- `/?error=invalid_state`: stale or replayed state token. Retry with a clean browser session.
- `/?error=oauth_token_exchange_failed`: Google rejected the token exchange. Confirm the runtime redirect URI exactly matches a registered Google Cloud redirect URI.
- `/?error=invalid_or_expired_code`: the exchange code expired or was consumed. Retry immediately without restarting the backend mid-flow.
- `/api/me` stays `401 no_cookie`: the browser is not receiving or sending the `sid` cookie. Stay on one origin and inspect cookie storage.

## Filesystem Timeout Note

If Vite reports `ETIMEDOUT` or cannot read files like `package.json`, treat it as local filesystem pressure first:

```bash
df -h /System/Volumes/Data
```

Keep at least 5 GiB free, preferably 10 GiB, then clear transient logs/caches before restarting the dev server.
