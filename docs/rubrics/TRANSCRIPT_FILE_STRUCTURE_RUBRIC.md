# Transcript File Structure Rubric

## Purpose
Define the exact file structure and naming conventions for transcript files in VVAULT.

---

## File Structure

### Directory Path
```
instances/{constructCallsign}/chatty/chat_with_{constructCallsign}.md
```

**CRITICAL**: 
- Use `constructCallsign` DIRECTLY (e.g., `synth-001`)
- DO NOT parse into `constructId` and `callsign` and reconstruct
- Directory name = `constructCallsign` (e.g., `synth-001/`)
- File name = `chat_with_{constructCallsign}.md` (e.g., `chat_with_synth-001.md`)

---

## Examples

### Correct Structure
```
instances/synth-001/chatty/chat_with_synth-001.md
instances/katana-001/chatty/chat_with_katana-001.md
instances/lin-001/chatty/chat_with_lin-001.md
```

### Incorrect Structure (DO NOT CREATE)
```
instances/synth/chatty/chat_with_synth.md          ❌ Missing callsign
instances/gpt-katana-001/chatty/...                ❌ Has "gpt-" prefix
instances/katana-001/chatty/katana-001_core_chat.md ❌ Wrong filename format
```

---

## File Naming Convention

### Format
```
chat_with_{constructCallsign}.md
```

Where `{constructCallsign}` is:
- Full construct identifier with callsign (e.g., `synth-001`, `katana-001`)
- Lowercase, hyphenated
- Triple-digit callsign (001, 002, 003, etc.)

### Examples
- `chat_with_synth-001.md` ✅
- `chat_with_katana-001.md` ✅
- `chat_with_lin-001.md` ✅
- `chat_with_synth.md` ❌ (missing callsign)
- `synth-001_core_chat.md` ❌ (wrong format)

---

## Directory Structure

### Full Path
```
/vvault/users/shard_0000/{user_id}/instances/{constructCallsign}/chatty/chat_with_{constructCallsign}.md
```

### Breakdown
1. **Base**: `/vvault/users/`
2. **Shard**: `shard_0000/` (sequential sharding)
3. **User ID**: `{user_id}/` (VVAULT LIFE format, e.g., `devon_woodson_1762969514958`)
4. **Instances**: `instances/`
5. **Construct Callsign**: `{constructCallsign}/` (e.g., `synth-001/`)
6. **Platform**: `chatty/`
7. **Transcript File**: `chat_with_{constructCallsign}.md`

---

## Implementation

### Code Pattern
```javascript
// CORRECT: Use constructCallsign directly
const transcriptFile = path.join(
  instancesDir,
  constructCallsign,  // e.g., "synth-001"
  'chatty',
  `chat_with_${constructCallsign}.md`  // e.g., "chat_with_synth-001.md"
);

// WRONG: Don't parse and reconstruct
const constructId = 'synth';
const callsign = '001';
const transcriptFile = path.join(
  instancesDir,
  `${constructId}-${callsign}`,  // Would create "synth-001" but wrong pattern
  'chatty',
  `chat_with_${constructId}-${callsign}.md`
);
```

---

## Protection

### Transcript Protection
- **Append-Only**: Files are append-only, never overwritten
- **Read-Only Permissions**: Files set to read-only (444 on Unix, +R on Windows)
- **Locked**: Protected from deletion and editing

See `TRANSCRIPT_PROTECTION_RUBRIC.md` for details.

---

## Related Documentation

- `chatty/docs/rubrics/CHATTY_VVAULT_TRANSCRIPT_SAVING_RUBRIC.md` - Saving rubric
- `chatty/docs/architecture/GPT_CREATION_FILE_CREATION_PIPELINE.md` - File creation pipeline
- `chatty/docs/rubrics/VVAULT_BACKEND_FRONTEND_CONNECTION_RUBRIC.md` - Connection rubric
- `chatty/docs/TRANSCRIPT_PROTECTION_RUBRIC.md` - Protection mechanisms

---

## Status

- ✅ File structure documented
- ✅ Naming convention enforced
- ✅ Protection mechanisms implemented
- ✅ All code uses `constructCallsign` directly

