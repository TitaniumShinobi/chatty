# Capsule Integrity Rules

## Overview

Capsules contain **immutable identifiers** that must NEVER be randomly changed. These are like Social Security Numbers - they identify the capsule uniquely and must remain constant throughout its lifecycle.

## Immutable Fields (NEVER MODIFY)

### Core Identity Fields

These fields are **permanently locked** once a capsule is created:

```json
{
  "metadata": {
    "uuid": "...",              // IMMUTABLE - Unique identifier (like SSN)
    "fingerprint_hash": "...",   // IMMUTABLE - Only recalculated when content changes
    "tether_signature": "...",   // IMMUTABLE - User signature
    "instance_name": "...",      // IMMUTABLE - Construct name
    "capsule_version": "..."     // IMMUTABLE - Version (new versions create new capsules)
  },
  "traits": {...},               // IMMUTABLE - Personality traits
  "personality": {...},          // IMMUTABLE - Personality profile
  "signatures": {...}            // IMMUTABLE - Linguistic signatures
}
```

### Why These Are Immutable

- **UUID**: Unique identifier for the capsule. Changing it breaks all references, database links, and blockchain registrations.
- **fingerprint_hash**: SHA-256 hash of capsule content. Used for integrity verification. Only changes when content actually changes.
- **tether_signature**: User signature proving ownership. Changing it breaks authentication.
- **instance_name**: Construct name. Changing it breaks identity continuity.
- **traits/personality/signatures**: Core identity. Changing these changes who the construct is.

## Mutable Fields (Safe to Update)

These fields can be safely updated:

- `metadata.timestamp` - Last access/update time
- `memory.memory_log` - Conversation history (append only)
- `memory.short_term_memories` - Short-term memory (replace)
- `memory.episodic_memories` - Episodic memories (append)
- `memory.last_memory_timestamp` - Last memory update time

## Fingerprint Hash Rules

### When Fingerprint Hash CAN Change

1. **Content Actually Changed**: When traits, personality, signatures, or core identity fields are modified
2. **Memory Updates**: When memory_log, short_term_memories, or episodic_memories are updated (content changed)
3. **Intentional Regeneration**: When explicitly regenerating capsule (creates new version)

### When Fingerprint Hash CANNOT Change

1. **Metadata-only updates**: Updating timestamp alone
2. **Directory moves**: Moving capsule to different location
3. **File renames**: Renaming capsule file
4. **Read operations**: Loading/reading capsule

### Fingerprint Recalculation Process

The fingerprint is recalculated using SHA-256:

```javascript
// 1. Create copy without fingerprint_hash
const copy = JSON.parse(JSON.stringify(capsule));
delete copy.metadata.fingerprint_hash;

// 2. Serialize to JSON (sorted keys for consistency)
const json = JSON.stringify(copy, Object.keys(copy).sort(), 2);

// 3. Calculate SHA-256
const hash = crypto.createHash('sha256').update(json, 'utf8').digest('hex');

// 4. Update fingerprint_hash
capsule.metadata.fingerprint_hash = hash;
```

## UUID Preservation Rules

### UUID is ALWAYS Immutable

- Never generate new UUID for existing capsule
- Preserve UUID during all operations (move, rename, update)
- UUID only changes when creating NEW capsule (not updating existing)

### UUID Generation

- Only generate UUID when creating BRAND NEW capsule
- Never regenerate UUID for existing capsule
- Store original UUID in relay metadata for traceability

## Validation Checklist

Before ANY capsule write operation:

- [ ] Original capsule loaded (if exists)
- [ ] Immutable fields extracted and preserved
- [ ] Only mutable fields updated
- [ ] Immutable fields restored before write
- [ ] Fingerprint recalculated ONLY if content changed
- [ ] Integrity validation passed
- [ ] UUID unchanged
- [ ] Tether signature unchanged

## Implementation

### Using the Integrity Validator

All capsule write operations should use `capsuleIntegrityValidator.js`:

```javascript
const {
  extractImmutableFields,
  restoreImmutableFields,
  validateBeforeWrite,
  prepareCapsuleUpdate,
  recalculateFingerprint,
  contentChanged
} = require('./capsuleIntegrityValidator.js');

// When updating existing capsule:
const originalCapsule = await loadCapsule(path);
const immutableFields = extractImmutableFields(originalCapsule);

// Update mutable fields only
const updatedCapsule = prepareCapsuleUpdate(originalCapsule, updates);

// Restore immutable fields (in case updates tried to modify them)
restoreImmutableFields(updatedCapsule, immutableFields);

// Recalculate fingerprint if content changed
if (contentChanged(originalCapsule, updatedCapsule)) {
  updatedCapsule.metadata.fingerprint_hash = recalculateFingerprint(updatedCapsule);
}

// Validate before write
const validation = await validateBeforeWrite(path, updatedCapsule);
if (!validation.valid) {
  throw new Error(`Integrity validation failed: ${validation.error}`);
}

// Write
await fs.writeFile(path, JSON.stringify(updatedCapsule, null, 2), 'utf8');
```

## Error Handling

### Integrity Violation Errors

If immutable fields are modified, a `CapsuleIntegrityError` is thrown:

```javascript
class CapsuleIntegrityError extends Error {
  constructor(field, originalValue, newValue) {
    super(`Capsule integrity violation: ${field} changed`);
    this.field = field;
    this.originalValue = originalValue;
    this.newValue = newValue;
  }
}
```

### Response to Violations

- **Development**: Throw error, prevent write
- **Production**: Log error, prevent write, alert user
- **Recovery**: Restore from backup if integrity lost

## Expected Behavior

### When updating capsule metadata:
- UUID: **Unchanged**
- Fingerprint: **Recalculated only if content changed**
- Tether signature: **Unchanged**
- Timestamp: **Updated to current time**

### When moving capsule:
- All immutable fields: **Preserved exactly**
- Fingerprint: **Unchanged** (content didn't change)
- File path: **Updated**, but capsule content identical

### When content actually changes:
- UUID: **Unchanged** (same capsule, updated content)
- Fingerprint: **Recalculated** (content changed)
- Tether signature: **Unchanged**
- Timestamp: **Updated**

## Files Using Integrity Validation

- `chatty/server/lib/capsuleUpdater.js` - Uses `prepareCapsuleUpdate()` and validation
- `chatty/server/lib/fileManagementAutomation.js` - Uses `updateCapsuleMetadata()` with validation
- `chatty/server/lib/capsuleIntegration.js` - Uses integrity validator in `saveCapsule()`

## Testing

All capsule operations should be tested for:

- UUID preservation during updates
- Fingerprint recalculation when content changes
- Fingerprint preservation when only metadata changes
- Integrity validation catches violations
- Directory move preserves all immutable fields
- Error handling for integrity violations

## Related Documentation

- `chatty/docs/architecture/GPT_CREATION_FILE_CREATION_PIPELINE.md` - File structure
- `chatty/server/lib/capsuleIntegrityValidator.js` - Implementation
- `/Users/devonwoodson/.cursor/plans/capsule_integrity_preservation_plan.md` - Full plan

