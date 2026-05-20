# Chatty Documentation Audit Packet

This folder is the working packet for the documentation cleanup effort. It captures the overloaded pre-cleanup tree, the code-backed truths used for consolidation, the contradictions that remain open, and the resulting merge map.

## Packet Contents

- `inventory.md` - current `docs/` shape, overload points, duplicate names, and miscategorized files
- `canonical-truths.md` - facts confirmed from repo code, manifests, and runtime scripts
- `contradictions.md` - unresolved conflicts that must stay visible until consolidated
- `merge-map.md` - source files grouped into canonical destination docs
- `phase-backlog.md` - ordered cleanup steps for the remaining prompts

## Working Rules

- Treat this packet as the source for the cleanup plan, not as a user-facing docs index.
- Prefer code, manifests, and runtime scripts over prose when they disagree.
- Keep historical notes, one-off investigations, and superseded drafts out of the live browsing surface.

## Resulting Structure

The live docs surface now sits at:

- `docs/reference/`
- `docs/how-to/`
- `docs/features/`
- `docs/standards/`
- `docs/reports/`
- `docs/security/`
- `docs/legal/`
- `docs/prompts/`
- `docs/archive/`

Legacy material from the old tree was moved under `docs/archive/legacy/`.

## Current Scope

This packet reflects the repo state inspected on April 7, 2026 and the cleanup decisions made from that audit:

- `docs/` is overloaded, especially `guides/`, `architecture/`, `implementation/`, `styling/`, and `rubrics/`
- duplicate and near-duplicate docs exist across multiple folders
- root `README.md`, `docs/README.md`, and `server/README.md` were rewritten during the cleanup
- storage-path docs still mix `instances/` and `constructs/`
