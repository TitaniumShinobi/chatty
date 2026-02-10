#!/usr/bin/env node
/**
 * VVAULT Status Checker
 * 
 * This script checks if VVAULT integration is working
 * and shows the current status of stored conversations.
 */

import fs from 'fs/promises';
import path from 'path';

async function checkVVAULTStatus() {
  console.log('🔍 Checking VVAULT Status...\n');

  try {
    // Check VVAULT directory
    const vvaultPath = process.env.VVAULT_PATH || '../VVAULT';
    const usersPath = path.join(vvaultPath, 'users');
    
    console.log(`📁 VVAULT Path: ${vvaultPath}`);
    
    try {
      await fs.access(usersPath);
      console.log('✅ VVAULT users directory exists');
      
      // List users
      const users = await fs.readdir(usersPath);
      console.log(`👥 Found ${users.length} users: ${users.join(', ')}`);
      
      let totalSessions = 0;
      let totalTranscripts = 0;
      
      // Check each user
      for (const user of users) {
        const userPath = path.join(usersPath, user);
        const transcriptsPath = path.join(userPath, 'transcripts');
        
        try {
          await fs.access(transcriptsPath);
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
              const recentFiles = transcriptFiles.slice(-3); // Last 3 files
              for (const file of recentFiles) {
                const filePath = path.join(sessionPath, file);
                const stats = await fs.stat(filePath);
                console.log(`      📝 ${file} (${stats.size} bytes, ${stats.mtime.toISOString()})`);
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
        console.log('\n✅ VVAULT integration is working!');
        console.log('📝 Conversations are being stored in VVAULT');
      } else {
        console.log('\n⚠️ No transcripts found in VVAULT');
        console.log('💡 Make sure VVAULT integration is enabled in Chatty');
      }
      
    } catch (error) {
      console.log('❌ VVAULT directory not found');
      console.log(`💡 Create VVAULT directory at: ${vvaultPath}`);
      console.log('💡 Or set VVAULT_PATH environment variable');
    }
    
  } catch (error) {
    console.error('❌ Error checking VVAULT status:', error);
  }
}

// Run the check
checkVVAULTStatus();
