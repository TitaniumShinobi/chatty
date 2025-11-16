const fs = require('fs').promises;
const path = require('path');
const { getUserTranscriptsPath, VVAULT_ROOT } = require('./config');

const LEGACY_DIR_NAME = 'users';
const LEGACY_PROVIDER_DIR = 'Chatty';
const CORE_SUFFIX = '_core_chat.md';
const CHAT_FILENAME_PATTERN = /^chat_with_[a-z0-9-]+\.md$/i;

async function readConversations(userId, constructId = '') {
  const conversations = [];
  
  // PER USER_REGISTRY_ENFORCEMENT_RUBRIC: User ID must be resolved before reading
  // NO FALLBACK SEARCHES - this breaks user isolation
  if (!userId) {
    throw new Error('User ID is required. Cannot read conversations without user identity.');
  }
  
  // Try to find user by email if userId looks like an email
  // This handles cases where Chatty passes email instead of VVAULT user ID
  let searchUserId = userId;
  if (userId && userId.includes('@')) {
    // userId is an email - search by email (but still enforce user matching)
    searchUserId = userId;
  }
  
  console.log(`🔍 [readConversations] Starting search for userId: ${searchUserId || 'null'} (constructId: ${constructId || 'none'})`);
  console.log(`🔍 [readConversations] VVAULT_ROOT: ${VVAULT_ROOT}`);
  console.log(`🔍 [readConversations] User ID type: ${searchUserId?.includes('@') ? 'email' : searchUserId?.match(/^[a-z_]+_\d+$/) ? 'LIFE format' : 'other'}`);
  
  try {
    const constructRecords = await readConstructTranscripts(searchUserId, constructId);
    conversations.push(...constructRecords);
    console.log(`✅ [readConversations] Found ${constructRecords.length} construct records`);
    
    // Log each conversation's constructId for debugging
    if (constructRecords.length > 0) {
      console.log(`📋 [readConversations] Conversation constructIds:`, 
        constructRecords.map(c => ({ 
          sessionId: c.sessionId, 
          constructId: c.constructId,
          title: c.title 
        }))
      );
    }
  } catch (error) {
    console.error(`❌ [readConversations] Failed to read construct transcripts for ${searchUserId}:`, error.message);
    console.error(`❌ [readConversations] Error stack:`, error.stack);
    console.error(`❌ [readConversations] VVAULT_ROOT exists:`, await safeAccess(VVAULT_ROOT).then(() => true).catch(() => false));
    
    // PER USER_REGISTRY_ENFORCEMENT_RUBRIC: NO FALLBACK SEARCHES
    // If user lookup fails, return error - do not search other users
    throw new Error(`Failed to read conversations for user ${searchUserId}: ${error.message}. User must exist in VVAULT registry.`);
  }

  if (conversations.length === 0) {
    console.log(`⚠️ [readConversations] No construct records found, checking legacy conversations...`);
    try {
    const legacy = await readLegacyConversations(userId);
    conversations.push(...legacy);
      console.log(`✅ [readConversations] Found ${legacy.length} legacy conversations`);
    } catch (legacyError) {
      console.warn(`⚠️ [readConversations] Failed to read legacy conversations:`, legacyError.message);
      // Don't throw - legacy is optional
    }
  }

  // PER USER_REGISTRY_ENFORCEMENT_RUBRIC: Filter out deleted conversations
  const activeConversations = conversations.filter(conv => !isConversationDeleted(conv.messages));

  // Deduplicate conversations by sessionId or constructId
  // Prioritize conversations with more messages (actual conversations over stubs)
  const deduplicated = deduplicateConversations(activeConversations);

  deduplicated.sort((a, b) => {
    const aTime = a.messages.length ? new Date(a.messages[a.messages.length - 1].timestamp).getTime() : 0;
    const bTime = b.messages.length ? new Date(b.messages[b.messages.length - 1].timestamp).getTime() : 0;
    return bTime - aTime;
  });

  return deduplicated;
}

/**
 * Check if a conversation has been deleted by looking for deletion marker
 * PER USER_REGISTRY_ENFORCEMENT_RUBRIC: Respect user intent - if deleted, don't show
 */
function isConversationDeleted(messages) {
  if (!messages || messages.length === 0) return false;
  const lastMessage = messages[messages.length - 1];
  return lastMessage.role === 'system' && 
         lastMessage.content?.startsWith('CONVERSATION_DELETED:');
}

/**
 * Deduplicate conversations by sessionId or constructId.
 * When duplicates are found, keep the one with more messages (actual conversation over stub).
 */
function deduplicateConversations(conversations) {
  const seen = new Map();
  
  for (const conv of conversations) {
    const constructId = extractConstructIdFromSession(conv.sessionId) || 
                        extractConstructIdFromTitle(conv.title) ||
                        conv.sessionId ||
                        conv.title;
    const normalizedConstruct = normalizeConstructId(constructId) || 'unknown';
    const key = conv.sessionId ||
                conv.importMetadata?.conversationId ||
                `${normalizedConstruct}:${conv.title || 'untitled'}`;
    
    if (!seen.has(key)) {
      seen.set(key, conv);
      continue;
    }
    
    const existing = seen.get(key);
    const existingLen = existing.messages?.length || 0;
    const currentLen = conv.messages?.length || 0;
    if (currentLen > existingLen) {
      console.log(`🔄 [readConversations] Deduplicating key=${key}: replacing ${existingLen} messages with ${currentLen} messages`);
      seen.set(key, conv);
    } else {
      console.log(`🔄 [readConversations] Deduplicating key=${key}: keeping existing conversation with ${existingLen} messages`);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Extract construct ID from sessionId (e.g., "synth_1762641178579" -> "synth")
 */
function extractConstructIdFromSession(sessionId) {
  if (!sessionId) return null;
  // Match patterns like "synth_1762641178579" or "synth-001"
  const match = sessionId.match(/^([a-z0-9]+)[_-]/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract construct ID from title (e.g., "Chat with Synth" -> "synth")
 */
function extractConstructIdFromTitle(title) {
  if (!title) return null;
  const match = title.match(/(?:chat with|conversation with)\s+([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase().replace(/-001$/, '') : null;
}

/**
 * Normalize construct ID for matching (e.g., "synth-001", "synth_1762641178579", "synth" -> "synth")
 */
function normalizeConstructId(constructId) {
  if (!constructId) return null;
  // Remove suffixes like "-001", "_1762641178579", etc.
  return constructId.toLowerCase().replace(/[-_]\d+$/, '').replace(/-001$/, '');
}

async function readConstructTranscripts(requestedUserId, constructFilter) {
  const matches = [];
  const normalizedFilter = constructFilter ? constructFilter.toLowerCase() : null;

  try {
    await fs.access(VVAULT_ROOT);
    console.log(`✅ [readConstructTranscripts] VVAULT_ROOT exists: ${VVAULT_ROOT}`);
  } catch (error) {
    console.error(`❌ [readConstructTranscripts] VVAULT_ROOT does not exist or is not accessible: ${VVAULT_ROOT}`);
    console.error(`❌ [readConstructTranscripts] Error:`, error.message);
    throw new Error(`VVAULT_ROOT directory not accessible: ${VVAULT_ROOT} - ${error.message}`);
  }

  const usersDir = path.join(VVAULT_ROOT, 'users');
  const usersExists = await safeAccess(usersDir);
  console.log(`🔍 [readConstructTranscripts] Checking users directory: ${usersDir} (exists: ${usersExists})`);

  if (usersExists) {
    const shardDirs = await safeReaddir(usersDir);
    for (const shardEntry of shardDirs) {
      if (!shardEntry.isDirectory() || !shardEntry.name.startsWith('shard_')) continue;

      const shardPath = path.join(usersDir, shardEntry.name);
      const userDirs = await safeReaddir(shardPath);

      for (const userEntry of userDirs) {
        if (!userEntry.isDirectory()) continue;

        const userPath = path.join(shardPath, userEntry.name);
        if (!(await userMatchesRequest(userPath, userEntry.name, requestedUserId))) {
          continue;
        }

        await collectInstanceTranscripts(userPath, requestedUserId, normalizedFilter, matches);
      }
    }
  }

  await collectLegacyConstructs(normalizedFilter, requestedUserId, matches);
  return matches;
}

async function userMatchesRequest(userPath, directoryName, requestedUserId) {
  // SECURITY: Require requestedUserId - never match all users
  if (!requestedUserId) {
    console.warn(`⚠️ [readConversations] SECURITY: No requestedUserId provided - rejecting match for ${directoryName}`);
    return false;
  }

  // Direct directory name match (exact match only)
  if (directoryName === requestedUserId) {
    console.log(`✅ [readConversations] Direct directory name match: ${directoryName} === ${requestedUserId}`);
    return true;
  }

  // Try to match via profile.json
  const profilePath = path.join(userPath, 'identity', 'profile.json');
  console.log(`🔍 [readConversations] Checking profile for user ${directoryName} at ${profilePath}`);
  
  try {
    const profileContent = await fs.readFile(profilePath, 'utf8');
    const profile = JSON.parse(profileContent);
    
    console.log(`📋 [readConversations] Profile data for ${directoryName}:`, {
      email: profile.email,
      user_id: profile.user_id,
      requestedUserId: requestedUserId
    });
    
    // SECURITY: Require exact matches only - removed partial username matching
    const emailMatch = profile.email === requestedUserId ||
      profile.email?.toLowerCase() === requestedUserId?.toLowerCase();
    const userIdMatch = profile.user_id === requestedUserId;
    
    // REMOVED: emailUsernameMatch - too permissive, security risk
    // Old code: const emailUsernameMatch = requestedUserId.includes('@') &&
    //   profile.email?.split('@')[0] === requestedUserId.split('@')[0];

    if (emailMatch || userIdMatch) {
      console.log(`✅ [readConversations] Matched user ${directoryName} by profile (emailMatch: ${emailMatch}, userIdMatch: ${userIdMatch})`);
      return true;
    } else {
      console.log(`❌ [readConversations] User ${directoryName} does not match requestedUserId ${requestedUserId}`);
      console.log(`   Profile email: ${profile.email}, Profile user_id: ${profile.user_id}`);
    }
  } catch (error) {
    console.warn(`⚠️ [readConversations] Could not read profile for ${directoryName}:`, error.message);
    console.warn(`   Profile path: ${profilePath}`);
    console.warn(`   Error stack:`, error.stack);
  }

  return false;
}

async function collectInstanceTranscripts(userPath, requestedUserId, constructFilter, matches) {
  const instancesDir = path.join(userPath, 'instances');
  if (!(await safeAccess(instancesDir))) return;

  const instanceEntries = await safeReaddir(instancesDir);
  for (const instanceEntry of instanceEntries) {
    if (!instanceEntry.isDirectory()) continue;

    const instanceName = instanceEntry.name;
    if (constructFilter && !instanceName.toLowerCase().startsWith(constructFilter)) continue;

    const instancePath = path.join(instancesDir, instanceName);
    
    // CRITICAL: Scan nested year/month structure (new format from htmlMarkdownImporter)
    // Files are stored as: instances/{instanceId}/{year}/{month}/{title}.md
    console.log(`🔍 [readConversations] Scanning instance: ${instanceName}`);
    await collectMarkdownFromDirectory(instancePath, instanceName, requestedUserId, matches, instanceName, true); // recursive=true
    
    // Also check legacy locations for backward compatibility
    await collectMarkdownFromDirectory(path.join(instancePath, 'chatty'), instanceName, requestedUserId, matches, instanceName, false);
    await collectMarkdownFromDirectory(path.join(instancePath, 'ChatGPT'), instanceName, requestedUserId, matches, instanceName, false);
  }
}

/**
 * Recursively collect markdown files from directory structure
 * Handles both flat structure (chatty/, ChatGPT/) and nested structure (YYYY/MM/)
 * 
 * @param rootDir - Root directory to scan
 * @param instanceName - Instance name (e.g., "chatgpt-devon")
 * @param requestedUserId - User ID to filter by
 * @param matches - Array to collect conversation records
 * @param actualInstanceName - Actual instance name (for nested directories)
 * @param recursive - Whether to recursively scan subdirectories (for year/month structure)
 */
async function collectMarkdownFromDirectory(rootDir, instanceName, requestedUserId, matches, actualInstanceName = null, recursive = true) {
  if (!(await safeAccess(rootDir))) {
    console.log(`⏭️ [readConversations] Directory does not exist: ${rootDir}`);
    return;
  }
  
  const entries = await safeReaddir(rootDir);
  console.log(`📂 [readConversations] Scanning directory: ${rootDir} (${entries.length} entries, recursive: ${recursive})`);

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    
    if (entry.isDirectory()) {
      // Check if this looks like a year directory (4 digits) or month directory (1-2 digits)
      // If recursive=true, scan all subdirectories (for year/month structure)
      // If recursive=false, only scan immediate subdirectories (legacy chatty/ChatGPT)
      if (recursive) {
        // Recursively scan year/month subdirectories
        await collectMarkdownFromDirectory(entryPath, instanceName, requestedUserId, matches, actualInstanceName, true);
      } else {
        // Legacy: only scan immediate subdirectories
        await collectMarkdownFromDirectory(entryPath, instanceName, requestedUserId, matches, actualInstanceName, false);
      }
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.md')) continue;

    // Use actualInstanceName if provided (for nested directories), otherwise use instanceName
    const constructIdForFile = actualInstanceName || instanceName;
    console.log(`📄 [readConversations] Found markdown file: ${entryPath} (constructId: ${constructIdForFile})`);
    
    const record = await parseConstructFile(entryPath, requestedUserId, instanceName, constructIdForFile);
    if (record) {
      console.log(`✅ [readConversations] Parsed conversation: ${record.title} (${record.messages?.length || 0} messages)`);
      matches.push(record);
    } else {
      console.warn(`⚠️ [readConversations] Failed to parse conversation from: ${entryPath}`);
    }
  }
}

async function collectLegacyConstructs(constructFilter, requestedUserId, matches) {
  const entries = await safeReaddir(VVAULT_ROOT);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!isConstructFolder(entry.name)) continue;
    if (constructFilter && !entry.name.toLowerCase().startsWith(constructFilter)) continue;

    const providerDir = path.join(VVAULT_ROOT, entry.name, LEGACY_PROVIDER_DIR);
    if (!(await safeAccess(providerDir))) continue;

    const files = await safeReaddir(providerDir);
    const matchingFiles = files.filter((file) =>
      file.isFile() && (CHAT_FILENAME_PATTERN.test(file.name) || file.name.endsWith(CORE_SUFFIX))
    );

    for (const file of matchingFiles) {
      const record = await parseConstructFile(
        path.join(providerDir, file.name),
        requestedUserId,
        entry.name
      );

      if (record) {
        matches.push(record);
      }
    }
  }
}

async function parseConstructFile(filePath, requestedUserId, constructFolder, instanceName = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const header = parseHeader(raw);

    if (header.userId && requestedUserId && header.userId !== requestedUserId) {
      return null;
    }

    // Extract conversation ID from import metadata if available
    const conversationId = header.importMetadata?.conversationId || null;
    
    // Use sessionId from file header if available, otherwise generate one
    // Priority: header.sessionId > conversationId-based > constructFolder_filename
    const fileName = path.basename(filePath, '.md');
    let sessionId;
    if (header.sessionId && header.sessionId.trim()) {
      // Use sessionId from file header (most reliable - matches what's in the file)
      sessionId = header.sessionId.trim();
    } else if (conversationId) {
      // Use conversation ID if available (for imported conversations)
      sessionId = `${constructFolder}_${conversationId.substring(0, 12)}`;
    } else {
      // Fallback: generate from construct folder + filename
      sessionId = `${constructFolder}_${fileName}`;
    }
    
    // Use conversation title from import metadata (ChatGPT conversation title), fallback to GPT name, then header title, then construct name
    const title = header.importMetadata?.conversationTitle 
      || header.importMetadata?.gptConfig?.name 
      || header.title 
      || buildTitleFromConstruct(constructFolder);
    
    const metadataConstructId =
      header.importMetadata?.constructId ||
      header.importMetadata?.connectedConstructId ||
      null;
    const folderConstructId = instanceName || constructFolder || null;
    const sessionConstructBase = extractConstructIdFromSession(sessionId);
    const constructId =
      metadataConstructId ||
      folderConstructId ||
      (sessionConstructBase || null) ||
      constructFolder ||
      instanceName ||
      null;
    if (!constructId) {
      console.warn(`⚠️ [readConversations] Unable to determine constructId for ${filePath}`);
    }

    const runtimeId =
      header.importMetadata?.runtimeId ||
      (metadataConstructId ? metadataConstructId.replace(/-001$/, '') : null) ||
      (folderConstructId ? folderConstructId.replace(/-001$/, '') : null) ||
      sessionConstructBase ||
      null;

    const isPrimaryRaw = header.importMetadata?.isPrimary;
    const isPrimary =
      typeof isPrimaryRaw === 'boolean'
        ? isPrimaryRaw
        : typeof isPrimaryRaw === 'string'
          ? isPrimaryRaw.toLowerCase() === 'true'
          : false;
    
    // Wrap parseMessages in try/catch to handle parsing errors gracefully
    let messages = [];
    try {
      messages = parseMessages(raw, header.userName);
    } catch (parseError) {
      console.warn(`⚠️ [readConversations] Failed to parse messages in ${filePath}:`, parseError.message);
      // Continue with empty messages array rather than failing entire file
      messages = [];
    }

    // Log conversation object creation for debugging
    console.log(`📝 [readConversations] Parsed conversation:`, {
      filePath: path.basename(filePath),
      sessionId,
      title,
      constructId,
      messageCount: messages.length,
      hasImportMetadata: !!header.importMetadata,
      isPrimary,
      runtimeId
    });

    return {
      sessionId,
      title,
      messages,
      constructId, // CRITICAL: Frontend filtering requires this
      runtimeId,
      isPrimary,
      importMetadata: header.importMetadata,
      constructFolder: instanceName || constructFolder || null,
      sourcePath: filePath,
      userId: requestedUserId || header.userId || null
    };
  } catch (error) {
    // Log filename + error for debugging, but don't throw - skip malformed files
    console.warn(`⚠️ [readConversations] Failed to parse construct transcript ${path.basename(filePath)}:`, error.message);
    if (error.stack) {
      console.warn(`   Stack:`, error.stack);
    }
    return null;
  }
}

function parseImportMetadataBlock(rawBlock) {
  if (!rawBlock) return null;
  const trimmed = rawBlock.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const metadata = {};
    trimmed.split('\n').forEach(line => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) return;
      const key = line.slice(0, separatorIndex).trim();
      if (!key) return;
      let value = line.slice(separatorIndex + 1).trim();
      if (!value) {
        metadata[key] = '';
        return;
      }
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      const lower = value.toLowerCase();
      if (lower === 'true' || lower === 'false') {
        metadata[key] = lower === 'true';
        return;
      }
      if (lower === 'null') {
        metadata[key] = null;
        return;
      }
      metadata[key] = value;
    });
    return Object.keys(metadata).length ? metadata : null;
  }
}

function parseHeader(content) {
  const lines = content.split('\n');
  const header = {
    title: '',
    userName: '',
    userId: '',
    sessionId: '',
    importMetadata: null,
  };

  // Check for import metadata in HTML comment
  const importMetadataMatch = content.match(/<!-- IMPORT_METADATA\n([\s\S]*?)\n-->/);
  if (importMetadataMatch) {
    const parsedMetadata = parseImportMetadataBlock(importMetadataMatch[1]);
    if (parsedMetadata) {
      header.importMetadata = parsedMetadata;
      if (parsedMetadata.connectedConstructId && !header.sessionId) {
        header.sessionId = `${parsedMetadata.connectedConstructId}-001`;
      }
      if (parsedMetadata.sessionId && !header.sessionId) {
        header.sessionId = parsedMetadata.sessionId;
      }
    } else {
      console.warn('[readConversations] Failed to parse import metadata block as JSON or key-value text');
    }
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      header.title = line.replace('# ', '').trim();
    } else if (line.startsWith('**User**')) {
      const match = line.match(/\*\*User\*\*: (.+?)(?: \(ID: (.+?)\))?$/);
      if (match) {
        header.userName = match[1].trim();
        header.userId = match[2]?.trim() || '';
      }
    } else if (line.startsWith('**Session ID**')) {
      header.sessionId = line.replace('**Session ID**:', '').trim();
    } else if (line.trim() === '---') {
      break;
    }
  }

  return header;
}

function parseMessages(content, userName) {
  const messages = [];
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const headerSeparatorIndex = lines.findIndex(line => line.trim() === '---');
  const startIndex = headerSeparatorIndex >= 0 ? headerSeparatorIndex + 1 : 0;
  const speakerLineRegex = /^(.+?)\s+said:\s*(.*)$/i;
  const timestampLineRegex = /^\*\*(.+?)\*\*:\s*(.*)$/;
  let currentDate = null;
  let messageIdCounter = 0;

  const looksLikeTimestampDescriptor = descriptor => {
    if (!descriptor) return false;
    const trimmed = descriptor.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('[')) return true;
    if (trimmed.includes(' - ')) return true;
    if (/\d{1,2}:\d{2}/.test(trimmed)) return true;
    return false;
  };

  const parseTimestampDescriptor = descriptor => {
    if (!descriptor) {
      return { speaker: '', timestamp: null };
    }
    const trimmed = descriptor.trim();

    const bracketMatch = trimmed.match(/^\[(.+?)\]\s*(.+)$/);
    if (bracketMatch) {
      const [, timestampRaw, rest] = bracketMatch;
      const speaker = rest.replace(/\((?:user|assistant)\)$/i, '').trim();
      const iso = safeParseTimestamp(timestampRaw);
      return { speaker, timestamp: iso };
    }

    const dashIndex = trimmed.lastIndexOf(' - ');
    if (dashIndex !== -1) {
      const timestampPart = trimmed.slice(0, dashIndex).trim();
      const speaker = trimmed.slice(dashIndex + 3).trim();
      const iso = currentDate
        ? safeParseTimestamp(`${currentDate} ${timestampPart}`)
        : safeParseTimestamp(timestampPart);
      return { speaker, timestamp: iso };
    }

    const cleanedSpeaker = trimmed.replace(/\((?:user|assistant)\)$/i, '').trim();
    return { speaker: cleanedSpeaker, timestamp: safeParseTimestamp(trimmed) };
  };

  const collectBody = start => {
    const collected = [];
    let index = start;
    while (index < lines.length) {
      const candidate = lines[index];
      const trimmed = candidate.trim();
      if (trimmed) {
        if (trimmed === '---') break;
        if (trimmed.startsWith('## ')) break;
        if (speakerLineRegex.test(trimmed)) break;
        const tsMatch = trimmed.match(timestampLineRegex);
        if (tsMatch && looksLikeTimestampDescriptor(tsMatch[1])) {
          break;
        }
      }
      collected.push(candidate);
      index++;
    }

    while (collected.length > 0 && collected[collected.length - 1].trim() === '') {
      collected.pop();
    }

    return {
      text: collected.join('\n'),
      nextIndex: index
    };
  };

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('## ')) {
      currentDate = trimmed.slice(3).trim();
      continue;
    }

    const speakerMatch = trimmed.match(speakerLineRegex);
    if (speakerMatch) {
      const [, speakerRaw, inlineCaptured] = speakerMatch;
      let inlineContent = inlineCaptured || '';

      const body = collectBody(i + 1);
      i = body.nextIndex - 1;

      const segments = [];
      if (inlineContent) {
        segments.push(inlineContent);
      }
      if (body.text) {
        segments.push(body.text);
      }
      const messageText = segments.join(segments.length > 1 ? '\n' : '').replace(/\r/g, '');
      if (!messageText.trim()) {
        continue;
      }

      const timestamp = safeParseTimestamp(currentDate || '') || new Date().toISOString();
      messages.push({
        id: `msg_${messageIdCounter++}_${Date.now()}`,
        role: normalizeRole(speakerRaw.trim(), userName),
        content: messageText,
        timestamp
      });
      continue;
    }

    const timestampMatch = trimmed.match(timestampLineRegex);
    if (timestampMatch && looksLikeTimestampDescriptor(timestampMatch[1])) {
      const [, descriptor, inlineCaptured] = timestampMatch;
      let inlineBody = inlineCaptured || '';

      const body = collectBody(i + 1);
      i = body.nextIndex - 1;

      const segments = [];
      if (inlineBody) {
        segments.push(inlineBody);
      }
      if (body.text) {
        segments.push(body.text);
      }
      const messageText = segments.join(segments.length > 1 ? '\n' : '').replace(/\r/g, '');
      if (!messageText.trim()) {
        continue;
      }

      const { speaker, timestamp } = parseTimestampDescriptor(descriptor);
      messages.push({
        id: `msg_${messageIdCounter++}_${Date.now()}`,
        role: normalizeRole(speaker || 'assistant', userName),
        content: messageText,
        timestamp: timestamp || new Date().toISOString()
      });
    }
  }

  if (messages.length === 0) {
    const legacyRegex = /\*\*\[(.+?)\]\s+(.+?)\s+\((.+?)\)\*\*:\n([\s\S]*?)(?=(\n\*\*\[|\n## |\n---|$))/g;
    let match;
    while ((match = legacyRegex.exec(content)) !== null) {
      const [, iso, speaker, , body] = match;
      messages.push({
        id: `${speaker.replace(/\s+/g, '_')}_${iso}`,
        role: normalizeRole(speaker, userName),
        content: body.trim(),
        timestamp: iso
      });
    }
  }

  return messages;
}

function safeParseTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

/**
 * Strip "You said:" and "{Construct} said:" prefixes from message content.
 * These prefixes are kept in markdown transcripts but removed for frontend display.
 */
function stripSpeakerPrefix(content) {
  if (!content || typeof content !== 'string') return content;
  
  let cleaned = content;
  
  // Remove "You said:" prefix (case-insensitive, handles "YOU SAID:" too)
  cleaned = cleaned.replace(/^You\s+said:\s*/i, '');
  
  // Remove "{Construct} said:" pattern - matches any word(s) followed by "said:"
  // Matches patterns like "Synth said:", "SYNTH SAID:", "Lin said:", "Chatty said:", etc.
  // This pattern matches one or more words (letters, numbers, spaces, hyphens) followed by "said:"
  cleaned = cleaned.replace(/^[A-Za-z0-9\s-]+\s+said:\s*/i, '');
  
  return cleaned.trim();
}

function normalizeRole(speaker, userName) {
  const normalizedSpeaker = speaker.trim().toLowerCase();
  
  // Check for "You" first (most common case)
  if (normalizedSpeaker === 'you') {
    return 'user';
  }
  
  const normalizedUser = (userName || '').trim().toLowerCase();
  if (normalizedUser && normalizedSpeaker === normalizedUser) {
    return 'user';
  }
  if (normalizedSpeaker === 'devon' && normalizedUser) {
    return 'user';
  }
  return 'assistant';
}

function buildTitleFromConstruct(folderName) {
  const base = folderName.replace(/-\d{3,}$/i, '');
  // Return just the construct name (e.g., "Synth") for address book display
  return base
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function readLegacyConversations(userId) {
  const transcriptsDir = getUserTranscriptsPath(userId);
  const records = [];

  const hasLegacy = await safeAccess(transcriptsDir);
  if (!hasLegacy) {
    return records;
  }

  const sessionDirs = await fs.readdir(transcriptsDir);
  for (const sessionId of sessionDirs) {
    const sessionPath = path.join(transcriptsDir, sessionId);
    const stat = await fs.stat(sessionPath).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    const files = await fs.readdir(sessionPath);
    const messages = [];

    for (const file of files) {
      if (!file.endsWith('.txt')) continue;
      const content = await fs.readFile(path.join(sessionPath, file), 'utf8');
      const timestampMatch = file.match(/^(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)/);
      const roleMatch = file.match(/_(user|assistant)\.txt$/);
      if (!timestampMatch || !roleMatch) continue;

      const body = content.split('\n---\n\n');
      const messageContent = body.length > 1 ? body[1] : content;
      // Strip "You said:" and "{Construct} said:" prefixes from content for frontend display
      const cleanedContent = stripSpeakerPrefix(messageContent.trim());
      messages.push({
        id: `msg_${timestampMatch[1]}`,
        role: roleMatch[1],
        content: cleanedContent,
        timestamp: timestampMatch[1],
      });
    }

    messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    records.push({
      sessionId,
      title: 'Synth',
      messages,
    });
  }

  return records;
}

function isConstructFolder(name) {
  if (!name || name === LEGACY_DIR_NAME || name.startsWith('_')) return false;
  return /-\d{3}$/i.test(name);
}

async function safeReaddir(targetPath) {
  try {
    return await fs.readdir(targetPath, { withFileTypes: true });
  } catch (error) {
    console.warn('[readConversations] Unable to read directory:', targetPath, error.message);
    return [];
  }
}

async function safeAccess(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = { readConversations };
