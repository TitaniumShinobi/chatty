# VVAULT Complete Guide

**Last Updated**: November 15, 2025

This document consolidates all VVAULT-related documentation: file structure, account linking, memory sharing, sidebar integration, and import file structure.

---

## Table of Contents

1. [File Structure](#file-structure)
2. [Account Linking](#account-linking)
3. [Memory Sharing](#memory-sharing)
4. [Sidebar Integration](#sidebar-integration)
5. [Import File Structure](#import-file-structure)

---

## File Structure

### Overview

VVAULT uses a user-registry-based, sharded directory structure for data isolation and multi-platform memory continuity.

### Official Specification

Per `vvault/analysis-summaries/VVAULT_FILE_STRUCTURE_SPEC.md`, the official structure is:

```
/vvault/
├── users.json                    # Global user registry
├── users/                        # All user data isolated here (SHARDED)
│   ├── shard_0000/              # Shard 0 (for scalability)
│   │   ├── {user_id}/           # User-specific directory
│   │   │   ├── identity/         # User identity files
│   │   │   ├── instances/        # User's constructs ⭐ OFFICIAL
│   │   │   ├── capsules/         # User's capsules
│   │   │   └── sessions/         # Cross-construct sessions
│   │   └── ...
│   └── ...
└── system/                       # System-level data
```

### Construct Storage (Official Spec)

**Location**: `users/{shard_XX}/{user_id}/instances/{construct-callsign}-001/`

**Structure**:
```
instances/{construct}-001/
├── chatty/                       # Chatty conversation transcripts
│   └── chat_with_{construct}-001.md
├── chatgpt/                      # ChatGPT conversation exports
│   └── {year}/
│       └── {year}-{month}_conversations.json
├── claude/                       # Claude conversation exports (future)
├── gemini/                       # Gemini conversation exports (future)
├── memories/                     # ChromaDB memory storage
└── config/                       # Construct configuration
```

### ✅ Official Specification: `instances/`

**Official Spec**: Uses `instances/` directory  
**Implementation**: All code uses `instances/` directory  

**Status**: Consistent implementation across the system.

### Default Constructs

Every new user automatically receives two default constructs:

1. **`zen-001`**: Main conversation construct
   - **Territory**: Main conversation window in Chatty
   - **Storage**: `users/{shard}/{user_id}/instances/zen-001/`
   - **Type**: Standalone construct (not Lin-based)

2. **`lin-001`**: GPT Creator assistant construct
   - **Territory**: GPT Creator Create tab
   - **Storage**: `users/{shard}/{user_id}/instances/lin-001/`
   - **Type**: Construct with backend orchestration capabilities

### Sharding Architecture

**Purpose**: Enable scaling to billions of users without filesystem performance degradation.

**Shard Calculation**:
- Hash user_id (MD5) → consistent shard assignment
- 10,000 shards = ~100,000 users per shard at 1 billion users
- Shard format: `shard_0000`, `shard_0001`, ..., `shard_9999`

---

## Account Linking

### Overview

VVAULT is a **separate, independent service** from Chatty. Users can sign up for VVAULT and use it with any LLM provider (ChatGPT, Gemini, Claude, etc.), then optionally link their VVAULT account to Chatty for conversation storage.

### Key Principles

1. **Service Independence**: VVAULT and Chatty are completely separate services
2. **Manual Linking**: Users must manually link their VVAULT account to Chatty
3. **Different Emails Allowed**: Users can use different emails for VVAULT and Chatty
4. **Optional Integration**: VVAULT linking is optional - Chatty works without it

### User Flow

#### Scenario 1: VVAULT First, Then Chatty

1. User signs up for VVAULT at `abc@123.com`
2. User uses VVAULT with ChatGPT, Gemini, etc.
3. User signs up for Chatty at `xyz@789.com` (different email)
4. User navigates to VVAULT tab in Chatty
5. User clicks "Link VVAULT Account"
6. New tab opens to VVAULT login
7. User logs into VVAULT
8. User returns to Chatty and completes linking
9. Chatty conversations are now stored in VVAULT

#### Scenario 2: Chatty First, Then VVAULT

1. User signs up for Chatty at `xyz@789.com`
2. User navigates to VVAULT tab
3. User sees "VVAULT Account Not Linked" message
4. User clicks "Link VVAULT Account"
5. New tab opens to VVAULT signup/login
6. User creates VVAULT account at `abc@123.com` (different email)
7. User returns to Chatty and completes linking
8. Chatty conversations are now stored in VVAULT

### API Endpoints

#### Check Account Status
```
GET /api/vvault/account/status
Response: {
  linked: boolean,
  vvaultUserId: string | null,
  vvaultPath: string | null,
  linkedAt: string | null,
  chattyEmail: string
}
```

#### Link Account
```
POST /api/vvault/account/link
Body: {
  vvaultUserId: string,
  vvaultPath: string
}
```

#### Unlink Account
```
POST /api/vvault/account/unlink
```

---

## Memory Sharing

### Overview

Synth's memories can be shared between the CLI and web interface by configuring both to use the same VVAULT user directory and userId.

### How It Works

Both the CLI and web interface use the `SynthMemoryOrchestrator` which:
1. **Writes memories to VVAULT** via `writeTranscript()` when messages are captured
2. **Reads memories from VVAULT** via `readMemories()` when building context

The memories are stored in VVAULT's file system structure:
```
VVAULT/
  users/
    <userId>/
      transcripts/    # Individual message transcripts
      capsules/       # Structured memory capsules
```

### Configuration

#### CLI Configuration

```bash
# Set your web user's ID (sub/email) to share memories
export CHATTY_USER_ID="your-email@example.com"

# Optionally set VVAULT path (defaults to ../VVAULT)
export VVAULT_PATH="/path/to/VVAULT"

# Run CLI
npm run cli
```

#### Finding Your Web User ID

1. Open the web interface and log in
2. Open browser DevTools (F12)
3. Check localStorage for `auth:session` - the `user.sub` field is your user ID
4. Or check the Network tab when loading `/api/me` - the response contains your `sub` field

### Verification

After setting `CHATTY_USER_ID`, the CLI will:
- ✅ Display: `VVAULT connected for user: your-email@example.com`
- ✅ Read memories from the same VVAULT directory as the web interface
- ✅ Write new memories to the same location
- ✅ Share conversation context between CLI and web

### Default Behavior

If `CHATTY_USER_ID` is not set:
- CLI uses `userId: 'cli'` (isolated memories)
- Web uses authenticated user's ID
- Memories are **not shared** between interfaces

---

## Sidebar Integration

### Overview

VVAULT is fully integrated into Chatty's sidebar for easy access to conversation storage and system status.

### Sidebar Structure

```
📁 Main Navigation
├── 🔍 Search chats
├── 📚 Library  
├── 💻 Code
├── 🔒 VVAULT          ← Integrated!
└── 📁 Projects
```

### VVAULT Page Features

**File**: `src/pages/VVAULTPage.tsx`

**Features**:
- Real-time VVAULT statistics
- Connection status indicator
- Recent activity feed
- User, session, and transcript counts
- VVAULT information panel

### Statistics Dashboard

- **Total Users**: Number of users with stored conversations
- **Sessions**: Number of conversation sessions
- **Transcripts**: Total number of stored messages

### Status Indicators

- **🟢 Connected**: VVAULT integration working
- **🟡 Disconnected**: VVAULT not available
- **🔴 Error**: VVAULT integration failed

### Route

- **Route**: `/app/vvault` → `VVAULTPage`
- **Navigation**: Clicking VVAULT button navigates to the page
- **Layout**: Integrated with Chatty's main layout system

---

## Import File Structure

### Overview

Imported conversations should be stored in VVAULT under the user's constructs directory, organized by platform/provider.

### Correct File Structure for Imports

**Location**: `users/{shard}/{user_id}/constructs/{construct}-{callsign}/{provider}/`

**Per Spec**:
- **ChatGPT imports**: `instances/{construct}-001/chatgpt/{year}/{year}-{month}_conversations.json`
- **Gemini imports**: `instances/{construct}-001/gemini/{year}/`
- **Claude imports**: `instances/{construct}-001/claude/{year}/`

**Current Implementation** (may need update):
- **All imports**: `constructs/{construct}-{callsign}/chatty/chat_with_{construct}-{callsign}.md`

### File Format

Imported conversations use markdown format with import metadata:

```markdown
# {Conversation Title}

-=-=-=-

<!-- IMPORT_METADATA
{
  "importedFrom": "chatgpt",
  "conversationId": "abc123...",
  "conversationTitle": "Original Title",
  "detectedModel": "gpt-4",
  "gptConfig": { ... },
  "importedAt": "2025-11-13T..."
}
-->

## {Date}

**{Time} - You said:** {message}

**{Time} - {Model} said:** {response}
```

### Imported Media Files

**Current Implementation** (NOT in spec):
- Location: `users/{shard}/{user_id}/imports/{provider}/media/`

**Note**: The `imports/` folder is NOT mentioned in `VVAULT_FILE_STRUCTURE_SPEC.md`. 

**Recommendation**: Media files should likely go under the construct directory:
- `instances/{construct}-001/chatgpt/media/` or
- `instances/{construct}-001/media/`

---

## Related Documentation

- `vvault/analysis-summaries/VVAULT_FILE_STRUCTURE_SPEC.md` - Official specification
- `docs/architecture/VVAULT_FILE_STRUCTURE.md` - Detailed file structure (if exists)
- `docs/implementation/HTML_CONVERSATION_IMPORT.md` - HTML import implementation

---

**Status**: ✅ Consolidated from 5 separate documents  
**Last Updated**: November 15, 2025  
**Maintainer**: Chatty VVAULT Integration Team

