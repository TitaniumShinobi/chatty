# Restore Katana GPT Guide

## Quick Restore

Katana has been restored! However, if you need to restore it again or for a different user, use this guide.

## Method 1: Restore for Current User (Recommended)

The script will automatically detect your user ID from VVAULT:

```bash
cd /Users/devonwoodson/Documents/GitHub/chatty
node server/scripts/restore-katana.js
```

## Method 2: Restore for Specific User ID

If you need to restore Katana for a specific user ID:

```bash
node server/scripts/restore-katana.js <userId>
```

Example:
```bash
node server/scripts/restore-katana.js 109043688581425242997
```

## What the Script Does

1. **Finds Katana Capsule**: Searches VVAULT for `katana-001.capsule`
2. **Loads Capsule Data**: Extracts personality, traits, and metadata
3. **Checks for Existing**: Verifies if Katana already exists
4. **Creates GPT Entry**: Creates database entry with:
   - Name: "Katana"
   - Construct Callsign: "katana-001"
   - Description: Extracted from capsule personality
   - Instructions: Built from capsule traits and communication style
   - Models: mistral:latest (conversation/creative), deepseek-coder:latest (coding)

## Troubleshooting

### Katana Already Exists

If you see "Katana already exists", you have two options:

1. **Delete existing entry** via the UI (My AIs → Delete)
2. **Use different construct callsign** (modify script)

### User ID Mismatch

If Katana doesn't appear in "My AIs":

1. Check your current user ID in browser console:
   ```javascript
   fetch('/api/me').then(r => r.json()).then(d => console.log(d.user))
   ```

2. Run restore script with your current user ID:
   ```bash
   node server/scripts/restore-katana.js <your-user-id>
   ```

### Capsule Not Found

If the script can't find the capsule:

1. Verify capsule exists:
   ```bash
   find ~/Documents/GitHub/vvault -name "katana-001.capsule"
   ```

2. Check VVAULT structure:
   ```bash
   ls -la ~/Documents/GitHub/vvault/users/shard_0000/*/capsules/
   ```

## Verification

After restoring, verify Katana appears:

1. Open Chatty → "My AIs" page
2. Look for "Katana" in the list
3. Click to edit and verify:
   - Construct Callsign: `katana-001`
   - Models are set correctly
   - Description matches capsule personality

## Related Files

- **Capsule Location**: `vvault/users/shard_0000/{userId}/capsules/katana-001.capsule`
- **Script**: `chatty/server/scripts/restore-katana.js`
- **Database**: `chatty/chatty.db` (ais table)

