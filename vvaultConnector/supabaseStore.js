/**
 * Supabase Store for VVAULT Conversations
 * 
 * Priority: VVAULT API (source of truth) → Supabase (fallback)
 * 
 * The VVAULT API is the canonical source for conversation transcripts.
 * Supabase is used as a fallback when the API is unavailable.
 * 
 * Convention (CRITICAL - NEVER DEVIATE):
 * - Supabase path: "/vvault_files/users/{shard}/{userId}/instances/{constructName}/chatty/chat_with_{constructId}.md"
 * - filename in table: "instances/{constructName}/chatty/chat_with_{constructId}.md"
 * - constructName = constructId WITHOUT version suffix (zen-001 -> zen, katana-001 -> katana)
 * - file_type: "conversation"
 * - metadata: { sessionId, title, constructId, constructName, constructCallsign, messages: [...] }
 */

import { getSupabaseClient } from '../server/lib/supabaseClient.js';
import * as vvaultApi from './vvaultApiClient.js';
import crypto from 'crypto';

function sha256(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex');
}

function formatMarkdownTranscript(title, messages) {
  let md = `# ${title || 'Conversation'}\n\n`;
  for (const msg of messages || []) {
    const roleLabel = msg.role === 'user' ? '**User**' : '**Assistant**';
    md += `${roleLabel}: ${msg.content}\n\n`;
  }
  return md;
}

function parseMarkdownTranscript(content) {
  if (!content) return [];
  const messages = [];
  const lines = content.split('\n');
  let currentRole = null;
  let currentContent = [];
  let currentTimestamp = null;

  // User identifiers - these are ALWAYS user messages (case insensitive)
  const USER_PATTERNS = /^(you|user|human|devon|me|i)$/i;
  
  // Detect if speaker is user (returns true) or assistant (returns false)
  function isUserSpeaker(name) {
    return USER_PATTERNS.test(name);
  }

  for (const line of lines) {
    // Match timestamp lines like [2025-11-09T...] or (2026-01-20T12:33:50.563179)
    const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/) || 
                           line.match(/\((\d{4}-\d{2}-\d{2}T[\d:.]+)\)/);
    if (timestampMatch) {
      currentTimestamp = timestampMatch[1];
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
      currentTimestamp = null;
      continue;
    }
    
    // FORMAT 2: ChatGPT export - "Name said:" on its own line
    const saidMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s+said:\s*$/i);
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
      currentTimestamp = null;
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
        currentTimestamp = null;
        continue;
      }
    }
    
    // Add content to current message (skip empty lines at start)
    if (currentRole && line.trim()) {
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
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{0,4}$/i, // Date headers like "November 2025" or "November 9, 2025"
    /^[a-z]+-\d+_chat_with_[a-z]+-\d+$/i, // Session IDs like "zen-001_chat_with_zen-001"
    /^[A-Za-z]+\n+-{2,}/,  // Name followed by dashes (section headers like "Katana\n---")
    /Native Chatty messages will append here/i, // Template text
    /^---+$/,  // Horizontal rules alone
    /^#{1,6}\s/, // Markdown headers
    /^CONVERSATION_CREATED:/i, // Internal markers
    /^\(\*.*\*\)$/, // Template markers like (*Native Chatty...)
    /^System\s*\([^)]+\):\s*Test message/i, // Test messages
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
  
  return messages.filter(m => !isGarbageMessage(m.content));
}

async function resolveSupabaseUserId(emailOrId) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    // First try to find by email or name
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${emailOrId},name.eq.${emailOrId}`)
      .limit(1)
      .single();

    if (!error && data) {
      console.log(`✅ [SupabaseStore] Found user by email/name: ${emailOrId} -> ${data.id}`);
      return data.id;
    }

    // Fall back to default shard user (VVAULT uses sharding)
    const { data: shardUser, error: shardError } = await supabase
      .from('users')
      .select('id')
      .eq('name', 'shard_0000')
      .limit(1)
      .single();

    if (!shardError && shardUser) {
      console.log(`✅ [SupabaseStore] Using shard_0000 user for: ${emailOrId} -> ${shardUser.id}`);
      return shardUser.id;
    }

    console.log(`⚠️ [SupabaseStore] User not found for: ${emailOrId}`);
    return null;
  } catch (err) {
    console.error('❌ [SupabaseStore] Error resolving user:', err.message);
    return null;
  }
}

/**
 * Read conversations from VVAULT API first, then Supabase as fallback
 * The VVAULT API is the canonical source for real conversation data
 */
async function readConversationsFromVVAULTApi(userEmailOrId, constructId = null) {
  console.log(`📡 [SupabaseStore] Attempting VVAULT API for user: ${userEmailOrId}, construct: ${constructId || 'all'}`);
  
  try {
    // If specific constructId, fetch just that one
    if (constructId) {
      const transcriptData = await vvaultApi.getTranscript(constructId);
      if (transcriptData && transcriptData.success) {
        const messages = vvaultApi.parseMarkdownToMessages(transcriptData.content);
        console.log(`✅ [SupabaseStore] VVAULT API returned ${messages.length} messages for ${constructId}`);
        
        return [{
          sessionId: `${constructId}_chat_with_${constructId}`,
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
    const constructs = await vvaultApi.listConstructs();
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
      const transcriptData = await vvaultApi.getTranscript(construct.construct_id);
      if (transcriptData && transcriptData.success) {
        const messages = vvaultApi.parseMarkdownToMessages(transcriptData.content);
        const constructName = construct.construct_id.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase());
        
        conversations.push({
          sessionId: `${construct.construct_id}_chat_with_${construct.construct_id}`,
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
  // First try VVAULT API (canonical source of truth)
  const apiResult = await readConversationsFromVVAULTApi(userEmailOrId, constructId);
  if (apiResult !== null) {
    return apiResult;
  }

  console.log('⚠️ [SupabaseStore] VVAULT API unavailable, falling back to direct Supabase');
  
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.log('⚠️ [SupabaseStore] No Supabase client - falling back to PostgreSQL');
    return null;
  }

  try {
    const supabaseUserId = await resolveSupabaseUserId(userEmailOrId);
    if (!supabaseUserId) {
      console.log(`⚠️ [SupabaseStore] Could not resolve user: ${userEmailOrId}`);
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
    
    // Query 3: Look for chat_with_*.md files without path prefix (legacy uploads)
    const { data: legacyFiles, error: legacyError } = await supabase
      .from('vault_files')
      .select('*')
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
      
      const parsedMessages = parseMarkdownTranscript(file.content);
      
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
      
      const messages = metadata.messages?.length > 0 ? metadata.messages : parsedMessages;

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
      const canonicalSessionId = extractedConstructId 
        ? `${extractedConstructId}_chat_with_${extractedConstructId}`
        : (metadata.sessionId || file.filename.replace('chat/', '').replace('.md', ''));

      // Generate clean title from constructId (e.g., "lin-001" → "Lin", "katana-001" → "Katana")
      const generateCleanTitle = (constructId) => {
        if (!constructId) return null;
        const baseName = constructId.replace(/-\d+$/, ''); // Remove version suffix
        return baseName.charAt(0).toUpperCase() + baseName.slice(1).toLowerCase();
      };
      
      const cleanTitle = metadata.title || generateCleanTitle(extractedConstructId) || file.filename;

      return {
        sessionId: canonicalSessionId,
        title: cleanTitle,
        constructId: extractedConstructId,
        constructName: metadata.constructName || generateCleanTitle(extractedConstructId),
        constructCallsign: metadata.constructCallsign || extractedConstructId,
        createdAt: file.created_at,
        updatedAt: file.created_at,
        messages
      };
    });

    console.log(`📥 [SupabaseStore] Read ${conversations.length} conversations for user: ${userEmailOrId}`);
    return conversations;
  } catch (err) {
    console.error('❌ [SupabaseStore] Read failed:', err.message);
    return null;
  }
}

async function writeConversationToSupabase(params) {
  const {
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
    const supabaseUserId = await resolveSupabaseUserId(lookupId);
    if (!supabaseUserId) {
      console.log(`⚠️ [SupabaseStore] Could not resolve user: ${lookupId}`);
      return null;
    }

    // CRITICAL: Match VVAULT Supabase path pattern - instances/{constructName}/chatty/chat_with_{constructId}.md
    // constructName = constructId WITHOUT version suffix (zen-001 -> zen, katana-001 -> katana)
    const constructName = (constructId || 'unknown').replace(/-\d+$/, '');
    const filename = `instances/${constructName}/chatty/chat_with_${constructId || 'unknown'}.md`;

    const { data: existing } = await supabase
      .from('vault_files')
      .select('*')
      .eq('user_id', supabaseUserId)
      .eq('filename', filename)
      .single();

    let messages = [];
    let existingMetadata = {};

    if (existing) {
      existingMetadata = typeof existing.metadata === 'string' 
        ? JSON.parse(existing.metadata) 
        : (existing.metadata || {});
      messages = existingMetadata.messages || parseMarkdownTranscript(existing.content);
    }

    if (content && !content.startsWith('CONVERSATION_CREATED:')) {
      messages.push({
        role: role || 'user',
        content,
        timestamp: timestamp || new Date().toISOString()
      });
    }

    const mdContent = formatMarkdownTranscript(title || existingMetadata.title || 'Conversation', messages);
    const fileMetadata = {
      ...existingMetadata,
      sessionId,
      title: title || existingMetadata.title || 'Untitled',
      constructId,
      constructName,
      constructCallsign,
      messages,
      lastUpdated: new Date().toISOString()
    };

    const record = {
      user_id: supabaseUserId,
      construct_id: constructId || null,
      filename,
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
      console.log(`✅ [SupabaseStore] Updated conversation: ${sessionId}`);
    } else {
      const { error } = await supabase
        .from('vault_files')
        .insert(record);

      if (error) throw error;
      console.log(`✅ [SupabaseStore] Created conversation: ${sessionId}`);
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
  formatMarkdownTranscript,
  parseMarkdownTranscript
};
