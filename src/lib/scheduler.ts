// scheduler.ts – minimal in-process scheduler for background tasks
import { summariseOldest } from '../engine/memory/Summariser.js';

const counters = new Map<string, number>();

export function maybeSummarise(userId: string) {
  const n = (counters.get(userId) ?? 0) + 1;
  counters.set(userId, n);
  if (n % 20 !== 0) return; // run every 20 messages
  try { summariseOldest(userId); } catch (e) { /* ignore */ }
}
