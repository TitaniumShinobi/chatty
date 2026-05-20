/**
 * src/routes/api/middleware/jwt.js
 *
 * Express middleware to validate Supabase JWTs using JWKS (RS256).
 * - Fetches OpenID configuration from <SUPABASE_URL>/.well-known/openid-configuration
 * - Uses jose.createRemoteJWKSet for JWKS (handles key rotation)
 * - Verifies token issuer (iss) and optional audience (aud)
 * - Attaches decoded payload to req.user and sets req.user.uid from sub if present
 * - Provides async initJwtMiddleware() for JWKS prefetch at startup
 *
 * Required env:
 *  - SUPABASE_URL (e.g. https://<project-ref>.supabase.co)
 *
 * Install dependency:
 *   npm install jose node-fetch
 */

import fetch from 'node-fetch';
import { createRemoteJWKSet, jwtVerify } from 'jose';
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
if (!SUPABASE_URL) {
  console.warn('SUPABASE_URL not set — jwt middleware may fail until SUPABASE_URL is configured');
}
let jwks; // function returned by createRemoteJWKSet
let issuer;
let initPromise = null;

async function initJwks() {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL env var is required for JWT validation');
  issuer = SUPABASE_URL;
  const openidUrl = `${issuer}/.well-known/openid-configuration`;
  const res = await fetch(openidUrl);
  if (!res.ok) throw new Error(`Failed to fetch OpenID config from ${openidUrl}: ${res.status}`);
  const cfg = await res.json();
  if (!cfg.jwks_uri) throw new Error('OpenID config missing jwks_uri');
  jwks = createRemoteJWKSet(new URL(cfg.jwks_uri));
  return { jwks, issuer };
}

export async function initJwtMiddleware() {
  try {
    await initJwks();
    console.log('[JWT Middleware] JWKS and issuer initialized successfully.');
  } catch (err) {
    console.error('[JWT Middleware] Failed to initialize JWKS:', err?.message || err);
    process.exit(1);
  }
}

/**
 * jwtMiddleware(options)
 * options:
 *  - required: boolean (default true) — reject requests without Authorization
 *  - audience: string | string[] (optional) — expected aud claim
 */
export function jwtMiddleware(options = {}) {
  const { required = true, audience } = options;
  return async function (req, res, next) {
    try {
      if (!jwks) {
        if (!initPromise) initPromise = initJwks();
        await initPromise;
      }
      const authHeader = req.headers?.authorization || req.headers?.Authorization;
      if (!authHeader) {
        if (required) return res.status(401).json({ ok: false, error: 'Missing Authorization header' });
        req.user = null;
        return next();
      }
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) return res.status(400).json({ ok: false, error: 'Malformed Authorization header' });
      const token = match[1];
      const verifyOptions = { issuer };
      if (audience) verifyOptions.audience = audience;
      const { payload } = await jwtVerify(token, jwks, verifyOptions);
      req.user = payload;
      req.user.uid = req.user.sub || req.user.uid || null;
      return next();
    } catch (err) {
      console.error('JWT verification error:', err?.message ?? err);
      if (required) return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
      req.user = null;
      return next();
    }
  };
}
