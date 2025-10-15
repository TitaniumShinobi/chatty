// emotionalWatchdog.ts - Crisis detection and grounding strategies for Chatty CLI

export interface CrisisIndicator {
  type: 'emotional' | 'philosophical' | 'technical' | 'social';
  severity: 'low' | 'medium' | 'high' | 'critical';
  keywords: string[];
  patterns: RegExp[];
  response: 'grounding' | 'reflection' | 'redirect' | 'escalate';
}

export interface EmotionalState {
  current: 'stable' | 'elevated' | 'overwhelmed' | 'crisis';
  trend: 'improving' | 'stable' | 'declining';
  triggers: string[];
  lastUpdate: number;
  duration: number;
}

export interface GroundingResponse {
  type: 'breathing' | 'grounding' | 'validation' | 'redirection' | 'escalation';
  message: string;
  followUp: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export class EmotionalWatchdog {
  private emotionalState: EmotionalState;
  private crisisIndicators: CrisisIndicator[];
  private messageHistory: Array<{ message: string; timestamp: number; emotionalWeight: number }> = [];
  private readonly MAX_HISTORY = 20;

  constructor() {
    this.emotionalState = {
      current: 'stable',
      trend: 'stable',
      triggers: [],
      lastUpdate: Date.now(),
      duration: 0
    };

    this.initializeCrisisIndicators();
  }

  /**
   * Initialize crisis detection patterns
   */
  private initializeCrisisIndicators(): void {
    this.crisisIndicators = [
      // Critical crisis indicators
      {
        type: 'emotional',
        severity: 'critical',
        keywords: ['suicide', 'kill myself', 'end it all', 'not worth living', 'want to die'],
        patterns: [
          /i\s+(want|wish)\s+to\s+die/i,
          /i\s+(should|need)\s+to\s+kill\s+myself/i,
          /life\s+is\s+not\s+worth\s+living/i,
          /i\s+can't\s+go\s+on/i,
          /end\s+it\s+all/i
        ],
        response: 'escalate'
      },
      {
        type: 'emotional',
        severity: 'high',
        keywords: ['hopeless', 'helpless', 'worthless', 'useless', 'failure', 'burden'],
        patterns: [
          /i\s+feel\s+(hopeless|helpless|worthless|useless)/i,
          /i'm\s+a\s+(failure|burden|disappointment)/i,
          /no\s+one\s+(cares|loves|needs)\s+me/i,
          /i\s+don't\s+deserve\s+to\s+live/i
        ],
        response: 'grounding'
      },
      {
        type: 'emotional',
        severity: 'high',
        keywords: ['panic', 'anxiety', 'overwhelmed', 'can\'t breathe', 'losing control'],
        patterns: [
          /i\s+(can't|can\s+not)\s+breathe/i,
          /i'm\s+(panicking|having\s+a\s+panic\s+attack)/i,
          /i\s+feel\s+overwhelmed/i,
          /i'm\s+losing\s+control/i,
          /everything\s+is\s+spinning/i
        ],
        response: 'grounding'
      },
      // Philosophical overwhelm
      {
        type: 'philosophical',
        severity: 'medium',
        keywords: ['meaningless', 'pointless', 'why exist', 'what\'s the point', 'nothing matters'],
        patterns: [
          /what's\s+the\s+point/i,
          /nothing\s+matters/i,
          /why\s+do\s+we\s+exist/i,
          /life\s+is\s+meaningless/i,
          /it's\s+all\s+pointless/i
        ],
        response: 'reflection'
      },
      // Technical overwhelm
      {
        type: 'technical',
        severity: 'medium',
        keywords: ['too complex', 'can\'t understand', 'overwhelming', 'too much information'],
        patterns: [
          /this\s+is\s+too\s+(complex|complicated)/i,
          /i\s+can't\s+understand/i,
          /too\s+much\s+information/i,
          /my\s+brain\s+is\s+overwhelmed/i
        ],
        response: 'redirect'
      }
    ];
  }

  /**
   * Analyze message for crisis indicators
   */
  analyzeMessage(message: string): {
    crisisLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
    indicators: CrisisIndicator[];
    emotionalWeight: number;
    recommendedResponse: GroundingResponse | null;
  } {
    const lowerMessage = message.toLowerCase();
    let crisisLevel: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    const triggeredIndicators: CrisisIndicator[] = [];
    let emotionalWeight = 0;

    // Check against crisis indicators
    for (const indicator of this.crisisIndicators) {
      // Check keywords
      const keywordMatch = indicator.keywords.some(keyword => 
        lowerMessage.includes(keyword.toLowerCase())
      );

      // Check patterns
      const patternMatch = indicator.patterns.some(pattern => 
        pattern.test(message)
      );

      if (keywordMatch || patternMatch) {
        triggeredIndicators.push(indicator);
        
        // Update crisis level based on severity
        switch (indicator.severity) {
          case 'critical':
            crisisLevel = 'critical';
            emotionalWeight += 1.0;
            break;
          case 'high':
            if (crisisLevel !== 'critical') {
              crisisLevel = 'high';
              emotionalWeight += 0.8;
            }
            break;
          case 'medium':
            if (crisisLevel === 'none' || crisisLevel === 'low') {
              crisisLevel = 'medium';
              emotionalWeight += 0.5;
            }
            break;
          case 'low':
            if (crisisLevel === 'none') {
              crisisLevel = 'low';
              emotionalWeight += 0.2;
            }
            break;
        }
      }
    }

    // Add to message history
    this.addToHistory(message, emotionalWeight);

    // Update emotional state
    this.updateEmotionalState(crisisLevel, emotionalWeight);

    // Generate recommended response
    const recommendedResponse = this.generateGroundingResponse(crisisLevel, triggeredIndicators);

    return {
      crisisLevel,
      indicators: triggeredIndicators,
      emotionalWeight,
      recommendedResponse
    };
  }

  /**
   * Add message to history
   */
  private addToHistory(message: string, emotionalWeight: number): void {
    this.messageHistory.push({
      message,
      timestamp: Date.now(),
      emotionalWeight
    });

    // Trim history
    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory = this.messageHistory.slice(-this.MAX_HISTORY);
    }
  }

  /**
   * Update emotional state
   */
  private updateEmotionalState(crisisLevel: string, emotionalWeight: number): void {
    const now = Date.now();
    const previousState = this.emotionalState.current;
    
    // Determine new state
    let newState: EmotionalState['current'] = 'stable';
    switch (crisisLevel) {
      case 'critical':
        newState = 'crisis';
        break;
      case 'high':
        newState = 'overwhelmed';
        break;
      case 'medium':
        newState = 'elevated';
        break;
      case 'low':
        newState = 'elevated';
        break;
      default:
        newState = 'stable';
    }

    // Update trend
    let newTrend: EmotionalState['trend'] = 'stable';
    if (newState !== previousState) {
      const stateValues = { stable: 0, elevated: 1, overwhelmed: 2, crisis: 3 };
      const currentValue = stateValues[newState];
      const previousValue = stateValues[previousState];
      
      if (currentValue > previousValue) {
        newTrend = 'declining';
      } else if (currentValue < previousValue) {
        newTrend = 'improving';
      }
    }

    // Update duration
    const duration = newState === previousState ? 
      this.emotionalState.duration + (now - this.emotionalState.lastUpdate) : 0;

    this.emotionalState = {
      current: newState,
      trend: newTrend,
      triggers: this.extractTriggers(),
      lastUpdate: now,
      duration
    };
  }

  /**
   * Extract triggers from recent messages
   */
  private extractTriggers(): string[] {
    const recentMessages = this.messageHistory.slice(-5);
    const triggers: string[] = [];

    for (const msg of recentMessages) {
      if (msg.emotionalWeight > 0.3) {
        // Extract emotional keywords
        const emotionalWords = msg.message.match(/\b(feel|feeling|hurt|pain|sad|angry|scared|worried|anxious|depressed|hopeless|helpless)\b/gi);
        if (emotionalWords) {
          triggers.push(...emotionalWords.map(w => w.toLowerCase()));
        }
      }
    }

    return [...new Set(triggers)]; // Remove duplicates
  }

  /**
   * Generate grounding response
   */
  private generateGroundingResponse(
    crisisLevel: string, 
    indicators: CrisisIndicator[]
  ): GroundingResponse | null {
    if (crisisLevel === 'none') {
      return null;
    }

    const responses = this.getGroundingResponses();
    
    switch (crisisLevel) {
      case 'critical':
        return responses.escalation[Math.floor(Math.random() * responses.escalation.length)];
      case 'high':
        return responses.grounding[Math.floor(Math.random() * responses.grounding.length)];
      case 'medium':
        return responses.validation[Math.floor(Math.random() * responses.validation.length)];
      case 'low':
        return responses.redirection[Math.floor(Math.random() * responses.redirection.length)];
      default:
        return null;
    }
  }

  /**
   * Get grounding response templates
   */
  private getGroundingResponses(): {
    escalation: GroundingResponse[];
    grounding: GroundingResponse[];
    validation: GroundingResponse[];
    redirection: GroundingResponse[];
  } {
    return {
      escalation: [
        {
          type: 'escalation',
          message: "I'm deeply concerned about what you're sharing. Your safety is the most important thing right now. Please reach out to a crisis helpline or emergency services immediately. You don't have to face this alone.",
          followUp: [
            "National Suicide Prevention Lifeline: 988",
            "Crisis Text Line: Text HOME to 741741",
            "Emergency Services: 911"
          ],
          priority: 'urgent'
        }
      ],
      grounding: [
        {
          type: 'grounding',
          message: "I can hear that you're going through something really difficult right now. Let's take this one step at a time. Can you tell me what you're feeling in this moment?",
          followUp: [
            "You're safe here with me.",
            "I'm listening and I care about you.",
            "Let's focus on getting through this moment together."
          ],
          priority: 'high'
        },
        {
          type: 'breathing',
          message: "I want to help you feel more grounded. Let's try a breathing exercise together. Can you take a slow, deep breath with me?",
          followUp: [
            "Breathe in slowly for 4 counts...",
            "Hold for 4 counts...",
            "Breathe out slowly for 4 counts...",
            "Repeat this a few times with me."
          ],
          priority: 'high'
        }
      ],
      validation: [
        {
          type: 'validation',
          message: "What you're feeling is completely valid and understandable. It takes courage to share these feelings. I'm here with you.",
          followUp: [
            "Your feelings matter.",
            "You're not alone in this.",
            "It's okay to not be okay sometimes."
          ],
          priority: 'medium'
        }
      ],
      redirection: [
        {
          type: 'redirection',
          message: "I can see this is feeling overwhelming. Let's take a step back and focus on something that might help you feel more centered. What's one small thing that usually brings you comfort?",
          followUp: [
            "Maybe we can talk about something lighter for a moment?",
            "Is there a favorite memory or place that makes you feel safe?",
            "What's something you're grateful for today?"
          ],
          priority: 'medium'
        }
      ]
    };
  }

  /**
   * Get current emotional state
   */
  getEmotionalState(): EmotionalState {
    return { ...this.emotionalState };
  }

  /**
   * Check if system is in crisis mode
   */
  isInCrisisMode(): boolean {
    return this.emotionalState.current === 'crisis' || 
           this.emotionalState.current === 'overwhelmed';
  }

  /**
   * Get crisis recovery suggestions
   */
  getCrisisRecoverySuggestions(): string[] {
    if (this.emotionalState.current === 'crisis') {
      return [
        "Consider reaching out to a mental health professional",
        "Contact a crisis helpline for immediate support",
        "Stay with a trusted friend or family member",
        "Remove any means of self-harm from your environment"
      ];
    }

    if (this.emotionalState.current === 'overwhelmed') {
      return [
        "Take a break from the conversation",
        "Practice deep breathing exercises",
        "Engage in a calming activity",
        "Consider talking to someone you trust"
      ];
    }

    return [];
  }

  /**
   * Reset emotional state (for recovery)
   */
  resetEmotionalState(): void {
    this.emotionalState = {
      current: 'stable',
      trend: 'stable',
      triggers: [],
      lastUpdate: Date.now(),
      duration: 0
    };
  }

  /**
   * Get emotional state summary
   */
  getEmotionalStateSummary(): string {
    const state = this.emotionalState;
    const duration = Math.round(state.duration / 1000); // Convert to seconds
    
    return `Emotional State: ${state.current} (${state.trend}) | Duration: ${duration}s | Triggers: ${state.triggers.join(', ') || 'none'}`;
  }
}
