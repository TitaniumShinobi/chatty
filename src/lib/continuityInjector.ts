// Continuity Injection Strategy - Memory Injection with Token Limits and Semantic Relevance
// Manages how memories are injected into conversations while respecting constraints

import { MemoryLedger, MemoryEntry, MemoryInjection, ContinuityHook } from './memoryLedger';
import { pkt } from './emit';
import { lexicon as lex } from '../data/lexicon';

export interface InjectionContext {
  userId: string;
  sessionId: string;
  conversationId: string;
  topic: string;
  userIntent: string;
  currentMessage: string;
  conversationHistory: string[];
  maxTokens: number;
  modelContext: {
    modelName: string;
    maxContextLength: number;
    currentContextLength: number;
  };
}

export interface InjectionStrategy {
  type: 'relevance_based' | 'importance_based' | 'hybrid' | 'contextual' | 'adaptive';
  parameters: {
    relevanceThreshold: number;
    importanceThreshold: number;
    maxMemoriesPerInjection: number;
    tokenReservation: number; // Reserve tokens for other context
    injectionPosition: 'prepend' | 'append' | 'interleave';
    semanticBoost: number;
  };
}

export interface InjectionResult {
  injectedMemories: MemoryEntry[];
  totalTokens: number;
  relevanceScore: number;
  injectionContext: string;
  strategy: InjectionStrategy;
  metadata: {
    memoriesConsidered: number;
    memoriesFiltered: number;
    injectionTime: number;
    tokenEfficiency: number;
  };
}

export interface ContinuitySession {
  sessionId: string;
  userId: string;
  startTime: number;
  lastActivity: number;
  injectedMemories: string[]; // Memory IDs
  continuityHooks: string[]; // Hook IDs
  contextHistory: Array<{
    timestamp: number;
    topic: string;
    intent: string;
    injectedTokens: number;
  }>;
}

export class ContinuityInjector {
  private memoryLedger: MemoryLedger;
  private activeSessions: Map<string, ContinuitySession> = new Map();
  private injectionStrategies: Map<string, InjectionStrategy> = new Map();
  private packetEmitter?: (packet: any) => void;

  constructor(memoryLedger: MemoryLedger) {
    this.memoryLedger = memoryLedger;
    this.initializeDefaultStrategies();
  }

  /**
   * Set packet emitter for real-time feedback
   */
  setPacketEmitter(emitter: (packet: any) => void): void {
    this.packetEmitter = emitter;
  }

  /**
   * Start a new continuity session
   */
  startSession(userId: string, sessionId: string): ContinuitySession {
    const session: ContinuitySession = {
      sessionId,
      userId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      injectedMemories: [],
      continuityHooks: [],
      contextHistory: []
    };

    this.activeSessions.set(sessionId, session);

    // Execute session-start rituals
    this.executeSessionRituals(userId);

    // Check for session-start continuity hooks
    const hooks = this.memoryLedger.checkContinuityHooks(userId, {
      sessionId,
      conversationId: '',
      topic: 'session_start',
      userInput: '',
      currentTime: Date.now()
    });

    hooks.forEach(hook => {
      session.continuityHooks.push(hook.id);
      this.emitPacket(pkt(lex.continuityHookTriggered, {
        hookId: hook.id,
        triggerType: hook.trigger.type,
        sessionId
      }));
    });

    this.emitPacket(pkt(lex.sessionMemoryLoaded, {
      sessionId,
      userId,
      hooksTriggered: hooks.length
    }));

    return session;
  }

  /**
   * End a continuity session
   */
  endSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      // Create session summary memory
      this.createSessionSummary(session);
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Inject memories for a conversation context
   */
  injectMemories(
    context: InjectionContext,
    strategyName: string = 'hybrid'
  ): InjectionResult {
    const startTime = Date.now();
    const strategy = this.injectionStrategies.get(strategyName) || this.injectionStrategies.get('hybrid')!;

    // Update session activity
    this.updateSessionActivity(context.sessionId, context);

    // Check for continuity hooks
    const triggeredHooks = this.checkContinuityHooks(context);

    // Get base memory injection
    const baseInjection = this.memoryLedger.injectMemories(
      context.userId,
      context.sessionId,
      {
        conversationId: context.conversationId,
        topic: context.topic,
        userIntent: context.userIntent,
        maxTokens: this.calculateAvailableTokens(context, strategy)
      }
    );

    // Apply injection strategy
    const filteredMemories = this.applyInjectionStrategy(
      baseInjection.memories,
      context,
      strategy
    );

    // Create injection context
    const injectionContext = this.createInjectionContext(
      filteredMemories,
      context,
      triggeredHooks
    );

    // Update session with injected memories
    this.updateSessionMemories(context.sessionId, filteredMemories);

    const injectionTime = Date.now() - startTime;
    const totalTokens = filteredMemories.reduce((sum, m) => sum + m.metadata.tokenCount, 0);
    const tokenEfficiency = totalTokens / context.maxTokens;

    const result: InjectionResult = {
      injectedMemories: filteredMemories,
      totalTokens,
      relevanceScore: baseInjection.relevanceScore,
      injectionContext,
      strategy,
      metadata: {
        memoriesConsidered: baseInjection.memories.length,
        memoriesFiltered: filteredMemories.length,
        injectionTime,
        tokenEfficiency
      }
    };

    // Emit injection packet
    this.emitPacket(pkt(lex.memoryInjected, {
      sessionId: context.sessionId,
      memoriesInjected: filteredMemories.length,
      totalTokens,
      relevanceScore: result.relevanceScore
    }));

    return result;
  }

  /**
   * Create a continuity hook
   */
  createContinuityHook(
    userId: string,
    trigger: ContinuityHook['trigger'],
    action: ContinuityHook['action'],
    options?: { priority?: number }
  ): ContinuityHook {
    const hook = this.memoryLedger.createContinuityHook(userId, trigger, action, options);
    
    this.emitPacket(pkt(lex.continuityHookCreated, {
      hookId: hook.id,
      triggerType: hook.trigger.type,
      userId
    }));

    return hook;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    session: ContinuitySession | null;
    memoryStats: {
      totalInjected: number;
      totalTokens: number;
      averageRelevance: number;
    };
  } | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    const memories = this.memoryLedger.queryMemories({
      userId: session.userId,
      sessionId: session.sessionId,
      limit: 1000
    });

    const injectedMemories = memories.filter(m => session.injectedMemories.includes(m.id));
    const totalTokens = injectedMemories.reduce((sum, m) => sum + m.metadata.tokenCount, 0);
    const averageRelevance = injectedMemories.length > 0 
      ? injectedMemories.reduce((sum, m) => sum + m.metadata.relevance, 0) / injectedMemories.length 
      : 0;

    return {
      session,
      memoryStats: {
        totalInjected: injectedMemories.length,
        totalTokens,
        averageRelevance
      }
    };
  }

  /**
   * Update memory relevance based on usage
   */
  updateMemoryRelevance(memoryId: string, usageContext: {
    wasHelpful: boolean;
    contextRelevance: number;
    userFeedback?: number;
  }): void {
    const memory = this.memoryLedger.queryMemories({
      userId: '', // Will be filtered by memoryId
      limit: 1
    }).find(m => m.id === memoryId);

    if (memory) {
      const currentRelevance = memory.metadata.relevance;
      let newRelevance = currentRelevance;

      // Adjust based on helpfulness
      if (usageContext.wasHelpful) {
        newRelevance = Math.min(1, currentRelevance + 0.1);
      } else {
        newRelevance = Math.max(0, currentRelevance - 0.05);
      }

      // Adjust based on context relevance
      newRelevance = Math.min(1, newRelevance + usageContext.contextRelevance * 0.1);

      // Adjust based on user feedback
      if (usageContext.userFeedback !== undefined) {
        newRelevance = Math.min(1, newRelevance + usageContext.userFeedback * 0.2);
      }

      this.memoryLedger.updateMemory(memoryId, {
        metadata: { ...memory.metadata, relevance: newRelevance }
      });
    }
  }

  // Private helper methods

  private initializeDefaultStrategies(): void {
    // Relevance-based strategy
    this.injectionStrategies.set('relevance_based', {
      type: 'relevance_based',
      parameters: {
        relevanceThreshold: 0.6,
        importanceThreshold: 0.3,
        maxMemoriesPerInjection: 10,
        tokenReservation: 0.2,
        injectionPosition: 'prepend',
        semanticBoost: 0.3
      }
    });

    // Importance-based strategy
    this.injectionStrategies.set('importance_based', {
      type: 'importance_based',
      parameters: {
        relevanceThreshold: 0.4,
        importanceThreshold: 0.7,
        maxMemoriesPerInjection: 8,
        tokenReservation: 0.15,
        injectionPosition: 'prepend',
        semanticBoost: 0.2
      }
    });

    // Hybrid strategy (default)
    this.injectionStrategies.set('hybrid', {
      type: 'hybrid',
      parameters: {
        relevanceThreshold: 0.5,
        importanceThreshold: 0.5,
        maxMemoriesPerInjection: 12,
        tokenReservation: 0.25,
        injectionPosition: 'prepend',
        semanticBoost: 0.25
      }
    });

    // Contextual strategy
    this.injectionStrategies.set('contextual', {
      type: 'contextual',
      parameters: {
        relevanceThreshold: 0.7,
        importanceThreshold: 0.4,
        maxMemoriesPerInjection: 15,
        tokenReservation: 0.3,
        injectionPosition: 'interleave',
        semanticBoost: 0.4
      }
    });

    // Adaptive strategy
    this.injectionStrategies.set('adaptive', {
      type: 'adaptive',
      parameters: {
        relevanceThreshold: 0.5,
        importanceThreshold: 0.5,
        maxMemoriesPerInjection: 10,
        tokenReservation: 0.2,
        injectionPosition: 'prepend',
        semanticBoost: 0.3
      }
    });
  }

  private calculateAvailableTokens(context: InjectionContext, strategy: InjectionStrategy): number {
    const reservedTokens = Math.floor(context.maxTokens * strategy.parameters.tokenReservation);
    const availableTokens = context.maxTokens - reservedTokens;
    return Math.max(0, availableTokens);
  }

  private applyInjectionStrategy(
    memories: MemoryEntry[],
    context: InjectionContext,
    strategy: InjectionStrategy
  ): MemoryEntry[] {
    const { parameters } = strategy;

    // Filter by thresholds
    let filtered = memories.filter(memory => 
      memory.metadata.relevance >= parameters.relevanceThreshold &&
      memory.metadata.importance >= parameters.importanceThreshold
    );

    // Apply semantic boost for contextual strategy
    if (strategy.type === 'contextual') {
      filtered = this.applySemanticBoost(filtered, context, parameters.semanticBoost);
    }

    // Apply adaptive adjustments
    if (strategy.type === 'adaptive') {
      filtered = this.applyAdaptiveAdjustments(filtered, context);
    }

    // Limit by count
    filtered = filtered.slice(0, parameters.maxMemoriesPerInjection);

    // Sort by strategy-specific criteria
    filtered.sort((a, b) => {
      switch (strategy.type) {
        case 'relevance_based':
          return b.metadata.relevance - a.metadata.relevance;
        case 'importance_based':
          return b.metadata.importance - a.metadata.importance;
        case 'hybrid':
          const scoreA = (a.metadata.relevance + a.metadata.importance) / 2;
          const scoreB = (b.metadata.relevance + b.metadata.importance) / 2;
          return scoreB - scoreA;
        case 'contextual':
          return this.calculateContextualScore(b, context) - this.calculateContextualScore(a, context);
        case 'adaptive':
          return this.calculateAdaptiveScore(b, context) - this.calculateAdaptiveScore(a, context);
        default:
          return 0;
      }
    });

    return filtered;
  }

  private applySemanticBoost(
    memories: MemoryEntry[],
    context: InjectionContext,
    boostFactor: number
  ): MemoryEntry[] {
    return memories.map(memory => ({
      ...memory,
      metadata: {
        ...memory.metadata,
        relevance: Math.min(1, memory.metadata.relevance + boostFactor)
      }
    }));
  }

  private applyAdaptiveAdjustments(
    memories: MemoryEntry[],
    context: InjectionContext
  ): MemoryEntry[] {
    // Adjust based on conversation history length
    const historyLength = context.conversationHistory.length;
    const adjustmentFactor = Math.min(0.2, historyLength * 0.01);

    return memories.map(memory => ({
      ...memory,
      metadata: {
        ...memory.metadata,
        relevance: Math.min(1, memory.metadata.relevance + adjustmentFactor)
      }
    }));
  }

  private calculateContextualScore(memory: MemoryEntry, context: InjectionContext): number {
    const topicMatch = memory.content.toLowerCase().includes(context.topic.toLowerCase()) ? 0.4 : 0;
    const intentMatch = memory.content.toLowerCase().includes(context.userIntent.toLowerCase()) ? 0.3 : 0;
    const historyMatch = context.conversationHistory.some(msg => 
      memory.content.toLowerCase().includes(msg.toLowerCase())
    ) ? 0.2 : 0;
    const baseScore = memory.metadata.relevance * 0.1;

    return topicMatch + intentMatch + historyMatch + baseScore;
  }

  private calculateAdaptiveScore(memory: MemoryEntry, context: InjectionContext): number {
    const baseScore = (memory.metadata.relevance + memory.metadata.importance) / 2;
    const recencyBoost = Math.exp(-(Date.now() - memory.timestamp) / (7 * 24 * 60 * 60 * 1000)) * 0.2;
    const usageBoost = Math.min(0.1, memory.metadata.accessCount * 0.01);

    return Math.min(1, baseScore + recencyBoost + usageBoost);
  }

  private createInjectionContext(
    memories: MemoryEntry[],
    context: InjectionContext,
    triggeredHooks: ContinuityHook[]
  ): string {
    if (memories.length === 0 && triggeredHooks.length === 0) {
      return '';
    }

    let injectionText = '';

    // Add continuity hook context
    if (triggeredHooks.length > 0) {
      injectionText += 'Based on our previous interactions and your preferences:\n\n';
    }

    // Add memory context
    if (memories.length > 0) {
      injectionText += 'Relevant context from our conversation history:\n\n';
      
      memories.forEach((memory, index) => {
        injectionText += `${index + 1}. ${memory.content}\n`;
      });
      
      injectionText += '\n';
    }

    return injectionText;
  }

  private checkContinuityHooks(context: InjectionContext): ContinuityHook[] {
    return this.memoryLedger.checkContinuityHooks(context.userId, {
      sessionId: context.sessionId,
      conversationId: context.conversationId,
      topic: context.topic,
      userInput: context.currentMessage,
      currentTime: Date.now()
    });
  }

  private updateSessionActivity(sessionId: string, context: InjectionContext): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      session.contextHistory.push({
        timestamp: Date.now(),
        topic: context.topic,
        intent: context.userIntent,
        injectedTokens: 0 // Will be updated after injection
      });
    }
  }

  private updateSessionMemories(sessionId: string, memories: MemoryEntry[]): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      const newMemoryIds = memories.map(m => m.id);
      session.injectedMemories.push(...newMemoryIds);
      
      // Update last context history entry with injected tokens
      if (session.contextHistory.length > 0) {
        const lastEntry = session.contextHistory[session.contextHistory.length - 1];
        lastEntry.injectedTokens = memories.reduce((sum, m) => sum + m.metadata.tokenCount, 0);
      }
    }
  }

  private executeSessionRituals(userId: string): void {
    const rituals = this.memoryLedger.executeRituals(userId);
    
    rituals.forEach(ritual => {
      this.emitPacket(pkt(lex.memoryRitualCompleted, {
        ritualId: ritual.id,
        ritualName: ritual.name,
        executionCount: ritual.metadata.executionCount
      }));
    });
  }

  private createSessionSummary(session: ContinuitySession): void {
    const summaryContent = `Session summary: ${session.contextHistory.length} interactions, ${session.injectedMemories.length} memories injected, ${session.continuityHooks.length} hooks triggered.`;
    
    this.memoryLedger.createMemory(
      session.userId,
      session.sessionId,
      'conversation',
      'session_summary',
      summaryContent,
      {
        importance: 0.8,
        relevance: 0.9,
        tags: ['session_summary', 'continuity']
      }
    );
  }

  private emitPacket(packet: any): void {
    if (this.packetEmitter) {
      this.packetEmitter(packet);
    }
  }
}
