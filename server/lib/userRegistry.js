import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserShard, ensureUserDirectory, getUserPath, getUserPersonaPath } from './shardManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const REGISTRY_FILE = path.join(PROJECT_ROOT, 'users.json');

/**
 * Generate LIFE format user ID (same as VVAULT)
 * Format: {normalized_name}_{timestamp}
 * Example: devon_woodson_1762969514958
 * 
 * @param {string} name - User name (from OAuth)
 * @param {string} email - User email (fallback if name not available)
 * @param {number} timestamp - Optional timestamp (defaults to Date.now())
 * @returns {string} LIFE format user ID
 */
function generateLIFEUserId(name, email = null, timestamp = null) {
  const ts = timestamp || Date.now();
  let userName = 'user';
  
  if (name) {
    // Use OAuth name, normalize to lowercase with underscores
    userName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase().replace(/_+/g, '_').replace(/^_|_$/g, '');
  } else if (email) {
    // Extract name from email (e.g., "devon.woodson@example.com" -> "devon_woodson")
    const emailName = email.split('@')[0].replace(/[^a-z0-9]/gi, '_').toLowerCase();
    if (emailName && emailName.length > 0) {
      userName = emailName;
    }
  }
  
  return `${userName}_${ts}`;
}

/**
 * Load user registry from disk
 * @returns {Promise<Object>} Registry object
 */
async function loadRegistry() {
  try {
    const content = await fs.readFile(REGISTRY_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Registry doesn't exist yet, return empty structure
      return {
        users: {},
        nextUserId: 1,
        totalUsers: 0
      };
    }
    throw error;
  }
}

/**
 * Save user registry to disk
 * @param {Object} registry - Registry object
 */
async function saveRegistry(registry) {
  await fs.mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf8');
}

/**
 * Get or create user in registry
 * CRITICAL: Uses LIFE format user ID (same as VVAULT): {name}_{timestamp}
 * 
 * @param {string} userId - Legacy user ID (MongoDB ObjectId or Google sub) - will be converted to LIFE format
 * @param {string} email - User email
 * @param {string} name - User name
 * @returns {Promise<Object>} User profile with LIFE format user_id
 */
export async function getOrCreateUser(userId, email, name) {
  const registry = await loadRegistry();
  
  // CRITICAL: Generate LIFE format user ID (same as VVAULT)
  // Check if userId is already LIFE format (contains underscore and ends with timestamp)
  let lifeUserId = userId;
  if (!userId.includes('_') || /^[0-9a-fA-F]{24}$/.test(userId) || /^\d+$/.test(userId)) {
    // Not LIFE format - generate it from name/email
    // Try to find existing user by email first (for migration)
    const existingUser = Object.values(registry.users).find(u => u.email === email);
    if (existingUser) {
      lifeUserId = existingUser.user_id; // Use existing LIFE format ID
    } else {
      // Generate new LIFE format ID
      lifeUserId = generateLIFEUserId(name, email);
    }
  }
  
  // Check if user already exists by LIFE format ID
  if (registry.users[lifeUserId]) {
    const user = registry.users[lifeUserId];
    // Update last_seen
    user.last_seen = new Date().toISOString();
    await saveRegistry(registry);
    return user;
  }
  
  // Create new user with LIFE format ID
  const shard = getUserShard(lifeUserId, registry.totalUsers);
  const userProfile = {
    user_id: lifeUserId, // LIFE format: devon_woodson_1762969514958
    email: email || '',
    name: name || '',
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    shard: shard,
    vvault_linked: false,
    vvault_user_id: lifeUserId // Same as user_id (LIFE format)
  };
  
  // Add to registry
  registry.users[lifeUserId] = userProfile;
  registry.totalUsers = Object.keys(registry.users).length;
  await saveRegistry(registry);
  
  // Create user directory structure
  await ensureUserDirectory(lifeUserId, shard);
  
  // Create profile.json
  const profilePath = getUserPath(lifeUserId, shard, 'identity', 'profile.json');
  await fs.writeFile(profilePath, JSON.stringify(userProfile, null, 2), 'utf8');
  
  // Migrate persona files from global location (if they exist)
  try {
    await migratePersonaFilesForUser(lifeUserId, shard);
  } catch (error) {
    // Non-critical - migration will happen on next access
    console.warn(`⚠️ [User Registry] Failed to migrate persona files for ${lifeUserId}:`, error.message);
  }
  
  return userProfile;
}

/**
 * Get user profile from registry
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User profile or null if not found
 */
export async function getUserProfile(userId) {
  const registry = await loadRegistry();
  return registry.users[userId] || null;
}

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated user profile
 */
export async function updateUserProfile(userId, updates) {
  const registry = await loadRegistry();
  
  if (!registry.users[userId]) {
    throw new Error(`User ${userId} not found in registry`);
  }
  
  // Update fields
  const user = registry.users[userId];
  Object.assign(user, updates);
  user.last_seen = new Date().toISOString();
  
  await saveRegistry(registry);
  
  // Update profile.json file
  const profilePath = getUserPath(user.user_id, user.shard, 'identity', 'profile.json');
  await fs.writeFile(profilePath, JSON.stringify(user, null, 2), 'utf8');
  
  return user;
}

/**
 * List all users in registry (for admin)
 * @returns {Promise<Array>} Array of user profiles
 */
export async function listUsers() {
  const registry = await loadRegistry();
  return Object.values(registry.users);
}

/**
 * Initialize user registry on first run
 * @returns {Promise<void>}
 */
export async function initializeUserRegistry() {
  try {
    // Check if registry exists
    const registry = await loadRegistry();
    
    // Ensure users directory exists
    const usersDir = path.join(PROJECT_ROOT, 'users');
    await fs.mkdir(usersDir, { recursive: true });
    
    // Ensure first shard exists
    const shardDir = path.join(usersDir, 'shard_0000');
    await fs.mkdir(shardDir, { recursive: true });
    
    console.log('✅ [User Registry] Initialized user registry');
  } catch (error) {
    console.error('❌ [User Registry] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Get path to user's persona file directory
 * @param {string} userId - User ID
 * @returns {Promise<string>} Path to prompts/customAI directory
 */
export async function getUserPersonaDirectory(userId) {
  const user = await getUserProfile(userId);
  if (!user) {
    throw new Error(`User ${userId} not found in registry`);
  }
  return getUserPersonaPath(userId, user.shard);
}

/**
 * Migrate global persona files to user directory (called during user creation)
 * @param {string} userId - User ID
 * @param {string} shard - Shard name
 * @returns {Promise<void>}
 */
export async function migratePersonaFilesForUser(userId, shard) {
  const path = await import('path');
  const fs = await import('fs/promises');
  const { fileURLToPath } = await import('url');
  const { dirname } = await import('path');
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const PROJECT_ROOT = path.resolve(__dirname, '../..');
  
  const GLOBAL_PERSONA_DIR = path.join(PROJECT_ROOT, 'prompts', 'customAI');
  const PERSONA_FILES = ['katana_lin.md'];
  const personaDir = getUserPersonaPath(userId, shard);
  
  for (const personaFile of PERSONA_FILES) {
    const globalPath = path.join(GLOBAL_PERSONA_DIR, personaFile);
    const userPath = path.join(personaDir, personaFile);
    
    try {
      // Check if global file exists
      await fs.access(globalPath);
      
      // Check if user already has the file
      try {
        await fs.access(userPath);
        // File already exists, skip
        continue;
      } catch {
        // File doesn't exist, copy it
        const content = await fs.readFile(globalPath, 'utf8');
        await fs.writeFile(userPath, content, 'utf8');
        console.log(`✅ [User Registry] Migrated ${personaFile} to user ${userId}`);
      }
    } catch (error) {
      // Global file doesn't exist or other error - skip silently
      // This is expected for new installations
    }
  }
}

