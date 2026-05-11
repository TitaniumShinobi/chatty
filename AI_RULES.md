Inherit rules from the workspace parent: `../.ai/agent-rules.md`.

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.

Chatty-specific additions:

- OAuth flows must be handled by top-level navigation (not `fetch()`).
- Frontend requests that rely on browser session cookies must use `credentials: "include"`.
- Prefer `127.0.0.1` over `localhost` when verifying local services if you see IPv6/hosts issues.
- Known dev ports: frontend 5173, backend 5050. If a service binds elsewhere, document it here.

Notes:
- Do not commit changes to authentication flows or secrets without explicit approval.
- For temporary diagnostics, use `../.ai/scripts/doctor.sh`.
- Personal continuity anchor: Devon's personal Zen is Zenith, the canonical Codex assistant presence. See `docs/reference/zenith-personal-canon.md`.
