#!/usr/bin/env node

/**
 * User Reset Utility for Chatty
 * Resets a specific user account without blacklisting
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './server/.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatty';
const TARGET_EMAIL = 'dwoodson92@gmail.com';

async function resetUser() {
  let client;
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db('chatty');
    const usersCollection = db.collection('users');
    
    console.log(`🔍 Looking for user: ${TARGET_EMAIL}`);
    
    // Find the user
    const user = await usersCollection.findOne({ email: TARGET_EMAIL });
    
    if (!user) {
      console.log('❌ User not found in database');
      return;
    }
    
    console.log('✅ User found:', {
      id: user._id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      phoneE164: user.phoneE164,
      phoneVerifiedAt: user.phoneVerifiedAt
    });
    
    // Reset user data (remove phone verification, keep basic info)
    const resetData = {
      $unset: {
        phoneE164: "",
        phoneVerifiedAt: "",
        phoneVerificationAttempts: "",
        lastPhoneVerificationAttempt: ""
      },
      $set: {
        updatedAt: new Date(),
        resetReason: "Manual reset for testing"
      }
    };
    
    console.log('🔄 Resetting user data...');
    const result = await usersCollection.updateOne(
      { email: TARGET_EMAIL },
      resetData
    );
    
    if (result.modifiedCount > 0) {
      console.log('✅ User reset successfully!');
      console.log('📱 Phone verification data removed');
      console.log('🔄 User can now complete 2FA setup again');
      
      // Verify the reset
      const updatedUser = await usersCollection.findOne({ email: TARGET_EMAIL });
      console.log('📊 Updated user data:', {
        email: updatedUser.email,
        phoneE164: updatedUser.phoneE164 || 'Not set',
        phoneVerifiedAt: updatedUser.phoneVerifiedAt || 'Not verified',
        updatedAt: updatedUser.updatedAt
      });
      
    } else {
      console.log('⚠️ No changes made to user');
    }
    
  } catch (error) {
    console.error('❌ Error resetting user:', error.message);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the reset
console.log('🚀 Starting user reset process...');
console.log(`🎯 Target email: ${TARGET_EMAIL}`);
console.log('');

resetUser().then(() => {
  console.log('');
  console.log('🎉 Reset process completed!');
  console.log('💡 You can now test the complete signup flow with dwoodson92@gmail.com');
}).catch(error => {
  console.error('💥 Reset failed:', error);
  process.exit(1);
});


