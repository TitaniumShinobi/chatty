// GPT Runtime Service - Integrates GPTs with AI Service
import { GPTManager, GPTConfig, GPTRuntime } from './gptManager.js';
import { AIService } from './aiService.js';
import { buildLegalFrameworkSection } from './legalFrameworks.js';
import { detectTone } from './toneDetector.js';
import { VVAULTRetrievalWrapper } from './vvaultRetrieval.js';
import { buildKatanaPrompt } from './katanaPromptBuilder.js';
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
    config: GPTConfig,
    context: string,
    history: GPTMessage[],
    oneWordMode: boolean,
    incomingMessage: string,
    gptId: string
  ): Promise<string> {
    const parts: string[] = [];

    // Katana-specialized prompt building: use persona instructions + memories + tone.
    if (config.name?.toLowerCase().includes('katana')) {
      const tone = detectTone({ text: incomingMessage });
      const memories = await this.vvaultRetrieval.retrieveMemories({
        constructCallsign: gptId,
        semanticQuery: 'katana continuity memory',
        toneHints: tone ? [tone.tone] : [],
        limit: 5,
      });

      return buildKatanaPrompt({
        personaManifest: config.instructions || config.description || 'You are Katana.',
        incomingMessage,
        tone,
        memories: memories.memories,
        callSign: gptId,
        includeLegalSection: true,
        maxMemorySnippets: 5,
        oneWordCue: oneWordMode,
      });
    }

    // GPT Identity
    parts.push(`You are ${config.name}, ${config.description}`);
    
    // Instructions
    if (config.instructions) {
      parts.push(`\nInstructions:\n${config.instructions}`);
    }

    // HARDCODED: Legal frameworks (cannot be removed)
    parts.push(buildLegalFrameworkSection());

    if (oneWordMode) {
      parts.push(`\nConstraint: Respond in exactly one word. No punctuation, no preamble.`);
    }

    // Context from files
    if (context) {
      parts.push(`\nContext:\n${context}`);
    }

    // Recent conversation history
    if (history.length > 0) {
      const recentHistory = history.slice(-10); // Last 10 messages
      const historyText = recentHistory.map(msg => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n');
      parts.push(`\nRecent conversation:\n${historyText}`);
    }

    // Capabilities
    const capabilities = [];
    if (config.capabilities.webSearch) capabilities.push('web search');
    if (config.capabilities.codeInterpreter) capabilities.push('code interpretation');
    if (config.capabilities.imageGeneration) capabilities.push('image generation');
    if (config.capabilities.canvas) capabilities.push('canvas drawing');
    
    if (capabilities.length > 0) {
      parts.push(`\nAvailable capabilities: ${capabilities.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Store the latest user/assistant exchange in VVAULT for downstream retrieval.
   * Scoped to Katana/LIN constructs (identified by name/callsign containing "katana").
   */
  private async persistTurnToVvault(gptId: string, userMessage: string, assistantMessage: string): Promise<void> {
    if (!gptId.toLowerCase().includes('katana')) return;

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
    const cues = [
      /^verdict:/i,
      /^diagnosis:/i,
      /one[-\s]?word verdict/i,
      /\b(one[-\s]?word)\b/i
    ];
    return cues.some(re => re.test(userMessage.trim()));
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
