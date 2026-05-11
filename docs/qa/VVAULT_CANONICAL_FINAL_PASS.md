# VVAULT Canonical Recovery QA Checklist

Recovery note, 2026-04-18: the original `chatty123` source document described a historical `VVAULT_CANONICAL` final pass. Current `chatty` uses recovered VVAULT hydration, canonical editor sync, and Lin-only orchestration. This file is therefore a checklist for the current recovery state, not a claim that a fresh final pass has already been completed.

## Current Contract

- `chatty` is the only runtime target.
- `chatty123` remains read-only until the deletion-readiness ledger has no pending meaningful deltas.
- VVAULT can hydrate detail/editor data, but it must not overwrite non-empty local DB/cache fields.
- GPT Creator can sync canonical editor payloads through the VVAULT proxy/service path.
- Hydration cache is a temporary first-paint optimization, never persistence proof.
- Lin owns orchestration routing; construct identity remains distinct.

## Server Checks

Required static checks after VVAULT changes:

```bash
node --check server/routes/ais.js
node --check server/routes/gpts.js
node --check server/lib/vvaultHydration.js
node --check server/lib/vvaultRegistry.js
```

Route smoke:

```bash
BASE_URL="${BASE_URL:-http://localhost:5173}"
curl -i "$BASE_URL/api/health"
curl -i "$BASE_URL/api/ais"
curl -i "$BASE_URL/api/gpts"
curl -i "$BASE_URL/api/vvault/message"
```

Protected routes may return `401` from an unauthenticated shell. They must not 404 because route wiring disappeared.

## Editor Checks

In GPT Creator:

- Load an existing construct.
- Confirm only Lin is exposed as the orchestration mode.
- Save without changing identity fields and verify non-empty existing fields are preserved.
- Confirm VVAULT editor sync succeeds or reports an explicit VVAULT unavailable state.
- Reload and verify network/VVAULT truth replaces any first-paint cache.

## Account Scope

Before live validation, `/api/me` must resolve to `devon_woodson_1774390416168`. If it resolves to `devon_woodson_1762969514958`, stop and reset auth/session state before testing.

## Acceptance

This checklist passes only when VVAULT detail hydration, GPT Creator sync, route smoke, and account-scope checks all behave under the current `chatty` runtime without replacing `server/server.js` or `server/routes/vvault.js` from `chatty123`.
