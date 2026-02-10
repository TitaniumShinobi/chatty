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
  
  // Helper to merge messages from two threads, deduplicating by content
  // STRATEGY: Pick the thread with the MOST messages and use it as the canonical source
  // This preserves the original parse order from the largest/most complete transcript
  const mergeMessages = (existing: Thread, incoming: Thread): any[] => {
    // Pick the larger thread as the canonical source - its parse order should be preserved
    const existingCount = existing.messages?.length || 0;
    const incomingCount = incoming.messages?.length || 0;
    
    // Also prefer threads where messages have original timestamps (from metadata)
    const existingHasTimestamps = existing.messages?.some((m: any) => m.hasOriginalTimestamp) || false;
    const incomingHasTimestamps = incoming.messages?.some((m: any) => m.hasOriginalTimestamp) || false;
    
    // Priority: hasOriginalTimestamp > message count
    let canonicalMessages: any[];
    let supplementaryMessages: any[];
    
    if (existingHasTimestamps && !incomingHasTimestamps) {
      canonicalMessages = existing.messages || [];
      supplementaryMessages = incoming.messages || [];
    } else if (incomingHasTimestamps && !existingHasTimestamps) {
      canonicalMessages = incoming.messages || [];
      supplementaryMessages = existing.messages || [];
    } else {
      // Both have or don't have timestamps - prefer larger
      if (incomingCount > existingCount) {
        canonicalMessages = incoming.messages || [];
        supplementaryMessages = existing.messages || [];
      } else {
        canonicalMessages = existing.messages || [];
        supplementaryMessages = incoming.messages || [];
      }
    }
    
    // Create content fingerprints from canonical messages
    const seen = new Set<string>();
    const getFingerprint = (msg: any): string => {
      const content = (msg.text || msg.content || '').trim().substring(0, 100);
      return `${msg.role}:${content}`;
    };
    
    // Add all canonical messages - these define the order
    for (const msg of canonicalMessages) {
      seen.add(getFingerprint(msg));
    }
    
    // Add supplementary messages that aren't duplicates (at the end)
    const additionalMessages: any[] = [];
    for (const msg of supplementaryMessages) {
      if (!seen.has(getFingerprint(msg))) {
        seen.add(getFingerprint(msg));
        additionalMessages.push(msg);
      }
    }
    
    // Canonical messages stay in their original order, new ones added at end
    const merged = [...canonicalMessages, ...additionalMessages];
    
    // Regenerate unique IDs for merged messages - use stable index, not Date.now()
    return merged.map((msg, idx) => ({
      ...msg,
      id: `${existing.id}_merged_msg_${idx}`,
      parseIndex: idx // Update parseIndex to reflect final order
    }));
  };
  
  // Helper to pick better title
  const pickBetterTitle = (a: string, b: string): string => {
    // Prefer clean titles over raw filenames/IDs
    const aIsClean = a && !a.includes('_chat_with_') && !a.includes('-001');
    const bIsClean = b && !b.includes('_chat_with_') && !b.includes('-001');
    
    if (aIsClean && !bIsClean) return a;
    if (bIsClean && !aIsClean) return b;
    
    // Prefer capitalized titles
    if (a && a[0] === a[0].toUpperCase() && b && b[0] !== b[0].toUpperCase()) return a;
    if (b && b[0] === b[0].toUpperCase() && a && a[0] !== a[0].toUpperCase()) return b;
    
    return a || b;
  };
  
  threads.forEach((thread) => {
    const existing = threadById.get(thread.id);
    
    if (!existing) {
      threadById.set(thread.id, thread);
    } else {
      // MERGE threads instead of picking one winner
      const mergedMessages = mergeMessages(existing, thread);
      const betterTitle = pickBetterTitle(existing.title, thread.title);
      
      // Debug logging for Zen thread merging
      if (thread.id.includes('zen')) {
        console.log(`🔀 [Dedup] Merging threads for ${thread.id}:`);
        console.log(`  - Existing "${existing.title}": ${existing.messages.length} msgs`);
        console.log(`  - Incoming "${thread.title}": ${thread.messages.length} msgs`);
        console.log(`  - Merged result: ${mergedMessages.length} unique msgs, title="${betterTitle}"`);
      }
      
      // Create merged thread
      const mergedThread: Thread = {
        ...existing,
        title: betterTitle,
        messages: mergedMessages,
        // Keep the earliest creation time
        createdAt: Math.min(existing.createdAt || Date.now(), thread.createdAt || Date.now()),
        // Keep the latest update time
        updatedAt: Math.max(existing.updatedAt || 0, thread.updatedAt || 0),
      };
      
      threadById.set(thread.id, mergedThread);
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
