/**
 * VVAULT Connector stub for Replit environment.
 * Returns empty/no-op implementations when VVAULT is not available.
 */
import { getBasePath, isAvailable } from './config.js';
import { readCharacterProfile } from './readCharacterProfile.js';
import { readConversations } from './readConversations.js';
import { readMemories } from './readMemories.js';
import { writeTranscript } from './writeTranscript.js';

export class VVAULTConnector {
  async initialize() {}

  isAvailable() {
    return isAvailable();
  }

  getBasePath() {
    return getBasePath();
  }

  async readConversations(userId, constructId) {
    return readConversations(userId, constructId);
  }

  async readMemories(userId, options) {
    return readMemories(userId, options);
  }

  async readCharacterProfile(constructId, callsign) {
    return readCharacterProfile(constructId, callsign);
  }

  async writeTranscript(params) {
    return writeTranscript(params);
  }

  async getUserSessions(userId) {
    const conversations = await readConversations(userId);
    return conversations.map((conversation) => ({
      sessionId: conversation.sessionId,
      title: conversation.title || 'Untitled',
      constructId: conversation.constructId || null,
      constructName: conversation.constructName || null,
      constructCallsign: conversation.constructCallsign || null,
      createdAt: conversation.createdAt || null,
      updatedAt: conversation.updatedAt || null,
    }));
  }

  async getSessionTranscripts(userId, sessionId) {
    const conversations = await readConversations(userId);
    const conversation = conversations.find((entry) => entry.sessionId === sessionId);
    return Array.isArray(conversation?.messages) ? conversation.messages : [];
  }

  async healthCheck() {
    return {
      status: isAvailable() ? 'available' : 'stub',
      basePath: getBasePath(),
    };
  }
}

export {
  readConversations,
  readMemories,
  readCharacterProfile,
  writeTranscript,
  isAvailable,
  getBasePath,
};
