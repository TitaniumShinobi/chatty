# Plan: GPT Deletion — Supabase File Cleanup

**Date:** 2026-02-12
**Status:** PLAN
**Priority:** Critical Data Integrity

## Overview

When a user deletes a GPT in Chatty, all associated files in Supabase must be cleaned up so they are no longer recoverable. Currently, the deletion only removes the database record and local filesystem files — Supabase `vault_files` records survive forever.

## Current State

### What Happens Now

1. User clicks "Delete" on a GPT in the UI
2. Frontend calls `DELETE /api/ais/:id`
3. Backend (`server/routes/ais.js` line ~351):
   - Checks VSI protection (blocks deletion if protected)
   - Deletes from `ais` database table via `aiManager.deleteAI(id)`
   - Calls `fileManager.deleteGPT(constructCallsign, false)` for file cleanup
4. `fileManagementAutomation.js` `deleteGPT()` (line ~151):
   - **Only deletes from local filesystem** via VVAULT_ROOT (`fs.rm(instancePath, { recursive: true })`)
   - Does NOT touch Supabase `vault_files` at all
   - In production mode with `archive=true`, archives to local archive directory instead

### Policy Conflict

The `replit.md` states: *"vault_files records are never deleted, only updated."*

This conflicts with the user's requirement that deleted GPTs should be irrecoverable. Resolution:

**Exception rule:** When a user explicitly deletes a GPT through the UI, the "never delete" rule is overridden. The user's explicit action constitutes consent for permanent removal. All other operations (updates, edits, renames) continue to follow the "never delete" rule.

To maintain accountability, a deletion manifest is logged before files are removed (see Rollback Safety section below).

### What Survives Deletion (BUG)

All of the following remain in Supabase `vault_files` after deletion:

| Data Type | Path Pattern | Example |
|-----------|-------------|---------|
| Chat transcripts | `instances/{callsign}/chatty/chat_with_{callsign}.md` | `instances/katana-001/chatty/chat_with_katana-001.md` |
| Identity files | `instances/{callsign}/identity/prompt.txt` | `instances/katana-001/identity/prompt.txt` |
| Conditioning | `instances/{callsign}/identity/conditioning.txt` | |
| Capsules | `instances/{callsign}/capsules/*.capsule` | `instances/katana-001/capsules/katana-001.capsule` |
| Avatars | `instances/{callsign}/avatar.*` | Supabase Storage bucket |
| Knowledge files | `instances/{callsign}/knowledge/*` | Uploaded reference docs |
| Continuity ledger | `instances/{callsign}/chatty/continuity_ledger.json` | |
| Memory anchors | `instances/{callsign}/chatty/*_anchors.json` | Pre-extracted needle anchors |
| Legacy chat files | `chat_with_{callsign}.md` | Root-level legacy files |

### Additional Issues
- `gpts` table records are also not cleaned up when deleting from `ais` table (if GPT exists in both)
- Memory anchor cache in masterScriptsBridge (in-memory) is not cleared
- Autonomy stack state for the deleted construct persists in memory until server restart

## Target Behavior

When a user deletes a GPT:
1. All database records removed (ais table, gpts table)
2. All Supabase `vault_files` records for that construct are permanently deleted
3. All Supabase Storage bucket files (avatars) are deleted
4. In-memory caches are cleared (needle anchors, ledger cache, autonomy stack state)
5. Conversations referencing the construct are cleaned from the frontend thread list

## Implementation Plan

### Step 1: Add Supabase Cleanup to Deletion Flow

Create a new method `deleteConstructFromSupabase(constructCallsign, userId)` in `fileManagementAutomation.js` (or a new `supabaseCleanup.js` module):

```
async deleteConstructFromSupabase(constructCallsign, userId) {
  // 1. Find all vault_files records matching this construct
  //    WHERE filename LIKE 'instances/{callsign}/%'
  //    OR filename LIKE 'chat_with_{callsign}%'
  //    AND user_id = userId
  
  // 2. Delete all matching records from vault_files table
  
  // 3. Delete avatar from Supabase Storage bucket
  //    supabase.storage.from('avatars').remove(['{callsign}/*'])
  
  // 4. Delete any sidecar anchor files
  //    WHERE filename LIKE '%{callsign}%anchors%'
  
  // 5. Return deletion summary (count of files removed)
}
```

### Step 2: Wire into Delete Route

Update `server/routes/ais.js` DELETE handler (line ~384):

```
// After aiManager.deleteAI() succeeds:

// 1. Existing: local filesystem cleanup
await fileManager.deleteGPT(constructCallsign, false);

// 2. NEW: Supabase vault_files cleanup
await deleteConstructFromSupabase(constructCallsign, userId);

// 3. NEW: Clear in-memory caches
masterScriptsManager.removeConstruct(constructCallsign);
clearLedgerCache(constructCallsign);
```

### Step 3: Clear In-Memory State

Add cleanup methods:
- `masterScriptsBridge.js`: Add `removeConstruct(callsign)` to clear needle anchors, state, identity guard
- `continuityParser.js`: Add `clearLedgerCache(callsign)` to remove cached ledger
- `verifiedMemoryLoader.js`: Clear any cached memory results for the construct

### Step 4: Cross-Table Cleanup

When deleting from `ais` table, also check and delete from `gpts` table (and vice versa):
```
// If GPT exists in both tables, delete from both
await aiManager.deleteAI(id);
await gptManager.deleteGPTByCallsign(constructCallsign);
```

### Step 5: Frontend Thread Cleanup

After successful deletion:
- Remove the construct's thread from the threads state
- Remove from Address Book
- If the deleted construct's chat was active, navigate to Zen's chat
- Refresh the conversation list

### Step 6: Confirmation Dialog

Before deletion, show a clear confirmation:
```
"Delete Katana permanently? This will remove all conversations, 
memories, identity files, and capsules. This cannot be undone."

[Cancel] [Delete Permanently]
```

## Data Protection Considerations

- The existing rule "vault_files records are never deleted, only updated" conflicts with this requirement. For GPT deletion specifically, the user's explicit action overrides this rule — deletion means deletion.
- VSI-protected constructs remain blocked from deletion (existing `checkDeletionProtection` logic stays)
- Consider adding a "soft delete" grace period (e.g., 30-day recovery window) as a future enhancement
- Audit log should record what was deleted, when, and by whom

## Rollback Safety

Before executing permanent deletion, the system should:
1. Log all file paths that will be deleted
2. Record total content size being removed
3. Store a deletion manifest in a system audit table
4. Only after manifest is recorded, proceed with actual deletion

This provides a record of what was deleted even if the data itself is unrecoverable.

## Files to Modify

| File | Change |
|------|--------|
| `server/routes/ais.js` | Wire Supabase cleanup into DELETE handler |
| `server/routes/gpts.js` | Wire Supabase cleanup into DELETE handler |
| `server/lib/fileManagementAutomation.js` | Add `deleteConstructFromSupabase()` method |
| `server/lib/masterScriptsBridge.js` | Add `removeConstruct()` for in-memory cleanup |
| `server/lib/continuityParser.js` | Add `clearLedgerCache()` export |
| `server/lib/verifiedMemoryLoader.js` | Add cache invalidation for deleted construct |
| `src/components/Layout.tsx` | Handle post-deletion UI cleanup |
| `src/components/GPTCreator.tsx` | Add deletion confirmation dialog |

## Dependencies
- Supabase client configured with service key (for deletion operations)
- User authentication (to scope deletions to the owning user)
- VSI protection system (to block protected construct deletion)
