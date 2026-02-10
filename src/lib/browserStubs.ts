/**
 * Browser Stubs - Lightweight Browser Implementations
 * 
 * Provides browser-compatible stubs for server-only services.
 * These stubs maintain API compatibility while providing safe fallbacks
 * or clear error messages for operations that require server-side resources.
 */

import type { RuntimeAssignment } from './automaticRuntimeOrchestrator';
import type { RuntimeContext, RuntimeSession } from './runtimeContextManager';

// Environment detection utilities
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof process === 'undefined';
}

export function isServerSide(): boolean {
  return typeof window === 'undefined' && typeof process !== 'undefined';
}

/**
 * Browser stub for AutomaticRuntimeOrchestrator
 */
export class BrowserRuntimeOrchestrator {
  private static instance: BrowserRuntimeOrchestrator;

  static getInstance(): BrowserRuntimeOrchestrator {
    if (!BrowserRuntimeOrchestrator.instance) {
      BrowserRuntimeOrchestrator.instance = new BrowserRuntimeOrchestrator();
    }
    return BrowserRuntimeOrchestrator.instance;
  }

  async determineOptimalRuntime(context: any): Promise<RuntimeAssignment> {
    console.warn('[BrowserRuntimeOrchestrator] Runtime orchestration not available in browser, using fallback');
    
    // Provide intelligent browser-side fallback
    const fallbackRuntime = this.getBrowserFallbackRuntime(context);
    
    return {
      constructId: fallbackRuntime,
      runtimeId: `${fallbackRuntime}-browser`,
      confidence: 0.5,
      reasoning: 'Browser fallback - server-side orchestration not available'
    };
  }

  private getBrowserFallbackRuntime(context: any): string {
    // Simple browser-side heuristics
    const message = context.userMessage?.toLowerCase() || '';
    
    if (message.includes('code') || message.includes('programming') || message.includes('debug')) {
      return 'synth'; // Better for coding
    }
    
    if (message.includes('creative') || message.includes('story') || message.includes('write')) {
      return 'lin'; // Better for creative tasks
    }
    
    return 'lin'; // Default fallback
  }

  updateUserPreferences(userId: string, capabilities: any): void {
    console.warn('[BrowserRuntimeOrchestrator] User preferences not persisted in browser environment');
    // Could use localStorage here if needed
  }
}

/**
 * Browser stub for RuntimeContextManager
 */
export class BrowserRuntimeContextManager {
  private static instance: BrowserRuntimeContextManager;
  private runtimeContexts: Map<string, RuntimeContext> = new Map();
  private sessions: Map<string, RuntimeSession> = new Map();

  static getInstance(): BrowserRuntimeContextManager {
    if (!BrowserRuntimeContextManager.instance) {
      BrowserRuntimeContextManager.instance = new BrowserRuntimeContextManager();
    }
    return BrowserRuntimeContextManager.instance;
  }

  async assignRuntimeToThread(
    threadId: string,
    runtimeAssignment: RuntimeAssignment,
    userId: string,
    sessionId?: string
  ): Promise<RuntimeContext> {
    const context: RuntimeContext = {
      threadId,
      runtimeAssignment,
      sessionId: sessionId || this.generateSessionId(userId),
      userId,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      conversationCount: 0,
      isActive: true
    };

    // Store in memory (browser session only)
    this.runtimeContexts.set(threadId, context);
    
    // Try to persist to localStorage
    this.persistToLocalStorage();

    console.log(`[BrowserRuntimeContextManager] Runtime assigned to thread ${threadId}: ${runtimeAssignment.constructId}`);
    
    return context;
  }

  getRuntimeContext(threadId: string): RuntimeContext | null {
    return this.runtimeContexts.get(threadId) || null;
  }

  getActiveRuntime(threadId: string): RuntimeAssignment | null {
    const context = this.getRuntimeContext(threadId);
    return context?.runtimeAssignment || null;
  }

  updateRuntimeUsage(threadId: string): void {
    const context = this.runtimeContexts.get(threadId);
    if (context) {
      context.lastUsed = new Date().toISOString();
      context.conversationCount += 1;
      this.persistToLocalStorage();
    }
  }

  async getOrCreateSession(userId: string): Promise<RuntimeSession> {
    const existingSession = Array.from(this.sessions.values())
      .find(session => session.userId === userId);

    if (existingSession) {
      return existingSession;
    }

    const session: RuntimeSession = {
      sessionId: this.generateSessionId(userId),
      userId,
      activeRuntimes: new Map(),
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  setUserDefaultRuntime(userId: string, runtimeAssignment: RuntimeAssignment): void {
    console.log(`[BrowserRuntimeContextManager] Setting default runtime for ${userId}: ${runtimeAssignment.constructId}`);
    // Store in localStorage
    try {
      localStorage.setItem(`defaultRuntime_${userId}`, JSON.stringify(runtimeAssignment));
    } catch (error) {
      console.warn('[BrowserRuntimeContextManager] Failed to save default runtime to localStorage:', error);
    }
  }

  getUserDefaultRuntime(userId: string): RuntimeAssignment | null {
    try {
      const stored = localStorage.getItem(`defaultRuntime_${userId}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('[BrowserRuntimeContextManager] Failed to load default runtime from localStorage:', error);
      return null;
    }
  }

  getRuntimeRecommendations(userId: string, limit: number = 3): RuntimeAssignment[] {
    console.warn('[BrowserRuntimeContextManager] Runtime recommendations not available in browser, using defaults');
    
    // Provide basic recommendations
    return [
      {
        constructId: 'lin',
        runtimeId: 'lin-browser',
        confidence: 0.8,
        reasoning: 'General-purpose runtime for most tasks'
      },
      {
        constructId: 'synth',
        runtimeId: 'synth-browser',
        confidence: 0.7,
        reasoning: 'Good for coding and technical tasks'
      }
    ].slice(0, limit);
  }

  async migrateRuntimeAssignment(
    threadId: string,
    newRuntimeAssignment: RuntimeAssignment,
    reason: string
  ): Promise<void> {
    const context = this.runtimeContexts.get(threadId);
    if (context) {
      console.log(`[BrowserRuntimeContextManager] Migrating runtime for thread ${threadId}: ${reason}`);
      context.runtimeAssignment = newRuntimeAssignment;
      context.lastUsed = new Date().toISOString();
      this.persistToLocalStorage();
    }
  }

  getRuntimePerformanceMetrics(userId: string, constructId?: string): any {
    console.warn('[BrowserRuntimeContextManager] Performance metrics not available in browser environment');
    return null;
  }

  cleanupInactiveContexts(): void {
    // Simple cleanup for browser environment
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [threadId, context] of this.runtimeContexts.entries()) {
      const lastUsed = new Date(context.lastUsed);
      if (now.getTime() - lastUsed.getTime() > maxAge) {
        this.runtimeContexts.delete(threadId);
      }
    }

    this.persistToLocalStorage();
  }

  private generateSessionId(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `browser-session-${userId}-${timestamp}-${random}`;
  }

  private persistToLocalStorage(): void {
    try {
      const data = {
        runtimeContexts: Array.from(this.runtimeContexts.entries()),
        sessions: Array.from(this.sessions.entries()),
        timestamp: Date.now()
      };
      localStorage.setItem('browserRuntimeContexts', JSON.stringify(data));
    } catch (error) {
      console.warn('[BrowserRuntimeContextManager] Failed to persist to localStorage:', error);
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('browserRuntimeContexts');
      if (stored) {
        const data = JSON.parse(stored);
        
        // Only load recent data (within 24 hours)
        const maxAge = 24 * 60 * 60 * 1000;
        if (Date.now() - data.timestamp < maxAge) {
          this.runtimeContexts = new Map(data.runtimeContexts || []);
          this.sessions = new Map(data.sessions || []);
        }
      }
    } catch (error) {
      console.warn('[BrowserRuntimeContextManager] Failed to load from localStorage:', error);
    }
  }

  constructor() {
    if (isBrowser()) {
      this.loadFromLocalStorage();
      
      // Cleanup periodically
      setInterval(() => {
        this.cleanupInactiveContexts();
      }, 60 * 60 * 1000); // Every hour
    }
  }
}

/**
 * Browser stub for dependency resolver
 */
export class BrowserDependencyResolver {
  private static instance: BrowserDependencyResolver;

  static getInstance(): BrowserDependencyResolver {
    if (!BrowserDependencyResolver.instance) {
      BrowserDependencyResolver.instance = new BrowserDependencyResolver();
    }
    return BrowserDependencyResolver.instance;
  }

  async resolveDependencies(context: any): Promise<any> {
    console.warn('[BrowserDependencyResolver] Dependency resolution not available in browser, using fallback');
    
    // Provide basic browser fallback
    return {
      runtimeAssignment: {
        constructId: 'lin',
        runtimeId: 'lin-browser',
        confidence: 0.5,
        reasoning: 'Browser fallback - full dependency resolution not available'
      },
      modelConfiguration: {
        modelId: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000
      },
      contextConfiguration: {
        memoryEnabled: false,
        workspaceContextEnabled: false,
        personalityEnabled: false
      },
      performanceMetrics: {
        expectedResponseTime: 5000,
        confidenceScore: 0.5,
        fallbackOptions: []
      }
    };
  }
}

/**
 * Factory functions for creating browser-safe instances
 */
export function createBrowserSafeRuntimeOrchestrator() {
  return BrowserRuntimeOrchestrator.getInstance();
}

export function createBrowserSafeContextManager() {
  return BrowserRuntimeContextManager.getInstance();
}

export function createBrowserSafeDependencyResolver() {
  return BrowserDependencyResolver.getInstance();
}

/**
 * Utility to check if we should use browser stubs
 */
export function shouldUseBrowserStubs(): boolean {
  return isBrowser();
}
