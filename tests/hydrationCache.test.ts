import {
  clearHydrationSnapshot,
  loadHydrationSnapshot,
  saveHydrationSnapshot,
  snapshotFromThreadsAndGPTs,
} from '../src/lib/hydrationCache';

describe('hydrationCache', () => {
  beforeEach(async () => {
    await clearHydrationSnapshot('user-123');
    await clearHydrationSnapshot('user-456');
  });

  it('caps threads and messages and persists per user', async () => {
    const threads = Array.from({ length: 60 }).map((_, idx) => ({
      id: `t${idx}`,
      title: `Thread ${idx}`,
      updatedAt: Date.now(),
      constructId: null,
      etag: `etag-${idx}`,
      messages: Array.from({ length: 10 }).map((__, midx) => ({
        id: `m${idx}-${midx}`,
        role: 'assistant' as const,
        text: `msg ${midx}`,
        ts: Date.now(),
      })),
    }));

    const snapshot = snapshotFromThreadsAndGPTs(threads, []);
    await saveHydrationSnapshot('user-123', snapshot);

    const loaded = await loadHydrationSnapshot('user-123');
    expect(loaded).toBeTruthy();
    expect(loaded!.threads.length).toBeLessThanOrEqual(50);
    loaded!.threads.forEach((thread) => {
      expect(thread.messages.length).toBeLessThanOrEqual(5);
    });

    const otherUser = await loadHydrationSnapshot('user-456');
    expect(otherUser).toBeNull();
  });
});
