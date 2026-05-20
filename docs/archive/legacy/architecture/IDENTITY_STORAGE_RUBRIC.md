# Identity Storage Rubric

## Purpose

This rubric defines one canonical file contract for construct identity/config in Supabase `vault_files` so Chatty and GPTCreator do not drift.

All identity files are stored under:

- `instances/{callsign}/identity/`

## Canonical files

### 1) Prompt and Configure/Forge config

- Canonical: `prompt.json`
- Role: Source of truth for GPTCreator configuration and prompt metadata.
- Required fields:
  - `name`
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
- Legacy compatibility:
  - `prompt.txt` may be read as fallback text only.
  - New writes should target `prompt.json`.

### 2) Conditioning

- Canonical: `conditioning.txt`
- Role: Behavioral and continuity constraints.

### 3) Definition

- Canonical: `definition.json`
- Role: Structured definition/instructions.
- Decision: keep `definition.json` as the only authoritative definition file.
- Preferred shape:
  - `{ "instructions": "..." }`
- Compatibility:
  - Plain text content in `definition.json` may still be read.
  - `definitions.json` and `definition.txt` are read-only legacy fallbacks and cleanup targets after canonical content is confirmed.

### 4) Physical features

- Canonical: `physical-features.json`
- Role: Physical descriptor map and gender in one file.
- Preferred shape:
  - JSON object key/value pairs including optional `gender` key.
- Compatibility:
  - Plain text `key: value` format may be converted to JSON on save.
  - `physical_features.json`, `physicalfeatures.json`, and `gender.json` are read-only legacy fallbacks.

### 5) Voice instructions

- Canonical: `voice.md`
- Role: Forge voice instruction text shown in GPTCreator.
- Compatibility:
  - `voice.json` is reserved for machine metadata and legacy fallback reads.

### 6) Gender

- Canonical location: `physical-features.json` as `gender` field.
- Legacy fallback:
  - `gender.json`

### 7) Avatar

- Canonical file names:
  - `avatar.png`
  - `avatar.jpg`
  - `avatar.webp`
  - `avatar.avif`
  - `avatar.svg`

Deprecated cleanup target:

- `avatar.jpeg`

## Write policy

- Chatty writes canonical files only.
- Legacy file names are read for compatibility but should not be used for new writes.
- Empty-string saves must not overwrite existing canonical values unless an explicit clear operation is requested.

## Read policy

- Read canonical first.
- Fall back to legacy variants only when canonical is missing.
- Expose a cache-bust read path for editor hydration (`?bust=1`) after writes.

## Implementation checkpoints

- Server editor write endpoint persists canonical files.
- GPTCreator save writes:
  - full `prompt.json` bundle for Configure/Forge selections
  - identity text files/json for conditioning/definition/physical/voice/gender
- Editor read endpoint returns canonical values from file-backed identity plus model/config payload.

## Audit endpoint

Use the identity audit endpoint to inspect canonical completeness and legacy duplication before cleanup:

- `GET /api/vvault/constructs/{callsign}/identity-audit`
- Optional query: `?includeGlobal=1` to include non-user-scoped rows in the report.

Response includes:

- grouped canonical/legacy status per identity group (`prompt`, `voice`, `definition`, `physicalFeatures`, `conditioning`)
- file inventory by basename with row metadata
- recommendations (`migrate-to-canonical`, `repair-canonical-content`, `prune-legacy-after-verify`)

## Cleanup endpoint

Use the cleanup endpoint to prune redundant legacy identity rows once canonical files are verified:

- `DELETE /api/vvault/constructs/{callsign}/identity-cleanup`
- Default behavior is dry-run (`dryRun=true`).
- Execute deletes with `?dryRun=false`.
- Cleanup now force-prunes explicitly deprecated files (`identity.bak.json`, `avatar.jpeg`).

## Migration notes

- Existing constructs with mixed files remain readable.
- No destructive migration is required.
- Optional cleanup can remove redundant legacy files after canonical files are confirmed populated.
