// WebSearchPlugin.ts
import type { IncomingHttpHeaders } from 'http';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export type SearchEngine =
  | 'google'
  | 'bing'
  | 'duckduckgo'
  | 'google_news'
  | 'youtube'
  | 'google_scholar';

export interface WebSearchPlugin {
  /** Return true if plugin can satisfy given engine string */
  canHandle(engine: string): boolean;
  query(text: string, opts: { engine: SearchEngine; num?: number }): Promise<SearchResult[]>;
}
