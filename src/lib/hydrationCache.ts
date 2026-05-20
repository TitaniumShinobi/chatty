import { del as idbDel, get as idbGet, set as idbSet } from './idbKeyvalCompat';

export type CachedMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text?: string;
  ts: number;
};

export type CachedThread = {
  id: string;
  title: string;
  updatedAt: number;
  constructId?: string | null;
  etag?: string | null;
  messages: CachedMessage[];
};

export type CachedGPT = {
  id: string;
  name: string;
  constructCallsign?: string;
  avatar?: string | null;
  updatedAt?: string | null;
};

export type HydrationSnapshot = {
  version: number;
  savedAt: number;
  indexEtag?: string | null;
  threads: CachedThread[];
  gpts: CachedGPT[];
};

const SNAPSHOT_VERSION = 2;
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const THREAD_LIMIT = 50;
const MESSAGE_LIMIT = 5;
const LEGACY_KEY = 'chatty_hydration_snapshot_v1';
const MEMORY_CACHE = new Map<string, HydrationSnapshot>();

const hasWindow = typeof window !== 'undefined';

function storageKey(userKey: string) {
  return `chatty_hydration_snapshot_v${SNAPSHOT_VERSION}:${userKey || 'anon'}`;
}

function trimSnapshot(snapshot: HydrationSnapshot): HydrationSnapshot {
  return {
    ...snapshot,
    version: SNAPSHOT_VERSION,
    savedAt: snapshot.savedAt || Date.now(),
    threads: (snapshot.threads || []).slice(0, THREAD_LIMIT).map((thread) => ({
      ...thread,
      messages: (thread.messages || []).slice(-MESSAGE_LIMIT),
    })),
  };
}

function isExpired(snapshot: HydrationSnapshot | null): boolean {
  if (!snapshot) return true;
  return Date.now() - (snapshot.savedAt || 0) > SNAPSHOT_TTL_MS;
}

function loadLegacyLocalStorage(): HydrationSnapshot | null {
  if (!hasWindow) return null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return null;
    const migrated = trimSnapshot({
      version: SNAPSHOT_VERSION,
      savedAt: parsed.savedAt || Date.now(),
      threads: parsed.threads || [],
      gpts: parsed.gpts || [],
      indexEtag: null,
    });
    return isExpired(migrated) ? null : migrated;
  } catch (error) {
    console.warn('⚠️ hydration snapshot legacy load failed', error);
    return null;
  }
}

export function loadHydrationSnapshotSyncFallback(): HydrationSnapshot | null {
  return loadLegacyLocalStorage();
}

export async function loadHydrationSnapshot(userKey: string): Promise<HydrationSnapshot | null> {
  const key = storageKey(userKey);
  const inMemory = MEMORY_CACHE.get(key) || null;
  if (inMemory && !isExpired(inMemory)) return inMemory;

  try {
    const snapshot = (await idbGet(key)) as HydrationSnapshot | null;
    if (!snapshot || snapshot.version !== SNAPSHOT_VERSION || isExpired(snapshot)) return null;
    const trimmed = trimSnapshot(snapshot);
    MEMORY_CACHE.set(key, trimmed);
    return trimmed;
  } catch (error) {
    console.warn('⚠️ hydration snapshot IDB load failed', error);
    const legacy = loadLegacyLocalStorage();
    if (legacy) MEMORY_CACHE.set(key, legacy);
    return legacy;
  }
}

export async function saveHydrationSnapshot(userKey: string, snapshot: HydrationSnapshot) {
  const key = storageKey(userKey);
  const trimmed = trimSnapshot({ ...snapshot, savedAt: Date.now() });
  MEMORY_CACHE.set(key, trimmed);
  try {
    await idbSet(key, trimmed);
  } catch (error) {
    console.warn('⚠️ hydration snapshot IDB save failed', error);
    if (!hasWindow) return;
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(trimmed));
    } catch (legacyError) {
      console.warn('⚠️ hydration snapshot legacy save failed', legacyError);
    }
  }
}

export async function clearHydrationSnapshot(userKey: string) {
  const key = storageKey(userKey);
  MEMORY_CACHE.delete(key);
  try {
    await idbDel(key);
  } catch (error) {
    console.warn('⚠️ hydration snapshot IDB clear failed', error);
  }
}

export function snapshotFromThreadsAndGPTs(
  threads: CachedThread[],
  gpts: CachedGPT[],
  indexEtag: string | null = null,
): HydrationSnapshot {
  return trimSnapshot({
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    threads,
    gpts,
    indexEtag,
  });
}
