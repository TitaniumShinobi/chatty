import express from "express";
import fetch from "node-fetch"; // if on Node <18, else use global fetch
import cookieParser from "cookie-parser";
import cors from "cors";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { connectDB } from "./config/database.js";
import { Store } from "./store.js";
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from "./middleware/auth.js";
import convRoutes from "./routes/conversations.js";
import gptRoutes from "./routes/gpts.js";
import { randomBytes } from "node:crypto";
dotenv.config();

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
  redirect_uri: `${process.env.PUBLIC_CALLBACK_BASE}${process.env.CALLBACK_PATH}`,
  token_url: "https://oauth2.googleapis.com/token",
  userinfo_url: "https://www.googleapis.com/oauth2/v3/userinfo",
};

const COOKIE_NAME = process.env.COOKIE_NAME || "sid";

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// start OAuth (front-end should hit this)
app.get("/api/auth/google", authLimiter, (req, res) => {
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
});

// OAuth callback → exchange code → set cookie → redirect home
app.get("/api/auth/google/callback", authLimiter, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("missing code");

    // 1) exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.PUBLIC_CALLBACK_BASE}${process.env.CALLBACK_PATH}`,
      })
    }).then(r => r.json());
    if (!tokenRes.access_token) {
      console.error("OAuth token exchange failed:", tokenRes);
      return res.status(400).send("OAuth token exchange failed");
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
    
    // Normalize payload to always include `sub` so the backend can use
    // `req.user.sub` consistently regardless of auth flow.
    const payload = { 
      sub: doc._id.toString?.() ?? doc._id,
      id: doc._id.toString?.() ?? doc._id, 
      uid: profile.sub, 
      name: profile.name, 
      email: profile.email, 
      picture: profile.picture 
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.cookie(process.env.COOKIE_NAME || "sid", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,         // true behind HTTPS
      path: "/",             // critical so /api/me can read it
      maxAge: 1000*60*60*24*30
    });

    // 4) redirect back to app
    res.redirect(process.env.POST_LOGIN_REDIRECT || "http://localhost:5173/");
  } catch (e) {
    console.error(e);
    res.status(500).send("Auth failed");
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

// email/password registration
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }

    // Check if user already exists
    const existingUser = await Store.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email" });
    }

    // Create new user (using email as uid for email/password users)
    const doc = await Store.upsertUser({ 
      uid: email, // Use email as uid for email/password users
      name: name, 
      email: email, 
      picture: null,
      provider: "email"
    });
    
    const payload = { 
      sub: doc._id.toString?.() ?? doc._id, // Ensure sub is always defined
      id: doc._id.toString?.() ?? doc._id, 
      uid: email, 
      name: name, 
      email: email, 
      picture: null 
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.cookie(process.env.COOKIE_NAME || "sid", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,         // true behind HTTPS
      path: "/",             // critical so /api/me can read it
      maxAge: 1000*60*60*24*30
    });

    res.json({ ok: true, user: payload });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// email/password login
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user by email
    const user = await Store.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // For now, we'll accept any password (in a real app, you'd hash and verify)
    // TODO: Implement proper password hashing and verification
    
    const payload = { 
      sub: user._id ? (user._id.toString?.() ?? user._id) : user.id, // Ensure sub is always defined
      id: user._id ? (user._id.toString?.() ?? user._id) : user.id, 
      uid: user.uid, 
      name: user.name, 
      email: user.email, 
      picture: user.picture 
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.cookie(process.env.COOKIE_NAME || "sid", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,         // true behind HTTPS
      path: "/",             // critical so /api/me can read it
      maxAge: 1000*60*60*24*30
    });

    res.json({ ok: true, user: payload });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
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

// Conversation storage endpoints
app.get("/api/conversations", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const conversations = await Store.getUserConversations(user.sub);
    res.json({ ok: true, conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ error: "Failed to get conversations" });
  }
});

app.post("/api/conversations", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { conversations } = req.body;
    console.log(`[API] POST /api/conversations user=${user?.sub} payloadSize=${JSON.stringify(req.body).length}`);
    
    if (!Array.isArray(conversations)) {
      return res.status(400).json({ error: "Conversations must be an array" });
    }
    
    try {
      await Store.saveUserConversations(user.sub, conversations);
    } catch (saveErr) {
      console.error('[API] Save conversations error:', saveErr);
      throw saveErr;
    }
    res.json({ ok: true, message: "Conversations saved successfully" });
  } catch (error) {
    console.error("Save conversations error:", error);
    res.status(500).json({ error: "Failed to save conversations" });
  }
});

// Telemetry endpoint (minimal, non-PII). Accepts storage failure events.
app.post('/api/telemetry/storage', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { event, details } = req.body || {};
    console.log(`[Telemetry][storage] user=${user.sub} event=${event} details=`, details || {});
    // In production, you might forward this to a metrics system.
    res.json({ ok: true });
  } catch (err) {
    console.error('Telemetry error:', err);
    res.status(500).json({ ok: false });
  }
});

// Debug backup endpoints (dev-only): save/list/load JSON backups per-user
if (process.env.NODE_ENV !== 'production') {
  const DEBUG_DIR = path.join(process.cwd(), 'server', 'debug_backups');

  app.post('/api/debug/save-backup', requireAuth, async (req, res) => {
    try {
      const { backup, ts, note } = req.body || {};
      const uid = String(req.user?.sub || 'anonymous');
      await fs.mkdir(DEBUG_DIR, { recursive: true });
      const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
      const stamp = ts || Date.now();
      const filename = `${safeUid}-${stamp}.json`;
      const payload = { meta: { uid, note: note || null, ts: stamp }, backup };
      await fs.writeFile(path.join(DEBUG_DIR, filename), JSON.stringify(payload, null, 2), 'utf8');
      res.json({ ok: true, file: filename, path: `/server/debug_backups/${filename}` });
    } catch (err) {
      console.error('[Debug] save-backup error:', err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/api/debug/list-backups', requireAuth, async (req, res) => {
    try {
      const uid = String(req.user?.sub || 'anonymous');
      const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fs.mkdir(DEBUG_DIR, { recursive: true });
      const files = await fs.readdir(DEBUG_DIR);
      const userFiles = files.filter(f => f.startsWith(`${safeUid}-`));
      res.json({ ok: true, files: userFiles });
    } catch (err) {
      console.error('[Debug] list-backups error:', err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/api/debug/load-backup/:file', requireAuth, async (req, res) => {
    try {
      const { file } = req.params;
      const uid = String(req.user?.sub || 'anonymous');
      const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (!file || !file.startsWith(`${safeUid}-`)) return res.status(403).json({ ok: false, error: 'Not allowed' });
      const full = path.join(DEBUG_DIR, file);
      const raw = await fs.readFile(full, 'utf8');
      const parsed = JSON.parse(raw);
      res.json({ ok: true, file, payload: parsed });
    } catch (err) {
      console.error('[Debug] load-backup error:', err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
}

// Mount conversation routes with auth
app.use("/api/conversations", requireAuth, convRoutes);

// Mount GPT routes with auth
app.use("/api/gpts", requireAuth, gptRoutes);

function cryptoRandom() {
  return randomBytes(16).toString("hex");
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API on :${PORT}`));
