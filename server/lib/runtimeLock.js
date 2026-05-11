/**
 * Runtime lock for VVAULT modify/hydrate operations.
 * When locked, VVAULT write paths must treat state as read-only (return 503).
 * Lock is external: set via env VVAULT_RUNTIME_LOCK=1 or optional sentinel file.
 */

import fs from 'fs/promises';
import path from 'path';

const LOCK_ENV = process.env.VVAULT_RUNTIME_LOCK;
const VVAULT_RUNTIME_PATH = process.env.VVAULT_RUNTIME_PATH;
const SENTINEL_FILENAME = '.lock';

/**
 * @returns {boolean} true if runtime is locked (writes should be disabled)
 */
export function isLocked() {
  if (LOCK_ENV === '1' || (LOCK_ENV && String(LOCK_ENV).toLowerCase() !== 'false')) {
    return true;
  }
  return false;
}

let sentinelChecked = false;
let sentinelLocked = false;

/**
 * Check optional sentinel file under VVAULT_RUNTIME_PATH.
 * Only checks once per process (cached) unless clearSentinelCache() is used.
 * @returns {Promise<boolean>}
 */
async function isSentinelLocked() {
  if (!VVAULT_RUNTIME_PATH) return false;
  if (sentinelChecked) return sentinelLocked;
  try {
    const sentinelPath = path.join(VVAULT_RUNTIME_PATH, SENTINEL_FILENAME);
    await fs.access(sentinelPath);
    sentinelLocked = true;
  } catch {
    sentinelLocked = false;
  }
  sentinelChecked = true;
  return sentinelLocked;
}

/**
 * @returns {Promise<boolean>} true if runtime is locked (env or sentinel file)
 */
export async function isLockedAsync() {
  if (isLocked()) return true;
  return await isSentinelLocked();
}

/**
 * If locked, throws with message suitable for 503 response.
 * Call before any VVAULT write or hydrate that writes.
 * @returns {Promise<void>}
 * @throws {Error} when locked
 */
export async function assertNotLocked() {
  if (isLocked()) {
    throw new Error('VVAULT runtime is locked; writes are disabled.');
  }
  if (await isSentinelLocked()) {
    throw new Error('VVAULT runtime is locked (sentinel file); writes are disabled.');
  }
}

/**
 * Synchronous check for use in route handlers that prefer not to await.
 * Returns { allowed, reason } when locked; { allowed: true } when not locked.
 * Does not check sentinel file (async only).
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function assertNotLockedSync() {
  if (isLocked()) {
    return { allowed: false, reason: 'VVAULT runtime is locked; writes are disabled.' };
  }
  return { allowed: true };
}
