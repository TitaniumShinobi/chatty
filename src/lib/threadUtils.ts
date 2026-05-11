export interface Thread {
  id: string;
  title: string;
  messages: { role: string; text: string }[];
  constructId: string | null;
  runtimeId?: string;
  isPrimary?: boolean;
  updatedAt?: number;
  createdAt?: number;
  hydrationSource?: string | null;
  hydrationComplete?: boolean;
}

export const DEFAULT_ZEN_CANONICAL_SESSION_ID = 'zen-001_chat_with_zen-001';
export const DEFAULT_LIN_CANONICAL_SESSION_ID = 'lin-001_chat_with_lin-001';
export const DEFAULT_VAL_CANONICAL_SESSION_ID = 'val-001_chat_with_val-001';

function isCanonicalZenThread(thread: Thread | null | undefined): boolean {
  return thread?.id === DEFAULT_ZEN_CANONICAL_SESSION_ID;
}

function hasFullVvaultHydration(thread: Thread | null | undefined): boolean {
  return thread?.hydrationSource === 'full' && thread?.hydrationComplete === true;
}

export function deduplicateThreadsById(threads: Thread[]): Thread[] {
  const threadById = new Map<string, Thread>();

  const selectCanonicalThread = (
    existing: Thread,
    incoming: Thread
  ): { canonicalThread: Thread; supplementaryThread: Thread } => {
    const existingCount = existing.messages?.length || 0;
    const incomingCount = incoming.messages?.length || 0;

    const existingHasTimestamps =
      existing.messages?.some((m: any) => m.hasOriginalTimestamp) || false;
    const incomingHasTimestamps =
      incoming.messages?.some((m: any) => m.hasOriginalTimestamp) || false;

    if (existingHasTimestamps && !incomingHasTimestamps) {
      return { canonicalThread: existing, supplementaryThread: incoming };
    }

    if (incomingHasTimestamps && !existingHasTimestamps) {
      return { canonicalThread: incoming, supplementaryThread: existing };
    }

    if (incomingCount > existingCount) {
      return { canonicalThread: incoming, supplementaryThread: existing };
    }

    return { canonicalThread: existing, supplementaryThread: incoming };
  };

  // Helper to merge messages from two threads, deduplicating by content
  // STRATEGY: Pick the thread with the MOST messages and use it as the canonical source
  // This preserves the original parse order from the largest/most complete transcript
  const mergeMessages = (canonicalThread: Thread, supplementaryThread: Thread): any[] => {
    const canonicalMessages = canonicalThread.messages || [];
    const supplementaryMessages = supplementaryThread.messages || [];

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
      id: `${canonicalThread.id}_merged_msg_${idx}`,
      parseIndex: idx // Update parseIndex to reflect final order
    }));
  };
  
  const isUsableTitle = (title: string | undefined): boolean => {
    const normalized = title?.trim();
    if (!normalized) return false;
    if (/^(empty|untitled|new chat)$/i.test(normalized)) return false;
    return !/^chat_with_.+\.md$/i.test(normalized);
  };

  // Prefer the canonical thread's title unless it is blank or filename-like.
  const pickBetterTitle = (canonicalTitle: string, fallbackTitle: string): string => {
    if (isUsableTitle(canonicalTitle)) return canonicalTitle;
    if (isUsableTitle(fallbackTitle)) return fallbackTitle;
    return canonicalTitle || fallbackTitle;
  };
  
  threads.forEach((thread) => {
    const existing = threadById.get(thread.id);
    
    if (!existing) {
      threadById.set(thread.id, thread);
    } else {
      const { canonicalThread, supplementaryThread } = selectCanonicalThread(existing, thread);
      if (isCanonicalZenThread(canonicalThread)) {
        const fullHydratedThread = hasFullVvaultHydration(existing)
          ? existing
          : hasFullVvaultHydration(thread)
            ? thread
            : canonicalThread;
        threadById.set(thread.id, {
          ...fullHydratedThread,
          title: pickBetterTitle(fullHydratedThread.title, supplementaryThread.title),
        });
        return;
      }
      const mergedMessages = mergeMessages(canonicalThread, supplementaryThread);
      const betterTitle = pickBetterTitle(canonicalThread.title, supplementaryThread.title);
      
      // Debug logging for Zen thread merging
      if (thread.id.includes('zen')) {
        console.log(`🔀 [Dedup] Merging threads for ${thread.id}:`);
        console.log(`  - Existing "${existing.title}": ${existing.messages.length} msgs`);
        console.log(`  - Incoming "${thread.title}": ${thread.messages.length} msgs`);
        console.log(`  - Canonical "${canonicalThread.title}": ${canonicalThread.messages.length} msgs`);
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

export function getCanonicalConstructIdFromThreadId(threadId: string | null | undefined): string | null {
  const normalized = (threadId || '').trim().toLowerCase();
  if (!normalized) return null;

  const match = normalized.match(/^([a-z0-9-]+)_chat_with_([a-z0-9-]+)$/);
  if (!match || match[1] !== match[2]) return null;

  return match[1];
}

export function getDisplayTitleForConstructId(constructId: string | null | undefined): string {
  const base = (constructId || '')
    .trim()
    .replace(/-\d{3,}$/i, '')
    .replace(/[-_]+/g, ' ');
  if (!base) return 'Conversation';
  return base.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isGPTConstruct(constructId: string | null): boolean {
  if (!constructId) return false;
  const normalized = constructId.toLowerCase();
  return (
    normalized !== 'zen-001' &&
    normalized !== 'zen' &&
    normalized !== 'lin-001' &&
    normalized !== 'lin' &&
    normalized !== 'val-001' &&
    normalized !== 'val'
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

export function isZenThreadIdentifier(threadId: string | null | undefined): boolean {
  const normalized = (threadId || '').toLowerCase();
  if (!normalized) return false;
  return (
    normalized === DEFAULT_ZEN_CANONICAL_SESSION_ID ||
    normalized.startsWith('zen_') ||
    /^zen-\d{3}(?:_|$)/.test(normalized) ||
    normalized.includes('_chat_with_zen-')
  );
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

export function normalizeValThreadId(sessionId: string, constructId: string | null, title: string): string {
  const normalizedConstructId = constructId?.toLowerCase() || '';
  const normalizedTitle = title.toLowerCase();

  if (
    normalizedConstructId === 'val-001' ||
    normalizedConstructId === 'val' ||
    normalizedTitle === 'val'
  ) {
    return DEFAULT_VAL_CANONICAL_SESSION_ID;
  }
  return sessionId;
}
