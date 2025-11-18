# Google OAuth Fix Applied ✅

## Problem Identified

The `redirect_uri` was showing as `undefinedundefined` because:
- Environment variables were being read after the OAUTH object construction
- The redirect URI was being constructed inline in multiple places
- If env vars were undefined, it would concatenate `undefined + undefined`

## Fix Applied

### Changes to `server/server.js`:

1. **Moved dotenv.config() to top** (line 16)
   - Ensures environment variables are loaded before any use

2. **Created canonical REDIRECT_URI constant** (lines 19-21)
   ```javascript
   const PUBLIC_CALLBACK_BASE = process.env.PUBLIC_CALLBACK_BASE || 'http://localhost:5173';
   const CALLBACK_PATH = process.env.CALLBACK_PATH || '/api/auth/google/callback';
   const REDIRECT_URI = `${PUBLIC_CALLBACK_BASE.replace(/\/$/, '')}${CALLBACK_PATH.startsWith('/') ? CALLBACK_PATH : '/' + CALLBACK_PATH}`;
   ```
   - Normalizes trailing slashes from base URL
   - Ensures callback path starts with `/`
   - Provides fallback defaults if env vars are missing

3. **Added debug logging** (line 24)
   - Logs the redirect URI on server startup for verification

4. **Updated OAUTH object** (line 55)
   - Uses `REDIRECT_URI` constant instead of inline construction

5. **Updated token exchange** (line 107)
   - Uses `REDIRECT_URI` constant instead of inline construction
   - Added comment: "IMPORTANT: must match initial redirect_uri"

6. **Updated error logging** (line 113)
   - Uses `REDIRECT_URI` constant for consistent error messages

## Verification

✅ **REDIRECT_URI construction verified:**
```bash
$ node -e "require('dotenv').config(); ..."
✅ REDIRECT_URI: http://localhost:5173/api/auth/google/callback
```

✅ **No linter errors**

## Next Steps

1. **Restart the server** to load the fix:
   ```bash
   npm run dev:full
   ```

2. **Verify the redirect URI in server logs:**
   - Look for: `🔐 OAuth Redirect URI: http://localhost:5173/api/auth/google/callback`

3. **Verify Google Cloud Console:**
   - Authorized redirect URI: `http://localhost:5173/api/auth/google/callback`
   - Authorized JavaScript origins: `http://localhost:5173` and `http://localhost:5000`

4. **Test OAuth flow:**
   - Click "Login with Google"
   - Should redirect to Google consent screen
   - After authorization, should redirect back to Chatty

## Why This Fix Works

- **Single source of truth**: REDIRECT_URI is constructed once and used everywhere
- **Normalization**: Handles edge cases (trailing slashes, missing leading slashes)
- **Fallback defaults**: Prevents `undefinedundefined` errors
- **Consistency**: Same redirect URI used in both OAuth initiation and token exchange
- **Debugging**: Logs the redirect URI on startup for easy verification

