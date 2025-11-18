# Runtime-Specific Canonical Routing and Pinning Implementation

**Date**: November 15, 2025  
**Priority**: Urgent  
**Context**: Multi-runtime AI workspace with imported runtimes needing canonical conversation files

---

## 🎯 Objective

Implement runtime-specific canonical pinning and routing so that:
1. **Synth** is pinned and routes to `chat_with_synth-001.md` **only when Chatty runtime is active**
2. **Imported runtimes** (e.g., "ChatGPT") have their own pinned conversation that routes to `chat_with_{constructId}.md`
3. Each runtime's pinned conversation is **isolated** to that runtime's workspace context
4. Files are automatically created on import and properly marked as canonical

**⚠️ CRITICAL**: This implementation must integrate with the **Construct Detection → Matching → Persistence → Drift Prevention System** (see `CONSTRUCT_DETECTION_MATCHING_PERSISTENCE_SYSTEM.md`). Every imported construct must go through:
- **Detection**: Multi-strategy construct name detection with confidence scoring
- **Matching**: Match to existing constructs (by name, fingerprint, email, GPT ID, semantic similarity)
- **Persistence**: Save personality data to `instances/{constructId}/lin/` for Lin synthesis
- **Drift Prevention**: Initialize drift detector baseline and enable real-time monitoring

---

## ✅ Current State (What Works)

- Primary runtime ("Synth") exists at:
  ```
  /vvault/users/shard_0000/{user_id}/instances/synth-001/chatty/chat_with_synth-001.md
  ```
- Runtime selection UI exists (`Choose Your Runtime` screen)
- ChatGPT persona imported successfully, instance at:
  ```
  /vvault/users/shard_0000/devon_woodson_1762969514958/instances/chatgpt-devon-001/
  ```
- Conversations from import written to:
  ```
  instances/{constructId}/{year}/{month}/*.md
  ```
- `readConversations.js` parses `<!-- IMPORT_METADATA ... -->` blocks via `parseHeader()` function
- `htmlMarkdownImporter.ts` has file writing logic using `fs.promises.mkdir` and `fs.promises.writeFile`

---

## ❌ Current Issues

1. **No canonical `.md` file created** for ChatGPT import at:
   ```
   instances/chatgpt-devon-001/chatty/chat_with_chatgpt-devon-001.md
   ```

2. **Synth conversation shows globally**, even when different runtime is selected

3. **Routing always points to Synth's chat file**, regardless of selected runtime

4. **No runtime-scoped filtering** - `isPrimary` not extracted from metadata, `canonicalForRuntime` not implemented

---

## 📋 Implementation Tasks

### Task 1: Create Canonical File on Import (Integrated with Construct System)

**Location**: `chatty/server/services/importService.js`

**Action**: After successful HTML import AND construct processing, create primary conversation file.

**⚠️ IMPORTANT**: This must be called AFTER the construct detection/matching/persistence system completes (see `CONSTRUCT_DETECTION_MATCHING_PERSISTENCE_SYSTEM.md`).

**Function to Add**:
```javascript
async function createPrimaryConversationFile(constructId, userId, email, provider, vvaultRoot, shardId = 'shard_0000') {
  const primaryDir = path.join(
    vvaultRoot,
    'users',
    shardId,
    userId,
    'instances',
    constructId,
    'chatty'
  );
  
  // Ensure directory exists
  await fs.mkdir(primaryDir, { recursive: true });
  
  const primaryFilePath = path.join(primaryDir, `chat_with_${constructId}.md`);
  
  const sessionId = `${constructId}_chat_with_${constructId}`;
  const timestamp = new Date().toISOString();
  
  const content = `# Chat with ${provider}

**Created**: ${timestamp}
**Session ID**: ${sessionId}
**Construct**: ${constructId}
**Runtime**: ${constructId}

<!-- IMPORT_METADATA
source: ${provider}
importedAt: ${timestamp}
constructId: ${constructId}
runtimeId: ${constructId}
isPrimary: true
-->

---

Welcome to your ${provider} runtime. This is your canonical conversation.

Your imported conversations are available in the sidebar.
`;

  await fs.writeFile(primaryFilePath, content, 'utf8');
  console.log(`✅ [importService] Created primary conversation file: ${primaryFilePath}`);
  
  return primaryFilePath;
}
```

**Integration Point**: Call this function in `persistImportToVVAULT()` after successful `processHtmlImport()` AND construct processing:
```javascript
// After result = await processHtmlImport(...)
if (result.created > 0) {
  // PHASE: Construct Detection → Matching → Persistence → Drift Prevention
  // (See CONSTRUCT_DETECTION_MATCHING_PERSISTENCE_SYSTEM.md for full implementation)
  const { ConstructImportOrchestrator } = await import('./constructImportOrchestrator.js');
  const orchestrator = new ConstructImportOrchestrator();
  
  const constructResult = await orchestrator.processImportedConstruct(conversations, {
    userId: vvaultUserId,
    email: identity?.email || userId,
    provider: source || 'chatgpt',
    gptConfig: gptConfig // From extractChatGPTConfig
  });
  
  // Use the constructId from orchestrator (may be matched or new)
  const finalConstructId = constructResult.constructId;
  
  console.log(`✅ [persistImportToVVAULT] Construct processed:`, {
    constructId: finalConstructId,
    wasMatched: constructResult.wasMatched,
    matchedTo: constructResult.matchedTo,
    confidence: constructResult.confidence,
    personalityExtracted: constructResult.personalityExtracted,
    driftPreventionEnabled: constructResult.driftPreventionEnabled
  });
  
  // Create primary conversation file using the final constructId
  const primaryFilePath = await createPrimaryConversationFile(
    finalConstructId, // ✅ Use constructId from orchestrator (may be matched)
    vvaultUserId,
    identity?.email || userId,
    source || 'chatgpt',
    VVAULT_ROOT,
    'shard_0000'
  );
  console.log(`✅ [persistImportToVVAULT] Primary conversation created: ${primaryFilePath}`);
}
```

**Note**: Use `fs` from `fs/promises` (already imported in `htmlMarkdownImporter.ts`). Reuse the same pattern:
```javascript
import fs from 'fs/promises';
import path from 'path';
```

---

### Task 2: Extract `isPrimary` from Metadata in `readConversations.js`

**Location**: `chatty/vvaultConnector/readConversations.js`

**Current State**: 
- `parseHeader()` function exists and extracts `importMetadata` from `<!-- IMPORT_METADATA ... -->` blocks
- `importMetadata` is stored in the header object
- `parseConstructFile()` returns `importMetadata` in the conversation object

**Action**: Expose `isPrimary` and ensure `constructId` is included in returned conversation object.

**Modify `parseConstructFile()` function** (around line 150-200):
```javascript
async function parseConstructFile(filePath, requestedUserId, constructFolder, instanceName = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const header = parseHeader(raw);

    // ... existing validation logic ...

    // Extract isPrimary from importMetadata
    const isPrimary = header.importMetadata?.isPrimary === true || 
                     header.importMetadata?.isPrimary === 'true';
    
    // Determine constructId (existing logic, but ensure it's always set)
    const folderConstruct = normalizeConstructId(instanceName || constructFolder);
    const metadataConstruct = normalizeConstructId(header.importMetadata?.constructId) ||
      normalizeConstructId(header.importMetadata?.connectedConstructId);
    const sessionConstruct = normalizeConstructId(extractConstructIdFromSession(sessionId));
    const constructId = metadataConstruct || folderConstruct || sessionConstruct || constructFolder || instanceName || null;

    // ... existing message parsing ...

    return {
      sessionId,
      title,
      messages,
      constructId, // Already included
      isPrimary, // ✅ NEW: Add this field
      importMetadata: header.importMetadata,
      constructFolder: instanceName || constructFolder || null,
      sourcePath: filePath,
      userId: requestedUserId || header.userId || null
    };
  } catch (error) {
    // ... existing error handling ...
  }
}
```

**Note**: The `parseHeader()` function already extracts `importMetadata` as a JSON object, so `header.importMetadata.isPrimary` should be available if it was written in the file.

---

### Task 3: Extend Thread Type and Update Layout.tsx

**Location**: `chatty/src/lib/types.ts` (or wherever Thread type is defined)

**Action**: Add `canonicalForRuntime` field to Thread interface.

**Add to Thread interface**:
```typescript
export interface Thread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  isCanonical?: boolean; // Existing
  canonicalForRuntime?: string; // ✅ NEW: Which runtime this is canonical for
  constructId?: string; // ✅ NEW: Which construct this belongs to
  importMetadata?: any; // Existing
  // ... other fields
}
```

**Location**: `chatty/src/components/Layout.tsx`

**Modify conversation-to-thread mapping** (around line 783-814):
```typescript
const loadedThreads: Thread[] = filteredConversations.map(conv => {
  let normalizedTitle = conv.title || 'Untitled Conversation';
  normalizedTitle = normalizedTitle.replace(/^Chat with\s+/i, '');
  normalizedTitle = normalizedTitle.replace(/-\d{3,}$/i, '');
  
  // ✅ NEW: Determine if this conversation is canonical for the active runtime
  const convConstructId = (conv as any).constructId;
  const convIsPrimary = (conv as any).isPrimary === true;
  const isCanonicalForThisRuntime = 
    convIsPrimary && 
    convConstructId && 
    convConstructId === activeRuntime.constructId;
  
  console.log('📝 [Layout.tsx] Converting conversation to thread:', {
    sessionId: conv.sessionId,
    title: conv.title,
    constructId: convConstructId,
    isPrimary: convIsPrimary,
    isCanonicalForThisRuntime,
    activeRuntimeConstructId: activeRuntime.constructId
  });
  
  return {
    id: conv.sessionId,
    title: normalizedTitle,
    messages: (conv.messages || []).map(msg => ({
      id: msg.id,
      role: msg.role,
      text: msg.content,
      ts: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
    })),
    createdAt: conv.messages?.[0]?.timestamp ? new Date(conv.messages[0].timestamp).getTime() : Date.now(),
    updatedAt: conv.messages?.[conv.messages.length - 1]?.timestamp ? new Date(conv.messages[conv.messages.length - 1].timestamp).getTime() : Date.now(),
    archived: false,
    isCanonical: isCanonicalForThisRuntime, // ✅ Runtime-scoped
    canonicalForRuntime: isCanonicalForThisRuntime ? activeRuntime.runtimeId : undefined, // ✅ NEW
    constructId: convConstructId, // ✅ NEW
    isCanonical: convIsPrimary && convConstructId === activeRuntime.constructId, // ✅ Runtime-scoped canonical flag
  };
});
```

**Also update canonical Synth creation logic** (around line 378-388):
```typescript
if (!hasCanonicalSynth) {
  const canonicalSynth: Thread = {
    id: 'synth-001_chat_with_synth-001',
    title: 'Synth',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: false,
    isCanonical: activeRuntime.runtimeId === 'synth-001', // ✅ Only canonical for Synth runtime
    canonicalForRuntime: 'synth-001', // ✅ NEW
    constructId: 'synth-001', // ✅ NEW
  };
  mergedMap.set(canonicalSynth.id, canonicalSynth);
}
```

---

### Task 4: Update Sidebar Display

**Location**: `chatty/src/components/Sidebar.tsx`

**Action**: Filter and sort conversations to show only active runtime's pinned conversation.

**Modify sorting logic** (around line 243-251):
```typescript
// Sort: pinned conversation for active runtime first, then by updatedAt (newest first)
const activeConversations = allActive.sort((a, b) => {
  // ✅ NEW: Check if conversation is canonical for the active runtime
  const aIsPinnedForRuntime = selectedRuntime && 
    (a.canonicalForRuntime === selectedRuntime.runtimeId || 
     (a.isCanonical && a.constructId === selectedRuntime.constructId));
  const bIsPinnedForRuntime = selectedRuntime && 
    (b.canonicalForRuntime === selectedRuntime.runtimeId || 
     (b.isCanonical && b.constructId === selectedRuntime.constructId));
  
  if (aIsPinnedForRuntime && !bIsPinnedForRuntime) return -1;
  if (bIsPinnedForRuntime && !aIsPinnedForRuntime) return 1;
  
  const aUpdated = typeof a.updatedAt === 'number' ? a.updatedAt : (typeof a.updatedAt === 'string' ? new Date(a.updatedAt).getTime() : 0);
  const bUpdated = typeof b.updatedAt === 'number' ? b.updatedAt : (typeof b.updatedAt === 'string' ? new Date(b.updatedAt).getTime() : 0);
  return bUpdated - aUpdated;
});
```

**Update pin icon display** (around line 423):
```typescript
{/* ✅ NEW: Only show pin for conversations pinned to active runtime */}
{selectedRuntime && 
 (thread.canonicalForRuntime === selectedRuntime.runtimeId || 
  (thread.isCanonical && thread.constructId === selectedRuntime.constructId)) && (
  <Pin size={12} className="text-blue-500 flex-shrink-0" />
)}
```

**Filter conversations by runtime** (before sorting, around line 240):
```typescript
// ✅ NEW: Filter to show only conversations for active runtime
const runtimeFiltered = selectedRuntime 
  ? allActive.filter(conv => {
      const convConstructId = (conv as any).constructId;
      const runtimeConstructId = selectedRuntime.constructId || selectedRuntime.runtimeId;
      return convConstructId === runtimeConstructId || 
             conv.id.includes(runtimeConstructId) ||
             (conv as any).importMetadata?.constructId === runtimeConstructId;
    })
  : allActive;

// Then sort the filtered list
const activeConversations = runtimeFiltered.sort((a, b) => {
  // ... sorting logic from above ...
});
```

---

### Task 5: Update Routing Logic

**Location**: `chatty/src/components/Layout.tsx`

**Action**: On runtime switch, navigate to runtime's canonical conversation. If it doesn't exist, create it.

**Modify `applyRuntimeSelection()` function** (around line 406-438):
```typescript
const applyRuntimeSelection = async (runtime: RuntimeDashboardOption, options?: { persist?: boolean; skipReload?: boolean }) => {
  console.log(`🔄 [Layout] Applying runtime selection:`, runtime.runtimeId);
  
  setSelectedRuntime(runtime);
  
  if (options?.persist !== false) {
    persistSelectedRuntime(runtime);
  }
  
  // Set AIService runtime mode
  const { AIService } = await import('../lib/aiService');
  const aiService = AIService.getInstance();
  aiService.setRuntime(runtime.runtimeId, runtime.mode || 'synth', runtime.imported || false);
  
  if (!options?.skipReload) {
    await reloadConversationsForRuntime(runtime);
  }
  
  // ✅ NEW: Find or navigate to runtime's canonical conversation
  const runtimeConstructId = getConstructIdFromRuntime(runtime);
  const canonicalThread = threads.find(t => 
    (t.canonicalForRuntime === runtime.runtimeId) ||
    (t.isCanonical && t.constructId === runtimeConstructId)
  );
  
  if (canonicalThread) {
    console.log(`📍 [Layout] Navigating to canonical conversation: ${canonicalThread.id}`);
    navigate(`/app/chat/${canonicalThread.id}`);
  } else {
    // ✅ NEW: If no canonical conversation exists, create it via backend
    console.log(`⚠️ [Layout] No canonical conversation found for runtime ${runtime.runtimeId}, creating...`);
    try {
      const response = await fetch(`/api/vvault/create-canonical?constructId=${runtimeConstructId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const { sessionId } = await response.json();
        navigate(`/app/chat/${sessionId}`);
        // Reload conversations to include the new canonical file
        await reloadConversationsForRuntime(runtime);
      } else {
        console.warn(`⚠️ [Layout] Failed to create canonical conversation, routing to home`);
        navigate('/app');
      }
    } catch (error) {
      console.error(`❌ [Layout] Error creating canonical conversation:`, error);
      navigate('/app');
    }
  }
};
```

**Create Backend Endpoint** (new file: `chatty/server/routes/vvault.js` - add to existing router):
```javascript
router.post('/create-canonical', async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;
  
  const { constructId } = req.query;
  if (!constructId) {
    return res.status(400).json({ ok: false, error: 'constructId is required' });
  }
  
  try {
    const { VVAULT_ROOT } = require('../../vvaultConnector/config');
    const { resolveVVAULTUserId } = require('../../vvaultConnector/writeTranscript');
    const fs = require('fs').promises;
    const path = require('path');
    
    const email = req.user?.email ?? '(no req.user.email)';
    const vvaultUserId = await resolveVVAULTUserId(userId, email);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
    }
    
    const primaryDir = path.join(
      VVAULT_ROOT,
      'users',
      'shard_0000',
      vvaultUserId,
      'instances',
      constructId,
      'chatty'
    );
    
    await fs.mkdir(primaryDir, { recursive: true });
    
    const primaryFilePath = path.join(primaryDir, `chat_with_${constructId}.md`);
    const sessionId = `${constructId}_chat_with_${constructId}`;
    const timestamp = new Date().toISOString();
    
    // Determine provider from constructId (e.g., "chatgpt-devon-001" → "ChatGPT")
    const provider = constructId.split('-')[0].charAt(0).toUpperCase() + constructId.split('-')[0].slice(1);
    
    const content = `# Chat with ${provider}

**Created**: ${timestamp}
**Session ID**: ${sessionId}
**Construct**: ${constructId}
**Runtime**: ${constructId}

<!-- IMPORT_METADATA
source: ${provider}
importedAt: ${timestamp}
constructId: ${constructId}
runtimeId: ${constructId}
isPrimary: true
-->

---

Welcome to your ${provider} runtime. This is your canonical conversation.

Your imported conversations are available in the sidebar.
`;

    await fs.writeFile(primaryFilePath, content, 'utf8');
    
    console.log(`✅ [VVAULT API] Created canonical conversation: ${primaryFilePath}`);
    
    res.json({ ok: true, sessionId, filePath: primaryFilePath });
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to create canonical conversation:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});
```

---

## 🔍 Clarifications (Already Answered)

### Metadata Parsing
- ✅ `parseHeader()` in `readConversations.js` already extracts `IMPORT_METADATA` blocks
- ✅ `importMetadata` is available as JSON object
- ⚠️ **Action Required**: Expose `isPrimary` field in returned conversation object

### Canonical File Creation
- ✅ `htmlMarkdownImporter.ts` has file writing logic using `fs.promises.mkdir` and `fs.promises.writeFile`
- ✅ Can reuse same pattern: `fs.mkdir(..., { recursive: true })` then `fs.writeFile()`
- ⚠️ **Action Required**: Create helper function in `importService.js` to write canonical file

### Construct/Runtime IDs
- ✅ In this scenario, `runtimeId` matches `constructId` (e.g., `chatgpt-devon-001` for both)
- ✅ Can assume they're identical for this implementation
- ✅ Store both in metadata for future extensibility

### Tone/Memory Embeddings
- ✅ ChromaDB or embedding stores are **not active** in this path
- ✅ Tone is derived from transcript content + runtime metadata
- ✅ Canonical chat file + existing `.md` history is the data source for tone continuity
- ✅ No separate vector DB involvement needed

---

## ✅ Acceptance Criteria

After implementation:

1. **On Import**: 
   - ✅ Primary conversation file created at `instances/{constructId}/chatty/chat_with_{constructId}.md`
   - ✅ File contains `isPrimary: true` in `IMPORT_METADATA`
   - ✅ File is readable by `readConversations.js`

2. **On Runtime Switch**:
   - ✅ Synth only appears pinned when Chatty runtime is active
   - ✅ Imported runtime's canonical conversation appears pinned when that runtime is active
   - ✅ User is automatically navigated to runtime's canonical conversation

3. **In Sidebar**:
   - ✅ Only conversations for active runtime are shown
   - ✅ Pinned conversation for active runtime appears at top
   - ✅ Pin icon only shows for active runtime's canonical conversation

4. **In Chat Window**:
   - ✅ Routing to `/app/chat/{constructId}_chat_with_{constructId}` displays correct conversation
   - ✅ Messages load from correct markdown file

---

## 🧪 Testing Checklist

- [ ] Import a ChatGPT ZIP archive
- [ ] Verify `chat_with_chatgpt-devon-001.md` is created in `instances/chatgpt-devon-001/chatty/`
- [ ] Verify file contains `isPrimary: true` in metadata
- [ ] Switch to ChatGPT runtime
- [ ] Verify Synth disappears from sidebar
- [ ] Verify ChatGPT's canonical conversation appears pinned at top
- [ ] Verify user is navigated to ChatGPT's canonical conversation
- [ ] Switch back to Chatty runtime
- [ ] Verify Synth appears pinned again
- [ ] Verify ChatGPT conversations are hidden
- [ ] Verify routing works correctly for both runtimes

---

## 📝 Files to Modify

### Backend Files
1. `chatty/server/services/importService.js` - Add `createPrimaryConversationFile()` function AND integrate construct orchestrator
2. `chatty/server/services/constructImportOrchestrator.ts` - **NEW**: Main orchestrator for detection → matching → persistence → drift prevention
3. `chatty/server/services/constructMatchingEngine.ts` - **NEW**: Matching logic (5 strategies)
4. `chatty/server/services/personalityFingerprintExtractor.ts` - **NEW**: Fingerprint extraction for matching
5. `chatty/server/services/linPersonalityExtractor.ts` - **NEW**: Full personality extraction for Lin
6. `chatty/server/services/constructNameDetector.ts` - **ENHANCE**: Multi-strategy detection with confidence scoring
7. `chatty/vvaultConnector/readConversations.js` - Extract `isPrimary` from metadata
8. `chatty/server/routes/vvault.js` - Add `/create-canonical` endpoint (if needed)

### Frontend Files
9. `chatty/src/lib/types.ts` - Add `canonicalForRuntime` and `constructId` to Thread interface
10. `chatty/src/components/Layout.tsx` - Update thread mapping and routing logic
11. `chatty/src/components/Sidebar.tsx` - Filter and sort by active runtime

---

## 🚀 Implementation Order

### Phase 1: Construct System (CRITICAL - Must Complete First)
1. **Create `constructMatchingEngine.ts`** - Matching logic with 5 strategies
2. **Create `personalityFingerprintExtractor.ts`** - Fingerprint extraction
3. **Create `linPersonalityExtractor.ts`** - Full personality extraction
4. **Enhance `constructNameDetector.ts`** - Multi-strategy detection with confidence
5. **Create `constructImportOrchestrator.ts`** - Main orchestrator
6. **Integrate orchestrator into `importService.js`** - Call before canonical file creation

### Phase 2: Canonical File Creation
7. **Add `createPrimaryConversationFile()` to `importService.js`** - Create canonical file AFTER construct processing
8. **Extract `isPrimary` from metadata in `readConversations.js`** - Expose field in conversation objects

### Phase 3: Frontend Integration
9. **Extend Thread type in `types.ts`** - Add `canonicalForRuntime` and `constructId`
10. **Update Layout.tsx** - Runtime-scoped canonical logic and routing
11. **Update Sidebar.tsx** - Filter and sort by active runtime
12. **Add `/create-canonical` endpoint** - Backend endpoint for on-demand creation

**⚠️ CRITICAL**: Phase 1 (Construct System) MUST complete before Phase 2. The canonical file creation uses the `constructId` from the orchestrator, which may be a matched construct or a newly created one.

---

## 🔗 Integration with Construct System

**⚠️ CRITICAL**: This implementation MUST integrate with the **Construct Detection → Matching → Persistence → Drift Prevention System**.

**Flow**:
1. Import ZIP → Parse conversations
2. **Construct Orchestrator** → Detect → Match → Persist → Prevent Drift
3. **Canonical File Creation** → Use constructId from orchestrator (may be matched or new)
4. **Frontend** → Filter by runtime, show pinned conversation

**Key Integration Points**:
- `constructImportOrchestrator.ts` processes constructs BEFORE canonical file creation
- Canonical file uses `constructId` from orchestrator (handles matched constructs)
- Personality data saved to `instances/{constructId}/lin/` by orchestrator
- Drift detector initialized with personality baseline by orchestrator

**See**: `CONSTRUCT_DETECTION_MATCHING_PERSISTENCE_SYSTEM.md` for complete system specification.

---

**Ready to implement? Start with Phase 1 (Construct System) and work through sequentially.**

