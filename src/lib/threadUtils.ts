export interface Thread {
  id: string;
  title: string;
  messages: { role: string; text: string }[];
  constructId: string | null;
  runtimeId?: string;
  isPrimary?: boolean;
  updatedAt?: number;
  createdAt?: number;
}

export const DEFAULT_ZEN_CANONICAL_SESSION_ID = 'zen-001_chat_with_zen-001';
export const DEFAULT_LIN_CANONICAL_SESSION_ID = 'lin-001_chat_with_lin-001';

export function deduplicateThreadsById(threads: Thread[]): Thread[] {
  const threadById = new Map<string, Thread>();
  
  // Helper to score thread quality - higher is better
  const scoreThread = (thread: Thread): number => {
    let score = 0;
    
    // Threads with messages are better
    score += thread.messages.length * 10;
    
    // Threads with ORIGINAL timestamps (from VVAULT metadata) are MUCH better
    // This flag is set during message mapping to differentiate proper metadata
    // from generated timestamps
    const hasOriginalTimestamps = thread.messages.some((m: any) => m.hasOriginalTimestamp === true);
    if (hasOriginalTimestamps) score += 5000;
    
    // Threads with proper titles (not raw IDs) are slightly better
    if (thread.title && !thread.title.includes('_chat_with_')) score += 50;
    
    return score;
  };
  
  threads.forEach((thread) => {
    const existing = threadById.get(thread.id);
    const threadScore = scoreThread(thread);
    const existingScore = existing ? scoreThread(existing) : 0;
    
    // Debug logging for Zen thread deduplication
    if (thread.id.includes('zen')) {
      console.log(`🔍 [Dedup] Thread "${thread.title}" (${thread.id}): score=${threadScore}, msgCount=${thread.messages.length}, hasOrigTs=${thread.messages.some((m: any) => m.hasOriginalTimestamp)}`);
      if (existing) {
        console.log(`🔍 [Dedup] Existing "${existing.title}": score=${existingScore}, msgCount=${existing.messages.length}`);
        console.log(`🔍 [Dedup] Winner: ${threadScore > existingScore ? thread.title : existing.title}`);
      }
    }
    
    if (!existing || threadScore > existingScore) {
      threadById.set(thread.id, thread);
    }
  });
  return Array.from(threadById.values());
}

export function getCanonicalIdForGPT(constructId: string): string {
  return `${constructId}_chat_with_${constructId}`;
}

export function isGPTConstruct(constructId: string | null): boolean {
  if (!constructId) return false;
  const normalized = constructId.toLowerCase();
  return (
    normalized !== 'zen-001' &&
    normalized !== 'zen' &&
    normalized !== 'lin-001' &&
    normalized !== 'lin'
  );
}

export function routeIdForThread(threadId: string, threadList: Thread[]): string {
  const thread = threadList.find((t) => t.id === threadId);
  if (thread?.constructId && isGPTConstruct(thread.constructId) && !threadId.includes('_chat_with_')) {
    return getCanonicalIdForGPT(thread.constructId);
  }
  if (thread && thread.isPrimary && thread.constructId) {
    return `${thread.constructId}_chat_with_${thread.constructId}`;
  }
  return threadId;
}

export function normalizeZenThreadId(sessionId: string, constructId: string | null, title: string): string {
  const normalizedConstructId = constructId?.toLowerCase() || '';
  const normalizedTitle = title.toLowerCase();
  
  if (
    normalizedConstructId === 'zen-001' ||
    normalizedConstructId === 'zen' ||
    normalizedTitle === 'zen'
  ) {
    return DEFAULT_ZEN_CANONICAL_SESSION_ID;
  }
  return sessionId;
}

export function normalizeLinThreadId(sessionId: string, constructId: string | null, title: string): string {
  const normalizedConstructId = constructId?.toLowerCase() || '';
  const normalizedTitle = title.toLowerCase();
  
  if (
    normalizedConstructId === 'lin-001' ||
    normalizedConstructId === 'lin' ||
    normalizedTitle === 'lin'
  ) {
    return DEFAULT_LIN_CANONICAL_SESSION_ID;
  }
  return sessionId;
}
