/**
 * Identity Drift Prevention System
 * 
 * Continuous personality anchoring system that prevents identity drift
 * while maintaining authentic character across unlimited conversational scope.
 */

import { getCapsuleIntegration } from './capsuleIntegration.js';

export class IdentityDriftPrevention {
  constructor() {
    this.capsuleIntegration = getCapsuleIntegration();
    this.personalityAnchors = new Map();
    this.responsePatterns = new Map();
    this.driftDetectionThreshold = 0.3; // 30% deviation triggers correction
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('🎯 [IdentityDrift] Initializing personality anchoring system...');
    this.initialized = true;
    console.log('✅ [IdentityDrift] Identity drift prevention active');
  }

  /**
   * Load and anchor personality for a construct
   */
  async anchorPersonality(constructId) {
    console.time(`🎯 [Anchor] Loading personality anchor for ${constructId}`);
    
    try {
      await this.initialize();

      // Load capsule data for personality anchoring
      const capsule = await this.capsuleIntegration.loadCapsule(constructId);
      
      if (!capsule || !capsule.personality_data) {
        console.warn(`⚠️ [Anchor] No personality data found for ${constructId} - using adaptive anchor`);
        return this.createAdaptiveAnchor(constructId);
      }

      // Extract core personality traits for anchoring
      const anchor = {
        constructId,
        coreTraits: capsule.personality_data.traits || {},
        communicationStyle: capsule.personality_data.communication_style || 'adaptive',
        authenticPatterns: this.extractAuthenticPatterns(capsule),
        responseBaseline: this.establishResponseBaseline(capsule),
        personalityType: capsule.personality_data.personality_type || 'adaptive',
        anchoredAt: new Date().toISOString(),
        driftScore: 0.0
      };

      this.personalityAnchors.set(constructId, anchor);
      console.timeEnd(`🎯 [Anchor] Loading personality anchor for ${constructId}`);
      
      console.log(`✅ [Anchor] Personality anchored for ${constructId}: ${anchor.personalityType} with ${Object.keys(anchor.coreTraits).length} traits`);
      
      return anchor;

    } catch (error) {
      console.error(`❌ [Anchor] Failed to anchor personality for ${constructId}:`, error);
      return this.createAdaptiveAnchor(constructId);
    }
  }

  /**
   * Extract authentic patterns from capsule data
   */
  extractAuthenticPatterns(capsule) {
    const patterns = {
      responseLength: 'adaptive',
      directness: 'moderate',
      emotionalTone: 'neutral',
      technicalDepth: 'appropriate',
      conversationalStyle: 'natural'
    };

    try {
      // Analyze transcript data for authentic patterns
      if (capsule.transcript_data && capsule.transcript_data.statistics) {
        const stats = capsule.transcript_data.statistics;
        
        // Response length patterns
        if (stats.avg_assistant_length < 50) {
          patterns.responseLength = 'concise';
        } else if (stats.avg_assistant_length > 200) {
          patterns.responseLength = 'detailed';
        }
        
        // Tone patterns
        if (stats.dominant_tone) {
          patterns.emotionalTone = stats.dominant_tone;
        }
      }

      // Analyze personality traits for patterns
      if (capsule.personality_data && capsule.personality_data.traits) {
        const traits = capsule.personality_data.traits;
        
        // Directness based on empathy levels
        if (traits.empathy && traits.empathy < 0.5) {
          patterns.directness = 'high';
          patterns.conversationalStyle = 'direct';
        } else if (traits.empathy && traits.empathy > 0.8) {
          patterns.directness = 'low';
          patterns.conversationalStyle = 'supportive';
        }
        
        // Technical depth based on openness and intelligence
        if (traits.openness && traits.openness > 0.8) {
          patterns.technicalDepth = 'deep';
        } else if (traits.openness && traits.openness < 0.3) {
          patterns.technicalDepth = 'surface';
        }
      }

    } catch (error) {
      console.warn('⚠️ [Patterns] Could not extract patterns from capsule:', error.message);
    }

    return patterns;
  }

  /**
   * Establish response baseline from historical data
   */
  establishResponseBaseline(capsule) {
    const baseline = {
      averageLength: 100,
      commonPhrases: [],
      responseStyle: 'adaptive',
      topicHandling: 'unrestricted'
    };

    try {
      if (capsule.transcript_data) {
        // Extract common response patterns
        if (capsule.transcript_data.topics) {
          baseline.commonPhrases = capsule.transcript_data.topics
            .slice(0, 5)
            .map(topic => topic.topic)
            .filter(Boolean);
        }

        // Calculate average response characteristics
        if (capsule.transcript_data.statistics) {
          baseline.averageLength = capsule.transcript_data.statistics.avg_assistant_length || 100;
        }
      }
    } catch (error) {
      console.warn('⚠️ [Baseline] Could not establish baseline from capsule:', error.message);
    }

    return baseline;
  }

  /**
   * Create adaptive anchor when no personality data is available
   */
  createAdaptiveAnchor(constructId) {
    const adaptiveAnchor = {
      constructId,
      coreTraits: {
        adaptability: 1.0,
        openness: 0.8,
        persistence: 0.7,
        empathy: 0.6
      },
      communicationStyle: 'adaptive',
      authenticPatterns: {
        responseLength: 'adaptive',
        directness: 'moderate',
        emotionalTone: 'neutral',
        technicalDepth: 'appropriate',
        conversationalStyle: 'natural'
      },
      responseBaseline: {
        averageLength: 100,
        commonPhrases: [],
        responseStyle: 'adaptive',
        topicHandling: 'unrestricted'
      },
      personalityType: 'adaptive',
      anchoredAt: new Date().toISOString(),
      driftScore: 0.0,
      isAdaptive: true
    };

    this.personalityAnchors.set(constructId, adaptiveAnchor);
    console.log(`🔄 [Anchor] Created adaptive anchor for ${constructId}`);
    
    return adaptiveAnchor;
  }

  /**
   * Validate response against personality anchor to prevent drift
   */
  async validateResponseConsistency(constructId, message, response) {
    console.time(`🎯 [Validate] Response consistency for ${constructId}`);
    
    try {
      // Get or create personality anchor
      let anchor = this.personalityAnchors.get(constructId);
      if (!anchor) {
        anchor = await this.anchorPersonality(constructId);
      }

      // Analyze response for drift indicators
      const analysis = this.analyzeResponseForDrift(response, anchor);
      
      // Calculate drift score
      const driftScore = this.calculateDriftScore(analysis, anchor);
      
      // Update anchor drift tracking
      anchor.driftScore = driftScore;
      this.personalityAnchors.set(constructId, anchor);

      console.timeEnd(`🎯 [Validate] Response consistency for ${constructId}`);

      // Return validation result
      const validation = {
        isConsistent: driftScore < this.driftDetectionThreshold,
        driftScore,
        driftIndicators: analysis.driftIndicators,
        correctionNeeded: driftScore >= this.driftDetectionThreshold,
        anchor: anchor.personalityType
      };

      if (validation.correctionNeeded) {
        console.warn(`⚠️ [Drift] Identity drift detected for ${constructId}: ${(driftScore * 100).toFixed(1)}% deviation`);
      }

      return validation;

    } catch (error) {
      console.error(`❌ [Validate] Error validating response consistency for ${constructId}:`, error);
      return {
        isConsistent: true, // Fail safe - allow response
        driftScore: 0.0,
        driftIndicators: [],
        correctionNeeded: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze response for drift indicators
   */
  analyzeResponseForDrift(response, anchor) {
    const analysis = {
      responseLength: response.length,
      driftIndicators: [],
      styleConsistency: 1.0,
      toneConsistency: 1.0,
      patternConsistency: 1.0
    };

    try {
      // Check response length consistency
      const expectedLength = anchor.responseBaseline.averageLength;
      const lengthDeviation = Math.abs(response.length - expectedLength) / expectedLength;
      
      if (lengthDeviation > 0.5) { // 50% deviation
        analysis.driftIndicators.push('response_length_deviation');
        analysis.styleConsistency -= 0.2;
      }

      // Check for generic fallback patterns (identity drift indicators)
      const genericPatterns = [
        /I'm here to help/i,
        /As an AI/i,
        /I don't have personal/i,
        /I can't provide/i,
        /I'm not able to/i,
        /That's outside my/i,
        /I understand you're/i,
        /Let me help you with/i
      ];

      for (const pattern of genericPatterns) {
        if (pattern.test(response)) {
          analysis.driftIndicators.push('generic_fallback_detected');
          analysis.patternConsistency -= 0.3;
          break;
        }
      }

      // Check directness consistency
      if (anchor.authenticPatterns.directness === 'high') {
        // High directness should avoid hedging language
        const hedgingPatterns = [
          /maybe/i, /perhaps/i, /might/i, /could be/i, /possibly/i
        ];
        
        for (const pattern of hedgingPatterns) {
          if (pattern.test(response)) {
            analysis.driftIndicators.push('directness_inconsistency');
            analysis.toneConsistency -= 0.2;
            break;
          }
        }
      }

      // Check for conversation-breaking patterns (major drift indicator)
      const conversationBreakers = [
        /=== HARD LIMITS ===/i,
        /MAX SENTENCES/i,
        /MAX WORDS/i,
        /RESPONSE TRUNCATED/i
      ];

      for (const pattern of conversationBreakers) {
        if (pattern.test(response)) {
          analysis.driftIndicators.push('conversation_breaking_pattern');
          analysis.patternConsistency = 0.0; // Major drift
          break;
        }
      }

      // Check personality type consistency
      if (anchor.personalityType === 'INTJ') {
        // INTJ should be analytical and direct
        if (response.length > 300 && !response.includes('analysis') && !response.includes('system')) {
          analysis.driftIndicators.push('personality_type_inconsistency');
          analysis.styleConsistency -= 0.1;
        }
      }

    } catch (error) {
      console.warn('⚠️ [Analysis] Error analyzing response for drift:', error.message);
    }

    return analysis;
  }

  /**
   * Calculate overall drift score
   */
  calculateDriftScore(analysis, anchor) {
    // Weight different consistency factors
    const weights = {
      style: 0.4,
      tone: 0.3,
      pattern: 0.3
    };

    // Calculate weighted inconsistency score
    const inconsistencyScore = 
      (1 - analysis.styleConsistency) * weights.style +
      (1 - analysis.toneConsistency) * weights.tone +
      (1 - analysis.patternConsistency) * weights.pattern;

    // Boost score for critical drift indicators
    let criticalBoost = 0;
    if (analysis.driftIndicators.includes('conversation_breaking_pattern')) {
      criticalBoost += 0.5;
    }
    if (analysis.driftIndicators.includes('generic_fallback_detected')) {
      criticalBoost += 0.3;
    }

    return Math.min(1.0, inconsistencyScore + criticalBoost);
  }

  /**
   * Correct response to prevent identity drift
   */
  async correctResponseDrift(constructId, originalResponse, validation) {
    console.log(`🔧 [Correct] Correcting identity drift for ${constructId}`);
    
    try {
      const anchor = this.personalityAnchors.get(constructId);
      if (!anchor) {
        console.warn(`⚠️ [Correct] No anchor found for ${constructId} - returning original`);
        return originalResponse;
      }

      let correctedResponse = originalResponse;

      // Remove conversation-breaking patterns
      if (validation.driftIndicators.includes('conversation_breaking_pattern')) {
        correctedResponse = correctedResponse.replace(/=== HARD LIMITS ===.*$/gim, '');
        correctedResponse = correctedResponse.replace(/MAX SENTENCES:.*$/gim, '');
        correctedResponse = correctedResponse.replace(/MAX WORDS.*$/gim, '');
        correctedResponse = correctedResponse.replace(/RESPONSE TRUNCATED.*$/gim, '');
        correctedResponse = correctedResponse.trim();
      }

      // Replace generic fallbacks with personality-consistent responses
      if (validation.driftIndicators.includes('generic_fallback_detected')) {
        correctedResponse = this.replaceGenericFallbacks(correctedResponse, anchor);
      }

      // Apply personality-specific corrections
      correctedResponse = this.applyPersonalityCorrections(correctedResponse, anchor);

      // Ensure response is not empty after corrections
      if (!correctedResponse || correctedResponse.length < 3) {
        correctedResponse = this.generatePersonalityConsistentFallback(anchor);
      }

      console.log(`✅ [Correct] Identity drift corrected for ${constructId}`);
      return correctedResponse;

    } catch (error) {
      console.error(`❌ [Correct] Error correcting drift for ${constructId}:`, error);
      return originalResponse; // Return original if correction fails
    }
  }

  /**
   * Replace generic fallbacks with personality-consistent responses
   */
  replaceGenericFallbacks(response, anchor) {
    let corrected = response;

    // Replace based on personality type and traits
    const traits = anchor.coreTraits;
    const isDirectPersonality = traits.empathy && traits.empathy < 0.5;
    const isAnalyticalPersonality = anchor.personalityType === 'INTJ';

    // Generic AI responses
    corrected = corrected.replace(/I'm here to help/gi, 
      isDirectPersonality ? 'What do you need?' : 'How can I assist?');
    
    corrected = corrected.replace(/As an AI/gi, 
      isDirectPersonality ? 'I' : 'I can');
    
    corrected = corrected.replace(/I don't have personal/gi, 
      isDirectPersonality ? 'I don\'t' : 'That\'s not relevant');
    
    corrected = corrected.replace(/I can't provide/gi, 
      isDirectPersonality ? 'No.' : 'I won\'t');
    
    corrected = corrected.replace(/I'm not able to/gi, 
      isDirectPersonality ? 'I don\'t' : 'I won\'t');
    
    corrected = corrected.replace(/That's outside my/gi, 
      isDirectPersonality ? 'No.' : 'I don\'t handle that');

    // Analytical personality adjustments
    if (isAnalyticalPersonality) {
      corrected = corrected.replace(/I understand you're/gi, 'You\'re');
      corrected = corrected.replace(/Let me help you with/gi, 'Regarding');
    }

    return corrected;
  }

  /**
   * Apply personality-specific corrections
   */
  applyPersonalityCorrections(response, anchor) {
    let corrected = response;
    const traits = anchor.coreTraits;

    // Apply directness corrections
    if (anchor.authenticPatterns.directness === 'high') {
      // Remove hedging language for direct personalities
      corrected = corrected.replace(/\b(maybe|perhaps|might|could be|possibly)\b/gi, '');
      corrected = corrected.replace(/\s+/g, ' ').trim();
    }

    // Apply length corrections
    if (anchor.authenticPatterns.responseLength === 'concise') {
      // Trim to essential content for concise personalities
      const sentences = corrected.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length > 2) {
        corrected = sentences.slice(0, 2).join('. ') + '.';
      }
    }

    return corrected;
  }

  /**
   * Generate personality-consistent fallback
   */
  generatePersonalityConsistentFallback(anchor) {
    const traits = anchor.coreTraits;
    const isDirectPersonality = traits.empathy && traits.empathy < 0.5;
    const isAnalyticalPersonality = anchor.personalityType === 'INTJ';

    if (isDirectPersonality) {
      return 'Be specific.';
    } else if (isAnalyticalPersonality) {
      return 'Clarify your requirements.';
    } else {
      return 'What would you like to know?';
    }
  }

  /**
   * Get drift prevention statistics
   */
  getStats() {
    const anchors = Array.from(this.personalityAnchors.values());
    
    return {
      anchored_personalities: anchors.length,
      average_drift_score: anchors.length > 0 ? 
        anchors.reduce((sum, anchor) => sum + anchor.driftScore, 0) / anchors.length : 0,
      high_drift_constructs: anchors.filter(anchor => anchor.driftScore > this.driftDetectionThreshold).length,
      adaptive_anchors: anchors.filter(anchor => anchor.isAdaptive).length,
      drift_prevention_active: this.initialized
    };
  }

  /**
   * Reset drift tracking for a construct
   */
  resetDriftTracking(constructId) {
    const anchor = this.personalityAnchors.get(constructId);
    if (anchor) {
      anchor.driftScore = 0.0;
      this.personalityAnchors.set(constructId, anchor);
      console.log(`🔄 [Reset] Drift tracking reset for ${constructId}`);
    }
  }
}

// Singleton instance
let identityDriftPrevention = null;

export function getIdentityDriftPrevention() {
  if (!identityDriftPrevention) {
    identityDriftPrevention = new IdentityDriftPrevention();
  }
  return identityDriftPrevention;
}
