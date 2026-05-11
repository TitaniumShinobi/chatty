# Merge Map

## Canonical Destinations

- `docs/reference/` - architecture, identity, storage contracts, provider truths, and other stable reference material
- `docs/how-to/` - setup, debugging, deployment, test usage, and operational runbooks
- `docs/features/` - user-facing feature overviews and durable feature guides
- `docs/standards/` - rubrics, invariants, contracts, and house rules
- `docs/reports/` - audits, investigations, postmortems, verification notes, and dated cleanup artifacts
- `docs/prompts/` - prompt assets only
- `docs/archive/` - superseded drafts, one-off notes, and historical noise that is still worth retaining

## Merge Targets

- OAuth/auth setup cluster -> one canonical auth setup doc plus one provider-status reference
- Profile photo cluster -> one canonical implementation guide, with debug notes collapsed into a report
- OCR/MOCR cluster -> one feature guide plus one implementation note if needed
- Lin cluster -> one canonical Lin reference set with supporting how-to material folded in
- VVAULT/storage cluster -> one canonical storage and import reference, with contradictions preserved in the packet
- startup/ports/runtime cluster -> one canonical startup contract and one ports/URLs reference

## File-Level Pairs

- Keep one copy of each exact duplicate pair and remove the other after links are updated
- Promote `docs/guides/REPORT.md` and audit-style files into `docs/reports/`
- Move prompt files out of `guides/` and into `prompts/`
- Move one-off change logs and implementation notes out of `styling/` and `implementation/` into `reports/` or `archive/`

## Implemented Outcomes

- The overloaded legacy tree now lives under `docs/archive/legacy/`
- The live surface now uses `reference`, `how-to`, `features`, `standards`, `reports`, `security`, `legal`, and `prompts`
- Remaining retained live feature docs were rewritten into canonical form instead of left as historical carryovers
