# Voice V1 Ship Checklist

Recovery note, 2026-04-18: recovered from the `chatty123` root docs and moved under `docs/voice/` for the active `chatty` runtime. Live validation must be scoped to `devon_woodson_1774390416168`.

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

## Local Gate

```bash
npm run build
npm run watchdog:check
node --check server/routes/voiceUpload.js
```

Required route smoke:

```bash
BASE_URL="${BASE_URL:-http://localhost:5173}"
curl -i "$BASE_URL/api/voice/help"
curl -i "$BASE_URL/api/voice/audit"
curl -i "$BASE_URL/api/voice/trim"
curl -i "$BASE_URL/api/voice/save"
```

Unauthenticated requests may return `401` or method-specific errors. They must not 404 because the route is absent.

## Browser Gate

- Open GPT Creator.
- Load an existing construct.
- Confirm Lin-only orchestration UI.
- Open Voice Lab.
- Open Voice Lab help.
- Upload or select a safe reference audio file.
- Run audit.
- Trim if the file has silence.
- Preview if the provider is available.
- Save.
- Reload and confirm saved voice metadata remains attached to the construct.

## Persistence Gate

The UI alone is not proof. Confirm canonical metadata from the VVAULT database after save.

Pass criteria:

- The construct's voice metadata survives reload.
- The saved reference belongs to the selected construct.
- The operation does not mutate another construct.
- The route returns an explicit unavailable/error state if provider dependencies are missing.

## Release Blockers

- Voice metadata saved only in React state.
- Provider errors hidden behind a successful UI toast.
- Voice asset stored under the wrong construct path.
- Non-Lin orchestration value reintroduced by creator save.
- Live checks accidentally use `devon_woodson_1762969514958`.
