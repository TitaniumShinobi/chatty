// Lightweight shared caches for VVAULT-derived responses (identity + file summaries).
// Entries are stored as { expires, value }.
const DEFAULT_TTL_MS = 60 * 1000;

const identityCompactCache = new Map();
const filesSummaryCache = new Map();

const cacheGet = (cache, key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const cacheSet = (cache, key, value, ttlMs = DEFAULT_TTL_MS) => {
  cache.set(key, {
    expires: Date.now() + Math.max(1, Number(ttlMs) || DEFAULT_TTL_MS),
    value,
  });
};

const clearCacheKey = (cache, key) => {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
};

const clearIdentityCompactCache = (constructCallsign) =>
  clearCacheKey(identityCompactCache, constructCallsign);

const clearFilesSummaryCache = (constructCallsign) =>
  clearCacheKey(filesSummaryCache, constructCallsign);

export {
  DEFAULT_TTL_MS,
  cacheGet,
  cacheSet,
  identityCompactCache,
  filesSummaryCache,
  clearIdentityCompactCache,
  clearFilesSummaryCache,
};
