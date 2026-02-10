/**
 * Anchor Indexer
 * 
 * Fast indexing and retrieval system for memory anchors
 * Supports fuzzy matching, semantic search, and strict validation
 * Designed for zero false positives in transcript recall
 */

import type { ExtractedAnchor } from './EnhancedAnchorExtractor';

export interface IndexedAnchor extends ExtractedAnchor {
  id: string;
  searchTokens: string[];
  semanticVector?: number[];
  lastAccessed?: string;
  accessCount: number;
}

export interface SearchQuery {
  text: string;
  type?: string;
  keywords?: string[];
  minSignificance?: number;
  maxResults?: number;
  fuzzyMatch?: boolean;
}

export interface SearchResult {
  anchor: IndexedAnchor;
  score: number;
  matchReason: string;
  matchedTokens: string[];
}

export class AnchorIndexer {
  private anchors: Map<string, IndexedAnchor> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private textIndex: Map<string, Set<string>> = new Map();
  private significanceIndex: Map<number, Set<string>> = new Map();

  /**
   * Add anchors to the index
   */
  addAnchors(anchors: ExtractedAnchor[]): void {
    for (const anchor of anchors) {
      const indexed = this.createIndexedAnchor(anchor);
      this.anchors.set(indexed.id, indexed);
      this.updateIndices(indexed);
    }
  }

  /**
   * Create an indexed anchor with search tokens
   */
  private createIndexedAnchor(anchor: ExtractedAnchor): IndexedAnchor {
    const id = this.generateId(anchor);
    const searchTokens = this.generateSearchTokens(anchor);
    
    return {
      ...anchor,
      id,
      searchTokens,
      accessCount: 0
    };
  }

  /**
   * Generate unique ID for anchor
   */
  private generateId(anchor: ExtractedAnchor): string {
    const content = `${anchor.type}-${anchor.pairIndex}-${anchor.anchor.substring(0, 50)}`;
    // Browser-compatible base64 encoding
    return btoa(content).substring(0, 16);
  }

  /**
   * Generate search tokens for fast lookup
   */
  private generateSearchTokens(anchor: ExtractedAnchor): string[] {
    const tokens = new Set<string>();
    
    // Add anchor text tokens
    const anchorWords = anchor.anchor.toLowerCase().match(/\b\w+\b/g) || [];
    anchorWords.forEach(word => tokens.add(word));
    
    // Add context tokens
    const contextWords = anchor.context?.toLowerCase().match(/\b\w+\b/g) || [];
    contextWords.forEach(word => tokens.add(word));
    
    // Add related anchor tokens
    if (anchor.relatedAnchors) {
      anchor.relatedAnchors.forEach(related => {
        const relatedWords = related.toLowerCase().match(/\b\w+\b/g) || [];
        relatedWords.forEach(word => tokens.add(word));
      });
    }
    
    // Add type token
    tokens.add(anchor.type);
    
    return Array.from(tokens);
  }

  /**
   * Update all indices with new anchor
   */
  private updateIndices(anchor: IndexedAnchor): void {
    // Type index
    if (!this.typeIndex.has(anchor.type)) {
      this.typeIndex.set(anchor.type, new Set());
    }
    this.typeIndex.get(anchor.type)!.add(anchor.id);
    
    // Keyword index
    for (const token of anchor.searchTokens) {
      if (!this.keywordIndex.has(token)) {
        this.keywordIndex.set(token, new Set());
      }
      this.keywordIndex.get(token)!.add(anchor.id);
    }
    
    // Text index (for exact matches)
    const textKey = anchor.anchor.toLowerCase();
    if (!this.textIndex.has(textKey)) {
      this.textIndex.set(textKey, new Set());
    }
    this.textIndex.get(textKey)!.add(anchor.id);
    
    // Significance index
    const sigBucket = Math.floor(anchor.significance * 10) / 10; // Round to 0.1
    if (!this.significanceIndex.has(sigBucket)) {
      this.significanceIndex.set(sigBucket, new Set());
    }
    this.significanceIndex.get(sigBucket)!.add(anchor.id);
  }

  /**
   * Search for anchors matching query
   */
  search(query: SearchQuery): SearchResult[] {
    const results: SearchResult[] = [];
    const candidateIds = this.getCandidateIds(query);
    
    for (const id of candidateIds) {
      const anchor = this.anchors.get(id);
      if (!anchor) continue;
      
      const result = this.scoreAnchor(anchor, query);
      if (result.score > 0) {
        results.push(result);
        
        // Update access tracking
        anchor.accessCount++;
        anchor.lastAccessed = new Date().toISOString();
      }
    }
    
    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    
    if (query.maxResults) {
      return results.slice(0, query.maxResults);
    }
    
    return results;
  }

  /**
   * Get candidate anchor IDs based on query
   */
  private getCandidateIds(query: SearchQuery): Set<string> {
    const candidates = new Set<string>();
    
    // Search by type
    if (query.type && this.typeIndex.has(query.type)) {
      this.typeIndex.get(query.type)!.forEach(id => candidates.add(id));
    }
    
    // Search by keywords
    const queryTokens = query.text.toLowerCase().match(/\b\w+\b/g) || [];
    for (const token of queryTokens) {
      if (this.keywordIndex.has(token)) {
        this.keywordIndex.get(token)!.forEach(id => candidates.add(id));
      }
    }
    
    // Search by explicit keywords
    if (query.keywords) {
      for (const keyword of query.keywords) {
        const keywordTokens = keyword.toLowerCase().match(/\b\w+\b/g) || [];
        for (const token of keywordTokens) {
          if (this.keywordIndex.has(token)) {
            this.keywordIndex.get(token)!.forEach(id => candidates.add(id));
          }
        }
      }
    }
    
    // If no candidates found, search all anchors (fallback)
    if (candidates.size === 0) {
      this.anchors.forEach((_, id) => candidates.add(id));
    }
    
    return candidates;
  }

  /**
   * Score an anchor against a query
   */
  private scoreAnchor(anchor: IndexedAnchor, query: SearchQuery): SearchResult {
    let score = 0;
    const matchedTokens: string[] = [];
    const reasons: string[] = [];
    
    // Significance filter
    if (query.minSignificance && anchor.significance < query.minSignificance) {
      return {
        anchor,
        score: 0,
        matchReason: 'Below minimum significance threshold',
        matchedTokens: []
      };
    }
    
    // Type match
    if (query.type && anchor.type === query.type) {
      score += 0.3;
      reasons.push('type match');
    }
    
    // Text similarity
    const queryTokens = query.text.toLowerCase().match(/\b\w+\b/g) || [];
    const matchingTokens = queryTokens.filter(token => 
      anchor.searchTokens.includes(token)
    );
    
    if (matchingTokens.length > 0) {
      const tokenScore = matchingTokens.length / queryTokens.length;
      score += tokenScore * 0.4;
      matchedTokens.push(...matchingTokens);
      reasons.push(`${matchingTokens.length}/${queryTokens.length} tokens matched`);
    }
    
    // Exact phrase match (high score)
    if (anchor.anchor.toLowerCase().includes(query.text.toLowerCase())) {
      score += 0.5;
      reasons.push('exact phrase match');
    }
    
    // Keyword match
    if (query.keywords) {
      const keywordMatches = query.keywords.filter(keyword =>
        anchor.searchTokens.some(token => 
          token.includes(keyword.toLowerCase()) || 
          keyword.toLowerCase().includes(token)
        )
      );
      
      if (keywordMatches.length > 0) {
        score += (keywordMatches.length / query.keywords.length) * 0.3;
        reasons.push(`${keywordMatches.length} keyword matches`);
      }
    }
    
    // Fuzzy matching
    if (query.fuzzyMatch) {
      const fuzzyScore = this.calculateFuzzyScore(query.text, anchor.anchor);
      if (fuzzyScore > 0.6) {
        score += fuzzyScore * 0.2;
        reasons.push(`fuzzy match: ${fuzzyScore.toFixed(2)}`);
      }
    }
    
    // Boost for high significance
    score += anchor.significance * 0.1;
    
    // Boost for recent access (recency bias)
    if (anchor.lastAccessed) {
      const daysSinceAccess = (Date.now() - new Date(anchor.lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAccess < 7) {
        score += 0.05;
        reasons.push('recently accessed');
      }
    }
    
    return {
      anchor,
      score,
      matchReason: reasons.join(', '),
      matchedTokens
    };
  }

  /**
   * Calculate fuzzy similarity score
   */
  private calculateFuzzyScore(query: string, text: string): number {
    const queryWords = new Set(query.toLowerCase().match(/\b\w+\b/g) || []);
    const textWords = new Set(text.toLowerCase().match(/\b\w+\b/g) || []);
    
    const intersection = new Set([...queryWords].filter(word => textWords.has(word)));
    const union = new Set([...queryWords, ...textWords]);
    
    return intersection.size / union.size;
  }

  /**
   * Get anchors by exact type
   */
  getByType(type: string): IndexedAnchor[] {
    const ids = this.typeIndex.get(type) || new Set();
    return Array.from(ids).map(id => this.anchors.get(id)!).filter(Boolean);
  }

  /**
   * Get high significance anchors
   */
  getHighSignificance(threshold: number = 0.8): IndexedAnchor[] {
    const results: IndexedAnchor[] = [];
    
    for (const [sig, ids] of this.significanceIndex.entries()) {
      if (sig >= threshold) {
        for (const id of ids) {
          const anchor = this.anchors.get(id);
          if (anchor) results.push(anchor);
        }
      }
    }
    
    return results.sort((a, b) => b.significance - a.significance);
  }

  /**
   * Get anchors for specific validation test
   */
  getForValidation(testType: string, keywords: string[]): IndexedAnchor[] {
    const query: SearchQuery = {
      text: keywords.join(' '),
      keywords,
      minSignificance: 0.5,
      maxResults: 10,
      fuzzyMatch: true
    };
    
    const results = this.search(query);
    return results.map(r => r.anchor);
  }

  /**
   * Clear all indices
   */
  clear(): void {
    this.anchors.clear();
    this.typeIndex.clear();
    this.keywordIndex.clear();
    this.textIndex.clear();
    this.significanceIndex.clear();
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalAnchors: number;
    typeBreakdown: Record<string, number>;
    averageSignificance: number;
    mostAccessedAnchors: IndexedAnchor[];
  } {
    const anchors = Array.from(this.anchors.values());
    const typeBreakdown: Record<string, number> = {};
    
    for (const anchor of anchors) {
      typeBreakdown[anchor.type] = (typeBreakdown[anchor.type] || 0) + 1;
    }
    
    const avgSignificance = anchors.reduce((sum, a) => sum + a.significance, 0) / anchors.length;
    
    const mostAccessed = anchors
      .filter(a => a.accessCount > 0)
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 5);
    
    return {
      totalAnchors: anchors.length,
      typeBreakdown,
      averageSignificance: avgSignificance || 0,
      mostAccessedAnchors: mostAccessed
    };
  }

  /**
   * Export anchors for backup/analysis
   */
  exportAnchors(): IndexedAnchor[] {
    return Array.from(this.anchors.values());
  }

  /**
   * Import anchors from backup
   */
  importAnchors(anchors: IndexedAnchor[]): void {
    this.clear();
    for (const anchor of anchors) {
      this.anchors.set(anchor.id, anchor);
      this.updateIndices(anchor);
    }
  }
}
