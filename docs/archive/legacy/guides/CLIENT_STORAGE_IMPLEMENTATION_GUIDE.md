# Client-Side Storage Implementation Guide for Chatty

## Goal
Set up persistent storage for imported runtime data that:
- ✅ Persists across browser resets
- ✅ Survives server restarts
- ✅ Never pollutes VVAULT (clean transcript storage)
- ✅ Maintains user isolation
- ✅ Is git-safe (not committed to repository)

## Current Problem
Imported conversations are being written to VVAULT, which should only contain Chatty-generated transcripts.

## Solution Architecture

### Storage Separation
```
VVAULT/                    → Chatty-generated transcripts only (append-only)
user_data_imports/         → Imported conversations (separate storage)
gpt-uploads-imports/       → Imported runtime metadata & files
chatty.db                  → Runtime configurations (SQLite)
```

---

## Step-by-Step Implementation

### STEP 1: Create Import Storage Directory Structure

**File**: `chatty/server/lib/importStorage.js` (NEW FILE)

**Task**: Create a new module to manage imported data storage separately from VVAULT.

```javascript
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base path for imported data (outside repo, git-safe)
const IMPORT_BASE_PATH = process.env.IMPORT_STORAGE_PATH || 
  path.resolve(__dirname, '../../../user_data_imports');

/**
 * Get storage path for a user's imported runtime data
 * @param {string} userId - User ID (from req.user.sub)
 * @param {string} runtimeId - Runtime ID (GPT ID)
 * @returns {string} Full path to user's import directory
 */
export function getImportPathForUser(userId, runtimeId) {
  return path.join(IMPORT_BASE_PATH, userId, runtimeId);
}

/**
 * Ensure import directory exists
 * @param {string} userId - User ID
 * @param {string} runtimeId - Runtime ID
 */
export async function ensureImportDirectory(userId, runtimeId) {
  const dirPath = getImportPathForUser(userId, runtimeId);
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Get path for a specific imported conversation file
 * @param {string} userId - User ID
 * @param {string} runtimeId - Runtime ID
 * @param {string} callsign - Conversation callsign (from hash)
 * @returns {string} Full file path
 */
export function getImportedConversationPath(userId, runtimeId, callsign) {
  const dir = getImportPathForUser(userId, runtimeId);
  return path.join(dir, `imported_chat_${callsign}.md`);
}
```

**Update `.gitignore`**:
```gitignore
# User data - never commit
/user_data_imports/
/gpt-uploads/
/gpt-uploads-imports/
/chatty.db
/vvault/
```

---

### STEP 2: Create Import Storage Writer

**File**: `chatty/server/services/importStorageService.js` (NEW FILE)

**Task**: Create service to write imported conversations to separate storage (NOT VVAULT).

```javascript
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { 
  getImportedConversationPath, 
  ensureImportDirectory 
} from '../lib/importStorage.js';

/**
 * Convert conversation to markdown format (same as VVAULT format)
 * Reuses existing conversion logic but writes to import storage
 */
function convertConversationToMarkdown(conversation, gptConfig) {
  // Reuse the same markdown conversion logic from importService.js
  // but adapt it for import storage
  
  const conversationId = conversation.id || conversation.conversation_id || crypto.randomUUID();
  const hash = crypto.createHash('md5').update(conversationId).digest('hex');
  const hashInt = parseInt(hash.substring(0, 6), 16);
  const callsign = (hashInt % 999) + 1;
  
  // Extract messages (same logic as convertConversationToTranscript)
  const messages = [];
  // ... (reuse message extraction logic from importService.js)
  
  // Build markdown content
  const title = conversation.title || 'Imported Conversation';
  const importMetadata = {
    importedFrom: 'chatgpt', // or detect from source
    conversationId: conversationId,
    conversationTitle: title,
    detectedModel: gptConfig?.modelId || 'unknown',
    gptConfig: gptConfig?.hasFullConfig ? {
      name: gptConfig.name,
      description: gptConfig.description,
      instructions: gptConfig.instructions
    } : null,
    importedAt: new Date().toISOString()
  };
  
  let markdown = `# ${title}\n\n-=-=-=-\n\n`;
  markdown += `<!-- IMPORT_METADATA\n${JSON.stringify(importMetadata, null, 2)}\n-->\n\n`;
  
  // Add messages in markdown format
  messages.forEach(msg => {
    const date = new Date(msg.timestamp * 1000);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    const role = msg.role === 'user' ? 'You' : (gptConfig?.modelId || 'Assistant');
    
    markdown += `## ${dateStr}\n\n`;
    markdown += `**${timeStr} - ${role} said:** ${msg.content}\n\n`;
  });
  
  return { markdown, callsign };
}

/**
 * Persist imported conversations to separate storage (NOT VVAULT)
 * @param {Array} conversations - Array of conversation objects from import
 * @param {string} userId - User ID
 * @param {string} runtimeId - Runtime ID (GPT ID)
 * @param {string} source - Source provider ('chatgpt', 'gemini', etc.)
 * @param {object} gptConfig - GPT configuration (optional)
 */
export async function persistImportToImportStore(conversations, userId, runtimeId, source, gptConfig = {}) {
  if (!conversations || conversations.length === 0) {
    console.log(`📦 [ImportStorage] No conversations to persist for runtime ${runtimeId}`);
    return;
  }
  
  // Ensure directory exists
  await ensureImportDirectory(userId, runtimeId);
  
  let processedCount = 0;
  let errorCount = 0;
  
  for (const convo of conversations) {
    try {
      const { markdown, callsign } = convertConversationToMarkdown(convo, gptConfig);
      const filePath = getImportedConversationPath(userId, runtimeId, callsign);
      
      // Write to import storage (NOT VVAULT)
      await fs.writeFile(filePath, markdown, 'utf-8');
      processedCount++;
      
      if (processedCount % 10 === 0) {
        console.log(`📝 [ImportStorage] Processed ${processedCount}/${conversations.length} conversations...`);
      }
    } catch (error) {
      console.error(`❌ [ImportStorage] Failed to persist conversation ${convo.id}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`✅ [ImportStorage] Persisted ${processedCount} conversations to import storage (${errorCount} errors)`);
  return { processedCount, errorCount };
}
```

---

### STEP 3: Refactor Import Service to Use New Storage

**File**: `chatty/server/services/importService.js`

**Task**: Update `persistImportToVVAULT()` to NOT write imported conversations, and add new function to use import storage.

**Changes needed**:

1. **Remove or comment out** the call to `persistImportToVVAULT()` for imported conversations in the import route.

2. **Add new import** at top of file:
```javascript
import { persistImportToImportStore } from './importStorageService.js';
```

3. **Update the import route** (`chatty/server/routes/import.js`):

**BEFORE** (current problematic code):
```javascript
await persistImportToVVAULT(
  req.file.buffer,
  userId,
  result.source,
  constructId
);
```

**AFTER** (new code):
```javascript
// Store imported conversations in separate storage (NOT VVAULT)
try {
  console.log(`💾 [Import] Persisting imported conversations to import storage for user: ${userId}`);
  
  // Extract conversations from ZIP (reuse existing logic)
  const zip = await JSZip.loadAsync(req.file.buffer);
  const conversations = await extractConversationsFromZip(zip, result.source);
  
  // Write to import storage (separate from VVAULT)
  await persistImportToImportStore(
    conversations,
    userId,
    runtimeResult.runtime.id, // Use the created runtime ID
    result.source,
    {} // GPT config (can be extracted if needed)
  );
  
  console.log(`✅ [Import] Import storage persistence completed`);
} catch (e) {
  console.error(`❌ [Import] Import storage persistence failed:`, e);
  // Don't fail the import if storage fails - runtime config is already created
}
```

**IMPORTANT**: Keep `persistImportToVVAULT()` function for Chatty-generated conversations, but ensure it's NEVER called with imported data.

---

### STEP 4: Create Import Storage Reader

**File**: `chatty/server/services/importStorageService.js` (add to existing file)

**Task**: Add function to read imported conversations from import storage.

```javascript
import { getImportPathForUser } from '../lib/importStorage.js';

/**
 * Read imported conversations for a user's runtime
 * @param {string} userId - User ID
 * @param {string} runtimeId - Runtime ID
 * @returns {Array} Array of conversation objects
 */
export async function readImportedConversations(userId, runtimeId) {
  try {
    const importDir = getImportPathForUser(userId, runtimeId);
    
    // Check if directory exists
    try {
      await fs.access(importDir);
    } catch {
      // Directory doesn't exist, return empty array
      return [];
    }
    
    // Read all markdown files in directory
    const files = await fs.readdir(importDir);
    const conversations = [];
    
    for (const file of files) {
      if (file.endsWith('.md') && file.startsWith('imported_chat_')) {
        try {
          const filePath = path.join(importDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          
          // Parse markdown file (reuse existing parser from readConversations.js)
          const parsed = parseImportedConversationFile(content, file);
          if (parsed) {
            conversations.push(parsed);
          }
        } catch (error) {
          console.warn(`⚠️ [ImportStorage] Failed to read ${file}:`, error.message);
        }
      }
    }
    
    // Sort by imported date (newest first)
    conversations.sort((a, b) => {
      const dateA = new Date(a.importMetadata?.importedAt || 0);
      const dateB = new Date(b.importMetadata?.importedAt || 0);
      return dateB - dateA;
    });
    
    return conversations;
  } catch (error) {
    console.error(`❌ [ImportStorage] Failed to read imported conversations:`, error);
    return [];
  }
}

/**
 * Parse imported conversation markdown file
 * Reuses logic from readConversations.js but adapted for import storage
 */
function parseImportedConversationFile(content, filename) {
  try {
    // Extract IMPORT_METADATA from HTML comment
    const metadataMatch = content.match(/<!-- IMPORT_METADATA\n([\s\S]*?)\n-->/);
    let importMetadata = null;
    
    if (metadataMatch) {
      try {
        importMetadata = JSON.parse(metadataMatch[1]);
      } catch (e) {
        console.warn(`⚠️ Failed to parse import metadata:`, e);
      }
    }
    
    // Extract title
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1] : filename.replace('.md', '');
    
    // Extract messages (same format as VVAULT)
    const messages = [];
    const messageRegex = /\*\*([^*]+) - ([^*]+) said:\*\* (.+?)(?=\n##|\n\*\*|$)/gs;
    let match;
    
    while ((match = messageRegex.exec(content)) !== null) {
      const [, time, role, content] = match;
      messages.push({
        role: role.toLowerCase().includes('you') ? 'user' : 'assistant',
        content: content.trim(),
        timestamp: new Date(time).toISOString()
      });
    }
    
    // Extract callsign from filename
    const callsignMatch = filename.match(/imported_chat_(\d+)\.md/);
    const callsign = callsignMatch ? callsignMatch[1] : null;
    
    return {
      sessionId: `imported-${callsign || 'unknown'}`,
      title,
      messages,
      importMetadata,
      source: 'imported',
      filePath: filename
    };
  } catch (error) {
    console.error(`❌ Failed to parse imported conversation file:`, error);
    return null;
  }
}
```

---

### STEP 5: Add API Endpoint for Imported Conversations

**File**: `chatty/server/routes/import.js` (add new route)

**Task**: Add endpoint to retrieve imported conversations.

```javascript
import { readImportedConversations } from '../services/importStorageService.js';

/**
 * GET /api/import/runtime/:runtimeId/conversations
 * Get all imported conversations for a specific runtime
 */
router.get('/runtime/:runtimeId/conversations', async (req, res) => {
  try {
    const userId = req.user.sub;
    const { runtimeId } = req.params;
    
    if (!userId || !runtimeId) {
      return res.status(400).json({ 
        ok: false, 
        error: 'User ID and runtime ID are required' 
      });
    }
    
    console.log(`📥 [Import API] Fetching imported conversations for runtime ${runtimeId}, user ${userId}`);
    
    const conversations = await readImportedConversations(userId, runtimeId);
    
    res.json({
      ok: true,
      runtimeId,
      conversations,
      count: conversations.length
    });
  } catch (error) {
    console.error(`❌ [Import API] Failed to fetch imported conversations:`, error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch imported conversations'
    });
  }
});
```

**File**: `chatty/server/server.js`

**Task**: Ensure the import routes are registered.

```javascript
import importRoutes from './routes/import.js';

// ... existing code ...

app.use('/api/import', importRoutes);
```

---

### STEP 6: Update Frontend to Load Imported Conversations

**File**: `chatty/src/lib/importConversationManager.ts` (NEW FILE)

**Task**: Create frontend manager for imported conversations (separate from VVAULT).

```typescript
export interface ImportedConversation {
  sessionId: string;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  importMetadata?: {
    importedFrom: string;
    conversationId: string;
    conversationTitle: string;
    detectedModel: string;
    importedAt: string;
  };
  source: 'imported';
  filePath: string;
}

export class ImportConversationManager {
  private static instance: ImportConversationManager;

  static getInstance(): ImportConversationManager {
    if (!ImportConversationManager.instance) {
      ImportConversationManager.instance = new ImportConversationManager();
    }
    return ImportConversationManager.instance;
  }

  /**
   * Load all imported conversations for a runtime
   */
  async loadImportedConversations(runtimeId: string): Promise<ImportedConversation[]> {
    try {
      const response = await fetch(`/api/import/runtime/${runtimeId}/conversations`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to load imported conversations: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.ok && data.conversations) {
        return data.conversations;
      }

      return [];
    } catch (error) {
      console.error('❌ Failed to load imported conversations:', error);
      return [];
    }
  }

  /**
   * Convert imported conversation to Thread format (for UI compatibility)
   */
  convertToThread(conversation: ImportedConversation): import('../lib/vvaultConversationManager').ConversationThread {
    return {
      sessionId: conversation.sessionId,
      title: conversation.title,
      messages: conversation.messages.map((msg, idx) => ({
        id: `${conversation.sessionId}-${idx}`,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })),
      createdAt: conversation.importMetadata?.importedAt || new Date().toISOString(),
      updatedAt: conversation.importMetadata?.importedAt || new Date().toISOString()
    };
  }
}
```

---

### STEP 7: Update Layout.tsx to Load Imported Conversations

**File**: `chatty/src/components/Layout.tsx`

**Task**: Update `reloadConversationsForRuntime` to also load imported conversations when an imported runtime is selected.

**Add import**:
```typescript
import { ImportConversationManager } from '../lib/importConversationManager';
```

**Update `reloadConversationsForRuntime` function**:
```typescript
const reloadConversationsForRuntime = useCallback(async (runtime: RuntimeDashboardOption | null) => {
  if (!user || !runtime) return;
  
  try {
    console.log('🔄 [Layout] Reloading conversations for runtime:', runtime.runtimeId);
    
    const conversationManager = VVAULTConversationManager.getInstance();
    const importManager = ImportConversationManager.getInstance();
    const userId = getUserId(user);
    const vvaultUserId = (user as any).email || userId;
    
    // Check if this is an imported runtime
    const isImported = runtime.metadata?.isImported || false;
    
    if (isImported) {
      // Load imported conversations from import storage (NOT VVAULT)
      console.log('📦 [Layout] Loading imported conversations for runtime:', runtime.runtimeId);
      const importedConversations = await importManager.loadImportedConversations(runtime.runtimeId);
      
      // Convert to Thread format
      const importedThreads: Thread[] = importedConversations.map(conv => {
        const thread = importManager.convertToThread(conv);
        return {
          id: thread.sessionId,
          title: thread.title,
          messages: thread.messages.map(msg => mapChatMessageToThreadMessage(msg)).filter(Boolean) as Message[],
          createdAt: thread.createdAt ? new Date(thread.createdAt).getTime() : Date.now(),
          updatedAt: thread.updatedAt ? new Date(thread.updatedAt).getTime() : Date.now()
        };
      });
      
      setThreads(importedThreads);
      console.log(`✅ [Layout] Loaded ${importedThreads.length} imported conversations`);
    } else {
      // Load Chatty-generated conversations from VVAULT (existing logic)
      const constructId = getConstructIdFromRuntime(runtime);
      const allConversations = await conversationManager.loadAllConversations(vvaultUserId);
      
      // Filter by constructId (existing logic)
      const runtimeConversations = allConversations.filter(conv => {
        // ... existing filter logic ...
      });
      
      // Convert to Thread format (existing logic)
      const threads: Thread[] = runtimeConversations.map(conv => {
        // ... existing conversion logic ...
      });
      
      setThreads(threads);
      console.log(`✅ [Layout] Loaded ${threads.length} VVAULT conversations`);
    }
  } catch (error) {
    console.error('❌ [Layout] Failed to reload conversations:', error);
  }
}, [user]);
```

---

### STEP 8: Optional - Add "Import to VVAULT" Feature

**File**: `chatty/server/routes/import.js` (add new route)

**Task**: Allow users to manually migrate imported conversations to VVAULT if desired.

```javascript
import { appendToConstructTranscript } from '../../vvaultConnector/writeTranscript.js';
import { readImportedConversations } from '../services/importStorageService.js';

/**
 * POST /api/import/runtime/:runtimeId/migrate-to-vvault
 * Migrate imported conversation to VVAULT (user-initiated)
 */
router.post('/runtime/:runtimeId/migrate-to-vvault', async (req, res) => {
  try {
    const userId = req.user.sub;
    const { runtimeId } = req.params;
    const { conversationId, constructId } = req.body;
    
    if (!userId || !runtimeId || !conversationId) {
      return res.status(400).json({
        ok: false,
        error: 'User ID, runtime ID, and conversation ID are required'
      });
    }
    
    // Read imported conversation
    const importedConversations = await readImportedConversations(userId, runtimeId);
    const conversation = importedConversations.find(c => c.sessionId === conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        ok: false,
        error: 'Conversation not found in import storage'
      });
    }
    
    // Write to VVAULT (user-initiated migration)
    const targetConstructId = constructId || 'synth-001';
    const callsign = conversation.sessionId.replace('imported-', '');
    
    // Convert messages to VVAULT format
    for (const msg of conversation.messages) {
      await appendToConstructTranscript(
        targetConstructId,
        parseInt(callsign),
        msg.role,
        msg.content,
        {
          userId: userId,
          userName: req.user.name || req.user.email,
          timestamp: msg.timestamp,
          migratedFrom: 'imported',
          originalConversationId: conversation.importMetadata?.conversationId
        }
      );
    }
    
    console.log(`✅ [Import API] Migrated conversation ${conversationId} to VVAULT`);
    
    res.json({
      ok: true,
      message: 'Conversation migrated to VVAULT successfully',
      conversationId
    });
  } catch (error) {
    console.error(`❌ [Import API] Failed to migrate conversation:`, error);
    res.status(500).json({
      ok: false,
      error: 'Failed to migrate conversation to VVAULT'
    });
  }
});
```

---

## Summary Checklist

- [ ] **STEP 1**: Create `importStorage.js` with path utilities
- [ ] **STEP 2**: Create `importStorageService.js` with write/read functions
- [ ] **STEP 3**: Update `importService.js` to use new storage (remove VVAULT writes for imports)
- [ ] **STEP 4**: Add reader function to `importStorageService.js`
- [ ] **STEP 5**: Add API endpoint `/api/import/runtime/:runtimeId/conversations`
- [ ] **STEP 6**: Create `importConversationManager.ts` for frontend
- [ ] **STEP 7**: Update `Layout.tsx` to load imported conversations separately
- [ ] **STEP 8**: (Optional) Add migration endpoint for manual VVAULT import
- [ ] **Update `.gitignore`**: Add `/user_data_imports/` and related paths
- [ ] **Test**: Verify imported conversations don't appear in VVAULT
- [ ] **Test**: Verify imported conversations load correctly in UI

---

## Key Points for Your Coding LLM

1. **Never write imported data to VVAULT** - VVAULT is for Chatty-generated transcripts only
2. **Use separate directory** - `/user_data_imports/` for all imported conversations
3. **Maintain same format** - Use same markdown format as VVAULT for consistency
4. **User isolation** - Always scope by `userId` and `runtimeId`
5. **Git safety** - Ensure all user data directories are in `.gitignore`

---

## Testing Checklist

After implementation, verify:

1. ✅ Importing a runtime creates files in `/user_data_imports/{userId}/{runtimeId}/`
2. ✅ No files are created in VVAULT for imported conversations
3. ✅ Imported conversations appear in sidebar when runtime is selected
4. ✅ VVAULT still works for Chatty-generated conversations
5. ✅ Data persists after server restart
6. ✅ Data persists after browser reset (if using localStorage for metadata)
7. ✅ `.gitignore` prevents committing user data

---

Ready to share with your coding LLM! Each step is self-contained and can be implemented independently.

