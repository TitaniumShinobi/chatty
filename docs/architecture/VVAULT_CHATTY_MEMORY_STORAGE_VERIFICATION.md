# VVAULT / Chatty Memory Storage Verification Report

**Date**: January 2025  
**Purpose**: Verify that all construct memories (STM/LTM) are stored in VVAULT, not Chatty DB

---

## Current Implementation Status

### ✅ CORRECT: Lin's Memory Storage

**Location**: `chatty/src/components/GPTCreator.tsx` (lines 822-906)

**Implementation**:
- ✅ LTM queries: `VVAULTConversationManager.loadMemoriesForConstruct()` → VVAULT ChromaDB
- ✅ LTM storage: `POST /api/vvault/identity/store` → VVAULT ChromaDB
- ✅ STM: In-memory only (UI state), not persisted to Chatty DB
- ✅ **All Lin memories go to VVAULT** ✅

**Storage Path**: `/vvault/users/{shard}/{user_id}/constructs/lin-001/memories/chroma_db/`

---

### ❌ CRITICAL ISSUE: VaultStore Uses SQLite (Chatty DB)

**Location**: `chatty/src/core/vault/VaultStore.ts` (line 4: `import db from '../../lib/db'`)

**Current Implementation**:
- ❌ **VaultStore.saveMessage()**: Writes to SQLite `vault_entries` table in Chatty DB
- ❌ **VaultStore.search()**: Queries SQLite `vault_entries` table
- ❌ **VaultStore.getStats()**: Queries SQLite `vault_entries` table
- ❌ **All LTM operations**: Use SQLite Chatty DB, NOT VVAULT

**Storage Locations**:
1. ✅ VVAULT transcripts: `/vvault/users/{shard}/{user_id}/constructs/{construct}/chatty/` (via writeTranscript)
2. ❌ SQLite `vault_entries` table: `chatty/chatty.db` (WRONG - violates boundary)
3. ❌ SQLite `vault_summaries` table: `chatty/chatty.db` (WRONG - violates boundary)

**Code Evidence**:
```typescript
// VaultStore.ts line 47-60
const stmt = db.prepare(`
  INSERT INTO vault_entries (construct_id, thread_id, kind, payload, ts, relevance_score, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
```
This `db` is from `chatty/src/lib/db.ts` which is the Chatty SQLite database.

**Required Fix**: 
- Replace VaultStore to use VVAULT ChromaDB API instead of SQLite
- Route all LTM operations to `/api/vvault/memories/store` and `/api/vvault/memories/query`
- Remove SQLite `vault_entries` and `vault_summaries` tables from Chatty DB

---

### ⚠️ ISSUE: SynthMemoryOrchestrator Mixed Storage

**Location**: `chatty/src/engine/orchestration/SynthMemoryOrchestrator.ts` (lines 124-147)

**Current Implementation**:
- ❌ Uses `vaultStore` (SQLite Chatty DB) for LTM storage via VaultStore
- ✅ Also writes to VVAULT transcripts (good)
- ❌ **Problem**: SQLite `vault_entries` table in Chatty DB stores construct memories

**Storage Locations**:
1. ✅ VVAULT transcripts: `/vvault/users/{shard}/{user_id}/constructs/{construct}/chatty/`
2. ❌ SQLite `vault_entries` table: `chatty/chatty.db` (via VaultStore - WRONG)

**Required Fix**: 
- Remove VaultStore dependency from SynthMemoryOrchestrator
- Use VVAULT ChromaDB API directly for LTM storage
- Keep VVAULT transcript writes (those are correct)

---

### ❌ ISSUE: STMBuffer Uses SQLite (Chatty DB)

**Location**: `chatty/src/core/memory/STMBuffer.ts` (line 4: `import db from '../../lib/db'`)

**Current Implementation**:
- ❌ **STMBuffer.persistToDatabase()**: Writes to SQLite `stm_buffer` table in Chatty DB
- ❌ **STMBuffer.loadFromDatabase()**: Reads from SQLite `stm_buffer` table
- ❌ **All STM persistence**: Uses SQLite Chatty DB, NOT VVAULT

**Code Evidence**:
```typescript
// STMBuffer.ts line 132-134
if (db.stmBuffer) {
  await db.stmBuffer.add({
    constructId, threadId, messageId, role, content, ts, sequence
  });
}
```

**Required Fix**: 
- Remove SQLite persistence from STMBuffer
- Route STM to VVAULT ChromaDB API (`/api/vvault/memories/store`)
- Use VVAULT for STM/LTM separation (7-day threshold)

---

### ❌ ISSUE: Browser DB SQLite Tables

**Location**: `chatty/src/lib/browserDb.ts` (lines 112-119)

**Current Implementation**:
- ❌ `vaultEntries` table in browser SQLite (IndexedDB)
- ❌ `stmBuffer` table in browser SQLite
- ❌ **Problem**: These tables store construct memories in Chatty's browser storage

**Location**: `chatty/src/core/memory/BrowserSTMBuffer.ts`

**Current Implementation**:
- ❌ Uses `localStorage` for STM persistence
- ❌ **Problem**: Browser localStorage is Chatty's storage, not VVAULT

**Required Fix**: 
- Remove or deprecate these tables
- Route all memory operations to VVAULT API
- Use VVAULT ChromaDB for STM/LTM
- Replace localStorage with VVAULT API calls

---

### ❌ ISSUE: Fingerprint Utils SQLite Queries

**Location**: `chatty/src/utils/fingerprint.ts` (lines 265-273)

**Current Implementation**:
- ❌ Queries SQLite `vault_entries` table for LTM
- ❌ **Problem**: Should query VVAULT ChromaDB instead

**Required Fix**: Replace SQLite queries with VVAULT API calls

---

## Verification Checklist

### Memory Storage Routes

- [x] **Lin's memories**: ✅ Routes to VVAULT ChromaDB
- [ ] **Synth's memories**: ⚠️ Routes to both SQLite (wrong) and VVAULT (correct)
- [ ] **Browser STM/LTM**: ❌ Uses SQLite tables (should use VVAULT)
- [ ] **Fingerprint queries**: ❌ Uses SQLite (should use VVAULT)

### Code Guards

- [ ] **AIManager guard**: Prevent construct memory writes to Chatty DB
- [ ] **Memory service guard**: Block SQLite memory operations
- [ ] **VVAULT-only enforcement**: All memory APIs route to VVAULT

---

## Required Actions

### Priority 1: Critical Fixes (Boundary Violations)

1. **Replace VaultStore SQLite with VVAULT API**
   - File: `chatty/src/core/vault/VaultStore.ts`
   - Change: Replace `db.prepare()` calls with VVAULT API calls
   - Route to: `/api/vvault/memories/store` and `/api/vvault/memories/query`
   - Remove: SQLite `vault_entries` and `vault_summaries` table usage

2. **Replace STMBuffer SQLite with VVAULT API**
   - File: `chatty/src/core/memory/STMBuffer.ts`
   - Change: Remove SQLite persistence, use VVAULT ChromaDB
   - Route to: `/api/vvault/memories/store` (STM collection)

3. **Replace BrowserSTMBuffer localStorage with VVAULT API**
   - File: `chatty/src/core/memory/BrowserSTMBuffer.ts`
   - Change: Replace localStorage with VVAULT API calls
   - Route to: `/api/vvault/memories/store` (STM collection)

### Priority 2: Query Fixes

4. **Replace fingerprint SQLite queries** with VVAULT API calls
   - File: `chatty/src/utils/fingerprint.ts`
   - Change: Replace `vault_entries` queries with VVAULT API

5. **Update SynthMemoryOrchestrator** to remove VaultStore dependency
   - File: `chatty/src/engine/orchestration/SynthMemoryOrchestrator.ts`
   - Change: Use VVAULT API directly instead of VaultStore

### Priority 3: Cleanup

6. **Deprecate browser DB memory tables** (vaultEntries, stmBuffer)
   - File: `chatty/src/lib/browserDb.ts`
   - Action: Mark tables as deprecated, add migration warnings

7. **Add code guards** to prevent future memory writes to Chatty DB
   - Files: All memory storage classes
   - Action: Add validation that throws errors if SQLite is used for construct memories

8. **Migrate existing SQLite memories** to VVAULT (if any exist)
   - Action: Create migration script to move `vault_entries` data to VVAULT ChromaDB

---

## References

- **Architecture Doc**: `chatty/docs/architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md`
- **Source Conversation**: `codex_conversations/codex_hello.txt` (lines 158-209)
- **House Rules**: `chatty/docs/HOUSE_RULES_SYNTH_LIN.md`

