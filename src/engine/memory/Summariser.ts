// Summariser.ts – background compaction worker
import { memoryStore } from './MemoryStore.js';

function naiveSummary(sentences: string, maxLen = 400) {
  return sentences.split(/(?<=[.!?])\s+/)
    .filter(s => s.length > 20)
    .slice(0, 3)
    .join(' ')  // join first 3 long-ish sentences
    .slice(0, maxLen);
}

export function summariseOldest(userId: string, take = 30): boolean {
  // Browser-compatible version: use in-memory storage instead of database
  // In CLI mode, this would use the database, but in browser we use memory only
  
  // Get messages from memory store instead of database
  const context = memoryStore.getContext(userId, take * 2); // Get more to have enough
  const messages = context.history || [];
  
  if (messages.length < take) return false;
  
  // Take the oldest messages (first in array)
  const oldestMessages = messages.slice(0, take);
  const corpus = oldestMessages.join(' ');
  const summary = naiveSummary(corpus);
  if (!summary) return false;

  // Add summary to memory store
  memoryStore.addTriples(userId, [{ s: 'chatty', p: 'summary', o: summary, ts: Date.now() } as any]);

  // In browser mode, we don't delete messages from memory store
  // The memory store will handle its own cleanup based on limits
  return true;
}
