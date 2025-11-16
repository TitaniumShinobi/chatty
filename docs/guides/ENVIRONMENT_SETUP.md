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
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL
    : "http://localhost:5173",
  credentials: true
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

