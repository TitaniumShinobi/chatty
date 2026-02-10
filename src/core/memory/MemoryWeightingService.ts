/**
 * Memory Weighting Service
 * 
 * Implements weighted memory retrieval with role-based anchoring.
 * Prioritizes memories that match construct's role keywords.
 */

import { getRoleKeywords, calculateRoleRelevance } from './RoleKeywords.js';

export interface Memory {
  id: string;
  text: string;
  timestamp: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface WeightedMemory extends Memory {
  relevanceScore: number;
  roleMatchScore: number;
  weight: number;
}

export interface MemoryAnchor {
  constructId: string;
  traits: string[];
  weight: number;
  recallBoost: boolean;
  createdAt: number;
}

export class MemoryWeightingService {
  private roleKeywords: Map<string, string[]>;
  private anchors: Map<string, MemoryAnchor>;

  constructor() {
    this.roleKeywords = new Map();
    this.anchors = new Map();
  }

  /**
   * Weight memories based on role relevance
   */
  weightMemory(constructId: string, memories: Memory[]): WeightedMemory[] {
    const roleKeywords = getRoleKeywords(constructId);
    this.roleKeywords.set(constructId, roleKeywords);

    const weighted: WeightedMemory[] = memories.map(memory => {
      // Calculate role match score
      const roleMatchScore = calculateRoleRelevance(memory.text, constructId);
      
      // Calculate base relevance (could be from semantic search)
      const baseRelevance = 0.5; // Default, would come from retrieval system
      
      // Combine scores
      const relevanceScore = (baseRelevance * 0.4) + (roleMatchScore * 0.6);
      
      // Calculate weight (boost role-relevant memories)
      let weight = 0.5; // Base weight
      if (roleMatchScore > 0.5) {
        weight = 0.9; // High weight for role-relevant memories
      } else if (roleMatchScore > 0.2) {
        weight = 0.7; // Medium weight
      }
      
      // Apply anchor boost if exists
      const anchor = this.anchors.get(constructId);
      if (anchor && anchor.recallBoost && roleMatchScore > 0.3) {
        weight = Math.min(weight * 1.1, 1.0); // 10% boost, cap at 1.0
      }

      return {
        ...memory,
        relevanceScore,
        roleMatchScore,
        weight
      };
    });

    // Sort by weighted relevance (highest first)
    return weighted.sort((a, b) => {
      const scoreA = a.relevanceScore * a.weight;
      const scoreB = b.relevanceScore * b.weight;
      return scoreB - scoreA;
    });
  }

  /**
   * Create weighted anchor for construct identity
   */
  createWeightedAnchor(
    constructId: string,
    traits: string[]
  ): MemoryAnchor {
    const anchor: MemoryAnchor = {
      constructId,
      traits,
      weight: 0.9, // High priority
      recallBoost: true,
      createdAt: Date.now()
    };

    this.anchors.set(constructId, anchor);
    return anchor;
  }

  /**
   * Get anchor for a construct
   */
  getAnchor(constructId: string): MemoryAnchor | null {
    return this.anchors.get(constructId) || null;
  }

  /**
   * Update anchor traits
   */
  updateAnchor(constructId: string, traits: string[]): void {
    const existing = this.anchors.get(constructId);
    if (existing) {
      existing.traits = traits;
      existing.createdAt = Date.now();
    } else {
      this.createWeightedAnchor(constructId, traits);
    }
  }

  /**
   * Remove anchor
   */
  removeAnchor(constructId: string): void {
    this.anchors.delete(constructId);
  }

  /**
   * Get top N weighted memories
   */
  getTopMemories(
    constructId: string,
    memories: Memory[],
    limit: number = 10
  ): WeightedMemory[] {
    const weighted = this.weightMemory(constructId, memories);
    return weighted.slice(0, limit);
  }
}

// Export singleton instance
let memoryWeightingInstance: MemoryWeightingService | null = null;

export function getMemoryWeightingService(): MemoryWeightingService {
  if (!memoryWeightingInstance) {
    memoryWeightingInstance = new MemoryWeightingService();
  }
  return memoryWeightingInstance;
}

