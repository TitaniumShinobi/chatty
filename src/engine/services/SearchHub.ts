// SearchHub.ts – central registry & facade for web search plugins
import { WebSearchPlugin, SearchResult, SearchEngine } from './WebSearchPlugin.js';
import { DefaultWebSearchPlugin } from './DefaultWebSearchPlugin.js';

class SearchHubClass {
  private plugins: WebSearchPlugin[] = [];

  constructor() {
    // register default plugin
    this.plugins.push(DefaultWebSearchPlugin);
  }

  register(plugin: WebSearchPlugin) {
    this.plugins.push(plugin);
  }

  async query(text: string, opts: { engine: SearchEngine; num?: number }): Promise<SearchResult[]> {
    const plugin = this.plugins.find(p => p.canHandle(opts.engine)) ?? DefaultWebSearchPlugin;
    return plugin.query(text, opts);
  }
}

export const SearchHub = new SearchHubClass();
