# Current File Connections Summary

## Overview
This document summarizes how files are currently connected in Chatty's import and storage system, specifically focusing on the relationship between `conversations.json`, `conversations.html`, and the VVAULT file structure.

## Import Flow: conversations.json → VVAULT

### 1. Import Trigger
**Location**: `chatty/server/routes/import.js`
- User uploads ZIP archive via `/api/import/chat-export`
- ZIP contains `conversations.json` (and optionally `conversations.html`)

### 2. Archive Parsing
**Location**: `chatty/server/services/importService.js`
- `extractExportMetadata()`: Scans ZIP for known files
- Detects `conversations.json` via regex: `/(^|\/)conversations\.json$/i`
- Detects `conversations.html` via regex: `/(^|\/)chat\.html$/i` (currently only detected, not parsed)

### 3. Runtime Creation
**Location**: `chatty/server/services/importService.js`
- `createImportedRuntime()`: Creates GPT entry in database
- Stores `import-metadata.json` file with runtime info
- Returns runtime configuration

### 4. Conversation Persistence
**Location**: `chatty/server/services/importService.js` → `persistImportToVVAULT()`

**Flow:**
```
ZIP Buffer
  ↓
JSZip.loadAsync()
  ↓
Extract conversations.json → Parse JSON → Array of conversation objects
  ↓
For each conversation:
  ├─→ extractChatGPTConfig() → Extract GPT model/config
  ├─→ convertConversationToTranscript() → Generate callsign from conversation ID hash
  └─→ appendToConstructTranscript() → Write to VVAULT
```

**Key Function**: `convertConversationToTranscript()`
- Input: Conversation object from JSON
- Generates unique callsign: `crypto.createHash('md5').update(conversationId).digest('hex').substring(0, 8)`
- Determines construct ID from GPT config
- Creates markdown content with messages

### 5. VVAULT Storage
**Location**: `chatty/vvaultConnector/writeTranscript.js` → `appendToConstructTranscript()`

**File Path Structure:**
```
/vvault/users/{shard}/{user_id}/constructs/{construct}-{callsign}/chatty/chat_with_{construct}-{callsign}.md
```

**Example:**
```
/vvault/users/shard_0000/devon_woodson_1762969514958/constructs/synth-001/chatty/chat_with_synth-001.md
```

**File Format:**
```markdown
# {Conversation Title}

-=-=-=-

<!-- IMPORT_METADATA
{
  "importedFrom": "chatgpt",
  "conversationId": "68ab924c-f154-8327-80f5-1107135a87dc",
  "conversationTitle": "Understanding Quantum Computing",
  "detectedModel": "gpt-4",
  "gptConfig": { ... }
}
-->

## {Date}

**{Time} - You said:** {user message}

**{Time} - {Model} said:** {assistant message}
```

### 6. Conversation Reading
**Location**: `chatty/vvaultConnector/readConversations.js` → `readConstructTranscripts()`

**Flow:**
```
Request conversations for user
  ↓
Scan /vvault/users/{shard}/{user_id}/constructs/
  ↓
For each construct folder:
  ├─→ Read /chatty/ directory
  ├─→ Find all .md files matching pattern
  ├─→ parseConstructFile() → Extract IMPORT_METADATA
  └─→ Return conversation records with sessionId, title, messages
```

**Key Function**: `parseConstructFile()`
- Reads markdown file
- Extracts `IMPORT_METADATA` from HTML comment
- Parses messages from markdown format
- Returns: `{ sessionId, title, messages, importMetadata }`

### 7. Frontend Integration
**Location**: `chatty/src/lib/vvaultConversationManager.ts`

**Flow:**
```
Frontend requests conversations
  ↓
API: GET /api/vvault/conversations
  ↓
Backend: readConversations.js → Returns conversation array
  ↓
Frontend: Maps to Thread format → Displays in sidebar
```

## Current Status: conversations.html

### Detection Only
- `conversations.html` is **detected** in ZIP archive (listed in `KNOWN_EXPORT_PATHS`)
- **NOT parsed** or processed currently
- Description: "🖼️ A rendered HTML view of selected conversations."

### Why Not Parsed?
- Current import flow relies on structured JSON (`conversations.json`)
- HTML parsing requires different extraction logic
- No current need identified (JSON provides all necessary data)

### Potential Use Cases
1. **Fallback**: If `conversations.json` is missing or corrupted
2. **Verification**: Cross-reference HTML with JSON to ensure completeness
3. **Rich Content**: HTML may contain formatting/layout info not in JSON
4. **User Preference**: Some users may prefer HTML export format

## File Connection Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    ZIP Archive Upload                        │
│  ┌──────────────────┐         ┌──────────────────┐        │
│  │ conversations.json│         │conversations.html │        │
│  │   (PARSED)       │         │  (DETECTED ONLY)  │        │
│  └────────┬──────────┘         └──────────────────┘        │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│         importService.js: persistImportToVVAULT()           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ For each conversation in JSON:                      │   │
│  │  1. extractChatGPTConfig() → Get model/config       │   │
│  │  2. convertConversationToTranscript() → Generate    │   │
│  │     callsign from conversationId hash               │   │
│  │  3. appendToConstructTranscript() → Write markdown  │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│  writeTranscript.js: appendToConstructTranscript()         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Creates file:                                         │   │
│  │ /vvault/users/{shard}/{user_id}/                    │   │
│  │   constructs/{construct}-{callsign}/                 │   │
│  │   chatty/chat_with_{construct}-{callsign}.md         │   │
│  │                                                       │   │
│  │ Includes:                                            │   │
│  │ - Conversation title                                 │   │
│  │ - IMPORT_METADATA (conversationId, title, model)    │   │
│  │ - Messages in markdown format                        │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│  readConversations.js: readConstructTranscripts()          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Scans VVAULT structure:                              │   │
│  │ - Finds all .md files in construct/chatty/ folders   │   │
│  │ - parseConstructFile() → Extracts IMPORT_METADATA    │   │
│  │ - Parses messages from markdown                      │   │
│  │ - Returns conversation records                       │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│         Frontend: VVAULTConversationManager                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ - loadAllConversations() → Fetches from API          │   │
│  │ - Maps to Thread format                              │   │
│  │ - Displays in sidebar                                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Data Flow Points

### 1. Conversation ID → Callsign
- **Source**: `conversation.id` from JSON
- **Transformation**: MD5 hash → First 8 characters → Padded to 3 digits (001, 002, etc.)
- **Result**: Unique callsign per conversation
- **Location**: `convertConversationToTranscript()` line ~1020

### 2. Construct ID Determination
- **Source**: GPT configuration extracted from conversation
- **Logic**: Detects custom GPT vs base model → Maps to construct ID
- **Default**: Falls back to 'synth-001' if unknown
- **Location**: `extractChatGPTConfig()` line ~893

### 3. Metadata Preservation
- **Storage**: HTML comment in markdown header
- **Format**: JSON object with conversationId, title, model, gptConfig
- **Reading**: Parsed via regex in `parseHeader()` function
- **Location**: `readConversations.js` line ~275

### 4. Message Format Conversion
- **Input**: JSON message objects with `role`, `content`, `timestamp`
- **Output**: Markdown format: `**{Time} - {Role} said:** {content}`
- **Location**: `convertConversationToTranscript()` → `appendToConstructTranscript()`

## Integration Points for HTML Parsing

If we were to add `conversations.html` parsing, it would need to integrate at:

1. **Detection**: Already done (line 52-54 in `importService.js`)
2. **Parsing**: New function needed (e.g., `parseHTMLConversations()`)
3. **Conversion**: Could reuse `convertConversationToTranscript()` or create parallel function
4. **Storage**: Same `appendToConstructTranscript()` function
5. **Reading**: Already compatible (reads markdown files regardless of source)

## Summary

**Current State:**
- ✅ `conversations.json` → Fully parsed and stored
- ⚠️ `conversations.html` → Detected but not parsed
- ✅ VVAULT structure → Well-defined and consistent
- ✅ Reading logic → Compatible with any markdown source

**For HTML Reconstruction:**
- Need HTML parsing logic to extract conversations
- Need conversation boundary detection
- Need metadata extraction from HTML
- Can reuse existing storage and reading infrastructure

