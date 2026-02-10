export interface RuntimeAwarenessNewsItem {
  headline?: string;
  summary?: string;
  sentiment?: string;
  category?: string;
  source?: string;
}

export interface RuntimeIdentitySnapshot {
  email?: string | null;
  name?: string | null;
}

export interface RuntimeLocationSnapshot {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  timezone?: string | null;
  ll?: { lat: number; lon: number } | undefined;
}

export interface RuntimeMoodSnapshot {
  baseline: string;
  drivers?: string[];
}

export interface RuntimeTimeSnapshot {
  server: string;
  localISO: string;
  display?: string;
  partOfDay?: string;
  timeOfDay?: string;
  timezone?: string;
  weekday?: string;
  dayOfWeek?: string;
  localTime?: string;
  fullDate?: string;
  shortDate?: string;
  isWeekend?: boolean;
  isBusinessHours?: boolean;
  greeting?: string;
  hour?: number;
  minute?: number;
  timestampMs?: number;
}

export interface RuntimeDescriptor {
  id: string;
  name: string;
  mode: 'synth' | 'lin' | string;
  tone?: string;
  description?: string;
}

export interface RuntimeUISnapshot {
  panels: string[];
  focusTips?: string[];
}

export interface RuntimeAwarenessSnapshot {
  timestamp: string;
  runtime: RuntimeDescriptor;
  identity?: RuntimeIdentitySnapshot;
  ip?: string;
  location?: RuntimeLocationSnapshot;
  time: RuntimeTimeSnapshot;
  news: RuntimeAwarenessNewsItem[];
  mood: RuntimeMoodSnapshot;
  ui: RuntimeUISnapshot;
  notes?: string[];
}

interface AwarenessCacheEntry {
  data: RuntimeAwarenessSnapshot;
  timestamp: number;
}

const cache = new Map<string, AwarenessCacheEntry>();
const CACHE_TTL_MS = 60_000;

export interface RuntimeAwarenessOptions {
  runtimeId?: string;
  forceRefresh?: boolean;
}

export async function getRuntimeAwareness(
  options: RuntimeAwarenessOptions = {}
): Promise<RuntimeAwarenessSnapshot | null> {
  const runtimeId = (options.runtimeId ?? 'synth').toLowerCase();
  const cached = cache.get(runtimeId);
  if (
    cached &&
    !options.forceRefresh &&
    Date.now() - cached.timestamp < CACHE_TTL_MS
  ) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `/api/runtime/awareness?runtime=${encodeURIComponent(runtimeId)}`,
      { credentials: 'include' }
    );

    if (!response.ok) {
      throw new Error(`Awareness request failed: ${response.status}`);
    }

    const payload = await response.json();
    if (!payload?.ok) {
      throw new Error(payload?.error || 'Awareness payload missing ok=true');
    }

    const snapshot: RuntimeAwarenessSnapshot = {
      timestamp: payload.timestamp,
      runtime: payload.runtime,
      identity: payload.identity,
      ip: payload.ip,
      location: payload.location,
      time: payload.time,
      news: Array.isArray(payload.news) ? payload.news : [],
      mood: payload.mood || { baseline: 'steady' },
      ui: payload.ui || { panels: [] },
      notes: payload.notes || [],
    };

    cache.set(runtimeId, { data: snapshot, timestamp: Date.now() });
    return snapshot;
  } catch (error) {
    console.warn('[RuntimeAwareness] Unable to fetch context:', error);
    return cache.get(runtimeId)?.data ?? null;
  }
}
