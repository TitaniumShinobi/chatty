// Memory and Continuity System - Production Demo
// Demonstrates multi-user, multi-session memory management with continuity

import { MemoryManager, MemoryManagerConfig } from '../lib/memoryManager';
import { MemoryLedger } from '../lib/memoryLedger';
import { ContinuityInjector } from '../lib/continuityInjector';
import { pkt } from '../lib/emit';
import { lexicon as lex } from '../data/lexicon';

// Production configuration
const PRODUCTION_CONFIG: MemoryManagerConfig = {
  enableMemoryInjection: true,
  enableContinuityHooks: true,
  enableMemoryRituals: true,
  defaultInjectionStrategy: 'hybrid',
  maxMemoriesPerUser: 10000,
  maxTokensPerInjection: 2000,
  autoCleanupEnabled: true,
  cleanupInterval: 12 * 60 * 60 * 1000 // 12 hours
};

/**
 * Memory and Continuity Demo
 * Shows how to use the system for production memory management
 */
export class MemoryContinuityDemo {
  private memoryManager: MemoryManager;
  private memoryLedger: MemoryLedger;
  private continuityInjector: ContinuityInjector;
  private packetEmitter?: (packet: any) => void;

  constructor(config?: Partial<MemoryManagerConfig>) {
    this.memoryManager = new MemoryManager({ ...PRODUCTION_CONFIG, ...config });
    
    // Get internal components for demo
    this.memoryLedger = (this.memoryManager as any).memoryLedger;
    this.continuityInjector = (this.memoryManager as any).continuityInjector;
    
    // Set up packet emitter
    this.memoryManager.setPacketEmitter((packet) => {
      this.emitPacket(packet);
    });
  }

  /**
   * Set packet emitter for real-time feedback
   */
  setPacketEmitter(emitter: (packet: any) => void): void {
    this.packetEmitter = emitter;
  }

  /**
   * Demonstrate user initialization and session management
   */
  async demonstrateUserManagement(): Promise<void> {
    console.log('👤 Demonstrating User Management...\n');

    // Initialize multiple users
    const users = ['alice', 'bob', 'charlie'];
    
    for (const userId of users) {
      this.memoryManager.initializeUser(userId);
      console.log(`✅ Initialized user: ${userId}`);
    }

    // Start sessions for each user
    for (const userId of users) {
      const sessionId = `session-${userId}-${Date.now()}`;
      const session = this.memoryManager.startSession(userId, sessionId);
      console.log(`🚀 Started session for ${userId}: ${sessionId}`);
    }

    // Get user profiles
    for (const userId of users) {
      const profile = this.memoryManager.getUserMemoryProfile(userId);
      console.log(`📊 Profile for ${userId}:`, profile);
    }
  }

  /**
   * Demonstrate memory creation and management
   */
  async demonstrateMemoryManagement(): Promise<void> {
    console.log('\n🧠 Demonstrating Memory Management...\n');

    const userId = 'alice';
    const sessionId = 'session-alice-demo';

    // Start a session
    this.memoryManager.startSession(userId, sessionId);

    // Create different types of memories
    const memories = [
      {
        type: 'fact' as const,
        category: 'personal',
        content: 'Alice prefers dark mode for all applications',
        importance: 0.8,
        relevance: 0.9,
        tags: ['preference', 'ui', 'dark-mode']
      },
      {
        type: 'preference' as const,
        category: 'communication',
        content: 'Alice likes concise, direct responses',
        importance: 0.7,
        relevance: 0.8,
        tags: ['communication', 'style']
      },
      {
        type: 'conversation' as const,
        category: 'work',
        content: 'Discussed project timeline and deliverables for Q1',
        importance: 0.9,
        relevance: 0.7,
        tags: ['work', 'project', 'timeline']
      },
      {
        type: 'file_context' as const,
        category: 'documents',
        content: 'Alice uploaded a project proposal document',
        importance: 0.6,
        relevance: 0.8,
        tags: ['file', 'document', 'proposal']
      }
    ];

    for (const memory of memories) {
      const created = this.memoryManager.createMemory(
        userId,
        sessionId,
        memory.type,
        memory.category,
        memory.content,
        {
          importance: memory.importance,
          relevance: memory.relevance,
          tags: memory.tags
        }
      );
      console.log(`✅ Created memory: ${memory.type} - ${memory.category}`);
    }

    // Query memories with different filters
    console.log('\n🔍 Querying memories...');

    const allMemories = this.memoryManager.queryMemories({ userId });
    console.log(`Total memories for ${userId}: ${allMemories.length}`);

    const factMemories = this.memoryManager.queryMemories({ 
      userId, 
      types: ['fact'] 
    });
    console.log(`Fact memories: ${factMemories.length}`);

    const importantMemories = this.memoryManager.queryMemories({ 
      userId, 
      minImportance: 0.8 
    });
    console.log(`Important memories (≥0.8): ${importantMemories.length}`);

    const taggedMemories = this.memoryManager.queryMemories({ 
      userId, 
      tags: ['preference'] 
    });
    console.log(`Memories tagged 'preference': ${taggedMemories.length}`);
  }

  /**
   * Demonstrate memory injection and continuity
   */
  async demonstrateMemoryInjection(): Promise<void> {
    console.log('\n💉 Demonstrating Memory Injection...\n');

    const userId = 'alice';
    const sessionId = 'session-alice-injection';

    // Start a session
    this.memoryManager.startSession(userId, sessionId);

    // Create memories for injection testing
    const testMemories = [
      {
        content: 'Alice is working on a React project',
        relevance: 0.9,
        tags: ['work', 'react', 'project']
      },
      {
        content: 'Alice prefers TypeScript over JavaScript',
        relevance: 0.8,
        tags: ['preference', 'typescript', 'javascript']
      },
      {
        content: 'Alice has experience with AWS cloud services',
        relevance: 0.7,
        tags: ['experience', 'aws', 'cloud']
      },
      {
        content: 'Alice likes to work in quiet environments',
        relevance: 0.6,
        tags: ['preference', 'environment', 'quiet']
      }
    ];

    for (const memory of testMemories) {
      this.memoryManager.createMemory(
        userId,
        sessionId,
        'fact',
        'personal',
        memory.content,
        {
          relevance: memory.relevance,
          tags: memory.tags
        }
      );
    }

    // Test different injection contexts
    const injectionContexts = [
      {
        name: 'Work-related query',
        context: {
          userId,
          sessionId,
          conversationId: 'conv-work',
          topic: 'work and projects',
          userIntent: 'discuss current work',
          currentMessage: 'What am I working on?',
          conversationHistory: ['Hello', 'What am I working on?'],
          maxTokens: 500,
          modelContext: {
            modelName: 'chatty-core',
            maxContextLength: 4000,
            currentContextLength: 200
          }
        }
      },
      {
        name: 'Technology preference query',
        context: {
          userId,
          sessionId,
          conversationId: 'conv-tech',
          topic: 'programming languages',
          userIntent: 'discuss technology preferences',
          currentMessage: 'What programming languages do I prefer?',
          conversationHistory: ['Hello', 'What programming languages do I prefer?'],
          maxTokens: 300,
          modelContext: {
            modelName: 'chatty-core',
            maxContextLength: 4000,
            currentContextLength: 150
          }
        }
      },
      {
        name: 'Environment preference query',
        context: {
          userId,
          sessionId,
          conversationId: 'conv-env',
          topic: 'work environment',
          userIntent: 'discuss work environment preferences',
          currentMessage: 'What kind of work environment do I prefer?',
          conversationHistory: ['Hello', 'What kind of work environment do I prefer?'],
          maxTokens: 200,
          modelContext: {
            modelName: 'chatty-core',
            maxContextLength: 4000,
            currentContextLength: 100
          }
        }
      }
    ];

    for (const { name, context } of injectionContexts) {
      console.log(`\n🔍 Testing: ${name}`);
      
      const result = this.memoryManager.injectMemories(context);
      
      if (result) {
        console.log(`  Memories injected: ${result.injectedMemories.length}`);
        console.log(`  Total tokens: ${result.totalTokens}`);
        console.log(`  Relevance score: ${result.relevanceScore.toFixed(3)}`);
        console.log(`  Strategy: ${result.strategy.type}`);
        
        result.injectedMemories.forEach((memory, index) => {
          console.log(`  ${index + 1}. ${memory.content.substring(0, 50)}... (relevance: ${memory.metadata.relevance.toFixed(2)})`);
        });
      } else {
        console.log('  No memories injected');
      }
    }
  }

  /**
   * Demonstrate continuity hooks
   */
  async demonstrateContinuityHooks(): Promise<void> {
    console.log('\n🎣 Demonstrating Continuity Hooks...\n');

    const userId = 'bob';

    // Create different types of continuity hooks
    const hooks = [
      {
        name: 'Keyword-based hook',
        trigger: {
          type: 'keyword' as const,
          pattern: /remember|recall|before|previously/,
          conditions: {}
        },
        action: {
          type: 'inject_memory' as const,
          memoryIds: [],
          context: { boostRelevance: true }
        }
      },
      {
        name: 'Session start hook',
        trigger: {
          type: 'session_start' as const,
          pattern: /.*/,
          conditions: {}
        },
        action: {
          type: 'load_context' as const,
          memoryIds: [],
          context: { loadUserPreferences: true }
        }
      },
      {
        name: 'Topic-based hook',
        trigger: {
          type: 'conversation_topic' as const,
          pattern: /work|project|job/,
          conditions: {}
        },
        action: {
          type: 'inject_memory' as const,
          memoryIds: [],
          context: { focusOnWork: true }
        }
      }
    ];

    for (const hook of hooks) {
      const created = this.memoryManager.createContinuityHook(
        userId,
        hook.trigger,
        hook.action,
        { priority: 0.8 }
      );
      console.log(`✅ Created hook: ${hook.name} (ID: ${created.id})`);
    }

    // Test hook triggering
    console.log('\n🧪 Testing hook triggering...');

    const testContexts = [
      {
        name: 'Remember keyword',
        context: {
          sessionId: 'session-bob-test',
          conversationId: 'conv-remember',
          topic: 'general',
          userInput: 'Do you remember our previous conversation?',
          currentTime: Date.now()
        }
      },
      {
        name: 'Work topic',
        context: {
          sessionId: 'session-bob-test',
          conversationId: 'conv-work',
          topic: 'work and projects',
          userInput: 'Let\'s discuss my current project',
          currentTime: Date.now()
        }
      }
    ];

    for (const { name, context } of testContexts) {
      console.log(`\nTesting: ${name}`);
      
      const triggeredHooks = this.continuityInjector['checkContinuityHooks'](userId, context);
      
      if (triggeredHooks.length > 0) {
        console.log(`  Hooks triggered: ${triggeredHooks.length}`);
        triggeredHooks.forEach(hook => {
          console.log(`  - ${hook.trigger.type} hook (priority: ${hook.metadata.priority})`);
        });
      } else {
        console.log('  No hooks triggered');
      }
    }
  }

  /**
   * Demonstrate memory rituals
   */
  async demonstrateMemoryRituals(): Promise<void> {
    console.log('\n🔮 Demonstrating Memory Rituals...\n');

    const userId = 'charlie';

    // Create custom memory rituals
    const rituals = [
      {
        name: 'Daily Memory Cleanup',
        description: 'Clean up old and irrelevant memories daily',
        schedule: { type: 'daily' as const },
        actions: [
          {
            type: 'cleanup_old_memories' as const,
            parameters: { maxAge: 30 * 24 * 60 * 60 * 1000, minImportance: 0.3 }
          },
          {
            type: 'update_relevance' as const,
            parameters: { timeDecay: true }
          }
        ]
      },
      {
        name: 'Weekly Memory Consolidation',
        description: 'Consolidate and summarize memories weekly',
        schedule: { type: 'weekly' as const },
        actions: [
          {
            type: 'consolidate_memories' as const,
            parameters: { similarityThreshold: 0.8 }
          },
          {
            type: 'create_summary' as const,
            parameters: { maxSummaries: 10 }
          }
        ]
      }
    ];

    for (const ritual of rituals) {
      const created = this.memoryLedger.createMemoryRitual(
        userId,
        ritual.name,
        ritual.description,
        ritual.schedule,
        ritual.actions
      );
      console.log(`✅ Created ritual: ${ritual.name} (ID: ${created.id})`);
    }

    // Execute rituals manually for demo
    console.log('\n⚡ Executing rituals...');
    
    const executedRituals = this.memoryLedger.executeRituals(userId);
    
    if (executedRituals.length > 0) {
      console.log(`  Rituals executed: ${executedRituals.length}`);
      executedRituals.forEach(ritual => {
        console.log(`  - ${ritual.name} (executions: ${ritual.metadata.executionCount})`);
      });
    } else {
      console.log('  No rituals executed (none scheduled for execution)');
    }
  }

  /**
   * Demonstrate cross-session continuity
   */
  async demonstrateCrossSessionContinuity(): Promise<void> {
    console.log('\n🔄 Demonstrating Cross-Session Continuity...\n');

    const userId = 'alice';

    // Create memory in first session
    const session1 = 'session-alice-1';
    this.memoryManager.startSession(userId, session1);
    
    this.memoryManager.createMemory(
      userId,
      session1,
      'fact',
      'personal',
      'Alice is allergic to peanuts and always carries an EpiPen',
      {
        importance: 0.95,
        relevance: 0.9,
        tags: ['health', 'allergy', 'critical']
      }
    );
    
    this.memoryManager.endSession(userId, session1);
    console.log('✅ Created critical memory in session 1');

    // Start second session and test memory injection
    const session2 = 'session-alice-2';
    this.memoryManager.startSession(userId, session2);
    
    const injectionContext = {
      userId,
      sessionId: session2,
      conversationId: 'conv-health',
      topic: 'health and safety',
      userIntent: 'discuss health concerns',
      currentMessage: 'What health information should I know?',
      conversationHistory: ['Hello', 'What health information should I know?'],
      maxTokens: 1000,
      modelContext: {
        modelName: 'chatty-core',
        maxContextLength: 4000,
        currentContextLength: 200
      }
    };

    const result = this.memoryManager.injectMemories(injectionContext);
    
    if (result && result.injectedMemories.length > 0) {
      console.log('✅ Memory from previous session injected successfully');
      console.log(`  Memories injected: ${result.injectedMemories.length}`);
      console.log(`  Critical memory found: ${result.injectedMemories.some(m => m.content.includes('allergic'))}`);
    } else {
      console.log('❌ No memories injected');
    }

    this.memoryManager.endSession(userId, session2);
  }

  /**
   * Demonstrate analytics and statistics
   */
  async demonstrateAnalytics(): Promise<void> {
    console.log('\n📊 Demonstrating Analytics...\n');

    // Get system-wide statistics
    const systemStats = this.memoryManager.getSystemStats();
    console.log('System Statistics:');
    console.log(`  Total entries: ${systemStats.totalEntries}`);
    console.log(`  Active entries: ${systemStats.activeEntries}`);
    console.log(`  Total users: ${systemStats.totalUsers}`);
    console.log(`  Total sessions: ${systemStats.totalSessions}`);
    console.log(`  Average importance: ${systemStats.averageImportance.toFixed(3)}`);
    console.log(`  Average relevance: ${systemStats.averageRelevance.toFixed(3)}`);
    console.log(`  Storage size: ${(systemStats.storageSize / 1024).toFixed(2)} KB`);

    // Get memory analytics
    const analytics = this.memoryManager.getMemoryAnalytics();
    console.log('\nMemory Analytics:');
    console.log(`  Total operations: ${analytics.totalOperations}`);
    console.log(`  Average injection tokens: ${analytics.averageInjectionTokens.toFixed(1)}`);
    console.log(`  Average relevance score: ${analytics.averageRelevanceScore.toFixed(3)}`);
    console.log(`  Most active users: ${analytics.mostActiveUsers.length}`);

    // Get user profiles
    const users = ['alice', 'bob', 'charlie'];
    for (const userId of users) {
      const profile = this.memoryManager.getUserMemoryProfile(userId);
      if (profile) {
        console.log(`\nProfile for ${userId}:`);
        console.log(`  Total memories: ${profile.totalMemories}`);
        console.log(`  Active memories: ${profile.activeMemories}`);
        console.log(`  Average importance: ${profile.averageImportance.toFixed(3)}`);
        console.log(`  Average relevance: ${profile.averageRelevance.toFixed(3)}`);
        console.log(`  Preferred categories: ${profile.preferredCategories.join(', ')}`);
      }
    }
  }

  /**
   * Run the complete demo
   */
  async runCompleteDemo(): Promise<void> {
    console.log('🎯 Memory and Continuity System Demo Starting...\n');
    
    try {
      await this.demonstrateUserManagement();
      await this.demonstrateMemoryManagement();
      await this.demonstrateMemoryInjection();
      await this.demonstrateContinuityHooks();
      await this.demonstrateMemoryRituals();
      await this.demonstrateCrossSessionContinuity();
      await this.demonstrateAnalytics();
      
      console.log('\n🎉 Demo completed successfully!');
    } catch (error) {
      console.error('\n❌ Demo failed:', error);
    }
  }

  /**
   * Emit packet if emitter is available
   */
  private emitPacket(packet: any): void {
    if (this.packetEmitter) {
      this.packetEmitter(packet);
    }
  }
}

/**
 * Example usage scenarios
 */
export async function demonstrateMemoryContinuity() {
  console.log('🎯 Memory and Continuity Demo Starting...\n');
  
  // Create demo instance
  const demo = new MemoryContinuityDemo();
  
  // Set up packet emitter
  demo.setPacketEmitter((packet) => {
    console.log('📦 Packet emitted:', packet.op);
  });
  
  // Run the complete demo
  await demo.runCompleteDemo();
}

// Export for use in other modules
export { PRODUCTION_CONFIG };
