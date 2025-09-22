// src/engine/ConversationCore.ts
// Core conversation engine with personality and empathy integration

import { ToneAdapter, MessageContext, FallbackResponder, ToneProfile } from './composers/ToneAdapter';
import { EmpathyEngine, EmotionalState } from './composers/empathy';
import { PersonaPlugin } from './composers/PersonaPlugin';
import type { AssistantPacket } from '../types';

export interface ConversationState {
  mood: {
    user: { valence: number; arousal: number; dominance: number };
    conversation: { valence: number; arousal: number; dominance: number };
  };
  emotion: EmotionalState;
  context: {
    topic?: string;
    intent?: string;
    recentTopics: string[];
  };
  personality: {
    currentTone: string;
    adaptationLevel: number;
  };
}

export interface ProcessingOptions {
  enableEmpathy?: boolean;
  enableToneAdaptation?: boolean;
  enableFallback?: boolean;
  customTone?: string;
  forcePersonality?: string;
  usePersona?: string;
}

export class ConversationCore {
  private toneAdapter: ToneAdapter;
  private empathyEngine: EmpathyEngine;
  private fallbackResponder: FallbackResponder;
  private personaPlugin: PersonaPlugin;
  private conversationHistory: string[] = [];
  private state: ConversationState;
  
  // Plugin system
  private preprocessors: ((message: string) => string)[] = [];
  private postprocessors: ((response: string, context: MessageContext) => string)[] = [];
  
  constructor(initialTone: string = 'laid_back') {
    this.toneAdapter = new ToneAdapter(initialTone);
    this.empathyEngine = new EmpathyEngine();
    this.fallbackResponder = new FallbackResponder();
    this.personaPlugin = new PersonaPlugin();
    
    this.state = {
      mood: {
        user: { valence: 0, arousal: 0.5, dominance: 0.5 },
        conversation: { valence: 0, arousal: 0.5, dominance: 0.5 }
      },
      emotion: {
        primaryEmotion: 'neutral',
        intensity: 0.5,
        confidence: 0.5
      },
      context: {
        recentTopics: []
      },
      personality: {
        currentTone: initialTone,
        adaptationLevel: 0.7
      }
    };
  }

  // Main processing pipeline
  async processMessage(
    message: string, 
    options: ProcessingOptions = {}
  ): Promise<AssistantPacket[]> {
    const {
      enableEmpathy = true,
      enableToneAdaptation = true,
      enableFallback = true,
      customTone,
      forcePersonality
    } = options;

    // Update conversation history
    this.conversationHistory.push(message);
    if (this.conversationHistory.length > 10) {
      this.conversationHistory.shift();
    }

    // Preprocessing
    let processedMessage = message;
    for (const preprocessor of this.preprocessors) {
      processedMessage = preprocessor(processedMessage);
    }

    // Emotional analysis
    const emotion = this.empathyEngine.detectEmotion(processedMessage);
    this.state.emotion = emotion;

    // Create message context
    const context: MessageContext = {
      userMessage: processedMessage,
      conversationHistory: this.conversationHistory,
      detectedEmotion: emotion.primaryEmotion,
      userMood: this.empathyEngine.emotionToMood(emotion)
    };

    // Apply personality override if specified
    if (forcePersonality) {
      this.toneAdapter.setTone(forcePersonality);
    } else if (customTone) {
      this.toneAdapter.setTone(customTone);
    }

    // Generate base response (this would normally call an AI service)
    let response = await this.generateBaseResponse(processedMessage, emotion, enableFallback);

    // Apply empathy if enabled
    if (enableEmpathy && emotion.intensity > 0.5) {
      const empathyPrefix = this.empathyEngine.generateContextualEmpathy(
        processedMessage, 
        this.conversationHistory.slice(0, -1)
      );
      
      // Only add empathy if it's meaningful
      if (empathyPrefix && !response.toLowerCase().includes(empathyPrefix.toLowerCase())) {
        response = `${empathyPrefix} ${response}`;
      }
    }

    // Apply tone adaptation
    if (enableToneAdaptation) {
      response = this.toneAdapter.applyTone(response, context);
    }

    // Apply persona if specified
    if (options.usePersona) {
      this.personaPlugin.activatePersona(options.usePersona);
      response = this.personaPlugin.applyPersona(response, context);
    }

    // Post-processing
    for (const postprocessor of this.postprocessors) {
      response = postprocessor(response, context);
    }

    // Update state
    this.updateState(context);

    // Return as packet
    return [{ op: "answer.v1", payload: { content: response } }];
  }

  private async generateBaseResponse(
    message: string, 
    emotion: EmotionalState,
    enableFallback: boolean
  ): Promise<string> {
    // This is where you would normally integrate with your AI service
    // For now, we'll provide contextual responses based on patterns
    
    const lowerMessage = message.toLowerCase();
    
    // Question handling
    if (lowerMessage.includes('?')) {
      if (lowerMessage.includes('how are you')) {
        return "I'm doing well, thank you for asking! I'm here and ready to help with whatever you need.";
      } else if (lowerMessage.includes('what') || lowerMessage.includes('how') || lowerMessage.includes('why')) {
        if (enableFallback && Math.random() < 0.3) {
          return this.fallbackResponder.getFallbackWithContext({
            userMessage: message,
            conversationHistory: this.conversationHistory,
            detectedEmotion: emotion.primaryEmotion
          });
        }
        return "That's an interesting question. Let me think about that...";
      }
    }
    
    // Greeting handling
    if (lowerMessage.match(/\b(hi|hello|hey|greetings)\b/)) {
      return "Hello there! It's great to hear from you.";
    }
    
    // Thank you handling
    if (lowerMessage.match(/\b(thanks|thank you|appreciate)\b/)) {
      return "You're very welcome! It's my pleasure to help.";
    }
    
    // Emotional support
    if (emotion.primaryEmotion !== 'neutral' && emotion.intensity > 0.6) {
      const responses = {
        happy: "That's wonderful! Your positive energy is infectious.",
        sad: "I'm here for you. Sometimes just talking about it can help.",
        angry: "I understand your frustration. Let's see what we can do about this.",
        anxious: "Take a deep breath. We'll work through this together, step by step.",
        confused: "Let's clarify things together. What part would you like to focus on first?",
        grateful: "Your kindness means a lot to me. I'm always happy to help!"
      };
      
      return responses[emotion.primaryEmotion as keyof typeof responses] || 
             "I'm here to help in any way I can.";
    }
    
    // Default response
    if (enableFallback) {
      return this.fallbackResponder.getFallbackResponse();
    }
    
    return "I understand. Tell me more about what you're thinking.";
  }

  private updateState(context: MessageContext): void {
    if (context.userMood) {
      this.state.mood.user = context.userMood;
      
      // Update conversation mood with smoothing
      this.state.mood.conversation = {
        valence: this.state.mood.conversation.valence * 0.7 + context.userMood.valence * 0.3,
        arousal: this.state.mood.conversation.arousal * 0.7 + context.userMood.arousal * 0.3,
        dominance: this.state.mood.conversation.dominance * 0.7 + context.userMood.dominance * 0.3
      };
    }
    
    // Update personality state
    const toneState = this.toneAdapter.getState();
    this.state.personality.currentTone = toneState.currentTone;
    this.state.personality.adaptationLevel = toneState.adaptationStrength;
  }

  // Plugin management
  addPreprocessor(processor: (message: string) => string): void {
    this.preprocessors.push(processor);
  }

  addPostprocessor(processor: (response: string, context: MessageContext) => string): void {
    this.postprocessors.push(processor);
  }

  // Tone management
  setTone(toneName: string): boolean {
    const success = this.toneAdapter.setTone(toneName);
    if (success) {
      this.state.personality.currentTone = toneName;
    }
    return success;
  }

  createCustomTone(name: string, profile: ToneProfile): void {
    this.toneAdapter.createCustomTone(name, profile);
  }

  // State access
  getState(): ConversationState {
    return JSON.parse(JSON.stringify(this.state)); // Deep copy
  }

  // Conversation management
  resetConversation(): void {
    this.conversationHistory = [];
    this.state = {
      mood: {
        user: { valence: 0, arousal: 0.5, dominance: 0.5 },
        conversation: { valence: 0, arousal: 0.5, dominance: 0.5 }
      },
      emotion: {
        primaryEmotion: 'neutral',
        intensity: 0.5,
        confidence: 0.5
      },
      context: {
        recentTopics: []
      },
      personality: {
        currentTone: this.state.personality.currentTone,
        adaptationLevel: 0.7
      }
    };
  }

  // Persona management
  activatePersona(personaId: string): boolean {
    return this.personaPlugin.activatePersona(personaId);
  }

  deactivatePersona(): void {
    this.personaPlugin.deactivatePersona();
  }

  getAvailablePersonas(): string[] {
    return this.personaPlugin.getAllPersonas().map(p => p.id);
  }

  createCompositePersona(id: string, name: string, personaIds: string[], weights?: number[]): boolean {
    const persona = this.personaPlugin.createCompositePersona(id, name, personaIds, weights);
    return persona !== null;
  }

  // Debug helpers
  debugInfo(): {
    history: string[];
    state: ConversationState;
    availableTones: string[];
    availablePersonas: string[];
    activePersona: string | null;
  } {
    const activePersona = this.personaPlugin.getActivePersona();
    return {
      history: [...this.conversationHistory],
      state: this.getState(),
      availableTones: ['laid_back', 'emotional', 'uncertain', 'professional', 'enthusiastic'],
      availablePersonas: this.getAvailablePersonas(),
      activePersona: activePersona ? activePersona.id : null
    };
  }
}

// Export a singleton instance for easy use
export const conversationCore = new ConversationCore();