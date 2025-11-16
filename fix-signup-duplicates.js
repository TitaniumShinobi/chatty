#!/usr/bin/env node

/**
 * Fix for Chatty Signup System - Prevents Duplicate Users
 * This script fixes the signup system to check for existing OAuth users
 * before creating new email-based accounts.
 */

import mongoose from 'mongoose';
import User from './server/models/User.js';

async function connectToDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatty';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

async function fixSignupRoute() {
  console.log('🔧 Fixing signup route to prevent duplicate users...');
  
  const fixedSignupCode = `
// FIXED SIGNUP ROUTE - Add this to server/routes/auth.js
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
`;

  console.log('📝 Fixed signup route code:');
  console.log(fixedSignupCode);
  
  return fixedSignupCode;
}

async function createUserMergeFunction() {
  console.log('\n🔧 Creating user merge function...');
  
  const mergeFunctionCode = `
// USER MERGE FUNCTION - Add this to server/routes/auth.js
router.post('/merge-accounts', async (req, res) => {
  try {
    const { email, targetUserId } = req.body;
    
    if (!email || !targetUserId) {
      return res.status(400).json({ error: "Email and target user ID are required" });
    }

    // Find all users with this email
    const users = await User.find({ email });
    if (users.length < 2) {
      return res.status(400).json({ error: "No duplicate users found to merge" });
    }

    // Find target user (the one to keep)
    const targetUser = users.find(user => user._id.toString() === targetUserId);
    if (!targetUser) {
      return res.status(400).json({ error: "Target user not found" });
    }

    // Find duplicate users (the ones to merge)
    const duplicateUsers = users.filter(user => user._id.toString() !== targetUserId);
    
    console.log(\`Merging \${duplicateUsers.length} duplicate users into \${targetUser._id}\`);

    // Update conversations and messages to point to target user
    for (const duplicateUser of duplicateUsers) {
      // Update conversations
      await Conversation.updateMany(
        { owner: duplicateUser._id },
        { owner: targetUser._id }
      );
      
      // Update messages
      await Message.updateMany(
        { owner: duplicateUser._id },
        { owner: targetUser._id }
      );
      
      // Delete duplicate user
      await User.findByIdAndDelete(duplicateUser._id);
      
      console.log(\`Merged and deleted user: \${duplicateUser._id}\`);
    }

    res.json({ 
      success: true, 
      message: \`Successfully merged \${duplicateUsers.length} duplicate users\`,
      targetUserId: targetUser._id
    });

  } catch (error) {
    console.error('Merge error:', error);
    res.status(500).json({ error: "Account merge failed" });
  }
});
`;

  console.log('📝 User merge function code:');
  console.log(mergeFunctionCode);
  
  return mergeFunctionCode;
}

async function main() {
  console.log('🔧 CHATTY SIGNUP FIX SCRIPT');
  console.log('============================');
  console.log('This script provides fixes for the duplicate user issue\n');

  try {
    await connectToDatabase();
    await fixSignupRoute();
    await createUserMergeFunction();
    
    console.log('\n✅ Fix recommendations complete!');
    console.log('\n📋 IMPLEMENTATION STEPS:');
    console.log('1. Update the signup route with the fixed code above');
    console.log('2. Add the merge function for manual account recovery');
    console.log('3. Run the recovery script to fix existing duplicates');
    console.log('4. Test the fixed signup flow');
    
  } catch (error) {
    console.error('❌ Fix script failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the fix script
main();
