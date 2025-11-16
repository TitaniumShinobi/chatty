# User Registry Enforcement Rubric
## Complete User Separation Throughout Development

**Last Updated**: November 14, 2025  
**Status**: CRITICAL - Must be enforced before production

---

## 🎯 **Core Principle**

**Every conversation read/write operation MUST verify user identity and enforce strict user isolation. No fallback searches that break user boundaries.**

---

## 📋 **User Registry Requirements**

### 1. **User ID Resolution (MANDATORY)**

#### **Before ANY VVAULT Operation:**
1. ✅ **Resolve user ID to VVAULT LIFE format** (e.g., `devon_woodson_1762969514958`)
2. ✅ **Verify user exists in VVAULT** via `identity/profile.json`
3. ✅ **NO FALLBACKS** - If user ID cannot be resolved, operation MUST fail with clear error
4. ✅ **NO "search all users"** - This breaks user isolation

#### **User ID Resolution Flow:**
```
Chatty User ID (email/MongoDB ObjectId)
    ↓
resolveVVAULTUserId() → VVAULT LIFE format
    ↓
Verify profile.json exists
    ↓
If NOT found → ERROR (do not proceed)
    ↓
If found → Proceed with operation
```

#### **Implementation Locations:**
- `chatty/vvaultConnector/writeTranscript.js` - ✅ Already enforces userId requirement
- `chatty/vvaultConnector/readConversations.js` - ❌ **MUST REMOVE fallback searches**
- `chatty/server/routes/vvault.js` - ❌ **MUST REMOVE fallback searches**

---

### 2. **Conversation Source Enforcement**

#### **Where Conversations Are Read From:**
```
/vvault/users/{shard}/{user_id}/instances/{construct}-{callsign}/chatty/chat_with_{construct}-{callsign}.md
```

#### **MANDATORY Checks Before Reading:**
1. ✅ **User ID must be resolved** (no email/MongoDB ObjectId in path)
2. ✅ **Shard must be calculated** from user ID (currently `shard_0000` for dev)
3. ✅ **User directory must exist** (`users/{shard}/{user_id}/`)
4. ✅ **Profile.json must exist** (`users/{shard}/{user_id}/identity/profile.json`)
5. ✅ **Only read from user's own directory** (no cross-user reads)

#### **Conversation Filtering:**
- ✅ **Filter by userId** in file header/metadata
- ✅ **Filter out deleted conversations** (check for `CONVERSATION_DELETED` marker)
- ✅ **Filter by constructId** (runtime selection)
- ❌ **DO NOT** read from other users' directories

---

### 3. **Conversation Creation Enforcement**

#### **Before Creating ANY Conversation:**
1. ✅ **User ID must be resolved** to VVAULT LIFE format
2. ✅ **Check if conversation already exists** (by sessionId)
3. ✅ **Check if conversation was deleted** (look for deletion marker)
4. ✅ **Only create in user's own directory** (`users/{shard}/{user_id}/instances/`)

#### **Synth Conversation Creation Rules:**
- ✅ **ONLY create if:**
  - No conversations exist for user
  - AND no deletion marker exists for `synth-001`
  - AND user is authenticated
- ❌ **DO NOT create if:**
  - User deleted all conversations intentionally
  - Deletion marker exists
  - User directory doesn't exist

---

### 4. **User Registry File Structure**

#### **Required Files:**
```
/vvault/users/{shard}/{user_id}/identity/profile.json
```

#### **Profile.json Schema:**
```json
{
  "user_id": "devon_woodson_1762969514958",
  "email": "devon@thewreck.org",
  "name": "Devon Woodson",
  "created_at": "2025-11-09T14:53:00Z",
  "last_seen": "2025-11-14T22:38:00Z",
  "status": "active",
  "constructs": ["synth-001", "chatgpt-devon-001"]
}
```

#### **Registry Enforcement:**
- ✅ **Every user MUST have profile.json** before any operations
- ✅ **Profile.json MUST contain email** for user matching
- ✅ **Profile.json MUST contain user_id** in LIFE format
- ❌ **Operations MUST fail** if profile.json is missing

---

### 5. **Code Enforcement Points**

#### **MUST FIX (Critical):**

1. **`chatty/vvaultConnector/readConversations.js`**:
   - ❌ **REMOVE** fallback search that scans all users (lines 33-47)
   - ✅ **ENFORCE** user ID resolution before reading
   - ✅ **FILTER** deleted conversations (check for `CONVERSATION_DELETED` in messages)

2. **`chatty/server/routes/vvault.js`**:
   - ❌ **REMOVE** fallback search in `GET /conversations` (lines 66-75)
   - ✅ **ENFORCE** user ID resolution before API calls
   - ✅ **RETURN ERROR** if user ID cannot be resolved

3. **`chatty/src/components/Layout.tsx`**:
   - ❌ **FIX** conversation creation logic (line 701)
   - ✅ **CHECK** for deletion markers before creating Synth
   - ✅ **VERIFY** user ID is resolved before creating conversations

4. **`chatty/vvaultConnector/writeTranscript.js`**:
   - ✅ **ALREADY ENFORCES** userId requirement (line 100-114)
   - ✅ **ALREADY RESOLVES** user ID to VVAULT format
   - ✅ **KEEP** this enforcement

---

### 6. **Deleted Conversation Handling**

#### **Deletion Marker Format:**
```
CONVERSATION_DELETED:{timestamp}
```

#### **Filtering Rules:**
- ✅ **Check last message** for deletion marker
- ✅ **Exclude from conversation list** if deleted
- ✅ **Prevent recreation** if deletion marker exists
- ✅ **Respect user intent** - if deleted, don't auto-create

#### **Implementation:**
```javascript
function isConversationDeleted(messages) {
  if (!messages || messages.length === 0) return false;
  const lastMessage = messages[messages.length - 1];
  return lastMessage.role === 'system' && 
         lastMessage.content?.startsWith('CONVERSATION_DELETED:');
}
```

---

### 7. **Testing Requirements**

#### **Must Test:**
1. ✅ **User A cannot read User B's conversations**
2. ✅ **User ID resolution fails gracefully** (no fallback searches)
3. ✅ **Deleted conversations are not recreated**
4. ✅ **Conversations are only created in user's own directory**
5. ✅ **Profile.json is required** for all operations

---

## 🚨 **CRITICAL: No Fallback Searches**

**The following patterns are FORBIDDEN:**

```javascript
// ❌ FORBIDDEN: Fallback to search all users
try {
  conversations = await readConversations(userId);
} catch (error) {
  // ❌ DO NOT DO THIS
  conversations = await readConversations(null); // Searches all users
}

// ✅ CORRECT: Fail with clear error
try {
  const resolvedUserId = await resolveVVAULTUserId(userId, email);
  if (!resolvedUserId) {
    throw new Error(`User ${userId} not found in VVAULT registry`);
  }
  conversations = await readConversations(resolvedUserId);
} catch (error) {
  // Return error to user, do not search other users
  throw error;
}
```

---

## 📝 **Implementation Checklist**

- [ ] Remove fallback searches from `readConversations.js`
- [ ] Remove fallback searches from `vvault.js` API routes
- [ ] Add deletion marker filtering to conversation reading
- [ ] Fix conversation creation logic to check for deletions
- [ ] Enforce user ID resolution in all VVAULT operations
- [ ] Add profile.json verification before operations
- [ ] Test user isolation (User A cannot read User B)
- [ ] Test deleted conversation prevention
- [ ] Document user registry structure

---

## 🔗 **Related Rubrics**

- `VVAULT_FILE_STRUCTURE_SPEC.md` - File structure requirements
- `USER_REGISTRY_RUBRIC.md` - User registry architecture
- `SINGLETON_CONVERSATION_RUBRIC.md` - Conversation management
- `CHATTY_LOGIN_PROCESS_RUBRIC.md` - Login flow

---

**Status**: This rubric MUST be enforced before any production deployment. User isolation is a security requirement, not optional.

