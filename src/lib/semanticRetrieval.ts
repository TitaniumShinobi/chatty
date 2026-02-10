// Large File Intelligence Layer - Semantic Retrieval Interface
// Optional vector store integration for retrieval-based QA

import { Chunk } from './chunkingEngine';
import { ContextMatch } from './contextAssembler';

export interface VectorStoreConfig {
  type: 'memory' | 'pinecone' | 'weaviate' | 'qdrant' | 'chroma';
  dimensions: number;
  similarityMetric: 'cosine' | 'euclidean' | 'dot';
  namespace?: string;
  apiKey?: string;
  endpoint?: string;
}

export interface EmbeddingResult {
  vector: number[];
  metadata: {
    chunkId: string;
    documentId: string;
    wordCount: number;
    keywords: string[];
  };
}

export interface RetrievalResult {
  matches: ContextMatch[];
  totalFound: number;
  searchTime: number;
  metadata: {
    vectorStoreType: string;
    dimensions: number;
    similarityMetric: string;
  };
}

export interface SemanticQuery {
  query: string;
  filters?: {
    documentIds?: string[];
    documentTypes?: string[];
    complexity?: 'low' | 'medium' | 'high';
    sections?: string[];
  };
  options: {
    topK: number;
    similarityThreshold: number;
    includeMetadata: boolean;
    rerank: boolean;
  };
}

export abstract class VectorStore {
  protected config: VectorStoreConfig;

  constructor(config: VectorStoreConfig) {
    this.config = config;
  }

  abstract initialize(): Promise<void>;
  abstract upsert(embeddings: EmbeddingResult[]): Promise<void>;
  abstract search(query: SemanticQuery): Promise<RetrievalResult>;
  abstract delete(documentId: string): Promise<void>;
  abstract clear(): Promise<void>;
  abstract getStats(): Promise<{ totalVectors: number; dimensions: number }>;
}

/**
 * In-Memory Vector Store Implementation
 * Simple, fast, and suitable for development/testing
 */
export class MemoryVectorStore extends VectorStore {
  private vectors: Map<string, EmbeddingResult> = new Map();
  private initialized = false;

  constructor(config?: Partial<VectorStoreConfig>) {
    super({
      type: 'memory',
      dimensions: 100,
      similarityMetric: 'cosine',
      ...config
    });
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async upsert(embeddings: EmbeddingResult[]): Promise<void> {
    if (!this.initialized) throw new Error('Vector store not initialized');

    for (const embedding of embeddings) {
      this.vectors.set(embedding.metadata.chunkId, embedding);
    }
  }

  async search(query: SemanticQuery): Promise<RetrievalResult> {
    if (!this.initialized) throw new Error('Vector store not initialized');

    const startTime = Date.now();
    const queryVector = await this.createEmbedding(query.query);
    const matches: Array<{ embedding: EmbeddingResult; similarity: number }> = [];

    // Calculate similarities
    for (const embedding of this.vectors.values()) {
      // Apply filters
      if (query.filters?.documentIds && !query.filters.documentIds.includes(embedding.metadata.documentId)) {
        continue;
      }

      const similarity = this.calculateSimilarity(queryVector, embedding.vector);
      
      if (similarity >= query.options.similarityThreshold) {
        matches.push({ embedding, similarity });
      }
    }

    // Sort by similarity and take top K
    matches.sort((a, b) => b.similarity - a.similarity);
    const topMatches = matches.slice(0, query.options.topK);

    const searchTime = Date.now() - startTime;

    return {
      matches: topMatches.map(match => ({
        chunk: {
          id: match.embedding.metadata.chunkId,
          content: '', // Would be populated from chunk store
          startIndex: 0,
          endIndex: 0,
          metadata: {
            wordCount: match.embedding.metadata.wordCount,
            characterCount: 0,
            keywords: match.embedding.metadata.keywords
          },
          context: {}
        },
        similarity: match.similarity,
        relevance: match.similarity,
        context: {
          previousChunks: [],
          nextChunks: [],
          documentSection: 'unknown'
        }
      })),
      totalFound: matches.length,
      searchTime,
      metadata: {
        vectorStoreType: this.config.type,
        dimensions: this.config.dimensions,
        similarityMetric: this.config.similarityMetric
      }
    };
  }

  async delete(documentId: string): Promise<void> {
    if (!this.initialized) throw new Error('Vector store not initialized');

    for (const [chunkId, embedding] of this.vectors.entries()) {
      if (embedding.metadata.documentId === documentId) {
        this.vectors.delete(chunkId);
      }
    }
  }

  async clear(): Promise<void> {
    if (!this.initialized) throw new Error('Vector store not initialized');
    this.vectors.clear();
  }

  /**
   * Batch operations for better performance
   */
  async batchUpsert(embeddings: EmbeddingResult[], batchSize: number = 100): Promise<void> {
    if (!this.initialized) throw new Error('Vector store not initialized');

    for (let i = 0; i < embeddings.length; i += batchSize) {
      const batch = embeddings.slice(i, i + batchSize);
      for (const embedding of batch) {
        this.vectors.set(embedding.metadata.chunkId, embedding);
      }
      // Allow other operations to proceed
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  async getStats(): Promise<{ totalVectors: number; dimensions: number }> {
    if (!this.initialized) throw new Error('Vector store not initialized');

    return {
      totalVectors: this.vectors.size,
      dimensions: this.config.dimensions
    };
  }

  private async createEmbedding(text: string): Promise<number[]> {
    // Simple TF-IDF inspired embedding
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);

    const wordFreq: { [key: string]: number } = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const vector = new Array(this.config.dimensions).fill(0);
    const uniqueWords = Object.keys(wordFreq);

    uniqueWords.forEach((word, index) => {
      if (index < this.config.dimensions) {
        vector[index] = wordFreq[word] / words.length;
      }
    });

    return vector;
  }

  private calculateSimilarity(vec1: number[], vec2: number[]): number {
    switch (this.config.similarityMetric) {
      case 'cosine':
        return this.cosineSimilarity(vec1, vec2);
      case 'euclidean':
        return this.euclideanSimilarity(vec1, vec2);
      case 'dot':
        return this.dotProduct(vec1, vec2);
      default:
        return this.cosineSimilarity(vec1, vec2);
    }
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return dotProduct / (magnitude1 * magnitude2);
  }

  private euclideanSimilarity(vec1: number[], vec2: number[]): number {
    const distance = Math.sqrt(
      vec1.reduce((sum, val, i) => sum + Math.pow(val - vec2[i], 2), 0)
    );
    return 1 / (1 + distance); // Convert distance to similarity
  }

  private dotProduct(vec1: number[], vec2: number[]): number {
    return vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  }
}

/**
 * Semantic Retrieval Service
 * Orchestrates vector store operations and provides high-level retrieval interface
 */
export class SemanticRetrievalService {
  private vectorStore: VectorStore;
  private chunkStore: Map<string, Chunk> = new Map();

  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore;
  }

  /**
   * Initialize the retrieval service
   */
  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
  }

  /**
   * Index chunks for semantic search with progress tracking
   */
  async indexChunks(
    chunks: Chunk[], 
    documentId: string,
    options?: {
      onProgress?: (progress: number) => void;
      batchSize?: number;
    }
  ): Promise<void> {
    const batchSize = options?.batchSize || 50;
    const embeddings: EmbeddingResult[] = [];
    
    // Create embeddings in batches
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      for (const chunk of batch) {
        embeddings.push({
          vector: this.createEmbedding(chunk.content),
          metadata: {
            chunkId: chunk.id,
            documentId,
            wordCount: chunk.metadata.wordCount,
            keywords: chunk.metadata.keywords
          }
        });
        
        // Store chunks in memory for retrieval
        this.chunkStore.set(chunk.id, chunk);
      }
      
      // Report progress
      options?.onProgress?.(Math.min((i + batchSize) / chunks.length, 1));
      
      // Allow other operations to proceed
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Use batch upsert for better performance
    if ('batchUpsert' in this.vectorStore) {
      await (this.vectorStore as any).batchUpsert(embeddings, batchSize);
    } else {
      await this.vectorStore.upsert(embeddings);
    }
  }

  /**
   * Perform semantic search
   */
  async search(query: SemanticQuery): Promise<RetrievalResult> {
    const result = await this.vectorStore.search(query);

    // Populate chunk content from store
    result.matches = result.matches.map(match => {
      const chunk = this.chunkStore.get(match.chunk.id);
      if (chunk) {
        match.chunk = chunk;
      }
      return match;
    });

    return result;
  }

  /**
   * Remove document from index
   */
  async removeDocument(documentId: string): Promise<void> {
    await this.vectorStore.delete(documentId);
    
    // Remove chunks from store
    for (const [chunkId, chunk] of this.chunkStore.entries()) {
      if (chunk.id.includes(documentId)) {
        this.chunkStore.delete(chunkId);
      }
    }
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<{
    vectorStore: { totalVectors: number; dimensions: number };
    chunkStore: { totalChunks: number };
  }> {
    const vectorStats = await this.vectorStore.getStats();
    
    return {
      vectorStore: vectorStats,
      chunkStore: { totalChunks: this.chunkStore.size }
    };
  }

  /**
   * Create embedding for text
   */
  private createEmbedding(text: string): number[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);

    const wordFreq: { [key: string]: number } = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const vector = new Array(100).fill(0); // Fixed size for now
    const uniqueWords = Object.keys(wordFreq);

    uniqueWords.forEach((word, index) => {
      if (index < 100) {
        vector[index] = wordFreq[word] / words.length;
      }
    });

    return vector;
  }
}

/**
 * Factory for creating vector stores
 */
export class VectorStoreFactory {
  static create(config: VectorStoreConfig): VectorStore {
    switch (config.type) {
      case 'memory':
        return new MemoryVectorStore(config);
      case 'pinecone':
      case 'weaviate':
      case 'qdrant':
      case 'chroma':
        throw new Error(`${config.type} vector store not yet implemented`);
      default:
        throw new Error(`Unknown vector store type: ${config.type}`);
    }
  }
}
