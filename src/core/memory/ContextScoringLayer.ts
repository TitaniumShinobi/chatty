/**
 * Context Scoring Layer
 * 
 * Scores retrieved memory chunks using weighted metrics for RAG-based persona grounding.
 * 
 * Scoring weights:
 * - Embedding similarity: 0.35
 * - Construct relevance: 0.25
 * - Emotional resonance: 0.20
 * - Recency decay inverse: 0.10
 * - Repetition penalty: -0.10
 * 
 * Returns top 3-5 highest scoring memories for injection into prompts.
 */

import { MemoryChunk } from './MemoryRetrievalEngine.js';

export interface ScoringContext {
  query: string;
  constructId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>;
  recentMemoryIds?: Set<string>; // IDs of recently used memories (for repetition penalty)
  emotionalTone?: string; // Current emotional tone context
}

export interface ScoringWeights {
  embeddingSimilarity: number; // 0.35
  constructRelevance: number; // 0.25
  emotionalResonance: number; // 0.20
  recencyDecayInverse: number; // 0.10
  repetitionPenalty: number; // -0.10
}

export interface ScoredMemory {
  memory: MemoryChunk;
  score: number;
  breakdown: {
    embeddingSimilarity: number;
    constructRelevance: number;
    emotionalResonance: number;
    recencyDecayInverse: number;
    repetitionPenalty: number;
  };
}

export class ContextScoringLayer {
  private defaultWeights: ScoringWeights;
  private customWeights: ScoringWeights | null = null;

  constructor(customWeights?: Partial<ScoringWeights>) {
    this.defaultWeights = {
      embeddingSimilarity: 0.35,
      constructRelevance: 0.25,
      emotionalResonance: 0.20,
      recencyDecayInverse: 0.10,
      repetitionPenalty: -0.10
    };
    
    if (customWeights) {
      this.customWeights = { ...this.defaultWeights, ...customWeights };
    }
  }

  /**
   * Load scoring weights from capsule configuration
   */
  async loadWeights(linIdentityPath: string): Promise<ScoringWeights> {
    try {
      const scoringWeightsPath = `${linIdentityPath}/scoring_weights.json`;
      const { readFile } = await import('fs/promises');
      const content = await readFile(scoringWeightsPath, 'utf-8');
      const config = JSON.parse(content);
      
      this.customWeights = {
        embeddingSimilarity: config.embedding_similarity || this.defaultWeights.embeddingSimilarity,
        constructRelevance: config.construct_relevance || this.defaultWeights.constructRelevance,
        emotionalResonance: config.emotional_resonance || this.defaultWeights.emotionalResonance,
        recencyDecayInverse: config.recency_decay_inverse || this.defaultWeights.recencyDecayInverse,
        repetitionPenalty: config.repetition_penalty || this.defaultWeights.repetitionPenalty
      };
      
      return this.customWeights;
    } catch (error) {
      console.warn(`[ContextScoringLayer] Could not load scoring_weights.json: ${error}`);
      return this.defaultWeights;
    }
  }

  /**
   * Score a single memory chunk
   */
  scoreMemory(
    memory: MemoryChunk,
    context: ScoringContext
  ): ScoredMemory {
    const weights = this.customWeights || this.defaultWeights;

    // 1. Embedding similarity (0.35)
    // Simple keyword-based similarity for now (can be enhanced with actual embeddings)
    const embeddingSimilarity = this.calculateEmbeddingSimilarity(memory, context.query);

    // 2. Construct relevance (0.25)
    const constructRelevance = this.calculateConstructRelevance(memory, context.constructId);

    // 3. Emotional resonance (0.20)
    const emotionalResonance = this.calculateEmotionalResonance(memory, context);

    // 4. Recency decay inverse (0.10)
    // Older memories = deeper truth (higher score)
    const recencyDecayInverse = this.calculateRecencyDecayInverse(memory);

    // 5. Repetition penalty (-0.10)
    const repetitionPenalty = this.calculateRepetitionPenalty(memory, context.recentMemoryIds);

    // Calculate weighted score
    const score = 
      (embeddingSimilarity * weights.embeddingSimilarity) +
      (constructRelevance * weights.constructRelevance) +
      (emotionalResonance * weights.emotionalResonance) +
      (recencyDecayInverse * weights.recencyDecayInverse) +
      (repetitionPenalty * weights.repetitionPenalty);

    return {
      memory,
      score: Math.max(0, Math.min(1.0, score)), // Clamp to [0, 1]
      breakdown: {
        embeddingSimilarity,
        constructRelevance,
        emotionalResonance,
        recencyDecayInverse,
        repetitionPenalty
      }
    };
  }

  /**
   * Rank memories by score and return top K
   */
  rankMemories(
    memories: MemoryChunk[],
    context: ScoringContext,
    topK: number = 5
  ): ScoredMemory[] {
    const scored = memories.map(memory => this.scoreMemory(memory, context));
    
    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);
    
    // Return top K
    return scored.slice(0, topK);
  }

  /**
   * Calculate embedding similarity (keyword-based for now)
   */
  private calculateEmbeddingSimilarity(memory: MemoryChunk, query: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = memory.content.toLowerCase();
    
    // Extract keywords (words > 2 chars)
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const contentWords = contentLower.split(/\s+/).filter(w => w.length > 2);
    
    if (queryWords.length === 0) return 0.5; // Neutral if no keywords
    
    // Count matches
    let matches = 0;
    for (const word of queryWords) {
      if (contentWords.includes(word)) {
        matches++;
      }
    }
    
    // Also check for phrase matches
    const phraseMatch = contentLower.includes(queryLower) ? 0.3 : 0;
    
    return Math.min(1.0, (matches / queryWords.length) + phraseMatch);
  }

  /**
   * Calculate construct relevance
   */
  private calculateConstructRelevance(memory: MemoryChunk, constructId: string): number {
    // Exact match
    if (memory.constructId === constructId) {
      return 1.0;
    }
    
    // Check if memory content mentions construct
    const contentLower = memory.content.toLowerCase();
    const constructLower = constructId.toLowerCase();
    
    if (contentLower.includes(constructLower)) {
      return 0.7;
    }
    
    // Check source path
    if (memory.source.includes(constructId)) {
      return 0.8;
    }
    
    // Generic relevance
    return 0.3;
  }

  /**
   * Calculate emotional resonance
   */
  private calculateEmotionalResonance(memory: MemoryChunk, context: ScoringContext): number {
    if (!context.emotionalTone) {
      return 0.5; // Neutral if no tone context
    }
    
    const contentLower = memory.content.toLowerCase();
    const toneLower = context.emotionalTone.toLowerCase();
    
    // Emotional markers
    const emotionalMarkers: Record<string, string[]> = {
      'joy': ['happy', 'excited', 'great', 'wonderful', 'amazing', 'love', '💚', '✨'],
      'sadness': ['sad', 'disappointed', 'frustrated', 'difficult', 'struggling', '💔'],
      'anger': ['angry', 'furious', 'annoyed', 'frustrated', 'mad'],
      'fear': ['worried', 'anxious', 'concerned', 'scared', 'nervous'],
      'neutral': ['okay', 'fine', 'alright', 'sure']
    };
    
    const markers = emotionalMarkers[toneLower] || [];
    if (markers.length === 0) return 0.5;
    
    // Count marker matches
    let matches = 0;
    for (const marker of markers) {
      if (contentLower.includes(marker.toLowerCase())) {
        matches++;
      }
    }
    
    // Normalize by number of markers
    return Math.min(1.0, matches / markers.length);
  }

  /**
   * Calculate recency decay inverse (older = higher score)
   */
  private calculateRecencyDecayInverse(memory: MemoryChunk): number {
    if (!memory.timestamp) {
      return 0.7; // Default for memories without timestamp (assume older)
    }
    
    const now = Date.now();
    const age = now - memory.timestamp;
    const daysOld = age / (1000 * 60 * 60 * 24);
    
    // Older memories get higher scores (inverse decay)
    // Memories older than 30 days get max score
    if (daysOld > 30) {
      return 1.0;
    }
    
    // Linear decay: newer memories get lower scores
    return Math.max(0.1, 1.0 - (daysOld / 30));
  }

  /**
   * Calculate repetition penalty
   */
  private calculateRepetitionPenalty(
    memory: MemoryChunk,
    recentMemoryIds?: Set<string>
  ): number {
    if (!recentMemoryIds || !recentMemoryIds.has(memory.id)) {
      return 0; // No penalty if not recently used
    }
    
    return -1.0; // Full penalty if recently used
  }
}

