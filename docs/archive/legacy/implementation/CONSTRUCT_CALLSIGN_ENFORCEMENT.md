# Construct Callsign Enforcement Rubric

## Purpose
Ensure Chatty **always** creates instance directories using `{constructCallsign}` format (e.g., `synth-001`), never without callsign (e.g., `synth`).

---

## CRITICAL Rule

**Instance directories MUST use constructCallsign format:**
- ✅ `instances/synth-001/` (CORRECT - includes callsign)
- ✅ `instances/katana-001/` (CORRECT - includes callsign)
- ❌ `instances/synth/` (WRONG - missing callsign)
- ❌ `instances/katana/` (WRONG - missing callsign)

---

## Default Values

All code that defaults to a construct ID **MUST** use callsign format:

```javascript
// ✅ CORRECT
const constructId = "synth-001";
const constructId = constructId || 'synth-001';

// ❌ WRONG
const constructId = "synth";
const constructId = constructId || 'synth';
```

---

## Files Fixed

### Server Routes
- `chatty/server/routes/vvault.js` - Changed defaults from `'synth'` to `'synth-001'`
- `chatty/server/routes/chat.js` - Changed default from `'synth'` to `'synth-001'`

### Services
- `chatty/server/services/importService.js` - Changed defaults from `'synth'` to `'synth-001'`

### VVAULT Connector
- `chatty/vvaultConnector/writeTranscript 3.js` - Changed default from `'synth'` to `'synth-001'`

---

## Enforcement Checklist

When creating new code that uses construct IDs:

- [ ] Default value uses callsign format (e.g., `'synth-001'`, not `'synth'`)
- [ ] Directory creation uses `constructCallsign` directly (not parsed)
- [ ] No parsing of `constructCallsign` into `constructId` and `callsign` for directory paths
- [ ] Follows rubric: `instances/{constructCallsign}/`

---

## Related Documentation

- `chatty/docs/architecture/GPT_CREATION_FILE_CREATION_PIPELINE.md` - File structure
- `chatty/docs/INSTANCE_FOLDER_CLEANUP.md` - Cleanup documentation
- `chatty/docs/TRANSCRIPT_PROTECTION_RUBRIC.md` - Transcript protection

---

## Status

- ✅ All defaults changed to `synth-001` format
- ✅ `/synth/` folder removed
- ✅ Code enforces constructCallsign format
- ✅ Transcript protection implemented

