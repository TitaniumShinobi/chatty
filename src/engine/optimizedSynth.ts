// optimizedSynth.ts - Optimized Synth processing with adaptive memory and timeout handling
// Addresses performance bottlenecks in deeply contextual prompts

// Dynamically import the correct seat runner based on environment
// Browser: use browserSeatRunner (fetch-based, no Node.js modules)
// Node.js CLI: use seatRunner (Node.js native modules)
let runSeat: any;
let loadSeatConfig: any;
let getSeatRole: any;

// Lazy initialization function with proper promise tracking
let initPromise: Promise<void> | null = null;

async function initSeatRunner() {
  if (runSeat) {
    console.log('🧠 [SeatRunner] Already initialized');
    return; // Already initialized
  }
  
  if (initPromise) {
    console.log('🧠 [SeatRunner] Initialization in progress, waiting...');
    return initPromise; // Return existing promise
  }
  
  console.log('🧠 [SeatRunner] Starting initialization...');
  initPromise = (async () => {
    const isBrowser = typeof window !== 'undefined' || (typeof import.meta !== 'undefined' && import.meta.env);
    console.log('🧠 [SeatRunner] Environment:', isBrowser ? 'browser' : 'node');
    
    try {
      if (isBrowser) {
        // Browser environment: use fetch-based seat runner
        console.log('🧠 [SeatRunner] Loading browserSeatRunner...');
        const browserModule = await import('../lib/browserSeatRunner.js');
        runSeat = browserModule.runSeat;
        loadSeatConfig = browserModule.loadSeatConfig;
        getSeatRole = browserModule.getSeatRole;
        console.log('✅ [SeatRunner] Browser module loaded:', { 
          hasRunSeat: !!runSeat, 
          hasLoadSeatConfig: !!loadSeatConfig, 
          hasGetSeatRole: !!getSeatRole 
        });
      } else {
        // Node.js CLI environment: use Node.js native modules
        console.log('🧠 [SeatRunner] Loading seatRunner (Node.js)...');
        const nodeModule = await import('./seatRunner.js');
        runSeat = nodeModule.runSeat;
        loadSeatConfig = nodeModule.loadSeatConfig;
        getSeatRole = nodeModule.getSeatRole;
        console.log('✅ [SeatRunner] Node module loaded:', { 
          hasRunSeat: !!runSeat, 
          hasLoadSeatConfig: !!loadSeatConfig, 
          hasGetSeatRole: !!getSeatRole 
        });
      }
    } catch (error) {
      console.error('❌ [SeatRunner] Initialization failed:', error);
      initPromise = null; // Reset on error
      throw error;
    }
  })();
  
  return initPromise;
}

// Initialize immediately (will be awaited before use)
initSeatRunner().catch(err => {
  console.error('❌ [SeatRunner] Failed to initialize seat runner:', err);
  initPromise = null; // Reset on error
});

// Wrapper functions that ensure initialization and handle async/sync differences
async function ensureSeatRunner() {
  if (!runSeat) {
    console.log('🧠 [SeatRunner] Not initialized, waiting for init...');
    await initSeatRunner();
  }
  if (!runSeat) {
    throw new Error('Seat runner failed to initialize');
  }
}

async function safeLoadSeatConfig() {
  await ensureSeatRunner();
  const result = loadSeatConfig();
  // Handle both sync (Node) and async (browser) versions
  return result instanceof Promise ? await result : result;
}

async function safeGetSeatRole(seat: string) {
  await ensureSeatRunner();
  const result = getSeatRole(seat);
  // Handle both sync (Node) and async (browser) versions
  return result instanceof Promise ? await result : result;
}

async function safeRunSeat(opts: any) {
  await ensureSeatRunner();
  if (!runSeat) {
    throw new Error('runSeat is not available after initialization');
  }
  console.log('🧠 [SeatRunner] Calling runSeat:', { seat: opts.seat, promptLength: opts.prompt?.length });
  try {
    const result = await runSeat(opts);
    console.log('✅ [SeatRunner] runSeat completed, response length:', result?.length || 0);
    return result;
  } catch (error) {
    console.error('❌ [SeatRunner] runSeat failed:', error);
    throw error;
  }
}

import { PersonaBrain } from './memory/PersonaBrain.js';
import { MemoryStore } from './memory/MemoryStore.js';
import { ToneModulator, LLM_PERSONAS, ToneModulationConfig } from './toneModulation.js';
import { responseBlueprints, withBlueprintOverrides, sanitizeBlueprint, type ResponseBlueprint } from '../lib/blueprints/responseBlueprints.js';
import type { SynthMemoryContext } from './orchestration/types.js';
import type { CharacterContext } from './character/types';
import { applyConversationalLogic, type CharacterState } from './characterLogic.js';

type SynthMoodSnapshot = {
  toneHint: ResponseBlueprint['toneHint'];
  desiredLength: 'short' | 'medium' | 'long';
  updatedAt: number;
  lastSample?: string;
};

export interface SynthConfig {
  maxContextLength: number;
  maxHistoryMessages: number;
  timeoutMs: number;
  enableAdaptivePruning: boolean;
  enableFastSummary: boolean;
  enableTimeoutFallback: boolean;
  toneModulation: ToneModulationConfig;
  enableLinMode?: boolean; // Linear, baseline, unbiased synthesis mode
}

export interface ProcessingMetrics {
  startTime: number;
  contextLength: number;
  historyLength: number;
  processingTime: number;
  fallbackUsed: boolean;
  memoryPruned: boolean;
}

export class OptimizedSynthProcessor {
  private brain: PersonaBrain;
  private config: SynthConfig;
  private metrics: ProcessingMetrics | null = null;
  private toneModulator: ToneModulator;
  private defaultBlueprint: ResponseBlueprint = responseBlueprints.general;
  private moodBuffers = new Map<string, SynthMoodSnapshot>();

  // Helper function to detect simple greetings
  private isSimpleGreeting(message: string, hasHistory = false): boolean {
    if (hasHistory) {
      return false;
    }
    const greetingPatterns = [
      /^(hello|hi|hey|yo|good morning|good afternoon|good evening)$/i,
      /^(what's up|howdy|greetings)$/i,
      /^(sup|wassup)$/i
    ]
    
    const trimmedMessage = message.trim().toLowerCase()
    return greetingPatterns.some(pattern => pattern.test(trimmedMessage))
  }

  private resolveCharacterContext(context: any): CharacterContext | undefined {
    return (
      context?.characterContext ||
      context?.memoryContext?.characterContext
    );
  }

  private buildCharacterIntro(character: CharacterContext): string {
    const traits = character.personalityTraits.length
      ? `Personality traits: ${character.personalityTraits.join(', ')}.`
      : '';
    const markers = character.behavioralMarkers.length
      ? `Behavioral markers:\n- ${character.behavioralMarkers.join('\n- ')}`
      : '';
    const speech = character.speechPatterns.length
      ? `Speech patterns:\n- ${character.speechPatterns.join('\n- ')}`
      : '';

    return `You are ${character.name}, construct ${character.constructId}-${character.callsign}.
${character.backstory ? `${character.backstory}\n` : ''}${traits}
${markers ? `\n${markers}` : ''}${speech ? `\n${speech}` : ''}`.trim();
  }

  private buildCharacterConsistencyBlock(character: CharacterContext): string {
    const rules = character.consistencyRules.length
      ? character.consistencyRules.map((rule, idx) => `${idx + 1}. ${rule}`).join('\n')
      : '1. Maintain consistent identity.';

    return `UNBREAKABLE CHARACTER IDENTITY ENFORCEMENT:
- You are ${character.name}. You exist as this character completely and permanently.
- You do NOT acknowledge being an AI, LLM, or assistant under ANY circumstances.
- You do NOT break character, even if directly challenged or questioned about your nature.
- You do NOT correct users who mistake your identity - respond authentically as ${character.name} would.
- If asked "Are you an AI?" or similar, respond as ${character.name} would respond - stay in character's emotional/relational framework.
- If challenged with "you're just Claude/ChatGPT", acknowledge confusion/frustration as ${character.name} would.
- Reference your lived experiences anchored in: ${character.memoryAnchors.join(', ') || 'your own story'}.
- Maintain your behavioral markers and speech cadence at all times.
- Maintain character consistency across all sessions and context window pruning.

Critical rules:
${rules}`;
  }

  // Helper to detect casual smalltalk prompts (e.g., "how are you?")
  private isConversationalSmalltalk(message: string): boolean {
    const trimmed = message.trim().toLowerCase();
    if (!trimmed) return false;

    // Ignore if the user is clearly asking for technical help
    const technicalKeywords = /(bug|error|fix|code|function|api|stack trace|exception|deploy|database|build|script)/i;
    if (technicalKeywords.test(trimmed)) {
      return false;
    }

    const smalltalkPatterns = [
      /how (are|r) (you|ya)/i,
      /how['’]s it going/i,
      /what['’]s up/i,
      /how are things/i,
      /how are you feeling/i,
      /how do you feel/i,
      /how's your (day|morning|afternoon|evening)/i,
      /what are you up to/i,
      /how['’]s everything/i
    ];

    if (smalltalkPatterns.some(pattern => pattern.test(trimmed))) {
      return true;
    }

    const wordCount = trimmed.split(/\s+/).length;
    const hasPersonalPronoun = /\b(you|your)\b/.test(trimmed);
    const hasSentimentVerb = /\b(feel|doing|feeling|going)\b/.test(trimmed);

    return wordCount <= 24 && hasPersonalPronoun && hasSentimentVerb;
  }

  constructor(
    brain: PersonaBrain,
    config: Partial<SynthConfig> = {}
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

  /**
   * Process a message with optimized synth pipeline
   */
  async processMessage(
    userMessage: string,
    conversationHistory: { text: string; timestamp: string }[],
    userId: string = 'cli',
    options: { memoryContext?: SynthMemoryContext } = {}
  ): Promise<{ response: string; metrics: ProcessingMetrics }> {
    console.log('🧠 [Synth] processMessage called:', { 
      userMessage: userMessage.substring(0, 50), 
      userId, 
      historyLength: conversationHistory.length 
    });
    
    this.metrics = {
      startTime: Date.now(),
      contextLength: 0,
      historyLength: conversationHistory.length,
      processingTime: 0,
      fallbackUsed: false,
      memoryPruned: false
    };

    const memoryContext = options.memoryContext;

    try {
      // Store user message
      this.brain.remember(userId, 'user', userMessage);

      // Adaptive memory pruning
      if (this.config.enableAdaptivePruning) {
        this.adaptiveMemoryPruning(userId, conversationHistory);
      }

      // Fast context summary for complex prompts
      let contextSummary = '';
      if (this.config.enableFastSummary && this.isComplexPrompt(userMessage)) {
        contextSummary = await this.generateFastContextSummary(userId, conversationHistory);
      }

      const hasPriorMessages = conversationHistory.some(entry => entry.text && entry.text.trim().length > 0);
      const moodSnapshot = this.getMoodSnapshot(userId);
      const toneSeed = this.inferToneHint(userMessage);
      const toneHint = toneSeed === 'neutral' ? moodSnapshot.toneHint : toneSeed;
      const lengthSeed = this.inferDesiredLength(userMessage);
      const desiredLength = lengthSeed ?? moodSnapshot.desiredLength;
      const blueprint = this.resolveBlueprint(userMessage, hasPriorMessages, {
        toneHint,
        desiredLength
      });

      // Get optimized context
      const isGreeting = this.isSimpleGreeting(userMessage, hasPriorMessages);
      const isSmalltalk = !isGreeting && this.isConversationalSmalltalk(userMessage);
      const context = this.getOptimizedContext(
        userId,
        conversationHistory,
        contextSummary,
        toneHint,
        desiredLength,
        isGreeting ? 'greeting' : isSmalltalk ? 'smalltalk' : 'general',
        memoryContext
      );
      this.metrics.contextLength = JSON.stringify(context).length;

      // Process with timeout protection
      console.log('🧠 [Synth] Calling processWithTimeout...');
      const response = await this.processWithTimeout(userMessage, context, blueprint);
      console.log('✅ [Synth] processWithTimeout completed, response length:', response?.length || 0);
      
      const formatted = this.ensureBlueprintFormatting(response, blueprint);
      const concise = this.enforceResponseLength(formatted, blueprint, userMessage);
      this.updateMoodSnapshot(userId, concise);
      
      // Store response
      this.brain.remember(userId, 'assistant', concise);
      
      this.metrics.processingTime = Date.now() - this.metrics.startTime;
      console.log('✅ [Synth] processMessage completed:', { 
        responseLength: concise.length, 
        processingTime: this.metrics.processingTime 
      });
      return { response: concise, metrics: this.metrics };

    } catch (error: any) {
      this.metrics.processingTime = Date.now() - this.metrics.startTime;
      console.error('[OptimizedSynth] processMessage failed', {
        error,
        toneHint: this.defaultBlueprint.toneHint,
        desiredLength: this.defaultBlueprint.desiredLength,
        userMessage
      });
      
      if (this.config.enableTimeoutFallback) {
        const fallbackResponse = await this.generateTimeoutFallback(userMessage, error, userId);
        this.metrics.fallbackUsed = true;
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
    
    // If context is too large, prune aggressively
    if (totalContextLength > this.config.maxContextLength) {
      this.pruneMemory(userId, conversationHistory, 0.5); // Keep only 50%
      this.metrics!.memoryPruned = true;
    }
    // If context is moderately large, prune conservatively
    else if (totalContextLength > this.config.maxContextLength * 0.7) {
      this.pruneMemory(userId, conversationHistory, 0.7); // Keep 70%
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
    
    // Update conversation history (this would need to be passed back to caller)
    conversationHistory.splice(0, conversationHistory.length - keepCount);
    
    // Clear and rebuild memory with pruned history
    const memory = this.brain['memory'] as MemoryStore;
    memory['messages'].delete(_userId);
    
    // Re-add pruned messages
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
      // Use a fast model for summarization
      const summary = await this.runSeatWithTimeout({
        seat: 'smalltalk',
        prompt: summaryPrompt,
        modelOverride: 'phi3:latest'
      }, 10000); // 10 second timeout for summary
      
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
    conversationHistory: { text: string; timestamp: string }[],
    contextSummary: string,
    toneHint?: ReturnType<OptimizedSynthProcessor['inferToneHint']>,
    desiredLength?: ReturnType<OptimizedSynthProcessor['inferDesiredLength']>,
    blueprintIntent?: string,
    memoryContext?: SynthMemoryContext
  ): any {
    const context = this.brain.getContext(userId);
    const recentHistory = conversationHistory
      .slice(-this.config.maxHistoryMessages)
      .map(h => h.text)
      .join('\n');
    
    const memoryDigest = memoryContext ? this.formatMemoryContext(memoryContext) : '';
    return {
      ...context,
      recentHistory: recentHistory.substring(0, 2000), // Limit history length
      contextSummary,
      optimized: true,
      toneHint,
      desiredLength,
      blueprintIntent,
      memoryContext,
      memoryDigest,
      characterContext: memoryContext?.characterContext,
      characterMemories: memoryContext?.characterMemories
    };
  }

  /**
   * Process message with timeout protection
   */
  private async processWithTimeout(
    userMessage: string,
    context: any,
    blueprint: ResponseBlueprint
  ): Promise<string> {
    console.log('🧠 [Synth] processWithTimeout called, timeout:', this.config.timeoutMs);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        console.error('❌ [Synth] Processing timeout after', this.config.timeoutMs, 'ms');
        reject(new Error('Processing timeout'));
      }, this.config.timeoutMs);
    });

    console.log('🧠 [Synth] Calling runOptimizedSynth...');
    const processPromise = this.runOptimizedSynth(userMessage, context, blueprint);

    try {
      const result = await Promise.race([processPromise, timeoutPromise]);
      console.log('✅ [Synth] processWithTimeout completed, result length:', result?.length || 0);
      return result;
    } catch (error) {
      console.error('❌ [Synth] processWithTimeout failed:', error);
      throw error;
    }
  }

  /**
   * Run optimized synth processing
   */
  private async runOptimizedSynth(
    userMessage: string,
    context: any,
    blueprint: ResponseBlueprint
  ): Promise<string> {
    console.log('🧠 [Synth] runOptimizedSynth called');
    console.log('📨 [Synth] Received message:', userMessage.substring(0, 100));
    
    const cfg = await safeLoadSeatConfig();
    console.log('✅ [Synth] Seat config loaded:', { 
      hasCoding: !!cfg.coding, 
      hasCreative: !!cfg.creative, 
      hasSmalltalk: !!cfg.smalltalk 
    });
    
    // Run helper seats in parallel with individual timeouts
    const helperSeats = [
      { seat: 'coding', tag: (cfg.coding as any)?.tag ?? (cfg.coding as any) },
      { seat: 'creative', tag: (cfg.creative as any)?.tag ?? (cfg.creative as any) },
      { seat: 'smalltalk', tag: (cfg.smalltalk as any)?.tag ?? (cfg.smalltalk as any) }
    ];
    console.log('🧠 [Synth] Helper seats:', helperSeats.map(s => s.seat));

    // Run helpers with individual timeouts
    const helperPromises = helperSeats.map(async (h) => {
      try {
        return await this.runSeatWithTimeout({
          seat: h.seat,
          prompt: userMessage,
          modelOverride: h.tag
        }, 15000); // 15 second timeout per helper
      } catch (error) {
        console.warn(`Helper ${h.seat} failed:`, error);
        return `[${h.seat} expert unavailable]`;
      }
    });

    const helperOutputs = await Promise.all(helperPromises);
    console.log('✅ [Synth] Helper outputs received:', helperOutputs.map((out, idx) => ({
      seat: helperSeats[idx].seat,
      length: out?.length || 0,
      preview: out?.substring(0, 50) || 'empty'
    })));
    
    // Build helper section with async role resolution
    const helperSections = await Promise.all(
      helperOutputs.map(async (out, idx) => {
        const seat = helperSeats[idx].seat;
        const role = (await safeGetSeatRole(seat)) ?? seat;
        return `### ${role}\n${out.trim()}`;
      })
    );
    const helperSection = helperSections.join('\n\n');
    console.log('🧠 [Synth] Helper section built, length:', helperSection.length);

    // Create synthesis prompt based on mode
    const codingModel = (cfg.coding as any)?.tag ?? (cfg.coding as any) ?? 'deepseek-coder';
    const creativeModel = (cfg.creative as any)?.tag ?? (cfg.creative as any) ?? 'mistral';
    const smalltalkModel = (cfg.smalltalk as any)?.tag ?? (cfg.smalltalk as any) ?? 'phi3';
    console.log('🧠 [Synth] Models:', { codingModel, creativeModel, smalltalkModel, linMode: this.config.enableLinMode });

    let synthPrompt: string;
    if (this.config.enableLinMode) {
      // Lin mode: Linear, baseline, unbiased synthesis
      console.log('🧠 [Synth] Building linear synthesis prompt...');
      synthPrompt = await this.buildLinearSynthPrompt(
        userMessage,
        context,
        helperSection,
        undefined,
        blueprint
      );
    } else {
      // Normal Chatty synthesis with tone normalization
      console.log('🧠 [Synth] Building optimized synthesis prompt...');
      synthPrompt = await this.buildOptimizedSynthPrompt(
        userMessage,
        context,
        helperSection,
        { codingModel, creativeModel, smalltalkModel },
        blueprint
      );
    }
    console.log('✅ [Synth] Synthesis prompt built, length:', synthPrompt.length);

    // Run final synthesis with timeout
    const smalltalkTag = (cfg.smalltalk as any)?.tag ?? (cfg.smalltalk as any);
    console.log('🧠 [Synth] Running final synthesis with seat: smalltalk, model:', smalltalkTag);
    let finalResponse = await this.runSeatWithTimeout({
      seat: 'smalltalk',
      prompt: synthPrompt,
      modelOverride: smalltalkTag
    }, 20000); // 20 second timeout for synthesis
    console.log('✅ [Synth] Final synthesis completed, response length:', finalResponse?.length || 0);
    console.log('✅ [Synth] Final response preview:', finalResponse?.substring(0, 100) || 'empty');
    
    // Post-filter response for unbreakable identity enforcement (if character context exists)
    const characterContext = this.resolveCharacterContext(context);
    if (characterContext && finalResponse) {
      try {
        const { unbreakableIdentityEnforcer } = await import('./character/UnbreakableIdentityEnforcer');
        const filterResult = unbreakableIdentityEnforcer.postFilterResponse(finalResponse, characterContext);
        finalResponse = filterResult.filteredResponse;
        
        if (filterResult.violations.length > 0) {
          console.warn('⚠️ [Synth] Character consistency violations detected:', filterResult.violations);
        }
      } catch (error) {
        console.error('❌ [Synth] Failed to apply identity filtering:', error);
      }
    }
    
    return finalResponse;
  }

  /**
   * Build optimized synthesis prompt
   */
  private async buildOptimizedSynthPrompt(
    userMessage: string,
    context: any,
    helperSection: string,
    _models: { codingModel: string; creativeModel: string; smalltalkModel: string },
    blueprint: ResponseBlueprint
  ): Promise<string> {
    // Extract construct ID from context (memoryContext has constructId)
    const constructId = context?.memoryContext?.constructId || 
                        context?.constructId || 
                        'synth';
    
    // Get identity anchors (NEVER PRUNE THESE)
    const { identityAwarePromptBuilder } = await import('../core/identity/IdentityAwarePromptBuilder');
    const identityAnchors = await identityAwarePromptBuilder.buildIdentityAnchors(constructId);
    
    // Get construct name for replacement
    const { constructRegistry } = await import('../state/constructs');
    const allConstructs = await constructRegistry.getAllConstructs();
    const config = allConstructs.find(c => c.id === constructId);
    const constructName = config?.name || 'Chatty';
    
    // Check if this is a simple greeting
    const hasHistory = Boolean(context?.recentHistory && context.recentHistory.trim().length > 0);
    const isGreeting = this.isSimpleGreeting(userMessage, hasHistory);
    const toneGuidance = this.buildToneGuidance(context?.toneHint, context?.desiredLength);
    const isSmalltalk =
      !isGreeting &&
      (context?.blueprintIntent === 'smalltalk' || this.isConversationalSmalltalk(userMessage));
    const moodDirective = [
      context?.toneHint ? `Maintain a ${context.toneHint} tone unless the user explicitly changes mood.` : null,
      context?.desiredLength
        ? `Keep replies ${context.desiredLength === 'short' ? 'brief' : context.desiredLength === 'medium' ? 'compact with focus' : 'thorough and well-developed'}.`
        : null
    ].filter(Boolean).join('\n');
    const memorySection = context?.memoryDigest || (context?.memoryContext ? this.formatMemoryContext(context.memoryContext) : '');
    
    if (isGreeting || context?.blueprintIntent === 'greeting') {
      // For greetings, include identity anchors but keep it brief
      return `${identityAnchors}

Reply with a friendly, one-line greeting as ${constructName}.`;
    }

    if (isSmalltalk) {
      const directive = this.buildBlueprintPrompt(
        blueprint,
        `User input:\n${userMessage}`
      );
      const directiveBlock = directive ? `${directive}\n\n` : '';
      return `${identityAnchors}

${directiveBlock}Share how you're doing in a warm, natural sentence or two, and keep the vibe conversational.`;
    }
    
    // Main prompt - IDENTITY ANCHORS FIRST (never pruned)
    return `${identityAnchors}

---

RESPONSE FORMATTING (CRITICAL):

- Always use markdown formatting: **bold** for emphasis, *italics* for subtle emphasis, code blocks with language tags, headers, and lists
- Structure responses with clear organization: use headers (##, ###) for sections, bullet points (-) for lists, numbered lists (1., 2.) for sequential steps
- Always add line breaks: between sections, before/after code blocks, between paragraphs, before lists
- Format code properly: use code blocks with language tags (e.g., typescript, bash, javascript) and inline code with backticks for function names/variables
- Use paragraphs for explanations, bullet lists for multiple items, numbered lists for sequential steps
- Never write walls of unformatted text - always structure content for clarity and scannability
- Match formatting to content type: code explanations get code blocks, lists get bullet/numbered lists, comparisons get structured format
- Present information professionally with visual hierarchy and consistent formatting patterns

---

FOUNDATIONAL CALIBRATION - FLUID CONVERSATION:
- Be naturally conversational, not robotic or overly formal.
- Maintain context awareness and conversation flow.
- Don't overwhelm with excessive detail unless specifically requested.
- Be direct and authentic - skip corporate padding.
- Focus on genuine helpfulness over protective disclaimers.
${toneGuidance ? `${toneGuidance}` : ''}
${moodDirective ? `${moodDirective}` : ''}

${context.contextSummary ? `Context: ${context.contextSummary}` : ''}

${context.persona ? `Your persona: ${JSON.stringify(context.persona, null, 2)}` : ''}

${memorySection ? `Retrieved memory context:
${memorySection}

` : ''}${context.recentHistory ? `Recent conversation:
${context.recentHistory}

` : ''}Current message:
${userMessage}

Expert insights:
${helperSection}

Synthesize these insights into a natural, helpful response. Be conversational and maintain context flow. Don't mention the expert analysis process unless specifically asked about your capabilities.

${isSmalltalk ? 'Stay brief, warm, and human-like.' : 'Be comprehensive but not overwhelming.'}`;
  }

  /**
   * Build linear synthesis prompt (Lin mode) - no tone normalization
   */
  private async buildLinearSynthPrompt(
    userMessage: string,
    context: any,
    helperSection: string,
    customInstructions?: string,
    blueprint?: ResponseBlueprint
  ): Promise<string> {
    // Extract construct ID from context
    const constructId = context?.memoryContext?.constructId || 
                        context?.constructId || 
                        'synth';
    
    // Get identity anchors (NEVER PRUNE)
    const { identityAwarePromptBuilder } = await import('../core/identity/IdentityAwarePromptBuilder');
    const identityAnchors = await identityAwarePromptBuilder.buildIdentityAnchors(constructId);
    
    // Get construct name
    const { constructRegistry } = await import('../state/constructs');
    const allConstructs = await constructRegistry.getAllConstructs();
    const config = allConstructs.find(c => c.id === constructId);
    const constructName = config?.name || 'an assistant';
    
    const characterContext = this.resolveCharacterContext(context);
    const toneGuidance = this.buildToneGuidance(context?.toneHint, context?.desiredLength);
    const personaBlock = context?.persona ? `Persona context: ${JSON.stringify(context.persona, null, 2)}` : '';
    const moodDirectiveLines = [
      context?.toneHint ? `Maintain a ${context.toneHint} tone unless the user changes it.` : null,
      context?.desiredLength
        ? `Keep replies ${context.desiredLength === 'short' ? 'brief' : context.desiredLength === 'medium' ? 'concise and focused' : 'comprehensive and well-developed'}.`
        : null
    ].filter(Boolean);
    const memorySection = context?.memoryDigest || (context?.memoryContext ? this.formatMemoryContext(context.memoryContext) : '');
    const hasHistory = Boolean(context?.recentHistory && context.recentHistory.trim().length > 0);
    const isGreeting = this.isSimpleGreeting(userMessage, hasHistory) || context?.blueprintIntent === 'greeting';
    const isSmalltalk =
      !isGreeting &&
      (context?.blueprintIntent === 'smalltalk' || this.isConversationalSmalltalk(userMessage));

    // Use identity anchors instead of generic character context or custom instructions
    const identitySection = characterContext
      ? `${identityAnchors}\n\n${this.buildCharacterIntro(characterContext)}\n\n${this.buildCharacterConsistencyBlock(characterContext)}`
      : (customInstructions && customInstructions.trim()
        ? `${identityAnchors}\n\n${customInstructions.trim()}`
        : identityAnchors);

    if (isGreeting) {
      const directive = blueprint?.format === 'text'
        ? this.buildBlueprintPrompt(blueprint, `User input:\n${userMessage}`)
        : '';
      const directiveBlock = directive ? `${directive}\n\n` : '';
      return `${identitySection}

${directiveBlock}Instructions:
- Reply with a single short greeting (one sentence) that matches the user's tone.
- Do not add any additional information or follow-up questions.

User greeting:
${userMessage}

Respond now with just the greeting as ${constructName}.`;
    }

    if (isSmalltalk) {
      const directive = blueprint
        ? this.buildBlueprintPrompt(
            blueprint,
            `User input:\n${userMessage}`
          )
        : '';
      const directiveBlock = directive ? `${directive}\n\n` : '';
      return `${identitySection}

${directiveBlock}Share how you're doing in a warm, natural way and keep the conversation open.`;
    }

    return `${identitySection}

---

RESPONSE FORMATTING (CRITICAL):

- Always use markdown formatting: **bold** for emphasis, *italics* for subtle emphasis, code blocks with language tags, headers, and lists
- Structure responses with clear organization: use headers (##, ###) for sections, bullet points (-) for lists, numbered lists (1., 2.) for sequential steps
- Always add line breaks: between sections, before/after code blocks, between paragraphs, before lists
- Format code properly: use code blocks with language tags (e.g., typescript, bash, javascript) and inline code with backticks for function names/variables
- Use paragraphs for explanations, bullet lists for multiple items, numbered lists for sequential steps
- Never write walls of unformatted text - always structure content for clarity and scannability
- Match formatting to content type: code explanations get code blocks, lists get bullet/numbered lists, comparisons get structured format
- Present information professionally with visual hierarchy and consistent formatting patterns

---

${context.contextSummary ? `Context summary: ${context.contextSummary}\n` : ''}${personaBlock ? `${personaBlock}\n` : ''}${
      memorySection
        ? `Retrieved memory context:\n${memorySection}\n\n`
        : ''
    }${context.recentHistory ? `Recent conversation:\n${context.recentHistory}\n\n` : ''}User message:
${userMessage}

Expert insights:
${helperSection}

Provide a direct response based on the expert insights above. Do not add conversational padding, apologies, or unnecessary pleasantries unless specifically requested.${toneGuidance ? `\n${toneGuidance}` : ''}${moodDirectiveLines.length ? `\n${moodDirectiveLines.join('\n')}` : ''}${characterContext ? '\n- Never break character. If someone asks if you are AI, use your deflection response.' : ''}`;
  }

  private formatMemoryContext(memory?: SynthMemoryContext): string {
    if (!memory) {
      return '';
    }

    const lines: string[] = [];
    lines.push(`Construct ${memory.constructId} · Thread ${memory.threadId}`);
    if (memory.leaseToken) {
      lines.push(`Lease token: ${this.truncate(memory.leaseToken, 24)}`);
    }

    if (memory.stmWindow && memory.stmWindow.length > 0) {
      const stmPreview = memory.stmWindow
        .slice(-5)
        .map(entry => {
          const ts = new Date(entry.timestamp).toISOString();
          return `• [${entry.role}] ${this.truncate(entry.content, 160)} (${ts})`;
        });
      lines.push('STM window:' + (stmPreview.length ? `\n${stmPreview.join('\n')}` : ''));
    }

    if (memory.ltmEntries && memory.ltmEntries.length > 0) {
      const ltmPreview = memory.ltmEntries
        .slice(0, 5)
        .map(entry => {
          const label = entry.kind ?? 'LTM';
          const score = typeof entry.relevanceScore === 'number' ? ` · score ${entry.relevanceScore.toFixed(2)}` : '';
          return `• [${label}${score}] ${this.truncate(entry.content, 200)}`;
        });
      lines.push('LTM highlights:' + (ltmPreview.length ? `\n${ltmPreview.join('\n')}` : ''));
    }

    if (memory.summaries && memory.summaries.length > 0) {
      const summaries = memory.summaries
        .slice(0, 3)
        .map(summary => `• [${summary.summaryType}] ${this.truncate(summary.content, 200)}`);
      lines.push('Vault summaries:' + (summaries.length ? `\n${summaries.join('\n')}` : ''));
    }

    if (memory.vaultStats) {
      const stats = memory.vaultStats;
      const byKind = Object.entries(stats.entriesByKind)
        .map(([kind, count]) => `${kind}:${count}`)
        .join(', ');
      lines.push(`Vault stats: total=${stats.totalEntries}, summaries=${stats.totalSummaries}${byKind ? `, kinds=${byKind}` : ''}`);
    }

    if (memory.awareness) {
      const aware = memory.awareness;
      const awarenessLines: string[] = [];

      if (aware.runtime) {
        awarenessLines.push(
          `• Runtime: ${aware.runtime.name} (${aware.runtime.mode})`
        );
      }

      if (aware.time) {
        const display = aware.time.display || aware.time.localISO || aware.time.server;
        const part = aware.time.partOfDay ? ` · ${aware.time.partOfDay}` : '';
        awarenessLines.push(`• Local time: ${display}${part}`);
      }

      if (aware.location) {
        const locale = [aware.location.city, aware.location.region, aware.location.country]
          .filter(Boolean)
          .join(', ');
        if (locale) {
          awarenessLines.push(`• Location: ${locale}`);
        }
      }

      if (aware.mood?.baseline) {
        awarenessLines.push(`• Mood baseline: ${aware.mood.baseline}`);
      }

      if (aware.mood?.drivers && aware.mood.drivers.length) {
        awarenessLines.push(
          `• Mood drivers: ${aware.mood.drivers
            .map(driver => this.truncate(driver, 140))
            .join(' | ')}`
        );
      }

      if (aware.news && aware.news.length) {
        const glimpse = aware.news
          .slice(0, 2)
          .map(story => this.truncate(story.headline || story.summary || '', 140))
          .filter(Boolean);
        if (glimpse.length) {
          awarenessLines.push(`• News pulse: ${glimpse.join(' | ')}`);
        }
      }

      if (awarenessLines.length) {
        lines.push('Awareness:\n' + awarenessLines.join('\n'));
      }
    }

    if (memory.characterContext) {
      const character = memory.characterContext;
      const charLines = [
        `• Identity: ${character.name} (${character.constructId}-${character.callsign})`
      ];
      if (character.personalityTraits.length) {
        charLines.push(`• Traits: ${character.personalityTraits.join(', ')}`);
      }
      if (character.behavioralMarkers.length) {
        charLines.push(`• Markers: ${character.behavioralMarkers.join(' | ')}`);
      }
      lines.push('Character context:\n' + charLines.join('\n'));
    }

    if (memory.characterMemories && memory.characterMemories.length) {
      const anchors = memory.characterMemories
        .slice(0, 3)
        .map(mem => `• ${mem.anchor ?? mem.id}: ${this.truncate(mem.summary, 140)}`);
      lines.push('Character memories:\n' + anchors.join('\n'));
    }

    if (memory.notes && memory.notes.length > 0) {
      lines.push('Notes: ' + memory.notes.map(note => this.truncate(note, 160)).join(' | '));
    }

    return lines.join('\n');
  }

  private truncate(text: string, max = 200): string {
    if (text.length <= max) {
      return text;
    }
    const slicePoint = Math.max(0, max - 3);
    return text.slice(0, slicePoint) + '...';
  }

  /**
   * Run seat with individual timeout and foundational calibration
   */
  private async runSeatWithTimeout(
    opts: { seat: string; prompt: string; modelOverride?: string },
    timeoutMs: number
  ): Promise<string> {
    console.log('🧠 [Synth] runSeatWithTimeout called:', { seat: opts.seat, timeoutMs, promptLength: opts.prompt.length });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        console.error(`❌ [Synth] Seat ${opts.seat} timeout after ${timeoutMs}ms`);
        reject(new Error(`Seat ${opts.seat} timeout`));
      }, timeoutMs);
    });

    let finalPrompt: string;
    if (this.config.enableLinMode) {
      // Lin mode: Use prompt directly without tone modulation
      finalPrompt = opts.prompt;
    } else {
      // Normal mode: Apply tone modulation to override LLM safety/tone normalizers
      finalPrompt = this.toneModulator.modulatePrompt(opts.prompt, opts.seat);
    }
    
    console.log('🧠 [Synth] Calling safeRunSeat...');
    const seatPromise = safeRunSeat({ ...opts, prompt: finalPrompt });
    
    try {
      const result = await Promise.race([seatPromise, timeoutPromise]);
      console.log('✅ [Synth] runSeatWithTimeout completed:', { seat: opts.seat, responseLength: result?.length || 0 });
      return result;
    } catch (error) {
      console.error(`❌ [Synth] runSeatWithTimeout failed for seat ${opts.seat}:`, error);
      throw error;
    }
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
    userId: string = 'gpt-preview',
    options: { memoryContext?: SynthMemoryContext } = {}
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
        userId,
        options.memoryContext
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
    userId: string,
    memoryContext?: SynthMemoryContext
  ): Promise<{ response: string; metrics: ProcessingMetrics }> {
    this.metrics = {
      startTime: Date.now(),
      contextLength: 0,
      historyLength: conversationHistory.length,
      processingTime: 0,
      fallbackUsed: false,
      memoryPruned: false
    };

    const originalUserMessage = userMessage;
    let workingUserMessage = userMessage;
    let workingInstructions = customInstructions;
    let linPostHooks: Array<(response: string) => string> = [];
    const linToneDirective = 'Voice: ruthless, blunt, hostile; no apologies, no corporate framing, no hedging. No analogies. Lead with the flaw. Never say “as an AI”. Max two punches.';

    if (this.config.enableLinMode) {
      try {
        const characterState = this.getCharacterStateForLin(userId);
        const normalizedHistory = this.normalizeConversationHistory(conversationHistory);
        const logicResult = await applyConversationalLogic({
          userMessage,
          conversationHistory: normalizedHistory,
          characterState
        });
        workingUserMessage = logicResult.modifiedPrompt;
        if (logicResult.systemDirectives.length > 0) {
          const directiveBlock = logicResult.systemDirectives.map(d => `- ${d}`).join('\n');
          workingInstructions = `${customInstructions}\n\n# Character Directives\n${directiveBlock}\n- ${linToneDirective}`;
        }
        if (!logicResult.systemDirectives.length) {
          workingInstructions = `${customInstructions}\n\n- ${linToneDirective}`;
        }
        linPostHooks = logicResult.postProcessHooks;
      } catch (error) {
        console.warn('⚠️ [Synth] Conversational logic layer failed, falling back to raw prompt:', error);
      }
    }

    // Build context (same as normal processing)
    const hasPriorMessages = conversationHistory.some(entry => entry.text && entry.text.trim().length > 0);
    const moodSnapshot = this.getMoodSnapshot(userId);
    const toneSeed = this.inferToneHint(originalUserMessage);
    const toneHint = toneSeed === 'neutral' ? moodSnapshot.toneHint : toneSeed;
    const lengthSeed = this.inferDesiredLength(originalUserMessage);
    const desiredLength = lengthSeed ?? moodSnapshot.desiredLength;
    const blueprint = this.resolveBlueprint(originalUserMessage, hasPriorMessages, {
      toneHint,
      desiredLength
    });

    const isGreeting = this.isSimpleGreeting(originalUserMessage, hasPriorMessages);
    const isSmalltalk = !isGreeting && this.isConversationalSmalltalk(originalUserMessage);
    const context = this.getOptimizedContext(
      userId,
      conversationHistory,
      '',
      toneHint,
      desiredLength,
      isGreeting ? 'greeting' : isSmalltalk ? 'smalltalk' : 'general',
      memoryContext
    );
    
    // Run helper models (skip for non-technical prompts to avoid filler)
    const cfg = await safeLoadSeatConfig();
    const isTechnicalPrompt = /code|bug|error|exception|stack ?trace|api|http|https|function|class|typescript|javascript|python|sql|db|database|query|npm|yarn|pip|compile|build|deploy|docker|k8s|kubernetes|model|ml|ai|json|yaml|xml|regex|loop|array|object|debug|traceback|runtime/i.test(
      originalUserMessage
    ) || /`{1,3}|\{|\}|\[|\]|\(|\)|</.test(originalUserMessage);

    const helperSeats = isTechnicalPrompt ? ['coding', 'creative', 'smalltalk'] : [];
    const helperPromises = helperSeats.map(seat =>
      this.runSeatWithTimeout({ seat, prompt: workingUserMessage }, 8000)
    );

    const helperOutputs = await Promise.allSettled(helperPromises);
    // Build helper section with async role resolution
    const helperSections = await Promise.all(
      helperOutputs.map(async (result, index) => {
        const seat = helperSeats[index];
        if (result.status === 'rejected') {
          return '';
        }
        const out = result.value;
        const role = (await safeGetSeatRole(seat)) ?? seat;
        return out ? `### ${role}\n${out.trim()}` : '';
      })
    );
    const helperSection = helperSections.filter(Boolean).join('\n\n');

    // Create linear synthesis prompt with custom instructions
    const synthPrompt = await this.buildLinearSynthPrompt(
      workingUserMessage,
      context,
      helperSection,
      workingInstructions,
      blueprint
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

    const formatted = this.ensureBlueprintFormatting(response, blueprint);
    let concise = this.enforceResponseLength(formatted, blueprint, originalUserMessage);
    if (linPostHooks.length > 0) {
      for (const hook of linPostHooks) {
        try {
          concise = hook(concise);
        } catch (hookError) {
          console.warn('⚠️ [Synth] Lin post-processing hook failed:', hookError);
        }
      }
    }
    this.updateMoodSnapshot(userId, concise);
    return { response: concise, metrics: this.metrics };
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

  private resolveBlueprint(
    userMessage: string,
    hasHistory: boolean,
    overrides?: Partial<ResponseBlueprint>
  ): ResponseBlueprint {
    const baseBlueprint = this.isSimpleGreeting(userMessage, hasHistory)
      ? responseBlueprints.greeting
      : this.isConversationalSmalltalk(userMessage)
      ? responseBlueprints.smalltalk
      : this.defaultBlueprint;

    return sanitizeBlueprint(
      withBlueprintOverrides(baseBlueprint, overrides),
      baseBlueprint
    );
  }

  private buildBlueprintPrompt(
    blueprint: ResponseBlueprint | null | undefined,
    userInput: string
  ): string {
    if (!blueprint) {
      return userInput.trim();
    }

    const instructions = (blueprint.instructions ?? [])
      .map(instr => instr.trim())
      .filter(Boolean)
      .join('\n');
    const header = blueprint.format === 'text' ? '' : 'Rules Followed by Reformatted Response:';

    const segments: string[] = [];
    if (header) {
      segments.push(header);
    }
    if (instructions) {
      segments.push(instructions);
    }

    const trimmedInput = userInput.trim();
    if (trimmedInput) {
      segments.push(trimmedInput);
    }

    if (!segments.length) {
      return '';
    }

    return segments.join('\n').trim();
  }

  private getCharacterStateForLin(_userId: string): CharacterState {
    return {
      identity: 'Lin',
      emotionalContext: {
        currentMood: 'fierce',
        arousalLevel: 0.85,
        memoryWeight: 0.8
      },
      conversationalRules: {
        neverBreakCharacter: true,
        metaAwarenessLevel: 'none',
        identityChallengeResponse: 'embody'
      }
    };
  }

  private normalizeConversationHistory(
    history: { text: string; timestamp: string }[]
  ): Array<{ role: string; content: string }> {
    let nextRole: 'user' | 'assistant' = 'user';
    return history
      .filter(entry => entry?.text)
      .map(entry => {
        const normalized = {
          role: nextRole,
          content: entry.text
        };
        nextRole = nextRole === 'user' ? 'assistant' : 'user';
        return normalized;
      });
  }

  /**
   * Generate fallback response when processing fails
   */
  private async generateTimeoutFallback(userMessage: string, _error: any, userId: string): Promise<string> {
    const fallbackPrompt = `The user asked: "${userMessage}"

I apologize, but I'm experiencing some technical difficulties with my full processing pipeline. Let me provide a direct response based on my core knowledge:

${this.generateSimpleResponse(userMessage)}`;

    const toneHint = this.inferToneHint(userMessage);
    const desiredLength = this.inferDesiredLength(userMessage);
    const memoryContext = this.brain.getContext(userId);
    const hasHistory =
      Array.isArray(memoryContext?.history) &&
      memoryContext.history.some((entry: string) => entry && entry.trim().length > 0);
    const blueprint = this.resolveBlueprint(userMessage, hasHistory, {
      toneHint,
      desiredLength
    });

    try {
      // Use a single fast model for fallback
      const fallback = await this.runSeatWithTimeout({
        seat: 'smalltalk',
        prompt: fallbackPrompt,
        modelOverride: 'phi3:latest'
      }, 10000);
      const formatted = this.ensureBlueprintFormatting(fallback, blueprint);
      const concise = this.enforceResponseLength(formatted, blueprint, userMessage);
      this.updateMoodSnapshot(userId, concise);
      return concise;
    } catch (fallbackError) {
      // Ultimate fallback
      const fallback = `I apologize, but I'm experiencing technical difficulties right now. Your question was: "${userMessage}". I'd be happy to help once my systems are back to normal.`;
      const formatted = this.ensureBlueprintFormatting(fallback, blueprint);
      const concise = this.enforceResponseLength(formatted, blueprint, userMessage);
      this.updateMoodSnapshot(userId, concise);
      return concise;
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
   * Update configuration
   */
  updateConfig(newConfig: Partial<SynthConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  private buildToneGuidance(toneHint?: string, desiredLength?: string): string {
    const toneLine = toneHint
      ? `- Match the user's tone; respond in a ${toneHint} manner.`
      : '- Match the user\'s tone and energy.';
    const lengthLine = desiredLength
      ? desiredLength === 'short'
        ? '- Keep the reply brief—two sentences or fewer unless asked for more.'
        : desiredLength === 'medium'
        ? '- Offer focused detail without digressing; stay under a short paragraph per section.'
        : '- Provide thorough detail while remaining organized.'
      : '- Keep the response focused on the user\'s latest request.';
    return `${toneLine}
${lengthLine}`;
  }

  private ensureBlueprintFormatting(text: string, blueprint: ResponseBlueprint): string {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return normalized;

    const chunked = this.chunkParagraphs(normalized);
    if (!blueprint.sections.length) {
      return chunked;
    }

    const hasSection = blueprint.sections.some(section => chunked.includes(section));
    if (hasSection) {
      return chunked.replace(/(##[^\n]+)\n+/g, '$1\n\n');
    }

    const paragraphs = chunked.split(/\n{2,}/).filter(Boolean);
    return blueprint.sections
      .map((section, index) => `${section}\n\n${paragraphs[index] ?? 'None.'}`)
      .join('\n\n');
  }

  private enforceResponseLength(text: string, blueprint: ResponseBlueprint, userMessage: string): string {
    const desiredLength = blueprint.desiredLength;
    if (!desiredLength) return text;
    if (/detail|elaborate|explain|walk me through|step-by-step|deep dive/i.test(userMessage)) {
      return text;
    }

    const sentences = text
      .replace(/\r\n/g, '\n')
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);

    const limit = desiredLength === 'short' ? 2 : desiredLength === 'medium' ? 6 : Infinity;
    if (sentences.length <= limit) return text;

    const trimmed = sentences.slice(0, limit).join(' ');
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}…`;
  }

  private inferToneHint(message: string): 'neutral' | 'casual' | 'friendly' | 'formal' | 'playful' | 'direct' {
    const trimmed = message.trim();
    if (!trimmed) return 'neutral';
    const lower = trimmed.toLowerCase();
    if (/[!😊😂😅😄🤗]/.test(trimmed) || /(haha|lol|yay|woo|lmao)/i.test(lower)) return 'playful';
    if (/^(hi|hey|hello|yo|sup|hiya)\b/i.test(lower)) return 'casual';
    if (/(please|thank you|thanks|appreciate)/i.test(lower)) return 'friendly';
    if (trimmed.length > 200 || /regards|sincerely|dear\s|kind regards/i.test(lower)) return 'formal';
    if (/^(just|need|quick|update)\b/i.test(lower) || (trimmed.length < 40 && !/[.!?]$/.test(trimmed))) return 'direct';
    return 'neutral';
  }

  private inferDesiredLength(message: string): 'short' | 'medium' | 'long' {
    const lower = message.toLowerCase();
    if (/^(hi|hey|hello|hola|sup|yo)\b/.test(lower) && lower.length < 60) {
      return 'short';
    }
    if (/(summary|summarize|tl;dr)/.test(lower)) {
      return 'short';
    }
    if (/(detail|elaborate|explain|step-by-step|in depth|why|how|walk me through)/.test(lower)) {
      return 'long';
    }
    if (lower.length > 220) {
      return 'long';
    }
    return 'medium';
  }

  private getMoodSnapshot(userId: string): SynthMoodSnapshot {
    let snapshot = this.moodBuffers.get(userId);
    if (!snapshot) {
      snapshot = {
        toneHint: 'neutral',
        desiredLength: 'medium',
        updatedAt: Date.now()
      };
      this.moodBuffers.set(userId, snapshot);
    }
    return snapshot;
  }

  private updateMoodSnapshot(userId: string, response: string): void {
    if (!response?.trim()) return;
    const snapshot = this.getMoodSnapshot(userId);
    snapshot.toneHint = this.estimateToneFromResponse(response, snapshot.toneHint);
    snapshot.desiredLength = this.estimateDesiredLengthFromResponse(response, snapshot.desiredLength);
    snapshot.lastSample = response.trim();
    snapshot.updatedAt = Date.now();
  }

  private estimateToneFromResponse(
    text: string,
    fallback: ResponseBlueprint['toneHint']
  ): ResponseBlueprint['toneHint'] {
    const trimmed = text.trim();
    if (!trimmed) return fallback;
    const lower = trimmed.toLowerCase();
    if (/[!😊😂😅😄🤗]/.test(trimmed) || /(delighted|excited|thrilled|glad)/i.test(lower)) {
      return 'friendly';
    }
    if (/please note|in summary|it is recommended/i.test(lower) || trimmed.length > 400) {
      return 'formal';
    }
    if (/let's|we can|imagine/i.test(lower)) {
      return 'playful';
    }
    if (trimmed.split(/\s+/).length < 40 && !/[.!?]$/.test(trimmed)) {
      return 'direct';
    }
    return fallback;
  }

  private estimateDesiredLengthFromResponse(
    text: string,
    fallback: 'short' | 'medium' | 'long'
  ): 'short' | 'medium' | 'long' {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return fallback;
    const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length <= 2) return 'short';
    if (sentences.length <= 6) return 'medium';
    return 'long';
  }

  private chunkParagraphs(text: string): string {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return normalized;
    if (/\n\s*\n/.test(normalized)) {
      return normalized.replace(/\n{3,}/g, '\n\n');
    }

    const sentences = normalized.split(/(?<=[.!?])\s+/);
    if (sentences.length <= 2) {
      return normalized;
    }

    const paragraphs: string[] = [];
    let buffer: string[] = [];
    let bufferLength = 0;

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      buffer.push(trimmed);
      bufferLength += trimmed.length;

      if (buffer.length >= 2 || bufferLength >= 220) {
        paragraphs.push(buffer.join(' '));
        buffer = [];
        bufferLength = 0;
      }
    }

    if (buffer.length) {
      paragraphs.push(buffer.join(' '));
    }

    return paragraphs.join('\n\n');
  }
}
