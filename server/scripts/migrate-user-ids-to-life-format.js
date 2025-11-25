#!/usr/bin/env node

/**
 * Migrate User IDs to LIFE Format
 * 
 * Migrates existing Chatty users from legacy IDs (MongoDB ObjectId, Google sub)
 * to LIFE format: {name}_{timestamp}
 * 
 * This script:
 * 1. Scans users.json registry for users with non-LIFE format IDs
 * 2. Generates LIFE format IDs for each user
 * 3. Renames user directories
 * 4. Updates registry entries
 * 5. Updates profile.json files
 * 6. Handles conflicts and errors gracefully
 * 
 * Usage:
 *   node migrate-user-ids-to-life-format.js [--dry-run] [--user-id <specific_user_id>]
 * 
 * Options:
 *   --dry-run        Show what would be migrated without making changes
 *   --user-id <id>   Migrate only a specific user ID
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const REGISTRY_FILE = path.join(PROJECT_ROOT, 'users.json');
const USERS_DIR = path.join(PROJECT_ROOT, 'users');

/**
 * Generate LIFE format user ID
 */
function generateLIFEUserId(name, email = null, timestamp = null) {
  const ts = timestamp || Date.now();
  let userName = 'user';
  
  if (name) {
    userName = name.replace(/[^a-z0-9]/gi, '_')
                  .toLowerCase()
                  .replace(/_+/g, '_')
                  .replace(/^_|_$/g, '');
  } else if (email) {
    const emailName = email.split('@')[0].replace(/[^a-z0-9]/gi, '_').toLowerCase();
    if (emailName && emailName.length > 0) {
      userName = emailName;
    }
  }
  
  return `${userName}_${ts}`;
}

/**
 * Check if user ID is already LIFE format
 */
function isLIFEFormat(userId) {
  // LIFE format: contains underscore and ends with numeric timestamp
  if (!userId.includes('_')) return false;
  
  const parts = userId.split('_');
  const lastPart = parts[parts.length - 1];
  
  // Last part should be numeric (timestamp)
  return /^\d+$/.test(lastPart) && lastPart.length >= 10; // Timestamps are at least 10 digits
}

/**
 * Load registry
 */
async function loadRegistry() {
  try {
    const content = await fs.readFile(REGISTRY_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { users: {}, totalUsers: 0, nextUserId: 1 };
    }
    throw error;
  }
}

/**
 * Save registry
 */
async function saveRegistry(registry) {
  await fs.mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf8');
}

/**
 * Migrate a single user
 */
async function migrateUser(oldUserId, userData, dryRun = false) {
  const { email, name } = userData;
  
  // Check if already LIFE format
  if (isLIFEFormat(oldUserId)) {
    return { skipped: true, reason: 'Already LIFE format' };
  }
  
  // Generate new LIFE format ID
  // Use existing timestamp from created_at if available to preserve creation time
  let timestamp = null;
  if (userData.created_at) {
    timestamp = new Date(userData.created_at).getTime();
  }
  
  const newUserId = generateLIFEUserId(name, email, timestamp);
  
  // Check if new ID already exists (shouldn't happen, but safety check)
  const registry = await loadRegistry();
  if (registry.users[newUserId] && registry.users[newUserId].user_id !== oldUserId) {
    return { error: true, reason: `New ID ${newUserId} already exists for different user` };
  }
  
  if (dryRun) {
    return {
      dryRun: true,
      oldUserId,
      newUserId,
      email,
      name
    };
  }
  
  // Perform migration
  try {
    // 1. Rename directory
    const oldDir = path.join(USERS_DIR, userData.shard || 'shard_0000', oldUserId);
    const newDir = path.join(USERS_DIR, userData.shard || 'shard_0000', newUserId);
    
    try {
      await fs.access(oldDir);
      await fs.rename(oldDir, newDir);
      console.log(`  ✅ Renamed directory: ${oldUserId} → ${newUserId}`);
    } catch (dirError) {
      if (dirError.code === 'ENOENT') {
        console.log(`  ⚠️  Directory not found: ${oldDir} (may not exist yet)`);
      } else {
        throw dirError;
      }
    }
    
    // 2. Update registry entry
    const updatedUser = {
      ...userData,
      user_id: newUserId
    };
    
    delete registry.users[oldUserId];
    registry.users[newUserId] = updatedUser;
    registry.totalUsers = Object.keys(registry.users).length;
    await saveRegistry(registry);
    console.log(`  ✅ Updated registry entry`);
    
    // 3. Update profile.json if it exists
    const profilePath = path.join(newDir, 'identity', 'profile.json');
    try {
      const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
      profile.user_id = newUserId;
      await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');
      console.log(`  ✅ Updated profile.json`);
    } catch (profileError) {
      if (profileError.code !== 'ENOENT') {
        console.log(`  ⚠️  Could not update profile.json: ${profileError.message}`);
      }
    }
    
    return {
      success: true,
      oldUserId,
      newUserId,
      email,
      name
    };
  } catch (error) {
    return {
      error: true,
      reason: error.message,
      oldUserId,
      newUserId
    };
  }
}

/**
 * Main migration function
 */
async function migrateUserIds(options = {}) {
  const { dryRun = false, specificUserId = null } = options;
  
  console.log('🔄 MIGRATING USER IDS TO LIFE FORMAT');
  console.log('=====================================\n');
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  // Load registry
  const registry = await loadRegistry();
  const users = Object.entries(registry.users);
  
  if (users.length === 0) {
    console.log('ℹ️  No users found in registry');
    return;
  }
  
  console.log(`📋 Found ${users.length} user(s) in registry\n`);
  
  // Filter users that need migration
  let usersToMigrate = users.filter(([userId, userData]) => {
    if (specificUserId && userId !== specificUserId) {
      return false;
    }
    return !isLIFEFormat(userId);
  });
  
  if (usersToMigrate.length === 0) {
    console.log('✅ All users already use LIFE format!');
    return;
  }
  
  console.log(`🔄 Found ${usersToMigrate.length} user(s) to migrate:\n`);
  
  // Show what will be migrated
  usersToMigrate.forEach(([userId, userData]) => {
    const newId = generateLIFEUserId(userData.name, userData.email, 
      userData.created_at ? new Date(userData.created_at).getTime() : null);
    console.log(`  ${userId} → ${newId}`);
    console.log(`    Email: ${userData.email || 'N/A'}`);
    console.log(`    Name: ${userData.name || 'N/A'}\n`);
  });
  
  if (dryRun) {
    console.log('🔍 Dry run complete - no changes made');
    return;
  }
  
  // Confirm migration
  console.log('⚠️  This will rename directories and update registry entries.');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Perform migration
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const [oldUserId, userData] of usersToMigrate) {
    console.log(`\n🔄 Migrating: ${oldUserId}`);
    const result = await migrateUser(oldUserId, userData, dryRun);
    
    if (result.success) {
      successCount++;
      console.log(`✅ Successfully migrated to: ${result.newUserId}`);
    } else if (result.skipped) {
      skippedCount++;
      console.log(`⏭️  Skipped: ${result.reason}`);
    } else {
      errorCount++;
      console.log(`❌ Error: ${result.reason || 'Unknown error'}`);
    }
  }
  
  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⏭️  Skipped: ${skippedCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  
  if (successCount > 0) {
    console.log('\n✅ Migration complete! Users should log out and log back in.');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  specificUserId: args.includes('--user-id') 
    ? args[args.indexOf('--user-id') + 1] 
    : null
};

// Run migration
migrateUserIds(options).catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

