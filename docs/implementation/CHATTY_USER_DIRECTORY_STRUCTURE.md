# Chatty User Directory Structure
## What Gets Stored in Chatty User Folders

**Location**: `chatty/users/shard_0000/{userId}/`

---

## Directory Structure

When a user is created via `getOrCreateUser()` in `chatty/server/lib/userRegistry.js`, the following directory structure is created:

```
chatty/users/shard_0000/{userId}/
├── identity/
│   └── profile.json              # User profile (OAuth data + registry info)
├── prompts/
│   └── customAI/                 # Custom AI prompts/personas (migrated from global)
├── preferences/                  # User preferences (future use)
└── cache/                        # Caching directory (future use)
```

---

## What Gets Stored

### 1. **`identity/profile.json`** ✅ (Currently Implemented)

**Created by**: `getOrCreateUser()` in `userRegistry.js`

**Content**:
```json
{
  "user_id": "109043688581425242997",
  "email": "dwoodson92@gmail.com",
  "name": "Devon Woodson",
  "created_at": "2025-11-24T08:11:39.864Z",
  "last_seen": "2025-11-24T12:00:00.000Z",
  "shard": "shard_0000",
  "vvault_linked": true,
  "vvault_user_id": "devon_woodson_1762969514958"
}
```

**Purpose**:
- Stores user profile data from OAuth
- Links to VVAULT user ID
- Tracks last seen timestamp
- Matches `users.json` registry entry

**Updated by**:
- `updateUserProfile()` - Updates profile.json when user profile changes
- `getOrCreateUser()` - Creates on first login

---

### 2. **`prompts/customAI/`** ⚠️ (Partially Implemented)

**Created by**: `ensureUserDirectory()` in `shardManager.js`

**Purpose**:
- Store user's custom AI prompts/personas
- Migrated from global `prompts/customAI/` location
- User-specific AI configurations

**Migration**:
- `migratePersonaFilesForUser()` attempts to migrate persona files
- Non-critical if migration fails (will happen on next access)

**Current Status**: Directory created, but migration may not be complete

---

### 3. **`preferences/`** 📋 (Future Use)

**Created by**: `ensureUserDirectory()` in `shardManager.js`

**Purpose**:
- Store user preferences
- UI settings
- Feature flags
- Customizations

**Current Status**: Directory created, but not yet used

**Planned Contents**:
- `settings.json` - User settings
- `ui-preferences.json` - UI customizations
- `feature-flags.json` - Feature enablement

---

### 4. **`cache/`** 💾 (Future Use)

**Created by**: `ensureUserDirectory()` in `shardManager.js`

**Purpose**:
- Cache user-specific data
- Temporary files
- Performance optimization

**Current Status**: Directory created, but not yet used

**Planned Contents**:
- Model responses cache
- Search results cache
- Parsed file cache

---

## Comparison: Chatty vs VVAULT

### Chatty User Directory
```
chatty/users/shard_0000/{userId}/
├── identity/
│   └── profile.json              # OAuth + registry data
├── prompts/
│   └── customAI/                 # Custom AI prompts
├── preferences/                  # User preferences (future)
└── cache/                        # Caching (future)
```

### VVAULT User Directory
```
vvault/users/shard_0000/{vvault_user_id}/
├── identity/
│   └── profile.json              # VVAULT profile (links to Chatty)
├── instances/
│   └── {constructCallsign}/      # GPT instances
│       ├── {constructCallsign}.capsule
│       ├── personality.json
│       └── memory/               # ChromaDB memories
└── capsules/                      # Legacy capsules (being migrated)
```

**Key Differences**:
- **Chatty**: Focuses on user preferences, prompts, caching
- **VVAULT**: Focuses on GPT instances, capsules, memories, transcripts

**Parallel Structure**:
- Both use `identity/profile.json` for profile data
- Both use `shard_0000` for sharding
- Both link via `chatty_user_id` ↔ `vvault_user_id`

---

## Implementation Details

### Directory Creation

**Function**: `ensureUserDirectory(userId, shard)` in `shardManager.js`

**Creates**:
```javascript
await fs.mkdir(userDir, { recursive: true });
await fs.mkdir(path.join(userDir, 'identity'), { recursive: true });
await fs.mkdir(path.join(userDir, 'prompts', 'customAI'), { recursive: true });
await fs.mkdir(path.join(userDir, 'preferences'), { recursive: true });
await fs.mkdir(path.join(userDir, 'cache'), { recursive: true });
```

**Called by**:
- `getOrCreateUser()` - On user creation
- `updateUserProfile()` - If directory doesn't exist

### Profile Creation

**Function**: `getOrCreateUser()` in `userRegistry.js`

**Creates**: `identity/profile.json`

**Content**: User profile matching registry entry

**Updated by**: `updateUserProfile()` when user data changes

---

## Current Status

### ✅ Implemented
- `identity/profile.json` - User profile storage
- Directory structure creation
- Profile synchronization with registry

### ⚠️ Partially Implemented
- `prompts/customAI/` - Directory created, migration may be incomplete

### 📋 Planned (Not Yet Used)
- `preferences/` - User preferences storage
- `cache/` - Caching directory

---

## Future Additions

### Planned Directory Structure
```
chatty/users/shard_0000/{userId}/
├── identity/
│   └── profile.json              # ✅ Implemented
├── prompts/
│   └── customAI/                 # ⚠️ Partially implemented
├── preferences/                  # 📋 Planned
│   ├── settings.json
│   ├── ui-preferences.json
│   └── feature-flags.json
├── cache/                        # 📋 Planned
│   ├── responses/
│   ├── search/
│   └── parsed-files/
├── conversations/                # 📋 Planned (if not using MongoDB)
│   └── {conversationId}.json
└── gpts/                         # 📋 Planned (if not using MongoDB)
    └── {gptId}.json
```

---

## Summary

**Currently Stored in Chatty User Folders**:
1. ✅ **`identity/profile.json`** - User profile (OAuth data + registry info)
2. ⚠️ **`prompts/customAI/`** - Custom AI prompts (directory created, migration in progress)
3. 📋 **`preferences/`** - User preferences (directory created, not yet used)
4. 📋 **`cache/`** - Caching (directory created, not yet used)

**Key Point**: The directory structure is created upfront, but only `identity/profile.json` is currently populated. Other directories are prepared for future use.

