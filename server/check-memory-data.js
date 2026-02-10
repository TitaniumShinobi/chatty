#!/usr/bin/env node

/**
 * Check Server Memory Data
 * This script checks what user data is currently in server memory
 */

import { Store } from './store.js';

const TARGET_EMAIL = 'dwoodosn92@gmail.com';

async function checkMemoryData() {
  console.log('🧠 CHECKING SERVER MEMORY DATA');
  console.log('==============================');
  console.log(`Target Email: ${TARGET_EMAIL}\n`);

  try {
    // Check if user exists in memory
    console.log('🔍 Searching for user in memory...');
    const user = await Store.findUserByEmail(TARGET_EMAIL);
    
    if (user) {
      console.log('✅ User found in memory:');
      console.log(`   ID: ${user._id || user.id}`);
      console.log(`   UID: ${user.uid}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Provider: ${user.provider}`);
      console.log(`   Picture: ${user.picture || 'None'}`);
      
      // Check conversations
      console.log('\n💬 Checking conversations...');
      const conversations = await Store.getConversations(user._id || user.id);
      console.log(`   Found ${conversations.length} conversations`);
      
      if (conversations.length > 0) {
        conversations.forEach((conv, index) => {
          console.log(`   📝 ${index + 1}. ${conv.title || 'Untitled'}`);
        });
      }
      
    } else {
      console.log('❌ User not found in memory');
      console.log('   This suggests the user data may have been lost');
      console.log('   or the user was created with a different system');
    }

  } catch (error) {
    console.error('❌ Error checking memory data:', error.message);
  }

  console.log('\n📋 RECOVERY OPTIONS:');
  console.log('1. If user found: Data should be accessible via OAuth login');
  console.log('2. If user not found: Data may have been lost or moved');
  console.log('3. Check browser localStorage for auth:session');
  console.log('4. Try logging in with Google OAuth to restore session');
}

// Run the check
checkMemoryData().catch(console.error);
