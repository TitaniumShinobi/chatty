// VaultStore: Long-Term Memory Vault with persistent storage and semantic retrieval
// Implements append-only persistent store with semantic search capabilities

import db from '../../lib/db';
import { shouldLog } from '../../lib/verbosity';

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
  constructor(private constructId: string) {}

  /**
   * Save a message to the LTM vault
   */
  async saveMessage(threadId: string, message: any): Promise<void> {
    try {
      const stmt = db.prepare(`
        INSERT INTO vault_entries (construct_id, thread_id, kind, payload, ts, relevance_score, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        this.constructId,
        threadId,
        'LTM',
        JSON.stringify(message),
        Date.now(),
        1.0, // Default relevance score
        JSON.stringify({ source: 'message', timestamp: Date.now() })
      );
    } catch (error) {
      console.error('Failed to save message to vault:', error);
      throw error;
    }
  }

  /**
   * Save a checkpoint to the vault
   */
  async saveCheckpoint(kind: string, payload: any, threadId?: string): Promise<void> {
    try {
      const stmt = db.prepare(`
        INSERT INTO vault_entries (construct_id, thread_id, kind, payload, ts, relevance_score, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        this.constructId,
        threadId || null,
        kind,
        JSON.stringify(payload),
        Date.now(),
        1.0,
        JSON.stringify({ source: 'checkpoint', timestamp: Date.now() })
      );
    } catch (error) {
      console.error('Failed to save checkpoint to vault:', error);
      throw error;
    }
  }

  /**
   * Get STM window from vault (recent messages)
   */
  async getSTM(threadId: string, limit = 50): Promise<any[]> {
    try {
      const stmt = db.prepare(`
        SELECT payload, ts
        FROM vault_entries 
        WHERE construct_id = ? AND thread_id = ? AND kind = 'LTM'
        ORDER BY ts DESC 
        LIMIT ?
      `);
      
      const rows = stmt.all(this.constructId, threadId, limit);
      return rows.map(row => ({
        ...JSON.parse(row.payload),
        timestamp: row.ts
      })).reverse(); // Return in chronological order
    } catch (error) {
      console.error('Failed to get STM from vault:', error);
      return [];
    }
  }

  /**
   * Search vault entries with semantic relevance
   */
  async search(options: VaultSearchOptions): Promise<VaultEntry[]> {
    try {
      let query = `
        SELECT id, construct_id, thread_id, kind, payload, ts, relevance_score, metadata
        FROM vault_entries 
        WHERE construct_id = ?
      `;
      const params: any[] = [this.constructId];
      
      if (options.threadId) {
        query += ' AND thread_id = ?';
        params.push(options.threadId);
      }
      
      if (options.kind) {
        query += ' AND kind = ?';
        params.push(options.kind);
      }
      
      if (options.minRelevanceScore !== undefined) {
        query += ' AND relevance_score >= ?';
        params.push(options.minRelevanceScore);
      }
      
      if (options.startTime) {
        query += ' AND ts >= ?';
        params.push(options.startTime);
      }
      
      if (options.endTime) {
        query += ' AND ts <= ?';
        params.push(options.endTime);
      }
      
      query += ' ORDER BY relevance_score DESC, ts DESC';
      
      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }
      
      const stmt = db.prepare(query);
      const rows = stmt.all(...params);
      
      return rows.map(row => ({
        id: row.id,
        constructId: row.construct_id,
        threadId: row.thread_id,
        kind: row.kind,
        payload: JSON.parse(row.payload),
        timestamp: row.ts,
        relevanceScore: row.relevance_score,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }));
    } catch (error) {
      console.error('Failed to search vault:', error);
      return [];
    }
  }

  /**
   * Get vault summary metadata
   */
  async getVaultSummaryMeta(): Promise<VaultSummary[]> {
    try {
      const stmt = db.prepare(`
        SELECT id, construct_id, thread_id, summary_type, content, start_ts, end_ts, created_at
        FROM vault_summaries 
        WHERE construct_id = ?
        ORDER BY created_at DESC
      `);
      
      const rows = stmt.all(this.constructId);
      
      return rows.map(row => ({
        id: row.id,
        constructId: row.construct_id,
        threadId: row.thread_id,
        summaryType: row.summary_type,
        content: row.content,
        startTs: row.start_ts,
        endTs: row.end_ts,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Failed to get vault summary metadata:', error);
      return [];
    }
  }

  /**
   * Create a vault summary
   */
  async createSummary(
    summaryType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL',
    content: string,
    startTs: number,
    endTs: number,
    threadId?: string
  ): Promise<void> {
    try {
      const stmt = db.prepare(`
        INSERT INTO vault_summaries (construct_id, thread_id, summary_type, content, start_ts, end_ts, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        this.constructId,
        threadId || null,
        summaryType,
        content,
        startTs,
        endTs,
        Date.now()
      );
    } catch (error) {
      console.error('Failed to create vault summary:', error);
      throw error;
    }
  }

  /**
   * Update relevance score for an entry
   */
  async updateRelevanceScore(entryId: number, score: number): Promise<void> {
    try {
      const stmt = db.prepare(`
        UPDATE vault_entries 
        SET relevance_score = ? 
        WHERE id = ? AND construct_id = ?
      `);
      
      stmt.run(score, entryId, this.constructId);
    } catch (error) {
      console.error('Failed to update relevance score:', error);
      throw error;
    }
  }

  /**
   * Get vault statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    entriesByKind: Record<string, number>;
    totalSummaries: number;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    try {
      // Total entries
      const totalStmt = db.prepare(`
        SELECT COUNT(*) as count FROM vault_entries WHERE construct_id = ?
      `);
      const totalResult = totalStmt.get(this.constructId);
      
      // Entries by kind
      const kindStmt = db.prepare(`
        SELECT kind, COUNT(*) as count 
        FROM vault_entries 
        WHERE construct_id = ? 
        GROUP BY kind
      `);
      const kindRows = kindStmt.all(this.constructId);
      const entriesByKind = kindRows.reduce((acc, row) => {
        acc[row.kind] = row.count;
        return acc;
      }, {} as Record<string, number>);
      
      // Total summaries
      const summaryStmt = db.prepare(`
        SELECT COUNT(*) as count FROM vault_summaries WHERE construct_id = ?
      `);
      const summaryResult = summaryStmt.get(this.constructId);
      
      // Time range
      const timeStmt = db.prepare(`
        SELECT MIN(ts) as oldest, MAX(ts) as newest 
        FROM vault_entries 
        WHERE construct_id = ?
      `);
      const timeResult = timeStmt.get(this.constructId);
      
      return {
        totalEntries: totalResult?.count ?? 0,
        entriesByKind,
        totalSummaries: summaryResult?.count ?? 0,
        oldestEntry: timeResult?.oldest,
        newestEntry: timeResult?.newest
      };
    } catch (error) {
      if (shouldLog('error')) {
        console.error('Failed to get vault stats:', error);
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
   */
  async cleanup(olderThanDays = 30): Promise<number> {
    try {
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      
      const stmt = db.prepare(`
        DELETE FROM vault_entries 
        WHERE construct_id = ? AND ts < ? AND kind = 'LTM'
      `);
      
      const result = stmt.run(this.constructId, cutoffTime);
      return result.changes;
    } catch (error) {
      console.error('Failed to cleanup vault entries:', error);
      return 0;
    }
  }
}

// Factory function to create VaultStore instances
export function createVaultStore(constructId: string): VaultStore {
  return new VaultStore(constructId);
}
