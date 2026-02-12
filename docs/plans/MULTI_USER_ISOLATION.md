# Plan: Multi-User Isolation — "Chatty is for a Billion Users"

**Date:** 2026-02-12
**Status:** PLAN
**Priority:** Critical — Security & Privacy Foundation

## Overview

Chatty must support unlimited independent users, each with their own isolated workspace. No user should ever see another user's constructs, conversations, or data. Every new signup gets a fresh Zen and Lin with no custom GPTs, no VVAULT connection, and no pre-existing data.

## Current State — What's Broken

### 1. Hardcoded Development Auth
**File:** `server/middleware/auth.js`

```javascript
if (process.env.NODE_ENV === 'development' || !process.env.JWT_SECRET) {
  req.user = {
    id: 'devon_woodson_1762969514958',
    email: 'dwoodson92@gmail.com',
    name: 'Devon Woodson',
    sub: 'hardcoded_dev_user',
    ...
  };
  return next();
}
```

**Impact:** Every visitor — regardless of whether they log in — is treated as Devon Woodson. All API calls return Devon's constructs, conversations, and data.

### 2. Login Page Bypasses Auth
The login page exists (`src/App.tsx`) with Google, Microsoft, Apple, GitHub, and email/password options, but in development mode (or when `JWT_SECRET` is not set), the auth middleware skips all verification and returns the hardcoded user.

### 3. Inconsistent Per-User Data Scoping
User scoping already exists in several places (e.g., `server/routes/ais.js` passes userId to `aiManager.getAllAIs()`), but because auth is hardcoded, every query resolves to Devon's user ID. The scoping itself needs auditing for consistency — some routes and libs may scope correctly while others may not. Specific areas to audit:

**Already scoped (confirmed):**
- `server/routes/ais.js` — resolves and passes userId to AI queries
- `server/routes/gpts.js` — uses userId for GPT queries
- Supabase `vault_files` queries in `readConversations` — filters by user email

**Needs audit (unconfirmed):**
- `server/lib/memoryContextBuilder.js` — does it pass userId to all Supabase calls?
- `server/lib/verifiedMemoryLoader.js` — transcript discovery scoping
- `server/lib/continuityParser.js` — ledger storage/retrieval scoping
- `server/lib/masterScriptsBridge.js` — needle anchor loading scoping
- `server/routes/vvault.js` — all message/conversation endpoints
- `server/routes/search.js` — search result scoping

### 4. No New User Provisioning
When a new user signs up, there's no automated flow to:
- Create their Zen and Lin constructs
- Scaffold their Supabase `vault_files` directory structure
- Initialize their autonomy stack
- Set up their default sidebar navigation

### 5. Shared In-Memory State
`masterScriptsBridge.js` stores construct state in a global `Map`. If two users are on the same server, their construct states could collide if callsigns overlap (e.g., both have `zen-001`).

## Target Architecture

### Core Principle: Complete User Isolation

```
User A (Alice)                     User B (Bob)
├── zen-001 (Alice's Zen)          ├── zen-001 (Bob's Zen)
├── lin-001 (Alice's Lin)          ├── lin-001 (Bob's Lin)
├── katana-001 (Alice's GPT)       ├── (no custom GPTs yet)
├── Conversations (Alice only)     ├── Conversations (Bob only)
├── vault_files scoped to Alice    ├── vault_files scoped to Bob
└── Autonomy stack (Alice's)       └── Autonomy stack (Bob's)
```

Even though both have `zen-001`, they are completely separate entities with different identities, memories, and conversation histories.

## Implementation Plan

### Phase 1: Fix Authentication (Remove Hardcoded Dev User)

#### Step 1A: Environment-Aware Auth Middleware
Replace the hardcoded bypass with proper authentication:

```javascript
export function requireAuth(req, res, next) {
  // Production: always require real auth
  // Development: allow real auth OR a dev login flow (not hardcoded)
  
  const cookieName = process.env.COOKIE_NAME || "sid";
  const raw = req.cookies?.[cookieName];
  
  if (!raw) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }
}
```

#### Step 1B: Dev Login Flow (Not Hardcoded)
For development, instead of hardcoding Devon's account, provide a dev login page that:
- Allows typing any email/name to simulate different users
- Creates a real JWT token for that session
- Stores it in a cookie like production would
- This allows testing multi-user scenarios locally

#### Step 1C: Ensure JWT_SECRET is Set
- Set `JWT_SECRET` as an environment variable in both development and production
- The auth middleware should never fall back to hardcoded user

### Phase 2: New User Provisioning

#### Step 2A: User Registration Flow
When a new user signs up (via any auth provider):

```
New User Registers
│
├─→ 1. Create user record in database
│     ├── Unique user ID (UUID)
│     ├── Email, name, avatar from auth provider
│     └── Account creation timestamp
│
├─→ 2. Provision default constructs
│     ├── Create Zen (zen-001) GPT record scoped to this user
│     ├── Create Lin (lin-001) GPT record scoped to this user
│     ├── Set default instructions/personality from seed templates
│     └── Generate default avatars
│
├─→ 3. Scaffold Supabase vault_files
│     ├── instances/zen-001/identity/prompt.txt (from template)
│     ├── instances/zen-001/identity/conditioning.txt (from template)
│     ├── instances/zen-001/chatty/ (empty)
│     ├── instances/lin-001/identity/prompt.txt (from template)
│     ├── instances/lin-001/identity/conditioning.txt (from template)
│     └── instances/lin-001/chatty/ (empty)
│
├─→ 4. Bootstrap autonomy stack
│     POST /api/master/bootstrap with ["zen-001", "lin-001"]
│
└─→ 5. Redirect to /app with fresh canvas
      ├── Sidebar shows: Zen, Lin, VVAULT, simForge, Library, Finance
      ├── Address Book is empty (no custom GPTs yet)
      └── Chat opens to Zen with greeting
```

#### Step 2B: Seed Templates
Create reusable identity templates for default constructs:
- `server/seeds/zen-001/prompt.txt` — Base Zen personality
- `server/seeds/zen-001/conditioning.txt` — Zen behavioral directives
- `server/seeds/lin-001/prompt.txt` — Base Lin personality
- `server/seeds/lin-001/conditioning.txt` — Lin behavioral directives

These templates are copied into each new user's Supabase vault_files space on registration.

### Phase 3: Per-User Data Isolation

#### Step 3A: Supabase Query Scoping
Every Supabase query must include the user's ID as a filter:

```javascript
// WRONG (current in some places):
const { data } = await supabase
  .from('vault_files')
  .select('*')
  .ilike('filename', `instances/${callsign}/%`);

// RIGHT:
const { data } = await supabase
  .from('vault_files')
  .select('*')
  .eq('user_id', userId)  // ALWAYS scope to user
  .ilike('filename', `instances/${callsign}/%`);
```

#### Step 3B: Audit All Data Access Points
Files that need user-scoping audit:

| File | Data Accessed |
|------|--------------|
| `server/routes/vvault.js` | Conversations, messages, transcripts |
| `server/routes/ais.js` | GPT records, avatars, files |
| `server/routes/gpts.js` | GPT records, avatars, files |
| `server/lib/memoryContextBuilder.js` | Identity files, capsules, transcripts |
| `server/lib/verifiedMemoryLoader.js` | Transcript files for memory extraction |
| `server/lib/continuityParser.js` | Transcript files for ledger generation |
| `server/lib/masterScriptsBridge.js` | Needle anchor loading |
| `server/lib/capsuleIntegration.js` | Capsule files |

#### Step 3C: User-Scoped In-Memory State
The autonomy stack's in-memory state must be keyed by both userId AND constructId:

```javascript
// WRONG (current):
const stateKey = constructId; // "zen-001"

// RIGHT:
const stateKey = `${userId}:${constructId}`; // "user_abc:zen-001"
```

This prevents state collision when two users both have `zen-001`.

### Phase 4: Data Privacy Enforcement

#### Step 4A: Row-Level Security (RLS) in Supabase
Enable Supabase RLS policies on `vault_files`:

```sql
-- Users can only read their own files
CREATE POLICY "Users read own files" ON vault_files
  FOR SELECT USING (user_id = auth.uid());

-- Users can only write their own files  
CREATE POLICY "Users write own files" ON vault_files
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only update their own files
CREATE POLICY "Users update own files" ON vault_files
  FOR UPDATE USING (user_id = auth.uid());
```

Note: Since Chatty's backend uses the Supabase service key (which bypasses RLS), the application-level query scoping (Step 3A) is the primary defense. RLS provides a safety net.

#### Step 4B: API Endpoint Authorization
Every API endpoint must verify the requesting user owns the resource:

```javascript
router.get('/api/ais/:id', requireAuth, async (req, res) => {
  const ai = await aiManager.getAI(req.params.id);
  if (ai.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  // ... proceed
});
```

#### Step 4C: No Cross-User Data Leakage Points
Common leakage vectors to check:
- Search results must be scoped to the searching user
- Conversation lists must only show the logged-in user's conversations
- Address Book must only show the logged-in user's custom GPTs
- Bootstrap must only initialize the logged-in user's constructs
- Avatar endpoints must not serve other users' avatars without authorization

### Phase 5: VVAULT Connection Isolation

#### Step 5A: Per-User VVAULT Config
Each user's VVAULT connection (if any) is stored in their user profile:
- VVAULT URL
- VVAULT API key
- VVAULT user ID

New users have no VVAULT connection by default. They can optionally connect their own VVAULT instance.

#### Step 5B: No Shared VVAULT State
The current `VVAULT_URL` and `VVAULT_SERVICE_TOKEN` environment variables are global. For multi-user:
- Move VVAULT credentials to per-user storage
- Each user connects their own VVAULT (or uses Chatty standalone)
- Users without VVAULT get the full Chatty experience with Supabase-only storage

## Migration Path (Existing Data)

Devon's existing data needs to be associated with his real user account:
1. Create a proper user record for `dwoodson92@gmail.com`
2. Associate all existing `vault_files` records with this user's ID
3. Associate all existing GPT records with this user's ID
4. Remove the hardcoded dev user bypass
5. Verify Devon can log in via Google OAuth and see all his existing data

## Risks

| Risk | Mitigation |
|------|-----------|
| Breaking Devon's existing data during migration | Run migration in a transaction; backup first |
| Performance impact of user-scoped queries | Add database indexes on `user_id` columns |
| In-memory state size with many users | Implement LRU eviction for autonomy stack state |
| Callsign collisions across users | Callsigns are user-scoped, not global — same name is fine |
| VVAULT integration changes | Make VVAULT optional; Chatty works standalone |

## Files to Modify

| File | Change |
|------|--------|
| `server/middleware/auth.js` | Remove hardcoded dev user, require real auth |
| `server/server.js` | Add user provisioning on first login |
| `server/routes/ais.js` | Add user-scoping to all queries |
| `server/routes/gpts.js` | Add user-scoping to all queries |
| `server/routes/vvault.js` | Add user-scoping to all queries |
| `server/lib/memoryContextBuilder.js` | Pass userId to all Supabase calls |
| `server/lib/masterScriptsBridge.js` | Key state by userId:constructId |
| `server/lib/continuityParser.js` | Pass userId to Supabase calls |
| `server/lib/verifiedMemoryLoader.js` | Pass userId to Supabase calls |
| `src/App.tsx` | Ensure login page works for new users |
| `src/components/Layout.tsx` | Handle new user provisioning flow |
| `src/lib/auth.ts` | Ensure proper token handling |

## Success Criteria

1. A brand new user can sign up and immediately see a fresh workspace with Zen and Lin only
2. No trace of any other user's data appears in their workspace
3. The original user (Devon) can still log in and see all existing data
4. Two users with the same construct name (e.g., both create "Katana") have completely separate entities
5. Deleting a construct for one user does not affect any other user
6. VVAULT connection is per-user, not global
