// Browser-compatible STM Buffer using localStorage as fallback
// Simplified version for browser environment

export interface MessagePacket {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface STMOptions {
  windowSize?: number;
  persistToStorage?: boolean;
}

export class BrowserSTMBuffer {
  private windowSize: number;
  private persistToStorage: boolean;
  private buffer: Map<string, MessagePacket[]>; // key: constructId::threadId
  private sequenceCounters: Map<string, number>; // key: constructId::threadId

  constructor({ windowSize = 50, persistToStorage = true }: STMOptions = {}) {
    this.windowSize = windowSize;
    this.persistToStorage = persistToStorage;
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
      if (this.persistToStorage && removed) {
        this.removeFromStorage(constructId, threadId, removed.id);
      }
    }
    
    // Persist to localStorage if enabled
    if (this.persistToStorage) {
      this.saveToStorage(constructId, threadId, messageWithSequence);
    }
  }

  /**
   * Get the current STM window for a construct/thread
   */
  getWindow(constructId: string, threadId: string, limit?: number): MessagePacket[] {
    const key = this.getKey(constructId, threadId);
    const messages = this.buffer.get(key) || [];
    
    // If no in-memory buffer, try to load from localStorage
    if (messages.length === 0 && this.persistToStorage) {
      return this.loadFromStorage(constructId, threadId, limit);
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
    
    if (this.persistToStorage) {
      this.clearFromStorage(constructId, threadId);
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
   * Save message to localStorage
   */
  private saveToStorage(constructId: string, threadId: string, message: MessagePacket & { sequence: number }): void {
    try {
      const key = `chatty_stm_${constructId}_${threadId}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push(message);
      
      // Keep only recent messages
      const recent = existing.slice(-this.windowSize);
      localStorage.setItem(key, JSON.stringify(recent));
    } catch (error) {
      console.error('Failed to persist STM message to localStorage:', error);
    }
  }

  /**
   * Load messages from localStorage
   */
  private loadFromStorage(constructId: string, threadId: string, limit?: number): MessagePacket[] {
    try {
      const key = `chatty_stm_${constructId}_${threadId}`;
      const stored = localStorage.getItem(key);
      
      if (!stored) {
        return [];
      }
      
      const messages = JSON.parse(stored);
      const effectiveLimit = limit || this.windowSize;
      
      // Update in-memory buffer
      const bufferKey = this.getKey(constructId, threadId);
      this.buffer.set(bufferKey, messages);
      
      return messages.slice(-effectiveLimit);
    } catch (error) {
      console.error('Failed to load STM messages from localStorage:', error);
      return [];
    }
  }

  /**
   * Remove message from localStorage
   */
  private removeFromStorage(constructId: string, threadId: string, messageId: string): void {
    try {
      const key = `chatty_stm_${constructId}_${threadId}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        const messages = JSON.parse(stored);
        const filtered = messages.filter((msg: any) => msg.id !== messageId);
        localStorage.setItem(key, JSON.stringify(filtered));
      }
    } catch (error) {
      console.error('Failed to remove STM message from localStorage:', error);
    }
  }

  /**
   * Clear all messages for a construct/thread from localStorage
   */
  private clearFromStorage(constructId: string, threadId: string): void {
    try {
      const key = `chatty_stm_${constructId}_${threadId}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to clear STM messages from localStorage:', error);
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
    console.log(`Browser STM Buffer: ${this.buffer.size} active buffers`);
  }
}

// Export singleton instance
export const browserStmBuffer = new BrowserSTMBuffer();
