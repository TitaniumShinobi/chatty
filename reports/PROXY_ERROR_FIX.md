# Proxy Error Fix: ECONNREFUSED on /api/me

## Problem

When running `npm run dev:full`, the frontend (Vite on port 5173) was making `/api/me` requests before the backend (Express on port 5000) was ready to accept connections, causing `ECONNREFUSED` errors.

## Root Cause

**Race Condition**: React components (`App.tsx` and `Layout.tsx`) were calling `fetchMe()` immediately on mount, which happens before the backend server finishes initializing and listening on port 5000.

## Solution

### 1. Backend Readiness Checker (`src/lib/backendReady.ts`)

Created a utility module that:
- Checks backend health via `/api/health` endpoint
- Implements exponential backoff retry logic
- Provides `waitForBackendReady()` function to wait for backend before API calls
- Provides `fetchWithRetry()` function for automatic retry on connection errors

### 2. Updated `fetchMe()` Function (`src/lib/auth.ts`)

- Now uses `fetchWithRetry()` instead of plain `fetch()`
- Automatically retries on connection errors with exponential backoff
- Better error handling for connection vs. authentication errors

### 3. Updated Component Mount Logic

**App.tsx** and **Layout.tsx**:
- Now wait for backend to be ready before calling `fetchMe()`
- Non-blocking: if readiness check fails, continues anyway (fetchMe handles retries)
- Provides user feedback during wait

### 4. Enhanced Health Endpoint (`server/server.js`)

- Added `/api/health` endpoint (proxied through Vite)
- Returns server status, timestamp, and uptime
- Available immediately after server starts listening

## How It Works

```
Frontend Startup:
1. React components mount
2. waitForBackendReady() checks /api/health
3. If not ready, retries with exponential backoff (200ms → 2s)
4. Once ready, proceeds with fetchMe()
5. fetchMe() uses fetchWithRetry() for additional resilience
```

## Retry Strategy

- **Initial delay**: 200ms
- **Max delay**: 2 seconds
- **Max retries**: 10 attempts (backend readiness) + 3 attempts (fetch retry)
- **Total max wait**: ~20 seconds (very conservative)

## Testing

To verify the fix:

1. **Start servers**:
   ```bash
   npm run dev:full
   ```

2. **Check console logs**:
   - Should see: `⏳ Waiting for backend to be ready...`
   - Then: `✅ Backend ready after X retry attempts`
   - No more `ECONNREFUSED` errors

3. **Test health endpoint**:
   ```bash
   curl http://localhost:5000/api/health
   # Should return: {"ok":true,"timestamp":"...","uptime":...}
   ```

## Error Handling

The solution gracefully handles:
- ✅ Backend not started yet (waits and retries)
- ✅ Backend slow to initialize (exponential backoff)
- ✅ Network errors (retries with backoff)
- ✅ Backend crashes (fails gracefully after max retries)
- ✅ Authentication errors (not retried, handled normally)

## Configuration

Retry behavior can be adjusted in `src/lib/backendReady.ts`:

```typescript
const MAX_RETRIES = 10;        // Backend readiness checks
const INITIAL_DELAY = 200;     // Start delay (ms)
const MAX_DELAY = 2000;         // Max delay between retries (ms)
const BACKEND_TIMEOUT = 5000;  // Health check timeout (ms)
```

## Future Improvements

- [ ] Add backend readiness indicator in UI
- [ ] Make retry configurable via environment variables
- [ ] Add metrics/logging for retry attempts
- [ ] Consider using WebSocket for real-time backend status

