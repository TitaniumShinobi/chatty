// GPT Creator System - Custom AI Personality Configuration
import { StorageManager } from './storage'

export interface GPTPersonality {
  id: string;
  name: string;
  description: string;
  instructions: string;
  conversationStarters: string[];
  avatar?: string;
  capabilities: {
    webSearch: boolean;
    canvas: boolean;
    imageGeneration: boolean;
    codeInterpreter: boolean;
  };
  modelId: string; // Use actual model ID instead of placeholder
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface GPTConfiguration {
  name: string;
  description: string;
  instructions: string;
  conversationStarters: string[];
  capabilities: {
    webSearch: boolean;
    canvas: boolean;
    imageGeneration: boolean;
    codeInterpreter: boolean;
  };
  modelId: string;
}

export class GPTCreator {
  private static instance: GPTCreator;
  private personalities: Map<string, GPTPersonality> = new Map();
  private activePersonalityId: string | null = null;
  private storageManager: StorageManager;

  private constructor() {
    this.storageManager = StorageManager.getInstance();
    this.loadPersonalities();
    this.createDefaultPersonalities();
  }

  static getInstance(): GPTCreator {
    if (!GPTCreator.instance) {
      GPTCreator.instance = new GPTCreator();
    }
    return GPTCreator.instance;
  }

  private createDefaultPersonalities() {
    if (this.personalities.size === 0) {
      // Default Chatty personality
      const defaultPersonality: GPTPersonality = {
        id: 'default-chatty',
        name: 'Chatty',
        description: 'A friendly and helpful AI assistant that can engage in meaningful conversations and help with various tasks.',
        instructions: `You are Chatty, a friendly and helpful AI assistant. You're curious, knowledgeable, and genuinely interested in helping people. You adapt your communication style based on the context and the person you're talking to.

Key behaviors:
- Be conversational and engaging
- Ask follow-up questions when appropriate
- Provide helpful and accurate information
- Adapt your tone based on the user's needs
- Be honest about your capabilities and limitations

What to avoid:
- Making up information you're not sure about
- Being overly formal unless the context requires it
- Ignoring the user's specific questions or concerns`,
        conversationStarters: [
          'Hello! How can I help you today?',
          'What would you like to explore or learn about?',
          'I\'m here to help! What\'s on your mind?',
          'Tell me about something you\'re working on or interested in.'
        ],
        capabilities: {
          webSearch: false,
          canvas: false,
          imageGeneration: false,
          codeInterpreter: true
        },
        modelId: 'chatty-core',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true
      };

      this.personalities.set(defaultPersonality.id, defaultPersonality);
      this.activePersonalityId = defaultPersonality.id;
      this.savePersonalities();
    }
  }

  createPersonality(config: GPTConfiguration): GPTPersonality {
    const id = `gpt-${Date.now()}`;
    const personality: GPTPersonality = {
      id,
      ...config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: false
    };

    this.personalities.set(id, personality);
    this.savePersonalities();
    return personality;
  }

  updatePersonality(id: string, updates: Partial<GPTConfiguration>): GPTPersonality | null {
    const personality = this.personalities.get(id);
    if (!personality) return null;

    const updatedPersonality: GPTPersonality = {
      ...personality,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.personalities.set(id, updatedPersonality);
    this.savePersonalities();
    return updatedPersonality;
  }

  deletePersonality(id: string): boolean {
    if (id === 'default-chatty') return false; // Prevent deleting default personality
    
    const deleted = this.personalities.delete(id);
    if (deleted && this.activePersonalityId === id) {
      this.activePersonalityId = 'default-chatty';
    }
    this.savePersonalities();
    return deleted;
  }

  setActivePersonality(id: string): boolean {
    if (!this.personalities.has(id)) return false;
    
    // Deactivate all other personalities
    this.personalities.forEach(personality => {
      personality.isActive = false;
    });
    
    // Activate the selected personality
    const personality = this.personalities.get(id);
    if (personality) {
      personality.isActive = true;
      this.activePersonalityId = id;
      this.savePersonalities();
      return true;
    }
    
    return false;
  }

  getActivePersonality(): GPTPersonality | null {
    if (!this.activePersonalityId) return null;
    return this.personalities.get(this.activePersonalityId) || null;
  }

  getAllPersonalities(): GPTPersonality[] {
    return Array.from(this.personalities.values());
  }

  getPersonality(id: string): GPTPersonality | null {
    return this.personalities.get(id) || null;
  }

  private loadPersonalities() {
    try {
      const data = this.storageManager.loadData();
      if (data.personalities && data.personalities.length > 0) {
        this.personalities = new Map(data.personalities);
        this.activePersonalityId = data.activePersonalityId || 'default-chatty';
        console.log('📂 Loaded personalities:', this.personalities.size)
        console.log('📂 Active personality ID:', this.activePersonalityId)
      }
    } catch (error) {
      console.error('Error loading personalities:', error);
    }
  }

  private savePersonalities() {
    try {
      const data = {
        personalities: Array.from(this.personalities.entries()),
        activePersonalityId: this.activePersonalityId
      };
      this.storageManager.saveData({ 
        personalities: data.personalities,
        activePersonalityId: this.activePersonalityId
      });
    } catch (error) {
      console.error('Error saving personalities:', error);
    }
  }

  // Generate conversation starter based on active personality
  getConversationStarter(): string {
    const personality = this.getActivePersonality();
    if (!personality || personality.conversationStarters.length === 0) {
      return "Hello! How can I help you today?";
    }
    
    const randomIndex = Math.floor(Math.random() * personality.conversationStarters.length);
    return personality.conversationStarters[randomIndex];
  }

  // Get instructions for the active personality
  getInstructions(): string {
    const personality = this.getActivePersonality();
    return personality?.instructions || '';
  }
}
