# Loading State Debug Fix

## Summary

Added comprehensive debug logging and safety timeouts to `App.tsx` and `Layout.tsx` to prevent loading state hangs and identify render-blocking conditions.

## Changes Made

### App.tsx

1. **Safety Timeout**: Added 30-second timeout to ensure `isLoading` is always cleared, even if auth flow hangs
2. **Debug Logging**: Added console.log statements at key points:
   - Render time: logs `isLoading` and `user` state
   - Auth effect start/completion
   - Backend readiness checks
   - `fetchMe()` calls and results
   - Migration status
   - Render path decisions (loading/login/redirect)

### Layout.tsx

1. **Safety Timeout**: Added 30-second timeout to ensure `isLoading` is always cleared
2. **Debug Logging**: Added console.log statements at key points:
   - Render time: logs `isLoading`, `user`, `threads.length`, and `activeId`
   - Auth effect start/completion
   - Backend readiness checks
   - `fetchMe()` calls and results
   - User data and picture
   - Render path decisions (loading/no-user/main-layout)

## Debug Log Format

All logs are prefixed with `[App.tsx]` or `[Layout.tsx]` and use emoji indicators:

- 🔍 = Debug/info
- ⏳ = Waiting/loading
- ✅ = Success
- ⚠️ = Warning
- ❌ = Error
- 🛑 = Completion
- 🚪 = Redirect/navigation
- ➡️ = User action

## Expected Console Output

### On App Load (No User)

```
🔍 [App.tsx] Render - isLoading: true user: null
🔍 [App.tsx] Auth effect starting
⏳ [App.tsx] Waiting for backend to be ready...
✅ [App.tsx] Backend ready
⏳ [App.tsx] fetchMe() starting
✅ [App.tsx] fetchMe() resolved: null
ℹ️ [App.tsx] No user session found
🛑 [App.tsx] Auth effect complete - isLoading → false
🔍 [App.tsx] Render - isLoading: false user: null
🔐 [App.tsx] Showing login/signup screen
```

### On App Load (With User)

```
🔍 [App.tsx] Render - isLoading: true user: null
🔍 [App.tsx] Auth effect starting
✅ [App.tsx] Backend ready
⏳ [App.tsx] fetchMe() starting
✅ [App.tsx] fetchMe() resolved: user: user@example.com
🎯 [App.tsx] Surgical migration completed - symbolic scoping breach recovered
🛑 [App.tsx] Auth effect complete - isLoading → false
🔍 [App.tsx] Render - isLoading: false user: user@example.com (user-id)
➡️ [App.tsx] User exists; redirecting to /app
```

### In Layout (After Redirect)

```
🔍 [Layout.tsx] Render - isLoading: true user: user@example.com (user-id) threads length: 0 activeId: null
🔍 [Layout.tsx] Auth effect starting
✅ [Layout.tsx] Backend ready
⏳ [Layout.tsx] fetchMe() starting
✅ [Layout.tsx] fetchMe() resolved: user: user@example.com
👤 [Layout.tsx] User data: {...}
🖼️ [Layout.tsx] User picture: ...
🎯 [CANONICAL] Creating canonical Synth immediately: ...
🛑 [Layout.tsx] Auth effect complete - isLoading → false
🔍 [Layout.tsx] Render - isLoading: false user: user@example.com (user-id) threads length: 1 activeId: thread_synth_...
✅ [Layout.tsx] Rendering main layout - user authenticated, threads: 1
```

## Safety Features

1. **Timeout Protection**: If auth flow takes >30 seconds, `isLoading` is automatically set to `false`
2. **Error Handling**: All errors are caught and logged, with `isLoading` always cleared in `finally` blocks
3. **Cleanup**: Timeouts are properly cleared on component unmount

## Troubleshooting

If you see loading state hanging:

1. **Check console logs** - Look for where the flow stops
2. **Check timeout warnings** - If you see `⚠️ Auth effect timeout`, the flow took >30 seconds
3. **Check backend readiness** - Look for `✅ Backend ready` or `⚠️ Backend readiness check failed`
4. **Check fetchMe results** - Look for `✅ fetchMe() resolved` to see if auth succeeded

## Files Modified

- `src/App.tsx` - Added debug logging and timeout
- `src/components/Layout.tsx` - Added debug logging and timeout

