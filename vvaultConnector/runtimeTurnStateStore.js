import { getPool, ensureTable } from './readConversations.js';
import { readConversationsFromLocalFallback } from './localConversationFallback.js';
import { normalizeRuntimeTurnState } from '../server/lib/runtimeTurnState.js';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLookupContext(userContext = {}) {
  if (typeof userContext === 'string') {
    const value = normalizeString(userContext);
    return {
      userId: value || null,
      userEmail: value.includes('@') ? value : null,
      supabaseUserId: value && !value.includes('@') ? value : null,
    };
  }
  return {
    userId: normalizeString(userContext.userId || userContext.uid || ''),
    userEmail: normalizeString(userContext.userEmail || userContext.email || ''),
    supabaseUserId: normalizeString(userContext.supabaseUserId || userContext.supabase_user_id || ''),
  };
}

function uniqueLookupKeys(userContext = {}) {
  const lookup = normalizeLookupContext(userContext);
  return Array.from(
    new Set([lookup.supabaseUserId, lookup.userEmail, lookup.userId].filter(Boolean)),
  );
}

function maybeParseMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

function toEpochMs(value) {
  const parsed = Date.parse(normalizeString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildRuntimeTurnStateCandidate(
  message = {},
  source = 'local_fallback_metadata',
  { sessionId = null, constructId = null } = {},
) {
  if (!message || message.role !== 'assistant') return null;
  const metadata = maybeParseMetadata(message.metadata);
  if (!metadata?.runtimeTurnState || typeof metadata.runtimeTurnState !== 'object') {
    return null;
  }
  const runtimeTurnState = normalizeRuntimeTurnState(metadata.runtimeTurnState, {
    sessionId,
    constructId,
    updatedAt: message.timestamp || null,
    assistantTailContent: message.content,
  });
  const expectedThreadId = normalizeString(sessionId);
  const expectedConstructId = normalizeString(constructId);
  if (
    (expectedThreadId &&
      (runtimeTurnState.canonicalThreadId || runtimeTurnState.sessionId) !== expectedThreadId) ||
    (expectedConstructId && runtimeTurnState.constructId !== expectedConstructId)
  ) {
    return null;
  }
  return {
    runtimeTurnState,
    source,
    timestamp: message.timestamp || runtimeTurnState.updatedAt || null,
    continuitySeq: Number.isFinite(runtimeTurnState?.continuitySeq)
      ? runtimeTurnState.continuitySeq
      : 0,
    updatedAtMs: toEpochMs(runtimeTurnState?.updatedAt || message.timestamp),
  };
}

function compareRuntimeTurnStateCandidates(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  if (right.continuitySeq !== left.continuitySeq) {
    return right.continuitySeq > left.continuitySeq ? right : left;
  }
  if (right.updatedAtMs !== left.updatedAtMs) {
    return right.updatedAtMs > left.updatedAtMs ? right : left;
  }
  return left;
}

function selectLatestRuntimeTurnStateCandidate(...candidates) {
  return candidates.reduce(
    (bestCandidate, candidate) => compareRuntimeTurnStateCandidates(bestCandidate, candidate),
    null,
  );
}

function runtimeTurnStateFromMessages(messages = [], { sessionId = null, constructId = null } = {}) {
  let bestCandidate = null;
  for (const message of messages) {
    bestCandidate = compareRuntimeTurnStateCandidates(
      bestCandidate,
      buildRuntimeTurnStateCandidate(message, 'local_fallback_metadata', {
        sessionId,
        constructId,
      }),
    );
  }
  return bestCandidate;
}

async function readLatestRuntimeTurnStateFromPostgres(userContext = {}, sessionId, constructId = null) {
  const db = getPool();
  if (!db || !sessionId) return null;
  const lookupKeys = uniqueLookupKeys(userContext);
  if (lookupKeys.length === 0) return null;

  try {
    const ready = await ensureTable();
    if (!ready) return null;
    const params = [sessionId, lookupKeys];
    let constructFilter = '';
    if (constructId) {
      params.push(constructId);
      constructFilter = ' AND (c.construct_id = $3 OR c.construct_callsign = $3)';
    }
    const result = await db.query(
      `
        SELECT m.metadata, m.timestamp
        FROM vvault_messages m
        JOIN vvault_conversations c ON c.session_id = m.session_id
        WHERE c.session_id = $1
          AND m.role = 'assistant'
          AND (c.user_email = ANY($2::text[]) OR c.user_id = ANY($2::text[]))
          ${constructFilter}
        ORDER BY m.timestamp DESC
        LIMIT 12
      `,
      params,
    );

    let bestCandidate = null;
    for (const row of result.rows || []) {
      bestCandidate = compareRuntimeTurnStateCandidates(
        bestCandidate,
        buildRuntimeTurnStateCandidate(
          { role: 'assistant', metadata: row.metadata, timestamp: row.timestamp },
          'postgres_message_metadata',
          { sessionId, constructId },
        ),
      );
    }
    if (bestCandidate) return bestCandidate;
  } catch (error) {
    console.warn(`⚠️ [RuntimeTurnStateStore] Postgres state read failed: ${error.message}`);
  }
  return null;
}

async function readLatestRuntimeTurnStateFromLocalFallback(userContext = {}, sessionId, constructId = null) {
  if (!sessionId) return null;
  const lookupKeys = uniqueLookupKeys(userContext);
  for (const lookupKey of lookupKeys) {
    const conversations = await readConversationsFromLocalFallback(lookupKey, constructId);
    const conversation = conversations.find((item) => item?.sessionId === sessionId);
    if (!conversation) continue;
    const found = runtimeTurnStateFromMessages(conversation.messages || [], {
      sessionId,
      constructId,
    });
    if (found) return found;
  }
  return null;
}

export async function readLatestRuntimeTurnState(userContext = {}, {
  sessionId,
  constructId = null,
  allowLocalFallback = false,
} = {}) {
  const normalizedSessionId = normalizeString(sessionId);
  if (!normalizedSessionId) return null;

  const postgresResult = await readLatestRuntimeTurnStateFromPostgres(
    userContext,
    normalizedSessionId,
    constructId,
  );
  const localFallbackResult = allowLocalFallback === false
    ? null
    : await readLatestRuntimeTurnStateFromLocalFallback(
        userContext,
        normalizedSessionId,
        constructId,
      );

  return selectLatestRuntimeTurnStateCandidate(postgresResult, localFallbackResult);
}

export const __test__ = {
  buildRuntimeTurnStateCandidate,
  compareRuntimeTurnStateCandidates,
  selectLatestRuntimeTurnStateCandidate,
  runtimeTurnStateFromMessages,
  maybeParseMetadata,
  normalizeLookupContext,
  uniqueLookupKeys,
};
