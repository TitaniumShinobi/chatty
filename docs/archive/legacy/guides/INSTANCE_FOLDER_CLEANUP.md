# Instance Folder Cleanup

## Problem

Instance folders were being created with incorrect naming conventions:
- ❌ `gpt-katana-001/` (WRONG - has "gpt-" prefix)
- ❌ `gpt-{uuid}/` (WRONG - legacy UUID format)
- ✅ `katana-001/` (CORRECT - per documentation)

## Root Cause

1. **`create-katana-blueprint.js` script** was parsing `constructCallsign` into `constructId` and `callsign`, then reconstructing as `${constructId}-${callsign}` (would create `katana-katana-001`)
2. **Legacy GPT entries** used UUID-based folder names (`gpt-{uuid}`)
3. **Hardcoded fallbacks** in `GPTCreator.tsx` used `'gpt-katana-001'` format
4. **Parsing logic** was incorrectly reconstructing directory names instead of using `constructCallsign` directly

## Documentation Reference

Per `GPT_CREATION_FILE_CREATION_PIPELINE.md`:
- Instance directories should be: `instances/{construct-callsign}/`
- Format: `{construct-name}-{callsign}` (e.g., `katana-001`, `synth-001`)
- **NOT**: `gpt-{construct-callsign}` or `gpt-{uuid}`

## Fixes Applied

### 1. Fixed `create-katana-blueprint.js`
- Removed `constructId = 'gpt'` logic
- Now uses construct callsign directly (e.g., `katana-001`)
- Properly parses callsign for blueprint structure

### 2. Created `cleanup-instance-folders.js`
- Moves `gpt-{callsign}` folders to `{callsign}` format
- Merges contents if target already exists
- Removes legacy `gpt-{uuid}` folders

### 3. Fixed `GPTCreator.tsx` fallbacks
- Changed hardcoded `'gpt-katana-001'` to `'katana-001'`
- Added comments explaining correct format
- Strips "gpt-" prefix if present (backward compatibility)

## Cleanup Results

✅ Removed legacy GPT folders:
- `gpt-996ad375-4275-4934-86e5-6ae039ef40ed/`
- `gpt-a211047f-c7ff-46d8-b136-e9ac2923c38d/`
- `gpt-ad2d8344-90e4-4e3f-8763-ffd9c26cb508/`
- `gpt-d4b01655-5d70-4125-a1f7-26b6ba3b96a9/`

✅ Fixed `gpt-katana-001/` → `katana-001/`:
- Merged `identity/` folder contents
- Merged `personality.json`
- Removed old folder

## Current Structure

```
instances/
├── katana-001/          ✅ CORRECT
├── synth-001/           ✅ CORRECT
├── synth/               ⚠️ Legacy (should be synth-001)
└── lin-001/             ✅ CORRECT
```

## Prevention

All new instance creation should:
1. Use `generateConstructCallsign()` which returns format `{name}-{callsign}` (e.g., `katana-001`)
2. Create directories as `instances/{constructCallsign}/` - **USE constructCallsign DIRECTLY**
3. **DO NOT** parse `constructCallsign` into `constructId` and `callsign` and reconstruct (would create `katana-katana-001`)
4. Never use "gpt-" prefix in folder names
5. Follow documentation: `GPT_CREATION_FILE_CREATION_PIPELINE.md`

**CRITICAL**: The rubric is `instances/{constructCallsign}/` - use `constructCallsign` directly, not parsed!

## Related Files

- `chatty/server/scripts/create-katana-blueprint.js` - Fixed
- `chatty/server/scripts/cleanup-instance-folders.js` - Created
- `chatty/src/components/GPTCreator.tsx` - Fixed fallbacks
- `chatty/docs/architecture/GPT_CREATION_FILE_CREATION_PIPELINE.md` - Reference

