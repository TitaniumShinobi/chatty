import express from 'express';

const router = express.Router();

const searchCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

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

router.post('/query', async (req, res) => {
  try {
    const { query, numResults = 8 } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid query' });
    }

    const { results, source } = await performSearch(query.trim(), numResults);
    return res.json({ success: true, results, source, query: query.trim() });
  } catch (error) {
    console.error('❌ [Search] Query failed:', error.message);
    return res.status(500).json({ error: 'Search failed', message: error.message });
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

function detectSearchIntent(message) {
  if (!message || typeof message !== 'string') return { shouldSearch: false };
  const lower = message.toLowerCase();

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
    return { shouldSearch: false };
  }

  const questionPatterns = ['?', 'how ', 'what ', 'why ', 'when ', 'where ', 'who ', 'which ', 'explain ', 'tell me', 'describe ', 'compare '];
  const isQuestion = questionPatterns.some(p => lower.includes(p));
  const hasStemKeyword = STEM_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  const isLongEnough = message.length > 15;

  if ((isQuestion && hasStemKeyword) || (isQuestion && isLongEnough && lower.includes('?'))) {
    const searchQuery = message.replace(/[?!.]+$/, '').trim();
    return { shouldSearch: true, searchQuery };
  }
  return { shouldSearch: false };
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

async function injectSearchContext(message, systemPrompt) {
  const { shouldSearch, searchQuery } = detectSearchIntent(message);
  if (!shouldSearch) {
    return { enhancedPrompt: systemPrompt + STEM_PROMPT_BLOCK, searchResults: null };
  }

  try {
    const { results, source } = await performSearch(searchQuery, 6);
    if (!results || results.length === 0) {
      return { enhancedPrompt: systemPrompt + STEM_PROMPT_BLOCK, searchResults: null };
    }

    let searchContext = `\n\n## Web Search Results (${source})\nThe following search results are relevant to the user's question. Use them to provide accurate, up-to-date information and cite sources using [1], [2], etc.\n`;
    results.forEach((r, i) => {
      searchContext += `\n[${i + 1}] **${r.title}**\nURL: ${r.url}\n${r.snippet}\n`;
    });

    console.log(`🔍 [Search] Injected ${results.length} search results for: "${searchQuery}"`);
    return {
      enhancedPrompt: systemPrompt + STEM_PROMPT_BLOCK + searchContext,
      searchResults: results,
    };
  } catch (err) {
    console.warn(`⚠️ [Search] Search injection failed:`, err.message);
    return { enhancedPrompt: systemPrompt + STEM_PROMPT_BLOCK, searchResults: null };
  }
}

export { performSearch, injectSearchContext, detectSearchIntent };
export default router;
