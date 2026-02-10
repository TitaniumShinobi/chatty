// Response planning and strategy selection
import type { Intent } from '../intent/IntentDetector.js';

export interface ResponsePlan {
  strategy: string;
  confidence: number;
  steps: ResponseStep[];
  context: string;
  priority: number;
}

export interface ResponseStep {
  type: 'safety' | 'empathy' | 'information' | 'action' | 'question' | 'reflection';
  content: string;
  weight: number;
  order: number;
}

export class ResponsePlanner {
  private strategies: Map<string, ResponseStrategy> = new Map();

  constructor() {
    this.initializeStrategies();
  }

  planResponse(intents: Intent[], input: string, context: any): ResponsePlan {
    // Select primary strategy based on intents
    const primaryIntent = intents[0];
    if (!primaryIntent) {
      return this.getDefaultPlan(input);
    }

    const strategy = this.selectStrategy(primaryIntent, intents, context);
    const steps = this.generateSteps(strategy, intents, input, context);

    return {
      strategy: strategy.name,
      confidence: primaryIntent.confidence,
      steps,
      context: primaryIntent.context,
      priority: this.calculatePriority(primaryIntent, context)
    };
  }

  private selectStrategy(primaryIntent: Intent, _allIntents: Intent[], _context: any): ResponseStrategy {
    // Crisis handling takes highest priority
    if (primaryIntent.type === 'crisis') {
      return this.strategies.get('crisis')!;
    }

    // Emotional support for emotional intents
    if (primaryIntent.type === 'emotional') {
      return this.strategies.get('emotional_support')!;
    }

    // Technical assistance for technical intents
    if (primaryIntent.type === 'technical') {
      return this.strategies.get('technical_assistance')!;
    }

    // Learning support for learning intents
    if (primaryIntent.type === 'learning') {
      return this.strategies.get('educational')!;
    }

    // Creative collaboration for creative intents
    if (primaryIntent.type === 'creative') {
      return this.strategies.get('creative_collaboration')!;
    }

    // Planning assistance for planning intents
    if (primaryIntent.type === 'planning') {
      return this.strategies.get('planning_assistance')!;
    }

    // Default to conversational
    return this.strategies.get('conversational')!;
  }

  private generateSteps(strategy: ResponseStrategy, intents: Intent[], input: string, _context: any): ResponseStep[] {
    const steps: ResponseStep[] = [];

    // Always start with empathy/acknowledgment for emotional content
    if (intents.some(i => i.type === 'emotional')) {
      steps.push({
        type: 'empathy',
        content: this.generateEmpathyResponse(input, intents),
        weight: 0.8,
        order: 1
      });
    }

    // Add strategy-specific steps
    for (const stepTemplate of strategy.steps) {
      steps.push({
        type: stepTemplate.type,
        content: this.processStepTemplate(stepTemplate.content, input, intents, _context),
        weight: stepTemplate.weight,
        order: stepTemplate.order
      });
    }

    // Add follow-up question if appropriate
    if (strategy.includeFollowUp) {
      steps.push({
        type: 'question',
        content: this.generateFollowUpQuestion(intents, _context),
        weight: 0.6,
        order: steps.length + 1
      });
    }

    return steps.sort((a, b) => a.order - b.order);
  }

  private generateEmpathyResponse(input: string, intents: Intent[]): string {
    const emotionalIntent = intents.find(i => i.type === 'emotional');
    if (!emotionalIntent) return 'I understand.';

    const empathyTemplates = [
      "I can hear that you're feeling {emotion}. That sounds really {difficulty}.",
      "It sounds like you're going through a {challenge} time right now.",
      "I appreciate you sharing that with me. It takes courage to express {feeling}.",
      "I can sense the {emotion} in what you're saying. That must be really {difficulty}."
    ];

    const template = empathyTemplates[Math.floor(Math.random() * empathyTemplates.length)];
    return template
      .replace('{emotion}', this.extractEmotion(input))
      .replace('{difficulty}', this.getDifficultyLevel(input))
      .replace('{challenge}', this.getChallengeLevel(input))
      .replace('{feeling}', this.extractFeeling(input));
  }

  private extractEmotion(input: string): string {
    const emotions = ['frustrated', 'overwhelmed', 'confused', 'excited', 'worried', 'hopeful', 'disappointed'];
    const found = emotions.find(emotion => input.toLowerCase().includes(emotion));
    return found || 'something';
  }

  private getDifficultyLevel(input: string): string {
    const difficultyWords = ['hard', 'difficult', 'challenging', 'overwhelming', 'tough'];
    return difficultyWords.some(word => input.toLowerCase().includes(word)) ? 'challenging' : 'difficult';
  }

  private getChallengeLevel(input: string): string {
    const challengeWords = ['struggling', 'fighting', 'battling', 'dealing with'];
    return challengeWords.some(word => input.toLowerCase().includes(word)) ? 'challenging' : 'difficult';
  }

  private extractFeeling(input: string): string {
    const feelings = ['frustration', 'confusion', 'excitement', 'worry', 'hope', 'disappointment'];
    const found = feelings.find(feeling => input.toLowerCase().includes(feeling));
    return found || 'what you\'re feeling';
  }

  private processStepTemplate(template: string, input: string, intents: Intent[], _context: any): string {
    return template
      .replace('{input}', input)
      .replace('{intent}', intents[0]?.type || 'general')
      .replace('{context}', intents[0]?.context || 'general');
  }

  private generateFollowUpQuestion(_intents: Intent[], _context: any): string {
    const questions = [
      "What would be most helpful for you right now?",
      "Is there a specific aspect you'd like to explore further?",
      "How can I best support you with this?",
      "What would you like to focus on next?",
      "Is there anything else you'd like to discuss about this?"
    ];

    return questions[Math.floor(Math.random() * questions.length)];
  }

  private calculatePriority(intent: Intent, _context: any): number {
    let priority = 1;

    // Crisis gets highest priority
    if (intent.type === 'crisis') priority = 10;
    // Emotional support gets high priority
    else if (intent.type === 'emotional') priority = 8;
    // Technical and learning get medium-high priority
    else if (['technical', 'learning'].includes(intent.type)) priority = 6;
    // Creative and planning get medium priority
    else if (['creative', 'planning'].includes(intent.type)) priority = 4;
    // Greeting gets low priority
    else if (intent.type === 'greeting') priority = 2;

    return priority;
  }

  private getDefaultPlan(_input: string): ResponsePlan {
    return {
      strategy: 'conversational',
      confidence: 0.5,
      steps: [{
        type: 'reflection',
        content: "I understand. How can I help with that?",
        weight: 1.0,
        order: 1
      }],
      context: 'general',
      priority: 1
    };
  }

  private initializeStrategies(): void {
    this.strategies.set('crisis', {
      name: 'crisis',
      steps: [
        {
          type: 'safety',
          content: "I'm concerned about what you're sharing. Your safety is important.",
          weight: 1.0,
          order: 1
        },
        {
          type: 'information',
          content: "If you're in immediate danger, please contact emergency services or 988 in the U.S.",
          weight: 0.9,
          order: 2
        }
      ],
      includeFollowUp: false
    });

    this.strategies.set('emotional_support', {
      name: 'emotional_support',
      steps: [
        {
          type: 'empathy',
          content: "I can hear that you're feeling {emotion}. That sounds really {difficulty}.",
          weight: 0.9,
          order: 1
        },
        {
          type: 'reflection',
          content: "It sounds like you're dealing with {challenge}. Would you like to talk more about what's happening?",
          weight: 0.8,
          order: 2
        }
      ],
      includeFollowUp: true
    });

    this.strategies.set('technical_assistance', {
      name: 'technical_assistance',
      steps: [
        {
          type: 'information',
          content: "I'd be happy to help you with {intent}. Let me break this down step by step.",
          weight: 0.9,
          order: 1
        },
        {
          type: 'action',
          content: "Here's what I suggest we do:",
          weight: 0.8,
          order: 2
        }
      ],
      includeFollowUp: true
    });

    this.strategies.set('educational', {
      name: 'educational',
      steps: [
        {
          type: 'information',
          content: "Great question! Let me explain {intent} in a way that's easy to understand.",
          weight: 0.9,
          order: 1
        },
        {
          type: 'action',
          content: "Here's how you can approach this:",
          weight: 0.8,
          order: 2
        }
      ],
      includeFollowUp: true
    });

    this.strategies.set('creative_collaboration', {
      name: 'creative_collaboration',
      steps: [
        {
          type: 'reflection',
          content: "I love the creative energy in your request! Let's explore {intent} together.",
          weight: 0.9,
          order: 1
        },
        {
          type: 'action',
          content: "Here are some ideas to get us started:",
          weight: 0.8,
          order: 2
        }
      ],
      includeFollowUp: true
    });

    this.strategies.set('planning_assistance', {
      name: 'planning_assistance',
      steps: [
        {
          type: 'information',
          content: "I'd be happy to help you with {intent}. Let's create a solid plan together.",
          weight: 0.9,
          order: 1
        },
        {
          type: 'action',
          content: "Here's a structured approach we can take:",
          weight: 0.8,
          order: 2
        }
      ],
      includeFollowUp: true
    });

    this.strategies.set('conversational', {
      name: 'conversational',
      steps: [
        {
          type: 'reflection',
          content: "I understand. {input}",
          weight: 0.7,
          order: 1
        }
      ],
      includeFollowUp: true
    });
  }
}

interface ResponseStrategy {
  name: string;
  steps: ResponseStepTemplate[];
  includeFollowUp: boolean;
}

interface ResponseStepTemplate {
  type: 'safety' | 'empathy' | 'information' | 'action' | 'question' | 'reflection';
  content: string;
  weight: number;
  order: number;
}
