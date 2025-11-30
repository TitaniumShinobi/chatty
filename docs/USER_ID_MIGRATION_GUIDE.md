# User ID Migration Guide

## Overview

Chatty user IDs have been migrated from legacy formats (MongoDB ObjectId, Google sub) to LIFE format: `{name}_{timestamp}`.

---

## Migration Script

**Location**: `chatty/server/scripts/migrate-user-ids-to-life-format.js`

**Purpose**: Migrates existing users from legacy ID formats to LIFE format.

---

## Usage

### Dry Run (Preview Changes)
```bash
node server/scripts/migrate-user-ids-to-life-format.js --dry-run
```

### Migrate All Users
```bash
node server/scripts/migrate-user-ids-to-life-format.js
```

### Migrate Specific User
```bash
node server/scripts/migrate-user-ids-to-life-format.js --user-id <old_user_id>
```

---

## What Gets Migrated

### 1. User Directory
- **Old**: `users/shard_0000/{old_user_id}/`
- **New**: `users/shard_0000/{new_life_format_id}/`
- **Action**: Directory renamed

### 2. Registry Entry (`users.json`)
- **Old**: `{ "old_user_id": { ... } }`
- **New**: `{ "new_life_format_id": { ... } }`
- **Action**: Registry entry updated

### 3. Profile File (`identity/profile.json`)
- **Old**: `{ "user_id": "old_user_id", ... }`
- **New**: `{ "user_id": "new_life_format_id", ... }`
- **Action**: Profile file updated

---

## Migration Process

### Step 1: Identify Users to Migrate
Script scans `users.json` for users with non-LIFE format IDs:
- MongoDB ObjectId: `507f1f77bcf86cd799439011`
- Google sub: `109043688581425242997`
- Numeric only: `1234567890`

### Step 2: Generate LIFE Format ID
- Uses user's `name` and `email` to generate normalized name
- Uses `created_at` timestamp if available (preserves creation time)
- Falls back to `Date.now()` if no timestamp available

### Step 3: Rename Directory
- Renames `users/shard_0000/{old_id}/` → `users/shard_0000/{new_id}/`
- Handles missing directories gracefully

### Step 4: Update Registry
- Removes old registry entry
- Creates new registry entry with LIFE format ID
- Updates `totalUsers` count

### Step 5: Update Profile
- Updates `identity/profile.json` with new `user_id`
- Preserves all other profile data

---

## Safety Features

### Dry Run Mode
- Preview changes without making them
- Shows what would be migrated
- No files or directories modified

### Conflict Detection
- Checks if new ID already exists
- Skips users already in LIFE format
- Handles missing directories gracefully

### Error Handling
- Continues migration even if one user fails
- Reports errors for each user
- Provides summary at end

---

## Example Output

```
🔄 MIGRATING USER IDS TO LIFE FORMAT
=====================================

📋 Found 1 user(s) in registry

🔄 Found 1 user(s) to migrate:

  109043688581425242997 → devon_woodson_1762969514958
    Email: dwoodson92@gmail.com
    Name: Devon Woodson

🔄 Migrating: 109043688581425242997
  ✅ Renamed directory: 109043688581425242997 → devon_woodson_1762969514958
  ✅ Updated registry entry
  ✅ Updated profile.json
✅ Successfully migrated to: devon_woodson_1762969514958

📊 Migration Summary:
   ✅ Success: 1
   ⏭️  Skipped: 0
   ❌ Errors: 0

✅ Migration complete! Users should log out and log back in.
```

---

## After Migration

### For Users
1. **Log out** of Chatty
2. **Log back in** - session will use new user ID
3. **Verify** - Check that profile loads correctly

### For Developers
1. **Update code** - Any hardcoded user IDs should be updated
2. **Test** - Verify user can log in and access data
3. **Monitor** - Check for any errors related to user ID lookups

---

## Rollback

If migration causes issues, you can rollback by:

1. **Restore registry** from backup:
   ```bash
   cp users.json.backup users.json
   ```

2. **Rename directories** back:
   ```bash
   mv users/shard_0000/{new_id} users/shard_0000/{old_id}
   ```

3. **Update profile.json** manually:
   ```json
   {
     "user_id": "<old_id>",
     ...
   }
   ```

---

## Related Documentation

- `chatty/docs/VVAULT_USER_ID_GENERATION.md` - LIFE format generation
- `chatty/docs/PARALLEL_USER_REGISTRIES.md` - Registry structure
- `wreck_vault/LIFE_technology/standards/USER_ID_FORMAT.md` - LIFE format standard

---

## Future Migrations

For future user ID format changes:

1. **Create migration script** in `server/scripts/`
2. **Test with dry-run** first
3. **Document** migration process
4. **Backup** registry before migration
5. **Run** migration during maintenance window
6. **Verify** all users can log in after migration







