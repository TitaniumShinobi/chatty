# Chatty Environment Setup Guide

## Overview

Chatty uses a **dual-port development setup**:

- **Frontend**: Port 5173 (Vite dev server)
- **Backend**: Port 5000 (Express API server)
- **Proxy**: Vite forwards `/api/*` requests to backend

## Quick Start

1. **Copy environment files**:

   ```bash
   cp server/env.example server/.env
   ```

2. **Validate configuration**:

   ```bash
   npm run validate-env
   # or
   node scripts/validate-env.js
   ```

3. **Start development servers**:
   ```bash
   npm run dev:full
   ```

## Port Configuration

### Backend (server/.env)

```bash
# Backend runs on port 5000
PORT=5000
CHAT_SERVER_PORT=5000

# Frontend URL (for CORS and redirects)
FRONTEND_URL=http://localhost:5173
```

### Frontend (vite.config.ts)

The Vite configuration automatically proxies `/api` requests to `http://localhost:5000`:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:5000',
    changeOrigin: true,
    secure: false,
  }
}
```

## VVAULT Configuration

### Required Environment Variables

Add these to `server/.env`:

```bash
# VVAULT Configuration
VVAULT_RUNTIME_PATH=/Users/devonwoodson/Documents/GitHub/vvault/runtimes
CHAT_CAPSULE_PATH=/Users/devonwoodson/Documents/GitHub/vvault/capsules
```

### Capsule Plug-and-Play

Capsules are automatically hydrated on server startup:

- Server validates VVAULT paths on startup
- Imported capsules are loaded from `CHAT_CAPSULE_PATH`
- Runtime data is stored in `VVAULT_RUNTIME_PATH`

## CORS Configuration

CORS is automatically configured in `server/server.js`:

```javascript
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL
      : "http://localhost:5173",
  credentials: true,
};
```

## Troubleshooting

### Port Conflicts

If port 5000 is already in use:

```bash
# Check what's using the port
lsof -i :5000

# Kill the process if needed
kill <PID>
```

### CORS Errors

If you see CORS errors:

1. Verify `FRONTEND_URL=http://localhost:5173` in `server/.env`
2. Restart the backend server
3. Clear browser cache

### VVAULT Path Issues

If capsules aren't loading:

1. Verify paths exist:
   ```bash
   ls -la $VVAULT_RUNTIME_PATH
   ls -la $CHAT_CAPSULE_PATH
   ```
2. Check server logs for VVAULT initialization messages
3. Ensure paths are absolute (not relative)

## Using Click in VS Code

When using the VS Code **Click** agent for development, a few settings keep the chat from hanging when you run long tasks.

When using the VS Code **Click** agent for development, a few settings keep the chat from hanging when you run long tasks.

1. **Background tasks** – mark watch/dev servers so the agent doesn’t wait for them to exit:

   ```jsonc
   // .vscode/tasks.json
   {
     "version": "2.0.0",
     "tasks": [
       {
         "label": "dev",
         "command": "pnpm",
         "args": ["dev"],
         "isBackground": true,
         "problemMatcher": [
           {
             "pattern": ".",
             "background": {
               "activeOnStart": true,
               "beginsPattern": "VITE .* ready",
               "endsPattern": "ready",
             },
           },
         ],
       },
     ],
   }
   ```

2. **Timeouts** – give the terminal more time to start/finish tasks:

   ```jsonc
   // .vscode/settings.json
   {
     "chat.tools.terminal.commandTimeout": 300000, // 5 min
     "chat.tools.terminal.shellIntegrationTimeout": 10000, // 10 s for zsh/p10k
   }
   ```

3. **Agent guardrails** – prevent interactive prompts and TUI programs by creating a rules file:

   ```markdown
   # .ai/agent-rules.md

   - Never invoke TUI programs (`vim`, `top`, `less`, etc.).
   - All long-running commands **must** be background=true.
   - Abort any command that runs longer than 5 min without output.
   - Pass secrets via environment variables or `.env` files rather than interactive prompts.
   ```

### Making this global

The examples above live in the workspace; they apply only when you open **this** repo. To keep Click responsive in *every* project, replicate the settings in your **user** settings file (Preferences → Settings → open JSON) and maintain a global copy of the agent rules at `~/.ai/agent-rules.md` as well. A sample user config might look like:

```jsonc
{
  "chat.tools.terminal.commandTimeout": 300000,
  "chat.tools.terminal.shellIntegrationTimeout": 10000,
  // future flag (not yet shipped) could make every run command
  // behave as if background=true was appended automatically:
  // "chat.tools.terminal.defaultBackground": true
}
```

> 💡 **Tip:** you can also create a universal wrapper script (see `scripts/chatty`) or shell alias
> that backgrounds whatever you ask Click to run.  That way `run chatty` or `run npm run dev`
> will always return immediately without needing any extra flags.

With these tweaks the Click chat stays responsive even when your dev server or build runs for minutes.

## Environment File Structure

```
chatty/
├── .env                    # Frontend env (optional, for VITE_* vars)
├── server/
│   └── .env               # Backend env (REQUIRED)
└── vite.config.ts         # Vite proxy configuration
```

## Validation

Run the validation script to check your configuration:

```bash
npm run validate-env
```

This will check:

- ✅ Port configuration (backend: 5000, frontend: 5173)
- ✅ FRONTEND_URL matches frontend port
- ✅ VVAULT paths exist (if configured)
- ✅ CORS configuration

## Production Notes

For production:

- Set `NODE_ENV=production` in `server/.env`
- Update `FRONTEND_URL` to your production domain
- Ensure VVAULT paths point to production storage
- Configure reverse proxy (nginx/traefik) if needed
