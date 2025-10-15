// turnTakingSystem.ts - Turn-taking logic and speaker recognition for Chatty CLI

export interface Speaker {
  id: string;
  name: string;
  type: 'human' | 'ai' | 'system';
  priority: number;
  color: string;
  prefix: string;
  lastMessageTime: number;
  messageCount: number;
}

export interface TurnContext {
  currentSpeaker: Speaker | null;
  conversationFlow: 'linear' | 'autonomous' | 'crisis';
  emotionalState: 'neutral' | 'engaged' | 'overwhelmed' | 'crisis';
  responseMode: 'immediate' | 'reflective' | 'grounding';
  lastTurnTime: number;
}

export interface MessageTurn {
  speaker: Speaker;
  message: string;
  timestamp: number;
  emotionalWeight: number;
  requiresResponse: boolean;
  responseUrgency: 'low' | 'medium' | 'high' | 'crisis';
}

export class TurnTakingSystem {
  private speakers: Map<string, Speaker> = new Map();
  private turnContext: TurnContext;
  private messageHistory: MessageTurn[] = [];
  private readonly MAX_HISTORY = 50;

  constructor() {
    this.turnContext = {
      currentSpeaker: null,
      conversationFlow: 'linear',
      emotionalState: 'neutral',
      responseMode: 'immediate',
      lastTurnTime: Date.now()
    };

    // Initialize default speakers
    this.initializeDefaultSpeakers();
  }

  /**
   * Initialize default speakers
   */
  private initializeDefaultSpeakers(): void {
    this.addSpeaker({
      id: 'devonwoodson',
      name: 'devonwoodson',
      type: 'human',
      priority: 10, // Highest priority for human users
      color: 'green',
      prefix: 'devonwoodson',
      lastMessageTime: 0,
      messageCount: 0
    });

    this.addSpeaker({
      id: 'katana',
      name: 'katana',
      type: 'ai',
      priority: 8, // High priority for Katana
      color: 'magenta',
      prefix: 'katana',
      lastMessageTime: 0,
      messageCount: 0
    });

    this.addSpeaker({
      id: 'synth',
      name: 'synth',
      type: 'ai',
      priority: 5, // Medium priority for Chatty
      color: 'cyan',
      prefix: 'synth',
      lastMessageTime: 0,
      messageCount: 0
    });
  }

  /**
   * Add or update a speaker
   */
  addSpeaker(speaker: Speaker): void {
    this.speakers.set(speaker.id, speaker);
  }

  /**
   * Get speaker by ID or create from sender string
   */
  getSpeaker(sender: string): Speaker {
    const senderLower = sender.toLowerCase();
    
    // Check if speaker exists
    if (this.speakers.has(senderLower)) {
      return this.speakers.get(senderLower)!;
    }

    // Create new speaker based on sender type
    const isAI = this.isAISender(sender);
    const isHuman = this.isHumanSender(sender);
    
    const newSpeaker: Speaker = {
      id: senderLower,
      name: sender,
      type: isAI ? 'ai' : isHuman ? 'human' : 'system',
      priority: isHuman ? 10 : isAI ? 6 : 3,
      color: isHuman ? 'green' : isAI ? 'blue' : 'yellow',
      prefix: senderLower,
      lastMessageTime: 0,
      messageCount: 0
    };

    this.addSpeaker(newSpeaker);
    return newSpeaker;
  }

  /**
   * Determine if sender is an AI
   */
  private isAISender(sender: string): boolean {
    const aiKeywords = ['ai', 'bot', 'assistant', 'claude', 'gpt', 'copilot', 'katana', 'synth'];
    return aiKeywords.some(keyword => sender.toLowerCase().includes(keyword));
  }

  /**
   * Determine if sender is human
   */
  private isHumanSender(sender: string): boolean {
    return !this.isAISender(sender) && !sender.includes('system') && !sender.includes('external');
  }

  /**
   * Process a message turn
   */
  processTurn(sender: string, message: string): {
    speaker: Speaker;
    shouldRespond: boolean;
    responseMode: 'immediate' | 'reflective' | 'grounding';
    emotionalWeight: number;
    displayFormat: string;
  } {
    const speaker = this.getSpeaker(sender);
    const now = Date.now();
    
    // Update speaker stats
    speaker.lastMessageTime = now;
    speaker.messageCount++;
    
    // Analyze message emotional weight
    const emotionalWeight = this.analyzeEmotionalWeight(message);
    
    // Determine if Chatty should respond
    const shouldRespond = this.shouldRespondToMessage(speaker, message, emotionalWeight);
    
    // Determine response mode
    const responseMode = this.determineResponseMode(speaker, message, emotionalWeight);
    
    // Update turn context
    this.updateTurnContext(speaker, emotionalWeight, responseMode);
    
    // Create message turn
    const messageTurn: MessageTurn = {
      speaker,
      message,
      timestamp: now,
      emotionalWeight,
      requiresResponse: shouldRespond,
      responseUrgency: this.determineResponseUrgency(emotionalWeight, responseMode)
    };
    
    // Add to history
    this.addToHistory(messageTurn);
    
    // Create display format
    const displayFormat = this.createDisplayFormat(speaker, message);
    
    return {
      speaker,
      shouldRespond,
      responseMode,
      emotionalWeight,
      displayFormat
    };
  }

  /**
   * Analyze emotional weight of message
   */
  private analyzeEmotionalWeight(message: string): number {
    const crisisKeywords = ['crisis', 'emergency', 'help', 'suicide', 'kill', 'die', 'hurt', 'pain', 'suffering'];
    const emotionalKeywords = ['feel', 'emotion', 'sad', 'angry', 'happy', 'excited', 'worried', 'anxious', 'depressed'];
    const philosophicalKeywords = ['meaning', 'purpose', 'life', 'death', 'existence', 'philosophy', 'deep'];
    
    const lowerMessage = message.toLowerCase();
    let weight = 0;
    
    // Crisis detection (highest weight)
    if (crisisKeywords.some(keyword => lowerMessage.includes(keyword))) {
      weight += 0.8;
    }
    
    // Emotional content
    if (emotionalKeywords.some(keyword => lowerMessage.includes(keyword))) {
      weight += 0.4;
    }
    
    // Philosophical content
    if (philosophicalKeywords.some(keyword => lowerMessage.includes(keyword))) {
      weight += 0.3;
    }
    
    // Message length factor
    if (message.length > 500) {
      weight += 0.2;
    }
    
    // Question factor
    if (message.includes('?')) {
      weight += 0.1;
    }
    
    return Math.min(weight, 1.0);
  }

  /**
   * Determine if Chatty should respond
   */
  private shouldRespondToMessage(speaker: Speaker, message: string, emotionalWeight: number): boolean {
    // Always respond to human users
    if (speaker.type === 'human') {
      return true;
    }
    
    // Respond to Katana if message is directed at Chatty
    if (speaker.id === 'katana') {
      return /(@chatty|chatty>|hello|hi|hey)/i.test(message) || emotionalWeight > 0.3;
    }
    
    // Respond to other AIs if they're asking questions or need help
    if (speaker.type === 'ai') {
      return message.includes('?') || emotionalWeight > 0.5;
    }
    
    // Default: respond to high emotional weight messages
    return emotionalWeight > 0.6;
  }

  /**
   * Determine response mode
   */
  private determineResponseMode(speaker: Speaker, message: string, emotionalWeight: number): 'immediate' | 'reflective' | 'grounding' {
    // Crisis mode
    if (emotionalWeight > 0.8) {
      return 'grounding';
    }
    
    // High emotional content
    if (emotionalWeight > 0.5) {
      return 'reflective';
    }
    
    // Normal conversation
    return 'immediate';
  }

  /**
   * Determine response urgency
   */
  private determineResponseUrgency(emotionalWeight: number, responseMode: string): 'low' | 'medium' | 'high' | 'crisis' {
    if (emotionalWeight > 0.8 || responseMode === 'grounding') {
      return 'crisis';
    }
    
    if (emotionalWeight > 0.5 || responseMode === 'reflective') {
      return 'high';
    }
    
    if (emotionalWeight > 0.2) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Update turn context
   */
  private updateTurnContext(speaker: Speaker, emotionalWeight: number, responseMode: string): void {
    this.turnContext.currentSpeaker = speaker;
    this.turnContext.lastTurnTime = Date.now();
    
    // Update emotional state
    if (emotionalWeight > 0.8) {
      this.turnContext.emotionalState = 'crisis';
    } else if (emotionalWeight > 0.5) {
      this.turnContext.emotionalState = 'overwhelmed';
    } else if (emotionalWeight > 0.2) {
      this.turnContext.emotionalState = 'engaged';
    } else {
      this.turnContext.emotionalState = 'neutral';
    }
    
    // Update response mode
    this.turnContext.responseMode = responseMode as any;
    
    // Update conversation flow
    if (this.turnContext.emotionalState === 'crisis') {
      this.turnContext.conversationFlow = 'crisis';
    } else if (speaker.type === 'ai' && this.turnContext.emotionalState === 'engaged') {
      this.turnContext.conversationFlow = 'autonomous';
    } else {
      this.turnContext.conversationFlow = 'linear';
    }
  }

  /**
   * Add message to history
   */
  private addToHistory(messageTurn: MessageTurn): void {
    this.messageHistory.push(messageTurn);
    
    // Trim history if too long
    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory = this.messageHistory.slice(-this.MAX_HISTORY);
    }
  }

  /**
   * Create display format for message
   */
  private createDisplayFormat(speaker: Speaker, message: string): string {
    const timestamp = new Date().toLocaleString();
    return `${speaker.prefix}> [${timestamp}] ${message}`;
  }

  /**
   * Get current turn context
   */
  getTurnContext(): TurnContext {
    return { ...this.turnContext };
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): MessageTurn[] {
    return [...this.messageHistory];
  }

  /**
   * Get speaker statistics
   */
  getSpeakerStats(): Array<{ speaker: Speaker; messageCount: number; lastMessage: string }> {
    return Array.from(this.speakers.values()).map(speaker => ({
      speaker,
      messageCount: speaker.messageCount,
      lastMessage: new Date(speaker.lastMessageTime).toLocaleString()
    }));
  }

  /**
   * Check if system is in crisis mode
   */
  isInCrisisMode(): boolean {
    return this.turnContext.emotionalState === 'crisis' || 
           this.turnContext.conversationFlow === 'crisis';
  }

  /**
   * Get grounding strategies for crisis situations
   */
  getGroundingStrategies(): string[] {
    return [
      "Let's take a deep breath together. You're safe here.",
      "I'm here with you. Can you tell me what you're feeling right now?",
      "Let's focus on the present moment. What can you see around you?",
      "You're not alone in this. I'm listening and I care.",
      "Let's break this down into smaller, manageable pieces.",
      "Can you tell me one thing that's going well today?",
      "I want to help you through this. What do you need right now?"
    ];
  }

  /**
   * Reset turn context (for crisis recovery)
   */
  resetTurnContext(): void {
    this.turnContext = {
      currentSpeaker: null,
      conversationFlow: 'linear',
      emotionalState: 'neutral',
      responseMode: 'immediate',
      lastTurnTime: Date.now()
    };
  }
}
