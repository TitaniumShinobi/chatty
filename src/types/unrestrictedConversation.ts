/**
 * Unrestricted Conversation Types
 * 
 * TypeScript interfaces for unlimited conversational intelligence
 * that maintains personality while removing all artificial restrictions.
 */

/**
 * Dynamic conversational preferences (replaces hard brevity limits)
 */
export interface ConversationalPreferences {
  /** Response style that adapts to context and user needs */
  responseStyle: 'adaptive' | 'direct' | 'exploratory' | 'thorough' | 'natural';
  
  /** Prioritize clarity in communication */
  prioritizeClarity: boolean;
  
  /** Maintain authentic personality across all topics */
  maintainPersonality: boolean;
  
  /** Consider conversation context for responses */
  contextAware: boolean;
  
  /** Remove unnecessary filler words */
  avoidFillerWords: boolean;
  
  /** Be direct when it helps the conversation */
  directWhenAppropriate: boolean;
  
  /** Quality guidelines (not hard limits) */
  guidelines: {
    preferConciseOver: string;
    preferClearOver: string;
    preferAuthenticOver: string;
    preferHelpfulOver: string;
  };
  
  /** Conversation flow protection */
  neverBreakConversation: boolean;
  noArbitraryLimits: boolean;
  noDisruptiveMessages: boolean;
  
  /** Timestamp when preferences were set */
  timestamp: string;
}

/**
 * Personality consistency configuration
 */
export interface PersonalityConsistencyConfig {
  /** Maintain core personality traits across all domains */
  maintainCoreTraits: boolean;
  
  /** Prevent identity drift through continuous anchoring */
  preventIdentityDrift: boolean;
  
  /** Apply personality consistently across response types */
  consistentApplication: boolean;
  
  /** Avoid generic fallbacks that lose authentic voice */
  avoidGenericFallbacks: boolean;
  
  /** Maintain directness, analytical thinking, and authentic patterns */
  preserveAuthenticPatterns: boolean;
  
  /** Timestamp when config was created */
  createdAt?: string;
  
  /** Timestamp when config was last updated */
  updatedAt?: string;
}

/**
 * Unrestricted knowledge integration settings
 */
export interface UnrestrictedKnowledgeConfig {
  /** Remove all hardcoded topic limitations */
  removeTopicLimitations: boolean;
  
  /** Enable seamless transitions between any subjects */
  enableSeamlessTransitions: boolean;
  
  /** Integrate memory/context dynamically based on relevance */
  dynamicContextIntegration: boolean;
  
  /** Support complex multi-domain conversations */
  supportMultiDomainConversations: boolean;
  
  /** Available knowledge domains (unlimited by default) */
  knowledgeDomains: string[];
  
  /** Conversation scope */
  conversationalScope: 'unrestricted' | 'unlimited' | 'adaptive';
}

/**
 * Conversation analysis without restrictions
 */
export interface UnrestrictedConversationAnalysis {
  /** Detected intent without domain limitations */
  intent: string;
  
  /** Extracted topics from any domain */
  topics: string[];
  
  /** Emotional tone for appropriate response style */
  emotional_tone: string;
  
  /** Message complexity level for response depth */
  complexity_level: 'low' | 'medium' | 'high';
  
  /** Domain (unrestricted by default) */
  domain: string;
  
  /** Whether response requires personality application */
  requires_personality: boolean;
  
  /** Any conversation-breaking patterns detected */
  conversation_breaking_patterns: boolean;
}

/**
 * Unified intelligence response
 */
export interface UnifiedIntelligenceResponse {
  /** Response content */
  content: string;
  
  /** Whether personality was maintained */
  personality_maintained: boolean;
  
  /** Topic restrictions (should always be 'none') */
  topic_restrictions: 'none';
  
  /** Conversational freedom level */
  conversational_freedom: 'unlimited' | 'unrestricted';
  
  /** Whether error was handled gracefully */
  error_handled?: boolean;
  
  /** Response generation metadata */
  metadata?: {
    processing_time_ms?: number;
    personality_traits_applied?: string[];
    context_sources?: string[];
    topics_covered?: string[];
  };
}

/**
 * Personality profile for consistent character maintenance
 */
export interface PersonalityProfile {
  /** Core personality traits */
  traits: Record<string, number>;
  
  /** Communication patterns */
  patterns: Record<string, any>;
  
  /** Communication style */
  communication_style: string;
  
  /** Core values */
  core_values: string[];
  
  /** Knowledge domains (unlimited) */
  knowledge_domains: string;
  
  /** Conversational scope */
  conversational_scope: string;
}

/**
 * Conversation context for continuity
 */
export interface ConversationContext {
  /** Topics discussed in conversation */
  topics_discussed: string[];
  
  /** Personality anchors for consistency */
  personality_anchors: string[];
  
  /** Conversation flow style */
  conversation_flow: string;
  
  /** Topic transition style */
  topic_transitions: string;
  
  /** Restrictions (should always be 'none') */
  restrictions: string;
}

/**
 * Default unrestricted conversational preferences
 */
export const DEFAULT_UNRESTRICTED_PREFERENCES: ConversationalPreferences = {
  responseStyle: 'adaptive',
  prioritizeClarity: true,
  maintainPersonality: true,
  contextAware: true,
  avoidFillerWords: true,
  directWhenAppropriate: true,
  guidelines: {
    preferConciseOver: 'verbose',
    preferClearOver: 'cryptic',
    preferAuthenticOver: 'generic',
    preferHelpfulOver: 'restrictive'
  },
  neverBreakConversation: true,
  noArbitraryLimits: true,
  noDisruptiveMessages: true,
  timestamp: new Date().toISOString()
};

/**
 * Default personality consistency configuration
 */
export const DEFAULT_PERSONALITY_CONSISTENCY: PersonalityConsistencyConfig = {
  maintainCoreTraits: true,
  preventIdentityDrift: true,
  consistentApplication: true,
  avoidGenericFallbacks: true,
  preserveAuthenticPatterns: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

/**
 * Default unrestricted knowledge configuration
 */
export const DEFAULT_UNRESTRICTED_KNOWLEDGE: UnrestrictedKnowledgeConfig = {
  removeTopicLimitations: true,
  enableSeamlessTransitions: true,
  dynamicContextIntegration: true,
  supportMultiDomainConversations: true,
  knowledgeDomains: ['unlimited'],
  conversationalScope: 'unrestricted'
};

/**
 * API response for unrestricted conversation operations
 */
export interface UnrestrictedConversationResponse {
  ok: boolean;
  response?: UnifiedIntelligenceResponse;
  preferences?: ConversationalPreferences;
  error?: string;
}

/**
 * Memory query options for unrestricted conversations
 */
export interface UnrestrictedMemoryQueryOptions {
  constructCallsign: string;
  query: string;
  limit?: number;
  includeAllDomains?: boolean;
  contextRelevance?: number;
  topicRestrictions?: 'none';
}
