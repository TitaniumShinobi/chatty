// GPT Runtime Service - Integrates GPTs with AI Service
import { GPTManager, GPTConfig, GPTRuntime } from './gptManager.js';
import { AIService } from './aiService.js';
import { detectTone } from './toneDetector.js';
import { VVAULTRetrievalWrapper } from './vvaultRetrieval.js';
import { buildKatanaPrompt } from './katanaPromptBuilder.js';
import { routePersona } from './personaRouter.js';
import { buildContextLayers } from './contextBuilder.js';
import { applyEmotionOverride, type Emotion } from './emotionOverride.js';
// import { PersonaBrain } from '../engine/memory/PersonaBrain.js';
// import { MemoryStore } from '../engine/memory/MemoryStore.js';

export interface GPTMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  gptId?: string;
}

export interface GPTResponse {
  content: string;
  context: string;
  files: string[];
  actions: string[];
  model: string;
  timestamp: string;
}

export class GPTRuntimeService {
  private static instance: GPTRuntimeService;
  private gptManager: GPTManager;
  private aiService: AIService;
  private activeGPTs: Map<string, GPTRuntime> = new Map();
  private messageHistory: Map<string, GPTMessage[]> = new Map();
  private vvaultRetrieval = new VVAULTRetrievalWrapper();

  private constructor() {
    this.gptManager = GPTManager.getInstance();
    this.aiService = AIService.getInstance();
  }

  static getInstance(): GPTRuntimeService {
    if (!GPTRuntimeService.instance) {
      GPTRuntimeService.instance = new GPTRuntimeService();
    }
    return GPTRuntimeService.instance;
  }

  // Load a GPT for conversation
  async loadGPT(gptId: string): Promise<GPTRuntime | null> {
    try {
      const runtime = await this.gptManager.loadGPTForRuntime(gptId);
      if (runtime) {
        this.activeGPTs.set(gptId, runtime);
        
        // Initialize message history if not exists
        if (!this.messageHistory.has(gptId)) {
          this.messageHistory.set(gptId, []);
        }
      }
      return runtime;
    } catch (error) {
      console.error('Error loading GPT:', error);
      return null;
    }
  }

  // Process a message with a specific GPT
  async processMessage(gptId: string, userMessage: string, _userId: string = 'anonymous'): Promise<GPTResponse> {
    const runtime = this.activeGPTs.get(gptId);
    if (!runtime) {
      throw new Error('GPT not loaded for runtime');
    }

    const oneWordMode = this.detectOneWordCue(userMessage);

    // Add user message to history
    const userMsg: GPTMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      gptId
    };

    const history = this.messageHistory.get(gptId) || [];
    history.push(userMsg);

    try {
      // Get GPT context
      const context = await this.gptManager.getGPTContext(gptId);

      // Build system prompt (Katana-aware path uses tone + VVAULT memories)
      const systemPrompt = await this.buildSystemPrompt(runtime.config, context, history, oneWordMode, userMessage, gptId);
      
      // Process with AI service using the GPT's model
      let aiResponse = await this.processWithModel(runtime.config.modelId, systemPrompt, userMessage);

      // Enforce one-word response if cue detected
      if (oneWordMode) {
        aiResponse = this.forceOneWord(aiResponse);
      }
      
      // Add assistant response to history
      const assistantMsg: GPTMessage = {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
        gptId
      };
      history.push(assistantMsg);

      // Persist this turn into VVAULT for Katana/LIN continuity
      await this.persistTurnToVvault(gptId, userMessage, aiResponse).catch(err => {
        console.warn('[gptRuntime] Failed to persist turn to VVAULT', err);
      });

      // Update context
      await this.gptManager.updateGPTContext(gptId, this.buildContextFromHistory(history));

      // Check for action triggers
      const triggeredActions = this.checkActionTriggers(runtime.config.actions, userMessage, aiResponse);
      
      // Execute triggered actions
      await this.executeTriggeredActions(triggeredActions, userMessage);

      return {
        content: aiResponse,
        context: context,
        files: runtime.config.files.map(f => f.originalName),
        actions: triggeredActions.map(a => a.name),
        model: runtime.config.modelId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error processing message with GPT:', error);
      throw error;
    }
  }

  private async buildSystemPrompt(
    config: GPTConfig & { personaLock?: { constructId: string; remaining: number }; personaSystemPrompt?: string; userId?: string; constructId?: string },
    _context: string,
    _history: GPTMessage[],
    oneWordMode: boolean,
    incomingMessage: string,
    gptId: string
  ): Promise<string> {
    const devDiagnostics = process.env.CHATTY_DEV_DIAGNOSTICS === 'true';

    // Hard lock enforcement: if lock is active, require orchestrator system prompt and matching construct
    if (config.personaLock?.constructId) {
      const expectedConstruct = config.personaLock.constructId;
      const providedConstruct = config.constructId || gptId;
      if (providedConstruct !== expectedConstruct && !gptId.includes(expectedConstruct)) {
        throw new Error(`Lock violation: expected ${expectedConstruct}, got ${providedConstruct}`);
      }
      if (!config.personaSystemPrompt) {
        throw new Error(`Lock active for ${expectedConstruct} but no systemPrompt provided`);
      }
      return config.personaSystemPrompt;
    }

    // If no lock, only support Katana via blueprint-first path; otherwise use legacy builder
    if (config.name?.toLowerCase().includes('katana')) {
      const tone = detectTone({ text: incomingMessage });
      const personaRoute = routePersona({
        intentTags: this.deriveIntentTags(incomingMessage),
        tone: tone?.tone,
        message: incomingMessage,
      });

      const memories = await this.vvaultRetrieval.retrieveMemories({
        constructCallsign: gptId,
        semanticQuery: 'katana continuity memory',
        toneHints: tone ? [tone.tone] : [],
        limit: 5,
      });

      // Load capsule (hardlock into GPT)
      let capsule = undefined;
      try {
        const response = await fetch(
          `/api/vvault/capsules/load?constructCallsign=${encodeURIComponent(gptId)}`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.ok && data.capsule) {
            // Wrap capsule data in object structure expected by buildKatanaPrompt
            capsule = { data: data.capsule };
            console.log(`✅ [gptRuntime] Loaded capsule for ${gptId}`, {
              hasTraits: !!data.capsule.traits,
              hasPersonality: !!data.capsule.personality,
              hasMemory: !!data.capsule.memory
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️ [gptRuntime] Failed to load capsule:`, error);
      }

      let blueprint = undefined;
      try {
        const { IdentityMatcher } = await import('../engine/character/IdentityMatcher.js');
        const identityMatcher = new IdentityMatcher();
        const constructId = config.constructId || 'gpt';
        const callsign = gptId.includes('katana-001') ? 'katana-001' : gptId;
        const userId = config.userId || 'anonymous';
        blueprint = await identityMatcher.loadPersonalityBlueprint(userId, constructId, callsign);
      } catch (error) {
        console.warn(`⚠️ [gptRuntime] Failed to load blueprint for Katana:`, error);
      }

      // MANDATORY: Persona context validation - require capsule OR blueprint
      if (!capsule && !blueprint) {
        throw new Error(
          `[gptRuntime] Persona context required for ${gptId} but neither capsule nor blueprint found. ` +
          `Cannot generate response without full persona context. Upload transcripts to create capsule/blueprint.`
        );
      }
      
      // If capsule exists, it takes precedence (hardlock)
      if (capsule) {
        console.log(`🔒 [gptRuntime] Capsule hardlocked for ${gptId} - using capsule data`);
      } else if (blueprint) {
        // Validate blueprint has required fields
        if (!blueprint.constructId || !blueprint.callsign) {
          throw new Error(
            `[gptRuntime] Invalid blueprint for ${gptId}: missing constructId or callsign. Cannot proceed.`
          );
        }
      }

      const layeredContext = buildContextLayers({
        selfContext: config.instructions || config.description || 'You are Katana.',
        userContext: '',
        topicContext: _context,
      });

      const emotion = this.mapToneToEmotion(tone?.tone);
      const personaWithEmotion = applyEmotionOverride({
        emotion,
        baseInstructions: layeredContext.combined,
      });

      const crisisNote = personaRoute.crisis
        ? `\n\n=== CRISIS_HOOK ${personaRoute.crisis.code} ===\n${personaRoute.crisis.reason}\n`
        : '';

      if (devDiagnostics) {
        console.info('[Katana Diagnostics]', {
          persona: personaRoute.persona,
          intentTags: this.deriveIntentTags(incomingMessage),
          crisis: personaRoute.crisis?.code || 'none',
          tone: tone?.tone || 'neutral',
          memories: memories.memories.length,
          emotion,
        });
      }

      return await buildKatanaPrompt({
        personaManifest: personaWithEmotion.instructions + crisisNote,
        incomingMessage,
        tone,
        memories: memories.memories,
        callSign: gptId,
        includeLegalSection: false,
        maxMemorySnippets: 5,
        oneWordCue: oneWordMode,
        blueprint,
        capsule, // Pass capsule for hardlock injection
      });
    }

    throw new Error('[gptRuntime] Non-Katana prompts must come from orchestrator when locks are enforced');
  }

  private deriveIntentTags(message: string): string[] {
    const m = message.toLowerCase();
    const tags: string[] = [];
    if (m.includes('why') || m.includes('how') || m.includes('explain')) tags.push('reflect');
    if (m.includes('angry') || m.includes('rage') || m.includes('escalate')) tags.push('escalate');
    if (m.includes('calm') || m.includes('deescalate') || m.includes('organize')) tags.push('deescalate');
    if (tags.length === 0) tags.push('default');
    return tags;
  }

  private mapToneToEmotion(tone?: string): Emotion {
    if (!tone) return 'neutral';
    if (tone === 'feral' || tone === 'urgent' || tone === 'sarcastic') return 'agitation';
    if (tone === 'protective') return 'calm';
    return 'neutral';
  }

  /**
   * Store the latest user/assistant exchange in VVAULT for downstream retrieval.
   * Scoped to Katana/LIN constructs (identified by name/callsign containing "katana").
   * Includes brevity metadata for ultra-brief GPTs.
   */
  private async persistTurnToVvault(gptId: string, userMessage: string, assistantMessage: string): Promise<void> {
    if (!gptId.toLowerCase().includes('katana')) return;

    // Calculate brevity metrics
    const wordCount = assistantMessage.trim().split(/\s+/).filter(w => w.length > 0).length;
    const oneWordResponse = wordCount === 1;
    const brevityScore = this.calculateBrevityScore(assistantMessage, wordCount);
    const analyticalSharpness = this.calculateAnalyticalSharpness(assistantMessage);

    // Determine brevity tags
    const tags: string[] = [];
    if (oneWordResponse) {
      tags.push('brevity:one-word');
    }
    if (brevityScore >= 0.9) {
      tags.push('brevity:ultra-brief');
    } else if (brevityScore >= 0.7) {
      tags.push('brevity:brief');
    }

    const timestamp = new Date().toISOString();
    const payload = {
      constructCallsign: gptId,
      context: userMessage,
      response: assistantMessage,
      metadata: {
        timestamp,
        source: 'gptRuntime',
        memoryType: 'long-term',
        threadId: gptId,
        // Brevity metadata
        brevityScore,
        wordCount,
        oneWordResponse,
        analyticalSharpness,
        tags,
      },
    };

    const res = await fetch('/api/vvault/identity/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`VVAULT store failed: ${res.status} ${errText}`);
    }
  }

  /**
   * Calculate brevity score (0-1) based on response characteristics
   */
  private calculateBrevityScore(response: string, wordCount: number): number {
    // Base score from word count (fewer words = higher score)
    let score = Math.max(0, 1 - (wordCount - 1) / 20); // 1 word = 1.0, 21+ words = 0.0
    
    // Penalize filler words
    const fillerPatterns = [
      /\b(um|uh|er|ah|well|actually|basically|literally|obviously|clearly)\b/gi,
      /\b(as an AI|I'm an AI|I am an AI|I'm here to|I can help|let me)\b/gi,
      /\b(I think|I believe|I feel|in my opinion|from my perspective)\b/gi,
    ];
    
    let fillerCount = 0;
    fillerPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) fillerCount += matches.length;
    });
    
    score -= fillerCount * 0.1;
    
    // Penalize preambles (sentences before the main point)
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 2) {
      score -= 0.1; // Multiple sentences suggest verbosity
    }
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate analytical sharpness score (0-1) based on response characteristics
   */
  private calculateAnalyticalSharpness(response: string): number {
    let score = 0.5; // Base score
    
    // Reward flaw-leading language
    const flawPatterns = [
      /\b(problem|issue|flaw|weakness|failure|mistake|error|wrong)\b/gi,
      /\b(cost|consequence|impact|result|outcome)\b/gi,
      /\b(admit|own|take responsibility|accountable)\b/gi,
    ];
    
    let flawMatches = 0;
    flawPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) flawMatches += matches.length;
    });
    
    score += Math.min(0.3, flawMatches * 0.05);
    
    // Penalize therapy-lite language
    const therapyPatterns = [
      /\b(I understand|I hear you|that must be|it's okay|you're valid)\b/gi,
      /\b(you're not alone|it's normal|everyone feels|don't worry)\b/gi,
    ];
    
    let therapyMatches = 0;
    therapyPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) therapyMatches += matches.length;
    });
    
    score -= therapyMatches * 0.2;
    
    // Penalize inspiration porn
    const inspirationPatterns = [
      /\b(you've got this|you can do it|believe in yourself|never give up)\b/gi,
      /\b(inspirational|motivational|uplifting|encouraging)\b/gi,
    ];
    
    let inspirationMatches = 0;
    inspirationPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) inspirationMatches += matches.length;
    });
    
    score -= inspirationMatches * 0.15;
    
    return Math.max(0, Math.min(1, score));
  }

  private async processWithModel(modelId: string, systemPrompt: string, userMessage: string): Promise<string> {
    // Note: AI service model setting would need to be implemented
    // this.aiService.setModel(modelId);
    
    // Create a combined prompt
    const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`;
    
    // Process with AI service
    const response = await this.aiService.processMessage(fullPrompt);
    
    // Extract content from response
    if (Array.isArray(response)) {
      // Handle packet-based response
      const contentPackets = response.filter(packet => packet.op === 'answer.v1');
      if (contentPackets.length > 0) {
        return contentPackets[0].payload?.content || 'I apologize, but I encountered an error processing your request.';
      }
    } else if (typeof response === 'string') {
      return response;
    }
    
    return 'I apologize, but I encountered an error processing your request.';
  }

  private detectOneWordCue(userMessage: string): boolean {
    const trimmed = userMessage.trim();
    
    // Explicit cues
    const explicitCues = [
      /^verdict:/i,
      /^diagnosis:/i,
      /one[-\s]?word verdict/i,
      /\b(one[-\s]?word)\b/i
    ];
    if (explicitCues.some(re => re.test(trimmed))) {
      return true;
    }
    
    // Natural brevity detection: very short messages (1-2 words) suggest brevity preference
    // Examples: "yo", "what", "why", "how", "yes", "no", "ok", "sure"
    const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
    const isVeryBrief = wordCount <= 2 && trimmed.length <= 20;
    const isSingleWord = wordCount === 1;
    
    // For Katana specifically, brief user messages suggest one-word responses are appropriate
    // This is handled by the ultra-brevity layer in the prompt, not enforced here
    // We only enforce strict one-word mode for explicit cues
    
    return false; // Only enforce strict one-word for explicit cues; brevity layer handles natural brevity
  }

  private forceOneWord(response: string): string {
    const match = response.trim().match(/^[\p{L}\p{N}'-]+/u);
    if (match && match[0]) return match[0];
    const first = response.trim().split(/\s+/)[0];
    return first || '';
  }

  private buildContextFromHistory(history: GPTMessage[]): string {
    return history.slice(-5).map(msg => 
      `${msg.role}: ${msg.content}`
    ).join('\n');
  }

  private checkActionTriggers(actions: any[], userMessage: string, aiResponse: string): any[] {
    const triggeredActions: any[] = [];
    
    for (const action of actions) {
      if (!action.isActive) continue;
      
      // Simple keyword-based triggering
      const triggerKeywords = action.name.toLowerCase().split(' ');
      const messageText = (userMessage + ' ' + aiResponse).toLowerCase();
      
      const hasTrigger = triggerKeywords.some((keyword: string) => 
        messageText.includes(keyword) && keyword.length > 3
      );
      
      if (hasTrigger) {
        triggeredActions.push(action);
      }
    }
    
    return triggeredActions;
  }

  private async executeTriggeredActions(actions: any[], userMessage: string): Promise<any[]> {
    const results: any[] = [];
    
    for (const action of actions) {
      try {
        const result = await this.gptManager.executeAction(action.id, {
          userMessage,
          timestamp: new Date().toISOString()
        });
        results.push({ action: action.name, result, success: true });
    } catch (error: any) {
      console.error(`Error executing action ${action.name}:`, error);
      results.push({ action: action.name, error: error.message, success: false });
    }
    }
    
    return results;
  }

  // Get conversation history for a GPT
  getHistory(gptId: string): GPTMessage[] {
    return this.messageHistory.get(gptId) || [];
  }

  // Clear conversation history for a GPT
  clearHistory(gptId: string): void {
    this.messageHistory.set(gptId, []);
    this.gptManager.updateGPTContext(gptId, '');
  }

  // Get active GPTs
  getActiveGPTs(): string[] {
    return Array.from(this.activeGPTs.keys());
  }

  // Unload a GPT
  unloadGPT(gptId: string): void {
    this.activeGPTs.delete(gptId);
    this.messageHistory.delete(gptId);
  }

  // Get GPT runtime info
  getGPTInfo(gptId: string): { config: GPTConfig; historyLength: number; lastUsed: string } | null {
    const runtime = this.activeGPTs.get(gptId);
    if (!runtime) return null;

    return {
      config: runtime.config,
      historyLength: this.messageHistory.get(gptId)?.length || 0,
      lastUsed: runtime.lastUsed
    };
  }
}
