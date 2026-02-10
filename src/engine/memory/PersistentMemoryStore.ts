// PersistentMemoryStore.ts
// SQLite-backed memory store for persistent conversation history across sessions

import { MemoryEntry, Triple, ContextWindow, MemoryStore } from './MemoryStore.js';
import db from '../../lib/db.js';

export interface PersistentMemoryStoreInterface extends MemoryStore {
  remember(role: 'user' | 'assistant', text: string): void;
  addTriple(s: string, p: string, o: string): void;
  getPersona(userId: string): Record<string, unknown>;
  setPersona(userId: string, key: string, value: unknown): void;
  clear(userId: string): void;
  getStats(userId: string): { messageCount: number; tripleCount: number; personaKeys: number };
}

export class PersistentMemoryStore extends MemoryStore {
  private userId: string;

  constructor(userId = 'cli') {
    super();
    this.userId = userId;
  }

  /** Store a message in the database */
  remember(role: 'user' | 'assistant', text: string): void {
    const stmt = db.prepare(`
      INSERT INTO messages (userId, role, ts, text) 
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(this.userId, role, Date.now(), text);
    
    // Also update parent class
    this.append(this.userId, role, text);
  }

  /** Append a conversation utterance (override to persist to database) */
  append(userId: string, role: 'user' | 'assistant', text: string): void {
    // Call parent method first
    super.append(userId, role, text);
    
    // Then persist to database
    const stmt = db.prepare(`
      INSERT INTO messages (userId, role, ts, text) 
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(userId, role, Date.now(), text);
  }

  /** Get conversation history from the database (MemoryStore interface) */
  getContext(userId: string, limit = 20): ContextWindow {
    const stmt = db.prepare(`
      SELECT role, text, ts 
      FROM messages 
      WHERE userId = ? 
      ORDER BY ts DESC 
      LIMIT ?
    `);
    
    const messages = stmt.all(userId, limit) as Array<{
      role: 'user' | 'assistant';
      text: string;
      ts: number;
    }>;

    // Reverse to get chronological order (old → new) and format like MemoryStore
    const history = messages.reverse().map(msg => `${msg.role === 'user' ? 'U' : 'A'}: ${msg.text}`);

    // Get triples for this user
    const tripleStmt = db.prepare(`
      SELECT s, p, o, ts 
      FROM triples 
      WHERE userId = ? 
      ORDER BY ts DESC 
      LIMIT 100
    `);
    
    const tripleRows = tripleStmt.all(userId) as Array<{
      s: string;
      p: string;
      o: string;
      ts: number;
    }>;

    const triples: Triple[] = tripleRows.map(row => ({
      s: row.s,
      p: row.p,
      o: row.o,
      ts: row.ts
    }));

    return {
      history,
      triples,
      persona: this.getPersona(userId)
    };
  }

  /** Store a triple (subject-predicate-object) in the database */
  addTriple(s: string, p: string, o: string): void {
    const triple = { s, p, o, ts: Date.now() };
    this.addTriples(this.userId, [triple]);
  }

  /** Add multiple triples (override to persist to database) */
  addTriples(userId: string, triples: Triple[]): void {
    // Call parent method first
    super.addTriples(userId, triples);
    
    // Then persist to database
    const stmt = db.prepare(`
      INSERT INTO triples (userId, s, p, o, ts) 
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const triple of triples) {
      stmt.run(userId, triple.s, triple.p, triple.o, triple.ts);
    }
  }

  /** Get persona data from the database */
  getPersona(userId: string): Record<string, unknown> {
    const stmt = db.prepare(`
      SELECT k, v 
      FROM persona 
      WHERE userId = ?
    `);
    
    const rows = stmt.all(userId) as Array<{ k: string; v: string }>;
    const persona: Record<string, unknown> = {};
    
    for (const row of rows) {
      try {
        persona[row.k] = JSON.parse(row.v);
      } catch {
        persona[row.k] = row.v;
      }
    }
    
    return persona;
  }

  /** Store persona data in the database (override to persist to database) */
  setPersona(userId: string, key: string, value: unknown): void {
    // Call parent method first
    super.setPersona(userId, key, value);
    
    // Then persist to database
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO persona (userId, k, v, ts) 
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(userId, key, JSON.stringify(value), Date.now());
  }

  /** Clear all memory for this user */
  clear(userId: string): void {
    const messagesStmt = db.prepare('DELETE FROM messages WHERE userId = ?');
    const triplesStmt = db.prepare('DELETE FROM triples WHERE userId = ?');
    const personaStmt = db.prepare('DELETE FROM persona WHERE userId = ?');
    
    messagesStmt.run(userId);
    triplesStmt.run(userId);
    personaStmt.run(userId);
    
    // Note: We can't clear parent class private properties directly
    // The parent class would need a clear method for this
  }

  /** Get memory statistics */
  getStats(userId: string): { messageCount: number; tripleCount: number; personaKeys: number } {
    const messageStmt = db.prepare('SELECT COUNT(*) as count FROM messages WHERE userId = ?');
    const tripleStmt = db.prepare('SELECT COUNT(*) as count FROM triples WHERE userId = ?');
    const personaStmt = db.prepare('SELECT COUNT(*) as count FROM persona WHERE userId = ?');
    
    const messageCount = (messageStmt.get(userId) as { count: number }).count;
    const tripleCount = (tripleStmt.get(userId) as { count: number }).count;
    const personaKeys = (personaStmt.get(userId) as { count: number }).count;
    
    return { messageCount, tripleCount, personaKeys };
  }
}
