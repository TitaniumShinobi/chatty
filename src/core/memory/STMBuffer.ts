// STM Buffer: Short-Term Memory with sliding window logic per construct/thread
// Implements in-RAM fast-access buffer with configurable window size

import db from '../../lib/db';
import { shouldLog } from '../../lib/verbosity';

export interface MessagePacket {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface STMOptions {
  windowSize: number;
  persistToDB?: boolean;
}

export class STMBuffer {
  private windowSize: number;
  private persistToDB: boolean;
  private buffer: Map<string, MessagePacket[]>; // key: constructId::threadId
  private sequenceCounters: Map<string, number>; // key: constructId::threadId

  constructor({ windowSize = 50, persistToDB = true }: STMOptions = {}) {
    this.windowSize = windowSize;
    this.persistToDB = persistToDB;
    this.buffer = new Map();
    this.sequenceCounters = new Map();
  }

  private getKey(constructId: string, threadId: string): string {
    return `${constructId}::${threadId}`;
  }

  private getSequence(constructId: string, threadId: string): number {
    const key = this.getKey(constructId, threadId);
    const current = this.sequenceCounters.get(key) || 0;
    this.sequenceCounters.set(key, current + 1);
    return current;
  }

  /**
   * Add a message to the STM buffer for a specific construct/thread
   */
  addMessage(constructId: string, threadId: string, message: MessagePacket): void {
    const key = this.getKey(constructId, threadId);
    
    // Initialize buffer if it doesn't exist
    if (!this.buffer.has(key)) {
      this.buffer.set(key, []);
    }
    
    const messages = this.buffer.get(key)!;
    const sequence = this.getSequence(constructId, threadId);
    
    // Add message with sequence number
    const messageWithSequence = {
      ...message,
      sequence
    };
    
    messages.push(messageWithSequence);
    
    // Enforce sliding window
    if (messages.length > this.windowSize) {
      const removed = messages.shift();
      if (this.persistToDB && removed) {
        this.removeFromDB(constructId, threadId, removed.id);
      }
    }
    
    // Persist to database if enabled
    if (this.persistToDB) {
      this.persistToDatabase(constructId, threadId, messageWithSequence);
    }
  }

  /**
   * Get the current STM window for a construct/thread
   */
  async getWindow(constructId: string, threadId: string, limit?: number): Promise<MessagePacket[]> {
    const key = this.getKey(constructId, threadId);
    const messages = this.buffer.get(key) || [];
    
    // If no in-memory buffer, try to load from DB
    if (messages.length === 0 && this.persistToDB) {
      return await this.loadFromDatabase(constructId, threadId, limit);
    }
    
    const effectiveLimit = limit || this.windowSize;
    return messages.slice(-effectiveLimit);
  }

  /**
   * Clear the STM window for a construct/thread
   */
  clearWindow(constructId: string, threadId: string): void {
    const key = this.getKey(constructId, threadId);
    this.buffer.delete(key);
    this.sequenceCounters.delete(key);
    
    if (this.persistToDB) {
      this.clearFromDatabase(constructId, threadId);
    }
  }

  /**
   * Get STM statistics for monitoring
   */
  getStats(constructId: string, threadId: string): {
    messageCount: number;
    windowSize: number;
    oldestMessage?: number;
    newestMessage?: number;
  } {
    const messages = this.getWindow(constructId, threadId);
    return {
      messageCount: messages.length,
      windowSize: this.windowSize,
      oldestMessage: messages[0]?.timestamp,
      newestMessage: messages[messages.length - 1]?.timestamp
    };
  }

  /**
   * Persist message to database
   */
  private async persistToDatabase(constructId: string, threadId: string, message: MessagePacket & { sequence: number }): Promise<void> {
    try {
      if (db.stmBuffer) {
        // Browser environment - use Dexie
        await db.stmBuffer.add({
          constructId,
          threadId,
          messageId: message.id,
          role: message.role,
          content: message.content,
          ts: message.timestamp,
          sequence: message.sequence
        });
      } else {
        // Node.js environment - use SQLite
        const stmt = db.prepare(`
          INSERT INTO stm_buffer (construct_id, thread_id, message_id, role, content, ts, sequence)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(
          constructId,
          threadId,
          message.id,
          message.role,
          message.content,
          message.timestamp,
          message.sequence
        );
      }
    } catch (error) {
      // In CLI/Node.js environment, IndexedDB errors are expected
      // Only log if verbose mode is enabled
      const isIndexedDBError = error instanceof Error && 
        (error.message.includes('IndexedDB') || error.message.includes('MissingAPIError'));
      
      // Suppress IndexedDB errors by default (they're expected in Node.js)
      // Only log if it's not an IndexedDB error, or if verbose mode is enabled
      if (!isIndexedDBError && shouldLog('error')) {
        console.error('Failed to persist STM message to database:', error);
      }
    }
  }

  /**
   * Load messages from database
   */
  private async loadFromDatabase(constructId: string, threadId: string, limit?: number): Promise<MessagePacket[]> {
    try {
      const effectiveLimit = limit || this.windowSize;
      
      if (db.stmBuffer) {
        // Browser environment - use Dexie
        const rows = await db.stmBuffer
          .where(['constructId', 'threadId'])
          .equals([constructId, threadId])
          .reverse()
          .limit(effectiveLimit)
          .toArray();
        
        // Convert to MessagePacket format and reverse to get chronological order
        const messages = rows.reverse().map(row => ({
          id: row.messageId,
          role: row.role as 'user' | 'assistant' | 'system',
          content: row.content,
          timestamp: row.ts,
          sequence: row.sequence
        }));
        
        // Update in-memory buffer
        const key = this.getKey(constructId, threadId);
        this.buffer.set(key, messages);
        
        return messages;
      } else {
        // Node.js environment - use SQLite
        const stmt = db.prepare(`
          SELECT message_id, role, content, ts, sequence
          FROM stm_buffer 
          WHERE construct_id = ? AND thread_id = ?
          ORDER BY sequence DESC
          LIMIT ?
        `);
        
        const rows = stmt.all(constructId, threadId, effectiveLimit);
        
        // Convert to MessagePacket format and reverse to get chronological order
        const messages = rows.reverse().map(row => ({
          id: row.message_id,
          role: row.role as 'user' | 'assistant' | 'system',
          content: row.content,
          timestamp: row.ts,
          sequence: row.sequence
        }));
        
        // Update in-memory buffer
        const key = this.getKey(constructId, threadId);
        this.buffer.set(key, messages);
        
        return messages;
      }
    } catch (error) {
      if (shouldLog('error')) {
        console.error('Failed to load STM messages from database:', error);
      }
      return [];
    }
  }

  /**
   * Remove message from database
   */
  private removeFromDB(constructId: string, threadId: string, messageId: string): void {
    try {
      const stmt = db.prepare(`
        DELETE FROM stm_buffer 
        WHERE construct_id = ? AND thread_id = ? AND message_id = ?
      `);
      stmt.run(constructId, threadId, messageId);
    } catch (error) {
      console.error('Failed to remove STM message from database:', error);
    }
  }

  /**
   * Clear all messages for a construct/thread from database
   */
  private clearFromDatabase(constructId: string, threadId: string): void {
    try {
      const stmt = db.prepare(`
        DELETE FROM stm_buffer 
        WHERE construct_id = ? AND thread_id = ?
      `);
      stmt.run(constructId, threadId);
    } catch (error) {
      console.error('Failed to clear STM messages from database:', error);
    }
  }

  /**
   * Get all active construct/thread combinations
   */
  getActiveKeys(): Array<{ constructId: string; threadId: string }> {
    const keys: Array<{ constructId: string; threadId: string }> = [];
    
    for (const key of this.buffer.keys()) {
      const [constructId, threadId] = key.split('::');
      if (constructId && threadId) {
        keys.push({ constructId, threadId });
      }
    }
    
    return keys;
  }

  /**
   * Cleanup expired or orphaned buffers
   */
  cleanup(): void {
    // This could be enhanced to remove buffers that haven't been accessed recently
    // For now, we'll keep all buffers in memory
    console.log(`STM Buffer: ${this.buffer.size} active buffers`);
  }
}

// Export singleton instance
export const stmBuffer = new STMBuffer();
