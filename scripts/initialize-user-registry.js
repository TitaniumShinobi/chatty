#!/usr/bin/env node
/**
 * Initialize Chatty User Registry for Existing Users
 * 
 * This script creates the Chatty user registry and directory structure
 * for users who logged in before the registry was implemented.
 * 
 * Usage: 
 *   node scripts/initialize-user-registry.js [userId] [email] [name]
 * 
 * To get your user info:
 *   1. Open browser console in Chatty
 *   2. Run: fetch('/api/me').then(r => r.json()).then(d => console.log(d.user))
 *   3. Use the 'id' and 'email'/'name' from the response
 */

import { getOrCreateUser } from '../server/lib/userRegistry.js';

async function initializeRegistry() {
  try {
    // Get command line arguments
    const [,, userId, email, name] = process.argv;

    if (!userId || !email || !name) {
      console.log('\n❌ Missing required arguments\n');
      console.log('Usage: node scripts/initialize-user-registry.js [userId] [email] [name]\n');
      console.log('To get your user info:');
      console.log('  1. Open browser console in Chatty (F12)');
      console.log('  2. Run: fetch("/api/me").then(r => r.json()).then(d => console.log(d.user))');
      console.log('  3. Use the "id", "email", and "name" from the response\n');
      console.log('Example:');
      console.log('  node scripts/initialize-user-registry.js 109043688581425242997 dwoodson92@gmail.com "Devon Woodson"\n');
      process.exit(1);
    }

    // Initialize specific user
    console.log(`\n🔧 Initializing registry for user:`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Email: ${email}`);
    console.log(`   Name: ${name}\n`);
    
    const userProfile = await getOrCreateUser(userId, email, name);
    console.log(`✅ Created registry entry:`);
    console.log(`   User ID: ${userProfile.user_id}`);
    console.log(`   Shard: ${userProfile.shard}`);
    console.log(`   Directory: chatty/users/${userProfile.shard}/${userProfile.user_id}/`);
    console.log(`   Profile: chatty/users/${userProfile.shard}/${userProfile.user_id}/identity/profile.json`);
    console.log('\n✅ Registry initialization complete');
    console.log('\n💡 Next step: Refresh Chatty and Lin should recognize you!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

initializeRegistry();

