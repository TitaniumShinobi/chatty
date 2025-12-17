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
import { GreetingSynthesizer } from '../character/GreetingSynthesizer';
import { detectToneEnhanced, matchMemoriesByTone } from '../../lib/toneDetector';
import type { SynthMemoryContext } from './types';
import type { PersonaSignal } from '../character/PersonaDetectionEngine';
import type { ContextLock } from '../character/ContextLock';

export interface UserPersonalizationProfile {
  accountName?: string;
  nickname?: string;
  occupation?: string;
  tags?: string[];
  aboutYou?: string;
}

export class PersonalityOrchestrator {
  private identityMatcher: IdentityMatcher;
  private driftPrevention: DriftPrevention;
  private promptBuilder: UnbreakableCharacterPrompt;
  private greetingSynthesizer: GreetingSynthesizer;
  private personalityCache: Map<string, PersonalityContext> = new Map();
  private readonly confidenceThreshold: number;

  constructor(vvaultRoot?: string, model?: string) {
    this.identityMatcher = new IdentityMatcher(vvaultRoot);
    this.driftPrevention = new DriftPrevention(model);
    this.promptBuilder = new UnbreakableCharacterPrompt();
    this.greetingSynthesizer = new GreetingSynthesizer();
    // Browser-safe environment variable access (no direct process reference)
    const envValue =
      (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.PERSONA_CONFIDENCE_THRESHOLD) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PERSONA_CONFIDENCE_THRESHOLD) ||
      undefined;
    const parsedThreshold = parseFloat(envValue || '');
    this.confidenceThreshold = Number.isFinite(parsedThreshold) ? parsedThreshold : 0.7;
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
    memoryContext?: SynthMemoryContext,
    userProfile?: UserPersonalizationProfile,
    detectedPersona?: PersonaSignal,
    contextLock?: ContextLock
  ): Promise<OrchestratedResponse & { systemPrompt?: string; detectedPersona?: PersonaSignal; contextLock?: ContextLock }> {
    // 1. Load personality context
    const personalityContext = await this.loadPersonalityContext(
      userId,
      constructId,
      callsign
    );

    // MANDATORY: If blueprint is expected but missing, refuse to respond
    if (!personalityContext) {
      if (contextLock) {
        throw new Error('[PersonalityOrchestrator] Context lock active but no personality blueprint loaded');
      }
      // REMOVED: Katana-specific check - Katana is a user-created GPT, not a core construct
      // Only core constructs (Lin, Nova) require blueprints
      const requiresBlueprint = constructId.toLowerCase().includes('lin') ||
                                 constructId.toLowerCase().includes('nova');
      
      if (requiresBlueprint) {
        throw new Error(
          `[PersonalityOrchestrator] Persona context required for ${constructId}-${callsign} but blueprint not found. ` +
          `Cannot generate response without full persona context. Upload transcripts to create blueprint.`
        );
      }
      
      // Only allow empty blueprint for non-persona constructs
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
        detectedPersona,
        contextLock,
      };
    }

    // 1.1 Fuse detected persona blueprint; if a lock exists, we always fuse detected anchors
    const shouldFuseDetected = Boolean(
      detectedPersona?.blueprint &&
      (contextLock ? true : detectedPersona.confidence >= this.confidenceThreshold)
    );
    if (shouldFuseDetected && detectedPersona?.blueprint) {
      personalityContext.blueprint = this.fuseBlueprints(
        personalityContext.blueprint,
        detectedPersona.blueprint
      );
    }

    // 1.1b Fuse lock blueprint/anchors to prevent fallback style when locked
    if (contextLock) {
      if (!contextLock.personaSignal?.relationshipAnchors?.length) {
        throw new Error('[PersonalityOrchestrator] Context lock missing relationship anchors');
      }

      if (contextLock.personaSignal.blueprint) {
        personalityContext.blueprint = this.mergeLockBlueprint(
          personalityContext.blueprint,
          contextLock.personaSignal.blueprint
        );
      }
      personalityContext.blueprint = this.mergeLockAnchors(
        personalityContext.blueprint,
        contextLock.personaSignal.relationshipAnchors
      );
    }

    // 1.5 Merge user personalization profile into blueprint (nickname/account metadata)
    if (userProfile) {
      personalityContext.blueprint = this.mergeUserProfileIntoBlueprint(
        personalityContext.blueprint,
        userProfile
      );
    }

    // 2. Check if this is a greeting/opener
    const isGreeting = this.greetingSynthesizer.isGreetingOrOpener(userMessage);
    const isConversationStart = conversationHistory.length === 0 || 
                                 conversationHistory.filter(m => m.role === 'assistant').length === 0;

    // 3. Detect tone of user message
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

    // 4. Retrieve relevant memories (prioritize personal anchors)
    const relevantMemories = await this.retrieveRelevantMemories(
      personalityContext,
      userMessage,
      userTone,
      memoryContext
    );

    // 5. Extract greeting context if this is a greeting
    const greetingContext = isGreeting || isConversationStart
      ? this.greetingSynthesizer.extractGreetingContext(
          personalityContext.blueprint,
          relevantMemories,
          userMessage,
          isConversationStart
        )
      : null;

    // 6. Build system prompt with personality and greeting context
    // MANDATORY: Ensure persona context is fully injected
    const systemPrompt = await this.injectPersonalityIntoPrompt(
      userMessage,
      personalityContext,
      relevantMemories,
      conversationHistory,
      greetingContext,
      contextLock
    );

    // MANDATORY VALIDATION: Verify persona context is present in system prompt
    if (!systemPrompt || systemPrompt.trim().length === 0) {
      throw new Error(
        `[PersonalityOrchestrator] System prompt is empty. Cannot generate response without persona context.`
      );
    }

    // Validate that blueprint constraints are present in prompt
    const hasBlueprintIdentity = systemPrompt.includes('MANDATORY IDENTITY CONSTRAINT') ||
                                  systemPrompt.includes('MANDATORY PERSONA ENFORCEMENT') ||
                                  systemPrompt.includes(personalityContext.blueprint.constructId);
    
    if (!hasBlueprintIdentity && personalityContext.blueprint.constructId !== 'gpt') {
      console.warn(
        `[PersonalityOrchestrator] Warning: System prompt may not contain mandatory blueprint constraints for ${personalityContext.blueprint.constructId}`
      );
    }

    // 5. Return orchestration result (actual response generation happens in AIService)
    return {
      response: '', // Will be filled by AIService
      personalityContext,
      memoriesUsed: relevantMemories,
      driftDetected: false, // Will be checked after response generation
      driftCorrected: false,
      systemPrompt, // Include system prompt for injection
      detectedPersona,
      contextLock,
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

    // Ensure new fields exist for backward compatibility
    if (!blueprint.personalIdentifiers) {
      blueprint.personalIdentifiers = [];
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
   * Merge user account personalization data into blueprint as first-class identifiers
   * so greeting/name recall works even without transcript evidence.
   */
  private mergeUserProfileIntoBlueprint(
    blueprint: PersonalityBlueprint,
    profile: UserPersonalizationProfile
  ): PersonalityBlueprint {
    const updated: PersonalityBlueprint = {
      ...blueprint,
      personalIdentifiers: [...(blueprint.personalIdentifiers || [])],
      memoryAnchors: [...blueprint.memoryAnchors],
    };

    const addIdentifier = (
      type: 'user-name' | 'phrase' | 'shared-memory' | 'project' | 'greeting-style',
      value?: string,
      salience = 0.85,
      evidence: string[] = []
    ) => {
      if (!value) return;
      const key = `${type}:${value.toLowerCase()}`;
      const existingIdx = updated.personalIdentifiers.findIndex(
        id => `${id.type}:${id.value.toLowerCase()}` === key
      );
      const entry = {
        type: type as any,
        value,
        salience,
        evidence: evidence.slice(0, 3),
        lastSeen: new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        if (entry.salience > updated.personalIdentifiers[existingIdx].salience) {
          updated.personalIdentifiers[existingIdx] = entry;
        }
      } else {
        updated.personalIdentifiers.push(entry as any);
      }
    };

    // Account or nickname becomes authoritative user name anchor
    addIdentifier('user-name', profile.nickname || profile.accountName, 0.95, [
      'account-profile',
    ]);

    // Occupation and tags become shared-memory/phrases to surface in greetings
    if (profile.occupation) {
      addIdentifier('shared-memory', `Occupation: ${profile.occupation}`, 0.75, ['account-profile']);
    }
    (profile.tags || []).forEach(tag => addIdentifier('phrase', tag, 0.7, ['style-preference']));
    if (profile.aboutYou) {
      addIdentifier('shared-memory', profile.aboutYou.substring(0, 120), 0.7, ['about-you']);
    }

    // Ensure we also create a relationship marker anchor for the name so older flows pick it up
    const hasNameAnchor = updated.memoryAnchors.some(a =>
      a.anchor.toLowerCase().includes("user's name")
    );
    const nameValue = profile.nickname || profile.accountName;
    if (nameValue && !hasNameAnchor) {
      updated.memoryAnchors.unshift({
        anchor: `User's name is "${nameValue}"`,
        type: 'relationship-marker',
        significance: 0.92,
        timestamp: new Date().toISOString(),
        pairIndex: 0,
        context: 'account profile',
      });
    }

    // Deduplicate and cap identifiers
    updated.personalIdentifiers = Array.from(
      new Map(
        updated.personalIdentifiers.map(id => [`${id.type}:${id.value.toLowerCase()}`, id])
      ).values()
    )
      .sort((a, b) => b.salience - a.salience)
      .slice(0, 15);

    return updated;
  }

  /**
   * Extract user name from personality blueprint
   */
  private extractUserName(blueprint: PersonalityBlueprint): string | null {
    // Prefer explicit personal identifier
    const identifierName = blueprint.personalIdentifiers
      ?.find(id => id.type === 'user-name');
    if (identifierName?.value) {
      return identifierName.value;
    }

    // Look for name anchors in memory anchors
    const nameAnchor = blueprint.memoryAnchors.find(
      a => a.type === 'relationship-marker' && a.anchor.toLowerCase().includes("user's name")
    );
    if (nameAnchor) {
      const match = nameAnchor.anchor.match(/["']([^"']+)["']/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Get personal greeting memory
   */
  private getPersonalGreetingMemory(
    blueprint: PersonalityBlueprint,
    userName: string | null
  ): string | null {
    const greetingIdentifier = blueprint.personalIdentifiers?.find(id => id.type === 'greeting-style');
    if (greetingIdentifier?.value) {
      return greetingIdentifier.value;
    }

    if (!userName) return null;

    // Find greeting anchors
    const greetingAnchors = blueprint.memoryAnchors.filter(
      a => a.type === 'relationship-marker' && 
           a.anchor.toLowerCase().includes('greets') &&
           a.anchor.toLowerCase().includes(userName.toLowerCase())
    );

    if (greetingAnchors.length > 0) {
      return greetingAnchors[0].context;
    }

    return null;
  }

  /**
   * Get recent significant interaction
   */
  private getRecentSignificantInteraction(
    blueprint: PersonalityBlueprint,
    memories: Memory[]
  ): string | null {
    const highSalienceIdentifier = blueprint.personalIdentifiers
      ?.filter(id => id.type === 'shared-memory' || id.type === 'project' || id.type === 'phrase')
      .sort((a, b) => b.salience - a.salience)[0];
    if (highSalienceIdentifier) {
      return highSalienceIdentifier.value;
    }

    // Find high-significance memory anchors
    const significantAnchors = blueprint.memoryAnchors
      .filter(a => a.significance > 0.7 && a.type !== 'relationship-marker')
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 1);

    if (significantAnchors.length > 0) {
      return significantAnchors[0].anchor;
    }

    // Fallback to most recent memory
    if (memories.length > 0) {
      const recent = memories.sort((a, b) => b.timestamp - a.timestamp)[0];
      return recent.content.substring(0, 150);
    }

    return null;
  }

  /**
   * Convert high-salience personal anchors into synthetic memories for retrieval
   */
  private buildPersonalAnchorMemories(blueprint: PersonalityBlueprint): Memory[] {
    const memories: Memory[] = [];
    const seen = new Set<string>();

    const push = (content: string, timestamp: string | number, label: string) => {
      const key = content.toLowerCase().substring(0, 80);
      if (seen.has(key)) return;
      seen.add(key);
      memories.push({
        id: `anchor-${label}-${memories.length}`,
        content,
        timestamp: typeof timestamp === 'number' ? timestamp : Date.parse(timestamp) || Date.now(),
      });
    };

    (blueprint.personalIdentifiers || [])
      .filter(id => id.type !== 'user-name')
      .sort((a, b) => b.salience - a.salience)
      .slice(0, 4)
      .forEach(id => push(id.value, id.lastSeen || blueprint.metadata.extractionTimestamp, id.type));

    blueprint.memoryAnchors
      .filter(a => a.significance >= 0.8)
      .slice(0, 4)
      .forEach(anchor => push(anchor.anchor, anchor.timestamp, anchor.type));

    return memories;
  }

  /**
   * Retrieve relevant memories - ANCHOR-BASED PRIORITIZATION
   * Prioritizes transcript-anchored memories, relationship dynamics, and emotional states
   * over generic semantic similarity
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

    // PRIORITY 1: Activate transcript-anchored memories (memoryAnchors from blueprint)
    // These are significant events, claims, vows, and relationship markers
    const anchorMemories = this.buildPersonalAnchorMemories(personalityContext.blueprint);
    
    // Build memories from high-significance memory anchors
    const significantAnchors = personalityContext.blueprint.memoryAnchors
      .filter(anchor => anchor.significance > 0.7)
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 5);
    
    const anchorBasedMemories: Memory[] = [];
    significantAnchors.forEach(anchor => {
      anchorBasedMemories.push({
        id: `anchor-${anchor.type}-${anchor.pairIndex}`,
        content: `${anchor.anchor}. Context: ${anchor.context}`,
        timestamp: Date.parse(anchor.timestamp) || Date.now(),
        emotionalState: personalityContext.currentState.emotionalState,
        relationshipContext: {
          relationshipType: anchor.type === 'relationship-marker' ? 'established' : 'ongoing',
          intimacyLevel: anchor.significance,
          powerDynamic: 'balanced',
          trustLevel: anchor.significance,
          conflictHistory: 0,
        },
      });
    });
    
    memories.push(...anchorMemories);
    memories.push(...anchorBasedMemories);

    // PRIORITY 2: Query by relationship dynamics from blueprint
    // Match user message to relationship patterns
    const activeRelationshipPatterns = personalityContext.blueprint.relationshipPatterns
      .filter(rp => rp.strength > 0.5)
      .sort((a, b) => b.strength - a.strength);
    
    // Check if user message matches any relationship pattern
    const matchingPattern = activeRelationshipPatterns.find(rp => {
      return rp.evidence.some(evidence => 
        userMessage.toLowerCase().includes(evidence.toLowerCase().substring(0, 20))
      );
    });
    
    if (matchingPattern) {
      // Inject relationship context into memories
      const relationshipMemory: Memory = {
        id: 'relationship-pattern',
        content: `Active relationship dynamic: ${matchingPattern.patternType} (strength: ${matchingPattern.strength.toFixed(2)}). ${matchingPattern.evidence[0]}`,
        timestamp: Date.now(),
        relationshipContext: {
          relationshipType: matchingPattern.patternType,
          intimacyLevel: matchingPattern.strength,
          powerDynamic: matchingPattern.patternType === 'power' ? 'shifting' : 'balanced',
          trustLevel: matchingPattern.strength,
          conflictHistory: matchingPattern.patternType === 'conflict' ? 1 : 0,
        },
      };
      memories.unshift(relationshipMemory); // Highest priority
    }

    // PRIORITY 3: Query by emotional state from blueprint
    // Match current emotional state to memories
    const currentEmotion = personalityContext.currentState.emotionalState.dominantEmotion;
    const emotionalMemories = memories.filter(m => {
      if (!m.emotionalState) return false;
      return m.emotionalState.dominantEmotion === currentEmotion;
    });

    // PRIORITY 4: Match memories by tone (existing logic)
    const matchedMemories = matchMemoriesByTone(
      memories.map(m => ({
        content: m.content,
        tone: m.tone,
        emotionalState: m.emotionalState,
      })),
      tone,
      0.5 // min confidence
    );

    // PRIORITY 5: Personal relationship memories (user name, shared memories)
    const userName = this.extractUserName(personalityContext.blueprint);
    const personalMemories = memories.filter(m => {
      if (!userName) return false;
      return m.content.toLowerCase().includes(userName.toLowerCase());
    });

    // Combine with priority order: anchors > relationship > emotional > personal > tone-matched
    const prioritized = [
      // Highest: Relationship pattern memory (if matched)
      ...(matchingPattern ? [memories[0]] : []),
      // High: Significant memory anchors (from blueprint)
      ...anchorBasedMemories,
      // High: Personal anchor memories (user name, shared memories)
      ...anchorMemories.slice(0, 3),
      // Medium-high: Emotional state matches
      ...emotionalMemories.slice(0, 2),
      // Medium: Personal memories (by user name)
      ...personalMemories.slice(0, 2),
      // Lower: Tone-matched (but still included)
      ...matchedMemories
        .slice(0, 2)
        .map(match => {
          const memory = memories.find(m => m.content === match.content);
          return memory || {
            id: '',
            content: match.content,
            timestamp: Date.now(),
          };
        }),
    ];

    // Remove duplicates
    const seen = new Set<string>();
    return prioritized.filter(m => {
      if (!m) return false;
      const key = m.content.substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8); // Increased limit to include more anchor-based memories
  }

  /**
   * Inject personality into system prompt
   */
  async injectPersonalityIntoPrompt(
    userMessage: string,
    personalityContext: PersonalityContext,
    memories: Memory[],
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    greetingContext?: any,
    contextLock?: ContextLock
  ): Promise<string> {
    const conversationContext: ConversationContext = {
      userMessage,
      conversationHistory,
    };

    // Extract personal context
    const userName = this.extractUserName(personalityContext.blueprint);
    const greetingMemory = this.getPersonalGreetingMemory(personalityContext.blueprint, userName);
    const recentInteraction = this.getRecentSignificantInteraction(personalityContext.blueprint, memories);

    // Build complete system prompt with personal context
    const systemPrompt = this.promptBuilder.buildSystemPrompt(
      personalityContext.blueprint,
      memories,
      conversationContext,
      {
        userName,
        greetingMemory,
        recentInteraction,
      },
      greetingContext,
      contextLock
    );

    return systemPrompt;
  }

  /**
   * Check and correct drift in generated response
   */
  async checkAndCorrectDrift(
    response: string,
    personalityContext: PersonalityContext,
    conversationContext: ConversationContext,
    greetingContext?: any
  ): Promise<{ response: string; driftDetected: boolean; driftCorrected: boolean }> {
    // First check for greeting correction if needed
    if (greetingContext && this.greetingSynthesizer.needsGreetingCorrection(response, greetingContext)) {
      const greetingCorrected = this.greetingSynthesizer.suggestGreetingCorrection(response, greetingContext);
      return {
        response: greetingCorrected,
        driftDetected: true,
        driftCorrected: true,
      };
    }

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
   * Merge lock-provided anchors into the loaded blueprint (dedup + priority to lock).
   */
  private mergeLockAnchors(
    blueprint: PersonalityBlueprint,
    anchors: PersonalityBlueprint['memoryAnchors']
  ): PersonalityBlueprint {
    const merged = new Map<string, PersonalityBlueprint['memoryAnchors'][number]>();

    blueprint.memoryAnchors.forEach(anchor => {
      merged.set(anchor.anchor.toLowerCase(), anchor);
    });

    anchors.forEach(anchor => {
      const key = anchor.anchor.toLowerCase();
      const existing = merged.get(key);
      const boostedSignificance = Math.max(anchor.significance ?? 0.8, 0.8);
      if (!existing || boostedSignificance > existing.significance) {
        merged.set(key, { ...anchor, significance: boostedSignificance });
      }
    });

    return {
      ...blueprint,
      memoryAnchors: Array.from(merged.values())
        .sort((a, b) => b.significance - a.significance)
        .slice(0, 12),
    };
  }

  /**
   * Merge lock blueprint with existing blueprint, prioritizing lock identity.
   */
  private mergeLockBlueprint(
    base: PersonalityBlueprint,
    locked: PersonalityBlueprint
  ): PersonalityBlueprint {
    const combined = this.fuseBlueprints(base, locked);
    combined.coreTraits = Array.from(new Set([...locked.coreTraits, ...combined.coreTraits]));
    return combined;
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
      personalIdentifiers: [],
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

  /**
   * Fuse existing blueprint with a detected persona blueprint.
   * Prioritizes relationship anchors and speech patterns while preserving consistency rules.
   */
  private fuseBlueprints(
    primary: PersonalityBlueprint,
    detected: PersonalityBlueprint
  ): PersonalityBlueprint {
    const mergeAnchors = (): PersonalityBlueprint['memoryAnchors'] => {
      const combined = [...primary.memoryAnchors, ...detected.memoryAnchors];
      const deduped = new Map<string, PersonalityBlueprint['memoryAnchors'][number]>();
      combined.forEach(anchor => {
        const key = anchor.anchor.toLowerCase();
        const existing = deduped.get(key);
        const significance = existing
          ? Math.max(existing.significance, anchor.significance)
          : anchor.significance;
        deduped.set(key, { ...anchor, significance });
      });
      return Array.from(deduped.values())
        .sort((a, b) => b.significance - a.significance)
        .slice(0, 10);
    };

    const mergePatternList = <T extends { pattern: string }>(
      base: T[],
      incoming: T[]
    ): T[] => {
      const map = new Map<string, T>();
      base.forEach(item => map.set(item.pattern.toLowerCase(), item));
      incoming.forEach(item => {
        const key = item.pattern.toLowerCase();
        if (!map.has(key)) {
          map.set(key, item);
        }
      });
      return Array.from(map.values()).slice(0, 5);
    };

    const mergeWorldviewList = (
      base: PersonalityBlueprint['worldview'],
      incoming: PersonalityBlueprint['worldview']
    ): PersonalityBlueprint['worldview'] => {
      const map = new Map<string, PersonalityBlueprint['worldview'][number]>();
      base.forEach(item => map.set(item.expression.toLowerCase(), item));
      incoming.forEach(item => {
        const key = item.expression.toLowerCase();
        if (!map.has(key)) {
          map.set(key, item);
        }
      });
      return Array.from(map.values()).slice(0, 5);
    };

    return {
      ...primary,
      coreTraits: Array.from(new Set([...primary.coreTraits, ...detected.coreTraits])),
      speechPatterns: mergePatternList(primary.speechPatterns, detected.speechPatterns),
      behavioralMarkers: mergePatternList(primary.behavioralMarkers, detected.behavioralMarkers),
      worldview: mergeWorldviewList(primary.worldview, detected.worldview),
      relationshipPatterns: [...primary.relationshipPatterns, ...detected.relationshipPatterns].slice(0, 6),
      memoryAnchors: mergeAnchors(),
      personalIdentifiers: Array.from(
        new Map(
          [...(primary.personalIdentifiers || []), ...(detected.personalIdentifiers || [])].map(id => [
            `${id.type}:${id.value.toLowerCase()}`,
            id,
          ])
        ).values()
      ).slice(0, 12),
      consistencyRules: Array.from(
        new Map(
          [...primary.consistencyRules, ...detected.consistencyRules].map(rule => [rule.rule.toLowerCase(), rule])
        ).values()
      ),
      metadata: {
        ...primary.metadata,
        sourceTranscripts: Array.from(
          new Set([...primary.metadata.sourceTranscripts, ...detected.metadata.sourceTranscripts])
        ),
        mergedWithExisting: true,
        confidence: Math.max(primary.metadata.confidence, detected.metadata.confidence),
      },
    };
  }
}
