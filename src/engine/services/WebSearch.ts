// SerpAPI web search service for Chatty
import type { IncomingHttpHeaders } from "http";

export interface WebResult {
  title: string;
  link: string;
  snippet: string;
}

export type SerpEngine =
  | "google"
  | "bing"
  | "duckduckgo"
  | "google_news"
  | "youtube"
  | "google_scholar";

const API_URL = "https://serpapi.com/search.json";

function buildURL(q: string, key: string, engine: SerpEngine, num: number) {
  const params = new URLSearchParams({
    q,
    api_key: key,
    engine,
    num: String(num),
  });
  return `${API_URL}?${params.toString()}`;
}

export async function webSearch(
  query: string,
  opts: { engine?: SerpEngine; num?: number } = {}
): Promise<WebResult[]> {
  const key = process.env.CHATTY_SERP_API_KEY;
  if (!key) throw new Error("Missing CHATTY_SERP_API_KEY env var");

  const url = buildURL(query, key, opts.engine ?? "google", opts.num ?? 10);
  const res = await fetch(url, { headers: { "User-Agent": "chatty-bot" } as IncomingHttpHeaders });
  if (!res.ok) throw new Error(`SerpAPI request failed: ${res.status}`);
  const json = await res.json();
  if (json.error) {
    throw new Error(`SerpAPI: ${json.error}`);
  }
  const organic = json.organic_results ?? [];
  return organic.map((o: any) => ({ title: o.title, link: o.link, snippet: o.snippet }));
}
