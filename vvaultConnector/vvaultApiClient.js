/**
 * VVAULT API Client
 * 
 * Connects to the VVAULT API endpoints to fetch conversation transcripts.
 * This maintains the VVAULT–Chatty separation by using the vault's API
 * rather than directly accessing Supabase.
 * 
 * API Endpoints:
 * - GET /api/chatty/transcript/:constructId - fetch conversation
 * - POST /api/chatty/transcript/:constructId - update conversation
 * - GET /api/chatty/constructs - list all constructs
 */

function getBaseUrl() {
  const configuredBaseUrl =
    process.env.VVAULT_API_BASE_URL ||
    process.env.VVAULT_URL ||
    process.env.VVAULT_BASE_URL;
  if (!configuredBaseUrl) {
    console.warn('⚠️ [VVAULTApiClient] VVAULT API origin not set');
    return null;
  }
  return configuredBaseUrl.replace(/\/$/, '');
}

function isSupabaseUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function normalizeChattyUserContext(userContext) {
  if (typeof userContext === 'string') {
    return { userEmail: userContext, supabaseUserId: null };
  }
  if (!userContext || typeof userContext !== 'object') {
    return { userEmail: null, supabaseUserId: null };
  }
  return {
    userEmail: userContext.userEmail || userContext.email || null,
    supabaseUserId: userContext.supabaseUserId || userContext.supabase_user_id || null,
  };
}

function getChattyAuthHeaders(userContext) {
  const { userEmail, supabaseUserId } = normalizeChattyUserContext(userContext);
  const headers = { 'Content-Type': 'application/json' };
  const apiKey = process.env.VVAULT_SERVICE_TOKEN;
  if (apiKey) {
    headers['X-Chatty-Key'] = apiKey;
  }
  if (userEmail) {
    headers['X-Chatty-User'] = userEmail;
  }
  if (isSupabaseUuid(supabaseUserId)) {
    const normalizedSupabaseUserId = supabaseUserId.trim();
    headers['X-Chatty-Supabase-User-Id'] = normalizedSupabaseUserId;
    headers['X-Chatty-User-Id'] = normalizedSupabaseUserId;
  }
  return headers;
}

function normalizeConstructFilesPayload(data) {
  if (!data || data.success !== true || data.status !== 'body_native') {
    return null;
  }
  if (Array.isArray(data.files)) {
    return data;
  }
  const files = ['assets', 'documents', 'identity']
    .flatMap((group) => Array.isArray(data[group])
      ? data[group].map((file) => ({ ...file, folder: group }))
      : []);
  if (!files.length) {
    return null;
  }
  return { ...data, files };
}

const CHATTY_METADATA_COMMENT_RE = /^\s*<!--\s*CHATTY_METADATA\s+([A-Za-z0-9_-]+)\s*-->\s*$/;

function encodeChattyMetadataComment(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return '';
  }
  const keys = Object.keys(metadata).filter((key) => typeof key === 'string');
  if (keys.length === 0) {
    return '';
  }
  try {
    const encoded = Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64url');
    return `\n\n<!-- CHATTY_METADATA ${encoded} -->`;
  } catch {
    return '';
  }
}

function decodeChattyMetadataComment(line) {
  const match = String(line || '').match(CHATTY_METADATA_COMMENT_RE);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function appendChattyMetadataComment(content, metadata) {
  const comment = encodeChattyMetadataComment(metadata);
  return comment ? `${content || ''}${comment}` : content;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function transcriptReadTimeoutMs() {
  const configured = Number(process.env.VVAULT_TRANSCRIPT_READ_TIMEOUT_MS || 30000);
  return Number.isFinite(configured) && configured > 0 ? configured : 30000;
}

/**
 * Get transcript for a specific construct
 * @param {string} constructId - e.g., "zen-001"
 * @returns {Promise<{success: boolean, content: string, messages: Array, construct_id: string} | null>}
 */
async function getTranscript(constructId, userContext) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;

  try {
    console.log(`📥 [VVAULTApiClient] Fetching transcript for: ${constructId}`);
    
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/transcript/${constructId}`,
      {
        method: 'GET',
        headers: getChattyAuthHeaders(userContext)
      },
      transcriptReadTimeoutMs()
    );

    if (!response.ok) {
      console.warn(`⚠️ [VVAULTApiClient] API returned ${response.status} for ${constructId}`);
      return null;
    }

    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ [VVAULTApiClient] Got transcript for ${constructId}:`, {
        contentLength: data.content?.length || 0,
        sha256: data.sha256?.substring(0, 8)
      });
      return data;
    }
    
    console.warn(`⚠️ [VVAULTApiClient] API returned success=false for ${constructId}`);
    return null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`⚠️ [VVAULTApiClient] Request timed out for ${constructId}`);
    } else {
      console.error(`❌ [VVAULTApiClient] Error fetching ${constructId}:`, error.message);
    }
    return null;
  }
}

/**
 * Update transcript for a specific construct
 * @param {string} constructId - e.g., "zen-001"
 * @param {string} content - markdown transcript content
 * @returns {Promise<boolean>}
 */
async function updateTranscript(constructId, content, userContext) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return false;

  try {
    console.log(`📤 [VVAULTApiClient] Updating transcript for: ${constructId}`);
    
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/transcript/${constructId}`,
      {
        method: 'POST',
        headers: getChattyAuthHeaders(userContext),
        body: JSON.stringify({ content })
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [VVAULTApiClient] Update failed with ${response.status} for ${constructId}`);
      return false;
    }

    const data = await response.json();
    console.log(`✅ [VVAULTApiClient] Updated transcript for ${constructId}`);
    return data.success === true;
  } catch (error) {
    console.error(`❌ [VVAULTApiClient] Error updating ${constructId}:`, error.message);
    return false;
  }
}

/**
 * List all constructs with transcripts
 * @returns {Promise<Array<{construct_id: string, filename: string}> | null>}
 */
async function listConstructs(userContext) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;

  try {
    console.log(`📋 [VVAULTApiClient] Listing all constructs`);
    
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/constructs`,
      {
        method: 'GET',
        headers: getChattyAuthHeaders(userContext)
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [VVAULTApiClient] List constructs failed with ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.success && Array.isArray(data.constructs)) {
      console.log(`✅ [VVAULTApiClient] Found ${data.constructs.length} constructs`);
      return data.constructs;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ [VVAULTApiClient] Error listing constructs:`, error.message);
    return null;
  }
}

async function getConstructIdentity(constructId, userContext) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/construct/${constructId}/identity`,
      {
        method: 'GET',
        headers: getChattyAuthHeaders(userContext)
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [VVAULTApiClient] Identity read failed with ${response.status} for ${constructId}`);
      return null;
    }

    const data = await response.json();
    if (data?.success === true && data?.status === 'body_native') {
      return data;
    }
    return null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`⚠️ [VVAULTApiClient] Identity request timed out for ${constructId}`);
    } else {
      console.error(`❌ [VVAULTApiClient] Error fetching identity for ${constructId}:`, error.message);
    }
    return null;
  }
}

async function getConstructFiles(constructId, userContext) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/construct/${constructId}/files`,
      {
        method: 'GET',
        headers: getChattyAuthHeaders(userContext)
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [VVAULTApiClient] Construct files read failed with ${response.status} for ${constructId}`);
      return null;
    }

    const data = await response.json();
    return normalizeConstructFilesPayload(data);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`⚠️ [VVAULTApiClient] Construct files request timed out for ${constructId}`);
    } else {
      console.error(`❌ [VVAULTApiClient] Error fetching construct files for ${constructId}:`, error.message);
    }
    return null;
  }
}

async function getConstructMemories(constructId, userContext) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/construct/${constructId}/memories`,
      {
        method: 'GET',
        headers: getChattyAuthHeaders(userContext)
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [VVAULTApiClient] Memories read failed with ${response.status} for ${constructId}`);
      return null;
    }

    const data = await response.json();
    if (data?.success === true && data?.status === 'body_native') {
      return data;
    }
    return null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`⚠️ [VVAULTApiClient] Memories request timed out for ${constructId}`);
    } else {
      console.error(`❌ [VVAULTApiClient] Error fetching memories for ${constructId}:`, error.message);
    }
    return null;
  }
}

/**
 * Strip surrounding quotes from content if the entire message is wrapped in them
 * Handles: "content" or 'content' - removes outer quotes only
 */
function stripSurroundingQuotes(content) {
  if (!content) return content;
  
  // Check for surrounding double quotes
  if (content.startsWith('"') && content.endsWith('"') && content.length > 2) {
    return content.slice(1, -1);
  }
  
  // Check for surrounding single quotes
  if (content.startsWith("'") && content.endsWith("'") && content.length > 2) {
    return content.slice(1, -1);
  }
  
  return content;
}

/**
 * Parse markdown transcript into messages array
 * Handles multiple formats:
 * - VVAULT timestamp format: "10:42:22 AM EST - Devon [2025-12-18T15:42:22.552Z]: message"
 * - VVAULT format: "You said:" / "Synth said:" / "Zen said:" / "[Name] said:"
 * - Chatty format: "**User**:" / "**Assistant**:" / "**Zen**:"
 * 
 * @param {string} content - markdown transcript
 * @returns {Array<{role: string, content: string, id: string, timestamp: string}>}
 */
function parseMarkdownToMessages(content) {
  if (!content) return [];
  
  const messages = [];
  const lines = content.split('\n');
  let currentRole = null;
  let currentContent = [];
  let currentTimestamp = null;
  let currentMetadata = null;
  let messageIndex = 0;
  let inMetadataBlock = false;

  // Helper to save current message
  function saveCurrentMessage() {
    if (currentRole && currentContent.length) {
      const msgContent = currentContent.join('\n').trim();
      if (msgContent) {
        messages.push({
          id: `msg_${messageIndex++}`,
          role: currentRole,
          content: stripSurroundingQuotes(msgContent),
          timestamp: currentTimestamp || new Date().toISOString(),
          metadata: currentMetadata || {},
        });
      }
    }
    currentMetadata = null;
  }

  for (const line of lines) {
    const chattyMetadata = decodeChattyMetadataComment(line);
    if (chattyMetadata) {
      currentMetadata = chattyMetadata;
      continue;
    }

    // Skip metadata block
    if (line.includes('<!-- IMPORT_METADATA') || line.includes('<!--')) {
      inMetadataBlock = !line.includes('-->');
      continue;
    }
    if (line.includes('-->')) {
      inMetadataBlock = false;
      continue;
    }
    if (inMetadataBlock) continue;
    
    // Skip header lines and metadata
    if (line.startsWith('#') || line.startsWith('**Created') || 
        line.startsWith('**Session') || line.startsWith('**Construct') ||
        line.trim() === '---' || line.startsWith('[Maintain tone:')) {
      continue;
    }

    // VVAULT timestamp format variants:
    // Plain: "10:42:22 AM EST - Devon [2025-12-18T15:42:22.552Z]: message"
    // Bold: "**06:48:09 AM EST - Devon** [2025-12-13T11:48:09.613Z]: message"
    // Names with spaces: "10:42:22 AM EST - Devon Woodson [2025-12-18T15:42:22.552Z]: message"
    // Pattern: [**]TIME - NAME[**] [ISO_TIMESTAMP]: CONTENT
    const timestampMatch = line.match(/^\*{0,2}\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)?\s*(?:[A-Z]{2,4})?\s*-\s*([A-Za-z][A-Za-z\s\-]*?)\*{0,2}\s*\[([^\]]+)\]:\s*(.*)$/i);
    
    if (timestampMatch) {
      // Save previous message first
      saveCurrentMessage();
      
      const speaker = timestampMatch[1].trim().toLowerCase();
      const isoTimestamp = timestampMatch[2];
      const msgContent = timestampMatch[3];
      
      // Determine role based on speaker name
      // User names typically start with "devon" (may have last name), "you", "user"
      // Construct names = assistant
      const isUser = speaker.startsWith('devon') || speaker === 'you' || speaker === 'user';
      currentRole = isUser ? 'user' : 'assistant';
      currentTimestamp = isoTimestamp;
      currentContent = msgContent ? [msgContent] : [];
      continue;
    }

    // Chatty inline ISO timestamp format: "[ISO_TIMESTAMP] **User**: content"
    const inlineIsoBoldMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s+\*\*([^*]+)\*\*:\s*(.*)$/);
    if (inlineIsoBoldMatch) {
      saveCurrentMessage();

      const isoTimestamp = inlineIsoBoldMatch[1];
      const speaker = inlineIsoBoldMatch[2].trim().toLowerCase();
      const msgContent = inlineIsoBoldMatch[3];
      const isUser = speaker === 'user' || speaker === 'you' || speaker.startsWith('devon');

      currentRole = isUser ? 'user' : 'assistant';
      currentTimestamp = isoTimestamp;
      currentContent = msgContent ? [msgContent] : [];
      continue;
    }

    // Canonical body inline timestamp format: "**User** (ISO_TIMESTAMP): content"
    const speakerTimestampMatch = line.match(/^\*\*([^*]+)\*\*\s+\((\d{4}-\d{2}-\d{2}T[^)]+)\):\s*(.*)$/);
    if (speakerTimestampMatch) {
      saveCurrentMessage();

      const speaker = speakerTimestampMatch[1].trim().toLowerCase();
      const isoTimestamp = speakerTimestampMatch[2];
      const msgContent = speakerTimestampMatch[3];
      const isUser = speaker === 'user' || speaker === 'you' || speaker.startsWith('devon');

      currentRole = isUser ? 'user' : 'assistant';
      currentTimestamp = isoTimestamp;
      currentContent = msgContent ? [msgContent] : [];
      continue;
    }

    // VVAULT format: "You said:" - marks user message
    const youSaidMatch = line.match(/^You said:\s*$/i);
    // VVAULT format: "[Name] said:" - marks assistant message
    const nameSaidMatch = line.match(/^(\w+) said:\s*$/i);
    
    // Chatty format: "**User**:", "**Assistant**:", "**Zen**:"
    const userMatch = line.match(/^\*\*User\*\*:\s*(.*)$/);
    const assistantMatch = line.match(/^\*\*(?:Assistant|Zen|Synth|Katana|Lin)\*\*:\s*(.*)$/i);

    if (youSaidMatch || userMatch) {
      saveCurrentMessage();
      currentRole = 'user';
      currentTimestamp = new Date().toISOString();
      currentContent = userMatch ? [userMatch[1]] : [];
    } else if (nameSaidMatch || assistantMatch) {
      saveCurrentMessage();
      currentRole = 'assistant';
      currentTimestamp = new Date().toISOString();
      currentContent = assistantMatch ? [assistantMatch[1]] : [];
    } else if (currentRole && line.trim()) {
      // Continuation of current message
      currentContent.push(line);
    }
  }

  // Don't forget the last message
  saveCurrentMessage();

  return messages;
}

/**
 * Format messages array to markdown transcript
 * @param {string} title - conversation title
 * @param {Array<{role: string, content: string}>} messages
 * @returns {string}
 */
function formatMessagesToMarkdown(title, messages) {
  let md = `# ${title || 'Conversation'}\n\n`;
  for (const msg of messages || []) {
    const timestampPrefix = typeof msg.timestamp === 'string' && msg.timestamp.trim()
      ? `[${msg.timestamp.trim()}] `
      : '';
    const roleLabel = msg.role === 'user' ? '**User**' : '**Zen**';
    md += `${timestampPrefix}${roleLabel}: ${msg.content}\n\n`;
  }
  return md;
}

/**
 * Post a message to VVAULT and get LLM response
 * VVAULT handles: LLM inference (Ollama), transcript saving, memory management
 * 
 * @param {Object} params
 * @param {string} params.constructId - e.g., "zen-001"
 * @param {string} params.message - user's message content
 * @param {string} [params.userId] - optional user ID
 * @returns {Promise<{success: boolean, response: string, construct_id: string} | null>}
 */
async function postMessage({ constructId, message, userId, userEmail, supabaseUserId }) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.error('❌ [VVAULTApiClient] VVAULT_API_BASE_URL not set, cannot post message');
    return null;
  }

  try {
    console.log(`📤 [VVAULTApiClient] Posting message to construct: ${constructId}`);
    
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/message`,
      {
        method: 'POST',
        headers: getChattyAuthHeaders({ userEmail: userEmail || (String(userId || '').includes('@') ? userId : null), supabaseUserId }),
        body: JSON.stringify({ 
          constructId, 
          message,
          userId 
        })
      },
      30000 // 30 second timeout for LLM response
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [VVAULTApiClient] Message post failed: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ [VVAULTApiClient] Got response from ${constructId}:`, {
        responseLength: data.response?.length || 0
      });
      return data;
    }
    
    console.warn(`⚠️ [VVAULTApiClient] API returned success=false for message to ${constructId}`);
    return null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`⚠️ [VVAULTApiClient] Message request timed out for ${constructId}`);
    } else {
      console.error(`❌ [VVAULTApiClient] Error posting message to ${constructId}:`, error.message);
    }
    return null;
  }
}

/**
 * Append a single message to a construct's transcript
 * This is more efficient than fetching/replacing the whole transcript
 * 
 * @param {Object} params
 * @param {string} params.constructId - e.g., "zen-001"
 * @param {string} params.role - "user" | "assistant" | "system"
 * @param {string} params.content - message content
 * @param {string} [params.name] - speaker name (e.g., "Devon", "Zen")
 * @param {string} [params.timestamp] - ISO timestamp (optional, defaults to now)
 * @returns {Promise<{success: boolean, action: string} | null>}
 */
async function appendMessage({ constructId, role, content, name, timestamp, userEmail, supabaseUserId, metadata, attachments, projectName, rootPath }) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.error('❌ [VVAULTApiClient] VVAULT_API_BASE_URL not set, cannot append message');
    return null;
  }

  try {
    console.log(`📝 [VVAULTApiClient] Appending ${role} message to ${constructId}`);
    
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/transcript/${constructId}/message`,
      {
        method: 'POST',
        headers: getChattyAuthHeaders({ userEmail, supabaseUserId }),
        body: JSON.stringify({ 
          role, 
          content: appendChattyMetadataComment(content, metadata),
          name,
          timestamp: timestamp || new Date().toISOString(),
          metadata,
          attachments,
          projectName,
          rootPath
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [VVAULTApiClient] Append message failed: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ [VVAULTApiClient] Appended message to ${constructId}`);
      return data;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ [VVAULTApiClient] Error appending message to ${constructId}:`, error.message);
    return null;
  }
}

export {
  getTranscript,
  updateTranscript,
  listConstructs,
  getConstructFiles,
  getConstructIdentity,
  getConstructMemories,
  parseMarkdownToMessages,
  formatMessagesToMarkdown,
  getBaseUrl,
  getChattyAuthHeaders,
  normalizeConstructFilesPayload,
  normalizeChattyUserContext,
  isSupabaseUuid,
  postMessage,
  appendMessage
};
