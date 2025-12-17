#!/usr/bin/env node
/**
 * Test User Creation System
 * Creates temporary test users for testing account creation features
 * without repeatedly deleting your main account
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { FileManagementAutomation } from '../server/lib/fileManagementAutomation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get VVAULT root from environment or use default
const VVAULT_ROOT = process.env.VVAULT_ROOT || path.join(__dirname, '..', '..', 'vvault');

/**
 * Create a test user with all default files
 */
async function createTestUser(testUserId = null) {
  const timestamp = Date.now();
  const userId = testUserId || `test_user_${timestamp}`;
  
  // Calculate shard
  const crypto = await import('crypto');
  const hash = crypto.createHash('md5').update(userId).digest('hex');
  const hashInt = parseInt(hash.substring(0, 8), 16);
  const shardNum = hashInt % 10000;
  const shard = `shard_${String(shardNum).padStart(4, '0')}`;

  console.log(`\n🧪 Creating test user: ${userId}`);
  console.log(`📦 Shard: ${shard}`);

  const fileManager = new FileManagementAutomation(userId, shard);

  try {
    // Ensure all account creation files exist
    await fileManager.ensureAccountCreationFiles();
    
    console.log(`\n✅ Test user created successfully!`);
    console.log(`📁 Location: ${path.join(VVAULT_ROOT, 'users', shard, userId)}`);
    console.log(`\n💡 To use this test user, set VVAULT_TEST_USER_ID=${userId}`);
    
    return { userId, shard, path: path.join(VVAULT_ROOT, 'users', shard, userId) };
  } catch (error) {
    console.error(`\n❌ Error creating test user: ${error.message}`);
    throw error;
  }
}

/**
 * List all test users
 */
async function listTestUsers() {
  const usersPath = path.join(VVAULT_ROOT, 'users');
  
  try {
    const shards = await fs.readdir(usersPath);
    const testUsers = [];

    for (const shard of shards) {
      if (!shard.startsWith('shard_')) continue;
      
      const shardPath = path.join(usersPath, shard);
      const users = await fs.readdir(shardPath);

      for (const user of users) {
        if (user.startsWith('test_user_')) {
          const userPath = path.join(shardPath, user);
          const stats = await fs.stat(userPath);
          
          testUsers.push({
            userId: user,
            shard,
            path: userPath,
            created: stats.birthtime
          });
        }
      }
    }

    return testUsers;
  } catch (error) {
    console.error(`Error listing test users: ${error.message}`);
    return [];
  }
}

/**
 * Delete a test user
 */
async function deleteTestUser(userId, shard) {
  const userPath = path.join(VVAULT_ROOT, 'users', shard, userId);
  
  try {
    await fs.rm(userPath, { recursive: true, force: true });
    console.log(`✅ Deleted test user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error deleting test user: ${error.message}`);
    return false;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  switch (command) {
    case 'create':
      const testUserId = process.argv[3] || null;
      createTestUser(testUserId)
        .then(() => process.exit(0))
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
      break;

    case 'list':
      listTestUsers()
        .then((users) => {
          if (users.length === 0) {
            console.log('\n📭 No test users found');
          } else {
            console.log(`\n📋 Found ${users.length} test user(s):\n`);
            users.forEach((user, index) => {
              console.log(`${index + 1}. ${user.userId}`);
              console.log(`   Shard: ${user.shard}`);
              console.log(`   Created: ${user.created.toISOString()}\n`);
            });
          }
          process.exit(0);
        })
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
      break;

    case 'delete':
      const userIdToDelete = process.argv[3];
      const shardToDelete = process.argv[4];
      
      if (!userIdToDelete || !shardToDelete) {
        console.error('Usage: createTestUser.js delete <userId> <shard>');
        process.exit(1);
      }
      
      deleteTestUser(userIdToDelete, shardToDelete)
        .then(() => process.exit(0))
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
      break;

    default:
      console.log(`
🧪 Test User Creation System

Usage:
  node createTestUser.js create [userId]    Create a new test user
  node createTestUser.js list               List all test users
  node createTestUser.js delete <userId> <shard>  Delete a test user

Examples:
  node createTestUser.js create
  node createTestUser.js create my_test_user_123
  node createTestUser.js list
  node createTestUser.js delete test_user_1234567890 shard_0000
`);
      process.exit(0);
  }
}

export { createTestUser, listTestUsers, deleteTestUser };

