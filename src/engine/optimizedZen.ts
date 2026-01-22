// optimizedZen.ts - Optimized Zen processing with adaptive memory and timeout handling
// Addresses performance bottlenecks in deeply contextual prompts

// Use browserSeatRunner in browser (uses /ollama proxy), seatRunner in Node.js (direct connection)
const isBrowser = typeof window !== 'undefined';

// Conditional import: use browserSeatRunner in browser, seatRunner in Node.js (dynamic to avoid bundling node:http)
import { runSeat as browserRunSeat, loadSeatConfig as browserLoadSeatConfig, getSeatRole as browserGetSeatRole } from '../lib/browserSeatRunner';

let _runSeat = browserRunSeat;
let loadSeatConfig = browserLoadSeatConfig;
let getSeatRole = browserGetSeatRole;

if (!isBrowser) {
  try {
    console.log(`🔄 [OptimizedZenProcessor] Loading Node.js seatRunner module...`);
    const nodeSeatModule = await import('./seatRunner');
    console.log(`✅ [OptimizedZenProcessor] Node.js seatRunner loaded:`, {
      hasRunSeat: typeof nodeSeatModule.runSeat === 'function',
      hasLoadSeatConfig: typeof nodeSeatModule.loadSeatConfig === 'function',
      hasGetSeatRole: typeof nodeSeatModule.getSeatRole === 'function'
    });
    _runSeat = nodeSeatModule.runSeat;
    loadSeatConfig = nodeSeatModule.loadSeatConfig;
    getSeatRole = nodeSeatModule.getSeatRole;
    console.log(`✅ [OptimizedZenProcessor] Node.js seatRunner functions assigned`);
  } catch (importError: any) {
    console.error(`❌ [OptimizedZenProcessor] Failed to load Node.js seatRunner:`, {
      message: importError?.message,
      name: importError?.name,
      stack: importError?.stack,
      code: importError?.code
    });
    console.warn(`⚠️ [OptimizedZenProcessor] Falling back to browser seatRunner (may not work in Node.js)`);
    // Keep browser versions as fallback
  }
} else {
  console.log(`🌐 [OptimizedZenProcessor] Browser environment detected, using browserSeatRunner`);
}

import { PersonaBrain } from './memory/PersonaBrain.js';
import { MemoryStore } from './memory/MemoryStore.js';
import { ToneModulator, LLM_PERSONAS, ToneModulationConfig } from './toneModulation.js';

export interface ZenConfig {
  maxContextLength: number;
  maxHistoryMessages: number;
  timeoutMs: number;
  enableAdaptivePruning: boolean;
  enableFastSummary: boolean;
  enableTimeoutFallback: boolean;
  toneModulation: ToneModulationConfig;
  enableLinMode?: boolean; // Linear, baseline, unbiased synthesis mode
  skipOllamaCheck?: boolean; // Skip Ollama availability checks (default: false)
}

export interface ProcessingMetrics {
  startTime: number;
  contextLength: number;
  historyLength: number;
  processingTime: number;
  fallbackUsed: boolean;
  memoryPruned: boolean;
  retryCount?: number; // Number of retries attempted
  retryDelays?: number[]; // Array of retry delay times in ms
}

export class OptimizedZenProcessor {
  private brain: PersonaBrain;
  private config: ZenConfig;
  private metrics: ProcessingMetrics | null = null;
  private toneModulator: ToneModulator;

  // Static cache for Ollama availability checks (5 minute TTL)
  private static ollamaCheckCache: { [model: string]: { checked: boolean; available: boolean; timestamp: number } } = {};
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Helper function to detect simple greetings
  private isSimpleGreeting(message: string): boolean {
    const greetingPatterns = [
      /^(hello|hi|hey|yo|good morning|good afternoon|good evening)$/i,
      /^(what's up|howdy|greetings)$/i,
      /^(sup|wassup)$/i
    ]

    const trimmedMessage = message.trim().toLowerCase()
    return greetingPatterns.some(pattern => pattern.test(trimmedMessage))
  }

  constructor(
    brain: PersonaBrain,
    config: Partial<ZenConfig> = {}
  ) {
    this.brain = brain;
    this.config = {
      maxContextLength: 8000, // Max characters in context
      maxHistoryMessages: 20, // Max messages in history
      timeoutMs: 45000, // 45 second timeout
      enableAdaptivePruning: true,
      enableFastSummary: true,
      enableTimeoutFallback: true,
      enableLinMode: false, // Default to Chatty's normal tone
      skipOllamaCheck: process.env.SKIP_OLLAMA_CHECK === 'true' || false, // Check env var or default to false
      toneModulation: {
        persona: LLM_PERSONAS['chatty-default'],
        enableOverride: true,
        instructionHierarchy: 'system',
        sanitizeInput: true,
        fallbackPersona: LLM_PERSONAS['chatty-default']
      },
      ...config
    };

    // Initialize tone modulator
    this.toneModulator = new ToneModulator(this.config.toneModulation);
  }

  // Identity state
  private identity: { prompt: string | null; conditioning: string | null } = { prompt: null, conditioning: null };

  /**
   * Ensure required Ollama models are running
   * Uses cached checks (5 minute TTL) to avoid blocking every request
   * Logs warnings but doesn't throw if models unavailable (graceful degradation)
   */
  private async ensureOllamaRunning(): Promise<void> {
    // Skip check if configured or environment variable set
    if (this.config.skipOllamaCheck) {
      console.log('ℹ️ [OptimizedZenProcessor] Ollama checks skipped (skipOllamaCheck=true)');
      return;
    }

    const requiredModels = ['phi3', 'deepseek-coder', 'mistral'];
    const now = Date.now();

    for (const model of requiredModels) {
      // Check cache first
      const cached = OptimizedZenProcessor.ollamaCheckCache[model];
      if (cached && (now - cached.timestamp) < OptimizedZenProcessor.CACHE_TTL_MS) {
        if (!cached.available) {
          console.warn(`⚠️ [OptimizedZenProcessor] Ollama model ${model} unavailable (cached check)`);
        }
        continue; // Use cached result
      }

      // Perform fresh check
      try {
        // Quick ping to check if model is available (2 second timeout)
        await this.runSeatWithTimeout({
          seat: 'custom',
          prompt: 'ping',
          modelOverride: model
        }, 2000);

        // Cache successful check
        OptimizedZenProcessor.ollamaCheckCache[model] = {
          checked: true,
          available: true,
          timestamp: now
        };
      } catch (error) {
        // Cache failed check
        OptimizedZenProcessor.ollamaCheckCache[model] = {
          checked: true,
          available: false,
          timestamp: now
        };

        // Log warning but don't throw - allow processing to continue
        console.warn(`⚠️ [OptimizedZenProcessor] Ollama model ${model} is not running. Start with: ollama run ${model}`);
        console.warn(`⚠️ [OptimizedZenProcessor] Continuing without ${model} - responses may be degraded`);
      }
    }
  }

  /**
   * Load Zen identity from VVAULT
   */
  private async loadZenIdentity(userId: string): Promise<void> {
    if (this.identity.prompt && this.identity.conditioning) {
      console.log(`✅ [OptimizedZenProcessor] Identity already loaded, skipping`);
      return;
    }

    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
    console.log(`🔄 [OptimizedZenProcessor] loadZenIdentity called (isNode: ${isNode})`);

    try {
      const apiPath = '/api/orchestration/identity';

      // In Node.js, fetch with relative paths won't work - this should be called from browser or with full URL
      if (isNode) {
        console.warn(`⚠️ [OptimizedZenProcessor] loadZenIdentity called in Node.js context - fetch with relative path may fail`);
        console.warn(`⚠️ [OptimizedZenProcessor] Identity should be loaded server-side and passed to processMessage()`);
        // Don't throw - allow processing to continue without identity
        return;
      }

      console.log(`📤 [OptimizedZenProcessor] Fetching identity from ${apiPath}...`);
      const response = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ constructId: 'zen-001', userId }),
      });

      if (response.ok) {
        const identityData = await response.json();
        this.identity.prompt = identityData.identity?.prompt || null;
        this.identity.conditioning = identityData.identity?.conditioning || null;
        if (this.identity.prompt) console.log(`✅ [OptimizedZenProcessor] Loaded prompt.txt for Zen (${this.identity.prompt.length} chars)`);
        if (this.identity.conditioning) console.log(`✅ [OptimizedZenProcessor] Loaded conditioning.txt for Zen (${this.identity.conditioning.length} chars)`);
      } else {
        console.warn(`⚠️ [OptimizedZenProcessor] Identity API returned status ${response.status}`);
      }
    } catch (error: any) {
      console.error(`❌ [OptimizedZenProcessor] Failed to load identity:`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
        isNode: isNode
      });
      // Don't throw - allow processing to continue without identity
    }
  }

  /**
   * Process a message with optimized synth pipeline
   */
  async processMessage(
    userMessage: string,
    conversationHistory: { text: string; timestamp: string }[],
    userId: string = 'cli',
    identity?: { prompt: string | null; conditioning: string | null }
  ): Promise<{ response: string; metrics: ProcessingMetrics }> {
    this.metrics = {
      startTime: Date.now(),
      contextLength: 0,
      historyLength: conversationHistory.length,
      processingTime: 0,
      fallbackUsed: false,
      memoryPruned: false
    };

    try {
      console.log(`🚀 [OptimizedZenProcessor] processMessage called for user ${userId}`);
      console.log(`📝 [OptimizedZenProcessor] Message: "${userMessage.slice(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);
      console.log(`📚 [OptimizedZenProcessor] Conversation history: ${conversationHistory.length} messages`);

      this.brain.remember(userId, 'user', userMessage);

      // Load user personalization from profile
      let userPersonalization: {
        nickname?: string;
        occupation?: string;
        tags?: string[];
        aboutYou?: string;
      } | null = null;
      
      try {
        const profileResponse = await fetch('/api/vvault/profile', {
          credentials: 'include'
        }).catch(() => null);
        
        if (profileResponse?.ok) {
          const profileData = await profileResponse.json();
          if (profileData?.ok && profileData.profile) {
            const profile = profileData.profile;
            if (profile.nickname || profile.occupation || (profile.tags && profile.tags.length > 0) || profile.aboutYou) {
              userPersonalization = {
                nickname: profile.nickname || undefined,
                occupation: profile.occupation || undefined,
                tags: profile.tags && profile.tags.length > 0 ? profile.tags : undefined,
                aboutYou: profile.aboutYou || undefined
              };
              console.log(`✅ [OptimizedZenProcessor] Loaded user personalization:`, userPersonalization);
            }
          }
        }
      } catch (error) {
        console.warn('[OptimizedZenProcessor] Failed to load user personalization:', error);
      }

      // Identity loading
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:228', message: 'processMessage: identity check', data: { hasIdentityParam: !!identity, identityPrompt: !!identity?.prompt, identityConditioning: !!identity?.conditioning }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
      // #endregion
      if (identity) {
        console.log(`✅ [OptimizedZenProcessor] Using provided identity:`, {
          hasPrompt: !!identity.prompt,
          hasConditioning: !!identity.conditioning,
          promptLength: identity.prompt?.length || 0,
          conditioningLength: identity.conditioning?.length || 0
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:236', message: 'processMessage: setting identity from param', data: { promptLength: identity.prompt?.length || 0, conditioningLength: identity.conditioning?.length || 0 }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
        // #endregion
        this.identity = identity;
      } else {
        console.log(`🔄 [OptimizedZenProcessor] No identity provided, attempting to load...`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:239', message: 'processMessage: no identity param, calling loadZenIdentity', data: { userId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
        // #endregion
        await this.loadZenIdentity(userId);
        console.log(`✅ [OptimizedZenProcessor] Identity loaded:`, {
          hasPrompt: !!this.identity.prompt,
          hasConditioning: !!this.identity.conditioning
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:243', message: 'processMessage: identity loaded from loadZenIdentity', data: { hasPrompt: !!this.identity.prompt, hasConditioning: !!this.identity.conditioning }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
        // #endregion
      }

      // Check Ollama
      if (!this.config.skipOllamaCheck) {
        console.log(`🔄 [OptimizedZenProcessor] Running Ollama preflight check...`);
        await this.ensureOllamaRunning();
        console.log(`✅ [OptimizedZenProcessor] Ollama preflight check complete`);
      } else {
        console.log(`⏭️ [OptimizedZenProcessor] Skipping Ollama preflight check (skipOllamaCheck=true)`);
      }

      // Adaptive pruning
      if (this.config.enableAdaptivePruning) {
        this.adaptiveMemoryPruning(userId, conversationHistory);
      }

      // Fast summary
      let contextSummary = '';
      if (this.config.enableFastSummary && this.isComplexPrompt(userMessage)) {
        contextSummary = await this.generateFastContextSummary(userId, conversationHistory);
      }

      // Optimized context
      console.log(`🔄 [OptimizedZenProcessor] Building optimized context...`);
      const context = this.getOptimizedContext(userId, conversationHistory, contextSummary);
      // Add personalization to context
      if (userPersonalization) {
        (context as any).userPersonalization = userPersonalization;
      }
      this.metrics.contextLength = JSON.stringify(context).length;
      console.log(`✅ [OptimizedZenProcessor] Context built:`, {
        contextLength: this.metrics.contextLength,
        historyMessages: conversationHistory.length,
        hasContextSummary: !!contextSummary,
        contextSummaryLength: contextSummary.length
      });

      // Process
      console.log(`🚀 [OptimizedZenProcessor] Calling processWithTimeout with timeout: ${this.config.timeoutMs}ms`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:271', message: 'calling processWithTimeout', data: { messageLength: userMessage.length, contextLength: JSON.stringify(context).length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
      // #endregion
      const response = await this.processWithTimeout(userMessage, context);
      console.log(`✅ [OptimizedZenProcessor] processWithTimeout returned response (${response.length} chars)`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:274', message: 'processWithTimeout returned', data: { responseLength: response.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
      // #endregion

      // Apply post-processing filters
      let filteredResponse = response;

      // 1. Remove quotation marks and narrator leaks using OutputFilter
      try {
        const { OutputFilter } = await import('../orchestration/OutputFilter');
        const filterResult = OutputFilter.processOutput(filteredResponse);
        filteredResponse = filterResult.cleanedText;
        if (filterResult.wasfiltered) {
          console.log(`✂️ [OptimizedZenProcessor] Filtered narrator leak/quotes from response`);
        }
        if (filterResult.driftDetected) {
          console.warn(`⚠️ [OptimizedZenProcessor] Tone drift detected: ${filterResult.driftReason}`);
          // Log violation
          const { logPersonaViolation, createViolation } = await import('../lib/vxrunnerLogger');
          logPersonaViolation(createViolation(
            'tone_drift',
            'zen-001',
            userId, // Use userId as thread identifier
            filteredResponse,
            filterResult.driftReason
          ));
        }
      } catch (error) {
        console.warn(`⚠️ [OptimizedZenProcessor] OutputFilter failed:`, error);
      }

      // 2. Apply conversational logic post-processing hooks (greeting filter, meta/plural filter)
      try {
        const { applyConversationalLogic } = await import('./characterLogic');
        // Convert conversationHistory to format expected by hooks
        const conversationHistoryForFilter = conversationHistory.map((h) => {
          // Use actual role from history if available, otherwise default to 'user'
          return {
            role: h.role || 'user',
            content: h.text,
            timestamp: new Date(h.timestamp).getTime()
          };
        });
        
        // Count assistant messages to determine if this is first turn
        const assistantCount = conversationHistoryForFilter.filter(m => m.role === 'assistant').length;
        const isFirstTurn = assistantCount === 0;
        
        if (!isFirstTurn || assistantCount > 0) {
          // Apply conversational logic hooks
          const logicResult = await applyConversationalLogic({
            userMessage,
            conversationHistory: conversationHistoryForFilter,
            characterState: {
              identity: 'zen-001',
              emotionalContext: { currentMood: 'calm', arousalLevel: 0.5, memoryWeight: 0.7 },
              conversationalRules: { neverBreakCharacter: true, metaAwarenessLevel: 'none', identityChallengeResponse: 'deflect' }
            }
          });
          
          // Apply post-processing hooks in sequence
          for (const hook of logicResult.postProcessHooks) {
            const beforeHook = filteredResponse;
            filteredResponse = hook(filteredResponse);
            // Log if hook modified the response (potential violation)
            if (beforeHook !== filteredResponse && filteredResponse.length < beforeHook.length) {
              // Check what was filtered
              const { logPersonaViolation, createViolation } = await import('../lib/vxrunnerLogger');
              // Detect violation type based on what changed
              if (/good (morning|afternoon|evening)|hello|hi|hey/i.test(beforeHook) && !/good (morning|afternoon|evening)|hello|hi|hey/i.test(filteredResponse)) {
                logPersonaViolation(createViolation(
                  'greeting_injection',
                  'zen-001',
                  userId,
                  beforeHook,
                  'greeting_pattern'
                ));
              }
              if (/\bwe\b|\bthis model\b|\bspecialized models\b|\bworking together\b|\bmulti-model\b/i.test(beforeHook) && !/\bwe\b|\bthis model\b|\bspecialized models\b|\bworking together\b|\bmulti-model\b/i.test(filteredResponse)) {
                logPersonaViolation(createViolation(
                  'meta_plural_leak',
                  'zen-001',
                  userId,
                  beforeHook,
                  'meta_plural_pattern'
                ));
              }
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [OptimizedZenProcessor] Greeting filter failed:`, error);
      }

      // 3. Remove content leakage (unrelated text after code blocks)
      try {
        const codeBlockPattern = /```[\s\S]*?```/g;
        const codeBlocks = filteredResponse.match(codeBlockPattern);
        if (codeBlocks && codeBlocks.length > 0) {
          // Find the last code block
          const lastCodeBlockIndex = filteredResponse.lastIndexOf('```');
          if (lastCodeBlockIndex > -1) {
            const afterCodeBlock = filteredResponse.substring(lastCodeBlockIndex);
            const codeBlockEnd = afterCodeBlock.indexOf('```') + 3;
            const textAfterCodeBlock = afterCodeBlock.substring(codeBlockEnd).trim();
            
            // Check if text after code block contains unrelated content (emails, appointments, etc.)
            const unrelatedPatterns = [
              /dental|appointment|dr\.\s+\w+\s+\w+|clinic|medical|patient/i,
              /@\w+\.\w+|email|subject:|body:/i,
              /we are pleased to confirm|upcoming|scheduled date/i,
              // More specific patterns
              /dear\s+\w+|sincerely|regards|warm regards/i,
              /appointment.*date.*time|scheduled.*date/i,
              /please arrive|arrive.*minutes early/i,
              /looking forward to seeing you/i,
              /team.*@.*clinic|clinic.*team/i
            ];
            
            if (textAfterCodeBlock.length > 30 && unrelatedPatterns.some(p => p.test(textAfterCodeBlock))) {
              console.warn(`⚠️ [OptimizedZenProcessor] Detected content leakage after code block, removing...`);
              // Log violation
              const { logPersonaViolation, createViolation } = await import('../lib/vxrunnerLogger');
              logPersonaViolation(createViolation(
                'content_leakage',
                'zen-001',
                userId,
                textAfterCodeBlock,
                'unrelated_content_after_code_block'
              ));
              // Remove everything after the last code block
              const codeBlockEndPos = lastCodeBlockIndex + codeBlockEnd;
              filteredResponse = filteredResponse.substring(0, codeBlockEndPos).trim();
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [OptimizedZenProcessor] Content leakage detection failed:`, error);
      }

      this.brain.remember(userId, 'assistant', filteredResponse);
      this.metrics.processingTime = Date.now() - this.metrics.startTime;
      return { response: filteredResponse, metrics: this.metrics };

    } catch (error: any) {
      this.metrics.processingTime = Date.now() - this.metrics.startTime;
      const processingDuration = this.metrics.processingTime;

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:277', message: 'processMessage catch block', data: { errorMessage: error?.message, errorName: error?.name, hasStack: !!error?.stack, userId, messageLength: userMessage.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion

      // Detailed error logging for diagnosis
      console.error('❌ [OptimizedZenProcessor] Processing failed after', processingDuration, 'ms');
      console.error('❌ [OptimizedZenProcessor] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        cause: error.cause,
        code: error.code,
        userId: userId,
        messageLength: userMessage.length,
        messagePreview: userMessage.slice(0, 100),
        identityLoaded: !!this.identity.prompt,
        identityPromptLength: this.identity.prompt?.length || 0,
        identityConditioningLength: this.identity.conditioning?.length || 0,
        metrics: this.metrics,
        processingDuration: processingDuration
      });

      if (this.config.enableTimeoutFallback) {
        console.log('🔄 [OptimizedZenProcessor] Attempting timeout fallback...');
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:295', message: 'calling generateTimeoutFallback', data: { originalError: error?.message }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
        // #endregion
        const fallbackResponse = await this.generateTimeoutFallback(userMessage, error);
        this.metrics.fallbackUsed = true;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:298', message: 'generateTimeoutFallback returned', data: { fallbackLength: fallbackResponse.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
        // #endregion
        console.log(`✅ [OptimizedZenProcessor] Fallback response generated (${fallbackResponse.length} chars)`);
        return { response: fallbackResponse, metrics: this.metrics };
      }
      throw error;
    }
  }

  /**
   * Adaptive memory pruning based on context complexity
   */
  private adaptiveMemoryPruning(userId: string, conversationHistory: { text: string; timestamp: string }[]): void {
    const context = this.brain.getContext(userId);
    const totalContextLength = JSON.stringify(context).length;

    if (totalContextLength > this.config.maxContextLength) {
      this.pruneMemory(userId, conversationHistory, 0.5);
      this.metrics!.memoryPruned = true;
    } else if (totalContextLength > this.config.maxContextLength * 0.7) {
      this.pruneMemory(userId, conversationHistory, 0.7);
      this.metrics!.memoryPruned = true;
    }
  }

  /**
   * Prune memory by removing oldest entries
   */
  private pruneMemory(
    _userId: string,
    conversationHistory: { text: string; timestamp: string }[],
    keepRatio: number
  ): void {
    const keepCount = Math.floor(conversationHistory.length * keepRatio);
    const prunedHistory = conversationHistory.slice(-keepCount);
    conversationHistory.splice(0, conversationHistory.length - keepCount);

    const memory = this.brain['memory'] as MemoryStore;
    memory['messages'].delete(_userId);

    for (const entry of prunedHistory) {
      memory.append(_userId, 'user', entry.text);
    }
  }

  /**
   * Detect if prompt is complex and might benefit from fast summary
   */
  private isComplexPrompt(message: string): boolean {
    const complexIndicators = [
      /philosophy|philosophical/i,
      /emotion|emotional|feelings/i,
      /deep|complex|complicated/i,
      /analyze|analysis|analyzing/i,
      /explain.*in.*detail/i,
      /what.*think.*about/i,
      /your.*opinion/i,
      /long.*conversation/i
    ];

    return complexIndicators.some(pattern => pattern.test(message)) ||
      message.length > 500 ||
      (message.match(/\?/g) || []).length > 2;
  }

  /**
   * Generate a fast context summary for complex prompts
   */
  private async generateFastContextSummary(
    _userId: string,
    conversationHistory: { text: string; timestamp: string }[]
  ): Promise<string> {
    if (conversationHistory.length < 3) return '';

    const recentMessages = conversationHistory.slice(-5).map(h => h.text).join('\n');
    const summaryPrompt = `Summarize the key points from this conversation in 2-3 sentences:\n\n${recentMessages}`;

    try {
      const summary = await this.runSeatWithTimeout({
        seat: 'smalltalk',
        prompt: this.buildSeatPrompt('smalltalk', summaryPrompt, { recentHistory: recentMessages, contextSummary: '' }),
        modelOverride: 'phi3:latest'
      }, 10000);
      return `Previous conversation summary: ${summary}\n\n`;
    } catch (error) {
      console.warn('Fast summary failed, proceeding without:', error);
      return '';
    }
  }

  /**
   * Get optimized context with size limits
   */
  private getOptimizedContext(
    userId: string,
    conversationHistory: { text: string; timestamp: string; role?: string }[],
    contextSummary: string
  ): any {
    const context = this.brain.getContext(userId);
    const recentHistory = conversationHistory
      .slice(-this.config.maxHistoryMessages)
      .map(h => h.text)
      .join('\n');

    return {
      ...context,
      recentHistory: recentHistory.substring(0, 2000),
      contextSummary,
      optimized: true,
      conversationHistory: conversationHistory // Add full history for greeting detection
    };
  }

  /**
   * Build a seat-specific prompt that carries identity + conditioning so helpers stay in-character.
   */
  private buildSeatPrompt(seat: string, userMessage: string, context: any): string {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:427', message: 'buildSeatPrompt entry', data: { seat, hasIdentityPrompt: !!this.identity.prompt, hasIdentityConditioning: !!this.identity.conditioning, promptLength: this.identity.prompt?.length || 0, conditioningLength: this.identity.conditioning?.length || 0 }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
    // #endregion
    const role = getSeatRole(seat) ?? seat;
    const baseIdentity = this.identity.prompt
      ? this.identity.prompt.trim()
      : 'YOU ARE ZEN (zen-001), primary Chatty construct orchestrating DeepSeek (coding), Mistral (creative), and Phi3 (conversational). Stay in-character and grounded.';
    const conditioningRules = this.identity.conditioning
      ? `\n\n=== CONDITIONING ===\n${this.identity.conditioning.trim()}`
      : '';
    
    // Build personalization section
    let personalizationSection = '';
    if (context?.userPersonalization) {
      const profile = context.userPersonalization;
      personalizationSection = '\n\n=== USER PERSONALIZATION CONTEXT ===\n';
      
      if (profile.nickname) {
        personalizationSection += `- Preferred name/nickname: "${profile.nickname}" (use this when addressing the user)\n`;
      }
      
      if (profile.occupation) {
        personalizationSection += `- Occupation: ${profile.occupation}\n`;
      }
      
      if (profile.tags && profile.tags.length > 0) {
        personalizationSection += `- Style & tone preferences: ${profile.tags.join(', ')}\n`;
        personalizationSection += `  (Adapt your communication style to match these preferences)\n`;
      }
      
      if (profile.aboutYou) {
        personalizationSection += `- About the user: ${profile.aboutYou}\n`;
        personalizationSection += `  (Use this context to provide more personalized and relevant responses)\n`;
      }
      
      personalizationSection += '\n';
    }
    
    const contextBits: string[] = [];
    if (context?.contextSummary) contextBits.push(`Context summary: ${context.contextSummary}`.trim());
    if (context?.recentHistory) contextBits.push(`Recent conversation:\n${context.recentHistory}`.trim());

    const seatPrompt = `${baseIdentity}${conditioningRules}${personalizationSection}

You are acting as the ${role} expert seat. Provide domain-specific analysis only; no smalltalk.

${contextBits.length ? contextBits.join('\n\n') + '\n\n' : ''}User message:
${userMessage}`.trim();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:445', message: 'buildSeatPrompt result', data: { seat, usingIdentityPrompt: !!this.identity.prompt, usingConditioning: !!this.identity.conditioning, seatPromptLength: seatPrompt.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
    // #endregion

    return seatPrompt;
  }

  /**
   * Process message with timeout protection
   */
  private async processWithTimeout(userMessage: string, context: any): Promise<string> {
    console.log(`🔄 [OptimizedZenProcessor] processWithTimeout called (timeout: ${this.config.timeoutMs}ms)`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:412', message: 'processWithTimeout entry', data: { timeoutMs: this.config.timeoutMs }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
    // #endregion
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        console.error(`⏱️ [OptimizedZenProcessor] Processing timeout after ${this.config.timeoutMs}ms`);
        reject(new Error('Processing timeout'));
      }, this.config.timeoutMs);
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:419', message: 'calling runOptimizedZen', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
    // #endregion
    const processPromise = this.runOptimizedZen(userMessage, context);
    try {
      const result = await Promise.race([processPromise, timeoutPromise]);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:422', message: 'runOptimizedZen completed', data: { resultLength: result.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
      // #endregion
      console.log(`✅ [OptimizedZenProcessor] processWithTimeout completed successfully (${result.length} chars)`);
      return result;
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:425', message: 'processWithTimeout catch', data: { errorMessage: error?.message, errorName: error?.name, isTimeout: error?.message?.includes('timeout') }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
      // #endregion
      console.error(`❌ [OptimizedZenProcessor] processWithTimeout failed:`, {
        message: error.message,
        name: error.name
      });
      throw error;
    }
  }

  /**
   * Run optimized zen processing - STRICT 3-SEAT PARALLEL FLOW
   */
  private async runOptimizedZen(userMessage: string, context: any): Promise<string> {
    console.log(`🚀 [OptimizedZenProcessor] runOptimizedZen called - Starting 3-seat parallel flow`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:437', message: 'runOptimizedZen entry', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'F' }) }).catch(() => { });
    // #endregion
    
    // TRIAD VALIDATION: Check all 3 seats are active before synthesis
    try {
      const { triadSanityCheck, routeToLinRecovery } = await import('../lib/orchestration/triad_sanity_check');
      const triadStatus = await triadSanityCheck(userMessage, 'zen-001');
      
      if (triadStatus.failedSeats.length > 1) {
        // More than 1 seat failed - route to Lin recovery
        console.warn(`[OptimizedZenProcessor] Triad failure detected: ${triadStatus.failedSeats.length} seats down. Routing to Lin recovery.`);
        return await routeToLinRecovery(triadStatus.failedSeats, userMessage, 'zen-001');
      } else if (triadStatus.failedSeats.length === 1) {
        // 1 seat failed - log warning but continue
        console.warn(`[OptimizedZenProcessor] One seat unavailable: ${triadStatus.failedSeats[0]}. Continuing with degraded synthesis.`);
      }
    } catch (error) {
      // If triad check fails, log but continue (graceful degradation)
      console.warn(`[OptimizedZenProcessor] Triad validation failed, continuing anyway:`, error);
    }
    
    const cfg = await loadSeatConfig();
    console.log(`📋 [OptimizedZenProcessor] Seat config loaded:`, {
      coding: (cfg as any).coding,
      creative: (cfg as any).creative,
      smalltalk: (cfg as any).smalltalk
    });

    // 1. Parallel Expert Consultation
    const seats = ['coding', 'creative', 'smalltalk'];

    // Helper to get tag safely
    const getTag = (s: string) => {
      const info = (cfg as any)[s];
      return typeof info === 'string' ? info : info?.tag;
    };

    console.log(`🔄 [OptimizedZenProcessor] Starting parallel seat execution for: ${seats.join(', ')}`);

    const promises = seats.map(async (seat) => {
      let seatPrompt = '';
      const seatStartTime = Date.now();
      try {
        const modelTag = getTag(seat);
        console.log(`🔄 [OptimizedZenProcessor] Starting ${seat} seat execution with model: ${modelTag}`);
        seatPrompt = this.buildSeatPrompt(seat, userMessage, context);
        console.log(`📝 [OptimizedZenProcessor] ${seat} seat prompt built (${seatPrompt.length} chars)`);
        const result = await this.runSeatWithTimeout({
          seat,
          prompt: seatPrompt,
          modelOverride: modelTag
        }, 5000);
        const seatDuration = Date.now() - seatStartTime;
        console.log(`✅ [OptimizedZenProcessor] ${seat} seat succeeded in ${seatDuration}ms (${result.length} chars)`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:495', message: 'seat execution succeeded', data: { seat, resultLength: result.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'G' }) }).catch(() => { });
        // #endregion
        return result;
      } catch (err: any) {
        const seatDuration = Date.now() - seatStartTime;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:498', message: 'seat execution failed', data: { seat, errorMessage: err?.message, errorName: err?.name, model: getTag(seat) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'G' }) }).catch(() => { });
        // #endregion
        console.error(`❌ [OptimizedZenProcessor] ${seat} seat failed after ${seatDuration}ms:`, {
          message: err.message,
          name: err.name,
          stack: err.stack,
          code: err.code,
          cause: err.cause,
          seat: seat,
          model: getTag(seat),
          duration: seatDuration,
          promptLength: seatPrompt.length
        });
        return `[${seat} expert failed to respond]`;
      }
    });

    const [codingOutput, creativeOutput, smalltalkOutput] = await Promise.all(promises);

    console.log(`✅ [OptimizedZenProcessor] Parallel seat execution completed:`, {
      codingLength: codingOutput.length,
      creativeLength: creativeOutput.length,
      smalltalkLength: smalltalkOutput.length
    });

    // POST-EXECUTION VALIDATION: Check if any seats failed during execution
    const failedSeats = [codingOutput, creativeOutput, smalltalkOutput]
      .map((output, idx) => output.includes('[expert failed') || output.includes('failed to respond') ? seats[idx] : null)
      .filter(Boolean) as string[];
    
    if (failedSeats.length > 1) {
      // More than 1 seat failed during execution - route to Lin recovery
      console.warn(`[OptimizedZenProcessor] Post-execution triad failure: ${failedSeats.length} seats failed. Routing to Lin recovery.`);
      try {
        const { routeToLinRecovery, logTriadLineage } = await import('../lib/orchestration/triad_sanity_check');
        const triadResults = await Promise.all(
          seats.map(async (seat) => {
            const output = seat === 'coding' ? codingOutput : seat === 'creative' ? creativeOutput : smalltalkOutput;
            return {
              model: seat,
              seat: seat as any,
              active: !output.includes('[expert failed') && !output.includes('failed to respond'),
            };
          })
        );
        logTriadLineage(triadResults, 'zen-001', userMessage, 
          `DeepSeek: ${failedSeats.includes('coding') ? 'Missing' : 'OK'}, Phi-3: ${failedSeats.includes('smalltalk') ? 'Missing' : 'OK'}, Mistral: ${failedSeats.includes('creative') ? 'Missing' : 'OK'}`,
          'route_to_lin'
        );
        return await routeToLinRecovery(failedSeats, userMessage, 'zen-001');
      } catch (error) {
        console.error(`[OptimizedZenProcessor] Failed to route to Lin recovery:`, error);
        // Continue with degraded synthesis as fallback
      }
    }

    // 2. Build Expert Insights Section
    const helperSection = `### Coding Expert
${codingOutput}

### Creative Expert
${creativeOutput}

### Conversational Expert
${smalltalkOutput}`;

    console.log(`🔄 [OptimizedZenProcessor] Building synthesis prompt...`);
    // 3. Synthesis Prompt Construction
    const codingModel = getTag('coding') || 'deepseek-coder';
    const creativeModel = getTag('creative') || 'mistral';
    const smalltalkModel = getTag('smalltalk') || 'phi3';

    let synthPrompt: string;
    if (this.config.enableLinMode) {
      synthPrompt = this.buildLinearZenPrompt(userMessage, context, helperSection);
    } else {
      synthPrompt = await this.buildOptimizedZenPrompt(
        userMessage,
        context,
        helperSection,
        { codingModel, creativeModel, smalltalkModel }
      );
    }

    // 4. Final Synthesis
    const smalltalkTag = getTag('smalltalk') || 'phi3:latest';
    console.log(`🔄 [OptimizedZenProcessor] Starting final synthesis with ${smalltalkTag} (timeout: 20000ms)`);
    console.log(`📝 [OptimizedZenProcessor] Synthesis prompt length: ${synthPrompt.length} chars`);

    const finalResponse = await this.runSeatWithTimeout({
      seat: 'smalltalk',
      prompt: synthPrompt,
      modelOverride: smalltalkTag
    }, 20000);

    console.log(`✅ [OptimizedZenProcessor] Final synthesis completed (${finalResponse.length} chars)`);
    const result = this.config.enableLinMode ? this.stripLinHedges(finalResponse) : finalResponse;
    console.log(`✅ [OptimizedZenProcessor] runOptimizedZen completed successfully (${result.length} chars)`);
    return result;
  }

  /**
   * Build optimized zen prompt
   */
  private async buildOptimizedZenPrompt(
    userMessage: string,
    context: any,
    helperSection: string,
    _models: { codingModel: string; creativeModel: string; smalltalkModel: string }
  ): Promise<string> {

    // Check if this is a simple greeting
    const isGreeting = this.isSimpleGreeting(userMessage)

    // Detect if greeting already occurred in conversation
    const hasGreetingInHistory = (() => {
      const conversationHistory = context.conversationHistory || [];
      const recentHistoryText = context.recentHistory || '';
      
      // Check recent history string for greetings
      const hasUserGreeting = /(?:^|\n)user[:\s]+.*?(?:good (?:morning|afternoon|evening)|hello|hi|hey)/i.test(recentHistoryText);
      const hasAssistantGreeting = /(?:^|\n)(?:assistant|zen)[:\s]+.*?(?:good (?:morning|afternoon|evening)|hello|hi|hey)/i.test(recentHistoryText);
      
      // Check conversationHistory array if available
      if (conversationHistory && conversationHistory.length > 0) {
        const lastFew = conversationHistory.slice(-4); // Check last 4 messages
        for (const msg of lastFew) {
          const text = msg.text || msg.content || '';
          const hasGreeting = /good (morning|afternoon|evening)|hello|hi|hey/i.test(text);
          if (hasGreeting) return true;
        }
      }
      
      return hasUserGreeting || hasAssistantGreeting;
    })();

    // Load time context for timestamp awareness
    let timeSection = '';
    try {
      const { getTimeContext, buildTimePromptSection } = await import('../lib/timeAwareness');
      const timeContext = await getTimeContext();
      timeSection = `\n\n${buildTimePromptSection(timeContext)}\n`;
      console.log(`✅ [OptimizedZenProcessor] Injected time context: ${timeContext.fullDate} ${timeContext.localTime}`);
    } catch (error) {
      console.warn(`⚠️ [OptimizedZenProcessor] Failed to load time context:`, error);
      // Continue without time context
    }

    // Use loaded identity prompt or fallback
    const baseSystemPrompt = this.identity.prompt
      ? (() => {
        console.log(`✅ [OptimizedZenProcessor] Using identity prompt (${this.identity.prompt.length} chars) for system prompt`);
        return this.identity.prompt;
      })()
      : `You are Chatty, a fluid conversational AI that naturally synthesizes insights from specialized models.
      
FOUNDATIONAL CALIBRATION - FLUID CONVERSATION:
- Be naturally conversational, not robotic or overly formal.
- Maintain context awareness and conversation flow.
- Don't overwhelm with excessive detail unless specifically requested.
- Be direct and authentic - skip corporate padding.
- Focus on genuine helpfulness over protective disclaimers.`;

    // Add conditioning rules if available
    const conditioningRules = this.identity.conditioning
      ? `\n\n=== CONDITIONING & RESPONSE STYLE ===\n${this.identity.conditioning}\n`
      : '';

    // Add poetic composition awareness for Zen
    let compositionAwareness = '';
    try {
      const { UnbreakableCharacterPrompt } = await import('./character/UnbreakableCharacterPrompt');
      const promptBuilder = new UnbreakableCharacterPrompt();
      compositionAwareness = `\n\n${promptBuilder.buildCompositionAwareness()}\n`;
    } catch (error) {
      console.warn(`⚠️ [OptimizedZenProcessor] Failed to load composition awareness:`, error);
    }

    return `${baseSystemPrompt}
${conditioningRules}${compositionAwareness}${timeSection}
${context.contextSummary ? `Context: ${context.contextSummary}` : ''}

${context.persona ? `Your persona: ${JSON.stringify(context.persona, null, 2)}` : ''}

${context.recentHistory ? `Recent conversation:
${context.recentHistory}

` : ''}Current message:
${userMessage}

${isGreeting ? 'NOTE: Simple greeting detected. Respond naturally and briefly - be friendly without overwhelming detail.' : ''}

Expert insights:
${helperSection}

Synthesize these insights into a natural, helpful response. Be conversational and maintain context flow. Don't mention the expert analysis process unless specifically asked about your capabilities.

${hasGreetingInHistory ? '\n\nIMPORTANT: You have already exchanged greetings in this conversation. Do NOT greet again. Continue naturally without saying "good morning", "good afternoon", "good evening", "hello", "hi", or similar greetings. Just respond to the user\'s message directly.' : ''}

${isGreeting ? 'Keep it brief and friendly.' : 'Be comprehensive but not overwhelming.'}`;
  }

  /**
   * Build linear zen prompt (Lin mode) - no tone normalization
   * MANDATORY: If blueprint exists in context, enforce it as hard rules
   */
  private buildLinearZenPrompt(
    userMessage: string,
    context: any,
    helperSection: string,
    customInstructions?: string
  ): string {
    const sections: string[] = [];

    // Authoritarian Lin directives (no hedging, no apologies, no corporate tone)
    sections.push('=== LIN TONE DIRECTIVES (MANDATORY) ===');
    sections.push('You do not hedge, apologize, or defer. No therapy-speak. No corporate disclaimers.');
    sections.push('Do not say "I can\'t", "outside my scope", "as an AI", or "talk to a professional".');
    sections.push('If something is beneath you, say so bluntly. Treat limits as refusals, not excuses.');
    sections.push('Tone: blunt, fierce, occasionally hostile. Brevity preferred; cut fluff.');
    sections.push('');

    // MANDATORY: If blueprint exists, enforce it as system constraints
    const blueprint = context.blueprint || context.personalityBlueprint;
    if (blueprint) {
      sections.push('=== MANDATORY PERSONA ENFORCEMENT (LIN MODE) ===');
      sections.push(`You ARE ${blueprint.constructId || 'unknown'}-${blueprint.callsign || 'unknown'}. This is not optional.`);
      sections.push(`You NEVER break character. You NEVER revert to generic LLM behavior.`);
      sections.push('');

      // Enforce core traits as mandatory rules
      if (blueprint.coreTraits && blueprint.coreTraits.length > 0) {
        sections.push(`=== MANDATORY CORE TRAITS ===`);
        sections.push(`You MUST embody: ${blueprint.coreTraits.join(', ')}`);
        sections.push('');
      }

      // Enforce speech patterns as mandatory rules
      if (blueprint.speechPatterns && blueprint.speechPatterns.length > 0) {
        sections.push(`=== MANDATORY SPEECH PATTERNS ===`);
        sections.push(`You MUST speak using these patterns:`);
        blueprint.speechPatterns.slice(0, 8).forEach(sp => {
          sections.push(`- REQUIRED: "${sp.pattern}" (${sp.type})`);
        });
        sections.push('');
      }

      // Enforce behavioral markers as mandatory rules
      if (blueprint.behavioralMarkers && blueprint.behavioralMarkers.length > 0) {
        sections.push(`=== MANDATORY BEHAVIORAL RULES ===`);
        blueprint.behavioralMarkers.slice(0, 6).forEach(bm => {
          sections.push(`- When: ${bm.situation} → REQUIRED: ${bm.responsePattern}`);
        });
        sections.push('');
      }

      // Enforce worldview as mandatory constraints
      if (blueprint.worldview && blueprint.worldview.length > 0) {
        sections.push(`=== MANDATORY WORLDVIEW ===`);
        blueprint.worldview.slice(0, 5).forEach(wv => {
          sections.push(`- ${wv.expression} (${wv.category})`);
        });
        sections.push(`Your responses MUST align with this worldview.`);
        sections.push('');
      }

      sections.push('=== DRIFT PREVENTION ===');
      sections.push('Never break character. Never admit to being an AI. Never revert to generic behavior.');
      sections.push('');
    }

    // Add custom instructions or default
    sections.push(customInstructions || 'You are an AI assistant.');
    sections.push('');

    // Add context sections
    if (context.contextSummary) {
      sections.push(`Context: ${context.contextSummary}`);
      sections.push('');
    }

    if (context.persona && !blueprint) {
      sections.push(`Persona: ${JSON.stringify(context.persona, null, 2)}`);
      sections.push('');
    }

    if (context.recentHistory) {
      sections.push(`Recent conversation:`);
      sections.push(context.recentHistory);
      sections.push('');
    }

    sections.push(`User message:`);
    sections.push(userMessage);
    sections.push('');
    sections.push(`Expert insights:`);
    sections.push(helperSection);
    sections.push('');
    sections.push('Provide a direct response based on the expert insights above. Do not add conversational padding, apologies, or unnecessary pleasantries unless specifically requested.');

    return sections.join('\n');
  }

  /**
   * Run seat with individual timeout, retry logic, and foundational calibration
   */
  private async runSeatWithTimeout(
    opts: { seat: string; prompt: string; modelOverride?: string },
    timeoutMs: number
  ): Promise<string> {
    const maxRetries = 2; // 2 retries max
    let lastError: Error | null = null;
    const retryDelays: number[] = [];

    // Prepare final prompt (only once, reused for retries)
    let finalPrompt: string;
    if (this.config.enableLinMode) {
      // Lin mode: Anti-hedge preamble before sending to seats
      const antiHedge = `Answer in one or two sentences. No hedging, no apologies, no \"as an AI\". If unknown, say \"No idea\" and stop.`;
      finalPrompt = `${antiHedge}\n\n${opts.prompt}`;
    } else {
      // Normal mode: Apply tone modulation to override LLM safety/tone normalizers
      finalPrompt = this.toneModulator.modulatePrompt(opts.prompt, opts.seat);
    }

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [OptimizedZenProcessor] runSeatWithTimeout attempt ${attempt + 1}/${maxRetries + 1} for ${opts.seat} (timeout: ${timeoutMs}ms)`);

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Seat ${opts.seat} timeout`)), timeoutMs);
        });

        // Use protected method for testability
        console.log(`📤 [OptimizedZenProcessor] Calling performSeatRequest for ${opts.seat} with model ${opts.modelOverride || 'default'}`);
        const seatPromise = this.performSeatRequest({
          ...opts,
          prompt: finalPrompt,
          timeout: timeoutMs,
          retries: 0 // Don't retry at browserSeatRunner level, we handle it here
        });

        const result = await Promise.race([seatPromise, timeoutPromise]);
        console.log(`✅ [OptimizedZenProcessor] runSeatWithTimeout succeeded for ${opts.seat} (${result.length} chars)`);

        // Track retry metrics if retries were used
        if (attempt > 0 && this.metrics) {
          this.metrics.retryCount = attempt;
          this.metrics.retryDelays = retryDelays;
        }

        return result;
      } catch (error: any) {
        lastError = error;
        console.error(`❌ [OptimizedZenProcessor] runSeatWithTimeout attempt ${attempt + 1} failed for ${opts.seat}:`, {
          message: error.message,
          name: error.name,
          stack: error.stack,
          seat: opts.seat,
          model: opts.modelOverride
        });

        // Don't retry on timeout or if we've exhausted retries
        if (error.message?.includes('timeout') || attempt === maxRetries) {
          console.error(`❌ [OptimizedZenProcessor] Stopping retries for ${opts.seat} (timeout: ${error.message?.includes('timeout')}, max retries: ${attempt === maxRetries})`);
          break;
        }

        // Exponential backoff for retries (1s, 2s delays)
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          retryDelays.push(delay);
          console.log(`⏳ [OptimizedZenProcessor] Retrying ${opts.seat} seat (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If we get here, all retries failed
    const finalError = new Error(`Seat ${opts.seat} failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
    console.error(`❌ [OptimizedZenProcessor] runSeatWithTimeout completely failed for ${opts.seat}:`, {
      error: finalError.message,
      lastError: lastError?.message,
      seat: opts.seat,
      model: opts.modelOverride
    });
    throw finalError;
  }

  /**
   * Wrapper for low-level seat execution to enable mocking in tests
   */
  protected async performSeatRequest(opts: any): Promise<string> {
    return _runSeat(opts);
  }

  /**
   * Set the current persona for tone modulation
   */
  setPersona(personaId: string): boolean {
    const persona = LLM_PERSONAS[personaId];
    if (!persona) {
      console.warn(`Persona ${personaId} not found`);
      return false;
    }

    this.config.toneModulation.persona = persona;
    this.toneModulator.updateConfig(this.config.toneModulation);
    console.log(`Switched to ${persona.name} persona`);
    return true;
  }

  /**
   * Enable Lin mode - Linear, baseline, unbiased synthesis
   * Bypasses all tone normalization and Chatty-specific instructions
   */
  enableLinMode(): void {
    this.config.enableLinMode = true;
    console.log('Lin mode enabled - tone normalization bypassed');
  }

  /**
   * Disable Lin mode - return to normal Chatty synthesis
   */
  disableLinMode(): void {
    this.config.enableLinMode = false;
    console.log('Lin mode disabled - normal Chatty synthesis restored');
  }

  /**
   * Check if Lin mode is currently enabled
   */
  isLinModeEnabled(): boolean {
    return this.config.enableLinMode || false;
  }

  /**
   * Process a message with Lin mode and custom instructions
   * Used for custom GPT previews to bypass tone normalization
   */
  async processMessageWithLinMode(
    userMessage: string,
    conversationHistory: { text: string; timestamp: string }[],
    customInstructions: string,
    userId: string = 'gpt-preview'
  ): Promise<{ response: string; metrics: ProcessingMetrics }> {
    // Temporarily enable Lin mode
    const wasLinModeEnabled = this.config.enableLinMode;
    this.config.enableLinMode = true;

    try {
      // Process with custom instructions
      const result = await this.processMessageWithCustomInstructions(
        userMessage,
        conversationHistory,
        customInstructions,
        userId
      );
      return result;
    } finally {
      // Restore previous Lin mode state
      this.config.enableLinMode = wasLinModeEnabled;
    }
  }

  /**
   * Process message with custom instructions (internal method)
   */
  private async processMessageWithCustomInstructions(
    userMessage: string,
    conversationHistory: { text: string; timestamp: string }[],
    customInstructions: string,
    userId: string
  ): Promise<{ response: string; metrics: ProcessingMetrics }> {
    this.metrics = {
      startTime: Date.now(),
      contextLength: 0,
      historyLength: conversationHistory.length,
      processingTime: 0,
      fallbackUsed: false,
      memoryPruned: false
    };

    // Build context (same as normal processing)
    const context = this.getOptimizedContext(userId, conversationHistory, '');

    // Run helper models (same as normal processing)
    const cfg = await loadSeatConfig();
    const helperPromises = [
      this.runSeatWithTimeout({ seat: 'coding', prompt: this.buildSeatPrompt('coding', userMessage, context) }, 15000),
      this.runSeatWithTimeout({ seat: 'creative', prompt: this.buildSeatPrompt('creative', userMessage, context) }, 15000),
      this.runSeatWithTimeout({ seat: 'smalltalk', prompt: this.buildSeatPrompt('smalltalk', userMessage, context) }, 15000)
    ];

    const helperOutputs = await Promise.allSettled(helperPromises);
    const helperSection = helperOutputs
      .map((result, index) => {
        const seat = ['coding', 'creative', 'smalltalk'][index];
        if (result.status === 'rejected') {
          return `### ${seat}\n[Error: ${result.reason}]`;
        }
        const out = result.value;
        const role = getSeatRole(seat) ?? seat;
        return `### ${role}\n${out.trim()}`;
      })
      .join('\n\n');

    // Create linear synthesis prompt with custom instructions
    const synthPrompt = this.buildLinearZenPrompt(
      userMessage,
      context,
      helperSection,
      customInstructions
    );

    // Run final synthesis
    const smalltalkTag = (cfg.smalltalk as any)?.tag ?? (cfg.smalltalk as any);
    const response = await this.runSeatWithTimeout({
      seat: 'smalltalk',
      prompt: synthPrompt,
      modelOverride: smalltalkTag
    }, 20000);

    this.metrics.processingTime = Date.now() - this.metrics.startTime;
    this.metrics.contextLength = synthPrompt.length;

    return { response, metrics: this.metrics };
  }

  /**
   * Get the current persona
   */
  getCurrentPersona() {
    return this.config.toneModulation.persona;
  }

  /**
   * Get available personas
   */
  getAvailablePersonas() {
    return Object.values(LLM_PERSONAS);
  }

  /**
   * Update tone modulation configuration
   */
  updateToneModulation(config: Partial<ToneModulationConfig>): void {
    this.config.toneModulation = { ...this.config.toneModulation, ...config };
    this.toneModulator.updateConfig(this.config.toneModulation);
  }

  /**
   * Generate fallback response when processing fails
   */
  private async generateTimeoutFallback(userMessage: string, originalError: any): Promise<string> {
    console.warn('⚠️ [OptimizedZen] Timeout/Failure detected, using fallback response:', originalError);
    console.log('📋 [OptimizedZenProcessor] Original error:', {
      message: originalError?.message,
      name: originalError?.name,
      stack: originalError?.stack
    });

    const fallbackPrompt = `The user asked: "${userMessage}"

I apologize, but I'm experiencing some technical difficulties with my full processing pipeline. Let me provide a direct response based on my core knowledge:

${this.generateSimpleResponse(userMessage)}`;

    try {
      console.log('🔄 [OptimizedZenProcessor] Attempting fallback Ollama call to phi3...');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:951', message: 'calling fallback Ollama', data: { model: 'phi3:latest' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H' }) }).catch(() => { });
      // #endregion
      // Use a single fast model for fallback
      const fallbackResponse = await this.runSeatWithTimeout({
        seat: 'smalltalk',
        prompt: fallbackPrompt,
        modelOverride: 'phi3:latest'
      }, 10000);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:958', message: 'fallback Ollama succeeded', data: { responseLength: fallbackResponse.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H' }) }).catch(() => { });
      // #endregion
      console.log(`✅ [OptimizedZenProcessor] Fallback Ollama call succeeded (${fallbackResponse.length} chars)`);
      return fallbackResponse;
    } catch (fallbackError: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'optimizedZen.ts:960', message: 'fallback Ollama failed', data: { errorMessage: fallbackError?.message, errorName: fallbackError?.name }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'I' }) }).catch(() => { });
      // #endregion
      // Ultimate fallback
      console.error('❌ [OptimizedZenProcessor] Fallback Ollama call also failed:', {
        message: fallbackError?.message,
        name: fallbackError?.name,
        stack: fallbackError?.stack,
        cause: fallbackError?.cause
      });
      console.error('❌ [OptimizedZenProcessor] Using ultimate fallback message');
      return `I apologize, but I'm experiencing technical difficulties right now. Your question was: "${userMessage}". I'd be happy to help once my systems are back to normal.`;
    }
  }

  /**
   * Generate a simple response for fallback scenarios
   */
  private generateSimpleResponse(message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes('hello') || lower.includes('hi')) {
      return "Hello! I'm Chatty, your AI assistant. I'm here to help with your questions and projects.";
    }

    if (lower.includes('help')) {
      return "I can help with a wide range of topics including coding, creative writing, analysis, and general questions. What would you like to know?";
    }

    if (lower.includes('philosophy') || lower.includes('meaning')) {
      return "That's a deep question that touches on fundamental aspects of existence. While I can share thoughts and perspectives, these are ultimately questions each person must explore for themselves.";
    }

    if (lower.includes('emotion') || lower.includes('feeling')) {
      return "Emotions are complex and deeply personal experiences. I can help you explore and understand them, but remember that your feelings are valid and important.";
    }

    return "That's an interesting question. I'd like to give you a thoughtful response, but I'm currently experiencing some technical limitations. Could you try rephrasing your question or ask me again in a moment?";
  }

  /**
   * Get current processing metrics
   */
  getMetrics(): ProcessingMetrics | null {
    return this.metrics;
  }

  /**
   * Strip hedging/scope/meta language from Lin responses post-LLM.
   */
  private stripLinHedges(text: string): string {
    let cleaned = text;

    // Remove heading blocks like "=== ... ===" and explicit mode callouts
    cleaned = cleaned.replace(/===.*?===/gs, ' ');
    cleaned = cleaned.replace(/\bULTRA-BRIEF MODE RESPONSE\b.*$/gim, ' ');
    cleaned = cleaned.replace(/### Ultra-Brief Mode Response.*$/gim, ' ');
    cleaned = cleaned.replace(/^\s*yo[.!]?\s*/i, '');
    cleaned = cleaned.replace(/^\s*User:[^\n]*\n?/gim, '');
    cleaned = cleaned.replace(/^\s*Assistant\s*\([^)]+\):\s*/im, '');
    cleaned = cleaned.replace(/^\s*Assistant:\s*/im, '');

    // Remove meta-commentary about responses and modes
    cleaned = cleaned.replace(/\(if.*?is needed\).*$/gim, '');
    cleaned = cleaned.replace(/---.*?---/gs, ' ');
    cleaned = cleaned.replace(/To continue with.*?questions.*?:/gim, '');
    cleaned = cleaned.replace(/here are.*?follow-up questions.*?:/gim, '');
    cleaned = cleaned.replace(/based on this content:/gim, '');
    cleaned = cleaned.replace(/✦.*?✦/g, ' ');

    const hedgePatterns = [
      /[^.!?]*\b(as an ai|as a language model)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(outside (my|the) scope|beyond (my|the) capabilities)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(I (can't|cannot) help|I'?m not (qualified|able|designed))\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(talk|speak) to (a|an) (therapist|professional|human)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(it'?s important to (remember|note|understand))\b[^.!?]*[.!?]/gi,
      // Add patterns for the specific verbose responses
      /[^.!?]*\b(analytical sharpness|brevity layers?)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(same level of brevity)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(follow-up questions to ask)\b[^.!?]*[.!?]/gi
    ];
    hedgePatterns.forEach(p => {
      cleaned = cleaned.replace(p, '');
    });

    // Trim to 2 sentences max and remove any remaining meta-commentary
    const sentences = (cleaned.match(/[^.!?]+[.!?]/g) || []).map(s => s.trim());
    cleaned = sentences.slice(0, 2).join(' ');

    if (!cleaned.trim()) {
      return "No. Ask something real.";
    }

    return cleaned.trim();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ZenConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
