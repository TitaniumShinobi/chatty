# API Health, Avatar, and TTS QA Notes

Recovery note, 2026-04-18: this document was recovered from `chatty123` and updated for the current `chatty` runtime. Older source notes referenced direct backend ports and pre-recovery assumptions. Current local smoke should prefer the active app origin, usually `http://localhost:5173`, unless a test intentionally targets the backend directly.

## Scope

Use this checklist to verify that core API health, avatar loading, and TTS endpoints fail safely and do not regress into 500s or client retry loops.

Live authenticated checks must use the life account `devon_woodson_1774390416168`. Historical `devon_woodson_1762969514958` references are recovery aliases only, not valid live-test defaults.

## Local Smoke

```bash
BASE_URL="${BASE_URL:-http://localhost:5173}"
curl -i "$BASE_URL/api/health"
curl -i "$BASE_URL/api/ais"
curl -i "$BASE_URL/api/gpts"
curl -i "$BASE_URL/api/voice/help"
```

Expected unauthenticated behavior:

- `/api/health` returns `200`.
- Auth-protected list/detail routes may return `401`.
- Protected routes must not return `404` because the route is missing.
- Protected routes must not return `500` for normal unauthenticated access.

## Avatar Checks

Unauthenticated avatar requests may return `401` depending on active auth policy. Authenticated missing avatars should return `404`, not `500`.

```bash
BASE_URL="${BASE_URL:-http://localhost:5173}"
curl -i "$BASE_URL/api/ais/sera-001/avatar"
curl -i "$BASE_URL/api/gpts/sera-001/avatar"
```

UI regression checks:

- A missing avatar must fall back to initials or a stable placeholder.
- The UI must not keep appending `?retry=N` forever.
- Blob URLs must not be retried after revocation.
- Direct `<img src="/api/ais/.../avatar">` rendering should be suppressed once an avatar is known missing.

## TTS Checks

TTS availability depends on local voice configuration. A missing provider may return `401`, `404`, or `503` depending on route/auth state, but it should not return `500` for a normal unavailable-provider condition.

```bash
BASE_URL="${BASE_URL:-http://localhost:5173}"
curl -i "$BASE_URL/api/tts"
```

## Acceptance

This checklist passes when health is stable, protected routes fail safely, avatar misses do not produce retry storms, and TTS unavailability is explicit rather than an unhandled server error.
