# Canonical Truths

## Runtime and Ports

- Frontend dev URL is `http://localhost:5173`
- Backend dev API is `http://localhost:5050`
- `scripts/keep-running.sh` and `scripts/open-chatty-standalone.sh` are the launcher layer for the operator-facing startup path
- `package.json` defines `dev`, `dev:full`, `runtime:up`, `runtime:down`, `server`, `build`, and `electron:*` scripts

## Docs vs Code

- Root `README.md` now acts as a product/runtime entrypoint instead of duplicating the docs tree
- `docs/README.md` now acts as the thin docs navigator into the live sections
- `server/README.md` has been rewritten to match the live runtime contract
- the overloaded historical tree is preserved under `docs/archive/legacy/`

## Storage and Identity

- `server/lib/vvaultPaths.js` resolves construct identity directories under `instances/` candidate paths, including user-scoped and fallback directories
- `server/lib/identityLoader.js` clearly states the embedded fallback is for system constructs only
- The embedded fallback map currently includes `zen-001`, `lin-001`, and `nova-001`

## Auth and Provider Surface

- The backend supports Google auth in code, and also exposes Apple and GitHub provider paths/status checks
- `server/server.js` includes Microsoft-facing behavior in the auth flow and provider messaging
- The docs set still needs one canonical explanation of which providers are fully supported, feature-flagged, or legacy
