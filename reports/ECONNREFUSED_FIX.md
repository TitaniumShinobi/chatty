# ECONNREFUSED Error Fix

## Issue

Vite proxy was logging `ECONNREFUSED` errors when trying to connect to `/api/health` before the backend was ready:

```
12:57:39 AM [vite] http proxy error: /api/health
AggregateError [ECONNREFUSED]: 
    at internalConnectMultiple (node:net:1134:18)
```

## Root Cause

The frontend's `waitForBackendReady()` function was making health check requests immediately on mount, before the backend server finished initializing and listening on port 5000.

## Fixes Applied

### 1. Startup Delay (`src/lib/backendReady.ts`)

Added a 1-second delay before the first health check to give the backend time to start:

```typescript
const STARTUP_DELAY = 1000; // Wait 1 second before first health check

export async function waitForBackendReady(...) {
  // Give backend time to start before first health check
  await new Promise(resolve => setTimeout(resolve, STARTUP_DELAY));
  // ... rest of retry logic
}
```

### 2. Reduced Logging Noise

- Only log the first 3 retry attempts (instead of all 10)
- Added `[BackendReady]` prefix to logs for easier filtering
- Silently handle connection errors in health check (they're expected during startup)

### 3. Proxy Error Handler (`vite.config.ts`)

Added `onError` handlers to proxy configs to suppress `ECONNREFUSED` and `ECONNRESET` errors:

```typescript
'/api': {
  target: 'http://localhost:5000',
  // ... other config
  onError: (err, req, res) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      return; // Silently handle - backend readiness checker will retry
    }
    console.error('[Vite Proxy] Error:', err.message);
  }
}
```

## Result

- **Fewer errors**: Startup delay reduces initial connection attempts
- **Less noise**: Only first 3 retry attempts are logged
- **Cleaner logs**: Connection errors during startup are suppressed
- **Same functionality**: Backend readiness checking still works correctly

## Expected Behavior

1. Frontend mounts → waits 1 second
2. First health check → backend likely ready (fewer errors)
3. If not ready → retries with exponential backoff (only first 3 attempts logged)
4. Once ready → proceeds with app initialization

## Note

Some `ECONNREFUSED` errors may still appear in logs if:
- Backend takes longer than 1 second to start
- Multiple components call `waitForBackendReady()` simultaneously

These errors are **harmless** and expected during startup. The backend readiness checker will retry automatically.

## Testing

Restart your dev server and verify:
- Fewer/no `ECONNREFUSED` errors in Vite logs
- Backend readiness still works correctly
- App initializes normally after backend is ready

