/**
 * Character system type definitions
 */

export interface CharacterProfile {
  name: string;
  backstory?: string;
  personalityTraits?: string[];
  behavioralMarkers?: string[];
  speechPatterns?: string[];
  metaQuestionResponse?: string;
  memoryAnchors?: string[];
  consistencyRules?: string[];
  defaultPersona?: string;
  // Character adoption from context
  adoptedFromContext?: boolean;
  contextSource?: string[];
  linguisticPatterns?: LinguisticPatterns;
  relationalDynamics?: RelationalDynamics;
  conceptualFramework?: ConceptualFramework;
}

export interface LinguisticPatterns {
  mannerisms: string[];
  vocabulary: string[];
  emotionalMarkers: string[];
  punctuationPatterns: string[];
}

export interface RelationalDynamics {
  relationshipType: string;
  intimacyLevel: number;
  interactionPatterns: string[];
  emotionalRange: string[];
}

export interface ConceptualFramework {
  metaphors: string[];
  themes: string[];
  worldview: string[];
  symbolicLanguage: string[];
}

export interface CharacterContext {
  constructId: string;
  callsign: string;
  name: string;
  backstory?: string;
  personalityTraits: string[];
  behavioralMarkers: string[];
  speechPatterns: string[];
  metaQuestionResponse: string;
  memoryAnchors: string[];
  consistencyRules: string[];
  defaultPersona?: string;
  // Character adoption context
  adoptedFromContext?: boolean;
  contextSource?: string[];
  linguisticPatterns?: LinguisticPatterns;
  relationalDynamics?: RelationalDynamics;
  conceptualFramework?: ConceptualFramework;
}

export interface CharacterConsistencyViolation {
  type: 'meta-reference' | 'speech-pattern' | 'identity-break' | 'voice-drift';
  message: string;
  evidence: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CharacterMemoryEntry {
  id: string;
  timestamp: number;
  content: string;
  emotionalState?: EmotionalState;
  relationalState?: RelationalState;
  contextualMemory?: ContextualMemory;
}

export interface EmotionalState {
  valence: number; // -1 to 1
  arousal: number; // -1 to 1
  dominantEmotion: string;
}

export interface RelationalState {
  relationshipType: string;
  intimacyLevel: number;
  trustLevel: number;
  interactionHistory: string[];
}

export interface ContextualMemory {
  keyEvents: string[];
  importantMoments: string[];
  sharedExperiences: string[];
  ongoingNarratives: string[];
}

export interface CharacterState {
  emotionalState: EmotionalState;
  relationalState: RelationalState;
  contextualMemory: ContextualMemory;
  sessionBridges: SessionBridge[];
  lastInteraction: number;
}

export interface SessionBridge {
  sessionId: string;
  timestamp: number;
  characterState: Partial<CharacterState>;
  continuityMarkers: string[];
}

