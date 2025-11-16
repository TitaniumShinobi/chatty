/**
 * User ID Generator for LIFE Software
 * Generates user IDs in format: {{name}}_{{auto_gen_number}}
 * 
 * Format: lowercase_name_timestamp
 * Example: devon_1733875200000
 */

import crypto from 'crypto';

/**
 * Normalize a name for use in user ID
 * - Convert to lowercase
 * - Replace spaces with underscores
 * - Remove special characters (keep only alphanumeric and underscores)
 * - Limit length to 50 characters
 * 
 * @param {string} name - User's name
 * @returns {string} Normalized name
 */
export function normalizeNameForUserId(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Name must be a non-empty string');
  }
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')  // Replace spaces with underscores
    .replace(/[^a-z0-9_]/g, '')  // Remove special characters
    .substring(0, 50);  // Limit length
}

/**
 * Generate a user ID in format: {{name}}_{{auto_gen_number}}
 * 
 * @param {string} name - User's name (e.g., "Devon Woodson")
 * @param {number} [timestamp] - Optional timestamp (defaults to Date.now())
 * @returns {string} User ID in format name_timestamp
 * 
 * @example
 * generateUserId("Devon Woodson") // "devon_woodson_1733875200000"
 * generateUserId("John Doe", 1234567890) // "john_doe_1234567890"
 */
export function generateUserId(name, timestamp = null) {
  const normalizedName = normalizeNameForUserId(name);
  const autoGenNumber = timestamp || Date.now();
  
  return `${normalizedName}_${autoGenNumber}`;
}

/**
 * Generate a user ID with a short hash suffix for extra uniqueness
 * Useful when multiple users might have the same name
 * 
 * @param {string} name - User's name
 * @param {string} [email] - Optional email for additional uniqueness
 * @returns {string} User ID with hash suffix
 * 
 * @example
 * generateUserIdWithHash("Devon Woodson", "devon@example.com")
 * // "devon_woodson_1733875200000_a3f5b2"
 */
export function generateUserIdWithHash(name, email = null) {
  const normalizedName = normalizeNameForUserId(name);
  const timestamp = Date.now();
  
  // Create hash from name + email + timestamp for uniqueness
  const hashInput = `${name}${email || ''}${timestamp}`;
  const hash = crypto.createHash('md5').update(hashInput).digest('hex').substring(0, 8);
  
  return `${normalizedName}_${timestamp}_${hash}`;
}

/**
 * Extract name from a user ID
 * 
 * @param {string} userId - User ID in format name_timestamp
 * @returns {string} Original name (best guess from normalized form)
 * 
 * @example
 * extractNameFromUserId("devon_woodson_1733875200000") // "devon woodson"
 */
export function extractNameFromUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    return null;
  }
  
  // Remove timestamp and hash suffix (everything after last underscore that's numeric/hash)
  const parts = userId.split('_');
  if (parts.length < 2) {
    return userId;
  }
  
  // Remove numeric/hash suffixes
  const nameParts = [];
  for (const part of parts) {
    // If it's all numeric (timestamp) or looks like a hash, stop
    if (/^\d+$/.test(part) || /^[a-f0-9]{8}$/i.test(part)) {
      break;
    }
    nameParts.push(part);
  }
  
  return nameParts.join(' ').replace(/_/g, ' ');
}

