// db.ts – Database persistence layer for Chatty
// Uses browser-compatible IndexedDB via Dexie for browser, better-sqlite3 for Node.js

import { BrowserDB } from './browserDb';

// Detect environment and use appropriate database
const isBrowser = typeof window !== 'undefined';

let db: any;

if (isBrowser) {
  // Browser environment - use IndexedDB via Dexie
  db = new BrowserDB();
} else {
  // Node.js environment - use better-sqlite3
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const DB_PATH = process.env.CHATTY_DB_PATH || path.resolve('./chatty.db');
    db = new Database(DB_PATH);
  } catch (error) {
    console.warn('better-sqlite3 not available, falling back to browser DB');
    db = new BrowserDB();
  }
}

// Initialize database schema
if (!isBrowser && db.exec) {
  // Node.js environment - execute SQL schema
  db.exec(`
PRAGMA journal_mode = WAL;

-- Legacy tables (preserved for compatibility)
CREATE TABLE IF NOT EXISTS messages (
  id       INTEGER PRIMARY KEY,
  userId   TEXT    NOT NULL,
  role     TEXT    CHECK(role IN ('user','assistant')) NOT NULL,
  ts       INTEGER NOT NULL,
  text     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msgs_user_ts ON messages(userId, ts);

CREATE TABLE IF NOT EXISTS triples (
  id     INTEGER PRIMARY KEY,
  userId TEXT NOT NULL,
  s      TEXT NOT NULL,
  p      TEXT NOT NULL,
  o      TEXT NOT NULL,
  ts     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_triples_user_sp ON triples(userId, s, p);
CREATE INDEX IF NOT EXISTS idx_triples_user_ts ON triples(userId, ts);

CREATE TABLE IF NOT EXISTS persona (
  userId TEXT NOT NULL,
  k      TEXT NOT NULL,
  v      TEXT NOT NULL,
  ts     INTEGER NOT NULL,
  PRIMARY KEY (userId, k)
);

-- NEW: STM/LTM + Identity Provenance Architecture

-- Constructs: Identity-locked agents with role locks and legal provenance
CREATE TABLE IF NOT EXISTS constructs (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  role_lock_json    TEXT NOT NULL,  -- JSON defining legal role boundaries
  legal_doc_sha256  TEXT NOT NULL, -- SHA256 of legal document defining construct
  vault_pointer     TEXT,           -- Pointer to vault location
  fingerprint       TEXT NOT NULL,  -- Current fingerprint for drift detection
  is_system_shell   INTEGER DEFAULT 0, -- false for all constructs, true only for runtime like Chatty
  hosting_runtime   TEXT,           -- Runtime that hosts this construct (e.g., 'synth', 'lin') - separate from construct identity
  current_persona   TEXT,           -- Optional persona identifier
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  is_active         INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_constructs_active ON constructs(is_active);
CREATE INDEX IF NOT EXISTS idx_constructs_fingerprint ON constructs(fingerprint);

-- Threads: Conversation threads bound to constructs
CREATE TABLE IF NOT EXISTS threads (
  id           TEXT PRIMARY KEY,
  construct_id TEXT NOT NULL,
  title        TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  is_active    INTEGER DEFAULT 1,
  FOREIGN KEY (construct_id) REFERENCES constructs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_threads_construct ON threads(construct_id);
CREATE INDEX IF NOT EXISTS idx_threads_active ON threads(is_active);

-- Thread Leases: Enforce single active thread per construct
CREATE TABLE IF NOT EXISTS thread_leases (
  id           TEXT PRIMARY KEY,
  construct_id TEXT NOT NULL,
  thread_id    TEXT NOT NULL,
  lease_token  TEXT NOT NULL UNIQUE,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (construct_id) REFERENCES constructs(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_leases_construct ON thread_leases(construct_id);
CREATE INDEX IF NOT EXISTS idx_leases_token ON thread_leases(lease_token);
CREATE INDEX IF NOT EXISTS idx_leases_expires ON thread_leases(expires_at);

-- Vault Entries: LTM storage with semantic indexing
CREATE TABLE IF NOT EXISTS vault_entries (
  id           INTEGER PRIMARY KEY,
  construct_id TEXT NOT NULL,
  thread_id    TEXT,
  kind         TEXT NOT NULL,  -- 'LTM', 'SUMMARY', 'CHECKPOINT', 'CONFIG'
  payload      TEXT NOT NULL,  -- JSON payload
  ts           INTEGER NOT NULL,
  relevance_score REAL DEFAULT 0.0,
  metadata     TEXT,          -- JSON metadata for semantic search
  FOREIGN KEY (construct_id) REFERENCES constructs(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vault_construct_thread ON vault_entries(construct_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_vault_kind ON vault_entries(kind);
CREATE INDEX IF NOT EXISTS idx_vault_ts ON vault_entries(ts);
CREATE INDEX IF NOT EXISTS idx_vault_relevance ON vault_entries(relevance_score);

-- STM Buffer: In-memory sliding window (backed by SQLite for persistence)
CREATE TABLE IF NOT EXISTS stm_buffer (
  id           INTEGER PRIMARY KEY,
  construct_id TEXT NOT NULL,
  thread_id    TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  role         TEXT NOT NULL,
  content      TEXT NOT NULL,
  ts           INTEGER NOT NULL,
  sequence     INTEGER NOT NULL,  -- Order within thread
  FOREIGN KEY (construct_id) REFERENCES constructs(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stm_construct_thread ON stm_buffer(construct_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_stm_sequence ON stm_buffer(sequence);

-- Fingerprint History: Track drift detection over time
CREATE TABLE IF NOT EXISTS fingerprint_history (
  id           INTEGER PRIMARY KEY,
  construct_id TEXT NOT NULL,
  fingerprint  TEXT NOT NULL,
  drift_score  REAL DEFAULT 0.0,
  detected_at  INTEGER NOT NULL,
  metadata     TEXT,  -- JSON with drift details
  FOREIGN KEY (construct_id) REFERENCES constructs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fingerprint_construct ON fingerprint_history(construct_id);
CREATE INDEX IF NOT EXISTS idx_fingerprint_drift ON fingerprint_history(drift_score);

-- Vault Summaries: Compressed checkpoints for memory management
CREATE TABLE IF NOT EXISTS vault_summaries (
  id           INTEGER PRIMARY KEY,
  construct_id TEXT NOT NULL,
  thread_id    TEXT,
  summary_type TEXT NOT NULL,  -- 'DAILY', 'WEEKLY', 'MONTHLY', 'MANUAL'
  content      TEXT NOT NULL,
  start_ts     INTEGER NOT NULL,
  end_ts       INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (construct_id) REFERENCES constructs(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_summaries_construct ON vault_summaries(construct_id);
CREATE INDEX IF NOT EXISTS idx_summaries_type ON vault_summaries(summary_type);
CREATE INDEX IF NOT EXISTS idx_summaries_ts ON vault_summaries(start_ts, end_ts);
`);
} else {
  // Browser environment - schema is handled by Dexie
  console.log('Browser environment detected - using IndexedDB via Dexie');
}

export default db;
