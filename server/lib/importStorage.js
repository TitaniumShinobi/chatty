import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base path for imported data (outside repo, git-safe)
const IMPORT_BASE_PATH = process.env.IMPORT_STORAGE_PATH || 
  path.resolve(__dirname, '../../../user_data_imports');

/**
 * Get storage path for a user's imported runtime data
 * @param {string} userId - User ID (from req.user.sub)
 * @param {string} runtimeId - Runtime ID (GPT ID)
 * @returns {string} Full path to user's import directory
 */
export function getImportPathForUser(userId, runtimeId) {
  return path.join(IMPORT_BASE_PATH, userId, runtimeId);
}

/**
 * Ensure import directory exists
 * @param {string} userId - User ID
 * @param {string} runtimeId - Runtime ID
 */
export async function ensureImportDirectory(userId, runtimeId) {
  const dirPath = getImportPathForUser(userId, runtimeId);
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Get path for a specific imported conversation file
 * @param {string} userId - User ID
 * @param {string} runtimeId - Runtime ID
 * @param {string} callsign - Conversation callsign (from hash)
 * @returns {string} Full file path
 */
export function getImportedConversationPath(userId, runtimeId, callsign) {
  const dir = getImportPathForUser(userId, runtimeId);
  return path.join(dir, `imported_chat_${callsign}.md`);
}

