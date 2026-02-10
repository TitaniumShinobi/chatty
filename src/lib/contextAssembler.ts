// Large File Intelligence Layer - Context Assembler
// Streaming context injection with semantic retrieval

import { Chunk, ChunkingResult } from './chunkingEngine';

export interface ContextQuery {
  query: string;
  maxChunks: number;
  similarityThreshold: number;
  includeMetadata: boolean;
  contextWindow: number; // number of adjacent chunks to include
}

export interface ContextMatch {
  chunk: Chunk;
  similarity: number;
  relevance: number;
  context: {
    previousChunks: Chunk[];
    nextChunks: Chunk[];
    documentSection: string;
  };
}

export interface AssembledContext {
  chunks: ContextMatch[];
  totalChunks: number;
  totalWords: number;
  summary: string;
  metadata: {
    documentType: string;
    complexity: 'low' | 'medium' | 'high';
    language: string;
    estimatedPages: number;
  };
  query: ContextQuery;
  processingTime: number;
}

export interface StreamingContextOptions {
  onProgress?: (progress: number, currentChunk: number, totalChunks: number) => void;
  onChunkProcessed?: (chunk: ContextMatch) => void;
  abortSignal?: AbortSignal;
  batchSize?: number;
}

export class ContextAssembler {
  private chunkingResults: Map<string, ChunkingResult> = new Map();
  private vectorStore: Map<string, number[]> = new Map(); // Simple in-memory vector store
  private readonly BATCH_SIZE = 10;

  /**
   * Register a chunked document for context retrieval
   */
  registerDocument(documentId: string, chunkingResult: ChunkingResult): void {
    this.chunkingResults.set(documentId, chunkingResult);
    
    // Create simple embeddings for semantic search
    this.createEmbeddings(documentId, chunkingResult.chunks);
  }

  /**
   * Create simple embeddings for semantic search
   */
  private async createEmbeddings(documentId: string, chunks: Chunk[]): Promise<void> {
    for (const chunk of chunks) {
      const embedding = this.createSimpleEmbedding(chunk.content);
      this.vectorStore.set(`${documentId}:${chunk.id}`, embedding);
    }
  }

  /**
   * Create a simple embedding vector (TF-IDF inspired)
   */
  private createSimpleEmbedding(text: string): number[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);

    const wordFreq: { [key: string]: number } = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Create a simple vector based on word frequencies
    const uniqueWords = Object.keys(wordFreq);
    const vector = new Array(100).fill(0); // Fixed-size vector

    uniqueWords.forEach((word, index) => {
      if (index < 100) {
        vector[index] = wordFreq[word] / words.length; // Normalized frequency
      }
    });

    return vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Assemble context from multiple documents based on query
   */
  async assembleContext(
    query: ContextQuery,
    documentIds: string[],
    options?: StreamingContextOptions
  ): Promise<AssembledContext> {
    const startTime = Date.now();
    const allMatches: ContextMatch[] = [];
    let processedChunks = 0;
    let totalChunks = 0;

    // Calculate total chunks for progress tracking
    for (const docId of documentIds) {
      const result = this.chunkingResults.get(docId);
      if (result) {
        totalChunks += result.chunks.length;
      }
    }

    // Process documents in batches
    for (const docId of documentIds) {
      const result = this.chunkingResults.get(docId);
      if (!result) continue;

      const queryEmbedding = this.createSimpleEmbedding(query.query);
      const documentMatches: ContextMatch[] = [];

      // Process chunks in batches
      for (let i = 0; i < result.chunks.length; i += this.BATCH_SIZE) {
        options?.abortSignal?.throwIfAborted();

        const batch = result.chunks.slice(i, i + this.BATCH_SIZE);
        
        for (const chunk of batch) {
          const chunkEmbedding = this.vectorStore.get(`${docId}:${chunk.id}`);
          if (!chunkEmbedding) continue;

          const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
          
          if (similarity >= query.similarityThreshold) {
            const context = this.buildChunkContext(chunk, result.chunks, query.contextWindow);
            
            const match: ContextMatch = {
              chunk,
              similarity,
              relevance: this.calculateRelevance(chunk, query.query, similarity),
              context
            };

            documentMatches.push(match);
            options?.onChunkProcessed?.(match);
          }

          processedChunks++;
          options?.onProgress?.(
            processedChunks / totalChunks,
            processedChunks,
            totalChunks
          );
        }
      }

      // Sort by relevance and take top matches
      documentMatches.sort((a, b) => b.relevance - a.relevance);
      allMatches.push(...documentMatches.slice(0, query.maxChunks));
    }

    // Sort all matches by relevance
    allMatches.sort((a, b) => b.relevance - a.relevance);
    const topMatches = allMatches.slice(0, query.maxChunks);

    const processingTime = Date.now() - startTime;

    return {
      chunks: topMatches,
      totalChunks: topMatches.length,
      totalWords: topMatches.reduce((sum, match) => sum + match.chunk.metadata.wordCount, 0),
      summary: this.generateSummary(topMatches, query),
      metadata: this.aggregateMetadata(documentIds),
      query,
      processingTime
    };
  }

  /**
   * Build context for a specific chunk
   */
  private buildChunkContext(
    chunk: Chunk,
    allChunks: Chunk[],
    contextWindow: number
  ): ContextMatch['context'] {
    const chunkIndex = allChunks.findIndex(c => c.id === chunk.id);
    if (chunkIndex === -1) return { previousChunks: [], nextChunks: [], documentSection: chunk.context.documentSection || 'unknown' };

    const startIndex = Math.max(0, chunkIndex - contextWindow);
    const endIndex = Math.min(allChunks.length, chunkIndex + contextWindow + 1);

    const previousChunks = allChunks.slice(startIndex, chunkIndex);
    const nextChunks = allChunks.slice(chunkIndex + 1, endIndex);

    return {
      previousChunks,
      nextChunks,
      documentSection: chunk.context.documentSection || 'unknown'
    };
  }

  /**
   * Calculate relevance score for a chunk
   */
  private calculateRelevance(chunk: Chunk, query: string, similarity: number): number {
    // Base relevance from similarity
    let relevance = similarity;

    // Boost relevance based on keyword matches
    const queryWords = query.toLowerCase().split(/\s+/);
    const chunkWords = chunk.content.toLowerCase().split(/\s+/);
    
    const keywordMatches = queryWords.filter(word => 
      chunkWords.some(chunkWord => chunkWord.includes(word) || word.includes(chunkWord))
    ).length;

    relevance += (keywordMatches / queryWords.length) * 0.3;

    // Boost relevance for document sections
    if (chunk.context.documentSection === 'introduction') {
      relevance += 0.1;
    }

    return Math.min(relevance, 1.0);
  }

  /**
   * Generate a summary of the assembled context
   */
  private generateSummary(matches: ContextMatch[], query: ContextQuery): string {
    if (matches.length === 0) {
      return `No relevant content found for query: "${query.query}"`;
    }

    const totalWords = matches.reduce((sum, match) => sum + match.chunk.metadata.wordCount, 0);
    const avgRelevance = matches.reduce((sum, match) => sum + match.relevance, 0) / matches.length;
    
    const sections = matches.map(match => match.context.documentSection);
    const uniqueSections = [...new Set(sections)];

    return `Found ${matches.length} relevant chunks (${totalWords} words) with ${(avgRelevance * 100).toFixed(1)}% average relevance. Content spans ${uniqueSections.join(', ')} sections.`;
  }

  /**
   * Aggregate metadata from multiple documents
   */
  private aggregateMetadata(documentIds: string[]): AssembledContext['metadata'] {
    const results = documentIds
      .map(id => this.chunkingResults.get(id))
      .filter(Boolean) as ChunkingResult[];

    if (results.length === 0) {
      return {
        documentType: 'unknown',
        complexity: 'low',
        language: 'unknown',
        estimatedPages: 0
      };
    }

    const totalPages = results.reduce((sum, result) => sum + result.metadata.estimatedPages, 0);
    const languages = [...new Set(results.map(r => r.metadata.language))];
    const complexities = results.map(r => r.metadata.complexity);
    
    // Determine overall complexity
    let overallComplexity: 'low' | 'medium' | 'high' = 'low';
    if (complexities.includes('high')) {
      overallComplexity = 'high';
    } else if (complexities.includes('medium')) {
      overallComplexity = 'medium';
    }

    return {
      documentType: results.length === 1 ? results[0].metadata.documentType : 'multiple',
      complexity: overallComplexity,
      language: languages.length === 1 ? languages[0] : 'multiple',
      estimatedPages: totalPages
    };
  }

  /**
   * Stream context assembly for real-time feedback
   */
  async *streamContext(
    query: ContextQuery,
    documentIds: string[],
    options?: StreamingContextOptions
  ): AsyncGenerator<ContextMatch, void, unknown> {
    for (const docId of documentIds) {
      const result = this.chunkingResults.get(docId);
      if (!result) continue;

      const queryEmbedding = this.createSimpleEmbedding(query.query);

      for (const chunk of result.chunks) {
        options?.abortSignal?.throwIfAborted();

        const chunkEmbedding = this.vectorStore.get(`${docId}:${chunk.id}`);
        if (!chunkEmbedding) continue;

        const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
        
        if (similarity >= query.similarityThreshold) {
          const context = this.buildChunkContext(chunk, result.chunks, query.contextWindow);
          
          const match: ContextMatch = {
            chunk,
            similarity,
            relevance: this.calculateRelevance(chunk, query.query, similarity),
            context
          };

          yield match;
          options?.onChunkProcessed?.(match);
        }
      }
    }
  }

  /**
   * Get document statistics
   */
  getDocumentStats(documentId: string): {
    totalChunks: number;
    totalWords: number;
    totalCharacters: number;
    metadata: ChunkingResult['metadata'];
  } | null {
    const result = this.chunkingResults.get(documentId);
    if (!result) return null;

    return {
      totalChunks: result.totalChunks,
      totalWords: result.totalWords,
      totalCharacters: result.totalCharacters,
      metadata: result.metadata
    };
  }

  /**
   * Clear all registered documents
   */
  clear(): void {
    this.chunkingResults.clear();
    this.vectorStore.clear();
  }

  /**
   * Remove a specific document
   */
  removeDocument(documentId: string): boolean {
    const removed = this.chunkingResults.delete(documentId);
    
    // Remove associated embeddings
    for (const key of this.vectorStore.keys()) {
      if (key.startsWith(`${documentId}:`)) {
        this.vectorStore.delete(key);
      }
    }

    return removed;
  }
}
