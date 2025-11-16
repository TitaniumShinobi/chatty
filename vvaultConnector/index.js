#!/usr/bin/env node
/**
 * VVAULT Connector - Secure AI Memory System Integration
 * 
 * Provides secure, append-only storage for Chatty conversations
 * into VVAULT's structured memory system.
 * 
 * @author Devon Woodson
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Import connector modules
const { appendToConstructTranscript, writeTranscript: legacyWriteTranscript } = require('./writeTranscript');
const readMemories = require('./readMemories');
const { readConversations: readConversationsFromDisk } = require('./readConversations');
const { getConfig, deepMerge } = require('./config');
const baseConfig = getConfig();

/**
 * VVAULT Connector Class
 * 
 * Main interface for integrating Chatty with VVAULT storage system.
 * Ensures all conversations are securely stored with append-only semantics.
 */
class VVAULTConnector {
    constructor(options = {}) {
        const overrides = options || {};
        this.config = deepMerge({ ...baseConfig }, overrides);
        this.initialized = false;
    }

    /**
     * Initialize the VVAULT connector
     * Ensures VVAULT directory structure exists
     */
    async initialize() {
        try {
            // Ensure VVAULT base directory exists
            await fs.mkdir(this.config.vvaultPath, { recursive: true });
            
            // Ensure users directory exists
            const usersPath = path.join(this.config.vvaultPath, 'users');
            await fs.mkdir(usersPath, { recursive: true });
            
            this.initialized = true;
            console.log(`✅ VVAULT Connector initialized at: ${this.config.vvaultPath}`);
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize VVAULT Connector:', error);
            throw error;
        }
    }

    /**
     * Write a conversation transcript to VVAULT
     * 
     * @param {Object} params - Transcript parameters
     * @param {string} params.userId - User identifier
     * @param {string} params.sessionId - Session identifier  
     * @param {string} params.timestamp - ISO timestamp
     * @param {string} params.role - Message role (user/assistant)
     * @param {string} params.content - Message content
     * @param {string} [params.title] - Conversation title (for markdown)
     * @param {string} [params.constructId] - Construct ID (for markdown path)
     * @param {string} [params.constructName] - Construct name (e.g., "Synth")
     * @param {Object} [params.emotionScores] - Optional emotion analysis
     * @returns {Promise<Object>} Write result with file path and metadata
     */
    async writeTranscript(params) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const {
                userId,
                userEmail, // Email for VVAULT user ID resolution
                sessionId,
                role,
                content,
                constructId = 'synth',
                metadata = {}
            } = params || {};

            if (!userId || !sessionId || !role || typeof content !== 'string') {
                throw new Error('Missing required transcript parameters');
            }

            // Pass email through metadata for VVAULT user ID resolution
            const enrichedMetadata = {
                ...metadata,
                userEmail: userEmail || metadata.userEmail || metadata.email
            };

            const result = await legacyWriteTranscript(
                userId,
                sessionId,
                role,
                content,
                constructId,
                enrichedMetadata
            );
            console.log(`📝 Transcript written: ${result}`);
            
            return { success: true, filePath: result };
        } catch (error) {
            console.error('❌ Failed to write transcript:', error);
            throw error;
        }
    }

    /**
     * Read memories from VVAULT
     * 
     * @param {string} userId - User identifier
     * @param {Object} options - Read options
     * @param {number} [options.limit=10] - Maximum number of memories to return
     * @param {string} [options.sessionId] - Optional session filter
     * @returns {Promise<Array>} Array of memory objects
     */
    async readMemories(userId, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const memories = await readMemories(this.config, userId, options);
            console.log(`🧠 Retrieved ${memories.length} memories for user: ${userId}`);
            return memories;
        } catch (error) {
            console.error('❌ Failed to read memories:', error);
            throw error;
        }
    }

    /**
     * Read full conversations from VVAULT storage
     * 
     * @param {string} userId - User identifier
     * @param {string} [constructId='nova-001'] - Construct identifier
     * @returns {Promise<Array>} Array of conversation objects
     */
    async readConversations(userId, constructId = 'nova-001') {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const conversations = await readConversationsFromDisk(userId, constructId);
            console.log(`📚 Retrieved ${conversations.length} conversations for user: ${userId}`);
            return conversations;
        } catch (error) {
            console.error('❌ Failed to read conversations from VVAULT:', error);
            throw error;
        }
    }

    /**
     * Get user's session list
     * 
     * @param {string} userId - User identifier
     * @returns {Promise<Array>} Array of session objects
     */
    async getUserSessions(userId) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const userPath = path.join(this.config.vvaultPath, 'users', userId);
            const transcriptsPath = path.join(userPath, 'transcripts');
            
            // Check if user directory exists
            try {
                await fs.access(transcriptsPath);
            } catch {
                return []; // No sessions found
            }

            const sessions = await fs.readdir(transcriptsPath);
            const sessionList = [];

            for (const sessionId of sessions) {
                const sessionPath = path.join(transcriptsPath, sessionId);
                const stat = await fs.stat(sessionPath);
                
                if (stat.isDirectory()) {
                    // Get session files to determine activity
                    const files = await fs.readdir(sessionPath);
                    const transcriptFiles = files.filter(f => f.endsWith('.txt'));
                    
                    sessionList.push({
                        sessionId,
                        createdAt: stat.birthtime,
                        lastModified: stat.mtime,
                        messageCount: transcriptFiles.length,
                        files: transcriptFiles
                    });
                }
            }

            // Sort by last modified (most recent first)
            sessionList.sort((a, b) => b.lastModified - a.lastModified);
            
            return sessionList;
        } catch (error) {
            console.error('❌ Failed to get user sessions:', error);
            throw error;
        }
    }

    /**
     * Get session transcripts
     * 
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session identifier
     * @returns {Promise<Array>} Array of transcript entries
     */
    async getSessionTranscripts(userId, sessionId) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const sessionPath = path.join(
                this.config.vvaultPath, 
                'users', 
                userId, 
                'transcripts', 
                sessionId
            );

            // Check if session exists
            try {
                await fs.access(sessionPath);
            } catch {
                return []; // Session not found
            }

            const files = await fs.readdir(sessionPath);
            const transcriptFiles = files
                .filter(f => f.endsWith('.txt'))
                .sort(); // Sort by filename (which includes timestamp)

            const transcripts = [];

            for (const filename of transcriptFiles) {
                const filePath = path.join(sessionPath, filename);
                const content = await fs.readFile(filePath, 'utf8');
                
                // Parse filename to extract timestamp and role
                const match = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)_(.+)\.txt$/);
                if (match) {
                    const [, timestamp, role] = match;
                    transcripts.push({
                        timestamp: timestamp.replace(/-/g, ':').replace('T', 'T').replace('Z', 'Z'),
                        role,
                        content: content.trim(),
                        filename
                    });
                }
            }

            return transcripts;
        } catch (error) {
            console.error('❌ Failed to get session transcripts:', error);
            throw error;
        }
    }

    /**
     * Health check for VVAULT connector
     * 
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            // Check if VVAULT directory exists and is writable
            await fs.access(this.config.vvaultPath);
            await fs.writeFile(
                path.join(this.config.vvaultPath, '.health_check'), 
                new Date().toISOString()
            );
            await fs.unlink(path.join(this.config.vvaultPath, '.health_check'));

            return {
                status: 'healthy',
                vvaultPath: this.config.vvaultPath,
                timestamp: new Date().toISOString(),
                initialized: this.initialized
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString(),
                initialized: this.initialized
            };
        }
    }
}

// Export the connector class and convenience functions
module.exports = {
    VVAULTConnector,
    
    // Convenience function to create and initialize connector
    async createConnector(options = {}) {
        const connector = new VVAULTConnector(options);
        await connector.initialize();
        return connector;
    },

    // Direct function exports for simple usage
    writeTranscript: async (params) => {
        const connector = await module.exports.createConnector();
        return await connector.writeTranscript(params);
    },

    readMemories: async (userId, options) => {
        const connector = await module.exports.createConnector();
        return await connector.readMemories(userId, options);
    },

    readConversations: async (userId, constructId) => {
        const connector = await module.exports.createConnector();
        return await connector.readConversations(userId, constructId);
    }
};
