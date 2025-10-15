// PersonaBrain.ts
// Wrapper around MemoryStore that manages persona-specific defaults
// (name, style, goals) and long-term preferences.

import { memoryStore, MemoryStore } from './MemoryStore.js';
import { maybeSummarise } from '../../lib/scheduler.js';

export interface PersonaConfig {
  name: string;
  description?: string;
  defaultStyle?: {
    formality?: 'casual' | 'neutral' | 'formal';
    friendliness?: number; // 0-1
  };
  preferences: Record<string, any>;
}

export class PersonaBrain {
  private meta = new Map<string, PersonaConfig>();
  private memory: MemoryStore;

  constructor(memory?: MemoryStore) {
    this.memory = memory || memoryStore;
  }

  /** Get persona config or create a default on first access */
  getPersona(userId = 'anon'): PersonaConfig {
    if (!this.meta.has(userId)) {
      this.meta.set(userId, {
        name: 'Chatty',
        description: 'Chatty is a friendly, helpful AI assistant that specializes in multi-model synthesis. I combine insights from different AI models to provide comprehensive, well-rounded answers. I\'m curious, knowledgeable, and genuinely interested in helping people with their questions and projects.',
        defaultStyle: { formality: 'neutral', friendliness: 0.85 },
        preferences: { 
          version: '0.5', 
          stack: 'Node 20, TypeScript, SQLite',
          approach: 'multi-model synthesis',
          personality: 'friendly and helpful'
        },
      });
    }
    return this.meta.get(userId)!;
  }

  /** Update a preference key → value */
  setPreference(userId: string, key: string, value: any) {
    const persona = this.getPersona(userId);
    persona.preferences[key] = value;
  }

  /** Append a memory utterance + optionally persist preference changes */
  remember(userId: string, role: 'user'|'assistant', utterance: string) {
    this.memory.append(userId, role, utterance);
    maybeSummarise(userId);
    // naive preference extraction example
    if (/my name is (\w+)/i.test(utterance)) {
      const name = utterance.match(/my name is (\w+)/i)![1];
      this.memory.setPersona(userId,'name',name);
    }
  }

  /** Retrieve conversation context + persona */
  getContext(userId: string) {
    const memCtx = this.memory.getContext(userId);
    const persona = this.getPersona(userId);
    return { ...memCtx, persona };
  }
}
