#!/usr/bin/env node
/**
 * Weekly Capsule Update System
 * Updates all capsule metadata and performs maintenance
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { FileManagementAutomation } from '../server/lib/fileManagementAutomation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VVAULT_ROOT = process.env.VVAULT_ROOT || path.join(__dirname, '..', '..', 'vvault');

/**
 * Update capsules for a specific user
 */
async function updateUserCapsules(vvaultUserId, shard) {
  const fileManager = new FileManagementAutomation(vvaultUserId, shard);
  const results = await fileManager.updateAllCapsules();
  
  return {
    userId: vvaultUserId,
    shard,
    results,
    success: results.every(r => r.updated),
    total: results.length,
    updated: results.filter(r => r.updated).length
  };
}

/**
 * Update capsules for all users in a shard
 */
async function updateShardCapsules(shard) {
  const shardPath = path.join(VVAULT_ROOT, 'users', shard);
  
  try {
    const users = await fs.readdir(shardPath);
    const results = [];

    for (const user of users) {
      // Skip non-user directories
      if (user.startsWith('.') || user === 'archive_') continue;
      
      try {
        const userResult = await updateUserCapsules(user, shard);
        results.push(userResult);
      } catch (error) {
        console.error(`Error updating capsules for ${user}: ${error.message}`);
        results.push({
          userId: user,
          shard,
          error: error.message,
          success: false
        });
      }
    }

    return results;
  } catch (error) {
    console.error(`Error reading shard ${shard}: ${error.message}`);
    return [];
  }
}

/**
 * Update capsules for all users (all shards)
 */
async function updateAllCapsules() {
  const usersPath = path.join(VVAULT_ROOT, 'users');
  
  try {
    const shards = await fs.readdir(usersPath);
    const allResults = [];

    for (const shard of shards) {
      if (!shard.startsWith('shard_')) continue;
      
      console.log(`\n📦 Processing shard: ${shard}`);
      const shardResults = await updateShardCapsules(shard);
      allResults.push(...shardResults);
    }

    return allResults;
  } catch (error) {
    console.error(`Error reading users directory: ${error.message}`);
    return [];
  }
}

/**
 * Generate update report
 */
function generateReport(results) {
  const total = results.length;
  const successful = results.filter(r => r.success).length;
  const failed = total - successful;
  
  let totalCapsules = 0;
  let totalUpdated = 0;
  
  results.forEach(r => {
    if (r.total) {
      totalCapsules += r.total;
      totalUpdated += r.updated || 0;
    }
  });

  return {
    summary: {
      usersProcessed: total,
      usersSuccessful: successful,
      usersFailed: failed,
      totalCapsules,
      totalUpdated
    },
    details: results
  };
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const target = process.argv[3];

  (async () => {
    try {
      let results;

      switch (command) {
        case 'user':
          if (!target) {
            console.error('Usage: weeklyCapsuleUpdate.js user <userId> [shard]');
            process.exit(1);
          }
          const shard = process.argv[4] || 'shard_0000';
          results = [await updateUserCapsules(target, shard)];
          break;

        case 'shard':
          if (!target) {
            console.error('Usage: weeklyCapsuleUpdate.js shard <shard>');
            process.exit(1);
          }
          results = await updateShardCapsules(target);
          break;

        case 'all':
          console.log('🔄 Updating capsules for all users...\n');
          results = await updateAllCapsules();
          break;

        default:
          console.log(`
🔄 Weekly Capsule Update System

Usage:
  node weeklyCapsuleUpdate.js user <userId> [shard]  Update capsules for one user
  node weeklyCapsuleUpdate.js shard <shard>          Update capsules for one shard
  node weeklyCapsuleUpdate.js all                     Update capsules for all users

Examples:
  node weeklyCapsuleUpdate.js user devon_woodson_1762969514958 shard_0000
  node weeklyCapsuleUpdate.js shard shard_0000
  node weeklyCapsuleUpdate.js all
`);
          process.exit(0);
      }

      const report = generateReport(results);
      
      console.log('\n📊 Update Report:');
      console.log(`   Users Processed: ${report.summary.usersProcessed}`);
      console.log(`   Users Successful: ${report.summary.usersSuccessful}`);
      console.log(`   Users Failed: ${report.summary.usersFailed}`);
      console.log(`   Total Capsules: ${report.summary.totalCapsules}`);
      console.log(`   Total Updated: ${report.summary.totalUpdated}`);

      if (report.details.length > 0) {
        console.log('\n📋 Details:');
        report.details.forEach((detail, index) => {
          if (detail.error) {
            console.log(`   ${index + 1}. ${detail.userId} (${detail.shard}): ❌ ${detail.error}`);
          } else {
            console.log(`   ${index + 1}. ${detail.userId} (${detail.shard}): ✅ ${detail.updated}/${detail.total} capsules updated`);
          }
        });
      }

      process.exit(0);
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}

export { updateUserCapsules, updateShardCapsules, updateAllCapsules };

