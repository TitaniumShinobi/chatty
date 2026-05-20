# Knowledge Files Rubric

## Purpose
Define the strict rule for what constitutes a "Knowledge File" in the GPTCreator Knowledge panel. This is a hard boundary — no exceptions.

---

## Rule

**Knowledge Files are ONLY files stored under these two VSI folders:**

```
/vvault_files/users/shard_0000/{userID}/instances/{constructCallsign}/assets/
/vvault_files/users/shard_0000/{userID}/instances/{constructCallsign}/documents/
```

**NOTHING ELSE appears in the Knowledge panel. NO EXCEPTIONS. NO DEVIATIONS.**

---

## What IS a Knowledge File

Files the user explicitly uploads to give their GPT access to specific information:

- PDFs, documents, text files (in `documents/`)
- Images, avatars, PNGs, JPEGs (in `assets/`)
- External reference material (in `documents/`)
- Threat matrices, guides, manuals (in `documents/`)

### Examples (Correct — shown in Knowledge panel)
```
instances/nova-001/assets/AGENT-NOVA-001.png                    ✅
instances/nova-001/assets/avatar.jpeg                           ✅
instances/nova-001/assets/_NOVA_alias-trademarked.PNG            ✅
instances/nova-001/documents/NOVARUNNER THREAT MATRIX.pdf       ✅
instances/katana-001/documents/training_data.txt                ✅
instances/katana-001/assets/katana-banner.jpg                   ✅
```

---

## What is NOT a Knowledge File

Everything else in the VSI folder structure. These files serve other system purposes and must NEVER appear in the Knowledge panel:

| VSI Folder | Purpose | Category |
|---|---|---|
| `identity/` | Prompt, conditioning, personality | `identity` |
| `memup/` | Capsule snapshots | `capsule` |
| `config/` | Enforcement configs | `config` |
| `logs/` | System logs, continuity ledgers | `log` |
| `chatty/` | Chat transcripts | `transcript` |
| `codex/` | Codex transcripts | `transcript` |
| `chatgpt/` | ChatGPT transcripts | `transcript` |
| `character.ai/` | Character.AI transcripts | `transcript` |
| `github_copilot/` | Copilot transcripts | `transcript` |
| `data/` | Internal data | `other` |
| `frame/` | Frame data | `other` |
| `simDrive/` | SimDrive data | `other` |
| `vxrunner/` | VXRunner data | `other` |

### Examples (Incorrect — must NOT show in Knowledge panel)
```
instances/nova-001/identity/prompt.json           ❌ Identity file, not knowledge
instances/nova-001/identity/conditioning.txt      ❌ Identity file, not knowledge
instances/nova-001/identity/personality.json      ❌ Identity file, not knowledge
instances/nova-001/identity/metadata.json         ❌ Identity file, not knowledge
instances/nova-001/memup/nova-001.capsule         ❌ Capsule, not knowledge
instances/nova-001/config/.gitkeep                ❌ Config placeholder, not knowledge
instances/nova-001/logs/capsule.log               ❌ Log file, not knowledge
instances/nova-001/logs/chat.log                  ❌ Log file, not knowledge
instances/nova-001/logs/identity_guard.log        ❌ Log file, not knowledge
instances/nova-001/logs/server.log                ❌ Log file, not knowledge
instances/nova-001/chatty/chat_with_nova-001.md   ❌ Transcript, not knowledge
```

---

## Implementation

### Backend: File Categorization (`server/routes/ais.js`)

The GET `/:id/files` endpoint categorizes files from Supabase `vault_files` by their VSI folder path:

```javascript
// Only assets/ and documents/ folders get category = 'knowledge'
if (subdir === 'assets' || subdir === 'documents') category = 'knowledge';

// Everything else gets its own category and is excluded from Knowledge panel
if (subdir === 'identity') category = 'identity';
if (subdir === 'memup') category = 'capsule';
if (subdir === 'config') category = 'config';
if (subdir === 'logs') category = 'log';
// ... etc
```

### Frontend: Knowledge Panel Filter (`src/components/GPTCreator.tsx`)

The Knowledge panel applies a strict filter — only `category === 'knowledge'` files are displayed:

```typescript
const knowledgeOnly = (loadedFiles as GPTFile[]).filter(
  (f: any) => f.category === 'knowledge'
);
```

**DO NOT broaden this filter.** Previous incorrect implementations included `identity`, `config`, `capsule`, `other` — all of those are WRONG.

### Upload Path Routing (`server/routes/ais.js`)

When files are uploaded via the Knowledge panel, they route to `documents/` by default (or `assets/` for images) via `mapToVsiFolder()`:

```javascript
function mapToVsiFolder(filename) {
  if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(filename)) return 'assets/';
  if (/\.(capsule)$/i.test(filename)) return 'memup/';
  if (/^chat_with_/i.test(filename)) return 'chatty/';
  if (/^prompt\.(json|txt)$/i.test(filename)) return 'identity/';
  return 'documents/';  // Default: user-uploaded knowledge goes to documents/
}
```

---

## Legacy Fallback

For `vault_files` rows without VSI folder paths (pre-migration), categorization falls back to the `file_type` column:

- `file_type = 'knowledge'` or `'assets'` or `'documents'` → `category = 'knowledge'` (shown)
- `file_type = 'identity'` → `category = 'identity'` (hidden)
- `file_type = 'config'` → `category = 'config'` (hidden)
- All other `file_type` values → NOT `'knowledge'` (hidden)

---

## Related Documentation

- `docs/rubrics/TRANSCRIPT_FILE_STRUCTURE_RUBRIC.md` — Transcript path conventions
- `docs/architecture/MEMORY_ORCHESTRATION_PLAN.md` — Memory authority hierarchy
- `docs/plans/GPT_CREATION_THROUGH_LIN.md` — Construct creation and scaffolding

---

## Status

- ✅ Rule documented (2026-02-12)
- ✅ Backend categorization enforced in `server/routes/ais.js`
- ✅ Frontend filter locked to `category === 'knowledge'` only
- ✅ Upload routing via `mapToVsiFolder()` sends knowledge to `documents/` or `assets/`
- ✅ Legacy fallback handles pre-migration rows
