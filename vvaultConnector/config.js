/**
 * VVAULT Config stub for Replit environment.
 */
export const VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || process.env.VVAULT_PATH || null;

export function getBasePath() { return process.env.VVAULT_PATH || null; }
export function getShard() { return process.env.VVAULT_SHARD || null; }
export function getUserId() { return process.env.VVAULT_USER_ID || null; }
export function isAvailable() { return false; }
