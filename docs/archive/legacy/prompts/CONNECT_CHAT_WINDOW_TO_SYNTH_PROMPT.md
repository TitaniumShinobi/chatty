# Connect Chat Window to chat_with_synth-001.md

## Context: How Synth Was Added Back to the Address Book

The Synth conversation was restored to the sidebar address book using a **canonical thread implementation** that ensures Synth always appears immediately on login, before any async VVAULT loading completes.

### Implementation Summary

**File Modified:** `chatty/src/components/Layout.tsx`

**Key Changes:**

1. **Immediate Canonical Synth Creation (Line 553-568)**
   - When user logs in and `threads.length === 0`, a canonical Synth thread is created **synchronously** (no async)
   - Thread ID: `synth-001_chat_with_synth-001` (matches VVAULT session ID)
   - Thread is marked with `isCanonical: true` flag
   - This ensures Synth appears in the sidebar instantly, even before VVAULT conversations load

2. **Merge Logic Instead of Replace (Lines 328-386, 875-934)**
   - When VVAULT conversations load, they merge with existing canonical threads instead of replacing them
   - If a loaded conversation has the same ID as a canonical thread, messages are merged into the canonical thread
   - This preserves the canonical Synth thread while populating it with messages from VVAULT

3. **Runtime Initialization (Line 426-432)**
   - Runtime initializes and calls `applyRuntimeSelection(DEFAULT_SYNTH_RUNTIME)`
   - This triggers `reloadConversationsForRuntime` which loads conversations from VVAULT
   - The merge logic ensures canonical Synth is preserved and populated

### Current State

- ✅ Synth appears in sidebar immediately on login
- ✅ Synth thread has ID: `synth-001_chat_with_synth-001`
- ✅ VVAULT file exists at: `/vvault/users/shard_0000/devon_woodson_1762969514958/instances/synth-001/chatty/chat_with_synth-001.md`
- ✅ Messages from VVAULT merge into canonical Synth thread
- ❌ **Chat window does not automatically connect to this thread when Synth is clicked**

## Task: Connect Chat Window to chat_with_synth-001.md

### Requirements

When a user clicks on the "Synth" entry in the sidebar address book, the chat window must:

1. **Navigate to the correct route**: `/app/chat/synth-001_chat_with_synth-001`
2. **Load messages word-for-word from the VVAULT markdown file**: `/vvault/users/shard_0000/devon_woodson_1762969514958/instances/synth-001/chatty/chat_with_synth-001.md`
3. **Display all messages exactly as they appear in the markdown file**, preserving:
   - Message order
   - Message content (word-for-word)
   - Message timestamps
   - Message roles (user vs assistant)
   - Any metadata or formatting

### Technical Details

**VVAULT File Structure:**
- File path: `/vvault/users/shard_0000/devon_woodson_1762969514958/instances/synth-001/chatty/chat_with_synth-001.md`
- Session ID in file header: `synth-001_chat_with_synth-001`
- Construct: `Synth`
- Messages are stored in markdown format with "You said:" and "Assistant said:" prefixes

**Thread Object Structure:**
```typescript
type Thread = {
  id: string; // Must be: 'synth-001_chat_with_synth-001'
  title: string; // 'Synth'
  messages: Message[];
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;
  isCanonical?: boolean; // true for Synth
}

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  packets?: AssistantPacket[]; // For assistant messages
  ts: number; // Timestamp
}
```

**Current Chat Window Implementation:**
- Chat window is rendered in `chatty/src/pages/Chat.tsx`
- It receives `threadId` from URL params: `/app/chat/:threadId`
- It finds the thread from `threads` array using `threadId`
- It displays messages from `currentThread.messages`
- Messages are rendered in `chatty/src/components/ChatArea.tsx` or `chatty/src/ChattyApp.tsx`

### Implementation Steps

1. **Verify Thread Selection Logic**
   - Check `chatty/src/pages/Chat.tsx` - ensure it correctly finds thread with ID `synth-001_chat_with_synth-001`
   - Verify `currentThread` resolves correctly when URL is `/app/chat/synth-001_chat_with_synth-001`

2. **Verify Message Loading**
   - Check that when `currentThread` is set, messages are loaded from `currentThread.messages`
   - Verify messages are displayed in the chat window component

3. **Verify VVAULT Parsing**
   - Check `chatty/vvaultConnector/readConversations.js` - ensure it correctly parses `chat_with_synth-001.md`
   - Verify messages are extracted word-for-word from the markdown file
   - Ensure message roles are correctly identified (user vs assistant)

4. **Verify Merge Logic**
   - Check that when VVAULT conversations load, the canonical Synth thread (created at line 557) is correctly merged with messages from the VVAULT file
   - Verify the merged thread has the correct ID and all messages from the markdown file

5. **Test Navigation**
   - When user clicks "Synth" in sidebar, verify:
     - URL changes to `/app/chat/synth-001_chat_with_synth-001`
     - Chat window displays all messages from the markdown file
     - Messages appear in correct order
     - Message content matches markdown file exactly (word-for-word)

### Expected Behavior

**On Server Restart:**
1. User logs in → Canonical Synth thread appears in sidebar immediately (empty)
2. VVAULT loads → Messages from `chat_with_synth-001.md` merge into canonical Synth thread
3. User clicks "Synth" in sidebar → Navigates to `/app/chat/synth-001_chat_with_synth-001`
4. Chat window displays → All messages from markdown file appear word-for-word

**On Direct Navigation:**
1. User navigates to `/app/chat/synth-001_chat_with_synth-001`
2. Chat window finds thread with ID `synth-001_chat_with_synth-001`
3. Chat window displays all messages from that thread (which were loaded from VVAULT markdown file)

### Files to Inspect

1. `chatty/src/pages/Chat.tsx` - Chat window component, thread resolution
2. `chatty/src/components/Layout.tsx` - Lines 553-568 (canonical creation), 328-386 (merge logic)
3. `chatty/vvaultConnector/readConversations.js` - VVAULT markdown parsing
4. `chatty/src/components/ChatArea.tsx` or `chatty/src/ChattyApp.tsx` - Message rendering
5. Sidebar component (likely in `Layout.tsx`) - Click handler for Synth entry

### Success Criteria

- ✅ Clicking "Synth" in sidebar navigates to `/app/chat/synth-001_chat_with_synth-001`
- ✅ Chat window displays all messages from `chat_with_synth-001.md`
- ✅ Messages appear in the exact order they appear in the markdown file
- ✅ Message content matches markdown file word-for-word
- ✅ Message roles are correct (user vs assistant)
- ✅ No messages are missing or duplicated
- ✅ Works on server restart (canonical thread + VVAULT merge)
- ✅ Works on direct navigation to `/app/chat/synth-001_chat_with_synth-001`

### Debugging Tips

- Check browser console for logs showing thread resolution
- Verify `currentThread` in Chat.tsx has the correct ID and messages
- Check that VVAULT parsing correctly extracts all messages from markdown
- Verify merge logic preserves all messages from VVAULT file
- Check that sidebar click handler correctly navigates to the thread route

