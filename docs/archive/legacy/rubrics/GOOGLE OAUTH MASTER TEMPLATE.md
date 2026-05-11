**GOOGLE OAUTH MASTER TEMPLATE**  
**LOCAL RUNTIME REPOSITORIES**

**Use this template when auditing or configuring Google OAuth across Chatty, VVAULT, and other local runtime repos.**

**EXECUTIVE SUMMARY**

This document is a master reference for Google OAuth setup, troubleshooting, and environment auditing across local development repositories. It consolidates patterns from Chatty, VVAULT, and related runtimes so you can apply them consistently.

**Repositories covered:**

| Repository | Frontend Port | Backend Port |
| ----- | ----- | ----- |
| Chatty | 5173 | 5050 |
| VVAULT | 7784 | 8000 |
| *(Add other repos as needed)* |  |  |

\-----**PORT & URL REFERENCE**

| Repo | Frontend | Backend | Callback Host | Callback Path |
| ----- | ----- | ----- | ----- | ----- |
| Chatty | 5173 | 5050 | localhost:5050 | `/api/auth/google/callback` |
| VVAULT | 7784 | 8000 | localhost:8000 | `/api/auth/google/callback` |

**Rule:** OAuth callback must go to the **backend** port. The backend exchanges the code and redirects the user to the frontend with a token.

\-----**ENVIRONMENT FILE STRUCTURE (TEMPLATE)**

**Frontend env (root .env)**

| Aspect | Details |
| ----- | ----- |
| **Purpose** | Client-side OAuth hints or redirect URLs (if needed) |
| **Loading** | Via Vite / Webpack / framework `loadEnv()` |
| **Warning** | **Do NOT put secrets here** |

**Backend env (repo root or server/.env)**

| Aspect | Details |
| ----- | ----- |
| **Purpose** | Server-side OAuth credentials and URLs |
| **Loading** | Via `dotenv.config()` or `load_dotenv()` from **repo root** |
| **Critical** | Load from explicit path (e.g. `Path(__file__).parent.parent / ".env"`) so it works when started from subdirectories |

\-----**ENVIRONMENT VARIABLE MAPPING (TEMPLATE)**

| Variable | Chatty | VVAULT | Usage |
| ----- | ----- | ----- | ----- |
| `GOOGLE_CLIENT_ID` | ✅ server/.env | — | OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_ID` | — | ✅ root .env | Same purpose (VVAULT) |
| `GOOGLE_CLIENT_SECRET` | ✅ server/.env | — | OAuth secret |
| `GOOGLE_OAUTH_CLIENT_SECRET` | — | ✅ root .env | Same purpose (VVAULT) |
| `CALLBACK_PATH` | `/api/auth/google/callback` | `/api/auth/google/callback` | Callback path |
| `FRONTEND_URL` / `POST_LOGIN_REDIRECT` | `http://localhost:5173` | `http://localhost:7784` | Post-auth redirect |
| `ENABLE_DEV_LOGIN` | Optional | — | Skip Google (dev only) |

\-----**GOOGLE CLOUD CONSOLE SETUP (UNIVERSAL)**

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).  
2. Create or select an OAuth 2.0 Client ID (Web application type).  
3. Configure per repo:

| Repository | Authorized JavaScript origins | Authorized redirect URIs |
| ----- | ----- | ----- |
| **For Chatty:** | `http://localhost:5173` | `http://localhost:5050/api/auth/google/callback` |
| **For VVAULT:** | `http://localhost:7784` | `http://localhost:8000/api/auth/google/callback` |

4. Copy Client ID and Client Secret into the repo’s backend .env.

\-----**OAUTH FLOW ARCHITECTURE**

| Step | Description |
| ----- | ----- |
| **1\.** | Browser (frontend port) → Click "Sign in with Google" |
| **2\.** | → Frontend redirects to /api/auth/google |
| **3\.** | → Proxy forwards to Backend |
| **4\.** | → Backend redirects to Google |
| **5\.** | → User authenticates at Google |
| **6\.** | → Google redirects to Backend:PORT/api/auth/google/callback?code=... |
| **7\.** | → Backend exchanges code, creates session, redirects to Frontend/?token=... |
| **8\.** | → Frontend reads token from URL, stores in localStorage / cookie |

\-----**FIXES APPLIED (REUSABLE)**

1\. oauthlib InsecureTransportError (Python/Flask)

| Aspect | Detail |
| ----- | ----- |
| **Symptom** | `InsecureTransportError: OAuth 2 MUST utilize https` |
| **Cause** | `oauthlib` forbids HTTP by default; local dev uses `http://localhost`. |
| **Fix** | Set `OAUTHLIB_INSECURE_TRANSPORT=1` in the callback handler when `request.host` is `localhost` or `127.0.0.1`, before token exchange. Or set in `.env`. |

2\. Callback URL Derivation

| Aspect | Detail |
| ----- | ----- |
| **Symptom** | Token exchange fails with `redirect_uri` mismatch. |
| **Cause** | Session/cookie or env provided the wrong callback base URL. |
| **Fix** | Use `request.base_url` (or equivalent) in the callback handler so the callback URL always matches what Google redirected to. |

3\. .env Loading Path

| Aspect | Detail |
| ----- | ----- |
| **Symptom** | Credentials not loading; "OAuth not configured". |
| **Cause** | `load_dotenv()` or `dotenv.config()` without a path uses CWD; starting from a subdirectory misses `.env`. |
| **Fix** | Load from explicit repo root: |
| **Python Example** | `load_dotenv(Path(__file__).resolve().parent.parent / ".env")` |
| **Node Example** | `dotenv.config({ path: path.join(__dirname, '..', '.env') });` |

4\. Cookie Domain / Secure Flag (Node/Express)

| Aspect | Detail |
| ----- | ----- |
| **Symptom** | Session cookie not sent on callback; logout or session lost. |
| **Cause** | `secure: true` on cookies prevents `http://localhost` from receiving them. |
| **Fix** | Use `secure: false` (or condition on `NODE_ENV`) for localhost; `sameSite: 'lax'` for cross-origin callback. |

5\. Replit / Host-Specific Defaults

| Aspect | Detail |
| ----- | ----- |
| **Symptom** | Replit-specific logic runs in local dev. |
| **Cause** | `REPLIT_DEV_DOMAIN` or similar defaulted to a non-null value. |
| **Fix** | Default to `null` / `undefined` so host-specific logic only runs when the var is explicitly set. |

\-----**TROUBLESHOOTING QUICK REFERENCE**

| Issue | Check |
| ----- | ----- |
| HTTP 500 on callback | Backend logs; on localhost, include exception in response for debugging |
| "OAuth not configured" | `GOOGLE_CLIENT_ID` \+ `GOOGLE_CLIENT_SECRET` (or `GOOGLE_OAUTH_*`) in backend `.env` |
| InsecureTransportError | `OAUTHLIB_INSECURE_TRANSPORT=1` in callback path or `.env` |
| redirect\_uri mismatch | Google Console redirect URI must match backend exactly (port \+ path) |
| Credentials not loading | `.env` at repo root; explicit path in dotenv; restart backend after changes |
| Cookie not sent | `secure: false` for localhost; `sameSite` and `domain` correct |

\-----**VERIFICATION CHECKLIST** 

Per-Repo OAuth Health

| Repository | Health Check Command | Expected Output |
| ----- | ----- | ----- |
| **Chatty** | `GET http://localhost:5050/api/auth/google/health` | `oauth_configured: true` |
| **VVAULT** | `GET http://localhost:8000/api/auth/google/health` | `oauth_configured: true` |

Full Flow Test

| Step | Action/Expectation |
| ----- | ----- |
| **1\.** | Open frontend URL (e.g. `http://localhost:5173` or `http://localhost:7784`). |
| **2\.** | Click "Sign in with Google". |
| **3\.** | Complete Google auth. |
| **4\.** | Expect redirect to frontend with token/email/name in URL or via cookie. |
| **5\.** | Verify logged-in state. |

\-----**DIAGNOSTIC COMMANDS**

| Purpose | Command (Chatty) | Command (VVAULT) |
| ----- | ----- | ----- |
| **Is Frontend Running?** | `lsof -i :5173` | `lsof -i :7784` |
| **Is Backend Running?** | `lsof -i :5050` | `lsof -i :8000` |
| **Are OAuth vars loaded?** | \`grep \-E 'GOOGLE\_CLIENT | GOOGLE\_OAUTH |

\-----**DEV LOGIN FALLBACK (CHATTY)**

| Aspect | Detail |
| ----- | ----- |
| **Purpose** | When OAuth is not configured or for quick local testing. |
| **Step 1: .env** | Set `ENABLE_DEV_LOGIN=true` and `NODE_ENV=development` in `server/.env`. |
| **Step 2: Backend** | Restart backend. |
| **Step 3: Login** | Use "Dev Login" or `GET /api/auth/dev-login` from the frontend. |

\-----**SECURITY RECOMMENDATIONS**

| Recommendation | Detail |
| ----- | ----- |
| **1\. JWT Secret** | Use a strong, random value (e.g. `openssl rand -base64 32`). |
| **2\. Never commit `.env`** | Ensure `.env` is in `.gitignore`. |
| **3\. Separate credentials** | Use different OAuth clients for dev vs prod when possible. |
| **4\. Validation** | Add startup checks for required OAuth vars and log clearly when missing. |

\-----**TEMPLATE FOR NEW REPOS**

| Step | Action |
| ----- | ----- |
| **1\.** | Identify frontend port, backend port, callback path. |
| **2\.** | Add row to Port & URL Reference. |
| **3\.** | Add env var row (Client ID, Secret, redirect URL). |
| **4\.** | Add Google Console entries (origins \+ redirect URIs). |
| **5\.** | Ensure `.env` is loaded from repo root with explicit path. |
| **6\.** | Add health endpoint (e.g. `GET /api/auth/google/health`). |
| **7\.** | Document in this file or in repo-specific OAuth doc that links here. |

\-----**SOURCE DOCUMENTS**

| Repository | Source Documents |
| ----- | ----- |
| **Chatty** | `docs/guides/ENVIRONMENT_AUDIT_REPORT.md`, `docs/guides/ENVIRONMENT_SETUP.md` |
| **VVAULT** | `docs/LOCAL_DEV_TROUBLESHOOTING.md`, `docs/GOOGLE_OAUTH_LOCAL_SETUP.md` |
| **Ports** | `docs/guides/PORTS_AND_URLS.md` (Chatty) |

