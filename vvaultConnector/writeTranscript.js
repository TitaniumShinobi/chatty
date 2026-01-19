/**
 * VVAULT writeTranscript - Supabase-backed with PostgreSQL fallback
 * 
 * Priority: Supabase (source of truth) → PostgreSQL (cache/fallback)
 * 
 * Both Chatty and VVAULT share Supabase (vault_files table), so writes here
 * are visible to VVAULT when it reads transcripts.
 */
import pg from 'pg';
import { writeConversationToSupabase } from './supabaseStore.js';

let pool = null;

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
  if (!db) return false;
  
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
    
    return true;
  } catch (error) {
    console.error('❌ [VVAULT DB] Failed to ensure table:', error.message);
    return false;
  }
}

async function writeTranscriptToPostgres(params) {
  const {
    userId,
    userEmail,
    sessionId,
    timestamp,
    role,
    content,
    title,
    constructId,
    constructName,
    constructCallsign,
    metadata
  } = params || {};

  const db = getPool();
  if (!db) {
    console.log('⚠️ [VVAULT Postgres] No database connection');
    return null;
  }

  const safeUserId = userId || userEmail || 'unknown_user';
  const safeUserEmail = userEmail || null;

  try {
    await ensureTable();

    if (content?.startsWith('CONVERSATION_CREATED:')) {
      await db.query(`
        INSERT INTO vvault_conversations (user_id, user_email, session_id, title, construct_id, construct_name, construct_callsign)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (session_id) DO UPDATE SET
          title = COALESCE(EXCLUDED.title, vvault_conversations.title),
          construct_id = COALESCE(EXCLUDED.construct_id, vvault_conversations.construct_id),
          construct_name = COALESCE(EXCLUDED.construct_name, vvault_conversations.construct_name),
          construct_callsign = COALESCE(EXCLUDED.construct_callsign, vvault_conversations.construct_callsign),
          user_id = COALESCE(EXCLUDED.user_id, vvault_conversations.user_id),
          user_email = COALESCE(EXCLUDED.user_email, vvault_conversations.user_email),
          updated_at = CURRENT_TIMESTAMP
      `, [safeUserId, safeUserEmail, sessionId, title, constructId, constructName, constructCallsign]);
      
      console.log(`✅ [VVAULT Postgres] Created conversation: ${sessionId}`);
    } else {
      await db.query(`
        INSERT INTO vvault_conversations (user_id, user_email, session_id, title, construct_id, construct_name, construct_callsign)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (session_id) DO UPDATE SET
          title = COALESCE(EXCLUDED.title, vvault_conversations.title),
          construct_id = COALESCE(EXCLUDED.construct_id, vvault_conversations.construct_id),
          construct_name = COALESCE(EXCLUDED.construct_name, vvault_conversations.construct_name),
          construct_callsign = COALESCE(EXCLUDED.construct_callsign, vvault_conversations.construct_callsign),
          user_id = COALESCE(EXCLUDED.user_id, vvault_conversations.user_id),
          user_email = COALESCE(EXCLUDED.user_email, vvault_conversations.user_email),
          updated_at = CURRENT_TIMESTAMP
      `, [safeUserId, safeUserEmail, sessionId, title || 'Untitled', constructId, constructName, constructCallsign]);

      await db.query(`
        INSERT INTO vvault_messages (session_id, role, content, timestamp, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, [sessionId, role, content, timestamp || new Date().toISOString(), JSON.stringify(metadata || {})]);
      
      console.log(`✅ [VVAULT Postgres] Appended message to: ${sessionId}`);
    }

    return { success: true, source: 'postgres' };
  } catch (error) {
    console.error('❌ [VVAULT Postgres] Write failed:', error.message);
    return null;
  }
}

async function writeTranscript(params) {
  console.log(`📝 [VVAULT] Writing transcript for session: ${params?.sessionId}`);
  
  try {
    const supabaseResult = await writeConversationToSupabase(params);
    if (supabaseResult !== null) {
      console.log(`✅ [VVAULT] Supabase write successful`);
      
      writeTranscriptToPostgres(params).catch(err => 
        console.warn(`⚠️ [VVAULT] PostgreSQL cache sync failed: ${err.message}`)
      );
      
      return supabaseResult;
    }
  } catch (err) {
    console.warn(`⚠️ [VVAULT] Supabase write failed, falling back to PostgreSQL: ${err.message}`);
  }

  const pgResult = await writeTranscriptToPostgres(params);
  if (pgResult !== null) {
    console.log(`✅ [VVAULT] PostgreSQL fallback write successful`);
    return pgResult;
  }

  console.error('❌ [VVAULT] All write targets failed');
  return { success: false };
}

async function resolveVVAULTUserId(userId, email, autoCreate = false) {
  return userId || email || null;
}

export {
  writeTranscript,
  resolveVVAULTUserId,
  getPool,
  ensureTable
};
