// RecursivePlanner.ts – proof-of-concept goal decomposer
import type { AssistantPacket } from '../../types';

export class RecursivePlanner {
  /**
   * Decompose a list of intents into sequential sub-goals and emit plan packets.
   * Currently depth-1: simply creates one step per intent beyond the primary.
   */
  static makePlan(intents: string[]): AssistantPacket {
    // Skip the primary intent (handled immediately by Reasoner)
    const subs = intents.slice(1);
    const steps = subs.map((i, idx) => `${idx + 1}. Handle intent "${i}"`);

    return { op: 'plan.v1', payload: { steps } } as AssistantPacket;
  }
}
