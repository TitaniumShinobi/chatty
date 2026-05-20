# VVAULT Chat Hydration

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

## Rule

VVAULT is the effective hydration source for construct identity and assets. Local rows are cache/projection data only. Empty local values must not hide non-empty VVAULT database values.

This policy is for hydration/display correctness only. It does not change the public API contract.

## Hydrated Fields

The VVAULT hydration helper may fill empty values for:

- `name`
- `description`
- `instructions`
- `conditioning`
- `definition`
- `physicalFeatures`
- `voice`
- avatar existence

Non-empty `chatty` values win. The helper returns only fields that the VVAULT database actually has.

## Runtime Touch Points

- AI/GPT detail/editor reads may merge VVAULT fields into empty local fields.
- Avatar routes remain responsible for serving actual image bytes.
- GPT Creator may use the canonical editor endpoint for save/reload, but hydration cache is not persistence proof.

## Acceptance

- Construct detail/editor screens do not go blank just because DB projection fields are empty.
- VVAULT identity fields appear after reload when available.
- Lin-only orchestration remains intact; hydration must not reintroduce Custom/Sim save paths.
- Runtime hardening in `server/server.js` and `server/routes/vvault.js` remains the active baseline.

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.
