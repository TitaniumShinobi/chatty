import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Calculate shard for a user based on sequential assignment
 * @param {string} userId - User ID
 * @param {number} totalUsers - Total number of users in registry
 * @returns {string} Shard name (e.g., "shard_0000")
 */
export function getUserShard(userId, totalUsers = 0) {
  // Sequential assignment: User 1 → shard_0000, User 2 → shard_0001, etc.
  // Each shard can hold multiple users, but we'll assign sequentially for simplicity
  const shardNumber = Math.floor(totalUsers / 100); // 100 users per shard
  return `shard_${String(shardNumber).padStart(4, '0')}`;
}

/**
 * Ensure user directory structure exists
 * @param {string} userId - User ID
 * @param {string} shard - Shard name (e.g., "shard_0000")
 * @returns {Promise<string>} Path to user directory
 */
export async function ensureUserDirectory(userId, shard) {
  const userDir = path.join(PROJECT_ROOT, 'users', shard, userId);
  
  // Create directory structure
  await fs.mkdir(userDir, { recursive: true });
  await fs.mkdir(path.join(userDir, 'identity'), { recursive: true });
  await fs.mkdir(path.join(userDir, 'prompts', 'customAI'), { recursive: true });
  await fs.mkdir(path.join(userDir, 'preferences'), { recursive: true });
  await fs.mkdir(path.join(userDir, 'cache'), { recursive: true });
  
  return userDir;
}

/**
 * Get path to user's directory or subdirectory
 * @param {string} userId - User ID
 * @param {string} shard - Shard name
 * @param {...string} subpath - Optional subdirectory path segments
 * @returns {string} Full path
 */
export function getUserPath(userId, shard, ...subpath) {
  const userDir = path.join(PROJECT_ROOT, 'users', shard, userId);
  if (subpath.length === 0) {
    return userDir;
  }
  return path.join(userDir, ...subpath);
}

/**
 * Get path to user's prompts/customAI directory
 * @param {string} userId - User ID
 * @param {string} shard - Shard name
 * @returns {string} Path to prompts/customAI directory
 */
export function getUserPersonaPath(userId, shard) {
  return getUserPath(userId, shard, 'prompts', 'customAI');
}


