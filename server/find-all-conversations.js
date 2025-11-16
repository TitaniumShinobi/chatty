#!/usr/bin/env node

/**
 * Find ALL Conversations from ALL Possible Sources
 * This script searches every possible location for conversation data
 */

import { execSync } from 'child_process';
import fs from 'fs';

async function searchAllSources() {
  console.log('🔍 COMPREHENSIVE CONVERSATION SEARCH');
  console.log('====================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  let totalConversations = 0;
  let allConversations = [];

  // 1. Check vault-log.jsonl
  console.log('1️⃣ CHECKING VAULT-LOG.JSONL');
  console.log('============================');
  try {
    if (fs.existsSync('../vault-log.jsonl')) {
      const content = fs.readFileSync('../vault-log.jsonl', 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      console.log(`📄 Found ${lines.length} lines in vault-log.jsonl`);
      
      // Count conversations by grouping messages
      let conversationCount = 0;
      let currentGroup = [];
      
      lines.forEach((line, index) => {
        try {
          const data = JSON.parse(line);
          if (data.input && data.ts) {
            if (currentGroup.length === 0) {
              conversationCount++;
            }
            currentGroup.push(data);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      });
      
      console.log(`💬 Estimated ${conversationCount} conversations in vault-log`);
      totalConversations += conversationCount;
    } else {
      console.log('❌ vault-log.jsonl not found');
    }
  } catch (error) {
    console.log('❌ Error reading vault-log:', error.message);
  }

  // 2. Check SQLite databases
  console.log('\n2️⃣ CHECKING SQLITE DATABASES');
  console.log('============================');
  try {
    const dbFiles = ['../chatty.db', '../server/chatty.db'];
    dbFiles.forEach(dbFile => {
      if (fs.existsSync(dbFile)) {
        try {
          const result = execSync(`sqlite3 "${dbFile}" "SELECT COUNT(*) FROM messages;"`, { encoding: 'utf8' });
          const messageCount = parseInt(result.trim());
          console.log(`📄 ${dbFile}: ${messageCount} messages`);
          
          // Estimate conversations (group by time gaps)
          const messages = execSync(`sqlite3 "${dbFile}" "SELECT ts FROM messages ORDER BY ts;"`, { encoding: 'utf8' });
          const timestamps = messages.trim().split('\n').map(ts => parseInt(ts));
          
          let convCount = 0;
          for (let i = 0; i < timestamps.length; i++) {
            if (i === 0 || (timestamps[i] - timestamps[i-1]) > 7200000) { // 2 hours
              convCount++;
            }
          }
          
          console.log(`💬 Estimated ${convCount} conversations in ${dbFile}`);
          totalConversations += convCount;
        } catch (error) {
          console.log(`❌ Error reading ${dbFile}:`, error.message);
        }
      }
    });
  } catch (error) {
    console.log('❌ Error checking SQLite databases:', error.message);
  }

  // 3. Check for localStorage backup files
  console.log('\n3️⃣ CHECKING FOR BACKUP FILES');
  console.log('=============================');
  try {
    const backupPatterns = [
      '**/*backup*.json',
      '**/*conversation*.json',
      '**/*chatty*.json',
      '**/*thread*.json',
      '**/*localStorage*.json'
    ];
    
    backupPatterns.forEach(pattern => {
      try {
        const result = execSync(`find .. -name "${pattern}" -type f 2>/dev/null`, { encoding: 'utf8' });
        if (result.trim()) {
          const files = result.trim().split('\n');
          console.log(`📄 Found ${files.length} files matching ${pattern}:`);
          files.forEach(file => {
            console.log(`   ${file}`);
            try {
              const content = fs.readFileSync(file, 'utf8');
              const data = JSON.parse(content);
              if (data.conversations || data.messages) {
                const convCount = data.conversations?.length || 0;
                console.log(`   💬 Contains ${convCount} conversations`);
                totalConversations += convCount;
              }
            } catch (e) {
              console.log(`   ⚠️  Could not parse ${file}`);
            }
          });
        }
      } catch (e) {
        // Pattern not found, continue
      }
    });
  } catch (error) {
    console.log('❌ Error checking backup files:', error.message);
  }

  // 4. Check for any JSON files that might contain conversations
  console.log('\n4️⃣ CHECKING ALL JSON FILES');
  console.log('==========================');
  try {
    const result = execSync(`find .. -name "*.json" -type f | grep -v node_modules | head -20`, { encoding: 'utf8' });
    const jsonFiles = result.trim().split('\n').filter(f => f.trim());
    
    console.log(`📄 Checking ${jsonFiles.length} JSON files...`);
    
    jsonFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(content);
        
        // Check if this looks like conversation data
        if (data.conversations || data.messages || (Array.isArray(data) && data.length > 0 && data[0].messages)) {
          const convCount = data.conversations?.length || (Array.isArray(data) ? data.length : 0);
          console.log(`💬 ${file}: ${convCount} conversations`);
          totalConversations += convCount;
        }
      } catch (e) {
        // Not JSON or not conversation data
      }
    });
  } catch (error) {
    console.log('❌ Error checking JSON files:', error.message);
  }

  // 5. Check browser localStorage (requires manual inspection)
  console.log('\n5️⃣ BROWSER LOCALSTORAGE CHECK');
  console.log('==============================');
  console.log('To check your current localStorage, run this in your browser console:');
  console.log('');
  console.log('```javascript');
  console.log('// Check all localStorage keys');
  console.log('console.log("📋 All localStorage keys:", Object.keys(localStorage));');
  console.log('');
  console.log('// Check for conversation-related keys');
  console.log('Object.keys(localStorage).forEach(key => {');
  console.log('  if (key.includes("chat") || key.includes("conversation") || key.includes("thread")) {');
  console.log('    console.log(`🔍 Found: ${key}`);');
  console.log('    const data = localStorage.getItem(key);');
  console.log('    try {');
  console.log('      const parsed = JSON.parse(data);');
  console.log('      if (parsed.conversations || parsed.messages || Array.isArray(parsed)) {');
  console.log('        console.log(`   💬 Conversations: ${parsed.conversations?.length || parsed.length || 0}`);');
  console.log('      }');
  console.log('    } catch (e) {');
  console.log('      console.log(`   Raw data: ${data.substring(0, 100)}...`);');
  console.log('    }');
  console.log('  }');
  console.log('});');
  console.log('```');

  console.log('\n📊 SEARCH SUMMARY');
  console.log('==================');
  console.log(`Total conversations found: ${totalConversations}`);
  console.log('');
  console.log('📞 Next Steps:');
  console.log('1. Run the browser localStorage check script above');
  console.log('2. Share the output so I can help recover all your conversations');
  console.log('3. If you had ~10 conversations, we need to find the missing ones!');
}

// Run the search
searchAllSources();



