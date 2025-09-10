import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { Strategy as Google } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import { connectDB } from "./config/database.js";
import { requestOTP, verifyOTP } from "./auth-phone.js";
import User from "./models/User.js";
import Prefs from "./models/Prefs.js";
import convos from "./routes/conversations.js";
import files from "./routes/files.js";
import authRouter from "./routes/auth.js";

await connectDB();

const ORIGIN = 'http://localhost:5173';

// Google OAuth configuration
const sign = (u)=> jwt.sign({ sub:u.sub, id:u._id, email:u.email, name:u.name, picture:u.picture, provider:"google" },
  process.env.JWT_SECRET,{ expiresIn:"7d" });

passport.use(new Google({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.PUBLIC_CALLBACK_BASE}${process.env.CALLBACK_PATH}`
}, async (_a,_r,p,done)=>{
  const data = {
    sub: p.id,
    email: p.emails?.[0]?.value,
    name: p.displayName,
    picture: p.photos?.[0]?.value,
    provider: "google",
    emailVerified: true
  };
  const user = await User.findOneAndUpdate({ sub: data.sub }, data, { upsert: true, new: true });
  return done(null, { token: sign(user), id: user._id.toString() });
}));

passport.serializeUser((u,d)=>d(null,u)); 
passport.deserializeUser((u,d)=>d(null,u)); 

const app = express();

// Trust proxy for proper cookie handling
app.set('trust proxy', 1);

// CORS and middleware setup
app.use(cors({
  origin: ORIGIN,
  credentials: true
}));

app.use(express.json({ limit:"2mb" }));
app.use(cookieParser());
app.use(session({ secret: process.env.JWT_SECRET, resave:false, saveUninitialized:false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Phone verification routes
app.post("/auth/phone/request", requestOTP);
app.post("/auth/phone/verify", verifyOTP);

// User info endpoint
app.get("/me", async (req,res)=>{
  const t = req.cookies?.sid; if (!t) return res.json({ user:null });
  try {
    const p = jwt.verify(t, process.env.JWT_SECRET);
    const u = await User.findById(p.id).lean();
    res.json({ user: u ? { id:u._id, email:u.email, name:u.name, picture:u.picture, phone:u.phoneE164, emailVerified:u.emailVerified, phoneVerified:!!u.phoneVerifiedAt, tier:u.tier } : null });
  } catch { res.json({ user:null }); }
});

// Preferences endpoints
app.get("/prefs", async (req,res)=>{
  const p = jwt.verify(req.cookies.sid, process.env.JWT_SECRET);
  const prefs = await Prefs.findOneAndUpdate({ userId:p.id }, {}, { upsert:true, new:true });
  res.json(prefs);
});

app.put("/prefs", async (req,res)=>{
  const p = jwt.verify(req.cookies.sid, process.env.JWT_SECRET);
  const prefs = await Prefs.findOneAndUpdate({ userId:p.id }, { ...req.body, updatedAt:new Date() }, { new:true, upsert:true });
  res.json(prefs);
});

// Logout
app.post("/logout",(req,res)=>{ 
  res.clearCookie("sid",{ sameSite:"lax" }); 
  req.session?.destroy(()=>{}); 
  res.json({ok:true}); 
});

// Mount auth router under /api/auth
app.use('/api/auth', authRouter);

// API routes
app.use("/conversations", convos);
app.use("/files", files);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(3001, ()=>console.log("API on :3001"));
