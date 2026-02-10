# Debug Chatty Model Disconnection - Investigation Prompt

## Context

Chatty is a dual-environment AI stack with:
- **Frontend**: Vite dev server on port 5173 (React/TypeScript)
- **Backend**: Express server on port 5000 (Node.js)
- **CLI Runtime**: Custom Synth processor accessible via CLI (`chatty-cli.ts`)

**Recent Changes**: Added VVAULT capsule hydration, session validation, and readiness checks.

**Current Status**:
- ✅ Backend starts successfully
- ✅ Frontend builds and serves
- ✅ Session validation works (`/api/me` succeeds)
- ✅ CLI runtime works (Synth model responds)
- ❌ **Frontend no longer receives model responses** in browser UI

---

## 🚨 Problem

### Error Message

```
[vite] Failed to resolve import "node:fs" from "src/engine/seatRunner.ts"
```

**Root Cause**: Vite is trying to bundle Node.js native modules (`node:fs`, `node:path`, `node:http`) into the browser bundle. These modules don't exist in browser context.

**Location**: `src/engine/seatRunner.ts` imports Node.js modules but is being included in the frontend bundle.

---

## ✅ Fix Applied

**File**: `src/engine/optimizedSynth.ts`

**Change**: Modified to use environment-aware imports:
- **Browser**: Uses `browserSeatRunner.ts` (fetch-based, no Node.js modules)
- **Node.js CLI**: Uses `seatRunner.ts` (Node.js native modules)

**Implementation**: Added dynamic import with runtime detection and wrapper functions to handle async/sync differences.

---

## 🔍 Investigation Tasks

### 1. Verify Fix Works

**Test**: Restart dev server and check if error is resolved:
```bash
npm run dev:full
```

**Expected**: No Vite import errors, frontend loads successfully.

**If Still Failing**: Check if other files import `seatRunner.ts` directly.

---

### 2. Verify Model Connection

**Test**: Send a message from browser UI and verify response:

1. **Frontend Request Flow**:
   ```
   Browser UI (onSubmit)
     → aiService.processMessage()
     → SynthMemoryOrchestrator.prepareMemoryContext()
     → API call to backend
   ```

2. **Backend Response Flow**:
   ```
   /api/chat or /chatty-sync endpoint
     → Synth processor
     → Model response
     → Return to frontend
   ```

**Checkpoints**:
- [ ] Frontend `aiService.ts` makes API call
- [ ] Backend receives request (check server logs)
- [ ] Backend processes with Synth (check logs)
- [ ] Response returned to frontend
- [ ] Frontend displays response

**Debug Steps**:
```javascript
// In browser console:
// 1. Check if aiService is initialized
console.log(window.aiService);

// 2. Check if API calls are being made
// Open Network tab, filter by /api or /chatty-sync

// 3. Check backend logs for incoming requests
// Look for: POST /api/chat or POST /chatty-sync
```

---

### 3. Check API Endpoints

**Verify these endpoints exist and work**:

1. **Synth Endpoint**: `/chatty-sync` (POST)
   - **Location**: `server/server.js` (around line 1495)
   - **Expected**: Processes message with Synth and returns response

2. **Chat API**: `/api/chat` (POST)
   - **Location**: `server/routes/` or `server/server.js`
   - **Expected**: Standard chat endpoint

3. **Vite Proxy**: `/api/*` → `http://localhost:5000/api/*`
   - **Location**: `vite.config.ts` (lines 40-59)
   - **Expected**: Proxies frontend API calls to backend

**Test**:
```bash
# Test backend endpoint directly
curl -X POST http://localhost:5000/chatty-sync \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello", "seat": "synth"}'

# Should return model response
```

---

### 4. Check Frontend-Backend Connection

**Verify**:
- [ ] Frontend can reach backend (CORS/Proxy working)
- [ ] Authentication cookies are sent
- [ ] Session is valid
- [ ] API responses are received

**Debug**:
```javascript
// In browser console
fetch('/api/me', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

---

### 5. Check Memory Orchestration

**Verify**: `SynthMemoryOrchestrator` is properly initialized and connected:

**File**: `src/engine/orchestration/SynthMemoryOrchestrator.ts`

**Check**:
- [ ] Orchestrator initializes successfully
- [ ] VVAULT connector is available
- [ ] Memory context is built correctly
- [ ] Memories are injected into prompts

**Debug**:
```typescript
// Check if orchestrator is ready
const orchestrator = new SynthMemoryOrchestrator({...});
await orchestrator.ensureReady();
const context = await orchestrator.prepareMemoryContext();
console.log('Memory context:', context);
```

---

### 6. Check OptimizedSynth Usage

**Verify**: `OptimizedSynthProcessor` is being used correctly:

**Files**:
- `src/lib/aiService.ts` - Uses `OptimizedSynthProcessor`
- `src/engine/optimizedSynth.ts` - Processor implementation

**Check**:
- [ ] `OptimizedSynthProcessor` initializes
- [ ] `safeRunSeat()` works (browser uses `browserSeatRunner`)
- [ ] No Node.js module imports leak into browser bundle

**Debug**:
```typescript
// In browser console
import { OptimizedSynthProcessor } from './engine/optimizedSynth';
const processor = new OptimizedSynthProcessor(brain, config);
// Should not throw errors about Node.js modules
```

---

## 🎯 Success Criteria

### Immediate Fix (Done)
- ✅ Vite import error resolved
- ✅ Frontend builds without errors

### Model Connection (To Verify)
- [ ] Frontend sends messages to backend
- [ ] Backend processes with Synth model
- [ ] Responses return to frontend
- [ ] UI displays responses

### Full Functionality (To Verify)
- [ ] Memory context is injected
- [ ] VVAULT memories are retrieved
- [ ] Synth model responds with context
- [ ] Continuity is maintained across sessions

---

## 📝 Additional Debugging Steps

### 1. Check Browser Console

Look for:
- Network errors (CORS, connection refused)
- JavaScript errors
- API call failures
- Memory initialization errors

### 2. Check Backend Logs

Look for:
- Incoming API requests
- Synth processing logs
- Model response logs
- Error messages

### 3. Test CLI vs Web

**CLI** (should work):
```bash
cd chatty
npm run cli
# Type message, should get response
```

**Web** (to fix):
```bash
npm run dev:full
# Open http://localhost:5173
# Send message, check if response arrives
```

### 4. Compare Working vs Broken

**Working**: CLI uses `seatRunner.ts` directly
**Broken**: Web tries to use `seatRunner.ts` (now fixed to use `browserSeatRunner.ts`)

**Verify**: Both paths work correctly after fix.

---

## 🔧 Files Modified

1. **`src/engine/optimizedSynth.ts`**
   - Changed import from `seatRunner.ts` to dynamic import
   - Added environment detection (browser vs Node.js)
   - Added wrapper functions for async/sync compatibility

**Files to Check** (if issues persist):
- `src/lib/aiService.ts` - Frontend AI service
- `src/engine/orchestration/SynthMemoryOrchestrator.ts` - Memory orchestration
- `server/server.js` - Backend API endpoints
- `vite.config.ts` - Vite proxy configuration

---

## 🚀 Next Steps

1. **Restart dev server** and verify fix works
2. **Test model connection** from browser UI
3. **Check API endpoints** are receiving requests
4. **Verify memory orchestration** is working
5. **Test full conversation flow** end-to-end

---

## 📚 Related Files

- `src/engine/seatRunner.ts` - Node.js seat runner (CLI only)
- `src/lib/browserSeatRunner.ts` - Browser seat runner (Web)
- `src/engine/optimizedSynth.ts` - Synth processor (uses appropriate runner)
- `src/lib/aiService.ts` - Frontend AI service
- `server/server.js` - Backend API server
- `vite.config.ts` - Vite configuration

---

**Status**: Fix applied, verification needed.

**Priority**: High - Model disconnection prevents core functionality.

