# GPT Database Recovery and Troubleshooting Guide

**Last Updated**: November 21, 2025  
**Status**: Active - Reference for GPT data recovery and troubleshooting

---

## Overview

This guide covers how to diagnose, recover, and troubleshoot GPT data stored in Chatty's SQLite database (`chatty.db`). GPTs are recoverable as long as the data exists in the database - the frontend is just a view of the persistent data.

---

## Table of Contents

1. [Database Structure](#database-structure)
2. [Database Location](#database-location)
3. [User ID Resolution](#user-id-resolution)
4. [Common Issues and Fixes](#common-issues-and-fixes)
5. [Recovery Procedures](#recovery-procedures)
6. [Verification Steps](#verification-steps)
7. [Troubleshooting Checklist](#troubleshooting-checklist)

---

## Database Structure

### Database Schema

**Location**: `chatty/chatty.db` (SQLite database)

**Main Tables**:

#### `gpts` Table
```sql
CREATE TABLE gpts (
  id TEXT PRIMARY KEY,                    -- GPT ID (e.g., "gpt-katana-001")
  name TEXT NOT NULL,                     -- Display name (e.g., "Katana")
  description TEXT,                        -- GPT description
  instructions TEXT,                       -- System instructions
  conversation_starters TEXT,              -- JSON array of conversation starters
  avatar TEXT,                             -- Avatar URL or path
  capabilities TEXT,                        -- JSON object with capabilities
  construct_callsign TEXT,                 -- Construct callsign (e.g., "katana-001")
  model_id TEXT NOT NULL,                  -- Model identifier
  is_active INTEGER DEFAULT 0,            -- Active status (0 or 1)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT NOT NULL                    -- VVAULT user ID (LIFE format)
);
```

#### `gpt_files` Table
```sql
CREATE TABLE gpt_files (
  id TEXT PRIMARY KEY,
  gpt_id TEXT NOT NULL,                    -- Foreign key to gpts.id
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  content TEXT NOT NULL,                   -- Base64 encoded
  extracted_text TEXT,
  metadata TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (gpt_id) REFERENCES gpts (id) ON DELETE CASCADE
);
```

#### `gpt_actions` Table
```sql
CREATE TABLE gpt_actions (
  id TEXT PRIMARY KEY,
  gpt_id TEXT NOT NULL,                    -- Foreign key to gpts.id
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  headers TEXT,                            -- JSON object
  parameters TEXT,                         -- JSON object
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gpt_id) REFERENCES gpts (id) ON DELETE CASCADE
);
```

### Key Fields Explained

- **`id`**: Unique GPT identifier, format `gpt-{uuid}` or `gpt-{name}-{callsign}`
- **`construct_callsign`**: Human-readable construct identifier (e.g., `katana-001`, `luna-002`)
- **`user_id`**: Must be in VVAULT LIFE format (e.g., `devon_woodson_1762969514958`)
- **`conversation_starters`**: Must be valid JSON array (e.g., `["Hello", "How are you?"]`)
- **`capabilities`**: Must be valid JSON object (e.g., `{"webSearch":false,"codeInterpreter":true}`)

---

## Database Location

### Correct Location

**Project Root**: `chatty/chatty.db`

The database should be located at:
```
/Users/devonwoodson/Documents/GitHub/chatty/chatty.db
```

### Incorrect Locations

The database should **NOT** be in:
- `chatty/server/chatty.db` ❌
- `chatty/server/lib/chatty.db` ❌

### Path Resolution

**File**: `chatty/server/lib/gptManager.js`

The `GPTManager` constructor resolves the database path:
```javascript
// __dirname is /server/lib, so go up two levels to project root
const dbPath = path.join(__dirname, '..', '..', 'chatty.db');
const absoluteDbPath = path.resolve(dbPath);
```

### Verification

Check database location:
```bash
cd /Users/devonwoodson/Documents/GitHub/chatty
ls -la chatty.db
sqlite3 chatty.db "SELECT COUNT(*) FROM gpts;"
```

---

## User ID Resolution

### The Problem

Chatty uses multiple user ID formats:
1. **MongoDB ObjectId**: `690ec2d8c980c59365f284f5`
2. **Email**: `dwoodson92@gmail.com`
3. **VVAULT LIFE Format**: `devon_woodson_1762969514958` ✅ (Required for database)

### Resolution Flow

**Location**: `chatty/server/routes/gpts.js`

```javascript
// 1. Get user ID from request
const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email;

// 2. Resolve to VVAULT format
const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email);

// 3. Query database with VVAULT user ID
const gpts = await gptManager.getAllGPTs(vvaultUserId, chattyUserId);
```

### How `resolveVVAULTUserId` Works

**Location**: `chatty/vvaultConnector/writeTranscript 3.js`

1. Searches all shards: `users/shard_*/`
2. Reads `identity/profile.json` for each user
3. Matches by:
   - `profile.email === requestedEmail` (preferred)
   - `profile.user_id === chattyUserId`
4. Returns VVAULT user ID (LIFE format)

### Verification

Check if user ID resolution works:
```bash
cd /Users/devonwoodson/Documents/GitHub/vvault
cat users/shard_0000/devon_woodson_1762969514958/identity/profile.json | grep email
```

---

## Common Issues and Fixes

### Issue 1: GPTs Not Appearing on Frontend

**Symptoms**:
- Frontend shows "No GPTs yet"
- GPTs exist in database (verified via SQLite)
- Server logs show GPTs found but not returned

**Root Causes**:
1. **User ID Mismatch**: Database has VVAULT format, API query uses email/ObjectId
2. **Database Path Wrong**: Server using `chatty/server/chatty.db` instead of `chatty/chatty.db`
3. **JSON Parsing Error**: Invalid JSON in `conversation_starters` or `capabilities`

**Fix**:
1. Verify database path is correct (see [Database Location](#database-location))
2. Verify user ID resolution (see [User ID Resolution](#user-id-resolution))
3. Check for JSON parsing errors in server logs
4. Fix invalid JSON (see [Issue 2: JSON Parsing Errors](#issue-2-json-parsing-errors))

### Issue 2: JSON Parsing Errors

**Symptoms**:
- Server logs: `SyntaxError: Expected property name or '}' in JSON at position 1`
- GPTs found in database but not returned to frontend
- Error occurs in `gptManager.getAllGPTs()`

**Root Cause**:
- `conversation_starters` or `capabilities` stored as JavaScript object literal instead of valid JSON
- Example: `{webSearch:false}` instead of `{"webSearch":false}`

**Fix**:

1. **Identify Invalid JSON**:
```bash
cd /Users/devonwoodson/Documents/GitHub/chatty
sqlite3 chatty.db "SELECT id, name, capabilities FROM gpts WHERE name = 'Katana';"
```

2. **Fix Invalid JSON**:
```bash
sqlite3 chatty.db "UPDATE gpts SET capabilities = '{\"webSearch\":false,\"canvas\":false,\"imageGeneration\":false,\"codeInterpreter\":true}' WHERE id = 'gpt-katana-001';"
```

3. **Verify Fix**:
```bash
sqlite3 chatty.db "SELECT capabilities FROM gpts WHERE id = 'gpt-katana-001';" | python3 -m json.tool
```

**Prevention**:
- The `gptManager.js` now includes error handling with automatic JSON fixing
- Invalid JSON is logged and fixed automatically when possible

### Issue 3: Database Path Mismatch

**Symptoms**:
- Server logs: `⚠️ [GPTManager] Found database at wrong location`
- GPTs not found even though they exist
- Two database files exist: `chatty/chatty.db` and `chatty/server/chatty.db`

**Root Cause**:
- Database was created in wrong location (`chatty/server/chatty.db`)
- Server now correctly uses `chatty/chatty.db` (project root)

**Fix**:

1. **Check Both Databases**:
```bash
cd /Users/devonwoodson/Documents/GitHub/chatty
echo "=== Root DB ===" && sqlite3 chatty.db "SELECT COUNT(*) FROM gpts;"
echo "=== Server DB ===" && sqlite3 server/chatty.db "SELECT COUNT(*) FROM gpts;" 2>/dev/null || echo "No server DB"
```

2. **Migrate Data (if needed)**:
```bash
# Export from server DB
sqlite3 server/chatty.db ".dump gpts" > /tmp/gpts_dump.sql

# Import to root DB (if root DB is empty)
sqlite3 chatty.db < /tmp/gpts_dump.sql
```

3. **Remove Old Database** (after migration):
```bash
rm server/chatty.db
```

### Issue 4: Missing `construct_callsign`

**Symptoms**:
- GPTs created before `construct_callsign` column was added
- `construct_callsign` is `NULL` in database
- File paths may be incorrect

**Fix**:

1. **Check for Missing Callsigns**:
```bash
sqlite3 chatty.db "SELECT id, name, construct_callsign FROM gpts WHERE construct_callsign IS NULL;"
```

2. **Run Migration**:
```bash
# Via API endpoint
curl -X POST http://localhost:5173/api/gpts/migrate

# Or manually via SQL
sqlite3 chatty.db "UPDATE gpts SET construct_callsign = 'katana-001' WHERE name = 'Katana' AND construct_callsign IS NULL;"
```

---

## Recovery Procedures

### Procedure 1: Recover GPT from Database

**Scenario**: GPT exists in database but not showing on frontend

**Steps**:

1. **Verify GPT Exists**:
```bash
cd /Users/devonwoodson/Documents/GitHub/chatty
sqlite3 chatty.db "SELECT id, name, user_id, construct_callsign FROM gpts WHERE name = 'Katana';"
```

2. **Check User ID Format**:
```bash
# Should be VVAULT LIFE format (e.g., devon_woodson_1762969514958)
sqlite3 chatty.db "SELECT user_id FROM gpts WHERE name = 'Katana';"
```

3. **Verify User ID Resolution**:
```bash
cd /Users/devonwoodson/Documents/GitHub/vvault
cat users/shard_0000/devon_woodson_1762969514958/identity/profile.json | grep -E "(email|user_id)"
```

4. **Check for JSON Errors**:
```bash
cd /Users/devonwoodson/Documents/GitHub/chatty
sqlite3 chatty.db "SELECT conversation_starters, capabilities FROM gpts WHERE name = 'Katana';" | python3 -m json.tool
```

5. **Fix Any Issues** (see [Common Issues and Fixes](#common-issues-and-fixes))

6. **Restart Server**:
```bash
npm run dev:full
```

7. **Verify Frontend**:
- Navigate to `/app/gpts`
- GPT should now appear

### Procedure 2: Recover from Backup Database

**Scenario**: Main database corrupted or lost, backup exists

**Steps**:

1. **Locate Backup**:
```bash
find . -name "chatty.db.backup" -o -name "chatty.db.*"
```

2. **Restore Backup**:
```bash
cp chatty.db.backup chatty.db
```

3. **Verify Data**:
```bash
sqlite3 chatty.db "SELECT COUNT(*) FROM gpts;"
```

4. **Run Verification Steps** (see [Verification Steps](#verification-steps))

### Procedure 3: Manual GPT Creation from Database

**Scenario**: Need to manually insert GPT into database

**Steps**:

1. **Generate Construct Callsign**:
```bash
# Format: {name-lowercase}-{callsign}
# Example: "Katana" → "katana-001"
```

2. **Insert GPT**:
```sql
INSERT INTO gpts (
  id,
  name,
  description,
  instructions,
  conversation_starters,
  capabilities,
  construct_callsign,
  model_id,
  user_id,
  is_active
) VALUES (
  'gpt-katana-001',
  'Katana',
  'Your GPT description',
  'Your GPT instructions',
  '[]',
  '{"webSearch":false,"canvas":false,"imageGeneration":false,"codeInterpreter":true}',
  'katana-001',
  'phi3:latest',
  'devon_woodson_1762969514958',
  1
);
```

3. **Verify Insert**:
```bash
sqlite3 chatty.db "SELECT * FROM gpts WHERE id = 'gpt-katana-001';"
```

---

## Verification Steps

### Step 1: Verify Database Location

```bash
cd /Users/devonwoodson/Documents/GitHub/chatty
ls -la chatty.db
# Should show: -rw-r--r-- ... chatty.db
```

### Step 2: Verify Database Schema

```bash
sqlite3 chatty.db ".schema gpts"
# Should show CREATE TABLE statement with all columns
```

### Step 3: Verify GPTs Exist

```bash
sqlite3 chatty.db "SELECT id, name, user_id, construct_callsign FROM gpts;"
# Should list all GPTs
```

### Step 4: Verify User ID Format

```bash
sqlite3 chatty.db "SELECT DISTINCT user_id FROM gpts;"
# Should show VVAULT LIFE format (e.g., devon_woodson_1762969514958)
```

### Step 5: Verify JSON Validity

```bash
# Check conversation_starters
sqlite3 chatty.db "SELECT id, conversation_starters FROM gpts;" | while IFS='|' read id starters; do
  echo "$starters" | python3 -m json.tool > /dev/null 2>&1 && echo "✅ $id: Valid JSON" || echo "❌ $id: Invalid JSON"
done

# Check capabilities
sqlite3 chatty.db "SELECT id, capabilities FROM gpts;" | while IFS='|' read id caps; do
  echo "$caps" | python3 -m json.tool > /dev/null 2>&1 && echo "✅ $id: Valid JSON" || echo "❌ $id: Invalid JSON"
done
```

### Step 6: Verify User ID Resolution

```bash
cd /Users/devonwoodson/Documents/GitHub/vvault
cat users/shard_0000/devon_woodson_1762969514958/identity/profile.json | grep -E "(email|user_id)"
# Should show email matching your login and user_id in VVAULT format
```

### Step 7: Test API Endpoint

```bash
# Start server first
curl http://localhost:5173/api/gpts
# Should return JSON with GPTs array
```

---

## Troubleshooting Checklist

Use this checklist when GPTs are not appearing:

- [ ] **Database Location**: Is `chatty.db` in project root (`chatty/chatty.db`)?
- [ ] **Database Exists**: Does `chatty.db` file exist?
- [ ] **GPTs in Database**: Do GPTs exist when querying directly via SQLite?
- [ ] **User ID Format**: Are `user_id` values in VVAULT LIFE format?
- [ ] **User ID Resolution**: Does `resolveVVAULTUserId()` find the correct user?
- [ ] **JSON Validity**: Are `conversation_starters` and `capabilities` valid JSON?
- [ ] **Construct Callsign**: Do GPTs have `construct_callsign` set?
- [ ] **Server Logs**: Check server logs for errors during `getAllGPTs()`
- [ ] **API Response**: Does `/api/gpts` return valid JSON?
- [ ] **Frontend State**: Is frontend correctly calling and handling `/api/gpts`?

### Quick Diagnostic Command

```bash
cd /Users/devonwoodson/Documents/GitHub/chatty && \
echo "=== Database Location ===" && \
ls -la chatty.db && \
echo -e "\n=== GPT Count ===" && \
sqlite3 chatty.db "SELECT COUNT(*) FROM gpts;" && \
echo -e "\n=== GPTs List ===" && \
sqlite3 chatty.db "SELECT id, name, user_id FROM gpts LIMIT 5;" && \
echo -e "\n=== JSON Validation ===" && \
sqlite3 chatty.db "SELECT id, capabilities FROM gpts LIMIT 1;" | python3 -m json.tool > /dev/null 2>&1 && echo "✅ JSON is valid" || echo "❌ JSON is invalid"
```

---

## Related Documentation

- **GPT Creation Pipeline**: `docs/architecture/GPT_CREATION_FILE_CREATION_PIPELINE.md`
- **GPT Creator Guide**: `docs/guides/GPT_CREATOR_GUIDE.md`
- **Data Loss Prevention**: `docs/security/DATA_LOSS_PREVENTION_PLAN.md`
- **VVAULT File Structure**: `docs/architecture/GPT_CREATION_FILE_CREATION_PIPELINE.md`

---

## Key Takeaways

1. **GPTs are recoverable** - As long as data exists in `chatty.db`, GPTs can be recovered
2. **Database location matters** - Must be at `chatty/chatty.db` (project root)
3. **User ID format matters** - Must be VVAULT LIFE format for database queries
4. **JSON must be valid** - `conversation_starters` and `capabilities` must be valid JSON
5. **Check server logs** - Errors during `getAllGPTs()` will show in server logs
6. **Frontend is just a view** - The database is the source of truth

---

**Last Updated**: November 21, 2025  
**Maintained By**: Chatty Development Team


