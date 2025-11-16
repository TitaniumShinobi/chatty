import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendVerificationEmail } from "../services/emailService.js";

const router = express.Router();

// Email signup route
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }

    // Check if user already exists (including OAuth users)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // If user exists with OAuth provider, suggest they use OAuth login
      if (existingUser.provider !== 'email') {
        return res.status(400).json({ 
          error: "An account with this email already exists. Please use the OAuth login method you originally used.",
          existingProvider: existingUser.provider,
          suggestion: "Use the OAuth login button for your existing account"
        });
      } else {
        return res.status(400).json({ error: "User already exists with this email" });
      }
    }

    // Create new user (unverified)
    const user = new User({
      email,
      name,
      emailVerified: false,
      provider: "email",
      createdAt: new Date()
    });

    await user.save();

    // Generate verification token
    const verificationToken = jwt.sign(
      { userId: user._id, type: 'verify' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
      res.json({ 
        success: true, 
        message: "Account created. Please check your email to verify your account.",
        userId: user._id 
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Clean up the user if email fails
      await User.findByIdAndDelete(user._id);
      res.status(500).json({ 
        error: "Failed to send verification email. Please try again." 
      });
    }

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
});

// Email verification route
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?verify=error&message=No token provided`);
    }

    // Decode and verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'verify') {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?verify=error&message=Invalid token type`);
    }

    // Find and update user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?verify=error&message=User not found`);
    }

    // Mark email as verified
    user.emailVerified = true;
    await user.save();

    // Redirect to frontend with success
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?verify=success&message=Email verified successfully`);

  } catch (error) {
    console.error('Email verification error:', error);
    
    let errorMessage = 'Verification failed';
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Verification link has expired';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid verification link';
    }
    
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?verify=error&message=${encodeURIComponent(errorMessage)}`);
  }
});

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
