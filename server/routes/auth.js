import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

// Google OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile','email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    const jwt = signUser(req.user);
    res.cookie('sid', jwt, cookieOpts);
    res.redirect(process.env.POST_LOGIN_REDIRECT || '/');
  }
);

// Helper functions
const signUser = (user) => jwt.sign(
  { sub: user.sub, id: user.id, email: user.email, name: user.name, picture: user.picture, provider: "google" },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

export const cookieOpts = { 
  httpOnly: true, 
  sameSite: 'lax', 
  secure: false, 
  path: '/' 
};

export default router;
