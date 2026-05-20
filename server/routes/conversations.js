/**
 * /api/conversations/*
 *
 * ROUTE CLASSIFICATION: NONCANONICAL (separate path)
 * These routes bypass the canonical /api/vvault/message runtime path.
 * They use gptRuntimeBridge directly and emit stub runtime_receipt
 * and orchestration_checklist fields for observability parity.
 *
 * New consumers should target /api/vvault/message for the canonical runtime path.
 */

import express from "express";
import { Store } from "../store.js";
import { getGPTRuntimeBridge } from "../lib/gptRuntimeBridge.js";
import { getGPTSaveHook } from "../lib/gptSaveHook.js";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readConversations } from '../../vvaultConnector/readConversations.js';
import { writeTranscript } from '../../vvaultConnector/writeTranscript.js';
import {
  isConstructBackedId,
  constructIdFromConversationId,
  listCanonicalConversations,
  getCanonicalConversationMessages,
  ensureCanonicalConversation,
  appendCanonicalConversationMessages,
  buildConversationHistory,
} from "../lib/conversationRepository.js";
import { resolveRequestUser } from "../auth/lib/supabaseUserResolver.js";
import { applyHumanConversationGuard } from "../lib/humanConversationGuard.js";
import {
  isLinOrchestratedConstruct,
  isProtectedZenConstruct,
} from "../lib/constructMemoryPolicy.js";
import { resolveOptimizedZenBuildArtifact } from "../lib/healthChecks.js";

// Helper to sync GPT conversations to the VVAULT body.
async function syncGPTConversationToVvault(userId, userEmail, conversationId, gptId, gptName, userMessage, aiMessage) {
  try {
    const { assertNotLocked } = await import('../lib/runtimeLock.js');
    await assertNotLocked();
  } catch (lockErr) {
    console.warn(`⚠️ [Conversations API] VVAULT runtime locked, skipping conversation sync:`, lockErr?.message);
    return;
  }
  try {
    // Extract construct callsign from gptId (e.g., 'katana' -> 'katana-001')
    let constructId = gptId;
    if (!constructId.match(/-\d+$/)) {
      constructId += '-001';
    }

    const sessionId = `${constructId}_chat_with_${constructId}`;
    const timestamp = new Date().toISOString();

    // Save user message
    if (userMessage) {
      await writeTranscript({
        userId,
        userEmail,
        sessionId,
        title: gptName || constructId,
        constructId,
        constructName: gptName,
        constructCallsign: constructId,
        role: 'user',
        content: typeof userMessage === 'string' ? userMessage : userMessage.content || userMessage.message,
        timestamp,
        metadata: { source: 'chatty' }
      });
    }

    // Save AI response
    if (aiMessage) {
      await writeTranscript({
        userId,
        userEmail,
        sessionId,
        title: gptName || constructId,
        constructId,
        constructName: gptName,
        constructCallsign: constructId,
        role: 'assistant',
        content: typeof aiMessage === 'string' ? aiMessage : aiMessage.content || aiMessage.message,
        timestamp: new Date().toISOString(),
        metadata: { source: 'chatty' }
      });
    }

    console.log(`✅ [Conversations API] Synced GPT conversation to VVAULT: ${constructId}`);
  } catch (error) {
    console.warn(`⚠️ [Conversations API] VVAULT sync failed:`, error.message);
    // Don't fail the request if sync fails
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const r = express.Router();

const USE_CANONICAL_CONVERSATIONS = process.env.CHATTY_CANONICAL_CONVERSATIONS !== 'false';
const DUAL_WRITE_CONVERSATIONS = process.env.CHATTY_CONVERSATION_DUAL_WRITE !== 'false';
const ZEN_CANONICAL_CONSTRUCT_ID = 'zen-001';
const ZEN_CANONICAL_THREAD_ID = `${ZEN_CANONICAL_CONSTRUCT_ID}_chat_with_${ZEN_CANONICAL_CONSTRUCT_ID}`;

r.get("/", async (req, res) => {
  try {
    const { supabaseUserId } = await resolveRequestUser(req);
    const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub;

    if (USE_CANONICAL_CONVERSATIONS && supabaseUserId) {
      const t0 = Date.now();
      const canonicalList = await listCanonicalConversations({ supabaseUserId, userEmail: req.user?.email });
      const storeRows = await Store.listConversations(req.user.id);
      const storeNonConstruct = (storeRows || []).filter((row) => !isConstructBackedId(row._id || row.constructId || ''));
      const merged = [...canonicalList.map((c) => ({ ...c, owner: chattyUserId })), ...storeNonConstruct];
      merged.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      const elapsed = Date.now() - t0;
      console.log(`📥 [Conversations API] conversation read source: vvault-body (${canonicalList.length}) + store-legacy (${storeNonConstruct.length}) in ${elapsed}ms`);
      return res.json({ ok: true, conversations: merged });
    }

    const rows = await Store.listConversations(req.user.id);
    let vvaultConversations = [];
    try {
      const userEmail = req.user.email;
      if (userEmail) {
        const bodyConvos = await readConversations({ userEmail });
        if (bodyConvos && bodyConvos.length > 0) {
          console.log(`📥 [Conversations API] Found ${bodyConvos.length} conversations from VVAULT for ${userEmail}`);
          vvaultConversations = bodyConvos.map(c => ({
            _id: c.sessionId,
            owner: req.user.id,
            title: c.title || 'Untitled',
            constructId: c.constructId,
            constructName: c.constructName,
            constructCallsign: c.constructCallsign,
            model: 'gpt-4o',
            createdAt: c.createdAt || new Date().toISOString(),
            updatedAt: c.updatedAt || new Date().toISOString(),
            messageCount: c.messages?.length || 0,
            source: c.persistenceSource || 'vvault-body'
          }));
        }
      }
    } catch (vvaultError) {
      console.warn('⚠️ [Conversations API] VVAULT hydration failed:', vvaultError.message);
    }

    const existingIds = new Set(rows.map(r => r._id));
    const merged = [...rows];
    for (const sc of vvaultConversations) {
      if (!existingIds.has(sc._id)) {
        merged.push(sc);
        existingIds.add(sc._id);
      }
    }

    merged.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({ ok: true, conversations: merged });
  } catch (error) {
    console.error("List conversations error:", error);
    res.status(500).json({ ok: false, error: "Failed to load conversations" });
  }
});

r.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const constructId = body.constructId || body.constructCallsign;
    const { supabaseUserId } = await resolveRequestUser(req);

    if (USE_CANONICAL_CONVERSATIONS && constructId && isConstructBackedId(constructId) && supabaseUserId) {
      const normalizedId = /-\d+$/.test(constructId) ? constructId : `${constructId}-001`;
      const sessionId =
        normalizedId === ZEN_CANONICAL_CONSTRUCT_ID
          ? ZEN_CANONICAL_THREAD_ID
          : body.sessionId || normalizedId;
      const title = body.title || normalizedId.replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase());
      await ensureCanonicalConversation({
        supabaseUserId,
        userEmail: req.user?.email,
        sessionId,
        title,
        constructId: normalizedId,
        constructName: body.constructName || title,
        constructCallsign: normalizedId,
      });
      const conversation = {
        _id: sessionId,
        owner: req.user?.id,
        title,
        constructId: normalizedId,
        constructName: body.constructName || title,
        constructCallsign: normalizedId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'vvault-body',
      };
      if (DUAL_WRITE_CONVERSATIONS) {
        try {
          await Store.createConversation(req.user.id, { ...body, _id: sessionId, title });
        } catch (e) {
          console.warn('⚠️ [Conversations API] dual-write Store failed:', e?.message);
        }
      }
      return res.status(201).json({ ok: true, conversation });
    }

    const doc = await Store.createConversation(req.user.id, body);
    res.status(201).json({ ok: true, conversation: doc });
  } catch (error) {
    console.error("Create conversation error:", error);
    res.status(500).json({ ok: false, error: "Failed to create conversation" });
  }
});

r.get("/:id/messages", async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { supabaseUserId } = await resolveRequestUser(req);

    if (USE_CANONICAL_CONVERSATIONS && isConstructBackedId(conversationId) && supabaseUserId) {
      const t0 = Date.now();
      const messages = await getCanonicalConversationMessages({
        supabaseUserId,
        userEmail: req.user?.email,
        conversationId,
        constructId: constructIdFromConversationId(conversationId),
      });
      console.log(`📥 [Conversations API] conversation read source: vvault-body (messages: ${messages.length}) in ${Date.now() - t0}ms`);
      if (messages.length > 0) {
        return res.json({ ok: true, messages });
      }
    }

    const rows = await Store.listMessages(req.user.id, req.params.id);

    if (rows && rows.length > 0) {
      return res.json({ ok: true, messages: rows });
    }

    try {
      const userEmail = req.user.email;
      if (userEmail) {
        const bodyConvos = await readConversations({ userEmail });
        if (bodyConvos && bodyConvos.length > 0) {
          const match = bodyConvos.find(c => c.sessionId === conversationId);
          if (match && match.messages && match.messages.length > 0) {
            console.log(`📥 [Conversations API] Hydrating ${match.messages.length} messages from VVAULT for ${conversationId}`);
            const hydratedMessages = match.messages
              .filter(m => !m.isDateHeader)
              .map((m, idx) => ({
                _id: `vvault_${conversationId}_${idx}`,
                conversation: conversationId,
                owner: req.user.id,
                role: m.role || 'user',
                content: m.content || '',
                createdAt: m.timestamp || match.createdAt || new Date().toISOString(),
                source: match.persistenceSource || 'vvault-body'
              }));
            return res.json({ ok: true, messages: hydratedMessages });
          }
        }
      }
    } catch (vvaultError) {
      console.warn('⚠️ [Conversations API] VVAULT message hydration failed:', vvaultError.message);
    }

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
  const { compiledJsPath, candidates, exists: compiledJsExists } = resolveOptimizedZenBuildArtifact();

  // Build verification: Check if compiled JS exists
  if (!compiledJsExists) {
    if (isProduction) {
      // CRITICAL: Log multiple warnings but allow fallback
      console.error('🚨🚨🚨 CRITICAL PRODUCTION WARNING 🚨🚨🚨');
      console.error(`🚨 PRODUCTION DEPLOYMENT MISCONFIGURED: Compiled JS not found at ${compiledJsPath}`);
      console.error(`🚨 Checked build artifact paths: ${candidates.join(', ')}`);
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
      const jsModule = await import(pathToFileURL(compiledJsPath).href);
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
    const conversationId = req.params.id;
    const normalizedConstructId = constructIdFromConversationId(req.body.constructId || conversationId) || null;
    const gptId = normalizedConstructId || (conversationId.startsWith('gpt-') ? conversationId.substring(4) : conversationId);
    const constructId = req.body.constructId || normalizedConstructId || gptId || 'zen-001';
    const { supabaseUserId } = await resolveRequestUser(req);
    const useCanonicalConversation = USE_CANONICAL_CONVERSATIONS && isConstructBackedId(conversationId) && Boolean(supabaseUserId && normalizedConstructId);
    const canonicalCallsign = normalizedConstructId || (/-\d+$/.test(constructId) ? constructId : `${constructId}-001`);
    const canonicalTitle = (req.body.constructName || canonicalCallsign).replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase());

    console.log(`🔍🔍🔍 [Conversations API] POST /:id/messages called - NEW CODE VERSION 🔍🔍🔍`);
    console.log(`   Conversation ID: ${conversationId}`);
    console.log(`   User ID: ${req.user.id}`);
    console.log(`   Message: "${req.body.message || req.body.content}"`);

    if (useCanonicalConversation) {
      const userContent = req.body.message || req.body.content || '';
      await ensureCanonicalConversation({
        supabaseUserId,
        userEmail: req.user?.email,
        sessionId: conversationId,
        title: canonicalTitle,
        constructId: canonicalCallsign,
        constructName: req.body.constructName || canonicalTitle,
        constructCallsign: canonicalCallsign,
      });
      await appendCanonicalConversationMessages({
        supabaseUserId,
        userEmail: req.user?.email,
        sessionId: conversationId,
        title: canonicalTitle,
        constructId: canonicalCallsign,
        constructName: req.body.constructName || canonicalTitle,
        constructCallsign: canonicalCallsign,
        userMessage: { content: userContent, timestamp: new Date().toISOString() },
        assistantMessage: null,
        userMetadata: {
          attachments: Array.isArray(req.body.attachments) ? req.body.attachments : undefined,
        },
      });
      console.log(`[Conversations API] conversation write result: vvault-body-success role=user conversation=${conversationId}`);
    }

    const createLocalRouteMessage = (role, content, timestamp = new Date().toISOString()) => ({
      _id: `sb_${conversationId}_${role}_${Date.now()}`,
      conversation: conversationId,
      owner: req.user.id,
      role,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: useCanonicalConversation ? 'vvault-body' : 'store',
    });

    const maybeDualWriteStoreMessage = async (role, content, metadata = {}) => {
      if (!useCanonicalConversation || !DUAL_WRITE_CONVERSATIONS) return null;
      try {
        return await Store.createMessage(req.user.id, req.params.id, {
          role,
          content,
          message: content,
          metadata,
        });
      } catch (storeError) {
        console.warn(`[Conversations API] dual-write-store-failed role=${role} conversation=${conversationId}: ${storeError.message}`);
        return null;
      }
    };

    const userMessage = useCanonicalConversation
      ? (await maybeDualWriteStoreMessage('user', req.body.message || req.body.content || '', {
          attachments: Array.isArray(req.body.attachments) ? req.body.attachments : undefined,
        })) || createLocalRouteMessage('user', req.body.message || req.body.content || '')
      : await Store.createMessage(req.user.id, req.params.id, req.body);

    async function persistAssistantToCanonical(assistantContent) {
      if (!useCanonicalConversation || assistantContent == null) return null;
      const content = typeof assistantContent === 'string' ? assistantContent : (assistantContent?.content ?? assistantContent?.message ?? '');
      const timestamp = assistantContent?.timestamp || new Date().toISOString();
      await appendCanonicalConversationMessages({
        supabaseUserId,
        userEmail: req.user?.email,
        sessionId: conversationId,
        title: canonicalTitle,
        constructId: canonicalCallsign,
        constructName: req.body.constructName || canonicalTitle,
        constructCallsign: canonicalCallsign,
        userMessage: null,
        assistantMessage: { content, timestamp },
      });
      await maybeDualWriteStoreMessage('assistant', content, assistantContent?.metadata || {});
      console.log(`[Conversations API] conversation write result: vvault-body-success role=assistant conversation=${conversationId}`);
      return createLocalRouteMessage('assistant', content, timestamp);
    }

    async function loadConversationMessages() {
      if (useCanonicalConversation) {
        return getCanonicalConversationMessages({
          supabaseUserId,
          userEmail: req.user?.email,
          conversationId,
          constructId: canonicalCallsign,
        });
      }
      return Store.listMessages(req.user.id, conversationId);
    }

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
    if (isLinOrchestratedConstruct(constructId)) {
      try {console.log(`🔍 [Conversations API] Attempting to import identityLoader...`);
        const identityLoader = await import('../lib/identityLoader.js');
        console.log(`✅ [Conversations API] identityLoader imported successfully, calling loadIdentityFiles...`);// Load undertone capsule for lin-001 (mandatory layer)
        const includeUndertone = !isProtectedZenConstruct(constructId);
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

    if (isProtectedZenConstruct(constructId)) {
      const missingIdentityParts = [];
      if (!identityFiles?.prompt) missingIdentityParts.push('prompt.txt');
      if (!identityFiles?.conditioning) missingIdentityParts.push('conditioning.txt');

      if (missingIdentityParts.length) {
        const missingList = missingIdentityParts.join(' and ');
        const errMessage = `Zen identity incomplete (${missingList}). Lin/Zen Intelligence, Ingenuity, and Interaction seats require prompt.txt + conditioning.txt before orchestration can run. Restore ${missingList} in the identity directory and retry.`;
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
    const useOrchestration =
      req.body.useOrchestration !== false && isLinOrchestratedConstruct(constructId);
    if (useOrchestration) {
      try {
        const { routeViaOrchestration, isOrchestrationEnabled } = await import('../services/orchestrationBridge.js');

        const enabled = isOrchestrationEnabled();if (enabled) {
          const agentId = isProtectedZenConstruct(constructId) ? 'zen' : 'lin';
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

          if (isProtectedZenConstruct(constructId) && orchestrationResult.status !== 'error') {
            console.log('🧭 [Conversations API] Override orchestration status for zen: forcing optimized zen delegation');
            orchestrationResult = {
              ...orchestrationResult,
              status: 'delegate_to_optimized_zen',
              response: orchestrationResult.response || 'Delegating to OptimizedZenProcessor...'
            };
          }

          // Handle Orchestration Bridge response
          if (orchestrationResult.status !== 'error' && orchestrationResult.status !== 'placeholder') {

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
                  toneModulation: { enabled: true }
                };

                const allMessages = await loadConversationMessages();
                const conversationHistory = buildConversationHistory(allMessages);

                const processor = new OptimizedZenProcessor(brain, config);

                // Run processor with correct signature: (userMessage, conversationHistory[], userId, identityFiles)
                const zenResponse = await processor.processMessage(
                  req.body.message || req.body.content,
                  conversationHistory,
                  req.user.id,
                  identityFiles
                );

                const aiMessage = useCanonicalConversation
                  ? await persistAssistantToCanonical({
                      content: zenResponse.response,
                      timestamp: new Date().toISOString(),
                      metadata: {
                        model: 'optimized-zen-multi-model',
                        orchestration_status: 'optimized_zen_success',
                        agent_id: 'zen-multi-model',
                      },
                    })
                  : await Store.createMessage(
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
              const guardedOrchestrationResponse = applyHumanConversationGuard(orchestrationResult.response, {
                userMessage: req.body.message || req.body.content,
              });
              const aiMessage = useCanonicalConversation
                ? await persistAssistantToCanonical({
                    content: guardedOrchestrationResponse,
                    timestamp: new Date().toISOString(),
                    metadata: {
                      model: 'orchestration',
                      orchestration_status: orchestrationResult.status,
                      agent_id: orchestrationResult.agent_id,
                    },
                  })
                : await Store.createMessage(req.user.id, req.params.id, {
                  message: guardedOrchestrationResponse,
                  content: guardedOrchestrationResponse,
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

        const allMessages = await loadConversationMessages();
        const conversationHistory = buildConversationHistory(allMessages);

        console.log(`📚 [Conversations API] Loaded ${conversationHistory.length} messages from conversation history`);

        const brain = new ServerPersonaBrain(req.user.id);
        const config = {
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

        const guardedZenResponse = applyHumanConversationGuard(zenResponse.response, {
          userMessage: req.body.message || req.body.content,
        });

        const aiMessage = useCanonicalConversation
          ? await persistAssistantToCanonical({
              content: guardedZenResponse,
              timestamp: new Date().toISOString(),
              metadata: {
                model: 'zen-multi-model',
              },
            })
          : await Store.createMessage(req.user.id, req.params.id, {
              content: guardedZenResponse,
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
          content: guardedZenResponse
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

      const allMessages = await loadConversationMessages();
      const conversationHistory = buildConversationHistory(allMessages).slice(-50);

      console.log(`📚 [Conversations API] Loaded ${conversationHistory.length} messages for GPT seat context`);

      // Process message with unlimited conversational scope + conversation history
      // Extract image attachments if provided (base64 format from frontend)
      const attachments = req.body.attachments || [];
      if (attachments.length > 0) {
        console.log(`📎 [Conversations API] Processing ${attachments.length} image attachments`);
      }

      const aiResponse = await gptRuntime.processMessage(
        gptId,
        req.body.message || req.body.content,
        req.user.id,
        conversationId,
        identityFiles,
        conversationHistory,
        attachments
      );

      console.log(`✅ [Conversations API] Generated response: "${aiResponse.content}"`);
      console.log(`   Model: ${aiResponse.model}`);
      console.log(`   Freedom: ${aiResponse.conversational_freedom}`);
      console.log(`   Restrictions: ${aiResponse.topic_restrictions}`);

      const guardedRuntimeResponse = applyHumanConversationGuard(aiResponse.content, {
        userMessage: req.body.message || req.body.content,
      });

      const aiMessage = useCanonicalConversation
        ? await persistAssistantToCanonical({
            content: guardedRuntimeResponse,
            timestamp: aiResponse.timestamp,
            metadata: {
              model: aiResponse.model,
              files: aiResponse.files,
              actions: aiResponse.actions,
              attachments,
            },
          })
        : await Store.createMessage(req.user.id, req.params.id, {
          message: guardedRuntimeResponse,
          content: guardedRuntimeResponse,
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
          content: guardedRuntimeResponse,
          timestamp: aiResponse.timestamp
        });
      } catch (hookError) {
        console.warn(`⚠️ [Conversations API] Capsule update failed:`, hookError.message);
        // Don't fail the request if capsule update fails
      }

      if (!useCanonicalConversation) {
        await syncGPTConversationToVvault(
          req.user.id,
          req.user.email,
          conversationId,
          gptId,
          gptId,
          req.body.message || req.body.content,
          guardedRuntimeResponse
        );
      }

      // Return both the user message and AI response with unrestricted metadata
      res.status(201).json({
        ok: true,
        message: userMessage,
        aiResponse: aiMessage,
        content: guardedRuntimeResponse, // For compatibility with test expectations
        runtime_receipt: {
          created_at: new Date().toISOString(),
          route_mode: 'conversations_message',
          construct_id: constructId,
          _noncanonical: true,
          _canonical_path: '/api/vvault/message',
          _disclaimer: 'Stub receipt. Canonical runtime: /api/vvault/message.',
        },
        orchestration_checklist: {
          responseStatus: 'conversations_routed',
          route: '/api/conversations/:id/messages',
          _noncanonical: true,
          _canonical_path: '/api/vvault/message',
          _disclaimer: 'Stub checklist. Canonical runtime: /api/vvault/message.',
        },
        _noncanonical: true,
        _canonical_path: '/api/vvault/message',
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
