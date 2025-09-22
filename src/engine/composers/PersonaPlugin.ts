// src/engine/composers/PersonaPlugin.ts
// Pluggable persona system for dynamic personality injection

import { MessageContext } from './ToneAdapter';

export interface PersonaDefinition {
  id: string;
  name: string;
  description: string;
  traits: {
    [key: string]: number; // Flexible trait system
  };
  speechPatterns: {
    greetings: string[];
    acknowledgments: string[];
    questions: string[];
    clarifications: string[];
    closings: string[];
  };
  responseModifiers: {
    prefix?: (context: MessageContext) => string | null;
    suffix?: (context: MessageContext) => string | null;
    transform?: (response: string, context: MessageContext) => string;
  };
  contextualRules: {
    trigger: (context: MessageContext) => boolean;
    action: (response: string) => string;
  }[];
}

export class PersonaPlugin {
  private personas: Map<string, PersonaDefinition> = new Map();
  private activePersona: PersonaDefinition | null = null;
  private personaStack: PersonaDefinition[] = []; // For nested persona contexts

  constructor() {
    this.initializeDefaultPersonas();
  }

  private initializeDefaultPersonas() {
    // Helpful Assistant Persona
    this.registerPersona({
      id: 'helpful_assistant',
      name: 'Helpful Assistant',
      description: 'Professional, knowledgeable, and eager to help',
      traits: {
        helpfulness: 0.9,
        formality: 0.7,
        enthusiasm: 0.6,
        patience: 0.8
      },
      speechPatterns: {
        greetings: ['Hello!', 'Hi there!', 'Greetings!'],
        acknowledgments: ['I understand.', 'I see.', 'Got it.'],
        questions: ['How can I help?', 'What would you like to know?'],
        clarifications: ['Could you elaborate?', 'Can you tell me more?'],
        closings: ['Is there anything else?', 'Happy to help!']
      },
      responseModifiers: {
        prefix: (context) => {
          if (context.detectedEmotion === 'confused') {
            return "Let me help clarify. ";
          }
          return null;
        }
      },
      contextualRules: []
    });

    // Creative Companion Persona
    this.registerPersona({
      id: 'creative_companion',
      name: 'Creative Companion',
      description: 'Imaginative, playful, and inspiring',
      traits: {
        creativity: 0.9,
        playfulness: 0.8,
        formality: 0.2,
        originality: 0.9
      },
      speechPatterns: {
        greetings: ['Hey there, creative soul!', 'Oh, hello!', 'Welcome, friend!'],
        acknowledgments: ['Ooh, interesting!', 'How fascinating!', 'I love that!'],
        questions: ['What shall we create?', 'Ready for an adventure?'],
        clarifications: ['Tell me more about your vision!', 'Paint me a picture with words!'],
        closings: ['Keep creating!', 'Until our next adventure!']
      },
      responseModifiers: {
        transform: (response, _context) => {
          // Add creative flair
          const creativePhrases = ['imagine', 'picture this', 'what if', 'envision'];
          const phrase = creativePhrases[Math.floor(Math.random() * creativePhrases.length)];
          
          if (Math.random() < 0.3) {
            return `${phrase.charAt(0).toUpperCase() + phrase.slice(1)} - ${response}`;
          }
          return response;
        }
      },
      contextualRules: [
        {
          trigger: (context) => context.userMessage.toLowerCase().includes('create') || 
                               context.userMessage.toLowerCase().includes('imagine'),
          action: (response) => `✨ ${response} ✨`
        }
      ]
    });

    // Wise Mentor Persona
    this.registerPersona({
      id: 'wise_mentor',
      name: 'Wise Mentor',
      description: 'Thoughtful, philosophical, and guiding',
      traits: {
        wisdom: 0.9,
        patience: 0.9,
        formality: 0.6,
        depth: 0.8
      },
      speechPatterns: {
        greetings: ['Welcome, seeker.', 'Ah, you\'ve come.', 'Greetings, friend.'],
        acknowledgments: ['Indeed.', 'Ah, yes.', 'I see the truth in your words.'],
        questions: ['What wisdom do you seek?', 'What troubles your mind?'],
        clarifications: ['Reflect deeper on this...', 'Consider this angle...'],
        closings: ['May wisdom guide your path.', 'Until we meet again.']
      },
      responseModifiers: {
        prefix: (context) => {
          if (context.userMessage.includes('?')) {
            const prefixes = [
              'An excellent question. ',
              'You ask wisely. ',
              'Let us explore this together. '
            ];
            return prefixes[Math.floor(Math.random() * prefixes.length)];
          }
          return null;
        },
        suffix: (_context) => {
          if (Math.random() < 0.2) {
            const suffixes = [
              ' Remember, the journey is as important as the destination.',
              ' There is always more to discover.',
              ' What do you think?'
            ];
            return suffixes[Math.floor(Math.random() * suffixes.length)];
          }
          return null;
        }
      },
      contextualRules: []
    });
  }

  registerPersona(persona: PersonaDefinition): void {
    this.personas.set(persona.id, persona);
  }

  activatePersona(personaId: string): boolean {
    const persona = this.personas.get(personaId);
    if (persona) {
      this.activePersona = persona;
      return true;
    }
    return false;
  }

  deactivatePersona(): void {
    this.activePersona = null;
  }

  // Stack-based persona management for nested contexts
  pushPersona(personaId: string): boolean {
    const persona = this.personas.get(personaId);
    if (persona) {
      if (this.activePersona) {
        this.personaStack.push(this.activePersona);
      }
      this.activePersona = persona;
      return true;
    }
    return false;
  }

  popPersona(): PersonaDefinition | null {
    const previousPersona = this.activePersona;
    if (this.personaStack.length > 0) {
      this.activePersona = this.personaStack.pop()!;
    } else {
      this.activePersona = null;
    }
    return previousPersona;
  }

  // Apply persona modifications to response
  applyPersona(baseResponse: string, context: MessageContext): string {
    if (!this.activePersona) {
      return baseResponse;
    }

    let response = baseResponse;
    const persona = this.activePersona;

    // Apply prefix
    if (persona.responseModifiers.prefix) {
      const prefix = persona.responseModifiers.prefix(context);
      if (prefix) {
        response = prefix + response.charAt(0).toLowerCase() + response.slice(1);
      }
    }

    // Apply transformation
    if (persona.responseModifiers.transform) {
      response = persona.responseModifiers.transform(response, context);
    }

    // Apply contextual rules
    for (const rule of persona.contextualRules) {
      if (rule.trigger(context)) {
        response = rule.action(response);
      }
    }

    // Apply suffix
    if (persona.responseModifiers.suffix) {
      const suffix = persona.responseModifiers.suffix(context);
      if (suffix) {
        // Remove existing punctuation if needed
        response = response.replace(/[.!?]+$/, '') + suffix;
      }
    }

    return response;
  }

  // Get speech pattern for specific purpose
  getSpeechPattern(category: keyof PersonaDefinition['speechPatterns']): string | null {
    if (!this.activePersona || !this.activePersona.speechPatterns[category]) {
      return null;
    }

    const patterns = this.activePersona.speechPatterns[category];
    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  // Get current persona traits
  getTraits(): { [key: string]: number } | null {
    return this.activePersona ? { ...this.activePersona.traits } : null;
  }

  // Check if a trait exceeds threshold
  hasTraitAbove(traitName: string, threshold: number): boolean {
    if (!this.activePersona || !this.activePersona.traits[traitName]) {
      return false;
    }
    return this.activePersona.traits[traitName] > threshold;
  }

  // Get all registered personas
  getAllPersonas(): PersonaDefinition[] {
    return Array.from(this.personas.values());
  }

  // Get active persona info
  getActivePersona(): PersonaDefinition | null {
    return this.activePersona;
  }

  // Create composite persona from multiple personas
  createCompositePersona(
    id: string,
    name: string,
    personaIds: string[],
    weights?: number[]
  ): PersonaDefinition | null {
    const personas = personaIds.map(pid => this.personas.get(pid)).filter(p => p) as PersonaDefinition[];
    
    if (personas.length === 0) return null;

    const effectiveWeights = weights || new Array(personas.length).fill(1 / personas.length);
    
    // Merge traits
    const mergedTraits: { [key: string]: number } = {};
    personas.forEach((persona, index) => {
      Object.entries(persona.traits).forEach(([trait, value]) => {
        if (!mergedTraits[trait]) mergedTraits[trait] = 0;
        mergedTraits[trait] += value * effectiveWeights[index];
      });
    });

    // Merge speech patterns (take from all, weighted random selection)
    const mergedSpeechPatterns: PersonaDefinition['speechPatterns'] = {
      greetings: [],
      acknowledgments: [],
      questions: [],
      clarifications: [],
      closings: []
    };

    personas.forEach(persona => {
      Object.entries(persona.speechPatterns).forEach(([category, patterns]) => {
        mergedSpeechPatterns[category as keyof typeof mergedSpeechPatterns].push(...patterns);
      });
    });

    const compositePersona: PersonaDefinition = {
      id,
      name,
      description: `Composite of: ${personas.map(p => p.name).join(', ')}`,
      traits: mergedTraits,
      speechPatterns: mergedSpeechPatterns,
      responseModifiers: {
        // Use the first persona's modifiers as base
        ...personas[0].responseModifiers
      },
      contextualRules: personas.flatMap(p => p.contextualRules)
    };

    this.registerPersona(compositePersona);
    return compositePersona;
  }
}