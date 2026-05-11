# Documentation Closure Ledger

Date: 2026-04-07

## Purpose

This ledger records which docs were promoted, rewritten, archived, or removed from the live browsing surface during the three-phase cleanup implementation.

## Promoted Canonical Docs

- `docs/reference/platform-overview.md`
- `docs/reference/runtime-and-ports.md`
- `docs/reference/auth-and-oauth.md`
- `docs/reference/vvault-and-storage.md`
- `docs/reference/constructs-and-lin.md`
- `docs/reference/model-providers.md`
- `docs/how-to/local-startup.md`
- `docs/how-to/authentication.md`
- `docs/how-to/vvault-troubleshooting.md`
- `docs/how-to/voice-and-dictation.md`
- `docs/features/file-intelligence.md`
- `docs/features/gpt-creator-and-lin.md`
- `docs/features/profile-photos.md`
- `docs/features/RAG_SYSTEM.md`
- `docs/features/COMMUNITY_GPTs_STRUCTURE.md`
- `docs/features/AGENT_DIRECT_SEND.md`
- `docs/standards/docs-governance.md`
- `docs/standards/transcript-storage.md`
- `docs/standards/identity-boundaries.md`

## Audit Packet Added

- `docs/README/README.md`
- `docs/README/inventory.md`
- `docs/README/canonical-truths.md`
- `docs/README/contradictions.md`
- `docs/README/merge-map.md`
- `docs/README/phase-backlog.md`

## Live Surface Simplifications

- root `README.md` now points to the product/runtime entry and the cleaned docs surface
- `docs/README.md` now acts as the thin docs navigator
- `server/README.md` was rewritten from current runtime truth
- duplicate and noisy legacy folders were moved under `docs/archive/legacy/`
- the remaining retained live feature docs were rewritten into the same canonical style as the new reference/how-to/standards pages

## Ongoing Caveats

- `instances/` vs `constructs/` remains visible as an unresolved contradiction
- auth-provider status still needs periodic verification against runtime code when routes change
- archive content is preserved for history, not treated as canonical
- the zero-broken-link verification pass covered the live docs surface, not every preserved legacy link in `docs/archive/legacy/`
