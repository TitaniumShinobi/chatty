import express from 'express';
import { tavilySearch } from '../lib/tavilyClient.js';
import { AIManager } from '../lib/aiManager.js';
import {
  buildSearchCitations,
  buildSearchContextBlock,
  buildSearchPacket,
  detectHousingIntent,
  enrichHousingResults,
  isAllowlistedHousingMediaUrl,
  normalizeHousingFilters,
} from '../lib/searchHousing.js';
import {
  buildSearchResponsePackets,
  fetchSearchMedia,
  performHousingSearch,
} from '../lib/housingSearch.js';

const router = express.Router();

const searchCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;
const searchMediaCache = new Map();
const SEARCH_MEDIA_CACHE_TTL = 30 * 60 * 1000;

function getCachedResult(query) {
  const cached = searchCache.get(query.toLowerCase().trim());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }
  searchCache.delete(query.toLowerCase().trim());
  return null;
}

function setCachedResult(query, results) {
  if (searchCache.size > 200) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 50; i++) searchCache.delete(oldest[i][0]);
  }
  searchCache.set(query.toLowerCase().trim(), { results, timestamp: Date.now() });
}

function getCachedMedia(url) {
  const cached = searchMediaCache.get(url);
  if (cached && Date.now() - cached.timestamp < SEARCH_MEDIA_CACHE_TTL) {
    return cached;
  }
  searchMediaCache.delete(url);
  return null;
}

function setCachedMedia(url, value) {
  if (searchMediaCache.size > 64) {
    const oldest = [...searchMediaCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 16 && oldest[i]; i++) {
      searchMediaCache.delete(oldest[i][0]);
    }
  }
  searchMediaCache.set(url, { ...value, timestamp: Date.now() });
}

async function searchDuckDuckGo(query, numResults = 8) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) throw new Error(`DuckDuckGo search failed: ${response.status}`);
  const html = await response.text();

  const results = [];
  const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = resultRegex.exec(html)) !== null && results.length < numResults) {
    let url = match[1];
    if (url.startsWith('//duckduckgo.com/l/?')) {
      const uddg = new URLSearchParams(url.split('?')[1]).get('uddg');
      if (uddg) url = decodeURIComponent(uddg);
    }

    const title = match[2].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
    const snippet = match[3].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();

    if (title && url.startsWith('http')) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

async function searchSerpAPI(query, numResults = 8) {
  const apiKey = process.env.CHATTY_SERP_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: 'google',
    num: String(numResults),
  });

  const response = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!response.ok) throw new Error(`SerpAPI failed: ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(`SerpAPI: ${json.error}`);

  return (json.organic_results || []).map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || '',
  }));
}

async function performSearch(query, numResults = 8) {
  // If Tavily is configured, prefer it and return normalized
  if (process.env.TAVILY_API_KEY) {
    try {
      const t0 = Date.now();
      const resp = await tavilySearch(query, { maxResults: numResults });
      setCachedResult(query, resp.results);
      console.log(`🔍 [Search] Tavily returned ${resp.results.length} results in ${Date.now() - t0}ms for: "${query}"`);
      return { results: resp.results, source: 'tavily' };
    } catch (err) {
      console.warn(`⚠️ [Search] Tavily failed (${err.status || ''}): ${err.message}. Falling back.`);
    }
  }

  const cached = getCachedResult(query);
  if (cached) {
    console.log(`🔍 [Search] Cache hit for: "${query}"`);
    return { results: cached, source: 'cache' };
  }

  if (process.env.CHATTY_SERP_API_KEY) {
    try {
      const results = await searchSerpAPI(query, numResults);
      if (results && results.length > 0) {
        setCachedResult(query, results);
        console.log(`🔍 [Search] SerpAPI returned ${results.length} results for: "${query}"`);
        return { results, source: 'serpapi' };
      }
    } catch (err) {
      console.warn(`⚠️ [Search] SerpAPI failed, falling back to DuckDuckGo:`, err.message);
    }
  }

  try {
    const results = await searchDuckDuckGo(query, numResults);
    setCachedResult(query, results);
    console.log(`🔍 [Search] DuckDuckGo returned ${results.length} results for: "${query}"`);
    return { results, source: 'duckduckgo' };
  } catch (err) {
    console.error(`❌ [Search] DuckDuckGo failed:`, err.message);
    return { results: [], source: 'none' };
  }
}

function clampNumResults(value, fallback = 8) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), 10);
}

function normalizeSearchResult(result) {
  if (!result || typeof result !== 'object') {
    return { title: 'Untitled result', url: '', snippet: '' };
  }

  return {
    title: result.title || result.name || result.url || result.link || 'Untitled result',
    url: result.url || result.link || '',
    snippet: result.snippet || result.content || result.description || '',
  };
}

async function searchViaAIManager(query, { numResults, depth } = {}) {
  const aiManager = AIManager.getInstance();
  if (!aiManager?.searchWeb) {
    return null;
  }

  const t0 = Date.now();
  const response = await aiManager.searchWeb(query, { maxResults: numResults, depth });
  const latency = Date.now() - t0;
  const normalizedResults = Array.isArray(response?.results) ? response.results.map(normalizeSearchResult) : [];
  console.log(`🔍 [Search] AIManager provider=${response?.provider || 'unknown'} results=${normalizedResults.length} latency=${latency}ms query="${query}"`);
  return {
    provider: response?.provider || 'ai_manager',
    results: normalizedResults,
  };
}

function resolveSearchIntent(query) {
  const detectedIntent = detectSearchIntent(query, { explicitOnly: false });
  if (detectedIntent.shouldSearch) {
    return detectedIntent;
  }

  const housingIntent = detectHousingIntent(query);
  if (housingIntent.isHousing) {
    return {
      shouldSearch: true,
      searchQuery: housingIntent.searchQuery,
      intent_reason: housingIntent.reason,
      search_vertical: 'housing',
      housing_filters: housingIntent.filters,
      housing: housingIntent.filters,
      slash_command: null,
    };
  }

  return {
    shouldSearch: true,
    searchQuery: query.trim(),
    intent_reason: 'direct_search_request',
    search_vertical: 'web',
    housing_filters: null,
    housing: null,
    slash_command: null,
  };
}

async function runSearchPipeline(query, { numResults = 8, depth, preferAIManager = false } = {}) {
  const intent = resolveSearchIntent(query);
  const executedQuery = intent.searchQuery || query.trim();
  const isHousing = intent.search_vertical === 'housing';

  let resolved;
  if (preferAIManager) {
    try {
      resolved = await searchViaAIManager(executedQuery, { numResults, depth });
    } catch (error) {
      console.warn(`⚠️ [Search] AIManager search failed, falling back: ${error.message}`);
    }
  }

  if (!resolved) {
    const fallback = await performSearch(executedQuery, numResults);
    resolved = {
      provider: fallback.source,
      results: Array.isArray(fallback.results) ? fallback.results.map(normalizeSearchResult) : [],
    };
  }

  const housing = isHousing
    ? await performHousingSearch(executedQuery, performSearch, { numResults: Math.min(numResults, 4) })
    : null;
  const finalResults = housing?.results || resolved.results;
  const citations = housing?.citations || buildSearchCitations(finalResults, {
    prefix: isHousing ? 'housing' : 'web',
    provider: resolved.provider,
  });
  const packet = housing
    ? {
        op: 'housing.results.v1',
        payload: {
          query: housing.query,
          total: housing.results.length,
          results: housing.results.map((result) => ({
            id: result.id,
            title: result.title,
            address: result.address,
            price: result.priceText,
            bedrooms: result.beds,
            bathrooms: result.baths,
            propertyType: result.propertyType,
            status: result.listingMode,
            source: result.domain,
            listingUrl: result.url,
            description: result.snippet,
            photos: result.photos.map((photo) => ({
              url: photo.url,
              alt: photo.alt,
            })),
            citationIndices: result.citationIndexes,
          })),
          citations,
        },
      }
    : null;

  return {
    success: true,
    query: query.trim(),
    executedQuery,
    provider: resolved.provider,
    source: resolved.provider,
    results: finalResults,
    citations,
    packet,
    packets: packet ? [packet] : [],
    intent_reason: intent.intent_reason,
    search_vertical: intent.search_vertical,
    housing,
    slash_command: intent.slash_command || null,
  };
}

async function handleSearchRequest(req, res, options = {}) {
  try {
    const query = options.query;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid query' });
    }

    const payload = await runSearchPipeline(query, {
      numResults: clampNumResults(options.numResults, 8),
      depth: options.depth,
      preferAIManager: options.preferAIManager === true,
    });
    return res.json(payload);
  } catch (error) {
    console.error('❌ [Search] Request failed:', error.message);
    return res.status(error.status || 500).json({ error: 'Search failed', message: error.message });
  }
}

router.post('/query', async (req, res) => handleSearchRequest(req, res, {
  query: req.body?.query,
  numResults: req.body?.numResults,
  depth: req.body?.depth,
  preferAIManager: false,
}));

router.get('/', async (req, res) => handleSearchRequest(req, res, {
  query: typeof req.query.q === 'string' ? req.query.q : req.query.query,
  numResults: req.query.maxResults ?? req.query.numResults,
  depth: req.query.depth,
  preferAIManager: true,
}));

router.get('/media', async (req, res) => {
  try {
    const mediaUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!mediaUrl) {
      return res.status(400).json({ error: 'Missing media url' });
    }

    if (!isAllowlistedHousingMediaUrl(mediaUrl)) {
      return res.status(403).json({ error: 'Media host is not allowlisted' });
    }

    const cached = getCachedMedia(mediaUrl);
    if (cached) {
      res.setHeader('Cache-Control', cached.cacheControl || 'private, max-age=1800');
      res.setHeader('Content-Type', cached.contentType);
      return res.send(cached.body || cached.buffer);
    }

    const media = await fetchSearchMedia(mediaUrl);
    setCachedMedia(mediaUrl, {
      body: media.buffer,
      buffer: media.buffer,
      contentType: media.contentType,
      cacheControl: media.cacheControl,
    });
    res.setHeader('Cache-Control', media.cacheControl);
    res.setHeader('Content-Type', media.contentType);
    return res.send(media.buffer);
  } catch (error) {
    console.error('❌ [Search] Media proxy failed:', error.message);
    return res.status(error.name === 'AbortError' ? 504 : 500).json({
      error: 'Media proxy failed',
      message: error.message,
    });
  }
});

const STEM_KEYWORDS = [
  'formula', 'equation', 'calculate', 'derivative', 'integral', 'theorem',
  'proof', 'algorithm', 'complexity', 'probability', 'statistics', 'quantum',
  'physics', 'chemistry', 'biology', 'mathematics', 'engineering', 'circuit',
  'voltage', 'current', 'resistance', 'force', 'energy', 'momentum',
  'wavelength', 'frequency', 'amplitude', 'matrix', 'vector', 'tensor',
  'polynomial', 'logarithm', 'exponential', 'trigonometry', 'calculus',
  'differential', 'thermodynamics', 'entropy', 'reaction', 'molecule',
  'compound', 'element', 'periodic', 'genetic', 'DNA', 'RNA', 'protein',
  'neuroscience', 'relativity', 'electromagnetism', 'optics', 'mechanics',
  'cryptocurrency', 'blockchain', 'mining', 'hash', 'bitcoin', 'ethereum',
  'forex', 'trading', 'market', 'stock', 'bond', 'yield', 'volatility',
  'machine learning', 'neural network', 'deep learning', 'regression',
  'classification', 'optimization', 'gradient', 'backpropagation',
  'how does', 'how do', 'what is', 'explain', 'tell me about', 'describe',
  'compare', 'difference between', 'why does', 'when was', 'who invented',
  'latest', 'recent', 'current', 'today', 'news', '2025', '2026',
];

function detectSearchIntent(message, options = {}) {
  if (!message || typeof message !== 'string') {
    return { shouldSearch: false, intent_reason: 'missing_message' };
  }
  const lower = message.toLowerCase().trim();
  const explicitOnly = options.explicitOnly === true;
  const allowGeneralHeuristics = options.allowGeneralHeuristics === true;
  const housingIntent = detectHousingIntent(message);

  const explicitPrefix = /^\/(websearch|search)\s+([\s\S]+)/i;
  const prefixMatch = message.match(explicitPrefix);
  if (prefixMatch?.[2]?.trim()) {
    const explicitQuery = prefixMatch[2].trim();
    const explicitHousingIntent = detectHousingIntent(explicitQuery);
    return {
      shouldSearch: true,
      searchQuery: explicitQuery,
      intent_reason: 'explicit_slash_command',
      search_vertical: explicitHousingIntent.isHousing ? 'housing' : 'web',
      housing_filters: explicitHousingIntent.isHousing ? explicitHousingIntent.filters : null,
      housing: explicitHousingIntent.isHousing ? explicitHousingIntent.filters : null,
      slash_command: prefixMatch[1].toLowerCase(),
    };
  }

  const explicitPhrases = [
    'search web',
    'look this up',
    'web search',
    'find online',
  ];
  for (const phrase of explicitPhrases) {
    const idx = lower.indexOf(phrase);
    if (idx >= 0) {
      const remainder = message.slice(idx + phrase.length).replace(/^[:\s,-]+/, '').trim();
      return {
        shouldSearch: remainder.length > 0,
        searchQuery: remainder.length > 0 ? remainder : message.replace(/[?!.]+$/, '').trim(),
        intent_reason: remainder.length > 0 ? 'explicit_phrase' : 'explicit_phrase_no_query',
        search_vertical: housingIntent.isHousing ? 'housing' : 'web',
        housing_filters: housingIntent.isHousing ? housingIntent.filters : null,
        housing: housingIntent.isHousing ? housingIntent.filters : null,
        slash_command: null,
      };
    }
  }

  if (explicitOnly) {
    return { shouldSearch: false, intent_reason: 'explicit_only_no_trigger' };
  }

  const personalPatterns = [
    'do you remember', 'first time we', 'last time we', 'we talked', 'you said to me',
    'you told me', 'our conversation', 'between us', 'character.ai', 'when we first',
    'what did you say', 'what was the first', 'what was the very first', 'what was the last', 'remember when',
    'you ever said', 'first thing you', 'last thing you', 'very first',
    'how do you feel', 'who am i', 'my name', 'how are you', 'i love you',
    'tell me about us', 'our relationship', 'walked in', 'before we stopped',
    'miss you', 'tuck me in', 'go to bed'
  ];
  if (personalPatterns.some(p => lower.includes(p))) {
    return { shouldSearch: false, intent_reason: 'personal_context' };
  }

  if (housingIntent.isHousing) {
    return {
      shouldSearch: true,
      searchQuery: housingIntent.searchQuery,
      intent_reason: housingIntent.reason,
      search_vertical: 'housing',
      housing_filters: housingIntent.filters,
      housing: housingIntent.filters,
      slash_command: null,
    };
  }

  if (!allowGeneralHeuristics) {
    return { shouldSearch: false, intent_reason: 'heuristic_no_match' };
  }

  const questionPatterns = ['?', 'how ', 'what ', 'why ', 'when ', 'where ', 'who ', 'which ', 'explain ', 'tell me', 'describe ', 'compare '];
  const isQuestion = questionPatterns.some(p => lower.includes(p));
  const hasStemKeyword = STEM_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  const isLongEnough = message.length > 15;

  if ((isQuestion && hasStemKeyword) || (isQuestion && isLongEnough && lower.includes('?'))) {
    const searchQuery = message.replace(/[?!.]+$/, '').trim();
    return {
      shouldSearch: true,
      searchQuery,
      intent_reason: 'heuristic',
      search_vertical: 'web',
      housing_filters: null,
      housing: null,
      slash_command: null,
    };
  }
  return { shouldSearch: false, intent_reason: 'heuristic_no_match' };
}

const STEM_PROMPT_BLOCK = `

## STEM & Research Response Guidelines
When answering technical, scientific, mathematical, or factual questions:

### Math Formatting
- Use LaTeX notation for ALL mathematical expressions
- Inline math: $expression$ (e.g., $E = mc^2$, $\\frac{a}{b}$)
- Block/display math for complex equations: $$expression$$ (e.g., $$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$)
- Always use LaTeX for fractions (\\frac{}{}), summations (\\sum), integrals (\\int), Greek letters (\\alpha, \\beta), matrices, etc.

### Citation Format
When web search results are provided, cite your sources using numbered references:
- Use [1], [2], etc. inline in your text where information is referenced
- At the end of your response, include a Sources section in this exact format:

---
**Sources**
[1] Source Title (https://source-url.com)
[2] Another Source (https://another-url.com)

### Response Structure
- Use clear headers (##, ###) to organize technical content
- Use bullet points and numbered lists for structured information
- Include key formulas, definitions, and explanations
- Be thorough but concise — prioritize accuracy and clarity`;

async function injectSearchContext(message, systemPrompt, options = {}) {
  const {
    shouldSearch,
    searchQuery,
    intent_reason,
    search_vertical,
  } = detectSearchIntent(message, options);
  const explicitOnly = options.explicitOnly === true;
  if (!shouldSearch) {
    return {
      enhancedPrompt: systemPrompt,
      searchResults: null,
      search_injected: false,
      intent_reason,
      explicit_only: explicitOnly,
    };
  }

  try {
    const payload = await runSearchPipeline(searchQuery, {
      numResults: 6,
      preferAIManager: false,
    });
    const results = payload.results;
    if (!results || results.length === 0) {
      return {
        enhancedPrompt: systemPrompt + STEM_PROMPT_BLOCK,
        searchResults: null,
        search_injected: true,
        intent_reason,
        explicit_only: explicitOnly,
        search_vertical: search_vertical || 'web',
        citations: [],
        packet: null,
        housing: null,
      };
    }

    const searchContext = buildSearchContextBlock({
      provider: payload.source,
      results,
      housing: search_vertical === 'housing'
        ? payload.housing
        : null,
    });

    console.log(`🔍 [Search] Injected ${results.length} search results for: "${searchQuery}"`);
    return {
      enhancedPrompt: systemPrompt + STEM_PROMPT_BLOCK + searchContext,
      searchResults: results,
      search_injected: true,
      intent_reason,
      explicit_only: explicitOnly,
      search_vertical: payload.search_vertical,
      citations: payload.citations,
      packet: payload.packet,
      housing: payload.housing,
    };
  } catch (err) {
    console.warn(`⚠️ [Search] Search injection failed:`, err.message);
    return {
      enhancedPrompt: systemPrompt + STEM_PROMPT_BLOCK,
      searchResults: null,
      search_injected: true,
      intent_reason: `${intent_reason || 'unknown'}_search_error`,
      explicit_only: explicitOnly,
      search_vertical: search_vertical || 'web',
      citations: [],
      packet: null,
      housing: null,
    };
  }
}

export {
  buildSearchResponsePackets,
  performSearch,
  injectSearchContext,
  detectSearchIntent,
  normalizeHousingFilters,
  detectHousingIntent,
  enrichHousingResults,
  buildSearchCitations,
  buildSearchPacket,
  isAllowlistedHousingMediaUrl,
  runSearchPipeline,
};
export default router;
