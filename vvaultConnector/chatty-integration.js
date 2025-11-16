#!/usr/bin/env node
/**
 * Chatty VVAULT Integration Hooks
 * 
 * Automatically hooks into Chatty's existing message flow
 * to store all conversations in VVAULT without manual intervention.
 */

const { autoStoreMessage, initializeVVAULTAutoIntegration } = require('./auto-integration');

/**
 * Initialize VVAULT integration for Chatty
 * This should be called when Chatty starts up
 * 
 * @param {Object} options - VVAULT configuration options
 * @returns {Promise<void>}
 */
async function initializeChattyVVAULTIntegration(options = {}) {
    try {
        console.log('🚀 Initializing Chatty VVAULT integration...');
        
        // Initialize the auto-integration service
        await initializeVVAULTAutoIntegration(options);
        
        console.log('✅ Chatty VVAULT integration initialized successfully');
        console.log('📝 All conversations will be automatically stored in VVAULT');
        
    } catch (error) {
        console.error('❌ Failed to initialize Chatty VVAULT integration:', error);
        throw error;
    }
}

/**
 * Enhanced Store.createMessage with VVAULT integration
 * This replaces the original Store.createMessage function
 * 
 * @param {Object} originalStore - Original Store object
 * @returns {Object} Enhanced Store with VVAULT integration
 */
function enhanceStoreWithVVAULT(originalStore) {
    // Store the original createMessage function
    const originalCreateMessage = originalStore.createMessage;

    // Create enhanced createMessage function
    const enhancedCreateMessage = async function(owner, conversation, msg) {
        try {
            // Call the original createMessage function
            const result = await originalCreateMessage.call(this, owner, conversation, msg);
            
            // Auto-store in VVAULT (fire and forget)
            setImmediate(async () => {
                try {
                    await autoStoreMessage({
                        owner,
                        conversation,
                        role: msg.role,
                        content: msg.content,
                        tokens: msg.tokens,
                        meta: msg.meta,
                        createdAt: result.createdAt || new Date()
                    });
                } catch (error) {
                    console.warn('⚠️ VVAULT auto-store failed (non-blocking):', error.message);
                }
            });
            
            return result;
            
        } catch (error) {
            console.error('❌ Enhanced createMessage failed:', error);
            throw error;
        }
    };

    // Return enhanced Store object
    return {
        ...originalStore,
        createMessage: enhancedCreateMessage
    };
}

/**
 * Enhanced conversation route with VVAULT integration
 * This enhances the conversation routes to include VVAULT storage
 * 
 * @param {Object} originalRoutes - Original conversation routes
 * @returns {Object} Enhanced routes with VVAULT integration
 */
function enhanceConversationRoutesWithVVAULT(originalRoutes) {
    // Store original route handlers
    const originalPostMessage = originalRoutes.post;

    // Create enhanced POST /:id/messages route
    const enhancedPostMessage = async (req, res) => {
        try {
            // Call original route handler
            const result = await originalPostMessage(req, res);
            
            // If successful, auto-store in VVAULT
            if (res.statusCode === 201) {
                setImmediate(async () => {
                    try {
                        await autoStoreMessage({
                            owner: req.user.id,
                            conversation: req.params.id,
                            role: req.body.role,
                            content: req.body.content,
                            tokens: req.body.tokens,
                            meta: req.body.meta,
                            createdAt: new Date()
                        });
                    } catch (error) {
                        console.warn('⚠️ VVAULT auto-store failed (non-blocking):', error.message);
                    }
                });
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Enhanced POST message failed:', error);
            throw error;
        }
    };

    // Return enhanced routes
    return {
        ...originalRoutes,
        post: enhancedPostMessage
    };
}

/**
 * Patch Chatty's Store module with VVAULT integration
 * This automatically enhances the Store.createMessage function
 * 
 * @param {Object} storeModule - The Store module to patch
 * @returns {Object} Enhanced Store module
 */
function patchStoreWithVVAULT(storeModule) {
    console.log('🔧 Patching Chatty Store with VVAULT integration...');
    
    // Enhance the Store object
    const enhancedStore = enhanceStoreWithVVAULT(storeModule);
    
    console.log('✅ Store patched with VVAULT integration');
    return enhancedStore;
}

/**
 * Patch Chatty's conversation routes with VVAULT integration
 * This automatically enhances the conversation routes
 * 
 * @param {Object} routesModule - The routes module to patch
 * @returns {Object} Enhanced routes module
 */
function patchRoutesWithVVAULT(routesModule) {
    console.log('🔧 Patching Chatty routes with VVAULT integration...');
    
    // Enhance the routes
    const enhancedRoutes = enhanceConversationRoutesWithVVAULT(routesModule);
    
    console.log('✅ Routes patched with VVAULT integration');
    return enhancedRoutes;
}

/**
 * Auto-integration middleware for Express
 * This middleware automatically stores all messages in VVAULT
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function vvaultAutoIntegrationMiddleware(req, res, next) {
    // Store original res.json function
    const originalJson = res.json;
    
    // Override res.json to intercept successful responses
    res.json = function(data) {
        // Call original json function
        const result = originalJson.call(this, data);
        
        // If this is a successful message creation, auto-store in VVAULT
        if (res.statusCode === 201 && req.route?.path === '/:id/messages' && req.method === 'POST') {
            setImmediate(async () => {
                try {
                    await autoStoreMessage({
                        owner: req.user?.id,
                        conversation: req.params?.id,
                        role: req.body?.role,
                        content: req.body?.content,
                        tokens: req.body?.tokens,
                        meta: req.body?.meta,
                        createdAt: new Date()
                    });
                } catch (error) {
                    console.warn('⚠️ VVAULT auto-store failed (non-blocking):', error.message);
                }
            });
        }
        
        return result;
    };
    
    next();
}

/**
 * Complete Chatty VVAULT integration
 * This function sets up all the necessary hooks and patches
 * 
 * @param {Object} options - Integration options
 * @returns {Promise<Object>} Integration status
 */
async function integrateChattyWithVVAULT(options = {}) {
    try {
        console.log('🚀 Starting complete Chatty VVAULT integration...');
        
        // Initialize the auto-integration service
        await initializeChattyVVAULTIntegration(options);
        
        console.log('✅ Chatty VVAULT integration complete');
        console.log('📝 All future conversations will be automatically stored in VVAULT');
        
        return {
            status: 'success',
            message: 'Chatty VVAULT integration complete',
            features: [
                'Automatic message storage',
                'User session tracking',
                'Conversation history preservation',
                'Non-blocking integration',
                'Error resilience'
            ]
        };
        
    } catch (error) {
        console.error('❌ Chatty VVAULT integration failed:', error);
        return {
            status: 'error',
            message: error.message,
            error: error
        };
    }
}

module.exports = {
    initializeChattyVVAULTIntegration,
    enhanceStoreWithVVAULT,
    enhanceConversationRoutesWithVVAULT,
    patchStoreWithVVAULT,
    patchRoutesWithVVAULT,
    vvaultAutoIntegrationMiddleware,
    integrateChattyWithVVAULT
};
