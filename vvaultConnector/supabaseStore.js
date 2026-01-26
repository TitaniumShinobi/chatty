/**
 * Supabase Store for VVAULT Conversations
 * 
 * Priority: VVAULT API (source of truth) → Supabase (fallback)
 * 
 * The VVAULT API is the canonical source for conversation transcripts.
 * Supabase is used as a fallback when the API is unavailable.
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

function formatMarkdownTranscript(title, messages) {
  let md = `# ${title || 'Conversation'}\n\n`;
  for (const msg of messages || []) {
    // Date headers are stored as plain text on their own line (not as speaker messages)
    if (msg.isDateHeader) {
      md += `${msg.content}\n\n`;
    } else {
      const roleLabel = msg.role === 'user' ? '**User**' : '**Assistant**';
      md += `${roleLabel}: ${msg.content}\n\n`;
    }
  }
  return md;
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

function parseMarkdownTranscript(content) {
  if (!content) return [];
  const messages = [];
  const lines = content.split('\n');
  let currentRole = null;
  let currentContent = [];
  let currentTimestamp = null;

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

  for (const line of lines) {
    // Match timestamp lines like [2025-11-09T...] or (2026-01-20T12:33:50.563179)
    const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/) || 
                           line.match(/\((\d{4}-\d{2}-\d{2}T[\d:.]+)\)/);
    if (timestampMatch) {
      currentTimestamp = timestampMatch[1];
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
      currentTimestamp = null;
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
      currentTimestamp = null;
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
      currentTimestamp = null;
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

  // Date header pattern - matches "Month Day, Year" or "Month Year" 
  // e.g., "November 9, 2025", "December 19, 2025", "January 20, 2026", "November 2025"
  const DATE_HEADER_PATTERN = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2},?\s+)?\d{4}$/i;
  
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
  
  // Check if content is a date header (should be preserved in transcript but hidden in UI)
  const isDateHeaderContent = (content) => {
    if (!content) return false;
    const trimmed = content.trim();
    return DATE_HEADER_PATTERN.test(trimmed);
  };
  
  // Mark date headers with isDateHeader flag, filter out garbage
  return messages
    .filter(m => !isGarbageMessage(m.content))
    .map(m => {
      if (isDateHeaderContent(m.content)) {
        return { ...m, isDateHeader: true };
      }
      return m;
    });
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
      
      // Use metadata messages first, then parsed (skip garbage parsed)
      let messages;
      if (metadata.messages?.length > 0) {
        messages = metadata.messages;
      } else if (isLegacyFile && hasGarbageParsedMessages) {
        console.log(`⏭️ [SupabaseStore] Skipping garbage legacy file: ${file.filename}`);
        messages = []; // Skip garbage messages from legacy files
      } else {
        messages = parsedMessages;
      }

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

    // CRITICAL: Match VVAULT Supabase path pattern - instances/{constructId}/chatty/chat_with_{constructId}.md
    // Use FULL constructId with version suffix in folder path (zen-001, lin-001, katana-001)
    const filename = `instances/${constructId || 'unknown'}/chatty/chat_with_${constructId || 'unknown'}.md`;

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
      
      messages.push({
        role: role || 'user',
        content,
        timestamp: newTimestamp
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
