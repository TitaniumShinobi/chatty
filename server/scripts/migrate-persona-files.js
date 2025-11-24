#!/usr/bin/env node

/**
 * Migration script to move persona files from global prompts/customAI/
 * to user-specific directories: users/{shard}/{user_id}/prompts/customAI/
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { listUsers, getUserPersonaDirectory } from '../lib/userRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const GLOBAL_PERSONA_DIR = path.join(PROJECT_ROOT, 'prompts', 'customAI');
const PERSONA_FILES = ['katana_lin.md']; // Add more persona files as needed

async function migratePersonaFiles() {
  console.log('🔄 [Migration] Starting persona file migration...');
  
  try {
    // Get all users from registry
    const users = await listUsers();
    console.log(`📋 [Migration] Found ${users.length} users in registry`);
    
    if (users.length === 0) {
      console.log('ℹ️ [Migration] No users found. Migration will happen automatically when users sign up.');
      return;
    }
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      try {
        const personaDir = await getUserPersonaDirectory(user.user_id);
        
        for (const personaFile of PERSONA_FILES) {
          const globalPath = path.join(GLOBAL_PERSONA_DIR, personaFile);
          const userPath = path.join(personaDir, personaFile);
          
          // Check if global file exists
          try {
            await fs.access(globalPath);
          } catch {
            console.log(`⚠️ [Migration] Global persona file not found: ${personaFile}, skipping`);
            continue;
          }
          
          // Check if user already has the file
          try {
            await fs.access(userPath);
            console.log(`⏭️  [Migration] User ${user.user_id} already has ${personaFile}, skipping`);
            skippedCount++;
            continue;
          } catch {
            // File doesn't exist, proceed with copy
          }
          
          // Copy file to user directory
          const content = await fs.readFile(globalPath, 'utf8');
          await fs.writeFile(userPath, content, 'utf8');
          console.log(`✅ [Migration] Copied ${personaFile} to user ${user.user_id}`);
          migratedCount++;
        }
      } catch (error) {
        console.error(`❌ [Migration] Failed to migrate files for user ${user.user_id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📊 [Migration] Migration complete:');
    console.log(`   ✅ Migrated: ${migratedCount} files`);
    console.log(`   ⏭️  Skipped: ${skippedCount} files (already exist)`);
    console.log(`   ❌ Errors: ${errorCount} users`);
    
  } catch (error) {
    console.error('❌ [Migration] Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migratePersonaFiles()
  .then(() => {
    console.log('✅ [Migration] Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ [Migration] Migration script failed:', error);
    process.exit(1);
  });


