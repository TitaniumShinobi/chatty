# GPT Creation and File Creation Pipeline for VVAULT Accounts

**Last Updated**: November 20, 2025

## Overview

This document describes the current pipeline for GPT creation and file creation for separate VVAULT user accounts. The system uses a sharded user registry structure where each user has isolated storage under their own directory.

## Terminology

- **construct-callsign**: The full construct identifier including callsign (e.g., `luna-001`, `synth-001`)
  - Format: `{construct-name}-{callsign}` (lowercase, hyphenated)
  - Example: If construct name is "Luna" → `luna-001`
  - Used in: Directory names (`/instances/luna-001/`), file names (`chat_with_luna-001.md`)
- **constructId**: Same as construct-callsign (used interchangeably in code)

---

## User Account Structure

### User Directory Layout

```
/vvault/
└── users/
    └── shard_0000/                    # Sequential sharding (currently all users in shard_0000)
        └── {user_id}/                 # VVAULT user ID (LIFE format: e.g., "devon_woodson_1762969514958")
            ├── identity/
            │   └── profile.json       # User profile with email, constructs list, etc.
            ├── instances/             # Runtime instances (NEW structure)
            │   └── {construct-callsign}/  # e.g., "synth-001", "luna-001", "lin-001"
            │       └── chatty/
            │           └── chat_with_{construct-callsign}.md  # e.g., "chat_with_luna-001.md"
            ├── constructs/            # Legacy structure (being migrated)
            └── capsules/              # User's capsule files
```

### User ID Resolution

1. **Frontend** sends: MongoDB ObjectId or email (e.g., `dwoodson92@gmail.com`)
2. **Backend** resolves via `resolveVVAULTUserId()`:
   - Searches all shards: `users/shard_*/`
   - Reads `identity/profile.json` for each user
   - Matches `profile.email === requestedEmail`
   - Returns VVAULT user ID (LIFE format)

---

## GPT Creation Pipeline

### 1. User Creates GPT in Frontend

**Location**: `chatty/src/components/GPTCreator.tsx`

**Process**:
- User fills out GPT configuration (name, description, instructions, etc.)
- User can upload files, set avatar, configure actions
- User clicks "Create" or "Save"

**Current State**: GPT creation UI exists but may not be fully connected to VVAULT file creation yet.

### 2. GPT Registration (When GPT is Created)

**Location**: `chatty/server/routes/vvault.js` (line 235-267)

**API Endpoint**: `POST /api/vvault/conversations`

**Process**:
```javascript
// Frontend calls:
POST /api/vvault/conversations
{
  sessionId: "gpt-name_session_123",
  title: "Chat with GPT Name",
  constructId: "gpt-name-001"  // Generated from GPT name
}

// Backend:
1. Validates user (req.user)
2. Resolves VVAULT user ID via resolveVVAULTUserId()
3. Calls connector.writeTranscript() with:
   - userId: VVAULT user ID
   - sessionId: Generated session ID
   - role: "system"
   - content: "CONVERSATION_CREATED:{title}"
   - constructId: From request body
```

**File Created**: 
- Path: `/vvault/users/shard_0000/{user_id}/instances/{construct-callsign}/chatty/chat_with_{construct-callsign}.md`
  - Example: `/vvault/users/shard_0000/{user_id}/instances/luna-001/chatty/chat_with_luna-001.md`
- Content: System message marking conversation creation

---

## File Creation Pipeline

### 1. Canonical Conversation File Creation

**Location**: `chatty/server/services/importService.js` (line 211-285)

**Function**: `createPrimaryConversationFile()`

**API Endpoint**: `POST /api/vvault/create-canonical`

**Process**:
```javascript
// Called when:
// - Importing ChatGPT conversations
// - Creating new runtime/construct
// - On-demand canonical file creation

createPrimaryConversationFile(
  constructId,      // construct-callsign, e.g., "luna-001", "synth-001"
  userId,           // VVAULT user ID (LIFE format)
  email,            // User email
  provider,         // "chatgpt", "chatty", etc.
  vvaultRoot,       // Path to /vvault
  shardId,          // "shard_0000"
  runtimeId         // Optional, defaults to constructId
)
```

**File Structure Created**:
```
/vvault/users/shard_0000/{user_id}/instances/{construct-callsign}/chatty/chat_with_{construct-callsign}.md
```

**Example for "Luna" construct**:
```
/vvault/users/shard_0000/{user_id}/instances/luna-001/chatty/chat_with_luna-001.md
```

**File Content** (Example for "Luna" construct):
```markdown
<!-- IMPORT_METADATA
{
  "isPrimary": true,
  "constructId": "luna-001",  // construct-callsign
  "runtimeId": "luna",
  "source": "chatgpt",
  "importedAt": "2025-11-20T...",
  "conversationId": "luna-001_chat_with_luna-001",
  "conversationTitle": "Chat with Luna",
  "createdBy": "dwoodson92@gmail.com"
}
-->

# Chat with Luna

**Created**: 2025-11-20T...
**Session ID**: luna-001_chat_with_luna-001
**Construct**: luna-001
**Runtime**: luna

---

Welcome to your Luna runtime. This is your canonical conversation.
```

### 2. Message Appending to Files

**Location**: `chatty/vvaultConnector/writeTranscript 3.js`

**Function**: `appendToConstructTranscript()`

**Process**:
```javascript
// Called when user sends message or AI responds
appendToConstructTranscript(
  constructId,    // Base construct name, e.g., "luna" (without callsign)
  callsign,        // Callsign number, e.g., 1 (becomes "001")
  role,            // "user" or "assistant"
  content,         // Message content
  metadata         // { userId, sessionId, responseTimeMs, etc. }
)

// Internally combines to construct-callsign: "luna-001"
```

**File Path Resolution**:
1. Extracts `userId` from metadata (must be VVAULT LIFE format)
2. Resolves VVAULT user ID if needed (MongoDB ObjectId → LIFE format)
3. Uses shard: `shard_0000` (sequential, not hash-based)
4. Combines constructId + callsign → construct-callsign (e.g., `luna` + `001` → `luna-001`)
5. Constructs path: `users/{shard}/{user_id}/instances/{construct-callsign}/chatty/chat_with_{construct-callsign}.md`
   - Example: `users/shard_0000/{user_id}/instances/luna-001/chatty/chat_with_luna-001.md`
6. Appends message to file (append-only, never overwrites)

**Message Format in File**:
```markdown
## November 20, 2025

**10:30:45 AM EST - Devon**: Hello, how are you?

**10:30:47 AM EST - Synth**: I'm doing well, thank you!
*Generated in 1.2s*

```

### 3. User ID Resolution Flow

**Location**: `chatty/vvaultConnector/writeTranscript 3.js` (line 104-114)

**Process**:
```javascript
// If userId is MongoDB ObjectId or email:
1. Check if userId is already LIFE format (contains underscore + numbers)
2. If not, call resolveVVAULTUserId(userId, email)
3. resolveVVAULTUserId():
   - Searches: users/shard_*/{userId}/identity/profile.json
   - OR searches by email: profile.email === email
   - Returns VVAULT user ID (LIFE format)
4. Use resolved user ID for file path
```

---

## Multi-User Account Flow

### Account Isolation

1. **Each user has separate directory**: `users/shard_0000/{user_id}/`
2. **User ID resolution**: Frontend sends email/ObjectId → Backend resolves to VVAULT user ID
3. **File paths are user-specific**: All files created under user's directory
4. **No cross-user access**: Files are isolated by user directory structure

### Default Constructs Per User

**Location**: `vvault/analysis-summaries/VVAULT_FILE_STRUCTURE_SPEC.md`

Every user automatically gets:
1. **`synth-001`**: Main conversation construct
   - Path: `users/{shard}/{user_id}/instances/synth-001/chatty/chat_with_synth-001.md`
2. **`lin-001`**: GPT Creator assistant construct
   - Path: `users/{shard}/{user_id}/instances/lin-001/chatty/chat_with_lin-001.md`

### Creating New GPTs for Users

**Current Flow**:
1. User creates GPT in `GPTCreator.tsx` (e.g., name: "Luna")
2. GPT gets assigned `construct-callsign` (e.g., `luna-001` - lowercase, hyphenated, with callsign)
3. Frontend calls `POST /api/vvault/conversations` with constructId = construct-callsign
4. Backend creates canonical file at:
   ```
   /vvault/users/shard_0000/{user_id}/instances/luna-001/chatty/chat_with_luna-001.md
   ```
5. Subsequent messages append to this file

---

## Key Functions and Locations

### User ID Resolution
- **Function**: `resolveVVAULTUserId(userId, email)`
- **Location**: `chatty/vvaultConnector/writeTranscript 3.js`
- **Purpose**: Convert MongoDB ObjectId/email → VVAULT LIFE format user ID

### Canonical File Creation
- **Function**: `createPrimaryConversationFile()`
- **Location**: `chatty/server/services/importService.js`
- **API**: `POST /api/vvault/create-canonical`
- **Purpose**: Create canonical conversation file with IMPORT_METADATA block

### Message Appending
- **Function**: `appendToConstructTranscript()`
- **Location**: `chatty/vvaultConnector/writeTranscript 3.js`
- **API**: `POST /api/vvault/conversations/:sessionId/messages`
- **Purpose**: Append messages to existing conversation files

### Construct-Callsign Resolution
- **Function**: `resolveConstructDescriptor(threadId, metadata)`
- **Location**: `chatty/src/lib/vvaultConversationManager.ts`
- **Purpose**: Extract construct-callsign from threadId (e.g., `luna-001_chat_with_luna-001` → `luna-001`)

---

## Current Limitations and Notes

1. **Sharding**: Currently all users in `shard_0000` (sequential sharding, not hash-based)
2. **User Creation**: User profiles must be created manually or via `create_user_profile.py` script
3. **GPT Creation**: GPT creation UI exists but may need additional VVAULT integration
4. **File Structure**: Migrating from `constructs/` to `instances/` structure
5. **Callsign Handling**: Construct IDs include callsigns (e.g., `synth-001`), but base construct name is extracted for folder creation

---

## Example Flow: User Creates GPT Named "Luna"

1. **User logs in**: `dwoodson92@gmail.com`
2. **Frontend resolves user**: Uses email for VVAULT lookup
3. **User creates GPT**: Name = "Luna"
4. **System generates construct-callsign**: `luna-001` (lowercase, hyphenated, with callsign)
5. **Frontend calls**: `POST /api/vvault/conversations` with `constructId: "luna-001"`
6. **Backend resolves VVAULT user ID**: `devon_woodson_1762969514958`
7. **Backend creates file**: 
   ```
   /vvault/users/shard_0000/devon_woodson_1762969514958/instances/luna-001/chatty/chat_with_luna-001.md
   ```
8. **User sends message**: Message appends to this file
9. **AI responds**: Response appends to this file with generation time

**Key Points**:
- Construct name "Luna" → construct-callsign `luna-001` (lowercase, hyphenated)
- Directory: `/instances/luna-001/`
- File: `chat_with_luna-001.md`

---

## Related Documentation

- `VVAULT_FILE_STRUCTURE_SPEC.md`: Complete file structure specification
- `ADDRESS_BOOK_RUBRIC.md`: How conversations appear in sidebar
- `VVAULT_BACKEND_FRONTEND_CONNECTION_RUBRIC.md`: Backend-to-frontend connection flow

