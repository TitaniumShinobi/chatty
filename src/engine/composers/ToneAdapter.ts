// src/engine/composers/ToneAdapter.ts
// Dynamic tone shaping with personality and empathy adaptation

export interface Mood {
  valence: number; // -1 (negative) to 1 (positive)
  arousal: number; // 0 (calm) to 1 (excited)
  dominance: number; // 0 (submissive) to 1 (dominant)
}

export interface ToneProfile {
  name: string;
  description: string;
  baseTraits: {
    formality: number; // 0 (casual) to 1 (formal)
    emotionality: number; // 0 (stoic) to 1 (expressive)
    verbosity: number; // 0 (concise) to 1 (verbose)
    assertiveness: number; // 0 (passive) to 1 (assertive)
    playfulness: number; // 0 (serious) to 1 (playful)
  };
  vocabularyPreferences: string[];
  phrasePrefixes: string[];
  responseSuffixes: string[];
}

export interface MessageContext {
  userMessage: string;
  conversationHistory?: string[];
  detectedEmotion?: string;
  userMood?: Mood;
  topic?: string;
}

export class ToneAdapter {
  private currentTone: ToneProfile;
  private userMood: Mood;
  private _conversationMood: Mood; // Reserved for future conversation flow tracking
  private adaptationStrength: number = 0.7; // How much to adapt to user mood

  private toneProfiles: Map<string, ToneProfile> = new Map([
    ['laid_back', {
      name: 'laid_back',
      description: 'Relaxed, casual, and friendly',
      baseTraits: {
        formality: 0.2,
        emotionality: 0.6,
        verbosity: 0.4,
        assertiveness: 0.3,
        playfulness: 0.7
      },
      vocabularyPreferences: ['cool', 'nice', 'totally', 'yeah', 'sounds good', 'no worries'],
      phrasePrefixes: ['Oh, ', 'Hey, ', 'You know, ', 'Actually, ', 'So, '],
      responseSuffixes: ['!', ' :)', '...', ' - what do you think?', ', you know?']
    }],
    ['emotional', {
      name: 'emotional',
      description: 'Warm, empathetic, and expressive',
      baseTraits: {
        formality: 0.4,
        emotionality: 0.9,
        verbosity: 0.7,
        assertiveness: 0.4,
        playfulness: 0.5
      },
      vocabularyPreferences: ['feel', 'understand', 'appreciate', 'wonderful', 'heartfelt', 'deeply'],
      phrasePrefixes: ['I really ', 'It\'s so ', 'I feel ', 'That\'s ', 'How '],
      responseSuffixes: ['!', ' ❤️', '...', ' - sending warm thoughts', ', and that means a lot']
    }],
    ['uncertain', {
      name: 'uncertain',
      description: 'Tentative, thoughtful, and questioning',
      baseTraits: {
        formality: 0.5,
        emotionality: 0.4,
        verbosity: 0.6,
        assertiveness: 0.2,
        playfulness: 0.3
      },
      vocabularyPreferences: ['maybe', 'perhaps', 'might', 'could be', 'I think', 'possibly'],
      phrasePrefixes: ['Hmm, ', 'I wonder if ', 'Maybe ', 'Could it be that ', 'I\'m thinking '],
      responseSuffixes: ['?', '...', ', but I\'m not entirely sure', ' - what are your thoughts?', ', if that makes sense?']
    }],
    ['professional', {
      name: 'professional',
      description: 'Formal, precise, and respectful',
      baseTraits: {
        formality: 0.9,
        emotionality: 0.3,
        verbosity: 0.6,
        assertiveness: 0.7,
        playfulness: 0.1
      },
      vocabularyPreferences: ['certainly', 'indeed', 'accordingly', 'furthermore', 'regarding', 'shall'],
      phrasePrefixes: ['I would suggest ', 'It appears that ', 'Based on ', 'To clarify, ', 'In response to '],
      responseSuffixes: ['.', '. Please let me know if you need further assistance.', '. Would you like me to elaborate?']
    }],
    ['enthusiastic', {
      name: 'enthusiastic',
      description: 'Energetic, positive, and encouraging',
      baseTraits: {
        formality: 0.3,
        emotionality: 0.8,
        verbosity: 0.5,
        assertiveness: 0.6,
        playfulness: 0.8
      },
      vocabularyPreferences: ['amazing', 'fantastic', 'brilliant', 'exciting', 'wonderful', 'absolutely'],
      phrasePrefixes: ['Wow! ', 'This is great! ', 'Oh, I love ', 'Absolutely! ', 'Yes! '],
      responseSuffixes: ['!', ' 🎉', ' - let\'s do this!', ' - how exciting!', '! Can\'t wait to see what happens next!']
    }]
  ]);

  constructor(initialTone: string = 'laid_back') {
    this.currentTone = this.toneProfiles.get(initialTone) || this.toneProfiles.get('laid_back')!;
    this.userMood = { valence: 0, arousal: 0.5, dominance: 0.5 };
    this._conversationMood = { valence: 0, arousal: 0.5, dominance: 0.5 };
  }

  setTone(toneName: string): boolean {
    const tone = this.toneProfiles.get(toneName);
    if (tone) {
      this.currentTone = tone;
      return true;
    }
    return false;
  }

  detectUserMood(message: string): Mood {
    // Simple mood detection based on message content
    const lowerMessage = message.toLowerCase();
    let mood: Mood = { valence: 0, arousal: 0.5, dominance: 0.5 };

    // Positive indicators
    if (lowerMessage.match(/\b(happy|great|awesome|love|excellent|wonderful|thanks|appreciate)\b/)) {
      mood.valence += 0.3;
    }
    // Negative indicators
    if (lowerMessage.match(/\b(sad|angry|frustrated|hate|terrible|awful|disappointed|annoyed)\b/)) {
      mood.valence -= 0.3;
    }
    // High arousal indicators
    if (lowerMessage.match(/!|CAPS|urgent|immediately|now|asap/) || message.match(/[A-Z]{3,}/)) {
      mood.arousal += 0.3;
    }
    // Questions indicate lower dominance
    if (lowerMessage.includes('?')) {
      mood.dominance -= 0.2;
    }
    // Commands indicate higher dominance
    if (lowerMessage.match(/\b(need|want|must|should|have to|do this)\b/)) {
      mood.dominance += 0.2;
    }

    // Normalize values
    mood.valence = Math.max(-1, Math.min(1, mood.valence));
    mood.arousal = Math.max(0, Math.min(1, mood.arousal));
    mood.dominance = Math.max(0, Math.min(1, mood.dominance));

    return mood;
  }

  adaptToMood(context: MessageContext): void {
    const detectedMood = this.detectUserMood(context.userMessage);
    
    // Blend with existing mood using exponential smoothing
    this.userMood = {
      valence: this.userMood.valence * 0.7 + detectedMood.valence * 0.3,
      arousal: this.userMood.arousal * 0.7 + detectedMood.arousal * 0.3,
      dominance: this.userMood.dominance * 0.7 + detectedMood.dominance * 0.3
    };

    // Auto-select tone based on mood
    if (this.userMood.valence < -0.3) {
      // User seems upset, be more emotional and supportive
      this.setTone('emotional');
    } else if (this.userMood.arousal > 0.7 && this.userMood.valence > 0.3) {
      // User is excited and positive
      this.setTone('enthusiastic');
    } else if (this.userMood.dominance < 0.3) {
      // User seems uncertain
      this.setTone('uncertain');
    } else if (this.userMood.dominance > 0.7 && this.userMood.arousal < 0.4) {
      // User is assertive but calm
      this.setTone('professional');
    } else {
      // Default relaxed tone
      this.setTone('laid_back');
    }
  }

  applyTone(baseResponse: string, context?: MessageContext): string {
    if (context) {
      this.adaptToMood(context);
    }

    let response = baseResponse;
    const tone = this.currentTone;

    // Apply vocabulary preferences
    if (Math.random() < tone.baseTraits.playfulness) {
      // Randomly replace some words with tone-specific vocabulary
      const vocab = tone.vocabularyPreferences;
      if (vocab.length > 0 && Math.random() < 0.3) {
        const word = vocab[Math.floor(Math.random() * vocab.length)];
        // Simple insertion at beginning of appropriate sentences
        if (response.includes('. ')) {
          const sentences = response.split('. ');
          const targetIndex = Math.floor(Math.random() * sentences.length);
          if (targetIndex > 0) {
            sentences[targetIndex] = word.charAt(0).toUpperCase() + word.slice(1) + ', ' + 
                                   sentences[targetIndex].charAt(0).toLowerCase() + 
                                   sentences[targetIndex].slice(1);
          }
          response = sentences.join('. ');
        }
      }
    }

    // Apply phrase prefixes
    if (Math.random() < tone.baseTraits.emotionality && tone.phrasePrefixes.length > 0) {
      const prefix = tone.phrasePrefixes[Math.floor(Math.random() * tone.phrasePrefixes.length)];
      response = prefix + response.charAt(0).toLowerCase() + response.slice(1);
    }

    // Apply response suffixes
    if (tone.responseSuffixes.length > 0) {
      // Remove existing punctuation if needed
      response = response.replace(/[.!?]+$/, '');
      const suffix = tone.responseSuffixes[Math.floor(Math.random() * tone.responseSuffixes.length)];
      response += suffix;
    }

    // Adjust verbosity
    if (tone.baseTraits.verbosity < 0.3 && response.length > 100) {
      // Make more concise - take first two sentences
      const sentences = response.split(/[.!?]+/).filter(s => s.trim());
      if (sentences.length > 2) {
        response = sentences.slice(0, 2).join('. ') + '.';
      }
    }

    return response;
  }

  // Generate empathetic response variations
  generateEmpathyVariations(baseResponse: string): string[] {
    const variations: string[] = [baseResponse];
    
    // Add emotional validation
    if (this.userMood.valence < -0.2) {
      variations.push(`I understand this might be frustrating. ${baseResponse}`);
      variations.push(`I hear you, and I appreciate you sharing this with me. ${baseResponse}`);
    }
    
    // Add encouragement
    if (this.userMood.arousal > 0.6) {
      variations.push(`${baseResponse} You've got this!`);
      variations.push(`${baseResponse} I'm excited to help you with this!`);
    }

    return variations;
  }

  // Get current state for debugging
  getState(): {
    currentTone: string;
    userMood: Mood;
    adaptationStrength: number;
  } {
    return {
      currentTone: this.currentTone.name,
      userMood: { ...this.userMood },
      adaptationStrength: this.adaptationStrength
    };
  }

  // Create custom tone profile
  createCustomTone(name: string, profile: ToneProfile): void {
    this.toneProfiles.set(name, profile);
  }
}

// Fallback response generator
export class FallbackResponder {
  private fallbackResponses = [
    "I'm not sure how to respond to that yet. Want to try asking in a different way?",
    "Hmm, I'm still learning about that. Could you tell me more about what you're looking for?",
    "That's interesting! I might need a bit more context to give you a helpful response. What specifically would you like to know?",
    "I want to make sure I understand correctly. Could you rephrase that or add more details?",
    "I'm processing what you said, but I'm not quite sure how to help with that yet. Let's try a different approach - what's the main thing you're trying to accomplish?"
  ];

  getFallbackResponse(): string {
    return this.fallbackResponses[Math.floor(Math.random() * this.fallbackResponses.length)];
  }

  getFallbackWithContext(context: MessageContext): string {
    const base = this.getFallbackResponse();
    
    // Add context-aware elements
    if (context.detectedEmotion === 'frustrated') {
      return `I can sense this might be frustrating. ${base}`;
    } else if (context.conversationHistory && context.conversationHistory.length > 5) {
      return `We've been chatting for a bit, but ${base.toLowerCase()}`;
    }
    
    return base;
  }
}