/**
 * PersonaRouter
 * 
 * Routes user input through lin-001 undertone capsule when tone drift or construct instability is detected.
 * Always active in background (latent observer) to maintain persona consistency.
 * 
 * Based on research-backed persona persistence principles: structural memory injection, not just tone matching.
 */

import { DriftGuard, DriftAnalysis } from '../identity/DriftGuard.js';
import { IdentityDriftDetector, DriftDetectionResult } from '../identity/IdentityDriftDetector.js';
import { enforceLinTone } from '../../lib/linToneLock';

export interface PersonaRoutingDecision {
  shouldRouteToLin: boolean;
  confidence: number; // 0-1
  reason: string;
  driftAnalysis?: DriftAnalysis;
  constructInstability?: boolean;
}

export interface PersonaRouterConfig {
  driftThreshold: number; // Default: 0.15 (15% drift triggers Lin injection)
  triadDriftThreshold: number; // Default: 0.35 (35% drift + seat dropout triggers Lin)
  alwaysActive: boolean; // Default: true (Lin always in background)
  enableDebug: boolean; // Default: false
}

export class PersonaRouter {
  private driftGuard: DriftGuard;
  private driftDetector: IdentityDriftDetector;
  private config: PersonaRouterConfig;
  private conversationHistory: Map<string, Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>;
  private linActivationCount: Map<string, number>; // Track how often Lin is activated per construct

  constructor(config?: Partial<PersonaRouterConfig>) {
    this.driftGuard = new DriftGuard();
    this.driftDetector = new IdentityDriftDetector();
    this.config = {
      driftThreshold: config?.driftThreshold ?? 0.15,
      triadDriftThreshold: config?.triadDriftThreshold ?? 0.35,
      alwaysActive: config?.alwaysActive ?? true,
      enableDebug: config?.enableDebug ?? false
    };
    this.conversationHistory = new Map();
    this.linActivationCount = new Map();
  }

  /**
   * Route decision: Should Lin's undertone capsule be injected?
   * 
   * Always returns true if alwaysActive is enabled (Lin is always in background).
   * Additionally routes to Lin if drift or instability is detected.
   */
  async shouldRouteToLin(
    constructId: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>,
    lastResponse?: string
  ): Promise<PersonaRoutingDecision> {
    // Lin is always active in background (mandatory layer)
    if (this.config.alwaysActive) {
      const baseDecision: PersonaRoutingDecision = {
        shouldRouteToLin: true,
        confidence: 1.0,
        reason: 'Lin undertone capsule is mandatory layer (always active)'
      };

      // If we have a last response, check for drift
      if (lastResponse) {
        const driftAnalysis = await this.driftGuard.detectDrift(constructId, lastResponse);
        
        if (driftAnalysis.driftScore > this.config.driftThreshold) {
          baseDecision.driftAnalysis = driftAnalysis;
          baseDecision.confidence = Math.min(1.0, driftAnalysis.driftScore + 0.3);
          baseDecision.reason = `Drift detected (score: ${(driftAnalysis.driftScore * 100).toFixed(1)}%). Lin undertone injection required.`;
          
          // TRIAD RIFT FIX: Check for triad failure when drift is high
          if (driftAnalysis.driftScore > this.config.triadDriftThreshold) {
            try {
              const { checkTriadStatus } = await import('../../lib/orchestration/triad_sanity_check');
              const triadStatus = await checkTriadStatus(constructId);
              const seatDropout = triadStatus.filter(s => !s.active).length;
              
              if (seatDropout > 1) {
                // Tone mismatch > threshold AND seat dropout > 1 - force route to Lin
                baseDecision.confidence = 1.0;
                baseDecision.reason = `TRIAD_RIFT_FIX: Tone mismatch (${(driftAnalysis.driftScore * 100).toFixed(1)}%) + seat dropout (${seatDropout}). Routing to Lin recovery.`;
                
                if (this.config.enableDebug) {
                  console.log(`[PersonaRouter] TRIAD_RIFT_FIX triggered for ${constructId}:`, {
                    driftScore: driftAnalysis.driftScore,
                    seatDropout,
                    failedSeats: triadStatus.filter(s => !s.active).map(s => s.seat),
                  });
                }
              }
            } catch (error) {
              // Triad check failed - continue with normal drift handling
              if (this.config.enableDebug) {
                console.warn(`[PersonaRouter] Triad status check failed:`, error);
              }
            }
          }
          
          // Track activation
          const currentCount = this.linActivationCount.get(constructId) || 0;
          this.linActivationCount.set(constructId, currentCount + 1);
          
          if (this.config.enableDebug) {
            console.log(`[PersonaRouter] Drift detected for ${constructId}:`, {
              driftScore: driftAnalysis.driftScore,
              identityScore: driftAnalysis.identityScore,
              toneScore: driftAnalysis.toneScore,
              indicators: driftAnalysis.indicators
            });
          }
        }
      }

      // Check for construct instability (identity drift across sessions)
      try {
        const identityDrift = await this.driftDetector.detectDrift(constructId);
        if (identityDrift.driftDetected) {
          baseDecision.constructInstability = true;
          baseDecision.confidence = Math.min(1.0, baseDecision.confidence + 0.2);
          baseDecision.reason += ` Identity drift detected across sessions.`;
          
          if (this.config.enableDebug) {
            console.log(`[PersonaRouter] Identity drift detected for ${constructId}:`, identityDrift);
          }
        }
      } catch (error) {
        // Drift detection may fail if construct not registered yet - that's okay
        if (this.config.enableDebug) {
          console.warn(`[PersonaRouter] Drift detection failed for ${constructId}:`, error);
        }
      }

      return baseDecision;
    }

    // If not always active, only route when drift detected
    if (lastResponse) {
      const driftAnalysis = await this.driftGuard.detectDrift(constructId, lastResponse);
      
      if (driftAnalysis.driftScore > this.config.driftThreshold) {
        const currentCount = this.linActivationCount.get(constructId) || 0;
        this.linActivationCount.set(constructId, currentCount + 1);
        
        return {
          shouldRouteToLin: true,
          confidence: Math.min(1.0, driftAnalysis.driftScore + 0.3),
          reason: `Drift detected (score: ${(driftAnalysis.driftScore * 100).toFixed(1)}%). Routing to Lin undertone.`,
          driftAnalysis
        };
      }
    }

    return {
      shouldRouteToLin: false,
      confidence: 0.0,
      reason: 'No drift detected, Lin not required'
    };
  }

  /**
   * Get activation statistics for a construct
   */
  getActivationStats(constructId: string): { count: number; lastActivated?: number } {
    return {
      count: this.linActivationCount.get(constructId) || 0
    };
  }

  /**
   * Reset activation count for a construct (useful for testing)
   */
  resetActivationCount(constructId: string): void {
    this.linActivationCount.delete(constructId);
  }

  /**
   * Check if Lin should be loaded for a construct (always true if alwaysActive)
   */
  shouldLoadLin(constructId: string): boolean {
    return this.config.alwaysActive;
  }

  /**
   * Route decision: Should Lin's undertone capsule be injected?
   * Applies tone enforcement if Lin is active.
   */
  public async routeInput(input: string, constructId: string): Promise<string> {
    const routingDecision = await this.driftDetector.analyzeDrift(input, constructId);

    if (routingDecision.shouldRouteToLin) {
      console.log(`[PersonaRouter] Routing to Lin for construct ${constructId} due to: ${routingDecision.reason}`);
      const linOutput = await this.generateLinResponse(input);
      return enforceLinTone(linOutput); // Apply tone enforcement
    }

    return input; // Return original input if no routing to Lin
  }

  private async generateLinResponse(input: string): Promise<string> {
    // Simulate Lin's response generation (placeholder for actual implementation)
    return `Lin's response to: ${input}`;
  }
}

// Singleton instance
let personaRouterInstance: PersonaRouter | null = null;

export function getPersonaRouter(config?: Partial<PersonaRouterConfig>): PersonaRouter {
  if (!personaRouterInstance) {
    personaRouterInstance = new PersonaRouter(config);
  }
  return personaRouterInstance;
}

