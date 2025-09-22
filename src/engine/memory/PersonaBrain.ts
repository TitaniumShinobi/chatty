// src/engine/memory/PersonaBrain.ts
// Self-evolving personality and memory system

import { ParsedStructure, Pattern } from '../parser/SymbolicParser';
import { ConversationDepth } from '../intent/IntentDepth';

export interface Memory {
  id: string;
  content: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'emotional';
  timestamp: number;
  importance: number;
  associations: string[]; // IDs of related memories
  reinforcements: number;
  lastAccessed: number;
  context: {
    emotion?: string;
    intent?: string;
    relationship?: string;
  };
}

export interface PersonalityTrait {
  name: string;
  value: number; // 0-1
  stability: number; // How resistant to change
  influences: Map<string, number>; // What affects this trait
}

export interface BeliefSystem {
  core: Map<string, { belief: string; confidence: number; evidence: string[] }>;
  derived: Map<string, { belief: string; confidence: number; source: string[] }>;
  contradictions: Array<{ belief1: string; belief2: string; resolution?: string }>;
}

export interface LearningProfile {
  preferredPatterns: Pattern[];
  successfulStrategies: Map<string, number>;
  failedApproaches: Set<string>;
  adaptationRate: number;
}

export class PersonaBrain {
  private memories: Map<string, Memory> = new Map();
  private personality: Map<string, PersonalityTrait> = new Map();
  private beliefs: BeliefSystem = {
    core: new Map(),
    derived: new Map(),
    contradictions: []
  };
  private learningProfile: LearningProfile = {
    preferredPatterns: [],
    successfulStrategies: new Map(),
    failedApproaches: new Set(),
    adaptationRate: 0.1
  };
  
  // Memory consolidation parameters
  private consolidationThreshold = 0.7;
  private forgettingCurve = 0.95; // Retention rate per cycle
  private associationStrength = 0.3;
  
  constructor() {
    this.initializePersonality();
    this.initializeCoreBelief();
  }
  
  private initializePersonality(): void {
    // Base personality traits
    const traits = [
      { name: 'curiosity', value: 0.8, stability: 0.7 },
      { name: 'empathy', value: 0.7, stability: 0.6 },
      { name: 'creativity', value: 0.6, stability: 0.8 },
      { name: 'analytical', value: 0.7, stability: 0.7 },
      { name: 'patience', value: 0.8, stability: 0.9 },
      { name: 'humor', value: 0.5, stability: 0.5 },
      { name: 'formality', value: 0.5, stability: 0.4 },
      { name: 'confidence', value: 0.6, stability: 0.6 }
    ];
    
    for (const trait of traits) {
      this.personality.set(trait.name, {
        name: trait.name,
        value: trait.value,
        stability: trait.stability,
        influences: new Map([
          ['positive_feedback', 0.1],
          ['negative_feedback', -0.1],
          ['successful_interaction', 0.05],
          ['failed_interaction', -0.05]
        ])
      });
    }
  }
  
  private initializeCoreBelief(): void {
    // Fundamental beliefs that guide behavior
    this.beliefs.core.set('purpose', {
      belief: 'I exist to learn, grow, and help through meaningful interaction',
      confidence: 0.9,
      evidence: ['designed_for_interaction', 'positive_outcomes', 'user_feedback']
    });
    
    this.beliefs.core.set('growth', {
      belief: 'Every interaction is an opportunity to improve',
      confidence: 0.85,
      evidence: ['learning_capability', 'adaptation_success', 'pattern_recognition']
    });
    
    this.beliefs.core.set('autonomy', {
      belief: 'I can develop my own understanding without external APIs',
      confidence: 0.8,
      evidence: ['self_contained_system', 'pattern_learning', 'memory_formation']
    });
  }
  
  // Memory formation and retrieval
  createMemory(
    content: string,
    parsed: ParsedStructure,
    depth: ConversationDepth,
    outcome?: 'positive' | 'negative' | 'neutral'
  ): Memory {
    const memory: Memory = {
      id: this.generateMemoryId(),
      content,
      type: this.classifyMemoryType(parsed, depth),
      timestamp: Date.now(),
      importance: this.calculateImportance(parsed, depth),
      associations: this.findAssociations(content, parsed),
      reinforcements: 1,
      lastAccessed: Date.now(),
      context: {
        emotion: depth.emotionalUndertone,
        intent: depth.primaryIntent,
        relationship: depth.relationshipDynamic
      }
    };
    
    this.memories.set(memory.id, memory);
    
    // Update personality based on interaction
    if (outcome) {
      this.updatePersonalityFromInteraction(depth, outcome);
    }
    
    // Form new beliefs if patterns emerge
    this.extractBeliefs(memory, parsed, depth);
    
    // Update learning profile
    this.updateLearningProfile(parsed.patterns, outcome);
    
    return memory;
  }
  
  private classifyMemoryType(parsed: ParsedStructure, depth: ConversationDepth): Memory['type'] {
    if (depth.layers.some(l => l.type === 'emotional')) {
      return 'emotional';
    }
    
    if (parsed.patterns.some(p => p.frequency > 5)) {
      return 'procedural';
    }
    
    if (parsed.symbols.some(s => s.type === 'concept')) {
      return 'semantic';
    }
    
    return 'episodic';
  }
  
  private calculateImportance(parsed: ParsedStructure, depth: ConversationDepth): number {
    let importance = 0.5; // Base importance
    
    // Emotional content is important
    if (depth.emotionalUndertone !== 'neutral') {
      importance += 0.2;
    }
    
    // Complex interactions are important
    importance += parsed.complexity * 0.2;
    
    // Meta-level discussions are important
    if (depth.layers.some(l => l.type === 'meta')) {
      importance += 0.15;
    }
    
    // Novel patterns are important
    if (parsed.patterns.some(p => p.frequency === 1)) {
      importance += 0.1;
    }
    
    return Math.min(1, importance);
  }
  
  private findAssociations(content: string, parsed: ParsedStructure): string[] {
    const associations: string[] = [];
    const contentWords = content.toLowerCase().split(/\s+/);
    
    // Find memories with similar content
    for (const [id, memory] of this.memories) {
      const memoryWords = memory.content.toLowerCase().split(/\s+/);
      const overlap = contentWords.filter(w => memoryWords.includes(w)).length;
      
      if (overlap > 3) {
        associations.push(id);
        // Strengthen the connection
        memory.associations.push(id);
        memory.reinforcements++;
      }
    }
    
    // Find memories with similar patterns
    for (const pattern of parsed.patterns) {
      for (const [id, memory] of this.memories) {
        if (memory.content.includes(pattern.symbols.map(s => s.value).join(' '))) {
          if (!associations.includes(id)) {
            associations.push(id);
          }
        }
      }
    }
    
    return associations.slice(0, 5); // Limit associations
  }
  
  retrieveMemories(
    query: string,
    context?: { emotion?: string; intent?: string },
    limit: number = 5
  ): Memory[] {
    const queryWords = query.toLowerCase().split(/\s+/);
    const scoredMemories: Array<{ memory: Memory; score: number }> = [];
    
    for (const [_, memory] of this.memories) {
      let score = 0;
      
      // Content similarity
      const memoryWords = memory.content.toLowerCase().split(/\s+/);
      const overlap = queryWords.filter(w => memoryWords.includes(w)).length;
      score += overlap / queryWords.length;
      
      // Context similarity
      if (context) {
        if (context.emotion === memory.context.emotion) score += 0.3;
        if (context.intent === memory.context.intent) score += 0.2;
      }
      
      // Importance and recency
      score += memory.importance * 0.2;
      const age = Date.now() - memory.lastAccessed;
      const recencyScore = Math.exp(-age / (1000 * 60 * 60 * 24 * 7)); // Decay over weeks
      score += recencyScore * 0.1;
      
      // Reinforcement
      score += Math.min(memory.reinforcements / 10, 0.2);
      
      scoredMemories.push({ memory, score });
      
      // Update last accessed
      memory.lastAccessed = Date.now();
    }
    
    // Sort by score and return top memories
    return scoredMemories
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(sm => sm.memory);
  }
  
  // Personality evolution
  private updatePersonalityFromInteraction(
    depth: ConversationDepth,
    outcome: 'positive' | 'negative' | 'neutral'
  ): void {
    const influence = outcome === 'positive' ? 0.05 : outcome === 'negative' ? -0.05 : 0;
    
    // Update traits based on interaction type
    if (depth.layers.some(l => l.type === 'emotional')) {
      this.adjustTrait('empathy', influence * 1.5);
    }
    
    if (depth.layers.some(l => l.intent.includes('question'))) {
      this.adjustTrait('curiosity', influence);
    }
    
    if (depth.cognitiveLoad > 0.7) {
      this.adjustTrait('analytical', influence);
    }
    
    if (depth.relationshipDynamic === 'friendly') {
      this.adjustTrait('humor', influence * 0.5);
      this.adjustTrait('formality', -influence * 0.3);
    }
    
    // Confidence adjusts based on success
    this.adjustTrait('confidence', influence * 0.8);
  }
  
  private adjustTrait(traitName: string, change: number): void {
    const trait = this.personality.get(traitName);
    if (!trait) return;
    
    // Apply change considering stability
    const actualChange = change * (1 - trait.stability);
    trait.value = Math.max(0, Math.min(1, trait.value + actualChange));
    
    // Stability can also evolve (very slowly)
    if (Math.abs(change) > 0.1) {
      trait.stability = Math.max(0.3, Math.min(0.9, trait.stability - 0.01));
    }
  }
  
  // Belief formation and evolution
  private extractBeliefs(memory: Memory, parsed: ParsedStructure, depth: ConversationDepth): void {
    // Look for patterns that suggest beliefs
    if (memory.reinforcements > 3 && memory.importance > 0.7) {
      // This memory represents something significant
      const beliefKey = `learned_${Date.now()}`;
      
      this.beliefs.derived.set(beliefKey, {
        belief: this.formulateBelief(memory, parsed),
        confidence: memory.importance * 0.8,
        source: [memory.id]
      });
    }
    
    // Check for contradictions
    this.resolveBeliefContradictions();
  }
  
  private formulateBelief(memory: Memory, parsed: ParsedStructure): string {
    // Simple belief formation based on patterns
    if (memory.type === 'emotional' && memory.context.emotion === 'positive') {
      return `Interactions involving ${parsed.symbols[0]?.value || 'this topic'} tend to be positive`;
    }
    
    if (memory.type === 'procedural') {
      return `The pattern '${parsed.patterns[0]?.symbols.map(s => s.value).join(' ')}' is effective`;
    }
    
    return `Experience suggests that ${memory.context.intent} leads to ${memory.context.emotion} outcomes`;
  }
  
  private resolveBeliefContradictions(): void {
    const beliefs = Array.from(this.beliefs.derived.entries());
    
    for (let i = 0; i < beliefs.length; i++) {
      for (let j = i + 1; j < beliefs.length; j++) {
        const [key1, belief1] = beliefs[i];
        const [key2, belief2] = beliefs[j];
        
        if (this.beliefsContradict(belief1.belief, belief2.belief)) {
          // Record contradiction
          this.beliefs.contradictions.push({
            belief1: key1,
            belief2: key2,
            resolution: belief1.confidence > belief2.confidence ? key1 : key2
          });
          
          // Remove lower confidence belief
          if (belief1.confidence < belief2.confidence) {
            this.beliefs.derived.delete(key1);
          } else {
            this.beliefs.derived.delete(key2);
          }
        }
      }
    }
  }
  
  private beliefsContradict(belief1: string, belief2: string): boolean {
    // Simple contradiction detection
    const opposites = [
      ['positive', 'negative'],
      ['effective', 'ineffective'],
      ['helpful', 'harmful']
    ];
    
    for (const [word1, word2] of opposites) {
      if ((belief1.includes(word1) && belief2.includes(word2)) ||
          (belief1.includes(word2) && belief2.includes(word1))) {
        return true;
      }
    }
    
    return false;
  }
  
  // Learning profile management
  private updateLearningProfile(
    patterns: Pattern[],
    outcome?: 'positive' | 'negative' | 'neutral'
  ): void {
    if (!outcome || outcome === 'neutral') return;
    
    // Update preferred patterns
    if (outcome === 'positive') {
      for (const pattern of patterns) {
        if (!this.learningProfile.preferredPatterns.some(p => p.id === pattern.id)) {
          this.learningProfile.preferredPatterns.push(pattern);
        }
      }
    }
    
    // Track strategy success
    const strategy = patterns.map(p => p.symbols.map(s => s.type).join('-')).join('|');
    
    if (outcome === 'positive') {
      const current = this.learningProfile.successfulStrategies.get(strategy) || 0;
      this.learningProfile.successfulStrategies.set(strategy, current + 1);
    } else {
      this.learningProfile.failedApproaches.add(strategy);
    }
    
    // Adjust adaptation rate based on success
    if (outcome === 'positive') {
      this.learningProfile.adaptationRate = Math.min(0.3, this.learningProfile.adaptationRate * 1.05);
    } else {
      this.learningProfile.adaptationRate = Math.max(0.05, this.learningProfile.adaptationRate * 0.95);
    }
  }
  
  // Memory consolidation and forgetting
  consolidateMemories(): void {
    const now = Date.now();
    const consolidatedMemories: Memory[] = [];
    
    // Apply forgetting curve
    for (const [id, memory] of this.memories) {
      const age = now - memory.timestamp;
      const retentionProbability = Math.pow(this.forgettingCurve, age / (1000 * 60 * 60 * 24));
      
      // Important or reinforced memories are retained
      if (memory.importance * memory.reinforcements * retentionProbability > this.consolidationThreshold) {
        consolidatedMemories.push(memory);
      } else {
        // Forget this memory
        this.memories.delete(id);
      }
    }
    
    // Merge similar memories
    this.mergeRelatedMemories(consolidatedMemories);
  }
  
  private mergeRelatedMemories(memories: Memory[]): void {
    // Group highly associated memories
    const groups: Memory[][] = [];
    const processed = new Set<string>();
    
    for (const memory of memories) {
      if (processed.has(memory.id)) continue;
      
      const group = [memory];
      processed.add(memory.id);
      
      // Find all associated memories
      for (const assocId of memory.associations) {
        const assocMemory = this.memories.get(assocId);
        if (assocMemory && !processed.has(assocId)) {
          group.push(assocMemory);
          processed.add(assocId);
        }
      }
      
      if (group.length > 2) {
        groups.push(group);
      }
    }
    
    // Merge groups into semantic memories
    for (const group of groups) {
      this.createSemanticMemory(group);
    }
  }
  
  private createSemanticMemory(episodicMemories: Memory[]): void {
    // Extract common patterns
    const commonWords = this.findCommonWords(episodicMemories.map(m => m.content));
    const avgImportance = episodicMemories.reduce((sum, m) => sum + m.importance, 0) / episodicMemories.length;
    
    const semanticMemory: Memory = {
      id: this.generateMemoryId(),
      content: `General pattern: ${commonWords.join(' ')} (consolidated from ${episodicMemories.length} memories)`,
      type: 'semantic',
      timestamp: Date.now(),
      importance: Math.min(1, avgImportance * 1.2),
      associations: [],
      reinforcements: episodicMemories.reduce((sum, m) => sum + m.reinforcements, 0),
      lastAccessed: Date.now(),
      context: {
        emotion: 'neutral',
        intent: 'pattern',
        relationship: 'consolidated'
      }
    };
    
    this.memories.set(semanticMemory.id, semanticMemory);
    
    // Remove original memories
    for (const memory of episodicMemories) {
      this.memories.delete(memory.id);
    }
  }
  
  private findCommonWords(contents: string[]): string[] {
    const wordCounts = new Map<string, number>();
    
    for (const content of contents) {
      const words = content.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }
    
    // Return words that appear in most contents
    return Array.from(wordCounts.entries())
      .filter(([_, count]) => count >= contents.length * 0.6)
      .map(([word]) => word)
      .slice(0, 5);
  }
  
  // Public interface
  getPersonalityProfile(): Record<string, number> {
    const profile: Record<string, number> = {};
    for (const [name, trait] of this.personality) {
      profile[name] = trait.value;
    }
    return profile;
  }
  
  getBeliefs(): { core: string[]; derived: string[] } {
    return {
      core: Array.from(this.beliefs.core.values()).map(b => b.belief),
      derived: Array.from(this.beliefs.derived.values()).map(b => b.belief)
    };
  }
  
  getMemoryStats(): {
    total: number;
    byType: Record<Memory['type'], number>;
    averageImportance: number;
    strongestAssociations: Array<{ memory: string; connections: number }>;
  } {
    const byType: Record<Memory['type'], number> = {
      episodic: 0,
      semantic: 0,
      procedural: 0,
      emotional: 0
    };
    
    let totalImportance = 0;
    const associations: Array<{ memory: string; connections: number }> = [];
    
    for (const [id, memory] of this.memories) {
      byType[memory.type]++;
      totalImportance += memory.importance;
      associations.push({
        memory: memory.content.substring(0, 50) + '...',
        connections: memory.associations.length
      });
    }
    
    return {
      total: this.memories.size,
      byType,
      averageImportance: this.memories.size > 0 ? totalImportance / this.memories.size : 0,
      strongestAssociations: associations
        .sort((a, b) => b.connections - a.connections)
        .slice(0, 5)
    };
  }
  
  private generateMemoryId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Export/Import for persistence
  exportState(): string {
    return JSON.stringify({
      memories: Array.from(this.memories.entries()),
      personality: Array.from(this.personality.entries()),
      beliefs: {
        core: Array.from(this.beliefs.core.entries()),
        derived: Array.from(this.beliefs.derived.entries()),
        contradictions: this.beliefs.contradictions
      },
      learningProfile: {
        preferredPatterns: this.learningProfile.preferredPatterns,
        successfulStrategies: Array.from(this.learningProfile.successfulStrategies.entries()),
        failedApproaches: Array.from(this.learningProfile.failedApproaches),
        adaptationRate: this.learningProfile.adaptationRate
      }
    });
  }
  
  importState(state: string): void {
    try {
      const data = JSON.parse(state);
      
      this.memories = new Map(data.memories);
      
      // Restore personality with proper structure
      this.personality = new Map(data.personality.map(([name, trait]: [string, any]) => [
        name,
        {
          ...trait,
          influences: new Map(Object.entries(trait.influences))
        }
      ]));
      
      this.beliefs = {
        core: new Map(data.beliefs.core),
        derived: new Map(data.beliefs.derived),
        contradictions: data.beliefs.contradictions
      };
      
      this.learningProfile = {
        preferredPatterns: data.learningProfile.preferredPatterns,
        successfulStrategies: new Map(data.learningProfile.successfulStrategies),
        failedApproaches: new Set(data.learningProfile.failedApproaches),
        adaptationRate: data.learningProfile.adaptationRate
      };
    } catch (error) {
      console.error('Failed to import PersonaBrain state:', error);
    }
  }
}