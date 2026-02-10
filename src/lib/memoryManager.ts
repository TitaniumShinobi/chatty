// @ts-nocheck
// Memory Manager - Multi-User, Multi-Session Memory and Continuity System
// Main orchestrator for memory management with packet-only opcode architecture

import { MemoryLedger, MemoryEntry, MemoryQuery, LedgerStats } from './memoryLedger';
import { ContinuityInjector, InjectionContext, InjectionResult, ContinuitySession } from './continuityInjector';
import { pkt } from './emit';
import { lexicon as lex } from '../data/lexicon';

export interface MemoryManagerConfig {
  enableMemoryInjection: boolean;
  enableContinuityHooks: boolean;
  enableMemoryRituals: boolean;
  defaultInjectionStrategy: string;
  maxMemoriesPerUser: number;
  maxTokensPerInjection: number;
  autoCleanupEnabled: boolean;
  cleanupInterval: number; // milliseconds
}

export interface UserMemoryProfile {
  userId: string;
  totalMemories: number;
  activeMemories: number;
  averageImportance: number;
  averageRelevance: number;
  lastActivity: number;
  preferredCategories: string[];
  continuityHooks: number;
  memoryRituals: number;
}

export interface MemoryOperation {
  type: 'create' | 'update' | 'delete' | 'query' | 'inject' | 'hook' | 'ritual';
  userId: string;
  sessionId?: string;
  timestamp: number;
  metadata: Record<string, any>;
}

export interface MemoryAnalytics {
  totalOperations: number;
  operationsByType: Record<string, number>;
  averageInjectionTokens: number;
  averageRelevanceScore: number;
  mostActiveUsers: Array<{ userId: string; operations: number }>;
  memoryDistribution: Record<string, number>;
}

export class MemoryManager {
  private memoryLedger: MemoryLedger;
  private continuityInjector: ContinuityInjector;
  private config: MemoryManagerConfig;
  private activeUsers: Set<string> = new Set();
  private operationHistory: MemoryOperation[] = [];
  private packetEmitter?: (packet: any) => void;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  private readonly DEFAULT_CONFIG: MemoryManagerConfig = {
    enableMemoryInjection: true,
    enableContinuityHooks: true,
    enableMemoryRituals: true,
    defaultInjectionStrategy: 'hybrid',
    maxMemoriesPerUser: 10000,
    maxTokensPerInjection: 2000,
    autoCleanupEnabled: true,
    cleanupInterval: 24 * 60 * 60 * 1000 // 24 hours
  };

  constructor(config?: Partial<MemoryManagerConfig>) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    
    this.memoryLedger = new MemoryLedger();
    this.continuityInjector = new ContinuityInjector(this.memoryLedger);
    
    // Set up packet emitter
    this.continuityInjector.setPacketEmitter((packet) => {
      this.emitPacket(packet);
    });
    
    // Start auto-cleanup if enabled
    if (this.config.autoCleanupEnabled) {
      this.startAutoCleanup();
    }
  }

  /**
   * Set packet emitter for real-time feedback
   */
  setPacketEmitter(emitter: (packet: any) => void): void {
    this.packetEmitter = emitter;
  }

  /**
   * Initialize memory system for a user
   */
  initializeUser(userId: string): void {
    this.activeUsers.add(userId);
    
    // Create default continuity hooks for the user
    if (this.config.enableContinuityHooks) {
      this.createDefaultHooks(userId);
    }
    
    // Create default memory rituals
    if (this.config.enableMemoryRituals) {
      this.createDefaultRituals(userId);
    }
    
    this.logOperation({
      type: 'create',
      userId,
      timestamp: Date.now(),
      metadata: { action: 'user_initialized' }
    });
  }

  /**
   * Start a new session for a user
   */
  startSession(userId: string, sessionId: string): ContinuitySession {
    this.activeUsers.add(userId);
    
    const session = this.continuityInjector.startSession(userId, sessionId);
    
    this.logOperation({
      type: 'create',
      userId,
      sessionId,
      timestamp: Date.now(),
      metadata: { action: 'session_started', sessionId }
    });
    
    return session;
  }

  /**
   * End a session for a user
   */
  endSession(userId: string, sessionId: string): void {
    this.continuityInjector.endSession(sessionId);
    
    this.logOperation({
      type: 'update',
      userId,
      sessionId,
      timestamp: Date.now(),
      metadata: { action: 'session_ended', sessionId }
    });
  }

  /**
   * Create a new memory entry
   */
  createMemory(
    userId: string,
    sessionId: string,
    type: MemoryEntry['type'],
    category: string,
    content: string,
    options?: {
      importance?: number;
      relevance?: number;
      tags?: string[];
      context?: Record<string, any>;
      parentId?: string;
      expiresAt?: number;
    }
  ): MemoryEntry {
    const memory = this.memoryLedger.createMemory(
      userId,
      sessionId,
      type,
      category,
      content,
      options
    );
    
    this.logOperation({
      type: 'create',
      userId,
      sessionId,
      timestamp: Date.now(),
      metadata: {
        action: 'memory_created',
        memoryId: memory.id,
        type,
        category,
        importance: memory.metadata.importance,
        relevance: memory.metadata.relevance
      }
    });
    
    this.emitPacket(pkt(lex.memoryCreated, {
      memoryId: memory.id,
      userId,
      sessionId,
      type,
      category,
      importance: memory.metadata.importance,
      relevance: memory.metadata.relevance
    }));
    
    return memory;
  }

  /**
   * Update an existing memory entry
   */
  updateMemory(
    memoryId: string,
    updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'metadata' | 'relationships'>>
  ): MemoryEntry | null {
    const memory = this.memoryLedger.updateMemory(memoryId, updates);
    
    if (memory) {
      this.logOperation({
        type: 'update',
        userId: memory.userId,
        sessionId: memory.sessionId,
        timestamp: Date.now(),
        metadata: {
          action: 'memory_updated',
          memoryId,
          updates: Object.keys(updates)
        }
      });
      
      this.emitPacket(pkt(lex.memoryUpdated, {
        memoryId,
        userId: memory.userId,
        sessionId: memory.sessionId,
        updates: Object.keys(updates)
      }));
    }
    
    return memory;
  }

  /**
   * Delete a memory entry
   */
  deleteMemory(memoryId: string): boolean {
    const memory = this.memoryLedger.queryMemories({
      userId: '',
      limit: 1
    }).find(m => m.id === memoryId);
    
    const deleted = this.memoryLedger.deleteMemory(memoryId);
    
    if (deleted && memory) {
      this.logOperation({
        type: 'delete',
        userId: memory.userId,
        sessionId: memory.sessionId,
        timestamp: Date.now(),
        metadata: {
          action: 'memory_deleted',
          memoryId,
          type: memory.type,
          category: memory.category
        }
      });
      
      this.emitPacket(pkt(lex.memoryDeleted, {
        memoryId,
        userId: memory.userId,
        sessionId: memory.sessionId
      }));
    }
    
    return deleted;
  }

  /**
   * Query memories for a user
   */
  queryMemories(query: MemoryQuery): MemoryEntry[] {
    const memories = this.memoryLedger.queryMemories(query);
    
    this.logOperation({
      type: 'query',
      userId: query.userId,
      sessionId: query.sessionId,
      timestamp: Date.now(),
      metadata: {
        action: 'memories_queried',
        resultCount: memories.length,
        filters: {
          types: query.types,
          categories: query.categories,
          tags: query.tags,
          minImportance: query.minImportance,
          minRelevance: query.minRelevance
        }
      }
    });
    
    this.emitPacket(pkt(lex.memoryRetrieved, {
      userId: query.userId,
      sessionId: query.sessionId,
      count: memories.length,
      filters: query
    }));
    
    return memories;
  }

  /**
   * Inject memories for a conversation context
   */
  injectMemories(
    context: InjectionContext,
    strategyName?: string
  ): InjectionResult | null {
    if (!this.config.enableMemoryInjection) {
      return null;
    }
    
    const strategy = strategyName || this.config.defaultInjectionStrategy;
    const result = this.continuityInjector.injectMemories(context, strategy);
    
    this.logOperation({
      type: 'inject',
      userId: context.userId,
      sessionId: context.sessionId,
      timestamp: Date.now(),
      metadata: {
        action: 'memories_injected',
        strategy,
        memoriesInjected: result.injectedMemories.length,
        totalTokens: result.totalTokens,
        relevanceScore: result.relevanceScore
      }
    });
    
    return result;
  }

  /**
   * Create a continuity hook
   */
  createContinuityHook(
    userId: string,
    trigger: any,
    action: any,
    options?: { priority?: number }
  ): any {
    if (!this.config.enableContinuityHooks) {
      throw new Error('Continuity hooks are disabled');
    }
    
    const hook = this.continuityInjector.createContinuityHook(userId, trigger, action, options);
    
    this.logOperation({
      type: 'hook',
      userId,
      timestamp: Date.now(),
      metadata: {
        action: 'continuity_hook_created',
        hookId: hook.id,
        triggerType: hook.trigger.type
      }
    });
    
    return hook;
  }

  /**
   * Get user memory profile
   */
  getUserMemoryProfile(userId: string): UserMemoryProfile | null {
    const memories = this.memoryLedger.queryMemories({ userId });
    const stats = this.memoryLedger.getStats();
    
    if (memories.length === 0) {
      return null;
    }
    
    const activeMemories = memories.filter(m => m.lifecycle.isActive);
    const importanceSum = memories.reduce((sum, m) => sum + m.metadata.importance, 0);
    const relevanceSum = memories.reduce((sum, m) => sum + m.metadata.relevance, 0);
    
    const categories = memories.map(m => m.category);
    const categoryCounts = categories.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const preferredCategories = Object.entries(categoryCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([cat]) => cat);
    
    const lastActivity = Math.max(...memories.map(m => m.timestamp));
    
    return {
      userId,
      totalMemories: memories.length,
      activeMemories: activeMemories.length,
      averageImportance: importanceSum / memories.length,
      averageRelevance: relevanceSum / memories.length,
      lastActivity,
      preferredCategories,
      continuityHooks: 0, // Would need to query hooks separately
      memoryRituals: 0 // Would need to query rituals separately
    };
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): any {
    return this.continuityInjector.getSessionStats(sessionId);
  }

  /**
   * Get system-wide statistics
   */
  getSystemStats(): LedgerStats {
    return this.memoryLedger.getStats();
  }

  /**
   * Get memory analytics
   */
  getMemoryAnalytics(): MemoryAnalytics {
    const operations = this.operationHistory;
    const operationsByType = operations.reduce((acc, op) => {
      acc[op.type] = (acc[op.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const injectionOps = operations.filter(op => op.type === 'inject');
    const averageInjectionTokens = injectionOps.length > 0
      ? injectionOps.reduce((sum, op) => sum + (op.metadata.totalTokens || 0), 0) / injectionOps.length
      : 0;
    
    const averageRelevanceScore = injectionOps.length > 0
      ? injectionOps.reduce((sum, op) => sum + (op.metadata.relevanceScore || 0), 0) / injectionOps.length
      : 0;
    
    const userOperations = operations.reduce((acc, op) => {
      acc[op.userId] = (acc[op.userId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const mostActiveUsers = Object.entries(userOperations)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([userId, operations]) => ({ userId, operations }));
    
    const stats = this.memoryLedger.getStats();
    
    return {
      totalOperations: operations.length,
      operationsByType,
      averageInjectionTokens,
      averageRelevanceScore,
      mostActiveUsers,
      memoryDistribution: stats.memoryDistribution
    };
  }

  /**
   * Update memory relevance based on usage feedback
   */
  updateMemoryRelevance(
    memoryId: string,
    usageContext: {
      wasHelpful: boolean;
      contextRelevance: number;
      userFeedback?: number;
    }
  ): void {
    this.continuityInjector.updateMemoryRelevance(memoryId, usageContext);
    
    this.logOperation({
      type: 'update',
      userId: '', // Would need to get from memory
      timestamp: Date.now(),
      metadata: {
        action: 'memory_relevance_updated',
        memoryId,
        wasHelpful: usageContext.wasHelpful,
        contextRelevance: usageContext.contextRelevance,
        userFeedback: usageContext.userFeedback
      }
    });
  }

  /**
   * Clean up old or irrelevant memories
   */
  cleanupMemories(userId?: string): {
    deletedCount: number;
    updatedCount: number;
    freedTokens: number;
  } {
    const users = userId ? [userId] : Array.from(this.activeUsers);
    let deletedCount = 0;
    let updatedCount = 0;
    let freedTokens = 0;
    
    for (const uid of users) {
      const memories = this.memoryLedger.queryMemories({ userId: uid });
      
      for (const memory of memories) {
        // Delete very old, low-importance memories
        const ageInDays = (Date.now() - memory.timestamp) / (24 * 60 * 60 * 1000);
        if (ageInDays > 90 && memory.metadata.importance < 0.3) {
          this.memoryLedger.deleteMemory(memory.id);
          deletedCount++;
          freedTokens += memory.metadata.tokenCount;
        }
        
        // Update relevance for old memories
        if (ageInDays > 30) {
          const timeDecay = Math.exp(-ageInDays / 30);
          const newRelevance = memory.metadata.relevance * timeDecay;
          
          if (newRelevance < 0.1) {
            this.memoryLedger.deleteMemory(memory.id);
            deletedCount++;
            freedTokens += memory.metadata.tokenCount;
          } else if (newRelevance !== memory.metadata.relevance) {
            this.memoryLedger.updateMemory(memory.id, {
              metadata: { ...memory.metadata, relevance: newRelevance }
            });
            updatedCount++;
          }
        }
      }
    }
    
    this.logOperation({
      type: 'update',
      userId: userId || 'system',
      timestamp: Date.now(),
      metadata: {
        action: 'memory_cleanup',
        deletedCount,
        updatedCount,
        freedTokens
      }
    });
    
    return { deletedCount, updatedCount, freedTokens };
  }

  /**
   * Export user memories
   */
  exportUserMemories(userId: string): {
    memories: MemoryEntry[];
    hooks: any[];
    rituals: any[];
    metadata: {
      exportTime: number;
      totalMemories: number;
      totalTokens: number;
    };
  } {
    const memories = this.memoryLedger.queryMemories({ userId, includeInactive: true });
    const totalTokens = memories.reduce((sum, m) => sum + m.metadata.tokenCount, 0);
    
    return {
      memories,
      hooks: [], // Would need to implement hook export
      rituals: [], // Would need to implement ritual export
      metadata: {
        exportTime: Date.now(),
        totalMemories: memories.length,
        totalTokens
      }
    };
  }

  /**
   * Import user memories
   */
  importUserMemories(
    userId: string,
    data: {
      memories: MemoryEntry[];
      hooks?: any[];
      rituals?: any[];
    }
  ): {
    importedMemories: number;
    importedHooks: number;
    importedRituals: number;
  } {
    let importedMemories = 0;
    let importedHooks = 0;
    let importedRituals = 0;
    
    // Import memories
    for (const memory of data.memories) {
      try {
        this.memoryLedger.createMemory(
          userId,
          memory.sessionId,
          memory.type,
          memory.category,
          memory.content,
          {
            importance: memory.metadata.importance,
            relevance: memory.metadata.relevance,
            tags: memory.metadata.tags,
            context: memory.metadata.context
          }
        );
        importedMemories++;
      } catch (error) {
        console.error('Failed to import memory:', error);
      }
    }
    
    this.logOperation({
      type: 'create',
      userId,
      timestamp: Date.now(),
      metadata: {
        action: 'memories_imported',
        importedMemories,
        importedHooks,
        importedRituals
      }
    });
    
    return { importedMemories, importedHooks, importedRituals };
  }

  // Private helper methods

  private createDefaultHooks(userId: string): void {
    // Create default continuity hooks for common scenarios
    this.createContinuityHook(userId, {
      type: 'session_start',
      pattern: /.*/,
      conditions: {}
    }, {
      type: 'load_context',
      memoryIds: [],
      context: { loadUserPreferences: true }
    }, { priority: 0.8 });
    
    this.createContinuityHook(userId, {
      type: 'keyword',
      pattern: /remember|recall|before|previously/,
      conditions: {}
    }, {
      type: 'inject_memory',
      memoryIds: [],
      context: { boostRelevance: true }
    }, { priority: 0.9 });
  }

  private createDefaultRituals(userId: string): void {
    // Create default memory rituals
    this.memoryLedger.createMemoryRitual(
      userId,
      'Daily Memory Cleanup',
      'Clean up old and irrelevant memories daily',
      { type: 'daily' },
      [
        {
          type: 'cleanup_old_memories',
          parameters: { maxAge: 30 * 24 * 60 * 60 * 1000, minImportance: 0.3 }
        },
        {
          type: 'update_relevance',
          parameters: { timeDecay: true }
        }
      ]
    );
    
    this.memoryLedger.createMemoryRitual(
      userId,
      'Weekly Memory Consolidation',
      'Consolidate and summarize memories weekly',
      { type: 'weekly' },
      [
        {
          type: 'consolidate_memories',
          parameters: { similarityThreshold: 0.8 }
        },
        {
          type: 'create_summary',
          parameters: { maxSummaries: 10 }
        }
      ]
    );
  }

  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupMemories();
    }, this.config.cleanupInterval);
  }

  private stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private logOperation(operation: MemoryOperation): void {
    this.operationHistory.push(operation);
    
    // Keep only last 10000 operations
    if (this.operationHistory.length > 10000) {
      this.operationHistory = this.operationHistory.slice(-10000);
    }
  }

  private emitPacket(packet: any): void {
    if (this.packetEmitter) {
      this.packetEmitter(packet);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopAutoCleanup();
    this.activeUsers.clear();
    this.operationHistory = [];
  }
}
