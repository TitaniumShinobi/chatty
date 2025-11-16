# Runtime File Architecture Recap

**Date**: November 15, 2025  
**Status**: Current Implementation

---

## Current File Structure (ACTUAL)

### Base Path
```
/vvault/users/shard_0000/{user_id}/instances/
```

**Note**: Using `instances/` (not `constructs/`) per user preference.

---

## Runtime Instance Structure

### 1. Chatty-Generated Conversations (Synth, User-Created GPTs, etc.)

**Path**: `instances/{construct}-{callsign}/chatty/`

**Examples**:
```
instances/synth-001/chatty/chat_with_synth-001.md
instances/katana-001/chatty/chat_with_katana-001.md
```

**Structure**:
- Single markdown file per construct
- Contains all conversation history
- Format: Standard markdown with timestamps
- **Construct ID Format**: `{name}-001` (e.g., "katana" → "katana-001")
- **File Naming**: `chat_with_{constructId}.md` (e.g., `chat_with_katana-001.md`)

**For User-Created GPTs**:
- GPT name is sanitized (lowercase, special chars → hyphens)
- Example: GPT named "Katana" → `instances/katana-001/chatty/chat_with_katana-001.md`
- Created automatically when GPT is created via GPT Creator
- Same structure as Synth, just with GPT name instead of "synth"

---

### 2. Imported Conversations (from HTML/JSON)

**Path**: `instances/{instanceId}/{year}/{month}/{title}.md`

**Example**:
```
instances/chatgpt-devon/2024/01/Research Plan.md
instances/chatgpt-devon/2024/02/Code Review.md
```

**Structure**:
- One markdown file per conversation
- Organized chronologically by year/month
- Instance ID format: `{provider}-{email_handle}` (e.g., `chatgpt-devon`)

---

## Instance ID Generation

### From Import
```typescript
// From htmlMarkdownImporter.ts
function buildInstanceId(provider: string, email: string): string {
  const emailHandle = email.split('@')[0];  // "devon" from "devon@thewreck.org"
  return `${provider}-${emailHandle}`;      // "chatgpt-devon"
}
```

### From Runtime Metadata
```javascript
// From importService.js
const constructId = `${provider}-${emailHandle}-001`;  // "chatgpt-devon-001"
```

**⚠️ INCONSISTENCY**: 
- `htmlMarkdownImporter.ts` uses: `chatgpt-devon` (no `-001`)
- `importService.js` uses: `chatgpt-devon-001` (with `-001`)

---

## File Reading Flow

### `readConversations.js` Scanning Logic

1. **Scans**: `instances/{instanceName}/`
2. **Recursively searches**:
   - `instances/{instanceName}/chatty/` (legacy flat structure)
   - `instances/{instanceName}/ChatGPT/` (legacy)
   - `instances/{instanceName}/{year}/{month}/` (new chronological structure)
3. **Finds**: All `.md` files recursively
4. **Extracts**: `constructId` from instance folder name

---

## Current Issues

### Issue 1: Instance ID Mismatch
- **htmlMarkdownImporter** writes to: `instances/chatgpt-devon/2024/01/`
- **Runtime expects**: `instances/chatgpt-devon-001/` (with `-001`)
- **Result**: Files written but not found by runtime

### Issue 2: File Location Mismatch
- **htmlMarkdownImporter** writes to: `instances/{instanceId}/{year}/{month}/`
- **readConversations** scans: `instances/{instanceName}/` recursively
- **Should work**, but instanceId must match

### Issue 3: User ID Resolution
- **Input**: Chatty user ID (MongoDB ObjectId) or email
- **Resolved**: VVAULT user ID (LIFE format: `devon_woodson_1762969514958`)
- **Path**: `users/shard_0000/devon_woodson_1762969514958/instances/...`

---

## Expected File Locations

### For Import: `devon@thewreck.org` → ChatGPT

**Expected Path**:
```
/vvault/users/shard_0000/devon_woodson_1762969514958/instances/chatgpt-devon/2024/01/Conversation Title.md
```

**OR** (if using `-001` suffix):
```
/vvault/users/shard_0000/devon_woodson_1762969514958/instances/chatgpt-devon-001/2024/01/Conversation Title.md
```

---

## What `htmlMarkdownImporter.ts` Does

1. **Parses HTML**: Extracts conversations from `conversations.html`
2. **Builds instanceId**: `{provider}-{email_handle}` (e.g., `chatgpt-devon`)
3. **Writes files to**: `instances/{instanceId}/{year}/{month}/{title}.md`
4. **Returns**: `{ created: number, files: string[], errors: [] }`

---

## What `readConversations.js` Does

1. **Scans**: `instances/{instanceName}/` recursively
2. **Finds**: All `.md` files in subdirectories
3. **Parses**: Each markdown file
4. **Extracts**: `constructId` from instance folder name
5. **Returns**: Array of conversation objects

---

## The Problem

**Files aren't being created** because:

1. **Instance ID mismatch**: 
   - Importer writes to `chatgpt-devon/`
   - Runtime might expect `chatgpt-devon-001/`

2. **User ID resolution failure**:
   - `resolveVVAULTUserId()` might fail
   - Files written to wrong user directory

3. **HTML parsing failure**:
   - `parseHtmlConversations()` might find 0 conversations
   - No files created if no conversations found

4. **File writing failure**:
   - Permissions issue
   - Path doesn't exist
   - Silent error

---

## Solution: Fix Instance ID Consistency

### Option 1: Make htmlMarkdownImporter use `-001` suffix
```typescript
// In htmlMarkdownImporter.ts
const finalInstanceId = instanceId || `${buildInstanceId(provider, email)}-001`;
```

### Option 2: Make readConversations match both formats
```javascript
// Already done - recursive scanning finds both
```

### Option 3: Use runtimeMetadata.constructId from importService
```javascript
// Pass constructId from importService to htmlMarkdownImporter
const result = await processHtmlImport(htmlContent, {
  userId: vvaultUserId,
  email: identity?.email || userId,
  provider: source || 'chatgpt',
  instanceId: runtimeMetadata.constructId, // Use the constructId from runtime metadata
  vvaultRoot: VVAULT_ROOT,
  shardId: 'shard_0000'
});
```

---

## Recommended Fix

**Use Option 3**: Pass `runtimeMetadata.constructId` to `htmlMarkdownImporter` so it writes to the correct instance folder that matches the runtime.

**Current Code** (importService.js line 1320):
```javascript
const result = await processHtmlImport(htmlContent, {
  userId: vvaultUserId,
  email: identity?.email || userId,
  provider: source || 'chatgpt',
  // ❌ Missing: instanceId - defaults to chatgpt-devon (no -001)
  vvaultRoot: VVAULT_ROOT,
  shardId: 'shard_0000'
});
```

**Fixed Code**:
```javascript
const result = await processHtmlImport(htmlContent, {
  userId: vvaultUserId,
  email: identity?.email || userId,
  provider: source || 'chatgpt',
  instanceId: runtimeMetadata.constructId, // ✅ Use constructId from runtime metadata
  vvaultRoot: VVAULT_ROOT,
  shardId: 'shard_0000'
});
```

---

## Complete File Structure Example

```
/vvault/users/shard_0000/devon_woodson_1762969514958/
├── identity/
│   └── profile.json
├── instances/
│   ├── synth-001/
│   │   └── chatty/
│   │       └── chat_with_synth-001.md
│   ├── chatgpt-devon-001/          ← Imported runtime (with -001)
│   │   ├── 2024/
│   │   │   ├── 01/
│   │   │   │   ├── Research Plan.md
│   │   │   │   └── Code Review.md
│   │   │   └── 02/
│   │   │       └── Debugging Session.md
│   │   └── chatty/                 ← Legacy location (also scanned)
│   └── lin-001/
│       └── chatty/
│           └── chat_with_lin-001.md
```

---

## Key Points

1. **Base**: `instances/` (not `constructs/`)
2. **Structure**: `instances/{instanceId}/{year}/{month}/{title}.md` for imports
3. **Instance ID**: Should match runtime `constructId` (e.g., `chatgpt-devon-001`)
4. **Scanning**: `readConversations.js` recursively scans all subdirectories
5. **User ID**: Must be resolved to LIFE format (`devon_woodson_1762969514958`)

---

## Next Steps

1. ✅ **Fix**: Pass `runtimeMetadata.constructId` to `htmlMarkdownImporter`
2. ✅ **Verify**: Files are written to correct path
3. ✅ **Test**: `readConversations.js` finds the files
4. ✅ **Confirm**: Frontend displays conversations

