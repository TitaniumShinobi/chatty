import express from "express";
import fetch from "node-fetch"; // if on Node <18, else use global fetch
import cookieParser from "cookie-parser";
import cors from "cors";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { connectDB } from "./config/database.js";
import { Store } from "./store.js";
import { requireAuth } from "./middleware/auth.js";
import convRoutes from "./routes/conversations.js";
import aiRoutes from "./routes/ais.js";
import crypto from "node:crypto";
const { randomBytes } = crypto;
import vvaultRoutes from "./routes/vvault.js";
import previewRoutes from "./routes/preview.js";
import awarenessRoutes from "./routes/awareness.js";
import workspaceRoutes from "./routes/workspace.js";
import unrestrictedConversationRoutes from "./routes/unrestrictedConversation.js";
import orchestrationRoutes from "./routes/orchestration.js";
import diagnosticsRoutes from "./routes/diagnostics.js";
import chatRoutes from './routes/chat.js';
import linChatRoutes from './routes/linChat.js';
import vsiRoutes from './routes/vsi.js';
import gptsRoutes from './routes/gpts.js';
import transcriptsRoutes from './routes/transcripts.js';
import masterScriptsRoutes from './routes/masterScripts.js';
import scriptsRoutes from './routes/scripts.js';
import simForgeRoutes from './routes/simForge.js';
import fxshinobiRoutes from './routes/fxshinobi.js';
import vaultProxyRoutes from './routes/vault.js';
import suggestionsRoutes from './routes/suggestions.js';
import mocrProxyRoutes from './routes/mocr.js';
import transcribeRoutes from './routes/transcribe.js';
import attachmentsRoutes from './routes/attachments.js';
import searchRoutes from './routes/search.js';
import needleRoutes from './routes/needle.js';
import selfpromptRoutes from './routes/selfprompt.js';
import { initializeChromaDB, shutdownChromaDB, getChromaDBService } from "./services/chromadbService.js";
import { getChatService } from "./services/chatService.js";

dotenv.config();

console.log('[ENV CHECK]', {
  JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING',
  COOKIE_NAME: process.env.COOKIE_NAME || 'sid',
  NODE_ENV: process.env.NODE_ENV
});
console.log('[OPENROUTER]', {
  API_KEY_SET: !!(process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY),
  SOURCE: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ? 'replit_integration' : (process.env.OPENROUTER_API_KEY ? 'env_var' : 'none'),
  MODEL: process.env.OPENROUTER_MODEL || 'default'
});

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('💥 [CRASH] Uncaught Exception:', err);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [CRASH] Unhandled Rejection at:', promise, 'reason:', reason);
});

const CANONICAL_DOMAIN = process.env.CANONICAL_DOMAIN || 'chatty.thewreck.org';
const CALLBACK_PATH = process.env.CALLBACK_PATH || '/api/auth/google/callback';
const REDIRECT_URI = `https://${CANONICAL_DOMAIN}${CALLBACK_PATH}`;
const GOOGLE_CALLBACK = REDIRECT_URI;

const REPLIT_DOMAIN = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
const REPLIT_REDIRECT_URI = REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}${CALLBACK_PATH}` : null;
const POST_LOGIN_REDIRECT = REPLIT_DOMAIN
  ? `https://${REPLIT_DOMAIN}`
  : (process.env.POST_LOGIN_REDIRECT || process.env.FRONTEND_URL || "http://localhost:5173");

function isReplitPreview(req) {
  if (!REPLIT_DOMAIN) return false;
  const host = req.get('x-forwarded-host') || req.get('host') || '';
  if (host === REPLIT_DOMAIN || host === `${REPLIT_DOMAIN}:5050`) return true;
  const origin = req.get('origin') || '';
  if (origin.includes(REPLIT_DOMAIN)) return true;
  const referer = req.get('referer') || '';
  if (referer.includes(REPLIT_DOMAIN)) return true;
  return false;
}

function getRequestOrigin(req) {
  const origin = req.get('origin') || '';
  const referer = req.get('referer') || '';
  if (REPLIT_DOMAIN) {
    if (origin.includes(REPLIT_DOMAIN)) return `https://${REPLIT_DOMAIN}`;
    if (referer.includes(REPLIT_DOMAIN)) return `https://${REPLIT_DOMAIN}`;
  }
  if (origin && origin !== 'null') {
    try { return new URL(origin).origin; } catch {}
  }
  if (referer) {
    try { return new URL(referer).origin; } catch {}
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  if (host) return `${proto}://${host}`;
  return `https://${CANONICAL_DOMAIN}`;
}

function getRedirectUri(req) {
  if (isReplitPreview(req) && REPLIT_REDIRECT_URI) {
    return REPLIT_REDIRECT_URI;
  }
  return REDIRECT_URI;
}

function getPostLoginRedirect(req) {
  return getRequestOrigin(req);
}

// In production, never fall back to localhost for redirect/callback config.
if (process.env.NODE_ENV === 'production' && !REPLIT_DOMAIN) {
  const missing = [];
  if (!process.env.PUBLIC_CALLBACK_BASE) missing.push('PUBLIC_CALLBACK_BASE');
  if (!process.env.FRONTEND_URL) missing.push('FRONTEND_URL');
  if (missing.length) {
    console.error('❌ [Config] Missing required environment variables for production:', missing);
    console.error('❌ [Config] Refusing to start because OAuth/callback URLs must not fall back to localhost in production.');
    process.exit(1);
  }
}

console.log('--- OAUTH CONFIG DEBUG ---');
console.log('CANONICAL_DOMAIN:', CANONICAL_DOMAIN);
console.log('REPLIT_DOMAIN:', REPLIT_DOMAIN);
console.log('REDIRECT_URI:', REDIRECT_URI);
console.log('REPLIT_REDIRECT_URI:', REPLIT_REDIRECT_URI || '(not set)');
console.log('GOOGLE_CALLBACK:', GOOGLE_CALLBACK);
console.log('---------------------------');

// Override for MONGODB_URI to handle the provided connection string properly
if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('devonwoodson')) {
  // Ensure the connection string is used exactly as provided if it contains the full path
  // This is a safety check for the specific Atlas URI provided.
}

// SMTP Configuration
const SMTP_CONFIG = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER || 'info@thewreck.org',
    pass: process.env.EMAIL_PASS
  }
};

// Connect to database (optional in development)
if (process.env.MONGODB_URI) {
  try {
    await connectDB();
  } catch (error) {
    console.log('🚀 Continuing in development mode without database...');
  }
} else {
  console.log('🚀 Running in memory-only mode (no MONGODB_URI set)');
}

// Initialize user registry
try {
  const { initializeUserRegistry } = await import('./lib/userRegistry.js');
  await initializeUserRegistry();
} catch (error) {
  console.error('⚠️ [Server] Failed to initialize user registry:', error);
  // Continue anyway - registry will be created on first use
}

// Initialize memory persistence system
try {
  console.log('🧠 [Server] Initializing memory persistence system...');

  // Import memory system components
  const { getMemoryStore } = await import('../src/lib/MemoryStore.js');

  // Initialize memory store
  const memoryStore = getMemoryStore('./memory.db');
  await memoryStore.initialize();

  // Check if VVAULT path exists before initializing VVAULT components
  const VVAULT_BASE = process.env.VVAULT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
  let vvaultAvailable = false;
  try {
    await import('fs').then(fs => fs.promises.access(VVAULT_BASE));
    vvaultAvailable = true;
  } catch {
    console.log('ℹ️ [Server] VVAULT path not found, skipping VVAULT initialization (Replit mode)');
  }

  let watchedConstructCount = 0;
  if (vvaultAvailable) {
    const { getVVAULTTranscriptLoader } = await import('../src/lib/VVAULTTranscriptLoader.js');
    const { getVVAULTWatcher } = await import('../src/lib/VVAULTWatcher.js');

    // Initialize transcript loader
    const transcriptLoader = getVVAULTTranscriptLoader();

    // Load Katana's transcripts on startup
    await transcriptLoader.loadTranscriptFragments('katana-001', 'devon_woodson_1762969514958');

    // Initialize and start file watcher
    const watcher = getVVAULTWatcher();
    await watcher.addConstruct('katana-001', 'devon_woodson_1762969514958');
    await watcher.startWatching(30000); // 30 second intervals
    watchedConstructCount = watcher.getWatchStatus().constructCount;
  }

  // Get memory statistics
  const stats = await memoryStore.getStats();
  console.log('✅ [Server] Memory system initialized:', {
    messages: stats.messageCount,
    triples: stats.tripleCount,
    fragments: stats.fragmentCount,
    watchedConstructs: watchedConstructCount
  });

} catch (error) {
  console.error('❌ [Server] Failed to initialize memory system:', error);
  // Continue anyway - memory system will initialize on first use
}

// Initialize the new Chat Application Service
try {
  getChatService();
} catch (error) {
  console.error('❌ [Server] Failed to initialize ChatService:', error);
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.set("trust proxy", 1);

// CORS configuration
const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'https://chatty.thewreck.org')
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));

// Serve static files in production (built frontend)
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  console.log('📦 [Server] Serving static files from:', distPath);
}

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs (10 OAuth flows)
  message: { error: "Too many auth attempts, please try again later" }
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ [FATAL] JWT_SECRET environment variable is not set. Authentication cannot work without it.');
  process.exit(1);
}
const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';

const OAUTH = {
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect_uri: GOOGLE_CALLBACK,
  token_url: "https://oauth2.googleapis.com/token",
  userinfo_url: "https://www.googleapis.com/oauth2/v3/userinfo",
};

// OAuth configuration validation
function validateOAuthConfig() {
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ [OAuth] Missing required environment variables:', missing);
    console.error('❌ [OAuth] Current environment variables:', {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'MISSING',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING',
      PUBLIC_CALLBACK_BASE: process.env.PUBLIC_CALLBACK_BASE || 'DEFAULT',
      CALLBACK_PATH: process.env.CALLBACK_PATH || 'DEFAULT'
    });
    return false;
  }

  console.log('✅ [OAuth] All required environment variables are set');
  console.log('✅ [OAuth] OAuth configuration:', {
    client_id_length: OAUTH.client_id?.length || 0,
    client_secret_length: OAUTH.client_secret?.length || 0,
    redirect_uri: OAUTH.redirect_uri
  });
  return true;
}

// Validate OAuth configuration at startup
const oauthValid = validateOAuthConfig();
if (!oauthValid) {
  console.warn('⚠️ [OAuth] Google authentication will not work without proper environment variables');
}

// health endpoints
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/health/openrouter", async (_req, res) => {
  const apiKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct';
  const source = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ? 'replit_integration' : (process.env.OPENROUTER_API_KEY ? 'env_var' : 'none');

  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: 'No OpenRouter API key configured',
      source,
      model,
      baseURL
    });
  }

  const start = Date.now();
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ baseURL, apiKey });
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    });
    const elapsed = Date.now() - start;
    const reply = completion.choices?.[0]?.message?.content || '';
    res.json({
      ok: true,
      source,
      model,
      baseURL,
      responseTimeMs: elapsed,
      finishReason: completion.choices?.[0]?.finish_reason,
      replyPreview: reply.substring(0, 50),
      usage: completion.usage || null
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    res.status(503).json({
      ok: false,
      source,
      model,
      baseURL,
      responseTimeMs: elapsed,
      error: err.message,
      status: err.status || null,
      code: err.code || null
    });
  }
});

// Build artifacts health check endpoint
app.get("/api/health/build", (req, res) => {
  const { existsSync } = require('node:fs');
  const { join, dirname } = require('node:path');
  const { fileURLToPath } = require('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const compiledJsPath = join(__dirname, 'dist/engine/optimizedZen.js');
  const exists = existsSync(compiledJsPath);
  const isProduction = process.env.NODE_ENV === 'production';

  const status = (exists || !isProduction) ? 'ok' : 'error';
  const httpStatus = status === 'ok' ? 200 : 503;

  res.status(httpStatus).json({
    buildArtifactsPresent: exists,
    environment: isProduction ? 'production' : 'development',
    status: status,
    message: exists
      ? 'Build artifacts present'
      : isProduction
        ? 'ERROR: Build artifacts missing in production'
        : 'WARNING: Build artifacts missing (dev mode)',
    compiledJsPath: compiledJsPath,
    recommendation: exists
      ? null
      : 'Run: cd server && npm run build'
  });
});

// OAuth health check endpoint
app.get("/api/auth/google/health", (req, res) => {
  res.json({
    oauth_configured: !!OAUTH.client_id && !!OAUTH.client_secret,
    redirect_uri: OAUTH.redirect_uri,
    environment: process.env.NODE_ENV || 'development',
    client_id_present: !!OAUTH.client_id,
    client_secret_present: !!OAUTH.client_secret,
    validation_passed: oauthValid
  });
});

// DEV-ONLY: Login bypass for development/testing (disabled unless ENABLE_DEV_LOGIN is explicitly set)
app.post("/api/auth/dev-login", async (req, res) => {
  const devLoginAllowed = process.env.ENABLE_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production';
  if (!devLoginAllowed) {
    return res.status(403).json({ error: "Dev login is disabled" });
  }

  console.log('🔓 [Dev Auth] Dev login endpoint accessed');

  try {
    const { getOrCreateUser } = await import('./lib/userRegistry.js');
    const email = 'dev@chatty.local';
    const name = 'Dev User';
    const userProfile = await getOrCreateUser('dev_user_001', email, name);
    
    const payload = {
      id: userProfile.user_id,
      uid: 'dev_user_001',
      name: name,
      given_name: 'Dev',
      family_name: 'User',
      email: email,
      picture: null,
      locale: 'en'
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

    const domain = req.hostname && req.hostname.includes('thewreck.org') ? '.thewreck.org' : undefined;
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30,
      ...(domain ? { domain } : {})
    };
    console.log('[COOKIE SET]', {
      name: COOKIE_NAME,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      domain: cookieOptions.domain,
      maxAge: cookieOptions.maxAge
    });

    res.cookie(COOKIE_NAME, token, cookieOptions);

    console.log('✅ [Dev Auth] Dev login successful for:', email);
    res.json({ ok: true, user: payload, token });
  } catch (error) {
    console.error('❌ [Dev Auth] Dev login failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- OAuth security helpers ---
const oauthPendingStates = new Map();
const oauthExchangeCodes = new Map();
const OAUTH_STATE_TTL = 10 * 60 * 1000;
const EXCHANGE_CODE_TTL = 2 * 60 * 1000;

function buildAllowedOrigins() {
  const origins = new Set([`https://${CANONICAL_DOMAIN}`]);
  if (REPLIT_DOMAIN) origins.add(`https://${REPLIT_DOMAIN}`);
  if (POST_LOGIN_REDIRECT && POST_LOGIN_REDIRECT !== 'http://localhost:5173') origins.add(POST_LOGIN_REDIRECT);
  origins.add('http://localhost:5173');
  origins.add('http://localhost:5000');
  return origins;
}
const ALLOWED_ORIGINS = buildAllowedOrigins();

function signState(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyState(stateStr) {
  const parts = stateStr.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch { return null; }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthPendingStates) {
    if (now - val.created > OAUTH_STATE_TTL) oauthPendingStates.delete(key);
  }
  for (const [key, val] of oauthExchangeCodes) {
    if (now - val.created > EXCHANGE_CODE_TTL) oauthExchangeCodes.delete(key);
  }
}, 60 * 1000);

// start OAuth (front-end should hit this)
app.get("/api/auth/google", authLimiter, (req, res) => {
  console.log('🔍 [OAuth] /api/auth/google endpoint hit');
  try {
    const originUrl = getRequestOrigin(req);
    console.log('🔍 [OAuth] Detected origin via Origin/Referer/Host:', originUrl, {
      origin_header: req.get('origin') || '(none)',
      referer_header: req.get('referer') || '(none)',
      x_forwarded_host: req.get('x-forwarded-host') || '(none)',
      is_replit: isReplitPreview(req)
    });

    if (!ALLOWED_ORIGINS.has(originUrl)) {
      console.warn(`⚠️ [OAuth] Origin not in allowlist: ${originUrl}. Allowed:`, [...ALLOWED_ORIGINS]);
    }

    const dynamicRedirectUri = getRedirectUri(req);

    console.log('🔍 [OAuth] Environment check:', {
      has_client_id: !!process.env.GOOGLE_CLIENT_ID,
      has_client_secret: !!process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: dynamicRedirectUri,
      is_replit_preview: isReplitPreview(req),
      origin: originUrl
    });

    if (!OAUTH.client_id) {
      console.error("❌ [OAuth] GOOGLE_CLIENT_ID is not set in environment variables");
      return res.status(500).json({ error: "OAuth configuration missing: GOOGLE_CLIENT_ID" });
    }
    if (!OAUTH.client_secret) {
      console.error("❌ [OAuth] GOOGLE_CLIENT_SECRET is not set in environment variables");
      return res.status(500).json({ error: "OAuth configuration missing: GOOGLE_CLIENT_SECRET" });
    }

    const nonce = cryptoRandom();
    const stateData = { nonce, origin: originUrl, redirect_uri: dynamicRedirectUri };
    const stateToken = signState(stateData);

    oauthPendingStates.set(nonce, { origin: originUrl, redirect_uri: dynamicRedirectUri, created: Date.now() });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", OAUTH.client_id);
    url.searchParams.set("redirect_uri", dynamicRedirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", stateToken);

    console.log('✅ [OAuth] Redirecting to Google with redirect_uri:', dynamicRedirectUri, 'origin:', originUrl);
    res.redirect(url.toString());
  } catch (error) {
    console.error('❌ [OAuth] Unexpected error in /api/auth/google:', error);
    console.error('❌ [OAuth] Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// OAuth callback → exchange code → set cookie → redirect home
app.get("/api/auth/google/callback", authLimiter, async (req, res) => {
  try {
    const { code, error: oauthError, state: stateParam } = req.query;

    let originUrl = `https://${CANONICAL_DOMAIN}`;
    let callbackRedirectUri = REDIRECT_URI;
    let stateValid = false;

    if (stateParam) {
      const stateData = verifyState(stateParam);
      if (stateData && stateData.nonce && stateData.origin) {
        const pending = oauthPendingStates.get(stateData.nonce);
        if (pending && pending.origin === stateData.origin) {
          oauthPendingStates.delete(stateData.nonce);
          stateValid = true;
          const VALID_REDIRECT_URIS = new Set([REDIRECT_URI]);
          if (REPLIT_REDIRECT_URI) VALID_REDIRECT_URIS.add(REPLIT_REDIRECT_URI);
          if (pending.redirect_uri && VALID_REDIRECT_URIS.has(pending.redirect_uri)) {
            callbackRedirectUri = pending.redirect_uri;
          }
          if (ALLOWED_ORIGINS.has(stateData.origin)) {
            originUrl = stateData.origin;
          } else if (REPLIT_DOMAIN && stateData.origin === `https://${REPLIT_DOMAIN}`) {
            originUrl = stateData.origin;
          } else {
            console.warn(`⚠️ [OAuth Callback] Origin not in allowlist: ${stateData.origin}, using canonical`);
          }
        } else {
          console.warn('⚠️ [OAuth Callback] State nonce not found or origin mismatch (possible replay)');
        }
      } else {
        console.warn('⚠️ [OAuth Callback] Invalid state signature');
      }
    }

    if (!stateValid) {
      console.error('❌ [OAuth Callback] CSRF check failed — state invalid or missing');
      return res.redirect(`${originUrl}/?error=invalid_state`);
    }

    if (oauthError) {
      console.error('OAuth error from Google:', oauthError);
      return res.redirect(`${originUrl}/?error=${encodeURIComponent(oauthError)}`);
    }

    if (!code) {
      console.error('OAuth callback missing code parameter');
      return res.redirect(`${originUrl}/?error=missing_code`);
    }

    console.log('🔍 [OAuth Callback] Using redirect_uri:', callbackRedirectUri, 'origin:', originUrl);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackRedirectUri,
      })
    }).then(r => r.json());
    if (!tokenRes.access_token) {
      console.error("OAuth token exchange failed:", tokenRes);
      return res.redirect(`${originUrl}/?error=oauth_token_exchange_failed`);
    }

    const user = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json());
    console.log('🖼️ [OAuth] Google user info received:', {
      email: user.email,
      name: user.name,
      picture: user.picture ? `${user.picture.substring(0, 50)}...` : 'NO PICTURE',
      hasPicture: !!user.picture
    });

    const profile = {
      sub: user.sub,
      name: user.name,
      email: user.email,
      picture: user.picture,
      given_name: user.given_name,
      family_name: user.family_name,
      locale: user.locale,
      email_verified: user.email_verified
    };
    const doc = await Store.upsertUser({
      uid: profile.sub,
      name: profile.name,
      given_name: profile.given_name,
      family_name: profile.family_name,
      email: profile.email,
      picture: profile.picture,
      locale: profile.locale,
      emailVerified: profile.email_verified !== undefined ? profile.email_verified : true
    });

    let userId;
    try {
      const { getOrCreateUser } = await import('./lib/userRegistry.js');
      const userProfile = await getOrCreateUser(doc._id.toString?.() ?? doc._id, profile.email, profile.name);
      userId = userProfile.user_id;
      console.log(`✅ [User Registry] Registered user: ${userId} (${profile.email})`);

      try {
        const { GPTManager } = await import('./lib/gptManager.js');
        const gptManager = GPTManager.getInstance();
        gptManager.provisionUserConstructs(userId);
        console.log(`✅ [User Provisioning] System constructs provisioned for: ${userId}`);
      } catch (provisionError) {
        console.error('⚠️ [User Provisioning] Failed to provision constructs (non-critical):', provisionError);
      }
    } catch (regError) {
      console.error('⚠️ [User Registry] Failed to register user (non-critical):', regError);
      userId = profile.id || (doc._id.toString ? doc._id.toString() : doc._id);
    }

    const payload = {
      id: userId,
      uid: profile.sub,
      name: profile.name,
      given_name: profile.given_name,
      family_name: profile.family_name,
      email: profile.email,
      picture: profile.picture,
      locale: profile.locale
    };

    const sessionToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

    const originIsCanonical = originUrl.includes('thewreck.org');

    if (originIsCanonical) {
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 * 30,
        domain: '.thewreck.org'
      };
      console.log('[COOKIE SET] Setting cookie on canonical domain');
      res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
      console.log(`✅ OAuth success! Redirecting to ${originUrl}/app`);
      return res.redirect(`${originUrl}/app`);
    }

    const exchangeCode = cryptoRandom();
    oauthExchangeCodes.set(exchangeCode, { token: sessionToken, created: Date.now() });
    console.log(`✅ OAuth success! Redirecting to origin with exchange code: ${originUrl}`);
    res.redirect(`${originUrl}/api/auth/set-session?code=${encodeURIComponent(exchangeCode)}`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.redirect(`https://${CANONICAL_DOMAIN}/?error=auth_failed`);
  }
});

app.get("/api/auth/set-session", (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect('/?error=missing_code');
  }
  const entry = oauthExchangeCodes.get(code);
  if (!entry) {
    console.error('❌ [set-session] Invalid or expired exchange code');
    return res.redirect('/?error=invalid_or_expired_code');
  }
  oauthExchangeCodes.delete(code);

  if (Date.now() - entry.created > EXCHANGE_CODE_TTL) {
    console.error('❌ [set-session] Exchange code expired');
    return res.redirect('/?error=expired_code');
  }

  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  };
  console.log('[COOKIE SET] Setting cookie on origin domain via set-session');
  res.cookie(COOKIE_NAME, entry.token, cookieOptions);
  return res.redirect('/app');
});

app.get("/api/me", (req, res) => {
  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) return res.status(401).json({ ok: false });

  try {
    const user = jwt.verify(raw, JWT_SECRET);
    res.json({ ok: true, user });
  } catch (error) {
    console.error('❌ [Auth] JWT verification failed:', error.message);
    res.status(401).json({ ok: false });
  }
});

// Initialize user registry (for existing users)
app.post("/api/user/initialize-registry", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.uid || req.user?.sub;
    const email = req.user?.email || '';
    const name = req.user?.name || req.user?.given_name || 'User';

    if (!userId) {
      return res.status(400).json({ ok: false, error: "User ID not found in session" });
    }

    const { getOrCreateUser } = await import('./lib/userRegistry.js');
    const userProfile = await getOrCreateUser(userId, email, name);

    res.json({
      ok: true,
      message: "Registry initialized successfully",
      user: userProfile
    });
  } catch (error) {
    console.error('❌ [User Registry] Failed to initialize:', error);
    res.status(500).json({
      ok: false,
      error: error.message || "Failed to initialize registry"
    });
  }
});

// Proxy Google profile images to avoid CORS issues
app.get("/api/profile-image/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let user;
    try {
      user = jwt.verify(raw, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const tokenUserId = user.sub || user.id || user.uid;
    if (!tokenUserId || tokenUserId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Choose image: explicit OAuth picture first, otherwise gravatar/identicon from email
    let imageUrl = user.picture;
    if (!imageUrl && user.email) {
      const { createHash } = await import('crypto');
      const hash = createHash('md5').update(user.email.trim().toLowerCase()).digest('hex');
      imageUrl = `https://www.gravatar.com/avatar/${hash}?d=identicon&s=128`;
    }

    if (!imageUrl) {
      return res.status(404).json({ error: "No profile picture available" });
    }

    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Chatty/1.0)'
      }
    });

    if (!imageResponse.ok) {
      return res.status(404).json({ error: "Image not found" });
    }

    // Set appropriate headers
    res.set({
      'Content-Type': imageResponse.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*'
    });

    // Stream the image data
    imageResponse.body.pipe(res);
  } catch (error) {
    console.error('Profile image proxy error:', error);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

// logout
app.post("/api/logout", (req, res) => {
  const domain = req.hostname && req.hostname.includes('thewreck.org') ? '.thewreck.org' : undefined;
  res.clearCookie(COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(domain ? { domain } : {})
  });
  res.json({ ok: true });
});

// Delete account - full cleanup
app.post("/api/auth/delete-account", requireAuth, async (req, res) => {
  const userId = req.user?.sub || req.user?.id;
  const userEmail = req.user?.email;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  console.log(`🗑️ [DeleteAccount] Starting account deletion for user: ${userId} (${userEmail})`);

  const deletionLog = {
    userId,
    email: userEmail,
    deletedAt: new Date().toISOString(),
    results: {}
  };

  try {
    // 1. Delete from Supabase vault_files
    try {
      const { getSupabaseClient } = await import('./lib/supabaseClient.js');
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: userFiles, error: countError } = await supabase
          .from('vault_files')
          .select('id, filename')
          .eq('user_id', userId);

        const fileCount = userFiles?.length || 0;
        console.log(`🗑️ [DeleteAccount] Found ${fileCount} vault_files for user ${userId}`);

        if (fileCount > 0) {
          const { error: deleteError } = await supabase
            .from('vault_files')
            .delete()
            .eq('user_id', userId);

          if (deleteError) {
            console.error(`❌ [DeleteAccount] Supabase vault_files delete error:`, deleteError);
            deletionLog.results.vault_files = { error: deleteError.message, attempted: fileCount };
          } else {
            console.log(`✅ [DeleteAccount] Deleted ${fileCount} vault_files`);
            deletionLog.results.vault_files = { deleted: fileCount };
          }
        } else {
          deletionLog.results.vault_files = { deleted: 0 };
        }

        // 2. Delete from Supabase conversations table if it exists
        try {
          const { data: convos } = await supabase
            .from('conversations')
            .select('id')
            .eq('user_id', userId);

          if (convos && convos.length > 0) {
            const { error: convDeleteError } = await supabase
              .from('conversations')
              .delete()
              .eq('user_id', userId);

            deletionLog.results.supabase_conversations = convDeleteError
              ? { error: convDeleteError.message }
              : { deleted: convos.length };
            console.log(`✅ [DeleteAccount] Deleted ${convos.length} Supabase conversations`);
          }
        } catch (convErr) {
          console.log(`ℹ️ [DeleteAccount] No conversations table or no user data:`, convErr.message);
        }

        // 3. Delete from Supabase Storage buckets (attachments, avatars)
        try {
          const buckets = ['attachments', 'avatars', 'construct-assets'];
          for (const bucket of buckets) {
            const { data: files } = await supabase.storage.from(bucket).list(userId);
            if (files && files.length > 0) {
              const filePaths = files.map(f => `${userId}/${f.name}`);
              await supabase.storage.from(bucket).remove(filePaths);
              console.log(`✅ [DeleteAccount] Removed ${files.length} files from ${bucket} bucket`);
              deletionLog.results[`storage_${bucket}`] = { deleted: files.length };
            }
          }
        } catch (storageErr) {
          console.log(`ℹ️ [DeleteAccount] Storage cleanup note:`, storageErr.message);
        }
      } else {
        console.log(`ℹ️ [DeleteAccount] Supabase client not available - skipping Supabase cleanup`);
        deletionLog.results.supabase = { skipped: 'client not available' };
      }
    } catch (supabaseErr) {
      console.error(`❌ [DeleteAccount] Supabase cleanup error:`, supabaseErr);
      deletionLog.results.supabase = { error: supabaseErr.message };
    }

    // 4. Delete from SQLite: GPTs + AIs + user_registry via managers
    try {
      const { GPTManager } = await import('./lib/gptManager.js');
      const { AIManager } = await import('./lib/aiManager.js');
      const gptManager = GPTManager.getInstance();
      const aiManager = AIManager.getInstance();
      const db = gptManager.db;

      const gptResult = db.prepare('DELETE FROM gpts WHERE user_id = ?').run(userId);
      console.log(`✅ [DeleteAccount] Deleted ${gptResult.changes} GPTs from SQLite`);
      deletionLog.results.sqlite_gpts = { deleted: gptResult.changes };

      const aiResult = db.prepare('DELETE FROM ais WHERE user_id = ?').run(userId);
      console.log(`✅ [DeleteAccount] Deleted ${aiResult.changes} AIs from SQLite`);
      deletionLog.results.sqlite_ais = { deleted: aiResult.changes };

      try {
        const regResult = db.prepare('DELETE FROM user_registry WHERE user_id = ?').run(userId);
        console.log(`✅ [DeleteAccount] Deleted user registry entry`);
        deletionLog.results.sqlite_registry = { deleted: regResult.changes };
      } catch (regErr) {
        console.log(`ℹ️ [DeleteAccount] User registry cleanup:`, regErr.message);
      }
    } catch (dbErr) {
      console.error(`❌ [DeleteAccount] SQLite cleanup error:`, dbErr.message);
      deletionLog.results.sqlite = { error: dbErr.message };
    }

    // 7. Clear cookie / session
    const domain = req.hostname && req.hostname.includes('thewreck.org') ? '.thewreck.org' : undefined;
    res.clearCookie(COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      ...(domain ? { domain } : {})
    });

    console.log(`✅ [DeleteAccount] Account deletion complete for ${userId}`, deletionLog.results);

    res.json({
      success: true,
      message: 'Account and all associated data have been permanently deleted.',
      deletionSummary: deletionLog.results
    });
  } catch (error) {
    console.error(`❌ [DeleteAccount] Fatal error:`, error);
    res.status(500).json({ success: false, error: 'Account deletion failed. Please try again.' });
  }
});

// Debug session endpoint (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/session', (req, res) => {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) {
      return res.json({ ok: false, user: null });
    }

    try {
      const user = jwt.verify(raw, JWT_SECRET);
      res.json({ ok: true, user });
    } catch {
      res.json({ ok: false, user: null });
    }
  });
}

// Mount conversation routes with auth
app.use("/api/conversations", requireAuth, convRoutes);
app.use("/api/diagnostics", requireAuth, diagnosticsRoutes);


// Mount AI routes with auth
app.use("/api/ais", requireAuth, aiRoutes);

// Mount VVAULT routes with auth
app.use("/api/vvault", requireAuth, vvaultRoutes);
console.log('✅ [Server] VVAULT routes mounted at /api/vvault');

// Mount VSI (Verified Sentient Intelligence) routes
app.use("/api/vsi", vsiRoutes);
console.log('✅ [Server] VSI zero-trust routes mounted at /api/vsi');

// Mount unrestricted conversation routes with auth
app.use("/api/conversation", requireAuth, unrestrictedConversationRoutes);
console.log('✅ [Server] Unrestricted conversation routes mounted at /api/conversation');

// Mount orchestration routes with auth
app.use("/api/orchestration", requireAuth, orchestrationRoutes);
console.log('✅ [Server] Orchestration routes mounted at /api/orchestration');

// Mount awareness routes (time context, etc.)
app.use("/api/awareness", awarenessRoutes);
console.log('✅ [Server] Awareness routes mounted at /api/awareness');

// Preview synthesis proxy (no auth required for now; adjust if needed)
app.use("/api/preview", previewRoutes);

// Workspace context routes (for editor integration - like Copilot)
app.use("/api/workspace", requireAuth, workspaceRoutes);
console.log('✅ [Server] Workspace routes mounted at /api/workspace');

// New Chat App routes
app.use("/api/app", requireAuth, chatRoutes);
console.log('✅ [Server] Chat App routes mounted at /api/app');

// Lin Chat routes (OpenRouter-powered)
app.use("/api/lin", requireAuth, linChatRoutes);
console.log('✅ [Server] Lin Chat routes mounted at /api/lin');

// GPT Creator routes
app.use("/api/gpts", requireAuth, gptsRoutes);
console.log('✅ [Server] GPT routes mounted at /api/gpts');

// Transcripts routes (for ChatGPT/memory uploads)
app.use("/api/transcripts", requireAuth, transcriptsRoutes);
console.log('✅ [Server] Transcripts routes mounted at /api/transcripts');

// Master Scripts routes (autonomy stack for constructs)
app.use("/api/master", requireAuth, masterScriptsRoutes);
console.log('✅ [Server] Master Scripts routes mounted at /api/master');

// Scripts routes (GPTCreator compatibility)
app.use("/api/scripts", requireAuth, scriptsRoutes);
console.log('✅ [Server] Scripts routes mounted at /api/scripts');

// simForge routes (personality extraction and identity forging)
app.use("/api/simforge", requireAuth, simForgeRoutes);
app.use("/api/fxshinobi", fxshinobiRoutes);
app.use("/api/vault", vaultProxyRoutes);
app.use("/api/mocr", requireAuth, mocrProxyRoutes);
app.use("/api/transcribe", transcribeRoutes);
app.use("/api/suggestions", requireAuth, suggestionsRoutes);
app.use("/api/attachments", requireAuth, attachmentsRoutes);
app.use("/api/search", requireAuth, searchRoutes);
app.use("/api/needle", requireAuth, needleRoutes);
app.use("/api/selfprompt", selfpromptRoutes);
console.log('✅ [Server] Needle receipt retriever mounted at /api/needle');
console.log('✅ [Server] simForge routes mounted at /api/simforge');
console.log('✅ [Server] FXShinobi proxy routes mounted at /api/fxshinobi');
console.log('✅ [Server] MOCR proxy routes mounted at /api/mocr');
console.log('✅ [Server] Transcribe (ASR) routes mounted at /api/transcribe');
console.log('✅ [Server] VVAULT proxy routes mounted at /api/vault');
console.log('✅ [Server] Suggestions routes mounted at /api/suggestions');
console.log('✅ [Server] Attachments routes mounted at /api/attachments');

function cryptoRandom() {
  return randomBytes(16).toString("hex");
}

// SPA catch-all: serve index.html for client-side routing in production
if (isProduction) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

const PORT = process.env.PORT || 5050;

function startServer(port, retryCount = 0) {
  const srv = app.listen(port, '0.0.0.0', () => console.log(`API on :${port}`));
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retryCount === 0) {
      console.warn(`⚠️ [Server] Port ${port} in use — killing stale process and retrying...`);
      try {
        execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' });
      } catch (_) {}
      setTimeout(() => startServer(port, 1), 1000);
    } else if (err.code === 'EADDRINUSE') {
      console.error(`❌ [Server] Port ${port} still in use after cleanup. Server cannot start.`);
      console.error(`❌ [Server] Please manually kill the process using port ${port} and restart.`);
    } else {
      console.error(`❌ [Server] Failed to start:`, err.message);
    }
  });
}

startServer(PORT);

// Supabase Realtime subscription disabled for performance
// WebSocket overhead + RLS policy parsing adds latency with no active consumers
// Re-enable when live cross-app sync is implemented:
// (async () => {
//   const { subscribeToConversations } = await import('../vvaultConnector/supabaseStore.js');
//   const channel = await subscribeToConversations((payload) => { ... });
// })();
console.log('ℹ️ [Server] Supabase Realtime disabled (no active consumers — saves WebSocket overhead)');

// Bootstrap master scripts autonomy stack for system constructs
(async () => {
  try {
    const { masterScriptsManager } = await import('./lib/masterScriptsBridge.js');
    const systemConstructs = ['zen-001', 'lin-001', 'sera-001', 'nova-001'];
    const userId = 'system';
    
    for (const constructId of systemConstructs) {
      try {
        await masterScriptsManager.initializeConstruct(constructId, userId);
        console.log(`✅ [Bootstrap] ${constructId} autonomy stack ready (needle + identity + state + independence)`);
      } catch (err) {
        console.log(`⚠️ [Bootstrap] ${constructId} init deferred: ${err.message}`);
      }
    }
    console.log(`🚀 [Bootstrap] Master scripts ensemble active for ${systemConstructs.length} constructs`);
  } catch (err) {
    console.warn('⚠️ [Bootstrap] Master scripts bootstrap failed:', err.message);
  }
})();

// Idempotent seed: ensure nova-001 has memory config in both gpts and ais tables
(async () => {
  try {
    const { GPTManager } = await import('./lib/gptManager.js');
    const { AIManager } = await import('./lib/aiManager.js');
    const gptDb = GPTManager.getInstance().db;
    const aiDb = AIManager.getInstance().db;

    const novaGpt = gptDb.prepare('SELECT id FROM gpts WHERE id = ? OR construct_callsign = ?').get('nova-001', 'nova-001');
    if (novaGpt) {
      gptDb.prepare('UPDATE gpts SET memory_enabled = 1, memory_profile = ?, roleplay_enabled = 1 WHERE id = ? OR construct_callsign = ?').run('continuitygpt', 'nova-001', 'nova-001');
      console.log('✅ [Bootstrap] nova-001 config updated in gpts (memory_enabled=1, memory_profile=continuitygpt, roleplay_enabled=1)');
    } else {
      gptDb.prepare(`INSERT OR IGNORE INTO gpts (id, name, description, construct_callsign, model_id, user_id, is_active, memory_enabled, memory_profile, roleplay_enabled)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, 1)`).run(
        'nova-001', 'Nova', 'Devon\'s partner construct', 'nova-001', 'openrouter/auto', 'system', 'continuitygpt'
      );
      console.log('✅ [Bootstrap] nova-001 inserted into gpts with memory+roleplay config');
    }

    const novaAi = aiDb.prepare('SELECT id FROM ais WHERE id = ? OR construct_callsign = ?').get('nova-001', 'nova-001');
    if (novaAi) {
      aiDb.prepare('UPDATE ais SET memory_enabled = 1, memory_profile = ?, roleplay_enabled = 1 WHERE id = ? OR construct_callsign = ?').run('continuitygpt', 'nova-001', 'nova-001');
      console.log('✅ [Bootstrap] nova-001 config updated in ais (memory_enabled=1, memory_profile=continuitygpt, roleplay_enabled=1)');
    } else {
      aiDb.prepare(`INSERT OR IGNORE INTO ais (id, name, description, construct_callsign, model_id, user_id, is_active, memory_enabled, memory_profile, roleplay_enabled)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, 1)`).run(
        'nova-001', 'Nova', 'Devon\'s partner construct', 'nova-001', 'openrouter/auto', 'system', 'continuitygpt'
      );
      console.log('✅ [Bootstrap] nova-001 inserted into ais with memory+roleplay config');
    }
  } catch (err) {
    console.warn('⚠️ [Bootstrap] Nova memory config seed failed:', err.message);
  }
})();

// Start selfprompt proactive emission loop
(async () => {
  try {
    const { startSelfpromptLoop } = await import('./lib/selfpromptEngine.js');
    startSelfpromptLoop();
    console.log('✅ [Bootstrap] Selfprompt proactive emission loop started');
  } catch (err) {
    console.warn('⚠️ [Bootstrap] Selfprompt loop start failed:', err.message);
  }
})();

// Kick off background services without blocking auth/API availability
// FORCE RUN MODE: Skip ChromaDB initialization to prevent 45-second delays
console.log('🚀 [Server] Running in FORCE MODE - skipping ChromaDB initialization for faster startup');
console.log('💡 [Server] ChromaDB features disabled. Capsule system will use file-based memory only.');

// Optional: Still try ChromaDB in background but don't wait for it
if (process.env.ENABLE_CHROMADB === 'true') {
  void (async () => {
    try {
      console.log('🔄 [Server] Attempting ChromaDB initialization in background...');
      const started = await initializeChromaDB();
      const chromaService = getChromaDBService();

      // Short readiness wait so we don't stall boot; health monitor will keep trying
      const ready = await chromaService.waitForReady(5000);
      if (ready) {
        console.log('✅ [Server] ChromaDB confirmed ready');
      } else {
        const status = await chromaService.getStatus();
        console.warn('⚠️ [Server] ChromaDB not ready yet; continuing and will retry in background');
        if (status.lastError) {
          console.warn(`⚠️ [Server] Last error: ${status.lastError}`);
        }
      }

      chromaService.startHealthMonitor();
      if (!started) {
        console.warn('⚠️ [Server] ChromaDB start reported failure; health monitor will keep retrying');
      }
    } catch (error) {
      console.error('⚠️ [Server] Failed to initialize ChromaDB (non-blocking):', error);
    }

    // Initialize IdentityService after ChromaDB kick-off (non-blocking)
    try {
      const { getIdentityService } = await import('./services/identityService.js');
      const identityService = getIdentityService();
      await identityService.initialize();
      console.log('✅ [Server] IdentityService initialized');
    } catch (error) {
      console.warn('⚠️ [Server] IdentityService initialization failed (will retry on first use):', error);
    }
  })();
} else {
  console.log('🚫 [Server] ChromaDB initialization skipped (set ENABLE_CHROMADB=true to enable)');
  console.log('🚫 [Server] IdentityService initialization skipped (ChromaDB dependency)');
}

// Initialize Capsule Maintenance Cron
try {
  const { initializeCapsuleCron } = await import('./cron/capsuleMaintenance.js');
  initializeCapsuleCron();
} catch (error) {
  console.error('❌ [Server] Failed to initialize capsule cron:', error);
}

// PERFORMANCE OPTIMIZATION: Warm capsule cache for frequently used GPTs
// Uses 15s timeout per operation to prevent Supabase outages from stalling background tasks
const coldStartMetrics = { startTime: Date.now(), phases: [] };
void (async () => {
  const WARM_TIMEOUT = 15000;
  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
    ]);

  try {
    const t0 = Date.now();
    console.log('🔥 [Server] Starting capsule cache warming...');

    const { getCapsuleIntegration } = await import('./lib/capsuleIntegration.js');
    const capsuleIntegration = getCapsuleIntegration();
    const warmTargets = ['katana-001', 'nova-001'];

    await Promise.all(warmTargets.map(async (target) => {
      const tC = Date.now();
      try {
        await withTimeout(capsuleIntegration.loadCapsule(target), WARM_TIMEOUT, `Capsule ${target}`);
        const elapsed = Date.now() - tC;
        coldStartMetrics.phases.push({ phase: `capsule-load-${target}`, ms: elapsed });
        console.log(`⏱️ [Profiling] capsule-load-${target}: ${elapsed}ms`);
      } catch (e) {
        coldStartMetrics.phases.push({ phase: `capsule-load-${target}`, ms: Date.now() - tC, error: e.message });
        console.warn(`⏱️ [Profiling] capsule-load-${target}: FAILED (${Date.now() - tC}ms) - ${e.message}`);
      }
    }));

    const cacheStats = capsuleIntegration.getCacheStats();
    coldStartMetrics.phases.push({ phase: 'capsule-warming-total', ms: Date.now() - t0 });
    console.log(`⏱️ [Profiling] capsule-warming-total: ${Date.now() - t0}ms`);
    console.log('📊 [Server] Cache stats:', cacheStats);

    try {
      const tB = Date.now();
      const { getGPTRuntimeBridge } = await import('./lib/gptRuntimeBridge.js');
      const bridge = getGPTRuntimeBridge();
      for (const target of warmTargets) {
        const tG = Date.now();
        await withTimeout(bridge.loadGPT(target), WARM_TIMEOUT, `GPT preload ${target}`);
        const elapsed = Date.now() - tG;
        coldStartMetrics.phases.push({ phase: `gpt-preload-${target}`, ms: elapsed });
        console.log(`⏱️ [Profiling] gpt-preload-${target}: ${elapsed}ms`);
      }
      coldStartMetrics.phases.push({ phase: 'gpt-preload-total', ms: Date.now() - tB });
      console.log(`⏱️ [Profiling] gpt-preload-total: ${Date.now() - tB}ms`);
      console.log('✅ [Server] GPTRuntime preloaded for', warmTargets.join(', '));
    } catch (bridgeError) {
      console.warn('⚠️ [Server] GPTRuntime preload skipped:', bridgeError.message);
    }

  } catch (error) {
    console.warn('⚠️ [Server] Capsule cache warming failed (non-blocking):', error.message);
  }
  coldStartMetrics.phases.push({ phase: 'total-cold-start', ms: Date.now() - coldStartMetrics.startTime });
  console.log(`⏱️ [Profiling] total-cold-start: ${Date.now() - coldStartMetrics.startTime}ms`);
})();

app.get('/api/profiling/cold-start', requireAuth, (req, res) => {
  res.json({
    ok: true,
    bootTime: new Date(coldStartMetrics.startTime).toISOString(),
    totalMs: Date.now() - coldStartMetrics.startTime,
    phases: coldStartMetrics.phases
  });
});

app.get('/api/diagnostics/conditioning-ping', requireAuth, async (req, res) => {
  const constructId = req.query.constructId || 'nova-001';
  const timings = {};
  const t0 = Date.now();

  try {
    const { getSupabaseClient } = await import('./lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.json({ ok: false, error: 'Supabase not available', timings });
    }

    const tQuery = Date.now();
    const { data, error } = await supabase
      .from('vault_files')
      .select('filename, content')
      .eq('construct_id', constructId)
      .ilike('filename', '%conditioning%')
      .limit(5);
    timings.supabaseQueryMs = Date.now() - tQuery;

    if (error) {
      return res.json({ ok: false, error: error.message, timings });
    }

    const conditioningFile = data?.find(f => f.filename?.includes('conditioning'));
    timings.totalMs = Date.now() - t0;

    const { loadIdentityFiles } = await import('./lib/identityLoader.js');
    const tIdentity = Date.now();
    let identity = null;
    try {
      identity = await loadIdentityFiles(req.user?.sub || req.user?.id || 'system', constructId);
    } catch (e) {
      identity = { error: e.message };
    }
    timings.identityLoadMs = Date.now() - tIdentity;
    timings.totalMs = Date.now() - t0;

    res.json({
      ok: true,
      constructId,
      conditioning: {
        found: !!conditioningFile,
        filename: conditioningFile?.filename || null,
        contentLength: conditioningFile?.content?.length || 0,
        preview: conditioningFile?.content?.substring(0, 200) || null,
        allFiles: data?.map(f => ({ filename: f.filename, contentLength: f.content?.length || 0 })) || []
      },
      identity: {
        hasPrompt: !!identity?.prompt,
        promptLength: identity?.prompt?.length || 0,
        hasConditioning: !!identity?.conditioning,
        conditioningLength: identity?.conditioning?.length || 0,
        error: identity?.error || null
      },
      timings
    });
  } catch (err) {
    timings.totalMs = Date.now() - t0;
    res.status(500).json({ ok: false, error: err.message, timings });
  }
});

// Graceful shutdown - stop ChromaDB when server exits
process.on('SIGTERM', () => {
  console.log('🛑 [Server] SIGTERM received, shutting down...');
  shutdownChromaDB();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 [Server] SIGINT received, shutting down...');
  shutdownChromaDB();
  process.exit(0);
});
