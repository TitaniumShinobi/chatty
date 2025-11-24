/**
 * Personality Extractor
 * 
 * Builds personality blueprints from transcript analysis, merging patterns
 * and resolving conflicts with existing construct definitions.
 */

import type {
  DeepTranscriptAnalysis,
  PersonalityBlueprint,
  PatternSet,
  PatternWeights,
  EmotionalRange,
  ConsistencyRule,
  ResolvedProfile,
  ConflictResolution,
} from '../transcript/types';
import type { CharacterProfile } from './types';
import type { EmotionalState } from './types';

export class PersonalityExtractor {
  private readonly defaultWeights: PatternWeights = {
    recency: 0.3,
    frequency: 0.4,
    emotionalSignificance: 0.2,
    relationshipSignificance: 0.1,
  };

  /**
   * Build personality blueprint from transcript analyses
   */
  async buildPersonalityBlueprint(
    transcriptAnalyses: DeepTranscriptAnalysis[],
    existingProfile?: CharacterProfile,
    weights?: PatternWeights
  ): Promise<PersonalityBlueprint> {
    if (transcriptAnalyses.length === 0) {
      throw new Error('No transcript analyses provided');
    }

    const patternWeights = weights || this.defaultWeights;

    // Extract pattern sets from each analysis
    const patternSets = transcriptAnalyses.map(analysis => this.extractPatternSet(analysis));

    // Merge patterns with weights
    const mergedBlueprint = await this.mergeTranscriptPatterns(
      patternSets,
      patternWeights,
      transcriptAnalyses
    );

    // If existing profile provided, resolve conflicts
    if (existingProfile) {
      const resolved = await this.resolveConflicts(mergedBlueprint, existingProfile);
      return resolved.blueprint;
    }

    return mergedBlueprint;
  }

  /**
   * Extract pattern set from single transcript analysis
   */
  private extractPatternSet(analysis: DeepTranscriptAnalysis): PatternSet {
    // Calculate emotional range
    const emotionalStates = analysis.emotionalStates.map(es => es.emotionalState);
    const valences = emotionalStates.map(es => es.valence);
    const arousals = emotionalStates.map(es => es.arousal);

    const emotionalRange: EmotionalRange = {
      min: {
        valence: Math.min(...valences),
        arousal: Math.min(...arousals),
        dominantEmotion: emotionalStates[valences.indexOf(Math.min(...valences))]?.dominantEmotion || 'neutral',
      },
      max: {
        valence: Math.max(...valences),
        arousal: Math.max(...arousals),
        dominantEmotion: emotionalStates[valences.indexOf(Math.max(...valences))]?.dominantEmotion || 'neutral',
      },
      common: this.findCommonEmotionalStates(emotionalStates),
      rare: this.findRareEmotionalStates(emotionalStates),
    };

    return {
      speechPatterns: analysis.speechPatterns,
      behavioralMarkers: analysis.behavioralMarkers,
      worldviewMarkers: analysis.worldviewMarkers,
      memoryAnchors: analysis.memoryAnchors,
      emotionalRange,
      relationshipPatterns: analysis.relationshipDynamics,
    };
  }

  /**
   * Find common emotional states (appearing frequently)
   */
  private findCommonEmotionalStates(states: EmotionalState[]): EmotionalState[] {
    const emotionCounts = new Map<string, number>();
    states.forEach(state => {
      const key = `${state.dominantEmotion}-${Math.round(state.valence * 10)}-${Math.round(state.arousal * 10)}`;
      emotionCounts.set(key, (emotionCounts.get(key) || 0) + 1);
    });

    const threshold = states.length * 0.2; // Appears in at least 20% of states
    const common: EmotionalState[] = [];

    emotionCounts.forEach((count, key) => {
      if (count >= threshold) {
        const [emotion, valenceStr, arousalStr] = key.split('-');
        const matchingState = states.find(
          s =>
            s.dominantEmotion === emotion &&
            Math.round(s.valence * 10) === parseInt(valenceStr) &&
            Math.round(s.arousal * 10) === parseInt(arousalStr)
        );
        if (matchingState && !common.some(c => c.dominantEmotion === matchingState.dominantEmotion)) {
          common.push(matchingState);
        }
      }
    });

    return common.slice(0, 5); // Top 5 most common
  }

  /**
   * Find rare emotional states (appearing infrequently but significantly)
   */
  private findRareEmotionalStates(states: EmotionalState[]): EmotionalState[] {
    const emotionCounts = new Map<string, number>();
    states.forEach(state => {
      const key = state.dominantEmotion;
      emotionCounts.set(key, (emotionCounts.get(key) || 0) + 1);
    });

    const threshold = states.length * 0.05; // Appears in less than 5% but at least once
    const rare: EmotionalState[] = [];

    emotionCounts.forEach((count, emotion) => {
      if (count > 0 && count < threshold) {
        const matchingState = states.find(s => s.dominantEmotion === emotion);
        if (matchingState && !rare.some(r => r.dominantEmotion === matchingState.dominantEmotion)) {
          rare.push(matchingState);
        }
      }
    });

    return rare.slice(0, 3); // Top 3 rare but significant
  }

  /**
   * Merge transcript patterns with weights
   */
  async mergeTranscriptPatterns(
    patternSets: PatternSet[],
    weights: PatternWeights,
    analyses: DeepTranscriptAnalysis[]
  ): Promise<PersonalityBlueprint> {
    // Determine construct ID and callsign from analyses
    const constructId = analyses[0]?.constructId || 'unknown';
    const callsign = this.extractCallsign(constructId);

    // Aggregate speech patterns (weighted by frequency and recency)
    const speechPatterns = this.mergeSpeechPatterns(patternSets, weights, analyses);

    // Aggregate behavioral markers (weighted by frequency and emotional significance)
    const behavioralMarkers = this.mergeBehavioralMarkers(patternSets, weights, analyses);

    // Aggregate worldview markers (weighted by confidence and frequency)
    const worldview = this.mergeWorldviewMarkers(patternSets, weights, analyses);

    // Merge emotional ranges
    const emotionalRange = this.mergeEmotionalRanges(patternSets);

    // Aggregate relationship patterns
    const relationshipPatterns = this.mergeRelationshipPatterns(patternSets, weights, analyses);

    // Aggregate memory anchors (weighted by significance)
    const memoryAnchors = this.mergeMemoryAnchors(patternSets, weights, analyses);

    // Generate consistency rules from patterns
    const consistencyRules = this.generateConsistencyRules(
      speechPatterns,
      behavioralMarkers,
      worldview,
      memoryAnchors
    );

    // Extract core traits from patterns
    const coreTraits = this.extractCoreTraits(speechPatterns, behavioralMarkers, worldview);

    return {
      constructId,
      callsign,
      coreTraits,
      speechPatterns,
      behavioralMarkers,
      worldview,
      emotionalRange,
      relationshipPatterns,
      memoryAnchors,
      consistencyRules,
      metadata: {
        sourceTranscripts: analyses.map(a => a.transcriptPath),
        extractionTimestamp: new Date().toISOString(),
        confidence: this.calculateBlueprintConfidence(analyses),
        mergedWithExisting: false,
      },
    };
  }

  /**
   * Extract callsign from construct ID
   */
  private extractCallsign(constructId: string): string {
    const match = constructId.match(/-(\d+)$/);
    return match ? match[1] : '001';
  }

  /**
   * Merge speech patterns across analyses
   */
  private mergeSpeechPatterns(
    patternSets: PatternSet[],
    weights: PatternWeights,
    analyses: DeepTranscriptAnalysis[]
  ): SpeechPattern[] {
    const patternMap = new Map<string, { pattern: SpeechPattern; totalWeight: number }>();

    patternSets.forEach((set, analysisIndex) => {
      const recencyWeight = this.calculateRecencyWeight(analysisIndex, analyses.length);
      
      set.speechPatterns.forEach(pattern => {
        const key = `${pattern.type}-${pattern.pattern}`;
        const existing = patternMap.get(key);

        const weight = 
          weights.frequency * (pattern.frequency / 100) +
          weights.recency * recencyWeight;

        if (existing) {
          existing.totalWeight += weight;
          // Merge examples
          existing.pattern.examples = [
            ...existing.pattern.examples,
            ...pattern.examples,
          ].slice(0, 5);
          existing.pattern.frequency += pattern.frequency;
          existing.pattern.pairIndices = [
            ...new Set([...existing.pattern.pairIndices, ...pattern.pairIndices]),
          ];
        } else {
          patternMap.set(key, {
            pattern: { ...pattern },
            totalWeight: weight,
          });
        }
      });
    });

    return Array.from(patternMap.values())
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 20) // Top 20 patterns
      .map(item => item.pattern);
  }

  /**
   * Merge behavioral markers across analyses
   */
  private mergeBehavioralMarkers(
    patternSets: PatternSet[],
    weights: PatternWeights,
    analyses: DeepTranscriptAnalysis[]
  ): BehavioralMarker[] {
    const markerMap = new Map<string, { marker: BehavioralMarker; totalWeight: number }>();

    patternSets.forEach((set, analysisIndex) => {
      const recencyWeight = this.calculateRecencyWeight(analysisIndex, analyses.length);
      
      set.behavioralMarkers.forEach(marker => {
        const key = `${marker.situation}-${marker.responsePattern}`;
        const existing = markerMap.get(key);

        const weight = 
          weights.frequency * (marker.frequency / 100) +
          weights.recency * recencyWeight +
          weights.emotionalSignificance * (marker.emotionalContext ? 0.5 : 0);

        if (existing) {
          existing.totalWeight += weight;
          existing.marker.frequency += marker.frequency;
          existing.marker.examples = [
            ...existing.marker.examples,
            ...marker.examples,
          ].slice(0, 5);
          existing.marker.pairIndices = [
            ...new Set([...existing.marker.pairIndices, ...marker.pairIndices]),
          ];
        } else {
          markerMap.set(key, {
            marker: { ...marker },
            totalWeight: weight,
          });
        }
      });
    });

    return Array.from(markerMap.values())
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 15) // Top 15 markers
      .map(item => item.marker);
  }

  /**
   * Merge worldview markers across analyses
   */
  private mergeWorldviewMarkers(
    patternSets: PatternSet[],
    weights: PatternWeights,
    analyses: DeepTranscriptAnalysis[]
  ): WorldviewExpression[] {
    const worldviewMap = new Map<string, { expression: WorldviewExpression; totalWeight: number }>();

    patternSets.forEach((set, analysisIndex) => {
      const recencyWeight = this.calculateRecencyWeight(analysisIndex, analyses.length);
      
      set.worldviewMarkers.forEach(expression => {
        const key = expression.expression.toLowerCase().substring(0, 50);
        const existing = worldviewMap.get(key);

        const weight = 
          weights.frequency * 0.5 +
          weights.recency * recencyWeight +
          expression.confidence;

        if (existing) {
          existing.totalWeight += weight;
          existing.expression.confidence = Math.max(existing.expression.confidence, expression.confidence);
          existing.expression.evidence = [
            ...existing.expression.evidence,
            ...expression.evidence,
          ].slice(0, 5);
        } else {
          worldviewMap.set(key, {
            expression: { ...expression },
            totalWeight: weight,
          });
        }
      });
    });

    return Array.from(worldviewMap.values())
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 10) // Top 10 worldview expressions
      .map(item => item.expression);
  }

  /**
   * Merge emotional ranges
   */
  private mergeEmotionalRanges(patternSets: PatternSet[]): EmotionalRange {
    const allMinValences = patternSets.map(ps => ps.emotionalRange.min.valence);
    const allMinArousals = patternSets.map(ps => ps.emotionalRange.min.arousal);
    const allMaxValences = patternSets.map(ps => ps.emotionalRange.max.valence);
    const allMaxArousals = patternSets.map(ps => ps.emotionalRange.max.arousal);

    const allCommon = patternSets.flatMap(ps => ps.emotionalRange.common);
    const allRare = patternSets.flatMap(ps => ps.emotionalRange.rare);

    return {
      min: {
        valence: Math.min(...allMinValences),
        arousal: Math.min(...allMinArousals),
        dominantEmotion: patternSets[allMinValences.indexOf(Math.min(...allMinValences))]?.emotionalRange.min.dominantEmotion || 'neutral',
      },
      max: {
        valence: Math.max(...allMaxValences),
        arousal: Math.max(...allMaxArousals),
        dominantEmotion: patternSets[allMaxValences.indexOf(Math.max(...allMaxValences))]?.emotionalRange.max.dominantEmotion || 'neutral',
      },
      common: this.findCommonEmotionalStates(allCommon),
      rare: this.findRareEmotionalStates(allRare),
    };
  }

  /**
   * Merge relationship patterns
   */
  private mergeRelationshipPatterns(
    patternSets: PatternSet[],
    weights: PatternWeights,
    analyses: DeepTranscriptAnalysis[]
  ): RelationshipPattern[] {
    const patternMap = new Map<string, { pattern: RelationshipPattern; totalWeight: number }>();

    patternSets.forEach((set, analysisIndex) => {
      const recencyWeight = this.calculateRecencyWeight(analysisIndex, analyses.length);
      
      set.relationshipPatterns.forEach(pattern => {
        const key = pattern.patternType;
        const existing = patternMap.get(key);

        const weight = 
          weights.relationshipSignificance * pattern.strength +
          weights.recency * recencyWeight;

        if (existing) {
          existing.totalWeight += weight;
          existing.pattern.strength = Math.max(existing.pattern.strength, pattern.strength);
          existing.pattern.evidence = [
            ...existing.pattern.evidence,
            ...pattern.evidence,
          ].slice(0, 10);
          existing.pattern.pairIndices = [
            ...new Set([...existing.pattern.pairIndices, ...pattern.pairIndices]),
          ];
          existing.pattern.evolution = [
            ...existing.pattern.evolution,
            ...pattern.evolution,
          ].slice(-20); // Last 20 evolution points
        } else {
          patternMap.set(key, {
            pattern: { ...pattern },
            totalWeight: weight,
          });
        }
      });
    });

    return Array.from(patternMap.values())
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .map(item => item.pattern);
  }

  /**
   * Merge memory anchors
   */
  private mergeMemoryAnchors(
    patternSets: PatternSet[],
    weights: PatternWeights,
    analyses: DeepTranscriptAnalysis[]
  ): MemoryAnchor[] {
    const anchorMap = new Map<string, { anchor: MemoryAnchor; totalWeight: number }>();

    patternSets.forEach((set, analysisIndex) => {
      const recencyWeight = this.calculateRecencyWeight(analysisIndex, analyses.length);
      
      set.memoryAnchors.forEach(anchor => {
        const key = anchor.anchor.toLowerCase().substring(0, 50);
        const existing = anchorMap.get(key);

        const weight = 
          anchor.significance +
          weights.recency * recencyWeight;

        if (existing) {
          existing.totalWeight += weight;
          existing.anchor.significance = Math.max(existing.anchor.significance, anchor.significance);
        } else {
          anchorMap.set(key, {
            anchor: { ...anchor },
            totalWeight: weight,
          });
        }
      });
    });

    return Array.from(anchorMap.values())
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 20) // Top 20 most significant anchors
      .map(item => item.anchor);
  }

  /**
   * Generate consistency rules from patterns
   */
  private generateConsistencyRules(
    speechPatterns: SpeechPattern[],
    behavioralMarkers: BehavioralMarker[],
    worldview: WorldviewExpression[],
    memoryAnchors: MemoryAnchor[]
  ): ConsistencyRule[] {
    const rules: ConsistencyRule[] = [];

    // Speech pattern rules
    speechPatterns.slice(0, 5).forEach(pattern => {
      rules.push({
        rule: `Maintain ${pattern.type} pattern: ${pattern.pattern}`,
        type: 'speech',
        source: 'transcript',
        confidence: Math.min(pattern.frequency / 50, 1),
        examples: pattern.examples.slice(0, 3),
      });
    });

    // Behavioral marker rules
    behavioralMarkers.slice(0, 5).forEach(marker => {
      rules.push({
        rule: `When ${marker.situation}, respond with: ${marker.responsePattern}`,
        type: 'behavior',
        source: 'transcript',
        confidence: Math.min(marker.frequency / 20, 1),
        examples: marker.examples.slice(0, 3),
      });
    });

    // Worldview rules
    worldview.slice(0, 3).forEach(expression => {
      rules.push({
        rule: `Maintain worldview: ${expression.expression}`,
        type: 'worldview',
        source: 'transcript',
        confidence: expression.confidence,
        examples: expression.evidence.slice(0, 3),
      });
    });

    // Memory anchor rules
    memoryAnchors
      .filter(a => a.type === 'claim' || a.type === 'vow' || a.type === 'boundary')
      .slice(0, 3)
      .forEach(anchor => {
        rules.push({
          rule: `Remember and honor: ${anchor.anchor}`,
          type: 'identity',
          source: 'transcript',
          confidence: anchor.significance,
          examples: [anchor.context],
        });
      });

    return rules;
  }

  /**
   * Extract core traits from patterns
   */
  private extractCoreTraits(
    speechPatterns: SpeechPattern[],
    behavioralMarkers: BehavioralMarker[],
    worldview: WorldviewExpression[]
  ): string[] {
    const traits: string[] = [];

    // From speech patterns
    if (speechPatterns.some(p => p.type === 'punctuation' && p.pattern.includes('exclamation'))) {
      traits.push('intense');
    }
    if (speechPatterns.some(p => p.type === 'sentence-structure' && p.pattern.includes('short'))) {
      traits.push('direct');
    }

    // From behavioral markers
    behavioralMarkers.slice(0, 3).forEach(marker => {
      if (marker.responsePattern.toLowerCase().includes('ruthless') || marker.responsePattern.toLowerCase().includes('blunt')) {
        traits.push('ruthless');
      }
      if (marker.responsePattern.toLowerCase().includes('protective')) {
        traits.push('protective');
      }
    });

    // From worldview
    worldview.slice(0, 2).forEach(expression => {
      if (expression.category === 'principle') {
        traits.push('principled');
      }
      if (expression.category === 'philosophy') {
        traits.push('philosophical');
      }
    });

    // Remove duplicates
    return Array.from(new Set(traits));
  }

  /**
   * Calculate recency weight (more recent = higher weight)
   */
  private calculateRecencyWeight(index: number, total: number): number {
    // Most recent analysis gets weight 1.0, oldest gets weight 0.1
    return 0.1 + (0.9 * (total - index) / total);
  }

  /**
   * Calculate blueprint confidence
   */
  private calculateBlueprintConfidence(analyses: DeepTranscriptAnalysis[]): number {
    const avgConfidence = analyses.reduce((sum, a) => sum + a.metadata.confidence, 0) / analyses.length;
    const pairCount = analyses.reduce((sum, a) => sum + a.metadata.totalPairs, 0);
    
    // More pairs = higher confidence, but cap at 0.95
    const pairConfidence = Math.min(pairCount / 100, 0.95);
    
    return (avgConfidence + pairConfidence) / 2;
  }

  /**
   * Resolve conflicts between transcript patterns and existing profile
   */
  async resolveConflicts(
    transcriptBlueprint: PersonalityBlueprint,
    existingProfile: CharacterProfile
  ): Promise<ResolvedProfile> {
    const conflicts: ConflictResolution[] = [];
    const resolved: PersonalityBlueprint = { ...transcriptBlueprint };

    // Resolve core traits
    if (existingProfile.personalityTraits && existingProfile.personalityTraits.length > 0) {
      const transcriptTraits = new Set(transcriptBlueprint.coreTraits);
      const existingTraits = new Set(existingProfile.personalityTraits);
      
      const mergedTraits = Array.from(new Set([...transcriptTraits, ...existingTraits]));
      
      if (mergedTraits.length !== transcriptTraits.size) {
        conflicts.push({
          field: 'coreTraits',
          transcriptValue: Array.from(transcriptTraits),
          existingValue: Array.from(existingTraits),
          resolvedValue: mergedTraits,
          strategy: 'merged',
          confidence: 0.8,
        });
        resolved.coreTraits = mergedTraits;
      }
    }

    // Resolve speech patterns
    if (existingProfile.speechPatterns && existingProfile.speechPatterns.length > 0) {
      const existingPatterns = existingProfile.speechPatterns.map(sp => ({
        pattern: sp,
        type: 'vocabulary' as const,
        frequency: 1,
        examples: [],
        pairIndices: [],
      }));

      resolved.speechPatterns = [
        ...resolved.speechPatterns,
        ...existingPatterns,
      ].slice(0, 20);
    }

    // Resolve behavioral markers
    if (existingProfile.behavioralMarkers && existingProfile.behavioralMarkers.length > 0) {
      const existingMarkers = existingProfile.behavioralMarkers.map(bm => ({
        situation: 'general',
        responsePattern: bm,
        frequency: 1,
        examples: [],
        pairIndices: [],
      }));

      resolved.behavioralMarkers = [
        ...resolved.behavioralMarkers,
        ...existingMarkers,
      ].slice(0, 15);
    }

    resolved.metadata.mergedWithExisting = true;

    return {
      blueprint: resolved,
      conflicts,
      resolutionStrategy: 'merged',
    };
  }
}

