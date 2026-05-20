# VVAULT Troubleshooting

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/vvaultPaths.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/vvaultBridgeConfig.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md`

Supersedes:
- `docs/guides/VVAULT_TROUBLESHOOTING_GUIDE.md`

## Quick Checks

1. Confirm the VVAULT API/database route is reachable.
2. Confirm writes can be read back from VVAULT.
3. Confirm any local file is being used only as ingest input, dev runtime, cache, or archive evidence.
4. Confirm backend route health before assuming a storage-path failure.

## What To Verify First

- VVAULT API/database reachability
- VVAULT write/readback proof
- whether any local path is incorrectly acting as authority
- backend logs around module loading and path resolution
- whether the failure is an API/database issue or a non-authoritative local compatibility path issue

## Current Caveat

Some legacy docs still say `constructs/` and some code-backed paths still use `instances/`. Treat that as an active contradiction, not as user error.

Do not fix this contradiction by creating local folders. VVAULT authority is database write/readback proof.

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.
