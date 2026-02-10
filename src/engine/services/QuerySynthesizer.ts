// QuerySynthesizer.ts
// Generates optimized search queries from user text and merges search results.

import { SearchHub } from './SearchHub.js';
import type { SearchEngine, SearchResult } from './WebSearchPlugin.js';

const STOPWORDS = new Set(['the','is','are','of','a','an','to','for','with','and','or','in','on','about','what','who','why','when','how','does','do','did','can']);

export class QuerySynthesizer {
  /** Generate up to 3 search queries */
  static generate(text: string): string[] {
    const words = text.toLowerCase().split(/[^\w]+/).filter(Boolean);
    const keywords = words.filter(w => !STOPWORDS.has(w)).slice(0, 6);
    if (keywords.length === 0) return [text];

    const base = keywords.join(' ');
    return [
      base,
      `${base} summary`,
      `explain ${base}`
    ];
  }

  /** Performs search for each query and flattens into deduped results */
  static async search(text: string, engine: SearchEngine = 'google'): Promise<SearchResult[]> {
    const queries = QuerySynthesizer.generate(text);
    const all: SearchResult[] = [];
    for (const q of queries) {
      try {
        const res = await SearchHub.query(q, { engine, num: 5 });
        all.push(...res);
      } catch {}
    }
    // Deduplicate by link
    const seen = new Set<string>();
    return all.filter(r => {
      if (seen.has(r.link)) return false;
      seen.add(r.link);
      return true;
    }).slice(0, 5);
  }

  /** Merge snippets into a single paragraph */
  static mergeSnippets(results: SearchResult[]): string {
    return results.map(r => r.snippet).filter(Boolean).join(' ');
  }
}
