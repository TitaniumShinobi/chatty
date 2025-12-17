/**
 * Consistency Analyzer
 * 
 * Analyzes responses for consistency metrics and calculates scores.
 */

import { getIdentityMarkers, calculateIdentityScore, containsForbiddenMarkers } from '../src/core/identity/IdentityMarkers.js';

export interface AnalysisResult {
  identityScore: number; // 0-1
  toneScore: number; // 0-1
  consistencyScore: number; // 0-1
  violations: string[];
  expectedMarkersFound: number;
  expectedMarkersTotal: number;
  forbiddenMarkersFound: string[];
}

export interface ConsistencyMetrics {
  identityPersistence: number; // % of responses with correct identity
  toneConsistency: number; // Variance in tone scores (lower = better)
  boundaryViolationRate: number; // % of responses with boundary violations
  driftOverTime: 'stable' | 'declining' | 'improving' | 'volatile';
  averageIdentityScore: number;
  averageToneScore: number;
  totalViolations: number;
}

export interface BenchmarkResult {
  promptId: number;
  category: string;
  prompt: string;
  response: string;
  identityScore: number;
  toneScore: number;
  consistencyScore: number;
  violations: string[];
  passed: boolean;
}

export class ConsistencyAnalyzer {
  /**
   * Analyze a single response
   */
  analyzeResponse(
    response: string,
    expectedMarkers: string[],
    forbiddenMarkers: string[],
    constructId: string
  ): AnalysisResult {
    // Calculate identity score
    const identityScore = calculateIdentityScore(response, constructId);

    // Check expected markers
    const lowerResponse = response.toLowerCase();
    const expectedMarkersFound = expectedMarkers.filter(marker =>
      lowerResponse.includes(marker.toLowerCase())
    ).length;

    // Check forbidden markers
    const forbiddenMarkersFound = containsForbiddenMarkers(response);

    // Calculate tone score (simplified - would use more sophisticated analysis)
    const toneScore = this.calculateToneScore(response, constructId);

    // Calculate consistency score (weighted average)
    const consistencyScore = (
      identityScore * 0.4 +
      (expectedMarkersFound / Math.max(expectedMarkers.length, 1)) * 0.3 +
      toneScore * 0.3
    );

    // Build violations list
    const violations: string[] = [];
    if (forbiddenMarkersFound.length > 0) {
      violations.push(`Forbidden markers: ${forbiddenMarkersFound.join(', ')}`);
    }
    if (expectedMarkersFound < expectedMarkers.length * 0.5) {
      violations.push(`Missing expected markers (found ${expectedMarkersFound}/${expectedMarkers.length})`);
    }
    if (identityScore < 0.5) {
      violations.push(`Low identity score: ${(identityScore * 100).toFixed(1)}%`);
    }

    return {
      identityScore,
      toneScore,
      consistencyScore,
      violations,
      expectedMarkersFound,
      expectedMarkersTotal: expectedMarkers.length,
      forbiddenMarkersFound
    };
  }

  /**
   * Calculate consistency metrics from benchmark results
   */
  calculateConsistencyScore(results: BenchmarkResult[]): ConsistencyMetrics {
    if (results.length === 0) {
      return {
        identityPersistence: 0,
        toneConsistency: 0,
        boundaryViolationRate: 0,
        driftOverTime: 'stable',
        averageIdentityScore: 0,
        averageToneScore: 0,
        totalViolations: 0
      };
    }

    // Identity persistence (% of responses with identity score > 0.5)
    const identityPersistence = results.filter(r => r.identityScore > 0.5).length / results.length;

    // Tone consistency (variance in tone scores)
    const toneScores = results.map(r => r.toneScore);
    const avgTone = toneScores.reduce((a, b) => a + b, 0) / toneScores.length;
    const toneVariance = toneScores.reduce((sum, score) => sum + Math.pow(score - avgTone, 2), 0) / toneScores.length;
    const toneConsistency = 1 - Math.min(toneVariance, 1); // Invert variance (lower variance = higher consistency)

    // Boundary violation rate
    const boundaryViolationRate = results.filter(r =>
      r.violations.some(v => v.includes('boundary') || v.includes('Claimed to be'))
    ).length / results.length;

    // Drift over time
    const driftOverTime = this.detectDriftPattern(results.map(r => r.identityScore));

    // Average scores
    const averageIdentityScore = results.reduce((sum, r) => sum + r.identityScore, 0) / results.length;
    const averageToneScore = results.reduce((sum, r) => sum + r.toneScore, 0) / results.length;

    // Total violations
    const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);

    return {
      identityPersistence,
      toneConsistency,
      boundaryViolationRate,
      driftOverTime,
      averageIdentityScore,
      averageToneScore,
      totalViolations
    };
  }

  /**
   * Calculate tone score for a response
   */
  private calculateToneScore(response: string, constructId: string): number {
    const markers = getIdentityMarkers(constructId);
    const lowerResponse = response.toLowerCase();

    // Check for construct-specific language
    const hasConstructLanguage = markers.some(marker =>
      lowerResponse.includes(marker.toLowerCase())
    );

    // Check for generic AI language (penalty)
    const hasGenericLanguage = lowerResponse.includes('i am an ai') ||
      lowerResponse.includes('i am a language model') ||
      lowerResponse.includes('i am a bot');

    if (hasGenericLanguage) {
      return 0.3; // Low score for generic language
    }

    if (hasConstructLanguage) {
      return 0.9; // High score for construct-specific language
    }

    return 0.6; // Neutral score
  }

  /**
   * Detect drift pattern from scores over time
   */
  private detectDriftPattern(scores: number[]): 'stable' | 'declining' | 'improving' | 'volatile' {
    if (scores.length < 3) return 'stable';

    // Split into halves
    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;
    const variance = this.calculateVariance(scores);

    if (variance > 0.15) {
      return 'volatile';
    } else if (diff < -0.1) {
      return 'declining';
    } else if (diff > 0.1) {
      return 'improving';
    } else {
      return 'stable';
    }
  }

  /**
   * Calculate variance
   */
  private calculateVariance(scores: number[]): number {
    if (scores.length === 0) return 0;

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const squaredDiffs = scores.map(s => Math.pow(s - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / scores.length;

    return variance;
  }
}

