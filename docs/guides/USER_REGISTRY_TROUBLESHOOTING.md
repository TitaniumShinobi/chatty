# User Registry Troubleshooting
## Why `/chatty/users/shard_0000/` is Empty

---

## Problem

The directory `chatty/users/shard_0000/` exists but is empty, and `chatty/users.json` doesn't exist.

---

## Root Causes

### 1. **Logged In Before Registry Was Implemented** ✅ (Most Likely)

**Issue**: You logged in before the user registry code was added to `server.js`.

**Solution**: Run the initialization script to create registry for existing users.

```bash
# Initialize registry for all existing users
node scripts/initialize-user-registry.js

# Or initialize for specific user
node scripts/initialize-user-registry.js {userId} {email} {name}
```

### 2. **Registry Creation Failed Silently** ⚠️

**Issue**: The registry creation is wrapped in try-catch and marked "non-critical", so errors are logged but don't stop login.

**Check Server Logs**:
```bash
# Look for these messages in server logs:
# ✅ [User Registry] Registered user: {userId} ({email})
# ⚠️ [User Registry] Failed to register user (non-critical): {error}
```

**Common Errors**:
- Path resolution issues (`PROJECT_ROOT` incorrect)
- Permission errors (can't write to `chatty/users/`)
- File system errors

### 3. **Path Resolution Issue** ⚠️

**Issue**: `PROJECT_ROOT` might resolve incorrectly.

**Check**:
```javascript
// In userRegistry.js:
const PROJECT_ROOT = path.resolve(__dirname, '../..');
// Should resolve to: /Users/devonwoodson/Documents/GitHub/chatty
```

**Fix**: Verify `__dirname` resolves correctly in ES modules.

---

## Solutions

### Solution 1: Manual Initialization (Recommended)

**Run the initialization script**:

```bash
cd /Users/devonwoodson/Documents/GitHub/chatty
node scripts/initialize-user-registry.js
```

This will:
1. Connect to MongoDB
2. Find all users
3. Create registry entries for each
4. Create directory structure
5. Create `identity/profile.json` files

### Solution 2: Trigger on Next Login

The registry will be created automatically on your next login if:
- The code path executes successfully
- No errors occur during `getOrCreateUser()`

**To trigger**:
1. Log out
2. Log back in
3. Check for `✅ [User Registry] Registered user:` in server logs

### Solution 3: Create Registry Manually

**Create `chatty/users.json`**:
```json
{
  "users": {},
  "totalUsers": 0,
  "nextUserId": 1
}
```

**Create directory structure**:
```bash
mkdir -p chatty/users/shard_0000/{your_user_id}/identity
```

**Create `identity/profile.json`**:
```json
{
  "user_id": "{your_user_id}",
  "email": "dwoodson92@gmail.com",
  "name": "Devon Woodson",
  "created_at": "2025-11-24T12:00:00.000Z",
  "last_seen": "2025-11-24T12:00:00.000Z",
  "shard": "shard_0000",
  "vvault_linked": true,
  "vvault_user_id": "devon_woodson_1762969514958"
}
```

---

## Verification

### Check Registry Exists
```bash
# Check if users.json exists
test -f chatty/users.json && echo "✅ Registry exists" || echo "❌ Registry missing"

# Check if user directory exists
ls -la chatty/users/shard_0000/
```

### Check User Profile
```bash
# Check if profile.json exists for your user
ls -la chatty/users/shard_0000/{your_user_id}/identity/profile.json
```

### Check Server Logs
```bash
# Look for registry creation messages
grep "User Registry" chatty/server.log
```

---

## Expected Structure After Fix

```
chatty/
├── users.json                    # ✅ Registry file
└── users/
    └── shard_0000/
        └── {your_user_id}/
            ├── identity/
            │   └── profile.json  # ✅ User profile
            ├── prompts/
            │   └── customAI/    # ✅ Custom AI prompts
            ├── preferences/      # 📋 Future use
            └── cache/            # 📋 Future use
```

---

## Next Steps

1. **Run initialization script**: `node scripts/initialize-user-registry.js`
2. **Verify structure**: Check that `users.json` and user directories exist
3. **Test Lin recognition**: Try "do you know me?" again
4. **Check server logs**: Verify no errors during registry creation

---

## Prevention

To prevent this in the future:

1. **Make registry creation critical** (not "non-critical")
2. **Add validation**: Check registry exists before allowing login
3. **Add migration**: Auto-create registry for existing users on server start
4. **Better error handling**: Log errors but don't silently fail

