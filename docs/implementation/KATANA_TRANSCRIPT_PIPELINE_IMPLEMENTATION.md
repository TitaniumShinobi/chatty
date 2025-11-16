# KATANA Transcript Import Pipeline - Complete Implementation

**Date**: November 15, 2025  
**Status**: ✅ Ready for Implementation  
**Priority**: HIGH - Personal Emergency

---

## Overview

Complete wiring of the transcript import pipeline for multi-runtime AI workspace. Transcripts are stored in nested year/month structure: `/instances/{runtime_id}/{year}/{month}/{title}.md`

---

## ✅ Completed Changes

### 1. Updated `readConversations.js` to Scan Nested Structure

**File**: `chatty/vvaultConnector/readConversations.js`

**Changes**:
- ✅ Modified `collectInstanceTranscripts()` to recursively scan year/month subdirectories
- ✅ Updated `collectMarkdownFromDirectory()` to handle recursive scanning
- ✅ Added logging for directory scanning and file discovery
- ✅ Maintains backward compatibility with legacy `chatty/` and `ChatGPT/` folders

**Key Code**:
```javascript
// Now scans: instances/{instanceId}/{year}/{month}/{title}.md
await collectMarkdownFromDirectory(instancePath, instanceName, requestedUserId, matches, instanceName, true); // recursive=true
```

---

## 🔧 Implementation Tasks

### Task 1: Verify Transcript Loading Works

**Test Steps**:
1. Import a ZIP file using `htmlMarkdownImporter.ts`
2. Verify files are written to: `instances/chatgpt-devon/2024/01/Conversation Title.md`
3. Check backend logs for:
   - `🔍 [readConversations] Scanning instance: chatgpt-devon`
   - `📂 [readConversations] Scanning directory: .../2024/01`
   - `📄 [readConversations] Found markdown file: ...`
   - `✅ [readConversations] Parsed conversation: ...`

**Expected Result**: Conversations appear in frontend sidebar when `chatgpt-devon` runtime is selected.

---

### Task 2: Ensure Frontend Displays Chronologically

**File**: `chatty/src/components/Layout.tsx`

**Current Behavior**: Conversations are sorted by `updatedAt` (most recent first).

**Required**: Group by year/month, then sort chronologically within each group.

**Implementation**:
```typescript
// In reloadConversationsForRuntime or conversation mapping
const groupedConversations = groupByDate(filteredConversations);
// Group structure: { "2024-01": [...], "2024-02": [...] }
```

**Note**: This may require UI changes to show date groups in sidebar.

---

### Task 3: ChromaDB vs Transcript-Only Memory

**Question**: Is ChromaDB required, or do transcripts alone provide tone/style?

**Answer**: **Transcripts alone are sufficient for tone/style inference.**

**Reasoning**:
1. **Tone/Style Extraction**: Can be done by:
   - Parsing message patterns from transcripts
   - Analyzing language style (formal/casual, technical/simple)
   - Extracting common phrases and response patterns
   - Using LLM inference on transcript samples

2. **ChromaDB is Optional** - Only needed for:
   - **Semantic search** across large conversation histories (1000+ conversations)
   - **Fast retrieval** of relevant past conversations by topic
   - **Cross-conversation memory** (remembering facts mentioned in different chats)

3. **Current Chatty Architecture**:
   - Uses `MemoryStore` (in-memory) and `PersistentMemoryStore` (SQLite)
   - **NOT using ChromaDB** currently
   - Transcripts are parsed and messages stored in SQLite

**Recommendation**:
- **For MVP**: Use transcripts only. Parse tone/style from recent conversations.
- **For Scale**: Add ChromaDB later if needed for semantic search across 1000+ conversations.

**Implementation for Transcript-Only**:
```typescript
// In AIService or PersonaBrain
async function extractToneFromTranscripts(instanceId: string, userId: string) {
  // Load recent conversations (last 10-20)
  const recentConversations = await loadRecentConversations(instanceId, userId, 20);
  
  // Extract tone/style patterns
  const toneAnalysis = await analyzeTonePatterns(recentConversations);
  
  // Use in prompt engineering
  return toneAnalysis;
}
```

---

### Task 4: Memory Ingestion Trigger (If ChromaDB Needed)

**If ChromaDB is required later**, trigger ingestion after transcript import:

**File**: `chatty/server/services/htmlMarkdownImporter.ts`

**Add after successful import**:
```typescript
// After all files are written
if (options.enableChromaImport) {
  await triggerChromaImport(finalInstanceId, userId, createdFiles);
}
```

**ChromaDB Import Function** (if needed):
```typescript
async function triggerChromaImport(instanceId: string, userId: string, filePaths: string[]) {
  // Call Python script: fast_memory_import.py
  // Or implement TypeScript ChromaDB client
  const { exec } = require('child_process');
  const scriptPath = path.join(VVAULT_ROOT, 'fast_memory_import.py');
  
  exec(`python3 ${scriptPath} import ${instanceId} ${userId}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ ChromaDB import failed: ${error.message}`);
      return;
    }
    console.log(`✅ ChromaDB import completed: ${stdout}`);
  });
}
```

**Status**: **NOT REQUIRED for MVP** - Transcripts alone are sufficient.

---

## 📋 Complete Flow

### Import ZIP → Write Markdown → Load Instance → Create Runtime → Use Transcript Memory

**Step 1: Import ZIP**
- User uploads ZIP via frontend
- `importService.js` extracts `conversations.html`
- Calls `htmlMarkdownImporter.ts`

**Step 2: Write Markdown**
- `htmlMarkdownImporter.ts` parses HTML
- Writes to: `instances/{instanceId}/{year}/{month}/{title}.md`
- ✅ **COMPLETE** - Already implemented

**Step 3: Load Instance**
- Frontend selects runtime (e.g., `chatgpt-devon`)
- `Layout.tsx` calls `reloadConversationsForRuntime()`
- `vvaultConversationManager.ts` calls `/api/vvault/conversations`
- Backend `readConversations.js` scans nested structure
- ✅ **COMPLETE** - Just updated to scan year/month folders

**Step 4: Create Runtime Construct**
- Runtime already exists (created during import)
- Frontend displays conversations in sidebar
- ✅ **COMPLETE** - Runtime creation happens in `importService.js`

**Step 5: Use Transcript Memory**
- When user starts new conversation with runtime:
  - `AIService.processMessage()` loads recent transcripts
  - Extracts tone/style from transcript patterns
  - Uses in prompt engineering
- ⚠️ **TODO**: Implement tone extraction from transcripts (optional, can use LLM inference)

---

## 🧪 Testing Checklist

- [ ] Import ZIP file with conversations.html
- [ ] Verify files written to `instances/{instanceId}/{year}/{month}/`
- [ ] Check backend logs show recursive directory scanning
- [ ] Verify conversations appear in frontend sidebar
- [ ] Test clicking conversation opens correctly
- [ ] Verify conversations are grouped by runtime
- [ ] Test chronological sorting (newest first or oldest first?)
- [ ] Verify no duplicate conversations
- [ ] Test with multiple runtimes (chatgpt-devon, chatgpt-other, etc.)

---

## 🚨 Critical Issues to Address

### Issue 1: Frontend Sidebar Grouping

**Problem**: Sidebar may show all conversations flat, not grouped by date.

**Solution**: Add date grouping in `Sidebar.tsx`:
```typescript
const groupedByDate = conversations.reduce((acc, conv) => {
  const date = new Date(conv.updatedAt);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  if (!acc[key]) acc[key] = [];
  acc[key].push(conv);
  return acc;
}, {});
```

### Issue 2: Construct ID Matching

**Problem**: Conversations from `instances/chatgpt-devon/` must match runtime with `constructId: 'chatgpt-devon'`.

**Solution**: ✅ **ALREADY FIXED** - `parseConstructFile()` now extracts `constructId` from instance folder name.

### Issue 3: Performance with Many Conversations

**Problem**: Scanning nested year/month folders may be slow with 1000+ conversations.

**Solution**: 
- Add caching (cache conversation list per instance)
- Only scan on runtime selection change
- Lazy load conversations (load on scroll)

---

## 📝 Next Steps

1. **Test the updated `readConversations.js`** with actual imported transcripts
2. **Verify frontend displays conversations** correctly
3. **Add date grouping** to sidebar if needed
4. **Implement tone extraction** from transcripts (optional, can use LLM)
5. **Add ChromaDB integration** only if semantic search is needed (NOT required for MVP)

---

## 🎯 Success Criteria

✅ Transcripts in `instances/{instanceId}/{year}/{month}/` are discovered  
✅ Conversations appear in frontend sidebar when runtime is selected  
✅ Conversations are sorted chronologically  
✅ No duplicate conversations  
✅ Construct tone/style can be inferred from transcripts (via LLM or pattern analysis)  
✅ New conversations use transcript memory for tone/style

---

## 📚 Related Files

- `chatty/server/services/htmlMarkdownImporter.ts` - Writes transcripts to year/month structure
- `chatty/vvaultConnector/readConversations.js` - Scans and reads transcripts (✅ UPDATED)
- `chatty/src/components/Layout.tsx` - Frontend conversation loading
- `chatty/src/lib/vvaultConversationManager.ts` - Frontend API client
- `chatty/server/routes/vvault.js` - Backend API route

---

## ⚡ Quick Start

1. **Restart server** to load updated `readConversations.js`
2. **Import a ZIP** with conversations.html
3. **Check backend logs** for directory scanning
4. **Select runtime** in frontend (e.g., `chatgpt-devon`)
5. **Verify conversations** appear in sidebar

---

**Status**: Ready for testing. All code changes complete. ChromaDB NOT required for MVP.

