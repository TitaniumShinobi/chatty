# Construct File Classification Rubric

This rubric classifies construct files by their job in Chatty/VVAULT so identity, runtime config, source evidence, generated support data, and capsule material do not collapse into the same bucket.

The rule of thumb is simple: a file may belong to a construct without becoming identity canon or capsule body. Custom files are first-class construct files, but capsule/identity canon should stay accurate, relevant, non-redundant, portable, source-backed, and storage-topology-free.

## Classifications

| Class | Purpose | Canon Status | Examples | Keep / Exclude Rule |
| --- | --- | --- | --- | --- |
| `identity-canon` | User-authored or intentionally promoted identity contract. | Canon for how the construct is presented and conditioned. | `identity/prompt.json`, `identity/definition.json`, `identity/voice.json` | Keep. Runtime and UI should prefer these over legacy text projections. |
| `identity-facet` | Structured identity attributes that support appearance, voice, embodiment, or profile details. | Canon only inside its facet, not automatically capsule body. | `identity/physical_features.json`, `identity/avatar.png`, `identity/voice.wav` | Keep if intentionally authored; reference or summarize only when source-backed and relevant. |
| `identity-compat` | Legacy or rendered compatibility material. | Not canon once the equivalent JSON/file contract exists. | `identity/prompt.txt`, `identity/definition.txt`, `identity/voice.md`, `identity/identity.bak.json` | Archive after verifying equivalent canonical JSON exists. Do not let runtime prefer it over canon. |
| `runtime-config` | App/runtime settings, routing, model/provider choices, feature flags, and display metadata. | Runtime canon only. Not identity canon. | `config/metadata.json`, `config/actions/{actionName}.json`, provider/model settings, capability toggles | Keep only non-duplicative runtime fields. Do not duplicate identity prose from `prompt.json`. |
| `analysis-projection` | Generated summaries, trait scores, or compatibility projections. | Not canon by default. | `config/personality.json`, parser-derived trait files, tone projections | Treat as analysis/fallback only. Promote specific facts only through an explicit source-backed migration. |
| `source-evidence` | User files, transcripts, exports, docs, and custom construct material. | Evidence, not automatic canon. | `chatgpt/**`, `character.ai/**`, `documents/**`, NovaReturns files, legal docs, user uploads | Preserve as source material. Capsule may cite/distill it, not copy it wholesale. |
| `functional-log` | Logs, ledgers, and generated support records used by runtime, diagnostics, or retrieval. | Operational support, not identity/capsule canon. | `logs/*`, `logs/{construct}_continuity_ledger.json`, `chat.log`, `identity_guard.log` | Keep connected and browseable if functional. Do not delete just because it is not capsule canon. |
| `generated-index` | Machine-generated retrieval/cache/index data. | Support data only. | `memory_anchors.json`, embedding manifests, retrieval indexes | Keep if the runtime uses it. Rebuildable indexes should not be treated as original source truth. |
| `capsule-evidence` | Existing capsule or memup artifacts used as provenance. | Evidence unless explicitly promoted as current capsule standard. | `memup/{construct}.capsule`, legacy CapsuleForge rows, v2 `memup_sync` ledgers | Preserve original rows. New precision capsules should be siblings like `memup/{construct}.v3.capsule`. |
| `capsule-canon` | Reviewed, promoted capsule standard. | Capsule canon. | `memup/{construct}.v3.capsule` after review/promotion | Must be concise, source-backed, non-redundant, portable, and free of storage paths in the body. |
| `asset` | Media or binary material that belongs to the construct. | Asset canon only if intentionally selected as avatar/glyph/voice reference. | `assets/**`, `identity/avatar.png`, `identity/*_glyph.png`, `identity/voice.wav` | Keep as assets. Store metadata separately; do not duplicate file paths inside capsule body. |
| `unused-scaffold` | Empty placeholders from old directory templates. | No canon value. | `data/.gitkeep`, empty scaffold files | Remove from future scaffolds unless a real feature owns the folder. Archive existing empty rows only after a cleanup manifest. |

## Folder Rubric

| Folder | Primary Class | What Belongs Here | What Does Not Belong Here |
| --- | --- | --- | --- |
| `identity/` | `identity-canon`, `identity-facet`, `identity-compat` | Prompt JSON, Character.AI-style definition JSON, voice JSON/audio, avatar/glyph identity assets, narrowly scoped identity facets. | Runtime model settings, generated trait projections, full transcripts, capsule ledgers. |
| `config/` | `runtime-config` | Runtime settings, display metadata, model/provider routing, feature flags, action configs, non-identity capability toggles. | Identity prose, personality canon, transcript summaries, capsule body data. |
| `logs/` | `functional-log` | Runtime logs, continuity ledgers, diagnostics, guard rails, generated operational receipts. | Identity canon, source transcripts, user documents. |
| `chatgpt/`, `character.ai/`, `chatty/`, `codex/` | `source-evidence` | Conversation exports and transcript-like source material. | Generated capsule summaries or runtime config. |
| `documents/` | `source-evidence` | User/custom files, legal docs, project docs, NovaReturns-type evidence, PDFs/text exports. | Identity config unless deliberately imported as source evidence. |
| `memup/` | `capsule-evidence`, `capsule-canon`, memory artifacts | Preserved legacy capsules, v2 evidence ledgers, reviewed v3 capsule siblings, memory artifacts. | Whole raw transcript corpora, identity prompt files, runtime logs. |
| `data/` | `unused-scaffold` until owned | Only machine-readable datasets if a real feature claims it. | Identity, capsule canon, logs, user docs, catch-all clutter. |
| `assets/` | `asset` | Images, glyphs, audio, media, binary support material. | Duplicated identity text or capsule metadata. |

## Identity Duplication Rules

1. `identity/prompt.json` owns GPT Creator / SimForge identity text: name, display name, full name, gender, description, instructions, conversation starters, and prompt document timestamps/source.
2. `identity/definition.json` owns Character.AI-style definition/card content. It complements `prompt.json`; it is not a duplicate just because both contain instructions-like text.
3. `identity/voice.json` owns written voice/TTS instructions. `identity/voice.wav` owns the processed audio preview/reference when present. `voice.md` is legacy/rendered compatibility text.
4. `config/metadata.json` must not compete with `prompt.json` for name, description, or personality prose. It may carry display/runtime refs if those fields are not already canonical identity fields.
5. `config/personality.json` is an analysis/fallback projection unless a current runtime contract explicitly promotes it. Do not copy its traits into a capsule wholesale.
6. Generated ledgers, memory anchors, and v2 capsules may support retrieval or provenance, but they should not be treated as identity authority.



## Prompt JSON Contract

`identity/prompt.json` is the canonical GPT Creator / SimForge identity prompt. It should be stable across constructs and should not be used for runtime routing or memory storage. Use camelCase only; do not duplicate snake_case aliases inside this file.

Template:

```json
{
  "schemaVersion": "",
  "constructId": "",
  "name": "",
  "displayName": "",
  "fullName": "",
  "gender": "",
  "description": "",
  "instructions": "",
  "conversationStarters": [],
  "createdAt": "",
  "updatedAt": "",
  "source": ""
}
```

Field ownership:

- `name`: short canonical name.
- `displayName`: UI-facing display name when it differs from `name`.
- `fullName`: expanded/person-level name when the construct has one.
- `gender`: authored identity field from GPT Creator, stored here instead of `gender.json`.
- `description`: concise user-authored description.
- `instructions`: the human-authored behavior/identity instructions typed into GPT Creator.
- `conversationStarters`: prompt starter strings from GPT Creator.
- `createdAt` / `updatedAt`: lifecycle timestamps for this identity prompt document, not capsule lineage.
- `source`: creator/import source, for example GPT Creator, SimForge, or migration.

Do not put these in `prompt.json`:

- model/provider choices
- orchestration mode
- `construct_runtime` / `gpt` / `sim` / `vsi`
- capability toggles
- memory toggle/profile
- action schemas or action auth
- capsule summaries
- transcript/source file facts
- avatar/glyph/voice file paths
- duplicated snake_case aliases

Those belong in `config/metadata.json`, `identity/voice.json`, `identity/avatar.png`, source rows, or capsule/source manifests depending on their class.

## Avatar Rule

The preferred construct avatar target is `identity/avatar.png`, but runtime read-compat must treat `identity/avatar.webp`, `identity/avatar.jpg`, `identity/avatar.jpeg`, `identity/avatar.avif`, and `identity/avatar.svg` as valid identity avatar files. Do not strand an uploaded or scaffolded avatar in `assets/` or `review_required/` just because the extension is not PNG.

If a scaffold only produces an identity glyph such as `identity/sera-001_glyph.png`, that glyph is an identity facet and must be usable as an avatar fallback until an explicit `avatar.*` row exists. This is a fallback, not a reason to stop creating or promoting proper avatar files.

## Config Rule

Keep `config/`, but keep it narrow. `config/metadata.json` is for runtime and routing metadata only: model/provider settings, orchestration mode, feature flags, action/runtime refs, per-action config files, and display/runtime state that does not belong in authored identity.

`config/` must not own name, gender, description, personality prose, conversation starters, Character.AI definition text, voice instructions, raw memories, capsule facts, or source evidence. If `config/metadata.json` repeats `prompt.json`, `definition.json`, or capsule content, the repeated field is a projection or migration artifact, not canon.


## Actions Config Contract

Actions persist as configuration, not identity. Store one action per file under:

```text
config/actions/{actionName}.json
```

`{actionName}` is an auto-generated, stable, filesystem-safe slug derived from the action title shown in the UI. The slug should be lowercase, trim whitespace, replace non-alphanumeric runs with `-`, strip leading/trailing dashes, and append a short deterministic suffix only when needed to avoid collisions.

The UI title remains inside the file; the filename is an address, not the display label.

Template:

```json
{
  "schemaVersion": "",
  "actionName": "",
  "title": "",
  "description": "",
  "enabled": false,
  "auth": {
    "mode": "",
    "type": "",
    "credentialRef": ""
  },
  "privacyPolicyUrl": "",
  "domains": [],
  "openapi": {},
  "test": {
    "enabled": false,
    "lastRunAt": "",
    "lastStatus": ""
  },
  "createdAt": "",
  "updatedAt": "",
  "source": ""
}
```

Rules:

- `title` is the human-facing action title shown in the UI.
- `actionName` is the stable slug used for the filename and internal references.
- `openapi` stores the OpenAPI schema or the single-action extracted schema.
- `auth.mode` may be `none`, `api_key`, or `oauth`.
- `auth.type` may describe Basic, Bearer, custom header, or OAuth token style.
- `credentialRef` points to a secure secret record; it must not contain the secret.
- API keys, OAuth client secrets, and user tokens never live in this file, `prompt.json`, or a capsule.

`config/metadata.json` may include an action index only:

```json
{
  "actions": {
    "enabled": false,
    "items": [
      {
        "actionName": "",
        "title": "",
        "ref": "config/actions/{actionName}.json"
      }
    ]
  }
}
```

Do not put action schemas, auth secrets, or action descriptions in `identity/prompt.json`.

## Capsule Inclusion Rules

A capsule should contain distilled, source-backed facts only when they are accurate, relevant, and non-redundant. It should not copy raw transcript paragraphs, file paths, runtime log payloads, or config projections into the body.

Allowed in capsule:

- concise identity or memory claims with source refs
- artifact ids, hashes, chronology keys, and source classes
- optional custom body sections only when standard fields cannot hold the information without distortion

Excluded from capsule body:

- `identity_refs` path maps
- `glyph_path` or storage paths
- raw logs and raw transcript blocks
- duplicated config metadata
- generated trait scores unless explicitly reviewed and source-backed

## Functional Logs Rule

Logs and ledgers are not disposable just because they are not capsule canon. If a log or ledger exists as a construct file, one of these must be true:

- a runtime route reads/writes it
- a UI surface can browse or preview it as a custom file
- a cleanup manifest classifies it as stale before removal

If a log is intended to be functional but is not connected, fix the runtime path or route lookup. Do not silently delete the file as a substitute for making it functional.

## Cleanup Rule

Deletion requires a manifest. Duplicate path cleanup should classify each candidate as:

- `safe-metadata-match`: exact normalized-path or hash-backed duplicate
- `review-content-match`: basename-only or uncertain duplicate needing content/hash verification
- `preserve-no-counterpart`: no proven counterpart

Only `safe-metadata-match` rows should move to deletion planning, and deletion planning is separate from classification.
