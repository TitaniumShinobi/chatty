/**
 * VVAULT readConversations - VVAULT-body first.
 *
 * Priority: VVAULT API → VVAULT/Postgres cache → local deferred fallback.
 * Supabase transcript reads are retired and are not a fallback path.
 */
import pg from 'pg';
import * as vvaultApi from './vvaultApiClient.js';
import { readConversationsFromLocalFallback } from './localConversationFallback.js';

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

function legacySupabaseReadsEnabled() {
  return false;
}

function normalizeUserLookupContext(userEmailOrId) {
  if (userEmailOrId && typeof userEmailOrId === 'object' && !Array.isArray(userEmailOrId)) {
    const userEmail = userEmailOrId.userEmail || userEmailOrId.email || null;
    const supabaseUserId = userEmailOrId.supabaseUserId || userEmailOrId.supabase_user_id || null;
    const userId = userEmailOrId.userId || userEmailOrId.uid || userEmail || supabaseUserId || null;
    return {
      userId,
      userEmail,
      supabaseUserId,
      primaryLookupId: supabaseUserId || userEmail || userId,
    };
  }

  const value = userEmailOrId || null;
  const isEmail = typeof value === 'string' && value.includes('@');
  return {
    userId: value,
    userEmail: isEmail ? value : null,
    supabaseUserId: isEmail ? null : value,
    primaryLookupId: value,
  };
}

function selectFreshestTranscriptMessages(transcriptData = {}) {
  const apiMessages = Array.isArray(transcriptData.messages) ? transcriptData.messages : [];
  const parsedMessages = vvaultApi.parseMarkdownToMessages(transcriptData.content || '');

  if (apiMessages.length === 0) return parsedMessages;
  if (parsedMessages.length === 0) return apiMessages;
  if (parsedMessages.length > apiMessages.length) return parsedMessages;

  const apiLastTimestamp = Date.parse(apiMessages[apiMessages.length - 1]?.timestamp || '');
  const parsedLastTimestamp = Date.parse(parsedMessages[parsedMessages.length - 1]?.timestamp || '');
  if (Number.isFinite(parsedLastTimestamp) && (!Number.isFinite(apiLastTimestamp) || parsedLastTimestamp > apiLastTimestamp)) {
    return parsedMessages;
  }

  return apiMessages;
}

function conversationFromTranscript(constructId, transcriptData = {}) {
  const normalizedConstructId = constructId || transcriptData.construct_id || transcriptData.constructId;
  if (!normalizedConstructId) return null;
  const sessionId =
    transcriptData.session_id ||
    transcriptData.thread_id ||
    `${normalizedConstructId}_chat_with_${normalizedConstructId}`;
  const title = normalizedConstructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase());
  const rawMessages = selectFreshestTranscriptMessages(transcriptData);

  return {
    sessionId,
    title,
    constructId: normalizedConstructId,
    constructName: title,
    constructCallsign: normalizedConstructId,
    createdAt: transcriptData.created_at || transcriptData.updated_at || new Date().toISOString(),
    updatedAt: transcriptData.updated_at || transcriptData.created_at || new Date().toISOString(),
    messages: rawMessages,
    persistenceSource: 'vvault-api',
  };
}

async function readConversationsFromVvaultApi(userId, constructId = null) {
  if (!vvaultApi.getBaseUrl()) {
    return null;
  }

  const lookup = normalizeUserLookupContext(userId);
  const serviceUserContext = {
    userEmail: lookup.userEmail,
    supabaseUserId: lookup.supabaseUserId,
  };

  if (!serviceUserContext.userEmail) {
    console.log('⚠️ [VVAULT] API read requires an email-bearing user context');
    return null;
  }

  try {
    if (constructId) {
      const transcript = await vvaultApi.getTranscript(constructId, serviceUserContext);
      if (!transcript?.success) return null;
      const conversation = conversationFromTranscript(constructId, transcript);
      return conversation ? [conversation] : null;
    }

    const constructs = await vvaultApi.listConstructs(serviceUserContext);
    if (constructs === null) return null;
    if (constructs.length === 0) return [];

    const conversations = [];
    const seen = new Set();
    for (const construct of constructs) {
      const id = construct.construct_id || construct.constructId || construct.callsign;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const transcript = await vvaultApi.getTranscript(id, serviceUserContext);
      if (!transcript?.success) continue;
      const conversation = conversationFromTranscript(id, transcript);
      if (conversation) conversations.push(conversation);
    }
    return conversations.length > 0 ? conversations : [];
  } catch (error) {
    console.warn(`⚠️ [VVAULT] API read failed: ${error.message}`);
    return null;
  }
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

  const safeUserId =
    userId && typeof userId === 'object'
      ? userId.supabaseUserId || userId.userEmail || userId.userId || userId.email || 'unknown_user'
      : userId || 'unknown_user';

  try {
    await ensureTable();
    const queryParams = [safeUserId];
    let constructFilter = '';
    if (constructId) {
      queryParams.push(constructId, `${constructId}_chat_with_${constructId}`);
      constructFilter = `
        AND (
          c.construct_id = $2
          OR c.construct_callsign = $2
          OR c.session_id = $3
        )
      `;
    }
    
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
              'timestamp', m.timestamp,
              'metadata', m.metadata
            ) ORDER BY m.timestamp
          ) FROM vvault_messages m WHERE m.session_id = c.session_id),
          '[]'::json
        ) as messages
      FROM vvault_conversations c
      WHERE (c.user_email = $1 OR c.user_id = $1)
      ${constructFilter}
      ORDER BY c.updated_at DESC
    `, queryParams);

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

async function readConversations(userId, constructId, options = {}) {
  const allowLocalFallback = options?.allowLocalFallback !== false;
  const logUser =
    userId && typeof userId === 'object'
      ? userId.userEmail || userId.supabaseUserId || userId.userId || userId.email
      : userId;
  const fallbackUser =
    userId && typeof userId === 'object'
      ? userId.supabaseUserId || userId.userEmail || userId.userId || userId.email
      : userId;
  console.log(`📚 [VVAULT] Reading conversations for user: ${logUser}, construct: ${constructId || 'all'}`);

  const apiResult = await readConversationsFromVvaultApi(userId, constructId);
  if (apiResult !== null) {
    console.log(`✅ [VVAULT] VVAULT API returned ${apiResult.length} conversations`);
    return apiResult;
  }

  const pgResult = await readConversationsFromPostgres(userId, constructId);
  if (pgResult !== null) {
    console.log(`✅ [VVAULT] VVAULT/PostgreSQL returned ${pgResult.length} conversations`);
    return pgResult;
  }

  if (allowLocalFallback) {
    const localResult = await readConversationsFromLocalFallback(fallbackUser, constructId);
    if (localResult.length > 0) {
      console.log(`✅ [VVAULT] Local deferred fallback returned ${localResult.length} conversations`);
      return localResult;
    }
  } else {
    console.log('⚠️ [VVAULT] Local deferred fallback disabled for canonical read');
  }

  console.log('⚠️ [VVAULT] No data sources available, returning empty');
  return [];
}

export {
  readConversations,
  readConversationsFromVvaultApi,
  legacySupabaseReadsEnabled,
  getPool,
  ensureTable
};
