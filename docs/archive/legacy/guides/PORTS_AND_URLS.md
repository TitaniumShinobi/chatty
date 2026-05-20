# Ports & URLs (Canonical)

For local development, Chatty uses a fixed, Vite‑native layout:

| Service | URL | Port |
|---------|-----|------|
| Frontend (Vite dev server) | http://localhost:5173 | 5173 |
| Backend (Express API) | http://localhost:5050 | 5050 |
| Proxy | Vite forwards `/api/*` to `http://localhost:5050` | — |

## Rules

1. **Do not change the frontend dev port from 5173.** This has been the canonical port since August 2025.
2. If ports need to be adjusted, align **backend, env files, docs, and proxy** to keep the frontend on 5173.
3. Any script or doc that mentions other frontend ports (3000, 5000, etc.) is outdated and should be updated to 5173.
4. Backend defaults to 5050 (`server/server.js`); keep the Vite proxy target in sync.
