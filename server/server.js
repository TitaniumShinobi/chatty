import "./loadEnv.js";
// Supabase Storage is canonical identity authority. DB is projection only; filesystem is cache.
import express from "express";
import fetch from "node-fetch"; // if on Node <18, else use global fetch
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
import { requestClock } from "./lib/requestClock.js";
import { connectDB } from "./config/database.js";
import { initAvatarStore } from "./lib/avatarStore.js";
import { Store } from "./store.js";
import {
  requireAuth,
  requireAuthOrServiceToken,
  requirePreferredAuthOrServiceToken,
  resolvePreferredAuthContext,
  resolveSharedAuthContext,
} from "./auth/middleware/auth.js";
import convRoutes from "./routes/conversations.js";
import aiRoutes from "./routes/ais.js";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
const { randomBytes } = crypto;
import vvaultRoutes from "./routes/vvault.js";
import constructRoutes from "./routes/construct.js";
import previewRoutes from "./routes/preview.js";
import awarenessRoutes from "./routes/awareness.js";
import workspaceRoutes from "./routes/workspace.js";
import unrestrictedConversationRoutes from "./routes/unrestrictedConversation.js";
import orchestrationRoutes from "./routes/orchestration.js";
import diagnosticsRoutes from "./routes/diagnostics.js";
import chatRoutes from './routes/chat.js';
import telephonyTwilioRoutes from './routes/telephonyTwilio.js';
import linChatRoutes from './routes/linChat.js';
import vsiRoutes from './routes/vsi.js';
import gptsRoutes from './routes/gpts.js';
import transcriptsRoutes from './routes/transcripts.js';
import codexRoutes from './routes/codex.js';
import masterScriptsRoutes from './routes/masterScripts.js';
import scriptsRoutes from './routes/scripts.js';
import simForgeRoutes from './routes/simForge.js';
import fxshinobiRoutes from './routes/fxshinobi.js';
import vaultProxyRoutes from './routes/vault.js';
import suggestionsRoutes from './routes/suggestions.js';
import mocrProxyRoutes from './routes/mocr.js';
import transcribeRoutes from './routes/transcribe.js';
import ttsRoutes from './routes/tts.js';
import voiceUploadRoutes from './routes/voiceUpload.js';
import attachmentsRoutes from './routes/attachments.js';
import searchRoutes from './routes/search.js';
import needleRoutes from './routes/needle.js';
import selfpromptRoutes from './routes/selfprompt.js';
import familyRoutes from './routes/family.js';
import capabilitiesRouter from './routes/capabilities.js';
import zenRoutes from './routes/zen.js';
import { startZenWatch } from './lib/zenWatch.js';
import themeRoutes from './routes/theme.js';
import { initializeChromaDB, shutdownChromaDB, getChromaDBService } from "./services/chromadbService.js";
import { getChatService } from "./services/chatService.js";
import { setupTranscribeStream } from "./routes/transcribeStream.js";
import { getAgentsManifest, loadRolePrompt } from "./lib/rolePromptLoader.js";
import { checkDbHealth, checkMemoryHealth, checkVvaultHealth, checkBuildHealth, checkProviderHealth, runAllHealthChecks } from "./lib/healthChecks.js";
import { getVvaultBridgeConfig, describeVvaultBridgeConfig, getVvaultTargets, describeVvaultTargets } from "./lib/vvaultBridgeConfig.js";
import {
  resolveVvaultApiMeSessionState,
} from "./lib/vvaultBridgeIdentity.js";
import {
  buildChattyApiMeAuthFailureLog,
  buildChattyApiMeIdentityLog,
  logVvaultIdentityDiagnostics,
} from "./lib/vvaultIdentityDiagnostics.js";
import {
  buildCliCallbackRedirect,
  normalizeCliCallbackUrl,
} from "./lib/cliAuthBridge.js";
import {
  assertProductionPublicOriginSafety,
  isConfiguredCanonicalOrigin,
  resolveConfiguredCanonicalDomain,
} from "./lib/publicOriginConfig.js";
import {
  assertRuntimeHandshakeSafety,
  resolveRuntimeHandshakeConfig,
} from "./lib/runtimeHandshakeConfig.js";
import {
  buildSharedAuthDelegationUrl,
  getResponseSetCookieHeaders,
  isSharedAuthBrowserLoginEnabled,
  shouldDelegateGoogleBrowserAuth,
} from "./lib/sharedAuthBrowserFlow.js";

console.log('[ENV CHECK]', {
  JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING',
});

// initialize avatar store if configuration is present
if (process.env.AVATAR_BUCKET && process.env.AVATAR_CDN) {
  initAvatarStore({
    region: process.env.AWS_REGION,
    bucket: process.env.AVATAR_BUCKET,
    cdnUrl: process.env.AVATAR_CDN,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });
  console.log('[AvatarStore] initialized with bucket', process.env.AVATAR_BUCKET);
}

console.log('[ENV CHECK]', {
  JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING',
  COOKIE_NAME: process.env.COOKIE_NAME || 'sid',
  NODE_ENV: process.env.NODE_ENV
});
const vvaultBridgeConfig = getVvaultBridgeConfig();
console.log(describeVvaultBridgeConfig(vvaultBridgeConfig));
console.log(describeVvaultTargets(getVvaultTargets()));
console.log("[VVAULT BRIDGE PRESENCE]", {
  VVAULT_URL_PRESENT: !vvaultBridgeConfig.missingVvaultUrl,
  VVAULT_SERVICE_TOKEN_PRESENT: !vvaultBridgeConfig.missingServiceToken,
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

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const isProduction = process.env.NODE_ENV === "production";
const RUNTIME_HANDSHAKE = resolveRuntimeHandshakeConfig(process.env);
const RUNTIME_HANDSHAKE_SAFETY = assertRuntimeHandshakeSafety(process.env);
console.log("[RUNTIME HANDSHAKE]", RUNTIME_HANDSHAKE_SAFETY);
function cookieSecure(req) {
  // Treat localhost & 127.0.0.1 (any port) as non-secure
  const host = req.get('host') || '';
  return !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
}
const CONFIGURED_PUBLIC_ORIGIN = RUNTIME_HANDSHAKE.publicOrigin;
const CONFIGURED_CALLBACK_BASE = RUNTIME_HANDSHAKE.callbackBase;
const CANONICAL_DOMAIN = resolveConfiguredCanonicalDomain(process.env);
const COOKIE_DOMAIN = RUNTIME_HANDSHAKE.cookieDomain;
const CALLBACK_PATH = process.env.CALLBACK_PATH || '/api/auth/google/callback';
const REDIRECT_URI = CONFIGURED_CALLBACK_BASE
  ? `${CONFIGURED_CALLBACK_BASE}${CALLBACK_PATH}`
  : `http://localhost:5050${CALLBACK_PATH}`;
const GOOGLE_CALLBACK = REDIRECT_URI;

const REPLIT_DOMAIN = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
const REPLIT_REDIRECT_URI = REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}${CALLBACK_PATH}` : null;
const POST_LOGIN_REDIRECT = REPLIT_DOMAIN
  ? `https://${REPLIT_DOMAIN}`
  : (CONFIGURED_PUBLIC_ORIGIN || "http://localhost:5173");

const WATCHDOG_DEFAULT_LOG_DIR = process.env.WATCHDOG_LOG_DIR || '/var/log/chatty';
const WATCHDOG_FALLBACK_LOG = path.join(PROJECT_ROOT, 'watchdog', 'logs', 'watchdog.log');

function resolveWatchdogLogPath() {
  const primary = path.join(WATCHDOG_DEFAULT_LOG_DIR, 'watchdog.log');
  if (fs.existsSync(primary)) return primary;
  if (fs.existsSync(WATCHDOG_FALLBACK_LOG)) return WATCHDOG_FALLBACK_LOG;
  return primary; // default even if missing
}

function readWatchdogEvents(limit = 100) {
  const logPath = resolveWatchdogLogPath();
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const slice = lines.slice(-limit);
    const events = slice.map(line => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    });
    return { ok: true, events, logPath };
  } catch (err) {
    return { ok: false, error: err.message, logPath };
  }
}

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

function isDev(req) {
  return !IS_PRODUCTION || isReplitPreview(req);
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
  if (host && host !== 'localhost:5050') return `${proto}://${host}`;
  if (IS_PRODUCTION && CONFIGURED_PUBLIC_ORIGIN) return CONFIGURED_PUBLIC_ORIGIN;
  return 'http://localhost:5173';
}

function getRedirectUri(req) {
  // If running in a Replit preview environment we have a special URI
  if (isReplitPreview(req) && REPLIT_REDIRECT_URI) {
    return REPLIT_REDIRECT_URI;
  }

  if (!IS_PRODUCTION) {
    // For development we normally want the callback to come back to the
    // front‑end origin (localhost:5173 or 127.0.0.1:5173); the Vite dev server
    // will proxy anything under /api back to the backend on :5050 so the
    // server still receives the request and can set the cookie.  This keeps
    // the value stable and allows us to register just one URI in Google.
    const origin = getRequestOrigin(req);
    if (
      origin === 'http://localhost:5173' ||
      origin === 'http://127.0.0.1:5173'
    ) {
      return `${origin}${CALLBACK_PATH}`;
    }

    // Fallback: build from whatever host header we received.  Useful when
    // using a reverse proxy or running on a different port.
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    if (host) return `${proto}://${host}${CALLBACK_PATH}`;
  }

  // Production: use canonically-configured HTTPS URI
  return REDIRECT_URI;
}

function getPostLoginRedirect(req) {
  if (IS_PRODUCTION && CONFIGURED_PUBLIC_ORIGIN) return CONFIGURED_PUBLIC_ORIGIN;
  return getRequestOrigin(req);
}

// In production, never fall back to localhost for redirect/callback config.
if (process.env.NODE_ENV === 'production' && !REPLIT_DOMAIN) {
  const safety = assertProductionPublicOriginSafety(process.env);
  if (!safety.ok) {
    console.error('❌ [Config] Invalid production public origin configuration:', safety.problems);
    console.error('❌ [Config] Refusing to start because OAuth/callback URLs must not fall back to localhost in production.');
    process.exit(1);
  }
}

console.log('--- OAUTH CONFIG DEBUG ---');
console.log('CANONICAL_DOMAIN:', CANONICAL_DOMAIN);
console.log('CONFIGURED_PUBLIC_ORIGIN:', CONFIGURED_PUBLIC_ORIGIN || '(not set)');
console.log('CONFIGURED_CALLBACK_BASE:', CONFIGURED_CALLBACK_BASE || '(not set)');
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
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
};

const app = express();

const REQUIRED_ROUTE_PATHS = Object.freeze([
  '/api/health',
  '/api/me',
  '/api/auth/google/health',
  '/api/vvault/profile',
]);

const mountedRouteState = {
  directGet: new Set(),
  vvaultMounted: false,
  vvaultProfileMounted: false,
};

function markDirectGetRoute(pathname) {
  mountedRouteState.directGet.add(pathname);
}

function hasRouterGetPath(router, routePath) {
  const stack = Array.isArray(router?.stack) ? router.stack : [];
  for (const layer of stack) {
    if (layer?.route?.path === routePath && layer.route.methods?.get) {
      return true;
    }
    if (layer?.name === 'router' && layer?.handle?.stack && hasRouterGetPath(layer.handle, routePath)) {
      return true;
    }
  }
  return false;
}

mountedRouteState.vvaultProfileMounted = hasRouterGetPath(vvaultRoutes, '/profile');

function getRouteIntegritySnapshot() {
  const routeChecks = {
    '/api/health': () => mountedRouteState.directGet.has('/api/health'),
    '/api/me': () => mountedRouteState.directGet.has('/api/me'),
    '/api/auth/google/health': () => mountedRouteState.directGet.has('/api/auth/google/health'),
    '/api/vvault/profile': () => mountedRouteState.vvaultMounted && mountedRouteState.vvaultProfileMounted,
  };
  const missing = [];
  for (const pathname of REQUIRED_ROUTE_PATHS) {
    if (!routeChecks[pathname]()) {
      missing.push(pathname);
    }
  }
  return {
    ok: missing.length === 0,
    missing,
    checkedAt: new Date().toISOString(),
  };
}

function logRouteIntegrityStartup() {
  const snapshot = getRouteIntegritySnapshot();
  if (snapshot.ok) {
    console.log('✅ [RouteIntegrity] all required routes mounted');
    return;
  }
  console.error(`❌ [RouteIntegrity] missing routes: ${snapshot.missing.join(', ')}`);
  console.error('❌ [RouteIntegrity] Ensure the local API process is server/server.js on port 5050 and fully booted.');
}

// Security headers (CSP is disabled here to avoid breaking dev/proxy/Electron; tighten per env if possible)
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  referrerPolicy: { policy: 'no-referrer' }
}));

// Request correlation id for debugging intermittent 500s/aborts (Vite proxy + backend restarts).
// Do not treat this as a security boundary; it's purely for observability.
app.use((req, res, next) => {
  const rid = randomBytes(8).toString('hex');
  req._rid = rid;
  res.setHeader('X-Req-Id', rid);
  next();
});

app.use((req, _res, next) => {
  console.log('[Request]', req.method, req.originalUrl || req.url, req.ip);
  next();
});

let serverReady = false;
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', ready: serverReady, uptime: process.uptime() });
});

// bulletproof API health: defined before any middleware that might patch
// response methods.  We avoid res.json() entirely and build the body string
// synchronously off a local copy of serverReady so nothing can throw.
app.get('/api/health', (_req, res) => {
  const ready = serverReady;
  const body = '{"ok":true,"ready":' + (ready ? 'true' : 'false') + '}';
  res.status(200)
     .setHeader('Content-Type', 'application/json')
     .end(body);
});
markDirectGetRoute('/api/health');

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

if (process.env.ENABLE_SERVER_TIMING === 'true') {
  app.use('/api', (req, res, next) => {
    // Skip timing for the health endpoint to avoid any accidental side effects.
    if (req.path === '/health') return next();

    const start = process.hrtime.bigint();
    const originalEnd = res.end;
    res.end = function (...args) {
      try {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        res.setHeader('Server-Timing', `total;dur=${ms.toFixed(1)};desc="${req.method} ${req.originalUrl}"`);
      } catch (err) {
        console.error('⚠️ [Server-Timing] failed to set header:', err);
        // fall through to ensure response is still sent
      }
      return originalEnd.apply(this, args);
    };
    next();
  });
}

// Body limits
// Increase default body limit for dev to accommodate transcript uploads.
const BODY_LIMIT = process.env.BODY_LIMIT || '25mb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));
app.use(cookieParser());
app.set("trust proxy", 1);

// CORS configuration (explicit allowlist in prod)
const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.CORS_ORIGIN || CONFIGURED_PUBLIC_ORIGIN || (() => { throw new Error('Missing required env var: PUBLIC_APP_URL or FRONTEND_URL or CORS_ORIGIN in production'); })())
  : (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:5173');

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

// Serve static files in production (built frontend)
if (isProduction) {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath, { index: 'index.html' }));
  console.log('📦 [Server] Serving static files from:', distPath);
}

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later" }
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ [FATAL] JWT_SECRET environment variable is not set. Authentication cannot work without it.');
  process.exit(1);
}
const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';
const SUPPORTED_AUTH_PROVIDERS = new Set(['google', 'apple', 'github']);
const DEFAULT_LEGAL_DOC_VERSIONS = Object.freeze({
  chattyTerms: process.env.LEGAL_VERSION_CHATTY_TERMS || '2026-03-13',
  chattyPrivacy: process.env.LEGAL_VERSION_CHATTY_PRIVACY || '2026-03-13',
  chattyEeccd: process.env.LEGAL_VERSION_CHATTY_EECCD || '2026-03-13',
  vvaultTerms: process.env.LEGAL_VERSION_VVAULT_TERMS || '2026-03-13',
  vvaultPrivacy: process.env.LEGAL_VERSION_VVAULT_PRIVACY || '2026-03-13',
  vvaultEeccd: process.env.LEGAL_VERSION_VVAULT_EECCD || '2026-03-13',
});

function toNonEmptyString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/** Parity with @quantum/auth: OAuth-only users should not get a generic invalid-password dead end. */
function credentialLoginUnavailableMessage(authProvider) {
  const p = String(authProvider || '').toLowerCase();
  if (p === 'google') return 'This account uses Google sign-in. Use the Google button to continue.';
  if (p === 'github') return 'This account uses GitHub sign-in. Use the GitHub button to continue.';
  if (p === 'microsoft') return 'This account uses Microsoft sign-in. Use the Microsoft button to continue.';
  if (p === 'apple') return 'This account uses Apple sign-in. Use the Apple button to continue.';
  return 'This account does not use email and password. Sign in with your linked sign-in provider.';
}

function lifeRegistryMatchChattyMessage() {
  return 'This email was found in the LIFE Technology user registry. Finish Chatty sign-up below and your account will be connected.';
}

function createSessionCookieOptions(req) {
  const cookieOptions = {
    httpOnly: true,
    secure: cookieSecure(req),
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  };
  if (cookieSecure(req)) {
    cookieOptions.domain = COOKIE_DOMAIN;
  } else {
    delete cookieOptions.domain;
  }
  return cookieOptions;
}

function buildAuthJwtPayload(payload) {
  const id = toNonEmptyString(payload?.id);
  const sub = toNonEmptyString(payload?.sub) || id;
  const email = toNonEmptyString(payload?.email).toLowerCase();
  const name = toNonEmptyString(payload?.name);
  return {
    id: id || sub,
    sub: sub || id,
    uid: toNonEmptyString(payload?.uid) || id || sub,
    name: name || email.split('@')[0] || 'User',
    given_name: toNonEmptyString(payload?.given_name) || undefined,
    family_name: toNonEmptyString(payload?.family_name) || undefined,
    email: email || undefined,
    picture: toNonEmptyString(payload?.picture) || undefined,
    locale: toNonEmptyString(payload?.locale) || undefined,
    auth_provider: toNonEmptyString(payload?.auth_provider) || undefined,
  };
}

function setAuthSessionCookie(req, res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE_NAME, token, createSessionCookieOptions(req));
  return token;
}

function appendSetCookieHeaders(res, setCookieHeaders = []) {
  for (const cookieHeader of setCookieHeaders) {
    if (!cookieHeader) continue;
    res.append("Set-Cookie", cookieHeader);
  }
}

async function ensureChattySessionFromSharedAuth(req, res, authContext, sharedAuthContext) {
  if (authContext?.source !== "shared" || !sharedAuthContext?.ok || !sharedAuthContext?.user) {
    return null;
  }

  const sharedUser = sharedAuthContext.user;
  const email = toNonEmptyString(sharedUser.email).toLowerCase();
  if (!email) {
    throw new Error("Shared auth user is missing email");
  }

  const name = toNonEmptyString(sharedUser.name) || email.split("@")[0] || "User";
  const seedUserId =
    toNonEmptyString(sharedUser.sub) ||
    toNonEmptyString(sharedUser.id) ||
    toNonEmptyString(sharedUser.uid) ||
    email;

  const { getOrCreateUser } = await import("./lib/userRegistry.js");
  const userProfile = await getOrCreateUser(seedUserId, email, name);

  try {
    const { GPTManager } = await import("./lib/gptManager.js");
    GPTManager.getInstance().provisionUserConstructs(userProfile.user_id);
  } catch (error) {
    console.warn("⚠️ [Auth] Failed to provision constructs from shared auth session:", error?.message || error);
  }

  const payload = buildAuthJwtPayload({
    id: userProfile.user_id,
    sub: userProfile.user_id,
    uid: toNonEmptyString(sharedUser.uid) || toNonEmptyString(sharedUser.id) || userProfile.user_id,
    name,
    email,
    picture: toNonEmptyString(sharedUser.picture),
    given_name: toNonEmptyString(sharedUser.given_name),
    family_name: toNonEmptyString(sharedUser.family_name),
    locale: toNonEmptyString(sharedUser.locale),
    auth_provider: toNonEmptyString(sharedUser.auth_provider) || "shared_auth",
  });

  setAuthSessionCookie(req, res, payload);
  return payload;
}

async function fetchSharedAuthGoogleHealth(req) {
  if (!isSharedAuthBrowserLoginEnabled(RUNTIME_HANDSHAKE)) {
    return null;
  }

  const origin = CONFIGURED_PUBLIC_ORIGIN || getRequestOrigin(req);
  const headers = {
    origin,
    referer: `${origin}/`,
  };

  const response = await fetch(`${RUNTIME_HANDSHAKE.authApiBaseUrl}/api/auth/google/health`, {
    method: "GET",
    headers,
    redirect: "manual",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("Shared auth health endpoint returned a non-JSON failure");
  }
  return payload;
}

function getAuthProviderStatus(provider) {
  const normalized = toNonEmptyString(provider).toLowerCase();
  if (!SUPPORTED_AUTH_PROVIDERS.has(normalized)) {
    return { provider: normalized, enabled: false, available: false, reason: 'unknown_provider' };
  }

  if (normalized === 'google') {
    const enabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    return {
      provider: normalized,
      enabled,
      available: enabled && oauthValid,
      reason: enabled && oauthValid ? undefined : 'not_configured',
    };
  }

  const envFlag = process.env[`AUTH_${normalized.toUpperCase()}_ENABLED`];
  const enabled = envFlag === 'true';
  return {
    provider: normalized,
    enabled,
    available: enabled,
    reason: enabled ? undefined : 'feature_flag_disabled',
  };
}

function buildAuthLegalDocs(req) {
  const origin = getRequestOrigin(req).replace(/\/$/, '');
  const vvaultBase = (process.env.VVAULT_LEGAL_BASE_URL || origin).replace(/\/$/, '');
  const docs = [
    {
      product: 'chatty',
      docType: 'terms',
      key: 'chatty:terms',
      version: DEFAULT_LEGAL_DOC_VERSIONS.chattyTerms,
      label: 'Chatty Terms of Service',
      url: `${origin}/legal/terms`,
      required: true,
    },
    {
      product: 'chatty',
      docType: 'privacy',
      key: 'chatty:privacy',
      version: DEFAULT_LEGAL_DOC_VERSIONS.chattyPrivacy,
      label: 'Chatty Privacy Notice',
      url: `${origin}/legal/privacy`,
      required: true,
    },
    {
      product: 'chatty',
      docType: 'eeccd',
      key: 'chatty:eeccd',
      version: DEFAULT_LEGAL_DOC_VERSIONS.chattyEeccd,
      label: 'Chatty EECCD Disclosure',
      url: `${origin}/legal/eeccd`,
      required: true,
    },
    {
      product: 'vvault',
      docType: 'terms',
      key: 'vvault:terms',
      version: DEFAULT_LEGAL_DOC_VERSIONS.vvaultTerms,
      label: 'VVault Terms of Service',
      url: `${vvaultBase}/vvault-terms.html`,
      required: true,
    },
    {
      product: 'vvault',
      docType: 'privacy',
      key: 'vvault:privacy',
      version: DEFAULT_LEGAL_DOC_VERSIONS.vvaultPrivacy,
      label: 'VVault Privacy Notice',
      url: `${vvaultBase}/vvault-privacy.html`,
      required: true,
    },
    {
      product: 'vvault',
      docType: 'eeccd',
      key: 'vvault:eeccd',
      version: DEFAULT_LEGAL_DOC_VERSIONS.vvaultEeccd,
      label: 'VVault EECCD Disclosure',
      url: `${vvaultBase}/vvault-eeccd.html`,
      required: true,
    },
  ];

  const turnstileEnabled = Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY);
  return {
    docs,
    turnstile: {
      required: process.env.NODE_ENV === 'production',
      enabled: turnstileEnabled,
      siteKey: turnstileEnabled ? process.env.TURNSTILE_SITE_KEY : undefined,
    },
    providers: Array.from(SUPPORTED_AUTH_PROVIDERS).map((provider) => getAuthProviderStatus(provider)),
  };
}

function parseSignupConsent(payload) {
  const consentPayload = payload?.consent && typeof payload.consent === 'object' ? payload.consent : {};
  const legacyChattyAccepted = payload?.acceptTerms === true;
  const legacyVvaultAccepted = payload?.acceptVVAULTTerms === true;

  return {
    chattyTerms: consentPayload.chattyTerms === true || legacyChattyAccepted,
    chattyPrivacy: consentPayload.chattyPrivacy === true || legacyChattyAccepted,
    chattyEeccd: consentPayload.chattyEeccd === true || legacyChattyAccepted,
    vvaultTerms: consentPayload.vvaultTerms === true || legacyVvaultAccepted,
    vvaultPrivacy: consentPayload.vvaultPrivacy === true || legacyVvaultAccepted,
    vvaultEeccd: consentPayload.vvaultEeccd === true || legacyVvaultAccepted,
  };
}

function isSignupConsentComplete(consent) {
  return Boolean(
    consent?.chattyTerms &&
    consent?.chattyPrivacy &&
    consent?.chattyEeccd &&
    consent?.vvaultTerms &&
    consent?.vvaultPrivacy &&
    consent?.vvaultEeccd
  );
}

function getClientIpAddress(req) {
  const forwarded = toNonEmptyString(req.headers['x-forwarded-for']);
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return toNonEmptyString(req.ip) || toNonEmptyString(req.socket?.remoteAddress) || '';
}

async function verifyTurnstileToken(token, remoteIp) {
  const secret = toNonEmptyString(process.env.TURNSTILE_SECRET_KEY);
  if (!secret) return false;
  if (!toNonEmptyString(token)) return false;

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
    });
    if (toNonEmptyString(remoteIp)) {
      body.set('remoteip', remoteIp);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    return payload?.success === true;
  } catch {
    return false;
  }
}

async function recordLegalAcceptances({ supabase, userId, email, docs, acceptedAt, source, ipAddress, userAgent }) {
  const rows = docs.map((doc) => ({
    user_id: userId || null,
    email,
    product: doc.product,
    doc_type: doc.docType,
    doc_key: doc.key,
    doc_version: doc.version,
    accepted_at: acceptedAt,
    source,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
  }));

  const { error } = await supabase
    .from('auth_legal_acceptances')
    .insert(rows);
  if (error) throw error;
}

const handleApiMe = async (req, res) => {
  try {
    const authContext = await resolvePreferredAuthContext(req);
    if (!authContext.ok || !authContext.user) {
      logVvaultIdentityDiagnostics(
        "chatty_api_me_auth_failure",
        buildChattyApiMeAuthFailureLog(req, authContext),
      );
      console.error('❌ [Auth] /api/me 401: no active session', {
        rid: req?._rid || null,
        nativeReason: authContext?.nativeReason || null,
        sharedReason: authContext?.sharedReason || null,
      });
      return res.status(401).json({
        ok: false,
        reason: authContext?.sharedReason || authContext?.nativeReason || authContext?.reason || 'no_session',
      });
    }
    const sharedAuthContext = await resolveSharedAuthContext(req, {
      hydrateRequestUser: false,
    });
    await ensureChattySessionFromSharedAuth(req, res, authContext, sharedAuthContext);
    const vvaultSession = await resolveVvaultApiMeSessionState(req, sharedAuthContext, {
      fetchImpl: fetch,
    });
    logVvaultIdentityDiagnostics(
      "chatty_api_me",
      buildChattyApiMeIdentityLog(req, authContext, vvaultSession),
    );
    return res.json({
      ok: true,
      user: {
        ...authContext.user,
        authSource: authContext.source || null,
        vvaultSession,
        vvaultReady: vvaultSession.ready,
      },
    });
  } catch (error) {
    console.error('❌ [Auth] /api/me threw:', error, { rid: req?._rid || null });
    return res.status(500).json({ ok: false, error: error?.message || String(error), rid: req?._rid || null });
  }
};

// Register /api/me early so it is guaranteed to be available even if later optional init paths fail.
app.get("/api/me", handleApiMe);
markDirectGetRoute('/api/me');

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

// /api/health previously defined earlier, no need to redefine here.
// the earlier handler is intentionally minimal and cannot throw.
// kept for backward-compatibility comments; remove this block if duplicate
// definition warnings appear.
//
// app.get("/api/health", (_req, res) => {
//   const ready = serverReady;
//   const body = '{"ok":true,"ready":' + (ready ? 'true' : 'false') + '}';
//   res.status(200)
//      .setHeader('Content-Type', 'application/json')
//      .end(body);
//});

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

app.get("/api/health/db", (_req, res) => {
  const result = checkDbHealth();
  res.status(result.ok ? 200 : 503).json(result);
});

app.get("/api/health/memory", async (_req, res) => {
  const result = await checkMemoryHealth();
  res.status(result.ok ? 200 : 503).json(result);
});

app.get("/api/health/vvault", (_req, res) => {
  const result = checkVvaultHealth();
  res.status(result.ok ? 200 : 503).json(result);
});

app.get("/api/health/full", async (_req, res) => {
  const result = await runAllHealthChecks(true);
  res.status(result.ok ? 200 : 503).json(result);
});

// Build artifacts health check endpoint
app.get("/api/health/build", (_req, res) => {
  const result = checkBuildHealth();
  const { compiledJsPath, candidates, environment, exists } = result.detail;

  res.status(result.ok ? 200 : 503).json({
    ok: result.ok,
    buildArtifactsPresent: exists,
    environment,
    status: result.ok ? 'ok' : 'error',
    message: exists
      ? 'Build artifacts present'
      : environment === 'production'
        ? 'ERROR: Build artifacts missing in production'
        : 'WARNING: Build artifacts missing (dev mode)',
    compiledJsPath,
    checkedPaths: candidates,
    recommendation: exists ? null : 'Run: cd server && npm run build'
  });
});

app.get("/api/agents", (_req, res) => {
  const manifest = getAgentsManifest();
  res.json(manifest);
});

app.get("/api/agents/:role/prompt", (req, res) => {
  try {
    const result = loadRolePrompt(req.params.role);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get("/api/watchdog/events", (req, res) => {
  const limit = Number.parseInt(req.query.limit || '100', 10);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 100;
  const result = readWatchdogEvents(safeLimit);
  res.status(result.ok ? 200 : 503).json(result);
});

// OAuth health check endpoint
app.get("/api/auth/google/health", async (req, res) => {
  const effectiveLocalRedirectUri = getRedirectUri(req);
  try {
    const sharedHealth = await fetchSharedAuthGoogleHealth(req);
    if (sharedHealth) {
      return res.json({
        oauth_configured: sharedHealth.oauth_configured === true,
        redirect_uri: sharedHealth.redirect_uri || null,
        environment: process.env.NODE_ENV || 'development',
        client_id_present: sharedHealth.client_id_present === true,
        client_secret_present: sharedHealth.client_secret_present === true,
        validation_passed: sharedHealth.validation_passed === true && RUNTIME_HANDSHAKE_SAFETY.ok,
        effective_local_redirect_uri: sharedHealth.redirect_uri || effectiveLocalRedirectUri,
        allowed_origins: [...ALLOWED_ORIGINS],
        runtime_handshake: RUNTIME_HANDSHAKE_SAFETY,
        auth_authority: {
          public_origin: RUNTIME_HANDSHAKE.authPublicOrigin,
          api_base_url: RUNTIME_HANDSHAKE.authApiBaseUrl,
          cookie_name: sharedHealth.auth_cookie_name || RUNTIME_HANDSHAKE.authCookieName,
          cookie_domain: sharedHealth.auth_cookie_domain || RUNTIME_HANDSHAKE.authCookieDomain || null,
          cookie_secure: sharedHealth.auth_cookie_secure === true,
          allowed_origins: Array.isArray(sharedHealth.allowed_origins) ? sharedHealth.allowed_origins : [],
        },
        correlation: {
          strategy: "cid_in_oauth_logs",
          spans: ["/api/auth/google", "/api/auth/google/callback", "/api/auth/set-session"]
        }
      });
    }
  } catch (error) {
    return res.json({
      oauth_configured: false,
      redirect_uri: null,
      environment: process.env.NODE_ENV || 'development',
      client_id_present: false,
      client_secret_present: false,
      validation_passed: false,
      effective_local_redirect_uri: effectiveLocalRedirectUri,
      allowed_origins: [...ALLOWED_ORIGINS],
      runtime_handshake: RUNTIME_HANDSHAKE_SAFETY,
      auth_authority: {
        public_origin: RUNTIME_HANDSHAKE.authPublicOrigin,
        api_base_url: RUNTIME_HANDSHAKE.authApiBaseUrl,
        error: error?.message || String(error),
      },
      correlation: {
        strategy: "cid_in_oauth_logs",
        spans: ["/api/auth/google", "/api/auth/google/callback", "/api/auth/set-session"]
      }
    });
  }

  res.json({
    oauth_configured: !!OAUTH.client_id && !!OAUTH.client_secret,
    redirect_uri: OAUTH.redirect_uri,
    environment: process.env.NODE_ENV || 'development',
    client_id_present: !!OAUTH.client_id,
    client_secret_present: !!OAUTH.client_secret,
    validation_passed: oauthValid && RUNTIME_HANDSHAKE_SAFETY.ok,
    effective_local_redirect_uri: effectiveLocalRedirectUri,
    allowed_origins: [...ALLOWED_ORIGINS],
    runtime_handshake: RUNTIME_HANDSHAKE_SAFETY,
    correlation: {
      strategy: "cid_in_oauth_logs",
      spans: ["/api/auth/google", "/api/auth/google/callback", "/api/auth/set-session"]
    }
  });
});
markDirectGetRoute('/api/auth/google/health');

app.get('/api/auth/providers/:provider/status', (req, res) => {
  const provider = toNonEmptyString(req.params?.provider).toLowerCase();
  if (!SUPPORTED_AUTH_PROVIDERS.has(provider)) {
    return res.status(404).json({ ok: false, error: 'Unknown auth provider' });
  }
  return res.json({ ok: true, ...getAuthProviderStatus(provider) });
});

app.get('/api/auth/legal-docs', (req, res) => {
  return res.json({ ok: true, ...buildAuthLegalDocs(req) });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const email = toNonEmptyString(req.body?.email).toLowerCase();
    const password = toNonEmptyString(req.body?.password);

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required' });
    }

    const { getSupabaseClient } = await import('./lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ ok: false, error: 'Supabase auth backend is unavailable' });
    }

    const { data: userRow, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1)
      .maybeSingle();
    if (selectError) {
      console.error('❌ [Auth] Login user lookup failed:', selectError);
      return res.status(500).json({ ok: false, error: 'Unable to validate credentials' });
    }

    if (!userRow) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const passwordHash = toNonEmptyString(userRow?.auth_password_hash);
    const legacyPasswordHash = toNonEmptyString(userRow?.password_hash);
    const authProvider = toNonEmptyString(userRow?.auth_provider).toLowerCase();

    if (!passwordHash) {
      if (authProvider === 'google' || authProvider === 'github' || authProvider === 'microsoft' || authProvider === 'apple') {
        return res.status(401).json({
          ok: false,
          error: credentialLoginUnavailableMessage(authProvider),
          oauthOnly: true,
          credentialLoginUnavailable: true,
          ...(authProvider ? { authProvider } : {}),
        });
      }
      if (legacyPasswordHash) {
        return res.status(401).json({
          ok: false,
          error: lifeRegistryMatchChattyMessage(),
          lifeRegistryMatch: true,
        });
      }
      return res.status(401).json({
        ok: false,
        error: lifeRegistryMatchChattyMessage(),
        lifeRegistryMatch: true,
      });
    }

    const passwordOk = await bcrypt.compare(password, passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const displayName =
      toNonEmptyString(userRow?.display_name) ||
      toNonEmptyString(userRow?.name) ||
      email.split('@')[0] ||
      'User';
    const { getOrCreateUser } = await import('./lib/userRegistry.js');
    const userProfile = await getOrCreateUser(String(userRow?.id || email), email, displayName);

    const payload = buildAuthJwtPayload({
      id: userProfile.user_id,
      sub: userProfile.user_id,
      uid: String(userRow?.id || userProfile.user_id),
      name: displayName,
      email,
      picture: toNonEmptyString(userRow?.avatar_url) || toNonEmptyString(userRow?.picture),
      auth_provider: 'credentials',
    });

    setAuthSessionCookie(req, res, payload);

    await supabase
      .from('users')
      .update({ auth_last_login_at: new Date().toISOString() })
      .eq('id', userRow.id);

    return res.json({
      ok: true,
      user: payload,
      auth: { provider: 'credentials' },
    });
  } catch (error) {
    console.error('❌ [Auth] Login failed:', error);
    return res.status(500).json({ ok: false, error: 'Sign-in failed' });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const name = toNonEmptyString(req.body?.name);
    const email = toNonEmptyString(req.body?.email).toLowerCase();
    const password = toNonEmptyString(req.body?.password);
    const confirmPassword = toNonEmptyString(req.body?.confirmPassword);
    const turnstileToken = toNonEmptyString(req.body?.turnstileToken);
    const consent = parseSignupConsent(req.body);

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ ok: false, error: 'Name, email, password, and password confirmation are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid email address' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ ok: false, error: 'Passwords do not match' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
    }
    if (!isSignupConsentComplete(consent)) {
      return res.status(400).json({ ok: false, error: 'You must accept Chatty and VVault legal terms to continue' });
    }

    const legalDocs = buildAuthLegalDocs(req);
    if (legalDocs.turnstile.required) {
      if (!legalDocs.turnstile.enabled) {
        return res.status(503).json({ ok: false, error: 'Turnstile is required but not configured on the server' });
      }
      if (!turnstileToken) {
        return res.status(400).json({ ok: false, error: 'Turnstile verification is required' });
      }
      const verified = await verifyTurnstileToken(turnstileToken, getClientIpAddress(req));
      if (!verified) {
        return res.status(400).json({ ok: false, error: 'Turnstile verification failed' });
      }
    }

    const { getSupabaseClient } = await import('./lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ ok: false, error: 'Supabase auth backend is unavailable' });
    }

    const { data: existingUser, error: existingError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1)
      .maybeSingle();
    if (existingError) {
      console.error('❌ [Auth] Register user lookup failed:', existingError);
      return res.status(500).json({ ok: false, error: 'Unable to create account' });
    }
    if (existingUser?.auth_password_hash) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const updatePayload = {
      email,
      name,
      display_name: name,
      auth_provider: 'credentials',
      auth_password_hash: passwordHash,
      auth_last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let userRow;
    if (existingUser?.id) {
      const { data, error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', existingUser.id)
        .select('*')
        .single();
      if (error) {
        console.error('❌ [Auth] Register update failed:', error);
        const message = String(error?.message || '');
        if (message.includes('column') || message.includes('auth_password_hash')) {
          return res.status(500).json({ ok: false, error: 'Auth schema missing. Run latest Supabase auth migrations.' });
        }
        return res.status(500).json({ ok: false, error: 'Unable to create account' });
      }
      userRow = data;
    } else {
      const insertPayload = {
        ...updatePayload,
        created_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('users')
        .insert(insertPayload)
        .select('*')
        .single();
      if (error) {
        console.error('❌ [Auth] Register insert failed:', error);
        const message = String(error?.message || '');
        if (message.includes('column') || message.includes('auth_password_hash')) {
          return res.status(500).json({ ok: false, error: 'Auth schema missing. Run latest Supabase auth migrations.' });
        }
        if (error.code === '23505') {
          return res.status(409).json({ ok: false, error: 'An account with this email already exists' });
        }
        return res.status(500).json({ ok: false, error: 'Unable to create account' });
      }
      userRow = data;
    }

    if (!userRow?.id) {
      return res.status(500).json({ ok: false, error: 'Unable to create account' });
    }

    await recordLegalAcceptances({
      supabase,
      userId: userRow.id,
      email,
      docs: legalDocs.docs,
      acceptedAt: new Date().toISOString(),
      source: 'chatty-auth-register',
      ipAddress: getClientIpAddress(req),
      userAgent: toNonEmptyString(req.get('user-agent')).slice(0, 512),
    });

    const { getOrCreateUser } = await import('./lib/userRegistry.js');
    const userProfile = await getOrCreateUser(String(userRow.id), email, name);
    const payload = buildAuthJwtPayload({
      id: userProfile.user_id,
      sub: userProfile.user_id,
      uid: String(userRow.id),
      name,
      email,
      picture: toNonEmptyString(userRow?.avatar_url) || toNonEmptyString(userRow?.picture),
      auth_provider: 'credentials',
    });
    setAuthSessionCookie(req, res, payload);

    return res.status(201).json({
      ok: true,
      user: payload,
      auth: { provider: 'credentials' },
    });
  } catch (error) {
    console.error('❌ [Auth] Register failed:', error);
    return res.status(500).json({ ok: false, error: 'Sign-up failed' });
  }
});

app.get("/api/health/routes", (_req, res) => {
  res.status(200).json(getRouteIntegritySnapshot());
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
      sub: userProfile.user_id,
      uid: 'dev_user_001',
      name: name,
      given_name: 'Dev',
      family_name: 'User',
      email: email,
      picture: null,
      locale: 'en',
      auth_provider: 'dev'
    };

    const cookieOptions = createSessionCookieOptions(req);
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
    res.cookie(COOKIE_NAME, token, cookieOptions);
    console.log('[COOKIE SET]', {
      name: COOKIE_NAME,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      domain: cookieOptions.domain,
      maxAge: cookieOptions.maxAge
    });

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
const cliAuthExchangeCodes = new Map();
const OAUTH_STATE_TTL = 10 * 60 * 1000;
const EXCHANGE_CODE_TTL = 2 * 60 * 1000;

function buildAllowedOrigins() {
  const origins = new Set(RUNTIME_HANDSHAKE.allowedBrowserOrigins);
  if (!IS_PRODUCTION && REPLIT_DOMAIN) origins.add(`https://${REPLIT_DOMAIN}`);
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
  for (const [key, val] of cliAuthExchangeCodes) {
    if (now - val.created > EXCHANGE_CODE_TTL) cliAuthExchangeCodes.delete(key);
  }
}, 60 * 1000);

function createCliAuthExchange({ token, user, cid }) {
  const code = cryptoRandom();
  cliAuthExchangeCodes.set(code, {
    token,
    user,
    cid,
    created: Date.now(),
  });
  return code;
}

app.get("/api/auth/cli/start", authLimiter, (req, res) => {
  let correlationId = createAuthCorrelationId();
  res.set("X-Auth-Correlation", correlationId);

  const cliCallback = normalizeCliCallbackUrl(req.query?.cli_callback);
  if (!cliCallback) {
    return res.status(400).json({
      ok: false,
      error: "Invalid or missing cli_callback",
      cid: correlationId,
    });
  }

  const rawToken = req.cookies?.[COOKIE_NAME];
  if (rawToken) {
    try {
      const decoded = jwt.verify(rawToken, JWT_SECRET);
      const user = buildAuthJwtPayload(decoded);
      const code = createCliAuthExchange({
        token: rawToken,
        user,
        cid: correlationId,
      });
      return res.redirect(
        buildCliCallbackRedirect(cliCallback, { code, cid: correlationId }),
      );
    } catch (error) {
      console.warn(
        `⚠️ [CLI Auth][cid:${correlationId}] Existing session invalid, falling back to OAuth`,
        error?.name || error?.message || error,
      );
    }
  }

  const googleUrl = new URL("/api/auth/google", getRequestOrigin(req));
  googleUrl.searchParams.set("cli_callback", cliCallback);
  return res.redirect(googleUrl.toString());
});

app.post("/api/auth/cli/exchange", authLimiter, (req, res) => {
  let correlationId = createAuthCorrelationId();
  const code = typeof req.body?.code === "string" ? req.body.code : "";

  if (!code) {
    return res.status(400).json({
      ok: false,
      error: "Missing exchange code",
      cid: correlationId,
    });
  }

  const entry = cliAuthExchangeCodes.get(code);
  if (!entry) {
    return res.status(400).json({
      ok: false,
      error: "Invalid or expired exchange code",
      cid: correlationId,
    });
  }

  cliAuthExchangeCodes.delete(code);
  correlationId = entry.cid || correlationId;
  res.set("X-Auth-Correlation", correlationId);

  if (Date.now() - entry.created > EXCHANGE_CODE_TTL) {
    return res.status(410).json({
      ok: false,
      error: "Exchange code expired",
      cid: correlationId,
    });
  }

  const decoded = jwt.decode(entry.token);
  const expiresAt = typeof decoded?.exp === "number" ? decoded.exp * 1000 : null;

  return res.status(200).json({
    ok: true,
    cid: correlationId,
    cookieName: COOKIE_NAME,
    sessionToken: entry.token,
    expiresAt,
    user: entry.user,
  });
});

// start OAuth (front-end should hit this)
app.get("/api/auth/google", authLimiter, (req, res) => {
  const correlationId = createAuthCorrelationId();
  res.set('X-Auth-Correlation', correlationId);
  console.log(`🔍 [OAuth][cid:${correlationId}] /api/auth/google endpoint hit`);
  const cliCallback = normalizeCliCallbackUrl(req.query?.cli_callback);

  if (shouldDelegateGoogleBrowserAuth(RUNTIME_HANDSHAKE, { cliCallback })) {
    const delegatedUrl = buildSharedAuthDelegationUrl(RUNTIME_HANDSHAKE, "/api/auth/google", {
      origin: CONFIGURED_PUBLIC_ORIGIN || getRequestOrigin(req),
    });
    for (const [key, rawValue] of Object.entries(req.query || {})) {
      if (key === "cli_callback" || key === "origin") continue;
      if (Array.isArray(rawValue)) {
        rawValue
          .filter((value) => value !== undefined && value !== null && `${value}`.trim() !== "")
          .forEach((value) => delegatedUrl.searchParams.append(key, `${value}`));
        continue;
      }
      if (rawValue !== undefined && rawValue !== null && `${rawValue}`.trim() !== "") {
        delegatedUrl.searchParams.set(key, `${rawValue}`);
      }
    }
    console.log(`↪️ [OAuth][cid:${correlationId}] Delegating browser login to shared auth:`, delegatedUrl.toString());
    return res.redirect(delegatedUrl.toString());
  }

  // Graceful degradation: avoid 500 and avoid calling getRequestOrigin/getRedirectUri/signState when env is missing
  if (!OAUTH.client_id || !OAUTH.client_secret) {
    console.warn(`⚠️ [OAuth][cid:${correlationId}] OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)`);
    return res.status(503).json({
      error: 'OAuth not configured',
      details: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for Google login.',
      cid: correlationId
    });
  }

  try {
    const originUrl = getRequestOrigin(req);
    console.log(`🔍 [OAuth][cid:${correlationId}] Detected origin via Origin/Referer/Host:`, originUrl, {
      origin_header: req.get('origin') || '(none)',
      referer_header: req.get('referer') || '(none)',
      x_forwarded_host: req.get('x-forwarded-host') || '(none)',
      is_replit: isReplitPreview(req)
    });

    if (!ALLOWED_ORIGINS.has(originUrl)) {
      console.warn(`⚠️ [OAuth][cid:${correlationId}] Origin not in allowlist: ${originUrl}. Allowed:`, [...ALLOWED_ORIGINS]);
    }

    const dynamicRedirectUri = getRedirectUri(req);

    console.log(`🔍 [OAuth][cid:${correlationId}] Environment check:`, {
      has_client_id: !!process.env.GOOGLE_CLIENT_ID,
      has_client_secret: !!process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: dynamicRedirectUri,
      is_replit_preview: isReplitPreview(req),
      origin: originUrl
    });

    if (!OAUTH.client_id) {
      console.error(`❌ [OAuth][cid:${correlationId}] GOOGLE_CLIENT_ID is not set in environment variables`);
      return res.status(500).json({ error: "OAuth configuration missing: GOOGLE_CLIENT_ID", cid: correlationId });
    }
    if (!OAUTH.client_secret) {
      console.error(`❌ [OAuth][cid:${correlationId}] GOOGLE_CLIENT_SECRET is not set in environment variables`);
      return res.status(500).json({ error: "OAuth configuration missing: GOOGLE_CLIENT_SECRET", cid: correlationId });
    }

    const nonce = cryptoRandom();
    const stateData = {
      nonce,
      origin: originUrl,
      redirect_uri: dynamicRedirectUri,
      cid: correlationId,
      ...(cliCallback ? { cli_callback: cliCallback } : {}),
    };
    const stateToken = signState(stateData);

    oauthPendingStates.set(nonce, {
      origin: originUrl,
      redirect_uri: dynamicRedirectUri,
      cid: correlationId,
      cli_callback: cliCallback,
      created: Date.now()
    });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", OAUTH.client_id);
    url.searchParams.set("redirect_uri", dynamicRedirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", stateToken);

    console.log(`✅ [OAuth][cid:${correlationId}] Redirecting to Google with redirect_uri:`, dynamicRedirectUri, 'origin:', originUrl);
    res.redirect(url.toString());
  } catch (error) {
    console.error(`❌ [OAuth][cid:${correlationId}] Unexpected error in /api/auth/google:`, error);
    console.error(`❌ [OAuth][cid:${correlationId}] Error stack:`, error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message, cid: correlationId });
  }
});

app.get('/api/auth/apple', authLimiter, (_req, res) => {
  return res.status(501).json({
    ok: false,
    provider: 'apple',
    error: 'Apple OAuth is not enabled for this deployment',
  });
});

app.get('/api/auth/github', authLimiter, (_req, res) => {
  return res.status(501).json({
    ok: false,
    provider: 'github',
    error: 'GitHub OAuth is not enabled for this deployment',
  });
});

// OAuth callback → exchange code → set cookie → redirect home
app.get("/api/auth/google/callback", authLimiter, async (req, res) => {
  let correlationId = createAuthCorrelationId();
  res.set('X-Auth-Correlation', correlationId);
  try {
    const { code, error: oauthError, state: stateParam, cid: requestCid } = req.query;
    if (typeof requestCid === 'string' && requestCid) {
      correlationId = requestCid;
    }

    let originUrl = IS_PRODUCTION ? (CONFIGURED_PUBLIC_ORIGIN || `https://${CANONICAL_DOMAIN}`) : (REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}` : 'http://localhost:5173');
    let callbackRedirectUri = REDIRECT_URI;
    let stateValid = false;
    let cliCallback = null;

    if (stateParam) {
      const stateData = verifyState(stateParam);
      if (stateData && stateData.nonce && stateData.origin) {
        const pending = oauthPendingStates.get(stateData.nonce);
        if (pending && pending.origin === stateData.origin) {
          oauthPendingStates.delete(stateData.nonce);
          correlationId = pending.cid || stateData.cid || correlationId;
          res.set('X-Auth-Correlation', correlationId);
          stateValid = true;
          const VALID_REDIRECT_URIS = new Set([REDIRECT_URI]);
          if (!IS_PRODUCTION) {
            VALID_REDIRECT_URIS.add(`http://localhost:5173${CALLBACK_PATH}`);
            VALID_REDIRECT_URIS.add(`http://localhost:5050${CALLBACK_PATH}`);
            VALID_REDIRECT_URIS.add(`http://127.0.0.1:5173${CALLBACK_PATH}`);
            VALID_REDIRECT_URIS.add(`http://127.0.0.1:5050${CALLBACK_PATH}`);
          }
          if (REPLIT_REDIRECT_URI) VALID_REDIRECT_URIS.add(REPLIT_REDIRECT_URI);
          if (pending.redirect_uri && VALID_REDIRECT_URIS.has(pending.redirect_uri)) {
            callbackRedirectUri = pending.redirect_uri;
          }
          cliCallback = normalizeCliCallbackUrl(
            pending.cli_callback || stateData.cli_callback,
          );
          if (ALLOWED_ORIGINS.has(stateData.origin)) {
            originUrl = stateData.origin;
          } else if (REPLIT_DOMAIN && stateData.origin === `https://${REPLIT_DOMAIN}`) {
            originUrl = stateData.origin;
          } else {
            console.warn(`⚠️ [OAuth Callback][cid:${correlationId}] Origin not in allowlist: ${stateData.origin}, using canonical`);
          }
        } else {
          console.warn(`⚠️ [OAuth Callback][cid:${correlationId}] State nonce not found or origin mismatch (possible replay)`);
        }
      } else {
        console.warn(`⚠️ [OAuth Callback][cid:${correlationId}] Invalid state signature`);
      }
    }

    if (!stateValid) {
      console.error(`❌ [OAuth Callback][cid:${correlationId}] CSRF check failed — state invalid or missing`);
      return res.redirect(`${originUrl}/?error=invalid_state`);
    }

    if (oauthError) {
      console.error(`❌ [OAuth Callback][cid:${correlationId}] OAuth error from Google:`, oauthError);
      return res.redirect(`${originUrl}/?error=${encodeURIComponent(oauthError)}`);
    }

    if (!code) {
      console.error(`❌ [OAuth Callback][cid:${correlationId}] OAuth callback missing code parameter`);
      return res.redirect(`${originUrl}/?error=missing_code`);
    }

    console.log(`🔍 [OAuth Callback][cid:${correlationId}] Using redirect_uri:`, callbackRedirectUri, 'origin:', originUrl);

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
      console.error(`❌ [OAuth Callback][cid:${correlationId}] OAuth token exchange failed:`, tokenRes);
      return res.redirect(`${originUrl}/?error=oauth_token_exchange_failed`);
    }

    const user = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json());
    console.log(`🖼️ [OAuth][cid:${correlationId}] Google user info received:`, {
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
      console.log(`✅ [User Registry][cid:${correlationId}] Registered user: ${userId} (${profile.email})`);

      try {
        const { GPTManager } = await import('./lib/gptManager.js');
        const gptManager = GPTManager.getInstance();
        gptManager.provisionUserConstructs(userId);
        console.log(`✅ [User Provisioning][cid:${correlationId}] System constructs provisioned for: ${userId}`);
      } catch (provisionError) {
        console.error(`⚠️ [User Provisioning][cid:${correlationId}] Failed to provision constructs (non-critical):`, provisionError);
      }
    } catch (regError) {
      console.error(`⚠️ [User Registry][cid:${correlationId}] Failed to register user (non-critical):`, regError);
      userId = profile.id || (doc._id.toString ? doc._id.toString() : doc._id);
    }

    const payload = buildAuthJwtPayload({
      id: userId,
      sub: userId,
      uid: profile.sub,
      name: profile.name,
      given_name: profile.given_name,
      family_name: profile.family_name,
      email: profile.email,
      picture: profile.picture,
      locale: profile.locale,
      auth_provider: 'google',
    });

    const sessionToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

    if (cliCallback) {
      res.cookie(COOKIE_NAME, sessionToken, createSessionCookieOptions(req));
      const cliCode = createCliAuthExchange({
        token: sessionToken,
        user: payload,
        cid: correlationId,
      });
      console.log(`✅ [OAuth Callback][cid:${correlationId}] OAuth success! Redirecting to CLI callback`);
      return res.redirect(
        buildCliCallbackRedirect(cliCallback, {
          code: cliCode,
          cid: correlationId,
        }),
      );
    }

    const originIsCanonical = isConfiguredCanonicalOrigin(originUrl, process.env);

    if (originIsCanonical) {
      console.log(`[COOKIE SET][cid:${correlationId}] Setting cookie on canonical domain`);
      res.cookie(COOKIE_NAME, sessionToken, createSessionCookieOptions(req));
      console.log(`✅ [OAuth Callback][cid:${correlationId}] OAuth success! Redirecting to ${originUrl}/app`);
      return res.redirect(`${originUrl}/app`);
    }

    const exchangeCode = cryptoRandom();
    oauthExchangeCodes.set(exchangeCode, {
      token: sessionToken,
      origin: originUrl,
      cid: correlationId,
      created: Date.now()
    });
    console.log(`✅ [OAuth Callback][cid:${correlationId}] OAuth success! Redirecting to origin with exchange code: ${originUrl}`);
    res.redirect(`${originUrl}/api/auth/set-session?code=${encodeURIComponent(exchangeCode)}&cid=${encodeURIComponent(correlationId)}`);
  } catch (e) {
    console.error(`❌ [OAuth Callback][cid:${correlationId}] OAuth callback error:`, e);
    const errorRedirect = IS_PRODUCTION ? (CONFIGURED_PUBLIC_ORIGIN || `https://${CANONICAL_DOMAIN}`) : (REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}` : 'http://localhost:5173');
    res.redirect(`${errorRedirect}/?error=auth_failed`);
  }
});

app.get("/api/auth/set-session", (req, res) => {
  let correlationId = createAuthCorrelationId();
  const { code, cid: requestCid } = req.query;
  if (typeof requestCid === 'string' && requestCid) {
    correlationId = requestCid;
  }
  res.set('X-Auth-Correlation', correlationId);

  if (!code) {
    console.error(`❌ [set-session][cid:${correlationId}] Missing exchange code`);
    return res.redirect('/?error=missing_code');
  }
  const entry = oauthExchangeCodes.get(code);
  if (!entry) {
    console.error(`❌ [set-session][cid:${correlationId}] Invalid or expired exchange code`);
    return res.redirect('/?error=invalid_or_expired_code');
  }
  correlationId = entry.cid || correlationId;
  res.set('X-Auth-Correlation', correlationId);
  oauthExchangeCodes.delete(code);

  if (Date.now() - entry.created > EXCHANGE_CODE_TTL) {
    console.error(`❌ [set-session][cid:${correlationId}] Exchange code expired`);
    return res.redirect('/?error=expired_code');
  }

  const cookieOptions = {
    httpOnly: true,
    secure: cookieSecure(req),
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30
  };
  if (cookieSecure(req)) {
    cookieOptions.domain = COOKIE_DOMAIN;
  } else {
    delete cookieOptions.domain;
  }
  const redirectTo = (entry.origin && ALLOWED_ORIGINS.has(entry.origin))
    ? `${entry.origin}/app`
    : '/app';
  console.log(`[set-session][cid:${correlationId}] Reached; host:`, req.get('host'), 'x-forwarded-host:', req.get('x-forwarded-host') || '(none)', 'redirectTo:', redirectTo);
  console.log(`[set-session][cid:${correlationId}] cookieOptions:`, cookieOptions);
  console.log(`[COOKIE SET][cid:${correlationId}] Setting cookie on origin domain via set-session`);
  res.cookie(COOKIE_NAME, entry.token, cookieOptions);
  return res.redirect(redirectTo);
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
app.post("/api/logout", async (req, res) => {
  const clearCookieOptions = {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(req),
    sameSite: 'lax'
  };
  if (cookieSecure(req)) {
    clearCookieOptions.domain = COOKIE_DOMAIN;
  }
  if (isSharedAuthBrowserLoginEnabled(RUNTIME_HANDSHAKE)) {
    try {
      const origin = CONFIGURED_PUBLIC_ORIGIN || getRequestOrigin(req);
      const sharedLogoutResponse = await fetch(`${RUNTIME_HANDSHAKE.authApiBaseUrl}/api/logout`, {
        method: "POST",
        headers: {
          cookie: typeof req.headers?.cookie === "string" ? req.headers.cookie : "",
          origin,
          referer: `${origin}/`,
          ...(req.headers?.["user-agent"] ? { "user-agent": req.headers["user-agent"] } : {}),
          ...(req.headers?.["x-forwarded-for"] ? { "x-forwarded-for": req.headers["x-forwarded-for"] } : {}),
        },
        redirect: "manual",
      });
      appendSetCookieHeaders(res, getResponseSetCookieHeaders(sharedLogoutResponse));
    } catch (error) {
      console.warn("⚠️ [Auth] Shared logout bridge failed:", error?.message || error);
    }
  }
  res.clearCookie(COOKIE_NAME, clearCookieOptions);
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
    const clearCookieOptions = {
      path: "/",
      httpOnly: true,
      secure: cookieSecure(req),
      sameSite: 'lax'
    };
    if (cookieSecure(req)) {
      clearCookieOptions.domain = COOKIE_DOMAIN;
    }
    res.clearCookie(COOKIE_NAME, clearCookieOptions);

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
  const CLIENT_TRACE_LOG_PATH = "/tmp/chatty-client-trace.log";

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

  app.post('/api/debug/client-trace', express.json({ limit: '128kb' }), (req, res) => {
    try {
      const entry = {
        receivedAt: new Date().toISOString(),
        ...req.body,
      };
      fs.appendFileSync(CLIENT_TRACE_LOG_PATH, JSON.stringify(entry) + "\n");
      res.json({ ok: true });
    } catch (error) {
      console.error("❌ [debug/client-trace] Failed to persist trace:", error);
      res.status(500).json({ ok: false });
    }
  });
}

// Mount conversation routes with auth
app.use("/api/conversations", requireAuth, convRoutes);
if (process.env.ENABLE_DIAGNOSTICS === 'true') {
  app.use("/api/diagnostics", requireAuth, diagnosticsRoutes);
  console.log('✅ [Server] Diagnostics routes mounted at /api/diagnostics (admin)');
}


// Mount AI routes with auth
app.use("/api/ais", requireAuth, aiRoutes);

// Mount VVAULT routes with the preferred shared-auth bridge while keeping service-token fallback.
app.use("/api/vvault", requestClock, requirePreferredAuthOrServiceToken, vvaultRoutes);
app.use("/api/construct", requestClock, requireAuthOrServiceToken, constructRoutes);
mountedRouteState.vvaultMounted = true;
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
// Mount theme route (published theme info)
app.use('/api/theme', themeRoutes);
console.log('✅ [Server] Theme info route mounted at /api/theme');

// Preview synthesis proxy (no auth required for now; adjust if needed)
app.use("/api/preview", requireAuth, previewRoutes);

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

// Codex continuity pickup route
app.use("/api/codex", requireAuth, codexRoutes);
console.log('✅ [Server] Codex routes mounted at /api/codex');

// Master Scripts routes (autonomy stack for constructs)
app.use("/api/master", requireAuth, masterScriptsRoutes);
console.log('✅ [Server] Master Scripts routes mounted at /api/master (admin)');

// Scripts routes (GPTCreator compatibility)
if (process.env.ENABLE_SCRIPTS === 'true') {
  app.use("/api/scripts", requireAuth, scriptsRoutes);
  console.log('✅ [Server] Scripts routes mounted at /api/scripts (admin)');
}

// simForge routes (personality extraction and identity forging)
app.use("/api/simforge", requireAuth, simForgeRoutes);
if (process.env.ENABLE_FINANCE === 'true') {
  app.use("/api/fxshinobi", fxshinobiRoutes);
  console.log('✅ [Server] FXShinobi proxy routes mounted at /api/fxshinobi');
}
app.use("/api/vault", requireAuth, vaultProxyRoutes);
if (process.env.ENABLE_MOCR === 'true') {
  app.use("/api/mocr", requireAuth, mocrProxyRoutes);
  console.log('✅ [Server] MOCR proxy routes mounted at /api/mocr');
}
app.use("/api/transcribe", transcribeRoutes);
app.use("/api/tts", requireAuth, ttsRoutes);
app.use("/api/voice", requireAuth, voiceUploadRoutes);
app.use("/api/suggestions", requireAuth, suggestionsRoutes);
app.use("/api/attachments", requireAuth, attachmentsRoutes);
app.use("/api/search", requireAuth, searchRoutes);
app.use("/api/needle", requireAuth, needleRoutes);
app.use("/api/selfprompt", selfpromptRoutes);
if (process.env.ENABLE_FAMILY === 'true') {
  app.use("/api/family", familyRoutes);
  console.log('✅ [Server] Family & Parental Controls routes mounted at /api/family');
}
if (process.env.ENABLE_TELEPHONY === 'true') {
  app.use('/api/telephony/twilio', telephonyTwilioRoutes);
  console.log('✅ [Server] Telephony/Twilio routes mounted at /api/telephony/twilio');
}
app.use('/api/capabilities', capabilitiesRouter);
app.use('/api/zen', zenRoutes);
console.log('✅ [Server] Capabilities routes mounted at /api/capabilities');
console.log('✅ [Server] Needle receipt retriever mounted at /api/needle');
console.log('✅ [Server] simForge routes mounted at /api/simforge');
console.log('✅ [Server] Transcribe (ASR) routes mounted at /api/transcribe');
console.log('✅ [Server] VVAULT proxy routes mounted at /api/vault');
console.log('✅ [Server] Suggestions routes mounted at /api/suggestions');
console.log('✅ [Server] Attachments routes mounted at /api/attachments');
logRouteIntegrityStartup();

// Last-resort error handler: ensures route/middleware throws become JSON (not a dropped connection),
// and includes `rid` for correlation with browser Network entries.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('❌ [Express] Unhandled error:', err, { rid: req?._rid || null, path: req?.originalUrl });
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: err?.message || String(err), rid: req?._rid || null });
});

function cryptoRandom() {
  return randomBytes(16).toString("hex");
}

function createAuthCorrelationId() {
  return cryptoRandom().slice(0, 12);
}

// SPA catch-all: serve index.html for client-side routing in production
if (isProduction) {
  const indexPath = path.join(__dirname, '../dist/index.html');
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(200).send('ok');
      }
    });
  });
}

// choose port with some defensive logic. the front-end dev server
// often sets PORT=5173 in the shell, which previously leaked into the
// backend start script and caused the API to bind on the wrong port
// (see incident report). we try to use the env var if provided, but
// ignore the known bad value and fall back to the normal default.
const DEFAULT_PORT = IS_PRODUCTION ? 5000 : 5050;
let PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
if (process.env.PORT && PORT === 5173) {
  console.warn(`⚠️ [Server] Ignoring environment PORT=${process.env.PORT} ` +
               `(looks like the Vite dev server) and using ${DEFAULT_PORT}`);
  PORT = DEFAULT_PORT;
}
if (isNaN(PORT)) {
  PORT = DEFAULT_PORT;
}

function startServer(port, retryCount = 0) {
  const host = process.env.ALLOW_REMOTE === 'true' ? '0.0.0.0' : '127.0.0.1';
  const srv = app.listen(port, host, () => {
    serverReady = true;
    console.log(`API on ${host}:${port}`);
    if (process.env.ZEN_WATCH_DISABLED !== 'true' && process.env.NODE_ENV !== 'test') {
      try { startZenWatch(); } catch (err) { console.warn('[ZenWatch] failed to start', err?.message || err); }
    }
  });
  setupTranscribeStream(srv);
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retryCount === 0) {
      console.error(`❌ [Server] Port ${port} is already in use; refusing to auto-kill another process.`);
    } else if (err.code === 'EADDRINUSE') {
      console.error(`❌ [Server] Port ${port} still in use after cleanup. Server cannot start.`);
      console.error(`❌ [Server] Please manually kill the process using port ${port} and restart.`);
    } else {
      console.error(`❌ [Server] Failed to start:`, err.message);
    }
  });
}

startServer(PORT);

// Deferred heavy initialization — runs AFTER server starts listening so health checks pass immediately
(async () => {
  try {
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
      } catch (error) {
        console.log('🚀 Continuing in development mode without database...');
      }
    } else {
      console.log('🚀 Running in memory-only mode (no MONGODB_URI set)');
    }

    try {
      const { initializeUserRegistry } = await import('./lib/userRegistry.js');
      await initializeUserRegistry();
    } catch (error) {
      console.error('⚠️ [Server] Failed to initialize user registry:', error);
    }

    try {
      console.log('🧠 [Server] Initializing memory persistence system...');
      const { getMemoryStore } = await import('../src/lib/MemoryStore.js');
      const memoryStore = getMemoryStore('./memory.db');
      await memoryStore.initialize();

      const VVAULT_BASE = process.env.VVAULT_PATH || process.env.VVAULT_ROOT_PATH || '';
      let vvaultAvailable = false;
      try {
        await import('fs').then(fs => fs.promises.access(VVAULT_BASE));
        vvaultAvailable = true;
      } catch {
        console.log('ℹ️ [Server] VVAULT path not found, skipping VVAULT initialization (Replit mode)');
      }

      let watchedConstructCount = 0;
      if (vvaultAvailable) {
        console.log('ℹ️ [Server] Skipping startup transcript preload/watch until an authenticated user session provides an account-scoped userId');
      }

      const stats = await memoryStore.getStats();
      console.log('✅ [Server] Memory system initialized:', {
        messages: stats.messageCount,
        triples: stats.tripleCount,
        fragments: stats.fragmentCount,
        watchedConstructs: watchedConstructCount
      });
    } catch (error) {
      console.error('❌ [Server] Failed to initialize memory system:', error);
    }

    try {
      getChatService();
      console.log('✅ [ChatService] Database initialized successfully.');
    } catch (error) {
      console.error('❌ [Server] Failed to initialize ChatService:', error);
    }

    serverReady = true;
    console.log('✅ [Server] All deferred initialization complete — server fully ready');
  } catch (err) {
    console.error('❌ [Server] Deferred initialization error:', err);
    serverReady = true;
  }
})();

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
    const systemConstructs = ['zen-001', 'lin-001', 'katana-001', 'sera-001', 'nova-001', 'val-001'];
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

// Initialize Theme Publisher Cron (daily midnight writer)
try {
  const { initializeThemePublisher } = await import('./cron/themePublisher.js');
  initializeThemePublisher();
} catch (error) {
  console.error('❌ [Server] Failed to initialize theme publisher cron:', error);
}

// PERFORMANCE OPTIMIZATION: Warm capsule cache for frequently used GPTs
// Dev speed-up: skip warming outside production to reduce boot time.
if (process.env.NODE_ENV === 'production') {
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
          // Treat missing capsule dirs as a warning, not fatal.
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
} else {
  console.log('⏭️ [Server] Skipping capsule cache warming in non-production mode for faster startup');
}

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
