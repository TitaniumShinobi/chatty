# VVAULT Body Contract

This standard defines the storage body order for Chatty conversation truth during the VVAULT migration.

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

## Law

Chatty must not treat legacy Supabase `vault_files`, local transcript markdown, local archive folders, or local deferred stores as the canonical conversation body.

For conversation transcript reads and writes, the order is:

1. VVAULT API
2. VVAULT-owned Postgres/body database
3. blocked/unavailable response if VVAULT cannot be written and read back

Legacy Supabase and local filesystem fallbacks are not source-of-truth proof. They are historical/offboarding evidence only unless a task is explicitly scoped to import from them into VVAULT.

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.

## Connector Rules

- `vvaultConnector/readConversations.js` owns canonical conversation reads.
- `vvaultConnector/writeTranscript.js` owns canonical transcript writes.
- `vvaultConnector/supabaseStore.js` and `vvaultConnector/supabaseStore.mjs` are legacy adapters, not canonical storage owners.
- Request-time flags such as `preferDirectSupabase` must not bypass the VVAULT body.
- If VVAULT API is configured and the request has email-bearing user context, Chatty must attempt VVAULT API and VVAULT-owned database readback before any response claims sync or continuity success.
- Local Codex/session/export files may be parsed only as ingest input and must not be surfaced as conversation truth.

## Explicit Legacy Gates

Legacy Supabase conversation reads require:

```text
CHATTY_ALLOW_LEGACY_SUPABASE_CONVERSATION_READS=true
```

Legacy Supabase transcript writes require:

```text
CHATTY_ALLOW_LEGACY_SUPABASE_TRANSCRIPT_WRITES=true
```

If these gates are not set, Supabase must not be used as a hidden conversation fallback.

These gates are retained for historical compatibility and offboarding checks. They do not make Supabase current VVAULT authority.

## Not Proof

- A Supabase row existing is not proof the VVAULT body owns the account.
- A local file, local markdown transcript, local JSON archive, or local folder existing is not VVAULT sync proof.
- A local Postgres/cache row existing outside the VVAULT-owned authority path is not cutover proof.
- A passing `/api/vvault/message` orchestration receipt is not full body migration proof if identity, memory, or transcript persistence still names legacy Supabase as owner.

## Proof Bar

The migration may only be called body-complete when:

- VVAULT export/import/parity passed for the counted source domains.
- Chatty conversation reads and writes resolve through VVAULT-native paths.
- Runtime receipts identify VVAULT as memory and persistence owner.
- Legacy Supabase fallback is either disabled or explicitly marked degraded/recovery-only.
- Local files used during import are labeled ingest-only and followed by VVAULT database readback proof.
