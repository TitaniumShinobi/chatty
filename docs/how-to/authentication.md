# Authentication

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/server/server.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/auth/auth-google.js`

Supersedes:
- `docs/OAUTH_SETUP.md`
- `docs/implementation/oauth/GOOGLE_OAUTH_SETUP.md`
- `docs/guides/AUTHENTICATION_SETUP_GUIDE.md`

## Current Local Setup

- Frontend origin: `http://localhost:5173`
- Backend API: `http://localhost:5050`
- Google is the only OAuth provider with a live redirect/callback flow

## Basic Checks

1. Confirm backend is running on `5050`
2. Confirm frontend is running on `5173`
3. Check provider status at `/api/auth/providers/google/status`
4. If Google login fails, inspect the exact callback/origin values emitted by the current runtime before changing any console settings

## Important Rule

Do not trust older docs that hardcode `3000` or assume every callback always terminates on the same port. Check the current runtime first, then update provider configuration to match it.
