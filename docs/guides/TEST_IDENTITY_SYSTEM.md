# Testing the Identity System

## Quick Test Guide

### Prerequisites
1. **ChromaDB Server** (optional - system degrades gracefully without it):
   ```bash
   # Install ChromaDB CLI (if not installed)
   pip install chromadb
   
   # Start ChromaDB server
   chroma run --path ./chroma_data
   ```
   Or set environment variable:
   ```bash
   export CHROMA_SERVER_URL=http://localhost:8000
   ```

2. **Start Chatty Server**:
   ```bash
   cd /Users/devonwoodson/Documents/GitHub/chatty
   npm run dev:full
   ```

### Test Identity Upload

1. **Via GPT Creator UI**:
   - Open Chatty in browser (http://localhost:5173)
   - Navigate to GPT Creator
   - Go to "Identity" section
   - Click "Upload Identity Files"
   - Select a test file (`.txt`, `.md`, `.pdf`, etc.)
   - File should be stored in: `/vvault/users/shard_0000/{userId}/instances/{construct-callsign}/identity/{filename}.md`

2. **Via API (curl)**:
   ```bash
   # First, get auth token from browser (check Network tab in DevTools)
   curl -X POST http://localhost:5173/api/vvault/identity/upload \
     -H "Cookie: your-session-cookie" \
     -F "files=@test-file.txt" \
     -F "constructCallsign=synth-001"
   ```

### Test Identity Query

1. **Via API**:
   ```bash
   curl "http://localhost:5173/api/vvault/identity/query?constructCallsign=synth-001&query=test%20query&limit=5"
   ```

2. **In Chat**:
   - Start a conversation with a construct (e.g., Synth)
   - Send a message
   - Check browser console for: `🧠 [Layout.tsx] Querying identity for construct: synth-001`
   - If identities found: `✅ [Layout.tsx] Found X relevant identity/memories`

### Verify File Storage

Check that files are stored correctly:
```bash
ls -la /Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/*/instances/*/identity/
```

### Expected Behavior

**With ChromaDB Server Running**:
- ✅ Files uploaded → Stored in `/identity/` folder
- ✅ Files imported into ChromaDB collections
- ✅ Queries return relevant identities from ChromaDB
- ✅ Identities injected into AI prompt context

**Without ChromaDB Server**:
- ✅ Files uploaded → Stored in `/identity/` folder
- ⚠️ Warning: "ChromaDB server not available"
- ✅ System continues to work (file storage only)
- ⚠️ Queries return empty (no ChromaDB search)

### Troubleshooting

1. **"ChromaDB server not available"**:
   - Start ChromaDB: `chroma run`
   - Or set: `export CHROMA_SERVER_URL=http://your-chroma-server:8000`

2. **"404 Not Found" on `/api/vvault/identity/upload`**:
   - Ensure backend server is running on port 5000
   - Check: `lsof -ti:5000`

3. **Files not appearing in `/identity/` folder**:
   - Check user ID resolution in console logs
   - Verify construct-callsign is correct
   - Check file permissions

### Next Steps

Once basic upload/query works:
1. Test with multiple files
2. Test with different construct-callsigns
3. Test transcript import (Phase 5)
4. Test capsule storage (Phase 5)
5. Test emotional scoring (Phase 5)

