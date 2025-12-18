/**
 * Automatic Runtime Orchestrator
 * 
 * Automatically determines the appropriate runtime for conversations based on:
 * - Conversation content analysis
 * - User preferences and history
 * - Available GPT capabilities
 * - Context requirements
 */

import { createGPTManager, type IGPTManager } from './gptManagerFactory';
import { shouldUseBrowserStubs, createBrowserSafeRuntimeOrchestrator } from './browserStubs';
import type { GPTConfig } from './types';

export interface RuntimeDetectionContext {
  conversationContent?: string;
  userMessage?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  userId?: string;
  threadId?: string;
  existingConstructId?: string;
}

export interface RuntimeAssignment {
  constructId: string;
  gptId?: string;
  runtimeId: string;
  confidence: number;
  reasoning: string;
}

export interface RuntimeCapabilities {
  coding: boolean;
  creative: boolean;
  analytical: boolean;
  conversational: boolean;
  technical: boolean;
  specialized: boolean;
}

export class AutomaticRuntimeOrchestrator {
  private static instance: AutomaticRuntimeOrchestrator;
  private gptManager: IGPTManager | null = null;
  private availableRuntimes: Map<string, GPTConfig> = new Map();
  private userPreferences: Map<string, RuntimeCapabilities> = new Map();
  private isBrowserEnvironment: boolean;

  private constructor() {
    this.isBrowserEnvironment = shouldUseBrowserStubs();
    
    if (this.isBrowserEnvironment) {
      console.log('[AutomaticRuntimeOrchestrator] Running in browser mode with limited functionality');
    } else {
      this.initializeGPTManager();
    }
    
    this.initializeRuntimes();
  }

  static getInstance(): AutomaticRuntimeOrchestrator {
    if (!AutomaticRuntimeOrchestrator.instance) {
      // In browser environment, return browser stub instead
      if (shouldUseBrowserStubs()) {
        return createBrowserSafeRuntimeOrchestrator() as any;
      }
      
      AutomaticRuntimeOrchestrator.instance = new AutomaticRuntimeOrchestrator();
    }
    return AutomaticRuntimeOrchestrator.instance;
  }

  private async initializeGPTManager(): Promise<void> {
    if (!this.isBrowserEnvironment) {
      try {
        this.gptManager = await createGPTManager();
      } catch (error) {
        console.error('[AutomaticRuntimeOrchestrator] Failed to initialize GPTManager:', error);
        this.gptManager = null;
      }
    }
  }

  /**
   * Automatically determine the best runtime for a conversation
   */
  async determineOptimalRuntime(context: RuntimeDetectionContext): Promise<RuntimeAssignment> {
    // If there's an existing construct ID and it's working well, prefer continuity
    if (context.existingConstructId && context.existingConstructId !== 'lin') {
      const existingRuntime = await this.validateExistingRuntime(context.existingConstructId, context);
      if (existingRuntime.confidence > 0.7) {
        return existingRuntime;
      }
    }

    // Analyze conversation content to determine requirements
    const requirements = await this.analyzeConversationRequirements(context);
    
    // Find best matching runtime
    const candidates = await this.findCandidateRuntimes(requirements);
    
    // Score and rank candidates
    const scoredCandidates = await this.scoreRuntimeCandidates(candidates, context, requirements);
    
    // Return the highest scoring runtime
    const bestRuntime = scoredCandidates[0];
    
    if (!bestRuntime || bestRuntime.confidence < 0.5) {
      // Fallback to intelligent default based on content
      return this.getIntelligentDefault(context, requirements);
    }

    return bestRuntime;
  }

  /**
   * Analyze conversation content to determine capability requirements
   */
  private async analyzeConversationRequirements(context: RuntimeDetectionContext): Promise<RuntimeCapabilities> {
    const content = this.extractAnalysisContent(context);
    
    // Content-based capability detection
    const capabilities: RuntimeCapabilities = {
      coding: this.detectCodingRequirements(content),
      creative: this.detectCreativeRequirements(content),
      analytical: this.detectAnalyticalRequirements(content),
      conversational: this.detectConversationalRequirements(content),
      technical: this.detectTechnicalRequirements(content),
      specialized: this.detectSpecializedRequirements(content)
    };

    // Factor in conversation history patterns
    if (context.conversationHistory) {
      this.adjustCapabilitiesFromHistory(capabilities, context.conversationHistory);
    }

    return capabilities;
  }

  /**
   * Extract content for analysis from various context sources
   */
  private extractAnalysisContent(context: RuntimeDetectionContext): string {
    const parts: string[] = [];
    
    if (context.userMessage) {
      parts.push(context.userMessage);
    }
    
    if (context.conversationContent) {
      parts.push(context.conversationContent);
    }
    
    if (context.conversationHistory) {
      const recentMessages = context.conversationHistory.slice(-5);
      parts.push(...recentMessages.map(msg => msg.content));
    }
    
    return parts.join(' ').toLowerCase();
  }

  /**
   * Detect if conversation requires coding capabilities
   */
  private detectCodingRequirements(content: string): boolean {
    const codingKeywords = [
      'code', 'programming', 'function', 'class', 'variable', 'algorithm',
      'debug', 'error', 'compile', 'syntax', 'javascript', 'python', 'typescript',
      'react', 'node', 'api', 'database', 'sql', 'git', 'repository',
      'implement', 'refactor', 'optimize', 'build', 'deploy'
    ];
    
    const codePatterns = [
      /```[\s\S]*?```/g, // Code blocks
      /`[^`]+`/g, // Inline code
      /\b(function|class|const|let|var|if|else|for|while)\b/g, // Code keywords
      /\b[A-Z][a-zA-Z]*\([^)]*\)/g, // Function calls
    ];
    
    // Check for coding keywords
    const keywordMatches = codingKeywords.filter(keyword => content.includes(keyword)).length;
    
    // Check for code patterns
    const patternMatches = codePatterns.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
    
    return keywordMatches >= 2 || patternMatches >= 1;
  }

  /**
   * Detect if conversation requires creative capabilities
   */
  private detectCreativeRequirements(content: string): boolean {
    const creativeKeywords = [
      'creative', 'story', 'write', 'poem', 'narrative', 'character',
      'plot', 'dialogue', 'scene', 'description', 'imagine', 'brainstorm',
      'idea', 'concept', 'design', 'art', 'music', 'novel', 'script'
    ];
    
    const creativePatterns = [
      /write (a|an|some)/g,
      /create (a|an|some)/g,
      /imagine (a|an|if)/g,
      /tell me (a|about)/g
    ];
    
    const keywordMatches = creativeKeywords.filter(keyword => content.includes(keyword)).length;
    const patternMatches = creativePatterns.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
    
    return keywordMatches >= 2 || patternMatches >= 1;
  }

  /**
   * Detect if conversation requires analytical capabilities
   */
  private detectAnalyticalRequirements(content: string): boolean {
    const analyticalKeywords = [
      'analyze', 'analysis', 'compare', 'evaluate', 'assess', 'examine',
      'investigate', 'research', 'study', 'review', 'critique', 'data',
      'statistics', 'metrics', 'performance', 'optimization', 'efficiency',
      'problem', 'solution', 'strategy', 'methodology'
    ];
    
    const analyticalPatterns = [
      /how (does|do|can|should)/g,
      /what (is|are|would|should)/g,
      /why (is|are|does|do)/g,
      /explain (how|why|what)/g
    ];
    
    const keywordMatches = analyticalKeywords.filter(keyword => content.includes(keyword)).length;
    const patternMatches = analyticalPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
    
    return keywordMatches >= 2 || patternMatches >= 2;
  }

  /**
   * Detect if conversation is primarily conversational
   */
  private detectConversationalRequirements(content: string): boolean {
    const conversationalKeywords = [
      'hello', 'hi', 'hey', 'how are you', 'good morning', 'good afternoon',
      'thanks', 'thank you', 'please', 'sorry', 'excuse me', 'chat', 'talk',
      'discuss', 'conversation', 'opinion', 'think', 'feel', 'believe'
    ];
    
    const conversationalPatterns = [
      /\b(i|you|we|they)\b/g,
      /\?$/gm, // Questions
      /\b(feel|think|believe|opinion)\b/g
    ];
    
    const keywordMatches = conversationalKeywords.filter(keyword => content.includes(keyword)).length;
    const patternMatches = conversationalPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
    
    return keywordMatches >= 1 || patternMatches >= 3;
  }

  /**
   * Detect if conversation requires technical capabilities
   */
  private detectTechnicalRequirements(content: string): boolean {
    const technicalKeywords = [
      'system', 'architecture', 'infrastructure', 'server', 'client',
      'network', 'security', 'authentication', 'authorization', 'encryption',
      'protocol', 'framework', 'library', 'configuration', 'deployment',
      'monitoring', 'logging', 'performance', 'scalability', 'reliability'
    ];
    
    const keywordMatches = technicalKeywords.filter(keyword => content.includes(keyword)).length;
    return keywordMatches >= 2;
  }

  /**
   * Detect if conversation requires specialized domain knowledge
   */
  private detectSpecializedRequirements(content: string): boolean {
    const specializedDomains = [
      'medical', 'legal', 'financial', 'scientific', 'academic', 'research',
      'mathematics', 'physics', 'chemistry', 'biology', 'psychology',
      'philosophy', 'history', 'literature', 'linguistics', 'economics'
    ];
    
    const keywordMatches = specializedDomains.filter(domain => content.includes(domain)).length;
    return keywordMatches >= 1;
  }

  /**
   * Adjust capabilities based on conversation history patterns
   */
  private adjustCapabilitiesFromHistory(capabilities: RuntimeCapabilities, history: Array<{ role: string; content: string }>): void {
    const historyContent = history.map(msg => msg.content).join(' ').toLowerCase();
    
    // If history shows consistent coding discussions, boost coding capability requirement
    if (this.detectCodingRequirements(historyContent)) {
      capabilities.coding = true;
    }
    
    // If history shows creative tasks, boost creative capability requirement
    if (this.detectCreativeRequirements(historyContent)) {
      capabilities.creative = true;
    }
    
    // Similar adjustments for other capabilities...
  }

  /**
   * Find candidate runtimes that match the required capabilities
   */
  private async findCandidateRuntimes(requirements: RuntimeCapabilities): Promise<GPTConfig[]> {
    if (this.isBrowserEnvironment || !this.gptManager) {
      console.warn('[AutomaticRuntimeOrchestrator] GPTManager not available, using browser fallback candidates');
      return this.getBrowserFallbackCandidates(requirements);
    }

    try {
      const allGPTs = await this.gptManager.getAllGPTs();
      const candidates: GPTConfig[] = [];
      
      for (const gpt of allGPTs) {
        const runtimeCapabilities = this.assessRuntimeCapabilities(gpt);
        
        if (this.capabilitiesMatch(requirements, runtimeCapabilities)) {
          candidates.push(gpt);
        }
      }
      
      return candidates;
    } catch (error) {
      console.error('[AutomaticRuntimeOrchestrator] Error finding candidate runtimes:', error);
      return this.getBrowserFallbackCandidates(requirements);
    }
  }

  /**
   * Browser fallback candidates when GPTManager is not available
   */
  private getBrowserFallbackCandidates(requirements: RuntimeCapabilities): GPTConfig[] {
    const fallbackCandidates: GPTConfig[] = [];
    
    // Create mock GPT configs for browser environment
    if (requirements.coding || requirements.technical) {
      fallbackCandidates.push({
        id: 'zen-browser',
        name: 'Zen',
        callsign: 'zen-001', // Changed from 'synth-001'
        description: 'Technical and coding assistant',
        instructions: 'You are Zen, a technical assistant specialized in coding and system architecture.',
        modelId: 'gpt-4',
        createdAt: new Date().toISOString()
      } as GPTConfig);
    }
    
    if (requirements.creative || requirements.conversational) {
      fallbackCandidates.push({
        id: 'lin-browser',
        name: 'Lin',
        callsign: 'lin-001',
        description: 'Creative and conversational assistant',
        instructions: 'You are Lin, a creative assistant specialized in writing and conversation.',
        modelId: 'gpt-4',
        createdAt: new Date().toISOString()
      } as GPTConfig);
    }
    
    // Always include a general fallback
    if (fallbackCandidates.length === 0) {
      fallbackCandidates.push({
        id: 'lin-browser',
        name: 'Lin',
        callsign: 'lin-001',
        description: 'General-purpose assistant',
        instructions: 'You are Lin, a helpful assistant.',
        modelId: 'gpt-4',
        createdAt: new Date().toISOString()
      } as GPTConfig);
    }
    
    return fallbackCandidates;
  }

  /**
   * Assess what capabilities a runtime provides
   */
  private assessRuntimeCapabilities(gpt: GPTConfig): RuntimeCapabilities {
    const name = gpt.name.toLowerCase();
    const description = gpt.description?.toLowerCase() || '';
    const instructions = gpt.instructions?.toLowerCase() || '';
    const content = `${name} ${description} ${instructions}`;
    
    return {
      coding: this.detectCodingRequirements(content) || name.includes('code') || name.includes('dev'),
      creative: this.detectCreativeRequirements(content) || name.includes('creative') || name.includes('writer'),
      analytical: this.detectAnalyticalRequirements(content) || name.includes('analyst') || name.includes('research'),
      conversational: this.detectConversationalRequirements(content) || name.includes('chat') || name.includes('assistant'),
      technical: this.detectTechnicalRequirements(content) || name.includes('tech') || name.includes('system'),
      specialized: this.detectSpecializedRequirements(content) || name.includes('expert') || name.includes('specialist')
    };
  }

  /**
   * Check if runtime capabilities match requirements
   */
  private capabilitiesMatch(requirements: RuntimeCapabilities, capabilities: RuntimeCapabilities): boolean {
    // At least one required capability must be met
    const requiredCapabilities = Object.entries(requirements).filter(([_, required]) => required);
    
    if (requiredCapabilities.length === 0) {
      return true; // No specific requirements, any runtime works
    }
    
    return requiredCapabilities.some(([capability, _]) => 
      capabilities[capability as keyof RuntimeCapabilities]
    );
  }

  /**
   * Score and rank runtime candidates
   */
  private async scoreRuntimeCandidates(
    candidates: GPTConfig[], 
    context: RuntimeDetectionContext, 
    requirements: RuntimeCapabilities
  ): Promise<RuntimeAssignment[]> {
    const scored: RuntimeAssignment[] = [];
    
    for (const candidate of candidates) {
      const capabilities = this.assessRuntimeCapabilities(candidate);
      let score = this.calculateCapabilityScore(requirements, capabilities);
      
      // Boost score for user preferences
      if (context.userId) {
        const userPrefs = this.userPreferences.get(context.userId);
        if (userPrefs) {
          score += this.calculatePreferenceBoost(capabilities, userPrefs);
        }
      }
      
      // Boost score for recent usage (continuity)
      if (context.existingConstructId === candidate.callsign) {
        score += 0.2;
      }
      
      const assignment: RuntimeAssignment = {
        constructId: candidate.callsign || candidate.id,
        gptId: candidate.id,
        runtimeId: `${candidate.callsign || candidate.id}-runtime`,
        confidence: Math.min(score, 1.0),
        reasoning: this.generateReasoningText(requirements, capabilities, score)
      };
      
      scored.push(assignment);
    }
    
    return scored.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate capability match score
   */
  private calculateCapabilityScore(requirements: RuntimeCapabilities, capabilities: RuntimeCapabilities): number {
    const requiredCapabilities = Object.entries(requirements).filter(([_, required]) => required);
    
    if (requiredCapabilities.length === 0) {
      return 0.5; // Neutral score for no specific requirements
    }
    
    const matchedCapabilities = requiredCapabilities.filter(([capability, _]) => 
      capabilities[capability as keyof RuntimeCapabilities]
    );
    
    return matchedCapabilities.length / requiredCapabilities.length;
  }

  /**
   * Calculate preference boost based on user history
   */
  private calculatePreferenceBoost(capabilities: RuntimeCapabilities, preferences: RuntimeCapabilities): number {
    let boost = 0;
    const preferenceEntries = Object.entries(preferences);
    
    for (const [capability, preferred] of preferenceEntries) {
      if (preferred && capabilities[capability as keyof RuntimeCapabilities]) {
        boost += 0.1;
      }
    }
    
    return Math.min(boost, 0.3); // Cap boost at 0.3
  }

  /**
   * Generate human-readable reasoning for runtime selection
   */
  private generateReasoningText(requirements: RuntimeCapabilities, capabilities: RuntimeCapabilities, score: number): string {
    const matchedCapabilities = Object.entries(requirements)
      .filter(([capability, required]) => required && capabilities[capability as keyof RuntimeCapabilities])
      .map(([capability, _]) => capability);
    
    if (matchedCapabilities.length === 0) {
      return "General-purpose runtime selected as fallback";
    }
    
    return `Selected for ${matchedCapabilities.join(', ')} capabilities (confidence: ${Math.round(score * 100)}%)`;
  }

  /**
   * Validate existing runtime is still appropriate
   */
  private async validateExistingRuntime(constructId: string, context: RuntimeDetectionContext): Promise<RuntimeAssignment> {
    const gpt = await this.gptManager.getGPTByCallsign(constructId);
    
    if (!gpt) {
      return {
        constructId,
        runtimeId: `${constructId}-runtime`,
        confidence: 0,
        reasoning: "Runtime no longer available"
      };
    }
    
    const requirements = await this.analyzeConversationRequirements(context);
    const capabilities = this.assessRuntimeCapabilities(gpt);
    const score = this.calculateCapabilityScore(requirements, capabilities);
    
    return {
      constructId,
      gptId: gpt.id,
      runtimeId: `${constructId}-runtime`,
      confidence: score + 0.1, // Small continuity bonus
      reasoning: `Continuing with existing runtime (${this.generateReasoningText(requirements, capabilities, score)})`
    };
  }

  /**
   * Get intelligent default when no good matches found
   */
  private getIntelligentDefault(context: RuntimeDetectionContext, requirements: RuntimeCapabilities): RuntimeAssignment {
    // Determine best default based on requirements
    let defaultConstructId = 'lin'; // Default fallback
    let reasoning = "Default runtime selected";
    
    if (requirements.coding) {
      defaultConstructId = 'zen-001'; // Changed from 'synth' to 'zen-001'
      reasoning = "Zen selected for coding capabilities";
    } else if (requirements.creative) {
      defaultConstructId = 'lin'; // Better for creative tasks
      reasoning = "Lin selected for creative capabilities";
    } else if (requirements.analytical) {
      defaultConstructId = 'lin'; // Lin is analytical
      reasoning = "Lin selected for analytical capabilities";
    }
    
    return {
      constructId: defaultConstructId,
      runtimeId: `${defaultConstructId}-runtime`,
      confidence: 0.6, // Moderate confidence for intelligent default
      reasoning
    };
  }

  /**
   * Initialize available runtimes
   */
  private async initializeRuntimes(): Promise<void> {
    if (this.isBrowserEnvironment) {
      console.log('[AutomaticRuntimeOrchestrator] Browser environment - using fallback runtimes');
      this.initializeBrowserFallbackRuntimes();
      return;
    }

    // Ensure GPTManager is initialized first
    if (!this.gptManager) {
      await this.initializeGPTManager();
    }

    if (!this.gptManager) {
      console.warn('[AutomaticRuntimeOrchestrator] GPTManager not available, using fallback runtimes');
      this.initializeBrowserFallbackRuntimes();
      return;
    }

    try {
      const gpts = await this.gptManager.getAllGPTs();
      this.availableRuntimes.clear();
      
      for (const gpt of gpts) {
        this.availableRuntimes.set(gpt.id, gpt);
      }
      
      console.log(`[AutomaticRuntimeOrchestrator] Initialized ${gpts.length} runtimes from database`);
    } catch (error) {
      console.warn('[AutomaticRuntimeOrchestrator] Failed to initialize runtimes from database:', error);
      this.initializeBrowserFallbackRuntimes();
    }
  }

  /**
   * Initialize fallback runtimes for browser environment
   */
  private initializeBrowserFallbackRuntimes(): void {
    this.availableRuntimes.clear();
    
    const fallbackRuntimes = [
      {
        id: 'lin-browser',
        name: 'Lin',
        callsign: 'lin-001',
        description: 'General-purpose assistant',
        instructions: 'You are Lin, a helpful assistant.',
        modelId: 'gpt-4',
        createdAt: new Date().toISOString()
      },
      {
        id: 'zen-browser',
        name: 'Zen',
        callsign: 'zen-001', // Changed from 'synth-001'
        description: 'Technical assistant',
        instructions: 'You are Zen, a technical assistant.',
        modelId: 'gpt-4',
        createdAt: new Date().toISOString()
      }
    ] as GPTConfig[];
    
    for (const runtime of fallbackRuntimes) {
      this.availableRuntimes.set(runtime.id, runtime);
    }
    
    console.log(`[AutomaticRuntimeOrchestrator] Initialized ${fallbackRuntimes.length} browser fallback runtimes`);
  }

  /**
   * Update user preferences based on usage patterns
   */
  updateUserPreferences(userId: string, usedCapabilities: RuntimeCapabilities): void {
    const existing = this.userPreferences.get(userId) || {
      coding: false,
      creative: false,
      analytical: false,
      conversational: false,
      technical: false,
      specialized: false
    };
    
    // Gradually adjust preferences based on usage
    Object.entries(usedCapabilities).forEach(([capability, used]) => {
      if (used) {
        existing[capability as keyof RuntimeCapabilities] = true;
      }
    });
    
    this.userPreferences.set(userId, existing);
  }
}
