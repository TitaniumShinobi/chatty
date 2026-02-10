// Unified Semantic Retrieval - Memory and File Integration
// Combines memory system and large file intelligence for unified semantic search

import { MemoryLedger, MemoryEntry, MemoryQuery } from './memoryLedger';
import { Chunk } from './chunkingEngine';
import { SemanticRetrievalService, VectorStore, EmbeddingResult, SemanticQuery, RetrievalResult } from './semanticRetrieval';
import { SymbolicReasoningEngine, SymbolicQuery, SymbolicPattern, Motif, Theme, SymbolicInsight } from './symbolicReasoning';
import { NarrativeSynthesisEngine, NarrativeQuery, MultiDocumentSynthesis } from './narrativeSynthesis';
import { pkt } from './emit';
import { lexicon as lex } from '../data/lexicon';

export interface UnifiedSearchResult {
  memories: MemoryEntry[];
  chunks: Chunk[];
  combinedResults: Array<{
    type: 'memory' | 'chunk';
    id: string;
    content: string;
    relevance: number;
    source: string;
    metadata: Record<string, any>;
  }>;
  totalFound: number;
  searchTime: number;
  breakdown: {
    memoryCount: number;
    chunkCount: number;
    averageMemoryRelevance: number;
    averageChunkRelevance: number;
  };
  // Symbolic reasoning results
  symbolicAnalysis?: {
    patterns: SymbolicPattern[];
    motifs: Motif[];
    themes: Theme[];
    insights: SymbolicInsight[];
    analysisTime: number;
  };
  // Narrative synthesis results
  narrativeSynthesis?: {
    narrative: string;
    storyArcs: any[];
    scaffolds: any[];
    frames: any[];
    insights: any[];
    synthesisTime: number;
  };
}

export interface UnifiedQuery {
  query: string;
  userId: string;
  sessionId?: string;
  filters?: {
    // Memory filters
    memoryTypes?: MemoryEntry['type'][];
    memoryCategories?: string[];
    memoryTags?: string[];
    minMemoryImportance?: number;
    minMemoryRelevance?: number;
    includeFileMemories?: boolean;
    // File filters
    documentIds?: string[];
    documentTypes?: string[];
    fileNames?: string[];
    // Combined filters
    semanticThreshold: number;
    maxResults: number;
  };
  options: {
    includeMemories: boolean;
    includeChunks: boolean;
    unifyResults: boolean;
    rerankCombined: boolean;
    includeMetadata: boolean;
    // Symbolic reasoning options
    enableSymbolicAnalysis?: boolean;
    detectPatterns?: boolean;
    synthesizeMotifs?: boolean;
    inferThemes?: boolean;
    trackAnchors?: boolean;
    // Narrative synthesis options
    enableNarrativeSynthesis?: boolean;
    generateStoryArcs?: boolean;
    createScaffolding?: boolean;
    applySymbolicFraming?: boolean;
    detailLevel?: 'summary' | 'detailed' | 'comprehensive';
  };
}

export interface MemoryChunkLink {
  memoryId: string;
  chunkId: string;
  linkType: 'direct' | 'semantic' | 'anchor' | 'motif';
  confidence: number;
  metadata: Record<string, any>;
}

export interface FileProcessingEvent {
  type: 'file_uploaded' | 'file_processed' | 'chunks_created' | 'memories_extracted';
  documentId: string;
  fileName: string;
  fileType: string;
  userId: string;
  sessionId: string;
  metadata: {
    chunkCount?: number;
    memoryCount?: number;
    anchorsFound?: number;
    motifsFound?: number;
    processingTime?: number;
  };
}

export class UnifiedSemanticRetrieval {
  private memoryLedger: MemoryLedger;
  private semanticRetrieval: SemanticRetrievalService;
  private vectorStore: VectorStore;
  private symbolicReasoning: SymbolicReasoningEngine;
  private narrativeSynthesis: NarrativeSynthesisEngine;
  private memoryChunkLinks: Map<string, MemoryChunkLink[]> = new Map();
  private packetEmitter?: (packet: any) => void;

  constructor(
    memoryLedger: MemoryLedger,
    semanticRetrieval: SemanticRetrievalService,
    vectorStore: VectorStore
  ) {
    this.memoryLedger = memoryLedger;
    this.semanticRetrieval = semanticRetrieval;
    this.vectorStore = vectorStore;
    this.symbolicReasoning = new SymbolicReasoningEngine();
    this.narrativeSynthesis = new NarrativeSynthesisEngine();
  }

  /**
   * Set packet emitter for real-time feedback
   */
  setPacketEmitter(emitter: (packet: any) => void): void {
    this.packetEmitter = emitter;
    this.symbolicReasoning.setPacketEmitter(emitter);
    this.narrativeSynthesis.setPacketEmitter(emitter);
  }

  /**
   * Perform unified search across memories and file chunks
   */
  async unifiedSearch(query: UnifiedQuery): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    const results: UnifiedSearchResult = {
      memories: [],
      chunks: [],
      combinedResults: [],
      totalFound: 0,
      searchTime: 0,
      breakdown: {
        memoryCount: 0,
        chunkCount: 0,
        averageMemoryRelevance: 0,
        averageChunkRelevance: 0
      }
    };

    try {
      // Search memories if enabled
      if (query.options.includeMemories) {
        const memoryResults = await this.searchMemories(query);
        results.memories = memoryResults;
        results.breakdown.memoryCount = memoryResults.length;

        if (memoryResults.length > 0) {
          const avgRelevance = memoryResults.reduce((sum, m) => sum + m.metadata.relevance, 0) / memoryResults.length;
          results.breakdown.averageMemoryRelevance = avgRelevance;
        }
      }

      // Search chunks if enabled
      if (query.options.includeChunks) {
        const chunkResults = await this.searchChunks(query);
        results.chunks = chunkResults;
        results.breakdown.chunkCount = chunkResults.length;

        if (chunkResults.length > 0) {
          const avgRelevance = chunkResults.reduce((sum, c) => sum + (c.metadata.semanticScore || 0), 0) / chunkResults.length;
          results.breakdown.averageChunkRelevance = avgRelevance;
        }
      }

      // Unify results if requested
      if (query.options.unifyResults) {
        results.combinedResults = await this.unifyResults(
          results.memories,
          results.chunks,
          query
        );
      }

      // Perform symbolic analysis if enabled
      if (query.options.enableSymbolicAnalysis) {
        const symbolicStartTime = Date.now();
        const symbolicResults = await this.performSymbolicAnalysis(
          results.memories,
          results.chunks,
          query
        );
        results.symbolicAnalysis = {
          ...symbolicResults,
          analysisTime: Date.now() - symbolicStartTime
        };

        // Perform narrative synthesis if enabled
        if (query.options.enableNarrativeSynthesis) {
          const narrativeStartTime = Date.now();
          const narrativeResults = await this.performNarrativeSynthesis(
            results.memories,
            results.chunks,
            symbolicResults,
            query
          );
          results.narrativeSynthesis = {
            ...narrativeResults,
            synthesisTime: Date.now() - narrativeStartTime
          };
        }
      }

      results.totalFound = results.memories.length + results.chunks.length;
      results.searchTime = Date.now() - startTime;

      // Emit search completion packet
      this.emitPacket(pkt('semantic_search_complete', {
        query: query.query,
        totalFound: results.totalFound,
        memoryCount: results.breakdown.memoryCount,
        chunkCount: results.breakdown.chunkCount,
        searchTime: results.searchTime
      }));

      return results;
    } catch (error) {
      console.error('Unified search failed:', error);
      throw error;
    }
  }

  /**
   * Search memories with semantic relevance
   */
  private async searchMemories(query: UnifiedQuery): Promise<MemoryEntry[]> {
    const memoryQuery: MemoryQuery = {
      userId: query.userId,
      sessionId: query.sessionId,
      types: query.filters?.memoryTypes,
      categories: query.filters?.memoryCategories,
      tags: query.filters?.memoryTags,
      minImportance: query.filters?.minMemoryImportance,
      minRelevance: query.filters?.minMemoryRelevance,
      includeFileMemories: query.filters?.includeFileMemories,
      limit: query.filters?.maxResults || 50
    };

    // Add semantic search if threshold is specified
    if (query.filters?.semanticThreshold) {
      memoryQuery.semanticSearch = {
        query: query.query,
        threshold: query.filters.semanticThreshold
      };
    }

    const memories = this.memoryLedger.queryMemories(memoryQuery);

    // Apply semantic relevance scoring
    const scoredMemories = memories.map(memory => ({
      memory,
      score: this.calculateSemanticRelevance(memory.content, query.query)
    }));

    // Filter by semantic threshold
    const threshold = query.filters?.semanticThreshold || 0.3;
    const filteredMemories = scoredMemories
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .map(item => item.memory);

    return filteredMemories.slice(0, query.filters?.maxResults || 50);
  }

  /**
   * Search file chunks with semantic retrieval
   */
  private async searchChunks(query: UnifiedQuery): Promise<Chunk[]> {
    const semanticQuery: SemanticQuery = {
      query: query.query,
      filters: {
        documentIds: query.filters?.documentIds,
        documentTypes: query.filters?.documentTypes,
        complexity: 'medium'
      },
      options: {
        topK: query.filters?.maxResults || 50,
        similarityThreshold: query.filters?.semanticThreshold || 0.3,
        includeMetadata: query.options.includeMetadata,
        rerank: query.options.rerankCombined
      }
    };

    const retrievalResult = await this.semanticRetrieval.search(semanticQuery);

    // Convert ContextMatch to Chunk format
    const chunks: Chunk[] = retrievalResult.matches.map(match => ({
      id: match.chunk.id,
      content: match.chunk.content,
      startIndex: 0,
      endIndex: match.chunk.content.length,
      metadata: {
        wordCount: match.chunk.metadata.wordCount,
        characterCount: match.chunk.content.length,
        keywords: match.chunk.metadata.keywords || [],
        semanticScore: match.similarity,
        documentId: match.chunk.metadata.documentId,
        fileName: match.chunk.metadata.fileName,
        fileType: match.chunk.metadata.fileType
      },
      context: {}
    }));

    return chunks;
  }

  /**
   * Unify memory and chunk results
   */
  private async unifyResults(
    memories: MemoryEntry[],
    chunks: Chunk[],
    query: UnifiedQuery
  ): Promise<UnifiedSearchResult['combinedResults']> {
    const combined: UnifiedSearchResult['combinedResults'] = [];

    // Add memories
    memories.forEach(memory => {
      combined.push({
        type: 'memory',
        id: memory.id,
        content: memory.content,
        relevance: memory.metadata.relevance,
        source: `memory:${memory.type}`,
        metadata: {
          importance: memory.metadata.importance,
          tags: memory.metadata.tags,
          fileContext: memory.metadata.fileContext,
          timestamp: memory.timestamp
        }
      });
    });

    // Add chunks
    chunks.forEach(chunk => {
      combined.push({
        type: 'chunk',
        id: chunk.id,
        content: chunk.content,
        relevance: chunk.metadata.semanticScore || 0,
        source: `file:${chunk.metadata.fileName || 'unknown'}`,
        metadata: {
          wordCount: chunk.metadata.wordCount,
          keywords: chunk.metadata.keywords,
          documentId: chunk.metadata.documentId,
          fileType: chunk.metadata.fileType,
          pageNumber: chunk.pageNumber
        }
      });
    });

    // Sort by relevance
    combined.sort((a, b) => b.relevance - a.relevance);

    // Apply reranking if requested
    if (query.options.rerankCombined) {
      return this.rerankCombinedResults(combined, query);
    }

    return combined;
  }

  /**
   * Rerank combined results using advanced scoring
   */
  private async rerankCombinedResults(
    results: UnifiedSearchResult['combinedResults'],
    query: UnifiedQuery
  ): Promise<UnifiedSearchResult['combinedResults']> {
    const reranked = await Promise.all(
      results.map(async (result) => {
        let score = result.relevance;

        // Boost file-linked memories
        if (result.type === 'memory' && result.metadata.fileContext) {
          score *= 1.2;
        }

        // Boost recent content
        if (result.metadata.timestamp) {
          const ageInDays = (Date.now() - result.metadata.timestamp) / (24 * 60 * 60 * 1000);
          const recencyBoost = Math.exp(-ageInDays / 30); // Decay over 30 days
          score *= (1 + recencyBoost * 0.3);
        }

        // Boost important content
        if (result.metadata.importance) {
          score *= (1 + result.metadata.importance * 0.5);
        }

        // Apply semantic similarity boost
        const semanticSimilarity = this.calculateSemanticRelevance(result.content, query.query);
        score *= (1 + semanticSimilarity * 0.4);

        return {
          ...result,
          relevance: Math.min(1, score)
        };
      })
    );

    return reranked.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Link memory to file chunk
   */
  async linkMemoryToChunk(
    memoryId: string,
    chunkId: string,
    linkType: MemoryChunkLink['linkType'],
    confidence: number,
    metadata?: Record<string, any>
  ): Promise<MemoryChunkLink> {
    const link: MemoryChunkLink = {
      memoryId,
      chunkId,
      linkType,
      confidence,
      metadata: metadata || {}
    };

    if (!this.memoryChunkLinks.has(memoryId)) {
      this.memoryChunkLinks.set(memoryId, []);
    }
    this.memoryChunkLinks.get(memoryId)!.push(link);

    // Update chunk metadata
    await this.updateChunkWithMemoryLink(chunkId, memoryId);

    return link;
  }

  /**
   * Perform symbolic analysis on memories and chunks
   */
  async performSymbolicAnalysis(
    memories: MemoryEntry[],
    chunks: Chunk[],
    query: UnifiedQuery
  ): Promise<{
    patterns: SymbolicPattern[];
    motifs: Motif[];
    themes: Theme[];
    insights: SymbolicInsight[];
  }> {
    // Prepare content for symbolic analysis
    const content = [
      ...memories.map(memory => ({
        id: memory.id,
        content: memory.content,
        type: 'memory' as const,
        metadata: {
          importance: memory.metadata.importance,
          relevance: memory.metadata.relevance,
          tags: memory.metadata.tags,
          fileContext: memory.metadata.fileContext
        }
      })),
      ...chunks.map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        type: 'chunk' as const,
        metadata: {
          wordCount: chunk.metadata.wordCount,
          keywords: chunk.metadata.keywords,
          documentId: chunk.metadata.documentId,
          fileName: chunk.metadata.fileName
        }
      }))
    ];

    // Perform symbolic analysis
    const symbolicResults = await this.symbolicReasoning.analyzeContent(content, {
      detectPatterns: query.options.detectPatterns ?? true,
      synthesizeMotifs: query.options.synthesizeMotifs ?? true,
      inferThemes: query.options.inferThemes ?? true,
      trackAnchors: query.options.trackAnchors ?? true,
      depth: 3
    });

    return symbolicResults;
  }

  /**
   * Execute symbolic queries
   */
  async executeSymbolicQuery(query: SymbolicQuery): Promise<{
    patterns?: SymbolicPattern[];
    motifs?: Motif[];
    themes?: Theme[];
    insights?: SymbolicInsight[];
    correlations?: Array<{
      type: string;
      strength: number;
      entities: string[];
      evidence: string[];
    }>;
  }> {
    return await this.symbolicReasoning.executeSymbolicQuery(query);
  }

  /**
   * Perform narrative synthesis on search results
   */
  async performNarrativeSynthesis(
    memories: MemoryEntry[],
    chunks: Chunk[],
    symbolicResults: {
      patterns: SymbolicPattern[];
      motifs: Motif[];
      themes: Theme[];
      insights: SymbolicInsight[];
    },
    query: UnifiedQuery
  ): Promise<{
    narrative: string;
    storyArcs: any[];
    scaffolds: any[];
    frames: any[];
    insights: any[];
  }> {
    const elements = {
      motifs: symbolicResults.motifs,
      themes: symbolicResults.themes,
      patterns: symbolicResults.patterns,
      memories: memories,
      chunks: chunks,
      insights: symbolicResults.insights
    };

    return await this.narrativeSynthesis.synthesizeNarrative(elements, {
      generateStoryArcs: query.options.generateStoryArcs ?? true,
      createScaffolding: query.options.createScaffolding ?? true,
      applySymbolicFraming: query.options.applySymbolicFraming ?? true,
      maxLength: query.options.maxResults * 100, // Rough estimate
      detailLevel: query.options.detailLevel || 'detailed'
    });
  }

  /**
   * Execute narrative queries
   */
  async executeNarrativeQuery(query: NarrativeQuery): Promise<{
    narrative?: string;
    storyArcs?: any[];
    scaffolds?: any[];
    frames?: any[];
    insights?: any[];
    synthesis?: MultiDocumentSynthesis;
  }> {
    return await this.narrativeSynthesis.executeNarrativeQuery(query);
  }

  /**
   * Extract insights from file content and create memories
   */
  async extractFileInsights(
    userId: string,
    sessionId: string,
    documentId: string,
    fileName: string,
    fileType: string,
    chunks: Chunk[]
  ): Promise<{
    insights: MemoryEntry[];
    anchors: MemoryEntry[];
    motifs: MemoryEntry[];
  }> {
    const insights: MemoryEntry[] = [];
    const anchors: MemoryEntry[] = [];
    const motifs: MemoryEntry[] = [];

    // Extract insights from chunks
    for (const chunk of chunks) {
      const insight = await this.extractChunkInsight(chunk);
      if (insight) {
        const memory = this.memoryLedger.createFileMemory(
          userId,
          sessionId,
          documentId,
          fileName,
          fileType,
          insight.content,
          {
            type: 'file_insight',
            chunkId: chunk.id,
            pageNumber: chunk.pageNumber,
            extractionMethod: 'insight',
            confidence: insight.confidence,
            importance: insight.importance,
            relevance: insight.relevance,
            tags: ['insight', fileType, ...insight.tags]
          }
        );
        insights.push(memory);
      }
    }

    // Extract symbolic anchors
    const extractedAnchors = await this.extractSymbolicAnchors(chunks);
    if (extractedAnchors.length > 0) {
      const anchorMemories = this.memoryLedger.createFileAnchors(
        userId,
        sessionId,
        documentId,
        fileName,
        fileType,
        extractedAnchors
      );
      anchors.push(...anchorMemories);
    }

    // Extract recurring motifs
    const extractedMotifs = await this.extractRecurringMotifs(chunks);
    if (extractedMotifs.length > 0) {
      const motifMemories = this.memoryLedger.createFileMotifs(
        userId,
        sessionId,
        documentId,
        fileName,
        fileType,
        extractedMotifs
      );
      motifs.push(...motifMemories);
    }

    // Emit file processing event
    this.emitPacket(pkt('memory_created', {
      documentId,
      fileName,
      insightsCount: insights.length,
      anchorsCount: anchors.length,
      motifsCount: motifs.length
    }));

    return { insights, anchors, motifs };
  }

  /**
   * Extract insight from a single chunk
   */
  private async extractChunkInsight(chunk: Chunk): Promise<{
    content: string;
    confidence: number;
    importance: number;
    relevance: number;
    tags: string[];
  } | null> {
    // Simple insight extraction - in production, use more sophisticated NLP
    const content = chunk.content;
    const wordCount = content.split(/\s+/).length;

    // Skip very short or very long chunks
    if (wordCount < 10 || wordCount > 500) {
      return null;
    }

    // Look for key phrases and concepts
    const keyPhrases = this.extractKeyPhrases(content);
    if (keyPhrases.length === 0) {
      return null;
    }

    // Create insight summary
    const insight = keyPhrases.slice(0, 3).join('. ');
    const confidence = Math.min(1, keyPhrases.length / 5);
    const importance = chunk.metadata.semanticScore || 0.5;
    const relevance = Math.min(1, (keyPhrases.length + wordCount) / 100);

    return {
      content: insight,
      confidence,
      importance,
      relevance,
      tags: keyPhrases.slice(0, 3)
    };
  }

  /**
   * Extract symbolic anchors from chunks
   */
  private async extractSymbolicAnchors(chunks: Chunk[]): Promise<Array<{
    anchor: string;
    content: string;
    context: string;
    confidence: number;
  }>> {
    const anchors: Array<{
      anchor: string;
      content: string;
      context: string;
      confidence: number;
    }> = [];

    // Look for common anchor patterns
    const anchorPatterns = [
      /chapter\s+\d+/gi,
      /section\s+\d+/gi,
      /figure\s+\d+/gi,
      /table\s+\d+/gi,
      /appendix\s+[a-z]/gi,
      /part\s+\d+/gi
    ];

    for (const chunk of chunks) {
      for (const pattern of anchorPatterns) {
        const matches = chunk.content.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const context = this.extractContextAround(chunk.content, match, 100);
            anchors.push({
              anchor: match.toLowerCase(),
              content: match,
              context,
              confidence: 0.8
            });
          });
        }
      }
    }

    return anchors;
  }

  /**
   * Extract recurring motifs from chunks
   */
  private async extractRecurringMotifs(chunks: Chunk[]): Promise<Array<{
    motif: string;
    content: string;
    instances: string[];
    frequency: number;
    confidence: number;
  }>> {
    const motifMap = new Map<string, {
      motif: string;
      content: string;
      instances: string[];
      frequency: number;
      confidence: number;
    }>();

    // Extract potential motifs (repeated phrases, concepts)
    for (const chunk of chunks) {
      const phrases = this.extractKeyPhrases(chunk.content);

      for (const phrase of phrases) {
        if (phrase.length > 3 && phrase.length < 50) {
          const key = phrase.toLowerCase();

          if (!motifMap.has(key)) {
            motifMap.set(key, {
              motif: phrase,
              content: phrase,
              instances: [],
              frequency: 0,
              confidence: 0
            });
          }

          const motif = motifMap.get(key)!;
          motif.frequency++;
          motif.instances.push(phrase);
        }
      }
    }

    // Filter motifs by frequency and calculate confidence
    const motifs = Array.from(motifMap.values())
      .filter(m => m.frequency >= 2) // At least 2 occurrences
      .map(m => ({
        ...m,
        confidence: Math.min(1, m.frequency / 10) // Higher frequency = higher confidence
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10); // Top 10 motifs

    return motifs;
  }

  /**
   * Extract key phrases from text
   */
  private extractKeyPhrases(text: string): string[] {
    // Simple key phrase extraction - in production, use NLP libraries
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const phrases: string[] = [];

    for (const sentence of sentences) {
      // Look for noun phrases, technical terms, etc.
      const words = sentence.split(/\s+/);

      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`.toLowerCase();

        // Filter out common words and short phrases
        if (phrase.length > 5 && !this.isCommonWord(phrase)) {
          phrases.push(phrase);
        }
      }
    }

    return [...new Set(phrases)].slice(0, 10);
  }

  /**
   * Extract context around a match
   */
  private extractContextAround(text: string, match: string, contextLength: number): string {
    const index = text.toLowerCase().indexOf(match.toLowerCase());
    if (index === -1) return match;

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + match.length + contextLength);

    return text.substring(start, end).trim();
  }

  /**
   * Check if a phrase is a common word
   */
  private isCommonWord(phrase: string): boolean {
    const commonWords = [
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'within', 'without'
    ];
    return commonWords.includes(phrase);
  }

  /**
   * Calculate semantic relevance between text and query
   */
  private calculateSemanticRelevance(text: string, query: string): number {
    // Simple semantic relevance calculation - in production, use embeddings
    const textWords = text.toLowerCase().split(/\s+/);
    const queryWords = query.toLowerCase().split(/\s+/);

    const matches = queryWords.filter(word =>
      textWords.some(textWord => textWord.includes(word) || word.includes(textWord))
    );

    return Math.min(1, matches.length / queryWords.length);
  }

  /**
   * Update chunk with memory link
   */
  private async updateChunkWithMemoryLink(chunkId: string, memoryId: string): Promise<void> {
    // This would update the chunk metadata in the vector store
    // For now, we'll just log the link
    console.log(`Linked memory ${memoryId} to chunk ${chunkId}`);
  }

  /**
   * Get linked memories for a chunk
   */
  getLinkedMemories(chunkId: string): MemoryChunkLink[] {
    const links: MemoryChunkLink[] = [];

    for (const [memoryId, memoryLinks] of this.memoryChunkLinks.entries()) {
      const chunkLinks = memoryLinks.filter(link => link.chunkId === chunkId);
      links.push(...chunkLinks);
    }

    return links;
  }

  /**
   * Get linked chunks for a memory
   */
  getLinkedChunks(memoryId: string): MemoryChunkLink[] {
    return this.memoryChunkLinks.get(memoryId) || [];
  }

  /**
   * Emit packet if emitter is available
   */
  private emitPacket(packet: any): void {
    if (this.packetEmitter) {
      this.packetEmitter(packet);
    }
  }
}
