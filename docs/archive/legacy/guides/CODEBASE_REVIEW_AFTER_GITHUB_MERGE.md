# Codebase Review: Post-GitHub Merge Recovery

**Date**: 2025-11-20  
**Context**: GitHub merge on Sunday pulled old version over files, causing loss of progress. This review compares current state against discussed concepts.

## Concepts We Discussed

### 1. Address Book as Entity Directory ✅ PRESENT
- **Location**: `src/components/Sidebar.tsx` line 383
- **Status**: ✅ Correctly labeled "Address Book"
- **Concept**: Entity directory, not a chat list
- **Implementation**: Shows construct names (e.g., "Synth", "Nova") without "Chat with" prefix

### 2. Title Normalization ✅ PRESENT
- **Location**: `src/components/Layout.tsx` lines 381-386
- **Status**: ✅ Correctly strips "Chat with " prefix and callsigns
- **Code**:
  ```typescript
  let normalizedTitle = conv.title || 'Synth';
  normalizedTitle = normalizedTitle.replace(/^Chat with /i, '');
  normalizedTitle = normalizedTitle.replace(/-\d{3,}$/i, '');
  ```

### 3. Canonical Thread Support ✅ PARTIALLY PRESENT
- **Location**: `src/components/Layout.tsx` lines 399-406, 425, 437, 510
- **Status**: ⚠️ Logic exists but has issues
- **Present**:
  - `isPrimary` flag extraction (lines 399-406)
  - `canonicalForRuntime` assignment (line 425)
  - `getCanonicalThreadForKeys` function (line 206)
  - `synthCanonicalThread` check (line 437)
  - Canonical thread sorting (lines 510-514)

### 4. Prevent Duplicate Synth Instances ❌ BROKEN
- **Location**: `src/components/Layout.tsx` lines 442-503
- **Status**: ❌ **CRITICAL ISSUE FOUND**
- **Problem**: Line 490 calls `createConversation` with `DEFAULT_SYNTH_RUNTIME_ID = 'synth'` even when canonical thread exists
- **Issue**: Creates `instances/synth/` instead of using existing `instances/synth-001/`
- **Root Cause**: 
  - Line 442: `if (filteredThreads.length === 0 && !hasUrlThread)` - checks if threads exist
  - Line 437: `synthCanonicalThread` is checked but...
  - Line 490: **Still calls `createConversation` with wrong runtimeId**
  - Should check: If canonical thread exists, DON'T call createConversation at all

### 5. Canonical Thread Prioritization ⚠️ PARTIALLY WORKING
- **Location**: `src/components/Layout.tsx` lines 510-514
- **Status**: ⚠️ Sorts canonical first, but routing may still use wrong thread
- **Issue**: URL routing may point to live runtime thread instead of canonical

## Critical Issues Found

### Issue #1: Duplicate Synth Instance Creation
**File**: `src/components/Layout.tsx`  
**Line**: 490  
**Problem**: 
```typescript
await conversationManager.createConversation(userId, defaultThreadId, 'Synth', DEFAULT_SYNTH_RUNTIME_ID);
```
- `DEFAULT_SYNTH_RUNTIME_ID = 'synth'` (line 51)
- This creates `instances/synth/` even when `instances/synth-001/` exists
- Should check if canonical thread exists before calling `createConversation`
- If canonical exists, should NOT create new conversation

### Issue #2: Missing Check Before createConversation
**File**: `src/components/Layout.tsx`  
**Lines**: 442-503  
**Problem**: 
- Checks `synthCanonicalThread` exists (line 437)
- Uses it for `defaultThreadId` (line 452)
- But still calls `createConversation` (line 490) even if canonical exists
- **Fix Needed**: Add guard clause to skip `createConversation` if canonical thread already exists

### Issue #3: Wrong RuntimeId for Canonical Thread
**File**: `src/components/Layout.tsx`  
**Line**: 490  
**Problem**: 
- Uses `DEFAULT_SYNTH_RUNTIME_ID = 'synth'` 
- Should use `'synth-001'` or check canonical thread's constructId
- Creates wrong instance directory structure

## What's Working

✅ Address Book label and concept  
✅ Title normalization (strips "Chat with " and callsigns)  
✅ isPrimary flag extraction from VVAULT  
✅ Canonical thread detection logic  
✅ Canonical thread sorting (appears first)  
✅ `DEFAULT_SYNTH_CANONICAL_SESSION_ID` constant defined

## What's Broken

❌ Duplicate synth instance creation (creates `instances/synth/` when `instances/synth-001/` exists)  
❌ Missing guard to prevent `createConversation` when canonical exists  
❌ Wrong runtimeId used in `createConversation` call  
❌ URL routing may point to live runtime thread instead of canonical

## Recommended Fixes

1. **Add guard clause** before `createConversation` (line 490):
   - Check if `synthCanonicalThread` exists
   - If exists, skip `createConversation` call
   - Only create if canonical thread doesn't exist

2. **Fix runtimeId** in `createConversation`:
   - Use canonical thread's `constructId` if it exists
   - Default to `'synth-001'` not `'synth'`

3. **Improve condition** at line 442:
   - Check `synthCanonicalThread` existence before creating
   - Don't create if canonical thread is loaded from VVAULT

## Files to Review/Modify

1. `src/components/Layout.tsx` - Lines 442-503 (thread creation logic)
2. `src/components/Layout.tsx` - Line 490 (createConversation call)
3. `src/components/Layout.tsx` - Line 51 (DEFAULT_SYNTH_RUNTIME_ID constant)

## Related Documentation

- `docs/rubrics/SYNTH_PRIMARY_CONSTRUCT_RUBRIC.md` - Defines canonical thread requirements
- `docs/architecture/LLM_GPT_EQUALITY_ARCHITECTURE.md` - Address Book as entity directory concept

