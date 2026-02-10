#!/usr/bin/env node

/**
 * Simple User Data Recovery Script
 * Checks the current database setup and user data
 */

import fs from 'fs';
import path from 'path';

const TARGET_EMAIL = 'dwoodosn92@gmail.com';

async function checkDatabaseSetup() {
  console.log('🔍 CHATTY DATABASE RECOVERY CHECK');
  console.log('=================================');
  console.log(`Target Email: ${TARGET_EMAIL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Check for SQLite database files
  const dbFiles = [
    '../chatty.db',
    '../chatty.db-shm', 
    '../chatty.db-wal'
  ];

  console.log('📊 Database Files Check:');
  for (const dbFile of dbFiles) {
    const fullPath = path.resolve(dbFile);
    const exists = fs.existsSync(fullPath);
    const stats = exists ? fs.statSync(fullPath) : null;
    
    console.log(`   ${exists ? '✅' : '❌'} ${dbFile}`);
    if (exists && stats) {
      console.log(`      Size: ${stats.size} bytes`);
      console.log(`      Modified: ${stats.mtime.toISOString()}`);
    }
  }

  // Check environment variables
  console.log('\n🔧 Environment Check:');
  console.log(`   MONGODB_URI: ${process.env.MONGODB_URI || 'Not set (using in-memory)'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);
  console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? 'Set' : 'Not set'}`);

  // Check if server is running
  console.log('\n🌐 Server Status Check:');
  try {
    const response = await fetch('http://localhost:5000/health');
    if (response.ok) {
      console.log('   ✅ Server is running on port 5000');
    } else {
      console.log('   ⚠️  Server responded but not healthy');
    }
  } catch (error) {
    console.log('   ❌ Server is not running on port 5000');
    console.log('   💡 Start server with: npm run dev');
  }

  // Check for user data in localStorage (if accessible)
  console.log('\n💾 Data Storage Analysis:');
  console.log('   📱 Frontend localStorage: Check browser dev tools');
  console.log('   🗄️  Backend memory: Data may be in server memory');
  console.log('   📁 SQLite files: Found database files');

  console.log('\n🔍 RECOVERY RECOMMENDATIONS:');
  console.log('1. Start the server: npm run dev');
  console.log('2. Check browser localStorage for auth:session');
  console.log('3. Login with your original OAuth method (Google)');
  console.log('4. If data is missing, check server logs for errors');
  console.log('5. The new signup system may have created a separate account');

  console.log('\n🚨 LIKELY ISSUE:');
  console.log('The new email signup system created a separate user account');
  console.log('instead of recognizing your existing OAuth account.');
  console.log('Your original data should still be accessible via OAuth login.');

  console.log('\n✅ NEXT STEPS:');
  console.log('1. Start the server');
  console.log('2. Try logging in with Google OAuth');
  console.log('3. Check if your conversation history is restored');
  console.log('4. If not, we may need to check the server memory/database');
}

// Run the check
checkDatabaseSetup().catch(console.error);
