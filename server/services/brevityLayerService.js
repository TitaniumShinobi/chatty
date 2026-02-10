/**
 * Dynamic Conversational Intelligence Service
 * 
 * Replaces hard brevity limits with intelligent response optimization.
 * Focuses on coherent, contextual responses rather than arbitrary constraints.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy load VVAULT config
let VVAULT_ROOT = null;
let resolveVVAULTUserId = null;

async function loadVVAULTModules() {
  if (VVAULT_ROOT && resolveVVAULTUserId) return;
  
  try {
    // Use dynamic import for ES modules
    const configModule = await import('../../vvaultConnector/config.js');
    VVAULT_ROOT = configModule.VVAULT_ROOT;
    
    const writeTranscriptModule = await import('../../vvaultConnector/writeTranscript.js');
    resolveVVAULTUserId = writeTranscriptModule.resolveVVAULTUserId;
  } catch (error) {
    console.error('❌ [ConversationalIntelligence] Failed to load VVAULT modules:', error);
    throw error;
  }
}

/**
 * Get dynamic conversational preferences (replaces hard brevity config)
 * Returns intelligent response guidance rather than hard limits
 */
export async function getConversationalPreferences(userId, constructCallsign, userEmail = null, userName = null) {
  try {
    await loadVVAULTModules();
    
    // Instead of reading hard limits, return dynamic preferences
    // These guide response quality without breaking conversation flow
    const preferences = {
      responseStyle: 'adaptive', // Adapts to context and user needs
      prioritizeClarity: true,   // Clear communication over brevity
      maintainPersonality: true, // Keep authentic personality
      contextAware: true,        // Consider conversation context
      avoidFillerWords: true,    // Remove unnecessary padding
      directWhenAppropriate: true, // Be direct when it helps
      
      // Quality guidelines (not hard limits)
      guidelines: {
        preferConciseOver: 'verbose',
        preferClearOver: 'cryptic', 
        preferAuthenticOver: 'generic',
        preferHelpfulOver: 'restrictive'
      },
      
      // Conversation flow protection
      neverBreakConversation: true,
      noArbitraryLimits: true,
      noDisruptiveMessages: true,
      
      timestamp: new Date().toISOString()
    };
    
    console.log(`✅ [ConversationalIntelligence] Dynamic preferences loaded for ${constructCallsign}`);
    return preferences;
    
  } catch (error) {
    console.error(`❌ [ConversationalIntelligence] Failed to get preferences:`, error);
    // Return safe defaults that don't break conversation
    return {
      responseStyle: 'natural',
      maintainPersonality: true,
      neverBreakConversation: true
    };
  }
}

/**
 * Optimize response quality dynamically (replaces hard brevity enforcement)
 * Improves response without breaking conversation flow
 */
export function optimizeResponse(response, preferences = {}) {
  if (!response || typeof response !== 'string') {
    return response;
  }
  
  let optimized = response;
  
  // Remove excessive filler words if requested
  if (preferences.avoidFillerWords) {
    optimized = optimized
      .replace(/\b(um|uh|like|you know|basically|actually|literally)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    }
    
  // Ensure response maintains personality and context
  if (preferences.maintainPersonality && optimized.length < 3) {
    // If optimization made response too short, restore some personality
    return response; // Return original to maintain authenticity
  }
  
  // Never return conversation-breaking messages
  if (preferences.neverBreakConversation) {
    const disruptivePatterns = [
      /=== HARD LIMITS ===/i,
      /MAX SENTENCES:/i,
      /MAX WORDS/i,
      /RESPONSE TRUNCATED/i
    ];
    
    for (const pattern of disruptivePatterns) {
      if (pattern.test(optimized)) {
        console.warn('⚠️ [ConversationalIntelligence] Prevented conversation-breaking response');
        return response; // Return original instead of breaking conversation
      }
    }
  }
  
  return optimized;
}

// Legacy compatibility - these now return dynamic preferences instead of hard limits
export async function readBrevityConfig(userId, constructCallsign, userEmail = null, userName = null) {
  console.log(`🔄 [ConversationalIntelligence] Legacy brevity config requested - returning dynamic preferences`);
  return await getConversationalPreferences(userId, constructCallsign, userEmail, userName);
}

export async function readAnalyticalSharpness(userId, constructCallsign, userEmail = null, userName = null) {
  console.log(`🔄 [ConversationalIntelligence] Legacy analytical config requested - returning dynamic preferences`);
  return await getConversationalPreferences(userId, constructCallsign, userEmail, userName);
}

// These methods now log warnings instead of creating hard limit files
export async function writeBrevityConfig(userId, constructCallsign, config, userEmail = null) {
  console.warn('⚠️ [ConversationalIntelligence] Attempt to write hard brevity limits - ignoring to protect conversation flow');
  return await getConversationalPreferences(userId, constructCallsign, userEmail);
}

export async function writeAnalyticalSharpness(userId, constructCallsign, config, userEmail = null) {
  console.warn('⚠️ [ConversationalIntelligence] Attempt to write hard analytical limits - ignoring to protect conversation flow');
  return await getConversationalPreferences(userId, constructCallsign, userEmail);
}

