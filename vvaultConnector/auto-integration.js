#!/usr/bin/env node
/**
 * VVAULT Auto-Integration for Chatty
 * 
 * Automatically hooks into Chatty's existing conversation flow
 * to store all messages in VVAULT without manual intervention.
 */

const { VVAULTConnector } = require('./index');

/**
 * VVAULT Auto-Integration Service
 * 
 * Automatically intercepts and stores all Chatty conversations
 * in VVAULT without requiring manual calls.
 */
class VVAULTAutoIntegration {
    constructor(options = {}) {
        this.connector = new VVAULTConnector(options);
        this.initialized = false;
        this.messageQueue = new Map(); // Track pending messages
    }

    /**
     * Initialize the auto-integration service
     */
    async initialize() {
        if (!this.initialized) {
            await this.connector.initialize();
            this.initialized = true;
            console.log('✅ VVAULT Auto-Integration initialized');
        }
    }

    /**
     * Auto-store message in VVAULT
     * This is called automatically by the integration hooks
     * 
     * @param {Object} messageData - Message data from Chatty
     * @param {string} messageData.owner - User ID
     * @param {string} messageData.conversation - Conversation ID
     * @param {string} messageData.role - Message role
     * @param {string} messageData.content - Message content
     * @param {Object} [messageData.meta] - Additional metadata
     * @param {Date} [messageData.createdAt] - Creation timestamp
     */
    async autoStoreMessage(messageData) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // Extract user and session info
            const userId = messageData.owner;
            const sessionId = messageData.conversation;
            const role = messageData.role;
            const content = messageData.content;
            const timestamp = messageData.createdAt || new Date();

            // Create unique message key for deduplication
            const messageKey = `${userId}_${sessionId}_${role}_${timestamp.getTime()}_${content.substring(0, 50)}`;
            
            // Check if we've already processed this message
            if (this.messageQueue.has(messageKey)) {
                console.log(`🔄 Message already queued: ${messageKey}`);
                return;
            }

            // Add to processing queue
            this.messageQueue.set(messageKey, true);

            // Store in VVAULT
            const result = await this.connector.writeTranscript({
                userId,
                sessionId,
                timestamp: timestamp.toISOString(),
                role,
                content,
                emotionScores: messageData.meta?.emotionScores || null
            });

            console.log(`📝 Auto-stored ${role} message in VVAULT: ${result.filePath}`);

            // Remove from queue after successful storage
            this.messageQueue.delete(messageKey);

            return result;

        } catch (error) {
            console.error('❌ Auto-store failed:', error);
            // Remove from queue on error to allow retry
            const messageKey = `${messageData.owner}_${messageData.conversation}_${messageData.role}_${(messageData.createdAt || new Date()).getTime()}_${messageData.content.substring(0, 50)}`;
            this.messageQueue.delete(messageKey);
            throw error;
        }
    }

    /**
     * Get user's VVAULT memories
     * 
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} User memories
     */
    async getUserMemories(userId, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            return await this.connector.readMemories(userId, options);
        } catch (error) {
            console.error('❌ Failed to get user memories:', error);
            throw error;
        }
    }

    /**
     * Get session transcripts from VVAULT
     * 
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID
     * @returns {Promise<Array>} Session transcripts
     */
    async getSessionTranscripts(userId, sessionId) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            return await this.connector.getSessionTranscripts(userId, sessionId);
        } catch (error) {
            console.error('❌ Failed to get session transcripts:', error);
            throw error;
        }
    }

    /**
     * Health check
     * 
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            return await this.connector.healthCheck();
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }
}

// Global instance for auto-integration
let vvaultAutoIntegration = null;

/**
 * Initialize VVAULT auto-integration
 * 
 * @param {Object} options - Configuration options
 * @returns {Promise<VVAULTAutoIntegration>} Initialized service
 */
async function initializeVVAULTAutoIntegration(options = {}) {
    if (!vvaultAutoIntegration) {
        vvaultAutoIntegration = new VVAULTAutoIntegration(options);
        await vvaultAutoIntegration.initialize();
    }
    return vvaultAutoIntegration;
}

/**
 * Get the global VVAULT auto-integration instance
 * 
 * @returns {VVAULTAutoIntegration|null} Global instance
 */
function getVVAULTAutoIntegration() {
    return vvaultAutoIntegration;
}

/**
 * Auto-store a message (called by integration hooks)
 * 
 * @param {Object} messageData - Message data
 * @returns {Promise<Object>} Store result
 */
async function autoStoreMessage(messageData) {
    const service = getVVAULTAutoIntegration();
    if (!service) {
        console.warn('⚠️ VVAULT auto-integration not initialized');
        return null;
    }
    return await service.autoStoreMessage(messageData);
}

module.exports = {
    VVAULTAutoIntegration,
    initializeVVAULTAutoIntegration,
    getVVAULTAutoIntegration,
    autoStoreMessage
};
