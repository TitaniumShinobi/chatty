import express from "express";
import fetch from "node-fetch"; // if on Node <18, else use global fetch
import cookieParser from "cookie-parser";
import cors from "cors";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { connectDB } from "./config/database.js";
import { Store } from "./store.js";
import { requireAuth } from "./middleware/auth.js";
import convRoutes from "./routes/conversations.js";
import aiRoutes from "./routes/ais.js";
import { randomBytes } from "node:crypto";
import vvaultRoutes from "./routes/vvault.js";
import previewRoutes from "./routes/preview.js";

dotenv.config();

// Construct canonical redirect URI with normalization
const PUBLIC_CALLBACK_BASE = process.env.PUBLIC_CALLBACK_BASE || 'http://localhost:5173';
const CALLBACK_PATH = process.env.CALLBACK_PATH || '/api/auth/google/callback';
const REDIRECT_URI = `${PUBLIC_CALLBACK_BASE.replace(/\/$/, '')}${CALLBACK_PATH.startsWith('/') ? CALLBACK_PATH : '/' + CALLBACK_PATH}`;

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

const app = express();
app.use(express.json());
app.use(cookieParser());
app.set("trust proxy", 1);

// single-origin dev
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs (10 OAuth flows)
  message: { error: "Too many auth attempts, please try again later" }
});

const OAUTH = {
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect_uri: REDIRECT_URI,
  token_url: "https://oauth2.googleapis.com/token",
  userinfo_url: "https://www.googleapis.com/oauth2/v3/userinfo",
};

const COOKIE_NAME = process.env.COOKIE_NAME || "sid";

// health endpoints
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// start OAuth (front-end should hit this)
app.get("/api/auth/google", authLimiter, (req, res) => {
  try {
    if (!OAUTH.client_id) {
      console.error("❌ [OAuth] GOOGLE_CLIENT_ID is not set in environment variables");
      return res.status(500).json({ error: "OAuth configuration missing: GOOGLE_CLIENT_ID" });
    }
    if (!OAUTH.client_secret) {
      console.error("❌ [OAuth] GOOGLE_CLIENT_SECRET is not set in environment variables");
      return res.status(500).json({ error: "OAuth configuration missing: GOOGLE_CLIENT_SECRET" });
    }
    
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
  res.redirect(url.toString());
  } catch (error) {
    console.error("❌ [OAuth] Error in /api/auth/google:", error);
    res.status(500).json({ error: error.message });
  }
});

// OAuth callback → exchange code → set cookie → redirect home
app.get("/api/auth/google/callback", authLimiter, async (req, res) => {
  try {
    const { code, error } = req.query;
    
    // Handle OAuth errors from Google
    if (error) {
      console.error('OAuth error from Google:', error);
      const frontendUrl = process.env.POST_LOGIN_REDIRECT || "http://localhost:5173";
      return res.redirect(`${frontendUrl}/?error=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      console.error('OAuth callback missing code parameter');
      const frontendUrl = process.env.POST_LOGIN_REDIRECT || "http://localhost:5173";
      return res.redirect(`${frontendUrl}/?error=missing_code`);
    }

    // 1) exchange code for tokens
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
      const frontendUrl = process.env.POST_LOGIN_REDIRECT || "http://localhost:5173";
      return res.redirect(`${frontendUrl}/?error=oauth_token_exchange_failed&details=${encodeURIComponent(JSON.stringify(tokenRes))}`);
    }

    // 2) fetch user info
    const user = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json()); // {sub, email, name, picture}

    // 3) persist user to DB and issue session
    const profile = { sub: user.sub, name: user.name, email: user.email, picture: user.picture };
    const doc = await Store.upsertUser({ 
      uid: profile.sub, 
      name: profile.name, 
      email: profile.email, 
      picture: profile.picture 
    });
    
    const userId = doc._id.toString?.() ?? doc._id;
    
    // 3b) Register user in Chatty user registry
    try {
      const { getOrCreateUser } = await import('./lib/userRegistry.js');
      await getOrCreateUser(userId, profile.email, profile.name);
      console.log(`✅ [User Registry] Registered user: ${userId} (${profile.email})`);
    } catch (regError) {
      console.error('⚠️ [User Registry] Failed to register user (non-critical):', regError);
      // Continue anyway - user can still use the app
    }
    
    const payload = { 
      id: userId, 
      uid: profile.sub, 
      name: profile.name, 
      email: profile.email, 
      picture: profile.picture 
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.cookie(process.env.COOKIE_NAME || "sid", token, {
      httpOnly: false,       // Allow JavaScript access for debugging
      sameSite: "lax",
      secure: false,         // true behind HTTPS
      path: "/",             // critical so /api/me can read it
      maxAge: 1000*60*60*24*30
      // Don't set domain - let browser handle it for localhost
    });

    // 4) redirect back to app (to /app route which shows Home)
    const frontendUrl = process.env.POST_LOGIN_REDIRECT || "http://localhost:5173";
    console.log(`✅ OAuth success! Redirecting to ${frontendUrl}/app`);
    res.redirect(`${frontendUrl}/app`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    const frontendUrl = process.env.POST_LOGIN_REDIRECT || "http://localhost:5173";
    res.redirect(`${frontendUrl}/?error=auth_failed`);
  }
});

// session probe
app.get("/api/me", (req, res) => {
  const raw = req.cookies?.[process.env.COOKIE_NAME || "sid"];
  if (!raw) return res.status(401).json({ ok:false });

  try {
    const user = jwt.verify(raw, process.env.JWT_SECRET);
    // If you persist users: fetch by user.uid and return DB record here.
    res.json({ ok:true, user });
  } catch {
    res.status(401).json({ ok:false });
  }
});

// Proxy Google profile images to avoid CORS issues
app.get("/api/profile-image/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user from session to verify access
    const raw = req.cookies?.[process.env.COOKIE_NAME || "sid"];
    if (!raw) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const user = jwt.verify(raw, process.env.JWT_SECRET);

    // Accept sub/id/uid from token for matching
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
  res.clearCookie(process.env.COOKIE_NAME || "sid", { path: "/" });
  res.json({ ok: true });
});

// Debug session endpoint (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/session', (req, res) => {
    const raw = req.cookies?.[process.env.COOKIE_NAME || "sid"];
    if (!raw) {
      return res.json({ ok: false, user: null });
    }
    
    try {
      const user = jwt.verify(raw, process.env.JWT_SECRET);
      res.json({ ok: true, user });
    } catch {
      res.json({ ok: false, user: null });
    }
  });
}

// Mount conversation routes with auth
app.use("/api/conversations", requireAuth, convRoutes);

// Mount AI routes with auth
app.use("/api/ais", requireAuth, aiRoutes);

// Mount VVAULT routes with auth
app.use("/api/vvault", requireAuth, vvaultRoutes);

// Preview synthesis proxy (no auth required for now; adjust if needed)
app.use("/api/preview", previewRoutes);

function cryptoRandom() {
  return randomBytes(16).toString("hex");
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API on :${PORT}`));
