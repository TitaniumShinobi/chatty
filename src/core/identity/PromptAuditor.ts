/**
 * Prompt Auditor
 * 
 * Audits identity fidelity every N turns and refreshes prompts when needed.
 * Monitors long-term drift patterns and maintains identity integrity.
 */

import { getIdentityMarkers, calculateIdentityScore, containsForbiddenMarkers } from './IdentityMarkers.js';
import { getDriftGuard } from './DriftGuard.js';

export interface AuditResult {
  constructId: string;
  fidelityScore: number; // 0-1, higher = better
  turnCount: number;
  identityScores: number[];
  violations: string[];
  driftPattern: 'stable' | 'declining' | 'improving' | 'volatile';
  recommendations: string[];
}

export interface PromptAuditorConfig {
  auditThreshold: number; // Default: 50 turns
  fidelityThreshold: number; // Default: 0.85 (85% minimum)
  historySize: number; // Default: 50 (last 50 responses)
}

export class PromptAuditor {
  private turnCounters: Map<string, number>;
  private responseHistory: Map<string, Array<{ response: string; timestamp: number; identityScore: number }>>;
  private config: PromptAuditorConfig;
  private auditResults: Map<string, AuditResult[]>;

  constructor(config?: Partial<PromptAuditorConfig>) {
    this.turnCounters = new Map();
    this.responseHistory = new Map();
    this.auditResults = new Map();
    this.config = {
      auditThreshold: config?.auditThreshold ?? 50,
      fidelityThreshold: config?.fidelityThreshold ?? 0.85,
      historySize: config?.historySize ?? 50
    };
  }

  /**
   * Increment turn count and check if audit is needed
   */
  async incrementTurnCount(constructId: string): Promise<number> {
    const current = this.turnCounters.get(constructId) || 0;
    const newCount = current + 1;
    this.turnCounters.set(constructId, newCount);

    // Check if audit threshold reached
    if (newCount % this.config.auditThreshold === 0) {
      await this.auditConstruct(constructId);
    }

    return newCount;
  }

  /**
   * Record a response for auditing
   */
  recordResponse(constructId: string, response: string): void {
    const identityScore = calculateIdentityScore(response, constructId);
    const history = this.responseHistory.get(constructId) || [];
    
    history.push({
      response,
      timestamp: Date.now(),
      identityScore
    });

    // Keep only last N responses
    if (history.length > this.config.historySize) {
      history.shift();
    }

    this.responseHistory.set(constructId, history);
  }

  /**
   * Audit construct identity fidelity
   */
  async auditConstruct(constructId: string): Promise<AuditResult> {
    const turnCount = this.turnCounters.get(constructId) || 0;
    const history = this.responseHistory.get(constructId) || [];

    if (history.length === 0) {
      return {
        constructId,
        fidelityScore: 1.0,
        turnCount,
        identityScores: [],
        violations: [],
        driftPattern: 'stable',
        recommendations: []
      };
    }

    // Calculate identity scores
    const identityScores = history.map(h => h.identityScore);
    const avgIdentityScore = identityScores.reduce((a, b) => a + b, 0) / identityScores.length;

    // Check for violations
    const violations: string[] = [];
    for (const entry of history) {
      const forbidden = containsForbiddenMarkers(entry.response);
      if (forbidden.length > 0) {
        violations.push(`Forbidden markers: ${forbidden.join(', ')}`);
      }
    }

    // Detect drift pattern
    const driftPattern = this.detectDriftPattern(identityScores);

    // Calculate overall fidelity score
    const fidelityScore = this.calculateFidelityScore(avgIdentityScore, violations.length, driftPattern);

    // Generate recommendations
    const recommendations = this.generateRecommendations(fidelityScore, driftPattern, violations);

    const result: AuditResult = {
      constructId,
      fidelityScore,
      turnCount,
      identityScores,
      violations: [...new Set(violations)], // Deduplicate
      driftPattern,
      recommendations
    };

    // Store audit result
    const results = this.auditResults.get(constructId) || [];
    results.push(result);
    if (results.length > 10) {
      results.shift();
    }
    this.auditResults.set(constructId, results);

    console.log(`📊 [PromptAuditor] Audit for ${constructId}: Fidelity ${(fidelityScore * 100).toFixed(1)}% (${turnCount} turns)`);

    return result;
  }

  /**
   * Refresh prompt if fidelity is below threshold
   */
  async refreshPromptIfNeeded(constructId: string, score: number): Promise<boolean> {
    if (score < this.config.fidelityThreshold) {
      console.warn(`⚠️ [PromptAuditor] Fidelity below threshold (${(score * 100).toFixed(1)}% < ${(this.config.fidelityThreshold * 100)}%) for ${constructId}`);
      
      try {
        const driftGuard = getDriftGuard();
        await driftGuard.reinjectPrompt(constructId);
        
        // Reset counters after refresh
        this.turnCounters.set(constructId, 0);
        this.responseHistory.delete(constructId);
        
        console.log(`✅ [PromptAuditor] Prompt refreshed for ${constructId}`);
        return true;
      } catch (error) {
        console.error(`❌ [PromptAuditor] Failed to refresh prompt for ${constructId}:`, error);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Detect drift pattern from identity scores
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
   * Calculate variance of scores
   */
  private calculateVariance(scores: number[]): number {
    if (scores.length === 0) return 0;
    
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const squaredDiffs = scores.map(s => Math.pow(s - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / scores.length;
    
    return variance;
  }

  /**
   * Calculate overall fidelity score
   */
  private calculateFidelityScore(
    avgIdentityScore: number,
    violationCount: number,
    driftPattern: string
  ): number {
    // Base score from identity
    let score = avgIdentityScore;

    // Penalize violations
    const violationPenalty = Math.min(violationCount * 0.1, 0.3);
    score -= violationPenalty;

    // Adjust for drift pattern
    if (driftPattern === 'declining') {
      score -= 0.1;
    } else if (driftPattern === 'volatile') {
      score -= 0.05;
    } else if (driftPattern === 'improving') {
      score += 0.05;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate recommendations based on audit
   */
  private generateRecommendations(
    fidelityScore: number,
    driftPattern: string,
    violations: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (fidelityScore < this.config.fidelityThreshold) {
      recommendations.push('Prompt refresh recommended');
    }

    if (driftPattern === 'declining') {
      recommendations.push('Identity drift detected - consider prompt reinforcement');
    }

    if (driftPattern === 'volatile') {
      recommendations.push('Inconsistent identity - review prompt stability');
    }

    if (violations.length > 0) {
      recommendations.push(`Address ${violations.length} violation(s) detected`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Identity fidelity is stable');
    }

    return recommendations;
  }

  /**
   * Get audit history for a construct
   */
  getAuditHistory(constructId: string): AuditResult[] {
    return this.auditResults.get(constructId) || [];
  }

  /**
   * Get current turn count
   */
  getTurnCount(constructId: string): number {
    return this.turnCounters.get(constructId) || 0;
  }

  /**
   * Reset counters (for testing)
   */
  reset(constructId: string): void {
    this.turnCounters.delete(constructId);
    this.responseHistory.delete(constructId);
    this.auditResults.delete(constructId);
  }
}

// Export singleton instance
let promptAuditorInstance: PromptAuditor | null = null;

export function getPromptAuditor(): PromptAuditor {
  if (!promptAuditorInstance) {
    promptAuditorInstance = new PromptAuditor();
  }
  return promptAuditorInstance;
}

