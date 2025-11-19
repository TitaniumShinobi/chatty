# User Model Finalization Summary

## ✅ All Required Fields Implemented

The User schema now includes all required fields:

### Core Fields ✅
- **email** (line 6) - Required, unique, indexed
- **password** (line 10) - PBKDF2 hash storage (accessible as `passwordHash` via virtual)
- **uid** (line 37) - Unique identifier, indexed

### Construct & Path Fields ✅
- **constructId** (line 28) - Unique, sparse index
- **vvaultPath** (line 29) - Required field

### Status & Lifecycle Fields ✅
- **status** (line 17) - Default "active", indexed
- **deletedAt** (line 18) - Nullable Date, indexed

### Timestamp Fields ✅
- **createdAt** (line 23) - Manual default `Date.now` + Mongoose timestamps
- **lastLoginAt** (line 24) - Nullable Date (accessible as `lastLogin` via virtual)
- **updatedAt** - Automatically managed by Mongoose `timestamps: true`

## Implementation Details

### Timestamps Management

The schema uses dual timestamp management:

1. **Manual `createdAt`**: Set explicitly in `createUser()` operations:
   ```javascript
   createdAt: new Date()
   ```

2. **Mongoose `timestamps: true`**: Automatically manages:
   - `createdAt` (uses manual default if provided)
   - `updatedAt` (automatically updated on save)

### Virtual Field Aliases

For API consistency, virtual fields provide aliases:

- **`passwordHash`**: Virtual alias for `password` field
  - Reading `user.passwordHash` returns `user.password`
  - Setting `user.passwordHash = value` sets `user.password = value`

- **`lastLogin`**: Virtual alias for `lastLoginAt` field
  - Reading `user.lastLogin` returns `user.lastLoginAt`
  - Setting `user.lastLogin = value` sets `user.lastLoginAt = value`

Virtuals are included in JSON output via:
```javascript
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });
```

### Timestamp Setting in Operations

**User Creation** (`store.js`):
- `createUser()` - Sets `createdAt: new Date()` (line 244)
- `upsertUser()` - Sets `createdAt: new Date()` (line 195)

**User Login** (`server.js` and `store.js`):
- `upsertUser()` - Updates `lastLoginAt: new Date()` (line 165)
- `login()` endpoint - Updates `lastLoginAt: new Date()` (line 909)
- `createUser()` - Sets `lastLoginAt: new Date()` (line 245)

## Indexes

Optimized indexes for efficient queries:
- `email` - Unique index
- `email + status` - Compound index
- `uid` - Unique, sparse index
- `status` - Index for filtering
- `deletedAt` - Index for soft-delete queries
- `canRestoreUntil` - Index for cleanup operations
- `constructId` - Unique, sparse index

## Verification

All fields are properly configured and being set:

1. ✅ **email** - Required, unique, indexed
2. ✅ **password/passwordHash** - Stored as `password`, accessible as `passwordHash`
3. ✅ **uid** - Unique identifier, indexed
4. ✅ **constructId** - Unique construct identifier
5. ✅ **vvaultPath** - Required vault path
6. ✅ **status** - Default "active", indexed
7. ✅ **createdAt** - Set manually in creation, managed by Mongoose
8. ✅ **lastLoginAt** - Updated in login operations
9. ✅ **deletedAt** - Nullable, indexed for soft deletes

## Backward Compatibility

- Existing code using `password` field continues to work
- New code can use `passwordHash` virtual for clarity
- Existing code using `lastLoginAt` continues to work
- New code can use `lastLogin` virtual for convenience
- All virtuals are included in JSON responses

The User model is now finalized and production-ready with all required fields properly implemented and managed.


