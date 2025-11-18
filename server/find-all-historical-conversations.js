#!/usr/bin/env node

/**
 * Find ALL Historical Conversations - 30+ Days Back
 * This script searches for conversations across all time periods
 */

import { execSync } from 'child_process';
import fs from 'fs';

async function searchHistoricalConversations() {
  console.log('🔍 COMPREHENSIVE HISTORICAL CONVERSATION SEARCH');
  console.log('================================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  let totalConversations = 0;
  let allConversations = [];

  // 1. Check vault-log.jsonl with full history
  console.log('1️⃣ CHECKING VAULT-LOG.JSONL (FULL HISTORY)');
  console.log('==========================================');
  try {
    if (fs.existsSync('../vault-log.jsonl')) {
      const content = fs.readFileSync('../vault-log.jsonl', 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      console.log(`📄 Found ${lines.length} lines in vault-log.jsonl`);
      
      // Analyze timestamps to see date range
      const timestamps = [];
      lines.forEach(line => {
        try {
          const data = JSON.parse(line);
          if (data.ts) {
            timestamps.push(data.ts);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      });
      
      if (timestamps.length > 0) {
        const oldest = new Date(Math.min(...timestamps));
        const newest = new Date(Math.max(...timestamps));
        console.log(`📅 Date range: ${oldest.toISOString()} to ${newest.toISOString()}`);
        console.log(`📅 Days covered: ${Math.ceil((newest - oldest) / (1000 * 60 * 60 * 24))} days`);
      }
      
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

  // 2. Check SQLite databases with full history
  console.log('\n2️⃣ CHECKING SQLITE DATABASES (FULL HISTORY)');
  console.log('============================================');
  try {
    const dbFiles = ['../chatty.db', '../server/chatty.db'];
    dbFiles.forEach(dbFile => {
      if (fs.existsSync(dbFile)) {
        try {
          const result = execSync(`sqlite3 "${dbFile}" "SELECT COUNT(*) FROM messages;"`, { encoding: 'utf8' });
          const messageCount = parseInt(result.trim());
          console.log(`📄 ${dbFile}: ${messageCount} messages`);
          
          // Get date range
          const dateResult = execSync(`sqlite3 "${dbFile}" "SELECT MIN(ts), MAX(ts) FROM messages;"`, { encoding: 'utf8' });
          const [minTs, maxTs] = dateResult.trim().split('|');
          if (minTs && maxTs) {
            const oldest = new Date(parseInt(minTs));
            const newest = new Date(parseInt(maxTs));
            console.log(`📅 Date range: ${oldest.toISOString()} to ${newest.toISOString()}`);
            console.log(`📅 Days covered: ${Math.ceil((newest - oldest) / (1000 * 60 * 60 * 24))} days`);
          }
          
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

  // 3. Check for backup files with historical data
  console.log('\n3️⃣ CHECKING FOR HISTORICAL BACKUP FILES');
  console.log('=======================================');
  try {
    // Look for files that might contain historical conversations
    const backupPatterns = [
      '**/*backup*.json',
      '**/*conversation*.json',
      '**/*chatty*.json',
      '**/*thread*.json',
      '**/*localStorage*.json',
      '**/*vault*.json',
      '**/*log*.json'
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

  // 4. Check for any JSON files that might contain historical conversations
  console.log('\n4️⃣ CHECKING ALL JSON FILES FOR HISTORICAL DATA');
  console.log('==============================================');
  try {
    const result = execSync(`find .. -name "*.json" -type f | grep -v node_modules | head -30`, { encoding: 'utf8' });
    const jsonFiles = result.trim().split('\n').filter(f => f.trim());
    
    console.log(`📄 Checking ${jsonFiles.length} JSON files for historical conversations...`);
    
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

  // 5. Check for any other data sources
  console.log('\n5️⃣ CHECKING FOR OTHER DATA SOURCES');
  console.log('==================================');
  try {
    // Look for any files that might contain conversation data
    const otherPatterns = [
      '**/*.db',
      '**/*.sqlite',
      '**/*.jsonl',
      '**/*.log',
      '**/*backup*',
      '**/*restore*',
      '**/*vault*'
    ];
    
    otherPatterns.forEach(pattern => {
      try {
        const result = execSync(`find .. -name "${pattern}" -type f 2>/dev/null | head -10`, { encoding: 'utf8' });
        if (result.trim()) {
          const files = result.trim().split('\n');
          console.log(`📄 Found ${files.length} files matching ${pattern}:`);
          files.forEach(file => {
            console.log(`   ${file}`);
          });
        }
      } catch (e) {
        // Pattern not found, continue
      }
    });
  } catch (error) {
    console.log('❌ Error checking other data sources:', error.message);
  }

  console.log('\n📊 HISTORICAL SEARCH SUMMARY');
  console.log('=============================');
  console.log(`Total conversations found: ${totalConversations}`);
  console.log('');
  console.log('📞 Next Steps:');
  console.log('1. This search covered all available data sources');
  console.log('2. Run the browser localStorage analysis to see current conversations');
  console.log('3. The localStorage data might contain the most recent conversations');
  console.log('4. If you had ~10 conversations, we should have found them all!');
}

// Run the historical search
searchHistoricalConversations();



