# Google OAuth Setup Guide

## Current Configuration

Your server is configured to send:
```
redirect_uri=http://localhost:5173/api/auth/google/callback
```

## Required Fix

You need to add this exact redirect URI to your Google Cloud Console OAuth client.

### Steps to Fix:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your project (or the project with client ID: `633884797416-d8imb5942bqa6q0mgk9c1rcncvngnlko`)

2. **Navigate to OAuth Credentials**
   - Go to: **APIs & Services → Credentials**
   - Find your OAuth 2.0 Client ID: `633884797416-d8imb5942bqa6q0mgk9c1rcncvngnlko.apps.googleusercontent.com`
   - Click **Edit** (pencil icon)

3. **Add Authorized Redirect URI**
   - Under **"Authorized redirect URIs"**, click **"+ ADD URI"**
   - Add exactly: `http://localhost:5173/api/auth/google/callback`
   - **Important**: The URI must match EXACTLY (including http, no trailing slash, port 5173)

4. **Add Authorized JavaScript Origins** (if not already present)
   - Under **"Authorized JavaScript origins"**, add:
     - `http://localhost:5173` (for frontend)
     - `http://localhost:5000` (for backend)

5. **Save Changes**
   - Click **"SAVE"** at the bottom
   - Wait 1-2 minutes for changes to propagate

6. **Test OAuth Flow**
   - Restart your server: `npm run dev:full`
   - Try logging in with Google again

## Current Server Configuration

The server constructs the redirect URI from:
```javascript
redirect_uri: `${process.env.PUBLIC_CALLBACK_BASE}${process.env.CALLBACK_PATH}`
```

Your `server/.env` file should have:
- `PUBLIC_CALLBACK_BASE=http://localhost:5173` (frontend - where Google redirects)
- `CALLBACK_PATH=/api/auth/google/callback`
- Combined: `http://localhost:5173/api/auth/google/callback`

**Note**: The callback goes to the frontend, and Vite proxy forwards `/api/*` requests to the backend at `http://localhost:5000`.

## Verification

After adding the redirect URI, test with:
```bash
# Check what redirect URI the server is sending
curl -s "http://localhost:5000/api/auth/google" | grep -o "redirect_uri=[^&]*"
```

The redirect URI in the Google OAuth URL must **exactly match** what's in Google Cloud Console.
