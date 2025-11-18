# Quick Reference: Import Storage Implementation

## Goal
Separate imported runtime data from VVAULT. Imported conversations should go to `/user_data_imports/`, NOT VVAULT.

## Critical Rules
1. **VVAULT = Chatty-generated transcripts ONLY**
2. **Imported data = Separate storage at `/user_data_imports/{userId}/{runtimeId}/`**
3. **Never call `persistImportToVVAULT()` with imported data**

## Files to Create/Modify

### New Files
- `server/lib/importStorage.js` - Path utilities
- `server/services/importStorageService.js` - Write/read imported conversations
- `src/lib/importConversationManager.ts` - Frontend manager

### Files to Modify
- `server/routes/import.js` - Update import route to use new storage
- `server/services/importService.js` - Remove VVAULT writes for imports
- `src/components/Layout.tsx` - Load imported conversations separately
- `.gitignore` - Add `/user_data_imports/`

## Key Functions Needed

### Backend
```javascript
// Write imported conversations
persistImportToImportStore(conversations, userId, runtimeId, source, gptConfig)

// Read imported conversations
readImportedConversations(userId, runtimeId)

// API endpoint
GET /api/import/runtime/:runtimeId/conversations
```

### Frontend
```typescript
// Load imported conversations
importManager.loadImportedConversations(runtimeId)

// Convert to Thread format
importManager.convertToThread(conversation)
```

## Storage Structure
```
/user_data_imports/
  └── {userId}/
      └── {runtimeId}/
          ├── imported_chat_001.md
          ├── imported_chat_002.md
          └── ...
```

## Testing
1. Import a runtime → Check `/user_data_imports/` has files
2. Verify VVAULT has NO imported conversations
3. Select imported runtime → Conversations appear in sidebar
4. Restart server → Data persists

## Full Guide
See `CLIENT_STORAGE_IMPLEMENTATION_GUIDE.md` for complete step-by-step instructions.

