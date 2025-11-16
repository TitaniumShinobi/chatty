#!/usr/bin/env node

/**
 * User Data Recovery Script for dwoodosn92@gmail.com
 * This script investigates and recovers user data that may have been lost
 * due to duplicate user creation in the new signup system.
 */

import mongoose from 'mongoose';
import User from './models/User.js';
import Conversation from './models/Conversation.js';
import Message from './models/Message.js';

const TARGET_EMAIL = 'dwoodosn92@gmail.com';

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

async function investigateUserData() {
  console.log('🔍 Investigating user data for:', TARGET_EMAIL);
  console.log('=' .repeat(60));

  try {
    // 1. Find all users with this email
    const users = await User.find({ email: TARGET_EMAIL });
    console.log(`\n📊 Found ${users.length} user record(s) with email: ${TARGET_EMAIL}`);
    
    users.forEach((user, index) => {
      console.log(`\n👤 User ${index + 1}:`);
      console.log(`   ID: ${user._id}`);
      console.log(`   UID: ${user.uid}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Provider: ${user.provider}`);
      console.log(`   Email Verified: ${user.emailVerified}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log(`   Picture: ${user.picture || 'None'}`);
    });

    // 2. Find conversations for each user
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`\n💬 Conversations for User ${i + 1} (${user._id}):`);
      
      const conversations = await Conversation.find({ owner: user._id });
      console.log(`   Found ${conversations.length} conversations`);
      
      if (conversations.length > 0) {
        conversations.forEach((conv, convIndex) => {
          console.log(`   📝 Conversation ${convIndex + 1}: ${conv.title || 'Untitled'}`);
          console.log(`      ID: ${conv._id}`);
          console.log(`      Created: ${conv.createdAt}`);
        });
      }

      // 3. Find messages for each user
      const messages = await Message.find({ owner: user._id });
      console.log(`   📨 Found ${messages.length} messages`);
    }

    return users;

  } catch (error) {
    console.error('❌ Investigation failed:', error.message);
    return [];
  }
}

async function findOriginalUser(users) {
  console.log('\n🔍 Analyzing which user is the original...');
  
  if (users.length === 0) {
    console.log('❌ No users found with this email');
    return null;
  }

  if (users.length === 1) {
    console.log('✅ Only one user found - this is likely the original');
    return users[0];
  }

  // Multiple users found - analyze to find the original
  console.log('\n📊 Multiple users found. Analyzing...');
  
  const analysis = users.map((user, index) => {
    const isOAuth = user.provider === 'google' || user.provider === 'microsoft' || user.provider === 'github';
    const isEmail = user.provider === 'email';
    const hasPicture = !!user.picture;
    const isVerified = user.emailVerified;
    
    console.log(`\n👤 User ${index + 1} Analysis:`);
    console.log(`   Provider: ${user.provider} (${isOAuth ? 'OAuth' : 'Email'})`);
    console.log(`   Has Picture: ${hasPicture}`);
    console.log(`   Email Verified: ${isVerified}`);
    console.log(`   Created: ${user.createdAt}`);
    
    return {
      user,
      index,
      score: (isOAuth ? 10 : 0) + (hasPicture ? 5 : 0) + (isVerified ? 3 : 0),
      isOAuth,
      hasPicture,
      isVerified
    };
  });

  // Sort by score (OAuth users with pictures are likely original)
  analysis.sort((a, b) => b.score - a.score);
  
  const originalUser = analysis[0].user;
  console.log(`\n✅ Original user identified: User ${analysis[0].index + 1}`);
  console.log(`   Score: ${analysis[0].score}`);
  console.log(`   Provider: ${originalUser.provider}`);
  
  return originalUser;
}

async function createRecoveryPlan(originalUser, allUsers) {
  console.log('\n📋 RECOVERY PLAN');
  console.log('=' .repeat(60));
  
  if (!originalUser) {
    console.log('❌ No original user found - cannot create recovery plan');
    return;
  }

  const duplicateUsers = allUsers.filter(user => user._id.toString() !== originalUser._id.toString());
  
  console.log(`\n🎯 Original User: ${originalUser._id}`);
  console.log(`📧 Email: ${originalUser.email}`);
  console.log(`👤 Name: ${originalUser.name}`);
  console.log(`🔗 Provider: ${originalUser.provider}`);
  
  if (duplicateUsers.length > 0) {
    console.log(`\n⚠️  Found ${duplicateUsers.length} duplicate user(s):`);
    duplicateUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user._id} (${user.provider}) - Created: ${user.createdAt}`);
    });
    
    console.log('\n🔧 RECOMMENDED ACTIONS:');
    console.log('1. Keep the original user (OAuth user with most data)');
    console.log('2. Delete duplicate users created by email signup');
    console.log('3. Update any references to use the original user ID');
    
    console.log('\n💾 RECOVERY COMMANDS:');
    console.log('```javascript');
    console.log('// Delete duplicate users');
    duplicateUsers.forEach(user => {
      console.log(`await User.findByIdAndDelete('${user._id}');`);
    });
    console.log('```');
    
  } else {
    console.log('\n✅ No duplicate users found - data should be intact');
  }
}

async function main() {
  console.log('🚨 CHATTY USER DATA RECOVERY SCRIPT');
  console.log('=====================================');
  console.log(`Target Email: ${TARGET_EMAIL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    await connectToDatabase();
    const users = await investigateUserData();
    const originalUser = await findOriginalUser(users);
    await createRecoveryPlan(originalUser, users);
    
    console.log('\n✅ Recovery analysis complete!');
    console.log('\n📞 Next Steps:');
    console.log('1. Review the analysis above');
    console.log('2. If duplicates found, run the recovery commands');
    console.log('3. Test login with your original OAuth method');
    console.log('4. Verify conversation history is restored');
    
  } catch (error) {
    console.error('❌ Recovery script failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the recovery script
main();
