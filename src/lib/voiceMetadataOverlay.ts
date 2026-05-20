/**
 * Persist and restore voice-mode message metadata (outputMode, speechText, voiceReply)
 * so it survives reload/rehydration. Stored in localStorage as an overlay keyed by userId.
 */

const STORAGE_KEY_PREFIX = "chatty:voice-metadata:";

export type VoiceMetadataPatch = {
  outputMode?: string;
  speechText?: string;
  voiceReply?: boolean;
};

export function getVoiceMetadataOverlay(
  userId: string
): Record<string, Record<string, VoiceMetadataPatch>> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveVoiceMetadataPatch(
  userId: string,
  threadId: string,
  messageId: string,
  patch: Record<string, unknown>
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const overlay = getVoiceMetadataOverlay(userId);
    const byThread = overlay[threadId] ?? {};
    byThread[messageId] = { ...(byThread[messageId] as VoiceMetadataPatch), ...patch } as VoiceMetadataPatch;
    overlay[threadId] = byThread;
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(overlay));
  } catch (e) {
    console.warn("[voiceMetadataOverlay] save failed", e);
  }
}

export function applyVoiceMetadataOverlay<T extends { id: string; messages: Array<{ id: string; metadata?: Record<string, unknown> }> }>(
  threads: T[],
  userId: string
): T[] {
  const overlay = getVoiceMetadataOverlay(userId);
  if (Object.keys(overlay).length === 0) return threads;
  return threads.map((thread) => {
    const patchByMsg = overlay[thread.id];
    if (!patchByMsg || Object.keys(patchByMsg).length === 0) return thread;
    return {
      ...thread,
      messages: thread.messages.map((m) => {
        const patch = patchByMsg[m.id];
        if (!patch) return m;
        return {
          ...m,
          metadata: { ...(m.metadata || {}), ...patch },
        };
      }),
    };
  });
}
