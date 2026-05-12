import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MEMORY_ANCHOR_READ_TTL_MS = 10 * 1000;

const anchorReadCache = new Map();
const anchorReadInflight = new Map();
let vvaultApiClientPromise = null;


async function getVvaultApiClient() {
  if (!vvaultApiClientPromise) {
    vvaultApiClientPromise = import('../../vvaultConnector/vvaultApiClient.js').catch((error) => {
      vvaultApiClientPromise = null;
      throw error;
    });
  }
  return vvaultApiClientPromise;
}

function memoryToAnchorPair(memory) {
  if (!memory) return null;
  if (typeof memory === 'string') {
    return { user: memory, assistant: '', sourceFile: 'vvault-body' };
  }
  const user = memory.context || memory.prompt || memory.user || memory.content || memory.summary || '';
  const assistant = memory.response || memory.assistant || memory.reply || '';
  if (!user && !assistant) return null;
  return {
    user,
    assistant,
    sourceFile: memory.sourceFile || memory.source_file || memory.source || 'vvault-body',
    verified: memory.verified !== false,
  };
}

async function fetchVvaultBodyMemoryAnchors(constructId) {
  try {
    const { getConstructMemories } = await getVvaultApiClient();
    if (typeof getConstructMemories !== 'function') return null;
    const result = await getConstructMemories(constructId);
    if (!result || result.status !== 'body_native') return null;
    const pairs = (result.memories || result.memory || result.items || result.data || [])
      .map(memoryToAnchorPair)
      .filter(Boolean);
    if (!pairs.length) return null;
    const filename = buildMemoryAnchorFilename(constructId);
    const row = {
      id: `vvault-body:${constructId}:memory_anchors`,
      filename,
      content: JSON.stringify({ pairs }),
      created_at: result.updated_at || new Date(0).toISOString(),
    };
    return {
      constructId,
      filename,
      rows: [row],
      latestRow: row,
      row,
      anchors: { pairs },
      error: null,
      source: 'vvault_body',
    };
  } catch (error) {
    console.warn(`[MemoryAnchorStore] VVAULT body fetch failed for ${constructId}: ${error?.message || error}`);
    return null;
  }
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function buildMemoryAnchorFilename(constructId) {
  return `instances/${constructId}/memory_anchors.json`;
}

function getRowTimestampMs(row) {
  const updated = row?.updated_at ? Date.parse(row.updated_at) : Number.NaN;
  if (Number.isFinite(updated)) return updated;
  const created = row?.created_at ? Date.parse(row.created_at) : Number.NaN;
  if (Number.isFinite(created)) return created;
  return 0;
}

function normalizeAnchorRows(rows) {
  return [...(rows || [])].sort((left, right) => {
    const timeDelta = getRowTimestampMs(right) - getRowTimestampMs(left);
    if (timeDelta !== 0) return timeDelta;
    return String(right?.id || '').localeCompare(String(left?.id || ''));
  });
}

function parseAnchorContent(content) {
  if (!content) return null;
  if (typeof content === 'string') {
    return JSON.parse(content);
  }
  if (typeof content === 'object') {
    return content;
  }
  return null;
}

function hasUsableAnchorPairs(anchors) {
  return Array.isArray(anchors?.pairs) && anchors.pairs.length > 0;
}

function selectLatestValidAnchorDocument(rows) {
  const orderedRows = normalizeAnchorRows(rows);
  const latestRow = orderedRows[0] || null;

  for (const row of orderedRows) {
    try {
      const anchors = parseAnchorContent(row?.content);
      if (hasUsableAnchorPairs(anchors)) {
        return {
          rows: orderedRows,
          latestRow,
          row,
          anchors,
          filename: row?.filename || latestRow?.filename || null,
        };
      }
    } catch (rowErr) {
      console.warn(`[MemoryAnchorStore] Skipping row with unparseable content: ${rowErr?.message || rowErr}`);
    }
  }

  return {
    rows: orderedRows,
    latestRow,
    row: null,
    anchors: null,
    filename: latestRow?.filename || null,
  };
}

function cloneAnchorPayload(payload) {
  return {
    constructId: payload.constructId,
    filename: payload.filename,
    rows: payload.rows ? [...payload.rows] : [],
    latestRow: payload.latestRow || null,
    row: payload.row || null,
    anchors: payload.anchors || null,
    error: payload.error || null,
    source: payload.source || null,
  };
}

async function fetchLatestMemoryAnchors(constructId, { supabase, preferVvaultBody = true } = {}) {
  if (preferVvaultBody) {
    const bodyAnchors = await fetchVvaultBodyMemoryAnchors(constructId);
    if (bodyAnchors?.anchors) return bodyAnchors;
  }

  const client = supabase || getSupabase();
  const filename = buildMemoryAnchorFilename(constructId);
  if (!client) {
    return {
      constructId,
      filename,
      rows: [],
      latestRow: null,
      row: null,
      anchors: null,
      error: null,
    };
  }

  const { data, error } = await client
    .from('vault_files')
    .select('id, filename, content, created_at')
    .eq('construct_id', constructId)
    .eq('filename', filename);

  if (error) {
    return {
      constructId,
      filename,
      rows: [],
      latestRow: null,
      row: null,
      anchors: null,
      error,
    };
  }

  return {
    constructId,
    filename,
    ...selectLatestValidAnchorDocument(data || []),
    error: null,
  };
}

async function loadLatestMemoryAnchors(constructId, { supabase, useCache = true, preferVvaultBody = true } = {}) {
  const cacheKey = constructId;
  const now = Date.now();
  const cached = useCache ? anchorReadCache.get(cacheKey) : null;
  if (cached && now - cached.ts < MEMORY_ANCHOR_READ_TTL_MS) {
    return cloneAnchorPayload(cached.payload);
  }

  if (useCache && anchorReadInflight.has(cacheKey)) {
    return cloneAnchorPayload(await anchorReadInflight.get(cacheKey));
  }

  const fetchPromise = fetchLatestMemoryAnchors(constructId, { supabase, preferVvaultBody })
    .then((payload) => {
      anchorReadCache.set(cacheKey, { payload, ts: Date.now() });
      return payload;
    })
    .finally(() => {
      anchorReadInflight.delete(cacheKey);
    });

  if (useCache) {
    anchorReadInflight.set(cacheKey, fetchPromise);
  }

  return cloneAnchorPayload(await fetchPromise);
}

function primeMemoryAnchorReadCache({
  constructId,
  anchors,
  row = null,
  latestRow = null,
  rows = null,
}) {
  const filename = buildMemoryAnchorFilename(constructId);
  const resolvedRow = row || latestRow || null;
  const resolvedRows = rows || (resolvedRow ? [resolvedRow] : []);
  const payload = {
    constructId,
    filename,
    rows: normalizeAnchorRows(
      resolvedRows.map((candidate) => ({
        ...candidate,
        filename: candidate?.filename || filename,
      })),
    ),
    latestRow: latestRow || resolvedRow,
    row: row || resolvedRow,
    anchors: anchors || null,
    error: null,
    source: 'cache_prime',
  };
  anchorReadCache.set(constructId, { payload, ts: Date.now() });
  anchorReadInflight.delete(constructId);
}

function clearMemoryAnchorReadCache(constructId) {
  if (constructId) {
    anchorReadCache.delete(constructId);
    anchorReadInflight.delete(constructId);
    return;
  }
  anchorReadCache.clear();
  anchorReadInflight.clear();
}

function __resetMemoryAnchorStoreForTests() {
  clearMemoryAnchorReadCache();
}

export {
  buildMemoryAnchorFilename,
  clearMemoryAnchorReadCache,
  hasUsableAnchorPairs,
  loadLatestMemoryAnchors,
  primeMemoryAnchorReadCache,
  selectLatestValidAnchorDocument,
  __resetMemoryAnchorStoreForTests,
};
