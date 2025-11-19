#!/usr/bin/env node
/**
 * VVAULT Connector Integration Example for Chatty
 * 
 * This example shows how to integrate the VVAULT connector
 * with Chatty's conversation system to ensure all conversations
 * are securely stored in VVAULT.
 */

const { VVAULTConnector } = require('./index');

/**
 * Chatty VVAULT Integration Service
 * 
 * This service integrates Chatty with VVAULT to ensure
 * all conversations are securely stored.
 */
class ChattyVVAULTService {
    constructor(options = {}) {
        this.connector = new VVAULTConnector(options);
        this.initialized = false;
    }

    /**
     * Initialize the service
     */
    async initialize() {
        if (!this.initialized) {
            await this.connector.initialize();
            this.initialized = true;
            console.log('✅ Chatty VVAULT Service initialized');
        }
    }

    /**
     * Store a user message in VVAULT
     * 
     * @param {Object} message - Message object from Chatty
     * @param {string} message.userId - User identifier
     * @param {string} message.sessionId - Session identifier
     * @param {string} message.content - Message content
     * @param {Object} [message.emotionScores] - Emotion analysis
     */
    async storeUserMessage(message) {
        await this.initialize();

        try {
            const result = await this.connector.writeTranscript({
                userId: message.userId,
                sessionId: message.sessionId,
                timestamp: message.timestamp || new Date().toISOString(),
                role: 'user',
                content: message.content,
                emotionScores: message.emotionScores
            });

            console.log(`📝 User message stored: ${result.filePath}`);
            return result;
        } catch (error) {
            console.error('❌ Failed to store user message:', error);
            throw error;
        }
    }

    /**
     * Store an assistant response in VVAULT
     * 
     * @param {Object} response - Response object from Chatty
     * @param {string} response.userId - User identifier
     * @param {string} response.sessionId - Session identifier
     * @param {string} response.content - Response content
     * @param {Object} [response.metadata] - Additional metadata
     */
    async storeAssistantResponse(response) {
        await this.initialize();

        try {
            const result = await this.connector.writeTranscript({
                userId: response.userId,
                sessionId: response.sessionId,
                timestamp: response.timestamp || new Date().toISOString(),
                role: 'assistant',
                content: response.content,
                emotionScores: response.emotionScores
            });

            console.log(`🤖 Assistant response stored: ${result.filePath}`);
            return result;
        } catch (error) {
            console.error('❌ Failed to store assistant response:', error);
            throw error;
        }
    }

    /**
     * Get user's conversation history from VVAULT
     * 
     * @param {string} userId - User identifier
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Conversation history
     */
    async getUserHistory(userId, options = {}) {
        await this.initialize();

        try {
            const memories = await this.connector.readMemories(userId, {
                limit: options.limit || 50,
                since: options.since,
                until: options.until
            });

            console.log(`🧠 Retrieved ${memories.length} memories for user: ${userId}`);
            return memories;
        } catch (error) {
            console.error('❌ Failed to get user history:', error);
            throw error;
        }
    }

    /**
     * Get session transcripts from VVAULT
     * 
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session identifier
     * @returns {Promise<Array>} Session transcripts
     */
    async getSessionTranscripts(userId, sessionId) {
        await this.initialize();

        try {
            const transcripts = await this.connector.getSessionTranscripts(userId, sessionId);
            console.log(`📜 Retrieved ${transcripts.length} transcripts for session: ${sessionId}`);
            return transcripts;
        } catch (error) {
            console.error('❌ Failed to get session transcripts:', error);
            throw error;
        }
    }

    /**
     * Get user's session list from VVAULT
     * 
     * @param {string} userId - User identifier
     * @returns {Promise<Array>} User sessions
     */
    async getUserSessions(userId) {
        await this.initialize();

        try {
            const sessions = await this.connector.getUserSessions(userId);
            console.log(`📋 Retrieved ${sessions.length} sessions for user: ${userId}`);
            return sessions;
        } catch (error) {
            console.error('❌ Failed to get user sessions:', error);
            throw error;
        }
    }

    /**
     * Health check for the service
     * 
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            const health = await this.connector.healthCheck();
            console.log(`🏥 VVAULT Service health: ${health.status}`);
            return health;
        } catch (error) {
            console.error('❌ Health check failed:', error);
            return { status: 'unhealthy', error: error.message };
        }
    }
}

/**
 * Example usage with Chatty's conversation system
 */
async function exampleUsage() {
    console.log('🚀 Starting Chatty VVAULT Integration Example\n');

    // Create the service
    const vvaultService = new ChattyVVAULTService({
        vvaultPath: process.env.VVAULT_PATH || '../VVAULT'
    });

    try {
        // Initialize the service
        await vvaultService.initialize();

        // Example user and session
        const userId = 'user123';
        const sessionId = 'session456';

        console.log('📝 Storing example conversation...\n');

        // Store user message
        await vvaultService.storeUserMessage({
            userId,
            sessionId,
            content: 'Hello! I need help with my project.',
            emotionScores: { joy: 0.7, anticipation: 0.3 }
        });

        // Store assistant response
        await vvaultService.storeAssistantResponse({
            userId,
            sessionId,
            content: 'Hello! I\'d be happy to help you with your project. What specific aspect would you like assistance with?',
            emotionScores: { joy: 0.8, trust: 0.9 }
        });

        // Store another user message
        await vvaultService.storeUserMessage({
            userId,
            sessionId,
            content: 'I\'m working on a React application and having trouble with state management.',
            emotionScores: { frustration: 0.4, anticipation: 0.6 }
        });

        // Store assistant response
        await vvaultService.storeAssistantResponse({
            userId,
            sessionId,
            content: 'State management in React can be tricky! Are you using hooks, Redux, or another state management solution? I can help you with the specific approach you\'re using.',
            emotionScores: { joy: 0.6, trust: 0.8 }
        });

        console.log('\n📖 Retrieving conversation history...\n');

        // Get user's conversation history
        const history = await vvaultService.getUserHistory(userId, { limit: 10 });
        console.log('📚 User History:');
        history.forEach((memory, index) => {
            console.log(`  ${index + 1}. [${memory.role}] ${memory.timestamp}`);
            console.log(`     ${memory.content.substring(0, 100)}...`);
        });

        console.log('\n📋 Getting user sessions...\n');

        // Get user's sessions
        const sessions = await vvaultService.getUserSessions(userId);
        console.log('📁 User Sessions:');
        sessions.forEach((session, index) => {
            console.log(`  ${index + 1}. ${session.sessionId}`);
            console.log(`     Messages: ${session.messageCount}`);
            console.log(`     Last Modified: ${session.lastModified}`);
        });

        console.log('\n📜 Getting session transcripts...\n');

        // Get session transcripts
        const transcripts = await vvaultService.getSessionTranscripts(userId, sessionId);
        console.log('💬 Session Transcripts:');
        transcripts.forEach((transcript, index) => {
            console.log(`  ${index + 1}. [${transcript.role}] ${transcript.timestamp}`);
            console.log(`     ${transcript.content}`);
        });

        console.log('\n🏥 Health check...\n');

        // Health check
        const health = await vvaultService.healthCheck();
        console.log('Health Status:', health);

        console.log('\n✅ Example completed successfully!');

    } catch (error) {
        console.error('❌ Example failed:', error);
    }
}

/**
 * Integration with Chatty's existing conversation system
 * 
 * This shows how to integrate with Chatty's actual conversation flow
 */
function integrateWithChatty() {
    console.log('🔗 Chatty Integration Guide:\n');

    console.log('1. Add to your Chatty server (server/server.js):');
    console.log(`
const { ChattyVVAULTService } = require('./vvaultConnector/integration-example');

// Initialize VVAULT service
const vvaultService = new ChattyVVAULTService({
    vvaultPath: process.env.VVAULT_PATH || '../VVAULT'
});

// Store user messages
app.post('/api/messages', async (req, res) => {
    try {
        const { userId, sessionId, content } = req.body;
        
        // Store in VVAULT
        await vvaultService.storeUserMessage({
            userId,
            sessionId,
            content,
            timestamp: new Date().toISOString()
        });
        
        // Continue with normal Chatty processing...
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to store message:', error);
        res.status(500).json({ error: 'Failed to store message' });
    }
});
`);

    console.log('\n2. Add to your Chatty frontend (src/lib/conversationAI.ts):');
    console.log(`
// After sending message to AI service
const response = await aiService.sendMessage(message);

// Store assistant response in VVAULT
try {
    await fetch('/api/store-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: user.id,
            sessionId: conversationId,
            content: response.content,
            timestamp: new Date().toISOString()
        })
    });
} catch (error) {
    console.warn('Failed to store response in VVAULT:', error);
}
`);

    console.log('\n3. Environment variables (.env):');
    console.log(`
VVAULT_PATH=/path/to/your/VVAULT
NODE_ENV=production
`);

    console.log('\n4. Package.json dependencies:');
    console.log(`
{
  "dependencies": {
    "fs": "^0.0.1-security"
  }
}
`);
}

// Run example if this file is executed directly
if (require.main === module) {
    exampleUsage()
        .then(() => {
            console.log('\n' + '='.repeat(50));
            integrateWithChatty();
        })
        .catch(console.error);
}

module.exports = {
    ChattyVVAULTService,
    exampleUsage,
    integrateWithChatty
};
