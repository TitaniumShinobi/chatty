// src/engine/composers/empathy.ts
// Empathy engine for understanding and responding to user emotions

import { Mood } from './ToneAdapter';

export interface EmotionalState {
  primaryEmotion: string;
  intensity: number; // 0-1
  secondary?: string;
  confidence: number; // 0-1
}

export interface EmpathyResponse {
  acknowledgment: string;
  validation: string;
  support: string;
  redirect?: string;
}

export class EmpathyEngine {
  private emotionPatterns = new Map<string, RegExp[]>([
    ['happy', [
      /\b(happy|joy|excited|thrilled|delighted|glad|pleased|cheerful)\b/i,
      /😊|😃|😄|🙂|😁|🎉|✨/,
      /\byay|woohoo|awesome|amazing|fantastic\b/i
    ]],
    ['sad', [
      /\b(sad|upset|down|blue|depressed|unhappy|miserable|crying)\b/i,
      /😢|😭|😞|😔|💔/,
      /\bsigh|unfortunately|sadly\b/i
    ]],
    ['angry', [
      /\b(angry|mad|furious|annoyed|irritated|frustrated|pissed)\b/i,
      /😠|😡|🤬|😤/,
      /\b(hate|stupid|ridiculous|unbelievable)\b/i
    ]],
    ['anxious', [
      /\b(anxious|worried|nervous|scared|afraid|concerned|stressed)\b/i,
      /😰|😟|😬|😨/,
      /\bwhat if|might|could|nervous about\b/i
    ]],
    ['confused', [
      /\b(confused|lost|puzzled|perplexed|bewildered|unsure)\b/i,
      /🤔|😕|🤷|❓/,
      /\bdon't understand|makes no sense|what does.*mean\b/i
    ]],
    ['grateful', [
      /\b(grateful|thankful|appreciate|thanks|thank you)\b/i,
      /🙏|❤️|💕|🥰/,
      /\bmeans a lot|really helped\b/i
    ]]
  ]);

  private empathyTemplates = {
    happy: {
      acknowledgments: [
        "I can feel your excitement!",
        "Your happiness is contagious!",
        "That's wonderful to hear!"
      ],
      validations: [
        "You have every reason to feel this way.",
        "This is definitely something to celebrate.",
        "Your joy is completely justified."
      ],
      supports: [
        "I'm so happy for you!",
        "Let's keep this positive momentum going!",
        "This brightened my day too!"
      ]
    },
    sad: {
      acknowledgments: [
        "I can sense that you're going through a difficult time.",
        "I hear the sadness in your words.",
        "It sounds like you're feeling down."
      ],
      validations: [
        "It's completely okay to feel this way.",
        "Your feelings are valid and important.",
        "Sometimes life can be really tough."
      ],
      supports: [
        "I'm here to listen whenever you need.",
        "You don't have to go through this alone.",
        "Take all the time you need to process these feelings."
      ]
    },
    angry: {
      acknowledgments: [
        "I can tell you're really frustrated right now.",
        "I understand you're feeling angry about this.",
        "Your frustration is coming through clearly."
      ],
      validations: [
        "You have every right to feel upset about this.",
        "Anyone would be frustrated in this situation.",
        "Your anger is understandable given what happened."
      ],
      supports: [
        "Let's work through this together.",
        "I'm here to help you find a solution.",
        "Take a deep breath - we'll figure this out."
      ],
      redirects: [
        "What would help most right now?",
        "How can we make this better?",
        "What's the first step we can take to resolve this?"
      ]
    },
    anxious: {
      acknowledgments: [
        "I can sense you're feeling worried.",
        "It sounds like this is causing you anxiety.",
        "I understand you're feeling nervous about this."
      ],
      validations: [
        "It's natural to feel anxious in this situation.",
        "Your concerns are completely valid.",
        "Many people would feel the same way."
      ],
      supports: [
        "Let's take this one step at a time.",
        "You're not alone in this.",
        "We can work through this together."
      ],
      redirects: [
        "What's the main thing worrying you?",
        "Let's break this down into smaller pieces.",
        "What would make you feel more confident?"
      ]
    },
    confused: {
      acknowledgments: [
        "I can see this is confusing.",
        "It sounds like things aren't clear.",
        "I understand you're feeling lost."
      ],
      validations: [
        "It's perfectly okay to feel confused.",
        "This is indeed complex.",
        "Anyone would find this puzzling."
      ],
      supports: [
        "Let me help clarify things.",
        "We'll figure this out together.",
        "I'm here to help you understand."
      ],
      redirects: [
        "What part is most confusing?",
        "Should we start from the beginning?",
        "What would help make this clearer?"
      ]
    },
    grateful: {
      acknowledgments: [
        "Your gratitude is heartwarming!",
        "I feel your appreciation.",
        "Thank you for sharing your gratitude!"
      ],
      validations: [
        "It's wonderful that you recognize the good things.",
        "Gratitude is such a powerful emotion.",
        "Your appreciation means a lot."
      ],
      supports: [
        "It's my pleasure to help!",
        "I'm always here when you need me.",
        "Your kind words motivate me!"
      ]
    }
  };

  detectEmotion(message: string): EmotionalState {
    const detectedEmotions: { emotion: string; score: number }[] = [];

    for (const [emotion, patterns] of this.emotionPatterns.entries()) {
      let score = 0;
      for (const pattern of patterns) {
        const matches = message.match(pattern);
        if (matches) {
          score += matches.length;
        }
      }
      if (score > 0) {
        detectedEmotions.push({ emotion, score });
      }
    }

    // Sort by score
    detectedEmotions.sort((a, b) => b.score - a.score);

    if (detectedEmotions.length === 0) {
      return {
        primaryEmotion: 'neutral',
        intensity: 0.5,
        confidence: 0.3
      };
    }

    const primary = detectedEmotions[0];
    const totalScore = detectedEmotions.reduce((sum, e) => sum + e.score, 0);

    return {
      primaryEmotion: primary.emotion,
      intensity: Math.min(primary.score / 3, 1), // Normalize intensity
      secondary: detectedEmotions.length > 1 ? detectedEmotions[1].emotion : undefined,
      confidence: primary.score / totalScore
    };
  }

  generateEmpathyResponse(emotion: EmotionalState): EmpathyResponse {
    const templates = this.empathyTemplates[emotion.primaryEmotion as keyof typeof this.empathyTemplates] 
                     || this.empathyTemplates.happy; // Default to positive

    const response: EmpathyResponse = {
      acknowledgment: this.selectRandom(templates.acknowledgments),
      validation: this.selectRandom(templates.validations),
      support: this.selectRandom(templates.supports)
    };

    if ('redirects' in templates && templates.redirects) {
      response.redirect = this.selectRandom(templates.redirects);
    }

    return response;
  }

  private selectRandom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  // Generate contextual empathy based on conversation history
  generateContextualEmpathy(
    currentMessage: string, 
    conversationHistory: string[] = []
  ): string {
    const emotion = this.detectEmotion(currentMessage);
    
    // Check for emotional progression
    if (conversationHistory.length > 0) {
      const previousEmotions = conversationHistory.map(msg => this.detectEmotion(msg));
      const emotionalJourney = this.analyzeEmotionalJourney(previousEmotions, emotion);
      
      if (emotionalJourney.improving) {
        return "I'm glad to see things are looking up for you!";
      } else if (emotionalJourney.deteriorating) {
        return "I notice things seem to be getting harder. I'm here to support you.";
      }
    }

    const empathyResponse = this.generateEmpathyResponse(emotion);
    
    // Combine elements based on intensity
    if (emotion.intensity > 0.7) {
      return `${empathyResponse.acknowledgment} ${empathyResponse.validation} ${empathyResponse.support}`;
    } else if (emotion.intensity > 0.4) {
      return `${empathyResponse.acknowledgment} ${empathyResponse.support}`;
    } else {
      return empathyResponse.support;
    }
  }

  private analyzeEmotionalJourney(
    history: EmotionalState[], 
    current: EmotionalState
  ): { improving: boolean; deteriorating: boolean } {
    if (history.length === 0) {
      return { improving: false, deteriorating: false };
    }

    const positiveEmotions = ['happy', 'grateful', 'excited'];
    const negativeEmotions = ['sad', 'angry', 'anxious'];

    const wasPositive = positiveEmotions.includes(history[history.length - 1].primaryEmotion);
    const isPositive = positiveEmotions.includes(current.primaryEmotion);
    const wasNegative = negativeEmotions.includes(history[history.length - 1].primaryEmotion);
    const isNegative = negativeEmotions.includes(current.primaryEmotion);

    return {
      improving: wasNegative && isPositive,
      deteriorating: wasPositive && isNegative
    };
  }

  // Mood conversion for compatibility with ToneAdapter
  emotionToMood(emotion: EmotionalState): Mood {
    const moodMap: { [key: string]: Mood } = {
      happy: { valence: 0.8, arousal: 0.7, dominance: 0.6 },
      sad: { valence: -0.7, arousal: 0.3, dominance: 0.3 },
      angry: { valence: -0.8, arousal: 0.9, dominance: 0.8 },
      anxious: { valence: -0.4, arousal: 0.8, dominance: 0.2 },
      confused: { valence: -0.2, arousal: 0.5, dominance: 0.2 },
      grateful: { valence: 0.9, arousal: 0.5, dominance: 0.5 },
      neutral: { valence: 0, arousal: 0.5, dominance: 0.5 }
    };

    const baseMood = moodMap[emotion.primaryEmotion] || moodMap.neutral;
    
    // Adjust based on intensity
    return {
      valence: baseMood.valence * emotion.intensity,
      arousal: baseMood.arousal * emotion.intensity,
      dominance: baseMood.dominance
    };
  }
}