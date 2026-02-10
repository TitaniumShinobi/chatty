/**
 * Persistent Memory Store
 * 
 * SQLite-backed storage for chat messages and triples to replace volatile RAM-only storage.
 * Provides persistent memory that survives server restarts and enables long-term recall.
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { checkMemoryPermission } from './memoryPermission';

export interface ChatMessage {
  id?: number;
  userId: string;
  gptId: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  ttl?: number;
}

export interface Triple {
  id?: number;
  userId: string;
  subject: string;
  predicate: string;
  object: string;
  sourceFile?: string;
  timestamp: number;
}

export interface TranscriptFragment {
  id?: number;
  userId: string;
  constructCallsign: string;
  content: string;
  context: string;
  sourceFile: string;
  hash: string;
  timestamp: number;
}

export class MemoryStore {
  private db: Database.Database;
  private initialized = false;

  constructor(private dbPath: string = './memory.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        gpt_id TEXT NOT NULL,
        content TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        timestamp INTEGER NOT NULL,
        ttl INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create triples table for symbolic reasoning
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS triples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        source_file TEXT,
        timestamp INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create transcript_fragments table for VVAULT integration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transcript_fragments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        construct_callsign TEXT NOT NULL,
        content TEXT NOT NULL,
        context TEXT NOT NULL,
        source_file TEXT NOT NULL,
        hash TEXT UNIQUE NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_user_gpt ON messages(user_id, gpt_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_triples_user ON triples(user_id);
      CREATE INDEX IF NOT EXISTS idx_triples_subject ON triples(subject);
      CREATE INDEX IF NOT EXISTS idx_fragments_construct ON transcript_fragments(construct_callsign);
      CREATE INDEX IF NOT EXISTS idx_fragments_hash ON transcript_fragments(hash);
    `);

    this.initialized = true;
    console.log('✅ [MemoryStore] Database initialized with persistent storage');
  }

  /**
   * Store a chat message
   */
  async persistMessage(
    userId: string, 
    gptId: string, 
    content: string, 
    role: 'user' | 'assistant', 
    ttl?: number,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<number> {
    // Check if memory is allowed
    if (!checkMemoryPermission(settings, 'persistMessage')) {
      return 0; // Return 0 to indicate no message was stored
    }

    await this.initialize();

    const stmt = this.db.prepare(`
      INSERT INTO messages (user_id, gpt_id, content, role, timestamp, ttl)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(userId, gptId, content, role, Date.now(), ttl);
    return result.lastInsertRowid as number;
  }

  /**
   * Retrieve conversation history
   */
  async retrieveHistory(
    userId: string, 
    gptId: string, 
    limit: number = 50,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<ChatMessage[]> {
    // Check if memory is allowed
    if (!checkMemoryPermission(settings, 'retrieveHistory')) {
      return []; // Return empty array when memory is disabled
    }

    await this.initialize();

    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE user_id = ? AND gpt_id = ?
      AND (ttl IS NULL OR timestamp + ttl > ?)
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const messages = stmt.all(userId, gptId, Date.now(), limit) as ChatMessage[];
    return messages.reverse(); // Return in chronological order
  }

  /**
   * Store a triple for symbolic reasoning
   */
  async storeTriple(
    userId: string, 
    subject: string, 
    predicate: string, 
    object: string, 
    sourceFile?: string,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<number> {
    // Check if memory is allowed
    if (!checkMemoryPermission(settings, 'storeTriple')) {
      return 0; // Return 0 to indicate no triple was stored
    }

    await this.initialize();

    const stmt = this.db.prepare(`
      INSERT INTO triples (user_id, subject, predicate, object, source_file, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(userId, subject, predicate, object, sourceFile, Date.now());
    return result.lastInsertRowid as number;
  }

  /**
   * Search triples by query
   */
  async searchTriples(
    userId: string, 
    query: string,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<Triple[]> {
    // Check if memory is allowed
    if (!checkMemoryPermission(settings, 'searchTriples')) {
      return []; // Return empty array when memory is disabled
    }

    await this.initialize();

    const stmt = this.db.prepare(`
      SELECT * FROM triples 
      WHERE user_id = ? 
      AND (subject LIKE ? OR predicate LIKE ? OR object LIKE ?)
      ORDER BY timestamp DESC
      LIMIT 20
    `);

    const searchTerm = `%${query}%`;
    return stmt.all(userId, searchTerm, searchTerm, searchTerm) as Triple[];
  }

  /**
   * Store transcript fragment
   */
  async storeTranscriptFragment(
    fragment: Omit<TranscriptFragment, 'id'>,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<number | null> {
    // Check if memory is allowed
    if (!checkMemoryPermission(settings, 'storeTranscriptFragment')) {
      return null; // Return null when memory is disabled
    }

    await this.initialize();

    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO transcript_fragments 
        (user_id, construct_callsign, content, context, source_file, hash, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        fragment.userId,
        fragment.constructCallsign,
        fragment.content,
        fragment.context,
        fragment.sourceFile,
        fragment.hash,
        fragment.timestamp
      );

      return result.changes > 0 ? (result.lastInsertRowid as number) : null;
    } catch (error) {
      // Ignore duplicate hash errors
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search transcript fragments
   */
  async searchTranscriptFragments(constructCallsign: string, query: string, limit: number = 10): Promise<TranscriptFragment[]> {
    await this.initialize();

    const stmt = this.db.prepare(`
      SELECT * FROM transcript_fragments 
      WHERE construct_callsign = ? 
      AND (content LIKE ? OR context LIKE ?)
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const searchTerm = `%${query}%`;
    return stmt.all(constructCallsign, searchTerm, searchTerm, limit) as TranscriptFragment[];
  }

  /**
   * Get all transcript fragments for a construct
   */
  async getTranscriptFragments(constructCallsign: string, limit: number = 100): Promise<TranscriptFragment[]> {
    await this.initialize();

    const stmt = this.db.prepare(`
      SELECT * FROM transcript_fragments 
      WHERE construct_callsign = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(constructCallsign, limit) as TranscriptFragment[];
  }

  /**
   * Clean up expired messages
   */
  async pruneExpired(): Promise<number> {
    await this.initialize();

    const stmt = this.db.prepare(`
      DELETE FROM messages 
      WHERE ttl IS NOT NULL AND timestamp + ttl < ?
    `);

    const result = stmt.run(Date.now());
    return result.changes;
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    messageCount: number;
    tripleCount: number;
    fragmentCount: number;
    oldestMessage: number | null;
    newestMessage: number | null;
  }> {
    await this.initialize();

    const messageCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    const tripleCount = this.db.prepare('SELECT COUNT(*) as count FROM triples').get() as { count: number };
    const fragmentCount = this.db.prepare('SELECT COUNT(*) as count FROM transcript_fragments').get() as { count: number };
    
    const oldestMessage = this.db.prepare('SELECT MIN(timestamp) as timestamp FROM messages').get() as { timestamp: number | null };
    const newestMessage = this.db.prepare('SELECT MAX(timestamp) as timestamp FROM messages').get() as { timestamp: number | null };

    return {
      messageCount: messageCount.count,
      tripleCount: tripleCount.count,
      fragmentCount: fragmentCount.count,
      oldestMessage: oldestMessage.timestamp,
      newestMessage: newestMessage.timestamp
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let memoryStore: MemoryStore | null = null;

export function getMemoryStore(dbPath?: string): MemoryStore {
  if (!memoryStore) {
    memoryStore = new MemoryStore(dbPath);
  }
  return memoryStore;
}
