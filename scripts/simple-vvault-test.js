#!/usr/bin/env node
/**
 * Simple VVAULT Test
 * 
 * This script tests VVAULT storage by directly writing
 * to the VVAULT directory structure.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

async function testVVAULTStorage() {
  console.log('🧪 Testing VVAULT Storage...\n');

  try {
    // VVAULT path
    const vvaultPath = process.env.VVAULT_PATH || '../VVAULT';
    const usersPath = path.join(vvaultPath, 'users');
    
    console.log(`📁 VVAULT Path: ${vvaultPath}`);
    
    // Ensure VVAULT directory exists
    await fs.mkdir(vvaultPath, { recursive: true });
    await fs.mkdir(usersPath, { recursive: true });
    console.log('✅ VVAULT directory structure created');

    // Test data
    const testMessages = [
      {
        userId: 'test_user_123',
        sessionId: 'test_conversation_456',
        role: 'user',
        content: 'Hello! This is a test message to verify VVAULT integration is working.',
        timestamp: new Date().toISOString(),
        emotionScores: { joy: 0.8, anticipation: 0.2 }
      },
      {
        userId: 'test_user_123',
        sessionId: 'test_conversation_456',
        role: 'assistant',
        content: 'Hello! I received your test message. VVAULT integration is working correctly! This conversation is now stored in VVAULT.',
        timestamp: new Date().toISOString(),
        emotionScores: { joy: 0.9, trust: 0.8 }
      },
      {
        userId: 'anonymous_user_789',
        sessionId: 'anonymous_session_101',
        role: 'user',
        content: 'This is an anonymous test message to verify universal storage works for all users.',
        timestamp: new Date().toISOString(),
        emotionScores: { curiosity: 0.7 }
      }
    ];

    console.log('📝 Storing test messages...\n');

    // Store each message
    for (const message of testMessages) {
      try {
        // Create user directory
        const userDir = path.join(usersPath, message.userId);
        const transcriptsDir = path.join(userDir, 'transcripts');
        const sessionDir = path.join(transcriptsDir, message.sessionId);
        
        await fs.mkdir(sessionDir, { recursive: true });
        
        // Create filename with timestamp
        const timestamp = message.timestamp.replace(/:/g, '-').replace(/\./g, '-');
        const filename = `${timestamp}_${message.role}.txt`;
        const filePath = path.join(sessionDir, filename);
        
        // Create transcript content
        const transcriptContent = `# Timestamp: ${message.timestamp}
# Role: ${message.role}
# User: ${message.userId}
# Session: ${message.sessionId}
# Emotions: ${JSON.stringify(message.emotionScores)}
# ---

${message.content}
`;
        
        // Write file
        await fs.writeFile(filePath, transcriptContent, 'utf8');
        
        console.log(`✅ Stored ${message.role} message for ${message.userId}`);
        console.log(`   📄 File: ${filePath}`);
        
      } catch (error) {
        console.error(`❌ Failed to store ${message.role} message:`, error.message);
      }
    }

    // Verify storage
    console.log('\n🔍 Verifying storage...');
    
    try {
      const users = await fs.readdir(usersPath);
      console.log(`👥 Found ${users.length} users: ${users.join(', ')}`);
      
      let totalSessions = 0;
      let totalTranscripts = 0;
      
      for (const user of users) {
        const userPath = path.join(usersPath, user);
        const transcriptsPath = path.join(userPath, 'transcripts');
        
        try {
          const sessions = await fs.readdir(transcriptsPath);
          totalSessions += sessions.length;
          
          console.log(`\n👤 User: ${user}`);
          console.log(`  📁 Sessions: ${sessions.length}`);
          
          for (const session of sessions) {
            const sessionPath = path.join(transcriptsPath, session);
            const files = await fs.readdir(sessionPath);
            const transcriptFiles = files.filter(f => f.endsWith('.txt'));
            totalTranscripts += transcriptFiles.length;
            
            console.log(`    📄 Session ${session}: ${transcriptFiles.length} transcripts`);
            
            // Show recent transcripts
            if (transcriptFiles.length > 0) {
              const recentFiles = transcriptFiles.slice(-2); // Last 2 files
              for (const file of recentFiles) {
                const filePath = path.join(sessionPath, file);
                const stats = await fs.stat(filePath);
                console.log(`      📝 ${file} (${stats.size} bytes)`);
              }
            }
          }
          
        } catch {
          console.log(`\n👤 User: ${user} (no transcripts)`);
        }
      }
      
      console.log(`\n📊 Summary:`);
      console.log(`  👥 Users: ${users.length}`);
      console.log(`  📁 Sessions: ${totalSessions}`);
      console.log(`  📝 Transcripts: ${totalTranscripts}`);
      
      if (totalTranscripts > 0) {
        console.log('\n✅ VVAULT storage is working!');
        console.log('📝 Test messages have been stored in VVAULT');
        console.log('\n🎯 Next Steps:');
        console.log('  1. Add this line to your Chatty server startup:');
        console.log('     require("./vvaultConnector/auto-enable");');
        console.log('  2. Start Chatty server');
        console.log('  3. Send messages in Chatty');
        console.log('  4. Check VVAULT directory for stored conversations');
      } else {
        console.log('\n⚠️ No transcripts found in VVAULT');
        console.log('💡 Check the error messages above');
      }
      
    } catch (error) {
      console.error('❌ Error verifying storage:', error);
    }
    
  } catch (error) {
    console.error('❌ VVAULT Storage Test Failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testVVAULTStorage();
