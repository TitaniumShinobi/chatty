/**
 * VVAULT Config stub for Replit environment.
 */
import os from 'os';
import path from 'path';

function expandHomeDir(input) {
  if (!input || typeof input !== 'string') return input || null;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function normalizeVvaultRoot(input) {
  const expanded = expandHomeDir(input);
  if (!expanded) return null;
  return path.resolve(expanded);
}

export const VVAULT_ROOT = normalizeVvaultRoot(
  process.env.VVAULT_ROOT_PATH || process.env.VVAULT_PATH || null,
);

export function getBasePath() { return VVAULT_ROOT; }
export function getShard() { return process.env.VVAULT_SHARD || null; }
export function getUserId() { return process.env.VVAULT_USER_ID || null; }
export function isAvailable() { return false; }
