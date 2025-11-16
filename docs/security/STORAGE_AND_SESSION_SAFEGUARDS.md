## Storage & Session Safeguards (Priority Actions)

This document lists pragmatic, prioritized safeguards to prevent localStorage quota crashes, enforce per-user isolation, and improve recovery and monitoring.

1) Client-side: Backend-first, small cache only
- Principle: Never treat localStorage as the primary persistence. The server is the source-of-truth.
- Implementations:
  - Cache at most N recent conversations (N=10). Drop heavy fields (attachments, blobs) before caching.
  - Before large writes, measure size with TextEncoder or Blob and refuse writes > 256KB per key.
  - When StorageManager API available, call `navigator.storage.estimate()` and avoid writes if remaining quota < 200KB.
  - Avoid automatic timestamped backups written on every save in production.

2) Client-side: Safe failure flows & UX
- Show a storage-failure modal when quota is low or write fails (QuotaExceededError). Offer options:
  - Emergency Cleanup (legacy backup key sweep)
  - Download conversation (JSON)
  - Try save to server (POST /api/conversations or /api/debug/save-backup in dev)
  - Copy to clipboard

3) Server-side: Enforce auth + user scoping
- Always require authentication middleware on data endpoints (POST/GET /api/conversations, /api/gpts, /api/triples).
- Always use server-side user id from auth (e.g., `req.user.sub`) when querying/updating DB. Never accept client-provided user ids.
- Normalize token shapes in auth middleware so `req.user.sub` is always set.

4) Sessions & Cookies
- Use HttpOnly, Secure cookies for session tokens. For dev on http://localhost use Secure=false but only in development.
- Set SameSite=Lax (or Strict if no cross-site flows needed).
- Implement short-lived access tokens with refresh policy (or server sessions); avoid storing long-lived tokens in localStorage.

5) Monitoring / Telemetry
- Add a minimal telemetry endpoint for storage events (non-PII) and emit events for:
  - Quota write failures
  - Storage estimate low thresholds
  - Emergency cleanup triggers
- Feed telemetry to a metrics sink (Prometheus, Datadog) in production.

6) Recovery tooling (Dev & Ops)
- Provide dev-only endpoints to save/list/load JSON backups to a safe folder (`server/debug_backups/`) protected by auth and NODE_ENV checks.
- Provide an operator-run `recover-conversations.js` script that can rehydrate backups into the production DB (operator-only).
- Document recovery steps in README and `commits.md` (Project State Ledger) for traceability.

7) Tests & CI
- Add automated tests:
  - Unit: conversationManager size checks and ensureCacheLimit behavior
  - Integration: POST/GET conversation isolation test using curl cookie jars (test-user-isolation.js)
  - E2E: tools/e2e/test_conversations.js to register, save, and load conversations
- Run tests in CI on PRs and fail PRs that touch storage/auth code without tests.

8) Quick checklist for PR reviewers
- Verify no new runtime backups are added to localStorage in changed files.
- Ensure every data route references `req.user.sub` and not a client id.
- Verify cookies set in server use HttpOnly and SameSite flags (secure true in production).
- Confirm new endpoints added for dev-only are gated by NODE_ENV !== 'production'.

9) Low-level defensive patterns
- Wrap all localStorage writes in try/catch. On failure, call an optional global `onStorageFailure` handler so UI can respond.
- Use `TextEncoder().encode(JSON.stringify(obj)).length` to approximate bytes for checks.
- Use graceful backoff and single rescue save-to-server on repeated client failures.

10) Follow-ups (next small tasks)
- Document the `/api/debug` endpoints with usage examples and restore instructions.
- Add a small `npm run test:isolation` script that runs the cookie-jar isolation test locally.
- Gate verbose dev logging behind NODE_ENV.

If you'd like, I can implement the README doc for `/api/debug` usage and the `test:isolation` script next.
