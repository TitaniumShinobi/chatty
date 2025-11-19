// Identity Drift Detection Service
// Monitors constructs for identity drift across sessions

import { identityEnforcement, IdentityViolationType } from './IdentityEnforcementService';
import { constructRegistry } from '../../state/constructs';

export interface DriftDetectionResult {
  constructId: string;
  constructName: string;
  hasDrift: boolean;
  violations: Array<{
    type: IdentityViolationType;
    message: string;
    severity: string;
    suggestedFix?: string;
  }>;
  timestamp: number;
}

/**
 * Identity Drift Detector
 * Periodically checks all constructs for identity drift
 */
export class IdentityDriftDetector {
  private static instance: IdentityDriftDetector;
  private detectionInterval: NodeJS.Timeout | null = null;
  private readonly defaultIntervalMs = 5 * 60 * 1000; // 5 minutes

  static getInstance(): IdentityDriftDetector {
    if (!IdentityDriftDetector.instance) {
      IdentityDriftDetector.instance = new IdentityDriftDetector();
    }
    return IdentityDriftDetector.instance;
  }

  /**
   * Detect drift for a specific construct
   */
  async detectDrift(constructId: string): Promise<DriftDetectionResult> {
    const violations = await identityEnforcement.detectIdentityDrift(constructId);
    
    const allConstructs = await constructRegistry.getAllConstructs();
    const construct = allConstructs.find(c => c.id === constructId);
    const constructName = construct?.name || constructId;

    return {
      constructId,
      constructName,
      hasDrift: violations.length > 0,
      violations: violations.map(v => ({
        type: v.type,
        message: v.message,
        severity: v.severity,
        suggestedFix: v.suggestedFix
      })),
      timestamp: Date.now()
    };
  }

  /**
   * Detect drift for all active constructs
   */
  async detectAllDrift(): Promise<DriftDetectionResult[]> {
    const allConstructs = await constructRegistry.getAllConstructs();
    const results: DriftDetectionResult[] = [];

    for (const construct of allConstructs) {
      const result = await this.detectDrift(construct.id);
      results.push(result);
    }

    return results;
  }

  /**
   * Start periodic drift detection
   */
  startPeriodicDetection(intervalMs?: number): void {
    if (this.detectionInterval) {
      this.stopPeriodicDetection();
    }

    const interval = intervalMs || this.defaultIntervalMs;
    
    this.detectionInterval = setInterval(async () => {
      try {
        const results = await this.detectAllDrift();
        const driftDetected = results.filter(r => r.hasDrift);

        if (driftDetected.length > 0) {
          console.warn(
            `[IdentityDriftDetector] Drift detected in ${driftDetected.length} construct(s):`,
            driftDetected.map(r => `${r.constructName} (${r.constructId})`)
          );

          // Generate alerts for critical drift
          for (const result of driftDetected) {
            for (const violation of result.violations) {
              if (violation.severity === 'critical' || violation.severity === 'high') {
                const alert = {
                  alert: `Identity Drift Detected: ${violation.message}`,
                  severity: violation.severity,
                  timestamp: result.timestamp,
                  constructId: result.constructId,
                  constructName: result.constructName,
                  suggestedFix: violation.suggestedFix
                };
                console.error('[IdentityAlert]', alert);
              }
            }
          }
        }
      } catch (error) {
        console.error('[IdentityDriftDetector] Error during periodic detection:', error);
      }
    }, interval);

    console.log(`[IdentityDriftDetector] Started periodic detection (interval: ${interval}ms)`);
  }

  /**
   * Stop periodic drift detection
   */
  stopPeriodicDetection(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
      console.log('[IdentityDriftDetector] Stopped periodic detection');
    }
  }

  /**
   * Check if drift detection is running
   */
  isRunning(): boolean {
    return this.detectionInterval !== null;
  }
}

// Export singleton instance
export const identityDriftDetector = IdentityDriftDetector.getInstance();

