/**
 * Type definitions for deep transcript analysis and personality extraction
 */

import type { EmotionalState, RelationalState } from '../character/types';
import type { ToneLabel } from '../../../lib/toneDetector';

/**
 * Basic conversation pair extracted from transcript
 */
export interface ConversationPair {
  user: string;
  assistant: string;
  timestamp: string;
  sessionId?: string;
  context?: ConversationContext;
}

/**
 * Context surrounding a conversation pair
 */
export interface ConversationContext {
  previousPairs: ConversationPair[];
  followingPairs: ConversationPair[];
  conversationStart: boolean;
  conversationEnd: boolean;
  topicShift: boolean;
}

/**
 * Emotional state detected in a conversation pair
 */
export interface TranscriptEmotionalState {
  pairIndex: number;
  emotionalState: EmotionalState;
  detectedIn: 'user' | 'assistant' | 'both';
  confidence: number;
  evidence: string[];
  shiftFromPrevious?: EmotionalState;
}

/**
 * Relationship dynamics pattern detected across conversation
 */
export interface RelationshipPattern {
  patternType: 'power' | 'intimacy' | 'conflict' | 'collaboration' | 'dependency' | 'independence';
  strength: number; // 0-1
  evidence: string[];
  pairIndices: number[];
  evolution: RelationshipEvolution[];
}

/**
 * Evolution of relationship over conversation
 */
export interface RelationshipEvolution {
  pairIndex: number;
  patternType: string;
  strength: number;
  timestamp: string;
}

/**
 * Worldview expression found in conversation
 */
export interface WorldviewExpression {
  expression: string;
  category: 'belief' | 'value' | 'principle' | 'metaphor' | 'philosophy';
  confidence: number;
  evidence: string[];
  pairIndex: number;
}

/**
 * Speech pattern extracted from conversation
 */
export interface SpeechPattern {
  pattern: string;
  type: 'vocabulary' | 'idiom' | 'sentence-structure' | 'punctuation' | 'formatting';
  frequency: number;
  examples: string[];
  pairIndices: number[];
}

/**
 * Behavioral marker showing how character responds to situations
 */
export interface BehavioralMarker {
  situation: string;
  responsePattern: string;
  frequency: number;
  examples: string[];
  pairIndices: number[];
  emotionalContext?: EmotionalState;
}

/**
 * Memory anchor - significant event, claim, vow, or defining moment
 */
export interface MemoryAnchor {
  anchor: string;
  type: 'claim' | 'vow' | 'boundary' | 'core-statement' | 'defining-moment' | 'relationship-marker';
  significance: number; // 0-1
  timestamp: string;
  pairIndex: number;
  context: string;
  relatedAnchors?: string[];
}

/**
 * Complete deep transcript analysis
 */
export interface DeepTranscriptAnalysis {
  transcriptPath: string;
  constructId: string;
  conversationPairs: ConversationPair[];
  emotionalStates: TranscriptEmotionalState[];
  relationshipDynamics: RelationshipPattern[];
  worldviewMarkers: WorldviewExpression[];
  speechPatterns: SpeechPattern[];
  behavioralMarkers: BehavioralMarker[];
  memoryAnchors: MemoryAnchor[];
  metadata: {
    totalPairs: number;
    dateRange: {
      start: string;
      end: string;
    };
    analysisTimestamp: string;
    confidence: number;
  };
}

/**
 * Pattern set for personality extraction
 */
export interface PatternSet {
  speechPatterns: SpeechPattern[];
  behavioralMarkers: BehavioralMarker[];
  worldviewMarkers: WorldviewExpression[];
  memoryAnchors: MemoryAnchor[];
  emotionalRange: {
    min: EmotionalState;
    max: EmotionalState;
    common: EmotionalState[];
  };
  relationshipPatterns: RelationshipPattern[];
}

/**
 * Weights for pattern aggregation
 */
export interface PatternWeights {
  recency: number; // 0-1, how much to weight recent patterns
  frequency: number; // 0-1, how much to weight frequent patterns
  emotionalSignificance: number; // 0-1, how much to weight emotionally significant patterns
  relationshipSignificance: number; // 0-1, how much to weight relationship-defining patterns
}

/**
 * Emotional range for personality blueprint
 */
export interface EmotionalRange {
  min: EmotionalState;
  max: EmotionalState;
  common: EmotionalState[];
  rare: EmotionalState[];
}

/**
 * Consistency rule derived from patterns
 */
export interface ConsistencyRule {
  rule: string;
  type: 'speech' | 'behavior' | 'worldview' | 'identity' | 'relationship';
  source: 'transcript' | 'existing-profile' | 'merged';
  confidence: number;
  examples: string[];
}

/**
 * Personality blueprint built from transcript analysis
 */
export interface PersonalityBlueprint {
  constructId: string;
  callsign: string;
  coreTraits: string[];
  speechPatterns: SpeechPattern[];
  behavioralMarkers: BehavioralMarker[];
  worldview: WorldviewExpression[];
  emotionalRange: EmotionalRange;
  relationshipPatterns: RelationshipPattern[];
  memoryAnchors: MemoryAnchor[];
  consistencyRules: ConsistencyRule[];
  metadata: {
    sourceTranscripts: string[];
    extractionTimestamp: string;
    confidence: number;
    mergedWithExisting: boolean;
  };
}

/**
 * Resolved profile after conflict resolution
 */
export interface ResolvedProfile {
  blueprint: PersonalityBlueprint;
  conflicts: ConflictResolution[];
  resolutionStrategy: 'transcript-priority' | 'existing-priority' | 'merged' | 'weighted';
}

/**
 * Conflict resolution record
 */
export interface ConflictResolution {
  field: string;
  transcriptValue: any;
  existingValue: any;
  resolvedValue: any;
  strategy: string;
  confidence: number;
}

/**
 * Relationship context for enhanced tone detection
 */
export interface RelationshipContext {
  relationshipType: string;
  intimacyLevel: number;
  powerDynamic: 'user-dominant' | 'assistant-dominant' | 'balanced' | 'shifting';
  trustLevel: number;
  conflictHistory: number;
}

/**
 * Enhanced tone detection with semantic analysis
 */
export interface EnhancedToneDetection {
  surfaceTone: ToneLabel;
  emotionalState: EmotionalState;
  relationshipContext: RelationshipContext;
  confidence: number;
  evidence: string[];
  semanticAnalysis?: {
    intent: string;
    subtext: string;
    emotionalSubtext: string;
  };
}

/**
 * Personality context for orchestration
 */
export interface PersonalityContext {
  blueprint: PersonalityBlueprint;
  currentState: {
    emotionalState: EmotionalState;
    relationalState: RelationalState;
    recentInteractions: number;
  };
  loadedMemories: Memory[];
}

/**
 * Memory with personality metadata
 */
export interface Memory {
  id: string;
  content: string;
  timestamp: number;
  tone?: EnhancedToneDetection;
  emotionalState?: EmotionalState;
  relationshipContext?: RelationshipContext;
  personalityMetadata?: {
    speechPattern: string;
    behavioralMarker: string;
    worldviewAlignment: number;
  };
}

/**
 * Orchestrated response with personality context
 */
export interface OrchestratedResponse {
  response: string;
  personalityContext: PersonalityContext;
  memoriesUsed: Memory[];
  driftDetected: boolean;
  driftCorrected: boolean;
}

