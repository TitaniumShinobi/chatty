/**
 * VVAULT writeTranscript - VVAULT-body first.
 *
 * Priority: VVAULT API → VVAULT/Postgres cache → local deferred fallback.
 * Supabase transcript writes are retired and are not a fallback path.
 */
import pg from 'pg';
import * as vvaultApi from './vvaultApiClient.js';
import { writeConversationToLocalFallback } from './localConversationFallback.js';

let pool = null;
const _vvaultUserIdCache = new Map();
const VVAULT_USER_CACHE_TTL = 5 * 60 * 1000;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

function normalizeConstructCallsign(constructCallsign, constructId) {
  let normalizedConstructId = constructCallsign || constructId || 'zen-001';
  if (normalizedConstructId !== 'unknown' && !/\-\d{3}$/.test(normalizedConstructId)) {
    normalizedConstructId = `${normalizedConstructId}-001`;
  }
  return normalizedConstructId;
}

function legacySupabaseWritesEnabled() {
  return false;
}

const CANONICAL_VVAULT_BODY_RECEIPT = {
  source: 'vvault_body',
  writePath: 'vvault-api',
  persistenceOwner: 'vvault_body',
  canonicalTarget: 'vvault_body_transcripts',
  canonicalTargetTable: 'ovvaults.transcripts',
  canonicalWritePath: 'vvault_api:/api/chatty/transcript/:constructId/message',
  fallbackUsed: false,
};

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

  // Normalize constructId to callsign format (e.g., "katana" → "katana-001")
  let normalizedId = constructCallsign || constructId || 'unknown';
  if (normalizedId !== 'unknown' && !/\-\d{3}$/.test(normalizedId)) {
    normalizedId = `${normalizedId}-001`;
  }

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
      `, [safeUserId, safeUserEmail, sessionId, title, normalizedId, constructName, normalizedId]);
      
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
      `, [safeUserId, safeUserEmail, sessionId, title || 'Untitled', normalizedId, constructName, normalizedId]);

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

  const requireVvaultBodySuccess = params?.requireVvaultBodySuccess === true;

  if (params?.preferDirectSupabase === true || params?.requireCanonicalSupabaseSuccess === true) {
    console.warn('⚠️ [VVAULT] Ignoring legacy direct-Supabase transcript flags; VVAULT body remains canonical');
  }

  const apiResult = await writeTranscriptViaVvaultApi(params);
  if (apiResult !== null) {
    return apiResult;
  }

  if (requireVvaultBodySuccess) {
    console.error('❌ [VVAULT] Required VVAULT body write failed before fallback; canonical persistence blocked');
    return {
      success: false,
      source: 'vvault-api',
      reason: 'vvault_body_write_unavailable',
      canonicalTarget: 'vvault_body_transcripts',
    };
  }

  const pgResult = await writeTranscriptToPostgres(params);
  if (pgResult !== null) {
    console.log(`✅ [VVAULT] VVAULT/PostgreSQL write successful`);
    return pgResult;
  }

  const localResult = await writeConversationToLocalFallback(params);
  if (localResult !== null) {
    console.warn('⚠️ [VVAULT] Remote write targets failed; using local deferred fallback');
    return localResult;
  }

  console.error('❌ [VVAULT] All write targets failed');
  return { success: false };
}

async function writeTranscriptViaVvaultApi(params) {
  if (!vvaultApi.getBaseUrl()) {
    return null;
  }

  const {
    constructId,
    constructCallsign,
    role,
    content,
    timestamp,
    userEmail,
    userId,
    supabaseUserId,
    metadata = {},
  } = params || {};
  const normalizedConstructId = normalizeConstructCallsign(constructCallsign, constructId);
  const contentStr = typeof content === 'string' ? content : '';
  const isConversationCreated = contentStr.startsWith('CONVERSATION_CREATED:');
  const userHeader = userEmail || (String(userId || '').includes('@') ? userId : null);
  const hasVvaultAuthContext = Boolean(userHeader || supabaseUserId || process.env.VVAULT_SERVICE_TOKEN);

  if (!hasVvaultAuthContext) {
    return null;
  }

  try {
    if (isConversationCreated) {
      const transcript = await vvaultApi.getTranscript(normalizedConstructId, {
        userEmail: userHeader,
        supabaseUserId,
      });
      if (transcript?.success) {
        console.log(`✅ [VVAULT] VVAULT API ensured transcript for ${normalizedConstructId}`);
        return {
          success: true,
          ...CANONICAL_VVAULT_BODY_RECEIPT,
          action: transcript.created ? 'created' : 'ensured',
          threadId: transcript.thread_id || null,
        };
      }
      return null;
    }

    const hasAttachments = Array.isArray(metadata?.attachments) && metadata.attachments.length > 0;
    if (!contentStr.trim() && !hasAttachments) {
      return null;
    }

    let appendResult = await vvaultApi.appendMessage({
      constructId: normalizedConstructId,
      role,
      content: contentStr,
      name: metadata?.userName,
      timestamp,
      userEmail: userHeader,
      supabaseUserId,
      metadata,
      attachments: metadata?.attachments,
      projectName: metadata?.projectName,
      rootPath: metadata?.rootPath,
    });

    if (!appendResult && normalizedConstructId === 'zen-001') {
      const hydrated = await vvaultApi.getTranscript(normalizedConstructId, {
        userEmail: userHeader,
        supabaseUserId,
      });
      if (hydrated?.success) {
        appendResult = await vvaultApi.appendMessage({
          constructId: normalizedConstructId,
          role,
          content: contentStr,
          name: metadata?.userName,
          timestamp,
          userEmail: userHeader,
          supabaseUserId,
          metadata,
          attachments: metadata?.attachments,
          projectName: metadata?.projectName,
          rootPath: metadata?.rootPath,
        });
      }
    }

    if (appendResult?.success) {
      console.log(`✅ [VVAULT] VVAULT API appended transcript message for ${normalizedConstructId}`);
      return {
        success: true,
        ...CANONICAL_VVAULT_BODY_RECEIPT,
        action: appendResult.action || 'appended',
        threadId: appendResult.thread_id || null,
      };
    }
  } catch (error) {
    console.warn(`⚠️ [VVAULT] VVAULT API write failed, falling back: ${error.message}`);
  }

  return null;
}

async function resolveVVAULTUserId(userId, email, autoCreate = false) {
  const cacheKey = email || userId;
  if (cacheKey) {
    const cached = _vvaultUserIdCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < VVAULT_USER_CACHE_TTL) {
      console.log(`⚡ [resolveVVAULTUserId] Cache hit for ${cacheKey} → ${cached.id}`);
      return cached.id;
    }
  }

  try {
    const { resolveSupabaseUserId } = await import('../server/auth/lib/supabaseUserResolver.js');
    const { supabaseUserId } = await resolveSupabaseUserId({
      email: email || null,
      chattyUserId: userId || null,
    });
    if (supabaseUserId) {
      console.log(`✅ [resolveVVAULTUserId] Auth resolver mapped ${cacheKey} → ${supabaseUserId}`);
      _vvaultUserIdCache.set(cacheKey, { id: supabaseUserId, ts: Date.now() });
      return supabaseUserId;
    }
  } catch (err) {
    console.warn(`⚠️ [resolveVVAULTUserId] Supabase lookup failed: ${err.message}`);
  }

  return userId || email || null;
}

export {
  writeTranscript,
  resolveVVAULTUserId,
  legacySupabaseWritesEnabled,
  getPool,
  ensureTable
};
