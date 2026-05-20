# Transcript Storage

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

Supersedes:
- `docs/rubrics/CHATTY_VVAULT_TRANSCRIPT_SAVING_RUBRIC.md`
- related transcript-path notes scattered across storage docs

## Standard

- transcript persistence rules belong in the standards layer, not in a general guide bucket
- construct-aware transcript storage must be described once in the live surface
- historical migration notes and troubleshooting examples belong in reports or archive
- transcript sync succeeds only after VVAULT database write and readback are both confirmed
- `.codex/sessions`, exported markdown, local app logs, and desktop files are ingest-only inputs, not transcript storage

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.

## Current Caveat

Historical docs still contain `instances/` and `constructs/` folder language. That language is provenance unless the current VVAULT authority contract and database readback path confirm it. Do not resolve the contradiction by creating new local folders.
