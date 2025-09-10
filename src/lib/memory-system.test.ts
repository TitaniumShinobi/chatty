// src/lib/memory-system.test.ts
// @ts-nocheck
// // Memory and Continuity System - Integration Tests
// Comprehensive testing of multi-user, multi-session memory management

import { MemoryManager, MemoryManagerConfig } from './memoryManager';
import { MemoryLedger, MemoryEntry, MemoryQuery } from './memoryLedger';
import { ContinuityInjector, InjectionContext, InjectionStrategy } from './continuityInjector';

// Test configuration
const TEST_CONFIG: Partial<MemoryManagerConfig> = {
  enableMemoryInjection: true,
  enableContinuityHooks: true,
  enableMemoryRituals: true,
  defaultInjectionStrategy: 'hybrid',
  maxMemoriesPerUser: 1000,
  maxTokensPerInjection: 1000,
  autoCleanupEnabled: false, // Disable for testing
  cleanupInterval: 1000
};

describe('Memory and Continuity System', () => {
  let memoryManager: MemoryManager;
  let memoryLedger: MemoryLedger;
  let continuityInjector: ContinuityInjector;

  beforeEach(() => {
    memoryManager = new MemoryManager(TEST_CONFIG);
    
    // Get internal components for testing
    memoryLedger = (memoryManager as any).memoryLedger;
    continuityInjector = (memoryManager as any).continuityInjector;
  });

  afterEach(() => {
    // Clean up localStorage
    localStorage.removeItem('chatty-memory-ledger');
  });

  describe('Memory Ledger', () => {
    it('should create and store memory entries', () => {
      const memory = memoryLedger.createMemory(
        'user1',
        'session1',
        'fact',
        'personal',
        'User prefers dark mode',
        {
          importance: 0.8,
          relevance: 0.9,
          tags: ['preference', 'ui']
        }
      );

      expect(memory.id).toBeDefined();
      expect(memory.userId).toBe('user1');
      expect(memory.sessionId).toBe('session1');
      expect(memory.type).toBe('fact');
      expect(memory.category).toBe('personal');
      expect(memory.content).toBe('User prefers dark mode');
      expect(memory.metadata.importance).toBe(0.8);
      expect(memory.metadata.relevance).toBe(0.9);
      expect(memory.metadata.tags).toContain('preference');
    });

    it('should query memories with filters', () => {
      // Create test memories
      memoryLedger.createMemory('user1', 'session1', 'fact', 'personal', 'User prefers dark mode', { importance: 0.8 });
      memoryLedger.createMemory('user1', 'session1', 'preference', 'ui', 'User likes minimal interfaces', { importance: 0.7 });
      memoryLedger.createMemory('user1', 'session2', 'conversation', 'general', 'Discussed AI capabilities', { importance: 0.6 });

      // Query by user
      const userMemories = memoryLedger.queryMemories({ userId: 'user1' });
      expect(userMemories.length).toBe(3);

      // Query by session
      const sessionMemories = memoryLedger.queryMemories({ userId: 'user1', sessionId: 'session1' });
      expect(sessionMemories.length).toBe(2);

      // Query by type
      const factMemories = memoryLedger.queryMemories({ userId: 'user1', types: ['fact'] });
      expect(factMemories.length).toBe(1);

      // Query by importance threshold
      const importantMemories = memoryLedger.queryMemories({ userId: 'user1', minImportance: 0.7 });
      expect(importantMemories.length).toBe(2);
    });

    it('should update memory entries', () => {
      const memory = memoryLedger.createMemory('user1', 'session1', 'fact', 'personal', 'Original content');
      
      const updated = memoryLedger.updateMemory(memory.id, {
        content: 'Updated content',
        metadata: { importance: 0.9 }
      });

      expect(updated).toBeDefined();
      expect(updated!.content).toBe('Updated content');
      expect(updated!.metadata.importance).toBe(0.9);
      expect(updated!.metadata.accessCount).toBe(1);
    });

    it('should delete memory entries', () => {
      const memory = memoryLedger.createMemory('user1', 'session1', 'fact', 'personal', 'Test content');
      
      const deleted = memoryLedger.deleteMemory(memory.id);
      expect(deleted).toBe(true);

      const queryResult = memoryLedger.queryMemories({ userId: 'user1' });
      expect(queryResult.length).toBe(0);
    });

    it('should handle parent-child relationships', () => {
      const parent = memoryLedger.createMemory('user1', 'session1', 'conversation', 'general', 'Main topic');
      const child = memoryLedger.createMemory('user1', 'session1', 'fact', 'detail', 'Detail about topic', {
        parentId: parent.id
      });

      expect(child.relationships.parentId).toBe(parent.id);
      expect(parent.relationships.childIds).toContain(child.id);
    });
  });

  describe('Continuity Injector', () => {
    it('should start and manage sessions', () => {
      const session = continuityInjector.startSession('user1', 'session1');
      
      expect(session.sessionId).toBe('session1');
      expect(session.userId).toBe('user1');
      expect(session.startTime).toBeGreaterThan(0);
      expect(session.injectedMemories).toEqual([]);
    });

    it('should inject memories based on context', () => {
      // Create test memories
      memoryLedger.createMemory('user1', 'session1', 'fact', 'personal', 'User prefers dark mode', { relevance: 0.8 });
      memoryLedger.createMemory('user1', 'session1', 'preference', 'ui', 'User likes minimal interfaces', { relevance: 0.7 });
      memoryLedger.createMemory('user1', 'session1', 'conversation', 'general', 'Discussed AI capabilities', { relevance: 0.6 });

      const injectionContext: InjectionContext = {
        userId: 'user1',
        sessionId: 'session1',
        conversationId: 'conv1',
        topic: 'user preferences',
        userIntent: 'discuss interface preferences',
        currentMessage: 'What are my preferences?',
        conversationHistory: ['Hello', 'What are my preferences?'],
        maxTokens: 500,
        modelContext: {
          modelName: 'test-model',
          maxContextLength: 1000,
          currentContextLength: 200
        }
      };

      const result = continuityInjector.injectMemories(injectionContext);
      
      expect(result).toBeDefined();
      expect(result.injectedMemories.length).toBeGreaterThan(0);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.relevanceScore).toBeGreaterThan(0);
    });

    it('should create and trigger continuity hooks', () => {
      const hook = continuityInjector.createContinuityHook('user1', {
        type: 'keyword',
        pattern: /remember|recall/,
        conditions: {}
      }, {
        type: 'inject_memory',
        memoryIds: [],
        context: { boostRelevance: true }
      });

      expect(hook.id).toBeDefined();
      expect(hook.userId).toBe('user1');
      expect(hook.trigger.type).toBe('keyword');

      // Test hook triggering
      const triggeredHooks = continuityInjector['checkContinuityHooks']('user1', {
        sessionId: 'session1',
        conversationId: 'conv1',
        topic: 'general',
        userInput: 'Do you remember our previous conversation?',
        currentTime: Date.now()
      });

      expect(triggeredHooks.length).toBeGreaterThan(0);
    });

    it('should apply different injection strategies', () => {
      // Create test memories
      memoryLedger.createMemory('user1', 'session1', 'fact', 'personal', 'High importance fact', { importance: 0.9, relevance: 0.5 });
      memoryLedger.createMemory('user1', 'session1', 'fact', 'personal', 'High relevance fact', { importance: 0.5, relevance: 0.9 });

      const injectionContext: InjectionContext = {
        userId: 'user1',
        sessionId: 'session1',
        conversationId: 'conv1',
        topic: 'general',
        userIntent: 'general inquiry',
        currentMessage: 'Tell me something',
        conversationHistory: ['Hello'],
        maxTokens: 300,
        modelContext: {
          modelName: 'test-model',
          maxContextLength: 1000,
          currentContextLength: 100
        }
      };

      // Test relevance-based strategy
      const relevanceResult = continuityInjector.injectMemories(injectionContext, 'relevance_based');
      expect(relevanceResult.injectedMemories.length).toBeGreaterThan(0);

      // Test importance-based strategy
      const importanceResult = continuityInjector.injectMemories(injectionContext, 'importance_based');
      expect(importanceResult.injectedMemories.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Manager', () => {
    it('should initialize users and sessions', () => {
      memoryManager.initializeUser('user1');
      const session = memoryManager.startSession('user1', 'session1');
      
      expect(session.userId).toBe('user1');
      expect(session.sessionId).toBe('session1');
    });

    it('should create and manage memories', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');

      const memory = memoryManager.createMemory(
        'user1',
        'session1',
        'fact',
        'personal',
        'User prefers dark mode',
        {
          importance: 0.8,
          relevance: 0.9,
          tags: ['preference']
        }
      );

      expect(memory.id).toBeDefined();
      expect(memory.content).toBe('User prefers dark mode');

      // Query memories
      const memories = memoryManager.queryMemories({
        userId: 'user1',
        sessionId: 'session1'
      });

      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0].content).toBe('User prefers dark mode');
    });

    it('should inject memories for conversation context', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');

      // Create test memories
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'User prefers dark mode', { relevance: 0.8 });
      memoryManager.createMemory('user1', 'session1', 'preference', 'ui', 'User likes minimal interfaces', { relevance: 0.7 });

      const injectionContext: InjectionContext = {
        userId: 'user1',
        sessionId: 'session1',
        conversationId: 'conv1',
        topic: 'user preferences',
        userIntent: 'discuss interface preferences',
        currentMessage: 'What are my preferences?',
        conversationHistory: ['Hello', 'What are my preferences?'],
        maxTokens: 500,
        modelContext: {
          modelName: 'test-model',
          maxContextLength: 1000,
          currentContextLength: 200
        }
      };

      const result = memoryManager.injectMemories(injectionContext);
      
      expect(result).toBeDefined();
      expect(result!.injectedMemories.length).toBeGreaterThan(0);
      expect(result!.totalTokens).toBeGreaterThan(0);
    });

    it('should create continuity hooks', () => {
      memoryManager.initializeUser('user1');

      const hook = memoryManager.createContinuityHook('user1', {
        type: 'keyword',
        pattern: /remember|recall/,
        conditions: {}
      }, {
        type: 'inject_memory',
        memoryIds: [],
        context: { boostRelevance: true }
      });

      expect(hook.id).toBeDefined();
      expect(hook.userId).toBe('user1');
    });

    it('should get user memory profiles', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');

      // Create some memories
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Memory 1', { importance: 0.8, relevance: 0.7 });
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Memory 2', { importance: 0.6, relevance: 0.9 });

      const profile = memoryManager.getUserMemoryProfile('user1');
      
      expect(profile).toBeDefined();
      expect(profile!.userId).toBe('user1');
      expect(profile!.totalMemories).toBeGreaterThan(0);
      expect(profile!.averageImportance).toBeGreaterThan(0);
      expect(profile!.averageRelevance).toBeGreaterThan(0);
    });

    it('should get session statistics', () => {
      memoryManager.initializeUser('user1');
      const session = memoryManager.startSession('user1', 'session1');

      // Create some memories
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Memory 1', { importance: 0.8, relevance: 0.7 });

      const stats = memoryManager.getSessionStats('session1');
      
      expect(stats).toBeDefined();
      expect(stats!.session.sessionId).toBe('session1');
      expect(stats!.memoryStats.totalInjected).toBeGreaterThanOrEqual(0);
    });

    it('should get system-wide statistics', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Test memory');

      const stats = memoryManager.getSystemStats();
      
      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.totalUsers).toBeGreaterThan(0);
      expect(stats.totalSessions).toBeGreaterThan(0);
    });

    it('should get memory analytics', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Test memory');

      const analytics = memoryManager.getMemoryAnalytics();
      
      expect(analytics.totalOperations).toBeGreaterThan(0);
      expect(analytics.operationsByType).toBeDefined();
      expect(analytics.mostActiveUsers.length).toBeGreaterThan(0);
    });

    it('should update memory relevance based on usage', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');

      const memory = memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Test memory', { relevance: 0.5 });

      memoryManager.updateMemoryRelevance(memory.id, {
        wasHelpful: true,
        contextRelevance: 0.8,
        userFeedback: 0.9
      });

      // Query the memory to check if relevance was updated
      const memories = memoryManager.queryMemories({ userId: 'user1' });
      const updatedMemory = memories.find(m => m.id === memory.id);
      
      expect(updatedMemory).toBeDefined();
      expect(updatedMemory!.metadata.relevance).toBeGreaterThan(0.5);
    });

    it('should clean up old memories', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');

      // Create a memory with low importance
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Low importance memory', { importance: 0.2 });

      const cleanupResult = memoryManager.cleanupMemories('user1');
      
      expect(cleanupResult.deletedCount).toBeGreaterThanOrEqual(0);
      expect(cleanupResult.updatedCount).toBeGreaterThanOrEqual(0);
    });

    it('should export and import user memories', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');

      // Create some memories
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Memory 1');
      memoryManager.createMemory('user1', 'session1', 'preference', 'ui', 'Memory 2');

      // Export memories
      const exportData = memoryManager.exportUserMemories('user1');
      expect(exportData.memories.length).toBeGreaterThan(0);
      expect(exportData.metadata.totalMemories).toBeGreaterThan(0);

      // Import memories to a new user
      memoryManager.initializeUser('user2');
      const importResult = memoryManager.importUserMemories('user2', exportData);
      
      expect(importResult.importedMemories).toBeGreaterThan(0);
    });
  });

  describe('Memory System Integration', () => {
    it('should handle multi-user scenarios', () => {
      // Initialize multiple users
      memoryManager.initializeUser('user1');
      memoryManager.initializeUser('user2');

      // Create memories for different users
      memoryManager.startSession('user1', 'session1');
      memoryManager.startSession('user2', 'session2');

      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'User 1 preference');
      memoryManager.createMemory('user2', 'session2', 'fact', 'personal', 'User 2 preference');

      // Verify isolation
      const user1Memories = memoryManager.queryMemories({ userId: 'user1' });
      const user2Memories = memoryManager.queryMemories({ userId: 'user2' });

      expect(user1Memories.length).toBeGreaterThan(0);
      expect(user2Memories.length).toBeGreaterThan(0);
      expect(user1Memories.every(m => m.userId === 'user1')).toBe(true);
      expect(user2Memories.every(m => m.userId === 'user2')).toBe(true);
    });

    it('should handle multi-session scenarios', () => {
      memoryManager.initializeUser('user1');

      // Create multiple sessions
      memoryManager.startSession('user1', 'session1');
      memoryManager.startSession('user1', 'session2');

      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Session 1 memory');
      memoryManager.createMemory('user1', 'session2', 'fact', 'personal', 'Session 2 memory');

      // Verify session isolation
      const session1Memories = memoryManager.queryMemories({ userId: 'user1', sessionId: 'session1' });
      const session2Memories = memoryManager.queryMemories({ userId: 'user1', sessionId: 'session2' });

      expect(session1Memories.length).toBeGreaterThan(0);
      expect(session2Memories.length).toBeGreaterThan(0);
      expect(session1Memories.every(m => m.sessionId === 'session1')).toBe(true);
      expect(session2Memories.every(m => m.sessionId === 'session2')).toBe(true);
    });

    it('should maintain continuity across sessions', () => {
      memoryManager.initializeUser('user1');

      // Create memory in first session
      memoryManager.startSession('user1', 'session1');
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Important preference', { importance: 0.9, relevance: 0.8 });
      memoryManager.endSession('user1', 'session1');

      // Start second session and inject memories
      memoryManager.startSession('user1', 'session2');

      const injectionContext: InjectionContext = {
        userId: 'user1',
        sessionId: 'session2',
        conversationId: 'conv1',
        topic: 'user preferences',
        userIntent: 'discuss preferences',
        currentMessage: 'What are my preferences?',
        conversationHistory: ['Hello'],
        maxTokens: 500,
        modelContext: {
          modelName: 'test-model',
          maxContextLength: 1000,
          currentContextLength: 100
        }
      };

      const result = memoryManager.injectMemories(injectionContext);
      
      // Should find memory from previous session
      expect(result).toBeDefined();
      expect(result!.injectedMemories.length).toBeGreaterThan(0);
      expect(result!.injectedMemories.some(m => m.content.includes('Important preference'))).toBe(true);
    });

    it('should handle token limits correctly', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');

      // Create memories with known token counts
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'Short memory', { relevance: 0.9 });
      memoryManager.createMemory('user1', 'session1', 'fact', 'personal', 'A'.repeat(1000), { relevance: 0.8 }); // ~250 tokens

      const injectionContext: InjectionContext = {
        userId: 'user1',
        sessionId: 'session1',
        conversationId: 'conv1',
        topic: 'general',
        userIntent: 'general inquiry',
        currentMessage: 'Tell me something',
        conversationHistory: ['Hello'],
        maxTokens: 100, // Very low limit
        modelContext: {
          modelName: 'test-model',
          maxContextLength: 1000,
          currentContextLength: 100
        }
      };

      const result = memoryManager.injectMemories(injectionContext);
      
      expect(result).toBeDefined();
      expect(result!.totalTokens).toBeLessThanOrEqual(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid memory operations gracefully', () => {
      // Try to update non-existent memory
      const result = memoryManager.updateMemory('non-existent-id', { content: 'New content' });
      expect(result).toBeNull();

      // Try to delete non-existent memory
      const deleted = memoryManager.deleteMemory('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('should handle invalid injection contexts', () => {
      const invalidContext: InjectionContext = {
        userId: 'non-existent-user',
        sessionId: 'non-existent-session',
        conversationId: 'conv1',
        topic: 'general',
        userIntent: 'general inquiry',
        currentMessage: 'Test',
        conversationHistory: [],
        maxTokens: 0, // Invalid token limit
        modelContext: {
          modelName: 'test-model',
          maxContextLength: 1000,
          currentContextLength: 100
        }
      };

      const result = memoryManager.injectMemories(invalidContext);
      // Should handle gracefully without throwing errors
      expect(result).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of memories efficiently', () => {
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');

      const startTime = Date.now();

      // Create many memories
      for (let i = 0; i < 100; i++) {
        memoryManager.createMemory('user1', 'session1', 'fact', 'personal', `Memory ${i}`, {
          importance: Math.random(),
          relevance: Math.random()
        });
      }

      const creationTime = Date.now() - startTime;
      expect(creationTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Query memories
      const queryStartTime = Date.now();
      const memories = memoryManager.queryMemories({ userId: 'user1' });
      const queryTime = Date.now() - queryStartTime;

      expect(memories.length).toBe(100);
      expect(queryTime).toBeLessThan(1000); // Should query within 1 second
    });

    it('should maintain memory efficiency', () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      memoryManager.initializeUser('user1');
      memoryManager.startSession('user1', 'session1');

      // Create memories
      for (let i = 0; i < 50; i++) {
        memoryManager.createMemory('user1', 'session1', 'fact', 'personal', `Memory ${i}`);
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});
