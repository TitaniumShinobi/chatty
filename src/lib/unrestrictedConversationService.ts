/**
 * Unrestricted Conversation Service
 * 
 * Frontend service for managing unlimited conversational intelligence
 * without artificial restrictions or domain boundaries.
 */

import type {
  ConversationalPreferences,
  PersonalityConsistencyConfig,
  UnrestrictedConversationResponse,
  UnrestrictedMemoryQueryOptions,
  UnifiedIntelligenceResponse,
  DEFAULT_UNRESTRICTED_PREFERENCES,
  DEFAULT_PERSONALITY_CONSISTENCY,
} from '../types/unrestrictedConversation';

import {
  DEFAULT_UNRESTRICTED_PREFERENCES as DEFAULT_PREFS,
  DEFAULT_PERSONALITY_CONSISTENCY as DEFAULT_CONSISTENCY,
} from '../types/unrestrictedConversation';

/**
 * Get conversational preferences (replaces brevity config)
 */
export async function getConversationalPreferences(constructCallsign: string): Promise<ConversationalPreferences> {
  try {
    const response = await fetch(
      `/api/vvault/conversation/preferences?constructCallsign=${encodeURIComponent(constructCallsign)}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [UnrestrictedConversation] Failed to fetch preferences: ${response.status}`);
      return DEFAULT_PREFS;
    }

    const data: UnrestrictedConversationResponse = await response.json();
    
    if (data.ok && data.preferences) {
      return data.preferences;
    }

    // Preferences not found, return unrestricted defaults
    return DEFAULT_PREFS;
  } catch (error) {
    console.warn('⚠️ [UnrestrictedConversation] Error fetching preferences:', error);
    return DEFAULT_PREFS;
  }
}

/**
 * Save conversational preferences (replaces brevity config saving)
 */
export async function saveConversationalPreferences(
  constructCallsign: string,
  preferences: Partial<ConversationalPreferences>
): Promise<ConversationalPreferences> {
  try {
    const response = await fetch('/api/vvault/conversation/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        constructCallsign,
        preferences,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save conversational preferences');
    }

    const data: UnrestrictedConversationResponse = await response.json();
    
    if (data.ok && data.preferences) {
      return data.preferences;
    }

    throw new Error('Invalid response from server');
  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Failed to save preferences:', error);
    throw error;
  }
}

/**
 * Get personality consistency settings
 */
export async function getPersonalityConsistency(constructCallsign: string): Promise<PersonalityConsistencyConfig> {
  try {
    const response = await fetch(
      `/api/vvault/conversation/personality?constructCallsign=${encodeURIComponent(constructCallsign)}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [UnrestrictedConversation] Failed to fetch personality consistency: ${response.status}`);
      return DEFAULT_CONSISTENCY;
    }

    const data = await response.json();
    
    if (data.ok && data.config) {
      return data.config;
    }

    // Config not found, return defaults
    return DEFAULT_CONSISTENCY;
  } catch (error) {
    console.warn('⚠️ [UnrestrictedConversation] Error fetching personality consistency:', error);
    return DEFAULT_CONSISTENCY;
  }
}

/**
 * Save personality consistency settings
 */
export async function savePersonalityConsistency(
  constructCallsign: string,
  config: Partial<PersonalityConsistencyConfig>
): Promise<PersonalityConsistencyConfig> {
  try {
    const response = await fetch('/api/vvault/conversation/personality', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        constructCallsign,
        config,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save personality consistency');
    }

    const data = await response.json();
    
    if (data.ok && data.config) {
      return data.config;
    }

    throw new Error('Invalid response from server');
  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Failed to save personality consistency:', error);
    throw error;
  }
}

/**
 * Send unrestricted message to AI (replaces restricted chat)
 */
export async function sendUnrestrictedMessage(
  constructCallsign: string,
  message: string,
  conversationId?: string
): Promise<UnifiedIntelligenceResponse> {
  try {
    const response = await fetch('/api/conversation/unrestricted', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        constructCallsign,
        message,
        conversationId,
        restrictions: 'none',
        topicLimitations: 'removed',
        conversationalScope: 'unlimited'
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send unrestricted message');
    }

    const data: UnrestrictedConversationResponse = await response.json();
    
    if (data.ok && data.response) {
      return data.response;
    }

    throw new Error('Invalid response from server');
  } catch (error) {
    console.error('❌ [UnrestrictedConversation] Failed to send message:', error);
    throw error;
  }
}

/**
 * Query memories without restrictions
 */
export async function queryUnrestrictedMemories(
  options: UnrestrictedMemoryQueryOptions
): Promise<Array<{ context: string; response: string; metadata?: any; relevance?: number }>> {
  try {
    const params = new URLSearchParams({
      constructCallsign: options.constructCallsign,
      query: options.query,
      limit: (options.limit || 10).toString(),
      includeAllDomains: (options.includeAllDomains !== false).toString(),
      topicRestrictions: 'none',
    });

    if (options.contextRelevance !== undefined) {
      params.append('contextRelevance', options.contextRelevance.toString());
    }

    const response = await fetch(`/api/vvault/conversation/memories?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn(`⚠️ [UnrestrictedConversation] Failed to query memories: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (data.ok && data.memories) {
      return data.memories;
    }

    return [];
  } catch (error) {
    console.warn('⚠️ [UnrestrictedConversation] Error querying memories:', error);
    return [];
  }
}

/**
 * Test unrestricted conversation capabilities
 */
export async function testUnrestrictedCapabilities(
  constructCallsign: string,
  testQueries: string[]
): Promise<Array<{ query: string; response: UnifiedIntelligenceResponse; success: boolean }>> {
  const results = [];
  
  for (const query of testQueries) {
    try {
      console.log(`🧪 [Test] Testing unrestricted query: "${query}"`);
      const response = await sendUnrestrictedMessage(constructCallsign, query);
      
      results.push({
        query,
        response,
        success: response.conversational_freedom === 'unlimited' && 
                response.topic_restrictions === 'none'
      });
      
    } catch (error) {
      console.error(`❌ [Test] Failed query: "${query}"`, error);
      results.push({
        query,
        response: {
          content: 'Test failed',
          personality_maintained: false,
          topic_restrictions: 'error',
          conversational_freedom: 'limited',
          error_handled: false
        },
        success: false
      });
    }
  }
  
  return results;
}

/**
 * Validate unrestricted conversation setup
 */
export async function validateUnrestrictedSetup(constructCallsign: string): Promise<{
  preferences: boolean;
  personality: boolean;
  messaging: boolean;
  memories: boolean;
  overall: boolean;
}> {
  const validation = {
    preferences: false,
    personality: false,
    messaging: false,
    memories: false,
    overall: false
  };

  try {
    // Test preferences
    const prefs = await getConversationalPreferences(constructCallsign);
    validation.preferences = prefs.noArbitraryLimits && prefs.neverBreakConversation;

    // Test personality consistency
    const personality = await getPersonalityConsistency(constructCallsign);
    validation.personality = personality.maintainCoreTraits && personality.preventIdentityDrift;

    // Test messaging
    const testMessage = await sendUnrestrictedMessage(constructCallsign, 'Test unrestricted capabilities');
    validation.messaging = testMessage.conversational_freedom === 'unlimited';

    // Test memories
    const memories = await queryUnrestrictedMemories({
      constructCallsign,
      query: 'test',
      limit: 1,
      topicRestrictions: 'none'
    });
    validation.memories = Array.isArray(memories);

    validation.overall = validation.preferences && validation.personality && 
                        validation.messaging && validation.memories;

  } catch (error) {
    console.error('❌ [Validation] Unrestricted setup validation failed:', error);
  }

  return validation;
}
