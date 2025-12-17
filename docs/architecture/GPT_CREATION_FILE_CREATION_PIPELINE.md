# GPT Creation and File Creation Pipeline for VVAULT Accounts

**Last Updated**: January 27, 2025

## Overview

This document describes the current pipeline for GPT creation and file creation for separate VVAULT user accounts. The system uses a sharded user registry structure where each user has isolated storage under their own directory.

## Terminology

- **construct-callsign**: The full construct identifier including callsign (e.g., `luna-001`, `synth-001`, `katana-001`)
  - Format: `{construct-name}-{callsign}` (lowercase, hyphenated)
  - **Callsign Format**: Triple-digit index (e.g., `001`, `002`, `003`, `928`, `007`)
  - **First Instance**: Always `-001` (e.g., first "Katana" → `katana-001`)
  - **Cloning**: Automatically increments (e.g., clone "Katana" → `katana-002`, next clone → `katana-003`)
  - Example: If construct name is "Katana" → first instance is `katana-001`, second is `katana-002`
  - Used in: Directory names (`/instances/katana-001/`), file names (`chat_with_katana-001.md`)
- **constructId**: Same as construct-callsign (used interchangeably in code)
- **construct name**: The human-readable name (e.g., "Katana", "Luna", "Synth") - capitalized, can have spaces
- **normalized name**: Lowercase, hyphenated version of construct name (e.g., "Katana" → `katana`, "My AI" → `my-ai`)

---

## Construct Callsign Generation

### Automatic Callsign Assignment

Construct callsigns are automatically generated when creating a new AI/construct. The system ensures unique callsigns per user and per construct name.

**Process**:
1. **Normalize construct name**: Convert to lowercase, replace spaces with hyphens, remove special characters
   - Example: "Katana" → `katana`, "My AI" → `my-ai`
2. **Query existing instances**: Search for existing constructs with the same normalized name for the current user
3. **Find highest callsign**: Extract the highest callsign number (e.g., if `katana-001` and `katana-003` exist, highest is `003`)
4. **Generate next callsign**: Increment by 1 and pad to 3 digits
   - First instance: `001` (always)
   - If `katana-001` exists → next is `katana-002`
   - If `katana-001` and `katana-002` exist → next is `katana-003`
   - If no instances exist → first is `katana-001`

**Implementation**: `chatty/server/lib/aiManager.js` → `generateConstructCallsign(name, userId)`

**Examples**:
- First "Katana" created → `katana-001`
- Clone "Katana" → `katana-002`
- Clone again → `katana-003`
- First "Luna" created → `luna-001`
- Clone "Luna" → `luna-002`

**Key Rules**:
- ✅ First instance is always `-001`
- ✅ Callsigns are triple-digit (001, 002, 003, etc.)
- ✅ Callsigns auto-increment on cloning
- ✅ Callsigns are scoped per user (each user can have their own `katana-001`)
- ✅ Callsigns are scoped per construct name (different names don't conflict)

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
            │   └── {constructCallsign}/  # e.g., "synth-001", "luna-001", "lin-001", "katana-001"
            │       ├── identity/          # Identity files for the construct
            │       │   ├── prompt.txt    # GPT prompt with name, description, instructions
            │       │   ├── avatar.png    # Avatar image (always PNG format)
            │       │   ├── conditioning.txt  # Conditioning rules (optional)
            │       │   ├── {constructCallsign}.capsule  # Capsule file (optional)
            │       │   └── personality.json  # Personality profile (optional)
            │       ├── chatty/
            │       │   └── chat_with_{constructCallsign}.md  # e.g., "chat_with_luna-001.md"
            │       ├── assets/            # Media files (created dynamically)
            │       └── chatgpt/          # Imported transcripts (created dynamically)
            │       
            │   CRITICAL: Use constructCallsign DIRECTLY (e.g., "katana-001")
            │   DO NOT parse into constructId-callsign and reconstruct (would create "katana-katana-001")
            │   The constructCallsign IS the directory name: instances/{constructCallsign}/
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
6. **Callsign Format**: Triple-digit, zero-padded (001, 002, 003) - always starts at 001 for first instance
7. **Auto-Increment**: Cloning automatically generates next sequential callsign (e.g., `katana-001` → `katana-002`)

---

## Example Flow: User Creates GPT Named "Katana"

### First Instance Creation

1. **User logs in**: `dwoodson92@gmail.com`
2. **Frontend resolves user**: Uses email for VVAULT lookup
3. **User creates GPT**: Name = "Katana"
4. **System generates construct-callsign**: 
   - Normalizes name: "Katana" → `katana`
   - Checks for existing instances: None found
   - Generates first callsign: `katana-001` (always starts at 001)
5. **Frontend calls**: `POST /api/vvault/conversations` with `constructId: "katana-001"`
6. **Backend resolves VVAULT user ID**: `devon_woodson_1762969514958`
7. **Backend creates file**: 
   ```
   /vvault/users/shard_0000/devon_woodson_1762969514958/instances/katana-001/chatty/chat_with_katana-001.md
   ```
8. **User sends message**: Message appends to this file
9. **AI responds**: Response appends to this file with generation time

**Key Points**:
- Construct name "Katana" → construct-callsign `katana-001` (lowercase, hyphenated, triple-digit callsign)
- First instance always gets `-001`
- Directory: `/instances/katana-001/`
- File: `chat_with_katana-001.md`

### Cloning Example

1. **User clones "Katana"**: Clicks "Clone" on existing `katana-001`
2. **System generates new construct-callsign**:
   - Normalizes name: "Katana" → `katana`
   - Checks for existing instances: Finds `katana-001`
   - Finds highest callsign: `001`
   - Generates next callsign: `katana-002` (auto-incremented)
3. **New instance created**: `katana-002` with its own directory and conversation file
4. **Result**: User now has both `katana-001` and `katana-002` as separate instances

**Key Points**:
- Cloning automatically increments callsign (`001` → `002` → `003`, etc.)
- Each clone is a separate instance with its own directory and files
- Callsigns are triple-digit and zero-padded (001, 002, 003, not 1, 2, 3)

---

## Identity Files and prompt.txt Format

### Identity Directory Structure

Each construct has an `identity/` directory containing core identity files:

```
instances/{constructCallsign}/identity/
├── prompt.txt              # Required: GPT prompt with name, description, instructions
├── avatar.png              # Optional: Avatar image (always PNG format)
├── conditioning.txt        # Optional: Conditioning rules
├── {constructCallsign}.capsule  # Optional: Capsule file
└── personality.json        # Optional: Personality profile
```

### prompt.txt Format

The `prompt.txt` file follows a standardized format that is automatically parsed by Chatty:

```
**You Are <NAME>**
*<Description>*

<Instructions block>
```

**Example**:
```
**You Are Katana**
*Helps you with your life problems.*

Instructions for Katana:
Be ruthless, not polite. No metaphors, no fluff, no inspiration porn.
Strip language down to muscle and bone.
Speak like a posthuman who doesn't need to pretend.
```

**Parsing Rules**:
- **Line 1**: `**You Are <NAME>**` → Extracts the GPT name
- **Line 2**: `*<Description>*` → Extracts the description (italics format)
- **Remaining lines**: Everything after line 2 becomes the instructions block

**Parser Location**: `chatty/server/lib/promptParser.js`

**Usage**: The parser is used by:
- `chatty/server/scripts/syncGPTsFromVVAULT.js` - When syncing GPTs from VVAULT
- Other services that need to extract GPT metadata from prompt.txt

### Avatar Storage

**Location**: `instances/{constructCallsign}/identity/avatar.png`

**Format**: Always PNG format (converted automatically if uploaded as JPEG, GIF, WebP, etc.)

**Storage Process**:
1. User uploads avatar image in GPTCreator
2. Image is converted to PNG (if needed) using sharp library
3. Saved to `identity/avatar.png` (not `assets/avatar.{ext}`)
4. Path stored in database: `instances/{constructCallsign}/identity/avatar.png`
5. Served via API: `/api/ais/{id}/avatar`

**Implementation**: `chatty/server/lib/aiManager.js` → `saveAvatarToFilesystem()`

**Key Points**:
- Avatars are always saved as `avatar.png` regardless of original format
- Avatars are stored in `identity/` directory, not `assets/`
- The UI automatically converts uploaded images to PNG format
- Avatar paths are converted to API URLs when loading GPTs: `/api/ais/{id}/avatar`

---

## Related Documentation

- `VVAULT_FILE_STRUCTURE_SPEC.md`: Complete file structure specification
- `ADDRESS_BOOK_RUBRIC.md`: How conversations appear in sidebar
- `VVAULT_BACKEND_FRONTEND_CONNECTION_RUBRIC.md`: Backend-to-frontend connection flow

