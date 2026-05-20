# Why Google OAuth Broke: Root Cause Analysis

## What Happened

The Google OAuth 400 error occurred due to a **mismatch between your server configuration and Google Cloud Console settings**.

## Timeline of Events

### 1. **Original Working Configuration** (Earlier)
- `.env` had: `PUBLIC_CALLBACK_BASE=http://localhost:5000` (backend)
- Google Console had: `http://localhost:5000/api/auth/google/callback` registered
- ✅ **This worked** - callback went directly to backend

### 2. **Configuration Change** (Recent)
- `.env` was changed to: `PUBLIC_CALLBACK_BASE=http://localhost:5173` (frontend)
- This was done to route the callback through the frontend (Vite proxy approach)
- ❌ **But Google Console was NOT updated** to match

### 3. **The Mismatch**
- Server now sends: `redirect_uri=http://localhost:5173/api/auth/google/callback`
- Google Console still expects: `http://localhost:5000/api/auth/google/callback` (or has neither)
- **Result**: Google rejects the request with `400: redirect_uri_mismatch`

## Why This Happened

### Root Cause #1: Incomplete Configuration Update
When the `.env` was changed from `localhost:5000` to `localhost:5173`, the corresponding Google Cloud Console update was either:
- Not done at all
- Done incorrectly
- Done but changes didn't propagate (takes 1-2 minutes)

### Root Cause #2: Two Valid Approaches (Confusion)
There are two valid OAuth callback approaches:

**Approach A: Backend Direct** (Simpler)
```
Google → http://localhost:5000/api/auth/google/callback → Backend handles everything
```
- ✅ Simpler
- ✅ Direct
- ✅ Less moving parts

**Approach B: Frontend Proxy** (More complex)
```
Google → http://localhost:5173/api/auth/google/callback → Vite proxy → Backend
```
- ✅ Allows frontend to handle redirects
- ❌ Requires Vite proxy configuration
- ❌ More complex flow

The codebase was switched from Approach A to Approach B, but the Google Console wasn't updated to match.

### Root Cause #3: Server Not Restarted
Even if Google Console was updated, the server might not have been restarted after the `.env` change, so it was still using old environment variables.

## Current State

**Server Configuration** (verified):
```bash
PUBLIC_CALLBACK_BASE=http://localhost:5173
CALLBACK_PATH=/api/auth/google/callback
Combined: http://localhost:5173/api/auth/google/callback
```

**Google Cloud Console** (unknown):
- Either has: `http://localhost:5000/api/auth/google/callback` (old, wrong)
- Or has: `http://localhost:5173/api/auth/google/callback` (new, correct)
- Or has: Neither (missing)

## The Fix

You need to ensure **both** match:

1. **Server `.env`** (already correct):
   ```
   PUBLIC_CALLBACK_BASE=http://localhost:5173
   ```

2. **Google Cloud Console** (needs verification/update):
   - Must have: `http://localhost:5173/api/auth/google/callback` in Authorized Redirect URIs
   - Must have: `http://localhost:5173` and `http://localhost:5000` in Authorized JavaScript Origins

3. **Server Restart** (required):
   - After any `.env` change, restart: `npm run dev:full`

## Prevention

To prevent this in the future:

1. **Document the OAuth flow** - Which approach (A or B) is being used?
2. **Update checklist** - When changing `.env`, always update Google Console
3. **Verification script** - Test that redirect URI matches before deploying
4. **Environment validation** - Add startup checks that verify OAuth config

## Summary

**The 400 error happened because:**
- Server was configured for frontend callback (`localhost:5173`)
- Google Console was still configured for backend callback (`localhost:5000`)
- **Mismatch = 400 Bad Request**

**The fix:**
- Update Google Cloud Console to match the server configuration
- Restart the server to ensure new `.env` values are loaded
- Test the complete OAuth flow

