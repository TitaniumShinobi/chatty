# Google OAuth Fix Prompt for Coding LLM

Copy and paste this entire prompt to another coding LLM to fix the Google OAuth 400 error:

---

## Task: Fix Google OAuth 400 Error in Chatty Application

### Problem
The Chatty application is experiencing a `400 (Bad Request)` error when attempting to log in with Google OAuth. The error occurs during the OAuth callback flow.

### Current Configuration

**Environment Variables** (`chatty/server/.env`):
```
PUBLIC_CALLBACK_BASE=http://localhost:5173
CALLBACK_PATH=/api/auth/google/callback
GOOGLE_CLIENT_ID=633884797416-d8imb5942bqa6q0mgk9c1rcncvngnlko.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
POST_LOGIN_REDIRECT=http://localhost:5173
```

**Server Configuration** (`chatty/server/server.js`):
- OAuth initiation endpoint: `GET /api/auth/google`
- OAuth callback endpoint: `GET /api/auth/google/callback`
- Server runs on: `http://localhost:5000`
- Frontend runs on: `http://localhost:5173`

**Vite Proxy Configuration** (`chatty/vite.config.ts`):
- Proxies `/api/*` requests to `http://localhost:5000`

### Expected OAuth Flow

1. User clicks "Login with Google" → Frontend redirects to `/api/auth/google` (backend)
2. Backend redirects to Google OAuth with `redirect_uri=http://localhost:5173/api/auth/google/callback`
3. Google redirects back to `http://localhost:5173/api/auth/google/callback?code=...`
4. Vite proxy forwards request to backend: `http://localhost:5000/api/auth/google/callback?code=...`
5. Backend exchanges code for tokens, creates session, sets cookie
6. Backend redirects to `/app` (frontend)
7. Frontend shows Home page

### Current Issue

The server is sending `redirect_uri=undefinedundefined` when tested with curl, indicating environment variables are not being loaded correctly, OR the redirect URI being sent doesn't match what's registered in Google Cloud Console.

### Required Actions

1. **Verify Environment Variables Are Loaded**
   - Check that `dotenv.config()` is called before `OAUTH` object is created
   - Verify `.env` file is in `chatty/server/.env` (not `chatty/.env`)
   - Ensure server is restarted after `.env` changes

2. **Verify Redirect URI Configuration**
   - The redirect URI must be: `http://localhost:5173/api/auth/google/callback`
   - This must match EXACTLY in Google Cloud Console
   - Check that `PUBLIC_CALLBACK_BASE` and `CALLBACK_PATH` combine correctly

3. **Fix Server Code if Needed**
   - Ensure `OAUTH.redirect_uri` is constructed correctly
   - Ensure the same redirect URI is used in both:
     - Initial OAuth request (line ~60 in server.js)
     - Token exchange request (line ~97 in server.js)

4. **Update Google Cloud Console** (if not already done)
   - Add `http://localhost:5173/api/auth/google/callback` to Authorized redirect URIs
   - Add `http://localhost:5173` and `http://localhost:5000` to Authorized JavaScript origins

5. **Test and Verify**
   - Restart server after any changes
   - Test OAuth flow end-to-end
   - Check server logs for any errors

### Key Files to Check/Modify

- `chatty/server/server.js` - OAuth routes and callback handler
- `chatty/server/.env` - Environment variables
- `chatty/vite.config.ts` - Proxy configuration (should already be correct)
- `chatty/src/main.tsx` - React Router configuration
- `chatty/src/components/OAuthCallback.tsx` - Frontend callback handler (if needed)

### Verification Commands

```bash
# Check redirect URI being sent
cd chatty/server && node -e "require('dotenv').config(); console.log(process.env.PUBLIC_CALLBACK_BASE + process.env.CALLBACK_PATH);"
# Should output: http://localhost:5173/api/auth/google/callback

# Test OAuth initiation
curl -s "http://localhost:5000/api/auth/google" | grep -o "redirect_uri=[^&]*"
# Should show: redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fapi%2Fauth%2Fgoogle%2Fcallback

# Test server health
curl http://localhost:5000/health
# Should return: {"ok":true}
```

### Success Criteria

- No 400 errors when clicking "Login with Google"
- User is redirected to Google OAuth consent screen
- After authorizing, user is redirected back to Chatty
- User sees the Home page (not login screen)
- Session cookie is set and user is authenticated

### Important Notes

- The callback URL goes to the **frontend** (`http://localhost:5173`), not the backend
- Vite proxy forwards `/api/*` requests to the backend automatically
- The redirect URI in the token exchange must match the one sent to Google initially
- Server must be restarted after any `.env` file changes
- Google Cloud Console changes can take 1-2 minutes to propagate

### Error Handling

If you encounter errors, check:
1. Server console logs for detailed error messages
2. Browser DevTools → Network tab for the exact request/response
3. Browser DevTools → Console for JavaScript errors
4. That the server process has the latest `.env` values loaded

---

**Please fix the Google OAuth 400 error by:**
1. Diagnosing why the redirect URI is showing as `undefinedundefined`
2. Ensuring environment variables are loaded correctly
3. Verifying the redirect URI matches Google Cloud Console
4. Testing the complete OAuth flow
5. Providing clear instructions on what was fixed

