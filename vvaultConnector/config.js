/**
 * VVAULT Config stub for Replit environment.
 */
module.exports = {
  getBasePath: () => process.env.VVAULT_PATH || null,
  getShard: () => process.env.VVAULT_SHARD || null,
  getUserId: () => process.env.VVAULT_USER_ID || null,
  isAvailable: () => false
};
