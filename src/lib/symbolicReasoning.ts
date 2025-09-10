// @ts-nocheck
// Symbolic Reasoning Engine - Pattern Detection and Thematic Inference
// Detects symbolic patterns, synthesizes motifs, and enables thematic reasoning

import { MemoryEntry } from './memoryLedger';
import { Chunk } from './chunkingEngine';
import { UnifiedSearchResult } from './unifiedSemanticRetrieval';
import { NarrativeSynthesisEngine, NarrativeQuery, MultiDocumentSynthesis } from './narrativeSynthesis';
import { pkt } from './emit';
import { lexicon as lex } from '../data/lexicon';

export interface SymbolicPattern {
  id: string;
  type: 'conceptual' | 'linguistic' | 'structural' | 'temporal' | 'semantic';
  pattern: string;
  confidence: number;
  frequency: number;
  contexts: string[];
  metadata: {
    sourceType: 'memory' | 'chunk' | 'combined';
    sourceIds: string[];
    firstSeen: number;
    lastSeen: number;
    strength: number;
    complexity: number;
  };
  relationships: {
    parentPatterns: string[];
    childPatterns: string[];
    relatedPatterns: string[];
    conflictingPatterns: string[];
  };
}

export interface Motif {
  id: string;
  name: string;
  description: string;
  type: 'conceptual' | 'narrative' | 'thematic' | 'symbolic' | 'structural';
  patterns: string[]; // Pattern IDs
  instances: Array<{
    content: string;
    sourceId: string;
    sourceType: 'memory' | 'chunk';
    context: string;
    confidence: number;
    timestamp: number;
  }>;
  metadata: {
    frequency: number;
    strength: number;
    complexity: number;
    coherence: number;
    evolution: Array<{
      timestamp: number;
      strength: number;
      frequency: number;
      description: string;
    }>;
  };
  relationships: {
    parentMotifs: string[];
    childMotifs: string[];
    relatedMotifs: string[];
    conflictingMotifs: string[];
  };
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  motifs: string[]; // Motif IDs
  patterns: string[]; // Pattern IDs
  strength: number;
  coherence: number;
  evolution: Array<{
    timestamp: number;
    strength: number;
    coherence: number;
    description: string;
  }>;
  metadata: {
    firstSeen: number;
    lastSeen: number;
    frequency: number;
    complexity: number;
    stability: number;
  };
}

export interface SymbolicQuery {
  type: 'pattern_detection' | 'motif_synthesis' | 'theme_inference' | 'correlation_analysis' | 'evolution_tracking';
  query: string;
  filters?: {
    timeRange?: { start: number; end: number };
    sourceTypes?: ('memory' | 'chunk')[];
    patternTypes?: SymbolicPattern['type'][];
    motifTypes?: Motif['type'][];
    minConfidence?: number;
    minFrequency?: number;
  };
  options: {
    includePatterns: boolean;
    includeMotifs: boolean;
    includeThemes: boolean;
    includeEvolution: boolean;
    maxResults: number;
    depth: number; // Recursion depth for pattern tracking
  };
}

export interface SymbolicInsight {
  id: string;
  type: 'pattern_discovery' | 'motif_evolution' | 'theme_emergence' | 'correlation_finding' | 'anomaly_detection';
  title: string;
  description: string;
  confidence: number;
  evidence: Array<{
    type: 'pattern' | 'motif' | 'theme' | 'correlation';
    id: string;
    strength: number;
    context: string;
  }>;
  metadata: {
    timestamp: number;
    sourceCount: number;
    patternCount: number;
    motifCount: number;
    themeCount: number;
  };
}

export interface AnchorPattern {
  id: string;
  anchor: string;
  type: 'structural' | 'conceptual' | 'temporal' | 'semantic';
  instances: Array<{
    content: string;
    sourceId: string;
    sourceType: 'memory' | 'chunk';
    context: string;
    position: number;
    confidence: number;
  }>;
  metadata: {
    frequency: number;
    strength: number;
    consistency: number;
    firstSeen: number;
    lastSeen: number;
  };
}

export class SymbolicReasoningEngine {
  private patterns: Map<string, SymbolicPattern> = new Map();
  private motifs: Map<string, Motif> = new Map();
  private themes: Map<string, Theme> = new Map();
  private anchorPatterns: Map<string, AnchorPattern> = new Map();
  private insights: Map<string, SymbolicInsight> = new Map();
  private patternIndex: Map<string, Set<string>> = new Map(); // pattern -> patternIds
  private motifIndex: Map<string, Set<string>> = new Map(); // motif -> motifIds
  private themeIndex: Map<string, Set<string>> = new Map(); // theme -> themeIds
  private narrativeSynthesis: NarrativeSynthesisEngine;
  private packetEmitter?: (packet: any) => void;

  constructor() {
    this.initializePatternDetectors();
    this.narrativeSynthesis = new NarrativeSynthesisEngine();
  }

  /**
   * Set packet emitter for real-time feedback
   */
  setPacketEmitter(emitter: (packet: any) => void): void {
    this.packetEmitter = emitter;
    this.narrativeSynthesis.setPacketEmitter(emitter);
  }

  /**
   * Analyze content for symbolic patterns
   */
  async analyzeContent(
    content: Array<{ id: string; content: string; type: 'memory' | 'chunk'; metadata?: any }>,
    options?: {
      detectPatterns?: boolean;
      synthesizeMotifs?: boolean;
      inferThemes?: boolean;
      trackAnchors?: boolean;
      depth?: number;
    }
  ): Promise<{
    patterns: SymbolicPattern[];
    motifs: Motif[];
    themes: Theme[];
    anchorPatterns: AnchorPattern[];
    insights: SymbolicInsight[];
  }> {
    const results = {
      patterns: [] as SymbolicPattern[],
      motifs: [] as Motif[],
      themes: [] as Theme[],
      anchorPatterns: [] as AnchorPattern[],
      insights: [] as SymbolicInsight[]
    };

    try {
      // Detect patterns
      if (options?.detectPatterns !== false) {
        const detectedPatterns = await this.detectPatterns(content);
        results.patterns = detectedPatterns;
        
        this.emitPacket(pkt(lex.symbolicPatternDetected, {
          patternCount: detectedPatterns.length,
          contentCount: content.length
        }));
      }

      // Synthesize motifs
      if (options?.synthesizeMotifs !== false) {
        const synthesizedMotifs = await this.synthesizeMotifs(results.patterns);
        results.motifs = synthesizedMotifs;
        
        this.emitPacket(pkt(lex.motifSynthesized, {
          motifCount: synthesizedMotifs.length,
          patternCount: results.patterns.length
        }));
      }

      // Infer themes
      if (options?.inferThemes !== false) {
        const inferredThemes = await this.inferThemes(results.motifs, results.patterns);
        results.themes = inferredThemes;
        
        this.emitPacket(pkt(lex.themeInferred, {
          themeCount: inferredThemes.length,
          motifCount: results.motifs.length
        }));
      }

      // Track anchor patterns
      if (options?.trackAnchors !== false) {
        const trackedAnchors = await this.trackAnchorPatterns(content);
        results.anchorPatterns = trackedAnchors;
        
        this.emitPacket(pkt(lex.anchorPatternFound, {
          anchorCount: trackedAnchors.length,
          contentCount: content.length
        }));
      }

      // Generate insights
      const generatedInsights = await this.generateInsights(results);
      results.insights = generatedInsights;

      this.emitPacket(pkt(lex.symbolicReasoningCompleted, {
        patternCount: results.patterns.length,
        motifCount: results.motifs.length,
        themeCount: results.themes.length,
        insightCount: results.insights.length
      }));

      return results;
    } catch (error) {
      console.error('Symbolic reasoning analysis failed:', error);
      throw error;
    }
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
    const results: any = {};

    try {
      switch (query.type) {
        case 'pattern_detection':
          results.patterns = this.queryPatterns(query);
          break;
        case 'motif_synthesis':
          results.motifs = this.queryMotifs(query);
          break;
        case 'theme_inference':
          results.themes = this.queryThemes(query);
          break;
        case 'correlation_analysis':
          results.correlations = await this.analyzeCorrelations(query);
          break;
        case 'evolution_tracking':
          results.evolution = await this.trackEvolution(query);
          break;
      }

      this.emitPacket(pkt(lex.symbolicQueryExecuted, {
        queryType: query.type,
        resultCount: Object.values(results).flat().length
      }));

      return results;
    } catch (error) {
      console.error('Symbolic query execution failed:', error);
      throw error;
    }
  }

  /**
   * Detect patterns in content
   */
  private async detectPatterns(
    content: Array<{ id: string; content: string; type: 'memory' | 'chunk'; metadata?: any }>
  ): Promise<SymbolicPattern[]> {
    const patterns: SymbolicPattern[] = [];
    const patternMap = new Map<string, SymbolicPattern>();

    for (const item of content) {
      // Detect conceptual patterns
      const conceptualPatterns = this.detectConceptualPatterns(item.content, item.id, item.type);
      for (const pattern of conceptualPatterns) {
        const key = `${pattern.type}:${pattern.pattern}`;
        if (patternMap.has(key)) {
          const existing = patternMap.get(key)!;
          existing.frequency++;
          existing.contexts.push(item.id);
          existing.metadata.lastSeen = Date.now();
          existing.metadata.strength = Math.max(existing.metadata.strength, pattern.confidence);
        } else {
          patternMap.set(key, pattern);
        }
      }

      // Detect linguistic patterns
      const linguisticPatterns = this.detectLinguisticPatterns(item.content, item.id, item.type);
      for (const pattern of linguisticPatterns) {
        const key = `${pattern.type}:${pattern.pattern}`;
        if (patternMap.has(key)) {
          const existing = patternMap.get(key)!;
          existing.frequency++;
          existing.contexts.push(item.id);
          existing.metadata.lastSeen = Date.now();
          existing.metadata.strength = Math.max(existing.metadata.strength, pattern.confidence);
        } else {
          patternMap.set(key, pattern);
        }
      }

      // Detect structural patterns
      const structuralPatterns = this.detectStructuralPatterns(item.content, item.id, item.type);
      for (const pattern of structuralPatterns) {
        const key = `${pattern.type}:${pattern.pattern}`;
        if (patternMap.has(key)) {
          const existing = patternMap.get(key)!;
          existing.frequency++;
          existing.contexts.push(item.id);
          existing.metadata.lastSeen = Date.now();
          existing.metadata.strength = Math.max(existing.metadata.strength, pattern.confidence);
        } else {
          patternMap.set(key, pattern);
        }
      }
    }

    // Filter patterns by frequency and confidence
    for (const pattern of patternMap.values()) {
      if (pattern.frequency >= 2 && pattern.confidence >= 0.3) {
        patterns.push(pattern);
        this.patterns.set(pattern.id, pattern);
        this.updatePatternIndex(pattern);
      }
    }

    return patterns;
  }

  /**
   * Synthesize motifs from patterns
   */
  private async synthesizeMotifs(patterns: SymbolicPattern[]): Promise<Motif[]> {
    const motifs: Motif[] = [];
    const motifGroups = this.groupPatternsIntoMotifs(patterns);

    for (const group of motifGroups) {
      const motif = this.createMotifFromPatterns(group);
      motifs.push(motif);
      this.motifs.set(motif.id, motif);
      this.updateMotifIndex(motif);
    }

    return motifs;
  }

  /**
   * Infer themes from motifs and patterns
   */
  private async inferThemes(motifs: Motif[], patterns: SymbolicPattern[]): Promise<Theme[]> {
    const themes: Theme[] = [];
    const themeGroups = this.groupMotifsIntoThemes(motifs, patterns);

    for (const group of themeGroups) {
      const theme = this.createThemeFromMotifs(group);
      themes.push(theme);
      this.themes.set(theme.id, theme);
      this.updateThemeIndex(theme);
    }

    return themes;
  }

  /**
   * Track anchor patterns in content
   */
  private async trackAnchorPatterns(
    content: Array<{ id: string; content: string; type: 'memory' | 'chunk'; metadata?: any }>
  ): Promise<AnchorPattern[]> {
    const anchors: AnchorPattern[] = [];
    const anchorMap = new Map<string, AnchorPattern>();

    for (const item of content) {
      const detectedAnchors = this.detectAnchorPatterns(item.content, item.id, item.type);
      
      for (const anchor of detectedAnchors) {
        const key = anchor.anchor.toLowerCase();
        if (anchorMap.has(key)) {
          const existing = anchorMap.get(key)!;
          existing.instances.push(anchor);
          existing.metadata.frequency++;
          existing.metadata.lastSeen = Date.now();
        } else {
          anchorMap.set(key, {
            id: crypto.randomUUID(),
            anchor: anchor.anchor,
            type: anchor.type,
            instances: [anchor],
            metadata: {
              frequency: 1,
              strength: anchor.confidence,
              consistency: 1,
              firstSeen: Date.now(),
              lastSeen: Date.now()
            }
          });
        }
      }
    }

    // Filter anchors by frequency
    for (const anchor of anchorMap.values()) {
      if (anchor.metadata.frequency >= 2) {
        anchors.push(anchor);
        this.anchorPatterns.set(anchor.id, anchor);
      }
    }

    return anchors;
  }

  /**
   * Generate insights from analysis results
   */
  private async generateInsights(results: {
    patterns: SymbolicPattern[];
    motifs: Motif[];
    themes: Theme[];
    anchorPatterns: AnchorPattern[];
  }): Promise<SymbolicInsight[]> {
    const insights: SymbolicInsight[] = [];

    // Pattern discovery insights
    if (results.patterns.length > 0) {
      const strongPatterns = results.patterns.filter(p => p.confidence > 0.7);
      if (strongPatterns.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'pattern_discovery',
          title: 'Strong Recurring Patterns Detected',
          description: `Found ${strongPatterns.length} high-confidence patterns across content`,
          confidence: strongPatterns.reduce((sum, p) => sum + p.confidence, 0) / strongPatterns.length,
          evidence: strongPatterns.map(p => ({
            type: 'pattern',
            id: p.id,
            strength: p.confidence,
            context: p.pattern
          })),
          metadata: {
            timestamp: Date.now(),
            sourceCount: results.patterns.length,
            patternCount: strongPatterns.length,
            motifCount: 0,
            themeCount: 0
          }
        });
      }
    }

    // Motif evolution insights
    if (results.motifs.length > 0) {
      const evolvingMotifs = results.motifs.filter(m => m.metadata.evolution.length > 1);
      if (evolvingMotifs.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'motif_evolution',
          title: 'Motif Evolution Observed',
          description: `${evolvingMotifs.length} motifs show evolutionary patterns`,
          confidence: 0.8,
          evidence: evolvingMotifs.map(m => ({
            type: 'motif',
            id: m.id,
            strength: m.metadata.strength,
            context: m.name
          })),
          metadata: {
            timestamp: Date.now(),
            sourceCount: results.motifs.length,
            patternCount: 0,
            motifCount: evolvingMotifs.length,
            themeCount: 0
          }
        });
      }
    }

    // Theme emergence insights
    if (results.themes.length > 0) {
      const strongThemes = results.themes.filter(t => t.strength > 0.6);
      if (strongThemes.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'theme_emergence',
          title: 'Emerging Themes Identified',
          description: `${strongThemes.length} strong themes emerging from content analysis`,
          confidence: strongThemes.reduce((sum, t) => sum + t.strength, 0) / strongThemes.length,
          evidence: strongThemes.map(t => ({
            type: 'theme',
            id: t.id,
            strength: t.strength,
            context: t.name
          })),
          metadata: {
            timestamp: Date.now(),
            sourceCount: results.themes.length,
            patternCount: 0,
            motifCount: 0,
            themeCount: strongThemes.length
          }
        });
      }
    }

    return insights;
  }

  // Pattern detection methods
  private detectConceptualPatterns(content: string, sourceId: string, sourceType: 'memory' | 'chunk'): SymbolicPattern[] {
    const patterns: SymbolicPattern[] = [];
    
    // Detect concept clusters
    const concepts = this.extractConcepts(content);
    for (const concept of concepts) {
      patterns.push({
        id: crypto.randomUUID(),
        type: 'conceptual',
        pattern: concept,
        confidence: 0.7,
        frequency: 1,
        contexts: [sourceId],
        metadata: {
          sourceType,
          sourceIds: [sourceId],
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          strength: 0.7,
          complexity: this.calculateComplexity(concept)
        },
        relationships: {
          parentPatterns: [],
          childPatterns: [],
          relatedPatterns: [],
          conflictingPatterns: []
        }
      });
    }

    return patterns;
  }

  private detectLinguisticPatterns(content: string, sourceId: string, sourceType: 'memory' | 'chunk'): SymbolicPattern[] {
    const patterns: SymbolicPattern[] = [];
    
    // Detect linguistic structures
    const linguisticStructures = this.extractLinguisticStructures(content);
    for (const structure of linguisticStructures) {
      patterns.push({
        id: crypto.randomUUID(),
        type: 'linguistic',
        pattern: structure,
        confidence: 0.6,
        frequency: 1,
        contexts: [sourceId],
        metadata: {
          sourceType,
          sourceIds: [sourceId],
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          strength: 0.6,
          complexity: this.calculateComplexity(structure)
        },
        relationships: {
          parentPatterns: [],
          childPatterns: [],
          relatedPatterns: [],
          conflictingPatterns: []
        }
      });
    }

    return patterns;
  }

  private detectStructuralPatterns(content: string, sourceId: string, sourceType: 'memory' | 'chunk'): SymbolicPattern[] {
    const patterns: SymbolicPattern[] = [];
    
    // Detect structural elements
    const structuralElements = this.extractStructuralElements(content);
    for (const element of structuralElements) {
      patterns.push({
        id: crypto.randomUUID(),
        type: 'structural',
        pattern: element,
        confidence: 0.8,
        frequency: 1,
        contexts: [sourceId],
        metadata: {
          sourceType,
          sourceIds: [sourceId],
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          strength: 0.8,
          complexity: this.calculateComplexity(element)
        },
        relationships: {
          parentPatterns: [],
          childPatterns: [],
          relatedPatterns: [],
          conflictingPatterns: []
        }
      });
    }

    return patterns;
  }

  private detectAnchorPatterns(content: string, sourceId: string, sourceType: 'memory' | 'chunk'): Array<{
    anchor: string;
    type: AnchorPattern['type'];
    confidence: number;
  }> {
    const anchors: Array<{ anchor: string; type: AnchorPattern['type']; confidence: number }> = [];
    
    // Detect structural anchors
    const structuralAnchors = content.match(/(chapter|section|part|appendix)\s+\d+/gi) || [];
    for (const anchor of structuralAnchors) {
      anchors.push({
        anchor,
        type: 'structural',
        confidence: 0.9
      });
    }

    // Detect conceptual anchors
    const conceptualAnchors = content.match(/(concept|principle|theory|method)\s+[a-z]+/gi) || [];
    for (const anchor of conceptualAnchors) {
      anchors.push({
        anchor,
        type: 'conceptual',
        confidence: 0.7
      });
    }

    return anchors;
  }

  // Helper methods
  private extractConcepts(content: string): string[] {
    // Simple concept extraction - in production, use NLP libraries
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const concepts: string[] = [];

    for (const sentence of sentences) {
      const words = sentence.split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        const concept = `${words[i]} ${words[i + 1]}`.toLowerCase();
        if (concept.length > 5 && !this.isCommonPhrase(concept)) {
          concepts.push(concept);
        }
      }
    }

    return [...new Set(concepts)].slice(0, 10);
  }

  private extractLinguisticStructures(content: string): string[] {
    // Simple linguistic structure detection
    const structures: string[] = [];
    
    // Detect question patterns
    if (content.includes('?')) {
      structures.push('question_pattern');
    }
    
    // Detect list patterns
    if (content.match(/\d+\./g)) {
      structures.push('numbered_list');
    }
    
    // Detect definition patterns
    if (content.match(/is\s+a|are\s+/gi)) {
      structures.push('definition_pattern');
    }

    return structures;
  }

  private extractStructuralElements(content: string): string[] {
    // Simple structural element detection
    const elements: string[] = [];
    
    // Detect headings
    if (content.match(/^[A-Z][^.!?]*$/gm)) {
      elements.push('heading_structure');
    }
    
    // Detect paragraphs
    const paragraphs = content.split(/\n\s*\n/);
    if (paragraphs.length > 2) {
      elements.push('paragraph_structure');
    }

    return elements;
  }

  private calculateComplexity(pattern: string): number {
    // Simple complexity calculation
    const wordCount = pattern.split(/\s+/).length;
    const uniqueWords = new Set(pattern.split(/\s+/)).size;
    return Math.min(1, (uniqueWords / wordCount) * 2);
  }

  private isCommonPhrase(phrase: string): boolean {
    const commonPhrases = [
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'within', 'without'
    ];
    return commonPhrases.includes(phrase);
  }

  private groupPatternsIntoMotifs(patterns: SymbolicPattern[]): SymbolicPattern[][] {
    // Simple motif grouping - in production, use clustering algorithms
    const groups: SymbolicPattern[][] = [];
    const used = new Set<string>();

    for (const pattern of patterns) {
      if (used.has(pattern.id)) continue;

      const group = [pattern];
      used.add(pattern.id);

      // Find related patterns
      for (const other of patterns) {
        if (used.has(other.id)) continue;
        
        if (this.arePatternsRelated(pattern, other)) {
          group.push(other);
          used.add(other.id);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  private arePatternsRelated(pattern1: SymbolicPattern, pattern2: SymbolicPattern): boolean {
    // Simple relatedness check - in production, use semantic similarity
    const words1 = pattern1.pattern.toLowerCase().split(/\s+/);
    const words2 = pattern2.pattern.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length > 0;
  }

  private createMotifFromPatterns(patterns: SymbolicPattern[]): Motif {
    const name = this.generateMotifName(patterns);
    const description = this.generateMotifDescription(patterns);
    
    return {
      id: crypto.randomUUID(),
      name,
      description,
      type: 'conceptual',
      patterns: patterns.map(p => p.id),
      instances: patterns.map(p => ({
        content: p.pattern,
        sourceId: p.contexts[0],
        sourceType: p.metadata.sourceType,
        context: p.pattern,
        confidence: p.confidence,
        timestamp: p.metadata.firstSeen
      })),
      metadata: {
        frequency: patterns.length,
        strength: patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length,
        complexity: patterns.reduce((sum, p) => sum + p.metadata.complexity, 0) / patterns.length,
        coherence: this.calculateMotifCoherence(patterns),
        evolution: [{
          timestamp: Date.now(),
          strength: patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length,
          frequency: patterns.length,
          description: 'Initial motif formation'
        }]
      },
      relationships: {
        parentMotifs: [],
        childMotifs: [],
        relatedMotifs: [],
        conflictingMotifs: []
      }
    };
  }

  private generateMotifName(patterns: SymbolicPattern[]): string {
    // Simple motif naming - in production, use more sophisticated naming
    const commonWords = this.findCommonWords(patterns.map(p => p.pattern));
    return commonWords.length > 0 ? commonWords.join('_') : 'motif_' + Date.now();
  }

  private generateMotifDescription(patterns: SymbolicPattern[]): string {
    return `Motif formed from ${patterns.length} related patterns: ${patterns.map(p => p.pattern).join(', ')}`;
  }

  private findCommonWords(patterns: string[]): string[] {
    const wordCounts = new Map<string, number>();
    
    for (const pattern of patterns) {
      const words = pattern.toLowerCase().split(/\s+/);
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    return Array.from(wordCounts.entries())
      .filter(([word, count]) => count > 1 && word.length > 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word);
  }

  private calculateMotifCoherence(patterns: SymbolicPattern[]): number {
    // Simple coherence calculation
    if (patterns.length < 2) return 1;
    
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        totalSimilarity += this.calculatePatternSimilarity(patterns[i], patterns[j]);
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private calculatePatternSimilarity(pattern1: SymbolicPattern, pattern2: SymbolicPattern): number {
    // Simple similarity calculation - in production, use embeddings
    const words1 = pattern1.pattern.toLowerCase().split(/\s+/);
    const words2 = pattern2.pattern.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  private groupMotifsIntoThemes(motifs: Motif[], patterns: SymbolicPattern[]): Motif[][] {
    // Simple theme grouping
    const groups: Motif[][] = [];
    const used = new Set<string>();

    for (const motif of motifs) {
      if (used.has(motif.id)) continue;

      const group = [motif];
      used.add(motif.id);

      // Find related motifs
      for (const other of motifs) {
        if (used.has(other.id)) continue;
        
        if (this.areMotifsRelated(motif, other)) {
          group.push(other);
          used.add(other.id);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  private areMotifsRelated(motif1: Motif, motif2: Motif): boolean {
    // Check if motifs share patterns or have similar names
    const patterns1 = new Set(motif1.patterns);
    const patterns2 = new Set(motif2.patterns);
    
    const sharedPatterns = Array.from(patterns1).filter(p => patterns2.has(p));
    if (sharedPatterns.length > 0) return true;
    
    // Check name similarity
    const words1 = motif1.name.toLowerCase().split(/\s+/);
    const words2 = motif2.name.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length > 0;
  }

  private createThemeFromMotifs(motifs: Motif[]): Theme {
    const name = this.generateThemeName(motifs);
    const description = this.generateThemeDescription(motifs);
    
    return {
      id: crypto.randomUUID(),
      name,
      description,
      motifs: motifs.map(m => m.id),
      patterns: motifs.flatMap(m => m.patterns),
      strength: motifs.reduce((sum, m) => sum + m.metadata.strength, 0) / motifs.length,
      coherence: this.calculateThemeCoherence(motifs),
      evolution: [{
        timestamp: Date.now(),
        strength: motifs.reduce((sum, m) => sum + m.metadata.strength, 0) / motifs.length,
        coherence: this.calculateThemeCoherence(motifs),
        description: 'Initial theme formation'
      }],
      metadata: {
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        frequency: motifs.length,
        complexity: motifs.reduce((sum, m) => sum + m.metadata.complexity, 0) / motifs.length,
        stability: 0.5 // Initial stability
      }
    };
  }

  private generateThemeName(motifs: Motif[]): string {
    const commonWords = this.findCommonWords(motifs.map(m => m.name));
    return commonWords.length > 0 ? commonWords.join('_') : 'theme_' + Date.now();
  }

  private generateThemeDescription(motifs: Motif[]): string {
    return `Theme formed from ${motifs.length} related motifs: ${motifs.map(m => m.name).join(', ')}`;
  }

  private calculateThemeCoherence(motifs: Motif[]): number {
    if (motifs.length < 2) return 1;
    
    let totalCoherence = 0;
    let comparisons = 0;
    
    for (let i = 0; i < motifs.length; i++) {
      for (let j = i + 1; j < motifs.length; j++) {
        totalCoherence += this.calculateMotifSimilarity(motifs[i], motifs[j]);
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalCoherence / comparisons : 0;
  }

  private calculateMotifSimilarity(motif1: Motif, motif2: Motif): number {
    // Simple motif similarity calculation
    const patterns1 = new Set(motif1.patterns);
    const patterns2 = new Set(motif2.patterns);
    
    const sharedPatterns = Array.from(patterns1).filter(p => patterns2.has(p));
    const totalPatterns = new Set([...patterns1, ...patterns2]).size;
    
    return totalPatterns > 0 ? sharedPatterns.length / totalPatterns : 0;
  }

  // Query methods
  private queryPatterns(query: SymbolicQuery): SymbolicPattern[] {
    let patterns = Array.from(this.patterns.values());
    
    if (query.filters?.patternTypes) {
      patterns = patterns.filter(p => query.filters!.patternTypes!.includes(p.type));
    }
    
    if (query.filters?.minConfidence) {
      patterns = patterns.filter(p => p.confidence >= query.filters!.minConfidence!);
    }
    
    if (query.filters?.minFrequency) {
      patterns = patterns.filter(p => p.frequency >= query.filters!.minFrequency!);
    }
    
    return patterns.slice(0, query.options.maxResults);
  }

  private queryMotifs(query: SymbolicQuery): Motif[] {
    let motifs = Array.from(this.motifs.values());
    
    if (query.filters?.motifTypes) {
      motifs = motifs.filter(m => query.filters!.motifTypes!.includes(m.type));
    }
    
    if (query.filters?.minConfidence) {
      motifs = motifs.filter(m => m.metadata.strength >= query.filters!.minConfidence!);
    }
    
    return motifs.slice(0, query.options.maxResults);
  }

  private queryThemes(query: SymbolicQuery): Theme[] {
    let themes = Array.from(this.themes.values());
    
    if (query.filters?.minConfidence) {
      themes = themes.filter(t => t.strength >= query.filters!.minConfidence!);
    }
    
    return themes.slice(0, query.options.maxResults);
  }

  private async analyzeCorrelations(query: SymbolicQuery): Promise<Array<{
    type: string;
    strength: number;
    entities: string[];
    evidence: string[];
  }>> {
    const correlations: Array<{
      type: string;
      strength: number;
      entities: string[];
      evidence: string[];
    }> = [];

    // Analyze pattern correlations
    const patterns = Array.from(this.patterns.values());
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const correlation = this.calculatePatternCorrelation(patterns[i], patterns[j]);
        if (correlation.strength > 0.5) {
          correlations.push(correlation);
        }
      }
    }

    return correlations.slice(0, query.options.maxResults);
  }

  private calculatePatternCorrelation(pattern1: SymbolicPattern, pattern2: SymbolicPattern): {
    type: string;
    strength: number;
    entities: string[];
    evidence: string[];
  } {
    const sharedContexts = pattern1.contexts.filter(c => pattern2.contexts.includes(c));
    const strength = sharedContexts.length / Math.max(pattern1.contexts.length, pattern2.contexts.length);
    
    return {
      type: 'pattern_correlation',
      strength,
      entities: [pattern1.id, pattern2.id],
      evidence: sharedContexts
    };
  }

  private async trackEvolution(query: SymbolicQuery): Promise<any[]> {
    const evolution: any[] = [];
    
    // Track motif evolution
    const motifs = Array.from(this.motifs.values());
    for (const motif of motifs) {
      if (motif.metadata.evolution.length > 1) {
        evolution.push({
          type: 'motif_evolution',
          id: motif.id,
          name: motif.name,
          evolution: motif.metadata.evolution
        });
      }
    }
    
    // Track theme evolution
    const themes = Array.from(this.themes.values());
    for (const theme of themes) {
      if (theme.evolution.length > 1) {
        evolution.push({
          type: 'theme_evolution',
          id: theme.id,
          name: theme.name,
          evolution: theme.evolution
        });
      }
    }
    
    return evolution.slice(0, query.options.maxResults);
  }

  // Index management
  private updatePatternIndex(pattern: SymbolicPattern): void {
    const key = pattern.type;
    if (!this.patternIndex.has(key)) {
      this.patternIndex.set(key, new Set());
    }
    this.patternIndex.get(key)!.add(pattern.id);
  }

  private updateMotifIndex(motif: Motif): void {
    const key = motif.type;
    if (!this.motifIndex.has(key)) {
      this.motifIndex.set(key, new Set());
    }
    this.motifIndex.get(key)!.add(motif.id);
  }

  private updateThemeIndex(theme: Theme): void {
    const key = 'theme';
    if (!this.themeIndex.has(key)) {
      this.themeIndex.set(key, new Set());
    }
    this.themeIndex.get(key)!.add(theme.id);
  }

  private initializePatternDetectors(): void {
    // Initialize pattern detection algorithms
    // In production, this would set up more sophisticated detectors
  }

  /**
   * Synthesize narrative from symbolic analysis results
   */
  async synthesizeNarrative(
    options?: {
      generateStoryArcs?: boolean;
      createScaffolding?: boolean;
      applySymbolicFraming?: boolean;
      maxLength?: number;
      detailLevel?: 'summary' | 'detailed' | 'comprehensive';
    }
  ): Promise<{
    narrative: string;
    storyArcs: any[];
    scaffolds: any[];
    frames: any[];
    insights: any[];
  }> {
    const elements = {
      motifs: Array.from(this.motifs.values()),
      themes: Array.from(this.themes.values()),
      patterns: Array.from(this.patterns.values()),
      insights: Array.from(this.insights.values())
    };

    return await this.narrativeSynthesis.synthesizeNarrative(elements, options);
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
   * Perform multi-document synthesis
   */
  async performMultiDocumentSynthesis(query: NarrativeQuery): Promise<MultiDocumentSynthesis> {
    return await this.narrativeSynthesis.performMultiDocumentSynthesis(query);
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
