import express from "express";
import { Store } from "../store.js";
import { getGPTRuntimeBridge } from "../lib/gptRuntimeBridge.js";
import { getGPTSaveHook } from "../lib/gptSaveHook.js";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const r = express.Router();

r.get("/", async (req, res) => {
  try {
    const rows = await Store.listConversations(req.user.id);
    res.json({ ok: true, conversations: rows });
  } catch (error) {
    console.error("List conversations error:", error);
    res.status(500).json({ ok: false, error: "Failed to load conversations" });
  }
});

r.post("/", async (req, res) => {
  try {
    const doc = await Store.createConversation(req.user.id, req.body || {});
    res.status(201).json({ ok: true, conversation: doc });
  } catch (error) {
    console.error("Create conversation error:", error);
    res.status(500).json({ ok: false, error: "Failed to create conversation" });
  }
});

r.get("/:id/messages", async (req, res) => {
  try {
    const rows = await Store.listMessages(req.user.id, req.params.id);
    res.json({ ok: true, messages: rows });
  } catch (error) {
    console.error("List messages error:", error);
    res.status(500).json({ ok: false, error: "Failed to load messages" });
  }
});

/**
 * Helper function to load OptimizedZenProcessor with fallback support
 * Tries compiled JS first (production), then TS source (development)
 * Verifies build artifacts exist and warns in production if missing
 */
async function loadOptimizedZenProcessor() {
  const isProduction = process.env.NODE_ENV === 'production';
  const compiledJsPath = join(__dirname, '../../dist/engine/optimizedZen.js');
  const compiledJsExists = existsSync(compiledJsPath);

  // Build verification: Check if compiled JS exists
  if (!compiledJsExists) {
    if (isProduction) {
      // CRITICAL: Log multiple warnings but allow fallback
      console.error('🚨🚨🚨 CRITICAL PRODUCTION WARNING 🚨🚨🚨');
      console.error(`🚨 PRODUCTION DEPLOYMENT MISCONFIGURED: Compiled JS not found at ${compiledJsPath}`);
      console.error('🚨 Build artifacts required for production. Run: cd server && npm run build');
      console.error('🚨 Falling back to TS source (requires tsx) - THIS IS NOT RECOMMENDED');
      console.error('🚨 Zen will work but deployment is incorrect. Fix immediately.');
      // Don't throw - allow fallback but make it impossible to miss
    } else {
      console.warn(`⚠️ [Conversations API] Compiled JS not found at ${compiledJsPath}. Falling back to TS source (requires tsx runtime).`);
    }
  }

  let OptimizedZenProcessor;
  let jsError = null;
  let tsError = null;

  // Try compiled JS first (production)
  if (compiledJsExists) {
    try {
      const jsModule = await import('../../dist/engine/optimizedZen.js');
      OptimizedZenProcessor = jsModule.OptimizedZenProcessor;
      if (OptimizedZenProcessor) {
        console.log('✅ [Conversations API] Loaded OptimizedZenProcessor from compiled JS');
        return OptimizedZenProcessor;
      }
    } catch (error) {
      jsError = error;
      console.warn(`⚠️ [Conversations API] Failed to import compiled JS: ${error.message}`);
    }
  }

  // Fallback to TS source (development with tsx)
  try {
    const tsModule = await import('../../src/engine/optimizedZen.ts');
    OptimizedZenProcessor = tsModule.OptimizedZenProcessor;
    if (OptimizedZenProcessor) {
      if (isProduction) {
        console.warn(`⚠️ [Conversations API] Using TS source in production (not recommended). Compiled JS should be used.`);
      } else {
        console.log('✅ [Conversations API] Loaded OptimizedZenProcessor from TS source');
      }
      return OptimizedZenProcessor;
    }
  } catch (error) {
    tsError = error;
  }

  // Both imports failed
  const errorMsg = `Failed to load OptimizedZenProcessor. JS error: ${jsError?.message || 'none'}, TS error: ${tsError?.message || 'none'}`;
  console.error(`❌ [Conversations API] ${errorMsg}`);
  throw new Error(errorMsg);
}

r.post("/:id/messages", async (req, res) => {
  try {

    console.log(`🔍🔍🔍 [Conversations API] POST /:id/messages called - NEW CODE VERSION 🔍🔍🔍`);
    console.log(`   Conversation ID: ${req.params.id}`);
    console.log(`   User ID: ${req.user.id}`);
    console.log(`   Message: "${req.body.message || req.body.content}"`);

    // Store the user message
    const userMessage = await Store.createMessage(req.user.id, req.params.id, req.body);

    // Extract GPT ID from conversation ID (e.g., "gpt-katana-001" -> "katana-001")
    const conversationId = req.params.id;
    const gptId = conversationId.startsWith('gpt-') ? conversationId.substring(4) : conversationId;

    // Extract constructId from body or derive from gptId
    const constructId = req.body.constructId || gptId || 'zen-001';

    console.log(`🎯 [Conversations API] Extracted GPT ID: ${gptId} from conversation: ${conversationId}`);
    console.log(`🔍 [Conversations API] constructId resolution:`, {
      fromBody: req.body.constructId,
      fromGptId: gptId,
      finalConstructId: constructId,
      conversationId: conversationId,
      willMatchZen: (constructId === 'zen-001' || constructId === 'zen')
    });

    // Pre-load identity (prompt/conditioning) for Zen/Lin so it is available even when orchestration is off
    let identityFiles = null;
    if (constructId === 'zen-001' || constructId === 'zen' || constructId === 'lin-001' || constructId === 'lin') {
      try {console.log(`🔍 [Conversations API] Attempting to import identityLoader...`);
        const identityLoader = await import('../lib/identityLoader.js');
        console.log(`✅ [Conversations API] identityLoader imported successfully, calling loadIdentityFiles...`);// Load undertone capsule for lin-001 (mandatory layer)
        const includeUndertone = constructId === 'lin-001' || constructId === 'lin';
        identityFiles = await identityLoader.loadIdentityFiles(req.user.id, constructId, includeUndertone);
        console.log(`✅ [Conversations API] Identity loaded:`, { 
          hasPrompt: !!identityFiles?.prompt, 
          hasConditioning: !!identityFiles?.conditioning,
          hasUndertone: !!identityFiles?.undertone 
        });
      } catch (identityError) {console.error(`❌ [Conversations API] Failed to load identity for ${constructId}:`, identityError);
        console.error(`❌ [Conversations API] Error details:`, {
          message: identityError.message,
          name: identityError.name,
          stack: identityError.stack,
          code: identityError.code
        });
      }
    }

    if (constructId === 'zen-001' || constructId === 'zen') {
      const missingIdentityParts = [];
      if (!identityFiles?.prompt) missingIdentityParts.push('prompt.txt');
      if (!identityFiles?.conditioning) missingIdentityParts.push('conditioning.txt');

      if (missingIdentityParts.length) {
        const missingList = missingIdentityParts.join(' and ');
        const errMessage = `Zen identity incomplete (${missingList}). DeepSeek, Mistral, and Phi3 require prompt.txt + conditioning.txt before orchestration can run. Restore ${missingList} in the identity directory and retry.`;
        console.error(`❌ [Conversations API] ${errMessage}`);
        return res.status(500).json({
          ok: false,
          error: errMessage,
          status: 'identity_missing',
          missingIdentity: missingIdentityParts
        });
      }
    }

    // Optional: Use orchestration if enabled and constructId is zen or lin
    const useOrchestration = req.body.useOrchestration !== false &&
      (constructId === 'zen-001' || constructId === 'zen' ||
        constructId === 'lin-001' || constructId === 'lin');if (useOrchestration) {
      try {
        const { routeViaOrchestration, isOrchestrationEnabled } = await import('../services/orchestrationBridge.js');

        const enabled = isOrchestrationEnabled();if (enabled) {
          // Extract agent ID from constructId
          const agentId = constructId.replace(/-001$/, '').replace(/-\d+$/, '') || 'zen';
          const message = req.body.message || req.body.content;

          console.log(`🎭 [Conversations API] Routing via orchestration: agent=${agentId}, constructId=${constructId}`);

          // Load identity files for zen/lin
          let identityContext = {
            user_id: req.user.id,
            thread_id: conversationId,
            construct_id: constructId,
          };

          if (identityFiles) {
            identityContext.identity = identityFiles;
          }let orchestrationResult = await routeViaOrchestration(
            agentId,
            message,
            identityContext
          );

          if ((constructId === 'zen-001' || constructId === 'zen') && orchestrationResult.status !== 'error') {
            console.log('🧭 [Conversations API] Override orchestration status for zen: forcing optimized zen delegation');
            orchestrationResult = {
              ...orchestrationResult,
              status: 'delegate_to_optimized_zen',
              response: orchestrationResult.response || 'Delegating to OptimizedZenProcessor...'
            };
          }

          // Handle Orchestration Bridge response
          if (orchestrationResult.status !== 'error') {

            // Check for delegation to OptimizedZenProcessor (Multi-Model Synthesis)
            if (orchestrationResult.status === 'delegate_to_optimized_zen') {
              console.log('🚀 [Conversations API] Delegating to OptimizedZenProcessor (Multi-Model)...');

              try {
                // Load OptimizedZenProcessor with fallback (compiled JS or TS source)
                const OptimizedZenProcessor = await loadOptimizedZenProcessor();

                // Server-side PersonaBrain adapter
                class ServerPersonaBrain {
                  constructor(userId) { this.userId = userId; }
                  remember(u, r, t) { /* managed by Store externally */ }
                  getContext(u) { return { persona: null, recentHistory: '', contextSummary: '' }; }
                }

                // Setup Processor
                const brain = new ServerPersonaBrain(req.user.id);
                const config = {
                  models: { coding: 'deepseek-coder', creative: 'mistral', smalltalk: 'phi3' },
                  toneModulation: { enabled: true }
                };

                // Load conversation history from Store
                const allMessages = await Store.listMessages(req.user.id, conversationId);
                const conversationHistory = allMessages
                  .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                  .map(msg => ({
                    text: msg.content || msg.message || '',
                    timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
                    role: msg.role
                  }));

                const processor = new OptimizedZenProcessor(brain, config);

                // Run processor with correct signature: (userMessage, conversationHistory[], userId, identityFiles)
                const zenResponse = await processor.processMessage(
                  req.body.message || req.body.content,
                  conversationHistory,
                  req.user.id,
                  identityFiles
                );

                // Store response
                const aiMessage = await Store.createMessage(
                  req.user.id,
                  conversationId,
                  {
                    content: zenResponse.response,
                    role: 'assistant',
                    gptId: gptId,
                    metadata: {
                      model: 'optimized-zen-multi-model',
                      orchestration_status: 'optimized_zen_success',
                      agent_id: 'zen-multi-model',
                      timestamp: new Date().toISOString()
                    }
                  }
                );

                return res.status(201).json(aiMessage);

              } catch (err) {
                console.error('❌ [Conversations API] OptimizedZen delegation failed:', err);
                console.warn('⚠️ [Conversations API] Falling back to gptRuntimeBridge for Zen');
                // Fall through to gptRuntimeBridge as graceful fallback
              }
            }

            if (orchestrationResult.response) {
              console.log(`✅ [Conversations API] Orchestration returned response for ${agentId}`);// Store the AI response
              const aiMessage = await Store.createMessage(req.user.id, req.params.id, {
                message: orchestrationResult.response,
                content: orchestrationResult.response,
                role: 'assistant',
                gptId: gptId,
                metadata: {
                  model: 'orchestration',
                  orchestration_status: orchestrationResult.status,
                  agent_id: orchestrationResult.agent_id,
                  timestamp: new Date().toISOString()
                }
              });

              return res.status(201).json(aiMessage);
            }
          } else {
            console.warn(`⚠️ [Conversations API] Orchestration returned error status, falling back to direct routing`);
          }
        }
      } catch (orchestrationError) {
        console.warn(`⚠️ [Conversations API] Orchestration failed, falling back to direct routing:`, orchestrationError.message);
      }
    }
    
    // 🔒 HARD-FORCE ZEN DELEGATION - Bypass all template/placeholder logic
    console.log(`🔍 [Conversations API] Checking Zen delegation - constructId: "${constructId}"`);
    
    if (constructId === 'zen-001' || constructId === 'zen') {
      console.log('🚀 [Conversations API] ZEN DETECTED - Forcing OptimizedZenProcessor delegation');

      try {
        // Load OptimizedZenProcessor with fallback (compiled JS or TS source)
        const OptimizedZenProcessor = await loadOptimizedZenProcessor();

        // Server-side PersonaBrain adapter
        class ServerPersonaBrain {
          constructor(userId) { this.userId = userId; }
          remember(u, r, t) { /* managed by Store externally */ }
          getContext(u) { return { persona: null, recentHistory: '', contextSummary: '' }; }
        }

        // Load conversation history from Store
        const allMessages = await Store.listMessages(req.user.id, conversationId);
        const conversationHistory = allMessages
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({
            text: msg.content || msg.message || '',
            timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
            role: msg.role
          }));

        console.log(`📚 [Conversations API] Loaded ${conversationHistory.length} messages from conversation history`);

        const brain = new ServerPersonaBrain(req.user.id);
        const config = {
          models: { coding: 'deepseek-coder', creative: 'mistral', smalltalk: 'phi3' },
          toneModulation: { enabled: true }
        };

        console.log('🤖 [Conversations API] Creating OptimizedZenProcessor...');
        const processor = new OptimizedZenProcessor(brain, config);

        console.log('💬 [Conversations API] Processing message through OptimizedZenProcessor...');
        const zenResponse = await processor.processMessage(
          req.body.message || req.body.content,
          conversationHistory,
          req.user.id,
          identityFiles
        );console.log(`✅ [Conversations API] OptimizedZenProcessor returned response (${zenResponse.response.length} chars)`);

        const aiMessage = await Store.createMessage(req.user.id, req.params.id, {
          content: zenResponse.response,
          role: 'assistant',
          gptId: gptId,
          metadata: {
            model: 'zen-multi-model',
            timestamp: new Date().toISOString()
          }
        });

        return res.status(201).json({
          ok: true,
          message: req.body.message || req.body.content,
          aiResponse: aiMessage,
          content: zenResponse.response
        });
      } catch (zenError) {
        console.error('❌ [Conversations API] Zen direct path failed:', zenError);
        console.error('❌ [Conversations API] Zen error details:', {
          message: zenError.message,
          stack: zenError.stack,
          name: zenError.name,
          cause: zenError.cause,
          constructId: constructId,
          userId: req.user.id,
          conversationId: conversationId,
          messagePreview: (req.body.message || req.body.content || '').slice(0, 100)
        });
        try {
          const fs = await import('fs');
          const path = await import('path');
          const logPath = path.resolve(process.cwd(), 'server_debug.log');
          const logMsg = `\n[${new Date().toISOString()}] ERROR in Zen direct path:\nMessage: ${zenError.message}\nStack: ${zenError.stack}\nCause: ${zenError.cause}\n`;
          fs.appendFileSync(logPath, logMsg);
        } catch (e) { console.error('Failed to write log', e); }
        console.warn('⚠️ [Conversations API] Falling back to gptRuntimeBridge for Zen');
        // Fall through to gptRuntimeBridge as graceful fallback
        // Don't return 500 - allow Zen to use template responses as last resort
      }
    }

    // Generate AI response using Unified Intelligence Orchestrator (unrestricted)
    try {
      console.log(`🧠 [Conversations API] Generating unrestricted AI response for GPT: ${gptId}`);

      const gptRuntime = getGPTRuntimeBridge();

      // 🚀 LOAD CONVERSATION HISTORY for GPT seats (mirrors Zen's flow)
      const allMessages = await Store.listMessages(req.user.id, conversationId);
      const conversationHistory = allMessages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({
          text: msg.content || msg.message || '',
          role: msg.role,
          timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
        }))
        .slice(-50); // Cap to keep context manageable
      
      console.log(`📚 [Conversations API] Loaded ${conversationHistory.length} messages for GPT seat context`);

      // Process message with unlimited conversational scope + conversation history
      const aiResponse = await gptRuntime.processMessage(
        gptId,
        req.body.message || req.body.content,
        req.user.id,
        conversationId,
        identityFiles,
        conversationHistory
      );

      console.log(`✅ [Conversations API] Generated response: "${aiResponse.content}"`);
      console.log(`   Model: ${aiResponse.model}`);
      console.log(`   Freedom: ${aiResponse.conversational_freedom}`);
      console.log(`   Restrictions: ${aiResponse.topic_restrictions}`);

      // Store the AI response as a message
      const aiMessage = await Store.createMessage(req.user.id, req.params.id, {
        message: aiResponse.content,
        content: aiResponse.content,
        role: 'assistant',
        gptId: gptId,
        metadata: {
          model: aiResponse.model,
          files: aiResponse.files,
          actions: aiResponse.actions,
          timestamp: aiResponse.timestamp
        }
      });

      console.log(`✅ [Conversations API] Unrestricted AI response generated and stored`);

      // Update capsule with the new conversation (maintains personality consistency)
      try {
        const saveHook = getGPTSaveHook();
        await saveHook.onMessageAdded(gptId, {
          role: 'assistant',
          content: aiResponse.content,
          timestamp: aiResponse.timestamp
        });
      } catch (hookError) {
        console.warn(`⚠️ [Conversations API] Capsule update failed:`, hookError.message);
        // Don't fail the request if capsule update fails
      }

      // Return both the user message and AI response with unrestricted metadata
      res.status(201).json({
        ok: true,
        message: userMessage,
        aiResponse: aiMessage,
        content: aiResponse.content // For compatibility with test expectations
      });

    } catch (aiError) {
      console.error(`❌ [Conversations API] AI generation failed for GPT ${gptId}:`, aiError);

      // Still return the stored user message even if AI generation fails
      res.status(201).json({
        ok: true,
        message: userMessage,
        aiError: aiError.message,
        note: "User message stored but AI response generation failed"
      });
    }

  } catch (error) {
    console.error("Create message error:", error);
    res.status(500).json({ ok: false, error: "Failed to create message" });
  }
});

// PERFORMANCE MONITORING: Cache management endpoints
r.get("/cache/stats", async (req, res) => {
  try {
    const { getGPTRuntimeBridge } = await import('../lib/gptRuntimeBridge.js');
    const gptRuntime = getGPTRuntimeBridge();

    // Get cache stats from capsule integration
    const stats = gptRuntime.gptRuntime?.capsuleIntegration?.getCacheStats() || {
      error: "Cache not initialized"
    };

    res.json({
      ok: true,
      cacheStats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Failed to get cache stats",
      details: error.message
    });
  }
});

r.post("/cache/clear", async (req, res) => {
  try {
    const { getGPTRuntimeBridge } = await import('../lib/gptRuntimeBridge.js');
    const gptRuntime = getGPTRuntimeBridge();

    if (gptRuntime.gptRuntime?.capsuleIntegration) {
      gptRuntime.gptRuntime.capsuleIntegration.clearCache();
      res.json({
        ok: true,
        message: "Cache cleared successfully",
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        ok: false,
        error: "Cache not available"
      });
    }
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Failed to clear cache",
      details: error.message
    });
  }
});

r.post("/cache/warm/:gptId", async (req, res) => {
  try {
    const { gptId } = req.params;
    const { getGPTRuntimeBridge } = await import('../lib/gptRuntimeBridge.js');
    const gptRuntime = getGPTRuntimeBridge();

    if (gptRuntime.gptRuntime?.capsuleIntegration) {
      await gptRuntime.gptRuntime.capsuleIntegration.warmCache([gptId]);
      const stats = gptRuntime.gptRuntime.capsuleIntegration.getCacheStats();

      res.json({
        ok: true,
        message: `Cache warmed for ${gptId}`,
        cacheStats: stats,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        ok: false,
        error: "Cache not available"
      });
    }
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Failed to warm cache",
      details: error.message
    });
  }
});

export default r;
