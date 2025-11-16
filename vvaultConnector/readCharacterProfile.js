const fs = require('fs').promises;
const path = require('path');
const { getConfig } = require('./config');

/**
 * Load a construct character profile from VVAULT.
 * Profiles stored at: {vvaultPath}/{constructId}-{callsign}/character.json
 *
 * @param {string} constructId
 * @param {string|number} [callsign=1]
 * @returns {Promise<object|null>}
 */
async function readCharacterProfile(constructId, callsign = 1) {
  if (!constructId) {
    throw new Error('constructId is required to load character profile');
  }

  const config = getConfig();
  const formattedCallsign = String(callsign ?? 1).padStart(3, '0');
  const characterPath = path.join(
    config.vvaultPath,
    `${constructId}-${formattedCallsign}`,
    'character.json'
  );

  try {
    const data = await fs.readFile(characterPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[VVAULT] Character profile not found at ${characterPath}`);
      return null;
    }
    console.error('[VVAULT] Failed to read character profile:', error);
    throw error;
  }
}

module.exports = { readCharacterProfile };
