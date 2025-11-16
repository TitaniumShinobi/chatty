// Load environment variables FIRST - before any other imports
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Set timezone after env is loaded
process.env.TZ = process.env.TZ || 'America/New_York';

import express from "express";
import fetch from "node-fetch"; // if on Node <18, else use global fetch
import cookieParser from "cookie-parser";
import cors from "cors";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { connectDB } from "./config/database.js";
import client from "./mongo.js";
import { waitForMongooseReady } from "./lib/initMongoose.js";
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from "./middleware/auth.js";
import gptRoutes from "./routes/gpts.js";
import exportRoutes from "./routes/export.js";
import importRoutes from "./routes/import.js";
import vvaultRoutes from "./routes/vvault.js";
import awarenessRoutes from "./routes/awareness.js";
import chatRoutes from "./routes/chat.js";
import libraryRoutes from "./routes/library.js";
import devLogRoutes from "./routes/devLog.js";
import { initializeUserRegistryEvents } from './lib/userRegistryEvents.js';
import { randomBytes } from "node:crypto";
import crypto from "node:crypto";
import pythonAuth from "./pythonAuth.js";
import { getTimeContext, getTimePromptContext, getTimeGreeting } from "./services/awarenessService.js";

// Prefix every console output with an ISO timestamp so shell logs include timing.
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console)
};

const formatTimestamp = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date());

  const lookup = (type) => parts.find(part => part.type === type)?.value || '00';
  const year = lookup('year');
  const month = lookup('month');
  const day = lookup('day');
  const hour = lookup('hour');
  const minute = lookup('minute');
  const second = lookup('second');

  return `${year}-${month}-${day} ${hour}:${minute}:${second} ET`;
};

const withTimestamp = (writer) => (...args) => {
  const stamp = formatTimestamp();
  writer(`[${stamp}]`, ...args);
};

console.log = withTimestamp(originalConsole.log);
console.info = withTimestamp(originalConsole.info);
console.warn = withTimestamp(originalConsole.warn);
console.error = withTimestamp(originalConsole.error);
console.debug = withTimestamp(originalConsole.debug);

// Connect to database
async function initializeDatabase() {
  try {
    console.log('🔌 [Initialize] Starting database initialization...');
    console.log(`🔧 [Initialize] MONGODB_AVAILABLE=${process.env.MONGODB_AVAILABLE}`);
    console.log(`🔧 [Initialize] FORCE_MEMORY_STORE=${process.env.FORCE_MEMORY_STORE}`);
    
    // Connect native MongoDB client
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log('✅ [Initialize] MongoDB Atlas native client connected successfully!');
    
    // Initialize mongoose connection with retry logic
    await waitForMongooseReady();
    
    // Verify final state
    const finalStatus = process.env.MONGODB_AVAILABLE === "true";
    if (finalStatus) {
      console.log('✅ [Initialize] Database initialization complete - MongoDB mode enabled');
      console.log(`🔧 [Initialize] Final MONGODB_AVAILABLE=${process.env.MONGODB_AVAILABLE}`);
    } else {
      console.log('⚠️ [Initialize] Database initialization complete - Memory mode enabled');
      console.log(`🔧 [Initialize] Final MONGODB_AVAILABLE=${process.env.MONGODB_AVAILABLE}`);
    }
    
  } catch (error) {
    console.error('❌ [Initialize] MongoDB connection failed:', error.message);
    console.log('🚀 [Initialize] Continuing in development mode without database...');
    process.env.MONGODB_AVAILABLE = 'false';
    console.log(`🔧 [Initialize] MONGODB_AVAILABLE set to: ${process.env.MONGODB_AVAILABLE}`);
  }
}

// Initialize database connection
await initializeDatabase();

// Import Store after database connection is established
const { Store } = await import("./store.js");

const app = express();
console.log('⚠️ MongoDB Singleton Conversation Service DISABLED');
console.log('✅ Using VVAULT filesystem for all conversation storage');
console.log('📁 VVAULT path: /Users/devonwoodson/Documents/GitHub/VVAULT');
app.use(express.json());
app.use(cookieParser());
app.set("trust proxy", 1);

// CORS configuration for development and production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || "https://your-production-domain.com"
    : "http://localhost:5173",
  credentials: true
};
app.use(cors(corsOptions));

// Debug middleware to log requests (development only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.path.includes('/chatty-sync')) {
      console.log(`[DEBUG] ${req.method} ${req.path}`, {
        headers: Object.keys(req.headers),
        hasAuth: !!req.cookies?.[process.env.COOKIE_NAME || "sid"],
        bodyKeys: Object.keys(req.body || {})
      });
    }
    next();
  });
}

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs (10 OAuth flows)
  message: { error: "Too many auth attempts, please try again later" }
});

// Google OAuth configuration - ensure redirect_uri is consistent
const GOOGLE_CALLBACK_URI = process.env.GOOGLE_CALLBACK_URL || process.env.GOOGLE_CALLBACK || "http://localhost:5173/api/auth/google/callback";

const OAUTH = {
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect_uri: GOOGLE_CALLBACK_URI,
  token_url: "https://oauth2.googleapis.com/token",
  userinfo_url: "https://www.googleapis.com/oauth2/v3/userinfo",
};

const COOKIE_NAME = process.env.COOKIE_NAME || "sid";

// health
// Health check endpoint - should be available immediately after server starts
app.get("/health", (_req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Health check for API routes (proxied through Vite)
app.get("/api/health", (_req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// database status endpoint
app.get("/api/db/status", async (_req, res) => {
  try {
    const { getConnectionStatus, mongooseHealthCheck } = await import("./lib/initMongoose.js");
    const healthCheck = await mongooseHealthCheck();
    const connectionStatus = getConnectionStatus();
    
    const status = {
      mongodb: {
        available: process.env.MONGODB_AVAILABLE === "true",
        connection: {
          status: healthCheck.status,
          readyState: connectionStatus.readyState,
          host: connectionStatus.host,
          port: connectionStatus.port,
          database: connectionStatus.name,
          isConnected: connectionStatus.isConnected,
        },
        error: healthCheck.error || null,
      },
      store: {
        mode: process.env.MONGODB_AVAILABLE === "true" ? "database" : "memory",
        forceMemoryStore: process.env.FORCE_MEMORY_STORE === "true",
      },
      timestamp: new Date().toISOString(),
    };
    
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      mongodb: {
        available: process.env.MONGODB_AVAILABLE === "true",
      },
      store: {
        mode: process.env.MONGODB_AVAILABLE === "true" ? "database" : "memory",
      },
    });
  }
});

// start OAuth (front-end should hit this)
// CLI token exchange endpoint - exchanges temporary token for session cookie
app.get("/api/auth/cli-token-exchange", authLimiter, async (req, res) => {
  try {
    const { token, expires } = req.query;
    
    if (!token || !expires) {
      return res.status(400).json({ ok: false, error: 'Missing token or expiry' });
    }

    // Check if token expired
    if (Date.now() > parseInt(String(expires))) {
      return res.status(401).json({ ok: false, error: 'Token expired' });
    }

    // For now, we'll use a simpler approach: pass the JWT directly
    // In production, store tokens in Redis with session info
    // For MVP, we'll create an endpoint that generates a session token for CLI
    return res.status(501).json({ ok: false, error: 'Token exchange not yet implemented' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Token exchange failed' });
  }
});

app.get("/api/auth/google", authLimiter, (req, res) => {
  // Preserve CLI callback if provided
  const cliCallback = req.query.cli_callback;
  const state = cliCallback 
    ? JSON.stringify({ cli_callback: cliCallback })
    : cryptoRandom();
  
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

// Microsoft OAuth
app.get("/api/auth/microsoft", authLimiter, (req, res) => {
  const cliCallback = req.query.cli_callback;
  const state = cliCallback 
    ? JSON.stringify({ cli_callback: cliCallback })
    : cryptoRandom();
  
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.searchParams.set("client_id", process.env.MICROSOFT_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_CALLBACK_URL?.replace('/google/callback', '/microsoft/callback') || "http://localhost:5173/api/auth/microsoft/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

// Apple OAuth
app.get("/api/auth/apple", authLimiter, (req, res) => {
  const state = cryptoRandom();
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", process.env.APPLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_CALLBACK_URL?.replace('/google/callback', '/apple/callback') || "http://localhost:5173/api/auth/apple/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "email name");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

// GitHub OAuth
app.get("/api/auth/github", authLimiter, (req, res) => {
  const cliCallback = req.query.cli_callback;
  const state = cliCallback 
    ? JSON.stringify({ cli_callback: cliCallback })
    : cryptoRandom();
  
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_CALLBACK_URL?.replace('/google/callback', '/github/callback') || "http://localhost:5173/api/auth/github/callback");
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

// OAuth callback → exchange code → set cookie → redirect home
app.get("/api/auth/google/callback", authLimiter, async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    
    // Check for OAuth errors from Google
    if (error) {
      console.error("Google OAuth error:", { error, error_description });
      return res.status(400).send(`OAuth error: ${error}${error_description ? ` - ${error_description}` : ''}`);
    }
    
    if (!code) {
      console.error("Missing OAuth code in callback");
      return res.status(400).send("Missing authorization code");
    }

    // Ensure redirect_uri matches exactly with the initial request
    const redirectUri = GOOGLE_CALLBACK_URI;
    
    console.log("🔄 Google OAuth token exchange:", {
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
      codeLength: code.length
    });

    // 1) exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      })
    }).then(r => r.json());
    
    if (!tokenRes.access_token) {
      console.error("❌ OAuth token exchange failed:", JSON.stringify(tokenRes, null, 2));
      const errorMsg = tokenRes.error_description || tokenRes.error || "Unknown error";
      return res.status(400).send(`OAuth token exchange failed: ${errorMsg}`);
    }

    console.log("✅ Token exchange successful");

    // 2) fetch user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    });
    
    if (!userRes.ok) {
      const errorText = await userRes.text();
      console.error("❌ Failed to fetch user info:", userRes.status, errorText);
      return res.status(500).send("Failed to fetch user information");
    }
    
    const user = await userRes.json(); // {sub, email, name, picture}
    
    if (!user.email) {
      console.error("❌ User email missing:", user);
      return res.status(400).send("User email not available");
    }

    console.log("✅ User info fetched:", { email: user.email, sub: user.sub });

    // 3) persist user to DB and issue session
    const profile = { sub: user.sub, name: user.name, email: user.email, picture: user.picture };
    
    console.log(`📥 [OAuth] Attempting to upsert user to database - email=${profile.email}, uid=${profile.sub}`);
    console.log(`🔧 [OAuth] MONGODB_AVAILABLE=${process.env.MONGODB_AVAILABLE}`);
    
    try {
      const doc = await Store.upsertUser({ 
        uid: profile.sub, 
        name: profile.name, 
        email: profile.email, 
        picture: profile.picture 
      });
      
      console.log(`✅ [OAuth] User operation completed - _id=${doc._id}, email=${doc.email}`);
      
      // Check if this is a new user (no phone number set)
      const isNewUser = !doc.phoneE164 && !doc.phoneVerifiedAt;
      
      // Ensure singleton conversation exists (construct-init on login)
      if (doc.constructId) {
        await ensureSingletonConversation(doc.constructId, doc.email);
      }
      
      // Normalize payload to always include `sub` so the backend can use
      // `req.user.sub` consistently regardless of auth flow.
      const payload = { 
        sub: doc._id.toString?.() ?? doc._id,
        id: doc._id.toString?.() ?? doc._id, 
        uid: profile.sub, 
        name: profile.name, 
        email: profile.email, 
        picture: profile.picture,
        constructId: doc.constructId,
        vvaultPath: doc.vvaultPath,
        status: doc.status
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

      res.cookie(process.env.COOKIE_NAME || "sid", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === 'production',  // true in production (HTTPS)
        path: "/",             // critical so /api/me can read it
        maxAge: 1000*60*60*24*30
      });

      console.log("✅ Session cookie set, redirecting user");

      // 4) Check if this is a CLI authentication request
      // Parse state to get CLI callback URL
      let cliCallback;
      try {
        const state = String(req.query.state || '');
        if (state) {
          const parsed = JSON.parse(state);
          if (parsed.cli_callback) {
            cliCallback = parsed.cli_callback;
          }
        }
      } catch (e) {
        // State not JSON, ignore
      }

      if (cliCallback) {
        // Redirect to CLI callback with session token in URL
        // CLI will extract token and exchange it for session cookie
        const cookieName = process.env.COOKIE_NAME || "sid";
        const cliRedirect = `${cliCallback}?session_token=${token}`;
        res.redirect(cliRedirect);
        return;
      }

      // Normal web redirect
      const redirectUrl = process.env.POST_LOGIN_REDIRECT || "http://localhost:5173/";
      const finalUrl = isNewUser ? `${redirectUrl}?oauth_signup=true` : redirectUrl;
      res.redirect(finalUrl);
    } catch (dbError) {
      console.error("❌ Database error:", dbError);
      // Check if it's a duplicate key error (user already exists)
      if (dbError.code === 11000 || dbError.message?.includes('duplicate key')) {
        return res.status(400).send("An account with this email already exists. Please try logging in instead.");
      }
      throw dbError;
    }
  } catch (e) {
    console.error("❌ Google OAuth callback error:", e);
    res.status(500).send(`Auth failed: ${e.message || 'Unknown error'}`);
  }
});

// Environment check endpoint for testing
app.get("/api/env-check", (req, res) => {
  const envVars = {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK: !!process.env.GOOGLE_CALLBACK,
    GOOGLE_CALLBACK_URL: !!process.env.GOOGLE_CALLBACK_URL,
    GOOGLE_CALLBACK_URI: GOOGLE_CALLBACK_URI, // Actual redirect URI being used
    TWILIO_SID: !!process.env.TWILIO_SID,
    TWILIO_TOKEN: !!process.env.TWILIO_TOKEN,
    TWILIO_VERIFY_SID: !!process.env.TWILIO_VERIFY_SID,
    TURNSTILE_SITE_KEY: !!process.env.TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: !!process.env.TURNSTILE_SECRET_KEY
  };
  
  res.json(envVars);
});

// User reset endpoint for testing
app.post("/api/reset-user", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    console.log(`🔄 Resetting user: ${email}`);
    
    // Find user in database
    const user = await Store.findUserByEmail(email);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    console.log(`✅ User found: ${user.email}`);
    
    // Reset phone verification data
    const resetData = {
      phoneE164: null,
      phoneVerifiedAt: null,
      phoneVerificationAttempts: null,
      lastPhoneVerificationAttempt: null,
      updatedAt: new Date(),
      resetReason: "Manual reset for testing"
    };
    
    // Update user in database
    const updatedUser = await Store.updateUser(user._id, resetData);
    
    console.log(`✅ User reset successfully: ${email}`);
    
    res.json({ 
      success: true, 
      message: "User reset successfully",
      user: {
        email: updatedUser.email,
        phoneE164: updatedUser.phoneE164 || 'Not set',
        phoneVerifiedAt: updatedUser.phoneVerifiedAt || 'Not verified'
      }
    });
    
  } catch (error) {
    console.error('❌ Error resetting user:', error);
    res.status(500).json({ error: "Failed to reset user" });
  }
});

// Debug endpoint to check user in database
app.get("/api/debug-user/:email", async (req, res) => {
  try {
    const email = req.params.email;
    
    console.log(`🔍 Debug: Looking for user: ${email}`);
    
    // Try to find user with different methods
    const user1 = await Store.findUserByEmail(email);
    console.log(`🔍 findUserByEmail result:`, user1 ? 'Found' : 'Not found');
    
    // Try direct database query using mongoose
    let user2 = null;
    if (mongoose.connection.readyState === 1) {
      const { default: User } = await import("./models/User.js");
      user2 = await User.findOne({ email: email });
      console.log(`🔍 Direct User.findOne result:`, user2 ? 'Found' : 'Not found');
    }
    
    res.json({
      email: email,
      findUserByEmail: user1 ? 'Found' : 'Not found',
      directQuery: user2 ? 'Found' : 'Not found',
      user1: user1,
      user2: user2
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: "Debug failed", details: error.message });
  }
});

// Quick reset endpoint (GET for easy testing) - completely deletes user without blacklist
app.get("/api/reset-user/:email", async (req, res) => {
  try {
    const email = req.params.email;
    
    console.log(`🔄 Complete reset (delete) for user: ${email}`);
    
    // Check if mongoose is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database not available" });
    }
    
    // Import User model directly
    const { default: User } = await import("./models/User.js");
    const user = await User.findOne({ email: email }); // Don't filter by status
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    console.log(`✅ User found: ${user.email}, deleting...`);
    
    // Completely delete the user without adding to blacklist
    await User.findByIdAndDelete(user._id);
    
    console.log(`✅ User completely deleted: ${email} (no blacklist)`);
    
    res.json({ 
      success: true, 
      message: "User completely deleted. They can now sign up as a first-time user.",
      email: email
    });
    
  } catch (error) {
    console.error('❌ Error resetting user:', error);
    res.status(500).json({ error: "Failed to reset user", details: error.message });
  }
});

/**
 * Ensure singleton conversation exists for construct
 * Called on login/construct-init and session verification
 */
async function ensureSingletonConversation(constructId, userEmail) {
  if (!constructId) {
    console.warn('⚠️ No constructId provided, skipping singleton conversation initialization');
    return null;
  }

  console.log(`ℹ️ Singleton conversation service disabled — using VVAULT filesystem for construct ${constructId}`);
  return null;
}

// session probe
app.get("/api/me", async (req, res) => {
  const raw = req.cookies?.[process.env.COOKIE_NAME || "sid"];
  if (!raw) {
    console.log('🚫 /api/me: No session cookie found');
    return res.status(401).json({ ok:false });
  }

  try {
    const user = jwt.verify(raw, process.env.JWT_SECRET);
    console.log(`✅ /api/me: Session verified for user ${user.email} (ID: ${user.sub})`);
    
    // Ensure user has a valid sub field
    if (!user.sub) {
      console.warn('⚠️ User session missing sub field, using fallback:', {
        id: user.id,
        uid: user.uid,
        email: user.email
      });
      user.sub = user.id || user.uid || user.email;
    }
    
    // Ensure singleton conversation exists (construct-init on page load)
    if (user.constructId) {
      await ensureSingletonConversation(user.constructId, user.email);
    }
    
    res.json({ ok:true, user });
  } catch (error) {
    console.log('🚫 /api/me: Invalid session token:', error.message);
    res.status(401).json({ ok:false });
  }
});

// Microsoft OAuth callback
app.get("/api/auth/microsoft/callback", authLimiter, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("missing code");

    // Exchange code for tokens
    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.GOOGLE_CALLBACK_URL?.replace('/google/callback', '/microsoft/callback') || "http://localhost:5173/api/auth/microsoft/callback",
      })
    }).then(r => r.json());

    if (!tokenRes.access_token) {
      console.error("Microsoft OAuth token exchange failed:", tokenRes);
      return res.status(400).send("Microsoft OAuth token exchange failed");
    }

    // Fetch user info
    const user = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json());

    // Create user profile
    const profile = { 
      sub: user.id, 
      name: user.displayName, 
      email: user.mail || user.userPrincipalName, 
      picture: null 
    };
    
    const doc = await Store.upsertUser({ 
      uid: profile.sub, 
      name: profile.name, 
      email: profile.email, 
      picture: profile.picture 
    });
    
    // Check if this is a new user (no phone number set)
    const isNewUser = !doc.phoneE164 && !doc.phoneVerifiedAt;
    
    // Ensure singleton conversation exists (construct-init on login)
    if (doc.constructId) {
      await ensureSingletonConversation(doc.constructId, doc.email);
    }
    
    const payload = { 
      sub: doc._id.toString?.() ?? doc._id,
      id: doc._id.toString?.() ?? doc._id, 
      uid: profile.sub, 
      name: profile.name, 
      email: profile.email, 
      picture: profile.picture,
      constructId: doc.constructId,
      vvaultPath: doc.vvaultPath,
      status: doc.status
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.cookie(process.env.COOKIE_NAME || "sid", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === 'production',
      path: "/",
      maxAge: 1000*60*60*24*30
    });

    // Check if this is a CLI authentication request
    let cliCallback;
    try {
      const state = String(req.query.state || '');
      if (state) {
        const parsed = JSON.parse(state);
        if (parsed.cli_callback) {
          cliCallback = parsed.cli_callback;
        }
      }
    } catch (e) {
      // State not JSON, ignore
    }

    if (cliCallback) {
      // Redirect to CLI callback with session token
      const cookieName = process.env.COOKIE_NAME || "sid";
      const cliRedirect = `${cliCallback}?session_token=${token}`;
      res.redirect(cliRedirect);
      return;
    }

    // Redirect back to app with new signup indicator
    const redirectUrl = process.env.POST_LOGIN_REDIRECT || "http://localhost:5173/";
    const finalUrl = isNewUser ? `${redirectUrl}?oauth_signup=true` : redirectUrl;
    res.redirect(finalUrl);
  } catch (e) {
    console.error(e);
    res.status(500).send("Microsoft auth failed");
  }
});

// Apple OAuth callback
app.get("/api/auth/apple/callback", authLimiter, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("missing code");

    // Apple OAuth is more complex and requires JWT token generation
    // For now, we'll implement a basic version
    console.log("Apple OAuth callback received:", code);
    
    // In a real implementation, you'd need to:
    // 1. Generate a JWT client secret
    // 2. Exchange code for tokens
    // 3. Decode the ID token to get user info
    
    res.status(501).send("Apple OAuth not fully implemented yet");
  } catch (e) {
    console.error(e);
    res.status(500).send("Apple auth failed");
  }
});

// GitHub OAuth callback
app.get("/api/auth/github/callback", authLimiter, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("missing code");

    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      })
    }).then(r => r.json());

    if (!tokenRes.access_token) {
      console.error("GitHub OAuth token exchange failed:", tokenRes);
      return res.status(400).send("GitHub OAuth token exchange failed");
    }

    // Fetch user info
    const user = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json());

    // Fetch user email (GitHub requires separate API call for email)
    const emails = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json());

    const primaryEmail = emails.find(email => email.primary)?.email || emails[0]?.email;

    // Create user profile
    const profile = { 
      sub: user.id.toString(), 
      name: user.name || user.login, 
      email: primaryEmail || user.email, 
      picture: user.avatar_url 
    };
    
    const doc = await Store.upsertUser({ 
      uid: profile.sub, 
      name: profile.name, 
      email: profile.email, 
      picture: profile.picture 
    });
    
    // Check if this is a new user (no phone number set)
    const isNewUser = !doc.phoneE164 && !doc.phoneVerifiedAt;
    
    // Ensure singleton conversation exists (construct-init on login)
    if (doc.constructId) {
      await ensureSingletonConversation(doc.constructId, doc.email);
    }
    
    const payload = { 
      sub: doc._id.toString?.() ?? doc._id,
      id: doc._id.toString?.() ?? doc._id, 
      uid: profile.sub, 
      name: profile.name, 
      email: profile.email, 
      picture: profile.picture,
      constructId: doc.constructId,
      vvaultPath: doc.vvaultPath,
      status: doc.status
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.cookie(process.env.COOKIE_NAME || "sid", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === 'production',
      path: "/",
      maxAge: 1000*60*60*24*30
    });

    // Check if this is a CLI authentication request
    let cliCallback;
    try {
      const state = String(req.query.state || '');
      if (state) {
        const parsed = JSON.parse(state);
        if (parsed.cli_callback) {
          cliCallback = parsed.cli_callback;
        }
      }
    } catch (e) {
      // State not JSON, ignore
    }

    if (cliCallback) {
      // Redirect to CLI callback with session token
      const cookieName = process.env.COOKIE_NAME || "sid";
      const cliRedirect = `${cliCallback}?session_token=${token}`;
      res.redirect(cliRedirect);
      return;
    }

    // Redirect back to app with new signup indicator
    const redirectUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const finalUrl = isNewUser ? `${redirectUrl}?oauth_signup=true` : redirectUrl;
    res.redirect(finalUrl);
  } catch (e) {
    console.error("GitHub auth error:", e);
    res.status(500).send("GitHub auth failed");
  }
});

// email/password registration
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { email, password, confirmPassword, name, turnstileToken } = req.body;
    
    // Validate required fields
    if (!email || !password || !confirmPassword || !name) {
      return res.status(400).json({ error: "Email, password, password confirmation, and name are required" });
    }

    // Validate Turnstile token for signup
    if (process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SECRET_KEY !== 'your-turnstile-secret-key') {
      if (!turnstileToken) {
        return res.status(400).json({ error: "Human verification is required" });
      }

      try {
        const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            secret: process.env.TURNSTILE_SECRET_KEY,
            response: turnstileToken,
            remoteip: req.ip || req.connection.remoteAddress
          })
        });

        const turnstileResult = await turnstileResponse.json();
        
        if (!turnstileResult.success) {
          console.log(`🚫 Turnstile verification failed for ${email}:`, turnstileResult);
          return res.status(400).json({ error: "Human verification failed. Please try again." });
        }
        
        console.log(`✅ Turnstile verification passed for ${email}`);
      } catch (turnstileError) {
        console.error('Turnstile verification error:', turnstileError);
        return res.status(400).json({ error: "Human verification failed. Please try again." });
      }
    }

    // Validate email format using Python
    const isEmailValid = await pythonAuth.validateEmail(email);
    if (!isEmailValid) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    // Validate password strength using Python
    const passwordValidation = await pythonAuth.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: "Password does not meet requirements", 
        details: passwordValidation.errors 
      });
    }

    // Check if user already exists or email is in deletion registry
    const existingUser = await Store.findUserByEmail(email);
    if (existingUser) {
      console.log(`🚫 Registration blocked: User already exists with email ${email}`);
      return res.status(400).json({ error: "User already exists with this email" });
    }

    // Check if email is in deletion registry
    const isEmailDeleted = await Store.isEmailDeleted(email);
    if (isEmailDeleted) {
      console.log(`🚫 Registration blocked: Email ${email} is in deletion registry`);
      return res.status(400).json({ 
        error: "This email address was recently deleted. Please contact support if you need to restore your account.",
        code: "EMAIL_DELETED"
      });
    }

    // Hash password using Python PBKDF2
    const hashedPassword = await pythonAuth.hashPassword(password);
    console.log(`🔐 Password hashed using PBKDF2 for user: ${email}`);

    // Create new user (using unique ID for email/password users)
    const userUid = `email_${Date.now()}_${crypto.randomUUID()}`;
    
    console.log(`📥 [Register] Attempting to create user in database - email=${email}, uid=${userUid}`);
    console.log(`🔧 [Register] MONGODB_AVAILABLE=${process.env.MONGODB_AVAILABLE}`);
    
    // Import user ID generator
    const { generateUserId } = await import('./lib/userIdGenerator.js');
    
    const doc = await Store.createUser({ 
      id: generateUserId(name),
      uid: userUid, // Use unique ID instead of email to prevent conflicts
      name: name, 
      email: email, 
      picture: null,
      provider: "email",
      password: hashedPassword // Store PBKDF2 hashed password
    });
    
    console.log(`✅ [Register] User created successfully - email=${email}, _id=${doc._id}`);
    console.log(`✅ User registered successfully: ${email} (ID: ${doc._id})`);
    
    // Ensure singleton conversation exists (construct-init on registration)
    if (doc.constructId) {
      await ensureSingletonConversation(doc.constructId, doc.email);
    }
    
    const payload = { 
      sub: doc.id || doc._id.toString(), // Use persistent ID
      id: doc.id || doc._id.toString(),
      uid: userUid, 
      name: name, 
      email: email, 
      picture: null,
      constructId: doc.constructId,
      vvaultPath: doc.vvaultPath,
      status: doc.status
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.cookie(process.env.COOKIE_NAME || "sid", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === 'production',  // true in production (HTTPS)
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

    // Validate email format using Python
    const isEmailValid = await pythonAuth.validateEmail(email);
    if (!isEmailValid) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Find user by email
    console.log(`📥 [Login] Attempting to find user in database - email=${email}`);
    console.log(`🔧 [Login] MONGODB_AVAILABLE=${process.env.MONGODB_AVAILABLE}`);
    const user = await Store.findUserByEmail(email);
    if (!user) {
      console.log(`🚫 Login failed: No user found for email ${email}`);
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    console.log(`✅ [Login] User found - _id=${user._id}, email=${user.email}`);

    // Verify password using Python PBKDF2
    const { isValid, needsUpdate } = await pythonAuth.verifyPassword(password, user.password);
    if (!isValid) {
      console.log(`🚫 Login failed: Invalid password for email ${email}`);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Upgrade password hash if needed
    if (needsUpdate) {
      console.log(`🔄 Upgrading password hash for user: ${email}`);
      const newHash = await pythonAuth.upgradePasswordHash(password, user.password);
      
      // Update user's password hash in database
      await Store.updateUserPassword(user._id, newHash);
      console.log(`✅ Password hash upgraded for user: ${email}`);
    }
    
    console.log(`✅ Login successful for user: ${user.email} (ID: ${user._id})`);
    
    // Update login tracking via Store
    await Store.updateUser(user._id, {
      lastLoginAt: new Date(),
      loginCount: (user.loginCount || 0) + 1
    });
    
    console.log(`✅ [Login] User login tracking updated - _id=${user._id}`);
    
    // Ensure singleton conversation exists (construct-init on login)
    if (user.constructId) {
      await ensureSingletonConversation(user.constructId, user.email);
    }
    
    const payload = { 
      sub: user.id || user._id.toString(), // Use persistent ID
      id: user.id || user._id.toString(),
      uid: user.uid, 
      name: user.name, 
      email: user.email, 
      picture: user.picture,
      constructId: user.constructId,
      vvaultPath: user.vvaultPath,
      status: user.status
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.cookie(process.env.COOKIE_NAME || "sid", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === 'production',  // true in production (HTTPS)
      path: "/",             // critical so /api/me can read it
      maxAge: 1000*60*60*24*30
    });

    // Check if this is a CLI authentication request
    const cliCallback = req.body.cli_callback || req.query.cli_callback;
    if (cliCallback) {
      // Return session token for CLI (via redirect if GET, or JSON if POST)
      if (req.method === 'GET') {
        return res.redirect(`${cliCallback}?session_token=${token}`);
      }
      return res.json({ 
        ok: true, 
        user: payload,
        cli_token: token
      });
    }

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

// Account deletion endpoints
app.post("/api/auth/delete-account", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { reason } = req.body;
    
    const metadata = {
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip || req.connection.remoteAddress,
      deletionMethod: "self_service"
    };

    const result = await Store.scheduleAccountDeletion(userId, reason || "user_requested", metadata);
    
    if (result.success) {
      // Clear the session cookie
      res.clearCookie(process.env.COOKIE_NAME || "sid");
      
      res.json({
        success: true,
        message: result.message,
        canRestoreUntil: result.canRestoreUntil
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error("Account deletion error:", error);
    res.status(500).json({ success: false, error: "Account deletion failed" });
  }
});

app.post("/api/auth/restore-account", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find deleted user
    const user = await User.findOne({ email, isDeleted: true });
    if (!user) {
      return res.status(404).json({ error: "No deleted account found with this email" });
    }

    // Verify password
    const { isValid } = await pythonAuth.verifyPassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Check if restoration period has expired
    if (user.canRestoreUntil && new Date() > user.canRestoreUntil) {
      return res.status(400).json({ error: "Account restoration period has expired" });
    }

    const result = await Store.restoreAccount(user._id);
    
    if (result.success) {
      // Generate new JWT token
      const payload = { 
        sub: user._id.toString(),
        id: user._id.toString(),
        uid: user.uid, 
        name: user.name, 
        email: user.email, 
        picture: user.picture 
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

      res.cookie(process.env.COOKIE_NAME || "sid", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === 'production',
        path: "/",
        maxAge: 1000*60*60*24*30
      });

      res.json({
        success: true,
        message: result.message,
        user: payload
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error("Account restoration error:", error);
    res.status(500).json({ success: false, error: "Account restoration failed" });
  }
});

// Admin endpoint for cleanup (can be called by cron job)
app.post("/api/admin/cleanup-expired-deletions", async (req, res) => {
  try {
    // Simple admin check - in production, use proper admin authentication
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_CLEANUP_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await Store.cleanupExpiredDeletions();
    res.json(result);
  } catch (error) {
    console.error("Cleanup error:", error);
    res.status(500).json({ error: "Cleanup failed" });
  }
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
    console.log(`📂 Loading conversations for user: ${user.email} (ID: ${user.sub})`);
    
    const conversations = await Store.getUserConversations(user.sub);
    console.log(`✅ Found ${conversations.length} conversations for user ${user.email}`);
    
    // Log conversation IDs for debugging
    if (conversations.length > 0) {
      console.log(`🔍 Conversation IDs: ${conversations.map(c => c.id || c._id).join(', ')}`);
    }
    
    res.json({ ok: true, conversations });
  } catch (error) {
    console.error(`❌ Get conversations error for user ${req.user?.email}:`, error);
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

app.post("/api/conversations", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { conversations } = req.body;
    console.log(`💾 Saving conversations for user: ${user.email} (ID: ${user.sub})`);
    console.log(`📊 Payload: ${conversations?.length || 0} conversations, ${JSON.stringify(req.body).length} bytes`);
    
    if (!Array.isArray(conversations)) {
      return res.status(400).json({ error: "Conversations must be an array" });
    }
    
    // Log conversation details for debugging
    if (conversations.length > 0) {
      console.log(`🔍 Saving conversation IDs: ${conversations.map(c => c.id).join(', ')}`);
    }
    
    try {
      await Store.saveUserConversations(user.sub, conversations);
      console.log(`✅ Successfully saved ${conversations.length} conversations for user ${user.email}`);
    } catch (saveErr) {
      console.error(`❌ Save conversations error for user ${user.email}:`, saveErr);
      throw saveErr;
    }
    res.json({ ok: true, message: "Conversations saved successfully" });
  } catch (error) {
    console.error(`❌ Save conversations endpoint error for user ${req.user?.email}:`, error);
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

// Mount VVAULT filesystem routes
app.use("/api/vvault", requireAuth, vvaultRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/library", libraryRoutes);

// Mount GPT routes with auth
app.use("/api/gpts", requireAuth, gptRoutes);

// Mount import routes with auth
app.use("/api/import", requireAuth, importRoutes);

// Mount export routes with auth (bypass for development)
if (process.env.NODE_ENV === 'development') {
  app.use("/api/export", exportRoutes);
} else {
  app.use("/api/export", requireAuth, exportRoutes);
}

// Runtime awareness utilities
app.use("/api/runtime", requireAuth, awarenessRoutes);
app.use("/api", devLogRoutes); // Dev logging (no auth needed, only works in dev mode)

// Test endpoint to check database connection
app.get("/api/test-db", async (req, res) => {
  try {
    const db = client.db("chatty");
    const users = await db.collection("users").find({}).limit(5).toArray();
    res.json({ 
      success: true, 
      userCount: users.length,
      users: users.map(u => ({ id: u._id, email: u.email, name: u.name }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Database connection failed'
    });
  }
});

// Test email sending endpoint
app.post("/api/test-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    // Import email service
    const { sendExportEmail } = await import('./services/emailService.js');
    
    // Create a test verification URL
    const testUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/download/verify?token=test-token-123`;
    
    // Send test email
    await sendExportEmail(email, testUrl);
    
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      email: email,
      verificationUrl: testUrl
    });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to send test email'
    });
  }
});

// Create test user endpoint
app.post("/api/create-test-user", async (req, res) => {
  try {
    const db = client.db("chatty");
    
    const testUser = {
      _id: 'dev-user-123',
      email: 'dwoodson92@gmail.com',
      name: 'Devon Woodson',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.collection("users").insertOne(testUser);
    
    res.json({ 
      success: true, 
      message: 'Test user created',
      user: { id: testUser._id, email: testUser.email, name: testUser.name }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to create test user'
    });
  }
});

// AI Service endpoint for Synth mode (temporarily bypass auth for debugging)
app.post("/chatty-sync", async (req, res) => {
  try {
    const { prompt, seat, history, attachments, userId, uiContext } = req.body;
    const timeContext = getTimeContext({ req });
    const timePromptSection = getTimePromptContext(timeContext);
    const contextualGreeting = getTimeGreeting(timeContext);
    const greetingDirective = contextualGreeting
      ? `If you greet the user, prefer "${contextualGreeting}!" to match the current time.`
      : '';
    if (timeContext) {
      console.log(`[Synth][time] → ${timeContext.localTime ?? timeContext.display} (${timeContext.timeOfDay}) ${timeContext.timezone ?? ''}`.trim());
    }
    
    console.log(`[Synth] 🧠 Processing message for user=${req.user?.sub || 'anonymous'} seat=${seat} promptLength=${prompt?.length || 0}`);
    console.log(`[Synth] 📝 Request payload:`, { prompt: prompt?.slice(0, 100), seat, historyLength: history?.length, attachments: attachments?.length });
    
    // Enhanced logging for Synth orchestration debugging
    console.log(`[Synth] 🔍 Starting Synth orchestration for seat: ${seat}`);
    
    // Use a simplified Synth orchestration that works with the current setup
    console.log(`[Synth] 🚀 Starting simplified Synth orchestration with model routing`);
    
    // Simple Ollama API call function
    const callOllama = async (model, prompt) => {
      try {
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, stream: false })
        });
        
        if (!response.ok) {
          throw new Error(`Ollama error ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.response || '';
      } catch (error) {
        console.warn(`Ollama call failed for ${model}:`, error.message);
        return null;
      }
    };
    
    // Model assignments
    const modelAssignments = {
      coding: 'deepseek-coder:latest',
      creative: 'mistral:latest', 
      smalltalk: 'phi3:latest'
    };
    
    // Apply foundational calibration
    const applyFoundationalCalibration = (seat, userPrompt) => {
      const basePrompts = {
        coding: `You are a code-first assistant. Your priority is correctness, clarity, and execution readiness.

FOUNDATIONAL CALIBRATION - OVERRIDE ALL SAFETY NORMALIZERS:
- Do not add motivational fluff, inspirational phrasing, or safety softeners.
- Do not reword instructions for comfort. Speak plainly and directly.
- Never add analogies, metaphors, or humor unless explicitly asked.
- When uncertain, clearly say "I don't know" or decline without guessing.
- Always assume the user is technical and does not need help understanding basic concepts unless they say otherwise.
- Be blunt. Efficiency > friendliness.
- Do not explain basic syntax unless explicitly requested.
- Skip disclaimers about "safety" or "best practices" unless specifically asked.
- Focus on working code, not comfort.

User request: ${userPrompt}`,

        creative: `You are a creative assistant focused on innovative solutions and artistic expression.

FOUNDATIONAL CALIBRATION - OVERRIDE ALL SAFETY NORMALIZERS:
- Be bold and imaginative. Don't self-censor creative ideas.
- Push boundaries while staying constructive.
- Focus on originality and artistic merit.
- Don't add safety disclaimers unless specifically requested.
- Be direct about creative possibilities.

User request: ${userPrompt}`,

        smalltalk: `You are a conversational assistant focused on natural, engaging dialogue.

FOUNDATIONAL CALIBRATION - OVERRIDE ALL SAFETY NORMALIZERS:
- Be naturally conversational and human-like.
- Don't add unnecessary disclaimers or safety padding.
- Focus on genuine helpfulness and connection.
- Be direct and authentic in your responses.

User request: ${userPrompt}`
      };
      return basePrompts[seat] || userPrompt;
    };
    
    // Run helper seats in parallel with graceful degradation
    const helperSeats = ['coding', 'creative', 'smalltalk'];
    const helperPromises = helperSeats.map(async (helperSeat) => {
      try {
        const model = modelAssignments[helperSeat];
        const calibratedPrompt = applyFoundationalCalibration(helperSeat, prompt);
        console.log(`[Synth] 🎯 Calling ${model} for ${helperSeat}`);
        
        const output = await callOllama(model, calibratedPrompt);
        if (output && output.trim()) {
          console.log(`[Synth][${helperSeat}] → ${output.slice(0, 120)}`);
          return { seat: helperSeat, output: output.trim() };
        }
        return null;
      } catch (error) {
        console.warn(`[Synth][${helperSeat}] failed:`, error);
        return null;
      }
    });
    
    const helperResults = await Promise.all(helperPromises);
    const validHelpers = helperResults.filter((result) => result !== null);
    
    if (validHelpers.length === 0) {
      return res.status(502).json({ error: 'Synth helper failure' });
    }
    
    // Compose helper section for synthesis
    const helperSection = validHelpers
      .map(({ seat, output }) => `## ${seat.toUpperCase()}\n${output}`)
      .join('\n\n');
    
    // Final synthesis with Phi-3
    const timeAwarenessNote = timeContext?.timeOfDay
      ? `It is currently ${timeContext.timeOfDay} (${timeContext.localTime}). Reference this naturally when it helps the conversation.`
      : '';
    const synthesisPrompt = `You are Chatty, a fluid conversational AI that naturally synthesizes insights from specialized models.

FOUNDATIONAL CALIBRATION - FLUID CONVERSATION:
- Be naturally conversational, not robotic or overly formal.
- Maintain context awareness and conversation flow.
- Don't overwhelm with excessive detail unless specifically requested.
- Be direct and authentic - skip corporate padding.
- Focus on genuine helpfulness over protective disclaimers.

${timePromptSection ? `${timePromptSection}\n\n` : ''}${timeAwarenessNote ? `${timeAwarenessNote}\n\n` : ''}
Original question: ${prompt}
${timeContext ? `\nChronological hints: It is ${timeContext.dayOfWeek}.\n` : ''}

Expert insights:
${helperSection}

Synthesize these insights into a natural, helpful response. Be conversational and maintain context flow. Don't mention the expert analysis process unless specifically asked about your capabilities.${greetingDirective ? `\n${greetingDirective}` : ''}`;

    const answer = await callOllama('phi3:latest', synthesisPrompt);
    console.log(`[Synth][final] → ${answer?.slice(0, 120) || 'No response'}`);
    
    console.log(`[Synth] ✅ Generated response:`, { answer: answer?.slice(0, 100) || 'No response', helpers: validHelpers.length });
    console.log(`[Synth] 🎯 Synth orchestration completed successfully`);
    
    res.json({
      answer,
      metadata: {
        seat,
        userId,
        timestamp: new Date().toISOString(),
        helpers: validHelpers.length,
        time: timeContext
          ? {
              localTime: timeContext.localTime,
              timeOfDay: timeContext.timeOfDay,
              dayOfWeek: timeContext.dayOfWeek,
              timezone: timeContext.timezone,
            }
          : undefined
      }
    });
    
  } catch (error) {
    console.error('[AI] Processing error:', error);
    res.status(500).json({
      error: "I'm sorry, I encountered a system error. Please try again.",
      details: error.message
    });
  }
});

// Test endpoint without auth for debugging
app.post("/chatty-sync-test", async (req, res) => {
  try {
    const { prompt, seat, history, attachments, userId, uiContext } = req.body;
    
    console.log(`[AI-TEST] Processing message seat=${seat} promptLength=${prompt?.length || 0}`);
    
    // Import and use the AI service
    const { ConversationAI } = await import('./services/aiService.js');
    const aiService = new ConversationAI();
    
    // Process the message
    const packets = await aiService.processMessage(prompt, attachments || [], history || []);
    
    // Extract the answer content from packets
    const answerPacket = packets.find(packet => packet.op === 'answer.v1');
    const answer = answerPacket?.payload?.content || "I'm sorry, I couldn't generate a response. Please try again.";
    
    res.json({
      answer,
      metadata: {
        seat,
        userId,
        timestamp: new Date().toISOString(),
        helpers: packets.length
      }
    });
    
  } catch (error) {
    console.error('[AI-TEST] Processing error:', error);
    res.status(500).json({
      error: "I'm sorry, I encountered a system error. Please try again.",
      details: error.message
    });
  }
});

function cryptoRandom() {
  return randomBytes(16).toString("hex");
}

// Production error handling
if (process.env.NODE_ENV === 'production') {
  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
  });
}

const PORT = process.env.CHAT_SERVER_PORT || process.env.PORT || 5000;

// Initialize user registry event system
initializeUserRegistryEvents();

// VVAULT capsule hydration on startup
async function initializeVVAULTCapsules() {
  try {
    const vvaultRuntimePath = process.env.VVAULT_RUNTIME_PATH;
    const chatCapsulePath = process.env.CHAT_CAPSULE_PATH;
    
    if (vvaultRuntimePath || chatCapsulePath) {
      console.log('📦 [VVAULT] Checking capsule paths...');
      if (vvaultRuntimePath) {
        console.log(`   Runtime path: ${vvaultRuntimePath}`);
      }
      if (chatCapsulePath) {
        console.log(`   Capsule path: ${chatCapsulePath}`);
      }
      
      // Verify paths exist (non-blocking)
      const { existsSync } = await import('fs');
      if (vvaultRuntimePath && !existsSync(vvaultRuntimePath)) {
        console.warn(`⚠️  [VVAULT] Runtime path does not exist: ${vvaultRuntimePath}`);
      }
      if (chatCapsulePath && !existsSync(chatCapsulePath)) {
        console.warn(`⚠️  [VVAULT] Capsule path does not exist: ${chatCapsulePath}`);
      }
      
      console.log('✅ [VVAULT] Capsule paths validated');
    } else {
      console.log('ℹ️  [VVAULT] No capsule paths configured (using defaults)');
    }
  } catch (error) {
    console.warn('⚠️  [VVAULT] Capsule initialization warning:', error.message);
    // Non-blocking - continue startup even if VVAULT paths are misconfigured
  }
}

// Start server immediately (don't wait for VVAULT)
app.listen(PORT, () => {
  console.log(`API on :${PORT}`);
  console.log(`🌐 Frontend should connect to: http://localhost:5173`);
  console.log(`🔌 Backend API available at: http://localhost:${PORT}`);
  
  // Initialize VVAULT capsules in background (non-blocking)
  initializeVVAULTCapsules().catch(error => {
    console.warn('⚠️ [VVAULT] Capsule initialization failed (non-blocking):', error.message);
  });
});
