// DefaultWebSearchPlugin.ts – SerpAPI-backed implementation
import { WebSearchPlugin, SearchResult, SearchEngine } from './WebSearchPlugin.js';
import type { IncomingHttpHeaders } from 'http';

const API_URL = 'https://serpapi.com/search.json';

function buildURL(q: string, key: string, engine: SearchEngine, num: number) {
  const params = new URLSearchParams({ q, api_key: key, engine, num: String(num) });
  return `${API_URL}?${params.toString()}`;
}

export const DefaultWebSearchPlugin: WebSearchPlugin = {
  canHandle: (engine: string) => true, // fallback handles any engine string

  async query(text: string, opts: { engine: SearchEngine; num?: number }): Promise<SearchResult[]> {
    const key = process.env.CHATTY_SERP_API_KEY;
    if (!key) throw new Error('Missing CHATTY_SERP_API_KEY');

    const url = buildURL(text, key, opts.engine, opts.num ?? 10);
    const res = await fetch(url, { headers: { 'User-Agent': 'chatty-bot' } as IncomingHttpHeaders });
    if (!res.ok) throw new Error(`SerpAPI request failed: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`SerpAPI: ${json.error}`);
    const organic = json.organic_results ?? [];
    return organic.map((o: any) => ({ title: o.title, link: o.link, snippet: o.snippet }));
  },
};
