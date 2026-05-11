# VVAULT and Storage

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/vvaultPaths.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/identityLoader.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/vvaultBridgeConfig.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md`

Supersedes:
- `docs/features/VVAULT_COMPLETE_GUIDE.md`
- `docs/architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md`
- `docs/implementation/CHATTY_USER_DIRECTORY_STRUCTURE.md`
- `docs/guides/VVAULT_TROUBLESHOOTING_GUIDE.md`
- `docs/rubrics/CHATTY_VVAULT_TRANSCRIPT_SAVING_RUBRIC.md`

## Current Code-Backed Facts

- Chatty has legacy/local path resolution code for dev/runtime compatibility.
- Local path resolution is not VVAULT authority and must not be used to claim sync, continuity, or readback proof.
- `server/lib/vvaultPaths.js` currently builds construct identity directory candidates under `instances/`, not `constructs/`; these are compatibility/materialization candidates, not permission to create new local truth.
- `server/lib/identityLoader.js` has historical filesystem fallback behavior. Treat that as implementation residue unless a current task explicitly changes it into ingest-only or removes it.

## Current Contradiction

The docs set still mixes `constructs/` and `instances/`.

- Code-backed path resolution currently favors `instances/`.
- Some architecture docs still describe `constructs/` as canonical.
- This file records the current implementation residue but does not silently erase the contradiction.
- The contradiction must not be resolved by creating new local folders. VVAULT authority remains database write/readback proof.

## Practical Boundary

- Construct files should be classified with [../standards/construct-file-classification-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/construct-file-classification-rubric.md) before cleanup, promotion, or capsule inclusion.

- Chatty app data, auth state, and UI behavior live in the Chatty repo/runtime.
- Construct identity and construct body data are VVAULT database concerns when available.
- Aurora belongs to VVAULT as the assistant for helping users with files and data, but this doc should not be read as claiming that full direct file editing is already available everywhere.
- Embedded fallback identities exist for a limited system set, but the current map also includes `nova-001`, which keeps the system-vs-user construct boundary ambiguous.

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.

## See Also

- [../README/contradictions.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/README/contradictions.md)
- [../how-to/vvault-troubleshooting.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/how-to/vvault-troubleshooting.md)
- [../standards/transcript-storage.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/transcript-storage.md)
- Construct file classification and cleanup rubric: [../standards/construct-file-classification-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/construct-file-classification-rubric.md)
