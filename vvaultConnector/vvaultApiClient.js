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

const VVAULT_API_BASE_URL = process.env.VVAULT_API_BASE_URL;

function getBaseUrl() {
  if (!VVAULT_API_BASE_URL) {
    console.warn('⚠️ [VVAULTApiClient] VVAULT_API_BASE_URL not set');
    return null;
  }
  return VVAULT_API_BASE_URL.replace(/\/$/, '');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
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

/**
 * Get transcript for a specific construct
 * @param {string} constructId - e.g., "zen-001"
 * @returns {Promise<{success: boolean, content: string, messages: Array, construct_id: string} | null>}
 */
async function getTranscript(constructId) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;

  try {
    console.log(`📥 [VVAULTApiClient] Fetching transcript for: ${constructId}`);
    
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/transcript/${constructId}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }
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
async function updateTranscript(constructId, content) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return false;

  try {
    console.log(`📤 [VVAULTApiClient] Updating transcript for: ${constructId}`);
    
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/transcript/${constructId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
async function listConstructs() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;

  try {
    console.log(`📋 [VVAULTApiClient] Listing all constructs`);
    
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chatty/constructs`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
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

/**
 * Parse markdown transcript into messages array
 * @param {string} content - markdown transcript
 * @returns {Array<{role: string, content: string, id: string, timestamp: string}>}
 */
function parseMarkdownToMessages(content) {
  if (!content) return [];
  
  const messages = [];
  const lines = content.split('\n');
  let currentRole = null;
  let currentContent = [];
  let messageIndex = 0;

  for (const line of lines) {
    const userMatch = line.match(/^\*\*User\*\*:\s*(.*)$/);
    const assistantMatch = line.match(/^\*\*Assistant\*\*:\s*(.*)$/);
    const zenMatch = line.match(/^\*\*Zen\*\*:\s*(.*)$/);

    if (userMatch) {
      if (currentRole && currentContent.length) {
        messages.push({
          id: `msg_${messageIndex++}`,
          role: currentRole,
          content: currentContent.join('\n').trim(),
          timestamp: new Date().toISOString()
        });
      }
      currentRole = 'user';
      currentContent = [userMatch[1]];
    } else if (assistantMatch || zenMatch) {
      if (currentRole && currentContent.length) {
        messages.push({
          id: `msg_${messageIndex++}`,
          role: currentRole,
          content: currentContent.join('\n').trim(),
          timestamp: new Date().toISOString()
        });
      }
      currentRole = 'assistant';
      currentContent = [(assistantMatch || zenMatch)[1]];
    } else if (currentRole && line.trim()) {
      currentContent.push(line);
    }
  }

  if (currentRole && currentContent.length) {
    messages.push({
      id: `msg_${messageIndex++}`,
      role: currentRole,
      content: currentContent.join('\n').trim(),
      timestamp: new Date().toISOString()
    });
  }

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
    const roleLabel = msg.role === 'user' ? '**User**' : '**Zen**';
    md += `${roleLabel}: ${msg.content}\n\n`;
  }
  return md;
}

export {
  getTranscript,
  updateTranscript,
  listConstructs,
  parseMarkdownToMessages,
  formatMessagesToMarkdown,
  getBaseUrl
};
