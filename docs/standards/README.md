# Standards

Contracts, invariants, and governance live here.

## Containerism Start Here

- [LIFE Containerism](/Users/devonwoodson/Documents/GitHub/LIFE_CONTAINERISM/README.md) - LIFE-wide master doctrine, checklist packet, audit rubric, migration doctrine, and deployment doctrine
- [CONTAINERISM_ADAPTER.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/CONTAINERISM_ADAPTER.md) - Chatty's canonical front-door adapter for how Containerism applies to `chatty-cli`, `/api/vvault/message`, twin-door topology, and fail-closed continuity
- [chatty-vvault-avatar-identity-runtime-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/chatty-vvault-avatar-identity-runtime-rubric.md) - PASS/FAIL gate table for runtime isolation, identity authority, and avatar binding in Chatty/VVAULT surfaces

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

- [repository-rubrication.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/repository-rubrication.md) - top-order public-facing product and canon-precedence rubrication for Chatty
- [CONTAINERISM_ADAPTER.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/CONTAINERISM_ADAPTER.md) - Chatty-local Containerism adapter above route-specific and surface-specific canon
- [vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md) - source authority rule for VVAULT sync, transcript, continuity, and readback proof
- [chatty-vvault-twin-door-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/chatty-vvault-twin-door-contract.md) - explicit private/public runtime topology for how Chatty finds VVAULT and shared auth without localhost/production crossover
- [orchestration-canon-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md) - defines the canonical `chatty-cli` operator/core surface and the canonical `/api/vvault/message` runtime route it delegates into
- [orchestration-surface-inventory.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md) - explicit repo map for canonical, transitional, helper-only, legacy, archive, and dangerous residue surfaces
- [orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md) - receipt-backed runtime contract for construct-quality turns
- [vvault-body-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-body-contract.md) - VVAULT body ownership law for conversation reads/writes during the Supabase migration
- [perfection-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/perfection-contract.md) - app-level Diagnosis law and signed-in page "alive" contract
- [construct-file-classification-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/construct-file-classification-rubric.md) - classify construct files as identity canon, runtime config, source evidence, functional logs, generated indexes, capsule evidence/canon, assets, or unused scaffold
- [lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md) - current Three I seat canon
- [lin-seat-cross-repo-reconciliation.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md) - reconciliation labels and cross-repo classification rules

## Live Standards

- [repository-rubrication.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/repository-rubrication.md)
- [CONTAINERISM_ADAPTER.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/CONTAINERISM_ADAPTER.md)
- [vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md)
- [chatty-vvault-twin-door-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/chatty-vvault-twin-door-contract.md)
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
