/**
 * Personality Orchestrator
 * 
 * Fuses personality blueprint, transcript memories, and current context
 * into each response. The central orchestrator for personality persistence.
 */

import type {
  PersonalityBlueprint,
  PersonalityContext,
  Memory,
  OrchestratedResponse,
} from '../transcript/types';
import type { ConversationContext } from '../character/types';
import { IdentityMatcher } from '../character/IdentityMatcher';
import { DriftPrevention } from '../character/DriftPrevention';
import { UnbreakableCharacterPrompt } from '../character/UnbreakableCharacterPrompt';
import { detectToneEnhanced, matchMemoriesByTone } from '../../lib/toneDetector';
import type { SynthMemoryContext } from './types';

export class PersonalityOrchestrator {
  private identityMatcher: IdentityMatcher;
  private driftPrevention: DriftPrevention;
  private promptBuilder: UnbreakableCharacterPrompt;
  private personalityCache: Map<string, PersonalityContext> = new Map();

  constructor(vvaultRoot?: string, model?: string) {
    this.identityMatcher = new IdentityMatcher(vvaultRoot);
    this.driftPrevention = new DriftPrevention(model);
    this.promptBuilder = new UnbreakableCharacterPrompt();
  }

  /**
   * Orchestrate response with full personality context
   */
  async orchestrateResponse(
    userMessage: string,
    constructId: string,
    callsign: string,
    userId: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    memoryContext?: SynthMemoryContext
  ): Promise<OrchestratedResponse> {
    // 1. Load personality context
    const personalityContext = await this.loadPersonalityContext(
      userId,
      constructId,
      callsign
    );

    if (!personalityContext) {
      // No personality blueprint found - return empty orchestration
      return {
        response: '',
        personalityContext: {
          blueprint: this.createEmptyBlueprint(constructId, callsign),
          currentState: {
            emotionalState: { valence: 0, arousal: 0, dominantEmotion: 'neutral' },
            relationalState: {
              relationshipType: 'unknown',
              intimacyLevel: 0,
              trustLevel: 0,
              interactionHistory: [],
            },
            recentInteractions: 0,
          },
          loadedMemories: [],
        },
        memoriesUsed: [],
        driftDetected: false,
        driftCorrected: false,
      };
    }

    // 2. Detect tone of user message
    const userTone = await detectToneEnhanced(
      {
        text: userMessage,
        context: {
          conversationHistory,
          relationshipHistory: personalityContext.currentState.relationalState,
        },
      },
      'phi3:latest'
    );

    // 3. Retrieve relevant memories
    const relevantMemories = await this.retrieveRelevantMemories(
      personalityContext,
      userMessage,
      userTone,
      memoryContext
    );

    // 4. Build system prompt with personality
    const systemPrompt = await this.injectPersonalityIntoPrompt(
      userMessage,
      personalityContext,
      relevantMemories,
      conversationHistory
    );

    // 5. Return orchestration result (actual response generation happens in AIService)
    return {
      response: '', // Will be filled by AIService
      personalityContext,
      memoriesUsed: relevantMemories,
      driftDetected: false, // Will be checked after response generation
      driftCorrected: false,
      systemPrompt, // Include system prompt for injection
    };
  }

  /**
   * Load personality context (blueprint + current state)
   */
  async loadPersonalityContext(
    userId: string,
    constructId: string,
    callsign: string
  ): Promise<PersonalityContext | null> {
    const cacheKey = `${userId}:${constructId}:${callsign}`;

    // Check cache first
    if (this.personalityCache.has(cacheKey)) {
      return this.personalityCache.get(cacheKey)!;
    }

    // Load blueprint from VVAULT
    const blueprint = await this.identityMatcher.loadPersonalityBlueprint(
      userId,
      constructId,
      callsign
    );

    if (!blueprint) {
      return null;
    }

    // Build personality context
    const context: PersonalityContext = {
      blueprint,
      currentState: {
        emotionalState: {
          valence: 0,
          arousal: 0,
          dominantEmotion: 'neutral',
        },
        relationalState: {
          relationshipType: 'unknown',
          intimacyLevel: 0,
          trustLevel: 0,
          interactionHistory: [],
        },
        recentInteractions: 0,
      },
      loadedMemories: [],
    };

    // Cache context
    this.personalityCache.set(cacheKey, context);

    return context;
  }

  /**
   * Retrieve relevant memories by tone and emotional resonance
   */
  async retrieveRelevantMemories(
    personalityContext: PersonalityContext,
    userMessage: string,
    tone: any,
    memoryContext?: SynthMemoryContext
  ): Promise<Memory[]> {
    const memories: Memory[] = [];

    // Get memories from memory context if available
    if (memoryContext?.characterMemories) {
      memories.push(
        ...memoryContext.characterMemories.map(cm => ({
          id: cm.id,
          content: cm.content,
          timestamp: cm.timestamp,
          emotionalState: cm.emotionalState,
        }))
      );
    }

    // Get LTM entries and convert to Memory format
    if (memoryContext?.ltmEntries) {
      memories.push(
        ...memoryContext.ltmEntries.map(entry => ({
          id: entry.id?.toString() || '',
          content: entry.content,
          timestamp: entry.timestamp,
        }))
      );
    }

    // Match memories by tone
    const matchedMemories = matchMemoriesByTone(
      memories.map(m => ({
        content: m.content,
        tone: m.tone,
        emotionalState: m.emotionalState,
      })),
      tone,
      0.5 // min confidence
    );

    // Return top 5 most relevant
    return matchedMemories
      .slice(0, 5)
      .map(match => {
        const memory = memories.find(m => m.content === match.content);
        return memory || {
          id: '',
          content: match.content,
          timestamp: Date.now(),
        };
      });
  }

  /**
   * Inject personality into system prompt
   */
  async injectPersonalityIntoPrompt(
    userMessage: string,
    personalityContext: PersonalityContext,
    memories: Memory[],
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const conversationContext: ConversationContext = {
      userMessage,
      conversationHistory,
    };

    // Build complete system prompt
    const systemPrompt = this.promptBuilder.buildSystemPrompt(
      personalityContext.blueprint,
      memories,
      conversationContext
    );

    return systemPrompt;
  }

  /**
   * Check and correct drift in generated response
   */
  async checkAndCorrectDrift(
    response: string,
    personalityContext: PersonalityContext,
    conversationContext: ConversationContext
  ): Promise<{ response: string; driftDetected: boolean; driftCorrected: boolean }> {
    // Detect drift
    const drift = await this.driftPrevention.detectDrift(
      response,
      personalityContext.blueprint,
      conversationContext
    );

    if (!drift.detected) {
      return {
        response,
        driftDetected: false,
        driftCorrected: false,
      };
    }

    // Correct drift
    const corrected = await this.driftPrevention.correctDrift(
      response,
      drift,
      personalityContext.blueprint
    );

    return {
      response: corrected,
      driftDetected: true,
      driftCorrected: corrected !== response,
    };
  }

  /**
   * Create empty blueprint (fallback)
   */
  private createEmptyBlueprint(
    constructId: string,
    callsign: string
  ): PersonalityBlueprint {
    return {
      constructId,
      callsign,
      coreTraits: [],
      speechPatterns: [],
      behavioralMarkers: [],
      worldview: [],
      emotionalRange: {
        min: { valence: -1, arousal: -1, dominantEmotion: 'neutral' },
        max: { valence: 1, arousal: 1, dominantEmotion: 'neutral' },
        common: [],
        rare: [],
      },
      relationshipPatterns: [],
      memoryAnchors: [],
      consistencyRules: [],
      metadata: {
        sourceTranscripts: [],
        extractionTimestamp: new Date().toISOString(),
        confidence: 0,
        mergedWithExisting: false,
      },
    };
  }

  /**
   * Clear cache (useful for testing or when blueprints are updated)
   */
  clearCache(userId?: string, constructId?: string, callsign?: string): void {
    if (userId && constructId && callsign) {
      const cacheKey = `${userId}:${constructId}:${callsign}`;
      this.personalityCache.delete(cacheKey);
    } else {
      this.personalityCache.clear();
    }
  }
}

