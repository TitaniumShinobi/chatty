# Construct Body Remote Update Map

Status: local-prep only  
Scope: Chatty repo local contract hardening for construct bodies  
This file does **not** authorize or trigger any Supabase or `vault_files` writes.

## Goal

The local construct body contract now carries naming, capability, and role-grounding truth for system constructs. The next pass must backfill that truth into remote storage without inventing a second contract.

## Local Contract Introduced In This Pass

Primary local storage targets:

- `gpts.display_name`
- `gpts.full_name`
- `gpts.aliases`
- `gpts.provider`
- `gpts.tags`
- `gpts.categories`
- `gpts.config_json`
- existing `gpts.capabilities`
- existing `gpts.orchestration_mode`
- existing `gpts.memory_enabled`
- existing `gpts.memory_profile`
- existing `gpts.roleplay_enabled`

Local `config_json` now carries the richer body envelope:

- `bodyVersion`
- `displayName`
- `fullName`
- `aliases`
- `conditioning`
- `canonRefs`
- `knowledgeRefs`
- `provider`
- `tags`
- `categories`
- `summaryCapabilities`
- `capabilities`
- `hasPersistentMemory`

## Future Remote Targets

### 1. Canonical `prompt.json` in `vault_files`

Target path pattern:

- `instances/{construct_callsign}/identity/prompt.json`

Ready for remote backfill:

- `name`
- `displayName`
- `fullName`
- `aliases`
- `description`
- `instructions`
- `conversationStarters`
- `capabilities`
- `modelId`
- `conversationModel`
- `creativeModel`
- `codingModel`
- `provider`
- `tags`
- `categories`
- `orchestrationMode`
- `memoryEnabled`
- `memoryProfile`
- `hasPersistentMemory`
- `roleplayEnabled`
- `configJson`

Blocked pending explicit migration decision:

- Whether `conditioning` remains in `conditioning.txt` only or is also mirrored inside `prompt.json.configJson`
- Whether `canonRefs` and `knowledgeRefs` live top-level in `prompt.json` or only under `configJson`

### 2. Remote `ais` rows

Current likely remote contract already supports:

- `name`
- `description`
- `system_prompt_override`
- `capabilities`
- `tags`
- `categories`
- `config_json`
- `conversation_starters`

Ready for remote backfill:

- `name` from local `display_name`
- `description`
- `system_prompt_override` from local `instructions`
- `capabilities`
- `tags`
- `categories`
- `config_json` body envelope
- `conversation_starters`

Blocked pending explicit migration decision:

- add dedicated remote columns for `display_name`
- add dedicated remote columns for `full_name`
- add dedicated remote columns for `aliases`

If dedicated remote columns are not added, those fields should travel inside `config_json` first.

### 3. Remote `gpts` rows

Remote `gpts` handling is blocked pending migration decision.

Reason:

- local `gpts` are currently the safe place to harden system construct bodies
- the future remote pass should decide whether remote `gpts` remain a cache, become a first-class mirror, or stay untouched while remote `ais` and `vault_files` become authoritative

## Backfill Order

1. Freeze the local contract and test it first.
2. Update local prompt-bundle serializers and prompt-bundle readers to the same field set.
3. Backfill canonical `prompt.json` in `vault_files`.
4. Update remote `ais` row projection logic.
5. Only then decide whether remote `gpts` also need matching body fields.

## Field Status Matrix

### Local-only today

- `gpts.display_name`
- `gpts.full_name`
- `gpts.aliases`
- `gpts.provider`
- `gpts.tags`
- `gpts.categories`
- `gpts.config_json`

### Ready for remote backfill

- `name` / `displayName`
- `fullName`
- `aliases`
- `description`
- `instructions`
- `conversationStarters`
- `capabilities`
- `provider`
- `tags`
- `categories`
- `orchestrationMode`
- `memoryEnabled`
- `memoryProfile`
- `roleplayEnabled`
- `hasPersistentMemory`
- `configJson`

### Blocked pending migration decision

- dedicated remote columns for `display_name`
- dedicated remote columns for `full_name`
- dedicated remote columns for `aliases`
- whether `conditioning` is mirrored into `prompt.json`
- whether `canonRefs` and `knowledgeRefs` are top-level remote fields or `configJson`-only

## Explicitly Unchanged In This Pass

- `server/routes/gpts.js::syncPromptJsonToSupabase`
- remote Supabase row writers
- remote `vault_files` inserts and updates
- remote table migrations

This pass is intentionally local-first so the database is not being asked to believe body truth that the local runtime still represents inconsistently.
