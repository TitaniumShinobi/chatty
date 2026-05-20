/**
 * Supabase Store for VVAULT Conversations
 *
 * Legacy Supabase Store for VVAULT Conversations
 *
 * Priority: VVAULT API → legacy Supabase fallback.
 *
 * This module still contains the legacy vault_files adapter while Chatty is
 * being moved to the VVAULT body. Callers that need canonical conversation
 * truth should prefer vvaultConnector/readConversations.js.
 *
 * Convention (CRITICAL - NEVER DEVIATE):
 * - Supabase path: "/vvault_files/users/{shard}/{userId}/instances/{constructId}/chatty/chat_with_{constructId}.md"
 * - filename in table: "instances/{constructId}/chatty/chat_with_{constructId}.md"
 * - constructId = FULL ID with version suffix (zen-001, lin-001, katana-001)
 * - file_type: "conversation"
 * - metadata: { sessionId, title, constructId, constructName, constructCallsign, messages: [...] }
 */

import { getSupabaseClient } from '../server/lib/supabaseClient.js';
import * as vvaultApi from './vvaultApiClient.js';
import crypto from 'crypto';

function sha256(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex');
}

const _supabaseUserIdCache = new Map();
const SUPABASE_USER_CACHE_TTL = 5 * 60 * 1000;

function looksLikeEmail(value) {
  return typeof value === 'string' && value.includes('@');
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
  return {
    userId: value,
    userEmail: looksLikeEmail(value) ? value : null,
    supabaseUserId: looksLikeEmail(value) ? null : value,
    primaryLookupId: value,
  };
}

function shouldPreferVvaultApiConversationRead(lookup) {
  return Boolean(lookup?.userEmail);
}

function normalizeConstructCallsign(constructCallsign, constructId) {
  let normalizedConstructId = constructCallsign || constructId || 'unknown';
  if (normalizedConstructId !== 'unknown' && !/\-\d{3}$/.test(normalizedConstructId)) {
    console.warn(`⚠️ [SupabaseStore] constructId "${normalizedConstructId}" missing callsign suffix, normalizing to "${normalizedConstructId}-001"`);
    normalizedConstructId = `${normalizedConstructId}-001`;
  }
  return normalizedConstructId;
}

function resolveVaultFileUpdatedAt(row = {}) {
  const metadata = typeof row.metadata === 'string'
    ? (() => {
        try {
          return JSON.parse(row.metadata);
        } catch {
          return {};
        }
      })()
    : (row.metadata || {});

  return (
    row.updated_at ||
    metadata.updatedAt ||
    metadata.lastUpdated ||
    row.created_at ||
    new Date().toISOString()
  );
}

function slugifyHydroProjectName(value = '') {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'workspace';
}

function parseHydroProjectSlug(filename = '') {
  const match = filename.match(/instances\/hydro-001\/code\/(.+)_hydro_chat\.md$/i);
  return match ? match[1] : null;
}

function resolveConversationStorageTarget({ normalizedConstructId, sessionId, metadata = {} }) {
  const explicitStoragePath = typeof metadata.transcriptPath === 'string' && metadata.transcriptPath.trim()
    ? metadata.transcriptPath.trim().replace(/^\/+/, '')
    : null;

  if (explicitStoragePath) {
    const hydroProjectSlug = parseHydroProjectSlug(explicitStoragePath);
    return {
      filename: explicitStoragePath,
      storagePath: explicitStoragePath,
      sessionId: sessionId || (hydroProjectSlug
        ? `${normalizedConstructId}_${hydroProjectSlug}_hydro_chat`
        : `${normalizedConstructId}_chat_with_${normalizedConstructId}`),
      projectSlug: hydroProjectSlug,
    };
  }

  if (normalizedConstructId === 'hydro-001' && metadata.projectName) {
    const projectSlug = slugifyHydroProjectName(metadata.projectName);
    const storagePath = `instances/${normalizedConstructId}/code/${projectSlug}_hydro_chat.md`;
    return {
      filename: storagePath,
      storagePath,
      sessionId: sessionId || `${normalizedConstructId}_${projectSlug}_hydro_chat`,
      projectSlug,
    };
  }

  const storagePath = `instances/${normalizedConstructId}/chatty/chat_with_${normalizedConstructId}.md`;
  return {
    filename: storagePath,
    storagePath,
    sessionId: sessionId || `${normalizedConstructId}_chat_with_${normalizedConstructId}`,
    projectSlug: null,
  };
}

function sanitizeAttachmentReference(attachment = {}, fallbackId) {
  const mimeType = typeof attachment.mimeType === 'string' && attachment.mimeType.trim()
    ? attachment.mimeType.trim()
    : 'application/octet-stream';
  return {
    id: typeof attachment.id === 'string' && attachment.id.trim() ? attachment.id.trim() : fallbackId,
    name: typeof attachment.name === 'string' && attachment.name.trim() ? attachment.name.trim() : fallbackId,
    filename: typeof attachment.filename === 'string' && attachment.filename.trim() ? attachment.filename.trim() : undefined,
    mimeType,
    size: Number.isFinite(attachment.size) ? Number(attachment.size) : 0,
    category: attachment.category === 'image' || mimeType.startsWith('image/') ? 'image' : 'document',
    storagePath: typeof attachment.storagePath === 'string' && attachment.storagePath.trim() ? attachment.storagePath.trim() : undefined,
    sha256: typeof attachment.sha256 === 'string' && attachment.sha256.trim() ? attachment.sha256.trim() : undefined,
  };
}

function buildAttachmentStoragePath(normalizedConstructId, attachment, metadata = {}, index = 0) {
  if (typeof attachment.storagePath === 'string' && attachment.storagePath.trim()) {
    return attachment.storagePath.trim().replace(/^\/+/, '');
  }
  const safeName = (attachment.name || attachment.filename || `attachment_${index + 1}`)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || `attachment_${index + 1}`;
  const prefix = metadata.projectName ? `${slugifyHydroProjectName(metadata.projectName)}_` : '';
  const folder = attachment.category === 'image' || String(attachment.mimeType || '').startsWith('image/')
    ? 'assets'
    : 'documents';
  return `instances/${normalizedConstructId}/${folder}/${prefix}${safeName}`;
}

function extractAttachmentContent(attachment = {}) {
  if (typeof attachment.textContent === 'string') return attachment.textContent;
  if (typeof attachment.dataUrl === 'string') return attachment.dataUrl;
  if (typeof attachment.content === 'string') return attachment.content;
  return '';
}

async function persistAttachmentFiles({ supabase, supabaseUserId, normalizedConstructId, attachments = [], metadata = {}, sessionId }) {
  if (!attachments.length) return [];

  const persisted = [];
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index] || {};
    const storagePath = buildAttachmentStoragePath(normalizedConstructId, attachment, metadata, index);
    const content = extractAttachmentContent(attachment);
    const reference = sanitizeAttachmentReference({
      ...attachment,
      storagePath,
      filename: attachment.filename || attachment.name,
      sha256: attachment.sha256 || (content ? sha256(content) : undefined),
    }, `attachment-${index + 1}`);
    const record = {
      user_id: supabaseUserId,
      construct_id: normalizedConstructId,
      filename: storagePath,
      storage_path: storagePath,
      content,
      sha256: reference.sha256 || sha256(`${sessionId}:${storagePath}`),
      metadata: {
        source: 'hydro-ask-attachment',
        linkedSessionId: sessionId,
        linkedTranscriptPath: metadata.transcriptPath,
        originalFilename: attachment.name || attachment.filename || reference.name,
        mimeType: reference.mimeType,
        size: reference.size,
        category: reference.category,
      },
      file_type: reference.category === 'image' ? 'asset' : 'document',
    };

    const { data: existing } = await supabase
      .from('vault_files')
      .select('id')
      .eq('user_id', supabaseUserId)
      .eq('filename', storagePath)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from('vault_files')
        .update(record)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('vault_files')
        .insert(record);
      if (error) throw error;
    }

    persisted.push(reference);
  }

  return persisted;
}

function formatMarkdownTranscript(title, messages) {
  let md = `# ${title || 'Conversation'}\n\n`;
  for (const msg of messages || []) {
    // Date headers are stored as plain text on their own line (not as speaker messages)
    if (msg.isDateHeader) {
      md += `${msg.content}\n\n`;
    } else {
      const timestampPrefix = typeof msg.timestamp === 'string' && msg.timestamp.trim()
        ? `[${msg.timestamp.trim()}] `
        : '';
      const roleLabel = msg.role === 'user' ? '**User**' : '**Assistant**';
      let displayContent = typeof msg.content === 'string' ? msg.content : (msg.content == null ? '' : String(msg.content));
      const hasNoContent = !displayContent || displayContent.trim() === '';
      const hasAttachments = Array.isArray(msg.attachments) && msg.attachments.length > 0;
      if (hasNoContent && hasAttachments) {
        const names = msg.attachments
          .map((a) => (a && (a.filename || a.name)) || null)
          .filter(Boolean);
        displayContent = `[attached: ${names.length ? names.join(', ') : 'attachment'}]`;
      }
      md += `${timestampPrefix}${roleLabel}: ${displayContent}\n\n`;
    }
  }
  return md;
}

function messageFingerprint(message = {}) {
  const role = message.role || 'user';
  const timestamp = message.timestamp || '';
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  const attachmentNames = Array.isArray(message.attachments)
    ? message.attachments
        .map((attachment) => attachment?.storagePath || attachment?.filename || attachment?.name || '')
        .filter(Boolean)
        .join('|')
    : '';
  return `${role}:${timestamp}:${content}:${attachmentNames}`;
}

function buildConversationFallbackMessageId(sessionId, message = {}, indexes = {}) {
  if (message?.isDateHeader) {
    const nextDateIndex = indexes.dateHeader ?? 0;
    indexes.dateHeader = nextDateIndex + 1;
    return `${sessionId}_date_${nextDateIndex}`;
  }

  const nextMessageIndex = indexes.message ?? 0;
  indexes.message = nextMessageIndex + 1;
  return `${sessionId}_msg_${nextMessageIndex}`;
}

function normalizeConversationMessages(sessionId, messages = []) {
  const normalized = [];
  const seenIds = new Set();
  const seenFingerprints = new Set();
  const duplicateCounts = new Map();
  const fallbackIndexes = { message: 0, dateHeader: 0 };

  for (const originalMessage of Array.isArray(messages) ? messages : []) {
    if (!originalMessage || typeof originalMessage !== 'object') {
      continue;
    }

    const message = { ...originalMessage };
    const fingerprint = messageFingerprint(message);
    if (seenFingerprints.has(fingerprint)) {
      continue;
    }

    const baseId = typeof message.id === 'string' && message.id.trim()
      ? message.id.trim()
      : buildConversationFallbackMessageId(sessionId, message, fallbackIndexes);

    let resolvedId = baseId;
    if (seenIds.has(resolvedId)) {
      let duplicateIndex = duplicateCounts.get(baseId) ?? 1;
      do {
        resolvedId = `${baseId}__dup${duplicateIndex}`;
        duplicateIndex += 1;
      } while (seenIds.has(resolvedId));
      duplicateCounts.set(baseId, duplicateIndex);
    } else {
      duplicateCounts.set(baseId, 1);
    }

    message.id = resolvedId;
    seenIds.add(resolvedId);
    seenFingerprints.add(fingerprint);
    normalized.push(message);
  }

  return normalized;
}

function mergeConversationGroupMessages(canonicalConversation, otherConversations = []) {
  if (!canonicalConversation) {
    return canonicalConversation;
  }

  const mergedMessages = Array.isArray(canonicalConversation.messages)
    ? [...canonicalConversation.messages]
    : [];
  const existingFingerprints = new Set(
    mergedMessages.map((message) => messageFingerprint(message))
  );

  for (const otherConversation of otherConversations) {
    for (const message of otherConversation?.messages || []) {
      const fingerprint = messageFingerprint(message);
      if (existingFingerprints.has(fingerprint)) {
        continue;
      }
      mergedMessages.push(message);
      existingFingerprints.add(fingerprint);
    }
  }

  mergedMessages.sort((a, b) => {
    if (a.isDateHeader && !b.isDateHeader) return -1;
    if (!a.isDateHeader && b.isDateHeader) return 1;
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return ta - tb;
  });

  return {
    ...canonicalConversation,
    messages: normalizeConversationMessages(
      canonicalConversation.sessionId || canonicalConversation.id || 'session',
      mergedMessages,
    ),
  };
}

// Format a date as a readable date header (e.g., "January 20, 2026")
function formatDateHeader(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null; // Invalid date
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Get just the date part (YYYY-MM-DD) from a timestamp
function getDateFromTimestamp(timestamp) {
  if (!timestamp) return null;
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return null; // Invalid date
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function parseMarkdownTranscript(content, debugPath = null) {
  if (!content) return [];
  const messages = [];
  const lines = content.split('\n');
  let currentRole = null;
  let currentContent = [];
  let currentTimestamp = null;
  let currentDateForDay = null; // Track current date from day headers like "## November 14, 2025"
  const DEBUG = debugPath && debugPath.includes('chat_with_zen-001.md') && !debugPath.includes('instances');
  if (DEBUG) console.log(`🔍 [Parser-Legacy] Parsing ${lines.length} lines from ${debugPath}, first 3 lines:`, lines.slice(0, 10).map((l, i) => `[${i}] ${l.substring(0, 80)}`));


  // PRE-SCAN: Find the first date header in the file to use as fallback for legacy files
  // This handles files where the date header appears before we start matching messages
  const PRE_DATE_PATTERN = /^(?:#{1,3}\s+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i;
  for (let i = 0; i < Math.min(lines.length, 100); i++) { // Only check first 100 lines
    const match = lines[i].trim().match(PRE_DATE_PATTERN);
    if (match) {
      currentDateForDay = match[1];
      if (DEBUG) console.log(`📅 [Parser-Legacy] PRE-SCAN found date header at line ${i}: "${currentDateForDay}"`);
      break;
    }
  }
  if (DEBUG && !currentDateForDay) console.log(`⚠️ [Parser-Legacy] PRE-SCAN found no date header in first 100 lines`);

  // User identifiers - these are ALWAYS user messages (case insensitive)
  // Updated to match names that START with common user identifiers or are exact matches
  const USER_EXACT_PATTERNS = /^(you|user|human|me|i)$/i;
  const USER_PREFIX_PATTERNS = /^(devon|user)\b/i; // Names that start with these are users


  // AI/Construct identifiers - these are ALWAYS assistant messages
  const AI_PATTERNS = /^(zen|lin|katana|synth|assistant|ai|bot|gpt|chatgpt|claude|gemini)/i;


  // Detect if speaker is user (returns true) or assistant (returns false)
  function isUserSpeaker(name) {
    if (!name) return false;
    const trimmed = name.trim();
    // Check if it's a known AI/construct first
    if (AI_PATTERNS.test(trimmed)) return false;
    // Check exact user patterns
    if (USER_EXACT_PATTERNS.test(trimmed)) return true;
    // Check if name starts with user identifier
    if (USER_PREFIX_PATTERNS.test(trimmed)) return true;
    // Default: unknown speakers are treated as user (since most transcripts feature user vs single AI)
    return true;
  }


  // Helper: Derive ISO timestamp from day header + time string (e.g., "01:07:38 PM EST")
  function deriveTimestampFromDayAndTime(timeStr) {
    if (!currentDateForDay || !timeStr) return null;
    try {
      // Parse time: "01:07:38 PM" or "01:07:38 PM EST"
      const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
      if (!timeMatch) return null;

      let hour = parseInt(timeMatch[1], 10) % 12;
      if (timeMatch[4].toUpperCase() === 'PM') hour += 12;
      const minute = parseInt(timeMatch[2], 10);
      const second = parseInt(timeMatch[3], 10);


      // Create date from currentDateForDay (e.g., "November 14, 2025")
      const base = new Date(currentDateForDay);
      if (isNaN(base.getTime())) return null;


      base.setHours(hour, minute, second, 0);
      return base.toISOString();
    } catch {
      return null;
    }
  }

  // Date header pattern - matches "Month Day, Year" or "Month Year" 
  // e.g., "November 9, 2025", "December 19, 2025", "January 20, 2026", "November 2025"
  const DATE_HEADER_PATTERN = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2},?\s+)?\d{4}$/i;
  // Day header with ## prefix pattern - captures the date for timestamp derivation
  const DAY_HEADER_CAPTURE_PATTERN = /^##\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s*$/i;

  for (const line of lines) {
    const trimmedLine = line.trim();


    // Check for day header with ## prefix to capture date for timestamp derivation
    // Pattern: "## November 14, 2025"
    const dayHeaderCapture = trimmedLine.match(DAY_HEADER_CAPTURE_PATTERN);
    if (dayHeaderCapture) {
      // Capture the date for deriving timestamps on subsequent messages
      currentDateForDay = `${dayHeaderCapture[1]} ${dayHeaderCapture[2]}, ${dayHeaderCapture[3]}`;
      // Save any pending message first
      if (currentRole && currentContent.length) {
        const msg = { role: currentRole, content: currentContent.join('\n').trim() };
        if (currentTimestamp) msg.timestamp = currentTimestamp;
        messages.push(msg);
        currentContent = [];
      }
      // Don't add day headers as messages - they're just date context markers
      continue;
    }


    // Early detection: If line is a date header on its own (without ##), save as a separate message
    if (DATE_HEADER_PATTERN.test(trimmedLine)) {
      // Also capture this as current date for timestamp derivation
      currentDateForDay = trimmedLine;
      if (DEBUG) console.log(`📅 [Parser-Legacy] Set currentDateForDay from bare header: "${currentDateForDay}"`);
    }


    // Also check for markdown header date formats like "## November 9, 2025" or "# November 9, 2025"
    const mdDateHeaderMatch = trimmedLine.match(/^#{1,3}\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i);
    if (mdDateHeaderMatch) {
      currentDateForDay = mdDateHeaderMatch[1];
      if (DEBUG) console.log(`📅 [Parser-Legacy] Set currentDateForDay from MD header: "${currentDateForDay}"`);
      // Save any pending message first
      if (currentRole && currentContent.length) {
        const msg = { role: currentRole, content: currentContent.join('\n').trim() };
        if (currentTimestamp) msg.timestamp = currentTimestamp;
        messages.push(msg);
        currentContent = [];
      }
      // Add date header as its own message
      messages.push({ 
        role: 'user', 
        content: trimmedLine, 
        isDateHeader: true 
      });
      continue;
    }


    // Match standalone timestamp lines like [2025-11-09T...] or (2026-01-20T12:33:50.563179)
    const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s*$/) ||
                           line.match(/^\((\d{4}-\d{2}-\d{2}T[\d:.]+)\)\s*$/);
    if (timestampMatch) {
      currentTimestamp = timestampMatch[1];
      continue;
    }

    // FORMAT 0: Inline ISO timestamped Chatty format - "[ISO_TIMESTAMP] **Speaker**: content"
    // Example: "[2026-04-25T21:05:12.000Z] **User**: Hello"
    const inlineIsoBoldMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s+\*\*([^*]+)\*\*:\s*(.*)$/);
    if (inlineIsoBoldMatch) {
      const isoTimestamp = inlineIsoBoldMatch[1];
      const speaker = inlineIsoBoldMatch[2].trim();
      const inlineContent = inlineIsoBoldMatch[3];

      if (currentRole && currentContent.length) {
        const msg = { role: currentRole, content: currentContent.join('\n').trim() };
        if (currentTimestamp) msg.timestamp = currentTimestamp;
        messages.push(msg);
      }

      currentRole = isUserSpeaker(speaker) ? 'user' : 'assistant';
      currentContent = inlineContent ? [inlineContent] : [];
      currentTimestamp = isoTimestamp;
      continue;
    }

    // FORMAT 5: Bold timestamp with ISO in brackets - "**HH:MM:SS AM/PM TZ - Speaker** [ISO_TIMESTAMP]: content"
    // Example: "**06:48:09 AM EST - Zen** [2025-12-13T11:48:09.644Z]: Continue."
    const boldTimestampIsoMatch = line.match(/^\*\*(\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)(?:\s+[A-Z]{2,5})?)\s+-\s+(.+?)\*\*\s*\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]:\s*(.*)$/i);
    if (boldTimestampIsoMatch) {
      const speaker = boldTimestampIsoMatch[2].trim();
      const isoTimestamp = boldTimestampIsoMatch[3];
      const inlineContent = boldTimestampIsoMatch[4];


      // Save previous message
      if (currentRole && currentContent.length) {
        const msg = { role: currentRole, content: currentContent.join('\n').trim() };
        if (currentTimestamp) msg.timestamp = currentTimestamp;
        messages.push(msg);
      }


      currentRole = isUserSpeaker(speaker) ? 'user' : 'assistant';
      currentContent = inlineContent ? [inlineContent] : [];
      currentTimestamp = isoTimestamp;
      continue;
    }


    // FORMAT 6: Bold timestamp without ISO - "**HH:MM:SS AM/PM TZ - Speaker**: content"
    // Example: "**01:07:38 PM EST - Synth**: CONVERSATION_CREATED:Synth"
    const boldTimestampMatch = line.match(/^\*\*(\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)(?:\s+[A-Z]{2,5})?)\s+-\s+(.+?)\*\*:\s*(.*)$/i);
    if (boldTimestampMatch) {
      const timeStr = boldTimestampMatch[1].trim();
      const speaker = boldTimestampMatch[2].trim();
      const inlineContent = boldTimestampMatch[3];


      // Save previous message
      if (currentRole && currentContent.length) {
        const msg = { role: currentRole, content: currentContent.join('\n').trim() };
        if (currentTimestamp) msg.timestamp = currentTimestamp;
        messages.push(msg);
      }


      currentRole = isUserSpeaker(speaker) ? 'user' : 'assistant';
      currentContent = inlineContent ? [inlineContent] : [];
      // Derive timestamp from current day header + time string
      currentTimestamp = deriveTimestampFromDayAndTime(timeStr);
      continue;
    }

    // FORMAT 1: Markdown bold - **Name**: content OR **Name**:
    const boldMatch = line.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
    if (boldMatch) {
      const speaker = boldMatch[1].trim();
      const inlineContent = boldMatch[2];


      // Save previous message
      if (currentRole && currentContent.length) {
        const msg = { role: currentRole, content: currentContent.join('\n').trim() };
        if (currentTimestamp) msg.timestamp = currentTimestamp;
        messages.push(msg);
      }


      currentRole = isUserSpeaker(speaker) ? 'user' : 'assistant';
      currentContent = inlineContent ? [inlineContent] : [];
      // Use day header date as fallback (timestamp at midnight for that day)
      if (currentDateForDay) {
        try {
          const base = new Date(currentDateForDay);
          if (!isNaN(base.getTime())) {
            // Offset each message slightly to preserve order
            base.setSeconds(base.getSeconds() + messages.length);
            currentTimestamp = base.toISOString();
            if (DEBUG) console.log(`⏰ [Parser] FORMAT 1 derived timestamp: ${currentTimestamp} for speaker "${speaker}"`);
          } else {
            currentTimestamp = null;
          }
        } catch {
          currentTimestamp = null;
        }
      } else {
        currentTimestamp = null;
      }
      continue;
    }


    // FORMAT 2: ChatGPT export - "You said:" / "Name said:" patterns
    // Handle both "You said:" (user) and "Name said:" (assistant) on their own line
    const saidMatch = line.match(/^([A-Za-z][A-Za-z0-9_\s-]*)\s+said:\s*$/i);
    if (saidMatch) {
      const speaker = saidMatch[1].trim();


      // Save previous message
      if (currentRole && currentContent.length) {
        const msg = { role: currentRole, content: currentContent.join('\n').trim() };
        if (currentTimestamp) msg.timestamp = currentTimestamp;
        messages.push(msg);
      }


      currentRole = isUserSpeaker(speaker) ? 'user' : 'assistant';
      currentContent = [];
      // Use day header date as fallback (timestamp at midnight for that day)
      if (currentDateForDay) {
        try {
          const base = new Date(currentDateForDay);
          if (!isNaN(base.getTime())) {
            // Offset each message slightly to preserve order
            base.setSeconds(base.getSeconds() + messages.length);
            currentTimestamp = base.toISOString();
          } else {
            currentTimestamp = null;
          }
        } catch {
          currentTimestamp = null;
        }
      } else {
        currentTimestamp = null;
      }
      continue;
    }


    // FORMAT 4: VVAULT timestamp format - "HH:MM:SS AM/PM TIMEZONE - Speaker Name [ISO_TIMESTAMP]: message content"
    // Example: "10:26:07 AM EST - Devon Woodson [2026-01-20T15:26:07.457Z]: Hello Zen, this is a test from Chatty!"
    const vvaultTimestampMatch = line.match(/^(\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)(?:\s+[A-Z]{2,5})?)\s+-\s+(.+?)\s+\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]:\s*(.*)$/i);
    if (vvaultTimestampMatch) {
      const speaker = vvaultTimestampMatch[2].trim();
      const isoTimestamp = vvaultTimestampMatch[3];
      const inlineContent = vvaultTimestampMatch[4];


      // Save previous message
      if (currentRole && currentContent.length) {
        const msg = { role: currentRole, content: currentContent.join('\n').trim() };
        if (currentTimestamp) msg.timestamp = currentTimestamp;
        messages.push(msg);
      }


      currentRole = isUserSpeaker(speaker) ? 'user' : 'assistant';
      currentContent = inlineContent ? [inlineContent] : [];
      currentTimestamp = isoTimestamp;
      continue;
    }


    // FORMAT 3: Simple "Name:" at start of line (common in transcripts)
    const simpleMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s+(.+)$/);
    if (simpleMatch && simpleMatch[1].length < 20) { // Name shouldn't be too long
      const speaker = simpleMatch[1].trim();
      const inlineContent = simpleMatch[2];


      // Only treat as speaker label if it looks like a name (not a URL or timestamp)
      if (!speaker.includes('http') && !speaker.match(/^\d/)) {
        // Save previous message
        if (currentRole && currentContent.length) {
          const msg = { role: currentRole, content: currentContent.join('\n').trim() };
          if (currentTimestamp) msg.timestamp = currentTimestamp;
          messages.push(msg);
        }


        currentRole = isUserSpeaker(speaker) ? 'user' : 'assistant';
        currentContent = [inlineContent];
        // Use day header date as fallback (timestamp at midnight for that day)
        if (currentDateForDay) {
          try {
            const base = new Date(currentDateForDay);
            if (!isNaN(base.getTime())) {
              // Offset each message slightly to preserve order
              base.setSeconds(base.getSeconds() + messages.length);
              currentTimestamp = base.toISOString();
            } else {
              currentTimestamp = null;
            }
          } catch {
            currentTimestamp = null;
          }
        } else {
          currentTimestamp = null;
        }
        continue;
      }
    }


    // Add content to current message (skip empty lines at start)
    // CRITICAL: Do NOT absorb date headers into message content
    if (currentRole && line.trim()) {
      // Double-check: if this line is a date header, don't add it to content
      // This catches date lines that might have slipped through the early check
      if (DATE_HEADER_PATTERN.test(line.trim())) {
        // Save any pending message first
        if (currentContent.length) {
          const msg = { role: currentRole, content: currentContent.join('\n').trim() };
          if (currentTimestamp) msg.timestamp = currentTimestamp;
          messages.push(msg);
          currentContent = [];
        }
        // Add date header as its own message (avoid duplicates)
        const lastMsg = messages[messages.length - 1];
        const isDuplicate = lastMsg && lastMsg.isDateHeader && lastMsg.content === line.trim();
        if (!isDuplicate) {
          messages.push({ 
            role: 'user', 
            content: line.trim(), 
            isDateHeader: true 
          });
        }
        continue;
      }
      currentContent.push(line);
    }
  }

  // Don't forget the last message
  if (currentRole && currentContent.length) {
    const msg = { role: currentRole, content: currentContent.join('\n').trim() };
    if (currentTimestamp) msg.timestamp = currentTimestamp;
    messages.push(msg);
  }

  // Post-process: Filter out garbage "messages" that are really headers or system artifacts
  // These patterns indicate file header content, not actual conversation messages
  const GARBAGE_PATTERNS = [
    /^[a-z]+-\d+_chat_with_[a-z]+-\d+$/i, // Session IDs like "zen-001_chat_with_zen-001"
    /^[A-Za-z]+\n+-{2,}/,  // Name followed by dashes (section headers like "Katana\n---")
    /Native Chatty messages will append here/i, // Template text
    /^---+$/,  // Horizontal rules alone
    /^#{1,6}\s/, // Markdown headers
    /^CONVERSATION_CREATED:/i, // Internal markers
    /^\(\*.*\*\)$/, // Template markers like (*Native Chatty...)
    /^System\s*\([^)]+\):\s*Test message/i, // Test messages
    /^-{2,}.*response.*-{2,}$/i, // Separator lines like "--- Providing an appropriate and consistent response ----"
    /^-{2,}\s+\w+.*-{2,}$/i, // Generic separator with text between dashes
  ];


  const isGarbageMessage = (content) => {
    if (!content) return true;
    const trimmed = content.trim();
    if (!trimmed) return true;
    // Very short content that matches garbage patterns
    if (trimmed.length <= 200) {
      if (GARBAGE_PATTERNS.some(pattern => pattern.test(trimmed))) return true;
    }
    return false;
  };


  // Patterns to strip from the END of message content (trailing garbage)
  const TRAILING_GARBAGE_PATTERNS = [
    DATE_HEADER_PATTERN, // Date headers like "December 17, 2025"
    /^-{2,}.*-{2,}$/im, // Separator lines like "--- text ----"
  ];


  // Strip trailing garbage from message content (date headers, separators that got absorbed)
  function sanitizeMessageContent(content) {
    if (!content) return content;
    let sanitized = content.trim();
    let changed = true;


    // Keep stripping until no more changes (handles multiple trailing garbage lines)
    while (changed) {
      changed = false;
      const lines = sanitized.split('\n');


      // Check last few lines for garbage
      while (lines.length > 0) {
        const lastLine = lines[lines.length - 1].trim();
        if (!lastLine) {
          lines.pop(); // Remove empty trailing lines
          changed = true;
          continue;
        }


        // Check if last line is garbage
        const isTrailingGarbage = TRAILING_GARBAGE_PATTERNS.some(p => p.test(lastLine));
        if (isTrailingGarbage) {
          lines.pop();
          changed = true;
        } else {
          break;
        }
      }


      sanitized = lines.join('\n').trim();
    }


    return sanitized;
  }


  // Filter out garbage, preserve isDateHeader flag that was already set during parsing
  return messages
    .filter(m => !isGarbageMessage(m.content))
    .map(m => {
      // Keep existing isDateHeader flag (already set during parse loop for standalone date lines)
      if (m.isDateHeader) return m;
      // Also check content in case it was missed (fallback)
      if (DATE_HEADER_PATTERN.test((m.content || '').trim())) {
        return { ...m, isDateHeader: true };
      }
      // Sanitize content to remove trailing date headers/separators
      return { ...m, content: sanitizeMessageContent(m.content) };
    })
    .filter(m => m.content && m.content.trim()); // Remove any messages that became empty after sanitization
}

async function resolveSupabaseUserId(emailOrId) {
  const cached = _supabaseUserIdCache.get(emailOrId);
  if (cached && (Date.now() - cached.ts) < SUPABASE_USER_CACHE_TTL) {
    console.log(`⚡ [SupabaseStore] Cache hit for user: ${emailOrId} -> ${cached.id}`);
    return cached.id;
  }

  try {
    const { resolveSupabaseUserIdFromEmailOrId } = await import('../server/auth/lib/supabaseUserResolver.js');
    const resolved = await resolveSupabaseUserIdFromEmailOrId(emailOrId);
    if (resolved) {
      console.log(`✅ [SupabaseStore] Auth resolver mapped ${emailOrId} -> ${resolved}`);
      _supabaseUserIdCache.set(emailOrId, { id: resolved, ts: Date.now() });
      return resolved;
    }
  } catch (err) {
    console.error('❌ [SupabaseStore] Error resolving user:', err.message);
  }

  console.log(`⚠️ [SupabaseStore] User not found for: ${emailOrId}`);
  return null;
}

/**
 * Read conversations from VVAULT API first, then Supabase as fallback
 * The VVAULT API is the canonical source for real conversation data
 */
async function readConversationsFromVVAULTApi(userEmailOrId, constructId = null) {
  const lookup = normalizeUserLookupContext(userEmailOrId);
  const serviceUserContext = {
    userEmail: lookup.userEmail,
    supabaseUserId: lookup.supabaseUserId,
  };
  const serviceUserLabel = lookup.userEmail || lookup.primaryLookupId;
  console.log(`📡 [SupabaseStore] Attempting VVAULT API for user: ${serviceUserLabel}, construct: ${constructId || 'all'}`);

  if (!serviceUserContext.userEmail) {
    console.log('⚠️ [SupabaseStore] VVAULT API requires an email-bearing service context');
    return null;
  }


  try {
    // If specific constructId, fetch just that one
    if (constructId) {
      const transcriptData = await vvaultApi.getTranscript(constructId, serviceUserContext);
      if (transcriptData && transcriptData.success) {
        const sessionId = `${constructId}_chat_with_${constructId}`;
        const messages = normalizeConversationMessages(
          sessionId,
          vvaultApi.parseMarkdownToMessages(transcriptData.content),
        );
        console.log(`✅ [SupabaseStore] VVAULT API returned ${messages.length} messages for ${constructId}`);


        return [{
          sessionId,
          title: constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()),
          constructId: constructId,
          constructName: constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()),
          constructCallsign: constructId,
          createdAt: transcriptData.updated_at || new Date().toISOString(),
          updatedAt: transcriptData.updated_at || new Date().toISOString(),
          messages
        }];
      }
      return null;
    }

    // List all constructs and fetch their transcripts
    const constructs = await vvaultApi.listConstructs(serviceUserContext);
    if (constructs === null) {
      // API call failed (503, timeout, etc) - return null to trigger Supabase fallback
      console.log('⚠️ [SupabaseStore] VVAULT API unreachable, will use Supabase fallback');
      return null;
    }
    if (constructs.length === 0) {
      console.log('⚠️ [SupabaseStore] VVAULT API returned no constructs');
      return []; // Return empty array - API is reachable but no data
    }

    // Deduplicate constructs by construct_id
    const seenIds = new Set();
    const uniqueConstructs = constructs.filter(c => {
      if (seenIds.has(c.construct_id)) return false;
      seenIds.add(c.construct_id);
      return true;
    });

    console.log(`📋 [SupabaseStore] VVAULT API found ${uniqueConstructs.length} unique constructs (${constructs.length} total)`);


    const conversations = [];
    for (const construct of uniqueConstructs) {
      const transcriptData = await vvaultApi.getTranscript(construct.construct_id, serviceUserContext);
      if (transcriptData && transcriptData.success) {
        const sessionId = `${construct.construct_id}_chat_with_${construct.construct_id}`;
        const messages = normalizeConversationMessages(
          sessionId,
          vvaultApi.parseMarkdownToMessages(transcriptData.content),
        );
        const constructName = construct.construct_id.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase());


        conversations.push({
          sessionId,
          title: constructName,
          constructId: construct.construct_id,
          constructName: constructName,
          constructCallsign: construct.construct_id,
          createdAt: transcriptData.updated_at || new Date().toISOString(),
          updatedAt: transcriptData.updated_at || new Date().toISOString(),
          messages
        });


        console.log(`📝 [SupabaseStore] ${construct.construct_id}: ${messages.length} messages`);
      }
    }

    console.log(`✅ [SupabaseStore] VVAULT API returned ${conversations.length} conversations`);
    return conversations.length > 0 ? conversations : null;
  } catch (err) {
    console.error('❌ [SupabaseStore] VVAULT API error:', err.message);
    return null;
  }
}

async function readConversationsFromSupabase(userEmailOrId, constructId = null) {
  const lookup = normalizeUserLookupContext(userEmailOrId);
  if (shouldPreferVvaultApiConversationRead(lookup)) {
    const apiResult = await readConversationsFromVVAULTApi(userEmailOrId, constructId);
    if (apiResult !== null) {
      return apiResult;
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.log('⚠️ [SupabaseStore] No Supabase client - falling back to PostgreSQL');
    const apiResult = await readConversationsFromVVAULTApi(userEmailOrId, constructId);
    return apiResult;
  }

  try {
    const supabaseUserId = lookup.supabaseUserId || await resolveSupabaseUserId(lookup.primaryLookupId);
    if (!supabaseUserId) {
      console.log(`⚠️ [SupabaseStore] Could not resolve user: ${lookup.primaryLookupId}`);
      return [];
    }

    // Query 1: Get files marked as 'conversation' type
    let query = supabase
      .from('vault_files')
      .select('*')
      .eq('user_id', supabaseUserId)
      .eq('file_type', 'conversation')
      .order('created_at', { ascending: false });

    if (constructId) {
      query = query.eq('construct_id', constructId);
    }

    const { data, error } = await query;


    // Query 2: Also get files matching chatty path pattern (may have different file_type)
    const { data: chattyFiles, error: chattyError } = await supabase
      .from('vault_files')
      .select('*')
      .eq('user_id', supabaseUserId)
      .like('filename', 'instances/%/chatty/%')
      .order('created_at', { ascending: false });


    if (!chattyError && chattyFiles) {
      console.log(`🔍 [SupabaseStore] Found ${chattyFiles.length} chatty-path files`);
    }

    const { data: hydroCodeFiles, error: hydroCodeError } = await supabase
      .from('vault_files')
      .select('*')
      .eq('user_id', supabaseUserId)
      .like('filename', 'instances/%/code/%_hydro_chat.md')
      .order('created_at', { ascending: false });

    if (!hydroCodeError && hydroCodeFiles) {
      console.log(`🔍 [SupabaseStore] Found ${hydroCodeFiles.length} hydro code transcripts`);
    }


    // Query 3: Look for chat_with_*.md files without path prefix (legacy uploads)
    const { data: legacyFiles, error: legacyError } = await supabase
      .from('vault_files')
      .select('*')
      .eq('user_id', supabaseUserId)
      .like('filename', 'chat_with_%.md')
      .order('created_at', { ascending: false });


    if (!legacyError && legacyFiles) {
      console.log(`🔍 [SupabaseStore] Found ${legacyFiles.length} legacy chat files (any user)`);
    }


    // Merge results, avoiding duplicates
    const allFiles = [...(data || [])];
    const existingFilenames = new Set(allFiles.map(f => f.filename));
    for (const file of (chattyFiles || [])) {
      if (!existingFilenames.has(file.filename)) {
        allFiles.push(file);
        console.log(`➕ [SupabaseStore] Added chatty file: ${file.filename}`);
      }
    }
    for (const file of (hydroCodeFiles || [])) {
      if (!existingFilenames.has(file.filename)) {
        allFiles.push(file);
        existingFilenames.add(file.filename);
        console.log(`➕ [SupabaseStore] Added Hydro code file: ${file.filename}`);
      }
    }
    for (const file of (legacyFiles || [])) {
      if (!existingFilenames.has(file.filename)) {
        allFiles.push(file);
        existingFilenames.add(file.filename);
        console.log(`➕ [SupabaseStore] Added legacy file: ${file.filename} (user: ${file.user_id})`);
      }
    }

    if (error) {
      console.error('❌ [SupabaseStore] Read error:', error.message);
      // Continue with chatty files if main query failed
    }

    const conversations = allFiles.map(file => {
      const metadata = typeof file.metadata === 'string' 
        ? JSON.parse(file.metadata) 
        : (file.metadata || {});


      console.log(`🔍 [SupabaseStore] Processing file:`, {
        filename: file.filename,
        hasContent: !!file.content,
        contentLength: file.content?.length || 0,
        metadataMessages: metadata.messages?.length || 0
      });


      const parsedMessages = parseMarkdownTranscript(file.content, file.filename);


      // Debug: Log parsing results for legacy files
      if (file.content?.length > 1000 && parsedMessages.length === 0) {
        const contentPreview = file.content.substring(0, 500);
        console.log(`⚠️ [SupabaseStore] Large file parsed to 0 messages:`, {
          filename: file.filename,
          contentLength: file.content.length,
          contentPreview: contentPreview.replace(/\n/g, '\\n'),
          hasUserPattern: /\*\*(User|You|Devon|Human)\*\*:/i.test(file.content),
          hasAssistantPattern: /\*\*(Assistant|Zen|Lin|Katana|AI)\*\*:/.test(file.content)
        });
      }


      // Validate parsed messages - skip garbage from legacy files
      // But NEVER skip files that have clear transcript markers (IMPORT_METADATA, # Chat with, etc.)
      const hasTranscriptMarkers = file.content && (
        file.content.includes('IMPORT_METADATA') ||
        file.content.includes('# Chat with') ||
        file.content.includes('chat_with_') ||
        /\*\*\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)/i.test(file.content) // Bold timestamp format
      );


      // Legacy = BOTH 'instances/' AND '/chatty/' missing (uses &&, not ||)
      const isLegacyFile = !file.filename.includes('instances/') && !file.filename.includes('/chatty/');


      // Only consider garbage detection for files WITHOUT transcript markers
      const hasGarbageParsedMessages = !hasTranscriptMarkers && parsedMessages.length > 0 && (() => {
        // Check if all messages have the same role (should be alternating user/assistant)
        const roles = parsedMessages.map(m => m.role);
        const allSameRole = roles.every(r => r === roles[0]);


        // Check for garbage content patterns (date headers, single words, etc.)
        const garbagePatterns = [
          /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+,?\s*\d*/i,
          /^[A-Za-z]+!?$/, // Single words like "Synth!"
          /^\d{4}[-/]\d{2}[-/]\d{2}$/, // Date strings
        ];
        const hasGarbageContent = parsedMessages.some(m => {
          const content = m.content?.trim() || '';
          if (content.length < 20) {
            return garbagePatterns.some(pattern => pattern.test(content));
          }
          return false;
        });


        // Large file with all same role and garbage content = garbage
        if (allSameRole && hasGarbageContent && file.content?.length > 5000) {
          console.log(`⚠️ [SupabaseStore] Detected garbage parsed messages:`, {
            filename: file.filename,
            messageCount: parsedMessages.length,
            allSameRole,
            hasGarbageContent,
            firstContentPreview: parsedMessages[0]?.content?.substring(0, 50)
          });
          return true;
        }
        return false;
      })();


      // Extract constructId from filename patterns:
      // - "instances/{name}/chatty/chat_with_{constructId}.md"
      // - "instances/{constructId}/chatty/chat_with_{constructId}.md" (legacy wrong path)
      // - "chat_with_{constructId}.md"
      let extractedConstructId = metadata.constructId || file.construct_id;
      const chatWithMatch = file.filename.match(/chat_with_([^/.]+)\.md$/);
      if (chatWithMatch) {
        extractedConstructId = chatWithMatch[1];
      }


      // Generate canonical sessionId: {constructId}_chat_with_{constructId}
      const hydroProjectSlug = parseHydroProjectSlug(file.filename);
      const canonicalSessionId = metadata.sessionId
        || (hydroProjectSlug && extractedConstructId === 'hydro-001'
          ? `${extractedConstructId}_${hydroProjectSlug}_hydro_chat`
          : extractedConstructId
            ? `${extractedConstructId}_chat_with_${extractedConstructId}`
            : file.filename.replace('chat/', '').replace('.md', ''));

      // Use metadata messages first, then parsed (skip garbage parsed)
      let messages;
      if (metadata.messages?.length > 0) {
        messages = normalizeConversationMessages(canonicalSessionId, metadata.messages);
      } else if (isLegacyFile && hasGarbageParsedMessages) {
        console.log(`⏭️ [SupabaseStore] Skipping garbage legacy file: ${file.filename}`);
        messages = []; // Skip garbage messages from legacy files
      } else {
        messages = normalizeConversationMessages(canonicalSessionId, parsedMessages);
      }


      // Debug: Log date headers detected
      const dateHeaders = messages.filter(m => m.isDateHeader);
      if (dateHeaders.length > 0) {
        console.log(`📅 [SupabaseStore] Found ${dateHeaders.length} date headers in ${file.filename}:`, dateHeaders.slice(0, 3).map(m => m.content));
      }

      // Generate clean title from constructId (e.g., "lin-001" → "Lin", "katana-001" → "Katana")
      const generateCleanTitle = (constructId) => {
        if (!constructId) return null;
        const baseName = constructId.replace(/-\d+$/, ''); // Remove version suffix
        return baseName.charAt(0).toUpperCase() + baseName.slice(1).toLowerCase();
      };


      const generatedTitle = generateCleanTitle(extractedConstructId);
      let cleanTitle = metadata.title || generatedTitle || file.filename;
      if (generatedTitle && cleanTitle !== generatedTitle) {
        const baseFromTitle = cleanTitle.replace(/^Chat with\s+/i, '').replace(/-\d+$/, '').toLowerCase();
        const baseFromId = (extractedConstructId || '').replace(/-\d+$/, '').toLowerCase();
        if (baseFromId && baseFromTitle !== baseFromId) {
          cleanTitle = generatedTitle;
        }
      }

      return {
        sessionId: canonicalSessionId,
        title: cleanTitle,
        constructId: extractedConstructId,
        constructName: generatedTitle || metadata.constructName || extractedConstructId,
        constructCallsign: metadata.constructCallsign || extractedConstructId,
        createdAt: file.created_at,
        updatedAt: resolveVaultFileUpdatedAt(file),
        messages
      };
    });

    const normalizeConstructBase = (conversation) => (
      conversation.constructId === 'hydro-001'
        ? conversation.sessionId
        : (conversation.constructId || '').replace(/-\d+$/, '').toLowerCase()
    );
    const grouped = new Map();
    for (const conv of conversations) {
      const base = normalizeConstructBase(conv);
      if (!grouped.has(base)) {
        grouped.set(base, []);
      }
      grouped.get(base).push(conv);
    }

    const deduplicated = [];
    for (const [base, group] of grouped) {
      if (group.length === 1) {
        deduplicated.push(group[0]);
        continue;
      }

      const canonical = group.find(c => /^[a-z]+-\d+$/.test(c.constructId)) || group[0];
      const others = group.filter(c => c !== canonical);
      const mergedCanonical = mergeConversationGroupMessages(canonical, others);
      for (const other of others) {
        console.log(`🔄 [SupabaseStore] Merged ${other.messages.length} messages from ${other.sessionId} into ${canonical.sessionId}`);
      }

      console.log(`🔗 [SupabaseStore] Deduplicated ${group.length} files for "${base}" → ${mergedCanonical.sessionId} (${mergedCanonical.messages.length} messages)`);
      deduplicated.push(mergedCanonical);
    }

    console.log(`📥 [SupabaseStore] Read ${deduplicated.length} conversations (from ${conversations.length} files) for user: ${lookup.primaryLookupId}`);
    if (deduplicated.length === 0 && lookup.userEmail) {
      const apiFallback = await readConversationsFromVVAULTApi(userEmailOrId, constructId);
      if (apiFallback !== null) {
        return apiFallback;
      }
    }
    return deduplicated;
  } catch (err) {
    console.error('❌ [SupabaseStore] Read failed:', err.message);
    const apiResult = await readConversationsFromVVAULTApi(userEmailOrId, constructId);
    return apiResult;
  }
}

async function writeConversationToSupabase(params) {
  const {
    supabaseUserId: explicitSupabaseUserId,
    userId,
    userEmail,
    sessionId,
    title,
    constructId,
    constructName,
    constructCallsign,
    role,
    content,
    timestamp,
    metadata = {}
  } = params || {};

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.log('⚠️ [SupabaseStore] No Supabase client - falling back to PostgreSQL');
    return null;
  }

  try {
    const lookupId = userEmail || userId;
    const supabaseUserId = explicitSupabaseUserId || await resolveSupabaseUserId(lookupId);
    if (!supabaseUserId) {
      console.log(`⚠️ [SupabaseStore] Could not resolve user: ${lookupId}`);
      return null;
    }

    const normalizedConstructId = normalizeConstructCallsign(constructCallsign, constructId);
    const target = resolveConversationStorageTarget({
      normalizedConstructId,
      sessionId,
      metadata,
    });
    const filename = target.filename;

    const { data: existingRows, error: existingLookupError } = await supabase
      .from('vault_files')
      .select('*')
      .eq('user_id', supabaseUserId)
      .eq('filename', filename)
      .order('created_at', { ascending: true })
      .limit(1);

    if (existingLookupError) throw existingLookupError;

    // If duplicate transcript rows already exist, append to the oldest row and
    // leave cleanup/migration to an explicit maintenance task.
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;

    let messages = [];
    let existingMetadata = {};

    if (existing) {
      existingMetadata = typeof existing.metadata === 'string' 
        ? JSON.parse(existing.metadata) 
        : (existing.metadata || {});
      messages = Array.isArray(existingMetadata.messages)
        ? existingMetadata.messages
        : parseMarkdownTranscript(existing.content);
    }

    const contentStr = typeof content === 'string' ? content : '';
    const isConversationCreated = contentStr.startsWith('CONVERSATION_CREATED:');
    const attachments = Array.isArray(metadata?.attachments) ? metadata.attachments : [];
    const persistedAttachments = await persistAttachmentFiles({
      supabase,
      supabaseUserId,
      normalizedConstructId,
      attachments,
      metadata: {
        ...metadata,
        transcriptPath: filename,
        projectSlug: target.projectSlug,
      },
      sessionId: target.sessionId,
    });
    const hasAttachments = attachments.length > 0;
    const hasContent = contentStr.trim() !== '';

    // Append messages even when content is empty as long as we have attachments.
    if (!isConversationCreated && (hasContent || hasAttachments)) {
      const newTimestamp = timestamp || new Date().toISOString();
      const newDate = getDateFromTimestamp(newTimestamp);


      // Find the last non-date-header message to check if date changed
      const lastNonHeaderMessage = messages.filter(m => !m.isDateHeader).slice(-1)[0];
      const lastDate = lastNonHeaderMessage ? getDateFromTimestamp(lastNonHeaderMessage.timestamp) : null;


      // Auto-insert date header if the date changed (or if this is the first message)
      const dateHeaderText = formatDateHeader(newTimestamp);
      if (newDate && newDate !== lastDate && dateHeaderText) {
        messages.push({
          role: 'user', // Date headers appear as user role but with isDateHeader flag
          content: dateHeaderText,
          isDateHeader: true,
          timestamp: newTimestamp
        });
      }


      const msgIndex = messages.filter(m => !m.isDateHeader).length;
      const newMessage = {
        id: `${target.sessionId}_msg_${msgIndex}`,
        role: role || 'user',
        content: contentStr,
        timestamp: newTimestamp
      };

      if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
        newMessage.metadata = metadata;
      }


      // Include attachments if provided in metadata
      if (hasAttachments) {
        newMessage.attachments = persistedAttachments.length ? persistedAttachments : attachments.map((attachment, index) => sanitizeAttachmentReference(attachment, `attachment-${index + 1}`));
        console.log(`📎 [SupabaseStore] Storing ${newMessage.attachments.length} attachments with message`);
      }


      messages.push(newMessage);
    }

    const mdContent = formatMarkdownTranscript(title || existingMetadata.title || 'Conversation', messages);
    const fileMetadata = {
      ...existingMetadata,
      ...metadata,
      sessionId: target.sessionId,
      title: title || existingMetadata.title || 'Untitled',
      constructId: normalizedConstructId,
      constructName,
      constructCallsign: normalizedConstructId,
      transcriptPath: filename,
      projectSlug: target.projectSlug || metadata.projectSlug,
      messages,
      lastUpdated: new Date().toISOString()
    };

    const record = {
      user_id: supabaseUserId,
      construct_id: normalizedConstructId,
      filename,
      storage_path: filename,
      content: mdContent,
      sha256: sha256(mdContent),
      metadata: fileMetadata,
      file_type: 'conversation'
    };

    if (existing) {
      const { error } = await supabase
        .from('vault_files')
        .update(record)
        .eq('id', existing.id);

      if (error) throw error;
      console.log(`✅ [SupabaseStore] Updated conversation: ${target.sessionId}`);
    } else {
      const { error } = await supabase
        .from('vault_files')
        .insert(record);

      if (error) throw error;
      console.log(`✅ [SupabaseStore] Created conversation: ${target.sessionId}`);
    }

    return { success: true, source: 'supabase' };
  } catch (err) {
    console.error('❌ [SupabaseStore] Write failed:', err.message);
    return null;
  }
}

async function subscribeToConversations(callback) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const channel = supabase
    .channel('vvault_conversations')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'vault_files',
        filter: 'file_type=eq.conversation'
      },
      (payload) => {
        console.log('🔔 [SupabaseStore] Realtime update:', payload.eventType);
        if (callback) callback(payload);
      }
    )
    .subscribe();

  console.log('✅ [SupabaseStore] Subscribed to conversation updates');
  return channel;
}

export {
  readConversationsFromSupabase,
  writeConversationToSupabase,
  subscribeToConversations,
  resolveSupabaseUserId,
  normalizeUserLookupContext,
  shouldPreferVvaultApiConversationRead,
  resolveVaultFileUpdatedAt,
  formatMarkdownTranscript,
  parseMarkdownTranscript,
  normalizeConversationMessages,
  mergeConversationGroupMessages,
};
