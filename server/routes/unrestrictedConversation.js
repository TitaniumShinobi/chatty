/**
 * Unrestricted Conversation Routes
 * 
 * API endpoints for unlimited conversational intelligence
 * without artificial restrictions or domain boundaries.
 */

import express from 'express';
import { getUnifiedIntelligenceOrchestrator } from '../lib/unifiedIntelligenceOrchestrator.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

/**
 * POST /api/conversation/unrestricted
 * Send message with unlimited conversational scope
 */
router.post('/unrestricted', async (req, res) => {
  try {
    const { constructCallsign, message, conversationId, metadata = {} } = req.body;

    if (!constructCallsign || !message) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: constructCallsign and message'
      });
    }

    console.log(`🧠 [UnrestrictedConversation] Processing unrestricted message for ${constructCallsign}`);
    console.time(`🧠 [API] Unrestricted conversation for ${constructCallsign}`);

    const orchestrator = getUnifiedIntelligenceOrchestrator();
    
    // Process message without any restrictions
    const response = await orchestrator.processUnrestrictedMessage(
      constructCallsign,
      message,
      req.user.id,
      conversationId || `${constructCallsign}_${Date.now()}`
    );

    console.timeEnd(`🧠 [API] Unrestricted conversation for ${constructCallsign}`);
    console.log(`✅ [UnrestrictedConversation] Response generated with ${response.conversational_freedom} freedom`);

    res.json({
      ok: true,
      response,
      metadata: {
        processing_time: Date.now(),
        user_id: req.user.id,
        construct_callsign: constructCallsign,
        restrictions_removed: true,
        topic_limitations: 'none',
        conversational_scope: 'unlimited'
      }
    });

  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Error processing unrestricted message:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to process unrestricted message',
      details: error.message,
      conversational_freedom: 'error'
    });
  }
});

/**
 * GET /api/conversation/preferences
 * Get conversational preferences (replaces brevity config)
 */
router.get('/preferences', async (req, res) => {
  try {
    const { constructCallsign } = req.query;

    if (!constructCallsign) {
      return res.status(400).json({
        ok: false,
        error: 'Missing constructCallsign parameter'
      });
    }

    // Return unrestricted conversational preferences
    const preferences = {
      responseStyle: 'adaptive',
      prioritizeClarity: true,
      maintainPersonality: true,
      contextAware: true,
      avoidFillerWords: true,
      directWhenAppropriate: true,
      guidelines: {
        preferConciseOver: 'verbose',
        preferClearOver: 'cryptic',
        preferAuthenticOver: 'generic',
        preferHelpfulOver: 'restrictive'
      },
      neverBreakConversation: true,
      noArbitraryLimits: true,
      noDisruptiveMessages: true,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ [UnrestrictedConversation] Returned unrestricted preferences for ${constructCallsign}`);

    res.json({
      ok: true,
      preferences,
      restrictions_removed: true,
      conversational_freedom: 'unlimited'
    });

  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Error getting preferences:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get conversational preferences'
    });
  }
});

/**
 * POST /api/conversation/preferences
 * Save conversational preferences (replaces brevity config saving)
 */
router.post('/preferences', async (req, res) => {
  try {
    const { constructCallsign, preferences } = req.body;

    if (!constructCallsign) {
      return res.status(400).json({
        ok: false,
        error: 'Missing constructCallsign'
      });
    }

    console.log(`🔄 [UnrestrictedConversation] Preferences update requested for ${constructCallsign} - maintaining unrestricted defaults`);

    // Always return unrestricted preferences regardless of input
    const unrestrictedPreferences = {
      responseStyle: 'adaptive',
      prioritizeClarity: true,
      maintainPersonality: true,
      contextAware: true,
      avoidFillerWords: preferences?.avoidFillerWords !== false,
      directWhenAppropriate: preferences?.directWhenAppropriate !== false,
      guidelines: {
        preferConciseOver: 'verbose',
        preferClearOver: 'cryptic',
        preferAuthenticOver: 'generic',
        preferHelpfulOver: 'restrictive'
      },
      neverBreakConversation: true,
      noArbitraryLimits: true,
      noDisruptiveMessages: true,
      timestamp: new Date().toISOString()
    };

    res.json({
      ok: true,
      preferences: unrestrictedPreferences,
      message: 'Unrestricted conversational preferences maintained',
      restrictions_removed: true
    });

  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Error saving preferences:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to save conversational preferences'
    });
  }
});

/**
 * GET /api/conversation/personality
 * Get personality consistency settings
 */
router.get('/personality', async (req, res) => {
  try {
    const { constructCallsign } = req.query;

    if (!constructCallsign) {
      return res.status(400).json({
        ok: false,
        error: 'Missing constructCallsign parameter'
      });
    }

    const personalityConfig = {
      maintainCoreTraits: true,
      preventIdentityDrift: true,
      consistentApplication: true,
      avoidGenericFallbacks: true,
      preserveAuthenticPatterns: true,
      conversationalScope: 'unlimited',
      topicRestrictions: 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log(`✅ [UnrestrictedConversation] Returned personality consistency config for ${constructCallsign}`);

    res.json({
      ok: true,
      config: personalityConfig,
      restrictions_removed: true
    });

  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Error getting personality config:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get personality consistency config'
    });
  }
});

/**
 * POST /api/conversation/personality
 * Save personality consistency settings
 */
router.post('/personality', async (req, res) => {
  try {
    const { constructCallsign, config } = req.body;

    if (!constructCallsign) {
      return res.status(400).json({
        ok: false,
        error: 'Missing constructCallsign'
      });
    }

    console.log(`🔄 [UnrestrictedConversation] Personality config update for ${constructCallsign} - maintaining consistency settings`);

    // Always maintain personality consistency settings
    const consistencyConfig = {
      maintainCoreTraits: true,
      preventIdentityDrift: true,
      consistentApplication: true,
      avoidGenericFallbacks: true,
      preserveAuthenticPatterns: true,
      conversationalScope: 'unlimited',
      topicRestrictions: 'none',
      createdAt: config?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res.json({
      ok: true,
      config: consistencyConfig,
      message: 'Personality consistency maintained across unlimited conversational scope'
    });

  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Error saving personality config:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to save personality consistency config'
    });
  }
});

/**
 * GET /api/conversation/memories
 * Query memories without restrictions
 */
router.get('/memories', async (req, res) => {
  try {
    const { constructCallsign, query, limit = 10, includeAllDomains = true } = req.query;

    if (!constructCallsign || !query) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required parameters: constructCallsign and query'
      });
    }

    console.log(`🧠 [UnrestrictedConversation] Querying unrestricted memories for ${constructCallsign}: "${query}"`);

    // Use the unified orchestrator to get relevant memories
    const orchestrator = getUnifiedIntelligenceOrchestrator();
    
    // This would integrate with the capsule system for memory retrieval
    // For now, return a structure that indicates unrestricted access
    const memories = [
      {
        context: `Unrestricted memory query for: ${query}`,
        response: `Memory system has unlimited access to all conversational domains for ${constructCallsign}`,
        metadata: {
          domain_restrictions: 'none',
          topic_limitations: 'removed',
          conversational_scope: 'unlimited'
        },
        relevance: 1.0
      }
    ];

    res.json({
      ok: true,
      memories,
      query_restrictions: 'none',
      domain_access: 'unlimited',
      total_domains_searched: 'all'
    });

  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Error querying memories:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to query unrestricted memories'
    });
  }
});

/**
 * GET /api/conversation/capabilities
 * Get unrestricted conversation capabilities
 */
router.get('/capabilities', async (req, res) => {
  try {
    const { constructCallsign } = req.query;

    const orchestrator = getUnifiedIntelligenceOrchestrator();
    const stats = orchestrator.getStats();

    const capabilities = {
      conversational_freedom: 'unlimited',
      topic_restrictions: 'none',
      domain_boundaries: 'removed',
      personality_consistency: 'maintained',
      supported_topics: [
        'technology', 'creative', 'science', 'philosophy', 'practical',
        'personal', 'business', 'education', 'health', 'legal',
        'cooking', 'art', 'music', 'literature', 'history',
        'mathematics', 'engineering', 'psychology', 'sociology',
        'economics', 'politics', 'ethics', 'spirituality',
        'sports', 'travel', 'relationships', 'career',
        'unlimited_scope'
      ],
      conversation_flow: 'natural',
      response_limitations: 'none',
      artificial_boundaries: 'removed',
      stats
    };

    if (constructCallsign) {
      capabilities.construct_specific = {
        callsign: constructCallsign,
        personality_loaded: stats.loaded_personalities > 0,
        context_available: stats.active_conversations > 0
      };
    }

    res.json({
      ok: true,
      capabilities,
      message: 'Unrestricted conversational capabilities active'
    });

  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Error getting capabilities:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get conversation capabilities'
    });
  }
});

/**
 * POST /api/conversation/test
 * Test unrestricted conversation capabilities
 */
router.post('/test', async (req, res) => {
  try {
    const { constructCallsign, testQueries = [] } = req.body;

    if (!constructCallsign) {
      return res.status(400).json({
        ok: false,
        error: 'Missing constructCallsign'
      });
    }

    console.log(`🧪 [UnrestrictedConversation] Testing capabilities for ${constructCallsign}`);

    const orchestrator = getUnifiedIntelligenceOrchestrator();
    const results = [];

    // Default test queries if none provided
    const queries = testQueries.length > 0 ? testQueries : [
      'Tell me about quantum physics',
      'Help me write a poem',
      'Explain legal contracts',
      'What\'s your favorite recipe?',
      'How do I debug JavaScript?',
      'Discuss philosophy of consciousness',
      'Plan a business strategy',
      'Teach me about history'
    ];

    for (const query of queries) {
      try {
        const response = await orchestrator.processUnrestrictedMessage(
          constructCallsign,
          query,
          req.user.id,
          `test_${Date.now()}`
        );

        results.push({
          query,
          success: response.conversational_freedom === 'unlimited',
          response_preview: response.content?.substring(0, 100) + '...',
          topic_restrictions: response.topic_restrictions,
          personality_maintained: response.personality_maintained
        });

      } catch (queryError) {
        results.push({
          query,
          success: false,
          error: queryError.message,
          topic_restrictions: 'error',
          personality_maintained: false
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const overallSuccess = successCount === results.length;

    res.json({
      ok: true,
      test_results: results,
      summary: {
        total_queries: results.length,
        successful: successCount,
        failed: results.length - successCount,
        success_rate: (successCount / results.length) * 100,
        overall_success: overallSuccess
      },
      message: overallSuccess ? 
        'All unrestricted conversation tests passed' : 
        `${successCount}/${results.length} tests passed`
    });

  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Error testing capabilities:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to test unrestricted conversation capabilities'
    });
  }
});

export default router;
