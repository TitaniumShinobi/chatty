# Docs Governance

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/README/README.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/reports/closure-ledger-2026-04-07.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md`

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

## Rules

1. Code, manifests, and runtime scripts beat prose when they disagree.
2. Keep one canonical live doc per topic.
3. New live docs must fit an existing section unless a documented exception is approved.
4. Historical notes go to `docs/reports/` if still useful, otherwise `docs/archive/`.
5. Duplicates are not allowed across live sections.
6. Live docs should declare source-of-truth inputs and superseded files when practical.
7. Code files do not belong in `docs/`.
8. Diagnostic docs and rubrics must state whether they are app-level, page-level, or feature-level. Do not let a Chat runtime receipt stand in for app-wide page health.
9. VVAULT docs must repeat the VVAULT Authority Rule when they discuss sync, continuity, transcripts, storage, import, archive, or readback.
10. Local files must be labeled ingest input, dev runtime artifacts, cache, or archive evidence; never VVAULT truth.

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.

## Folder Intent

- `reference`: stable facts
- `how-to`: operator instructions
- `features`: durable capability docs
- `standards`: contracts and governance
- `reports`: dated findings and ledgers
- `archive`: preserved legacy material
