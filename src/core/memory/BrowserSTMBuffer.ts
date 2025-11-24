// Browser-compatible STM Buffer using VVAULT API
// NOW USES VVAULT API - All construct memories stored in VVAULT ChromaDB, not localStorage

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
    
    // Persist to VVAULT if enabled
    if (this.persistToStorage) {
      this.saveToStorage(constructId, threadId, messageWithSequence).catch(error => {
        console.error('Failed to persist message to VVAULT:', error);
      });
    }
  }

  /**
   * Get the current STM window for a construct/thread
   */
  async getWindow(constructId: string, threadId: string, limit?: number): Promise<MessagePacket[]> {
    const key = this.getKey(constructId, threadId);
    const messages = this.buffer.get(key) || [];
    
    // If no in-memory buffer, try to load from VVAULT
    if (messages.length === 0 && this.persistToStorage) {
      return await this.loadFromStorage(constructId, threadId, limit);
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
  async getStats(constructId: string, threadId: string): Promise<{
    messageCount: number;
    windowSize: number;
    oldestMessage?: number;
    newestMessage?: number;
  }> {
    const messages = await this.getWindow(constructId, threadId);
    return {
      messageCount: messages.length,
      windowSize: this.windowSize,
      oldestMessage: messages[0]?.timestamp,
      newestMessage: messages[messages.length - 1]?.timestamp
    };
  }

  /**
   * Save message to VVAULT API
   */
  private async saveToStorage(constructId: string, threadId: string, message: MessagePacket & { sequence: number }): Promise<void> {
    try {
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
            source: 'browser-stm-buffer',
            memoryType: 'short-term', // Explicitly set as STM
            messageId: message.id,
            role: message.role,
            sequence: message.sequence
          }
        })
      });

      if (!storeResponse.ok) {
        const errorText = await storeResponse.text();
        console.error('Failed to persist STM message to VVAULT:', storeResponse.status, errorText);
      }
    } catch (error) {
      console.error('Failed to persist STM message to VVAULT:', error);
    }
  }

  /**
   * Load messages from VVAULT API
   */
  private async loadFromStorage(constructId: string, threadId: string, limit?: number): Promise<MessagePacket[]> {
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
        console.error('Failed to load STM messages from VVAULT:', queryResponse.statusText);
        return [];
      }

      const result = await queryResponse.json();
      if (!result.ok || !result.memories) {
        return [];
      }
      
      // Filter for short-term memories and convert to MessagePacket format
      const messages: (MessagePacket & { sequence: number })[] = [];
      
      result.memories
        .filter((m: any) => m.memoryType === 'short-term' || !m.memoryType)
        .slice(0, effectiveLimit)
        .forEach((memory: any) => {
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
      const bufferKey = this.getKey(constructId, threadId);
      this.buffer.set(bufferKey, messages);
      
      return messages.slice(-effectiveLimit);
    } catch (error) {
      console.error('Failed to load STM messages from VVAULT:', error);
      return [];
    }
  }

  /**
   * Remove message from VVAULT
   * Note: VVAULT is append-only, so we can't actually delete messages.
   * This method is kept for API compatibility but is a no-op.
   */
  private removeFromStorage(constructId: string, threadId: string, messageId: string): void {
    // VVAULT is append-only - messages cannot be deleted
    // Messages will naturally transition from STM to LTM based on age
  }

  /**
   * Clear all messages for a construct/thread from VVAULT
   * Note: VVAULT is append-only, so we can't actually delete messages.
   * This method only clears the in-memory buffer.
   */
  private clearFromStorage(constructId: string, threadId: string): void {
    // VVAULT is append-only - messages cannot be deleted
    // This method only affects the in-memory buffer (which is already cleared by clearWindow)
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
