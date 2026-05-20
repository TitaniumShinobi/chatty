/**
 * Canonical conversation read/write for construct-backed threads.
 * VVAULT body is the source of truth; legacy Supabase storage is not
 * canonical conversation storage.
 */

import { readConversations } from '../../vvaultConnector/readConversations.js';
import { writeTranscript } from '../../vvaultConnector/writeTranscript.js';

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function normalizeConstructBase(constructId) {
  return (constructId || '').replace(/-\d+$/, '').toLowerCase();
}

function parseHydroProjectSlug(value = '') {
  const match = value.match(/hydro-001_(.+)_hydro_chat$/i) || value.match(/instances\/hydro-001\/code\/(.+)_hydro_chat\.md$/i);
  return match ? match[1] : null;
}

function buildCanonicalFilename(conversationId, constructId) {
  const projectSlug = parseHydroProjectSlug(conversationId);
  if ((constructId || '').toLowerCase() === 'hydro-001' && projectSlug) {
    return `instances/hydro-001/code/${projectSlug}_hydro_chat.md`;
  }
  return `instances/${constructId}/chatty/chat_with_${constructId}.md`;
}

function sortMessagesByTimestamp(messages = []) {
  return messages.slice().sort((a, b) => {
    if (a?.isDateHeader && !b?.isDateHeader) return -1;
    if (!a?.isDateHeader && b?.isDateHeader) return 1;
    const aTime = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
    return aTime - bTime;
  });
}

function mergeCanonicalMessages(rows = []) {
  const merged = [];
  const seen = new Set();

  for (const row of rows) {
    const metadata = parseMetadata(row.metadata);
    const messages = Array.isArray(metadata.messages) ? metadata.messages : [];
    for (const message of messages) {
      const key = message?.isDateHeader
        ? `date:${message.content || ''}:${message.timestamp || ''}`
        : `${message.role || 'user'}:${message.timestamp || ''}:${(message.content || '').slice(0, 240)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(message);
    }
  }

  return sortMessagesByTimestamp(merged);
}

/**
 * Whether a conversation id is construct-backed (gpt-*, ai-*, or versioned construct id like zen-001).
 * @param {string} conversationId
 * @returns {boolean}
 */
export function isConstructBackedId(conversationId) {
  if (!conversationId || typeof conversationId !== 'string') return false;
  const id = conversationId.trim();
  if (/^(gpt-|ai-)/i.test(id)) return true;
  if (/^[a-z]+-\d+$/i.test(id)) return true;
  if (id.includes('_chat_with_')) return true;
  if (/^hydro-001_.+_hydro_chat$/i.test(id)) return true;
  return false;
}

/**
 * Derive construct id from conversation id (e.g. gpt-zen-001 -> zen-001, zen-001_chat_with_zen-001 -> zen-001).
 * @param {string} conversationId
 * @returns {string|null}
 */
export function constructIdFromConversationId(conversationId) {
  if (!conversationId || typeof conversationId !== 'string') return null;
  const id = conversationId.trim();
  if (/^hydro-001_.+_hydro_chat$/i.test(id)) return 'hydro-001';
  const chatWithMatch = id.match(/([a-z]+-\d+)_chat_with_[a-z]+-\d+$/i);
  if (chatWithMatch) return chatWithMatch[1];
  const prefixed = id.replace(/^(gpt-|ai-)/i, '');
  if (/^[a-z]+-\d+$/i.test(prefixed)) return prefixed;
  if (/^[a-z]+-\d+$/i.test(id)) return id;
  const base = id.replace(/^(gpt-|ai-)/i, '');
  if (base && !/-\d+$/.test(base)) return `${base}-001`;
  return prefixed || null;
}

/**
 * List canonical VVAULT-body conversations for a user. No Store merge.
 * @param {{ supabaseUserId: string, userEmail?: string }} opts
 * @returns {Promise<Array<{ _id: string, owner?: string, title: string, constructId?: string, constructName?: string, constructCallsign?: string, createdAt: string, updatedAt: string, messageCount: number, source: string }>>}
 */
export async function listCanonicalConversations({ supabaseUserId, userEmail }) {
  if (!supabaseUserId) return [];
  const conversations = await readConversations({ userEmail, supabaseUserId });
  const dedupedByConstruct = new Map();
  for (const conversation of conversations || []) {
    const constructId = conversation.constructId || conversation.constructCallsign || constructIdFromConversationId(conversation.sessionId);
    if (!constructId || !isConstructBackedId(constructId)) continue;
    const sessionId = conversation.sessionId
      || (constructId === 'hydro-001' && parseHydroProjectSlug(conversation.sessionId || '')
        ? conversation.sessionId
        : `${constructId}_chat_with_${constructId}`);
    const base = constructId === 'hydro-001' ? sessionId : normalizeConstructBase(constructId);
    if (dedupedByConstruct.has(base)) continue;
    const title =
      conversation.title ||
      conversation.constructName ||
      constructId.replace(/-\d+$/, '').replace(/^./, (char) => char.toUpperCase()) ||
      'Untitled';
    const messages = Array.isArray(conversation.messages) ? conversation.messages.filter((message) => !message?.isDateHeader) : [];
    const updatedAt = conversation.updatedAt || conversation.createdAt || new Date().toISOString();

    dedupedByConstruct.set(base, {
      _id: sessionId,
      title,
      constructId,
      constructName: conversation.constructName || title,
      constructCallsign: conversation.constructCallsign || constructId,
      createdAt: conversation.createdAt || updatedAt,
      updatedAt,
      messageCount: messages.length,
      source: conversation.persistenceSource || 'vvault-body',
    });
  }

  return Array.from(dedupedByConstruct.values()).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

/**
 * Get messages for a single canonical conversation.
 * @param {{ supabaseUserId: string, userEmail?: string, conversationId: string, constructId?: string }} opts
 * @returns {Promise<Array<{ _id: string, conversation: string, owner?: string, role: string, content: string, createdAt: string, source?: string }>>}
 */
export async function getCanonicalConversationMessages({ supabaseUserId, userEmail, conversationId, constructId }) {
  if (!supabaseUserId) return [];
  const resolvedConstructId = constructId || constructIdFromConversationId(conversationId);
  const list = await readConversations({ userEmail, supabaseUserId }, resolvedConstructId || undefined);
  if (!list || !Array.isArray(list)) return [];
  const canonicalSessionId = resolvedConstructId
    ? (resolvedConstructId === 'hydro-001' && parseHydroProjectSlug(conversationId)
      ? conversationId
      : `${resolvedConstructId}_chat_with_${resolvedConstructId}`)
    : null;
  const match = list.find((c) => c.sessionId === conversationId || c.sessionId === canonicalSessionId || c.constructId === resolvedConstructId);
  if (!match || !match.messages) return [];
  return sortMessagesByTimestamp(match.messages)
    .map((m, idx) => ({
      _id: `vvault_${conversationId}_${idx}`,
      conversation: conversationId,
      role: m.role || 'user',
      content: m.content || '',
      createdAt: m.timestamp || match.createdAt || new Date().toISOString(),
      isDateHeader: Boolean(m.isDateHeader),
      attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
      source: match.persistenceSource || 'vvault-body',
    }));
}

/**
 * Ensure a canonical conversation shell exists in the VVAULT body.
 * @param {{ supabaseUserId: string, sessionId: string, title: string, constructId: string, constructName?: string, constructCallsign?: string }} opts
 */
export async function ensureCanonicalConversation({ supabaseUserId, userEmail, sessionId, title, constructId, constructName, constructCallsign }) {
  if (!supabaseUserId || !constructId) return null;
  const normalizedCallsign = /-\d+$/.test(constructId) ? constructId : `${constructId}-001`;
  const name = constructName || normalizedCallsign.replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase());
  return writeTranscript({
    supabaseUserId,
    userEmail,
    sessionId: sessionId || `${normalizedCallsign}_chat_with_${normalizedCallsign}`,
    title: title || name,
    constructId: normalizedCallsign,
    constructName: name,
    constructCallsign: normalizedCallsign,
    role: 'system',
    content: `CONVERSATION_CREATED:${title || name}`,
    timestamp: new Date().toISOString(),
    metadata: { source: 'chatty-canonical', isPrimary: true },
  });
}

/**
 * Append user and assistant messages to the canonical conversation.
 * @param {{ supabaseUserId: string, sessionId: string, title: string, constructId: string, constructName?: string, constructCallsign?: string, userMessage: string, assistantMessage: string }} opts
 */
export async function appendCanonicalConversationMessages({
  supabaseUserId,
  userEmail,
  sessionId,
  title,
  constructId,
  constructName,
  constructCallsign,
  userMessage,
  assistantMessage,
  userMetadata = {},
  assistantMetadata = {},
}) {
  if (!supabaseUserId || !constructId) return null;
  const normalizedCallsign = /-\d+$/.test(constructId) ? constructId : `${constructId}-001`;
  const name = constructName || normalizedCallsign.replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase());
  const sid = sessionId || `${normalizedCallsign}_chat_with_${normalizedCallsign}`;
  const t = title || name;
  if (userMessage) {
    await writeTranscript({
      supabaseUserId,
      userEmail,
      sessionId: sid,
      title: t,
      constructId: normalizedCallsign,
      constructName: name,
      constructCallsign: normalizedCallsign,
      role: 'user',
      content: typeof userMessage === 'string' ? userMessage : userMessage.content || userMessage.message || '',
      timestamp: userMessage?.timestamp || new Date().toISOString(),
      metadata: { source: 'chatty-canonical', ...(userMetadata || {}) },
    });
  }
  if (assistantMessage) {
    await writeTranscript({
      supabaseUserId,
      userEmail,
      sessionId: sid,
      title: t,
      constructId: normalizedCallsign,
      constructName: name,
      constructCallsign: normalizedCallsign,
      role: 'assistant',
      content: typeof assistantMessage === 'string' ? assistantMessage : assistantMessage.content || assistantMessage.message || '',
      timestamp: assistantMessage?.timestamp || new Date().toISOString(),
      metadata: { source: 'chatty-canonical', ...(assistantMetadata || {}) },
    });
  }
  return { success: true };
}

export function buildConversationHistory(messages = []) {
  return messages
    .filter((message) => !message.isDateHeader && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({
      text: message.content || '',
      role: message.role,
      timestamp: message.createdAt ? new Date(message.createdAt).toISOString() : new Date().toISOString(),
    }));
}
