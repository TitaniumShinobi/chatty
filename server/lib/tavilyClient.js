import fetch from 'node-fetch';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Call Tavily search and return normalized results
 */
export async function tavilySearch(query, opts = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    const err = new Error('TAVILY_API_KEY is not set');
    err.status = 503;
    throw err;
  }

  const maxResults = Math.min(Math.max(Number(opts.maxResults) || 5, 1), 10);
  const searchDepth = opts.depth === 'basic' ? 'basic' : 'advanced';

  const body = {
    api_key: apiKey,
    query,
    max_results: maxResults,
    search_depth: searchDepth,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const e = new Error(`Tavily request failed: ${err.message}`);
    e.status = 503;
    throw e;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const e = new Error(`Tavily ${response.status}: ${text || response.statusText}`);
    e.status = response.status;
    throw e;
  }

  const json = await response.json();
  const normalized = (json.results || []).map((r) => ({
    title: r.title || r.url || 'Untitled result',
    url: r.url,
    snippet: r.content || r.description || '',
    score: r.score,
    source: r.source,
  }));

  return {
    provider: 'tavily',
    query,
    results: normalized,
    raw: process.env.DEBUG_SEARCH === '1' ? json : undefined,
  };
}

export default tavilySearch;
