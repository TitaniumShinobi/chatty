/**
 * VVAULT Config stub for Replit environment.
 */
const VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || process.env.VVAULT_PATH || null;

module.exports = {
  VVAULT_ROOT,
  getBasePath: () => process.env.VVAULT_PATH || null,
  getShard: () => process.env.VVAULT_SHARD || null,
  getUserId: () => process.env.VVAULT_USER_ID || null,
  isAvailable: () => false
};
