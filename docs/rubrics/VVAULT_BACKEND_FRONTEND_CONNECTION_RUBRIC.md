# VVAULT Backend-to-Frontend Connection Rubric

## Core Principle

**VVAULT filesystem is the source of truth for conversations, seamlessly connected to the Chatty frontend.**

Conversations stored in VVAULT filesystem are read by the backend, exposed via API, and displayed in the Chatty frontend without data loss or transformation errors.

## Definition

### Connection Architecture
- **Backend**: Reads markdown conversation files from VVAULT filesystem
- **API Layer**: Exposes conversations via `/api/vvault/conversations` endpoint
- **Frontend Manager**: `VVAULTConversationManager` fetches conversations from API
- **UI Layer**: `Layout.tsx` maps VVAULT conversations to Thread objects
- **Display Layer**: `Chat.tsx` renders conversation messages in the chat view

### File Path Structure
- **Canonical Path**: `/vvault/users/shard_0000/{user_id}/instances/{construct_id}/chatty/chat_with_{construct_id}.md`
- **Example**: `/vvault/users/shard_0000/devon_woodson_1762969514958/instances/synth-001/chatty/chat_with_synth-001.md`
- **User Resolution**: Backend resolves user by email or VVAULT user ID (LIFE format)
- **Shard Structure**: Uses `shard_0000` directory for user organization

## Rules

### 1. Backend File Reading
- **User ID Resolution**: Backend resolves user by email (preferred) or VVAULT user ID
- **Shard Scanning**: Backend scans `users/shard_*/` directories for user matches
- **Profile Matching**: Matches user by `profile.json` email field
- **Instance Scanning**: Recursively scans `instances/{construct_id}/chatty/` for markdown files
- **Metadata Parsing**: Extracts `IMPORT_METADATA` block from markdown files
- **Message Parsing**: Parses markdown format messages (e.g., "You said:", "Synth said:")

### 2. API Endpoint Contract
- **Route**: `GET /api/vvault/conversations`
- **Authentication**: Requires authenticated user session
- **User Resolution**: Uses `req.user.email` (preferred) or `req.user.id`
- **Response Format**: `{ ok: true, conversations: VVAULTConversationRecord[] }`
- **Error Handling**: Returns empty array on error (does not crash frontend)
- **User Isolation**: Enforces user registry - no fallback searches across users

### 3. Frontend Conversation Loading
- **Manager**: `VVAULTConversationManager.loadAllConversations(userId)`
- **API Call**: Uses `browserRequest('/conversations', { method: 'GET' })`
- **Request Deduplication**: Prevents concurrent duplicate API calls
- **Error Handling**: Catches errors gracefully, returns empty array
- **Backend Readiness**: Waits for backend to be ready before making requests

### 4. Thread Mapping and Transformation
- **Location**: `Layout.tsx` lines 418-465
- **Title Normalization**: Strips "Chat with " prefix, removes callsigns for Address Book
- **Construct ID Extraction**: Extracts from `constructId`, `importMetadata.constructId`, or `constructFolder`
- **Runtime ID Derivation**: Extracts from `runtimeId`, `importMetadata.runtimeId`, or strips `-001` from `constructId`
- **Primary Flag**: Determines `isPrimary` from `isPrimary` boolean or `importMetadata.isPrimary`
- **Message Mapping**: Maps VVAULT message format to Thread message format
- **Timestamp Conversion**: Converts ISO timestamps to milliseconds

### 5. Chat Display
- **Component**: `Chat.tsx` receives thread from `Layout.tsx` via React Router outlet context
- **Thread Lookup**: Finds thread by `threadId` from URL params
- **Message Rendering**: Maps thread messages to UI components
- **Packet Rendering**: Uses `<R packets={...} />` for assistant messages with packets
- **Text Rendering**: Uses plain text for user messages
- **File Display**: Shows attached files with size information

### 6. Canonical Thread Routing
- **Session ID**: Uses canonical session ID (e.g., `synth-001_chat_with_synth-001`)
- **URL Format**: `/app/chat/{threadId}`
- **Canonical Preference**: `preferCanonicalThreadId()` routes to canonical threads
- **Thread Filtering**: Filters threads by active runtime
- **Primary Sorting**: Canonical threads appear first in Address Book

## Implementation

### Backend Flow

**File**: `server/routes/vvault.js` (lines 100-149)

```javascript
router.get("/conversations", async (req, res) => {
  const userId = validateUser(res, req.user);
  const email = req.user?.email ?? '(no req.user.email)';
  const lookupId = email !== '(no req.user.email)' ? email : userId;
  
  const conversations = await readConversations(lookupId);
  res.json({ ok: true, conversations });
});
```

**File**: `vvaultConnector/readConversations 3.js` (lines 10-82)

```javascript
async function readConversations(userId, constructId = '') {
  // User ID resolution
  // Shard scanning
  // Profile matching
  // Instance scanning
  // Markdown parsing
  // Metadata extraction
  // Deduplication
  return conversations;
}
```

### Frontend Flow

**File**: `src/lib/vvaultConversationManager.ts` (lines 246-266)

```typescript
async readConversations(userId: string): Promise<VVAULTConversationRecord[]> {
  if (this.isBrowserEnv()) {
    const data = await this.browserRequest<{ conversations: VVAULTConversationRecord[] }>('/conversations', {
      method: 'GET'
    });
    return data.conversations || [];
  }
  // ... filesystem fallback
}
```

**File**: `src/components/Layout.tsx` (lines 383-465)

```typescript
// Load conversations from VVAULT
const vvaultConversations = await conversationManager.loadAllConversations(vvaultUserId);

// Map to Thread objects
const loadedThreads: Thread[] = vvaultConversations.map(conv => {
  // Title normalization
  // Construct ID extraction
  // Runtime ID derivation
  // Primary flag determination
  // Message mapping
  return thread;
});
```

**File**: `src/pages/Chat.tsx` (lines 24-98)

```typescript
export default function Chat() {
  const { threads } = useOutletContext<LayoutContext>();
  const { threadId } = useParams<{ threadId: string }>();
  const thread = threads.find(t => t.id === threadId);
  
  // Render messages
  return thread.messages.map(m => <MessageComponent message={m} />);
}
```

### Data Flow Diagram

```
VVAULT Filesystem
  └── /vvault/users/shard_0000/{user_id}/instances/{construct_id}/chatty/chat_with_{construct_id}.md
      │
      ├── Markdown file with IMPORT_METADATA block
      ├── Messages in "You said:" / "Synth said:" format
      └── Timestamps and metadata
           │
           ▼
Backend: readConversations()
  └── Scans shards, matches user, parses markdown
      │
      ├── Extracts IMPORT_METADATA
      ├── Parses messages
      └── Returns VVAULTConversationRecord[]
           │
           ▼
API: GET /api/vvault/conversations
  └── Returns { ok: true, conversations: [...] }
      │
      ▼
Frontend: VVAULTConversationManager.loadAllConversations()
  └── Calls browserRequest('/conversations')
      │
      ▼
Layout.tsx: Maps to Thread objects
  └── Normalizes titles, extracts IDs, maps messages
      │
      ├── constructId: "synth-001"
      ├── runtimeId: "synth-001"
      ├── isPrimary: true
      └── messages: Message[]
           │
           ▼
Chat.tsx: Displays conversation
  └── Renders messages in chat view
      │
      ├── User messages: plain text
      └── Assistant messages: <R packets={...} />
```

## Success Criteria

### Backend Requirements
- ✅ Reads markdown files from correct VVAULT path structure
- ✅ Resolves user by email or VVAULT user ID correctly
- ✅ Parses `IMPORT_METADATA` block correctly
- ✅ Extracts messages from markdown format correctly
- ✅ Returns conversations in expected API format
- ✅ Handles errors gracefully (returns empty array, doesn't crash)

### Frontend Requirements
- ✅ Loads conversations from API without errors
- ✅ Maps VVAULT format to Thread format correctly
- ✅ Normalizes titles for Address Book display
- ✅ Extracts constructId, runtimeId, isPrimary correctly
- ✅ Displays messages in Chat.tsx correctly
- ✅ Routes to canonical threads correctly
- ✅ Handles backend unavailability gracefully (fallback thread)

### Display Requirements
- ✅ Canonical conversation appears in Address Book
- ✅ Clicking Address Book entry routes to correct thread
- ✅ Chat.tsx displays all messages from markdown file
- ✅ Messages render correctly (user text, assistant packets)
- ✅ No duplicate conversations displayed
- ✅ No missing conversations (canonical always shows)

## Testing

### Backend Tests
- ✅ `readConversations()` finds user by email
- ✅ `readConversations()` finds user by VVAULT user ID
- ✅ Parses `IMPORT_METADATA` block correctly
- ✅ Extracts messages from markdown correctly
- ✅ Returns empty array when user not found (doesn't crash)
- ✅ API endpoint returns correct format

### Frontend Tests
- ✅ `loadAllConversations()` fetches from API
- ✅ Maps VVAULT conversations to Thread objects correctly
- ✅ Title normalization works (strips prefix, removes callsigns)
- ✅ Construct ID extraction works
- ✅ Primary flag determination works
- ✅ Chat.tsx displays thread messages correctly
- ✅ Canonical thread routing works

### Integration Tests
- ✅ End-to-end: VVAULT file → Backend → API → Frontend → Chat.tsx
- ✅ Canonical conversation displays correctly
- ✅ No data loss in transformation
- ✅ No duplicate conversations
- ✅ Backend unavailability handled gracefully

## Relationship to Other Rubrics

### Address Book Rubric
- Address Book displays normalized titles from VVAULT conversations
- Title normalization happens during Thread mapping in Layout.tsx
- Address Book shows construct names, not conversation titles

### Synth Primary Construct Rubric
- Canonical Synth conversation uses `constructId: "synth-001"`
- Primary flag (`isPrimary: true`) marks canonical threads
- Synth appears first in Address Book (canonical sorting)

### User Registry Enforcement Rubric
- Backend enforces user isolation (no fallback searches)
- User ID resolution required before reading conversations
- Profile matching ensures correct user access

## Migration Notes

### Legacy Support
- Backend checks for legacy conversation formats
- Supports both `instances/` and legacy `constructs/` directory structures
- Handles conversations without `IMPORT_METADATA` blocks

### Future Enhancements
- Real-time conversation updates (WebSocket)
- Optimistic UI updates
- Conversation caching
- Incremental loading for large conversations

## Summary

**VVAULT filesystem is the source of truth.** This means:
- Backend reads markdown files from VVAULT filesystem
- API exposes conversations to frontend
- Frontend maps VVAULT format to Thread format
- Chat.tsx displays conversations correctly
- Canonical conversations always appear
- No data loss in transformation
- User isolation enforced at backend
- Errors handled gracefully (no crashes)

The connection is complete: `/vvault/users/shard_0000/{user_id}/instances/{construct_id}/chatty/chat_with_{construct_id}.md` → Backend → API → Frontend → Chat.tsx ✅

