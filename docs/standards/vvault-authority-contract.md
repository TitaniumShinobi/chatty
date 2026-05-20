# VVAULT Authority Contract

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, construct identity avatars, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.
- Serving `/api/vvault/conversations/index` from stale Supabase/local fallback as if it were canonical VVAULT readback = fail.
- Letting stale local Chatty `ais` or `gpts` rows decide whether a VVAULT-backed construct avatar exists = fail.
- Dropping or ignoring `instances/:construct/identity/avatar.webp` = fail.

## Agent Operating Contract

- Codex session files, exported transcripts, downloaded markdown, and desktop app logs are ingest sources only.
- A successful sync means the material was written to VVAULT and read back from VVAULT.
- A successful conversation index means Chatty read the live VVAULT conversation/body authority, not just a legacy Supabase timeout path or local deferred fallback rows.
- Runtime topology is defined separately by [chatty-vvault-twin-door-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/chatty-vvault-twin-door-contract.md). Chatty and VVAULT own that twin-door contract; `auth/` does not.
- A local path may be cited as evidence of where input came from, but it is not the storage destination or continuity authority.
- Legacy docs that mention `instances/.../chatty`, local VVAULT folders, Supabase, ChromaDB, or transcript markdown must be treated as historical/provenance material unless a current live standard says otherwise.
- New docs, scripts, tests, and runbooks must preserve this boundary explicitly.
- Avatar and contact rendering must follow [VVAULT_SHARED_AUTH_AND_AVATAR_CONTRACT.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/VVAULT_SHARED_AUTH_AND_AVATAR_CONTRACT.md). If only one avatar renders, debug VVAULT identity rows and stale local blockers before changing frontend UI.

## Required Receipt Language

Use this wording when reporting VVAULT sync or continuity work:

```txt
VVAULT_AUTHORITY: cloud/VVAULT-owned database
LOCAL_FILES_USED_AS: ingest-only | dev-runtime | cache | archive-evidence | none
DB_WRITE_CONFIRMED: yes | no
DB_READBACK_CONFIRMED: yes | no
LOCAL_FALLBACK_USED_AS_TRUTH: no
BLOCKED_REASON: only if DB write/readback was unavailable
```
