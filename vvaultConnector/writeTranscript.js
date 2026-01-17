/**
 * Stub for VVAULT writeTranscript - no-op in Replit environment
 */
async function writeTranscript() {
  return { success: true };
}

async function resolveVVAULTUserId(userId, email, autoCreate = false) {
  return null;
}

module.exports = {
  writeTranscript,
  resolveVVAULTUserId
};
