import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getImportPathForUser, ensureImportDirectory } from '../lib/importStorage.js';

/**
 * Convert conversation to markdown format (same as VVAULT format for consistency)
 * Reuses conversion logic but writes to import storage instead
 */
function convertConversationToMarkdown(conversation, gptConfig, source) {
  const conversationId = conversation.id || conversation.conversation_id || crypto.randomUUID();
  const hash = crypto.createHash('md5').update(conversationId).digest('hex');
  const hashInt = parseInt(hash.substring(0, 6), 16);
  const callsign = (hashInt % 999) + 1;
  
  // Extract messages from conversation (same logic as convertConversationToTranscript)
  const messages = [];
  
  if (conversation.mapping) {
    // ChatGPT tree structure traversal
    const rootNodeId = conversation.current_node || Object.keys(conversation.mapping)[0];
    const visited = new Set();
    
    const traverseTree = (nodeId) => {
      if (!nodeId || visited.has(nodeId)) return;
      
      const node = conversation.mapping[nodeId];
      if (!node) return;
      
      visited.add(nodeId);
      
      if (node.children && Array.isArray(node.children)) {
        for (const childId of node.children) {
          traverseTree(childId);
        }
      }
      
      if (node.message) {
        const msg = node.message;
        const author = msg.author?.role || msg.author?.name || 'unknown';
        const contentParts = msg.content?.parts || [];
        const content = contentParts.length > 0 
          ? contentParts.map(part => typeof part === 'string' ? part : part.text || '').join('\n').trim()
          : (msg.content?.text || msg.content || '');
        
        if (content && typeof content === 'string' && content.trim()) {
          const role = author === 'user' || author === 'human' ? 'user' : 'assistant';
          messages.push({
            role,
            content: content.trim(),
            timestamp: msg.create_time || conversation.create_time || Date.now() / 1000
          });
        }
      }
    };
    
    traverseTree(rootNodeId);
  }
  
  // If no messages found, try simpler approach
  if (messages.length === 0 && conversation.messages) {
    conversation.messages.forEach(msg => {
      const content = msg.content?.parts?.[0] || msg.content?.text || msg.content || '';
      if (content && typeof content === 'string' && content.trim()) {
        const role = msg.role === 'user' || msg.author?.role === 'user' ? 'user' : 'assistant';
        messages.push({
          role,
          content: content.trim(),
          timestamp: msg.timestamp || conversation.create_time || Date.now() / 1000
        });
      }
    });
  }
  
  // Build markdown content
  const title = conversation.title || 'Imported Conversation';
  const importMetadata = {
    importedFrom: source,
    conversationId: conversationId,
    conversationTitle: title,
    detectedModel: gptConfig?.modelId || 'unknown',
    gptConfig: gptConfig?.hasFullConfig ? {
      name: gptConfig.name,
      description: gptConfig.description,
      instructions: gptConfig.instructions
    } : null,
    importedAt: new Date().toISOString()
  };
  
  let markdown = `# ${title}\n\n-=-=-=-\n\n`;
  markdown += `<!-- IMPORT_METADATA\n${JSON.stringify(importMetadata, null, 2)}\n-->\n\n`;
  
  // Add messages in markdown format
  let currentDate = '';
  messages.forEach(msg => {
    const date = new Date(msg.timestamp * 1000);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    const role = msg.role === 'user' ? 'You' : (gptConfig?.modelId || 'Assistant');
    
    // Add date header if date changed
    if (dateStr !== currentDate) {
      markdown += `## ${dateStr}\n\n`;
      currentDate = dateStr;
    }
    
    markdown += `**${timeStr} - ${role} said:** ${msg.content}\n\n`;
  });
  
  return { markdown, callsign };
}

/**
 * Persist imported conversations to separate storage (NOT VVAULT)
 * @param {Array} conversations - Array of conversation objects from import
 * @param {string} userId - User ID
 * @param {string} runtimeId - Runtime ID (GPT ID)
 * @param {string} source - Source provider ('chatgpt', 'gemini', etc.)
 * @param {object} gptConfig - GPT configuration (optional, can be extracted per conversation)
 */
export async function persistImportToImportStore(conversations, userId, runtimeId, source, gptConfig = {}) {
  if (!conversations || conversations.length === 0) {
    console.log(`📦 [ImportStorage] No conversations to persist for runtime ${runtimeId}`);
    return { processedCount: 0, errorCount: 0 };
  }
  
  // Ensure directory exists
  await ensureImportDirectory(userId, runtimeId);
  
  let processedCount = 0;
  let errorCount = 0;
  
  for (const convo of conversations) {
    try {
      // Extract GPT config for this conversation if available
      const conversationGptConfig = convo.gptConfig || gptConfig;
      
      const { markdown, callsign } = convertConversationToMarkdown(convo, conversationGptConfig, source);
      const filePath = path.join(
        getImportPathForUser(userId, runtimeId),
        `imported_chat_${String(callsign).padStart(3, '0')}.md`
      );
      
      // Write to import storage (NOT VVAULT)
      await fs.writeFile(filePath, markdown, 'utf-8');
      processedCount++;
      
      if (processedCount % 10 === 0) {
        console.log(`📝 [ImportStorage] Processed ${processedCount}/${conversations.length} conversations...`);
      }
    } catch (error) {
      console.error(`❌ [ImportStorage] Failed to persist conversation ${convo.id || convo.title}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`✅ [ImportStorage] Persisted ${processedCount} conversations to import storage (${errorCount} errors)`);
  return { processedCount, errorCount };
}

/**
 * Parse imported conversation markdown file
 * Extracts metadata and messages from markdown format
 */
function parseImportedConversationFile(content, filename) {
  try {
    // Extract IMPORT_METADATA from HTML comment
    const metadataMatch = content.match(/<!-- IMPORT_METADATA\n([\s\S]*?)\n-->/);
    let importMetadata = null;
    
    if (metadataMatch) {
      try {
        importMetadata = JSON.parse(metadataMatch[1]);
      } catch (e) {
        console.warn(`⚠️ Failed to parse import metadata:`, e);
      }
    }
    
    // Extract title
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1] : filename.replace('.md', '').replace('imported_chat_', '');
    
    // Extract messages (same format as VVAULT)
    const messages = [];
    const messageRegex = /\*\*([^*]+) - ([^*]+) said:\*\* (.+?)(?=\n##|\n\*\*|$)/gs;
    let match;
    
    while ((match = messageRegex.exec(content)) !== null) {
      const [, time, role, msgContent] = match;
      messages.push({
        role: role.toLowerCase().includes('you') ? 'user' : 'assistant',
        content: msgContent.trim(),
        timestamp: time.trim()
      });
    }
    
    // Extract callsign from filename
    const callsignMatch = filename.match(/imported_chat_(\d+)\.md/);
    const callsign = callsignMatch ? callsignMatch[1] : null;
    
    // Get first message content for preview
    const previewContent = messages.length > 0 ? messages[0].content : '';
    
    return {
      id: `imported-${callsign || filename.replace('.md', '')}`,
      title,
      content: previewContent,
      timestamp: importMetadata?.importedAt || new Date().toISOString(),
      source: importMetadata?.importedFrom || 'import',
      filename,
      importMetadata,
      messages
    };
  } catch (error) {
    console.error(`❌ Failed to parse imported conversation file:`, error);
    return null;
  }
}

/**
 * Read imported conversations for a user's runtime
 * @param {string} userId - User ID
 * @param {string} runtimeId - Runtime ID
 * @returns {Promise<Array>} Array of conversation objects matching frontend ImportedRaw format
 */
export async function readImportedConversations(userId, runtimeId) {
  try {
    const importDir = getImportPathForUser(userId, runtimeId);
    
    // Check if directory exists
    try {
      await fs.access(importDir);
    } catch {
      // Directory doesn't exist, return empty array
      console.log(`📁 [ImportStorage] Directory doesn't exist: ${importDir}`);
      return [];
    }
    
    // Read all markdown files in directory
    const files = await fs.readdir(importDir);
    const conversations = [];
    
    for (const file of files) {
      if (file.endsWith('.md') && file.startsWith('imported_chat_')) {
        try {
          const filePath = path.join(importDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          
          // Parse markdown file
          const parsed = parseImportedConversationFile(content, file);
          if (parsed) {
            conversations.push(parsed);
          }
        } catch (error) {
          console.warn(`⚠️ [ImportStorage] Failed to read ${file}:`, error.message);
        }
      }
    }
    
    // Sort by imported date (newest first)
    conversations.sort((a, b) => {
      const dateA = new Date(a.timestamp || 0);
      const dateB = new Date(b.timestamp || 0);
      return dateB - dateA;
    });
    
    console.log(`✅ [ImportStorage] Read ${conversations.length} imported conversations from ${importDir}`);
    return conversations;
  } catch (error) {
    console.error(`❌ [ImportStorage] Failed to read imported conversations:`, error);
    return [];
  }
}
