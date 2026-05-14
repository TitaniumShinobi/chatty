/**
 * Lin Chat Route - Multi-provider LLM routing with Memory Injection
 * 
 * ROUTE CLASSIFICATION: NONCANONICAL (helper)
 * This is a helper/dev route that bypasses the canonical orchestration runtime path
 * (/api/vvault/message). It emits skeleton runtime_receipt and orchestration_checklist
 * fields for observability parity but does NOT go through the full canonical pipeline
 * (VVAULT proxy, transcript truth preflight, continuity recovery, identity coherence guard).
 * 
 * New consumers should target /api/vvault/message for the canonical runtime path.
 * 
 * Supports both OpenRouter (cloud) and Ollama (self-hosted) models.
 * Model strings should be prefixed with their provider:
 *   - openrouter:provider/model-name -> Routes to OpenRouter API
 *   - ollama:model:size -> Routes to Ollama server (if configured)
 * 
 * Memory Enhancement:
 *   - When constructId is provided, loads transcripts from Supabase
 *   - Injects relevant conversation history into system prompts
 * 
 * @see docs/MODEL_PROVIDERS.md for setup instructions
 */

import express from 'express';
import OpenAI from 'openai';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { GPTManager } from '../lib/gptManager.js';
import { loadIdentityFiles } from '../lib/identityLoader.js';
import { extractAndStoreAnchors } from '../lib/verifiedMemoryLoader.js';
import { LIN_MODEL_DEFAULTS } from '../lib/linModelDefaults.js';
import { attachRuntimePathMarkers } from '../lib/vvaultReceiptAssembly.js';
import { classifyVvaultRouteFallback } from '../lib/vvaultFallbackClassification.js';

const router = express.Router();
const routeOverrides = {
  callOpenRouter: null,
  callOllama: null,
  loadTranscriptMemories: null,
  openaiDirectClient: null,
  openaiIntegrationClient: null,
};

function getGptManager() {
  return GPTManager.getInstance();
}

// Initialize OpenRouter client using Replit AI Integrations
const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || 'dummy',
});

// OpenAI client: prefer Replit AI Integrations proxy, fallback to direct API key
const openaiIntegration = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY) ? new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
}) : null;
const DIRECT_OPENAI_KEY = process.env.OPENAI_API_KEY;
const openaiDirect = DIRECT_OPENAI_KEY ? new OpenAI({
  baseURL: 'https://api.openai.com/v1',
  apiKey: DIRECT_OPENAI_KEY,
}) : null;

const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

const DEFAULT_SEAT_MODELS = {
  creative: LIN_MODEL_DEFAULTS.creative,
  coding: LIN_MODEL_DEFAULTS.coding,
  smalltalk: LIN_MODEL_DEFAULTS.smalltalk,
};

/**
 * Parse model string to extract provider and model name
 * @param {string} modelString - e.g., 'openrouter:mistralai/mistral-7b-instruct' or 'ollama:phi4-mini:latest'
 * @returns {{ provider: string, model: string }}
 */
function parseModelString(modelString) {
  if (!modelString) {
    return parseModelString(DEFAULT_SEAT_MODELS.smalltalk);
  }
  
  if (modelString.startsWith('openrouter:')) {
    return { provider: 'openrouter', model: modelString.substring(11) };
  }
  
  if (modelString.startsWith('openai:')) {
    return { provider: 'openai', model: modelString.substring(7) };
  }
  
  if (modelString.startsWith('ollama:')) {
    return { provider: 'ollama', model: modelString.substring(7) };
  }
  
  // Detect OpenAI model names (gpt-*, o1-*, o3-*, etc.)
  if (/^(gpt-|o1-|o3-|davinci|curie|babbage|ada)/.test(modelString)) {
    return { provider: 'openai', model: modelString };
  }
  
  // Legacy format - assume it's an OpenRouter model if it contains '/'
  if (modelString.includes('/')) {
    return { provider: 'openrouter', model: modelString };
  }
  
  // Otherwise assume Ollama (backwards compatibility)
  return { provider: 'ollama', model: modelString };
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(model, messages, options = {}) {
  const completion = await openrouter.chat.completions.create({
    model,
    messages,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature || 0.7,
  });
  
  return completion.choices[0]?.message?.content || '';
}

/**
 * Load transcripts from Supabase for memory injection
 * Uses hierarchical path structure to prioritize recent and relevant memories
 * 
 * @param {string} constructId - Construct callsign (e.g., 'katana-001', 'nova-001')
 * @param {string} userEmail - User's email for Supabase lookup (required for security)
 * @param {Object} options - Optional configuration
 * @param {number} options.maxFiles - Maximum files to load (default: 25)
 * @param {number} options.maxMemories - Maximum memory snippets to inject (default: 50)
 * @param {string} options.platform - Filter to specific platform (e.g., 'chatgpt')
 * @param {string} options.year - Filter to specific year
 * @param {string} options.month - Filter to specific month
 * @returns {Promise<string>} Formatted memory context
 */
function scoreAnchorPairs(pairs, query, maxResults = 20) {
  if (!pairs || pairs.length === 0 || !query) return [];
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

  const scored = pairs.map((pair, index) => {
    const combined = ((pair.user || '') + ' ' + (pair.assistant || '')).toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (combined.includes(word)) score += 3;
    }
    const recencyBonus = Math.max(0, Math.round((index / Math.max(pairs.length - 1, 1)) * 4));
    score += recencyBonus;
    if (pair.user && pair.user.length > 30 && pair.assistant && pair.assistant.length > 50) score += 1;
    return { ...pair, score, index };
  });

  return scored
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

async function loadTranscriptMemoriesDetailed(constructId, userEmail, options = {}) {
  const startTime = Date.now();
  const maxFiles = options.maxFiles || 50;
  const maxMemories = options.maxMemories || 100;
  
  if (!userEmail) {
    console.log('⚠️ [LinChat Memory] No user email provided - memory access denied');
    return { status: 'memory_denied', context: '', reason: 'missing_user_email' };
  }
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log('⚠️ [LinChat Memory] Supabase not configured');
      return { status: 'memory_unavailable', context: '', reason: 'supabase_unconfigured' };
    }
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${userEmail},name.eq.${userEmail}`)
      .limit(1)
      .single();
    
    if (userError || !user) {
      console.log(`⚠️ [LinChat Memory] User not found: ${userEmail}`);
      return { status: 'memory_unavailable', context: '', reason: 'user_not_found' };
    }

    // === FAST PATH: Check for pre-extracted memory anchors ===
    const anchorFilename = `instances/${constructId}/memory_anchors.json`;
    try {
      const { data: anchorFile, error: anchorError } = await supabase
        .from('vault_files')
        .select('content')
        .eq('user_id', user.id)
        .eq('filename', anchorFilename)
        .single();

      if (!anchorError && anchorFile?.content) {
        const anchors = JSON.parse(anchorFile.content);
        if (anchors.pairs && anchors.pairs.length > 0) {
          const userQuery = options.currentMessage || constructId;
          const topPairs = scoreAnchorPairs(anchors.pairs, userQuery, maxMemories);
          const fastElapsed = Date.now() - startTime;
          console.log(`⚡ [LinChat Memory] FAST PATH: Scored ${topPairs.length}/${anchors.pairs.length} anchor pairs in ${fastElapsed}ms for ${constructId}`);

          if (topPairs.length > 0) {
            let memoryContext = `## MEMORY - Previous Conversations\n`;
            memoryContext += `You have these memories from past conversations with this user (${anchors.pairs.length} total anchors):\n\n`;
            memoryContext += topPairs.map(p => `User: ${p.user}\nAssistant: ${p.assistant}`).join('\n\n');
            memoryContext += `\n\nUse these memories to maintain continuity and reference past discussions when relevant.`;
            return { status: 'memory_loaded', context: memoryContext, reason: 'anchor_fast_path' };
          }
        }
      }
    } catch (anchorErr) {
      console.log(`⚠️ [LinChat Memory] Anchor lookup failed, falling to slow path: ${anchorErr.message}`);
    }

    // === SLOW PATH: Load all transcript files (with 10s timeout) ===
    console.log(`🐢 [LinChat Memory] No anchors found for ${constructId}, using slow path...`);
    const slowStartTime = Date.now();
    const SLOW_PATH_TIMEOUT = 10000;

    let query = supabase
      .from('vault_files')
      .select('filename, content, metadata')
      .eq('user_id', user.id)
      .eq('file_type', 'transcript')
      .or(`construct_id.eq.${constructId},filename.ilike.%${constructId}%`);
    
    if (options.platform) {
      query = query.or(`metadata->>source.eq.${options.platform},filename.ilike.%/${options.platform}/%`);
    }
    if (options.year) {
      query = query.or(`metadata->>year.eq.${options.year},filename.ilike.%/${options.year}/%`);
    }
    if (options.month) {
      query = query.or(`metadata->>month.eq.${options.month},filename.ilike.%/${options.month}/%`);
    }
    
    const { data: files, error } = await query
      .order('created_at', { ascending: false })
      .limit(maxFiles);
    
    if (error || !files || files.length === 0) {
      console.log(`📚 [LinChat Memory] No transcripts found for ${constructId}`);
      return { status: 'memory_empty', context: '', reason: 'no_transcripts_found' };
    }
    
    const groupedFiles = {};
    for (const file of files) {
      const source = file.metadata?.source || 'unknown';
      const year = file.metadata?.year || '';
      const month = file.metadata?.month || '';
      const key = `${source}${year ? `/${year}` : ''}${month ? `/${month}` : ''}`;
      if (!groupedFiles[key]) groupedFiles[key] = [];
      groupedFiles[key].push(file);
    }
    
    console.log(`📚 [LinChat Memory] Loading ${files.length} transcripts from ${Object.keys(groupedFiles).length} sources for ${constructId}`);
    
    const memories = [];
    const memoryBySource = {};
    let allContentForAnchors = '';
    let timedOut = false;
    
    for (const file of files) {
      if (Date.now() - slowStartTime > SLOW_PATH_TIMEOUT) {
        console.log(`⏱️ [LinChat Memory] Slow path timeout reached after ${Date.now() - slowStartTime}ms, returning ${memories.length} memories collected so far`);
        timedOut = true;
        break;
      }

      if (!file.content) continue;
      
      allContentForAnchors += file.content + '\n';

      const source = file.metadata?.source || 'unknown';
      const year = file.metadata?.year || '';
      const month = file.metadata?.month || '';
      const contextLabel = `[${source}${year ? ` ${year}` : ''}${month ? ` ${month}` : ''}]`;
      
      const lines = file.content.split('\n');
      let currentExchange = [];
      
      for (const line of lines) {
        const speakerMatch = line.match(/^\[?[^\]]*\]?\s*\*?\*?([^:*\[\]]+)\*?\*?:\s*(.*)$/);
        if (speakerMatch) {
          const speaker = speakerMatch[1].trim();
          const content = speakerMatch[2].trim();
          if (content && content.length > 5) {
            currentExchange.push(`${speaker}: ${content}`);
            if (currentExchange.length > 8) {
              currentExchange.shift();
            }
          }
        }
      }
      
      if (currentExchange.length > 0) {
        const fileMemories = currentExchange.slice(-3).map(m => `${contextLabel} ${m}`);
        memories.push(...fileMemories);
        
        if (!memoryBySource[source]) memoryBySource[source] = [];
        memoryBySource[source].push(...currentExchange.slice(-3));
      }
    }

    // Trigger anchor extraction in background (non-blocking) so next request uses fast path
    if (allContentForAnchors.length > 100) {
      extractAndStoreAnchors(constructId, allContentForAnchors, `combined-transcripts-${constructId}`)
        .then(result => {
          if (result) {
            console.log(`🔧 [LinChat Memory] Background anchor extraction complete for ${constructId}: ${result.pairCount} pairs stored`);
          }
        })
        .catch(err => {
          console.warn(`⚠️ [LinChat Memory] Background anchor extraction failed for ${constructId}:`, err.message);
        });
    }
    
    if (memories.length === 0) {
      return { status: 'memory_empty', context: '', reason: 'insufficient_memory_matches' };
    }
    
    let memoryContext = `## MEMORY - Previous Conversations\n`;
    memoryContext += `You have these memories from past conversations with this user across ${Object.keys(memoryBySource).length} platform(s):\n\n`;
    memoryContext += memories.slice(0, maxMemories).join('\n');
    memoryContext += `\n\nUse these memories to maintain continuity and reference past discussions when relevant.`;
    
    const slowElapsed = Date.now() - startTime;
    console.log(`✅ [LinChat Memory] SLOW PATH: Injected ${Math.min(memories.length, maxMemories)} memory snippets from ${files.length} files in ${slowElapsed}ms${timedOut ? ' (timed out)' : ''}`);
    return {
      status: timedOut ? 'memory_loaded_partial' : 'memory_loaded',
      context: memoryContext,
      reason: timedOut ? 'slow_path_timeout_partial' : 'slow_path_complete',
    };
  } catch (error) {
    console.error('❌ [LinChat Memory] Error loading memories:', error.message);
    return { status: 'memory_error', context: '', reason: error.message || 'memory_load_failed' };
  }
}

/**
 * Call Ollama API
 * NOTE: Requires OLLAMA_HOST environment variable to be set
 */
async function callOllama(model, messages, options = {}) {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  
  // Convert messages to Ollama format (simple prompt)
  const prompt = messages.map(m => {
    if (m.role === 'system') return `System: ${m.content}`;
    if (m.role === 'user') return `User: ${m.content}`;
    if (m.role === 'assistant') return `Assistant: ${m.content}`;
    return m.content;
  }).join('\n\n');
  
  const response = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 2048,
      }
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama error: ${error}`);
  }
  
  const data = await response.json();
  return data.response || '';
}

function buildLinRouteContract({
  responseStatus,
  provider,
  model,
  requestClock = null,
  requestId = null,
  fallbackUsed = false,
}) {
  return attachRuntimePathMarkers({
    runtimeReceipt: {
      created_at: requestClock || new Date().toISOString(),
      request_id: requestId || null,
      route_mode: 'lin_generate',
      provider: {
        provider,
        model,
        final_provider: provider,
        fallback_used: fallbackUsed,
      },
    },
    orchestrationChecklist: {
      responseStatus,
      route: '/api/lin/generate',
      request_id: requestId || null,
    },
    route: '/api/lin/generate',
    canonical: false,
  });
}

/**
 * POST /api/lin/generate
 * Generate a response using the appropriate provider
 * 
 * Memory injection (enabled when constructId is provided):
 *   - constructId: Construct callsign for memory lookup
 *   - memoryOptions: Optional configuration for memory retrieval
 *     - maxFiles: Maximum transcript files to load (default: 50)
 *     - maxMemories: Maximum memory snippets to inject (default: 100)
 *     - platform: Filter to specific platform (e.g., 'chatgpt')
 *     - year: Filter to specific year (e.g., '2025')
 *     - month: Filter to specific month (e.g., 'December')
 *   - User email is taken from authenticated session (req.user.email)
 */
router.post('/generate', async (req, res) => {
  try {
    const { 
      prompt, 
      seat = 'creative', 
      systemPrompt, 
      model: requestedModel,
      constructId,
      memoryOptions = {}
    } = req.body;
    
    // Get authenticated user email for secure memory access
    const userEmail = req.user?.email;
    
    if (!prompt) {
      const contract = buildLinRouteContract({
        responseStatus: 'invalid_request',
        provider: null,
        model: null,
        requestClock: req.clock || null,
        requestId: req.requestId || null,
      });
      return res.status(400).json({
        error: 'Prompt is required',
        runtime_receipt: contract.runtimeReceipt,
        orchestration_checklist: contract.orchestrationChecklist,
        _noncanonical: true,
        _canonical_path: '/api/vvault/message',
      });
    }

    // Security: Require authentication when memory access is requested
    if (constructId && !userEmail) {
      console.log('🔒 [Lin Chat] Memory access denied - authentication required');
      const contract = buildLinRouteContract({
        responseStatus: 'memory_auth_required',
        provider: null,
        model: null,
        requestClock: req.clock || null,
        requestId: req.requestId || null,
      });
      return res.status(401).json({
        error: 'Authentication required for memory-enhanced responses',
        runtime_receipt: contract.runtimeReceipt,
        orchestration_checklist: contract.orchestrationChecklist,
        _noncanonical: true,
        _canonical_path: '/api/vvault/message',
      });
    }

    // Determine which model to use
    const modelString = requestedModel || DEFAULT_SEAT_MODELS[seat] || DEFAULT_SEAT_MODELS.creative;
    const { provider, model } = parseModelString(modelString);
    
    console.log(`🎭 [Lin Chat] Generating response using ${provider}:${model} (${seat} seat)`);
    if (constructId) {
      const optionsStr = Object.keys(memoryOptions).length > 0 ? ` with options: ${JSON.stringify(memoryOptions)}` : '';
      console.log(`🧠 [Lin Chat] Memory injection enabled for construct: ${constructId} (user: ${userEmail})${optionsStr}`);
    }

    // Load GPT identity (instructions) if constructId provided
    let identityPrompt = '';
    if (constructId) {
      // First try to load from GPT database (custom GPTs)
      const gpt = await getGptManager().getGPTByCallsign(constructId);
      if (gpt && gpt.instructions) {
        identityPrompt = `# Identity: ${gpt.name}\n\nYou are ${gpt.name}. ${gpt.description || ''}\n\n${gpt.instructions}`;
        console.log(`🎭 [LinChat] Loaded identity from GPT database: ${gpt.name} (${constructId})`);
      } else {
        // Fallback to identity files (for system constructs like Zen, Lin)
        try {
          const userId = req.user?.id || req.user?.sub || 'anonymous';
          const identityFiles = await loadIdentityFiles(userId, constructId, false);
          if (identityFiles?.prompt) {
            identityPrompt = identityFiles.prompt;
            if (identityFiles.conditioning) {
              identityPrompt += `\n\n${identityFiles.conditioning}`;
            }
            console.log(`🎭 [LinChat] Loaded identity from files for: ${constructId}`);
          }
        } catch (err) {
          console.warn(`⚠️ [LinChat] Could not load identity files for ${constructId}:`, err.message);
        }
      }
    }

    // Load transcript memories if constructId provided and user authenticated
    let memoryContext = '';
    let memoryStatus = { status: 'memory_skipped', context: '', reason: 'construct_not_requested' };
    if (constructId && userEmail) {
      const loadTranscriptMemoriesImpl = routeOverrides.loadTranscriptMemories || loadTranscriptMemoriesDetailed;
      memoryStatus = await loadTranscriptMemoriesImpl(constructId, userEmail, memoryOptions);
      memoryContext = memoryStatus.context || '';
    }

    let enhancedSystemPrompt = '';
    if (identityPrompt) {
      enhancedSystemPrompt = identityPrompt;
    }
    const isGptCommand = prompt.trim().toLowerCase().startsWith('/gpt');
    if (isGptCommand && (constructId === 'lin-001' || !constructId)) {
      const gptSignal = `GPT CREATION PROTOCOL: The user has invoked the /gpt command to create a new GPT construct. You have the ability to open the GPT workshop by including [OPEN_GPT_CREATOR] at the very end of your response.
- If the user provided detailed specs alongside /gpt (name, description, instructions), acknowledge briefly and include [OPEN_GPT_CREATOR] immediately — they're ready to build.
- If the user just typed "/gpt" with no details, ask clarifying questions first. What kind of construct? What personality? What purpose? Gather enough to give them a good starting point.
- Once you feel you have enough context from the conversation, include [OPEN_GPT_CREATOR] at the end of your response to open the workshop with their idea.
- The signal [OPEN_GPT_CREATOR] is hidden from the user — they just see the workshop open naturally.
- ONLY include [OPEN_GPT_CREATOR] when the user is actively creating a GPT via the /gpt command. NEVER include it during normal conversation.
- You control the pacing. Be conversational, not robotic.`;
      enhancedSystemPrompt = enhancedSystemPrompt ? `${enhancedSystemPrompt}\n\n${gptSignal}` : gptSignal;
    }
    if (systemPrompt) {
      enhancedSystemPrompt = enhancedSystemPrompt ? `${enhancedSystemPrompt}\n\n${systemPrompt}` : systemPrompt;
    }
    const linUserName = req.user?.name || req.user?.given_name || 'the user';
    const userIdentityBlock = `## User Identity\nThe user you are speaking with is named "${linUserName}". Address them by name when appropriate. Remember their name throughout the conversation.${req.user?.email ? `\nTheir email is ${req.user.email}.` : ''}`;
    enhancedSystemPrompt = enhancedSystemPrompt ? `${enhancedSystemPrompt}\n\n${userIdentityBlock}` : userIdentityBlock;
    let searchIntentReason = 'skipped_short_message';
    let searchInjected = false;
    const isShortMessage = prompt.length < 100 && !/\b(search|find|look up|what is|who is|how to|\/search)\b/i.test(prompt);
    if (!isShortMessage) {
      try {
        const { injectSearchContext } = await import('./search.js');
        if (injectSearchContext) {
          const {
            enhancedPrompt,
            intent_reason: searchIntentReasonResolved,
            search_injected: searchInjectedResolved,
          } = await injectSearchContext(prompt, enhancedSystemPrompt, { explicitOnly: true });
          enhancedSystemPrompt = enhancedPrompt;
          searchIntentReason = searchIntentReasonResolved || 'unknown';
          searchInjected = searchInjectedResolved === true;
        }
      } catch (searchErr) {
        console.warn('⚠️ [LinChat] Search injection skipped:', searchErr.message);
        searchIntentReason = 'search_injection_error';
      }
    } else {
      searchIntentReason = 'explicit_only_no_trigger';
    }
    if (memoryContext) {
      enhancedSystemPrompt = enhancedSystemPrompt ? `${enhancedSystemPrompt}\n\n${memoryContext}` : memoryContext;
    }

    // Build messages array
    const messages = [];
    if (enhancedSystemPrompt) {
      messages.push({ role: 'system', content: enhancedSystemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    console.log('[LinChat TURN_CONTEXT]', {
      constructId: constructId || 'lin-001',
      search_intent: searchIntentReason,
      search_injected: searchInjected,
      provider_requested: provider,
    });

    let response;
    let providerFallbackUsed = false;
    
    if (provider === 'openrouter') {
      let orSuccess = false;
      try {
        const callOpenRouterImpl = routeOverrides.callOpenRouter || callOpenRouter;
        response = await callOpenRouterImpl(model, messages);
        orSuccess = true;
      } catch (err) {
        const errStatus = err?.status || err?.response?.status || err?.error?.status;
        const is429 = errStatus === 429 || err.message?.includes('429');
        const isFreeModel = model.includes(':free');
        if (is429 && isFreeModel) {
          const fallbackModel = DEFAULT_OPENROUTER_MODEL;
          console.log(`⚠️ [Lin Chat] Free model ${model} rate-limited (429), falling back to ${fallbackModel}`);
          try {
            const callOpenRouterImpl = routeOverrides.callOpenRouter || callOpenRouter;
            response = await callOpenRouterImpl(fallbackModel, messages);
            providerFallbackUsed = true;
            orSuccess = true;
          } catch (err2) {
            console.error(`❌ [Lin Chat] OpenRouter fallback model also failed:`, err2.message);
          }
        } else {
          console.error(`❌ [Lin Chat] OpenRouter failed:`, err.message);
        }
      }
      if (!orSuccess) {
        const openaiDirectClient = routeOverrides.openaiDirectClient || openaiDirect;
        if (openaiDirectClient) {
          console.log(`🔄 [Lin Chat] All OpenRouter failed, trying OpenAI direct for ${seat} seat`);
          try {
            const completion = await openaiDirectClient.chat.completions.create({
              model: 'gpt-4.1-mini',
              messages,
              max_tokens: 2048,
            });
            response = completion.choices[0]?.message?.content || '';
            providerFallbackUsed = true;
            console.log(`✅ [Lin Chat] OpenAI direct fallback success (${response.length} chars)`);
          } catch (oaiErr) {
            console.error(`❌ [Lin Chat] OpenAI direct also failed:`, oaiErr.message);
            throw oaiErr;
          }
        } else {
          throw new Error('OpenRouter failed and no OpenAI fallback available');
        }
      }
    } else if (provider === 'openai') {
      const openaiClient =
        routeOverrides.openaiIntegrationClient ||
        openaiIntegration ||
        routeOverrides.openaiDirectClient ||
        openaiDirect;
      if (!openaiClient) {
        return res.status(503).json({ error: 'OpenAI not configured', details: 'No OpenAI integration or API key available.' });
      }
      try {
        const completion = await openaiClient.chat.completions.create({
          model: model || 'gpt-4.1-mini',
          messages,
          max_tokens: 2048,
        });
        response = completion.choices[0]?.message?.content || '';
      } catch (oaiErr) {
        const openaiDirectClient = routeOverrides.openaiDirectClient || openaiDirect;
        if (openaiDirectClient && openaiClient !== openaiDirectClient) {
          console.warn(`⚠️ [Lin Chat] OpenAI integration failed, trying direct: ${oaiErr.message}`);
          const completion = await openaiDirectClient.chat.completions.create({
            model: model || 'gpt-4.1-mini',
            messages,
            max_tokens: 2048,
          });
          response = completion.choices[0]?.message?.content || '';
        } else {
          throw oaiErr;
        }
      }
    } else if (provider === 'ollama') {
      if (!process.env.OLLAMA_HOST) {
        return res.status(503).json({
          error: 'Ollama not configured',
          details: 'Set OLLAMA_HOST environment variable to use Ollama models. See docs/MODEL_PROVIDERS.md for setup instructions.'
        });
      }
      const callOllamaImpl = routeOverrides.callOllama || callOllama;
      response = await callOllamaImpl(model, messages);
    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }
    
    console.log(`✅ [Lin Chat] Response generated via ${provider} (${response.length} chars)`);

    const contract = buildLinRouteContract({
      responseStatus: 'bypass_canonical',
      provider,
      model,
      requestClock: req.clock || null,
      requestId: req.requestId || null,
      fallbackUsed: providerFallbackUsed,
    });
    const fallback = classifyVvaultRouteFallback({
      route: '/api/lin/generate',
      reason: providerFallbackUsed ? 'provider_fallback' : 'helper_route_bypass_canonical',
      source: providerFallbackUsed ? 'provider_fallback' : memoryStatus.status,
      canonical: false,
    });

    res.json({
      response,
      model: `${provider}:${model}`,
      provider,
      seat,
      memory_status: memoryStatus,
      runtime_receipt: {
        ...contract.runtimeReceipt,
        memory_status: memoryStatus,
        fallback,
        _noncanonical: true,
        _canonical_path: '/api/vvault/message',
        _disclaimer: 'This is a stub receipt. The canonical runtime path is /api/vvault/message.',
      },
      orchestration_checklist: {
        ...contract.orchestrationChecklist,
        memory_status: memoryStatus,
        _noncanonical: true,
        _canonical_path: '/api/vvault/message',
        _disclaimer: 'This is a stub checklist. The canonical runtime path is /api/vvault/message.',
      },
      _noncanonical: true,
      _canonical_path: '/api/vvault/message',
    });
  } catch (error) {
    console.error('❌ [Lin Chat] Error:', error.message);
    const contract = buildLinRouteContract({
      responseStatus: 'helper_route_failure',
      provider: null,
      model: null,
      requestClock: req.clock || null,
      requestId: req.requestId || null,
    });
    res.status(500).json({
      error: 'Failed to generate response',
      details: error.message,
      runtime_receipt: {
        ...contract.runtimeReceipt,
        fallback: classifyVvaultRouteFallback({
          route: '/api/lin/generate',
          reason: 'helper_route_failure',
          source: 'lin_generate_exception',
          canonical: false,
        }),
      },
      orchestration_checklist: contract.orchestrationChecklist,
      _noncanonical: true,
      _canonical_path: '/api/vvault/message',
    });
  }
});

/**
 * GET /api/lin/health
 * Check provider availability
 */
router.get('/health', async (req, res) => {
  try {
    const providers = {
      openrouter: {
        available: !!(process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY),
        configured: true
      },
      ollama: {
        available: !!process.env.OLLAMA_HOST,
        configured: !!process.env.OLLAMA_HOST,
        host: process.env.OLLAMA_HOST || null
      }
    };
    
    const anyAvailable = providers.openrouter.available || providers.ollama.available;
    
    res.json({ 
      status: anyAvailable ? 'ok' : 'unavailable',
      providers,
      defaultSeats: DEFAULT_SEAT_MODELS,
      documentation: 'See docs/MODEL_PROVIDERS.md for setup instructions'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

/**
 * GET /api/lin/models
 * List available models from configured providers
 */
router.get('/models', async (req, res) => {
  try {
    const models = {
      openrouter: [
        'openrouter:meta-llama/llama-3.3-70b-instruct:free',
        'openrouter:meta-llama/llama-3.1-8b-instruct',
        'openrouter:meta-llama/llama-3.1-70b-instruct',
        'openrouter:mistralai/mistral-7b-instruct',
        'openrouter:qwen/qwen-2.5-72b-instruct',
      ],
      ollama: process.env.OLLAMA_HOST ? [
        LIN_MODEL_DEFAULTS.smalltalk,
        LIN_MODEL_DEFAULTS.creative,
        LIN_MODEL_DEFAULTS.coding,
        LIN_MODEL_DEFAULTS.codingFallback,
        'ollama:qwen2.5:0.5b',
        'ollama:llama3:8b',
      ] : []
    };
    
    res.json({
      models,
      defaultSeats: DEFAULT_SEAT_MODELS,
      note: '/api/lin/generate is a helper route. Construct-quality conversation uses /api/vvault/message; Ollama models require OLLAMA_HOST to be configured.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/lin/generate-anchors
 * Manually trigger anchor generation for a construct
 * Useful for bootstrapping constructs with lots of transcripts but no anchors yet
 */
router.post('/generate-anchors', async (req, res) => {
  try {
    const { constructId } = req.body;
    const userEmail = req.user?.email;

    if (!constructId) {
      return res.status(400).json({ error: 'constructId is required' });
    }
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const startTime = Date.now();
    console.log(`🔧 [LinChat Anchors] Starting anchor generation for ${constructId} (triggered by ${userEmail})`);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${userEmail},name.eq.${userEmail}`)
      .limit(1)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data: files, error: filesError } = await supabase
      .from('vault_files')
      .select('filename, content, metadata')
      .eq('user_id', user.id)
      .eq('file_type', 'transcript')
      .or(`construct_id.eq.${constructId},filename.ilike.%${constructId}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filesError || !files || files.length === 0) {
      return res.status(404).json({ error: `No transcripts found for construct ${constructId}` });
    }

    console.log(`📚 [LinChat Anchors] Found ${files.length} transcript files for ${constructId}`);

    let combinedContent = '';
    for (const file of files) {
      if (file.content) {
        combinedContent += file.content + '\n';
      }
    }

    if (combinedContent.length < 100) {
      return res.status(400).json({ error: 'Transcript content too short for anchor extraction' });
    }

    const result = await extractAndStoreAnchors(constructId, combinedContent, `manual-generation-${constructId}`);
    const elapsed = Date.now() - startTime;

    if (result) {
      console.log(`✅ [LinChat Anchors] Generated ${result.pairCount} anchors for ${constructId} in ${elapsed}ms`);
      res.json({
        success: true,
        constructId,
        pairCount: result.pairCount,
        filesProcessed: files.length,
        elapsed: `${elapsed}ms`
      });
    } else {
      res.status(500).json({ error: 'Anchor extraction returned no results' });
    }
  } catch (error) {
    console.error('❌ [LinChat Anchors] Error:', error.message);
    res.status(500).json({ error: 'Failed to generate anchors', details: error.message });
  }
});

export const __test__ = {
  setRouteOverrides(overrides = {}) {
    Object.assign(routeOverrides, overrides);
  },
  clearRouteOverrides() {
    for (const key of Object.keys(routeOverrides)) {
      routeOverrides[key] = null;
    }
  },
  buildLinRouteContract,
};

export default router;
