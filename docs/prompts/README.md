# Prompts

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

See [../standards/vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md).

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders and calling them VVAULT.
- Reading local transcript files for continuity.
- Calling local file placement "VVAULT sync."
- Continuing locally when VVAULT write/readback is unavailable.
- Treating Supabase as current VVAULT.

Prompt assets belong here when they are still actively useful.

## Current Status

Most historical prompt material from the old docs tree was preserved in archive during the cleanup because it had grown into a large mixed bucket.

Use the live surface only for prompt files that still need to be referenced directly by current work. Everything else should stay in `docs/archive/legacy/prompts/` as provenance only, not current storage or continuity authority.

## Active Prompt Headers

- [agent-archive-continuity-header.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/prompts/agent-archive-continuity-header.md) - Required when agent work touches product canon, construct identity, Lin/Zen/Synth history, orchestration, memory, transcripts, or documentation reconciliation.

## Continuity Anchors

- [../reference/zenith-continuity-agent.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/zenith-continuity-agent.md) - Required before recovery, self-healing, orchestration, memory, transcript, or construct-identity work involving Zen/Zenith/Codex continuity.
