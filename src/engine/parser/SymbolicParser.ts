// src/engine/parser/SymbolicParser.ts
// Pattern recognition and symbol extraction without LLM dependencies

export interface Symbol {
  type: 'entity' | 'action' | 'attribute' | 'relation' | 'emotion' | 'concept';
  value: string;
  confidence: number;
  context?: string[];
  metadata?: Record<string, any>;
}

export interface Pattern {
  id: string;
  symbols: Symbol[];
  frequency: number;
  lastSeen: number;
  contexts: string[];
  weight: number;
}

export interface ParsedStructure {
  symbols: Symbol[];
  patterns: Pattern[];
  intent: string;
  complexity: number;
  relationships: Array<{
    from: Symbol;
    to: Symbol;
    type: string;
  }>;
}

export class SymbolicParser {
  private patterns: Map<string, Pattern> = new Map();
  private symbolCache: Map<string, Symbol[]> = new Map();
  private learningRate: number = 0.1;
  
  // Core linguistic patterns (no LLM needed)
  private actionPatterns = [
    /\b(want|need|like|love|hate|prefer|wish|hope|think|believe|know|understand)\b/gi,
    /\b(can|could|would|should|must|might|may|will)\b/gi,
    /\b(do|does|did|make|makes|made|create|build|design|write|read)\b/gi
  ];
  
  private entityPatterns = [
    /\b([A-Z][a-z]+)\b/g, // Proper nouns
    /\b(I|me|you|we|they|he|she|it)\b/gi, // Pronouns
    /\b(user|system|assistant|AI|bot|chatbot)\b/gi,
    /\b(\w+(?:\.com|\.org|\.net))\b/gi // Domains
  ];
  
  private emotionPatterns = new Map([
    ['positive', /\b(happy|glad|excited|pleased|wonderful|great|good|nice|love|like)\b/gi],
    ['negative', /\b(sad|angry|upset|frustrated|bad|terrible|hate|dislike|annoyed)\b/gi],
    ['neutral', /\b(okay|fine|alright|normal|regular|usual)\b/gi],
    ['uncertain', /\b(maybe|perhaps|possibly|might|unsure|confused|wonder)\b/gi]
  ]);
  
  private conceptPatterns = new Map([
    ['question', /\b(what|where|when|why|how|who|which)\b.*\?/gi],
    ['request', /\b(please|could you|can you|would you|help|assist)\b/gi],
    ['statement', /\b(is|are|was|were|has|have|had)\b[^?]*$/gi],
    ['command', /^(do|don't|stop|start|go|come|take|put|give)/i]
  ]);

  parse(text: string, context?: string[]): ParsedStructure {
    const normalizedText = this.normalize(text);
    const symbols = this.extractSymbols(normalizedText, context);
    const patterns = this.findPatterns(symbols, normalizedText);
    const relationships = this.extractRelationships(symbols, normalizedText);
    const intent = this.detectIntent(symbols, patterns);
    const complexity = this.calculateComplexity(symbols, relationships);
    
    // Learn from this parse
    this.updatePatterns(patterns, context || []);
    
    return {
      symbols,
      patterns,
      intent,
      complexity,
      relationships
    };
  }
  
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s?!.,'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  private extractSymbols(text: string, context?: string[]): Symbol[] {
    const symbols: Symbol[] = [];
    
    // Extract actions
    for (const pattern of this.actionPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        symbols.push({
          type: 'action',
          value: match[0].toLowerCase(),
          confidence: 0.8,
          context,
          metadata: { position: match.index }
        });
      }
    }
    
    // Extract entities
    const entityMatches = text.matchAll(/\b([A-Z][a-z]+|\w{3,})\b/g);
    for (const match of entityMatches) {
      const word = match[0];
      if (!this.isCommonWord(word.toLowerCase())) {
        symbols.push({
          type: 'entity',
          value: word,
          confidence: 0.7,
          context,
          metadata: { position: match.index }
        });
      }
    }
    
    // Extract emotions
    for (const [emotion, pattern] of this.emotionPatterns) {
      if (pattern.test(text)) {
        symbols.push({
          type: 'emotion',
          value: emotion,
          confidence: 0.85,
          context
        });
      }
    }
    
    // Extract concepts
    for (const [concept, pattern] of this.conceptPatterns) {
      if (pattern.test(text)) {
        symbols.push({
          type: 'concept',
          value: concept,
          confidence: 0.75,
          context
        });
      }
    }
    
    return symbols;
  }
  
  private findPatterns(symbols: Symbol[], text: string): Pattern[] {
    const foundPatterns: Pattern[] = [];
    const symbolSequence = symbols.map(s => `${s.type}:${s.value}`).join('|');
    
    // Check if we've seen this pattern before
    if (this.patterns.has(symbolSequence)) {
      const pattern = this.patterns.get(symbolSequence)!;
      pattern.frequency++;
      pattern.lastSeen = Date.now();
      foundPatterns.push(pattern);
    } else if (symbols.length >= 2) {
      // Create new pattern
      const newPattern: Pattern = {
        id: this.generatePatternId(),
        symbols: symbols,
        frequency: 1,
        lastSeen: Date.now(),
        contexts: [],
        weight: 0.5
      };
      this.patterns.set(symbolSequence, newPattern);
      foundPatterns.push(newPattern);
    }
    
    // Look for sub-patterns
    for (let i = 0; i < symbols.length - 1; i++) {
      for (let j = i + 2; j <= Math.min(i + 5, symbols.length); j++) {
        const subSymbols = symbols.slice(i, j);
        const subSequence = subSymbols.map(s => `${s.type}:${s.value}`).join('|');
        
        if (this.patterns.has(subSequence)) {
          const pattern = this.patterns.get(subSequence)!;
          pattern.frequency++;
          foundPatterns.push(pattern);
        }
      }
    }
    
    return foundPatterns;
  }
  
  private extractRelationships(symbols: Symbol[], text: string): Array<{from: Symbol; to: Symbol; type: string}> {
    const relationships: Array<{from: Symbol; to: Symbol; type: string}> = [];
    
    // Simple proximity-based relationships
    for (let i = 0; i < symbols.length - 1; i++) {
      const current = symbols[i];
      const next = symbols[i + 1];
      
      if (current.type === 'entity' && next.type === 'action') {
        relationships.push({
          from: current,
          to: next,
          type: 'performs'
        });
      } else if (current.type === 'action' && next.type === 'entity') {
        relationships.push({
          from: current,
          to: next,
          type: 'targets'
        });
      } else if (current.type === 'entity' && next.type === 'attribute') {
        relationships.push({
          from: current,
          to: next,
          type: 'has'
        });
      }
    }
    
    // Emotion relationships
    const emotionSymbols = symbols.filter(s => s.type === 'emotion');
    const entitySymbols = symbols.filter(s => s.type === 'entity');
    
    for (const emotion of emotionSymbols) {
      for (const entity of entitySymbols) {
        relationships.push({
          from: entity,
          to: emotion,
          type: 'feels'
        });
      }
    }
    
    return relationships;
  }
  
  private detectIntent(symbols: Symbol[], patterns: Pattern[]): string {
    // Rule-based intent detection
    const concepts = symbols.filter(s => s.type === 'concept').map(s => s.value);
    const actions = symbols.filter(s => s.type === 'action').map(s => s.value);
    
    if (concepts.includes('question')) {
      if (actions.includes('know') || actions.includes('understand')) {
        return 'seeking_knowledge';
      }
      return 'asking_question';
    }
    
    if (concepts.includes('request')) {
      return 'making_request';
    }
    
    if (concepts.includes('command')) {
      return 'giving_command';
    }
    
    if (symbols.some(s => s.type === 'emotion')) {
      return 'expressing_emotion';
    }
    
    if (patterns.some(p => p.frequency > 5)) {
      return 'following_pattern';
    }
    
    return 'general_statement';
  }
  
  private calculateComplexity(symbols: Symbol[], relationships: any[]): number {
    const uniqueTypes = new Set(symbols.map(s => s.type)).size;
    const symbolCount = symbols.length;
    const relationshipCount = relationships.length;
    
    // Normalize to 0-1 scale
    const complexity = Math.min(1, (uniqueTypes * 0.2 + symbolCount * 0.05 + relationshipCount * 0.1));
    return complexity;
  }
  
  private updatePatterns(patterns: Pattern[], contexts: string[]): void {
    for (const pattern of patterns) {
      // Update pattern weight based on frequency
      pattern.weight = Math.min(1, pattern.weight + this.learningRate * (pattern.frequency / 100));
      
      // Add new contexts
      for (const context of contexts) {
        if (!pattern.contexts.includes(context)) {
          pattern.contexts.push(context);
        }
      }
    }
  }
  
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'about', 'as', 'is', 'are', 'was', 'were',
      'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
      'those', 'it', 'its'
    ]);
    return commonWords.has(word);
  }
  
  private generatePatternId(): string {
    return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Learning methods
  reinforcePattern(patternId: string, reward: number): void {
    const pattern = Array.from(this.patterns.values()).find(p => p.id === patternId);
    if (pattern) {
      pattern.weight = Math.min(1, Math.max(0, pattern.weight + reward * this.learningRate));
    }
  }
  
  getLearnedPatterns(): Pattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.frequency > 3)
      .sort((a, b) => b.weight - a.weight);
  }
  
  // Prediction based on learned patterns
  predictNextSymbol(currentSymbols: Symbol[]): Symbol | null {
    const sequence = currentSymbols.map(s => `${s.type}:${s.value}`).join('|');
    
    // Find patterns that start with this sequence
    const matchingPatterns = Array.from(this.patterns.values()).filter(p => {
      const patternSequence = p.symbols.map(s => `${s.type}:${s.value}`).join('|');
      return patternSequence.startsWith(sequence);
    });
    
    if (matchingPatterns.length === 0) return null;
    
    // Weight by frequency and pattern weight
    const bestPattern = matchingPatterns.reduce((best, current) => {
      const bestScore = best.frequency * best.weight;
      const currentScore = current.frequency * current.weight;
      return currentScore > bestScore ? current : best;
    });
    
    // Return the next symbol in the pattern
    const nextIndex = currentSymbols.length;
    return nextIndex < bestPattern.symbols.length ? bestPattern.symbols[nextIndex] : null;
  }
  
  // Export learned knowledge
  exportKnowledge(): {
    patterns: Array<[string, Pattern]>;
    symbolCache: Array<[string, Symbol[]]>;
  } {
    return {
      patterns: Array.from(this.patterns.entries()),
      symbolCache: Array.from(this.symbolCache.entries())
    };
  }
  
  // Import learned knowledge
  importKnowledge(knowledge: {
    patterns: Array<[string, Pattern]>;
    symbolCache: Array<[string, Symbol[]]>;
  }): void {
    this.patterns = new Map(knowledge.patterns);
    this.symbolCache = new Map(knowledge.symbolCache);
  }
}