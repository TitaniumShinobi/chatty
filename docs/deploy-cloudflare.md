# Deploying Chatty to Cloudflare

This guide covers deploying Chatty behind Cloudflare to a production domain.

## Prerequisites

- Cloudflare account with a registered domain
- All environment variables configured
- Codebase tested and ready for production

## Build Configuration

### Build Command
```bash
npm run build
```

### Output Directory
```
dist/
```

The Vite build outputs static assets to the `dist/` folder which can be served by Cloudflare Pages or proxied via Cloudflare.

### Production Start Command
```bash
npm run start:prod
```

This runs the Express server in production mode on port 5000.

## Environment Variables

### Required for Deployment

| Variable | Description | Where to Set |
|----------|-------------|--------------|
| `SUPABASE_URL` | Supabase project URL | Cloudflare Environment Variables |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key | Cloudflare Environment Variables |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only) | Cloudflare Secrets |
| `SESSION_SECRET` | JWT session signing secret | Cloudflare Secrets |
| `NODE_ENV` | Set to `production` | Cloudflare Environment Variables |

### OAuth Providers (Optional)

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `MICROSOFT_CLIENT_ID` | Microsoft OAuth client ID |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth client secret |
| `APPLE_CLIENT_ID` | Apple OAuth client ID |
| `APPLE_CLIENT_SECRET` | Apple OAuth client secret |

### Finance Integration Variables

| Variable | Description |
|----------|-------------|
| `VITE_FXSHINOBI_API_URL` | FXShinobi API base URL (defaults to `/api/fxshinobi`) |
| `VITE_VVAULT_API_URL` | VVAULT API base URL (defaults to `/api/vvault`) |
| `VVAULT_API_BASE_URL` | Server-side VVAULT API URL |

### Cloudflare Turnstile (Bot Protection)

| Variable | Description |
|----------|-------------|
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key |

## Deployment Options

### Option 1: Cloudflare Pages (Recommended for Static + API)

1. Connect your GitHub repository to Cloudflare Pages
2. Configure build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
3. Add environment variables in Cloudflare Pages settings
4. Deploy

For the API backend, use Cloudflare Workers or a separate server.

### Option 2: Full-Stack on External Host + Cloudflare Proxy

1. Deploy Chatty to your server (Replit, Railway, Render, etc.)
2. Add your domain to Cloudflare
3. Create a CNAME record pointing to your host
4. Enable Cloudflare proxy (orange cloud)
5. Configure SSL/TLS to "Full (strict)"

## Cloudflare Configuration

### DNS Settings

```
Type    Name    Content              Proxy
CNAME   @       your-host.com        Proxied
CNAME   www     your-host.com        Proxied
```

### Page Rules (Optional)

For SPA routing, ensure all routes return `index.html`:

```
URL: yourdomain.com/*
Setting: Cache Level - Bypass
```

### SSL/TLS

- Set encryption mode to **Full (strict)**
- Enable **Always Use HTTPS**
- Enable **Automatic HTTPS Rewrites**

### Caching

For the API routes, disable caching:

```
URL: yourdomain.com/api/*
Setting: Cache Level - Bypass
```

### Security Settings

1. Enable **Bot Fight Mode** for basic protection
2. Configure **Web Application Firewall (WAF)** rules as needed
3. Set up **Rate Limiting** for API endpoints

## SPA Routing

Ensure your server handles client-side routing by returning `index.html` for all non-API routes:

```javascript
// In Express (already configured in server.js)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});
```

## Health Check Endpoint

The app exposes `/api/health` for health checks:

```bash
curl https://yourdomain.com/api/health
```

## Post-Deployment Checklist

- [ ] Verify all environment variables are set
- [ ] Test authentication flows (login, signup, OAuth)
- [ ] Verify Supabase connection
- [ ] Test Finance tab and FXShinobi dashboard
- [ ] Check VVAULT API connectivity
- [ ] Verify Turnstile bot protection works
- [ ] Test on mobile devices
- [ ] Verify SSL certificate is valid
- [ ] Check Cloudflare Analytics for errors

## Troubleshooting

### CORS Issues
Ensure your API endpoints include proper CORS headers for your domain.

### OAuth Callback URLs
Update OAuth provider callback URLs to your production domain:
- Google: `https://yourdomain.com/api/auth/google/callback`
- GitHub: `https://yourdomain.com/api/auth/github/callback`

### WebSocket Connections
If using WebSockets, ensure Cloudflare WebSocket support is enabled.

### Mixed Content
Ensure all resources are loaded over HTTPS.
