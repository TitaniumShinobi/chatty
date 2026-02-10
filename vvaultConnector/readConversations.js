/**
 * VVAULT readConversations - Supabase-backed with PostgreSQL fallback
 * 
 * Priority: Supabase (source of truth) → PostgreSQL (cache/fallback)
 */
import pg from 'pg';
import { readConversationsFromSupabase } from './supabaseStore.js';

let pool = null;
let tableChecked = false;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

async function ensureTable() {
  const db = getPool();
  if (!db || tableChecked) return tableChecked;
  
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS vvault_conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        user_email VARCHAR(255),
        session_id VARCHAR(255) NOT NULL,
        title VARCHAR(500),
        construct_id VARCHAR(255),
        construct_name VARCHAR(255),
        construct_callsign VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id)
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS vvault_messages (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        content TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB,
        FOREIGN KEY (session_id) REFERENCES vvault_conversations(session_id) ON DELETE CASCADE
      )
    `);
    
    tableChecked = true;
    console.log('✅ [VVAULT DB] Tables ensured');
    return true;
  } catch (error) {
    console.error('❌ [VVAULT DB] Failed to ensure table:', error.message);
    return false;
  }
}

async function readConversationsFromPostgres(userId, constructId) {
  const db = getPool();
  if (!db) {
    console.log('⚠️ [VVAULT DB] No database connection');
    return null;
  }

  const safeUserId = userId || 'unknown_user';

  try {
    await ensureTable();
    
    const result = await db.query(`
      SELECT 
        c.session_id,
        c.title,
        c.construct_id,
        c.construct_name,
        c.construct_callsign,
        c.created_at,
        c.updated_at,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'role', m.role,
              'content', m.content,
              'timestamp', m.timestamp
            ) ORDER BY m.timestamp
          ) FROM vvault_messages m WHERE m.session_id = c.session_id),
          '[]'::json
        ) as messages
      FROM vvault_conversations c
      WHERE c.user_email = $1 OR c.user_id = $1
      ORDER BY c.updated_at DESC
    `, [safeUserId]);

    const conversations = result.rows.map(row => ({
      sessionId: row.session_id,
      title: row.title,
      constructId: row.construct_id,
      constructName: row.construct_name,
      constructCallsign: row.construct_callsign,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: row.messages || []
    }));

    console.log(`📥 [VVAULT Postgres] Read ${conversations.length} conversations for user: ${userId}`);
    return conversations;
  } catch (error) {
    console.error('❌ [VVAULT Postgres] Read failed:', error.message);
    return null;
  }
}

async function readConversations(userId, constructId) {
  console.log(`📚 [VVAULT] Reading conversations for user: ${userId}, construct: ${constructId || 'all'}`);
  
  try {
    const supabaseResult = await readConversationsFromSupabase(userId, constructId);
    if (supabaseResult !== null) {
      console.log(`✅ [VVAULT] Supabase returned ${supabaseResult.length} conversations`);
      return supabaseResult;
    }
  } catch (err) {
    console.warn(`⚠️ [VVAULT] Supabase read failed, falling back to PostgreSQL: ${err.message}`);
  }

  const pgResult = await readConversationsFromPostgres(userId, constructId);
  if (pgResult !== null) {
    console.log(`✅ [VVAULT] PostgreSQL fallback returned ${pgResult.length} conversations`);
    return pgResult;
  }

  console.log('⚠️ [VVAULT] No data sources available, returning empty');
  return [];
}

export {
  readConversations,
  getPool,
  ensureTable
};
