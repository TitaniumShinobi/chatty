// Intent detection and classification system
export interface Intent {
  type: string;
  confidence: number;
  entities: Record<string, string>;
  context: string;
}

export interface IntentPattern {
  type: string;
  patterns: RegExp[];
  entities?: Record<string, RegExp>;
  context?: string;
}

export class IntentDetector {
  private patterns: IntentPattern[] = [
    // Greeting patterns
    {
      type: 'greeting',
      patterns: [/hello|hi|hey|good morning|good afternoon|good evening/i],
      context: 'social'
    },
    // Smalltalk patterns
    {
      type: 'smalltalk',
      patterns: [
        /how (are|r) (you|ya)/i,
        /how['’]s it going/i,
        /what['’]s up/i,
        /how are things/i,
        /how are you feeling/i,
        /how do you feel/i,
        /how's your (day|morning|afternoon|evening)/i
      ],
      context: 'smalltalk'
    },
    // Question patterns
    {
      type: 'question',
      patterns: [/\?$/, /what|how|why|when|where|who|which/i],
      context: 'inquiry'
    },
    // Crisis patterns (handled by PolicyChecker, but we can detect)
    {
      type: 'crisis',
      patterns: [/suicide|kill myself|end my life|hurt myself/i],
      context: 'safety'
    },
    // Technical patterns
    {
      type: 'technical',
      patterns: [/code|programming|debug|function|variable|api|database/i],
      context: 'technical'
    },
    // Emotional patterns
    {
      type: 'emotional',
      patterns: [/feel|emotion|sad|angry|frustrated|anxious|worried|stressed/i],
      context: 'emotional'
    },
    // Planning patterns
    {
      type: 'planning',
      patterns: [/plan|schedule|organize|todo|task|goal|project/i],
      context: 'productivity'
    },
    // Learning patterns
    {
      type: 'learning',
      patterns: [/learn|study|teach|explain|understand|tutorial|guide/i],
      context: 'education'
    },
    // Creative patterns
    {
      type: 'creative',
      patterns: [/write|create|design|art|story|poem|song|idea/i],
      context: 'creative'
    }
  ];

  detectIntent(input: string): Intent[] {
    const intents: Intent[] = [];
    const lower = input.toLowerCase();

    for (const pattern of this.patterns) {
      let maxConfidence = 0;

      for (const regex of pattern.patterns) {
        if (regex.test(lower)) {
          const confidence = this.calculateConfidence(input, regex, pattern);
          if (confidence > maxConfidence) {
            maxConfidence = confidence;
          }
        }
      }

      if (maxConfidence > 0.3) { // Threshold for intent detection
        intents.push({
          type: pattern.type,
          confidence: maxConfidence,
          entities: this.extractEntities(input, pattern),
          context: pattern.context || 'general'
        });
      }
    }

    // Sort by confidence (highest first)
    return intents.sort((a, b) => b.confidence - a.confidence);
  }

  private calculateConfidence(input: string, pattern: RegExp, intentPattern: IntentPattern): number {
    const matches = input.match(pattern);
    if (!matches) return 0;

    // Base confidence from pattern match
    let confidence = 0.5;

    // Boost confidence for exact matches
    if (matches[0] === input.trim()) {
      confidence += 0.3;
    }

    // Boost confidence for multiple pattern matches
    const allMatches = input.match(new RegExp(intentPattern.patterns.map(p => p.source).join('|'), 'gi'));
    if (allMatches && allMatches.length > 1) {
      confidence += 0.2;
    }

    // Boost confidence for context-specific keywords
    if (intentPattern.context) {
      const contextKeywords = this.getContextKeywords(intentPattern.context);
      const contextMatches = contextKeywords.filter(keyword => 
        input.toLowerCase().includes(keyword)
      ).length;
      confidence += contextMatches * 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  private extractEntities(input: string, pattern: IntentPattern): Record<string, string> {
    const entities: Record<string, string> = {};
    
    if (pattern.entities) {
      for (const [entityName, entityPattern] of Object.entries(pattern.entities)) {
        const match = input.match(entityPattern);
        if (match) {
          entities[entityName] = match[0];
        }
      }
    }

    return entities;
  }

  private getContextKeywords(context: string): string[] {
    const contextMap: Record<string, string[]> = {
      'social': ['friend', 'family', 'relationship', 'social', 'community'],
      'smalltalk': ['how are you', "how's it going", "what's up", 'how are things', 'feeling', 'day going', 'doing today'],
      'inquiry': ['question', 'ask', 'wonder', 'curious', 'inquiry'],
      'safety': ['help', 'support', 'crisis', 'emergency', 'safe'],
      'technical': ['code', 'programming', 'software', 'technical', 'debug'],
      'emotional': ['feel', 'emotion', 'mood', 'mental', 'psychological'],
      'productivity': ['work', 'task', 'project', 'goal', 'efficient'],
      'education': ['learn', 'study', 'knowledge', 'skill', 'education'],
      'creative': ['art', 'creative', 'design', 'imagination', 'inspiration']
    };

    return contextMap[context] || [];
  }
}
