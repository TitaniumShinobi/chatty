// Lenses/Skills Library - Modular approach to response generation
export interface Lens {
  name: string;
  weight: number;
  context: string[];
  process: (input: string, context: any) => LensOutput;
}

export interface LensOutput {
  content: string;
  confidence: number;
  metadata: Record<string, any>;
  style: 'direct' | 'reflective' | 'supportive' | 'analytical' | 'creative';
}

export class LensLibrary {
  private lenses: Map<string, Lens> = new Map();
  private defaultWeights: Map<string, number> = new Map();

  constructor() {
    this.initializeLenses();
  }

  processWithLenses(input: string, context: any, activeLenses: string[] = []): LensOutput[] {
    const outputs: LensOutput[] = [];
    
    // If no specific lenses requested, use all applicable ones
    const lensesToUse = activeLenses.length > 0 
      ? activeLenses 
      : this.getApplicableLenses(input, context);

    for (const lensName of lensesToUse) {
      const lens = this.lenses.get(lensName);
      if (lens && this.isLensApplicable(lens, input, context)) {
        try {
          const output = lens.process(input, context);
          outputs.push(output);
        } catch (error) {
          console.warn(`Lens ${lensName} failed:`, error);
        }
      }
    }

    return outputs;
  }

  private getApplicableLenses(input: string, context: any): string[] {
    const applicable: string[] = [];
    
    for (const [name, lens] of this.lenses) {
      if (this.isLensApplicable(lens, input, context)) {
        applicable.push(name);
      }
    }

    return applicable;
  }

  private isLensApplicable(lens: Lens, input: string, context: any): boolean {
    // Check if lens context matches
    if (lens.context.length > 0) {
      const inputContext = this.detectContext(input);
      if (!lens.context.includes(inputContext)) {
        return false;
      }
    }

    return true;
  }

  private detectContext(input: string): string {
    const lower = input.toLowerCase();
    
    if (/crisis|suicide|harm|emergency/.test(lower)) return 'crisis';
    if (/feel|emotion|sad|angry|frustrated/.test(lower)) return 'emotional';
    if (/code|programming|technical|debug/.test(lower)) return 'technical';
    if (/learn|study|teach|explain/.test(lower)) return 'educational';
    if (/create|write|design|art/.test(lower)) return 'creative';
    if (/plan|organize|schedule|goal/.test(lower)) return 'planning';
    
    return 'general';
  }

  private initializeLenses(): void {
    // Power of Now lens - mindfulness and present moment awareness
    this.lenses.set('power_of_now', {
      name: 'Power of Now',
      weight: 0.8,
      context: ['emotional', 'crisis', 'general'],
      process: (input: string, context: any) => {
        const prompts = [
          "Let's take a moment to breathe and ground ourselves in the present.",
          "What's happening right now, in this moment?",
          "Can you feel your feet on the ground? What do you notice around you?",
          "Sometimes the most powerful thing we can do is simply be present with what is."
        ];
        
        return {
          content: prompts[Math.floor(Math.random() * prompts.length)],
          confidence: 0.7,
          metadata: { technique: 'mindfulness', focus: 'present_moment' },
          style: 'reflective'
        };
      }
    });

    // Non-Violent Communication (NVC) lens
    this.lenses.set('nvc', {
      name: 'Non-Violent Communication',
      weight: 0.7,
      context: ['emotional', 'general'],
      process: (input: string, context: any) => {
        const nvcPrompts = [
          "I hear that you're feeling {emotion}. What need might be behind that feeling?",
          "When you say '{input}', I'm sensing some strong feelings. Can you help me understand what's important to you right now?",
          "It sounds like you're experiencing {emotion}. What would help you feel more {positive_emotion}?",
          "I'm curious about what you're needing in this situation. Can you tell me more about what matters to you?"
        ];
        
        const emotion = this.extractEmotion(input);
        const positiveEmotion = this.suggestPositiveEmotion(emotion);
        
        const template = nvcPrompts[Math.floor(Math.random() * nvcPrompts.length)];
        const content = template
          .replace('{emotion}', emotion)
          .replace('{input}', input.substring(0, 50) + '...')
          .replace('{positive_emotion}', positiveEmotion);
        
        return {
          content,
          confidence: 0.8,
          metadata: { technique: 'nvc', focus: 'needs_and_feelings' },
          style: 'supportive'
        };
      }
    });

    // Cognitive Behavioral Therapy (CBT) lens
    this.lenses.set('cbt', {
      name: 'Cognitive Behavioral Therapy',
      weight: 0.6,
      context: ['emotional', 'general'],
      process: (input: string, context: any) => {
        const cbtPrompts = [
          "I notice you're having some strong thoughts about this. What evidence do you have for and against this perspective?",
          "What would you tell a friend who was experiencing this same situation?",
          "If you could step back and look at this from a different angle, what might you see?",
          "What's the worst that could happen? And what's the best? What's most likely?",
          "How might you reframe this situation in a way that serves you better?"
        ];
        
        return {
          content: cbtPrompts[Math.floor(Math.random() * cbtPrompts.length)],
          confidence: 0.7,
          metadata: { technique: 'cbt', focus: 'thought_challenging' },
          style: 'analytical'
        };
      }
    });

    // Technical Problem-Solving lens
    this.lenses.set('technical', {
      name: 'Technical Problem-Solving',
      weight: 0.9,
      context: ['technical'],
      process: (input: string, context: any) => {
        const techPrompts = [
          "Let's break this down systematically. What's the specific problem you're trying to solve?",
          "I'll help you troubleshoot this step by step. First, let's identify the root cause.",
          "Here's a structured approach we can take to solve this technical challenge.",
          "Let me walk you through the debugging process for this issue."
        ];
        
        return {
          content: techPrompts[Math.floor(Math.random() * techPrompts.length)],
          confidence: 0.9,
          metadata: { technique: 'systematic_problem_solving', focus: 'technical_analysis' },
          style: 'analytical'
        };
      }
    });

    // Creative Collaboration lens
    this.lenses.set('creative', {
      name: 'Creative Collaboration',
      weight: 0.8,
      context: ['creative', 'general'],
      process: (input: string, context: any) => {
        const creativePrompts = [
          "I love the creative energy in your request! Let's explore this together.",
          "What if we approached this from a completely different angle?",
          "Let's brainstorm some wild, unconventional ideas first, then refine them.",
          "I'm excited to collaborate on this creative project with you!"
        ];
        
        return {
          content: creativePrompts[Math.floor(Math.random() * creativePrompts.length)],
          confidence: 0.8,
          metadata: { technique: 'creative_collaboration', focus: 'ideation' },
          style: 'creative'
        };
      }
    });

    // Educational lens
    this.lenses.set('educational', {
      name: 'Educational',
      weight: 0.8,
      context: ['educational', 'general'],
      process: (input: string, context: any) => {
        const eduPrompts = [
          "Great question! Let me explain this in a way that's easy to understand.",
          "I'll break this down into digestible pieces so you can really grasp the concept.",
          "Let's start with the fundamentals and build up from there.",
          "Here's a step-by-step approach to learning this topic."
        ];
        
        return {
          content: eduPrompts[Math.floor(Math.random() * eduPrompts.length)],
          confidence: 0.8,
          metadata: { technique: 'educational', focus: 'knowledge_transfer' },
          style: 'direct'
        };
      }
    });

    // Planning and Organization lens
    this.lenses.set('planning', {
      name: 'Planning & Organization',
      weight: 0.7,
      context: ['planning', 'general'],
      process: (input: string, context: any) => {
        const planningPrompts = [
          "Let's create a solid plan to tackle this systematically.",
          "I'll help you organize this into manageable steps.",
          "What's your timeline for this project? Let's work backwards from your goal.",
          "Let's break this down into phases and set some milestones."
        ];
        
        return {
          content: planningPrompts[Math.floor(Math.random() * planningPrompts.length)],
          confidence: 0.8,
          metadata: { technique: 'planning', focus: 'organization' },
          style: 'analytical'
        };
      }
    });
  }

  private extractEmotion(input: string): string {
    const emotions = ['frustrated', 'overwhelmed', 'confused', 'excited', 'worried', 'hopeful', 'disappointed', 'angry', 'sad', 'anxious'];
    const found = emotions.find(emotion => input.toLowerCase().includes(emotion));
    return found || 'something';
  }

  private suggestPositiveEmotion(emotion: string): string {
    const positiveMap: Record<string, string> = {
      'frustrated': 'accomplished',
      'overwhelmed': 'organized',
      'confused': 'clear',
      'worried': 'confident',
      'disappointed': 'hopeful',
      'angry': 'peaceful',
      'sad': 'content',
      'anxious': 'calm'
    };
    
    return positiveMap[emotion] || 'better';
  }

  // Get available lenses
  getAvailableLenses(): string[] {
    return Array.from(this.lenses.keys());
  }

  // Get lens by name
  getLens(name: string): Lens | undefined {
    return this.lenses.get(name);
  }

  // Set lens weight
  setLensWeight(name: string, weight: number): void {
    const lens = this.lenses.get(name);
    if (lens) {
      lens.weight = weight;
    }
  }
}
