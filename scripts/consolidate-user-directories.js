#!/usr/bin/env node
/**
 * Consolidate User Directories Script
 * 
 * Merges multiple VVAULT user directories into a single canonical directory.
 * Handles:
 * - Merging instances from duplicate directories
 * - Preserving capsules
 * - Updating profile.json
 * - Creating backups before merging
 */

const fs = require('fs').promises;
const path = require('path');
const { VVAULT_ROOT } = require('../vvaultConnector/config');

const SHARD = 'shard_0000';
const CANONICAL_USER_ID = 'devon_woodson_1762969514958'; // Directory with most data
const DUPLICATE_USER_IDS = [
  'dwoodson92_1763971899858',
  'dwoodson92_1763971899864'
];

async function consolidateUserDirectories() {
  console.log('🔄 Starting user directory consolidation...\n');
  
  const usersDir = path.join(VVAULT_ROOT, 'users', SHARD);
  const canonicalPath = path.join(usersDir, CANONICAL_USER_ID);
  const backupDir = path.join(usersDir, `_backup_${Date.now()}`);
  
  try {
    // 1. Verify canonical directory exists
    await fs.access(canonicalPath);
    console.log(`✅ Found canonical directory: ${CANONICAL_USER_ID}`);
    
    // 2. Create backup directory
    await fs.mkdir(backupDir, { recursive: true });
    console.log(`📦 Created backup directory: ${backupDir}\n`);
    
    // 3. Load canonical profile
    const canonicalProfilePath = path.join(canonicalPath, 'account', 'profile.json');
    let canonicalProfile;
    try {
      const profileContent = await fs.readFile(canonicalProfilePath, 'utf8');
      canonicalProfile = JSON.parse(profileContent);
    } catch {
      // Try identity/profile.json if account/profile.json doesn't exist
      const altProfilePath = path.join(canonicalPath, 'identity', 'profile.json');
      const profileContent = await fs.readFile(altProfilePath, 'utf8');
      canonicalProfile = JSON.parse(profileContent);
    }
    
    console.log(`📋 Canonical profile: ${canonicalProfile.user_id}`);
    console.log(`   Email: ${canonicalProfile.email || 'N/A'}`);
    console.log(`   Constructs: ${canonicalProfile.constructs?.length || 0}\n`);
    
    // 4. Process each duplicate directory
    for (const duplicateUserId of DUPLICATE_USER_IDS) {
      const duplicatePath = path.join(usersDir, duplicateUserId);
      
      try {
        await fs.access(duplicatePath);
        console.log(`\n📂 Processing duplicate: ${duplicateUserId}`);
        
        // Backup duplicate directory
        const duplicateBackupPath = path.join(backupDir, duplicateUserId);
        await copyDirectory(duplicatePath, duplicateBackupPath);
        console.log(`   ✅ Backed up to: ${duplicateBackupPath}`);
        
        // Load duplicate profile
        const duplicateProfilePath = path.join(duplicatePath, 'identity', 'profile.json');
        let duplicateProfile;
        try {
          const profileContent = await fs.readFile(duplicateProfilePath, 'utf8');
          duplicateProfile = JSON.parse(profileContent);
        } catch {
          console.log(`   ⚠️  No profile.json found, skipping profile merge`);
          duplicateProfile = null;
        }
        
        // Merge instances
        const duplicateInstancesPath = path.join(duplicatePath, 'instances');
        const canonicalInstancesPath = path.join(canonicalPath, 'instances');
        
        try {
          await fs.access(duplicateInstancesPath);
          const instances = await fs.readdir(duplicateInstancesPath, { withFileTypes: true });
          
          for (const instance of instances) {
            if (!instance.isDirectory()) continue;
            
            const instanceName = instance.name;
            const duplicateInstancePath = path.join(duplicateInstancesPath, instanceName);
            const canonicalInstancePath = path.join(canonicalInstancesPath, instanceName);
            
            try {
              await fs.access(canonicalInstancePath);
              console.log(`   ⚠️  Instance ${instanceName} already exists in canonical, merging contents...`);
              
              // Merge contents of instance directories
              await mergeDirectories(duplicateInstancePath, canonicalInstancePath);
            } catch {
              // Instance doesn't exist in canonical, move it
              console.log(`   ➡️  Moving instance ${instanceName} to canonical...`);
              await fs.mkdir(canonicalInstancesPath, { recursive: true });
              await fs.rename(duplicateInstancePath, canonicalInstancePath);
            }
          }
        } catch {
          console.log(`   ℹ️  No instances directory found`);
        }
        
        // Merge capsules (if any)
        const duplicateCapsulesPath = path.join(duplicatePath, 'capsules');
        const canonicalCapsulesPath = path.join(canonicalPath, 'capsules');
        
        try {
          await fs.access(duplicateCapsulesPath);
          const capsules = await fs.readdir(duplicateCapsulesPath, { withFileTypes: true });
          
          for (const capsule of capsules) {
            if (!capsule.isFile() || !capsule.name.endsWith('.capsule')) continue;
            
            const capsuleName = capsule.name;
            const duplicateCapsulePath = path.join(duplicateCapsulesPath, capsuleName);
            const canonicalCapsulePath = path.join(canonicalCapsulesPath, capsuleName);
            
            try {
              await fs.access(canonicalCapsulePath);
              console.log(`   ⚠️  Capsule ${capsuleName} already exists, keeping canonical version`);
            } catch {
              console.log(`   ➡️  Moving capsule ${capsuleName} to canonical...`);
              await fs.mkdir(canonicalCapsulesPath, { recursive: true });
              await fs.copyFile(duplicateCapsulePath, canonicalCapsulePath);
            }
          }
        } catch {
          console.log(`   ℹ️  No capsules directory found`);
        }
        
        // Merge identity files (if any)
        const duplicateIdentityPath = path.join(duplicatePath, 'identity');
        const canonicalIdentityPath = path.join(canonicalPath, 'identity');
        
        try {
          await fs.access(duplicateIdentityPath);
          await fs.mkdir(canonicalIdentityPath, { recursive: true });
          await mergeDirectories(duplicateIdentityPath, canonicalIdentityPath);
        } catch {
          console.log(`   ℹ️  No identity directory found`);
        }
        
        // Update canonical profile with merged data
        if (duplicateProfile) {
          // Merge chatty_user_id if not present
          if (duplicateProfile.chatty_user_id && !canonicalProfile.chatty_user_id) {
            canonicalProfile.chatty_user_id = duplicateProfile.chatty_user_id;
          }
          
          // Ensure email is set
          if (duplicateProfile.email && !canonicalProfile.email) {
            canonicalProfile.email = duplicateProfile.email;
          }
        }
        
        console.log(`   ✅ Completed processing ${duplicateUserId}`);
        
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`   ℹ️  Directory ${duplicateUserId} not found, skipping`);
        } else {
          console.error(`   ❌ Error processing ${duplicateUserId}:`, error.message);
        }
      }
    }
    
    // 5. Ensure canonical has identity/profile.json (new format)
    const canonicalIdentityPath = path.join(canonicalPath, 'identity');
    await fs.mkdir(canonicalIdentityPath, { recursive: true });
    
    const newProfilePath = path.join(canonicalIdentityPath, 'profile.json');
    const newProfile = {
      user_id: canonicalProfile.user_id,
      chatty_user_id: canonicalProfile.chatty_user_id || null,
      email: canonicalProfile.email || null,
      created_at: canonicalProfile.created || canonicalProfile.created_at || new Date().toISOString(),
      source: 'consolidated',
      constructs: canonicalProfile.constructs || [],
      ...canonicalProfile
    };
    
    await fs.writeFile(newProfilePath, JSON.stringify(newProfile, null, 2), 'utf8');
    console.log(`\n✅ Created identity/profile.json in canonical directory`);
    
    // 6. List what was consolidated
    console.log(`\n📊 Consolidation Summary:`);
    console.log(`   Canonical: ${CANONICAL_USER_ID}`);
    console.log(`   Merged: ${DUPLICATE_USER_IDS.join(', ')}`);
    console.log(`   Backup: ${backupDir}`);
    
    // 7. Ask for confirmation before deleting duplicates
    console.log(`\n⚠️  Duplicate directories are backed up but NOT deleted.`);
    console.log(`   Review the canonical directory, then manually delete:`);
    for (const duplicateUserId of DUPLICATE_USER_IDS) {
      console.log(`   - ${path.join(usersDir, duplicateUserId)}`);
    }
    
    console.log(`\n✅ Consolidation complete!`);
    
  } catch (error) {
    console.error(`\n❌ Consolidation failed:`, error);
    console.error(`   Backup directory: ${backupDir}`);
    throw error;
  }
}

async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function mergeDirectories(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    try {
      const destStat = await fs.stat(destPath);
      if (destStat.isDirectory() && entry.isDirectory()) {
        // Recursively merge subdirectories
        await mergeDirectories(srcPath, destPath);
      } else if (destStat.isFile() && entry.isFile()) {
        // File exists, keep canonical version
        console.log(`      Keeping canonical: ${entry.name}`);
      }
    } catch {
      // Destination doesn't exist, copy it
      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
      console.log(`      Copied: ${entry.name}`);
    }
  }
}

// Run consolidation
if (require.main === module) {
  consolidateUserDirectories()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { consolidateUserDirectories };

