/**
 * History/Memory Test Adapter
 * 
 * Generic adapter for testing any construct's memory/history recall abilities
 * Works with Katana, Lin, Synth, or any construct that implements ConstructAdapter
 */

import type { ConstructAdapter } from './constructTestRunner';
import { createKatanaAdapter } from './katanaTestAdapter';

/**
 * Create a memory test adapter for a construct
 */
export function createMemoryTestAdapter(
  constructId: string,
  options?: {
    constructCallsign?: string;
    userId?: string;
    config?: any;
  }
): ConstructAdapter {
  // For now, support Katana - can be extended for other constructs
  if (constructId === 'katana-001' || constructId === 'katana') {
    return createKatanaAdapter(options);
  }
  
  // Default to Katana if construct not recognized
  console.warn(`⚠️ Construct ${constructId} not recognized, defaulting to Katana`);
  return createKatanaAdapter(options);
}

