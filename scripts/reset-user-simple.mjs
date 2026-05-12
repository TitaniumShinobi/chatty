#!/usr/bin/env node

/**
 * User Reset Script using existing server connection
 * This script connects to the same MongoDB instance as the server
 */

import { MongoClient } from 'mongodb';

// Use the same connection string as your server
const MONGODB_URI = process.env.MONGODB_URI || '';
const TARGET_EMAIL = process.env.TARGET_EMAIL || process.env.CHATTY_TEST_EMAIL || '';

async function resetUser() {
  let client;
  
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
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
      phoneE164: user.phoneE164 || 'Not set',
      phoneVerifiedAt: user.phoneVerifiedAt || 'Not verified'
    });
    
    // Reset phone verification data
    const result = await usersCollection.updateOne(
      { email: TARGET_EMAIL },
      {
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
      }
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
  console.log(`💡 You can now test the complete signup flow with ${TARGET_EMAIL}`);
  console.log('📱 The phone verification modal should appear after signup');
}).catch(error => {
  console.error('💥 Reset failed:', error);
  process.exit(1);
});


