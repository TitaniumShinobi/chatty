// Browser-compatible database layer using Dexie (IndexedDB)
// Provides SQLite-like interface for the browser environment

import Dexie, { Table } from 'dexie';
import { shouldLog } from './verbosity';

// Database schema definitions
export interface Construct {
  id: string;
  name: string;
  description?: string;
  roleLockJson: string;
  legalDocSha256: string;
  vaultPointer?: string;
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
  isActive: number;
}

export interface Thread {
  id: string;
  constructId: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  isActive: number;
}

export interface ThreadLease {
  id: string;
  constructId: string;
  threadId: string;
  leaseToken: string;
  expiresAt: number;
  createdAt: number;
}

export interface VaultEntry {
  id?: number;
  constructId: string;
  threadId?: string;
  kind: string;
  payload: string;
  ts: number;
  relevanceScore: number;
  metadata?: string;
}

export interface STMBufferEntry {
  id?: number;
  constructId: string;
  threadId: string;
  messageId: string;
  role: string;
  content: string;
  ts: number;
  sequence: number;
}

export interface FingerprintHistory {
  id?: number;
  constructId: string;
  fingerprint: string;
  driftScore: number;
  detectedAt: number;
  metadata?: string;
}

export interface VaultSummary {
  id?: number;
  constructId: string;
  threadId?: string;
  summaryType: string;
  content: string;
  startTs: number;
  endTs: number;
  createdAt: number;
}

// Legacy tables for compatibility
export interface Message {
  id: number;
  userId: string;
  role: string;
  ts: number;
  text: string;
}

export interface Triple {
  id: number;
  userId: string;
  s: string;
  p: string;
  o: string;
  ts: number;
}

export interface Persona {
  userId: string;
  k: string;
  v: string;
  ts: number;
}

class ChattyDatabase extends Dexie {
  // Legacy tables
  messages!: Table<Message>;
  triples!: Table<Triple>;
  persona!: Table<Persona>;

  // New STM/LTM + Identity Provenance tables
  constructs!: Table<Construct>;
  threads!: Table<Thread>;
  threadLeases!: Table<ThreadLease>;
  /**
   * @deprecated vaultEntries table is deprecated. All construct memories are now stored in VVAULT ChromaDB via /api/vvault/identity/store.
   * This table should not be used for new code. Existing data should be migrated to VVAULT.
   * Migration: Use VVAULT API endpoints instead of this table.
   */
  vaultEntries!: Table<VaultEntry>;
  /**
   * @deprecated stmBuffer table is deprecated. All construct memories are now stored in VVAULT ChromaDB via /api/vvault/identity/store.
   * This table should not be used for new code. Existing data should be migrated to VVAULT.
   * Migration: Use VVAULT API endpoints instead of this table.
   */
  stmBuffer!: Table<STMBufferEntry>;
  fingerprintHistory!: Table<FingerprintHistory>;
  vaultSummaries!: Table<VaultSummary>;

  constructor() {
    super('ChattyDatabase');
    
    this.version(1).stores({
      // Legacy tables
      messages: '++id, userId, ts',
      triples: '++id, userId, s, p, ts',
      persona: 'userId, k, ts',
      
      // New tables
      constructs: 'id, isActive, fingerprint',
      threads: 'id, constructId, isActive',
      threadLeases: 'id, constructId, leaseToken, expiresAt',
      vaultEntries: '++id, constructId, threadId, kind, ts, relevanceScore',
      stmBuffer: '++id, constructId, threadId, sequence',
      fingerprintHistory: '++id, constructId, driftScore, detectedAt',
      vaultSummaries: '++id, constructId, threadId, summaryType, startTs, endTs'
    });
  }
}

// Create database instance
const db = new ChattyDatabase();

// Browser-compatible database interface that mimics better-sqlite3
export class BrowserDB {
  private db: ChattyDatabase;

  constructor() {
    this.db = db;
  }

  // Execute SQL-like operations (converted to Dexie operations)
  exec(sql: string): void {
    // For browser compatibility, we'll implement key operations
    // This is a simplified implementation - in production you'd want more sophisticated SQL parsing
    if (shouldLog('debug')) {
      console.log('BrowserDB.exec called with:', sql);
    }
  }

  // Prepare statements (simplified for browser)
  prepare(sql: string) {
    return {
      run: (...params: any[]) => {
        if (shouldLog('debug')) {
          console.log('BrowserDB.prepare.run called with:', sql, params);
        }
        return { changes: 1 };
      },
      all: (...params: any[]) => {
        if (shouldLog('debug')) {
          console.log('BrowserDB.prepare.all called with:', sql, params);
        }
        return [];
      },
      get: (...params: any[]) => {
        if (shouldLog('debug')) {
          console.log('BrowserDB.prepare.get called with:', sql, params);
        }
        return null;
      }
    };
  }

  // Direct table access methods
  get constructs() { return this.db.constructs; }
  get threads() { return this.db.threads; }
  get threadLeases() { return this.db.threadLeases; }
  /**
   * @deprecated vaultEntries table is deprecated. Use VVAULT API instead.
   * Accessing this table will log a deprecation warning.
   */
  get vaultEntries() {
    console.warn('⚠️ [BrowserDB] vaultEntries table is deprecated. All construct memories should use VVAULT API (/api/vvault/identity/store).');
    return this.db.vaultEntries;
  }
  /**
   * @deprecated stmBuffer table is deprecated. Use VVAULT API instead.
   * Accessing this table will log a deprecation warning.
   */
  get stmBuffer() {
    console.warn('⚠️ [BrowserDB] stmBuffer table is deprecated. All construct memories should use VVAULT API (/api/vvault/identity/store).');
    return this.db.stmBuffer;
  }
  get fingerprintHistory() { return this.db.fingerprintHistory; }
  get vaultSummaries() { return this.db.vaultSummaries; }
  get messages() { return this.db.messages; }
  get triples() { return this.db.triples; }
  get persona() { return this.db.persona; }
}

// Export browser-compatible database instance
export default new BrowserDB();
