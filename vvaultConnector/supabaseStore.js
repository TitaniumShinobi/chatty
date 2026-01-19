/**
 * Supabase Store for VVAULT Conversations
 * 
 * Uses the vault_files table to store conversation transcripts as markdown,
 * matching VVAULT's filesystem semantics while using Supabase as source of truth.
 * 
 * Convention:
 * - filename: "chat/{constructId}/{sessionId}.md"
 * - file_type: "conversation"
 * - metadata: { sessionId, title, constructId, constructName, constructCallsign, messages: [...] }
 */

import { getSupabaseClient } from '../server/lib/supabaseClient.js';
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

  for (const line of lines) {
    const userMatch = line.match(/^\*\*User\*\*:\s*(.*)$/);
    const assistantMatch = line.match(/^\*\*Assistant\*\*:\s*(.*)$/);

    if (userMatch) {
      if (currentRole && currentContent.length) {
        messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
      }
      currentRole = 'user';
      currentContent = [userMatch[1]];
    } else if (assistantMatch) {
      if (currentRole && currentContent.length) {
        messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
      }
      currentRole = 'assistant';
      currentContent = [assistantMatch[1]];
    } else if (currentRole && line.trim()) {
      currentContent.push(line);
    }
  }

  if (currentRole && currentContent.length) {
    messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
  }

  return messages;
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

async function readConversationsFromSupabase(userEmailOrId, constructId = null) {
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

    if (error) {
      console.error('❌ [SupabaseStore] Read error:', error.message);
      return null;
    }

    const conversations = (data || []).map(file => {
      const metadata = typeof file.metadata === 'string' 
        ? JSON.parse(file.metadata) 
        : (file.metadata || {});
      
      // Debug: Log what we're reading from Supabase
      console.log(`🔍 [SupabaseStore] Processing file:`, {
        filename: file.filename,
        hasContent: !!file.content,
        contentLength: file.content?.length || 0,
        metadataMessages: metadata.messages?.length || 0,
        metadata: JSON.stringify(metadata).substring(0, 200)
      });
      
      const parsedMessages = parseMarkdownTranscript(file.content);
      const messages = metadata.messages?.length > 0 ? metadata.messages : parsedMessages;
      
      console.log(`📝 [SupabaseStore] Message counts:`, {
        fromMetadata: metadata.messages?.length || 0,
        fromMarkdown: parsedMessages.length,
        final: messages.length
      });

      return {
        sessionId: metadata.sessionId || file.filename.replace('chat/', '').replace('.md', ''),
        title: metadata.title || file.filename,
        constructId: metadata.constructId || file.construct_id,
        constructName: metadata.constructName,
        constructCallsign: metadata.constructCallsign,
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

    // Match VVAULT filesystem path: instances/{constructId}/chatty/chat_with_{constructId}.md
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
