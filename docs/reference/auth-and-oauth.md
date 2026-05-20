# Auth and OAuth

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/server/server.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/auth/auth-google.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/package.json`

Supersedes:
- `docs/OAUTH_SETUP.md`
- `docs/implementation/oauth/GOOGLE_OAUTH_SETUP.md`
- `docs/guides/AUTHENTICATION_SETUP_GUIDE.md`
- `docs/guides/GOOGLE_OAUTH_MASTER_TEMPLATE.md`
- `docs/rubrics/GOOGLE OAUTH MASTER TEMPLATE.md`

## Current Provider Status

- `google`: live OAuth flow with redirect and callback handling
- `apple`: recognized by provider status, but current route returns `501`
- `github`: recognized by provider status, but current route returns `501`
- `microsoft`: still appears in provider messaging and some client-side behavior, but it does not have a current canonical route surface in the backend
- `email/password`: supported through the current auth endpoints

## Current Route Surface

- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/google/health`
- `GET /api/auth/providers/:provider/status`
- `GET /api/auth/legal-docs`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/dev-login`
- `POST /api/auth/delete-account`
- `POST /api/logout`
- `GET /api/me`

## Current Local Rule

The current repo-wide local runtime contract is:

- frontend origin: `http://localhost:5173`
- backend API: `http://localhost:5050`

Some older OAuth docs assume the callback must always terminate on the backend port and some newer docs explain the frontend-proxy path. Keep the unresolved details visible in the audit packet until the runtime contract is simplified further.

## See Also

- [../README/contradictions.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/README/contradictions.md)
- [../how-to/authentication.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/how-to/authentication.md)
