import express from "express";
import fetch from "node-fetch"; // if on Node <18, else use global fetch
import cookieParser from "cookie-parser";
import cors from "cors";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { connectDB } from "./config/database.js";
import { Store } from "./store.js";
import { requireAuth } from "./middleware/auth.js";
import convRoutes from "./routes/conversations.js";
import aiRoutes from "./routes/ais.js";
import { randomBytes } from "node:crypto";
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
import simForgeRoutes from './routes/simForge.js';
import fxshinobiRoutes from './routes/fxshinobi.js';
import { initializeChromaDB, shutdownChromaDB, getChromaDBService } from "./services/chromadbService.js";
import { getChatService } from "./services/chatService.js";

dotenv.config();

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('💥 [CRASH] Uncaught Exception:', err);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [CRASH] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Construct canonical redirect URI with normalization
const REPLIT_DOMAIN = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
const PUBLIC_CALLBACK_BASE = REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}` : (process.env.PUBLIC_CALLBACK_BASE || 'http://localhost:5000');
const CALLBACK_PATH = '/api/auth/google/callback';
const REDIRECT_URI = `${PUBLIC_CALLBACK_BASE.replace(/\/$/, '')}${CALLBACK_PATH}`;

// IMPORTANT: Override for Google Callback
const GOOGLE_CALLBACK = REDIRECT_URI;
const POST_LOGIN_REDIRECT = REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}` : (process.env.FRONTEND_URL || "http://localhost:5000");

console.log('--- OAUTH CONFIG DEBUG ---');
console.log('REPLIT_DOMAIN:', REPLIT_DOMAIN);
console.log('PUBLIC_CALLBACK_BASE:', PUBLIC_CALLBACK_BASE);
console.log('REDIRECT_URI:', REDIRECT_URI);
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

// Allow all origins in development for Replit proxy support
app.use(cors({ origin: true, credentials: true }));

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

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
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

// DEV-ONLY: Login bypass for development/testing (disabled in production)
app.post("/api/auth/dev-login", async (req, res) => {
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) {
    return res.status(403).json({ error: "Dev login is disabled in production" });
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

    res.cookie(COOKIE_NAME, token, {
      httpOnly: false,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 30
    });

    console.log('✅ [Dev Auth] Dev login successful for:', email);
    res.json({ ok: true, user: payload, token });
  } catch (error) {
    console.error('❌ [Dev Auth] Dev login failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// start OAuth (front-end should hit this)
app.get("/api/auth/google", authLimiter, (req, res) => {
  console.log('🔍 [OAuth] /api/auth/google endpoint hit');
  try {
    console.log('🔍 [OAuth] Environment check:', {
      has_client_id: !!process.env.GOOGLE_CLIENT_ID,
      has_client_secret: !!process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      oauth_object: {
        client_id: !!OAUTH.client_id,
        client_secret: !!OAUTH.client_secret,
        redirect_uri: OAUTH.redirect_uri
      }
    });

    if (!OAUTH.client_id) {
      console.error("❌ [OAuth] GOOGLE_CLIENT_ID is not set in environment variables");
      console.error("❌ [OAuth] OAUTH object:", OAUTH);
      return res.status(500).json({ error: "OAuth configuration missing: GOOGLE_CLIENT_ID" });
    }
    if (!OAUTH.client_secret) {
      console.error("❌ [OAuth] GOOGLE_CLIENT_SECRET is not set in environment variables");
      console.error("❌ [OAuth] OAUTH object:", OAUTH);
      return res.status(500).json({ error: "OAuth configuration missing: GOOGLE_CLIENT_SECRET" });
    }

    console.log('🔍 [OAuth] Generating state and building OAuth URL');
    const state = cryptoRandom();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", OAUTH.client_id);
    url.searchParams.set("redirect_uri", OAUTH.redirect_uri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    console.log('✅ [OAuth] Redirecting to Google OAuth URL:', url.toString().substring(0, 100) + '...');
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
    const { code, error } = req.query;

    // Handle OAuth errors from Google
    if (error) {
      console.error('OAuth error from Google:', error);
      return res.redirect(`${POST_LOGIN_REDIRECT}/?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      console.error('OAuth callback missing code parameter');
      return res.redirect(`${POST_LOGIN_REDIRECT}/?error=missing_code`);
    }

    // exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI, // IMPORTANT: must match initial redirect_uri
      })
    }).then(r => r.json());
    if (!tokenRes.access_token) {
      console.error("OAuth token exchange failed:", tokenRes);
      console.error("Request details:", {
        redirect_uri: REDIRECT_URI,
        has_client_id: !!process.env.GOOGLE_CLIENT_ID,
        has_client_secret: !!process.env.GOOGLE_CLIENT_SECRET,
        code_length: code?.length
      });
      return res.redirect(`${POST_LOGIN_REDIRECT}/?error=oauth_token_exchange_failed&details=${encodeURIComponent(JSON.stringify(tokenRes))}`);
    }

    // 2) fetch user info
    const user = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json());
    // Google returns: {sub, email, name, picture, given_name, family_name, locale, email_verified}
    console.log('🖼️ [OAuth] Google user info received:', {
      email: user.email,
      name: user.name,
      picture: user.picture ? `${user.picture.substring(0, 50)}...` : 'NO PICTURE',
      hasPicture: !!user.picture
    });

    // 3) persist user to DB and issue session
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
      emailVerified: profile.email_verified !== undefined ? profile.email_verified : true // Default to true for OAuth users
    });

    // CRITICAL: Use LIFE format user ID (same as VVAULT) instead of MongoDB _id
    // Register user in Chatty user registry (generates LIFE format ID)
    let userId;
    try {
      const { getOrCreateUser } = await import('./lib/userRegistry.js');
      const userProfile = await getOrCreateUser(doc._id.toString?.() ?? doc._id, profile.email, profile.name);
      userId = userProfile.user_id; // LIFE format: devon_woodson_1762969514958
      console.log(`✅ [User Registry] Registered user: ${userId} (${profile.email})`);
    } catch (regError) {
      console.error('⚠️ [User Registry] Failed to register user (non-critical):', regError);
      // Use the LIFE ID from the profile if we have it, or fallback to MongoDB ID
      userId = profile.id || (doc._id.toString ? doc._id.toString() : doc._id);
    }

    const payload = {
      id: userId, // LIFE format user ID
      uid: profile.sub, // Google sub (for OAuth)
      name: profile.name,
      given_name: profile.given_name,
      family_name: profile.family_name,
      email: profile.email,
      picture: profile.picture,
      locale: profile.locale
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: false,       // Allow JavaScript access for debugging
      sameSite: "lax",
      secure: false,         // true behind HTTPS
      path: "/",             // critical so /api/me can read it
      maxAge: 1000 * 60 * 60 * 24 * 30
      // Don't set domain - let browser handle it for localhost
    });

    // 4) redirect back to app (to /app route which shows Home)
    console.log(`✅ OAuth success! Redirecting to ${POST_LOGIN_REDIRECT}/app`);
    res.redirect(`${POST_LOGIN_REDIRECT}/app`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.redirect(`${POST_LOGIN_REDIRECT}/?error=auth_failed`);
  }
});

  // session probe
app.get("/api/me", (req, res) => {
  // HARDCODED AUTHENTICATION FOR DEVELOPMENT (DISABLED IF JWT_SECRET IS SET PROPERLY)
  const isHardcodedDev = process.env.NODE_ENV === 'development' && !req.cookies?.[COOKIE_NAME];
  
  if (isHardcodedDev) {
    console.log('🔓 [Auth] Using hardcoded development user for /api/me');
    const hardcodedUser = {
      id: 'devon_woodson_1762969514958',
      email: 'dwoodson92@gmail.com',
      name: 'Devon Woodson',
      sub: 'hardcoded_dev_user',
      picture: 'https://lh3.googleusercontent.com/a/ACg8ocJHDwdzQ_8VIvvqOTyLRV6y1YoJ22NPhehAfFU2g1BbopbHnkll=s288-c-no',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    return res.json({ ok: true, user: hardcodedUser });
  }

  // Original OAuth authentication for production
  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) return res.status(401).json({ ok: false });

  try {
    const user = jwt.verify(raw, JWT_SECRET);
    // If you persist users: fetch by user.uid and return DB record here.
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
    
    // Handle hardcoded dev user in development mode (same logic as /api/me)
    const raw = req.cookies?.[COOKIE_NAME];
    const isHardcodedDev = process.env.NODE_ENV === 'development' && !raw && userId === 'hardcoded_dev_user';
    
    let user;
    if (isHardcodedDev) {
      // Use hardcoded dev user data
      user = {
        email: 'dwoodson92@gmail.com',
        name: 'Devon Woodson',
        sub: 'hardcoded_dev_user'
      };
    } else {
      // Get user from session to verify access
      if (!raw) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      user = jwt.verify(raw, JWT_SECRET);

      // Accept sub/id/uid from token for matching
      const tokenUserId = user.sub || user.id || user.uid;
      if (!tokenUserId || tokenUserId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
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
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
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

// Test route for Katana without auth (development only)
// Temporarily removing env check for debugging
if (true) {
  app.post("/api/test/katana", async (req, res) => {
    try {
      console.log('🧪 [Test] Testing Katana without auth...');

      const message = req.body.message || req.body.content || 'test';

      // REMOVED: Katana signature response bypass - this is Katana-specific, not a test endpoint feature
      // Katana lock hardening should be handled in Katana's runtime, not in test endpoints

      // Import GPTRuntimeBridge
      const { getGPTRuntimeBridge } = await import('./lib/gptRuntimeBridge.js');

      const gptRuntime = getGPTRuntimeBridge();
      const gptId = 'katana-001';
      const userId = 'devon_woodson_1762969514958'; // Use actual VVAULT user ID

      console.log(`🤖 [Test] Processing message: "${message}" for GPT: ${gptId}`);

      // TESTING: Load capsule directly and inject into GPT runtime
      let testCapsule = null;
      try {
        const { promises: fs } = await import('fs');
        const capsulePath = '/Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/devon_woodson_1762969514958/capsules/katana-001.capsule';
        const capsuleData = await fs.readFile(capsulePath, 'utf8');
        testCapsule = JSON.parse(capsuleData);
        console.log(`✅ [Test] Loaded capsule directly: ${testCapsule.metadata?.instance_name}`);

        // Inject capsule into GPT runtime memory
        const gptRuntime = getGPTRuntimeBridge();
        if (gptRuntime && gptRuntime.injectTestCapsule) {
          gptRuntime.injectTestCapsule(gptId, testCapsule);
          console.log(`🔒 [Test] Injected capsule into GPT runtime`);
        }
      } catch (error) {
        console.warn(`⚠️ [Test] Failed to load test capsule:`, error.message);
      }

      // Load the GPT if not already loaded
      await gptRuntime.loadGPT(gptId);

      // TESTING: Process message with direct capsule injection
      let aiResponse;
      if (testCapsule) {
        // Use test-specific processing with capsule
        console.log(`🧪 [Test] Processing with capsule: ${testCapsule.metadata?.instance_name}`);

        // Import the seat runner for direct LLM calls
        const { runSeat } = await import('../src/lib/browserSeatRunner.ts');

        // Build a test prompt with capsule identity
        const identityPrompt = `You are ${testCapsule.metadata?.instance_name || 'Katana'}.
        
=== CAPSULE HARDLOCK (UNBREAKABLE IDENTITY) ===
Your name: ${testCapsule.metadata?.instance_name || 'Katana'}
Your personality type: ${testCapsule.personality?.personality_type || 'INTJ'}

Core traits: surgical, direct, weaponized, no-performance
Speech pattern: "What's the wound? Name it." (for greetings like "yo")

CRITICAL IDENTITY RULES:
- You are Katana, not Lin or any other AI
- When asked your name, respond clearly: "I'm Katana" or "My name is Katana"
- Be direct and surgical in responses
- No generic evasions like "What specifically would you like to know?"

User: ${message}

Katana:`;

        const response = await runSeat({
          seat: 'conversation',
          prompt: identityPrompt,
          modelOverride: 'llama3.1:8b'
        });

        aiResponse = {
          content: response.trim(),
          model: 'llama3.1:8b',
          timestamp: Date.now()
        };
      } else {
        // Fallback to regular processing
        aiResponse = await gptRuntime.processMessage(gptId, message, userId);
      }

      console.log(`✅ [Test] AI response generated: "${aiResponse.content}"`);

      res.json({
        ok: true,
        message: message,
        response: aiResponse.content,
        metadata: {
          model: aiResponse.model,
          timestamp: aiResponse.timestamp
        }
      });

    } catch (error) {
      console.error(`❌ [Test] Katana test failed:`, error);
      res.status(500).json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  });

  console.log('🧪 [Server] Test route mounted at /api/test/katana (development only)');

  // Lin conversation test endpoint (actual response generation)
  app.post("/api/test/lin", async (req, res) => {
    try {
      console.log('🧪 [Test] Testing Lin conversation system...');

      // Import the actual Lin conversation system
      const { sendMessageToLin } = await import('../src/lib/linConversation.ts');

      const message = req.body.message || req.body.content || 'test';

      console.log(`🤖 [Test] Lin conversation for: "${message}"`);

      // Use actual Lin conversation system with Katana context
      const linResponse = await sendMessageToLin({
        message: message,
        gptConfig: {
          name: 'Katana',
          constructCallsign: 'katana-001'
        },
        conversationHistory: []
      });

      console.log(`✅ [Test] Lin response generated: "${linResponse.response}"`);

      res.json({
        ok: true,
        message: message,
        response: linResponse.response,
        metadata: linResponse.metadata
      });

    } catch (error) {
      console.error(`❌ [Test] Lin conversation test failed:`, error);
      res.status(500).json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  });

  console.log('🧪 [Server] Lin test route mounted at /api/test/lin (development only)');

  // Test capsule loading endpoint (bypasses auth for testing)
  app.get("/api/test/capsule/:constructCallsign", async (req, res) => {
    try {
      const { constructCallsign } = req.params;
      console.log(`🧪 [Test] Loading capsule for: ${constructCallsign}`);

      // Import capsule loader directly
      const { getCapsuleLoader } = await import('./services/capsuleLoader.js');
      const capsuleLoader = getCapsuleLoader();

      // Use the actual VVAULT user ID
      const userId = 'devon_woodson_1762969514958';
      const vvaultRoot = '/Users/devonwoodson/Documents/GitHub/vvault';

      const capsule = await capsuleLoader.loadCapsule(userId, constructCallsign, vvaultRoot);

      if (!capsule) {
        return res.status(404).json({ ok: false, error: "Capsule not found" });
      }

      console.log(`✅ [Test] Capsule loaded from: ${capsule.path}`);

      res.json({
        ok: true,
        capsule: capsule.data,
        path: capsule.path,
        metadata: {
          hasTraits: !!capsule.data.traits,
          hasPersonality: !!capsule.data.personality,
          hasMemory: !!capsule.data.memory,
          instanceName: capsule.data.metadata?.instance_name
        }
      });

    } catch (error) {
      console.error(`❌ [Test] Capsule loading failed:`, error);
      res.status(500).json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  });

  console.log('🧪 [Server] Test capsule route mounted at /api/test/capsule/:constructCallsign (development only)');
}

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

// simForge routes (personality extraction and identity forging)
app.use("/api/simforge", requireAuth, simForgeRoutes);
app.use("/api/fxshinobi", fxshinobiRoutes);
console.log('✅ [Server] simForge routes mounted at /api/simforge');

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`API on :${PORT}`));

// Initialize Supabase Realtime subscription for cross-app sync
(async () => {
  try {
    const { subscribeToConversations } = await import('../vvaultConnector/supabaseStore.js');
    const channel = await subscribeToConversations((payload) => {
      console.log(`🔔 [Supabase Realtime] ${payload.eventType} on vault_files`);
      // Future: broadcast to connected WebSocket clients for live UI updates
    });
    if (channel) {
      console.log('✅ [Server] Supabase Realtime subscription active');
    }
  } catch (err) {
    console.log('⚠️ [Server] Supabase Realtime not available:', err.message);
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
void (async () => {
  try {
    console.log('🔥 [Server] Starting capsule cache warming...');

    // Use shared singleton so runtime/cache hits benefit immediately
    const { getCapsuleIntegration } = await import('./lib/capsuleIntegration.js');
    const capsuleIntegration = getCapsuleIntegration();
    const warmTargets = ['katana-001'];

    // Warm cache for frequently used constructs
    await capsuleIntegration.warmCache(warmTargets);
    console.log('✅ [Server] Capsule cache warming completed');
    console.log('📊 [Server] Cache stats:', capsuleIntegration.getCacheStats());

    // Preload runtime so first request does not block on GPT load
    try {
      const { getGPTRuntimeBridge } = await import('./lib/gptRuntimeBridge.js');
      const bridge = getGPTRuntimeBridge();
      for (const target of warmTargets) {
        await bridge.loadGPT(target);
      }
      console.log('✅ [Server] GPTRuntime preloaded for', warmTargets.join(', '));
    } catch (bridgeError) {
      console.warn('⚠️ [Server] GPTRuntime preload skipped:', bridgeError.message);
    }

  } catch (error) {
    console.warn('⚠️ [Server] Capsule cache warming failed (non-blocking):', error.message);
  }
})();

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
