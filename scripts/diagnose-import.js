#!/usr/bin/env node
/**
 * Diagnostic script to inspect VVAULT folder structure after import
 * Shows what files were created and their contents
 */

const fs = require('fs').promises;
const path = require('path');

// Get VVAULT root from config
const { VVAULT_ROOT } = require('../vvaultConnector/config');

async function diagnoseImport(userId = null, email = null) {
  console.log('🔍 Diagnosing Import Structure\n');
  console.log(`VVAULT Root: ${VVAULT_ROOT}\n`);

  const usersDir = path.join(VVAULT_ROOT, 'users');
  
  try {
    // Check if users directory exists
    await fs.access(usersDir);
    console.log('✅ Users directory exists\n');
  } catch {
    console.log('❌ Users directory does not exist\n');
    return;
  }

  // Find all shards
  const shardDirs = await fs.readdir(usersDir, { withFileTypes: true });
  const shards = shardDirs.filter(d => d.isDirectory() && d.name.startsWith('shard_'));

  console.log(`Found ${shards.length} shard(s)\n`);

  for (const shard of shards) {
    const shardPath = path.join(usersDir, shard.name);
    console.log(`\n📁 Shard: ${shard.name}`);
    console.log('='.repeat(60));

    const userDirs = await fs.readdir(shardPath, { withFileTypes: true });
    const users = userDirs.filter(d => d.isDirectory());

    for (const user of users) {
      const userPath = path.join(shardPath, user.name);
      
      // Check if this is the user we're looking for
      if (userId && user.name !== userId) {
        // Try to match by email in profile.json
        try {
          const profilePath = path.join(userPath, 'identity', 'profile.json');
          const profileContent = await fs.readFile(profilePath, 'utf8');
          const profile = JSON.parse(profileContent);
          if (email && profile.email !== email) continue;
          if (userId && profile.user_id !== userId && profile.email !== userId) continue;
        } catch {
          continue;
        }
      }

      console.log(`\n👤 User: ${user.name}`);
      console.log('-'.repeat(60));

      const constructsPath = path.join(userPath, 'constructs');
      try {
        await fs.access(constructsPath);
      } catch {
        console.log('  ⚠️  No constructs directory');
        continue;
      }

      const constructDirs = await fs.readdir(constructsPath, { withFileTypes: true });
      const constructs = constructDirs.filter(d => d.isDirectory() && /-\d{3}$/.test(d.name));

      console.log(`  Found ${constructs.length} construct(s)`);

      for (const construct of constructs) {
        const constructPath = path.join(constructsPath, construct.name);
        const chattyPath = path.join(constructPath, 'chatty');

        console.log(`\n  📦 Construct: ${construct.name}`);

        try {
          await fs.access(chattyPath);
        } catch {
          console.log('    ⚠️  No chatty directory');
          continue;
        }

        const files = await fs.readdir(chattyPath, { withFileTypes: true });
        const mdFiles = files.filter(f => f.isFile() && f.name.endsWith('.md'));

        console.log(`    Found ${mdFiles.length} markdown file(s)`);

        for (const file of mdFiles) {
          const filePath = path.join(chattyPath, file.name);
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf8');
          
          // Count messages
          const messageMatches = content.match(/\*\*\[.*?\]\s+.*?\(.*?\)\*\*:/g) || 
                                content.match(/You said:|[A-Za-z0-9\s-]+\s+said:/g) || [];
          
          // Count conversations (look for conversation boundaries)
          const conversationHeaders = content.match(/^#\s+[^#]/gm) || [];
          const importMetadata = content.match(/<!-- IMPORT_METADATA\n([\s\S]*?)\n-->/);

          console.log(`\n    📄 File: ${file.name}`);
          console.log(`       Size: ${(stats.size / 1024).toFixed(2)} KB`);
          console.log(`       Messages: ~${messageMatches.length}`);
          console.log(`       Conversation headers: ${conversationHeaders.length}`);

          if (importMetadata) {
            try {
              const metadata = JSON.parse(importMetadata[1]);
              console.log(`       Import metadata:`, {
                importedFrom: metadata.importedFrom,
                conversationId: metadata.conversationId,
                detectedModel: metadata.detectedModel
              });
            } catch (e) {
              console.log(`       Import metadata: (parse error)`);
            }
          }

          // Show first few lines
          const lines = content.split('\n').slice(0, 20);
          console.log(`\n       First 20 lines:`);
          lines.forEach((line, i) => {
            if (line.trim()) {
              console.log(`       ${i + 1}: ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
            }
          });
        }
      }
    }
  }

  // Also check legacy structure
  console.log(`\n\n📁 Checking Legacy Structure`);
  console.log('='.repeat(60));
  
  const legacyEntries = await fs.readdir(VVAULT_ROOT, { withFileTypes: true });
  const legacyConstructs = legacyEntries.filter(e => e.isDirectory() && /-\d{3}$/.test(e.name));

  console.log(`Found ${legacyConstructs.length} legacy construct(s)`);

  for (const construct of legacyConstructs) {
    const constructPath = path.join(VVAULT_ROOT, construct.name);
    const chattyPath = path.join(constructPath, 'Chatty');

    try {
      await fs.access(chattyPath);
      const files = await fs.readdir(chattyPath, { withFileTypes: true });
      const mdFiles = files.filter(f => f.isFile() && f.name.endsWith('.md'));
      
      console.log(`\n  📦 Legacy Construct: ${construct.name}`);
      console.log(`    Found ${mdFiles.length} markdown file(s)`);
    } catch {
      // No Chatty folder
    }
  }
}

// Run diagnostics
const userId = process.argv[2] || null;
const email = process.argv[3] || null;

diagnoseImport(userId, email).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

