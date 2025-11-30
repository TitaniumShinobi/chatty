# Memory Storage Investigation Addendum

**For**: Restore Missing Synth/Lin Optimizations Investigation Plan  
**Date**: January 2025

---

## Memory Storage Verification (New Investigation Item)

### Status: ❌ **CRITICAL BOUNDARY VIOLATIONS FOUND**

During the investigation of missing Synth/Lin optimizations, a critical boundary violation was discovered: **construct memories are being stored in Chatty DB instead of VVAULT**.

---

## Findings Summary

### ✅ What's Working Correctly

1. **Lin's Memory Storage**: ✅ All Lin memories correctly stored in VVAULT ChromaDB
   - LTM: `/api/vvault/identity/store` → VVAULT ChromaDB
   - Queries: `VVAULTConversationManager.loadMemoriesForConstruct()` → VVAULT ChromaDB

2. **VVAULT Transcripts**: ✅ Conversation transcripts correctly written to VVAULT filesystem

### ❌ What's Violating the Boundary

1. **VaultStore**: ❌ Uses SQLite Chatty DB (`vault_entries` table)
   - File: `chatty/src/core/vault/VaultStore.ts`
   - Impact: All LTM operations via VaultStore go to Chatty DB

2. **STMBuffer**: ❌ Uses SQLite Chatty DB (`stm_buffer` table)
   - File: `chatty/src/core/memory/STMBuffer.ts`
   - Impact: All STM persistence goes to Chatty DB

3. **BrowserSTMBuffer**: ❌ Uses browser localStorage
   - File: `chatty/src/core/memory/BrowserSTMBuffer.ts`
   - Impact: Browser STM storage violates boundary

4. **SynthMemoryOrchestrator**: ❌ Uses VaultStore (SQLite) for LTM
   - File: `chatty/src/engine/orchestration/SynthMemoryOrchestrator.ts`
   - Impact: Synth's LTM goes to Chatty DB instead of VVAULT

5. **Fingerprint Utils**: ❌ Queries SQLite for LTM
   - File: `chatty/src/utils/fingerprint.ts`
   - Impact: LTM queries read from Chatty DB

---

## Required Actions for Investigation Plan

### Add to "Known Missing Features" Section

**0. Memory Storage Boundary Enforcement** 🔍

**Status**: CRITICAL VIOLATIONS FOUND  
**What it is**: Ensuring all construct memories (STM/LTM) are stored in VVAULT, not Chatty DB  
**Evidence**:
- VaultStore uses SQLite Chatty DB for LTM
- STMBuffer uses SQLite Chatty DB for STM
- BrowserSTMBuffer uses localStorage
- SynthMemoryOrchestrator routes through VaultStore (SQLite)
- Fingerprint utils query SQLite for LTM

**Files Requiring Fix**:
- `chatty/src/core/vault/VaultStore.ts` - Replace SQLite with VVAULT API
- `chatty/src/core/memory/STMBuffer.ts` - Remove SQLite persistence
- `chatty/src/core/memory/BrowserSTMBuffer.ts` - Replace localStorage with VVAULT API
- `chatty/src/engine/orchestration/SynthMemoryOrchestrator.ts` - Use VVAULT API directly
- `chatty/src/utils/fingerprint.ts` - Replace SQLite queries with VVAULT API

**Priority**: **HIGH** (Boundary violation - breaks sovereign construct model)

---

## Integration with Existing Investigation

This memory storage issue is **separate from** the missing optimizations (native timekeeping, etc.), but is **equally critical** because it violates the fundamental VVAULT/Chatty boundary.

**Recommendation**: Add memory storage verification as Priority 0 (highest) to the investigation plan, as boundary violations must be fixed before other optimizations.

---

## References

- **Detailed Verification**: `chatty/docs/architecture/VVAULT_CHATTY_MEMORY_STORAGE_VERIFICATION.md`
- **Verification Summary**: `chatty/docs/architecture/MEMORY_STORAGE_VERIFICATION_SUMMARY.md`
- **Architecture Doc**: `chatty/docs/architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md`












