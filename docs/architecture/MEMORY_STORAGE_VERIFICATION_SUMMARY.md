# Memory Storage Verification Summary

**Date**: January 2025  
**Purpose**: Complete verification that construct memories are stored in VVAULT, not Chatty DB

---

## Executive Summary

**CRITICAL FINDING**: Multiple code paths are storing construct memories in Chatty DB (SQLite), violating the VVAULT/Chatty boundary.

**Status**: ❌ **BOUNDARY VIOLATIONS FOUND**

---

## Detailed Findings

### ✅ CORRECT: Lin's Memory Storage

**Location**: `chatty/src/components/GPTCreator.tsx`

**Implementation**:
- ✅ LTM queries: `VVAULTConversationManager.loadMemoriesForConstruct()` → VVAULT ChromaDB
- ✅ LTM storage: `POST /api/vvault/identity/store` → VVAULT ChromaDB
- ✅ STM: In-memory only (UI state), not persisted to Chatty DB
- ✅ **All Lin memories correctly go to VVAULT** ✅

---

### ❌ CRITICAL: VaultStore Uses SQLite (Chatty DB)

**Location**: `chatty/src/core/vault/VaultStore.ts`

**Problem**: 
- Line 4: `import db from '../../lib/db'` - This is Chatty's SQLite DB
- All LTM operations write to SQLite `vault_entries` table
- All LTM queries read from SQLite `vault_entries` table

**Code Evidence**:
```typescript
// Line 47-60: saveMessage() writes to SQLite
const stmt = db.prepare(`
  INSERT INTO vault_entries (construct_id, thread_id, kind, payload, ts, relevance_score, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
```

**Impact**: 
- SynthMemoryOrchestrator uses VaultStore → writes to Chatty DB
- useThread hook uses VaultStore → writes to Chatty DB
- All LTM storage violates VVAULT boundary

**Required Fix**: Replace all VaultStore SQLite operations with VVAULT API calls

---

### ❌ CRITICAL: STMBuffer Uses SQLite (Chatty DB)

**Location**: `chatty/src/core/memory/STMBuffer.ts`

**Problem**:
- Line 4: `import db from '../../lib/db'` - Chatty's SQLite DB
- `persistToDatabase()` writes to SQLite `stm_buffer` table
- `loadFromDatabase()` reads from SQLite `stm_buffer` table

**Code Evidence**:
```typescript
// Line 132-134: Persists to SQLite
if (db.stmBuffer) {
  await db.stmBuffer.add({ constructId, threadId, messageId, role, content, ts, sequence });
}
```

**Impact**: All STM persistence goes to Chatty DB, not VVAULT

**Required Fix**: Remove SQLite persistence, use VVAULT ChromaDB API

---

### ❌ CRITICAL: BrowserSTMBuffer Uses localStorage

**Location**: `chatty/src/core/memory/BrowserSTMBuffer.ts`

**Problem**:
- Uses browser `localStorage` for STM persistence
- localStorage is Chatty's browser storage, not VVAULT

**Impact**: Browser STM storage violates VVAULT boundary

**Required Fix**: Replace localStorage with VVAULT API calls

---

### ❌ ISSUE: Browser DB SQLite Tables

**Location**: `chatty/src/lib/browserDb.ts`

**Problem**:
- `vaultEntries` table in IndexedDB (browser SQLite)
- `stmBuffer` table in IndexedDB
- These store construct memories in Chatty's browser storage

**Required Fix**: Deprecate these tables, route to VVAULT

---

### ❌ ISSUE: Fingerprint Utils SQLite Queries

**Location**: `chatty/src/utils/fingerprint.ts`

**Problem**:
- Lines 267-273: Queries SQLite `vault_entries` for LTM
- Should query VVAULT ChromaDB instead

**Required Fix**: Replace with VVAULT API calls

---

## Code Paths That Violate Boundary

### Memory Write Paths (WRONG - Go to Chatty DB)

1. **VaultStore.saveMessage()** → SQLite `vault_entries`
2. **STMBuffer.persistToDatabase()** → SQLite `stm_buffer`
3. **BrowserSTMBuffer.saveToStorage()** → localStorage
4. **SynthMemoryOrchestrator.captureMessage()** → VaultStore → SQLite

### Memory Read Paths (WRONG - Read from Chatty DB)

1. **VaultStore.search()** → SQLite `vault_entries`
2. **VaultStore.getSTM()** → SQLite `vault_entries`
3. **STMBuffer.loadFromDatabase()** → SQLite `stm_buffer`
4. **BrowserSTMBuffer.loadFromStorage()** → localStorage
5. **fingerprint.ts queries** → SQLite `vault_entries`

### Memory Write Paths (CORRECT - Go to VVAULT)

1. **Lin's LTM storage** → `/api/vvault/identity/store` → VVAULT ChromaDB ✅
2. **VVAULT transcript writes** → `/vvault/users/.../constructs/.../chatty/` ✅

---

## Files Requiring Changes

### Critical (Boundary Violations)

1. `chatty/src/core/vault/VaultStore.ts` - Replace SQLite with VVAULT API
2. `chatty/src/core/memory/STMBuffer.ts` - Remove SQLite persistence
3. `chatty/src/core/memory/BrowserSTMBuffer.ts` - Replace localStorage with VVAULT API
4. `chatty/src/engine/orchestration/SynthMemoryOrchestrator.ts` - Use VVAULT API directly

### High Priority

5. `chatty/src/utils/fingerprint.ts` - Replace SQLite queries with VVAULT API
6. `chatty/src/hooks/useThread.ts` - Remove VaultStore dependency
7. `chatty/src/state/constructs.ts` - Update to use VVAULT API instead of VaultStore

### Cleanup

8. `chatty/src/lib/browserDb.ts` - Deprecate vaultEntries/stmBuffer tables
9. `chatty/src/lib/db.ts` - Document that vault_entries/stm_buffer should not be used

---

## Migration Strategy

### Phase 1: Stop Writing to Chatty DB
- Add guards to prevent new writes
- Route all new memory operations to VVAULT

### Phase 2: Migrate Existing Data
- Create migration script to move SQLite memories to VVAULT ChromaDB
- Verify data integrity after migration

### Phase 3: Remove SQLite Memory Tables
- Deprecate `vault_entries`, `stm_buffer`, `vault_summaries` tables
- Remove code that uses them

---

## References

- **Architecture Doc**: `chatty/docs/architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md`
- **Detailed Verification**: `chatty/docs/architecture/VVAULT_CHATTY_MEMORY_STORAGE_VERIFICATION.md`
- **Source Conversation**: `codex_conversations/codex_hello.txt` (lines 158-209)


