// src/lib/memoryLedger.ts
// @ts-nocheck
// // Memory Ledger System - Multi-User, Multi-Session Continuity
// Ledger-based architecture for persistent memory with symbolic continuity hooks

export interface MemoryEntry {
  id: string;
  userId: string;
  sessionId: string;
  timestamp: number;
  type: 'fact' | 'preference' | 'conversation' | 'file_context' | 'continuity_hook' | 'ritual' | 'file_insight' | 'file_anchor' | 'file_motif';
  category: string;
  content: string;
  metadata: {
    importance: number; // 0-1 scale
    relevance: number; // 0-1 scale
    accessCount: number;
    lastAccessed: number;
    tags: string[];
    context: Record<string, any>;
    tokenCount: number;
    semanticHash: string;
    // File-specific metadata
    fileContext?: {
      documentId: string;
      fileName: string;
      fileType: string;
      chunkId?: string;
      pageNumber?: number;
      section?: string;
      extractionMethod: 'chunk' | 'summary' | 'insight' | 'anchor' | 'motif';
      confidence: number;
    };
  };
  relationships: {
    parentId?: string;
    childIds: string[];
    relatedIds: string[];
    continuityHooks: string[];
    // File-specific relationships
    fileRelationships?: {
      sourceDocumentId: string;
      relatedChunkIds: string[];
      anchorPoints: string[];
      motifInstances: string[];
    };
  };
  lifecycle: {
    created: number;
    updated: number;
    expiresAt?: number;
    isActive: boolean;
  };
}

export interface ContinuityHook {
  id: string;
  userId: string;
  trigger: {
    type: 'keyword' | 'context' | 'time' | 'session_start' | 'conversation_topic' | 'file_content' | 'file_upload' | 'semantic_match';
    pattern: string | RegExp;
    conditions: Record<string, any>;
  };
  action: {
    type: 'inject_memory' | 'load_context' | 'trigger_ritual' | 'update_preference' | 'inject_file_context' | 'link_file_memory';
    memoryIds: string[];
    context: Record<string, any>;
  };
  metadata: {
    priority: number;
    isActive: boolean;
    lastTriggered: number;
    triggerCount: number;
    // File-specific metadata
    fileContext?: {
      documentTypes: string[];
      contentPatterns: string[];
      semanticThreshold: number;
    };
  };
}

export interface MemoryRitual {
  id: string;
  userId: string;
  name: string;
  description: string;
  schedule: {
    type: 'daily' | 'weekly' | 'monthly' | 'session_start' | 'manual';
    interval?: number;
    lastExecuted: number;
  };
  actions: Array<{
    type: 'cleanup_old_memories' | 'consolidate_memories' | 'update_relevance' | 'create_summary';
    parameters: Record<string, any>;
  }>;
  metadata: {
    isActive: boolean;
    executionCount: number;
    averageDuration: number;
  };
}

export interface MemoryQuery {
  userId: string;
  sessionId?: string;
  types?: MemoryEntry['type'][];
  categories?: string[];
  tags?: string[];
  minImportance?: number;
  minRelevance?: number;
  maxAge?: number;
  limit?: number;
  includeInactive?: boolean;
  // File-specific query options
  fileContext?: {
    documentId?: string;
    fileName?: string;
    fileType?: string;
    extractionMethod?: MemoryEntry['metadata']['fileContext']['extractionMethod'];
  };
  includeFileMemories?: boolean;
  semanticSearch?: {
    query: string;
    threshold: number;
  };
}

export interface MemoryInjection {
  memories: MemoryEntry[];
  totalTokens: number;
  relevanceScore: number;
  injectionContext: {
    conversationId: string;
    topic: string;
    userIntent: string;
  };
  // File-specific injection data
  fileContext?: {
    documentIds: string[];
    chunkIds: string[];
    fileMemories: MemoryEntry[];
    fileTokens: number;
  };
}

export interface LedgerStats {
  totalEntries: number;
  activeEntries: number;
  totalUsers: number;
  totalSessions: number;
  averageImportance: number;
  averageRelevance: number;
  memoryDistribution: Record<string, number>;
  storageSize: number;
  // File-specific statistics
  fileStats: {
    totalFileMemories: number;
    totalDocuments: number;
    totalChunks: number;
    fileTypeDistribution: Record<string, number>;
    averageFileConfidence: number;
  };
}

export class MemoryLedger {
  private entries: Map<string, MemoryEntry> = new Map();
  private continuityHooks: Map<string, ContinuityHook> = new Map();
  private rituals: Map<string, MemoryRitual> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private semanticIndex: Map<string, Set<string>> = new Map(); // semanticHash -> memoryIds
  // File-specific indexes
  private fileIndex: Map<string, Set<string>> = new Map(); // documentId -> memoryIds
  private chunkIndex: Map<string, Set<string>> = new Map(); // chunkId -> memoryIds
  private anchorIndex: Map<string, Set<string>> = new Map(); // anchor -> memoryIds
  private motifIndex: Map<string, Set<string>> = new Map(); // motif -> memoryIds

  constructor() {
    this.loadFromStorage();
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
      // File-specific options
      fileContext?: MemoryEntry['metadata']['fileContext'];
      fileRelationships?: MemoryEntry['relationships']['fileRelationships'];
    }
  ): MemoryEntry {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const semanticHash = this.generateSemanticHash(content);
    const tokenCount = this.estimateTokenCount(content);

    const memory: MemoryEntry = {
      id,
      userId,
      sessionId,
      timestamp,
      type,
      category,
      content,
      metadata: {
        importance: options?.importance ?? 0.5,
        relevance: options?.relevance ?? 0.5,
        accessCount: 0,
        lastAccessed: timestamp,
        tags: options?.tags ?? [],
        context: options?.context ?? {},
        tokenCount,
        semanticHash,
        fileContext: options?.fileContext
      },
      relationships: {
        parentId: options?.parentId,
        childIds: [],
        relatedIds: [],
        continuityHooks: [],
        fileRelationships: options?.fileRelationships
      },
      lifecycle: {
        created: timestamp,
        updated: timestamp,
        expiresAt: options?.expiresAt,
        isActive: true
      }
    };

    // Store the memory
    this.entries.set(id, memory);
    
    // Update indexes
    this.updateUserSessionIndex(userId, sessionId);
    this.updateSemanticIndex(semanticHash, id);
    
    // Update file-specific indexes
    if (options?.fileContext) {
      this.updateFileIndexes(options.fileContext, id);
    }
    
    // Update parent relationship if specified
    if (options?.parentId) {
      this.updateParentChildRelationship(options.parentId, id);
    }

    // Save to storage
    this.saveToStorage();

    return memory;
  }

  /**
   * Update an existing memory entry
   */
  updateMemory(
    memoryId: string,
    updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'metadata' | 'relationships'>>
  ): MemoryEntry | null {
    const memory = this.entries.get(memoryId);
    if (!memory) return null;

    const updatedMemory: MemoryEntry = {
      ...memory,
      ...updates,
      metadata: {
        ...memory.metadata,
        ...updates.metadata,
        lastAccessed: Date.now(),
        accessCount: memory.metadata.accessCount + 1
      },
      lifecycle: {
        ...memory.lifecycle,
        updated: Date.now()
      }
    };

    // Update semantic hash if content changed
    if (updates.content && updates.content !== memory.content) {
      const newSemanticHash = this.generateSemanticHash(updates.content);
      updatedMemory.metadata.semanticHash = newSemanticHash;
      updatedMemory.metadata.tokenCount = this.estimateTokenCount(updates.content);
      
      // Update semantic index
      this.updateSemanticIndex(newSemanticHash, memoryId);
    }

    this.entries.set(memoryId, updatedMemory);
    this.saveToStorage();

    return updatedMemory;
  }

  /**
   * Delete a memory entry
   */
  deleteMemory(memoryId: string): boolean {
    const memory = this.entries.get(memoryId);
    if (!memory) return false;

    // Remove from indexes
    this.removeFromSemanticIndex(memory.metadata.semanticHash, memoryId);
    
    // Update parent relationships
    if (memory.relationships.parentId) {
      const parent = this.entries.get(memory.relationships.parentId);
      if (parent) {
        parent.relationships.childIds = parent.relationships.childIds.filter(id => id !== memoryId);
      }
    }

    // Remove child relationships
    memory.relationships.childIds.forEach(childId => {
      const child = this.entries.get(childId);
      if (child) {
        child.relationships.parentId = undefined;
      }
    });

    this.entries.delete(memoryId);
    this.saveToStorage();

    return true;
  }

  /**
   * Query memories based on criteria
   */
  queryMemories(query: MemoryQuery): MemoryEntry[] {
    let results = Array.from(this.entries.values());

    // Filter by user
    results = results.filter(memory => memory.userId === query.userId);

    // Filter by session if specified
    if (query.sessionId) {
      results = results.filter(memory => memory.sessionId === query.sessionId);
    }

    // Filter by types
    if (query.types && query.types.length > 0) {
      results = results.filter(memory => query.types!.includes(memory.type));
    }

    // Filter by categories
    if (query.categories && query.categories.length > 0) {
      results = results.filter(memory => query.categories!.includes(memory.category));
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(memory => 
        query.tags!.some(tag => memory.metadata.tags.includes(tag))
      );
    }

    // Filter by importance
    if (query.minImportance !== undefined) {
      results = results.filter(memory => memory.metadata.importance >= query.minImportance!);
    }

    // Filter by relevance
    if (query.minRelevance !== undefined) {
      results = results.filter(memory => memory.metadata.relevance >= query.minRelevance!);
    }

    // Filter by age
    if (query.maxAge !== undefined) {
      const cutoffTime = Date.now() - query.maxAge;
      results = results.filter(memory => memory.timestamp >= cutoffTime);
    }

    // Filter by active status
    if (!query.includeInactive) {
      results = results.filter(memory => memory.lifecycle.isActive);
    }

    // Filter by file context
    if (query.fileContext) {
      results = results.filter(memory => {
        const fileCtx = memory.metadata.fileContext;
        if (!fileCtx) return false;

        if (query.fileContext!.documentId && fileCtx.documentId !== query.fileContext!.documentId) {
          return false;
        }
        if (query.fileContext!.fileName && !fileCtx.fileName.includes(query.fileContext!.fileName)) {
          return false;
        }
        if (query.fileContext!.fileType && fileCtx.fileType !== query.fileContext!.fileType) {
          return false;
        }
        if (query.fileContext!.extractionMethod && fileCtx.extractionMethod !== query.fileContext!.extractionMethod) {
          return false;
        }

        return true;
      });
    }

    // Filter by file memory inclusion
    if (query.includeFileMemories === false) {
      results = results.filter(memory => !memory.metadata.fileContext);
    }

    // Sort by relevance and importance
    results.sort((a, b) => {
      const scoreA = (a.metadata.relevance + a.metadata.importance) / 2;
      const scoreB = (b.metadata.relevance + b.metadata.importance) / 2;
      return scoreB - scoreA;
    });

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Create a continuity hook
   */
  createContinuityHook(
    userId: string,
    trigger: ContinuityHook['trigger'],
    action: ContinuityHook['action'],
    options?: {
      priority?: number;
    }
  ): ContinuityHook {
    const id = crypto.randomUUID();

    const hook: ContinuityHook = {
      id,
      userId,
      trigger,
      action,
      metadata: {
        priority: options?.priority ?? 0.5,
        isActive: true,
        lastTriggered: 0,
        triggerCount: 0
      }
    };

    this.continuityHooks.set(id, hook);
    this.saveToStorage();

    return hook;
  }

  /**
   * Check and trigger continuity hooks
   */
  checkContinuityHooks(
    userId: string,
    context: {
      sessionId: string;
      conversationId: string;
      topic: string;
      userInput: string;
      currentTime: number;
    }
  ): ContinuityHook[] {
    const userHooks = Array.from(this.continuityHooks.values())
      .filter(hook => hook.userId === userId && hook.metadata.isActive);

    const triggeredHooks: ContinuityHook[] = [];

    for (const hook of userHooks) {
      if (this.shouldTriggerHook(hook, context)) {
        hook.metadata.lastTriggered = context.currentTime;
        hook.metadata.triggerCount++;
        triggeredHooks.push(hook);
      }
    }

    // Sort by priority
    triggeredHooks.sort((a, b) => b.metadata.priority - a.metadata.priority);

    return triggeredHooks;
  }

  /**
   * Create a memory ritual
   */
  createMemoryRitual(
    userId: string,
    name: string,
    description: string,
    schedule: MemoryRitual['schedule'],
    actions: MemoryRitual['actions']
  ): MemoryRitual {
    const id = crypto.randomUUID();

    const ritual: MemoryRitual = {
      id,
      userId,
      name,
      description,
      schedule: {
        ...schedule,
        lastExecuted: 0
      },
      actions,
      metadata: {
        isActive: true,
        executionCount: 0,
        averageDuration: 0
      }
    };

    this.rituals.set(id, ritual);
    this.saveToStorage();

    return ritual;
  }

  /**
   * Execute memory rituals
   */
  executeRituals(userId: string): MemoryRitual[] {
    const userRituals = Array.from(this.rituals.values())
      .filter(ritual => ritual.userId === userId && ritual.metadata.isActive);

    const executedRituals: MemoryRitual[] = [];
    const currentTime = Date.now();

    for (const ritual of userRituals) {
      if (this.shouldExecuteRitual(ritual, currentTime)) {
        this.executeRitual(ritual);
        ritual.schedule.lastExecuted = currentTime;
        ritual.metadata.executionCount++;
        executedRituals.push(ritual);
      }
    }

    this.saveToStorage();
    return executedRituals;
  }

  /**
   * Create a file-linked memory from document content
   */
  createFileMemory(
    userId: string,
    sessionId: string,
    documentId: string,
    fileName: string,
    fileType: string,
    content: string,
    options: {
      type: 'file_insight' | 'file_anchor' | 'file_motif';
      chunkId?: string;
      pageNumber?: number;
      section?: string;
      extractionMethod: MemoryEntry['metadata']['fileContext']['extractionMethod'];
      confidence: number;
      importance?: number;
      relevance?: number;
      tags?: string[];
      relatedChunkIds?: string[];
      anchorPoints?: string[];
      motifInstances?: string[];
    }
  ): MemoryEntry {
    const memory = this.createMemory(
      userId,
      sessionId,
      options.type,
      'file_derived',
      content,
      {
        importance: options.importance ?? 0.6,
        relevance: options.relevance ?? 0.7,
        tags: options.tags ?? ['file_derived', fileType],
        fileContext: {
          documentId,
          fileName,
          fileType,
          chunkId: options.chunkId,
          pageNumber: options.pageNumber,
          section: options.section,
          extractionMethod: options.extractionMethod,
          confidence: options.confidence
        },
        fileRelationships: {
          sourceDocumentId: documentId,
          relatedChunkIds: options.relatedChunkIds ?? [],
          anchorPoints: options.anchorPoints ?? [],
          motifInstances: options.motifInstances ?? []
        }
      }
    );

    return memory;
  }

  /**
   * Create symbolic anchors from file content
   */
  createFileAnchors(
    userId: string,
    sessionId: string,
    documentId: string,
    fileName: string,
    fileType: string,
    anchors: Array<{
      anchor: string;
      content: string;
      context: string;
      confidence: number;
    }>
  ): MemoryEntry[] {
    return anchors.map(anchor => 
      this.createFileMemory(
        userId,
        sessionId,
        documentId,
        fileName,
        fileType,
        anchor.content,
        {
          type: 'file_anchor',
          extractionMethod: 'anchor',
          confidence: anchor.confidence,
          tags: ['anchor', anchor.anchor],
          anchorPoints: [anchor.anchor]
        }
      )
    );
  }

  /**
   * Create recurring motifs from file content
   */
  createFileMotifs(
    userId: string,
    sessionId: string,
    documentId: string,
    fileName: string,
    fileType: string,
    motifs: Array<{
      motif: string;
      content: string;
      instances: string[];
      frequency: number;
      confidence: number;
    }>
  ): MemoryEntry[] {
    return motifs.map(motif => 
      this.createFileMemory(
        userId,
        sessionId,
        documentId,
        fileName,
        fileType,
        motif.content,
        {
          type: 'file_motif',
          extractionMethod: 'motif',
          confidence: motif.confidence,
          tags: ['motif', motif.motif, `freq_${motif.frequency}`],
          motifInstances: motif.instances
        }
      )
    );
  }

  /**
   * Inject relevant memories for a conversation context
   */
  injectMemories(
    userId: string,
    sessionId: string,
    context: {
      conversationId: string;
      topic: string;
      userIntent: string;
      maxTokens: number;
      // File-specific context
      documentIds?: string[];
      includeFileMemories?: boolean;
    }
  ): MemoryInjection {
    // Query relevant memories
    const queryOptions: MemoryQuery = {
      userId,
      sessionId,
      minRelevance: 0.3,
      limit: 50
    };

    // Include file memories if requested
    if (context.includeFileMemories) {
      queryOptions.includeFileMemories = true;
      if (context.documentIds) {
        queryOptions.fileContext = {
          documentId: context.documentIds[0] // For now, use first document
        };
      }
    }

    const relevantMemories = this.queryMemories(queryOptions);

    // Calculate relevance scores based on context
    const scoredMemories = relevantMemories.map(memory => ({
      memory,
      score: this.calculateContextRelevance(memory, context)
    }));

    // Sort by relevance score
    scoredMemories.sort((a, b) => b.score - a.score);

    // Select memories within token limit
    const selectedMemories: MemoryEntry[] = [];
    let totalTokens = 0;
    let totalRelevance = 0;

    for (const { memory, score } of scoredMemories) {
      const memoryTokens = memory.metadata.tokenCount;
      if (totalTokens + memoryTokens <= context.maxTokens) {
        selectedMemories.push(memory);
        totalTokens += memoryTokens;
        totalRelevance += score;
      } else {
        break;
      }
    }

    const averageRelevance = selectedMemories.length > 0 ? totalRelevance / selectedMemories.length : 0;

    // Separate file memories from regular memories
    const fileMemories = selectedMemories.filter(m => m.metadata.fileContext);
    const regularMemories = selectedMemories.filter(m => !m.metadata.fileContext);
    
    const fileTokens = fileMemories.reduce((sum, m) => sum + m.metadata.tokenCount, 0);
    const documentIds = [...new Set(fileMemories.map(m => m.metadata.fileContext?.documentId).filter(Boolean))];
    const chunkIds = [...new Set(fileMemories.map(m => m.metadata.fileContext?.chunkId).filter(Boolean))];

    return {
      memories: selectedMemories,
      totalTokens,
      relevanceScore: averageRelevance,
      injectionContext: {
        conversationId: context.conversationId,
        topic: context.topic,
        userIntent: context.userIntent
      },
      fileContext: context.includeFileMemories ? {
        documentIds,
        chunkIds,
        fileMemories,
        fileTokens
      } : undefined
    };
  }

  /**
   * Get ledger statistics
   */
  getStats(): LedgerStats {
    const entries = Array.from(this.entries.values());
    const activeEntries = entries.filter(e => e.lifecycle.isActive);
    const users = new Set(entries.map(e => e.userId));
    const sessions = new Set(entries.map(e => e.sessionId));

    const importanceSum = entries.reduce((sum, e) => sum + e.metadata.importance, 0);
    const relevanceSum = entries.reduce((sum, e) => sum + e.metadata.relevance, 0);

    const memoryDistribution = entries.reduce((acc, memory) => {
      acc[memory.type] = (acc[memory.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate file-specific statistics
    const fileMemories = entries.filter(e => e.metadata.fileContext);
    const documents = new Set(fileMemories.map(e => e.metadata.fileContext!.documentId));
    const chunks = new Set(fileMemories.map(e => e.metadata.fileContext!.chunkId).filter(Boolean));
    
    const fileTypeDistribution = fileMemories.reduce((acc, memory) => {
      const fileType = memory.metadata.fileContext!.fileType;
      acc[fileType] = (acc[fileType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const confidenceSum = fileMemories.reduce((sum, e) => sum + e.metadata.fileContext!.confidence, 0);
    const averageFileConfidence = fileMemories.length > 0 ? confidenceSum / fileMemories.length : 0;

    return {
      totalEntries: entries.length,
      activeEntries: activeEntries.length,
      totalUsers: users.size,
      totalSessions: sessions.size,
      averageImportance: entries.length > 0 ? importanceSum / entries.length : 0,
      averageRelevance: entries.length > 0 ? relevanceSum / entries.length : 0,
      memoryDistribution,
      storageSize: this.calculateStorageSize(),
      fileStats: {
        totalFileMemories: fileMemories.length,
        totalDocuments: documents.size,
        totalChunks: chunks.size,
        fileTypeDistribution,
        averageFileConfidence
      }
    };
  }

  // Private helper methods

  private generateSemanticHash(content: string): string {
    // Simple hash for now - in production, use a proper semantic hashing algorithm
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    return btoa(normalized).slice(0, 16);
  }

  private estimateTokenCount(content: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(content.length / 4);
  }

  private updateUserSessionIndex(userId: string, sessionId: string): void {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);
  }

  private updateSemanticIndex(semanticHash: string, memoryId: string): void {
    if (!this.semanticIndex.has(semanticHash)) {
      this.semanticIndex.set(semanticHash, new Set());
    }
    this.semanticIndex.get(semanticHash)!.add(memoryId);
  }

  private updateFileIndexes(fileContext: MemoryEntry['metadata']['fileContext'], memoryId: string): void {
    if (!fileContext) return;

    // Update document index
    if (!this.fileIndex.has(fileContext.documentId)) {
      this.fileIndex.set(fileContext.documentId, new Set());
    }
    this.fileIndex.get(fileContext.documentId)!.add(memoryId);

    // Update chunk index
    if (fileContext.chunkId) {
      if (!this.chunkIndex.has(fileContext.chunkId)) {
        this.chunkIndex.set(fileContext.chunkId, new Set());
      }
      this.chunkIndex.get(fileContext.chunkId)!.add(memoryId);
    }
  }

  private removeFromSemanticIndex(semanticHash: string, memoryId: string): void {
    const index = this.semanticIndex.get(semanticHash);
    if (index) {
      index.delete(memoryId);
      if (index.size === 0) {
        this.semanticIndex.delete(semanticHash);
      }
    }
  }

  private updateParentChildRelationship(parentId: string, childId: string): void {
    const parent = this.entries.get(parentId);
    if (parent) {
      parent.relationships.childIds.push(childId);
    }
  }

  private shouldTriggerHook(hook: ContinuityHook, context: any): boolean {
    const { trigger } = hook;
    
    switch (trigger.type) {
      case 'keyword':
        const pattern = typeof trigger.pattern === 'string' 
          ? new RegExp(trigger.pattern, 'i') 
          : trigger.pattern;
        return pattern.test(context.userInput);
      
      case 'context':
        return this.evaluateContextConditions(trigger.conditions, context);
      
      case 'time':
        // Time-based triggers (e.g., daily reminders)
        return this.evaluateTimeConditions(trigger.conditions, context.currentTime);
      
      case 'session_start':
        return context.sessionId && !hook.metadata.lastTriggered;
      
      case 'conversation_topic':
        return context.topic && trigger.pattern.test(context.topic);
      
      default:
        return false;
    }
  }

  private shouldExecuteRitual(ritual: MemoryRitual, currentTime: number): boolean {
    const { schedule } = ritual;
    
    switch (schedule.type) {
      case 'daily':
        const dayInMs = 24 * 60 * 60 * 1000;
        return currentTime - schedule.lastExecuted >= dayInMs;
      
      case 'weekly':
        const weekInMs = 7 * 24 * 60 * 60 * 1000;
        return currentTime - schedule.lastExecuted >= weekInMs;
      
      case 'monthly':
        const monthInMs = 30 * 24 * 60 * 60 * 1000;
        return currentTime - schedule.lastExecuted >= monthInMs;
      
      case 'session_start':
        return schedule.lastExecuted === 0;
      
      case 'manual':
        return false; // Manual execution only
      
      default:
        return false;
    }
  }

  private executeRitual(ritual: MemoryRitual): void {
    const startTime = Date.now();
    
    for (const action of ritual.actions) {
      switch (action.type) {
        case 'cleanup_old_memories':
          this.cleanupOldMemories(ritual.userId, action.parameters);
          break;
        
        case 'consolidate_memories':
          this.consolidateMemories(ritual.userId, action.parameters);
          break;
        
        case 'update_relevance':
          this.updateMemoryRelevance(ritual.userId, action.parameters);
          break;
        
        case 'create_summary':
          this.createMemorySummary(ritual.userId, action.parameters);
          break;
      }
    }
    
    const duration = Date.now() - startTime;
    ritual.metadata.averageDuration = 
      (ritual.metadata.averageDuration * (ritual.metadata.executionCount - 1) + duration) / 
      ritual.metadata.executionCount;
  }

  private calculateContextRelevance(memory: MemoryEntry, context: any): number {
    // Simple relevance calculation - in production, use semantic similarity
    const topicMatch = memory.content.toLowerCase().includes(context.topic.toLowerCase()) ? 0.3 : 0;
    const intentMatch = memory.content.toLowerCase().includes(context.userIntent.toLowerCase()) ? 0.3 : 0;
    const baseRelevance = memory.metadata.relevance * 0.4;
    
    return Math.min(1, topicMatch + intentMatch + baseRelevance);
  }

  private evaluateContextConditions(conditions: Record<string, any>, context: any): boolean {
    // Simple condition evaluation - expand based on needs
    return Object.entries(conditions).every(([key, value]) => {
      return context[key] === value;
    });
  }

  private evaluateTimeConditions(conditions: Record<string, any>, currentTime: number): boolean {
    // Time-based condition evaluation
    return true; // Simplified for now
  }

  private cleanupOldMemories(userId: string, parameters: Record<string, any>): void {
    const maxAge = parameters.maxAge || 30 * 24 * 60 * 60 * 1000; // 30 days default
    const cutoffTime = Date.now() - maxAge;
    
    const oldMemories = this.queryMemories({
      userId,
      maxAge,
      includeInactive: true
    });

    oldMemories.forEach(memory => {
      if (memory.timestamp < cutoffTime && memory.metadata.importance < 0.7) {
        this.deleteMemory(memory.id);
      }
    });
  }

  private consolidateMemories(userId: string, parameters: Record<string, any>): void {
    // Memory consolidation logic
    // Combine similar memories, update relationships, etc.
  }

  private updateMemoryRelevance(userId: string, parameters: Record<string, any>): void {
    // Update relevance scores based on usage patterns
    const memories = this.queryMemories({ userId });
    
    memories.forEach(memory => {
      const timeDecay = Math.exp(-(Date.now() - memory.timestamp) / (30 * 24 * 60 * 60 * 1000));
      const usageBoost = Math.min(1, memory.metadata.accessCount / 10);
      
      const newRelevance = Math.min(1, memory.metadata.relevance * timeDecay + usageBoost * 0.2);
      
      this.updateMemory(memory.id, {
        metadata: { ...memory.metadata, relevance: newRelevance }
      });
    });
  }

  private createMemorySummary(userId: string, parameters: Record<string, any>): void {
    // Create summary memories from related memories
  }

  private calculateStorageSize(): number {
    const data = JSON.stringify({
      entries: Array.from(this.entries.entries()),
      hooks: Array.from(this.continuityHooks.entries()),
      rituals: Array.from(this.rituals.entries())
    });
    return new Blob([data]).size;
  }

  private saveToStorage(): void {
    try {
      const data = {
        entries: Array.from(this.entries.entries()),
        hooks: Array.from(this.continuityHooks.entries()),
        rituals: Array.from(this.rituals.entries()),
        userSessions: Array.from(this.userSessions.entries()),
        semanticIndex: Array.from(this.semanticIndex.entries()),
        fileIndex: Array.from(this.fileIndex.entries()),
        chunkIndex: Array.from(this.chunkIndex.entries()),
        anchorIndex: Array.from(this.anchorIndex.entries()),
        motifIndex: Array.from(this.motifIndex.entries()),
        timestamp: Date.now()
      };
      
      localStorage.setItem('chatty-memory-ledger', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save memory ledger:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('chatty-memory-ledger');
      if (stored) {
        const data = JSON.parse(stored);
        
        this.entries = new Map(data.entries || []);
        this.continuityHooks = new Map(data.hooks || []);
        this.rituals = new Map(data.rituals || []);
        this.userSessions = new Map(data.userSessions || []);
        this.semanticIndex = new Map(data.semanticIndex || []);
        this.fileIndex = new Map(data.fileIndex || []);
        this.chunkIndex = new Map(data.chunkIndex || []);
        this.anchorIndex = new Map(data.anchorIndex || []);
        this.motifIndex = new Map(data.motifIndex || []);
      }
    } catch (error) {
      console.error('Failed to load memory ledger:', error);
    }
  }
}
