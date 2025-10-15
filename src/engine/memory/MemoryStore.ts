// Basic in-process memory implementation for CLI and local reasoning engines
// NOTE: This is intentionally lightweight and synchronous. If we need
// durable storage we can later route calls through src/lib/db.ts.

export interface MemoryEntry {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

export interface Triple {
  s: string; // subject
  p: string; // predicate
  o: string; // object
  ts: number;
}

export interface ContextWindow {
  /** Conversation history in chronological order (old → new). */
  history: string[];
  /** Optional RDF-style triples that represent structured memory. */
  triples?: Triple[];
  /** Arbitrary key–value persona traits. */
  persona?: Record<string, unknown>;
}

/**
 * Simple in-memory store backed by JS Maps. Designed for single-process CLI
 * scenarios; not safe for multi-process usage. For persistence we can extend
 * this to use the SQLite layer in src/lib/db.ts.
 */
export class MemoryStore {
  private messages = new Map<string, MemoryEntry[]>();
  private triples = new Map<string, Triple[]>();
  private persona = new Map<string, Record<string, unknown>>();

  /** Append a conversation utterance. */
  append(userId: string, role: 'user' | 'assistant', text: string) {
    const arr = this.messages.get(userId) ?? [];
    arr.push({ role, text, ts: Date.now() });
    this.messages.set(userId, arr);
  }

  /** Add arbitrary triples (knowledge) for a user. */
  addTriples(userId: string, triples: Triple[]) {
    const arr = this.triples.get(userId) ?? [];
    arr.push(...triples);
    this.triples.set(userId, arr);
  }

  /** Set a persona key → value for a user. */
  setPersona(userId: string, key: string, value: unknown) {
    const p = this.persona.get(userId) ?? {};
    p[key] = value;
    this.persona.set(userId, p);
  }

  /**
   * Retrieve latest context window for a user.
   * @param limit Number of most-recent messages to include (default 20).
   */
  getContext(userId: string, limit = 20): ContextWindow {
    const msgs = this.messages.get(userId) ?? [];
    const history = msgs.slice(-limit).map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.text}`);
    return {
      history,
      triples: this.triples.get(userId) ?? [],
      persona: this.persona.get(userId) ?? {},
    };
  }
}

// Shared singleton so that every module importing { memoryStore } interacts
// with the same underlying instance.
export const memoryStore = new MemoryStore();
