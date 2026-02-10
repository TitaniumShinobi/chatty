# VVAULT Connection Troubleshooting Guide

**Last Updated**: January 15, 2025

## Overview

This guide consolidates troubleshooting steps for VVAULT connection issues, including 500 errors, conversation loading failures, and connection verification.

---

## Common Issues

### Issue 1: 500 Internal Server Error

**Symptoms:**
- Backend API `/api/vvault/conversations` returns 500 error
- Frontend shows empty conversation list
- Console shows `VVAULT returned: []`

**Root Causes:**
1. Module loading failure (`loadVVAULTModules()` fails)
2. User ID resolution mismatch
3. File system path issues
4. Missing `profile.json` files

**Debugging Steps:**

1. **Check Backend Console**
   Look for these log messages:
   ```
   📚 [VVAULT API] Reading conversations for user: dwoodson92@gmail.com
   🔄 [VVAULT API] Loading VVAULT modules...
   ❌ [VVAULT API] Failed to load VVAULT modules: ...
   ```

2. **Test Module Loading**
   Visit: `http://localhost:5000/api/vvault/debug/test-modules`
   - Shows if modules loaded successfully
   - Verifies `readConversations` function is available
   - Displays VVAULT_ROOT path

3. **Test Conversation Reading**
   Visit: `http://localhost:5000/api/vvault/debug/test-read?email=dwoodson92@gmail.com`
   - Tests reading conversations directly
   - Shows errors with full stack traces
   - Verifies file system access

4. **Check File System**
   ```bash
   # Verify VVAULT path exists
   ls -la /Users/devonwoodson/Documents/GitHub/vvault
   
   # Check user directory
   ls -la /Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/devon_woodson_1762969514958/
   
   # Check for profile.json
   cat /Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/devon_woodson_1762969514958/identity/profile.json
   
   # Check conversation file
   ls -la /Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/devon_woodson_1762969514958/instances/synth-001/chatty/
   ```

**Fixes:**

- **Module Loading Error**: Check that `vvaultConnector/readConversations.js` exists and exports correctly
- **User ID Resolution**: Verify `profile.json` exists with correct email matching
- **File System Path**: Check `vvaultConnector/config.js` for correct VVAULT_ROOT path (case-sensitive: `vvault` not `VVAULT`)
- **Missing Profile.json**: Create profile.json in user's identity directory (see below)

---

### Issue 2: Conversations Not Appearing in Frontend

**Symptoms:**
- Backend finds conversations but frontend shows empty list
- Console shows `Loaded 0 conversations from VVAULT`
- File exists in VVAULT but doesn't appear in sidebar

**Root Causes:**
1. Missing `constructId` field in conversation objects
2. Frontend filtering not matching constructId
3. User ID mismatch between Chatty and VVAULT
4. Session ID mismatch

**Connection Flow Verification:**

### ✅ 1. Frontend → Backend API

**File**: `src/lib/vvaultConversationManager.ts`

```typescript
async loadAllConversations(userId: string) {
  // userId = "dwoodson92@gmail.com" (from req.user.email)
  const conversations = await this.readConversations(userId);
  // Calls GET /api/vvault/conversations
}
```

**Status**: ✅ Frontend calls backend API with user email

### ✅ 2. Backend API Route

**File**: `server/routes/vvault.js`

```javascript
router.get("/conversations", async (req, res) => {
  const email = req.user?.email ?? '(no req.user.email)';
  // email = "dwoodson92@gmail.com"
  
  const lookupId = email !== '(no req.user.email)' ? email : userId;
  // lookupId = "dwoodson92@gmail.com"
  
  conversations = await readConversations(lookupId);
  // Passes email to readConversations()
});
```

**Status**: ✅ API receives email and passes to `readConversations()`

### ✅ 3. Backend Conversation Reader

**File**: `vvaultConnector/readConversations.js`

```javascript
async function readConversations(userId, constructId = '') {
  // userId = "dwoodson92@gmail.com"
  
  const constructRecords = await readConstructTranscripts(searchUserId, constructId);
  // Calls readConstructTranscripts() with email
}
```

**Status**: ✅ Passes email to `readConstructTranscripts()`

### ✅ 4. User Matching Logic

**File**: `vvaultConnector/readConversations.js`

```javascript
async function userMatchesRequest(userPath, directoryName, requestedUserId) {
  // userPath = "/vvault/users/shard_0000/devon_woodson_1762969514958"
  // directoryName = "devon_woodson_1762969514958"
  // requestedUserId = "dwoodson92@gmail.com"
  
  // Reads profile.json
  const profile = JSON.parse(profileContent);
  // profile.email = "dwoodson92@gmail.com"
  
  const emailMatch = profile.email === requestedUserId ||
    profile.email?.toLowerCase() === requestedUserId?.toLowerCase();
  // emailMatch = true ✅
  
  return emailMatch || userIdMatch || emailUsernameMatch;
}
```

**Status**: ✅ Matches by email from profile.json

**Fixes Implemented:**

1. **Added `constructId` to Conversation Objects**
   - Modified `parseConstructFile()` to extract and include `constructId`
   - Frontend filtering requires this field

2. **Enhanced User ID Resolution Logging**
   - Added detailed logging in `userMatchesRequest()`
   - Shows profile path, data, and match type
   - Makes diagnosis easier

3. **Updated Frontend Filtering**
   - Added direct `constructId` check in conversation filtering
   - Most reliable matching method

4. **Improved Error Messages**
   - Added VVAULT_ROOT existence check
   - Added conversation object logging with constructId
   - Enhanced profile matching error messages

---

### Issue 3: Conversation Loading Bug (0 Messages)

**Symptoms:**
- Conversation found but `messageCount: 0`
- UI shows "No messages yet"
- File exists and has content

**Root Causes:**
1. Role detection bug in markdown parser
2. Timeout race condition
3. Messages array empty after parsing
4. Session ID mismatch

**Debugging Steps:**

1. **Check File Content**
   ```bash
   cat /Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/devon_woodson_1762969514958/constructs/synth-001/chatty/chat_with_synth-001.md
   ```

2. **Verify Parser**
   - Check if markdown parser correctly identifies "You said:" and "Synth said:" patterns
   - Verify timestamp parsing
   - Check role assignment logic

3. **Check Console Logs**
   Look for:
   ```
   ✅ Loaded 1 conversations from VVAULT
   🔍 First thread details: {id: 'synth-001', title: 'Chat with Synth', messageCount: 0}
   ⚠️ [Layout.tsx] VVAULT loading timeout
   ```

**Fixes:**
- Enhanced markdown parser to handle multiple message formats
- Added `safeParseTimestamp` helper for timestamp normalization
- Improved role detection for "You said / Synth said" patterns
- Fixed timeout race conditions

---

## File Structure Reference

### Expected File Locations

**User Profile:**
```
/vvault/users/shard_0000/{user_id}/identity/profile.json
```

**Conversation Files:**
```
/vvault/users/shard_0000/{user_id}/constructs/{construct}-{callsign}/chatty/chat_with_{construct}-{callsign}.md
```

**Example:**
```
/vvault/users/shard_0000/devon_woodson_1762969514958/constructs/synth-001/chatty/chat_with_synth-001.md
```

### Profile.json Format

```json
{
  "user_id": "devon_woodson_1762969514958",
  "user_name": "Devon Woodson",
  "email": "dwoodson92@gmail.com",
  "constructs": ["synth-001", "lin-001"]
}
```

### Conversation File Format

```markdown
# Chat with Synth

**Created**: November 9, 2025  
**Session ID**: synth_1762641178579  
**Construct**: Synth

---

You said:
Synth!

Synth said:
"Hey there! How can I help you today?"
```

---

## User ID Resolution

### ID Types

- **Chatty User ID**: MongoDB ObjectId (e.g., `690ec2d8c980c59365f284f5`)
- **VVAULT User ID**: LIFE format (e.g., `devon_woodson_1762969514958`)
- **Email**: User email (e.g., `dwoodson92@gmail.com`)

### Resolution Logic

1. **Primary**: Match by email from `profile.json`
2. **Fallback**: Match by VVAULT user ID (LIFE format)
3. **Fallback**: Match by email username

**Files:**
- `vvaultConnector/readConversations.js` - User matching logic
- `vvaultConnector/writeTranscript.js` - User ID resolution

---

## Quick Fixes

### Fix 1: Create Missing Profile.json

```bash
mkdir -p /Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/{user_id}/identity
cat > /Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/{user_id}/identity/profile.json << EOF
{
  "user_id": "{user_id}",
  "email": "{email}",
  "name": "{name}",
  "created_at": "2025-11-09T14:53:00Z",
  "status": "active"
}
EOF
```

### Fix 2: Verify VVAULT_ROOT Path

Check `vvaultConnector/config.js`:
```javascript
const DEFAULT_VVAULT_ROOT = '/Users/devonwoodson/Documents/GitHub/vvault';
```

Ensure:
- Path is absolute (not relative)
- Case-sensitive: `vvault` (lowercase) not `VVAULT`
- Directory exists and is readable

### Fix 3: Check Module Loading

Test in browser console or via debug endpoint:
```javascript
// Should return true
fetch('/api/vvault/debug/test-modules')
  .then(r => r.json())
  .then(console.log);
```

---

## Expected Behavior

### Backend Logs (Success)

```
✅ [VVAULT API] VVAULT modules loaded successfully
📚 [VVAULT API] VVAULT_ROOT = /Users/devonwoodson/Documents/GitHub/vvault
🔍 [VVAULT API] Calling readConversations with lookupId: dwoodson92@gmail.com
📥 [VVAULT API] readConversations returned X conversations
```

### Frontend (Success)

- Conversations load from VVAULT
- Display in sidebar
- Route to Home.tsx on fresh login
- Show markdown file content (no duplicate greetings)

---

## Related Documentation

- `VVAULT_CONVERSATION_STORAGE_ANALYSIS.md` - Comprehensive storage analysis
- `VVAULT_IMPORT_FILE_STRUCTURE.md` - File structure for imports
- `INVESTIGATE_CHATTY_VVAULT_FILEBASE_INTEGRATION.md` - Integration details

