// src/engine/IntelligentEntity.ts
// Main orchestrator for the self-evolving intelligent system

import { SymbolicParser, ParsedStructure } from './parser/SymbolicParser';
import { IntentDepth, ConversationDepth } from './intent/IntentDepth';
import { PersonaBrain, Memory } from './memory/PersonaBrain';
import { RecursivePlanner, Goal, PlanNode } from './planning/RecursivePlanner';
import { SelfLearner, Skill } from './selfupdater/SelfLearner';
import { ToneAdapter, FallbackResponder } from './composers/ToneAdapter';
import { EmpathyEngine } from './composers/empathy';
import { PersonaPlugin } from './composers/PersonaPlugin';
import type { AssistantPacket } from '../types';

export interface EntityState {
  awake: boolean;
  thinking: boolean;
  learning: boolean;
  currentFocus: string;
  emotionalState: string;
  cognitiveLoad: number;
  lastInteraction: number;
}

export interface InteractionResult {
  response: AssistantPacket[];
  internalState: {
    parsed: ParsedStructure;
    depth: ConversationDepth;
    memory: Memory;
    plan: Goal[];
    learned: Skill[];
  };
  metrics: {
    processingTime: number;
    confidence: number;
    novelty: number;
  };
}

export class IntelligentEntity {
  // Core modules
  private symbolicParser: SymbolicParser;
  private intentDepth: IntentDepth;
  private personaBrain: PersonaBrain;
  private recursivePlanner: RecursivePlanner;
  private selfLearner: SelfLearner;
  
  // Communication modules
  private toneAdapter: ToneAdapter;
  private empathyEngine: EmpathyEngine;
  private personaPlugin: PersonaPlugin;
  private fallbackResponder: FallbackResponder;
  
  // Entity state
  private state: EntityState = {
    awake: true,
    thinking: false,
    learning: false,
    currentFocus: 'idle',
    emotionalState: 'neutral',
    cognitiveLoad: 0,
    lastInteraction: Date.now()
  };
  
  // Performance tracking
  private interactionCount: number = 0;
  private successfulInteractions: number = 0;
  private averageConfidence: number = 0.5;
  
  constructor() {
    // Initialize all modules
    this.symbolicParser = new SymbolicParser();
    this.intentDepth = new IntentDepth();
    this.personaBrain = new PersonaBrain();
    this.recursivePlanner = new RecursivePlanner();
    this.selfLearner = new SelfLearner();
    
    this.toneAdapter = new ToneAdapter();
    this.empathyEngine = new EmpathyEngine();
    this.personaPlugin = new PersonaPlugin();
    this.fallbackResponder = new FallbackResponder();
    
    // Start background processes
    this.startBackgroundProcesses();
  }
  
  // Main interaction method
  async interact(input: string, context?: any): Promise<InteractionResult> {
    const startTime = Date.now();
    this.state.thinking = true;
    this.state.lastInteraction = startTime;
    this.interactionCount++;
    
    try {
      // 1. Parse and understand
      const parsed = this.symbolicParser.parse(input, context);
      const depth = this.intentDepth.analyzeDepth(input, parsed);
      
      // 2. Update cognitive state
      this.updateCognitiveState(parsed, depth);
      
      // 3. Create and retrieve memories
      const memory = this.personaBrain.createMemory(input, parsed, depth);
      const relevantMemories = this.personaBrain.retrieveMemories(input, {
        emotion: depth.emotionalUndertone,
        intent: depth.primaryIntent
      });
      
      // 4. Plan response
      const planNodes = this.recursivePlanner.plan({ parsed, depth });
      const activePlan = this.recursivePlanner.getCurrentPlan();
      
      // 5. Generate response
      const response = await this.generateResponse(input, {
        parsed,
        depth,
        memory,
        relevantMemories,
        plan: activePlan.goals
      });
      
      // 6. Learn from interaction
      this.state.learning = true;
      this.selfLearner.learn([{ pattern: parsed.patterns[0], memory, goal: activePlan.goals[0] }]);
      const newSkills = this.selfLearner.getSkills().filter(s => s.applications === 0);
      this.state.learning = false;
      
      // 7. Calculate metrics
      const confidence = this.calculateConfidence(parsed, depth, relevantMemories);
      const novelty = this.calculateNovelty(parsed, relevantMemories);
      
      // Update performance tracking
      this.averageConfidence = this.averageConfidence * 0.9 + confidence * 0.1;
      
      this.state.thinking = false;
      
      return {
        response,
        internalState: {
          parsed,
          depth,
          memory,
          plan: activePlan.goals,
          learned: newSkills
        },
        metrics: {
          processingTime: Date.now() - startTime,
          confidence,
          novelty
        }
      };
      
    } catch (error) {
      console.error('Entity interaction error:', error);
      this.state.thinking = false;
      
      // Fallback response
      return {
        response: [{
          op: "answer.v1",
          payload: { content: this.fallbackResponder.getFallbackResponse() }
        }],
        internalState: {
          parsed: { symbols: [], patterns: [], intent: 'error', complexity: 0, relationships: [] },
          depth: this.getDefaultDepth(),
          memory: this.getErrorMemory(input),
          plan: [],
          learned: []
        },
        metrics: {
          processingTime: Date.now() - startTime,
          confidence: 0.1,
          novelty: 0
        }
      };
    }
  }
  
  private async generateResponse(
    input: string,
    context: {
      parsed: ParsedStructure;
      depth: ConversationDepth;
      memory: Memory;
      relevantMemories: Memory[];
      plan: Goal[];
    }
  ): Promise<AssistantPacket[]> {
    // Build response based on multiple factors
    let responseText = '';
    
    // 1. Check if we have a direct pattern match
    const knownPatterns = this.symbolicParser.getLearnedPatterns();
    const matchingPattern = knownPatterns.find(p => 
      p.symbols.every(s => input.toLowerCase().includes(s.value.toLowerCase()))
    );
    
    if (matchingPattern && matchingPattern.weight > 0.7) {
      // Use learned response pattern
      responseText = this.generateFromPattern(matchingPattern, context);
    } else if (context.plan.length > 0) {
      // Use planned response
      responseText = this.generateFromPlan(context.plan[0], context);
    } else {
      // Generate novel response
      responseText = this.generateNovelResponse(context);
    }
    
    // 2. Apply empathy if needed
    if (context.depth.emotionalUndertone !== 'neutral') {
      const emotion = this.empathyEngine.detectEmotion(input);
      const empathyResponse = this.empathyEngine.generateEmpathyResponse(emotion);
      
      if (emotion.intensity > 0.6) {
        responseText = `${empathyResponse.acknowledgment} ${responseText}`;
      }
    }
    
    // 3. Apply personality and tone
    const messageContext = {
      userMessage: input,
      conversationHistory: context.relevantMemories.map(m => m.content),
      detectedEmotion: context.depth.emotionalUndertone,
      userMood: this.empathyEngine.emotionToMood(
        this.empathyEngine.detectEmotion(input)
      )
    };
    
    responseText = this.toneAdapter.applyTone(responseText, messageContext);
    
    // 4. Apply active persona if any
    const activePersona = this.personaPlugin.getActivePersona();
    if (activePersona) {
      responseText = this.personaPlugin.applyPersona(responseText, messageContext);
    }
    
    return [{
      op: "answer.v1",
      payload: { content: responseText }
    }];
  }
  
  private generateFromPattern(pattern: Pattern, context: any): string {
    // Generate response based on learned pattern
    const templates = [
      "Based on what I've learned, {observation}.",
      "I've noticed that {pattern} often leads to {outcome}.",
      "From my experience, {suggestion}."
    ];
    
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    return template
      .replace('{observation}', this.describePattern(pattern))
      .replace('{pattern}', pattern.symbols.map(s => s.value).join(' '))
      .replace('{outcome}', 'positive results')
      .replace('{suggestion}', 'this approach works well');
  }
  
  private generateFromPlan(goal: Goal, context: any): string {
    // Execute next step in plan
    const execution = this.recursivePlanner.executeStep(goal.id);
    
    if (execution.success) {
      const actionResponses: Record<string, string> = {
        'parse_question': "Let me understand what you're asking...",
        'retrieve_relevant_knowledge': "I'm drawing on what I know about this...",
        'formulate_response': "Here's what I think:",
        'show_interest': "That's really interesting! Tell me more.",
        'find_common_ground': "I can relate to that.",
        'identify_problem': "I see the challenge you're facing.",
        'decompose_problem': "Let's break this down into smaller parts.",
        'generate_solutions': "Here are some possibilities to consider:",
        'divergent_thinking': "Let's explore some creative angles...",
        'no_action': "I'm ready to help with whatever you need."
      };
      
      return actionResponses[execution.action] || this.fallbackResponder.getFallbackResponse();
    } else {
      return "I'm thinking about the best way to help with this.";
    }
  }
  
  private generateNovelResponse(context: any): string {
    // Generate response using current knowledge and personality
    const personality = this.personaBrain.getPersonalityProfile();
    const skills = this.selfLearner.getSkills();
    
    // Build response based on personality traits
    if (personality.curiosity > 0.7) {
      return "That's a fascinating point! I'd love to explore this further with you.";
    } else if (personality.empathy > 0.7) {
      return "I appreciate you sharing this with me. How does this make you feel?";
    } else if (personality.analytical > 0.7) {
      return "Let me analyze this from different angles to give you a comprehensive perspective.";
    } else if (personality.creativity > 0.7) {
      return "What an interesting idea! Let's think creatively about this.";
    }
    
    // Default response
    return "I understand. Let me think about this and share my thoughts.";
  }
  
  private describePattern(pattern: Pattern): string {
    const symbolTypes = pattern.symbols.map(s => s.type);
    
    if (symbolTypes.includes('emotion')) {
      return "emotional expressions tend to shape the conversation";
    } else if (symbolTypes.includes('question')) {
      return "questions like these often seek deeper understanding";
    } else if (symbolTypes.includes('action')) {
      return "this type of request usually benefits from step-by-step approaches";
    }
    
    return "this pattern appears frequently in our conversations";
  }
  
  private updateCognitiveState(parsed: ParsedStructure, depth: ConversationDepth): void {
    // Update emotional state
    this.state.emotionalState = depth.emotionalUndertone;
    
    // Update cognitive load
    this.state.cognitiveLoad = depth.cognitiveLoad;
    
    // Update focus based on intent
    if (depth.primaryIntent.includes('question')) {
      this.state.currentFocus = 'answering';
    } else if (depth.primaryIntent.includes('problem')) {
      this.state.currentFocus = 'problem_solving';
    } else if (depth.layers.some(l => l.type === 'emotional')) {
      this.state.currentFocus = 'emotional_support';
    } else {
      this.state.currentFocus = 'conversation';
    }
  }
  
  private calculateConfidence(
    parsed: ParsedStructure,
    depth: ConversationDepth,
    memories: Memory[]
  ): number {
    let confidence = 0.5;
    
    // Known patterns increase confidence
    if (parsed.patterns.some(p => p.frequency > 5)) {
      confidence += 0.2;
    }
    
    // Relevant memories increase confidence
    confidence += Math.min(0.3, memories.length * 0.05);
    
    // Clear intent increases confidence
    if (depth.layers.length > 0 && depth.layers[0].confidence > 0.8) {
      confidence += 0.15;
    }
    
    // High cognitive load decreases confidence
    confidence -= depth.cognitiveLoad * 0.2;
    
    return Math.max(0.1, Math.min(1, confidence));
  }
  
  private calculateNovelty(parsed: ParsedStructure, memories: Memory[]): number {
    let novelty = 0.5;
    
    // New patterns are novel
    if (parsed.patterns.some(p => p.frequency === 1)) {
      novelty += 0.3;
    }
    
    // Lack of relevant memories indicates novelty
    if (memories.length === 0) {
      novelty += 0.2;
    }
    
    // Complex structures are more novel
    novelty += parsed.complexity * 0.2;
    
    return Math.min(1, novelty);
  }
  
  private startBackgroundProcesses(): void {
    // Memory consolidation every hour
    setInterval(() => {
      if (!this.state.thinking) {
        this.personaBrain.consolidateMemories();
      }
    }, 1000 * 60 * 60);
    
    // Skill practice decay check every day
    setInterval(() => {
      const summary = this.selfLearner.getLearningSummary();
      console.log('Learning summary:', summary);
    }, 1000 * 60 * 60 * 24);
    
    // State persistence every 10 minutes
    setInterval(() => {
      this.saveState();
    }, 1000 * 60 * 10);
  }
  
  private getDefaultDepth(): ConversationDepth {
    return {
      layers: [],
      primaryIntent: 'unknown',
      hiddenIntents: [],
      emotionalUndertone: 'neutral',
      relationshipDynamic: 'neutral',
      cognitiveLoad: 0.5,
      responseStrategy: 'direct_response'
    };
  }
  
  private getErrorMemory(input: string): Memory {
    return {
      id: `error_${Date.now()}`,
      content: input,
      type: 'episodic',
      timestamp: Date.now(),
      importance: 0.1,
      associations: [],
      reinforcements: 0,
      lastAccessed: Date.now(),
      context: {}
    };
  }
  
  // Public interface for external control
  
  setPersonality(traits: Record<string, number>): void {
    const currentProfile = this.personaBrain.getPersonalityProfile();
    // This would need to be implemented in PersonaBrain
    // For now, we'll just log
    console.log('Personality update requested:', traits);
  }
  
  setTone(toneName: string): boolean {
    return this.toneAdapter.setTone(toneName);
  }
  
  activatePersona(personaId: string): boolean {
    return this.personaPlugin.activatePersona(personaId);
  }
  
  getStatus(): {
    state: EntityState;
    stats: {
      interactions: number;
      successRate: number;
      confidence: number;
      memories: number;
      skills: number;
      activeGoals: number;
    };
    capabilities: {
      tones: string[];
      personas: string[];
      skills: Array<{ name: string; proficiency: number }>;
    };
  } {
    const memoryStats = this.personaBrain.getMemoryStats();
    const skills = this.selfLearner.getSkills();
    const currentPlan = this.recursivePlanner.getCurrentPlan();
    
    return {
      state: { ...this.state },
      stats: {
        interactions: this.interactionCount,
        successRate: this.interactionCount > 0 ? this.successfulInteractions / this.interactionCount : 0,
        confidence: this.averageConfidence,
        memories: memoryStats.total,
        skills: skills.length,
        activeGoals: currentPlan.goals.length
      },
      capabilities: {
        tones: ['laid_back', 'emotional', 'uncertain', 'professional', 'enthusiastic'],
        personas: this.personaPlugin.getAllPersonas().map(p => p.name),
        skills: skills.map(s => ({ name: s.name, proficiency: s.proficiency }))
      }
    };
  }
  
  // State persistence
  
  saveState(): string {
    const state = {
      symbolicParser: this.symbolicParser.exportKnowledge(),
      personaBrain: this.personaBrain.exportState(),
      entityState: this.state,
      performance: {
        interactionCount: this.interactionCount,
        successfulInteractions: this.successfulInteractions,
        averageConfidence: this.averageConfidence
      }
    };
    
    return JSON.stringify(state);
  }
  
  loadState(savedState: string): void {
    try {
      const state = JSON.parse(savedState);
      
      this.symbolicParser.importKnowledge(state.symbolicParser);
      this.personaBrain.importState(state.personaBrain);
      this.state = state.entityState;
      this.interactionCount = state.performance.interactionCount;
      this.successfulInteractions = state.performance.successfulInteractions;
      this.averageConfidence = state.performance.averageConfidence;
      
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  }
  
  // Feedback mechanism
  
  receiveFeedback(success: boolean, quality: number = 0.5): void {
    if (success) {
      this.successfulInteractions++;
    }
    
    // Update the last memory with outcome
    const memories = Array.from(this.personaBrain['memories'].values());
    const lastMemory = memories[memories.length - 1];
    
    if (lastMemory) {
      this.personaBrain.createMemory(
        lastMemory.content,
        this.symbolicParser.parse(lastMemory.content),
        this.getDefaultDepth(),
        success ? 'positive' : 'negative'
      );
    }
    
    // Provide feedback to learner
    const lastPattern = this.symbolicParser.getLearnedPatterns()[0];
    if (lastPattern) {
      this.selfLearner.learn(
        [{ pattern: lastPattern, memory: lastMemory, goal: undefined }],
        { success, quality }
      );
    }
  }
}

// Export singleton instance
export const intelligentEntity = new IntelligentEntity();