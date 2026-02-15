import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth } from '../middleware/auth.js';
import { buildEnrichedContext } from '../lib/memoryContextBuilder.js';
import { GPTManager } from '../lib/gptManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const DB_PATH = path.join(__dirname, '..', '..', 'chatty.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS selfprompt_sessions (
        construct_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        enabled INTEGER DEFAULT 0,
        interval_sec INTEGER DEFAULT 60,
        last_user_activity_at INTEGER,
        last_emission_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (construct_id, thread_id)
      )
    `);
  }
  return db;
}

function getSession(constructId, threadId) {
  const d = getDb();
  return d.prepare('SELECT * FROM selfprompt_sessions WHERE construct_id = ? AND thread_id = ?').get(constructId, threadId);
}

function upsertSession(constructId, threadId, userId, updates) {
  const d = getDb();
  const existing = getSession(constructId, threadId);
  if (existing) {
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(updates)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length > 0) {
      vals.push(constructId, threadId);
      d.prepare(`UPDATE selfprompt_sessions SET ${sets.join(', ')} WHERE construct_id = ? AND thread_id = ?`).run(...vals);
    }
  } else {
    d.prepare(`INSERT INTO selfprompt_sessions (construct_id, thread_id, user_id, enabled, interval_sec, last_user_activity_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      constructId, threadId, userId,
      updates.enabled !== undefined ? updates.enabled : 0,
      updates.interval_sec !== undefined ? updates.interval_sec : 60,
      Math.floor(Date.now() / 1000)
    );
  }
  return getSession(constructId, threadId);
}

function recordUserActivity(constructId, threadId) {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.prepare(`UPDATE selfprompt_sessions SET last_user_activity_at = ? WHERE construct_id = ? AND thread_id = ?`).run(now, constructId, threadId);
}

function getEnabledSessions() {
  const d = getDb();
  return d.prepare('SELECT * FROM selfprompt_sessions WHERE enabled = 1').all();
}

function recordEmission(constructId, threadId) {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.prepare(`UPDATE selfprompt_sessions SET last_emission_at = ? WHERE construct_id = ? AND thread_id = ?`).run(now, constructId, threadId);
}

router.post('/', requireAuth, (req, res) => {
  const userId = req.user?.id || req.user?.sub;
  if (!userId) return res.status(401).json({ ok: false, error: 'Not authenticated' });

  const { action, constructId, threadId, interval } = req.body;
  if (!constructId || !threadId) {
    return res.status(400).json({ ok: false, error: 'Missing constructId or threadId' });
  }

  try {
    switch (action) {
      case 'status': {
        const session = getSession(constructId, threadId);
        if (!session) {
          return res.json({
            ok: true,
            status: 'off',
            enabled: false,
            interval_sec: 60,
            message: `selfprompt is OFF for ${constructId}. Use /selfprompt on to enable.`
          });
        }
        return res.json({
          ok: true,
          status: session.enabled ? 'on' : 'off',
          enabled: !!session.enabled,
          interval_sec: session.interval_sec,
          last_user_activity_at: session.last_user_activity_at,
          last_emission_at: session.last_emission_at,
          message: `selfprompt is ${session.enabled ? 'ON' : 'OFF'} (interval: ${session.interval_sec}s)`
        });
      }

      case 'on': {
        const session = upsertSession(constructId, threadId, userId, {
          enabled: 1,
          last_user_activity_at: Math.floor(Date.now() / 1000)
        });
        return res.json({
          ok: true,
          status: 'on',
          enabled: true,
          interval_sec: session.interval_sec,
          message: `selfprompt enabled for ${constructId} (interval: ${session.interval_sec}s). Proactive messages will appear after ${session.interval_sec}s of inactivity.`
        });
      }

      case 'off': {
        upsertSession(constructId, threadId, userId, { enabled: 0 });
        return res.json({
          ok: true,
          status: 'off',
          enabled: false,
          message: `selfprompt disabled for ${constructId}. No more proactive messages.`
        });
      }

      case 'interval': {
        let sec = parseInt(interval, 10);
        if (isNaN(sec)) {
          return res.status(400).json({ ok: false, error: 'interval must be a number (seconds)' });
        }
        sec = Math.max(15, Math.min(300, sec));
        const session = upsertSession(constructId, threadId, userId, { interval_sec: sec });
        return res.json({
          ok: true,
          status: session.enabled ? 'on' : 'off',
          enabled: !!session.enabled,
          interval_sec: sec,
          message: `selfprompt interval set to ${sec}s (clamped 15–300).`
        });
      }

      default:
        return res.status(400).json({
          ok: false,
          error: `Unknown action: ${action}. Use status, on, off, or interval.`
        });
    }
  } catch (err) {
    console.error('[Selfprompt] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/pending', requireAuth, (req, res) => {
  const { constructId, threadId, since } = req.query;
  if (!constructId || !threadId) {
    return res.status(400).json({ ok: false, error: 'Missing constructId or threadId' });
  }
  try {
    const d = getDb();
    d.exec(`CREATE TABLE IF NOT EXISTS selfprompt_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      construct_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      role TEXT DEFAULT 'assistant',
      content TEXT,
      tool_trace TEXT,
      source TEXT,
      model TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    const sinceTs = since || '1970-01-01T00:00:00Z';
    const rows = d.prepare(
      'SELECT * FROM selfprompt_messages WHERE construct_id = ? AND thread_id = ? AND created_at > ? ORDER BY created_at ASC'
    ).all(constructId, threadId, sinceTs);

    return res.json({
      ok: true,
      messages: rows.map(r => ({
        id: `selfprompt-${r.id}`,
        role: r.role,
        text: r.content,
        content: r.content,
        timestamp: r.created_at,
        tool_trace: r.tool_trace ? JSON.parse(r.tool_trace) : [],
        source: r.source,
        model: r.model,
        selfprompt: true,
        packets: [{ type: 'text', payload: { content: r.content } }]
      }))
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/activity', requireAuth, (req, res) => {
  const { constructId, threadId } = req.body;
  if (!constructId || !threadId) {
    return res.status(400).json({ ok: false, error: 'Missing constructId or threadId' });
  }
  try {
    recordUserActivity(constructId, threadId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export {
  getDb as getSelfpromptDb,
  getSession,
  upsertSession,
  recordUserActivity,
  getEnabledSessions,
  recordEmission
};

export default router;
