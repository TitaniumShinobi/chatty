/**
 * VVAULT Connector stub for Replit environment.
 * Returns empty/no-op implementations when VVAULT is not available.
 */

const readConversations = require('./readConversations.js');
const readMemories = require('./readMemories.js');
const readCharacterProfile = require('./readCharacterProfile.js');
const writeTranscript = require('./writeTranscript.js');

module.exports = {
  readConversations,
  readMemories,
  readCharacterProfile,
  writeTranscript,
  isAvailable: () => false,
  getBasePath: () => null
};
