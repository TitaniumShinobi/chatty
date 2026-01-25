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
  threads.forEach((thread) => {
    const existing = threadById.get(thread.id);
    if (!existing || thread.messages.length > existing.messages.length) {
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
