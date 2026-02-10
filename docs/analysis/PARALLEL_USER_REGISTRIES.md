# Parallel User Registries: Chatty & VVAULT
## Separate but Complementary Database Systems

**Critical**: Chatty and VVAULT maintain **separate** user registries that **complement** each other. They are **NOT** required to have matching user IDs, but they should be able to link and unlink accounts flexibly.

## Key Principles

1. **Separate User IDs**: Chatty and VVAULT can have different user IDs for the same email
2. **Flexible Linking**: Users can disconnect one email and connect a different email to a different VVAULT database
3. **Multi-Platform Ready**: VVAULT databases are platform-agnostic (raw text → emotional scoring → conversational context)
4. **Complementary, Not Dependent**: Each system can operate independently but benefits from linking

---

## Current Architecture

### Chatty User Registry

**Storage**: MongoDB + File-based Registry (`users.json`)

**Location**: 
- MongoDB: `chatty/server/models/User.js`
- File Registry: `chatty/users.json`
- User Directories: `chatty/users/shard_0000/{userId}/`

**Structure**:
```
chatty/
├── users.json                    # File-based registry
├── users/
│   └── shard_0000/
│       └── {userId}/
│           └── identity/
│               └── profile.json
└── server/
    └── models/
        └── User.js              # MongoDB schema
```

**MongoDB Schema** (`chatty/server/models/User.js`):
```javascript
{
  uid: String,                    // Google sub (unique)
  name: String,                   // Full display name
  given_name: String,             // First name (from OAuth)
  family_name: String,            // Last name (from OAuth)
  email: String,                  // Email (indexed)
  picture: String,                // Profile picture URL
  locale: String,                 // Language/locale (e.g., "en-US")
  emailVerified: Boolean,         // Email verification status
  phoneE164: String,              // Phone number (optional)
  phoneVerifiedAt: Date,           // Phone verification timestamp
  provider: String,               // "google" | "email" | etc.
  tier: String,                   // "free" | "pro" | "enterprise"
  createdAt: Date
}
```

**File Registry** (`chatty/users.json`):
```json
{
  "users": {
    "{chatty_user_id}": {
      "user_id": "devon_woodson_1762969514958",  // Chatty user ID (LIFE format)
      "email": "dwoodson92@gmail.com",
      "name": "Devon Woodson",
      "created_at": "2025-11-24T08:11:39.864Z",
      "last_seen": "2025-11-24T12:00:00.000Z",
      "shard": "shard_0000",
      "vvault_linked": true,  // Optional - can be false
      "vvault_user_id": "devon_woodson_1762969514958"  // Optional - can be null
    }
  },
  "totalUsers": 1,
  "nextUserId": 2
}
```

**Key Points**:
- `vvault_user_id` is **optional** - can be `null` if not linked to VVAULT
- `vvault_linked` indicates if accounts are linked (can be `false`)
- Chatty user ID can be **different** from VVAULT user ID

**User Directory Structure** (`chatty/users/shard_0000/{userId}/`):
```
chatty/users/shard_0000/{userId}/
├── identity/
│   └── profile.json             # User profile (matches registry)
└── [future: conversations, gpts, etc.]
```

---

### VVAULT User Registry

**Storage**: File-based only

**Location**:
- User Directories: `vvault/users/shard_0000/{vvault_user_id}/`
- Profile: `vvault/users/shard_0000/{vvault_user_id}/identity/profile.json`

**Structure**:
```
vvault/
└── users/
    └── shard_0000/
        └── {vvault_user_id}/     # e.g., "devon_woodson_1762969514958"
            ├── identity/
            │   └── profile.json  # VVAULT profile
            ├── instances/
            │   └── {constructCallsign}/
            │       ├── {constructCallsign}.capsule
            │       ├── personality.json
            │       └── memory/
            └── capsules/         # Legacy location (being migrated)
```

**VVAULT Profile** (`vvault/users/shard_0000/{vvault_user_id}/identity/profile.json`):
```json
{
  "user_id": "devon_woodson_1762969514958",
  "chatty_user_id": "109043688581425242997",
  "email": "dwoodson92@gmail.com",
  "name": "Devon Woodson",
  "given_name": "Devon",
  "family_name": "Woodson",
  "locale": "en-US",
  "created_at": "2025-11-24T08:11:39.864Z",
  "source": "chatty_auto_creation"
}
```

---

## Separate but Complementary Structure

### 1. **User ID Generation**

**Chatty User ID**:
- Format: LIFE format `{name}_{timestamp}` (e.g., `devon_woodson_1762969514958`)
- Generated: On first login via OAuth
- Storage: `chatty/users.json` + MongoDB
- Purpose: Chatty-specific user identification

**VVAULT User ID**:
- Format: LIFE format `{name}_{timestamp}` (e.g., `devon_woodson_1762969514958`)
- Generated: `Date.now()` timestamp (milliseconds since Unix epoch)
- **NOT hash-based** - uses actual timestamp when profile is created
- Example: `1762969514958` = November 12, 2025, 12:45:14 PM EST
- Storage: `vvault/users/shard_0000/{vvault_user_id}/identity/profile.json`
- Purpose: VVAULT-specific user identification (platform-agnostic)

**Key Point**: User IDs can be **different** between Chatty and VVAULT. They are linked via email mapping, not ID matching.

### 2. **Flexible Account Linking**

**Linking Mechanism**:
- Chatty Registry: `vvault_user_id` field (optional, can be null)
- VVAULT Profile: `chatty_user_id` field (optional, can be null)
- Primary Link: Email address (can change)

**Disconnect/Reconnect Flow**:
1. User disconnects email from Chatty → `vvault_user_id` set to `null`
2. User connects different email → Links to different VVAULT database
3. VVAULT can host accounts independently (no Chatty required)
4. Chatty can operate without VVAULT (no VVAULT required)

**Multi-Platform Support**:
- VVAULT databases are platform-agnostic
- Raw text → emotional scoring → conversational context
- Can be used by Chatty, ChatGPT, Claude, or any platform
- Platform-specific data stored separately from VVAULT

### 3. **Shard Structure**

Both registries use **identical sharding** (for consistency):
- Shard ID: `shard_0000` (for now, sequential sharding)
- Path: `{registry}/users/shard_0000/{user_id}/`
- **Note**: Sharding is independent - Chatty shard doesn't need to match VVAULT shard

### 4. **Profile Synchronization (Optional)**

**OAuth Data Flow** (when linked):
```
Google OAuth → Chatty MongoDB → Chatty Registry → (optional) VVAULT Profile
```

**Synchronization Points** (optional, not required):
1. **On Login**: OAuth data → Chatty MongoDB → Chatty Registry → (if linked) VVAULT Profile
2. **On Profile Update**: Chatty MongoDB → Chatty Registry → (if linked) VVAULT Profile
3. **On VVAULT Access**: VVAULT Profile → (if linked) Chatty Registry

**Key Point**: Synchronization is **optional**. VVAULT can operate independently without Chatty.

### 5. **Directory Structure (Independent)**

**Chatty** (Chatty-specific data):
```
chatty/users/shard_0000/{chatty_user_id}/
├── identity/
│   └── profile.json          # Chatty profile (OAuth data)
├── prompts/
│   └── customAI/             # Chatty-specific prompts
└── [future: conversations, gpts, etc.]
```

**VVAULT** (Platform-agnostic data):
```
vvault/users/shard_0000/{vvault_user_id}/
├── identity/
│   └── profile.json          # VVAULT profile (can link to Chatty)
├── instances/
│   └── {constructCallsign}/  # Platform-agnostic constructs
│       ├── chatty/           # Chatty-specific data
│       ├── chatgpt/          # ChatGPT-specific data
│       └── claude/           # Claude-specific data
└── capsules/                 # Platform-agnostic capsules
```

**Key**: 
- Both use `identity/profile.json` for profile data
- VVAULT stores platform-specific data in subdirectories (`chatty/`, `chatgpt/`, etc.)
- Chatty stores Chatty-specific data in its own directory structure
- They are **complementary**, not identical

---

## Implementation Details

### User Creation Flow

**Step 1: OAuth Login** (`chatty/server/server.js`)
```javascript
// Google OAuth callback
const user = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", ...);
const profile = {
  sub: user.sub,
  name: user.name,
  email: user.email,
  given_name: user.given_name,
  family_name: user.family_name,
  locale: user.locale
};

// Step 2: Save to MongoDB
const doc = await Store.upsertUser({ ...profile });

// Step 3: Register in Chatty Registry
const { getOrCreateUser } = await import('./lib/userRegistry.js');
await getOrCreateUser(userId, profile.email, profile.name);

// Step 4: Create VVAULT Profile (via writeTranscript.js)
const { resolveVVAULTUserId } = require('../../vvaultConnector/writeTranscript.js');
const vvaultUserId = await resolveVVAULTUserId(userId, profile.email, true, profile.name);
```

**Step 2: Chatty Registry** (`chatty/server/lib/userRegistry.js`)
```javascript
// Creates: chatty/users/shard_0000/{userId}/identity/profile.json
// Updates: chatty/users.json registry
```

**Step 3: VVAULT Profile** (`chatty/vvaultConnector/writeTranscript.js`)
```javascript
// Creates: vvault/users/shard_0000/{vvault_user_id}/identity/profile.json
// Links: chatty_user_id ↔ vvault_user_id
```

### User Lookup Flow

**From Chatty User ID → VVAULT User ID**:
```javascript
// 1. Check Chatty Registry
const registry = await loadRegistry();
const chattyUser = registry.users[chattyUserId];
const vvaultUserId = chattyUser?.vvault_user_id;

// 2. If not found, resolve via VVAULT
if (!vvaultUserId) {
  const { resolveVVAULTUserId } = require('../../vvaultConnector/writeTranscript.js');
  const vvaultUserId = await resolveVVAULTUserId(chattyUserId, email, true, name);
  // Update registry with vvault_user_id
}
```

**From VVAULT User ID → Chatty User ID**:
```javascript
// Read VVAULT profile
const profile = await fs.readFile(
  `vvault/users/shard_0000/${vvaultUserId}/identity/profile.json`,
  'utf8'
);
const chattyUserId = JSON.parse(profile).chatty_user_id;
```

---

## Data Synchronization

### Fields to Keep in Sync

| Field | Chatty MongoDB | Chatty Registry | VVAULT Profile |
|-------|---------------|-----------------|----------------|
| `name` | ✅ | ✅ | ✅ |
| `email` | ✅ | ✅ | ✅ |
| `given_name` | ✅ | ⚠️ | ✅ |
| `family_name` | ✅ | ⚠️ | ✅ |
| `locale` | ✅ | ⚠️ | ✅ |
| `picture` | ✅ | ❌ | ❌ |
| `chatty_user_id` | N/A | ✅ | ✅ |
| `vvault_user_id` | ❌ | ✅ | ✅ |

**Legend**:
- ✅ = Stored
- ⚠️ = Should be stored but may be missing
- ❌ = Not stored

### Synchronization Rules

1. **OAuth Login**: All fields sync from OAuth → MongoDB → Registry → VVAULT
2. **Profile Update**: Update MongoDB → Update Registry → Update VVAULT
3. **VVAULT Access**: If VVAULT profile exists but Registry missing, create Registry entry

---

## API Endpoints

### Chatty User APIs

**`GET /api/me`** - Get current user (from JWT)
```json
{
  "ok": true,
  "user": {
    "id": "109043688581425242997",
    "uid": "109043688581425242997",
    "name": "Devon Woodson",
    "email": "dwoodson92@gmail.com",
    "given_name": "Devon",
    "family_name": "Woodson",
    "locale": "en-US",
    "picture": "https://..."
  }
}
```

### VVAULT User APIs

**`GET /api/vvault/profile`** - Get user profile (OAuth + VVAULT merged)
```json
{
  "ok": true,
  "profile": {
    "name": "Devon Woodson",
    "email": "dwoodson92@gmail.com",
    "given_name": "Devon",
    "family_name": "Woodson",
    "locale": "en-US",
    "picture": "https://...",
    "vvault_user_id": "devon_woodson_1762969514958",
    "vvault_linked": true
  }
}
```

---

## Maintenance & Validation

### Validation Script

Create `chatty/scripts/validate-user-registries.js`:
```javascript
// Validates:
// 1. All Chatty users have VVAULT profiles
// 2. All VVAULT profiles have Chatty users
// 3. ID mappings are consistent
// 4. Profile data matches
```

### Migration Script

Create `chatty/scripts/sync-user-registries.js`:
```javascript
// Syncs:
// 1. Missing VVAULT profiles from Chatty users
// 2. Missing Chatty registry entries from VVAULT profiles
// 3. Updates mismatched profile data
```

---

## Documentation Requirements

### Required Documentation

1. **`chatty/docs/USER_REGISTRY_STRUCTURE.md`** ✅ (this file)
   - Chatty user registry structure
   - MongoDB schema
   - File registry format
   - Directory structure

2. **`vvault/docs/USER_REGISTRY_STRUCTURE.md`** (to be created)
   - VVAULT user registry structure
   - Profile format
   - Directory structure
   - ID mapping

3. **`chatty/docs/USER_ID_MAPPING.md`** (to be created)
   - Chatty User ID ↔ VVAULT User ID mapping
   - Lookup functions
   - Synchronization rules

### Documentation Standards

- **Structure Diagrams**: ASCII art showing directory trees
- **Schema Definitions**: JSON schemas for all data structures
- **API Documentation**: Endpoint descriptions with examples
- **Flow Diagrams**: User creation, lookup, synchronization flows

---

## Current Issues & Fixes

### Issue 1: Lin Not Recognizing User ❌

**Problem**: Lin says "I don't have any personal information about you yet"

**Root Cause**: 
- `/api/vvault/profile` endpoint didn't exist
- Lin was trying to load user profile but endpoint was missing

**Fix**:
- ✅ Created `/api/vvault/profile` endpoint
- ✅ Updated Lin to use `/api/me` for OAuth data
- ✅ Merged OAuth + VVAULT profile data

### Issue 2: Chatty User Directory Empty ⚠️

**Problem**: `chatty/users/shard_0000/` is empty

**Root Cause**:
- User registry uses `users.json` file, not directory structure
- Directory structure not being created

**Fix Needed**:
- Ensure `getOrCreateUser` creates directory structure
- Verify `ensureUserDirectory` is being called

### Issue 3: Missing Fields in Registry ⚠️

**Problem**: `given_name`, `family_name`, `locale` not in Chatty registry

**Fix Needed**:
- Update `getOrCreateUser` to accept and store these fields
- Update registry schema to include OAuth fields

---

## Next Steps

1. ✅ **Fix Lin User Recognition** - Use `/api/me` for OAuth data
2. ⚠️ **Create VVAULT Profile Endpoint** - `/api/vvault/profile`
3. ⚠️ **Validate User Directory Creation** - Ensure Chatty creates directories
4. ⚠️ **Sync OAuth Fields** - Add `given_name`, `family_name`, `locale` to registry
5. ⚠️ **Create Validation Script** - Check registry consistency
6. ⚠️ **Create Documentation** - VVAULT user registry structure docs

---

## Testing Checklist

- [ ] OAuth login creates Chatty MongoDB user
- [ ] OAuth login creates Chatty registry entry
- [ ] OAuth login creates VVAULT profile
- [ ] User ID mapping is consistent (Chatty ↔ VVAULT)
- [ ] Profile data matches across registries
- [ ] Lin can recognize user from `/api/me`
- [ ] Lin can recognize user from `/api/vvault/profile`
- [ ] User directories exist in both Chatty and VVAULT
- [ ] Profile files exist in both registries

---

## Conclusion

**Chatty and VVAULT maintain separate but complementary user registries:**

### Separate (Independent)
- ✅ **Different user IDs allowed** - Chatty and VVAULT can have different IDs for same email
- ✅ **Independent operation** - Each can function without the other
- ✅ **Flexible linking** - Users can disconnect/reconnect emails to different VVAULT databases
- ✅ **Multi-platform ready** - VVAULT supports Chatty, ChatGPT, Claude, etc.

### Complementary (When Linked)
- ✅ Consistent sharding (`shard_0000`) for organization
- ✅ Parallel directory structures for consistency
- ✅ Optional bidirectional ID mapping (`chatty_user_id` ↔ `vvault_user_id`)
- ✅ Optional synchronized profile data (when linked)
- ✅ Email-based linking (primary identifier)

**This ensures:**
- Lin can recognize users (via email or linked ID)
- User data can be consistent (when linked) or independent (when not linked)
- No structural deviation (same directory patterns)
- Easy debugging and maintenance
- Platform flexibility (VVAULT works with any platform)

