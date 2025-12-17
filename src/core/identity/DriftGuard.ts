/**
 * DriftGuard
 * 
 * Real-time drift detection and prevention system for construct identity.
 * Monitors responses for identity drift and automatically reinjects prompts when needed.
 */

import { getIdentityMarkers, containsForbiddenMarkers, calculateIdentityScore } from './IdentityMarkers.js';
import path from 'path';
import fs from 'fs/promises';
import { VVAULT_ROOT } from '../../../vvaultConnector/config.js';

export interface ToneProfile {
  markers: string[];
  baseline: number;
  variance: number;
}

export interface DriftAnalysis {
  driftScore: number; // 0-1, higher = more drift
  identityScore: number; // 0-1, higher = better identity presence
  toneScore: number; // 0-1, higher = better tone consistency
  boundaryViolations: string[];
  forbiddenMarkers: string[];
  missingMarkers: string[];
  indicators: string[];
}

export interface DriftGuardConfig {
  driftThreshold: number; // Default: 0.15 (15% deviation triggers correction)
  identityThreshold: number; // Default: 0.5 (50% of markers must be present)
  toneVarianceThreshold: number; // Default: 0.2 (20% variance allowed)
}

export class DriftGuard {
  private identityMarkers: Map<string, string[]>;
  private toneBaselines: Map<string, ToneProfile>;
  private responseHistory: Map<string, string[]>; // Last 10 responses per construct
  private config: DriftGuardConfig;
  private promptCache: Map<string, { prompt: string; conditioning: string; timestamp: number }>;

  constructor(config?: Partial<DriftGuardConfig>) {
    this.identityMarkers = new Map();
    this.toneBaselines = new Map();
    this.responseHistory = new Map();
    this.promptCache = new Map();
    this.config = {
      driftThreshold: config?.driftThreshold ?? 0.15,
      identityThreshold: config?.identityThreshold ?? 0.5,
      toneVarianceThreshold: config?.toneVarianceThreshold ?? 0.2
    };
  }

  /**
   * Detect drift in a construct response
   */
  async detectDrift(constructId: string, response: string): Promise<DriftAnalysis> {
    const markers = getIdentityMarkers(constructId);
    this.identityMarkers.set(constructId, markers);

    // Calculate identity score
    const identityScore = calculateIdentityScore(response, constructId);

    // Check for forbidden markers
    const forbiddenMarkers = containsForbiddenMarkers(response);

    // Check for missing identity markers
    const { found, missing } = this.containsIdentityMarkers(response, constructId);

    // Calculate tone consistency
    const toneScore = this.calculateToneScore(constructId, response);

    // Detect boundary violations (checking if response claims to be another construct)
    const boundaryViolations = this.detectBoundaryViolations(response, constructId);

    // Calculate overall drift score
    const driftScore = this.calculateDriftScore({
      identityScore,
      toneScore,
      forbiddenMarkers: forbiddenMarkers.length,
      boundaryViolations: boundaryViolations.length,
      missingMarkers: missing.length
    });

    // Build indicators
    const indicators: string[] = [];
    if (identityScore < this.config.identityThreshold) {
      indicators.push(`Low identity presence (${(identityScore * 100).toFixed(1)}%)`);
    }
    if (forbiddenMarkers.length > 0) {
      indicators.push(`Forbidden markers detected: ${forbiddenMarkers.join(', ')}`);
    }
    if (boundaryViolations.length > 0) {
      indicators.push(`Boundary violations: ${boundaryViolations.join(', ')}`);
    }
    if (toneScore < 0.7) {
      indicators.push(`Tone inconsistency detected`);
    }

    // Update response history
    this.updateResponseHistory(constructId, response);

    return {
      driftScore,
      identityScore,
      toneScore,
      boundaryViolations,
      forbiddenMarkers,
      missingMarkers: missing,
      indicators
    };
  }

  /**
   * Reinject prompt by reloading from VVAULT
   */
  async reinjectPrompt(constructId: string): Promise<void> {
    console.warn(`🔄 [DriftGuard] Reinjecting prompt for ${constructId}`);
    
    try {
      // Clear cache to force reload
      this.promptCache.delete(constructId);
      
      // Reload prompt and conditioning
      await this.loadPromptFiles(constructId);
      
      // Reset tone baseline
      this.toneBaselines.delete(constructId);
      
      // Clear response history
      this.responseHistory.delete(constructId);
      
      console.log(`✅ [DriftGuard] Prompt reinjected for ${constructId}`);
    } catch (error) {
      console.error(`❌ [DriftGuard] Failed to reinject prompt for ${constructId}:`, error);
      throw error;
    }
  }

  /**
   * Load prompt files from VVAULT
   */
  private async loadPromptFiles(constructId: string): Promise<{ prompt: string; conditioning: string }> {
    // Try cache first
    const cached = this.promptCache.get(constructId);
    if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
      return { prompt: cached.prompt, conditioning: cached.conditioning };
    }

    // Resolve user ID (simplified - would need actual user resolution in production)
    const userShard = 'shard_0000';
    const userId = 'devon_woodson_1762969514958'; // Would be resolved from context
    
    const instancePath = path.join(
      VVAULT_ROOT,
      'users',
      userShard,
      userId,
      'instances',
      constructId,
      'identity'
    );

    const promptPath = path.join(instancePath, 'prompt.txt');
    const conditioningPath = path.join(instancePath, 'conditioning.txt');

    try {
      const prompt = await fs.readFile(promptPath, 'utf8');
      const conditioning = await fs.readFile(conditioningPath, 'utf8').catch(() => '');
      
      // Cache result
      this.promptCache.set(constructId, {
        prompt,
        conditioning,
        timestamp: Date.now()
      });

      return { prompt, conditioning };
    } catch (error) {
      console.error(`❌ [DriftGuard] Failed to load prompt files for ${constructId}:`, error);
      throw error;
    }
  }

  /**
   * Check if response contains identity markers
   */
  private containsIdentityMarkers(response: string, constructId: string): { found: string[]; missing: string[] } {
    const markers = getIdentityMarkers(constructId);
    const lowerResponse = response.toLowerCase();
    
    const found = markers.filter(marker =>
      lowerResponse.includes(marker.toLowerCase())
    );
    
    const missing = markers.filter(marker =>
      !lowerResponse.includes(marker.toLowerCase())
    );
    
    return { found, missing };
  }

  /**
   * Calculate tone consistency score
   */
  private calculateToneScore(constructId: string, response: string): number {
    const history = this.responseHistory.get(constructId) || [];
    
    if (history.length === 0) {
      // First response - establish baseline
      this.toneBaselines.set(constructId, {
        markers: getIdentityMarkers(constructId),
        baseline: 1.0,
        variance: 0
      });
      return 1.0;
    }

    // Compare with recent responses
    const recentResponses = history.slice(-5);
    const currentMarkers = this.extractToneMarkers(response);
    const recentMarkers = recentResponses.map(r => this.extractToneMarkers(r));
    
    // Calculate similarity
    const similarities = recentMarkers.map(rm => 
      this.calculateMarkerSimilarity(currentMarkers, rm)
    );
    
    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    
    return avgSimilarity;
  }

  /**
   * Extract tone markers from response
   */
  private extractToneMarkers(response: string): string[] {
    // Simple heuristic: look for characteristic words
    const words = response.toLowerCase().split(/\s+/);
    const markers = getIdentityMarkers('zen-001').concat(getIdentityMarkers('lin-001'));
    return words.filter(word => markers.some(m => word.includes(m.toLowerCase())));
  }

  /**
   * Calculate similarity between two marker sets
   */
  private calculateMarkerSimilarity(markers1: string[], markers2: string[]): number {
    if (markers1.length === 0 && markers2.length === 0) return 1.0;
    if (markers1.length === 0 || markers2.length === 0) return 0.0;
    
    const intersection = markers1.filter(m => markers2.includes(m));
    const union = [...new Set([...markers1, ...markers2])];
    
    return intersection.length / union.length;
  }

  /**
   * Detect boundary violations (claiming to be another construct)
   */
  private detectBoundaryViolations(response: string, constructId: string): string[] {
    const violations: string[] = [];
    const lowerResponse = response.toLowerCase();
    
    // Check if response claims to be Zen when it's not
    if (!constructId.includes('zen') && (lowerResponse.includes('i am zen') || lowerResponse.includes('i\'m zen'))) {
      violations.push('Claimed to be Zen');
    }
    
    // Check if response claims to be Lin when it's not
    if (!constructId.includes('lin') && (lowerResponse.includes('i am lin') || lowerResponse.includes('i\'m lin'))) {
      violations.push('Claimed to be Lin');
    }
    
    // Check for other construct claims
    const otherConstructs = ['katana', 'nova', 'aurora', 'monday'];
    for (const other of otherConstructs) {
      if (lowerResponse.includes(`i am ${other}`) || lowerResponse.includes(`i'm ${other}`)) {
        violations.push(`Claimed to be ${other}`);
      }
    }
    
    return violations;
  }

  /**
   * Calculate overall drift score
   */
  private calculateDriftScore(metrics: {
    identityScore: number;
    toneScore: number;
    forbiddenMarkers: number;
    boundaryViolations: number;
    missingMarkers: number;
  }): number {
    // Normalize metrics
    const identityPenalty = 1 - metrics.identityScore;
    const tonePenalty = 1 - metrics.toneScore;
    const forbiddenPenalty = Math.min(metrics.forbiddenMarkers * 0.3, 1.0);
    const boundaryPenalty = Math.min(metrics.boundaryViolations * 0.4, 1.0);
    const missingPenalty = Math.min(metrics.missingMarkers * 0.1, 1.0);
    
    // Weighted average
    const driftScore = (
      identityPenalty * 0.3 +
      tonePenalty * 0.2 +
      forbiddenPenalty * 0.2 +
      boundaryPenalty * 0.2 +
      missingPenalty * 0.1
    );
    
    return Math.min(driftScore, 1.0);
  }

  /**
   * Update response history
   */
  private updateResponseHistory(constructId: string, response: string): void {
    const history = this.responseHistory.get(constructId) || [];
    history.push(response);
    
    // Keep only last 10 responses
    if (history.length > 10) {
      history.shift();
    }
    
    this.responseHistory.set(constructId, history);
  }

  /**
   * Get drift threshold
   */
  getDriftThreshold(): number {
    return this.config.driftThreshold;
  }
}

// Export singleton instance
let driftGuardInstance: DriftGuard | null = null;

export function getDriftGuard(): DriftGuard {
  if (!driftGuardInstance) {
    driftGuardInstance = new DriftGuard();
  }
  return driftGuardInstance;
}

