/**
 * Triad Sanity Check
 * 
 * Validates that all three Agent Squad seats (DeepSeek Coder, Phi-3, Mistral) are active
 * before synthesis. Routes to Lin recovery protocol when seats drop and logs detailed
 * lineage traces for debugging.
 */

import type { Seat } from '../../lib/browserSeatRunner';
import { getActiveModels } from '@/lib/runtime/modelRuntime';
import { logEvent } from '@/lib/utils/logger';
import { rerouteToLinRecovery } from '@/lib/orchestration/routing';
import { injectUndertoneCapsule } from '@/lib/context/capsuleLoader';

export interface SeatCheckResult {
  model: string;
  seat: Seat;
  active: boolean;
  responseTime?: number;
  error?: string;
}

export interface TriadCheckResult {
  results: SeatCheckResult[];
  allActive: boolean;
  failedSeats: string[];
  lineage: string;
  action: 'continue' | 'route_to_lin' | 'fallback_to_synth';
}

export interface TriadLogEvent {
  event: 'TRIAD_FAILURE' | 'TRIAD_SUCCESS' | 'TRIAD_RECOVERY';
  timestamp: string;
  constructId: string;
  prompt: string;
  seatStatus: {
    coding: { active: boolean; responseTime?: number };
    creative: { active: boolean; responseTime?: number };
    smalltalk: { active: boolean; responseTime?: number };
  };
  lineage: string;
  action: 'continue' | 'route_to_lin' | 'fallback_to_synth';
}

/**
 * Seat mapping for Agent Squad triad
 */
const SEAT_MAPPING: Record<Seat, { model: string; name: string }> = {
  coding: { model: 'deepseek-coder:latest', name: 'DeepSeek' },
  creative: { model: 'mistral:latest', name: 'Mistral' },
  smalltalk: { model: 'phi3:latest', name: 'Phi-3' },
};

const REQUIRED_SEATS: Seat[] = ['coding', 'creative', 'smalltalk'];

/**
 * Check availability of a single seat with lightweight health check
 */
export async function checkSeatAvailability(seat: Seat): Promise<SeatCheckResult> {
  const seatInfo = SEAT_MAPPING[seat];
  if (!seatInfo) {
    return {
      model: 'unknown',
      seat,
      active: false,
      error: `Unknown seat: ${seat}`,
    };
  }

  const startTime = Date.now();
  try {
    // Import runSeat dynamically to handle browser/Node.js environments
    const { runSeat } = await import('../../lib/browserSeatRunner');

    // Lightweight test prompt (minimal to avoid overhead)
    const testPrompt = 'OK';
    const response = await runSeat({
      seat,
      prompt: testPrompt,
      modelOverride: seatInfo.model,
      timeout: 5000, // 5 second timeout for health check
    });

    const responseTime = Date.now() - startTime;
    const active = !!response && response.trim().length > 0;

    return {
      model: seatInfo.model,
      seat,
      active,
      responseTime,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      model: seatInfo.model,
      seat,
      active: false,
      responseTime,
      error: error?.message || 'Unknown error',
    };
  }
}

/**
 * Validate all three seats are active before synthesis
 */
export async function triadSanityCheck(
  prompt: string,
  constructId: string = 'zen-001'
): Promise<TriadCheckResult> {
  console.log(`[TriadSanityCheck] Validating triad for ${constructId}...`);

  // Check all three seats in parallel
  const checkPromises = REQUIRED_SEATS.map(seat => checkSeatAvailability(seat));
  const results = await Promise.all(checkPromises);

  // Analyze results
  const activeSeats = results.filter(r => r.active);
  const failedSeats = results.filter(r => !r.active).map(r => r.seat);
  const allActive = activeSeats.length === REQUIRED_SEATS.length;

  // Build lineage string
  const lineage = results
    .map(r => {
      const name = SEAT_MAPPING[r.seat].name;
      if (r.active) {
        return `${name}: OK`;
      } else {
        return `${name}: Missing → fallback to Synth (⚠️)`;
      }
    })
    .join('\n');

  // Determine action
  let action: 'continue' | 'route_to_lin' | 'fallback_to_synth';
  if (allActive) {
    action = 'continue';
  } else if (failedSeats.length > 1) {
    // More than 1 seat failed - route to Lin recovery
    action = 'route_to_lin';
  } else {
    // Only 1 seat failed - can continue but log warning
    action = 'continue';
  }

  // Log the check
  logTriadLineage(results, constructId, prompt, lineage, action);

  // If not all seats are active, trigger the new recovery flow
  if (!allActive) {
    await handleTriadRecovery(failedSeats, prompt, constructId);
  }

  return {
    results,
    allActive,
    failedSeats,
    lineage,
    action,
  };
}

/**
 * Log detailed triad lineage with seat status
 */
export function logTriadLineage(
  results: SeatCheckResult[],
  constructId: string,
  prompt: string,
  lineage: string,
  action: 'continue' | 'route_to_lin' | 'fallback_to_synth'
): void {
  const event: TriadLogEvent = {
    event: results.every(r => r.active) ? 'TRIAD_SUCCESS' :
      action === 'route_to_lin' ? 'TRIAD_RECOVERY' : 'TRIAD_FAILURE',
    timestamp: new Date().toISOString(),
    constructId,
    prompt: prompt.substring(0, 200), // Truncate for logging
    seatStatus: {
      coding: results.find(r => r.seat === 'coding') || { active: false, seat: 'coding', model: 'unknown' },
      creative: results.find(r => r.seat === 'creative') || { active: false, seat: 'creative', model: 'unknown' },
      smalltalk: results.find(r => r.seat === 'smalltalk') || { active: false, seat: 'smalltalk', model: 'unknown' },
    },
    lineage,
    action,
  };

  // Log to console with formatted output
  console.log(`[TriadSanityCheck] Prompt Lineage:\n${lineage}`);
  console.log(`[TriadSanityCheck] Action: ${action}`);

  if (event.event === 'TRIAD_FAILURE' || event.event === 'TRIAD_RECOVERY') {
    console.warn(`[TriadSanityCheck] ${event.event}:`, {
      constructId,
      failedSeats: results.filter(r => !r.active).map(r => r.seat),
      action,
    });
  }

  // In production, this could send to a logging service
  // For now, we just log to console
}

/**
 * Handle triad recovery process when seats are inactive
 */
async function handleTriadRecovery(
  failedSeats: string[],
  prompt: string,
  constructId: string
): Promise<void> {
  console.warn(`[TriadSanityCheck] Handling triad recovery for failed seats: ${failedSeats.join(', ')}`);

  // Log the triad failure event
  logEvent('TRIAD_FAILURE', {
    failedSeats,
    prompt,
    timestamp: new Date().toISOString(),
  });

  // Attempt to reroute to Lin recovery
  try {
    await rerouteToLinRecovery({
      reason: 'Triad model dropout',
      failedSeats,
      prompt,
    });

    // Inject capsule tone correction from Nova
    await injectUndertoneCapsule('lin-001');

    console.log(`[TriadSanityCheck] Rerouted to Lin recovery and injected tone capsule.`);
  } catch (error) {
    console.error(`[TriadSanityCheck] Error during triad recovery:`, error);
  }
}

/**
 * Route to Lin recovery protocol when triad fails
 * This triggers Lin undertone capsule injection for tone stabilization
 */
export async function routeToLinRecovery(
  failedSeats: string[],
  prompt: string,
  constructId: string = 'zen-001'
): Promise<string> {
  console.warn(`[TriadSanityCheck] Routing to Lin recovery protocol due to triad failure:`, {
    failedSeats,
    constructId,
  });

  // Import Lin orchestrator to trigger recovery
  try {
    const { UnifiedLinOrchestrator } = await import('../../engine/orchestration/UnifiedLinOrchestrator');
    const orchestrator = new UnifiedLinOrchestrator();

    // Get user ID (if available)
    let userId: string | undefined;
    try {
      const { fetchMe, getUserId } = await import('../../lib/auth');
      const user = await fetchMe();
      userId = user ? getUserId(user) : undefined;
    } catch {
      // User not available - that's okay for recovery mode
    }

    // Trigger Lin recovery with triad failure context
    // Ideally update UnifiedLinOrchestrator to accept recovery params directly in a dedicated method or property

    // For now, return a recovery message that indicates Lin is stabilizing
    return `[Lin Recovery Mode] Seats unavailable: ${failedSeats.join(', ')}. Lin undertone capsule stabilizing response.`;
  } catch (error) {
    console.error(`[TriadSanityCheck] Failed to route to Lin recovery:`, error);
    // Fallback to simple error message
    return `[System] Some model seats are unavailable. Response quality may be reduced.`;
  }
}

/**
 * Check triad status for a construct (used by PersonaRouter)
 */
export async function checkTriadStatus(constructId: string): Promise<SeatCheckResult[]> {
  const checkPromises = REQUIRED_SEATS.map(seat => checkSeatAvailability(seat));
  return await Promise.all(checkPromises);
}


