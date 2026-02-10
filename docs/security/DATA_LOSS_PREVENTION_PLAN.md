# Data Loss Prevention Plan

**Created**: 2025-11-13  
**Status**: CRITICAL - Preventing data loss is top priority

## Problem Statement

**We are losing runtime data** - imported runtimes (like "devon@thewreck.org — ChatGPT") are disappearing. This is unacceptable and must be prevented immediately.

## Root Causes Identified

1. **Missing Deletion Filter**: `loadRuntimes()` doesn't filter deleted runtimes, but `RuntimeDeletionManager` may have marked them as deleted
2. **No Persistence Verification**: No script to verify runtimes exist before/after changes
3. **File Location Tracking**: Conversations can be moved and become undiscoverable
4. **No Change Ledger**: Project State Ledger not being updated with file moves

## Immediate Actions Required

### 1. Fix Runtime Loading to Filter Deleted Runtimes

**File**: `chatty/src/components/Layout.tsx` (line 1344-1462)

**Problem**: `loadRuntimes()` doesn't use `RuntimeDeletionManager.filterDeletedRuntimes()`

**Fix**: Add deletion filtering before setting runtimes

```typescript
import { RuntimeDeletionManager } from '../lib/runtimeDeletionManager';

// In loadRuntimes, after building runtimeOptions:
const deletionManager = RuntimeDeletionManager.getInstance();
const filteredRuntimes = deletionManager.filterDeletedRuntimes(runtimeOptions);
setRuntimes(filteredRuntimes);
```

### 2. Create Conversation Location Ledger

**File**: `chatty/CONVERSATION_LOCATIONS_LEDGER.md` (already created)

**Usage**: Run `node scripts/track-conversations.js` before/after any file moves

**Purpose**: Track all conversation file locations and verify frontend discoverability

### 3. Verify Runtime Persistence

**File**: `chatty/scripts/verify-runtime-persistence.js` (already created)

**Usage**: Run `node scripts/verify-runtime-persistence.js` after server restarts

**Purpose**: Verify runtimes exist in database and VVAULT

### 4. Update Project State Ledger

**File**: `chatty/commits.md`

**Required**: Every file move, database change, or structural modification must be logged

**Format**: Date, files affected, reason, status

## Safeguards to Implement

### A. Pre-Change Verification

Before making ANY structural changes:
1. Run `track-conversations.js` to get baseline
2. Run `verify-runtime-persistence.js` to verify runtimes exist
3. Document planned changes in Project State Ledger

### B. Post-Change Verification

After making changes:
1. Run `track-conversations.js` again - compare with baseline
2. Run `verify-runtime-persistence.js` - verify no runtimes lost
3. Test frontend - verify conversations appear in sidebar
4. Update Project State Ledger with results

### C. Runtime Deletion Protection

**NEVER auto-delete runtimes** - only manual deletion via UI
- Removed auto-deletion from `loadRuntimes()` ✅
- Duplicate detection only logs warnings ✅
- User must explicitly remove via RuntimeDashboard ✅

### D. File Move Protection

**NEVER move conversation files without:**
1. Updating `readConversations.js` search paths
2. Running `track-conversations.js` to verify discoverability
3. Updating Project State Ledger
4. Testing frontend immediately after

## Implementation Checklist

- [ ] Fix `loadRuntimes()` to filter deleted runtimes
- [ ] Add runtime persistence check to startup
- [ ] Ensure conversations.html imports appear in sidebar
- [ ] Implement Lin personality extraction
- [ ] Update Project State Ledger with all recent changes
- [ ] Create pre-change verification script
- [ ] Add post-change verification to CI/CD (if applicable)

## Success Criteria

✅ No runtime disappears after server restart  
✅ All conversations remain discoverable after file moves  
✅ Project State Ledger updated with every change  
✅ Verification scripts run before/after structural changes  
✅ Frontend always shows conversations correctly  

---

**CRITICAL REMINDER**: Data loss is unacceptable. When in doubt, preserve existing data and add new functionality alongside, never replace.

