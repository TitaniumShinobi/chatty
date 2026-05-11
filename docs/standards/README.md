# Standards

Contracts, invariants, and governance live here.

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

## Orchestration Start Here

- [vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md) - source authority rule for VVAULT sync, transcript, continuity, and readback proof
- [orchestration-canon-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md) - defines the canonical `chatty-cli` operator/core surface and the canonical `/api/vvault/message` runtime route it delegates into
- [orchestration-surface-inventory.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md) - explicit repo map for canonical, transitional, helper-only, legacy, archive, and dangerous residue surfaces
- [orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md) - receipt-backed runtime contract for construct-quality turns
- [vvault-body-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-body-contract.md) - VVAULT body ownership law for conversation reads/writes during the Supabase migration
- [perfection-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/perfection-contract.md) - app-level Diagnosis law and signed-in page "alive" contract
- [construct-file-classification-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/construct-file-classification-rubric.md) - classify construct files as identity canon, runtime config, source evidence, functional logs, generated indexes, capsule evidence/canon, assets, or unused scaffold
- [lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md) - current Three I seat canon
- [lin-seat-cross-repo-reconciliation.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md) - reconciliation labels and cross-repo classification rules

## Live Standards

- [vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md)
- [docs-governance.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/docs-governance.md)
- [orchestration-canon-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md)
- [orchestration-surface-inventory.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md)
- [vvault-body-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-body-contract.md)
- [perfection-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/perfection-contract.md)
- [chat-interface-layout.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/chat-interface-layout.md)
- [transcript-storage.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/transcript-storage.md)
- [zen-singleton-live-transcript.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/zen-singleton-live-transcript.md)
- [zen-mode-surfaces.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/zen-mode-surfaces.md)
- [pocketverse-architecture.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/pocketverse-architecture.md)
- [pocketverse-shells.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/pocketverse-shells.md)
- [identity-boundaries.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/identity-boundaries.md)
- [construct-file-classification-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/construct-file-classification-rubric.md)
- [construct-tier-and-need-to-know-policy.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/construct-tier-and-need-to-know-policy.md)
- [archive-continuity-evidence.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/archive-continuity-evidence.md)
- [orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)
- [lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md)
- [lin-seat-cross-repo-reconciliation.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md)
