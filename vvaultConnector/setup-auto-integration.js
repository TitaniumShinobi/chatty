#!/usr/bin/env node
/**
 * VVAULT Auto-Integration Setup for Chatty
 * 
 * This file automatically sets up VVAULT integration when Chatty starts.
 * It hooks into Chatty's existing message flow without requiring
 * any manual intervention or code changes.
 */

const { initializeVVAULTAutoIntegration, autoStoreMessage } = require('./auto-integration');

/**
 * VVAULT Integration Setup
 * 
 * This function sets up automatic VVAULT integration for Chatty.
 * It should be called when Chatty starts up.
 */
async function setupVVAULTAutoIntegration() {
  try {
    console.log('🚀 Setting up VVAULT auto-integration for Chatty...');
    
    // Initialize VVAULT auto-integration
    await initializeVVAULTAutoIntegration({
      vvaultPath: process.env.VVAULT_PATH || '../VVAULT',
      logging: {
        debug: process.env.NODE_ENV === 'development',
        logFileOps: true
      }
    });
    
    // Patch Chatty's Store module
    await patchChattyStore();
    
    // Patch Chatty's conversation routes
    await patchChattyRoutes();
    
    console.log('✅ VVAULT auto-integration setup complete');
    console.log('📝 All Chatty conversations will be automatically stored in VVAULT');
    
    return {
      status: 'success',
      message: 'VVAULT auto-integration setup complete',
      features: [
        'Automatic message storage',
        'User session tracking', 
        'Conversation history preservation',
        'Non-blocking integration',
        'Error resilience'
      ]
    };
    
  } catch (error) {
    console.error('❌ VVAULT auto-integration setup failed:', error);
    return {
      status: 'error',
      message: error.message,
      error: error
    };
  }
}

/**
 * Patch Chatty's Store module to automatically store messages in VVAULT
 */
async function patchChattyStore() {
  try {
    console.log('🔧 Patching Chatty Store module...');
    
    // Import the Store module
    const storeModule = await import('../server/store.js');
    const originalCreateMessage = storeModule.Store.createMessage;
    
    // Create enhanced createMessage function
    storeModule.Store.createMessage = async function(owner, conversation, msg) {
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
    
    console.log('✅ Chatty Store module patched with VVAULT integration');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to patch Chatty Store module:', error);
    return false;
  }
}

/**
 * Patch Chatty's conversation routes to automatically store messages in VVAULT
 */
async function patchChattyRoutes() {
  try {
    console.log('🔧 Patching Chatty conversation routes...');
    
    // Import the conversation routes
    const routesModule = await import('../server/routes/conversations.js');
    const originalRouter = routesModule.default;
    
    // Find the POST /:id/messages route
    const routes = originalRouter.stack;
    const postMessageRoute = routes.find(route => 
      route.route && 
      route.route.path === '/:id/messages' && 
      route.route.methods.post
    );
    
    if (postMessageRoute) {
      // Store original handler
      const originalHandler = postMessageRoute.route.stack[0].handle;
      
      // Create enhanced handler
      const enhancedHandler = async (req, res, next) => {
        try {
          // Call original handler
          await originalHandler(req, res, next);
          
          // If successful, auto-store in VVAULT
          if (res.statusCode === 201) {
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
          
        } catch (error) {
          console.error('❌ Enhanced route handler failed:', error);
          throw error;
        }
      };
      
      // Replace the handler
      postMessageRoute.route.stack[0].handle = enhancedHandler;
      
      console.log('✅ Chatty conversation routes patched with VVAULT integration');
    } else {
      console.warn('⚠️ Could not find POST /:id/messages route to patch');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to patch Chatty routes:', error);
    return false;
  }
}

/**
 * Express middleware for automatic VVAULT integration
 * This middleware can be added to Chatty's Express app
 */
function vvaultAutoIntegrationMiddleware(req, res, next) {
  // Store original res.json function
  const originalJson = res.json;
  
  // Override res.json to intercept successful responses
  res.json = function(data) {
    // Call original json function
    const result = originalJson.call(this, data);
    
    // If this is a successful message creation, auto-store in VVAULT
    if (res.statusCode === 201 && 
        req.route?.path === '/:id/messages' && 
        req.method === 'POST' &&
        req.user?.id &&
        req.params?.id &&
        req.body?.role &&
        req.body?.content) {
      
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
  };
  
  next();
}

/**
 * Initialize VVAULT integration when this module is imported
 * This automatically sets up the integration when Chatty starts
 */
async function initializeVVAULTIntegration() {
  try {
    console.log('🚀 Auto-initializing VVAULT integration...');
    
    // Set up the auto-integration
    const result = await setupVVAULTAutoIntegration();
    
    if (result.status === 'success') {
      console.log('✅ VVAULT integration auto-initialized successfully');
    } else {
      console.error('❌ VVAULT integration auto-initialization failed:', result.message);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ VVAULT integration auto-initialization failed:', error);
    return {
      status: 'error',
      message: error.message,
      error: error
    };
  }
}

// Auto-initialize when this module is imported
if (require.main === module) {
  // If this file is run directly, set up the integration
  initializeVVAULTIntegration()
    .then(result => {
      console.log('VVAULT integration result:', result);
    })
    .catch(error => {
      console.error('VVAULT integration error:', error);
    });
} else {
  // If this module is imported, auto-initialize
  initializeVVAULTIntegration();
}

module.exports = {
  setupVVAULTAutoIntegration,
  patchChattyStore,
  patchChattyRoutes,
  vvaultAutoIntegrationMiddleware,
  initializeVVAULTIntegration
};
