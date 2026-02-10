// VaultStore: Long-Term Memory Vault with persistent storage and semantic retrieval
// Implements append-only persistent store with semantic search capabilities
// NOW USES VVAULT API - All construct memories stored in VVAULT ChromaDB, not Chatty DB

import { shouldLog } from '../../lib/verbosity';

// Code guard: Prevent SQLite usage for construct memories
if (typeof window === 'undefined') {
  // Node.js environment - check if db is being imported for construct memory operations
  try {
    const db = require('../../lib/db').default;
    if (db && db.prepare) {
      console.warn('⚠️ [VaultStore] SQLite database access detected. VaultStore now uses VVAULT API only.');
    }
  } catch (e) {
    // Ignore - db may not be available in all environments
  }
}

export interface VaultEntry {
  id?: number;
  constructId: string;
  threadId?: string;
  kind: 'LTM' | 'SUMMARY' | 'CHECKPOINT' | 'CONFIG';
  payload: any;
  timestamp: number;
  relevanceScore?: number;
  metadata?: Record<string, any>;
}

export interface VaultSearchOptions {
  constructId: string;
  threadId?: string;
  kind?: string;
  limit?: number;
  minRelevanceScore?: number;
  startTime?: number;
  endTime?: number;
  query?: string;
}

export interface VaultSummary {
  id: number;
  constructId: string;
  threadId?: string;
  summaryType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL';
  content: string;
  startTs: number;
  endTs: number;
  createdAt: number;
}

export class VaultStore {
  constructor(private constructId: string) { }

  /**
   * Save a message to the LTM vault via VVAULT API
   */
  async saveMessage(threadId: string, message: any): Promise<void> {
    try {
      // Extract user and assistant messages from the message payload
      const context = message.role === 'user' ? message.content :
        (message.payload?.role === 'user' ? message.payload.content :
          (typeof message === 'string' ? message : JSON.stringify(message)));
      const response = message.role === 'assistant' ? message.content :
        (message.payload?.role === 'assistant' ? message.payload.content : '');

      // If we don't have a proper context/response pair, create one from the message
      const finalContext = context || (message.content || JSON.stringify(message));
      const finalResponse = response || (message.role === 'assistant' ? message.content : '');

      // Store via VVAULT API
      const storeResponse = await fetch('/api/vvault/identity/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          constructCallsign: this.constructId,
          context: finalContext,
          response: finalResponse || finalContext, // Use context as response if no response available
          metadata: {
            timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString(),
            sessionId: threadId,
            source: message.metadata?.source || 'vault-store',
            memoryType: 'long-term', // Explicitly set as LTM
            ...message.metadata
          }
        })
      });

      if (!storeResponse.ok) {
        const errorText = await storeResponse.text();
        throw new Error(`VVAULT API error: ${storeResponse.status} ${errorText}`);
      }

      const result = await storeResponse.json();
      if (shouldLog('debug')) {
        console.log(`✅ [VaultStore] Saved message to VVAULT (duplicate: ${result.duplicate || false})`);
      }
    } catch (error) {
      console.error('Failed to save message to VVAULT:', error);
      throw error;
    }
  }

  /**
   * Save a checkpoint to the vault via VVAULT API
   */
  async saveCheckpoint(kind: string, payload: any, threadId?: string): Promise<void> {
    try {
      const checkpointContent = typeof payload === 'string' ? payload : JSON.stringify(payload);

      // Store checkpoint as a memory entry
      const storeResponse = await fetch('/api/vvault/identity/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          constructCallsign: this.constructId,
          context: `Checkpoint: ${kind}`,
          response: checkpointContent,
          metadata: {
            timestamp: new Date().toISOString(),
            sessionId: threadId || this.constructId,
            source: 'checkpoint',
            kind,
            memoryType: 'long-term'
          }
        })
      });

      if (!storeResponse.ok) {
        const errorText = await storeResponse.text();
        throw new Error(`VVAULT API error: ${storeResponse.status} ${errorText}`);
      }

      if (shouldLog('debug')) {
        console.log(`✅ [VaultStore] Saved checkpoint to VVAULT: ${kind}`);
      }
    } catch (error) {
      console.error('Failed to save checkpoint to VVAULT:', error);
      throw error;
    }
  }

  /**
   * Get STM window from vault (recent messages) via VVAULT API
   */
  async getSTM(threadId: string, limit = 50): Promise<any[]> {
    try {
      // Query VVAULT for recent messages
      const queryResponse = await fetch(
        `/api/vvault/identity/query?constructCallsign=${encodeURIComponent(this.constructId)}&query=recent messages&limit=${limit}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!queryResponse.ok) {
        if (shouldLog('error')) {
          console.error('Failed to query VVAULT for STM:', queryResponse.statusText);
        }
        return [];
      }

      const result = await queryResponse.json();
      if (!result.ok || !result.memories) {
        return [];
      }

      // Convert VVAULT memory format to VaultStore format
      return result.memories.map((memory: any) => ({
        role: 'assistant', // VVAULT stores context/response pairs
        content: memory.response || memory.context,
        timestamp: memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now(),
        context: memory.context,
        response: memory.response,
        relevanceScore: memory.relevance || 1.0,
        metadata: {
          memoryType: memory.memoryType,
          sessionId: threadId
        }
      })).sort((a: any, b: any) => a.timestamp - b.timestamp); // Return in chronological order
    } catch (error) {
      if (shouldLog('error')) {
        console.error('Failed to get STM from VVAULT:', error);
      }
      return [];
    }
  }

  /**
   * Search vault entries with semantic relevance via VVAULT API
   */
  async search(options: VaultSearchOptions): Promise<VaultEntry[]> {
    try {
      // Build query string from options
      const queryText = options.query || (options.threadId
        ? `thread ${options.threadId} ${options.kind || ''}`
        : (options.kind || 'memory'));

      const limit = options.limit || 10;

      // Query VVAULT API
      const queryResponse = await fetch(
        `/api/vvault/identity/query?constructCallsign=${encodeURIComponent(this.constructId)}&query=${encodeURIComponent(queryText)}&limit=${limit}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!queryResponse.ok) {
        if (shouldLog('error')) {
          console.error('Failed to search VVAULT:', queryResponse.statusText);
        }
        return [];
      }

      const result = await queryResponse.json();
      if (!result.ok || !result.memories) {
        return [];
      }

      // Filter and convert results
      let memories = result.memories;

      // Apply filters that can be done client-side
      if (options.minRelevanceScore !== undefined) {
        memories = memories.filter((m: any) => (m.relevance || 1.0) >= options.minRelevanceScore!);
      }

      if (options.startTime) {
        memories = memories.filter((m: any) => {
          const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
          return ts >= options.startTime!;
        });
      }

      if (options.endTime) {
        memories = memories.filter((m: any) => {
          const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
          return ts <= options.endTime!;
        });
      }

      // Convert to VaultEntry format
      return memories.map((memory: any, index: number) => ({
        id: index, // VVAULT doesn't return numeric IDs, use index
        constructId: this.constructId,
        threadId: options.threadId,
        kind: options.kind || 'LTM',
        payload: {
          context: memory.context,
          response: memory.response,
          role: 'assistant'
        },
        timestamp: memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now(),
        relevanceScore: memory.relevance || 1.0,
        metadata: {
          memoryType: memory.memoryType,
          sessionId: options.threadId
        }
      }));
    } catch (error) {
      if (shouldLog('error')) {
        console.error('Failed to search VVAULT:', error);
      }
      return [];
    }
  }

  /**
   * Get vault summary metadata via VVAULT API
   * Note: Summaries are now stored as checkpoint entries in VVAULT
   */
  async getVaultSummaryMeta(): Promise<VaultSummary[]> {
    try {
      // Query VVAULT for checkpoint/summary entries
      const queryResponse = await fetch(
        `/api/vvault/identity/query?constructCallsign=${encodeURIComponent(this.constructId)}&query=checkpoint summary&limit=50`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!queryResponse.ok) {
        if (shouldLog('error')) {
          console.error('Failed to get vault summaries from VVAULT:', queryResponse.statusText);
        }
        return [];
      }

      const result = await queryResponse.json();
      if (!result.ok || !result.memories) {
        return [];
      }

      // Filter for summary/checkpoint entries and convert format
      return result.memories
        .filter((m: any) => m.metadata?.kind?.includes('SUMMARY') || m.metadata?.kind?.includes('CHECKPOINT'))
        .map((memory: any, index: number) => {
          const metadata = memory.metadata || {};
          return {
            id: index,
            constructId: this.constructId,
            threadId: metadata.sessionId,
            summaryType: metadata.kind?.replace('SUMMARY_', '') as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL' || 'MANUAL',
            content: memory.response || memory.context,
            startTs: metadata.startTs || (memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now()),
            endTs: metadata.endTs || (memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now()),
            createdAt: memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now()
          };
        })
        .sort((a: any, b: any) => b.createdAt - a.createdAt); // Most recent first
    } catch (error) {
      if (shouldLog('error')) {
        console.error('Failed to get vault summary metadata from VVAULT:', error);
      }
      return [];
    }
  }

  /**
   * Create a vault summary via VVAULT API
   */
  async createSummary(
    summaryType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL',
    content: string,
    startTs: number,
    endTs: number,
    threadId?: string
  ): Promise<void> {
    try {
      // Store summary as a checkpoint entry in VVAULT
      const storeResponse = await fetch('/api/vvault/identity/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          constructCallsign: this.constructId,
          context: `Summary: ${summaryType}`,
          response: content,
          metadata: {
            timestamp: new Date().toISOString(),
            sessionId: threadId || this.constructId,
            source: 'summary',
            kind: `SUMMARY_${summaryType}`,
            startTs,
            endTs,
            memoryType: 'long-term'
          }
        })
      });

      if (!storeResponse.ok) {
        const errorText = await storeResponse.text();
        throw new Error(`VVAULT API error: ${storeResponse.status} ${errorText}`);
      }

      if (shouldLog('debug')) {
        console.log(`✅ [VaultStore] Created ${summaryType} summary in VVAULT`);
      }
    } catch (error) {
      console.error('Failed to create vault summary in VVAULT:', error);
      throw error;
    }
  }

  /**
   * Update relevance score for an entry
   * Note: VVAULT ChromaDB manages relevance scores automatically via semantic search.
   * This method is kept for API compatibility but is a no-op.
   */
  async updateRelevanceScore(entryId: number, score: number): Promise<void> {
    // VVAULT ChromaDB calculates relevance scores automatically based on semantic similarity
    // No manual update needed - scores are computed during query time
    if (shouldLog('debug')) {
      console.log(`[VaultStore] Relevance score update requested (VVAULT manages scores automatically): entryId=${entryId}, score=${score}`);
    }
  }

  /**
   * Get vault statistics via VVAULT API
   */
  async getStats(): Promise<{
    totalEntries: number;
    entriesByKind: Record<string, number>;
    totalSummaries: number;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    try {
      // Query VVAULT for all memories to compute stats
      const queryResponse = await fetch(
        `/api/vvault/identity/query?constructCallsign=${encodeURIComponent(this.constructId)}&query=*&limit=1000`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!queryResponse.ok) {
        if (shouldLog('error')) {
          console.error('Failed to get vault stats from VVAULT:', queryResponse.statusText);
        }
        return {
          totalEntries: 0,
          entriesByKind: {},
          totalSummaries: 0
        };
      }

      const result = await queryResponse.json();
      if (!result.ok || !result.memories) {
        return {
          totalEntries: 0,
          entriesByKind: {},
          totalSummaries: 0
        };
      }

      const memories = result.memories;
      const entriesByKind: Record<string, number> = {};
      let oldestEntry: number | undefined;
      let newestEntry: number | undefined;
      let totalSummaries = 0;

      memories.forEach((memory: any) => {
        const kind = memory.metadata?.kind || 'LTM';
        entriesByKind[kind] = (entriesByKind[kind] || 0) + 1;

        if (memory.metadata?.kind?.includes('SUMMARY')) {
          totalSummaries++;
        }

        const ts = memory.timestamp ? new Date(memory.timestamp).getTime() : Date.now();
        if (!oldestEntry || ts < oldestEntry) {
          oldestEntry = ts;
        }
        if (!newestEntry || ts > newestEntry) {
          newestEntry = ts;
        }
      });

      return {
        totalEntries: memories.length,
        entriesByKind,
        totalSummaries,
        oldestEntry,
        newestEntry
      };
    } catch (error) {
      if (shouldLog('error')) {
        console.error('Failed to get vault stats from VVAULT:', error);
      }
      return {
        totalEntries: 0,
        entriesByKind: {},
        totalSummaries: 0
      };
    }
  }

  /**
   * Cleanup old entries (for memory management)
   * Note: VVAULT ChromaDB manages memory lifecycle automatically via STM/LTM separation.
   * This method is kept for API compatibility but is a no-op.
   */
  async cleanup(olderThanDays = 30): Promise<number> {
    // VVAULT automatically manages memory lifecycle:
    // - Short-term memories (< 7 days) are in STM collection
    // - Long-term memories (>= 7 days) are in LTM collection
    // No manual cleanup needed
    if (shouldLog('debug')) {
      console.log(`[VaultStore] Cleanup requested (VVAULT manages lifecycle automatically): olderThanDays=${olderThanDays}`);
    }
    return 0; // Return 0 to indicate no entries were deleted
  }
}

// Factory function to create VaultStore instances
export function createVaultStore(constructId: string): VaultStore {
  return new VaultStore(constructId);
}
