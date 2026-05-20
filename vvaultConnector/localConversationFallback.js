import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const STORE_VERSION = 1;
const DEFAULT_STORE_DIR = os.homedir()
  ? path.join(os.homedir(), 'Library', 'Application Support', 'Chatty')
  : os.tmpdir();
const DEFAULT_STORE_PATH = path.join(DEFAULT_STORE_DIR, 'vvault-local-conversations.json');
const LEGACY_TMP_STORE_PATH = path.join(os.tmpdir(), 'chatty-vvault-local-conversations.json');

let writeQueue = Promise.resolve();

function getStorePath() {
  return process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH || DEFAULT_STORE_PATH;
}

function hasExplicitStorePath() {
  return Boolean(process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeConstructCallsign(constructCallsign, constructId) {
  let normalized = normalizeString(constructCallsign) || normalizeString(constructId) || 'unknown';
  if (normalized !== 'unknown' && !/-\d{3}$/.test(normalized)) {
    normalized = `${normalized}-001`;
  }
  return normalized;
}

function defaultSessionIdForConstruct(constructId) {
  return `${constructId}_chat_with_${constructId}`;
}

function buildOwnerKeys({ userId, userEmail, supabaseUserId }) {
  return Array.from(
    new Set(
      [supabaseUserId, userEmail, userId]
        .map(normalizeString)
        .filter(Boolean)
    )
  );
}

function hasOwnerKey(conversation, lookupId) {
  const lookupKey = normalizeKey(lookupId);
  if (!lookupKey) return false;
  return (conversation.ownerKeys || []).some((key) => normalizeKey(key) === lookupKey);
}

function normalizeMessage(params, sessionId, existingMessages) {
  const {
    role = 'user',
    content = '',
    timestamp,
    metadata = {},
  } = params || {};
  const contentStr = typeof content === 'string' ? content : String(content ?? '');
  const attachments = Array.isArray(metadata?.attachments) ? metadata.attachments : [];
  if (!contentStr.trim() && attachments.length === 0) {
    return null;
  }

  const message = {
    id: `${sessionId}_msg_${(existingMessages || []).filter((item) => !item?.isDateHeader).length}`,
    role,
    content: contentStr,
    timestamp: timestamp || new Date().toISOString(),
  };

  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
    message.metadata = metadata;
  }
  if (attachments.length > 0) {
    message.attachments = attachments;
  }

  return message;
}

function messageFingerprint(message = {}) {
  const role = message.role || 'user';
  const timestamp = message.timestamp || '';
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  const runtimeTurnState = message?.metadata?.runtimeTurnState || null;
  const runtimeTurnIdentity = runtimeTurnState && typeof runtimeTurnState === 'object'
    ? `${runtimeTurnState.assistantTurnId || ''}:${runtimeTurnState.continuitySeq || ''}`
    : '';
  const relayIdentity = message?.metadata?.relayTurnDigest
    || message?.metadata?.relayBatchId
    || '';
  const attachmentNames = Array.isArray(message.attachments)
    ? message.attachments
        .map((attachment) => attachment?.storagePath || attachment?.filename || attachment?.name || '')
        .filter(Boolean)
        .join('|')
    : '';
  return `${role}:${timestamp}:${content}:${attachmentNames}:${runtimeTurnIdentity}:${relayIdentity}`;
}

function parseStore(raw) {
  const parsed = JSON.parse(raw);
  return {
    version: STORE_VERSION,
    conversations: Array.isArray(parsed?.conversations) ? parsed.conversations : [],
  };
}

async function readStoreFromPath(storePath) {
  const raw = await fs.readFile(storePath, 'utf8');
  return parseStore(raw);
}

async function readStore() {
  const storePath = getStorePath();
  try {
    return await readStoreFromPath(storePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (!hasExplicitStorePath() && storePath !== LEGACY_TMP_STORE_PATH) {
        try {
          const legacyStore = await readStoreFromPath(LEGACY_TMP_STORE_PATH);
          if (legacyStore.conversations.length > 0) {
            await writeStore(legacyStore);
            console.log(
              `✅ [VVAULT LocalFallback] Migrated ${legacyStore.conversations.length} local deferred conversations to durable app storage`
            );
          }
          return legacyStore;
        } catch (legacyError) {
          if (legacyError?.code !== 'ENOENT') {
            console.warn(`⚠️ [VVAULT LocalFallback] Failed to read legacy fallback store: ${legacyError.message}`);
          }
        }
      }
      return { version: STORE_VERSION, conversations: [] };
    }
    console.warn(`⚠️ [VVAULT LocalFallback] Failed to read local fallback store: ${error.message}`);
    return { version: STORE_VERSION, conversations: [] };
  }
}

async function writeStore(store) {
  const storePath = getStorePath();
  const dir = path.dirname(storePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(
    tempPath,
    `${JSON.stringify({ version: STORE_VERSION, conversations: store.conversations || [] }, null, 2)}\n`,
    'utf8'
  );
  await fs.rename(tempPath, storePath);
}

async function writeConversationUnsafe(params = {}) {
  const normalizedConstructId = normalizeConstructCallsign(params.constructCallsign, params.constructId);
  const sessionId =
    normalizeString(params.sessionId) || defaultSessionIdForConstruct(normalizedConstructId);
  const ownerKeys = buildOwnerKeys(params);
  if (ownerKeys.length === 0) {
    console.warn(`⚠️ [VVAULT LocalFallback] Skipping local write for ${sessionId}: no owner key`);
    return null;
  }

  const now = new Date().toISOString();
  const store = await readStore();
  const conversations = Array.isArray(store.conversations) ? store.conversations : [];
  const existingIndex = conversations.findIndex(
    (conversation) =>
      conversation?.sessionId === sessionId &&
      ownerKeys.some((key) => hasOwnerKey(conversation, key))
  );
  const existing = existingIndex >= 0 ? conversations[existingIndex] : null;
  const existingMessages = Array.isArray(existing?.messages) ? existing.messages.slice() : [];
  const contentStr = typeof params.content === 'string' ? params.content : String(params.content ?? '');
  const isConversationCreated = contentStr.startsWith('CONVERSATION_CREATED:');
  const nextMessages = existingMessages.slice();
  const nextMessage = isConversationCreated ? null : normalizeMessage(params, sessionId, nextMessages);

  if (nextMessage) {
    const duplicate = nextMessages.some(
      (message) => !message?.isDateHeader && messageFingerprint(message) === messageFingerprint(nextMessage)
    );
    if (!duplicate) {
      nextMessages.push(nextMessage);
    }
  }

  const title =
    normalizeString(params.title) ||
    normalizeString(existing?.title) ||
    normalizeString(params.constructName) ||
    normalizedConstructId.replace(/-\d+$/, '').replace(/^./, (value) => value.toUpperCase()) ||
    'Conversation';

  const record = {
    ...(existing || {}),
    sessionId,
    title,
    constructId: normalizedConstructId,
    constructName: normalizeString(params.constructName) || existing?.constructName || title,
    constructCallsign: normalizedConstructId,
    userId: normalizeString(params.userId) || existing?.userId || null,
    userEmail: normalizeString(params.userEmail) || existing?.userEmail || null,
    supabaseUserId: normalizeString(params.supabaseUserId) || existing?.supabaseUserId || null,
    ownerKeys: Array.from(new Set([...(existing?.ownerKeys || []), ...ownerKeys])),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    messages: nextMessages,
    localFallback: true,
    persistenceSource: 'local-deferred',
    syncStatus: 'pending-remote',
  };

  if (existingIndex >= 0) {
    conversations[existingIndex] = record;
  } else {
    conversations.push(record);
  }

  store.conversations = conversations;
  await writeStore(store);
  console.log(`✅ [VVAULT LocalFallback] Stored local deferred conversation: ${sessionId}`);
  return { success: true, source: 'local-fallback', sessionId };
}

export async function writeConversationToLocalFallback(params = {}) {
  writeQueue = writeQueue
    .catch(() => null)
    .then(() => writeConversationUnsafe(params));
  return writeQueue;
}

export async function readConversationsFromLocalFallback(userIdOrEmail, constructId = null) {
  const store = await readStore();
  const requestedConstructId = constructId
    ? normalizeConstructCallsign(constructId, constructId)
    : null;
  const rows = (store.conversations || [])
    .filter((conversation) => hasOwnerKey(conversation, userIdOrEmail))
    .filter((conversation) =>
      requestedConstructId ? conversation.constructId === requestedConstructId : true
    )
    .map((conversation) => ({
      sessionId: conversation.sessionId,
      title: conversation.title || 'Conversation',
      constructId: conversation.constructId || conversation.constructCallsign || null,
      constructName: conversation.constructName || conversation.title || null,
      constructCallsign: conversation.constructCallsign || conversation.constructId || null,
      createdAt: conversation.createdAt || conversation.updatedAt || new Date().toISOString(),
      updatedAt: conversation.updatedAt || conversation.createdAt || new Date().toISOString(),
      messages: Array.isArray(conversation.messages) ? conversation.messages : [],
      localFallback: true,
      persistenceSource: conversation.persistenceSource || 'local-deferred',
      syncStatus: conversation.syncStatus || 'pending-remote',
    }))
    .sort((a, b) => {
      const aTs = new Date(a.updatedAt || 0).getTime();
      const bTs = new Date(b.updatedAt || 0).getTime();
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    });

  if (rows.length > 0) {
    console.log(`📥 [VVAULT LocalFallback] Read ${rows.length} local deferred conversations`);
  }
  return rows;
}

export function getLocalConversationFallbackPath() {
  return getStorePath();
}
