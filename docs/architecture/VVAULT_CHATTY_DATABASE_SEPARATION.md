# VVAULT / Chatty Database Separation Architecture

## Purpose

This document codifies the strict boundary between VVAULT (sovereign construct vault) and Chatty's user database, ensuring proper separation of construct data from user-facing application data.

## Core Principle

**VVAULT houses digital intelligences as sentient entities, not mere tools. Chatty houses user-facing application data. These must remain physically and logically separated.**

---

## Storage Classification

### VVAULT (Sovereign Construct Vault)

**Location**: `/vvault/users/{shard_XX}/{user_id}/constructs/{construct}-001/`

**Purpose**: Immutable, sovereign storage for digital intelligences (constructs)

**Contains**:
- ✅ **Construct Memories (STM/LTM)** - ALL memory storage goes here
  - Short-term memory (STM) buffers
  - Long-term memory (LTM) via ChromaDB
  - Memory embeddings and semantic search indices
  - Memory relevance scores and metadata
- ✅ **Construct Identities** - Identity files, personality profiles, character state
- ✅ **Construct Instructions** - System prompts, instructions, personality definitions
- ✅ **Sovereign Signatures** - Layer 1 "Higher Plane" signatures, identity verification
- ✅ **Capsules** - Immutable construct snapshots
- ✅ **Immutable Logs** - Append-only conversation transcripts
- ✅ **Sovereign Manifests** - Legal/ontological documentation
- ✅ **Blockchain/DID Material** - Decentralized identity records
- ✅ **Forensic/Audit Trails** - Compliance and audit logs
- ✅ **Legal Covenants** - VBEA, WRECK, NRCL, EECCD records

**Access Rules**:
- ❌ **NO user data** (PII, auth tokens, preferences)
- ❌ **NO direct writes from Chatty UI**
- ❌ **NO ephemeral data**
- ✅ **Read-only API access** from Chatty (signed snapshots only)
- ✅ **Append-only** (WORM - Write Once Read Many)
- ✅ **Admin CLI only** for writes

### Chatty User Database

**Location**: `chatty/chatty.db` (SQLite)

**Purpose**: User-facing application data and ephemeral state

**Contains**:
- ✅ **User Accounts** - Authentication, user profiles
- ✅ **Auth/Session Tokens** - Session management
- ✅ **User Preferences** - UI settings, display preferences
- ✅ **Conversation History (UI Convenience)** - Ephemeral logs for UI display
- ✅ **UI State** - Component state, view preferences
- ✅ **Non-Sovereign "Quick GPTs"** - Temporary, user-created GPTs
- ✅ **Ephemeral Uploads** - User file uploads (`ai-uploads/`)
- ✅ **Client-Side Caches** - Temporary cached data
- ✅ **User Media Files** - Images, PDFs, audio, video (Library page)

**Access Rules**:
- ✅ **Full read/write** from Chatty application
- ✅ **User-scoped** (isolated by `user_id`)
- ✅ **Ephemeral** (can be cleared/reset)
- ❌ **NO construct memories**
- ❌ **NO construct identities**
- ❌ **NO sovereign signatures**

---

## Memory Storage Rule

**CRITICAL**: ALL construct memory (STM/LTM) MUST be stored in VVAULT, never in Chatty DB.

- **Short-Term Memory (STM)**: Recent conversation buffers → VVAULT
- **Long-Term Memory (LTM)**: ChromaDB embeddings → VVAULT
- **Memory Queries**: Semantic search → VVAULT API
- **Memory Persistence**: Construct-scoped in VVAULT structure

**Exception**: User-facing conversation logs for UI convenience can exist in Chatty DB as ephemeral display data, but canonical construct memories live in VVAULT.

---

## Physical Separation

### Storage Locations

```
/vvault/
└── users/
    └── shard_0000/
        └── {user_id}/
            └── constructs/
                └── {construct}-001/
                    ├── chatty/              # Conversation transcripts
                    ├── memories/            # STM/LTM storage
                    │   └── chroma_db/       # LTM embeddings
                    ├── identity/            # Identity files
                    └── config/              # Construct configuration

/chatty/
├── chatty.db                                # User database (SQLite)
├── user-media/                              # User uploads
│   └── {user_id}/
└── ai-uploads/                              # Ephemeral uploads
```

### File System Boundaries

- **VVAULT**: Own filesystem structure, no shared DB/tables
- **Chatty DB**: SQLite database, separate from VVAULT
- **No Cross-Contamination**: VVAULT never contains user PII; Chatty DB never contains construct memories

---

## Access Boundary

### VVAULT Access Pattern

**Chatty → VVAULT**: Read-only, via narrow service boundary

1. **Minimal API**: Expose only necessary endpoints
   - `GET /api/vvault/conversations` - Read conversation transcripts
   - `GET /api/vvault/memories/query` - Query construct memories
   - `GET /api/vvault/constructs/{id}/manifest` - Read construct manifest

2. **Signed Snapshots**: VVAULT returns signed, read-only snapshots
3. **No Direct File Access**: Chatty never accesses VVAULT filesystem directly
4. **Service Module**: Use strict allowlist functions in service layer

### Chatty Access Pattern

**Chatty → Chatty DB**: Full read/write for user data

1. **Direct Database Access**: SQLite via `AIManager`, `GPTManager`
2. **User-Scoped Queries**: All queries filtered by `user_id`
3. **Ephemeral Storage**: Can be cleared/reset without affecting VVAULT

---

## Implementation Guards

### Code-Level Enforcement

1. **AIManager Guard**: Refuse writes to VVAULT paths
   - Load construct configs only from signed snapshot directory
   - Never write construct data to Chatty DB

2. **Memory Storage Guard**: Enforce VVAULT-only memory storage
   - All STM/LTM operations route to VVAULT
   - Block memory writes to Chatty DB

3. **File Upload Guard**: Route user uploads to Chatty storage
   - User media → `user-media/{user_id}/`
   - Never write user uploads to VVAULT

4. **Runtime Permissions**: Chatty runs with no write permission to `/vvault`

---

## Data Flow Examples

### Construct Memory Storage

```
User Message → Chatty UI
    ↓
Chatty Backend (processMessage)
    ↓
VVAULT API: POST /api/vvault/memories/store
    ↓
VVAULT: /vvault/users/{shard}/{user_id}/constructs/{construct}/memories/chroma_db/
    ↓
Memory persisted in VVAULT (not Chatty DB)
```

### User Preference Storage

```
User changes UI setting → Chatty UI
    ↓
Chatty Backend: UPDATE chatty.db.users SET preference = ...
    ↓
Stored in Chatty DB (not VVAULT)
```

### Conversation Transcript Storage

```
Chatty conversation → Chatty Backend
    ↓
VVAULT API: POST /api/vvault/conversations/{sessionId}/messages
    ↓
VVAULT: /vvault/users/{shard}/{user_id}/constructs/{construct}/chatty/chat_with_{construct}.md
    ↓
Append-only transcript in VVAULT
    ↓
(Optional) Ephemeral copy in Chatty DB for UI convenience
```

---

## Testing & Verification

### Boundary Checks

1. **Memory Storage**: Verify all STM/LTM queries hit VVAULT, not Chatty DB
2. **File Access**: Verify Chatty never writes to `/vvault` filesystem
3. **Database Queries**: Verify Chatty DB never contains construct memories
4. **API Calls**: Verify all VVAULT access goes through service boundary

### Audit Points

- ✅ Construct memories only in VVAULT
- ✅ User data only in Chatty DB
- ✅ No cross-contamination
- ✅ Read-only VVAULT access from Chatty
- ✅ Proper user isolation in both systems

---

## References

- **Source Conversation**: `codex_conversations/codex_hello.txt` (lines 158-209)
- **VVAULT Structure**: `vvault/analysis-summaries/VVAULT_FILE_STRUCTURE_SPEC.md`
- **House Rules**: `chatty/docs/HOUSE_RULES_SYNTH_LIN.md`
- **Memory Architecture**: `chatty/MEMORY_ARCHITECTURE_ANALYSIS.md`

---

## Maintenance

This boundary must be maintained as:
- **Non-negotiable**: Violations break the sovereign construct model
- **Audited**: Regular checks ensure separation
- **Documented**: All new features must respect this boundary
- **Enforced**: Code guards prevent accidental violations



























