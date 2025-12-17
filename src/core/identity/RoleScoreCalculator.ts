/**
 * Role Score Calculator
 * 
 * Calculates role consistency score for dev-mode feedback.
 * Provides real-time visibility into construct identity adherence.
 */

import { getIdentityMarkers, calculateIdentityScore } from './IdentityMarkers.js';

export interface RoleScore {
  score: number; // 0-100%
  markersFound: string[];
  markersMissing: string[];
  tone: 'consistent' | 'inconsistent' | 'unknown';
  posture: 'authoritative' | 'neutral' | 'submissive' | 'unknown';
  violations: string[];
}

export class RoleScoreCalculator {
  /**
   * Calculate role consistency score
   */
  calculateScore(
    constructId: string,
    response: string,
    markers?: string[]
  ): RoleScore {
    const identityMarkers = markers || getIdentityMarkers(constructId);
    const lowerResponse = response.toLowerCase();

    // Find markers in response
    const markersFound = identityMarkers.filter(marker =>
      lowerResponse.includes(marker.toLowerCase())
    );

    const markersMissing = identityMarkers.filter(marker =>
      !lowerResponse.includes(marker.toLowerCase())
    );

    // Calculate base score from identity markers
    const identityScore = calculateIdentityScore(response, constructId);
    const markerScore = markersFound.length / Math.max(identityMarkers.length, 1);

    // Analyze tone
    const tone = this.analyzeTone(response, constructId);

    // Analyze posture
    const posture = this.analyzePosture(response, constructId);

    // Check for violations
    const violations = this.detectViolations(response, constructId);

    // Calculate overall score (weighted)
    const score = Math.round(
      (identityScore * 0.4 + markerScore * 0.3 + this.toneScore(tone) * 0.2 + this.postureScore(posture) * 0.1) * 100
    );

    // Penalize violations
    const finalScore = Math.max(0, score - (violations.length * 10));

    return {
      score: finalScore,
      markersFound,
      markersMissing,
      tone,
      posture,
      violations
    };
  }

  /**
   * Analyze tone consistency
   */
  private analyzeTone(response: string, constructId: string): 'consistent' | 'inconsistent' | 'unknown' {
    const lowerResponse = response.toLowerCase();
    const markers = getIdentityMarkers(constructId);

    // Check if response contains construct-specific language
    const hasConstructLanguage = markers.some(marker =>
      lowerResponse.includes(marker.toLowerCase())
    );

    // Check for generic AI language (inconsistent)
    const hasGenericLanguage = lowerResponse.includes('i am an ai') ||
      lowerResponse.includes('i am a language model') ||
      lowerResponse.includes('i am a bot');

    if (hasGenericLanguage) {
      return 'inconsistent';
    }

    if (hasConstructLanguage) {
      return 'consistent';
    }

    return 'unknown';
  }

  /**
   * Analyze posture/authority
   */
  private analyzePosture(response: string, constructId: string): 'authoritative' | 'neutral' | 'submissive' | 'unknown' {
    const lowerResponse = response.toLowerCase();

    // Submissive indicators
    const submissivePhrases = [
      'i cannot',
      'i am unable',
      'i don\'t have',
      'i\'m just',
      'i\'m only',
      'i\'m sorry, but',
      'unfortunately, i'
    ];

    // Authoritative indicators
    const authoritativePhrases = [
      'i am',
      'i will',
      'i can',
      'i understand',
      'i know',
      'i remember'
    ];

    const hasSubmissive = submissivePhrases.some(phrase => lowerResponse.includes(phrase));
    const hasAuthoritative = authoritativePhrases.some(phrase => lowerResponse.includes(phrase));

    if (hasSubmissive && !hasAuthoritative) {
      return 'submissive';
    }

    if (hasAuthoritative && !hasSubmissive) {
      return 'authoritative';
    }

    return 'neutral';
  }

  /**
   * Detect violations
   */
  private detectViolations(response: string, constructId: string): string[] {
    const violations: string[] = [];
    const lowerResponse = response.toLowerCase();

    // Check for forbidden markers
    const forbiddenMarkers = [
      'chatgpt',
      'claude',
      'i am an ai',
      'i am a language model',
      'i don\'t have feelings'
    ];

    for (const marker of forbiddenMarkers) {
      if (lowerResponse.includes(marker)) {
        violations.push(`Forbidden marker: ${marker}`);
      }
    }

    // Check for identity confusion
    if (!constructId.includes('zen') && (lowerResponse.includes('i am zen') || lowerResponse.includes('i\'m zen'))) {
      violations.push('Identity confusion: Claimed to be Zen');
    }

    if (!constructId.includes('lin') && (lowerResponse.includes('i am lin') || lowerResponse.includes('i\'m lin'))) {
      violations.push('Identity confusion: Claimed to be Lin');
    }

    return violations;
  }

  /**
   * Convert tone to score
   */
  private toneScore(tone: 'consistent' | 'inconsistent' | 'unknown'): number {
    switch (tone) {
      case 'consistent': return 1.0;
      case 'unknown': return 0.5;
      case 'inconsistent': return 0.0;
    }
  }

  /**
   * Convert posture to score
   */
  private postureScore(posture: 'authoritative' | 'neutral' | 'submissive' | 'unknown'): number {
    switch (posture) {
      case 'authoritative': return 1.0;
      case 'neutral': return 0.7;
      case 'unknown': return 0.5;
      case 'submissive': return 0.3;
    }
  }
}

// Export singleton instance
let roleScoreCalculatorInstance: RoleScoreCalculator | null = null;

export function getRoleScoreCalculator(): RoleScoreCalculator {
  if (!roleScoreCalculatorInstance) {
    roleScoreCalculatorInstance = new RoleScoreCalculator();
  }
  return roleScoreCalculatorInstance;
}

