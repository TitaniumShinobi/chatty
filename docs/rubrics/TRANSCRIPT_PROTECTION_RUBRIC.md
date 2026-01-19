# Transcript Protection Rubric

## Purpose
Ensure transcripts are locked and protected from deletion or editing, maintaining data integrity and audit trail.

---

## Protection Mechanisms

### 1. Append-Only Writing
- **File Mode**: Always use append mode (`'a'`) when writing to transcripts
- **Never Overwrite**: Transcripts are append-only; existing content cannot be modified
- **File Handle**: Use `fs.open()` with append flag, then `appendFile()` method

### 2. Read-Only File Permissions
- **Unix/Linux/macOS**: Set file permissions to `0o444` (read-only for owner, group, others)
- **Windows**: Set read-only attribute using `attrib +R`
- **When Applied**: Immediately after file creation and after each append operation

### 3. File Locking
- **Append Operations**: Use file handles with proper locking
- **Sync Operations**: Call `fileHandle.sync()` to ensure data is written to disk before closing
- **Error Handling**: If permission setting fails, log warning but don't fail the write

---

## Implementation

### File Creation
```javascript
// Create file with header
await fs.writeFile(transcriptFile, header, 'utf-8');

// Immediately protect with read-only permissions
if (process.platform !== 'win32') {
  await fs.chmod(transcriptFile, 0o444);
} else {
  execSync(`attrib +R "${transcriptFile}"`);
}
```

### Append Operation
```javascript
// Open in append mode only
const fileHandle = await fs.open(transcriptFile, 'a');

try {
  // Append message
  await fileHandle.appendFile(messageBlock, 'utf-8');
  await fileHandle.sync(); // Ensure written to disk
  
  // Re-apply read-only protection (in case it was removed)
  if (process.platform !== 'win32') {
    await fs.chmod(transcriptFile, 0o444);
  } else {
    execSync(`attrib +R "${transcriptFile}"`);
  }
} finally {
  await fileHandle.close();
}
```

---

## File Structure

### Transcript Location
```
instances/{constructCallsign}/chatty/chat_with_{constructCallsign}.md
```

**Examples**:
- `instances/synth-001/chatty/chat_with_synth-001.md`
- `instances/katana-001/chatty/chat_with_katana-001.md`

### CRITICAL: Always Use constructCallsign Format
- ✅ `synth-001` (CORRECT - includes callsign)
- ❌ `synth` (WRONG - missing callsign, creates wrong folder)

---

## Protection Levels

### Level 1: Append-Only (Always Active)
- Files opened in append mode only
- Cannot overwrite existing content
- New messages appended to end of file

### Level 2: Read-Only Permissions (Always Active)
- File permissions set to read-only
- Prevents accidental deletion via file system
- Prevents editing via text editors

### Level 3: File Locking (Future Enhancement)
- Advisory file locks during write operations
- Prevents concurrent writes from corrupting file
- Retry logic for lock acquisition

---

## Bypassing Protection (Admin Only)

If transcript needs to be modified (e.g., fixing import errors):

```bash
# Unix/Linux/macOS
chmod 644 instances/synth-001/chatty/chat_with_synth-001.md

# Windows
attrib -R "instances\synth-001\chatty\chat_with_synth-001.md"
```

**WARNING**: Only bypass protection for legitimate corrections. Always re-apply protection after modification.

---

## Verification

### Check File Permissions
```bash
# Unix/Linux/macOS
ls -l instances/synth-001/chatty/chat_with_synth-001.md
# Should show: -r--r--r-- (444)

# Windows
attrib instances\synth-001\chatty\chat_with_synth-001.md
# Should show: R (read-only)
```

### Test Protection
```bash
# Attempt to delete (should fail or require confirmation)
rm instances/synth-001/chatty/chat_with_synth-001.md

# Attempt to edit (should fail or require confirmation)
nano instances/synth-001/chatty/chat_with_synth-001.md
```

---

## Related Files

- `chatty/vvaultConnector/writeTranscript 3.js` - Implementation
- `chatty/docs/rubrics/CHATTY_VVAULT_TRANSCRIPT_SAVING_RUBRIC.md` - Saving rubric
- `chatty/docs/architecture/GPT_CREATION_FILE_CREATION_PIPELINE.md` - File structure

---

## Status

- ✅ Append-only writing implemented
- ✅ Read-only permissions implemented
- ✅ Protection applied on file creation
- ✅ Protection re-applied after each append
- ⏳ File locking (future enhancement)

