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

function parseConstructIdentifiers(rawCallsign = '') {
  const normalized = rawCallsign.replace(/^gpt-/i, '').trim();
  if (!normalized) {
    return { constructId: 'gpt', callsign: '001' };
  }

  const parts = normalized.split('-');
  if (parts.length >= 2) {
    const callsign = parts.pop() || '001';
    const constructId = parts.join('-') || 'gpt';
    return { constructId, callsign };
  }

  const match = normalized.match(/^([a-z0-9_]+)(\d+)$/i);
  if (match) {
    return { constructId: match[1], callsign: match[2] };
  }

  return { constructId: normalized, callsign: '001' };
}

router.use(requireAuth);
console.log('✅ [VVAULT Routes] requireAuth middleware applied to all routes');

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
  // Diagnostic logging: Route entry point
  console.log(`🔍 [VVAULT API] POST /conversations route hit`);
  console.log(`🔍 [VVAULT API] Request body:`, req.body);
  console.log(`🔍 [VVAULT API] Auth status - req.user:`, req.user ? 'present' : 'missing');
  console.log(`🔍 [VVAULT API] req.user details:`, req.user ? { id: req.user.id || req.user.sub, email: req.user.email } : 'none');
  
  // Check if auth middleware passed
  if (!req.user) {
    console.log(`❌ [VVAULT API] POST /conversations - req.user is missing, auth middleware may have failed`);
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }
  
  const userId = validateUser(res, req.user);
  if (!userId) {
    console.log(`❌ [VVAULT API] POST /conversations - validateUser returned null, response already sent`);
    return;
  }
  
  console.log(`✅ [VVAULT API] POST /conversations - User validated: ${userId}`);

  // CRITICAL: Always use constructCallsign format (e.g., "synth-001"), never just "synth"
  // Per rubric: instances/{constructCallsign}/ - must include callsign
  const { sessionId, title = "Chat with Synth", constructId = "synth-001" } = req.body || {};
  const session = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  console.log(`🔍 [VVAULT API] Creating conversation with:`, { sessionId: session, title, constructId, userId, email: req.user?.email });

  try {
    console.log(`🔍 [VVAULT API] Getting VVAULT connector...`);
    let connector;
    try {
      connector = await getConnector();
      console.log(`✅ [VVAULT API] VVAULT connector obtained`);
    } catch (connectorError) {
      console.error(`❌ [VVAULT API] Failed to get connector:`, connectorError);
      console.error(`❌ [VVAULT API] Connector error stack:`, connectorError.stack);
      throw new Error(`Failed to initialize VVAULT connector: ${connectorError.message}`);
    }
    
    console.log(`🔍 [VVAULT API] Writing transcript for conversation creation...`);
    try {
      await connector.writeTranscript({
        userId, // Will be resolved to VVAULT user ID in writeTranscript.js
        userEmail: req.user?.email, // Pass email for VVAULT user ID resolution
        sessionId: session,
        timestamp: new Date().toISOString(),
        role: "system",
        content: `CONVERSATION_CREATED:${title}`,
        title,
        constructId: constructId || 'synth-001', // Must use callsign format
        constructName: title,
        constructCallsign: constructId // constructId may already be in callsign format (e.g., "katana-001")
      });
      console.log(`✅ [VVAULT API] Transcript written successfully for session: ${session}`);
    } catch (writeError) {
      console.error(`❌ [VVAULT API] Failed to write transcript:`, writeError);
      console.error(`❌ [VVAULT API] Write error stack:`, writeError.stack);
      throw new Error(`Failed to write conversation transcript: ${writeError.message}`);
    }

    console.log(`✅ [VVAULT API] Conversation created successfully: ${session}`);
    res.status(201).json({
      ok: true,
      conversation: {
        sessionId: session,
        title
      }
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to create conversation:", error);
    console.error("❌ [VVAULT API] Error stack:", error.stack);
    console.error("❌ [VVAULT API] Error details:", {
      name: error.name,
      message: error.message,
      code: error.code,
      userId,
      email: req.user?.email,
      sessionId: session,
      constructId
    });
    
    res.status(500).json({ 
      ok: false, 
      error: "Failed to create VVAULT conversation",
      details: error.message || 'Unknown error',
      code: error.code || 'UNKNOWN_ERROR'
    });
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
    // CRITICAL: Always use constructCallsign format (e.g., "synth-001"), never just "synth"
    const actualConstructId = constructId || metadata?.constructId || 'synth-001';
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

  const { 
    constructCallsign, 
    query, 
    limit = 10,
    queryMode = 'semantic',
    anchorTypes,
    minSignificance,
    relationshipPatterns,
    emotionalState
  } = req.query || {};
  
  if (!constructCallsign || !query) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or query" });
  }

  try {
    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();
    
    // Parse anchor-based query options
    const options = {
      queryMode: queryMode === 'anchor' ? 'anchor' : 'semantic',
      anchorTypes: anchorTypes ? anchorTypes.split(',').filter(Boolean) : [],
      minSignificance: minSignificance ? parseFloat(minSignificance) : 0,
      relationshipPatterns: relationshipPatterns ? relationshipPatterns.split(',').filter(Boolean) : [],
      emotionalState: emotionalState || undefined,
    };
    
    const identities = await identityService.queryIdentities(
      userId,
      constructCallsign,
      query,
      parseInt(limit, 10),
      options
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
    
    // Resolve VVAULT user ID (with auto-create if needed)
    const { resolveVVAULTUserId } = require("../../vvaultConnector/writeTranscript.js");
    const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email, true, req.user?.name);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
    }
    
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
    console.error("❌ [VVAULT API] Error details:", {
      message: error.message,
      stack: error.stack,
      userId,
      constructCallsign,
      contextLength: context?.length,
      responseLength: response?.length
    });
    res.status(500).json({ 
      ok: false, 
      error: "Failed to store identity",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get("/identity/list", async (req, res) => {
  // Diagnostic logging: Route entry point
  console.log(`🔍 [VVAULT API] /identity/list route hit`);
  console.log(`🔍 [VVAULT API] Request method: ${req.method}, path: ${req.path}, url: ${req.url}`);
  console.log(`🔍 [VVAULT API] Query params:`, req.query);
  console.log(`🔍 [VVAULT API] Auth status - req.user:`, req.user ? 'present' : 'missing');
  console.log(`🔍 [VVAULT API] req.user details:`, req.user ? { id: req.user.id || req.user.sub, email: req.user.email } : 'none');
  
  // Check if auth middleware passed
  if (!req.user) {
    console.log(`❌ [VVAULT API] /identity/list - req.user is missing, auth middleware may have failed`);
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }
  
  const userId = validateUser(res, req.user);
  if (!userId) {
    console.log(`❌ [VVAULT API] /identity/list - validateUser returned null, response already sent`);
    return;
  }
  
  console.log(`✅ [VVAULT API] /identity/list - User validated: ${userId}`);

  const { constructCallsign } = req.query || {};
  
  if (!constructCallsign) {
    console.log(`❌ [VVAULT API] /identity/list - Missing constructCallsign in query params`);
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }
  
  console.log(`📋 [VVAULT API] Listing identity files for construct: ${constructCallsign}, user: ${userId}`);

  try {
    console.log(`🔍 [VVAULT API] Loading VVAULT modules...`);
    await loadVVAULTModules();
    console.log(`✅ [VVAULT API] VVAULT modules loaded`);
    
    const { resolveVVAULTUserId } = require("../../vvaultConnector/writeTranscript.js");
    const fs = require('fs').promises;
    const path = require('path');

    // Resolve VVAULT user ID
    console.log(`🔍 [VVAULT API] Resolving VVAULT user ID for: ${userId}, email: ${req.user?.email}`);
    let vvaultUserId;
    try {
      vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email, false, req.user?.name);
    } catch (resolveError) {
      console.error(`❌ [VVAULT API] Error resolving VVAULT user ID:`, resolveError);
      return res.status(500).json({ 
        ok: false, 
        error: "Failed to resolve VVAULT user ID",
        details: resolveError.message 
      });
    }
    
    if (!vvaultUserId) {
      console.log(`❌ [VVAULT API] Failed to resolve VVAULT user ID for: ${userId} (returned null/undefined)`);
      return res.status(404).json({ 
        ok: false, 
        error: "User not found in VVAULT",
        userId: userId,
        email: req.user?.email
      });
    }
    console.log(`✅ [VVAULT API] VVAULT user ID resolved: ${vvaultUserId}`);

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
    
    console.log(`🔍 [VVAULT API] Instance base path: ${instanceBasePath}`);
    console.log(`🔍 [VVAULT API] VVAULT_ROOT: ${VVAULT_ROOT}`);

    // Check both identity and chatgpt directories (legacy support)
    const directoriesToCheck = ['identity', 'chatgpt'];
    const identityFiles = [];

    for (const dirName of directoriesToCheck) {
      const dirPath = path.join(instanceBasePath, dirName);
      console.log(`🔍 [VVAULT API] Checking directory: ${dirPath}`);
      
      // Check if directory exists
      try {
        await fs.access(dirPath);
        console.log(`✅ [VVAULT API] Directory exists: ${dirPath}`);
      } catch (error) {
        // Directory doesn't exist, skip it
        console.log(`ℹ️ [VVAULT API] Directory does not exist: ${dirPath}, skipping`);
        continue;
      }

      // Read directory and filter for identity files
      try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        console.log(`📁 [VVAULT API] Found ${files.length} items in ${dirPath}`);

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
                console.log(`✅ [VVAULT API] Added file: ${file.name} (${stats.size} bytes)`);
              } catch (error) {
                console.warn(`⚠️ [VVAULT API] Failed to stat file ${file.name}:`, error);
              }
            } else {
              console.log(`ℹ️ [VVAULT API] Skipping unsupported file type: ${file.name} (${ext})`);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [VVAULT API] Failed to read directory ${dirPath}:`, error);
      }
    }

    // Sort by modified date (newest first)
    identityFiles.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    console.log(`✅ [VVAULT API] Returning ${identityFiles.length} identity files for ${constructCallsign}`);
    res.json({
      ok: true,
      files: identityFiles
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to list identity files:", error);
    console.error("❌ [VVAULT API] Error stack:", error.stack);
    
    // Distinguish between different error types
    if (error.code === 'ENOENT') {
      return res.status(404).json({ 
        ok: false, 
        error: "Directory not found in VVAULT",
        constructCallsign: constructCallsign,
        details: error.message 
      });
    }
    
    if (error.message && error.message.includes('VVAULT')) {
      return res.status(500).json({ 
        ok: false, 
        error: "VVAULT system error",
        details: error.message 
      });
    }
    
    res.status(500).json({ 
      ok: false, 
      error: "Failed to list identity files", 
      details: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

router.get("/identity/blueprint", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const constructCallsign = (req.query.constructCallsign || '').toString().trim();
  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  let constructId, callsign;
  try {
    const parsed = parseConstructIdentifiers(constructCallsign);
    constructId = parsed.constructId;
    callsign = parsed.callsign;
  } catch (parseError) {
    console.error("❌ [VVAULT API] Failed to parse constructCallsign:", parseError);
    return res.status(400).json({ 
      ok: false, 
      error: "Invalid constructCallsign format",
      details: process.env.NODE_ENV === 'development' ? parseError.message : undefined
    });
  }

  try {
    // Import IdentityMatcher with error handling
    let IdentityMatcher;
    try {
      const module = await import('../../src/engine/character/IdentityMatcher.js');
      IdentityMatcher = module.IdentityMatcher;
      if (!IdentityMatcher) {
        throw new Error('IdentityMatcher not exported from module');
      }
    } catch (importError) {
      console.error("❌ [VVAULT API] Failed to import IdentityMatcher:", {
        error: importError.message,
        stack: importError.stack?.substring(0, 300)
      });
      return res.status(500).json({ 
        ok: false, 
        error: "Failed to import IdentityMatcher module",
        details: process.env.NODE_ENV === 'development' ? importError.message : undefined
      });
    }
    
    // Instantiate IdentityMatcher with error handling
    let matcher;
    try {
      matcher = new IdentityMatcher();
    } catch (constructorError) {
      console.error("❌ [VVAULT API] Failed to instantiate IdentityMatcher:", {
        error: constructorError.message,
        stack: constructorError.stack?.substring(0, 300)
      });
      return res.status(500).json({ 
        ok: false, 
        error: "Failed to instantiate IdentityMatcher",
        details: process.env.NODE_ENV === 'development' ? constructorError.message : undefined
      });
    }
    
    // loadPersonalityBlueprint returns null on error, doesn't throw
    let blueprint;
    try {
      blueprint = await matcher.loadPersonalityBlueprint('' + userId, constructId, callsign);
    } catch (loadError) {
      // This shouldn't happen (loadPersonalityBlueprint has try-catch), but handle it anyway
      console.error("❌ [VVAULT API] Unexpected error from loadPersonalityBlueprint:", {
        error: loadError.message,
        stack: loadError.stack?.substring(0, 300)
      });
      return res.status(500).json({ 
        ok: false, 
        error: "Unexpected error loading blueprint",
        details: process.env.NODE_ENV === 'development' ? loadError.message : undefined
      });
    }

    if (!blueprint) {
      console.log(`ℹ️ [VVAULT API] Blueprint not found for user: ${userId}, construct: ${constructId}-${callsign}`);
      return res.status(404).json({ ok: false, error: "Blueprint not found" });
    }

    res.json({ ok: true, blueprint });
  } catch (error) {
    // This catch handles any completely unexpected errors
    console.error("❌ [VVAULT API] Unexpected error in blueprint endpoint:", {
      error: error.message,
      stack: error.stack?.substring(0, 500),
      userId,
      constructId,
      callsign,
      constructCallsign,
      errorName: error.name,
      errorCode: error.code
    });
    
    res.status(500).json({ 
      ok: false, 
      error: "Failed to load blueprint",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
/**
 * Trigger personality extraction from transcript (async, non-blocking)
 */
async function triggerPersonalityExtraction(
  transcriptContent,
  constructCallsign,
  userId,
  transcriptPath,
  filename
) {
  try {
    // Extract construct ID and callsign from constructCallsign
    const constructMatch = constructCallsign.match(/^([a-z]+)-?(\d+)$/i);
    if (!constructMatch) {
      console.warn(`⚠️ [PersonalityExtraction] Invalid construct callsign: ${constructCallsign}`);
      return;
    }

    const constructId = constructMatch[1];
    const callsign = constructMatch[2] || '001';

    // Dynamic import to avoid loading in browser context
    const { DeepTranscriptParser } = await import('../../src/engine/transcript/DeepTranscriptParser.js');
    const { PersonalityExtractor } = await import('../../src/engine/character/PersonalityExtractor.js');
    const { IdentityMatcher } = await import('../../src/engine/character/IdentityMatcher.js');

    // Parse transcript
    const parser = new DeepTranscriptParser();
    const analysis = await parser.parseTranscript(transcriptContent, constructId, transcriptPath);

    // Extract personality blueprint
    const extractor = new PersonalityExtractor();
    const blueprint = await extractor.buildPersonalityBlueprint([analysis]);

    // Persist blueprint
    const matcher = new IdentityMatcher();
    await matcher.persistPersonalityBlueprint(userId, constructId, callsign, blueprint);

    console.log(`✅ [PersonalityExtraction] Extracted and persisted personality blueprint for ${constructCallsign}`);
  } catch (error) {
    console.error('❌ [PersonalityExtraction] Failed:', error);
    throw error;
  }
}

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

          // AUTO-INDEX: Immediately import transcript to ChromaDB (always-on background indexing)
          try {
            const { getHybridMemoryService } = require('../services/hybridMemoryService.js');
            const hybridMemoryService = getHybridMemoryService();
            
            // Auto-index transcript to ChromaDB (zero downtime, background process)
            const indexResult = await hybridMemoryService.autoIndexTranscript(
              userId,
              constructCallsign,
              filePath
            );
            
            if (indexResult.success) {
              console.log(`✅ [VVAULT API] Auto-indexed ${indexResult.importedCount} memories to ChromaDB`);
            } else {
              console.warn(`⚠️ [VVAULT API] Auto-indexing failed (non-critical):`, indexResult.error);
            }
          } catch (indexError) {
            console.warn(`⚠️ [VVAULT API] Auto-indexing error (non-critical, transcript still saved):`, indexError);
          }

          // Legacy: Also parse and import conversation pairs (for backward compatibility)
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

          // Trigger deep parsing and personality extraction (async, non-blocking)
          if (conversationPairs.length > 0) {
            triggerPersonalityExtraction(
              parsed.extractedText,
              constructCallsign,
              userId,
              filePath,
              file.originalname || file.name
            ).catch(err => {
              console.warn('⚠️ [VVAULT API] Personality extraction failed (non-critical):', err);
            });
          }

          results.push({
            success: true,
            filePath,
            metadata: {
              originalName: file.originalname || file.name,
              originalType: file.mimetype || file.type,
              originalSize: file.size,
              wordCount: parsed.metadata.wordCount,
              conversationPairs: conversationPairs.length
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

/**
 * Serve persona files from user-specific prompts/customAI directory
 */
router.get("/identity/persona/:filename", requireAuth, async (req, res) => {
  try {
    const userId = validateUser(res, req.user);
    if (!userId) return;

    const { filename } = req.params;
    
    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(403).json({ ok: false, error: 'Invalid filename' });
    }
    
    // Only allow .md files
    if (!filename.endsWith('.md')) {
      return res.status(403).json({ ok: false, error: 'Only markdown files allowed' });
    }
    
    const path = await import('path');
    const fs = await import('fs/promises');
    const { getUserPersonaDirectory } = await import('../lib/userRegistry.js');
    
    try {
      // Get user's persona directory
      const personaDir = await getUserPersonaDirectory(userId);
      const personaPath = path.join(personaDir, filename);
      
      // Security: verify path is within user's directory
      if (!personaPath.startsWith(personaDir)) {
        return res.status(403).json({ ok: false, error: 'Access denied' });
      }
      
      const content = await fs.readFile(personaPath, 'utf8');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(content);
    } catch (error) {
      if (error.code === 'ENOENT' || error.message.includes('not found')) {
        // Fallback to global prompts/customAI directory for backward compatibility
        const { fileURLToPath } = await import('url');
        const { dirname } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const projectRoot = path.resolve(__dirname, '../..');
        const fallbackPath = path.join(projectRoot, 'prompts', 'customAI', filename);
        
        try {
          const content = await fs.readFile(fallbackPath, 'utf8');
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.send(content);
        } catch (fallbackError) {
          return res.status(404).json({ ok: false, error: 'Persona file not found' });
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to serve persona file:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to serve persona file' });
  }
});

// ============================================
// Brevity Layer Endpoints
// ============================================

// Store brevity layer configuration
router.post("/brevity/config", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, config } = req.body || {};
  
  if (!constructCallsign || !config) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or config" });
  }

  try {
    const { writeBrevityConfig } = await import('../services/brevityLayerService.js');
    const savedConfig = await writeBrevityConfig(
      userId,
      constructCallsign,
      config,
      req.user?.email
    );

    res.json({
      ok: true,
      config: savedConfig
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to store brevity config:", error);
    res.status(500).json({ ok: false, error: "Failed to store brevity config" });
  }
});

// Retrieve brevity layer configuration
router.get("/brevity/config", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query || {};
  
  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { readBrevityConfig } = await import('../services/brevityLayerService.js');
    const config = await readBrevityConfig(userId, constructCallsign, req.user?.email, req.user?.name);

    res.json({
      ok: true,
      config: config // null if not found (caller should use defaults)
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to retrieve brevity config:", error);
    res.status(500).json({ ok: false, error: "Failed to retrieve brevity config" });
  }
});

// Store analytical sharpness settings
router.post("/brevity/analytics", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, config } = req.body || {};
  
  if (!constructCallsign || !config) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or config" });
  }

  try {
    const { writeAnalyticalSharpness } = await import('../services/brevityLayerService.js');
    const savedConfig = await writeAnalyticalSharpness(
      userId,
      constructCallsign,
      config,
      req.user?.email
    );

    res.json({
      ok: true,
      config: savedConfig
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to store analytical sharpness:", error);
    res.status(500).json({ ok: false, error: "Failed to store analytical sharpness" });
  }
});

// Retrieve analytical sharpness settings
router.get("/brevity/analytics", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query || {};
  
  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { readAnalyticalSharpness } = await import('../services/brevityLayerService.js');
    const config = await readAnalyticalSharpness(userId, constructCallsign, req.user?.email, req.user?.name);

    res.json({
      ok: true,
      config: config // null if not found (caller should use defaults)
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to retrieve analytical sharpness:", error);
    res.status(500).json({ ok: false, error: "Failed to retrieve analytical sharpness" });
  }
});

// ============================================
// Capsule Generation Endpoint
// ============================================

router.post("/capsules/generate", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, gptConfig, transcriptData } = req.body || {};
  
  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      throw new Error('VVAULT root not configured');
    }

    const { resolveVVAULTUserId } = require("../../vvaultConnector/writeTranscript.js");
    const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email, true, req.user?.name);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
    }

    // Use constructCallsign DIRECTLY for instance directory (e.g., "katana-001")
    // DO NOT parse into constructId-callsign and reconstruct (would create "katana-katana-001")
    // Per documentation: instances/{constructCallsign}/
    
    // Build instance directory path: users/{shard}/{userId}/instances/{constructCallsign}
    const instancePath = path.join(
      VVAULT_ROOT,
      'users',
      'shard_0000',
      vvaultUserId,
      'instances',
      constructCallsign // Use directly, not parsed
    );
    
    // instanceName is same as constructCallsign (used in capsule metadata)
    const instanceName = constructCallsign;

    // Call CapsuleForge via Python bridge
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs').promises;
    
    // Use CapsuleForge bridge script
    const bridgePath = path.join(__dirname, 'services', 'capsuleForgeBridge.py');
    
    // Check if bridge exists
    try {
      await fs.access(bridgePath);
    } catch (error) {
      throw new Error(`CapsuleForge bridge not found at ${bridgePath}`);
    }

    // Extract traits from GPT config or use defaults
    // Try to load existing capsule to preserve exact scoring
    let traits = gptConfig?.traits || {};
    try {
      const { getCapsuleLoader } = require('../services/capsuleLoader.js');
      const capsuleLoader = getCapsuleLoader();
      const existingCapsule = await capsuleLoader.loadCapsule(userId, constructCallsign, VVAULT_ROOT);
      
      if (existingCapsule && existingCapsule.data && existingCapsule.data.traits) {
        // Preserve exact scoring from existing capsule
        traits = existingCapsule.data.traits;
        console.log(`✅ [VVAULT API] Preserving exact traits from existing capsule:`, Object.keys(traits));
      }
    } catch (error) {
      console.warn(`⚠️ [VVAULT API] Could not load existing capsule for trait preservation:`, error);
      // Use defaults if no existing capsule
      if (Object.keys(traits).length === 0) {
        traits = {
          creativity: 0.7,
          empathy: 0.6,
          persistence: 0.8,
          analytical: 0.7,
          directness: 0.8
        };
      }
    }

    // Extract memory log from transcript data or use empty array
    const memoryLog = transcriptData?.memoryLog || [];
    
    // Extract personality type from GPT config or use default
    let personalityType = gptConfig?.personalityType || 'UNKNOWN';
    
    // Try to preserve personality type from existing capsule
    try {
      const { getCapsuleLoader } = require('../services/capsuleLoader.js');
      const capsuleLoader = getCapsuleLoader();
      const existingCapsule = await capsuleLoader.loadCapsule(userId, constructCallsign, VVAULT_ROOT);
      
      if (existingCapsule && existingCapsule.data && existingCapsule.data.personality) {
        personalityType = existingCapsule.data.personality.personality_type || personalityType;
      }
    } catch (error) {
      // Use default if no existing capsule
    }

    // Prepare capsule generation data
    const capsuleData = {
      instance_name: instanceName, // Same as constructCallsign (e.g., "katana-001")
      traits,
      memory_log: memoryLog,
      personality_type: personalityType,
      additional_data: {
        constructCallsign, // Use constructCallsign directly (e.g., "katana-001")
        gptConfig: gptConfig || {},
        generatedAt: new Date().toISOString(),
        generatedBy: 'chatty-gpt-creator'
      },
      vault_path: VVAULT_ROOT,
      instance_path: instancePath  // New: save directly in instance directory
    };
    
    console.log(`📦 [VVAULT API] Generating capsule with instance_path: ${instancePath}`);

    // Call CapsuleForge via Python bridge
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [
        bridgePath,
        'generate',
        JSON.stringify(capsuleData)
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(bridgePath)
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = stdout.trim() ? JSON.parse(stdout) : { success: true, path: stdout.trim() };
            console.log(`✅ [VVAULT API] Capsule generated: ${result.path || result.capsulePath}`);
            
            res.json({
              ok: true,
              capsulePath: result.path || result.capsulePath,
              instanceName,
              fingerprint: path.basename(result.path || result.capsulePath || '')
            });
            resolve();
          } catch (error) {
            // If output is not JSON, assume it's the capsule path
            const capsulePath = stdout.trim();
            if (capsulePath) {
              console.log(`✅ [VVAULT API] Capsule generated: ${capsulePath}`);
              res.json({
                ok: true,
                capsulePath,
                instanceName,
                fingerprint: path.basename(capsulePath)
              });
              resolve();
            } else {
              reject(new Error(`Failed to parse CapsuleForge output: ${stdout}`));
            }
          }
        } else {
          reject(new Error(`CapsuleForge failed with code ${code}: ${stderr || stdout}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start CapsuleForge: ${error.message}`));
      });
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to generate capsule:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to generate capsule",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// Capsule Loading Endpoint
// ============================================

router.get("/capsules/load", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query;
  
  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      throw new Error('VVAULT root not configured');
    }

    const { getCapsuleLoader } = require('../services/capsuleLoader.js');
    const capsuleLoader = getCapsuleLoader();
    
    const capsule = await capsuleLoader.loadCapsule(userId, constructCallsign, VVAULT_ROOT);
    
    if (!capsule) {
      return res.status(404).json({ ok: false, error: "Capsule not found" });
    }

    res.json({
      ok: true,
      capsule: capsule.data,
      path: capsule.path
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to load capsule:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to load capsule",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Query brevity-optimized memories
router.get("/brevity/memories", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, query, limit = 10, includeBrevityExamples = false, minBrevityScore, oneWordOnly } = req.query || {};
  
  if (!constructCallsign || !query) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or query" });
  }

  try {
    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();
    
    // Query identities with brevity context
    let identities = await identityService.queryIdentities(
      userId,
      constructCallsign,
      query,
      parseInt(limit, 10) * 2 // Get more to filter by brevity
    );

    // Filter by brevity metadata if requested
    if (oneWordOnly === 'true') {
      identities = identities.filter(m => 
        m.metadata?.oneWordResponse === true || 
        m.metadata?.wordCount === 1
      );
    }

    if (minBrevityScore) {
      const minScore = parseFloat(minBrevityScore);
      identities = identities.filter(m => 
        (m.metadata?.brevityScore || 0) >= minScore
      );
    }

    // Limit to requested amount
    identities = identities.slice(0, parseInt(limit, 10));

    // Add brevity examples if requested
    if (includeBrevityExamples === 'true') {
      const brevityExamples = identities.filter(m => 
        m.metadata?.tags?.some(tag => tag.startsWith('brevity:'))
      );
      identities = [...brevityExamples, ...identities].slice(0, parseInt(limit, 10));
    }

    res.json({
      ok: true,
      memories: identities
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to query brevity memories:", error);
    res.status(500).json({ ok: false, error: "Failed to query brevity memories" });
  }
});

// Log route registration for debugging
console.log('✅ [VVAULT Routes] Router initialized with routes:');
console.log('  - GET /conversations');
console.log('  - GET /identity/query');
console.log('  - GET /identity/list');
console.log('  - GET /identity/blueprint');
console.log('  - POST /identity/store');
console.log('  - GET /profile');
console.log('  - POST /identity/upload');
console.log('  - GET /brevity/config');
console.log('  - POST /brevity/config');
console.log('  - GET /brevity/analytics');
console.log('  - POST /brevity/analytics');
console.log('  - GET /brevity/memories');
console.log('  - POST /capsules/generate');
console.log('  - GET /capsules/load');

// Get user profile (from OAuth + VVAULT)
router.get("/profile", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  try {
    // Get OAuth data from JWT (already in req.user)
    const oauthProfile = {
      name: req.user.name,
      email: req.user.email,
      given_name: req.user.given_name,
      family_name: req.user.family_name,
      locale: req.user.locale,
      picture: req.user.picture
    };

    // Try to get VVAULT profile for additional context
    let vvaultProfile = null;
    try {
      const { resolveVVAULTUserId } = require("../../vvaultConnector/writeTranscript.js");
      const vvaultUserId = await resolveVVAULTUserId(userId, req.user.email, false, req.user.name);
      if (vvaultUserId) {
        const fs = require('fs').promises;
        const path = require('path');
        const { VVAULT_ROOT } = require("../../vvaultConnector/config.js");
        const profilePath = path.join(
          VVAULT_ROOT,
          'users',
          'shard_0000',
          vvaultUserId,
          'identity',
          'profile.json'
        );
        try {
          const profileContent = await fs.readFile(profilePath, 'utf8');
          vvaultProfile = JSON.parse(profileContent);
        } catch {
          // VVAULT profile doesn't exist yet - that's okay
        }
      }
    } catch (error) {
      // VVAULT lookup failed - that's okay, use OAuth data only
      console.warn('⚠️ [VVAULT API] Could not load VVAULT profile:', error.message);
    }

    // Merge OAuth + VVAULT profile data
    const mergedProfile = {
      ...oauthProfile,
      vvault_user_id: vvaultProfile?.user_id || null,
      vvault_linked: !!vvaultProfile
    };

    res.json({
      ok: true,
      profile: mergedProfile
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to retrieve user profile:", error);
    res.status(500).json({ ok: false, error: "Failed to retrieve user profile" });
  }
});

export default router;
