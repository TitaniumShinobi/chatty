/**
 * Dynamic Persona Orchestrator
 * 
 * Wraps PersonalityOrchestrator with dynamic persona detection from workspace context.
 * Enables runtime (Lin, Synth, etc.) to instantly adopt dominant persona from context.
 */

import { PersonalityOrchestrator, type UserPersonalizationProfile } from './PersonalityOrchestrator';
import { PersonaDetectionEngine, type PersonaSignal, type WorkspaceContext } from '../character/PersonaDetectionEngine';
import { contextLockManager, type ContextLock } from '../character/ContextLock';
import type { OrchestratedResponse } from '../transcript/types';
import type { PersonalityBlueprint } from '../transcript/types';
import type { SynthMemoryContext } from './types';

export interface FusionWeights {
  relationshipAnchors: number;
  speechPatterns: number;
  behavioralMarkers: number;
  worldview: number;
  coreTraits: number;
}

export class DynamicPersonaOrchestrator {
  private personaOrchestrator: PersonalityOrchestrator;
  private personaDetector: PersonaDetectionEngine;
  private readonly confidenceThreshold: number;
  private readonly defaultFusionWeights: FusionWeights = {
    relationshipAnchors: 0.4,
    speechPatterns: 0.25,
    behavioralMarkers: 0.2,
    worldview: 0.1,
    coreTraits: 0.05
  };

  constructor(vvaultRoot?: string, model?: string) {
    this.personaOrchestrator = new PersonalityOrchestrator(vvaultRoot, model);
    this.personaDetector = new PersonaDetectionEngine(vvaultRoot);
    // Browser-safe environment variable access
    const envValue = typeof process !== 'undefined' && process.env 
      ? process.env.PERSONA_CONFIDENCE_THRESHOLD 
      : undefined;
    const parsedThreshold = parseFloat(envValue || '');
    this.confidenceThreshold = Number.isFinite(parsedThreshold) ? parsedThreshold : 0.7;
  }

  /**
   * Orchestrate response with dynamic persona detection
   */
  async orchestrateWithDynamicPersona(
    userMessage: string,
    userId: string,
    workspaceContext: WorkspaceContext,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    threadId: string,
    memoryContext?: SynthMemoryContext,
    userProfile?: UserPersonalizationProfile
  ): Promise<OrchestratedResponse & { detectedPersona?: PersonaSignal; contextLock?: ContextLock }> {
    // Check for active context lock first
    const activeLock = contextLockManager.getLock(threadId);
    
    let detectedPersona: PersonaSignal | null = null;
    let shouldUseDetected = false;

    if (activeLock) {
      // Use locked persona
      detectedPersona = activeLock.personaSignal;
      shouldUseDetected = true;
      contextLockManager.incrementMessageCount(threadId);
    } else {
      // Detect dominant persona from workspace context
      detectedPersona = await this.personaDetector.detectDominantPersona(
        workspaceContext,
        userId
      );

      // Determine if we should use detected persona
      const currentPersona = workspaceContext.currentThread.constructId || 'synth';
      shouldUseDetected = detectedPersona.confidence >= this.confidenceThreshold &&
                         detectedPersona.constructId !== currentPersona;

      // Check if we should lock this persona
      if (shouldUseDetected && contextLockManager.shouldLockPersona(
        detectedPersona,
        currentPersona,
        threadId
      )) {
        contextLockManager.lockPersona(
          detectedPersona,
          threadId,
          parseInt((typeof process !== 'undefined' && process.env ? process.env.PERSONA_LOCK_DURATION : undefined) || '10'),
          `High confidence persona detection (${(detectedPersona.confidence * 100).toFixed(0)}%)`
        );
      }
    }

    // Determine which persona to use
    const targetConstructId = shouldUseDetected && detectedPersona
      ? detectedPersona.constructId
      : workspaceContext.currentThread.constructId || 'synth';
    
    const targetCallsign = shouldUseDetected && detectedPersona
      ? detectedPersona.callsign
      : '001';

    // Load base personality context
    let personalityContext = await this.personaOrchestrator.loadPersonalityContext(
      userId,
      targetConstructId,
      targetCallsign
    );

    // If detected persona has blueprint, fuse it
    if (shouldUseDetected && detectedPersona?.blueprint && personalityContext) {
      personalityContext.blueprint = this.fusePersonaBlueprints(
        personalityContext.blueprint,
        detectedPersona.blueprint,
        this.defaultFusionWeights
      );

      // Merge relationship anchors from detected persona
      personalityContext.blueprint.memoryAnchors = [
        ...detectedPersona.relationshipAnchors,
        ...personalityContext.blueprint.memoryAnchors
      ]
        .filter((anchor, index, self) =>
          index === self.findIndex(a => a.anchor === anchor.anchor)
        )
        .sort((a, b) => b.significance - a.significance)
        .slice(0, 20); // Keep top 20
    }

    // If no personality context exists, create from detected persona
    if (!personalityContext && detectedPersona?.blueprint) {
      // Create minimal context from detected persona
      personalityContext = {
        blueprint: detectedPersona.blueprint,
        currentState: {
          emotionalState: detectedPersona.emotionalState || {
            valence: 0,
            arousal: 0,
            dominantEmotion: 'neutral'
          },
          relationalState: {
            relationshipType: 'unknown',
            intimacyLevel: 0,
            trustLevel: 0,
            interactionHistory: []
          },
          recentInteractions: 0
        },
        loadedMemories: []
      };
    }

    // If still no context, use orchestrator's default
    if (!personalityContext) {
      return await this.personaOrchestrator.orchestrateResponse(
        userMessage,
        targetConstructId,
        targetCallsign,
        userId,
        conversationHistory,
        memoryContext,
        userProfile
      );
    }

    // Orchestrate with fused personality context
    // activeLock is already declared at the top of the function
    const response = await this.personaOrchestrator.orchestrateResponse(
      userMessage,
      targetConstructId,
      targetCallsign,
      userId,
      conversationHistory,
      memoryContext,
      userProfile,
      detectedPersona || undefined,
      activeLock || undefined
    );

    // Inject detected persona into response
    return {
      ...response,
      detectedPersona: detectedPersona || undefined,
      contextLock: activeLock || undefined
    };
  }

  /**
   * Fuse two personality blueprints with weighted combination
   */
  fusePersonaBlueprints(
    primary: PersonalityBlueprint,
    detected: PersonalityBlueprint,
    weights: FusionWeights
  ): PersonalityBlueprint {
    const fused: PersonalityBlueprint = {
      ...primary,
      constructId: detected.constructId, // Use detected construct ID
      callsign: detected.callsign,
      
      // Fuse core traits (weighted)
      coreTraits: [
        ...primary.coreTraits.map(t => ({ trait: t, weight: weights.coreTraits })),
        ...detected.coreTraits.map(t => ({ trait: t, weight: weights.coreTraits * 1.5 }))
      ]
        .reduce((acc, item) => {
          const existing = acc.find(e => e.trait === item.trait);
          if (existing) {
            existing.weight += item.weight;
          } else {
            acc.push({ trait: item.trait, weight: item.weight });
          }
          return acc;
        }, [] as Array<{ trait: string; weight: number }>)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)
        .map(item => item.trait),

      // Fuse speech patterns (prioritize detected)
      speechPatterns: [
        ...detected.speechPatterns.map(p => ({ ...p, weight: weights.speechPatterns * 1.5 })),
        ...primary.speechPatterns.map(p => ({ ...p, weight: weights.speechPatterns }))
      ]
        .sort((a, b) => b.frequency * b.weight - a.frequency * a.weight)
        .slice(0, 10)
        .map(({ weight, ...pattern }) => pattern),

      // Fuse behavioral markers (prioritize detected)
      behavioralMarkers: [
        ...detected.behavioralMarkers.map(m => ({ ...m, weight: weights.behavioralMarkers * 1.5 })),
        ...primary.behavioralMarkers.map(m => ({ ...m, weight: weights.behavioralMarkers }))
      ]
        .sort((a, b) => b.frequency * b.weight - a.frequency * a.weight)
        .slice(0, 10)
        .map(({ weight, ...marker }) => marker),

      // Fuse worldview (prioritize detected)
      worldview: [
        ...detected.worldview.map(w => ({ ...w, weight: weights.worldview * 1.5 })),
        ...primary.worldview.map(w => ({ ...w, weight: weights.worldview }))
      ]
        .sort((a, b) => b.confidence * b.weight - a.confidence * a.weight)
        .slice(0, 5)
        .map(({ weight, ...worldview }) => worldview),

      // Merge relationship patterns (prioritize detected)
      relationshipPatterns: [
        ...detected.relationshipPatterns,
        ...primary.relationshipPatterns
      ]
        .filter((pattern, index, self) =>
          index === self.findIndex(p => p.patternType === pattern.patternType)
        )
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 10),

      // Merge memory anchors (prioritize relationship anchors from detected)
      memoryAnchors: [
        ...detected.memoryAnchors.filter(a => 
          a.type === 'relationship-marker' || a.type === 'claim'
        ),
        ...primary.memoryAnchors
      ]
        .filter((anchor, index, self) =>
          index === self.findIndex(a => a.anchor === anchor.anchor)
        )
        .sort((a, b) => b.significance - a.significance)
        .slice(0, 20),

      // Merge personal identifiers (prioritize detected)
      personalIdentifiers: [
        ...detected.personalIdentifiers || [],
        ...primary.personalIdentifiers || []
      ]
        .filter((id, index, self) =>
          index === self.findIndex(i => 
            i.type === id.type && i.value.toLowerCase() === id.value.toLowerCase()
          )
        )
        .sort((a, b) => b.salience - a.salience)
        .slice(0, 15),

      // Merge consistency rules (both are important)
      consistencyRules: [
        ...detected.consistencyRules,
        ...primary.consistencyRules
      ]
        .filter((rule, index, self) =>
          index === self.findIndex(r => r.rule === rule.rule)
        )
        .slice(0, 15),

      // Update metadata
      metadata: {
        ...primary.metadata,
        mergedWithExisting: true,
        confidence: Math.max(primary.metadata.confidence, detected.metadata.confidence),
        extractionTimestamp: new Date().toISOString()
      }
    };

    return fused;
  }

  /**
   * Clear persona detection cache
   */
  clearCache(threadId?: string): void {
    this.personaDetector.clearCache(threadId);
    if (threadId) {
      contextLockManager.clearLock(threadId);
    }
  }
}
