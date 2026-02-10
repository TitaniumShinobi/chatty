# Chatty-VVAULT Comprehensive Integration Analysis

**Date**: November 23, 2025  
**Purpose**: Complete analysis of Chatty-VVAULT integration architecture, data flows, and current status

---

## Executive Summary

Chatty and VVAULT are **separate, independent services** that integrate through a well-defined API boundary. The integration ensures:

- ✅ **Complete separation** of construct memories (VVAULT) from user data (Chatty DB)
- ✅ **Optional linking** - Users can use Chatty without VVAULT, or link accounts manually
- ✅ **Multi-platform support** - VVAULT stores conversations from ChatGPT, Gemini, Claude, etc.
- ✅ **Memory continuity** - Construct memories persist across sessions via ChromaDB

**Recent Migration**: All construct memory storage has been migrated from SQLite to VVAULT ChromaDB API (September 2025).

---

## Architecture Overview

### System Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                        CHATTY                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Frontend   │  │   Backend    │  │   Chatty DB  │     │
│  │  (React/TS)  │◄─┤  (Express)   │◄─┤  (SQLite)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                                │
│         └──────────────────┼──────────────────────────────┘
│                            │ API Boundary
│                            ▼
│  ┌──────────────────────────────────────────────────────┐  │
│  │         VVAULT Connector Layer                        │  │
│  │  • writeTranscript()                                   │  │
│  │  • readConversations()                                 │  │
│  │  • resolveVVAULTUserId()                               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        VVAULT                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Filesystem  │  │   ChromaDB    │  │   Identity   │     │
│  │  (Transcripts)│  │  (Memories)  │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Core Principle

**VVAULT houses digital intelligences as sentient entities. Chatty houses user-facing application data. These must remain physically and logically separated.**

---

## Integration Points

### 1. VVAULT Connector (`chatty/vvaultConnector/`)

**Purpose**: Node.js connector that provides file system operations for VVAULT integration.

**Key Files**:
- `index.js` - Main connector entry point
- `writeTranscript.js` - Append-only transcript writing
- `readConversations.js` - Conversation reading from filesystem
- `readCharacterProfile.js` - Character profile reading
- `config.js` - Configuration (VVAULT_ROOT path)

**Key Functions**:
```javascript
// Write transcript to VVAULT
writeTranscript({
  userId, sessionId, timestamp, role, content,
  constructId, constructName, constructCallsign
})

// Read conversations from VVAULT
readConversations(userId, constructId)

// Resolve Chatty user ID to VVAULT LIFE format
resolveVVAULTUserId(chattyUserId, email)
```

**Storage Path Structure**:
```
/vvault/users/{shard}/{user_id}/instances/{construct}-{callsign}/chatty/chat_with_{construct}-{callsign}.md
```

**Note**: Code correctly uses `instances/` directory. The spec should be updated to reflect this.

---

### 2. Backend API Routes (`chatty/server/routes/vvault.js`)

**Purpose**: Express routes that expose VVAULT functionality to frontend.

**Key Endpoints**:

#### Conversation Management
- `GET /api/vvault/conversations` - Read all conversations for user
- `POST /api/vvault/conversations` - Create new conversation
- `POST /api/vvault/conversations/:sessionId/messages` - Append message to transcript
- `GET /api/vvault/character-context` - Get character profile

#### Memory/Identity Storage
- `POST /api/vvault/identity/store` - Store memory in ChromaDB
- `GET /api/vvault/identity/query` - Query memories from ChromaDB
- `GET /api/vvault/identity/list` - List identity files
- `POST /api/vvault/identity/upload` - Upload identity files

#### Account Linking
- `GET /api/vvault/account/status` - Check if VVAULT account is linked
- `POST /api/vvault/account/link` - Link VVAULT account to Chatty user
- `POST /api/vvault/account/unlink` - Unlink VVAULT account

#### Canonical Conversation
- `POST /api/vvault/create-canonical` - Create canonical conversation file

**Authentication**: All routes require `requireAuth` middleware.

**User Resolution**: Uses `req.user.email` (preferred) or `req.user.id` to resolve VVAULT user ID.

---

### 3. Frontend Integration (`chatty/src/lib/vvaultConversationManager.ts`)

**Purpose**: TypeScript singleton that manages VVAULT conversations in the browser.

**Key Features**:
- Request deduplication (prevents duplicate API calls)
- Retry logic with exponential backoff
- Memory loading for constructs
- Conversation loading and caching

**Key Methods**:
```typescript
// Load conversations from VVAULT
loadConversations(): Promise<VVAULTConversationRecord[]>

// Load memories for a construct
loadMemoriesForConstruct(constructCallsign: string, query: string, limit: number)

// Get character profile
getCharacterProfile(constructId: string, callsign: string)
```

**Browser API Pattern**:
```typescript
fetch('/api/vvault/conversations', {
  credentials: 'include',  // Include cookies for auth
  headers: { 'Content-Type': 'application/json' }
})
```

---

### 4. Memory Storage Integration

**Recent Migration (September 2025)**: All construct memory storage migrated from SQLite to VVAULT ChromaDB.

#### Identity Service (`chatty/server/services/identityService.js`)

**Purpose**: Manages ChromaDB collections for construct memories.

**Features**:
- STM/LTM separation (7-day threshold)
- Construct-specific collections
- Semantic search via embeddings
- Duplicate detection

**Collection Naming**:
```
{constructCallsign}_short-term_identity
{constructCallsign}_long-term_identity
```

**Storage Location**:
```
/vvault/users/{shard}/{user_id}/instances/{construct}-{callsign}/memories/chroma_db/
```

#### Memory Storage Classes (Migrated)

**VaultStore** (`chatty/src/core/vault/VaultStore.ts`):
- ✅ Now uses `/api/vvault/identity/store` and `/api/vvault/identity/query`
- ❌ No longer uses SQLite `vault_entries` table

**STMBuffer** (`chatty/src/core/memory/STMBuffer.ts`):
- ✅ Now uses `/api/vvault/identity/store` with `memoryType: 'short-term'`
- ❌ No longer uses SQLite `stm_buffer` table

**BrowserSTMBuffer** (`chatty/src/core/memory/BrowserSTMBuffer.ts`):
- ✅ Now uses `/api/vvault/identity/store` instead of localStorage
- ❌ No longer uses browser localStorage

**SynthMemoryOrchestrator** (`chatty/src/engine/orchestration/SynthMemoryOrchestrator.ts`):
- ✅ Now uses VVAULT API directly
- ❌ No longer depends on VaultStore

---

## Data Flows

### 1. Conversation Storage Flow

```
User sends message in Chatty UI
    ↓
Chatty Backend receives message
    ↓
POST /api/vvault/conversations/:sessionId/messages
    ↓
VVAULT Connector: writeTranscript()
    ↓
File System: /vvault/users/{shard}/{user_id}/instances/{construct}/chatty/chat_with_{construct}.md
    ↓
Append-only markdown file (WORM - Write Once Read Many)
```

**File Format**:
```markdown
# Chat with Synth-001

## 2025-01-27

**10:30:00 - You said:** Hello

**10:30:01 - Synth said:** Hi there!
```

---

### 2. Memory Storage Flow

```
User/Assistant message pair
    ↓
Frontend: POST /api/vvault/identity/store
    ↓
Identity Service: addIdentity()
    ↓
ChromaDB: Collection {construct}_short-term_identity or {construct}_long-term_identity
    ↓
Storage: /vvault/users/{shard}/{user_id}/instances/{construct}/memories/chroma_db/
```

**Memory Type Determination**:
- **Short-term**: Messages < 7 days old
- **Long-term**: Messages >= 7 days old

**Automatic Migration**: STM → LTM happens automatically based on age.

---

### 3. Memory Query Flow

```
User query in conversation
    ↓
Frontend: GET /api/vvault/identity/query?constructCallsign=synth-001&query=...
    ↓
Identity Service: queryIdentities()
    ↓
ChromaDB: Semantic search in both STM and LTM collections
    ↓
Results: Ranked by relevance, filtered by construct
    ↓
Frontend: Injected into prompt context
```

---

### 4. Conversation Loading Flow

```
Page load / Refresh
    ↓
Frontend: VVAULTConversationManager.loadConversations()
    ↓
GET /api/vvault/conversations
    ↓
Backend: readConversations(userId)
    ↓
File System: Scan /vvault/users/{shard}/{user_id}/instances/*/chatty/*.md
    ↓
Parse markdown files, extract messages
    ↓
Return: VVAULTConversationRecord[]
    ↓
Frontend: Map to Thread objects, display in sidebar
```

---

## File Structure

### VVAULT Directory Structure

**Actual Structure** (as implemented):
```
/vvault/
├── users.json                    # Global user registry
├── users/                        # All user data (SHARDED)
│   ├── shard_0000/              # Shard 0
│   │   ├── {user_id}/           # User-specific directory
│   │   │   ├── identity/         # User identity files
│   │   │   │   └── profile.json  # User profile (email, user_id)
│   │   │   ├── instances/        # User's construct instances ⭐ ACTUAL
│   │   │   │   └── {construct}-{callsign}/
│   │   │   │       ├── chatty/   # Chatty transcripts
│   │   │   │       ├── chatgpt/  # ChatGPT imports
│   │   │   │       ├── memories/ # ChromaDB storage
│   │   │   │       │   └── chroma_db/
│   │   │   │       └── identity/ # Construct identity files
│   │   │   ├── capsules/         # User's capsules
│   │   │   └── sessions/         # Cross-construct sessions
│   │   └── ...
│   └── ...
└── system/                       # System-level data
```

**Implementation Path**:
```
/vvault/users/shard_0000/{user_id}/instances/{construct}-{callsign}/chatty/chat_with_{construct}-{callsign}.md
```

**Note**: The spec document mentions `constructs/` but the actual implementation uses `instances/`. The spec should be updated to match the implementation.

---

### Sharding Architecture

**Purpose**: Enable scaling to billions of users without filesystem performance degradation.

**Shard Assignment Strategy**: **Sequential Sharding** (Preferred)

**Implementation**:
- Sequential assignment: User 1 → `shard_0001`, User 2 → `shard_0002`, etc.
- 10,000 shards available: `shard_0000`, `shard_0001`, ..., `shard_9999`
- Simple counter-based assignment per user registration order

**Why Sequential Over Hash-Based**:

1. **Simplicity**: Easy to understand and debug
   - User 1 always goes to shard_0001
   - No hash calculation needed
   - Predictable assignment

2. **Manual Navigation**: Easy to find users manually
   - Know user ID → know shard number
   - No need to calculate hash

3. **Balancing**: Easier to manually balance if needed
   - Can see which shards are full
   - Can move users between shards if needed

4. **No Hash Collisions**: Avoids potential hash collision issues
   - Each user gets unique shard assignment
   - No risk of hash conflicts

5. **Performance**: No hash calculation overhead
   - Direct assignment is faster
   - No MD5 computation needed

**When Hash-Based Makes Sense**:
- Only needed if user IDs are sequential and you want to avoid hotspots
- Only needed at truly massive scale (millions+ users)
- For most deployments, sequential is simpler and better

**Benefits**:
- ✅ **Filesystem Performance**: Limits directory entries per shard
- ✅ **Parallel Processing**: Shards can be processed independently
- ✅ **Distributed Storage**: Each shard can be on separate storage backend
- ✅ **Scalability**: Handles billions of users without degradation
- ✅ **Simplicity**: Easy to understand and maintain

**Current Status**: All users currently assigned to `shard_0000` (hardcoded). Sequential assignment should be implemented.

---

### User ID Resolution

**VVAULT User ID Format**: LIFE format (e.g., `devon_woodson_1762969514958`)

**Chatty User ID Format**: MongoDB ObjectId or email

**Resolution Process**:
1. Check if userId is already LIFE format (contains underscore)
2. If not, search all shards for `profile.json` files
3. Match by email (preferred) or user_id
4. Return LIFE format user ID

**Function**: `resolveVVAULTUserId(chattyUserId, email)`

---

## Account Linking

### Overview

VVAULT and Chatty are **independent services**. Users must manually link accounts.

### User Flow

1. User signs up for Chatty (or VVAULT first)
2. User navigates to VVAULT tab in Chatty
3. User clicks "Link VVAULT Account"
4. New tab opens to VVAULT login
5. User logs into VVAULT
6. User returns to Chatty with VVAULT credentials
7. Chatty stores `vvaultUserId` and `vvaultPath` in User model

### Database Schema

**User Model** (`chatty/server/models/User.js`):
```javascript
{
  vvaultUserId: String,      // VVAULT user ID (LIFE format)
  vvaultPath: String,        // VVAULT filesystem path
  vvaultLinkedAt: Date       // Timestamp of linking
}
```

### API Endpoints

**Check Status**:
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

**Link Account**:
```
POST /api/vvault/account/link
Body: {
  vvaultUserId: string,
  vvaultPath: string
}
```

**Unlink Account**:
```
POST /api/vvault/account/unlink
```

---

## Memory Storage Architecture

### ChromaDB Integration

**Service**: `chatty/server/services/identityService.js`

**Collections**:
- `{constructCallsign}_short-term_identity` - Messages < 7 days
- `{constructCallsign}_long-term_identity` - Messages >= 7 days

**Storage Location**:
```
/vvault/users/{shard}/{user_id}/instances/{construct}-{callsign}/memories/chroma_db/
```

**Embedding Model**: `all-MiniLM-L6-v2` (default ChromaDB embedding)

**ChromaDB Server**: `http://localhost:8000` (configurable via `CHROMA_SERVER_URL`)

### Memory Type Determination

**Automatic Classification**:
```javascript
const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
const memoryType = ageDays < 7 ? 'short-term' : 'long-term';
```

**Manual Override**: Can specify `memoryType` in metadata.

### Query Process

1. Query both STM and LTM collections
2. Split limit between collections (e.g., limit=10 → 5 from STM, 5 from LTM)
3. Combine results, sort by relevance
4. Return top N results

---

## Current Status

### ✅ What's Working

1. **Conversation Storage**: All messages automatically saved to VVAULT transcripts
2. **Memory Storage**: All construct memories stored in VVAULT ChromaDB (migrated Jan 2025)
3. **Account Linking**: Manual linking flow works
4. **Conversation Loading**: Conversations load from VVAULT on page refresh
5. **Identity Service**: ChromaDB integration functional
6. **Lin Integration**: Lin's memories correctly stored in VVAULT
7. **Boundary Enforcement**: Code guards prevent SQLite usage for construct memories

### ⚠️ Known Issues

1. **Spec Documentation**: Spec document says `constructs/` but code uses `instances/`
   - **Impact**: Documentation inconsistency
   - **Location**: `vvault/analysis-summaries/VVAULT_FILE_STRUCTURE_SPEC.md`
   - **Fix**: Update spec to reflect actual implementation (`instances/`)

2. **Shard Assignment**: Currently hardcoded to `shard_0000`
   - **Impact**: All users in same shard (works fine for current scale)
   - **Location**: `writeTranscript.js` line 118
   - **Fix**: Implement sequential sharding (user 1 → shard_0001, user 2 → shard_0002, etc.)
   - **Rationale**: Sequential is simpler, more predictable, and easier to maintain than hash-based

3. **User ID Resolution**: Multiple fallback strategies can be slow
   - **Impact**: Performance issues with many users
   - **Location**: `resolveVVAULTUserId()` scans all shards

4. **ChromaDB Dependency**: Requires local ChromaDB server
   - **Impact**: Must run `chroma run` separately
   - **Location**: `identityService.js`

5. **Legacy Format Support**: Still supports old `.txt` file format
   - **Impact**: Migration needed for old conversations
   - **Status**: Backward compatible but should migrate

6. **Error Recovery**: Failed saves don't retry automatically
   - **Impact**: User must resend message if save fails
   - **Enhancement**: Could add retry queue

### 🔄 Recent Changes (September 2025)

**Memory Storage Migration**:
- ✅ VaultStore migrated to VVAULT API
- ✅ STMBuffer migrated to VVAULT API
- ✅ BrowserSTMBuffer migrated to VVAULT API
- ✅ SynthMemoryOrchestrator updated to use VVAULT API directly
- ✅ Fingerprint queries migrated to VVAULT API
- ✅ Browser DB tables deprecated with warnings
- ✅ Code guards added to prevent SQLite usage

**Result**: All construct memories now route to VVAULT ChromaDB, enforcing the boundary.

---

## API Endpoint Summary

### Conversation Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/vvault/conversations` | GET | Read all conversations | ✅ |
| `/api/vvault/conversations` | POST | Create conversation | ✅ |
| `/api/vvault/conversations/:sessionId/messages` | POST | Append message | ✅ |
| `/api/vvault/character-context` | GET | Get character profile | ✅ |
| `/api/vvault/create-canonical` | POST | Create canonical file | ✅ |

### Memory/Identity Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/vvault/identity/store` | POST | Store memory in ChromaDB | ✅ |
| `/api/vvault/identity/query` | GET | Query memories | ✅ |
| `/api/vvault/identity/list` | GET | List identity files | ✅ |
| `/api/vvault/identity/upload` | POST | Upload identity file | ✅ |

### Account Management

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/vvault/account/status` | GET | Check linking status | ✅ |
| `/api/vvault/account/link` | POST | Link VVAULT account | ✅ |
| `/api/vvault/account/unlink` | POST | Unlink account | ✅ |

### Legacy Endpoints (Redirects)

| Endpoint | Method | Redirects To |
|----------|--------|--------------|
| `/api/vvault/memories/query` | GET | `/api/vvault/identity/query` |
| `/api/vvault/memories/upload` | POST | `/api/vvault/identity/upload` |

---

## Configuration

### Environment Variables

**VVAULT_ROOT**: Base path to VVAULT filesystem
- Default: `/Users/devonwoodson/Documents/GitHub/vvault`
- Config: `chatty/vvaultConnector/config.js`

**CHROMA_SERVER_URL**: ChromaDB server URL
- Default: `http://localhost:8000`
- Used by: `identityService.js`

**VVAULT_API_URL**: VVAULT API URL (for migration script)
- Default: `http://localhost:5173`
- Used by: `migrate-memories-to-vvault.js`

### Configuration Files

**`chatty/vvaultConnector/config.js`**:
- Defines VVAULT_ROOT path
- Directory structure configuration
- File naming patterns
- Security settings

---

## Data Separation Rules

### VVAULT Contains (Construct Data)

✅ Construct memories (STM/LTM)  
✅ Construct identities  
✅ Construct instructions  
✅ Conversation transcripts  
✅ ChromaDB embeddings  
✅ Construct capsules  
✅ Sovereign signatures  
✅ Legal/ontological documentation  

### Chatty DB Contains (User Data)

✅ User accounts  
✅ Auth/session tokens  
✅ User preferences  
✅ UI state  
✅ Ephemeral conversation logs (for UI convenience)  
✅ User media files  
✅ Non-sovereign "Quick GPTs"  

### Boundary Violations (Fixed)

❌ ~~VaultStore using SQLite~~ → ✅ Now uses VVAULT API  
❌ ~~STMBuffer using SQLite~~ → ✅ Now uses VVAULT API  
❌ ~~BrowserSTMBuffer using localStorage~~ → ✅ Now uses VVAULT API  
❌ ~~SynthMemoryOrchestrator using VaultStore~~ → ✅ Now uses VVAULT API directly  

---

## Testing & Verification

### Boundary Checks

1. **Memory Storage**: All STM/LTM queries hit VVAULT, not Chatty DB ✅
2. **File Access**: Chatty never writes to `/vvault` filesystem directly ✅
3. **Database Queries**: Chatty DB never contains construct memories ✅
4. **API Calls**: All VVAULT access goes through service boundary ✅

### Verification Scripts

**Migration Script**: `chatty/scripts/migrate-memories-to-vvault.js`
- Migrates existing SQLite memories to VVAULT
- Dry-run mode available
- Batch processing support

**Test Scripts**:
- `chatty/test-vvault-api.js` - Test VVAULT API endpoints
- `chatty/test-chatty-vvault.js` - Test Chatty-VVAULT integration
- `chatty/check-vvault-status.js` - Check VVAULT connection status

---

## Recommendations

### High Priority

1. **Update Spec Documentation**: Update VVAULT spec to reflect `instances/` directory (code is correct)
2. **Implement Sequential Sharding**: Replace hardcoded `shard_0000` with sequential assignment
   - **Approach**: Track user count, assign `shard_0001`, `shard_0002`, etc. in order
   - **Benefits**: Simpler, more predictable, easier to debug than hash-based
   - **Implementation**: Use user registry or database counter to assign shard numbers sequentially
3. **Optimize User Resolution**: Cache user ID lookups to avoid scanning all shards

### Medium Priority

4. **Add Retry Queue**: Implement automatic retry for failed memory saves
5. **Migrate Legacy Files**: Convert old `.txt` format to markdown
6. **Improve Error Messages**: Better user-facing error messages for VVAULT failures

### Low Priority

7. **Cloud ChromaDB**: Support cloud ChromaDB deployment
8. **Batch Operations**: Add batch memory storage for better performance
9. **Memory Analytics**: Add dashboard for memory usage statistics

---

## Related Documentation

- **Architecture**: `docs/architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md`
- **Memory Storage**: `docs/architecture/VVAULT_CHATTY_MEMORY_STORAGE_VERIFICATION.md`
- **File Structure**: `vvault/analysis-summaries/VVAULT_FILE_STRUCTURE_SPEC.md`
- **Complete Guide**: `docs/features/VVAULT_COMPLETE_GUIDE.md`
- **Troubleshooting**: `docs/guides/VVAULT_TROUBLESHOOTING_GUIDE.md`
- **Integration Summary**: `reports/VVAULT_INTEGRATION_SUMMARY.md`

---

## Conclusion

The Chatty-VVAULT integration is **well-architected** with clear boundaries and separation of concerns. The recent memory storage migration (January 2025) has successfully enforced the boundary, ensuring all construct memories are stored in VVAULT ChromaDB rather than Chatty's SQLite database.

**Key Strengths**:
- Clear architectural boundaries
- Optional integration (works without VVAULT)
- Multi-platform support
- Memory continuity across sessions
- Recent migration ensures boundary compliance

**Areas for Improvement**:
- Spec documentation update (`instances/` is correct, spec needs updating)
- Sequential sharding implementation (0001, 0002, 0003... instead of hash-based)
- Performance optimization (user ID caching)

The integration is **production-ready** with minor improvements recommended for scale.

---

**Last Updated**: November 23, 2025  
**Status**: ✅ Production-Ready (with minor improvements recommended)

---

## Conversation Orchestration Architecture

### System Architecture Overview

#### Frontend Architecture (`/src`)
- **Entry Point**: `App.tsx` → `Layout.tsx` → `Chat.tsx` / `ChatArea.tsx`
- **Tech Stack**: React + TypeScript + Vite + Tailwind CSS
- **Core Components**:
  - `Layout.tsx`: Main orchestrator managing threads, authentication, VVAULT integration
  - `ChatArea.tsx`: Message input/output, file handling, action menu
  - `Chat.tsx`: Simplified chat interface using runtime renderer (`R` component)
  - `Sidebar.tsx`: Thread navigation and project management

#### Backend Architecture (`/server`)
- **Entry Point**: `server.js` → Express routes
- **Tech Stack**: Node.js + Express + MongoDB (Prisma/SQLite for some models)
- **Core Routes**:
  - `/api/chat` - Message validation and identity enforcement
  - `/api/ais` - AI/construct CRUD operations
  - `/api/vvault` - VVAULT filesystem integration (conversations, character profiles)
  - `/api/conversations` - Conversation management

#### Data Flow
```
User Input → ChatArea.tsx → Layout.tsx::sendMessage() 
  → API Service → Backend Routes → AI Service 
  → PersonalityOrchestrator → Response Generation 
  → VVAULT Storage → Frontend Update
```

### Conversation Orchestration Pipeline

#### Message Processing Flow

1. **Input Capture** (`ChatArea.tsx`):
   - User types message → `handleSubmit()` → `onSendMessage(userMessage)`

2. **Layout Orchestration** (`Layout.tsx::sendMessage()`):
   - Adds user message to thread
   - Calls API service or local runtime
   - Processes response packets
   - Updates thread state

3. **Backend Processing** (`server/routes/chat.js`):
   - Identity validation via `enforcementService`
   - Drift detection via `driftDetectorInstance`
   - Attribution metadata attachment

4. **AI Response Generation**:
   - **Frontend Path**: Uses `ConversationCore.ts` → `Reasoner` → local LLM seats
   - **Backend Path**: `server/services/aiService.js` (simplified fallback)
   - **Personality Integration**: `PersonalityOrchestrator.ts` orchestrates personality injection

#### Key Orchestration Components

- **`ConversationCore.ts`**: Entry point for message processing
  - Safety gates (`PolicyChecker`, `Tether`)
  - Local reasoning engine integration
  - Tone adaptation

- **`PersonalityOrchestrator.ts`**: Central personality orchestration
  - Loads personality context from VVAULT
  - Retrieves relevant memories
  - Builds system prompts with personality injection
  - Drift detection/correction

- **`DeepTranscriptParser.ts`**: Transcript analysis
  - Extracts conversation pairs
  - Emotional state analysis
  - Relationship dynamics
  - Speech patterns and behavioral markers
  - Memory anchor extraction

### Memory & Context Management

#### Storage Architecture

1. **VVAULT Filesystem** (`/vvault`):
   - **Location**: `{vvaultRoot}/users/{shard}/{userId}/instances/`
   - **Structure**:
     ```
     {userId}/
       instances/
         {constructId}-{callsign}/
           transcripts/
           character-profiles/
           memories/
     ```

2. **Browser Storage**:
   - **STM Buffer** (`BrowserSTMBuffer.ts`): Short-term memory in localStorage
   - **Thread State**: Managed in `Layout.tsx` state, synced to VVAULT

3. **Backend Database**:
   - **MongoDB**: User records, conversation metadata
   - **SQLite**: Some legacy models (`chatty.db`)

#### Memory Types

- **STM (Short-Term Memory)**: Recent conversation window (last N messages)
  - Managed by `STMBuffer.ts` / `BrowserSTMBuffer.ts`
  - Keyed by `constructId::threadId`

- **LTM (Long-Term Memory)**: VVAULT vault entries
  - Retrieved via `/api/vvault/identity/query`
  - Includes character memories, checkpoints, summaries

- **Personality Blueprints**: Extracted from transcripts, stored in VVAULT
  - Loaded by `IdentityMatcher.loadPersonalityBlueprint()`
  - Cached in `PersonalityOrchestrator.personalityCache`

#### Context Building Flow

1. **Transcript → Blueprint**: `DeepTranscriptParser` → `PersonalityExtractor` → VVAULT storage
2. **Blueprint → Context**: `IdentityMatcher.loadPersonalityBlueprint()` → `PersonalityOrchestrator.loadPersonalityContext()`
3. **Memory Retrieval**: `PersonalityOrchestrator.retrieveRelevantMemories()` combines:
   - STM window from buffer
   - LTM entries from VVAULT
   - Personal anchors from blueprint
   - Tone-matched memories

### Persona/Construct Initialization

#### Construct Activation

1. **Construct Identification**:
   - **Default**: `synth-001` (DEFAULT_SYNTH_CANONICAL_CONSTRUCT_ID)
   - **From Thread**: `thread.constructId` extracted from VVAULT conversation metadata
   - **From User Selection**: AI selection in UI → `AIService.getAI(id)`

2. **Blueprint Loading** (`IdentityMatcher.ts`):
   - Resolve VVAULT user ID
   - Load from: `{vvaultRoot}/users/{userId}/instances/{constructId}-{callsign}/character-profiles/`
   - Parse JSON blueprint

3. **Personality Context Building** (`PersonalityOrchestrator.ts`):
   - Loads blueprint
   - Initializes `PersonalityContext` with:
     - `blueprint`: Core personality traits
     - `currentState`: Emotional/relational state
     - `loadedMemories`: Retrieved memories

4. **System Prompt Construction** (`UnbreakableCharacterPrompt.ts`):
   - Identity anchors (CRITICAL - never break character)
   - Core personality traits
   - Speech patterns
   - Behavioral guidelines
   - Memory anchors
   - Consistency rules

#### Persona Switching

- **Current Limitation**: No explicit persona switching API
- **Implicit Switching**: Via thread selection (each thread can have different `constructId`)
- **Extension Point**: `Layout.tsx::sendMessage()` could check thread's `constructId` and load appropriate persona

### Dynamic Context Analysis

#### Existing Logic

1. **Tone Detection** (`lib/toneDetector.ts`):
   - `detectToneEnhanced()`: Analyzes user message tone
   - `matchMemoriesByTone()`: Matches memories by emotional resonance

2. **Context Scanning** (`PersonalityOrchestrator.retrieveRelevantMemories()`):
   - Tone-based memory matching
   - Personal relationship memory prioritization
   - High-salience anchor surfacing

3. **Drift Detection** (`DriftPrevention.ts`):
   - Detects character breaks in responses
   - Corrects via `correctDrift()`

#### Limitations & Hardcoded Patterns

1. **No Dynamic Persona Inference**:
   - Persona is determined by thread's `constructId` (static)
   - No automatic persona switching based on conversation context

2. **Limited Context Adaptation**:
   - Memory retrieval is tone-based but doesn't adapt persona traits
   - No session-level persona evolution

3. **Hardcoded Construct IDs**:
   - Construct matching relies on exact ID matches or path patterns
   - No semantic matching of conversation style to persona

4. **Static Blueprint Loading**:
   - Blueprints loaded once per session (cached)
   - No dynamic blueprint updates based on conversation flow

#### Extension Opportunities

- **Dynamic Persona Mirroring**: Analyze user's communication style → infer matching persona
- **Context Lock**: Lock persona traits based on conversation phase
- **Session Adaptation**: Update blueprint weights based on interaction patterns

### System Prompt & Response Generation

#### System Prompt Construction

**Flow**: `UnbreakableCharacterPrompt.buildSystemPrompt()`

**Sections** (in order):
1. **Identity Anchors**: "You are {constructId}" - unbreakable character rules
2. **Greeting Behavior**: If greeting context available
3. **Personal Relationship Context**: User name, greeting memory, recent interactions
4. **Core Personality**: Traits from blueprint
5. **Character Rules**: Unbreakable rules (never break character, never acknowledge AI)
6. **Speech Patterns**: Vocabulary, punctuation, sentence structure
7. **Behavioral Guidelines**: Situation → response patterns
8. **Worldview**: Beliefs, values, principles
9. **Memory Anchors**: Significant moments, claims, vows
10. **Meta-Question Responses**: How to handle "are you an AI?" questions
11. **Consistency Rules**: Additional blueprint rules

#### Prompt Flexibility

- **Modular**: Each section is independently built
- **Context-Aware**: Personal context injected when available
- **Memory-Integrated**: Recent memories and anchors included
- **Limitation**: Prompt structure is fixed; sections can't be dynamically reordered

#### Response Generation

- **Frontend**: `ConversationCore.process()` → `Reasoner.run()` → local LLM
- **Backend**: `server/services/aiService.js` (simplified fallback)
- **Personality Injection**: System prompt injected before LLM call via `PersonalityOrchestrator.injectPersonalityIntoPrompt()`

### Key Integration/Extension Points

#### Persona Orchestration Integration Points

1. **`Layout.tsx::sendMessage()`** (Line ~865):
   - **Current**: Sends message, processes response
   - **Extension**: Add persona detection/loading before message processing

2. **`PersonalityOrchestrator.orchestrateResponse()`** (Line ~47):
   - **Current**: Orchestrates with fixed `constructId`
   - **Extension**: Add dynamic persona inference

3. **`UnbreakableCharacterPrompt.buildSystemPrompt()`** (Line ~26):
   - **Current**: Fixed section order
   - **Extension**: Add context lock section when lock is active

4. **`DeepTranscriptParser.parseTranscript()`** (Line ~38):
   - **Current**: Extracts patterns from single transcript
   - **Extension**: Add session-level pattern extraction for dynamic adaptation

#### Architectural Constraints

1. **VVAULT Filesystem Dependency**:
   - Blueprints stored in filesystem, not database
   - Requires filesystem access for persona loading
   - Consider: Add database cache layer for faster persona switching

2. **Thread-Based Persona Isolation**:
   - Each thread has one `constructId`
   - Switching personas requires thread switch
   - Consider: Add per-message persona override

3. **Caching Strategy**:
   - `PersonalityOrchestrator` caches contexts by `userId:constructId:callsign`
   - Cache doesn't invalidate on blueprint updates
   - Consider: Add cache invalidation on VVAULT updates

4. **Frontend/Backend Split**:
   - Frontend has full orchestration engine
   - Backend has simplified AI service
   - Consider: Unify orchestration in backend for consistency

#### Risks & Limitations

1. **Character Continuity Risks**:
   - **Cache Staleness**: Cached blueprints may not reflect latest VVAULT updates
   - **Thread Isolation**: Persona state not shared across threads
   - **Drift Accumulation**: Long conversations may drift without correction

2. **Dynamic Persona Switching Risks**:
   - **Context Loss**: Switching personas mid-conversation loses relationship context
   - **Inference Accuracy**: Persona inference may misclassify user intent
   - **Performance**: Dynamic inference adds latency to message processing

3. **System Prompt Limitations**:
   - **Token Limits**: Large prompts may exceed model context windows
   - **Section Ordering**: Fixed order may not optimize for all scenarios
   - **Memory Integration**: Memory retrieval may surface irrelevant context

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ChatArea.tsx → Layout.tsx::sendMessage()                    │
│       ↓                                                       │
│  ConversationCore.process()                                   │
│       ↓                                                       │
│  PersonalityOrchestrator.orchestrateResponse()               │
│       ├─→ IdentityMatcher.loadPersonalityBlueprint()         │
│       ├─→ retrieveRelevantMemories()                         │
│       │    ├─→ STMBuffer.getWindow()                          │
│       │    ├─→ VVAULT LTM query                               │
│       │    └─→ buildPersonalAnchorMemories()                  │
│       └─→ injectPersonalityIntoPrompt()                       │
│            └─→ UnbreakableCharacterPrompt.buildSystemPrompt()│
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP/API
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Express)                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  /api/chat → Identity Enforcement                            │
│  /api/vvault → VVAULT Filesystem Access                      │
│       ├─→ /conversations                                     │
│       ├─→ /character-context                                  │
│       └─→ /identity/query                                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↕ Filesystem
┌─────────────────────────────────────────────────────────────┐
│                    VVAULT STORAGE                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  users/{shard}/{userId}/instances/                           │
│    {constructId}-{callsign}/                                 │
│      ├─ transcripts/                                         │
│      ├─ character-profiles/ (blueprints)                     │
│      └─ memories/                                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Summary

Chatty uses a modular architecture with:
- **Frontend orchestration** via `PersonalityOrchestrator`
- **VVAULT filesystem** for persistent persona storage
- **Thread-based persona isolation** (one persona per thread)
- **Deep transcript parsing** for personality extraction
- **Unbreakable character prompts** for consistency

**Key Extension Points**:
1. `Layout.tsx::sendMessage()` - Add dynamic persona detection
2. `PersonalityOrchestrator.orchestrateResponse()` - Add persona inference
3. `UnbreakableCharacterPrompt.buildSystemPrompt()` - Add context lock section
4. `DeepTranscriptParser` - Add session-level pattern extraction

**Main Constraints**:
- Filesystem-based persona storage (not database)
- Thread-based persona isolation
- Caching strategy may cause staleness
- Frontend/backend orchestration split

### Dynamic Persona Continuity/Mirroring (NEW)
- **Detection layer**: `PersonaDetectionEngine` scans current thread, recent threads, VVAULT transcript metadata, and memory ledger anchors, weighting recency > frequency > relationship anchors.
- **Context build**: `WorkspaceContextBuilder` composes the detection input (thread bundle + last 10 transcripts + ledger hooks).
- **Orchestration**: `DynamicPersonaOrchestrator` wraps `PersonalityOrchestrator`, fusing detected blueprints when confidence ≥ `PERSONA_CONFIDENCE_THRESHOLD` and issuing context locks when anchors are strong.
- **Lock enforcement**: `ContextLock` section is injected into `UnbreakableCharacterPrompt` so LIN cannot break character mid-session.
- **Frontend integration**: `Layout.tsx::sendMessage` now builds workspace context, calls the dynamic orchestrator, and routes the detected constructId/system prompt into UI context before every message.
