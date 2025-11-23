import express from "express";
import { createRequire } from "module";
import { requireAuth } from "../middleware/auth.js";
import User from "../models/User.js";
import { createPrimaryConversationFile } from "../services/importService.js";
import multer from "multer";

const require = createRequire(import.meta.url);
const router = express.Router();

// Configure multer for identity file uploads
const identityUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow text files, PDFs, markdown, and common document formats
    const allowedTypes = [
      'text/plain', 'text/markdown', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv', 'application/json'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(txt|md|pdf|doc|docx|csv|json)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: txt, md, pdf, doc, docx, csv, json'));
    }
  }
});

// Lazy load VVAULT modules to speed up server startup
let readConversations, readCharacterProfile, VVAULTConnector, VVAULT_ROOT;
let modulesLoaded = false;

async function loadVVAULTModules() {
  if (modulesLoaded) return;
  
  try {
    const readConv = require("../../vvaultConnector/readConversations.js");
    readConversations = readConv.readConversations;
    
    const readChar = require("../../vvaultConnector/readCharacterProfile.js");
    readCharacterProfile = readChar.readCharacterProfile;
    
    const connector = require("../../vvaultConnector/index.js");
    VVAULTConnector = connector.VVAULTConnector;
    
    const config = require("../../vvaultConnector/config.js");
    VVAULT_ROOT = config.VVAULT_ROOT;
    
    modulesLoaded = true;
  } catch (error) {
    console.error('❌ [VVAULT] Failed to load modules:', error);
    throw error;
  }
}

// Lazy connector initialization (non-blocking)
let connectorPromise = null;
function getConnector() {
  if (!connectorPromise) {
    connectorPromise = (async () => {
      await loadVVAULTModules();
      const connector = new VVAULTConnector();
      await connector.initialize();
      return connector;
    })().catch(error => {
      console.error('❌ [VVAULT] Connector initialization failed:', error);
      connectorPromise = null; // Allow retry
      throw error;
    });
  }
  return connectorPromise;
}

function getUserId(user = {}) {
  return user.sub || user.id || user.uid || user._id;
}

function validateUser(res, user) {
  const userId = getUserId(user);
  if (!userId) {
    res.status(400).json({ ok: false, error: "Missing user identifier" });
    return null;
  }
  return userId;
}

router.use(requireAuth);

router.get("/conversations", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const email = req.user?.email ?? '(no req.user.email)';
  console.log(`📚 [VVAULT API] Reading conversations for user: ${email} (Chatty ID: ${userId})`);
  
  // Attempt to pull a linked VVAULT identifier (best effort, Mongo may be disabled locally)
  let linkedVvaultUserId = req.user?.vvaultUserId;
  try {
    const userRecord = await User.findById(userId).select('vvaultUserId email').lean();
    if (userRecord?.vvaultUserId) {
      linkedVvaultUserId = userRecord.vvaultUserId;
    }
  } catch (lookupError) {
    console.warn('⚠️ [VVAULT API] Could not load user record for VVAULT lookup:', lookupError.message);
  }
  
  try {
    // Lazy load VVAULT modules with detailed error handling
    console.log(`🔄 [VVAULT API] Loading VVAULT modules...`);
    try {
      await loadVVAULTModules();
      console.log(`✅ [VVAULT API] VVAULT modules loaded successfully`);
      console.log(`📚 [VVAULT API] VVAULT_ROOT = ${VVAULT_ROOT}`);
      
      if (!readConversations) {
        throw new Error('readConversations function not loaded after module load');
      }
    } catch (loadError) {
      console.error(`❌ [VVAULT API] Failed to load VVAULT modules:`, loadError);
      console.error(`❌ [VVAULT API] Load error stack:`, loadError.stack);
      throw new Error(`VVAULT module loading failed: ${loadError.message}. Stack: ${loadError.stack}`);
    }

    // PER USER_REGISTRY_ENFORCEMENT_RUBRIC: User ID is REQUIRED, no fallback searches
    const lookupId = email !== '(no req.user.email)' ? email : userId;
    
    if (!lookupId || lookupId === '(no req.user.email)') {
      throw new Error('User ID is required. Cannot read conversations without user identity.');
    }

    let conversations = [];
    try {
      console.log(`🔍 [VVAULT API] Calling readConversations with lookupId: ${lookupId}`);
      conversations = await readConversations(lookupId);
      console.log(`📥 [VVAULT API] readConversations returned ${Array.isArray(conversations) ? conversations.length : 'non-array'} conversations`);
    } catch (error) {
      console.error(`❌ [VVAULT API] Failed to read conversations for user ${lookupId}:`, error.message);
      console.error(`❌ [VVAULT API] Error stack:`, error.stack);
      // PER USER_REGISTRY_ENFORCEMENT_RUBRIC: Do not fallback to searching all users
      // Return empty array instead of 500 error - user can still use the app
      console.warn('⚠️ [VVAULT API] Returning empty conversation list due to read error');
      return res.json({ ok: true, conversations: [] });
    }

    res.json({ ok: true, conversations });
  } catch (error) {
    // Log full error details server-side
    console.error("❌ [VVAULT API] Failed to read conversations:", error && error.stack ? error.stack : error);
    console.error("❌ [VVAULT API] Error message:", error?.message);
    console.error("❌ [VVAULT API] Error name:", error?.name);
    console.error("❌ [VVAULT API] User info:", { userId, email: req.user?.email, linkedVvaultUserId });
    
    // In development, return detailed error for debugging
    // In production, return empty conversations so app can still function
    if (process.env.NODE_ENV === 'development') {
      res.status(500).json({ 
        ok: false, 
        error: "Failed to read VVAULT conversations",
        details: error?.message || 'Unknown error',
        name: error?.name,
        stack: error?.stack
      });
    } else {
      // Production: return empty conversations instead of 500
      console.warn('⚠️ [VVAULT API] Returning empty conversations due to error (production mode)');
      res.json({ ok: true, conversations: [] });
    }
  }
});

router.get("/character-context", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const constructId = (req.query.constructId || 'lin').toString().trim();
  const callsign = (req.query.callsign || '001').toString().trim();

  if (!constructId) {
    res.status(400).json({ ok: false, error: "Missing constructId" });
    return;
  }

  try {
    await loadVVAULTModules();
    const profile = await readCharacterProfile(constructId, callsign);
    if (!profile) {
      res.status(404).json({ ok: false, error: "Character profile not found" });
      return;
    }

    res.json({
      ok: true,
      profile,
      meta: { constructId, callsign }
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to read character context:", error);
    res.status(500).json({ ok: false, error: "Failed to read VVAULT character context" });
  }
});

router.post("/create-canonical", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const constructId =
    (req.body?.constructId ||
      req.query?.constructId ||
      '').toString().trim();

  if (!constructId) {
    return res.status(400).json({ ok: false, error: "constructId is required" });
  }

  const provider =
    (req.body?.provider || req.query?.provider || constructId.split('-')[0] || 'chatgpt').toString();
  const shardId = (req.body?.shardId || req.query?.shardId || 'shard_0000').toString();
  const runtimeIdInput = req.body?.runtimeId || req.query?.runtimeId;
  const runtimeId = (runtimeIdInput || constructId?.replace(/-001$/, '') || constructId || '').toString();

  try {
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      throw new Error('VVAULT root not configured');
    }

    const { resolveVVAULTUserId } = require("../../vvaultConnector/writeTranscript.js");
    const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
    }

    const canonicalPath = await createPrimaryConversationFile(
      constructId,
      vvaultUserId,
      req.user?.email || userId,
      provider,
      VVAULT_ROOT,
      shardId,
      runtimeId
    );

    res.json({
      ok: true,
      sessionId: `${constructId}_chat_with_${constructId}`,
      filePath: canonicalPath
    });
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to create canonical conversation:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to create canonical conversation' });
  }
});

router.post("/conversations", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { sessionId, title = "Chat with Synth", constructId = "synth" } = req.body || {};
  const session = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  try {
    const connector = await getConnector();
    await connector.writeTranscript({
      userId, // Will be resolved to VVAULT user ID in writeTranscript.js
      userEmail: req.user?.email, // Pass email for VVAULT user ID resolution
      sessionId: session,
      timestamp: new Date().toISOString(),
      role: "system",
      content: `CONVERSATION_CREATED:${title}`,
      title,
      constructId: constructId || 'synth',
      constructName: title,
      constructCallsign: constructId // constructId may already be in callsign format (e.g., "katana-001")
    });

    res.status(201).json({
      ok: true,
      conversation: {
        sessionId: session,
        title
      }
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to create conversation:", error);
    res.status(500).json({ ok: false, error: "Failed to create VVAULT conversation" });
  }
});

router.post("/conversations/:sessionId/messages", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { sessionId } = req.params;
  const { role, content, timestamp, title, metadata, constructId, constructName, packets } = req.body || {};

  if (!role) {
    res.status(400).json({ ok: false, error: "Missing role" });
    return;
  }

  // Extract content from packets if content is empty but packets exist
  let finalContent = content;
  if ((!finalContent || finalContent.trim() === '') && Array.isArray(packets)) {
    finalContent = packets
      .map(packet => {
        if (!packet) return '';
        if (packet.op === 'answer.v1' && packet.payload?.content) {
          return packet.payload.content;
        }
        try {
          return JSON.stringify(packet.payload ?? packet);
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join('\n\n');
  }

  if (!finalContent || finalContent.trim() === '') {
    res.status(400).json({ ok: false, error: "Missing content (empty message)" });
    return;
  }

  try {
    const connector = await getConnector();
    const actualConstructId = constructId || metadata?.constructId || 'synth';
    const actualConstructCallsign = metadata?.constructCallsign || constructId || metadata?.constructId;
    
    await connector.writeTranscript({
      userId, // Will be resolved to VVAULT user ID in writeTranscript.js
      userEmail: req.user?.email, // Pass email for VVAULT user ID resolution
      sessionId,
      timestamp: timestamp || new Date().toISOString(),
      role,
      content: finalContent,
      title: title || "Chat with Synth",
      metadata,
      constructId: actualConstructId,
      constructName: constructName || metadata?.constructName || title || 'Synth',
      constructCallsign: actualConstructCallsign
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to append message:", error);
    res.status(500).json({ ok: false, error: "Failed to save VVAULT message" });
  }
});

router.get("/identity/query", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, query, limit = 10 } = req.query || {};
  
  if (!constructCallsign || !query) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or query" });
  }

  try {
    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();
    
    const identities = await identityService.queryIdentities(
      userId,
      constructCallsign,
      query,
      parseInt(limit, 10)
    );

    res.json({
      ok: true,
      memories: identities // Keep "memories" key for backward compatibility with frontend
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to query identity:", error);
    res.status(500).json({ ok: false, error: "Failed to query identity" });
  }
});

// Store message pair in ChromaDB (for Lin conversations)
router.post("/identity/store", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, context, response, metadata = {} } = req.body || {};
  
  if (!constructCallsign || !context || !response) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign, context, or response" });
  }

  try {
    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();
    
    const result = await identityService.addIdentity(
      userId,
      constructCallsign,
      context,
      response,
      {
        email: req.user?.email,
        ...metadata
      }
    );

    res.json({
      ok: true,
      success: result.success,
      id: result.id,
      duplicate: result.duplicate || false
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to store identity:", error);
    res.status(500).json({ ok: false, error: "Failed to store identity" });
  }
});

router.get("/identity/list", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query || {};
  
  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    await loadVVAULTModules();
    const { resolveVVAULTUserId } = require("../../vvaultConnector/writeTranscript.js");
    const fs = require('fs').promises;
    const path = require('path');

    // Resolve VVAULT user ID
    const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email);
    if (!vvaultUserId) {
      return res.status(404).json({ ok: false, error: "User not found in VVAULT" });
    }

    // Build base path to instance directory
    const shard = 'shard_0000'; // Sequential sharding
    const instanceBasePath = path.join(
      VVAULT_ROOT,
      'users',
      shard,
      vvaultUserId,
      'instances',
      constructCallsign
    );

    // Check both identity and chatgpt directories (legacy support)
    const directoriesToCheck = ['identity', 'chatgpt'];
    const identityFiles = [];

    for (const dirName of directoriesToCheck) {
      const dirPath = path.join(instanceBasePath, dirName);
      
      // Check if directory exists
      try {
        await fs.access(dirPath);
      } catch {
        // Directory doesn't exist, skip it
        continue;
      }

      // Read directory and filter for identity files
      try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });

        for (const file of files) {
          if (file.isFile()) {
            const filePath = path.join(dirPath, file.name);
            const ext = path.extname(file.name).toLowerCase();
            
            // Only include supported file types
            if (['.md', '.txt', '.pdf', '.doc', '.docx', '.csv', '.json'].includes(ext)) {
              try {
                const stats = await fs.stat(filePath);
                identityFiles.push({
                  name: file.name,
                  path: filePath,
                  size: stats.size,
                  modifiedAt: stats.mtime.toISOString(),
                  source: dirName // Track which directory the file came from
                });
              } catch (error) {
                console.warn(`⚠️ [VVAULT API] Failed to stat file ${file.name}:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [VVAULT API] Failed to read directory ${dirPath}:`, error);
      }
    }

    // Sort by modified date (newest first)
    identityFiles.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    res.json({
      ok: true,
      files: identityFiles
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to list identity files:", error);
    res.status(500).json({ ok: false, error: "Failed to list identity files" });
  }
});

// Legacy endpoint for backward compatibility
router.get("/memories/query", async (req, res) => {
  // Redirect to identity endpoint
  req.url = req.url.replace('/memories/query', '/identity/query');
  return router.handle(req, res);
});

/**
 * Parse transcript text to extract conversation pairs (user/assistant messages)
 * Handles multiple formats:
 * - "You said:" / "Katana said:" format
 * - "User:" / "Assistant:" format  
 * - Timestamped format: **TIME - Name**: content
 * - Plain text with role indicators
 */
function parseTranscriptForConversationPairs(text, filename) {
  const pairs = [];
  const lines = text.split('\n');
  
  let currentUser = null;
  let currentAssistant = null;
  let currentUserLines = [];
  let currentAssistantLines = [];
  let inUserMessage = false;
  let inAssistantMessage = false;
  
  // Normalize construct name from filename (e.g., "Katana" from "katana-001")
  const constructNameMatch = filename.match(/([a-z]+)-?\d*/i);
  const constructName = constructNameMatch ? constructNameMatch[1].charAt(0).toUpperCase() + constructNameMatch[1].slice(1).toLowerCase() : 'Assistant';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and metadata
    if (!trimmed || trimmed.startsWith('<!--') || trimmed.startsWith('**Source File') || 
        trimmed.startsWith('**Converted') || trimmed.startsWith('**Word Count') ||
        trimmed.startsWith('**File Category') || trimmed.startsWith('# ') ||
        trimmed === '---' || trimmed === 'Skip to content') {
      continue;
    }
    
    // Pattern 1: "You said:" / "Katana said:" format
    const youSaidMatch = trimmed.match(/^You said:\s*(.*)$/i);
    if (youSaidMatch) {
      // Save previous pair if exists
      if (currentUser && currentAssistant) {
        pairs.push({
          user: currentUser.trim(),
          assistant: currentAssistant.trim(),
          timestamp: new Date().toISOString()
        });
      }
      // User message might be on same line or next line
      currentUser = youSaidMatch[1] || '';
      currentUserLines = currentUser ? [currentUser] : [];
      currentAssistant = null;
      currentAssistantLines = [];
      inUserMessage = true;
      inAssistantMessage = false;
      continue;
    }
    
    const constructSaidMatch = trimmed.match(new RegExp(`^${constructName} said:\\s*(.*)$`, 'i'));
    if (constructSaidMatch) {
      // Save previous pair if exists (user message complete)
      if (currentUser && currentAssistant) {
        pairs.push({
          user: currentUser.trim(),
          assistant: currentAssistant.trim(),
          timestamp: new Date().toISOString()
        });
      }
      // Start new assistant message
      currentAssistant = constructSaidMatch[1] || '';
      currentAssistantLines = currentAssistant ? [currentAssistant] : [];
      inUserMessage = false;
      inAssistantMessage = true;
      continue;
    }
    
    // Pattern 2: "User:" / "Assistant:" format
    const userMatch = trimmed.match(/^(?:User|You):\s*(.*)$/i);
    if (userMatch) {
      if (currentUser && currentAssistant) {
        pairs.push({
          user: currentUser,
          assistant: currentAssistant,
          timestamp: new Date().toISOString()
        });
      }
      currentUser = userMatch[1] || '';
      currentUserLines = currentUser ? [currentUser] : [];
      currentAssistant = null;
      currentAssistantLines = [];
      inUserMessage = true;
      inAssistantMessage = false;
      continue;
    }
    
    const assistantMatch = trimmed.match(/^(?:Assistant|AI|ChatGPT|Bot|${constructName}):\s*(.*)$/i);
    if (assistantMatch) {
      currentAssistant = assistantMatch[1] || '';
      currentAssistantLines = currentAssistant ? [currentAssistant] : [];
      inUserMessage = false;
      inAssistantMessage = true;
      continue;
    }
    
    // Pattern 3: Timestamped format **TIME - Name**: content
    const timestampedMatch = trimmed.match(/^\*\*([^*]+)\s*-\s*([^*]+)\*\*:\s*(.+)$/);
    if (timestampedMatch) {
      const [, time, name, content] = timestampedMatch;
      const normalizedName = name.toLowerCase().trim();
      
      // Check if it's a construct name
      const isConstruct = ['katana', 'synth', 'lin', 'nova', 'assistant', 'ai', 'chatgpt', 'bot'].some(
        c => normalizedName.includes(c)
      );
      
      if (!isConstruct) {
        // User message
        if (currentUser && currentAssistant) {
          pairs.push({
            user: currentUser,
            assistant: currentAssistant,
            timestamp: time.trim()
          });
        }
        currentUser = content.trim();
        currentUserLines = [currentUser];
        currentAssistant = null;
        currentAssistantLines = [];
      } else {
        // Assistant message
        currentAssistant = content.trim();
        currentAssistantLines = [currentAssistant];
      }
      continue;
    }
    
    // Continue collecting multi-line messages
    // Only collect if we're in a message state and line is not empty (or allow empty lines within messages)
    if (inUserMessage) {
      if (trimmed || currentUserLines.length > 0) {
        // Allow empty lines within multi-line messages, but skip if it's just whitespace at start
        currentUserLines.push(trimmed);
        currentUser = currentUserLines.join('\n').trim();
      }
    } else if (inAssistantMessage) {
      if (trimmed || currentAssistantLines.length > 0) {
        currentAssistantLines.push(trimmed);
        currentAssistant = currentAssistantLines.join('\n').trim();
      }
    }
  }
  
  // Save last pair if exists
  if (currentUser && currentAssistant) {
    pairs.push({
      user: currentUser,
      assistant: currentAssistant,
      timestamp: new Date().toISOString()
    });
  }
  
  return pairs;
}

router.post("/identity/upload", requireAuth, (req, res) => {
  identityUpload.array('files', 10)(req, res, async (err) => {
    if (err) {
      console.error('❌ [VVAULT API] Multer error during identity upload:', err);
      return res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
    }

    const userId = validateUser(res, req.user);
    if (!userId) return;

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ ok: false, error: "No files provided" });
    }

    const { constructCallsign } = req.body || {};
    if (!constructCallsign) {
      return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
    }

    try {
      const { convertFileToMarkdown } = await import('../services/fileToMarkdownConverter.js');
      const results = [];

      for (const file of files) {
        try {
          const crypto = require('crypto');
          // For identity files, store in /instances/{construct-callsign}/identity/ instead of provider subdirectory
          const { resolveVVAULTUserId } = require("../../vvaultConnector/writeTranscript.js");
          const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email);
          if (!vvaultUserId) {
            throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
          }

          const path = await import('path');
          const fs = await import('fs/promises');
          const { VVAULT_ROOT } = require('../../vvaultConnector/config.js');
          
          // Parse file to extract text
          const { ServerFileParser } = await import('../lib/serverFileParser.js');
          const parsed = await ServerFileParser.parseFile(file, {
            maxSize: 10 * 1024 * 1024, // 10MB
            extractText: true,
            storeContent: false
          });

          // Convert to markdown
          const convertTextToMarkdown = (text, filename, metadata) => {
            const timestamp = new Date().toISOString();
            const title = path.basename(filename, path.extname(filename));
            
            return `# ${title}

**Source File**: ${filename}
**Converted**: ${timestamp}
**Word Count**: ${metadata.wordCount || 0}
**File Category**: ${metadata.fileCategory || 'unknown'}

<!-- FILE_METADATA
sourceFile: ${filename}
convertedAt: ${timestamp}
wordCount: ${metadata.wordCount || 0}
fileCategory: ${metadata.fileCategory || 'unknown'}
programmingLanguage: ${metadata.programmingLanguage || 'none'}
complexity: ${metadata.complexity || 'unknown'}
---

${text}
`;
          };
          const markdown = convertTextToMarkdown(parsed.extractedText, file.originalname || file.name, parsed.metadata);

          // Store in /instances/{construct-callsign}/identity/{filename}.md
          // Sanitize filename
          const sanitizeFilename = (filename) => {
            if (!filename) return 'untitled';
            const base = path.basename(filename, path.extname(filename));
            return base
              .replace(/[^a-z0-9._-]+/gi, '-')
              .replace(/^-|-$/g, '')
              .substring(0, 100);
          };
          const sanitizedFilename = sanitizeFilename(file.originalname || file.name);
          const hash = crypto.createHash('sha256').update(file.buffer || '').digest('hex').substring(0, 8);
          const hashedFilename = `${sanitizedFilename}-${hash}`;
          const identityDir = path.join(
            VVAULT_ROOT,
            'users',
            'shard_0000',
            vvaultUserId,
            'instances',
            constructCallsign,
            'identity'
          );
          
          await fs.mkdir(identityDir, { recursive: true });
          const filePath = path.join(identityDir, `${hashedFilename}.md`);

          // Dedup: if file with same hash exists, skip writing new copy
          try {
            await fs.access(filePath);
            console.log(`ℹ️ [VVAULT API] Duplicate identity file detected, skipping write: ${filePath}`);
            results.push({
              success: true,
              duplicate: true,
              filePath,
              metadata: {
                originalName: file.originalname || file.name,
                originalType: file.mimetype || file.type,
                originalSize: file.size,
                wordCount: parsed.metadata.wordCount
              }
            });
            continue;
          } catch {
            // file not found, proceed to write
          }

          await fs.writeFile(filePath, markdown, 'utf8');

          console.log(`✅ [VVAULT API] Identity file saved: ${filePath}`);

          // Parse transcript and import conversation pairs into ChromaDB
          try {
            const { getIdentityService } = await import('../services/identityService.js');
            const identityService = getIdentityService();
            
            // Try to parse as transcript with conversation pairs
            const conversationPairs = parseTranscriptForConversationPairs(parsed.extractedText, file.originalname || file.name);
            
            if (conversationPairs.length > 0) {
              // Import each conversation pair as a separate identity entry
              let importedCount = 0;
              for (const pair of conversationPairs) {
                try {
                  // Skip empty pairs
                  if (!pair.user || !pair.assistant || !pair.user.trim() || !pair.assistant.trim()) {
                    continue;
                  }
                  
                  await identityService.addIdentity(
                    userId,
                    constructCallsign,
                    pair.user.trim(),
                    pair.assistant.trim(),
                    {
                      email: req.user?.email,
                      sessionId: constructCallsign,
                      memoryType: 'long-term',
                      sourceModel: 'chatty-identity',
                      sourceFile: file.originalname || file.name,
                      timestamp: pair.timestamp || new Date().toISOString()
                    }
                  );
                  importedCount++;
                } catch (pairError) {
                  console.warn(`⚠️ [VVAULT API] Failed to import conversation pair (non-critical):`, pairError);
                }
              }
              console.log(`✅ [VVAULT API] Imported ${importedCount} conversation pairs from ${file.originalname || file.name}`);
            } else {
              // Fallback: import entire file as single identity if no pairs found
              const titleMatch = markdown.match(/^#\s+(.+)$/m);
              const title = titleMatch ? titleMatch[1] : file.originalname || 'Untitled';
              const content = markdown.replace(/^#.*$/m, '').trim();

              await identityService.addIdentity(
                userId,
                constructCallsign,
                `Identity file: ${title}`,
                content,
                {
                  email: req.user?.email,
                  sessionId: constructCallsign,
                  memoryType: 'long-term',
                  sourceModel: 'chatty-identity'
                }
              );
              console.log(`✅ [VVAULT API] Imported file as single identity entry: ${file.originalname || file.name}`);
            }
          } catch (identityError) {
            console.warn('⚠️ [VVAULT API] Failed to import identity to ChromaDB (non-critical):', identityError);
          }

          results.push({
            success: true,
            filePath,
            metadata: {
              originalName: file.originalname || file.name,
              originalType: file.mimetype || file.type,
              originalSize: file.size,
              wordCount: parsed.metadata.wordCount
            }
          });
        } catch (error) {
          console.error(`❌ [VVAULT API] Failed to process identity file ${file.originalname || file.name}:`, error);
          results.push({
            success: false,
            error: error.message,
            filename: file.originalname || file.name
          });
        }
      }

      return res.status(201).json({
        ok: true,
        results,
        message: `Processed ${results.filter(r => r.success).length} of ${results.length} files`
      });
    } catch (error) {
      console.error("❌ [VVAULT API] Failed to upload identity files:", error);
      return res.status(500).json({ ok: false, error: "Failed to upload identity files" });
    }
  });
});

// Legacy endpoint for backward compatibility
router.post("/memories/upload", requireAuth, (req, res) => {
  identityUpload.array('files', 10)(req, res, (err) => {
    if (err) {
      console.error('❌ [VVAULT API] Multer error during memories upload:', err);
      return res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
    }
    // Redirect to identity endpoint handler logic for backward compatibility
    req.url = req.url.replace('/memories/upload', '/identity/upload');
    return router.handle(req, res);
  });
});

router.post("/conversations/:sessionId/connect-construct", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { sessionId } = req.params;
  const { constructId, gptConfig } = req.body || {};

  if (!constructId) {
    res.status(400).json({ ok: false, error: "Missing constructId" });
    return;
  }

  try {
    await loadVVAULTModules();
    const { updateTranscriptConstructConnection } = require('../../vvaultConnector/updateTranscriptMetadata');
    const success = await updateTranscriptConstructConnection(userId, sessionId, constructId);

    if (!success) {
      res.status(404).json({ ok: false, error: "Conversation not found or not an imported conversation" });
      return;
    }

    res.status(200).json({ ok: true, constructId });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to connect construct:", error);
    res.status(500).json({ ok: false, error: "Failed to connect conversation to construct" });
  }
});

// VVAULT Account Linking Endpoints

/**
 * GET /api/vvault/account/status
 * Check if user has linked a VVAULT account
 */
router.get("/account/status", async (req, res) => {
  try {
  const userId = validateUser(res, req.user);
  if (!userId) return;

    console.log(`🔍 [VVAULT API] Checking account status for userId: ${userId}, email: ${req.user?.email}`);

    // Try multiple query strategies since userId could be sub, id, uid, or _id
    let user = null;
    try {
      user = await User.findOne({ id: userId }).select('vvaultPath vvaultUserId vvaultLinkedAt email');
      if (user) console.log(`✅ [VVAULT API] Found user by id field`);
    } catch (err) {
      console.log(`⚠️ [VVAULT API] Query by id failed:`, err.message);
    }
    
    // Fallback to email if id query fails
    if (!user && req.user?.email) {
      try {
        user = await User.findOne({ email: req.user.email }).select('vvaultPath vvaultUserId vvaultLinkedAt email');
        if (user) console.log(`✅ [VVAULT API] Found user by email`);
      } catch (err) {
        console.log(`⚠️ [VVAULT API] Query by email failed:`, err.message);
      }
    }
    
    // Fallback to _id if it's a MongoDB ObjectId
    if (!user && userId && typeof userId === 'string' && /^[0-9a-fA-F]{24}$/.test(userId)) {
      try {
        user = await User.findById(userId).select('vvaultPath vvaultUserId vvaultLinkedAt email');
        if (user) console.log(`✅ [VVAULT API] Found user by _id`);
      } catch (err) {
        console.log(`⚠️ [VVAULT API] Query by _id failed:`, err.message);
      }
    }
    
    if (!user) {
      console.error(`❌ [VVAULT API] User not found for userId: ${userId}, email: ${req.user?.email}`);
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    const isLinked = !!(user.vvaultPath && user.vvaultUserId);
    
    console.log(`✅ [VVAULT API] Account status: linked=${isLinked}, vvaultUserId=${user.vvaultUserId || 'null'}`);
    
    res.json({
      ok: true,
      linked: isLinked,
      vvaultUserId: user.vvaultUserId || null,
      vvaultPath: user.vvaultPath || null,
      linkedAt: user.vvaultLinkedAt || null,
      chattyEmail: user.email
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to check account status:", error);
    console.error("❌ [VVAULT API] Error stack:", error.stack);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to check VVAULT account status",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/vvault/account/link
 * Link a VVAULT account to Chatty user
 * Body: { vvaultUserId: string, vvaultPath: string }
 */
router.post("/account/link", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { vvaultUserId, vvaultPath } = req.body || {};

  if (!vvaultUserId || !vvaultPath) {
    return res.status(400).json({ 
      ok: false, 
      error: "Missing vvaultUserId or vvaultPath" 
    });
  }

  try {
    // Try multiple query strategies since userId could be sub, id, uid, or _id
    let user = await User.findOne({ id: userId });
    
    // Fallback to email if id query fails
    if (!user && req.user?.email) {
      user = await User.findOne({ email: req.user.email });
    }
    
    // Fallback to _id if it's a MongoDB ObjectId
    if (!user && userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      console.error(`❌ [VVAULT API] User not found for userId: ${userId}, email: ${req.user?.email}`);
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    // Update user with VVAULT account info
    user.vvaultUserId = vvaultUserId;
    user.vvaultPath = vvaultPath;
    user.vvaultLinkedAt = new Date();
    
    await user.save();

    console.log(`✅ [VVAULT API] Linked VVAULT account ${vvaultUserId} to Chatty user ${userId}`);

    res.json({
      ok: true,
      message: "VVAULT account linked successfully",
      vvaultUserId,
      vvaultPath,
      linkedAt: user.vvaultLinkedAt
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to link VVAULT account:", error);
    res.status(500).json({ ok: false, error: "Failed to link VVAULT account" });
  }
});

/**
 * POST /api/vvault/account/unlink
 * Unlink VVAULT account from Chatty user
 */
router.post("/account/unlink", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  try {
    // Try multiple query strategies since userId could be sub, id, uid, or _id
    let user = await User.findOne({ id: userId });
    
    // Fallback to email if id query fails
    if (!user && req.user?.email) {
      user = await User.findOne({ email: req.user.email });
    }
    
    // Fallback to _id if it's a MongoDB ObjectId
    if (!user && userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      console.error(`❌ [VVAULT API] User not found for userId: ${userId}, email: ${req.user?.email}`);
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    // Clear VVAULT account info
    user.vvaultUserId = null;
    user.vvaultPath = null;
    user.vvaultLinkedAt = null;
    
    await user.save();

    console.log(`✅ [VVAULT API] Unlinked VVAULT account from Chatty user ${userId}`);

    res.json({
      ok: true,
      message: "VVAULT account unlinked successfully"
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to unlink VVAULT account:", error);
    res.status(500).json({ ok: false, error: "Failed to unlink VVAULT account" });
  }
});

// Diagnostic endpoint (dev only)
if (process.env.NODE_ENV !== 'production') {
  router.get("/debug/test-read", async (req, res) => {
    try {
      console.log(`🧪 [VVAULT Debug] Starting test read...`);
      await loadVVAULTModules();
      console.log(`🧪 [VVAULT Debug] Modules loaded, VVAULT_ROOT: ${VVAULT_ROOT}`);
      
      const testEmail = req.query.email || 'dwoodson92@gmail.com';
      console.log(`🧪 [VVAULT Debug] Testing readConversations with email: ${testEmail}`);
      
      if (!readConversations) {
        throw new Error('readConversations function not available');
      }
      
      const conversations = await readConversations(testEmail);
      
      res.json({
        ok: true,
        vvaultRoot: VVAULT_ROOT,
        testEmail,
        conversationCount: conversations.length,
        conversations: conversations.map(c => ({
          sessionId: c.sessionId,
          title: c.title,
          messageCount: c.messages?.length || 0
        }))
      });
    } catch (error) {
      console.error("❌ [VVAULT Debug] Test failed:", error);
      console.error("❌ [VVAULT Debug] Error stack:", error.stack);
      res.status(500).json({
        ok: false,
        error: error.message,
        stack: error.stack,
        name: error.name
      });
    }
  });
  
  // Health check endpoint to test module loading
  router.get("/debug/test-modules", async (req, res) => {
    try {
      console.log(`🧪 [VVAULT Debug] Testing module loading...`);
      await loadVVAULTModules();
      res.json({
        ok: true,
        modulesLoaded: modulesLoaded,
        hasReadConversations: typeof readConversations === 'function',
        hasReadCharacterProfile: typeof readCharacterProfile === 'function',
        hasVVAULTConnector: typeof VVAULTConnector === 'function',
        vvaultRoot: VVAULT_ROOT
      });
    } catch (error) {
      console.error("❌ [VVAULT Debug] Module test failed:", error);
      res.status(500).json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  });
}

export default router;
