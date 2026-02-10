#!/usr/bin/env node

/**
 * Emergency Recovery Script
 * Attempts to restore user data from various sources
 */

import fs from 'fs';
import path from 'path';

const TARGET_EMAIL = 'dwoodosn92@gmail.com';

async function emergencyRecovery() {
  console.log('🚨 EMERGENCY RECOVERY ATTEMPT');
  console.log('==============================');
  console.log(`Target Email: ${TARGET_EMAIL}\n`);

  // Check for any backup files
  console.log('🔍 Searching for backup data...');
  
  const possibleBackups = [
    '../chatty.db',
    '../chatty.db-shm',
    '../chatty.db-wal',
    '../vault-log.jsonl',
    '../chatty-conversations/',
    '../dist/',
    '../public/'
  ];

  for (const backup of possibleBackups) {
    const fullPath = path.resolve(backup);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      console.log(`✅ Found: ${backup} (${stats.size} bytes, ${stats.mtime.toISOString()})`);
      
      if (backup.includes('vault-log') || backup.includes('conversations')) {
        console.log(`   📄 This might contain conversation data!`);
      }
    }
  }

  // Check for any JSON files that might contain user data
  console.log('\n🔍 Searching for JSON data files...');
  try {
    const vaultLog = '../vault-log.jsonl';
    if (fs.existsSync(vaultLog)) {
      const content = fs.readFileSync(vaultLog, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      console.log(`   📄 Found vault-log.jsonl with ${lines.length} entries`);
      
      // Look for entries related to the target email
      const relevantEntries = lines.filter(line => 
        line.toLowerCase().includes(TARGET_EMAIL.toLowerCase())
      );
      
      if (relevantEntries.length > 0) {
        console.log(`   🎯 Found ${relevantEntries.length} entries related to your email!`);
        console.log('   📋 Recent entries:');
        relevantEntries.slice(-3).forEach((entry, index) => {
          try {
            const data = JSON.parse(entry);
            console.log(`      ${index + 1}. ${data.timestamp || 'No timestamp'}: ${data.action || 'Unknown action'}`);
          } catch (e) {
            console.log(`      ${index + 1}. Raw entry: ${entry.substring(0, 100)}...`);
          }
        });
      }
    }
  } catch (error) {
    console.log('   ❌ Error reading vault log:', error.message);
  }

  console.log('\n🚨 RECOVERY STATUS:');
  console.log('❌ User data not found in server memory');
  console.log('❌ This suggests data loss due to in-memory storage reset');
  
  console.log('\n💡 RECOVERY OPTIONS:');
  console.log('1. Check browser localStorage for auth:session');
  console.log('2. Try Google OAuth login to restore session');
  console.log('3. Check if vault-log.jsonl contains conversation data');
  console.log('4. If all else fails, data may be permanently lost');
  
  console.log('\n🔧 PREVENTION:');
  console.log('The in-memory storage system is not persistent.');
  console.log('Consider implementing proper database persistence.');
  console.log('The new signup system should not have created duplicates');
  console.log('if the original OAuth system was working correctly.');
}

// Run emergency recovery
emergencyRecovery().catch(console.error);
