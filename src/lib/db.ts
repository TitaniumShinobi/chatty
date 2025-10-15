// db.ts – SQLite persistence layer for Chatty
// Uses better-sqlite3 (synchronous, zero-dependency native bindings)

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.CHATTY_DB_PATH || path.resolve('./chatty.db');

// `better-sqlite3` provides a synchronous constructor returning a Database
// instance that already exposes `prepare().run/all/get` methods, so no custom
// shim is required.
const db = new Database(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
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
`);

export default db;
