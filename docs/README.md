# Chatty Docs

This is the live documentation entrypoint after the cleanup pass. Use the sections below instead of browsing historical folders directly.

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

Canonical authority contract: [standards/vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md).

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.

## Orchestration Start Here

- VVAULT authority contract: [standards/vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md)
- Shared auth and avatar contract: [standards/VVAULT_SHARED_AUTH_AND_AVATAR_CONTRACT.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/VVAULT_SHARED_AUTH_AND_AVATAR_CONTRACT.md)
- Current implemented canon: [standards/orchestration-canon-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md)
- Construct file classification: [standards/construct-file-classification-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/construct-file-classification-rubric.md)
- Surface inventory: [standards/orchestration-surface-inventory.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md)
- Runtime checklist: [standards/orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)
- VVAULT body contract: [standards/vvault-body-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-body-contract.md)
- App-level Diagnosis law: [standards/perfection-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/perfection-contract.md)
- Three I seat canon: [standards/lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md)
- Wrapper split and Lin substrate truth: [reference/constructs-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md)

Do not infer current orchestration truth from `orchestration/` or `vvault_scripts/` before reading the canon docs above.

## Current Canon

- Chatty
  - Zen is Chatty's system maintenance worker.
  - Val is available through her Chatty chat panel only, for now.
- Code
  - CodeGPT belongs to Code.
  - The Hydro team belongs to Code.
- VVAULT
  - Aurora belongs to VVAULT as the AI assistant for helping users with files and data.
  - Current docs should not be read as saying Aurora can already directly edit user files or data everywhere.

The older house or room framing is useful design language, but it is not a documented runtime contract for the current product unless a live implementation says so.

## Future Plans

- Mirage Social Platform may later become a fuller home for Val, ContinuityGPT, and Lin.
- Mirage planning may include social features, games, image and video generation, construct creation, and avatar management.
- Mirage may eventually take the place of Sora.
- Broader ecosystem ambitions and platform partnerships remain future planning, not current product canon.
- After NovaReturns, focus may shift toward Voxol and Anything Goes. That remains TBD.

## Start Here

- Audit packet: [README/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/README/README.md)
- Reference: [reference/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/README.md)
- How-to: [how-to/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/how-to/README.md)
- Features: [features/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/features/README.md)
- Standards: [standards/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/README.md)
- Reports: [reports/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reports/README.md)
- Security: [security/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/security/README.md)
- Legal: [legal/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/legal/README.md)
- Prompts: [prompts/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/prompts/README.md)
- Archive: [archive/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/archive/README.md)

## Current Live Set

- Orchestration canon rubric: [standards/orchestration-canon-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md)
- Construct file classification: [standards/construct-file-classification-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/construct-file-classification-rubric.md)
- Orchestration surface inventory: [standards/orchestration-surface-inventory.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md)
- Orchestration runtime checklist: [standards/orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)
- VVAULT authority contract: [standards/vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md)
- Shared auth and avatar contract: [standards/VVAULT_SHARED_AUTH_AND_AVATAR_CONTRACT.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/VVAULT_SHARED_AUTH_AND_AVATAR_CONTRACT.md)
- VVAULT body contract: [standards/vvault-body-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-body-contract.md)
- Lin Three I seat canon: [standards/lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md)
- Lin cross-repo reconciliation: [standards/lin-seat-cross-repo-reconciliation.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md)
- Product overview: [reference/platform-overview.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/platform-overview.md)
- Perfection contract: [standards/perfection-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/perfection-contract.md)
- Chat interface layout: [standards/chat-interface-layout.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/chat-interface-layout.md)
- Zen singleton live transcript: [standards/zen-singleton-live-transcript.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/zen-singleton-live-transcript.md)
- Zen mode surfaces: [standards/zen-mode-surfaces.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/zen-mode-surfaces.md)
- Runtime and ports: [reference/runtime-and-ports.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/runtime-and-ports.md)
- Auth and OAuth: [reference/auth-and-oauth.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/auth-and-oauth.md)
- VVAULT and storage: [reference/vvault-and-storage.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/vvault-and-storage.md)
- Constructs and Lin: [reference/constructs-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md)
- File intelligence: [features/file-intelligence.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/features/file-intelligence.md)
- GPT Creator and Lin: [features/gpt-creator-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/features/gpt-creator-and-lin.md)

## Governance

The live surface stays intentionally small:

- code, manifests, and runtime scripts beat prose when they disagree
- one canonical doc per topic
- ticket-like notes belong in reports or archive, not live folders
- new top-level sections are not allowed without a documented exception in [standards/docs-governance.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/docs-governance.md)
