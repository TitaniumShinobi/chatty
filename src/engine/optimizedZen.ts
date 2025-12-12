// optimizedZen.ts - Optimized Zen processing with adaptive memory and timeout handling
// Addresses performance bottlenecks in deeply contextual prompts

// Use browserSeatRunner in browser (uses /ollama proxy), seatRunner in Node.js (direct connection)
const isBrowser = typeof window !== 'undefined';

// Conditional import: use browserSeatRunner in browser, seatRunner in Node.js
import { runSeat as browserRunSeat, loadSeatConfig as browserLoadSeatConfig, getSeatRole as browserGetSeatRole } from '../lib/browserSeatRunner.js';
import { runSeat as nodeRunSeat, loadSeatConfig as nodeLoadSeatConfig, getSeatRole as nodeGetSeatRole } from './seatRunner.js';

// Export the appropriate functions based on environment
const runSeat = isBrowser ? browserRunSeat : nodeRunSeat;
const loadSeatConfig = isBrowser ? browserLoadSeatConfig : nodeLoadSeatConfig;
const getSeatRole = isBrowser ? browserGetSeatRole : nodeGetSeatRole;

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
    userId: string = 'cli'
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

      // Get optimized context
      const context = this.getOptimizedContext(userId, conversationHistory, contextSummary);
      this.metrics.contextLength = JSON.stringify(context).length;

      // Process with timeout protection
      const response = await this.processWithTimeout(userMessage, context);
      
      // Store response
      this.brain.remember(userId, 'assistant', response);
      
      this.metrics.processingTime = Date.now() - this.metrics.startTime;
      return { response, metrics: this.metrics };

    } catch (error: any) {
      this.metrics.processingTime = Date.now() - this.metrics.startTime;
      
      if (this.config.enableTimeoutFallback) {
        const fallbackResponse = await this.generateTimeoutFallback(userMessage, error);
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
    contextSummary: string
  ): any {
    const context = this.brain.getContext(userId);
    const recentHistory = conversationHistory
      .slice(-this.config.maxHistoryMessages)
      .map(h => h.text)
      .join('\n');
    
    return {
      ...context,
      recentHistory: recentHistory.substring(0, 2000), // Limit history length
      contextSummary,
      optimized: true
    };
  }

  /**
   * Process message with timeout protection
   */
  private async processWithTimeout(userMessage: string, context: any): Promise<string> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Processing timeout')), this.config.timeoutMs);
    });

    const processPromise = this.runOptimizedZen(userMessage, context);

    return Promise.race([processPromise, timeoutPromise]);
  }

  /**
   * Run optimized zen processing
   */
  private async runOptimizedZen(userMessage: string, context: any): Promise<string> {
    const cfg = loadSeatConfig();
    
    // Run helper seats in parallel with individual timeouts
    const helperSeats = [
      { seat: 'coding', tag: (cfg.coding as any)?.tag ?? (cfg.coding as any) },
      { seat: 'creative', tag: (cfg.creative as any)?.tag ?? (cfg.creative as any) },
      { seat: 'smalltalk', tag: (cfg.smalltalk as any)?.tag ?? (cfg.smalltalk as any) }
    ];

    // Run helpers with individual timeouts
    const helperPromises = helperSeats.map(async (h) => {
      try {
        return await this.runSeatWithTimeout({
          seat: h.seat,
          prompt: userMessage,
          modelOverride: h.tag
        }, 5000); // 5 second timeout per helper; if it stalls, drop it
      } catch (error) {
        console.warn(`Helper ${h.seat} failed:`, error);
        return ''; // Do not inject verbose filler when helpers stall
      }
    });

    const helperOutputs = await Promise.all(helperPromises);
    
    // Build helper section
    const helperSection = helperOutputs
      .map((out, idx) => {
        const seat = helperSeats[idx].seat;
        const role = getSeatRole(seat) ?? seat;
        return `### ${role}\n${out.trim()}`;
      })
      .join('\n\n');

    // Create synthesis prompt based on mode
    const codingModel = (cfg.coding as any)?.tag ?? (cfg.coding as any) ?? 'deepseek-coder';
    const creativeModel = (cfg.creative as any)?.tag ?? (cfg.creative as any) ?? 'mistral';
    const smalltalkModel = (cfg.smalltalk as any)?.tag ?? (cfg.smalltalk as any) ?? 'phi3';

    let synthPrompt: string;
    if (this.config.enableLinMode) {
      // Lin mode: Linear, baseline, unbiased synthesis
      synthPrompt = this.buildLinearZenPrompt(
        userMessage,
        context,
        helperSection
      );
    } else {
      // Normal Chatty synthesis with tone normalization
      synthPrompt = this.buildOptimizedZenPrompt(
        userMessage,
        context,
        helperSection,
        { codingModel, creativeModel, smalltalkModel }
      );
    }

    // Run final synthesis with timeout
    const smalltalkTag = (cfg.smalltalk as any)?.tag ?? (cfg.smalltalk as any);
    const rawResponse = await this.runSeatWithTimeout({
      seat: 'smalltalk',
      prompt: synthPrompt,
      modelOverride: smalltalkTag
    }, 20000); // 20 second timeout for synthesis

    return this.config.enableLinMode ? this.stripLinHedges(rawResponse) : rawResponse;
  }

  /**
   * Build optimized zen prompt
   */
  private buildOptimizedZenPrompt(
    userMessage: string,
    context: any,
    helperSection: string,
    _models: { codingModel: string; creativeModel: string; smalltalkModel: string }
  ): string {
    
    // Check if this is a simple greeting
    const isGreeting = this.isSimpleGreeting(userMessage)
    
    return `You are Chatty, a fluid conversational AI that naturally synthesizes insights from specialized models.

FOUNDATIONAL CALIBRATION - FLUID CONVERSATION:
- Be naturally conversational, not robotic or overly formal.
- Maintain context awareness and conversation flow.
- Don't overwhelm with excessive detail unless specifically requested.
- Be direct and authentic - skip corporate padding.
- Focus on genuine helpfulness over protective disclaimers.

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
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Seat ${opts.seat} timeout`)), timeoutMs);
        });

        const seatPromise = runSeat({ 
          ...opts, 
          prompt: finalPrompt,
          timeout: timeoutMs,
          retries: 0 // Don't retry at browserSeatRunner level, we handle it here
        });
        
        const result = await Promise.race([seatPromise, timeoutPromise]);
        
        // Track retry metrics if retries were used
        if (attempt > 0 && this.metrics) {
          this.metrics.retryCount = attempt;
          this.metrics.retryDelays = retryDelays;
        }
        
        return result;
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on timeout or if we've exhausted retries
        if (error.message?.includes('timeout') || attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff for retries (1s, 2s delays)
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          retryDelays.push(delay);
          console.log(`Retrying ${opts.seat} seat (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If we get here, all retries failed
    throw new Error(`Seat ${opts.seat} failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
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
    const cfg = loadSeatConfig();
    const helperPromises = [
      this.runSeatWithTimeout({ seat: 'coding', prompt: userMessage }, 15000),
      this.runSeatWithTimeout({ seat: 'creative', prompt: userMessage }, 15000),
      this.runSeatWithTimeout({ seat: 'smalltalk', prompt: userMessage }, 15000)
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
  private async generateTimeoutFallback(userMessage: string, _error: any): Promise<string> {
    const fallbackPrompt = `The user asked: "${userMessage}"

I apologize, but I'm experiencing some technical difficulties with my full processing pipeline. Let me provide a direct response based on my core knowledge:

${this.generateSimpleResponse(userMessage)}`;

    try {
      // Use a single fast model for fallback
      return await this.runSeatWithTimeout({
        seat: 'smalltalk',
        prompt: fallbackPrompt,
        modelOverride: 'phi3:latest'
      }, 10000);
    } catch (fallbackError) {
      // Ultimate fallback
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
