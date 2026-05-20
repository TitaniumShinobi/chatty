# Avatar Error Handling QC

Recovery note, 2026-04-18: this QC file was recovered from `chatty123` and reframed for the current avatar hardening work. Treat it as an operator checklist, not proof that the current browser session has already passed.

## Goal

Avatar failures should be boring: missing images return a safe status, the UI renders a fallback, and the console does not fill with repeated broken image retries.

## Route Expectations

Unauthenticated shell checks:

```bash
BASE_URL="${BASE_URL:-http://localhost:5173}"
curl -i "$BASE_URL/api/ais/sera-001/avatar"
curl -i "$BASE_URL/api/gpts/sera-001/avatar"
```

Expected:

- `401` is acceptable when auth is required.
- `404` is acceptable for an authenticated request where the construct has no avatar.
- `200` is expected when an avatar exists and the user can access it.
- `500` is a failure for expected missing-avatar cases.

## UI Expectations

Run the browser with DevTools open and visit the AIs/GPTs surface.

Pass criteria:

- Known missing avatars render fallback initials/icons.
- Console shows at most one intentional failed fetch per unresolved avatar path during first load.
- No retry loop appends unbounded `?retry=N` query parameters.
- No stale blob URL is reused after `URL.revokeObjectURL`.
- Sidebar and GPTs page both suppress direct image rendering for avatars already classified as missing.

## Script

If `scripts/qa-avatar-endpoints.sh` is present and compatible with the current runtime, run it only against a non-mutating local or staging target:

```bash
BASE_URL="${BASE_URL:-http://localhost:5173}"
TOKEN="${TOKEN:-}" ./scripts/qa-avatar-endpoints.sh "$BASE_URL"
```

If the script requires live auth, scope the token/session to `devon_woodson_1774390416168`.

## Failure Classes

- `avatar-route-missing`: route returns `404` for the route itself rather than for the asset.
- `avatar-server-error`: expected missing avatar returns `500`.
- `avatar-retry-loop`: browser repeatedly re-requests a known-missing path.
- `avatar-blob-stale`: revoked blob URL is rendered again after failure.
