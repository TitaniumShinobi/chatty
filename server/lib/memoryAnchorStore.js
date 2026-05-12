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

function buildAnchorPairResult(memory) {
  if (!memory) {
    return { ok: false, pair: null, reason: 'memory_missing' };
  }
  if (typeof memory === 'string') {
    return {
      ok: true,
      pair: { user: memory, assistant: '', sourceFile: 'vvault-body' },
      reason: null,
    };
  }
  const user = memory.context || memory.prompt || memory.user || memory.content || memory.summary || '';
  const assistant = memory.response || memory.assistant || memory.reply || '';
  if (!user && !assistant) {
    return { ok: false, pair: null, reason: 'memory_empty' };
  }
  return {
    ok: true,
    pair: {
      user,
      assistant,
      sourceFile: memory.sourceFile || memory.source_file || memory.source || 'vvault-body',
      verified: memory.verified !== false,
    },
    reason: null,
  };
}

async function fetchVvaultBodyMemoryAnchors(constructId) {
  try {
    const { getConstructMemories } = await getVvaultApiClient();
    if (typeof getConstructMemories !== 'function') {
      return {
        constructId,
        filename: buildMemoryAnchorFilename(constructId),
        rows: [],
        latestRow: null,
        row: null,
        anchors: null,
        error: 'vvault_body_function_unavailable',
        source: 'vvault_body',
        status: 'unavailable',
      };
    }
    const result = await getConstructMemories(constructId);
    if (!result || result.status !== 'body_native') {
      return {
        constructId,
        filename: buildMemoryAnchorFilename(constructId),
        rows: [],
        latestRow: null,
        row: null,
        anchors: null,
        error: result?.status || 'vvault_body_unavailable',
        source: 'vvault_body',
        status: 'unavailable',
      };
    }
    const pairResults = (result.memories || result.memory || result.items || result.data || [])
      .map(buildAnchorPairResult);
    const pairs = pairResults
      .filter((result) => result.ok)
      .map((result) => result.pair);
    if (!pairs.length) {
      return {
        constructId,
        filename: buildMemoryAnchorFilename(constructId),
        rows: [],
        latestRow: null,
        row: null,
        anchors: { pairs: [] },
        error: pairResults.some((result) => result.reason === 'memory_empty')
          ? 'vvault_body_anchor_pairs_empty'
          : null,
        source: 'vvault_body',
        status: 'empty',
      };
    }
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
      status: 'loaded',
    };
  } catch (error) {
    console.warn(`[MemoryAnchorStore] VVAULT body fetch failed for ${constructId}: ${error?.message || error}`);
    return {
      constructId,
      filename: buildMemoryAnchorFilename(constructId),
      rows: [],
      latestRow: null,
      row: null,
      anchors: null,
      error: error?.message || String(error),
      source: 'vvault_body',
      status: 'error',
    };
  }
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      client: null,
      status: 'supabase_unavailable',
      error: 'supabase_credentials_missing',
    };
  }
  return {
    client: createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY),
    status: 'loaded',
    error: null,
  };
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
  if (!content) {
    return { ok: false, status: 'content_empty', anchors: null, error: 'content_empty' };
  }
  if (typeof content === 'string') {
    try {
      return {
        ok: true,
        status: 'loaded',
        anchors: JSON.parse(content),
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        status: 'malformed_json',
        anchors: null,
        error: error?.message || String(error),
      };
    };
  }
  if (typeof content === 'object') {
    return { ok: true, status: 'loaded', anchors: content, error: null };
  }
  return { ok: false, status: 'unsupported_content_type', anchors: null, error: 'unsupported_content_type' };
}

function hasUsableAnchorPairs(anchors) {
  return Array.isArray(anchors?.pairs) && anchors.pairs.length > 0;
}

function selectLatestValidAnchorDocument(rows) {
  const orderedRows = normalizeAnchorRows(rows);
  const latestRow = orderedRows[0] || null;

  for (const row of orderedRows) {
    const parsed = parseAnchorContent(row?.content);
    if (parsed.ok && hasUsableAnchorPairs(parsed.anchors)) {
      return {
        rows: orderedRows,
        latestRow,
        row,
        anchors: parsed.anchors,
        filename: row?.filename || latestRow?.filename || null,
        parse_status: 'loaded',
        parse_error: null,
      };
    }
    if (!parsed.ok) {
      console.warn(`[MemoryAnchorStore] Skipping row with unparseable content: ${parsed.error || parsed.status}`);
    }
  }

  return {
    rows: orderedRows,
    latestRow,
    row: null,
    anchors: null,
    filename: latestRow?.filename || null,
    parse_status: orderedRows.length > 0 ? 'no_usable_pairs' : 'empty',
    parse_error: orderedRows.length > 0 ? 'no_usable_pairs' : null,
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
    status: payload.status || null,
    parse_status: payload.parse_status || null,
    parse_error: payload.parse_error || null,
  };
}

async function fetchLatestMemoryAnchors(constructId, { supabase, preferVvaultBody = true } = {}) {
  if (preferVvaultBody) {
    const bodyAnchors = await fetchVvaultBodyMemoryAnchors(constructId);
    if (bodyAnchors?.anchors || bodyAnchors?.status === 'empty') return bodyAnchors;
  }

  const client = supabase || getSupabase();
  const supabaseClient = client?.client || client;
  const filename = buildMemoryAnchorFilename(constructId);
  if (!supabaseClient) {
    return {
      constructId,
      filename,
      rows: [],
      latestRow: null,
      row: null,
      anchors: null,
      error: client?.error || 'supabase_unavailable',
      source: 'supabase',
      status: 'unavailable',
    };
  }

  const { data, error } = await supabaseClient
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
      source: 'supabase',
      status: 'error',
    };
  }

  return {
    constructId,
    filename,
    ...selectLatestValidAnchorDocument(data || []),
    error: null,
    source: 'supabase',
    status: (data || []).length > 0 ? 'loaded' : 'empty',
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
    status: anchors ? 'loaded' : 'empty',
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
