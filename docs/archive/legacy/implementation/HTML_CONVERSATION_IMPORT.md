# HTML Conversation Import Implementation

**Last Updated**: January 15, 2025

## Overview

HTML conversation import extracts individual conversations from `conversations.html` files (rendered HTML view of all conversations from ChatGPT exports) and stores them in VVAULT using the same structure and format as JSON imports, ensuring seamless frontend integration.

---

## Implementation Summary

### 1. Backend HTML Parser

**File**: `chatty/server/services/htmlMarkdownImporter.ts`

**Key Functions:**
- `processHtmlImport(html, context)` - Main entry point, extracts conversations from HTML
- Parses HTML using `cheerio`
- Extracts conversation titles, messages, timestamps
- Converts to markdown format
- Creates separate markdown files per conversation

**Features:**
- ✅ Multiple HTML structure detection strategies
- ✅ Robust message extraction with role detection (user vs assistant)
- ✅ HTML-to-markdown conversion
- ✅ Conversation ID extraction or generation
- ✅ Metadata extraction (timestamps, model info)
- ✅ Atomic file writes with verification

### 2. Integration with Import Flow

**File**: `chatty/server/services/importService.js`

**Changes:**
- ✅ JSON parsing remains primary (preferred)
- ✅ HTML parsing as fallback when JSON is missing or corrupted
- ✅ Automatic detection of `conversations.html` and `chat.html` files in ZIP archives
- ✅ Seamless integration with existing import pipeline
- ✅ No breaking changes to existing JSON import flow

**Flow:**
```
ZIP Archive
  ↓
Try JSON parsing first (conversations.json)
  ↓ (if fails or missing)
Try HTML parsing (conversations.html or chat.html)
  ↓
Process via htmlMarkdownImporter
  ↓
Store in VVAULT (same structure as JSON imports)
```

### 3. File Structure

**Storage Location:**
```
/vvault/users/{shard}/{user_id}/instances/{instanceId}/{year}/{month}/{title}.md
```

**Example:**
```
/vvault/users/shard_0000/devon_woodson_1762969514958/instances/chatgpt-dwoodson92/2024/11/Understanding Quantum Computing.md
```

**File Format:**
```markdown
# {Conversation Title}

<!-- IMPORT_METADATA
{
  "importedFrom": "chatgpt",
  "conversationId": "68ab924c-f154-8327-80f5-1107135a87dc",
  "conversationTitle": "Understanding Quantum Computing",
  "detectedModel": "gpt-4",
  "gptConfig": null,
  "isPlaceholder": false
}
-->

## {Date}

You said:
{user message}

Assistant said:
{assistant message}
```

### 4. Frontend Integration

**No Changes Required:**
- Frontend uses same `VVAULTConversationManager.loadAllConversations()` API
- Same filtering logic applies (`reloadConversationsForRuntime()`)
- Same display logic in sidebar
- HTML-extracted conversations appear identically to JSON imports

**Connection Points:**
- **Import**: `server/routes/import.js` → `persistImportToVVAULT()` → `htmlMarkdownImporter.ts` → VVAULT filesystem
- **Read**: `server/routes/vvault.js` → `readConversations()` → Parses markdown → Returns JSON
- **Frontend Load**: `Layout.tsx` → `VVAULTConversationManager.loadAllConversations()` → API call
- **Frontend Filter**: `Layout.tsx` → `reloadConversationsForRuntime()` → Filters by runtime/construct
- **Frontend Display**: Sidebar shows conversations filtered by active runtime

---

## Backend-Frontend Connection

### Import Flow

1. **User uploads ZIP** → `POST /api/import/chat-export`
2. **Import service detects HTML** → `conversations.html` or `chat.html`
3. **HTML parser extracts conversations** → `processHtmlImport()`
4. **Creates markdown files** → Stores in VVAULT with `IMPORT_METADATA`
5. **Returns import result** → `{ created: number, files: string[], errors: [] }`

### Reading Flow

1. **Frontend requests conversations** → `GET /api/vvault/conversations`
2. **Backend reads VVAULT** → `readConversations()` scans user directories
3. **Parses markdown files** → Extracts `IMPORT_METADATA` and messages
4. **Returns conversation objects** → Frontend receives array of conversations
5. **Frontend filters by runtime** → `reloadConversationsForRuntime()` matches constructId
6. **Displays in sidebar** → Conversations appear as threads

### Key Integration Points

**Backend (`importService.js`):**
```javascript
// HTML file detection
const htmlFiles = zip.file(/(^|\/)(conversations|chat)\.html$/i);
if (htmlFiles?.length) {
  const { processHtmlImport } = await import('./htmlMarkdownImporter.js');
  const htmlContent = await htmlFiles[0].async("string");
  const result = await processHtmlImport(htmlContent, {
    userId: vvaultUserId,
    email: identity?.email,
    provider: source || 'chatgpt',
    vvaultRoot: VVAULT_ROOT,
    shardId: 'shard_0000'
  });
}
```

**Frontend (`Layout.tsx`):**
```typescript
// Same loading logic for all conversations
const conversations = await conversationManager.loadAllConversations(userId);
// Filters by runtime/construct
const filtered = conversations.filter(conv => matchesRuntime(conv, selectedRuntime));
```

---

## Troubleshooting

### Issue: Conversations Not Appearing After Import

**Check:**
1. **File Location**: Verify files were created in VVAULT
   ```bash
   find /vvault/users -name "*.md" -newer /path/to/import/timestamp
   ```

2. **Import Metadata**: Verify `IMPORT_METADATA` is present
   ```bash
   grep -l "IMPORT_METADATA" /vvault/users/**/*.md
   ```

3. **Construct ID**: Verify `constructId` matches runtime
   - Check `IMPORT_METADATA` in markdown file
   - Verify frontend filtering logic matches constructId

4. **User ID Resolution**: Verify user ID mapping
   - Check `profile.json` exists with correct email
   - Verify email matches between Chatty and VVAULT

### Issue: Messages Not Parsing Correctly

**Check:**
1. **HTML Structure**: Verify HTML parser handles your export format
2. **Message Roles**: Check if "You said" / "Assistant said" patterns are detected
3. **Timestamps**: Verify timestamp parsing works for your format

**Fix:**
- Update `htmlMarkdownImporter.ts` parsing logic if needed
- Add new HTML structure detection strategies

---

## File Format Details

### Markdown Transcript Format

```markdown
# Conversation Title

<!-- IMPORT_METADATA
{
  "importedFrom": "chatgpt",
  "conversationId": "unique-id",
  "conversationTitle": "Conversation Title",
  "detectedModel": "gpt-4",
  "gptConfig": null,
  "isPlaceholder": false
}
-->

## November 9, 2024

You said:
Hello!

Assistant said:
Hi! How can I help you today?
```

### IMPORT_METADATA Fields

- `importedFrom`: Source provider ("chatgpt", "gemini", etc.)
- `conversationId`: Original conversation ID or generated UUID
- `conversationTitle`: Extracted conversation title
- `detectedModel`: Detected model ("gpt-4", "gpt-3.5-turbo", "unknown")
- `gptConfig`: Custom GPT configuration if applicable (null for standard conversations)
- `isPlaceholder`: Whether this is a placeholder conversation

---

## Implementation Status

### ✅ Completed
- HTML parser implementation (`htmlMarkdownImporter.ts`)
- Integration with import service
- Markdown file creation with metadata
- Atomic file writes with verification
- Error handling and logging

### ⚠️ Known Limitations
- HTML structure detection may need updates for different export formats
- Timestamp parsing may vary by export format
- Large HTML files may take time to process

---

## Related Documentation

- `VVAULT_TROUBLESHOOTING_GUIDE.md` - Connection troubleshooting
- `VVAULT_IMPORT_FILE_STRUCTURE.md` - File structure details
- `CONVERSATIONS_HTML_RECONSTRUCTION_PROMPT.md` - LLM prompt for reconstruction (reference)

