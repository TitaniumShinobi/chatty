// STM Buffer: Short-Term Memory with sliding window logic per construct/thread
// Implements in-RAM fast-access buffer with configurable window size
// NOW USES VVAULT API - All construct memories stored in VVAULT ChromaDB, not Chatty DB

import { shouldLog } from '../../lib/verbosity';

// Code guard: Prevent SQLite usage for construct memories
if (typeof window === 'undefined') {
  try {
    const db = require('../../lib/db').default;
    if (db && db.prepare) {
      console.warn('⚠️ [STMBuffer] SQLite database access detected. STMBuffer now uses VVAULT API only.');
    }
  } catch (e) {
    // Ignore - db may not be available in all environments
  }
}

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
   * Persist message to VVAULT API
   */
  private async persistToDatabase(constructId: string, threadId: string, message: MessagePacket & { sequence: number }): Promise<void> {
    try {
      // For STM, we need to store message pairs (user/assistant)
      // Since we're storing individual messages, we'll create a context/response pair
      // If it's a user message, we'll store it with an empty response (will be updated when assistant responds)
      // If it's an assistant message, we'll try to find the previous user message
      
      const context = message.role === 'user' ? message.content : '';
      const response = message.role === 'assistant' ? message.content : '';

      // Store via VVAULT API with short-term memory type
      const storeResponse = await fetch('/api/vvault/identity/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          constructCallsign: constructId,
          context: context || `Message ${message.role}`,
          response: response || context,
          metadata: {
            timestamp: new Date(message.timestamp).toISOString(),
            sessionId: threadId,
            source: 'stm-buffer',
            memoryType: 'short-term', // Explicitly set as STM
          messageId: message.id,
          role: message.role,
          sequence: message.sequence
          }
        })
      });

      if (!storeResponse.ok) {
        if (shouldLog('error')) {
          const errorText = await storeResponse.text();
          console.error('Failed to persist STM message to VVAULT:', storeResponse.status, errorText);
        }
      } else if (shouldLog('debug')) {
        const result = await storeResponse.json();
        console.log(`✅ [STMBuffer] Persisted message to VVAULT (duplicate: ${result.duplicate || false})`);
      }
    } catch (error) {
      if (shouldLog('error')) {
        console.error('Failed to persist STM message to VVAULT:', error);
      }
    }
  }

  /**
   * Load messages from VVAULT API
   */
  private async loadFromDatabase(constructId: string, threadId: string, limit?: number): Promise<MessagePacket[]> {
    try {
      const effectiveLimit = limit || this.windowSize;
      
      // Query VVAULT for recent short-term memories
      const queryResponse = await fetch(
        `/api/vvault/identity/query?constructCallsign=${encodeURIComponent(constructId)}&query=recent messages&limit=${effectiveLimit}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!queryResponse.ok) {
        if (shouldLog('error')) {
          console.error('Failed to load STM messages from VVAULT:', queryResponse.statusText);
        }
        return [];
      }

      const result = await queryResponse.json();
      if (!result.ok || !result.memories) {
        return [];
      }

      // Filter for short-term memories and convert to MessagePacket format
      const messages: (MessagePacket & { sequence: number })[] = [];
      
      result.memories
        .filter((m: any) => m.memoryType === 'short-term' || !m.memoryType) // Prefer STM, but include any if no type specified
        .slice(0, effectiveLimit)
        .forEach((memory: any) => {
          // VVAULT stores context/response pairs, so we need to create message packets
          // We'll create two messages: one for context (user) and one for response (assistant)
          if (memory.context && memory.context !== `Message user`) {
            messages.push({
              id: memory.metadata?.messageId || `user_${Date.now()}`,
              role: 'user',
              content: memory.context,
              timestamp: memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now(),
              sequence: memory.metadata?.sequence || 0
            });
          }
          
          if (memory.response && memory.response !== memory.context) {
            messages.push({
              id: memory.metadata?.messageId || `assistant_${Date.now()}`,
              role: 'assistant',
              content: memory.response,
              timestamp: memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now(),
              sequence: (memory.metadata?.sequence || 0) + 1
            });
          }
        });

      // Sort by sequence and timestamp
      messages.sort((a, b) => {
        if (a.sequence !== b.sequence) return a.sequence - b.sequence;
        return a.timestamp - b.timestamp;
      });
        
        // Update in-memory buffer
        const key = this.getKey(constructId, threadId);
        this.buffer.set(key, messages);
        
        return messages;
    } catch (error) {
      if (shouldLog('error')) {
        console.error('Failed to load STM messages from VVAULT:', error);
      }
      return [];
    }
  }

  /**
   * Remove message from VVAULT
   * Note: VVAULT is append-only, so we can't actually delete messages.
   * This method is kept for API compatibility but is a no-op.
   * Messages will naturally age out of STM into LTM based on the 7-day threshold.
   */
  private removeFromDB(constructId: string, threadId: string, messageId: string): void {
    // VVAULT is append-only - messages cannot be deleted
    // Messages will naturally transition from STM to LTM based on age
    if (shouldLog('debug')) {
      console.log(`[STMBuffer] Remove requested (VVAULT is append-only): constructId=${constructId}, messageId=${messageId}`);
    }
  }

  /**
   * Clear all messages for a construct/thread from VVAULT
   * Note: VVAULT is append-only, so we can't actually delete messages.
   * This method only clears the in-memory buffer.
   */
  private clearFromDatabase(constructId: string, threadId: string): void {
    // VVAULT is append-only - messages cannot be deleted
    // This method only affects the in-memory buffer (which is already cleared by clearWindow)
    if (shouldLog('debug')) {
      console.log(`[STMBuffer] Clear requested (VVAULT is append-only, only clearing in-memory buffer): constructId=${constructId}, threadId=${threadId}`);
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
