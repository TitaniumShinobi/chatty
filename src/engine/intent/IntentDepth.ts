// src/engine/intent/IntentDepth.ts
// Multi-layer intent analysis for understanding conversation depth

import { Symbol, ParsedStructure } from '../parser/SymbolicParser';

export interface IntentLayer {
  level: number;
  type: 'surface' | 'underlying' | 'meta' | 'emotional' | 'relational';
  intent: string;
  confidence: number;
  evidence: string[];
  implications: string[];
}

export interface ConversationDepth {
  layers: IntentLayer[];
  primaryIntent: string;
  hiddenIntents: string[];
  emotionalUndertone: string;
  relationshipDynamic: string;
  cognitiveLoad: number;
  responseStrategy: string;
}

export interface ContextualMemory {
  topic: string;
  depth: number;
  timestamp: number;
  relatedIntents: string[];
  emotionalTrajectory: number[]; // -1 to 1 over time
}

export class IntentDepth {
  private conversationHistory: Array<{text: string; depth: ConversationDepth; timestamp: number}> = [];
  private contextMemory: Map<string, ContextualMemory> = new Map();
  private intentPatterns: Map<string, number> = new Map(); // Intent frequency tracking
  private depthThreshold: number = 0.6;
  
  // Intent recognition rules (no LLM needed)
  private intentRules = new Map([
    // Surface intents
    ['greeting', {
      patterns: [/^(hi|hello|hey|good\s+(morning|afternoon|evening))/i],
      level: 0,
      type: 'surface' as const
    }],
    ['question_factual', {
      patterns: [/^(what|where|when|who)\s+(?:is|are|was|were)/i],
      level: 0,
      type: 'surface' as const
    }],
    ['request_action', {
      patterns: [/(can|could|would|will)\s+you\s+\w+/i, /please\s+\w+/i],
      level: 0,
      type: 'surface' as const
    }],
    
    // Underlying intents
    ['seeking_validation', {
      patterns: [/am\s+i\s+right/i, /don't\s+you\s+think/i, /would\s+you\s+agree/i],
      level: 1,
      type: 'underlying' as const
    }],
    ['expressing_uncertainty', {
      patterns: [/i'm\s+not\s+sure/i, /maybe|perhaps|possibly/i, /i\s+don't\s+know/i],
      level: 1,
      type: 'underlying' as const
    }],
    ['testing_boundaries', {
      patterns: [/what\s+if\s+i/i, /can\s+you\s+really/i, /are\s+you\s+able\s+to/i],
      level: 1,
      type: 'underlying' as const
    }],
    
    // Meta intents
    ['discussing_conversation', {
      patterns: [/this\s+conversation/i, /what\s+we're\s+talking\s+about/i, /our\s+discussion/i],
      level: 2,
      type: 'meta' as const
    }],
    ['questioning_ai_nature', {
      patterns: [/are\s+you\s+real/i, /do\s+you\s+think/i, /how\s+do\s+you\s+know/i],
      level: 2,
      type: 'meta' as const
    }],
    
    // Emotional intents
    ['seeking_comfort', {
      patterns: [/i'm\s+feeling/i, /i\s+feel\s+\w+/i, /it's\s+been\s+hard/i],
      level: 1,
      type: 'emotional' as const
    }],
    ['expressing_frustration', {
      patterns: [/this\s+is\s+frustrating/i, /i\s+don't\s+understand\s+why/i, /why\s+can't/i],
      level: 1,
      type: 'emotional' as const
    }],
    
    // Relational intents
    ['building_rapport', {
      patterns: [/tell\s+me\s+about\s+yourself/i, /what\s+do\s+you\s+like/i, /do\s+you\s+enjoy/i],
      level: 1,
      type: 'relational' as const
    }],
    ['establishing_trust', {
      patterns: [/can\s+i\s+trust/i, /are\s+you\s+honest/i, /will\s+you\s+remember/i],
      level: 1,
      type: 'relational' as const
    }]
  ]);
  
  analyzeDepth(text: string, parsedStructure: ParsedStructure): ConversationDepth {
    const layers = this.extractIntentLayers(text, parsedStructure);
    const primaryIntent = this.determinePrimaryIntent(layers);
    const hiddenIntents = this.findHiddenIntents(text, layers, parsedStructure);
    const emotionalUndertone = this.analyzeEmotionalUndertone(parsedStructure, layers);
    const relationshipDynamic = this.analyzeRelationshipDynamic(layers);
    const cognitiveLoad = this.calculateCognitiveLoad(layers, parsedStructure);
    const responseStrategy = this.determineResponseStrategy(layers, cognitiveLoad);
    
    const depth: ConversationDepth = {
      layers,
      primaryIntent,
      hiddenIntents,
      emotionalUndertone,
      relationshipDynamic,
      cognitiveLoad,
      responseStrategy
    };
    
    // Update history and learn
    this.updateHistory(text, depth);
    this.learnFromAnalysis(depth);
    
    return depth;
  }
  
  private extractIntentLayers(text: string, parsed: ParsedStructure): IntentLayer[] {
    const layers: IntentLayer[] = [];
    
    // Check against intent rules
    for (const [intentName, rule] of this.intentRules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          layers.push({
            level: rule.level,
            type: rule.type,
            intent: intentName,
            confidence: 0.8,
            evidence: [pattern.source],
            implications: this.getIntentImplications(intentName)
          });
        }
      }
    }
    
    // Analyze parsed structure for deeper intents
    if (parsed.complexity > 0.7) {
      layers.push({
        level: 2,
        type: 'meta',
        intent: 'complex_reasoning',
        confidence: parsed.complexity,
        evidence: ['high_complexity_score', `symbols: ${parsed.symbols.length}`],
        implications: ['requires_detailed_response', 'multi_faceted_thinking']
      });
    }
    
    // Check for emotional depth
    const emotionSymbols = parsed.symbols.filter(s => s.type === 'emotion');
    if (emotionSymbols.length > 0) {
      const dominantEmotion = emotionSymbols[0].value;
      layers.push({
        level: 1,
        type: 'emotional',
        intent: `expressing_${dominantEmotion}`,
        confidence: emotionSymbols[0].confidence,
        evidence: emotionSymbols.map(s => s.value),
        implications: this.getEmotionalImplications(dominantEmotion)
      });
    }
    
    // Pattern-based depth analysis
    if (this.conversationHistory.length > 2) {
      const recentPatterns = this.analyzeRecentPatterns();
      if (recentPatterns.repetition > 0.5) {
        layers.push({
          level: 2,
          type: 'meta',
          intent: 'pattern_exploration',
          confidence: recentPatterns.repetition,
          evidence: ['repeated_themes', 'circular_conversation'],
          implications: ['needs_breakthrough', 'stuck_on_topic']
        });
      }
    }
    
    return layers.sort((a, b) => b.level - a.level);
  }
  
  private determinePrimaryIntent(layers: IntentLayer[]): string {
    if (layers.length === 0) return 'unknown';
    
    // Weight by level and confidence
    const weightedLayers = layers.map(layer => ({
      ...layer,
      weight: (layer.level + 1) * layer.confidence
    }));
    
    // Find highest weighted intent
    const primary = weightedLayers.reduce((best, current) => 
      current.weight > best.weight ? current : best
    );
    
    return primary.intent;
  }
  
  private findHiddenIntents(text: string, layers: IntentLayer[], parsed: ParsedStructure): string[] {
    const hidden: string[] = [];
    
    // Question behind the question
    if (layers.some(l => l.intent === 'question_factual')) {
      const emotionalLayer = layers.find(l => l.type === 'emotional');
      if (emotionalLayer) {
        hidden.push('seeking_emotional_support');
      }
    }
    
    // Repeated topics indicate obsession or concern
    const topicFrequency = this.getTopicFrequency(text);
    if (topicFrequency > 3) {
      hidden.push('fixated_on_topic');
    }
    
    // Complex questions might hide simpler needs
    if (parsed.complexity > 0.8 && layers.some(l => l.type === 'surface')) {
      hidden.push('overcomplicating_simple_need');
    }
    
    // Relationship testing
    if (text.includes('you') && text.includes('I') && layers.some(l => l.type === 'relational')) {
      hidden.push('defining_relationship');
    }
    
    return hidden;
  }
  
  private analyzeEmotionalUndertone(parsed: ParsedStructure, layers: IntentLayer[]): string {
    const emotionalLayers = layers.filter(l => l.type === 'emotional');
    const emotionSymbols = parsed.symbols.filter(s => s.type === 'emotion');
    
    if (emotionalLayers.length === 0 && emotionSymbols.length === 0) {
      return 'neutral';
    }
    
    // Check for mixed emotions
    if (emotionSymbols.length > 1) {
      const emotions = emotionSymbols.map(s => s.value);
      if (emotions.includes('positive') && emotions.includes('negative')) {
        return 'conflicted';
      }
    }
    
    // Analyze conversation trajectory
    if (this.conversationHistory.length > 0) {
      const recentEmotions = this.conversationHistory
        .slice(-3)
        .map(h => h.depth.emotionalUndertone);
      
      if (recentEmotions.every(e => e === 'negative')) {
        return 'persistently_negative';
      }
      if (recentEmotions[0] !== recentEmotions[recentEmotions.length - 1]) {
        return 'emotionally_shifting';
      }
    }
    
    return emotionalLayers[0]?.intent.replace('expressing_', '') || 'neutral';
  }
  
  private analyzeRelationshipDynamic(layers: IntentLayer[]): string {
    const relationalLayers = layers.filter(l => l.type === 'relational');
    
    if (relationalLayers.length === 0) {
      return 'neutral';
    }
    
    // Map intents to dynamics
    const dynamics = {
      'building_rapport': 'friendly',
      'establishing_trust': 'cautious',
      'testing_boundaries': 'exploratory',
      'questioning_ai_nature': 'philosophical'
    };
    
    const primaryRelational = relationalLayers[0];
    return dynamics[primaryRelational.intent as keyof typeof dynamics] || 'developing';
  }
  
  private calculateCognitiveLoad(layers: IntentLayer[], parsed: ParsedStructure): number {
    let load = 0;
    
    // Multiple layers increase load
    load += layers.length * 0.1;
    
    // Higher level intents increase load
    load += layers.reduce((sum, layer) => sum + (layer.level * 0.15), 0);
    
    // Complexity adds to load
    load += parsed.complexity * 0.3;
    
    // Hidden intents add load
    load += (layers.filter(l => l.level > 1).length * 0.2);
    
    return Math.min(1, load);
  }
  
  private determineResponseStrategy(layers: IntentLayer[], cognitiveLoad: number): string {
    // High cognitive load needs simplification
    if (cognitiveLoad > 0.8) {
      return 'simplify_and_clarify';
    }
    
    // Meta-level discussions need depth
    if (layers.some(l => l.type === 'meta')) {
      return 'engage_philosophically';
    }
    
    // Emotional content needs empathy
    if (layers.some(l => l.type === 'emotional')) {
      return 'respond_empathetically';
    }
    
    // Relational building needs reciprocity
    if (layers.some(l => l.type === 'relational')) {
      return 'build_connection';
    }
    
    // Multiple surface intents need organization
    if (layers.filter(l => l.level === 0).length > 2) {
      return 'organize_and_prioritize';
    }
    
    return 'direct_response';
  }
  
  private getIntentImplications(intent: string): string[] {
    const implications: Record<string, string[]> = {
      'greeting': ['establish_rapport', 'set_tone'],
      'question_factual': ['provide_information', 'be_accurate'],
      'seeking_validation': ['offer_support', 'validate_feelings'],
      'testing_boundaries': ['clarify_capabilities', 'be_honest'],
      'seeking_comfort': ['show_empathy', 'provide_reassurance'],
      'building_rapport': ['reciprocate_interest', 'share_appropriately']
    };
    
    return implications[intent] || ['respond_appropriately'];
  }
  
  private getEmotionalImplications(emotion: string): string[] {
    const implications: Record<string, string[]> = {
      'positive': ['maintain_positivity', 'celebrate_with_user'],
      'negative': ['acknowledge_difficulty', 'offer_support'],
      'uncertain': ['provide_clarity', 'reduce_ambiguity'],
      'neutral': ['maintain_balance', 'follow_user_lead']
    };
    
    return implications[emotion] || ['respond_sensitively'];
  }
  
  private analyzeRecentPatterns(): { repetition: number; themes: string[] } {
    if (this.conversationHistory.length < 3) {
      return { repetition: 0, themes: [] };
    }
    
    const recent = this.conversationHistory.slice(-5);
    const intents = recent.flatMap(h => h.depth.layers.map(l => l.intent));
    
    // Count intent frequencies
    const intentCounts = new Map<string, number>();
    for (const intent of intents) {
      intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
    }
    
    // Calculate repetition score
    const maxCount = Math.max(...intentCounts.values());
    const repetition = maxCount / intents.length;
    
    // Extract themes
    const themes = Array.from(intentCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([intent, _]) => intent);
    
    return { repetition, themes };
  }
  
  private getTopicFrequency(text: string): number {
    // Simple topic extraction based on nouns
    const words = text.toLowerCase().split(/\s+/);
    let maxFrequency = 0;
    
    for (const [topic, memory] of this.contextMemory) {
      const topicWords = topic.split(/\s+/);
      const matches = topicWords.filter(w => words.includes(w)).length;
      if (matches > 0) {
        memory.relatedIntents.push(text.substring(0, 20) + '...');
        maxFrequency = Math.max(maxFrequency, memory.relatedIntents.length);
      }
    }
    
    return maxFrequency;
  }
  
  private updateHistory(text: string, depth: ConversationDepth): void {
    this.conversationHistory.push({
      text,
      depth,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.conversationHistory.length > 50) {
      this.conversationHistory.shift();
    }
    
    // Update context memory
    const primaryTopic = this.extractPrimaryTopic(text);
    if (primaryTopic) {
      const memory = this.contextMemory.get(primaryTopic) || {
        topic: primaryTopic,
        depth: 0,
        timestamp: Date.now(),
        relatedIntents: [],
        emotionalTrajectory: []
      };
      
      memory.depth = Math.max(memory.depth, depth.layers[0]?.level || 0);
      memory.relatedIntents.push(depth.primaryIntent);
      memory.emotionalTrajectory.push(
        depth.emotionalUndertone === 'positive' ? 1 :
        depth.emotionalUndertone === 'negative' ? -1 : 0
      );
      
      this.contextMemory.set(primaryTopic, memory);
    }
  }
  
  private extractPrimaryTopic(text: string): string | null {
    // Simple noun extraction for topic
    const words = text.split(/\s+/);
    const nouns = words.filter(w => 
      w.length > 3 && 
      !this.isCommonWord(w.toLowerCase()) &&
      /^[A-Za-z]+$/.test(w)
    );
    
    return nouns[0] || null;
  }
  
  private isCommonWord(word: string): boolean {
    const common = new Set(['this', 'that', 'what', 'when', 'where', 'which', 'would', 'could', 'should']);
    return common.has(word);
  }
  
  private learnFromAnalysis(depth: ConversationDepth): void {
    // Track intent patterns
    for (const layer of depth.layers) {
      const count = this.intentPatterns.get(layer.intent) || 0;
      this.intentPatterns.set(layer.intent, count + 1);
    }
  }
  
  // Public methods for external use
  getConversationSummary(): {
    dominantIntents: string[];
    emotionalJourney: string;
    relationshipStatus: string;
    suggestedDirection: string;
  } {
    if (this.conversationHistory.length === 0) {
      return {
        dominantIntents: [],
        emotionalJourney: 'just_started',
        relationshipStatus: 'initial',
        suggestedDirection: 'explore_user_needs'
      };
    }
    
    // Find dominant intents
    const dominantIntents = Array.from(this.intentPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([intent]) => intent);
    
    // Analyze emotional journey
    const emotions = this.conversationHistory.map(h => h.depth.emotionalUndertone);
    const emotionalJourney = this.summarizeEmotionalJourney(emotions);
    
    // Current relationship status
    const lastDepth = this.conversationHistory[this.conversationHistory.length - 1].depth;
    const relationshipStatus = lastDepth.relationshipDynamic;
    
    // Suggest direction
    const suggestedDirection = this.suggestConversationDirection(dominantIntents, emotionalJourney);
    
    return {
      dominantIntents,
      emotionalJourney,
      relationshipStatus,
      suggestedDirection
    };
  }
  
  private summarizeEmotionalJourney(emotions: string[]): string {
    if (emotions.length === 0) return 'no_data';
    
    const positive = emotions.filter(e => e.includes('positive')).length;
    const negative = emotions.filter(e => e.includes('negative')).length;
    const neutral = emotions.filter(e => e === 'neutral').length;
    
    if (positive > negative * 2) return 'predominantly_positive';
    if (negative > positive * 2) return 'predominantly_negative';
    if (Math.abs(positive - negative) < 2) return 'balanced';
    
    return 'mixed';
  }
  
  private suggestConversationDirection(intents: string[], journey: string): string {
    if (journey === 'predominantly_negative') {
      return 'shift_to_solutions';
    }
    
    if (intents.includes('testing_boundaries')) {
      return 'establish_clear_capabilities';
    }
    
    if (intents.includes('building_rapport')) {
      return 'deepen_connection';
    }
    
    if (intents.filter(i => i.startsWith('question')).length > 2) {
      return 'provide_comprehensive_answers';
    }
    
    return 'follow_user_lead';
  }
}