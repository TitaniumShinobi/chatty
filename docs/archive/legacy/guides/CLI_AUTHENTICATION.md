# CLI Authentication Guide

## Overview

The Chatty CLI now supports authentication using the same user registry as the web interface. This allows memories to be shared between CLI and web.

## How It Works

1. **CLI uses the same authentication system** as the web interface
2. **Session cookies are stored** in `~/.chatty/cli-session.json`
3. **User ID is automatically used** for VVAULT memory storage
4. **Memories are shared** when both CLI and web use the same user account

## Usage

### First Time Setup

```bash
# Start CLI with authentication
npm run cli --login

# Or authenticate after starting
npm run cli
# Then type: /login
```

### Commands

- `/login` - Open browser for authentication
- `/logout` - Clear session and use isolated CLI user
- `/whoami` - Show current authentication status

### Authentication Flow

1. CLI opens browser to login page
2. User logs in via web interface (Google, Microsoft, GitHub, Apple, or Email)
3. After successful login, session is automatically saved
4. CLI uses authenticated user's ID for VVAULT memory storage

## Implementation Status

### ✅ Completed
- CLI authentication module (`src/cli/auth.ts`)
- Session storage in `~/.chatty/cli-session.json`
- User ID integration with VVAULT connector
- `/login`, `/logout`, `/whoami` commands
- Automatic session loading on startup

### 🔨 TODO (OAuth Callback Integration)

The OAuth callback handling needs to be completed:

1. **Option A: OAuth Callback Server** (Recommended)
   - CLI starts temporary HTTP server on port 5174
   - OAuth providers redirect to `http://localhost:5174/cli-auth-callback`
   - Server extracts session cookie from redirect
   - Cookie is saved for CLI use

2. **Option B: Manual Token Entry**
   - After web login, display a CLI token
   - User copies token and pastes into CLI
   - CLI exchanges token for session cookie

3. **Option C: Shared Cookie File**
   - Web interface writes session cookie to shared location
   - CLI reads cookie from same location
   - Works if both run on same machine

## Current Workaround

For now, you can manually share the session:

1. **Login via web interface** at `http://localhost:5173/login`
2. **Get session cookie** from browser DevTools:
   - Open DevTools (F12)
   - Go to Application → Cookies
   - Copy the `sid` cookie value
3. **Save to CLI session file**:
   ```bash
   mkdir -p ~/.chatty
   echo '{"cookie":"sid=<paste-cookie-value>","user":{"sub":"your-user-id","email":"your@email.com","name":"Your Name"},"expiresAt":<timestamp>}' > ~/.chatty/cli-session.json
   ```

## Next Steps

To complete the OAuth integration:

1. Update OAuth callback URLs to include CLI callback option
2. Implement callback handler in `src/cli/auth.ts`
3. Test with each OAuth provider (Google, Microsoft, GitHub, Apple)
4. Handle email/password login flow

## Environment Variables

- `CHATTY_API_URL` - API server URL (default: `http://localhost:5000`)
- `CHATTY_WEB_URL` - Web interface URL (default: `http://localhost:5173`)

## File Locations

- Session storage: `~/.chatty/cli-session.json`
- VVAULT path: Configured via `VVAULT_PATH` or `CHATTY_VVAULT_PATH`

