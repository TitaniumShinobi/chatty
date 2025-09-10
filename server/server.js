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
    
    const payload = { 
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

function cryptoRandom() {
  return randomBytes(16).toString("hex");
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API on :${PORT}`));
