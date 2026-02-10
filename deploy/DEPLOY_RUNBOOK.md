# Chatty Deployment Runbook — chatty.thewreck.org

Target: DigitalOcean droplet at 165.245.136.194 (vvault-server)
Domain: chatty.thewreck.org via Cloudflare

---

## Task 1: Set up nginx vhost

```bash
# Copy the nginx config
sudo cp /opt/chatty/deploy/chatty.nginx /etc/nginx/sites-available/chatty

# Verify the proxy_pass port matches what Chatty is listening on
# Check current port:
grep -i "PORT" /opt/chatty/server/.env
# If PORT=5050, the nginx config is correct as-is
# If PORT=5000, edit the config:
# sudo sed -i 's/127.0.0.1:5050/127.0.0.1:5000/' /etc/nginx/sites-available/chatty

# Enable the site
sudo ln -sf /etc/nginx/sites-available/chatty /etc/nginx/sites-enabled/chatty

# Remove default site if it conflicts
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

Verify: `curl -H "Host: chatty.thewreck.org" http://127.0.0.1/` should return HTML.

---

## Task 2: Add Cloudflare DNS A record

In the Cloudflare dashboard for thewreck.org:

- Type: `A`
- Name: `chatty`
- IPv4: `165.245.136.194`
- Proxy status: **Proxied** (orange cloud ON)
- TTL: Auto

---

## Task 3: Configure Cloudflare SSL/TLS

In Cloudflare dashboard > SSL/TLS > Overview:

- Set SSL mode to **Full** (not Flexible, not Full Strict)
- Cloudflare terminates TLS, nginx listens on port 80, Cloudflare connects to origin over HTTP
- This is correct because we don't have an SSL cert on the origin — Cloudflare handles HTTPS for visitors

Optional but recommended:
- SSL/TLS > Edge Certificates > Always Use HTTPS: ON
- SSL/TLS > Edge Certificates > Automatic HTTPS Rewrites: ON

---

## Task 4: Verify environment variables

The file `/opt/chatty/server/.env` must contain all of these. Check and fill in any missing ones:

```bash
sudo cat /opt/chatty/server/.env
```

Required variables:

```env
NODE_ENV=production
PORT=5050

# Domain
PUBLIC_CALLBACK_BASE=https://chatty.thewreck.org
FRONTEND_URL=https://chatty.thewreck.org
CORS_ORIGIN=https://chatty.thewreck.org

# Auth
SESSION_SECRET=<generate: openssl rand -hex 32>
JWT_SECRET=<generate: openssl rand -hex 32>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# Supabase
SUPABASE_URL=<your Supabase project URL>
SUPABASE_ANON_KEY=<your Supabase anon key>

# AI Providers (at least one required)
AI_INTEGRATIONS_OPENAI_API_KEY=<your OpenAI API key>
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1

# OpenRouter (optional but used by Chatty)
OPENROUTER_API_KEY=<your OpenRouter key>
AI_INTEGRATIONS_OPENROUTER_API_KEY=<same key>
AI_INTEGRATIONS_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# VVAULT
VVAULT_API_BASE_URL=https://vvault.thewreck.org
VVAULT_URL=https://vvault.thewreck.org
```

Generate secrets if needed:
```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
```

---

## Task 5: Update Google OAuth

In Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client:

**Authorized JavaScript origins** — add:
```
https://chatty.thewreck.org
```

**Authorized redirect URIs** — add:
```
https://chatty.thewreck.org/api/auth/google/callback
```

Save changes. Changes take effect immediately.

---

## Task 6: Restart Chatty and verify

```bash
sudo systemctl daemon-reload
sudo systemctl restart chatty
sudo systemctl status chatty

# Watch logs for clean startup
sudo journalctl -u chatty -f --no-pager -n 50
```

Expected output should show:
- `API on :5050` (or :5000)
- No crash loops
- Supabase client initialized
- OAuth config showing `https://chatty.thewreck.org/api/auth/google/callback`

---

## Task 7: End-to-end verification

```bash
# 1. Test from droplet (bypasses Cloudflare)
curl -I http://127.0.0.1:5050/
# Expect: 200 OK with HTML

# 2. Test via nginx
curl -I -H "Host: chatty.thewreck.org" http://127.0.0.1/
# Expect: 200 OK

# 3. Test via Cloudflare (after DNS propagates)
curl -I https://chatty.thewreck.org/
# Expect: 200 OK

# 4. Test API health
curl https://chatty.thewreck.org/api/health
# Expect: JSON with status ok

# 5. Browser test
# - Open https://chatty.thewreck.org
# - Click "Sign in with Google"
# - Verify redirect works and login completes
# - Open Zen conversation, verify messages load from Supabase
# - Send a test message, verify AI responds
```

---

## Troubleshooting

**502 Bad Gateway:** Chatty isn't running or wrong port in nginx config
```bash
sudo systemctl status chatty
sudo journalctl -u chatty --no-pager -n 30
```

**SSL errors / redirect loops:** Cloudflare SSL mode is wrong
- Set to "Full" (not Flexible, not Full Strict)

**OAuth callback fails:** Redirect URI mismatch
- Check Google Console URIs match exactly: `https://chatty.thewreck.org/api/auth/google/callback`
- Check `PUBLIC_CALLBACK_BASE` in .env is `https://chatty.thewreck.org`

**CORS errors in browser:** CORS_ORIGIN doesn't match
- Ensure `CORS_ORIGIN=https://chatty.thewreck.org` in .env (no trailing slash)

**OOM during build:** Swap not active
```bash
sudo swapon --show
# If empty, re-enable: sudo swapon /swapfile
```
