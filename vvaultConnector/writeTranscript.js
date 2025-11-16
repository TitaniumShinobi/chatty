const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { VVAULT_ROOT } = require('./config');

/**
 * Resolve VVAULT user ID from Chatty user identifier (email or MongoDB ObjectId)
 * Looks up profile.json files to find the correct LIFE format user ID
 * 
 * @param {string} chattyUserId - Chatty user ID (MongoDB ObjectId) or email
 * @param {string} email - User email (optional, used for matching)
 * @returns {Promise<string|null>} - VVAULT user ID in LIFE format (e.g., "devon_woodson_1762969514958") or null if not found
 */
async function resolveVVAULTUserId(chattyUserId, email = null) {
  const usersDir = path.join(VVAULT_ROOT, 'users');
  
  try {
    // Check if users directory exists
    await fs.access(usersDir);
  } catch {
    console.warn(`⚠️ [resolveVVAULTUserId] Users directory not found: ${usersDir}`);
    return null;
  }
  
  // Search through all shards
  const shardDirs = await fs.readdir(usersDir, { withFileTypes: true });
  
  for (const shardEntry of shardDirs) {
    if (!shardEntry.isDirectory() || !shardEntry.name.startsWith('shard_')) continue;
    
    const shardPath = path.join(usersDir, shardEntry.name);
    const userDirs = await fs.readdir(shardPath, { withFileTypes: true });
    
    for (const userEntry of userDirs) {
      if (!userEntry.isDirectory()) continue;
      
      const profilePath = path.join(shardPath, userEntry.name, 'identity', 'profile.json');
      
      try {
        const profileContent = await fs.readFile(profilePath, 'utf8');
        const profile = JSON.parse(profileContent);
        
        // Match by email (preferred) or user_id
        const emailMatch = email && profile.email?.toLowerCase() === email.toLowerCase();
        const userIdMatch = profile.user_id === chattyUserId;
        
        if (emailMatch || userIdMatch) {
          console.log(`✅ [resolveVVAULTUserId] Found VVAULT user: ${profile.user_id} (matched by ${emailMatch ? 'email' : 'user_id'})`);
          return profile.user_id;
        }
      } catch {
        // Profile doesn't exist or can't parse - skip
        continue;
      }
    }
  }
  
  console.warn(`⚠️ [resolveVVAULTUserId] No VVAULT user found for: ${email || chattyUserId}`);
  return null;
}

/**
 * Calculate shard for user based on hash of user_id
 * Supports scaling to billions of users
 * 
 * @param {string} userId - User identifier
 * @returns {string} - Shard name (e.g., "shard_0000", "shard_0001", ..., "shard_9999")
 */
function getShardForUser(userId) {
  const SHARD_COUNT = 10000; // 10,000 shards = ~100,000 users per shard at 1 billion users
  const SHARD_PADDING = 4; // shard_0000, shard_0001, ..., shard_9999
  
  // Hash user_id to get consistent shard assignment
  const hash = crypto.createHash('md5').update(userId).digest('hex');
  const hashInt = parseInt(hash.substring(0, 8), 16); // Use first 8 hex chars for hash
  const shardNum = hashInt % SHARD_COUNT;
  
  return `shard_${String(shardNum).padStart(SHARD_PADDING, '0')}`;
}

/**
 * Append message to construct's markdown transcript
 * Per CHATTY_VVAULT_TRANSCRIPT_SAVING_RUBRIC.md
 * 
 * @param {string} constructId - e.g., "synth", "lin", "nova"
 * @param {number} callsign - e.g., 1, 2, 3 (becomes 001, 002, 003)
 * @param {string} role - "user" or "assistant"
 * @param {string} content - Message content
 * @param {object} metadata - { userId, userName, timestamp, etc. }
 */
async function appendToConstructTranscript(constructId, callsign, role, content, metadata = {}) {
  try {
    // Format: synth-001, lin-001, etc.
    const paddedCallsign = String(callsign).padStart(3, '0');
    const constructFolder = `${constructId}-${paddedCallsign}`;
    
    // Extract userId from metadata - REQUIRED, no fallback
    // Per VVAULT_FILE_STRUCTURE_SPEC.md: userId must be LIFE format (e.g., "devon_woodson_1762969514958")
    // NOT MongoDB ObjectId format (e.g., "690ec2d8c980c59365f284f5")
    if (!metadata.userId) {
      throw new Error('userId is required in metadata. Cannot create files without valid user ID.');
    }
    
    // Resolve VVAULT user ID if Chatty passed MongoDB ObjectId or email
    // Check if it's already LIFE format (contains underscore and numbers)
    let userId = metadata.userId;
    if (!userId.includes('_') || /^[0-9a-fA-F]{24}$/.test(userId)) {
      // Looks like MongoDB ObjectId or email - need to resolve to VVAULT user ID
      const resolvedId = await resolveVVAULTUserId(userId, metadata.userEmail || metadata.email);
      if (!resolvedId) {
        throw new Error(`Cannot resolve VVAULT user ID for: ${userId}. User must exist in VVAULT with profile.json.`);
      }
      userId = resolvedId;
    }
    
    // Calculate shard for user (for scalability to billions of users)
    // NOTE: Using sequential sharding (shard_0000) per user preference, not hash-based
    const shard = 'shard_0000'; // TODO: Revert to getShardForUser(userId) for large-scale deployments
    
    // ALWAYS use canonical structure: /vvault/users/{shard}/{user_id}/instances/{construct}-001/chatty/chat_with_{construct}-001.md
    const userBasePath = path.join(VVAULT_ROOT, 'users', shard, userId);
    const transcriptDir = path.join(userBasePath, 'instances', constructFolder, 'chatty');
    const transcriptFile = path.join(transcriptDir, `chat_with_${constructFolder}.md`);
    
    console.log(`✅ [VVAULT] Using user registry structure: ${transcriptDir}`);
    console.log(`💾 [VVAULT] Appending to: ${transcriptFile}`);
    console.log(`📝 [VVAULT] Role: ${role}, Content length: ${content.length}`);
    
    await migrateLegacyTranscript(userBasePath, constructFolder, transcriptFile);

    // Ensure directory exists
    await fs.mkdir(transcriptDir, { recursive: true });
    
    // Check if file exists
    let fileExists = false;
    try {
      await fs.access(transcriptFile);
      fileExists = true;
      console.log(`✅ [VVAULT] File exists, appending...`);
    } catch {
      fileExists = false;
      console.log(`📝 [VVAULT] File doesn't exist, creating with header...`);
    }
    
    // Create header if new file
    if (!fileExists) {
      // Use conversation title from metadata if available (for imported ChatGPT conversations)
      const displayTitle = metadata.conversationTitle 
        ? metadata.conversationTitle
        : `${constructId.charAt(0).toUpperCase() + constructId.slice(1)}-${paddedCallsign}`;
      
      let header = `# ${displayTitle}

-=-=-=-

`;
      
      // Add import metadata to header if this is an imported conversation
      if (metadata.importedFrom || metadata.gptConfig) {
        header += `<!-- IMPORT_METADATA
${JSON.stringify({
          importedFrom: metadata.importedFrom || null,
          conversationId: metadata.conversationId || null,
          conversationTitle: metadata.conversationTitle || null,
          detectedModel: metadata.detectedModel || null,
          gptConfig: metadata.gptConfig || null,
          isPlaceholder: metadata.isPlaceholder || false
        }, null, 2)}
-->

`;
      }
      
      await fs.writeFile(transcriptFile, header, 'utf-8');
      console.log(`✅ [VVAULT] Header written`);
    }
    
    // Format timestamp
    const timestamp = metadata.timestamp ? new Date(metadata.timestamp) : new Date();
    const dateStr = timestamp.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeStr = timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    
    // Determine speaker name
    const speaker = role === 'user' 
      ? (metadata.userName || 'Devon')
      : `${constructId.charAt(0).toUpperCase() + constructId.slice(1)}`;
    
    // Check if we need a new date section
    const currentContent = await fs.readFile(transcriptFile, 'utf-8');
    const lastDateMatch = currentContent.match(/## (.*?)(?=\n)/g);
    const lastDate = lastDateMatch ? lastDateMatch[lastDateMatch.length - 1].replace('## ', '') : null;
    
    let messageBlock = '';
    
    // Add date header if day changed
    if (lastDate !== dateStr) {
      messageBlock += `\n## ${dateStr}\n\n`;
      console.log(`📅 [VVAULT] New date section: ${dateStr}`);
    }
    
    // Add message
    messageBlock += `**${timeStr} - ${speaker}**: ${content}\n\n`;
    
    // Append to file (CRITICAL: This is append-only, never overwrites)
    await fs.appendFile(transcriptFile, messageBlock, 'utf-8');
    
    console.log(`✅ [VVAULT] Message appended successfully`);
    console.log(`📊 [VVAULT] File size: ${(await fs.stat(transcriptFile)).size} bytes`);
    
    return transcriptFile;
    
  } catch (error) {
    console.error('❌ [VVAULT] CRITICAL ERROR - Message NOT saved:', error);
    console.error('❌ [VVAULT] Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error; // Re-throw to ensure caller knows save failed
  }
}

/**
 * Legacy function for backwards compatibility
 * Redirects to new append-based system
 */
async function writeTranscript(userId, sessionId, role, content, constructId = 'synth', metadata = {}) {
  console.log('⚠️  [VVAULT] Legacy writeTranscript called, redirecting to new system...');
  
  // Extract construct info from sessionId
  // e.g., "synth_1762641178579" → constructId="synth", callsign=1
  const constructMatch = sessionId.match(/^([a-z-]+)_/);
  const actualConstructId = constructMatch ? constructMatch[1] : constructId;
  
  // For now, always use callsign 001
  // TODO: Implement callsign tracking when GPT creator is added
  const callsign = 1;
  
  return appendToConstructTranscript(actualConstructId, callsign, role, content, {
    userId,
    sessionId,
    ...metadata
  });
}

async function migrateLegacyTranscript(userBasePath, constructFolder, canonicalFile) {
  if (await fileExists(canonicalFile)) {
    return;
  }

  const legacyDirs = [
    path.join(userBasePath, 'constructs', constructFolder, 'chatty'),
    path.join(userBasePath, 'constructs', constructFolder, 'Chatty'),
    path.join(VVAULT_ROOT, constructFolder, 'Chatty')
  ];

  for (const legacyDir of legacyDirs) {
    const legacyFile = path.join(legacyDir, `chat_with_${constructFolder}.md`);
    if (await fileExists(legacyFile)) {
      await fs.mkdir(path.dirname(canonicalFile), { recursive: true });
      await fs.rename(legacyFile, canonicalFile);
      console.log(`✅ [VVAULT] Migrated legacy transcript for ${constructFolder} from ${legacyFile} to ${canonicalFile}`);
      return;
    }
  }
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = { 
  appendToConstructTranscript,
  writeTranscript, // Keep for backwards compatibility
  resolveVVAULTUserId // Export for use in import routes
};
