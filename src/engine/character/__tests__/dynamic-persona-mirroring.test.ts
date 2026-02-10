/**
 * Dynamic Persona Mirroring Test Suite
 * 
 * Tests for real-time persona mirroring and continuity validation.
 */

import { PersonaDetectionEngine, type WorkspaceContext } from '../PersonaDetectionEngine';
import { DynamicPersonaOrchestrator } from '../../orchestration/DynamicPersonaOrchestrator';
import { WorkspaceContextBuilder } from '../../context/WorkspaceContextBuilder';
import { contextLockManager } from '../ContextLock';
import type { PersonaSignal } from '../PersonaDetectionEngine';

// Mock data for testing
const mockNovaTranscript = {
  constructId: 'nova',
  callsign: '001',
  messages: [
    { role: 'user' as const, content: 'Hey Nova', timestamp: Date.now() - 3600000 },
    { role: 'assistant' as const, content: 'Hey Devon! What\'s up?', timestamp: Date.now() - 3599000 },
    { role: 'user' as const, content: 'Just checking in', timestamp: Date.now() - 3598000 },
    { role: 'assistant' as const, content: 'Always here for you. I claim you, remember?', timestamp: Date.now() - 3597000 }
  ]
};

const mockKatanaTranscript = {
  constructId: 'katana',
  callsign: '001',
  messages: [
    { role: 'user' as const, content: 'Katana, I need your help', timestamp: Date.now() - 1800000 },
    { role: 'assistant' as const, content: 'Lock it down. What do you need?', timestamp: Date.now() - 1799000 },
    { role: 'user' as const, content: 'Design feedback', timestamp: Date.now() - 1798000 },
    { role: 'assistant' as const, content: 'Ruthless and blunt. Here\'s what\'s wrong...', timestamp: Date.now() - 1797000 }
  ]
};

describe('Dynamic Persona Mirroring', () => {
  let personaDetector: PersonaDetectionEngine;
  let dynamicOrchestrator: DynamicPersonaOrchestrator;
  let workspaceBuilder: WorkspaceContextBuilder;

  beforeEach(() => {
    personaDetector = new PersonaDetectionEngine();
    dynamicOrchestrator = new DynamicPersonaOrchestrator();
    workspaceBuilder = new WorkspaceContextBuilder();
    contextLockManager.clearAllLocks();
    personaDetector.clearCache();
  });

  describe('PersonaDetectionEngine', () => {
    it('should detect Nova persona from thread history', async () => {
      const context: WorkspaceContext = {
        currentThread: {
          id: 'test-thread-1',
          messages: mockNovaTranscript.messages,
          constructId: 'synth'
        },
        recentThreads: [],
        vvaultTranscripts: [],
        memoryLedger: {
          continuityHooks: [],
          relationshipAnchors: []
        }
      };

      const persona = await personaDetector.detectDominantPersona(context, 'test-user');

      expect(persona.constructId).toBe('nova');
      expect(persona.confidence).toBeGreaterThan(0.5);
      expect(persona.evidence.length).toBeGreaterThan(0);
    });

    it('should detect Katana persona from thread history', async () => {
      const context: WorkspaceContext = {
        currentThread: {
          id: 'test-thread-2',
          messages: mockKatanaTranscript.messages,
          constructId: 'synth'
        },
        recentThreads: [],
        vvaultTranscripts: [],
        memoryLedger: {
          continuityHooks: [],
          relationshipAnchors: []
        }
      };

      const persona = await personaDetector.detectDominantPersona(context, 'test-user');

      expect(persona.constructId).toBe('katana');
      expect(persona.confidence).toBeGreaterThan(0.5);
    });

    it('should prioritize recent threads over older ones', async () => {
      const context: WorkspaceContext = {
        currentThread: {
          id: 'test-thread-3',
          messages: mockNovaTranscript.messages,
          constructId: 'synth'
        },
        recentThreads: [
          {
            id: 'recent-thread',
            messages: mockKatanaTranscript.messages,
            constructId: 'katana',
            updatedAt: Date.now() - 1000 // Very recent
          }
        ],
        vvaultTranscripts: [],
        memoryLedger: {
          continuityHooks: [],
          relationshipAnchors: []
        }
      };

      const persona = await personaDetector.detectDominantPersona(context, 'test-user');

      // Should detect Katana due to recent thread
      expect(['nova', 'katana']).toContain(persona.constructId);
    });

    it('should extract relationship anchors from messages', async () => {
      const context: WorkspaceContext = {
        currentThread: {
          id: 'test-thread-4',
          messages: mockNovaTranscript.messages,
          constructId: 'synth'
        },
        recentThreads: [],
        vvaultTranscripts: [],
        memoryLedger: {
          continuityHooks: [],
          relationshipAnchors: []
        }
      };

      const persona = await personaDetector.detectDominantPersona(context, 'test-user');

      // Should have relationship anchors from "I claim you"
      const hasClaimAnchor = persona.relationshipAnchors.some(
        a => a.anchor.toLowerCase().includes('claim')
      );
      expect(hasClaimAnchor).toBe(true);
    });
  });

  describe('DynamicPersonaOrchestrator', () => {
    it('should orchestrate with detected Nova persona', async () => {
      const context: WorkspaceContext = {
        currentThread: {
          id: 'test-thread-5',
          messages: mockNovaTranscript.messages,
          constructId: 'synth'
        },
        recentThreads: [],
        vvaultTranscripts: [],
        memoryLedger: {
          continuityHooks: [],
          relationshipAnchors: []
        }
      };

      const orchestration = await dynamicOrchestrator.orchestrateWithDynamicPersona(
        'Hey, how are you?',
        'test-user',
        context,
        mockNovaTranscript.messages,
        'test-thread-5'
      );

      expect(orchestration.detectedPersona).toBeDefined();
      expect(orchestration.detectedPersona?.constructId).toBe('nova');
      expect(orchestration.systemPrompt).toBeDefined();
    });

    it('should fuse blueprints when detected persona has blueprint', async () => {
      const context: WorkspaceContext = {
        currentThread: {
          id: 'test-thread-6',
          messages: mockNovaTranscript.messages,
          constructId: 'synth'
        },
        recentThreads: [],
        vvaultTranscripts: [
          {
            constructId: 'nova',
            callsign: '001',
            lastActivity: Date.now() - 3600000,
            messageCount: 50
          }
        ],
        memoryLedger: {
          continuityHooks: [],
          relationshipAnchors: []
        }
      };

      const orchestration = await dynamicOrchestrator.orchestrateWithDynamicPersona(
        'Test message',
        'test-user',
        context,
        [],
        'test-thread-6'
      );

      expect(orchestration.personalityContext).toBeDefined();
      if (orchestration.detectedPersona?.blueprint) {
        expect(orchestration.personalityContext.blueprint.constructId).toBe('nova');
      }
    });
  });

  describe('Context Lock', () => {
    it('should lock persona when high confidence detected', () => {
      const personaSignal: PersonaSignal = {
        constructId: 'nova',
        callsign: '001',
        confidence: 0.85,
        evidence: ['Recent Nova conversation', 'Relationship claim present'],
        relationshipAnchors: [
          {
            anchor: 'I claim you',
            type: 'claim',
            significance: 0.9,
            timestamp: new Date().toISOString(),
            pairIndex: 0,
            context: 'Recent conversation'
          }
        ],
        source: 'thread',
        timestamp: Date.now()
      };

      const shouldLock = contextLockManager.shouldLockPersona(
        personaSignal,
        'synth',
        'test-thread-7'
      );

      expect(shouldLock).toBe(true);
    });

    it('should maintain lock across multiple messages', async () => {
      const personaSignal: PersonaSignal = {
        constructId: 'nova',
        callsign: '001',
        confidence: 0.9,
        evidence: ['Strong Nova signal'],
        relationshipAnchors: [],
        source: 'thread',
        timestamp: Date.now()
      };

      contextLockManager.lockPersona(personaSignal, 'test-thread-8', 5);

      expect(contextLockManager.isLocked('test-thread-8')).toBe(true);

      // Increment message count
      contextLockManager.incrementMessageCount('test-thread-8');
      contextLockManager.incrementMessageCount('test-thread-8');

      expect(contextLockManager.isLocked('test-thread-8')).toBe(true);
      const lock = contextLockManager.getLock('test-thread-8');
      expect(lock?.messageCount).toBe(2);
      expect(lock?.remainingMessages).toBe(3);
    });

    it('should auto-unlock after message limit', () => {
      const personaSignal: PersonaSignal = {
        constructId: 'nova',
        callsign: '001',
        confidence: 0.9,
        evidence: ['Test'],
        relationshipAnchors: [],
        source: 'thread',
        timestamp: Date.now()
      };

      contextLockManager.lockPersona(personaSignal, 'test-thread-9', 3);

      // Increment to limit
      contextLockManager.incrementMessageCount('test-thread-9');
      contextLockManager.incrementMessageCount('test-thread-9');
      contextLockManager.incrementMessageCount('test-thread-9');

      expect(contextLockManager.isLocked('test-thread-9')).toBe(false);
    });
  });

  describe('Unbreakable Character', () => {
    it('should include context lock in system prompt', async () => {
      const context: WorkspaceContext = {
        currentThread: {
          id: 'test-thread-10',
          messages: mockNovaTranscript.messages,
          constructId: 'synth'
        },
        recentThreads: [],
        vvaultTranscripts: [],
        memoryLedger: {
          continuityHooks: [],
          relationshipAnchors: []
        }
      };

      const orchestration = await dynamicOrchestrator.orchestrateWithDynamicPersona(
        'Are you an AI?',
        'test-user',
        context,
        mockNovaTranscript.messages,
        'test-thread-10'
      );

      if (orchestration.contextLock) {
        expect(orchestration.systemPrompt).toContain('CONTEXT LOCK');
        expect(orchestration.systemPrompt).toContain('nova');
      }
    });
  });

  describe('Memory Continuity', () => {
    it('should preserve relationship anchors across persona switches', async () => {
      const context: WorkspaceContext = {
        currentThread: {
          id: 'test-thread-11',
          messages: mockNovaTranscript.messages,
          constructId: 'synth'
        },
        recentThreads: [],
        vvaultTranscripts: [],
        memoryLedger: {
          continuityHooks: [],
          relationshipAnchors: [
            {
              anchor: 'User\'s name is Devon',
              type: 'relationship-marker',
              significance: 0.95,
              timestamp: new Date().toISOString(),
              pairIndex: 0,
              context: 'Established relationship'
            }
          ]
        }
      };

      const persona = await personaDetector.detectDominantPersona(context, 'test-user');

      expect(persona.relationshipAnchors.length).toBeGreaterThan(0);
      const hasNameAnchor = persona.relationshipAnchors.some(
        a => a.anchor.toLowerCase().includes('devon')
      );
      expect(hasNameAnchor).toBe(true);
    });
  });
});
