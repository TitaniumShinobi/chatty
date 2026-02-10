# Mongoose Index Cleanup

## Issue

Mongoose was warning about duplicate schema indexes:
```
Warning: Duplicate schema index on {"deletedAt":1} found.
Warning: Duplicate schema index on {"canRestoreUntil":1} found.
Warning: Duplicate schema index on {"status":1} found.
```

## Root Cause

In `server/models/User.js`, three fields had indexes defined **twice**:
1. Once with `index: true` in the field definition
2. Once with `schema.index()` explicit call

This created duplicate indexes, which Mongoose detected and warned about.

## Fix Applied

Removed `index: true` from field definitions and kept the explicit `schema.index()` calls:

### Before:
```javascript
status: { type: String, default: "active", index: true },
deletedAt: { type: Date, default: null, index: true },
canRestoreUntil: { type: Date, default: null, index: true },
```

### After:
```javascript
status: { type: String, default: "active" }, // indexed via schema.index below
deletedAt: { type: Date, default: null }, // indexed via schema.index below
canRestoreUntil: { type: Date, default: null }, // indexed via schema.index below
```

The explicit `schema.index()` calls remain:
```javascript
UserSchema.index({ email: 1, status: 1 }); // compound index
UserSchema.index({ deletedAt: 1 });
UserSchema.index({ canRestoreUntil: 1 });
UserSchema.index({ status: 1 });
```

## Why Keep Explicit Indexes?

1. **Clarity**: Explicit `schema.index()` calls are easier to see and maintain
2. **Flexibility**: Allows for compound indexes (like `{ email: 1, status: 1 }`)
3. **Consistency**: All indexes are defined in one place (at the bottom of the schema)

## Other Models Checked

- **SingletonConversation.js**: No duplicates - uses compound indexes which are different from single-field `index: true`
- **Message.js**: No duplicates - compound indexes only
- **Conversation.js**: No duplicates - compound indexes only
- **File.js**: No duplicates - no explicit `schema.index()` calls

## Result

After this fix, Mongoose should no longer show duplicate index warnings for the User model. The indexes remain functional and queries will perform the same.

## Testing

Restart your server and verify the warnings are gone:
```bash
npm run dev:full
```

You should no longer see:
- `Warning: Duplicate schema index on {"deletedAt":1}`
- `Warning: Duplicate schema index on {"canRestoreUntil":1}`
- `Warning: Duplicate schema index on {"status":1}`

