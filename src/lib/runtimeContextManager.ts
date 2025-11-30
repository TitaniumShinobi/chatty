/**
 * Runtime Context Manager
 * 
 * Manages automatic context propagation and runtime consistency across sessions.
 * Tracks runtime assignments and ensures all conversation operations maintain
 * appropriate runtime context without manual intervention.
 */

import { RuntimeAssignment } from './automaticRuntimeOrchestrator';
import { shouldUseBrowserStubs, createBrowserSafeContextManager } from './browserStubs';

export interface RuntimeContext {
  threadId: string;
  runtimeAssignment: RuntimeAssignment;
  sessionId: string;
  userId: string;
  createdAt: string;
  lastUsed: string;
  conversationCount: number;
  isActive: boolean;
}

export interface RuntimeSession {
  sessionId: string;
  userId: string;
  activeRuntimes: Map<string, RuntimeContext>;
  defaultRuntime?: RuntimeAssignment;
  createdAt: string;
  lastActivity: string;
}

export interface RuntimePersistence {
  userId: string;
  threadId: string;
  runtimeAssignment: RuntimeAssignment;
  metadata: {
    createdAt: string;
    lastUsed: string;
    conversationCount: number;
    userSatisfaction?: number;
    performanceMetrics?: {
      responseTime: number;
      relevanceScore: number;
      continuityScore: number;
    };
  };
}

export class RuntimeContextManager {
  private static instance: RuntimeContextManager;
  private activeSessions: Map<string, RuntimeSession> = new Map();
  private threadRuntimeMap: Map<string, RuntimeContext> = new Map();
  private userDefaultRuntimes: Map<string, RuntimeAssignment> = new Map();
  private persistenceStorage: Map<string, RuntimePersistence[]> = new Map();
  private isBrowserEnvironment: boolean;

  private constructor() {
    this.isBrowserEnvironment = shouldUseBrowserStubs();
    
    if (this.isBrowserEnvironment) {
      console.log('[RuntimeContextManager] Running in browser mode with localStorage persistence');
    }
    
    this.initializeFromStorage();
    this.setupPeriodicCleanup();
  }

  static getInstance(): RuntimeContextManager {
    if (!RuntimeContextManager.instance) {
      // In browser environment, return browser stub instead
      if (shouldUseBrowserStubs()) {
        return createBrowserSafeContextManager() as any;
      }
      
      RuntimeContextManager.instance = new RuntimeContextManager();
    }
    return RuntimeContextManager.instance;
  }

  /**
   * Assign runtime to a thread and propagate context automatically
   */
  async assignRuntimeToThread(
    threadId: string, 
    runtimeAssignment: RuntimeAssignment, 
    userId: string,
    sessionId?: string
  ): Promise<RuntimeContext> {
    const actualSessionId = sessionId || this.generateSessionId(userId);
    
    const context: RuntimeContext = {
      threadId,
      runtimeAssignment,
      sessionId: actualSessionId,
      userId,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      conversationCount: 0,
      isActive: true
    };

    // Store in thread mapping
    this.threadRuntimeMap.set(threadId, context);

    // Update session
    await this.updateSession(actualSessionId, userId, threadId, context);

    // Persist for future sessions
    await this.persistRuntimeAssignment(context);

    // Propagate context to related systems
    await this.propagateRuntimeContext(context);

    return context;
  }

  /**
   * Get runtime context for a thread
   */
  getRuntimeContext(threadId: string): RuntimeContext | null {
    return this.threadRuntimeMap.get(threadId) || null;
  }

  /**
   * Get active runtime assignment for a thread
   */
  getActiveRuntime(threadId: string): RuntimeAssignment | null {
    const context = this.getRuntimeContext(threadId);
    return context?.runtimeAssignment || null;
  }

  /**
   * Update runtime context when thread is used
   */
  updateRuntimeUsage(threadId: string): void {
    const context = this.threadRuntimeMap.get(threadId);
    if (context) {
      context.lastUsed = new Date().toISOString();
      context.conversationCount += 1;
      
      // Update session activity
      const session = this.activeSessions.get(context.sessionId);
      if (session) {
        session.lastActivity = new Date().toISOString();
      }

      // Persist updated usage
      this.persistRuntimeAssignment(context);
    }
  }

  /**
   * Get or create session for user
   */
  async getOrCreateSession(userId: string): Promise<RuntimeSession> {
    // Look for existing active session
    const existingSession = Array.from(this.activeSessions.values())
      .find(session => session.userId === userId && this.isSessionActive(session));

    if (existingSession) {
      existingSession.lastActivity = new Date().toISOString();
      return existingSession;
    }

    // Create new session
    const sessionId = this.generateSessionId(userId);
    const session: RuntimeSession = {
      sessionId,
      userId,
      activeRuntimes: new Map(),
      defaultRuntime: this.userDefaultRuntimes.get(userId),
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Set default runtime for user
   */
  setUserDefaultRuntime(userId: string, runtimeAssignment: RuntimeAssignment): void {
    this.userDefaultRuntimes.set(userId, runtimeAssignment);
    
    // Update all active sessions for this user
    Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId)
      .forEach(session => {
        session.defaultRuntime = runtimeAssignment;
      });

    this.persistUserDefaults();
  }

  /**
   * Get default runtime for user
   */
  getUserDefaultRuntime(userId: string): RuntimeAssignment | null {
    return this.userDefaultRuntimes.get(userId) || null;
  }

  /**
   * Get runtime recommendations based on user history
   */
  getRuntimeRecommendations(userId: string, limit: number = 3): RuntimeAssignment[] {
    const userPersistence = this.persistenceStorage.get(userId) || [];
    
    // Analyze usage patterns
    const runtimeUsage = new Map<string, { count: number; satisfaction: number; lastUsed: string }>();
    
    userPersistence.forEach(persistence => {
      const key = persistence.runtimeAssignment.constructId;
      const existing = runtimeUsage.get(key) || { count: 0, satisfaction: 0, lastUsed: '1970-01-01' };
      
      existing.count += 1;
      existing.satisfaction += persistence.metadata.userSatisfaction || 0.5;
      if (persistence.metadata.lastUsed > existing.lastUsed) {
        existing.lastUsed = persistence.metadata.lastUsed;
      }
      
      runtimeUsage.set(key, existing);
    });

    // Score and sort recommendations
    const recommendations = Array.from(runtimeUsage.entries())
      .map(([constructId, usage]) => {
        const avgSatisfaction = usage.satisfaction / usage.count;
        const recencyScore = this.calculateRecencyScore(usage.lastUsed);
        const frequencyScore = Math.min(usage.count / 10, 1); // Normalize frequency
        
        const overallScore = (avgSatisfaction * 0.4) + (recencyScore * 0.3) + (frequencyScore * 0.3);
        
        // Find the most recent runtime assignment for this construct
        const recentAssignment = userPersistence
          .filter(p => p.runtimeAssignment.constructId === constructId)
          .sort((a, b) => b.metadata.lastUsed.localeCompare(a.metadata.lastUsed))[0];
        
        return {
          ...recentAssignment.runtimeAssignment,
          confidence: overallScore,
          reasoning: `Recommended based on usage history (${usage.count} uses, ${Math.round(avgSatisfaction * 100)}% satisfaction)`
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return recommendations;
  }

  /**
   * Clean up inactive contexts and sessions
   */
  cleanupInactiveContexts(): void {
    const now = new Date();
    const maxInactiveTime = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up inactive thread contexts
    Array.from(this.threadRuntimeMap.entries()).forEach(([threadId, context]) => {
      const lastUsed = new Date(context.lastUsed);
      if (now.getTime() - lastUsed.getTime() > maxInactiveTime) {
        context.isActive = false;
        // Don't delete immediately, just mark inactive for potential recovery
      }
    });

    // Clean up old sessions
    Array.from(this.activeSessions.entries()).forEach(([sessionId, session]) => {
      if (!this.isSessionActive(session)) {
        this.activeSessions.delete(sessionId);
      }
    });
  }

  /**
   * Migrate runtime assignment (when runtime changes)
   */
  async migrateRuntimeAssignment(
    threadId: string, 
    newRuntimeAssignment: RuntimeAssignment,
    reason: string
  ): Promise<void> {
    const existingContext = this.threadRuntimeMap.get(threadId);
    
    if (existingContext) {
      // Record migration for analytics
      console.log(`[RuntimeContextManager] Migrating runtime for thread ${threadId}: ${existingContext.runtimeAssignment.constructId} -> ${newRuntimeAssignment.constructId}. Reason: ${reason}`);
      
      // Update context
      existingContext.runtimeAssignment = newRuntimeAssignment;
      existingContext.lastUsed = new Date().toISOString();
      
      // Persist migration
      await this.persistRuntimeAssignment(existingContext);
      
      // Propagate new context
      await this.propagateRuntimeContext(existingContext);
    }
  }

  /**
   * Get runtime performance metrics
   */
  getRuntimePerformanceMetrics(userId: string, constructId?: string): any {
    const userPersistence = this.persistenceStorage.get(userId) || [];
    
    let relevantPersistence = userPersistence;
    if (constructId) {
      relevantPersistence = userPersistence.filter(p => p.runtimeAssignment.constructId === constructId);
    }

    if (relevantPersistence.length === 0) {
      return null;
    }

    const metrics = relevantPersistence.reduce((acc, persistence) => {
      const perf = persistence.metadata.performanceMetrics;
      if (perf) {
        acc.totalResponseTime += perf.responseTime;
        acc.totalRelevanceScore += perf.relevanceScore;
        acc.totalContinuityScore += perf.continuityScore;
        acc.count += 1;
      }
      return acc;
    }, { totalResponseTime: 0, totalRelevanceScore: 0, totalContinuityScore: 0, count: 0 });

    if (metrics.count === 0) {
      return null;
    }

    return {
      averageResponseTime: metrics.totalResponseTime / metrics.count,
      averageRelevanceScore: metrics.totalRelevanceScore / metrics.count,
      averageContinuityScore: metrics.totalContinuityScore / metrics.count,
      totalConversations: metrics.count,
      constructId
    };
  }

  // Private helper methods

  private async updateSession(sessionId: string, userId: string, threadId: string, context: RuntimeContext): Promise<void> {
    let session = this.activeSessions.get(sessionId);
    
    if (!session) {
      session = {
        sessionId,
        userId,
        activeRuntimes: new Map(),
        defaultRuntime: this.userDefaultRuntimes.get(userId),
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      this.activeSessions.set(sessionId, session);
    }

    session.activeRuntimes.set(threadId, context);
    session.lastActivity = new Date().toISOString();
  }

  private async propagateRuntimeContext(context: RuntimeContext): Promise<void> {
    // Propagate to other systems that need runtime context
    // This could include:
    // - AI Service runtime setting
    // - VVAULT context updates
    // - Memory system notifications
    // - Analytics tracking
    
    if (this.isBrowserEnvironment) {
      console.log(`[RuntimeContextManager] Browser mode: Runtime context set for thread ${context.threadId}`);
      // In browser, we just log and store locally
      return;
    }
    
    try {
      // Example: Update AI service runtime (server-side only)
      const { AIService } = await import('./aiService');
      const aiService = AIService.getInstance();
      await aiService.setRuntimeForThread(context.threadId, context.runtimeAssignment);
    } catch (error) {
      console.warn('[RuntimeContextManager] Failed to propagate context to AIService:', error);
    }

    // Add other propagation targets as needed
  }

  private async persistRuntimeAssignment(context: RuntimeContext): Promise<void> {
    const persistence: RuntimePersistence = {
      userId: context.userId,
      threadId: context.threadId,
      runtimeAssignment: context.runtimeAssignment,
      metadata: {
        createdAt: context.createdAt,
        lastUsed: context.lastUsed,
        conversationCount: context.conversationCount
      }
    };

    const userPersistence = this.persistenceStorage.get(context.userId) || [];
    
    // Update existing or add new
    const existingIndex = userPersistence.findIndex(p => p.threadId === context.threadId);
    if (existingIndex >= 0) {
      userPersistence[existingIndex] = persistence;
    } else {
      userPersistence.push(persistence);
    }

    this.persistenceStorage.set(context.userId, userPersistence);
    
    // Persist to storage (localStorage, IndexedDB, etc.)
    this.saveToStorage();
  }

  private generateSessionId(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `session-${userId}-${timestamp}-${random}`;
  }

  private isSessionActive(session: RuntimeSession): boolean {
    const now = new Date();
    const lastActivity = new Date(session.lastActivity);
    const maxInactiveTime = 4 * 60 * 60 * 1000; // 4 hours
    
    return now.getTime() - lastActivity.getTime() < maxInactiveTime;
  }

  private calculateRecencyScore(lastUsed: string): number {
    const now = new Date();
    const used = new Date(lastUsed);
    const daysSince = (now.getTime() - used.getTime()) / (1000 * 60 * 60 * 24);
    
    // Score decreases over time, 1.0 for today, 0.5 for 7 days ago, 0.1 for 30 days ago
    if (daysSince <= 1) return 1.0;
    if (daysSince <= 7) return 0.8 - (daysSince - 1) * 0.1;
    if (daysSince <= 30) return 0.5 - (daysSince - 7) * 0.02;
    return 0.1;
  }

  private setupPeriodicCleanup(): void {
    // Clean up every hour
    setInterval(() => {
      this.cleanupInactiveContexts();
    }, 60 * 60 * 1000);
  }

  private initializeFromStorage(): void {
    try {
      const stored = localStorage.getItem('runtimeContextManager');
      if (stored) {
        const data = JSON.parse(stored);
        
        if (data.userDefaultRuntimes) {
          this.userDefaultRuntimes = new Map(data.userDefaultRuntimes);
        }
        
        if (data.persistenceStorage) {
          this.persistenceStorage = new Map(data.persistenceStorage);
        }
        
        // Restore active contexts (but not sessions, they should be fresh)
        if (data.threadRuntimeMap) {
          const threadData = new Map(data.threadRuntimeMap);
          threadData.forEach((context, threadId) => {
            // Only restore if recently active
            const lastUsed = new Date(context.lastUsed);
            const now = new Date();
            if (now.getTime() - lastUsed.getTime() < 24 * 60 * 60 * 1000) { // 24 hours
              this.threadRuntimeMap.set(threadId, context);
            }
          });
        }
      }
    } catch (error) {
      console.warn('[RuntimeContextManager] Failed to initialize from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        userDefaultRuntimes: Array.from(this.userDefaultRuntimes.entries()),
        persistenceStorage: Array.from(this.persistenceStorage.entries()),
        threadRuntimeMap: Array.from(this.threadRuntimeMap.entries())
      };
      
      localStorage.setItem('runtimeContextManager', JSON.stringify(data));
    } catch (error) {
      console.warn('[RuntimeContextManager] Failed to save to storage:', error);
    }
  }

  private persistUserDefaults(): void {
    this.saveToStorage();
  }
}
