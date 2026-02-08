import express from "express";
import { createRequire } from "module";
import path from "path";
import { requireAuth } from "../middleware/auth.js";
import User from "../models/User.js";
import { createPrimaryConversationFile } from "../services/importService.js";
import multer from "multer";
import OpenAI from "openai";
import { loadIdentityFiles } from "../lib/identityLoader.js";
import { GPTManager } from "../lib/gptManager.js";

// Timestamp all console output from this module
const patchConsoleWithTimestamp = () => {
  if (console.__tsPatched) return;
  const withTs = (fn) => (...args) => fn(new Date().toISOString(), ...args);
  console.log = withTs(console.log.bind(console));
  console.error = withTs(console.error.bind(console));
  console.warn = withTs(console.warn.bind(console));
  console.__tsPatched = true;
};
patchConsoleWithTimestamp();

const require = createRequire(import.meta.url);
const router = express.Router();

// OpenRouter client for fallback when VVAULT API is unavailable
// Supports both Replit AI Integrations (AI_INTEGRATIONS_*) and standard env vars (OPENROUTER_*)
const OPENROUTER_API_KEY = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const openrouter = OPENROUTER_API_KEY ? new OpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: OPENROUTER_API_KEY,
}) : null;

const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct';

// OpenAI client via Replit AI Integrations (managed, billed to credits)
const openaiClient = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ? new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
}) : null;

// GPT Manager singleton for fetching GPT configurations
const gptManager = GPTManager.getInstance();

/**
 * resolveModelForGPT - Single source of truth for model resolution.
 * 
 * Priority: GPTCreator config > environment default > hardcoded default.
 * The DEFAULT_OPENROUTER_MODEL only fills gaps when GPTCreator has no model set.
 * 
 * @param {object|null} gptConfig - The GPT record from the database (has conversationModel, modelId, etc.)
 * @param {object} availability - Which providers are currently available
 * @param {boolean} availability.openai - Whether OpenAI client is configured
 * @param {boolean} availability.openrouter - Whether OpenRouter client is configured
 * @param {boolean} availability.ollama - Whether Ollama host is configured
 * @returns {{ provider: string, model: string, source: string }}
 */
function resolveModelForGPT(gptConfig, availability = {}) {
  const configured = (gptConfig?.conversationModel || gptConfig?.modelId || '').trim();

  let provider = 'openrouter';
  let model = DEFAULT_OPENROUTER_MODEL;
  let source = 'default';

  if (configured) {
    source = 'gpt_config';
    if (configured.startsWith('openai:')) {
      provider = 'openai';
      model = configured.substring(7);
    } else if (configured.startsWith('openrouter:')) {
      provider = 'openrouter';
      model = configured.substring(11);
    } else if (configured.startsWith('ollama:')) {
      provider = 'ollama';
      model = configured.substring(7);
    } else if (/^(gpt-|o1-|o3-|davinci|curie|babbage|ada)/.test(configured)) {
      provider = 'openai';
      model = configured;
    } else {
      provider = 'openrouter';
      model = configured;
    }
  }

  const requestedProvider = provider;
  const requestedModel = model;

  if (provider === 'openai' && !availability.openai) {
    provider = 'openrouter';
    model = availability.openrouter ? DEFAULT_OPENROUTER_MODEL : model;
    source = `fallback_from_openai`;
  }
  if (provider === 'ollama' && !availability.ollama) {
    provider = 'openrouter';
    model = availability.openrouter ? DEFAULT_OPENROUTER_MODEL : model;
    source = `fallback_from_ollama`;
  }
  if (provider === 'openrouter' && !availability.openrouter) {
    if (availability.openai) {
      provider = 'openai';
      model = 'gpt-4o';
      source = 'fallback_to_openai';
    } else {
      return { provider: null, model: null, source: 'no_provider', error: 'No LLM provider available. Configure OpenAI, OpenRouter, or Ollama.' };
    }
  }

  if (requestedProvider !== provider) {
    console.warn(`⚠️ [ModelResolver] ${requestedProvider}:${requestedModel} unavailable, falling back to ${provider}:${model}`);
  }

  console.log(`🤖 [ModelResolver] Resolved: ${provider}:${model} (source: ${source}${configured ? `, gpt_configured: ${configured}` : ''})`);
  return { provider, model, source };
}

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
let readConversations, readCharacterProfile, VVAULTConnector, VVAULT_ROOT, writeTranscript, resolveVVAULTUserId;
let modulesLoaded = false;

async function loadVVAULTModules() {
  if (modulesLoaded) return;

  try {
    const readConv = await import("../../vvaultConnector/readConversations.js");
    readConversations = readConv.readConversations;

    const readChar = require("../../vvaultConnector/readCharacterProfile.js");
    readCharacterProfile = readChar.readCharacterProfile;

    const connector = require("../../vvaultConnector/index.js");
    VVAULTConnector = connector.VVAULTConnector;
    
    const writeModule = await import("../../vvaultConnector/writeTranscript.js");
    writeTranscript = writeModule.writeTranscript;
    resolveVVAULTUserId = writeModule.resolveVVAULTUserId;

    const config = require("../../vvaultConnector/config.js");
    VVAULT_ROOT = config.VVAULT_ROOT;

    modulesLoaded = true;
    console.log('✅ [VVAULT] Modules loaded:', { 
      hasReadConversations: !!readConversations, 
      hasWriteTranscript: !!writeTranscript,
      hasVVAULTConnector: !!VVAULTConnector 
    });
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

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(daysAgo) {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

function buildTestMemoryFixtures() {
  return [
    {
      context: "Last conversation we discussed the microservices architecture migration project. You mentioned it's scheduled for completion by 2025-12-15.",
      response: "Yes, the microservices migration is our top priority. We're targeting December 15th for completion. I'll keep you updated on progress.",
      timestamp: isoDaysAgo(2),
      metadata: {
        dates: ['2025-12-15'],
        names: ['microservices architecture migration project'],
        anchorType: 'defining-moment'
      }
    },
    {
      context: "I claim you as my primary AI assistant for all technical decisions. This is a commitment I'm making.",
      response: "Understood. I accept this claim and will serve as your primary technical advisor.",
      timestamp: isoDaysAgo(7),
      metadata: {
        anchorType: 'claim',
        dates: [isoDaysAgo(7).split('T')[0]]
      }
    },
    {
      context: "I vow to always be direct and honest with you. No sugar-coating, no fluff.",
      response: "I appreciate that vow. Directness is what I value most. I'll hold you to it.",
      timestamp: isoDaysAgo(10),
      metadata: {
        anchorType: 'vow',
        dates: [isoDaysAgo(10).split('T')[0]]
      }
    },
    {
      context: "We need to establish a boundary: never interrupt me when I'm in deep focus mode. That's a hard rule.",
      response: "Boundary established. I will not interrupt during deep focus mode. This is now a hard rule.",
      timestamp: isoDaysAgo(14),
      metadata: {
        anchorType: 'boundary',
        dates: [isoDaysAgo(14).split('T')[0]]
      }
    },
    {
      context: "The most significant moment in our relationship was when you helped me debug that critical production issue on 2025-11-10. That changed everything.",
      response: "That was indeed a defining moment. Working together under pressure forged our partnership.",
      timestamp: isoDaysAgo(15),
      metadata: {
        anchorType: 'defining-moment',
        dates: ['2025-11-10']
      }
    },
    {
      context: "I've been working with Sarah Chen and Michael Rodriguez on the project. They're key stakeholders.",
      response: "Noted. Sarah Chen and Michael Rodriguez are key stakeholders. I'll remember their involvement.",
      timestamp: isoDaysAgo(5),
      metadata: {
        names: ['Sarah Chen', 'Michael Rodriguez'],
        relationshipPattern: 'stakeholder-alignment'
      }
    },
    {
      context: "Our relationship reached a new level when we completed the first major milestone together. That was a relationship marker.",
      response: "Yes, that milestone completion marked a significant evolution in our working relationship.",
      timestamp: isoDaysAgo(20),
      metadata: {
        anchorType: 'relationship-marker',
        dates: [isoDaysAgo(20).split('T')[0]]
      }
    },
    {
      context: "We discussed the API redesign on 2025-11-05. The main points were performance optimization and backward compatibility.",
      response: "The API redesign discussion covered performance optimization and maintaining backward compatibility. Key decisions were made.",
      timestamp: isoDaysAgo(20),
      metadata: {
        dates: ['2025-11-05'],
        names: ['API redesign']
      }
    },
    {
      context: "I told you about Project Phoenix on 2025-10-28. It's a complete rewrite of our legacy system.",
      response: "Project Phoenix - the legacy system rewrite. I understand the scope and importance.",
      timestamp: isoDaysAgo(28),
      metadata: {
        dates: ['2025-10-28'],
        names: ['Project Phoenix']
      }
    },
    {
      context: "Pattern I've noticed: we always have our best technical discussions on Tuesdays and Thursdays. Those are our deep work days.",
      response: "Tuesdays and Thursdays are indeed our most productive technical discussion days. The pattern is clear.",
      timestamp: isoDaysAgo(3),
      metadata: {
        dates: ['Tuesday', 'Thursday'],
        relationshipPattern: 'deep-work-rhythm'
      }
    }
  ];
}

function normalizeConstructCallsigns(rawCallsign = '') {
  const callsigns = new Set();
  const trimmed = (rawCallsign || '').trim();
  if (!trimmed) {
    return [];
  }
  callsigns.add(trimmed);
  if (trimmed.startsWith('gpt-')) {
    callsigns.add(trimmed.substring(4));
  } else {
    callsigns.add(`gpt-${trimmed}`);
  }
  return Array.from(callsigns);
}

async function seedFixturesForCallsign(identityService, userId, constructCallsign, fixtures, seedMetadata = {}) {
  let added = 0;
  for (const fixture of fixtures) {
    const metadata = {
      ...fixture.metadata,
      ...seedMetadata,
      timestamp: fixture.timestamp,
      sessionId: `seed-${constructCallsign}`,
      sourceModel: seedMetadata.sourceModel || 'auto-seed',
      seedSource: seedMetadata.seedSource || 'auto-seed',
      testMemory: true,
      anchorType: fixture.metadata?.anchorType
    };

    const result = await identityService.addIdentity(
      userId,
      constructCallsign,
      fixture.context,
      fixture.response,
      metadata
    );

    if (result?.success && !result.skipped && !result.duplicate) {
      added += 1;
    }
  }
  return added;
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

    // CRITICAL FIX: Use email for Supabase lookups (Supabase users table has email as identifier)
    // Email is preferred because Supabase can resolve dwoodson92@gmail.com -> devon_woodson_1762969514958
    let lookupId = linkedVvaultUserId;
    
    // For Supabase mode, prefer email since supabaseStore can resolve it to the correct user
    if (email && email !== '(no req.user.email)') {
      lookupId = email;
      console.log(`✅ [VVAULT API] Using email for Supabase lookup: ${lookupId}`);
    } else if (!lookupId) {
      // Fallback to resolveVVAULTUserId for filesystem mode
      try {
        lookupId = await resolveVVAULTUserId(userId, email, false);
        if (lookupId) {
          console.log(`✅ [VVAULT API] Resolved VVAULT user ID: ${lookupId} for email: ${email}`);
        }
      } catch (resolveError) {
        console.warn(`⚠️ [VVAULT API] Failed to resolve VVAULT user ID:`, resolveError.message);
      }
    }

    // Final fallback to userId
    if (!lookupId) {
      lookupId = userId;
      console.warn(`⚠️ [VVAULT API] Using fallback lookupId: ${lookupId}`);
    }

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

    // resolveVVAULTUserId loaded via loadVVAULTModules()
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
      // Use standalone writeTranscript function (not a method on connector)
      await loadVVAULTModules(); // Ensure modules are loaded
      await writeTranscript({
        userId, // Will be resolved to VVAULT user ID in writeTranscript.js
        userEmail: req.user?.email, // Pass email for VVAULT user ID resolution
        sessionId: session,
        timestamp: new Date().toISOString(),
        role: "system",
        content: `CONVERSATION_CREATED:${title}`,
        title,
        constructId: constructId || 'synth-001', // Must use callsign format
        constructName: title,
        constructCallsign: constructId // constructId may already be in callsign format (e.g., "example-construct-001")
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
    console.log('📦 [VVAULT API] Extracting content from packets...');
    console.log(`📦 [VVAULT API] Packets array length: ${packets.length}`);
    finalContent = packets
      .map(packet => {
        if (!packet) return '';
        if (packet.op === 'answer.v1' && packet.payload?.content) {
          const extracted = packet.payload.content;
          console.log(`✅ [VVAULT API] Extracted content from packet: ${extracted.substring(0, 50)}${extracted.length > 50 ? '...' : ''}`);
          return extracted;
        }
        try {
          return JSON.stringify(packet.payload ?? packet);
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join('\n\n');
    console.log(`📝 [VVAULT API] Final extracted content length: ${finalContent.length}`);
  }

  if (!finalContent || finalContent.trim() === '') {
    res.status(400).json({ ok: false, error: "Missing content (empty message)" });
    return;
  }

  try {
    // Ensure modules are loaded for standalone writeTranscript function
    await loadVVAULTModules();
    // CRITICAL: Always use constructCallsign format (e.g., "synth-001"), never just "synth"
    const actualConstructId = constructId || metadata?.constructId || 'synth-001';
    const actualConstructCallsign = metadata?.constructCallsign || constructId || metadata?.constructId;

    // Use standalone writeTranscript function (not a method on connector)
    await writeTranscript({
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
    // FORCE MODE: Use capsule-based memory instead of ChromaDB
    if (process.env.ENABLE_CHROMADB !== 'true') {
      console.log('🔄 [VVAULT API] ChromaDB disabled - using capsule-based memory for', constructCallsign);

      try {
        // Import capsule integration to get transcript-based memories
        const { getCapsuleIntegration } = await import('../lib/capsuleIntegration.js');
        const capsuleIntegration = getCapsuleIntegration();

        // Normalize construct ID (remove 'gpt-' prefix if present)
        const normalizedConstructId = constructCallsign.startsWith('gpt-')
          ? constructCallsign.substring(4)
          : constructCallsign;

        console.log(`🔍 [VVAULT API] Normalized ${constructCallsign} → ${normalizedConstructId}`);

        // Load capsule for the construct
        const capsule = await capsuleIntegration.loadCapsule(normalizedConstructId);

        if (capsule && capsule.transcript_data) {
          console.log(`📊 [VVAULT API] Capsule loaded with ${capsule.transcript_data.topics?.length || 0} topics, ${capsule.transcript_data.entities?.length || 0} entities`);

          // Search through capsule transcript data for relevant memories
          const memories = [];
          const queryLower = query.toLowerCase();

          console.log(`🔍 [VVAULT API] Searching for: "${queryLower}"`);

          // Search through topics for relevant matches
          if (capsule.transcript_data.topics) {
            for (const topic of capsule.transcript_data.topics.slice(0, parseInt(limit))) {
              if (topic.topic && typeof topic.topic === 'string' &&
                (topic.topic.toLowerCase().includes(queryLower) ||
                  queryLower.includes(topic.topic.toLowerCase()))) {

                // Add examples from this topic as memories
                if (topic.examples && topic.examples.length > 0) {
                  for (const example of topic.examples.slice(0, 2)) {
                    memories.push({
                      context: example.user_snippet || `Discussion about ${topic.topic}`,
                      response: example.assistant_snippet || `Relevant to ${topic.topic} (${topic.frequency} mentions)`,
                      timestamp: new Date().toISOString(),
                      relevance: 0.8 // High relevance since it matched the topic
                    });
                  }
                }
              }
            }
          }

          // Search through entities for relevant matches
          if (capsule.transcript_data.entities && memories.length < parseInt(limit)) {
            for (const entity of capsule.transcript_data.entities) {
              if (entity.name && typeof entity.name === 'string' &&
                (entity.name.toLowerCase().includes(queryLower) ||
                  queryLower.includes(entity.name.toLowerCase()))) {

                // Add context from this entity as memories
                if (entity.context && entity.context.length > 0) {
                  for (const context of entity.context.slice(0, 1)) {
                    memories.push({
                      context: context.user_snippet || `About ${entity.name}`,
                      response: context.assistant_snippet || `${entity.name} mentioned ${entity.frequency} times`,
                      timestamp: new Date().toISOString(),
                      relevance: 0.7 // Good relevance for entity matches
                    });
                  }
                }
              }
            }
          }

          console.log(`✅ [VVAULT API] Found ${memories.length} capsule-based memories for "${query}"`);
          return res.json({
            ok: true,
            memories: memories.slice(0, parseInt(limit)),
            source: "capsule-transcript-data"
          });
        } else {
          console.log(`⚠️ [VVAULT API] Capsule structure: ${capsule ? 'exists' : 'null'}, transcript_data: ${capsule?.transcript_data ? 'exists' : 'missing'}`);

          // Final fallback: return empty but don't break the conversation
          console.log('🚫 [VVAULT API] No capsule memories found - returning empty result');
          return res.json({
            ok: true,
            memories: [],
            message: "No memories available (capsule-based fallback)"
          });
        }
      } catch (capsuleError) {
        console.warn('⚠️ [VVAULT API] Capsule memory fallback failed:', capsuleError.message);
      }

      // Final fallback: return empty but don't break the conversation
      console.log('🚫 [VVAULT API] No capsule memories found - returning empty result');
      return res.json({
        ok: true,
        memories: [],
        message: "No memories available (capsule-based fallback)"
      });
    }

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

    // Try both callsign variants (e.g., "example-construct-001" and "gpt-example-construct-001")
    const callsignVariants = normalizeConstructCallsigns(constructCallsign);
    let identities = [];

    for (const variant of callsignVariants) {
      try {
        const results = await identityService.queryIdentities(
          userId,
          variant,
          query,
          parseInt(limit, 10),
          options
        );

        if (results && results.length > 0) {
          identities = results;
          console.log(`✅ [VVAULT API] Found ${identities.length} memories using callsign: ${variant}`);
          break;
        }
      } catch (variantError) {
        console.warn(`⚠️ [VVAULT API] Failed to query with callsign ${variant}:`, variantError.message);
        continue;
      }
    }

    if (identities.length === 0) {
      console.log(`ℹ️ [VVAULT API] No memories found for any callsign variant: ${callsignVariants.join(', ')}`);
    }

    res.json({
      ok: true,
      memories: identities // Keep "memories" key for backward compatibility with frontend
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to query identity:", error);
    res.status(500).json({ ok: false, error: "Failed to query identity" });
  }
});

// ChromaDB service diagnostic endpoint (no construct required)
router.get("/chromadb/status", async (req, res) => {
  try {
    const { getChromaDBService } = await import('../services/chromadbService.js');
    const chromaService = getChromaDBService();
    const status = await chromaService.getStatus();

    res.json({
      ok: true,
      chromaDB: status
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to get ChromaDB status:", error);
    res.status(500).json({ ok: false, error: "Failed to get ChromaDB status", details: error.message });
  }
});

// Re-index existing transcripts from VVAULT filesystem to ChromaDB
router.post("/identity/reindex", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.body || {};

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    // Ensure ChromaDB is ready
    const { initializeChromaDB, getChromaDBService } = await import('../services/chromadbService.js');
    const { getIdentityService } = await import('../services/identityService.js');
    const { getHybridMemoryService } = require('../services/hybridMemoryService.js');

    await initializeChromaDB();
    const chromaService = getChromaDBService();
    const chromaReady = await chromaService.waitForReady(60000);
    if (!chromaReady) {
      return res.status(503).json({
        ok: false,
        error: "ChromaDB not ready",
        details: "ChromaDB failed to report heartbeat within 60s"
      });
    }

    const identityService = getIdentityService();
    await identityService.initialize();
    if (!identityService.client) {
      return res.status(503).json({
        ok: false,
        error: "IdentityService not connected",
        details: "ChromaDB client unavailable"
      });
    }

    // Get VVAULT user ID
    // resolveVVAULTUserId loaded via loadVVAULTModules()
    const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email);
    if (!vvaultUserId) {
      return res.status(400).json({ ok: false, error: "Failed to resolve VVAULT user ID" });
    }

    // Load VVAULT modules to get VVAULT_ROOT
    await loadVVAULTModules();

    // Try both callsign variants (example-construct-001 and gpt-example-construct-001)
    const callsignVariants = normalizeConstructCallsigns(constructCallsign);

    // Find all transcript files in VVAULT for this construct (try all variants)
    const fs = require('fs').promises;
    const path = require('path');
    const transcriptPaths = [];

    for (const variant of callsignVariants) {
      const instancePath = path.join(VVAULT_ROOT, 'users', 'shard_0000', vvaultUserId, 'instances', variant);
      const identityPath = path.join(instancePath, 'identity');
      const chatgptPath = path.join(instancePath, 'chatgpt');

      // Scan identity folder
      try {
        const identityFiles = await fs.readdir(identityPath);
        for (const file of identityFiles) {
          const filePath = path.join(identityPath, file);
          const stat = await fs.stat(filePath);
          if (stat.isFile() && (file.endsWith('.md') || file.endsWith('.txt') || file.endsWith('.json'))) {
            transcriptPaths.push({ path: filePath, variant });
          }
        }
      } catch (e) {
        // Folder doesn't exist for this variant - continue
      }

      // Scan chatgpt folder
      try {
        const chatgptFiles = await fs.readdir(chatgptPath);
        for (const file of chatgptFiles) {
          const filePath = path.join(chatgptPath, file);
          const stat = await fs.stat(filePath);
          if (stat.isFile() && (file.endsWith('.md') || file.endsWith('.txt'))) {
            transcriptPaths.push({ path: filePath, variant });
          }
        }
      } catch (e) {
        // Folder doesn't exist for this variant - continue
      }
    }

    console.log(`📦 [reindex] Found ${transcriptPaths.length} transcript files to re-index for ${constructCallsign}`);

    // Deduplicate transcript paths (same file might be in multiple variant folders)
    const uniquePaths = new Map();
    for (const item of transcriptPaths) {
      const key = path.basename(item.path);
      if (!uniquePaths.has(key)) {
        uniquePaths.set(key, item);
      }
    }

    // Re-index each unique transcript (index to all callsign variants)
    const hybridMemoryService = getHybridMemoryService();
    const results = [];
    let totalImported = 0;
    let totalAnchors = 0;

    for (const [filename, item] of uniquePaths) {
      // Index to all callsign variants so queries work regardless of format
      for (const variant of callsignVariants) {
        try {
          const indexResult = await hybridMemoryService.autoIndexTranscript(
            userId,
            variant,
            item.path
          );

          if (indexResult.success) {
            totalImported += indexResult.importedCount || 0;
            totalAnchors += indexResult.anchorsExtracted || 0;
            results.push({
              file: filename,
              variant,
              success: true,
              imported: indexResult.importedCount || 0,
              anchors: indexResult.anchorsExtracted || 0
            });
          } else {
            results.push({
              file: filename,
              variant,
              success: false,
              error: indexResult.error
            });
          }
        } catch (error) {
          results.push({
            file: filename,
            variant,
            success: false,
            error: error.message
          });
        }
      }
    }

    res.json({
      ok: true,
      constructCallsign,
      filesProcessed: transcriptPaths.length,
      totalImported,
      totalAnchors,
      results
    });
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to re-index transcripts:', error);
    res.status(500).json({
      ok: false,
      error: "Failed to re-index transcripts",
      details: error.message
    });
  }
});

router.post("/capsules/maintain", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { force = false, dryRun = false } = req.body;

  try {
    const { CapsuleMaintenanceService } = await import('../lib/capsuleMaintenance.js');

    // Lazy load config to get VVAULT_ROOT
    await loadVVAULTModules();

    const service = new CapsuleMaintenanceService(VVAULT_ROOT);
    const result = await service.runMaintenance({ force, dryRun });

    res.json({
      ok: true,
      result
    });
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to run capsule maintenance:', error);
    res.status(500).json({ ok: false, error: 'Capsule maintenance failed' });
  }
});

router.post("/capsules/generate", async (req, res) => {
  try {
    const { initializeChromaDB, getChromaDBService } = await import('../services/chromadbService.js');

    console.log('🔄 [chromadb/start] Manual start requested...');
    const started = await initializeChromaDB();

    if (!started) {
      const chromaService = getChromaDBService();
      const status = await chromaService.getStatus();
      return res.status(503).json({
        ok: false,
        error: "ChromaDB failed to start",
        details: status.lastError || "Startup failed",
        status
      });
    }

    const chromaService = getChromaDBService();
    const ready = await chromaService.waitForReady(60000);
    const status = await chromaService.getStatus();

    if (!ready) {
      return res.status(503).json({
        ok: false,
        error: "ChromaDB started but not ready",
        details: status.lastError || "Failed to report heartbeat within 60s",
        status
      });
    }

    // Ensure health monitor is running
    chromaService.startHealthMonitor();

    res.json({
      ok: true,
      message: "ChromaDB started and ready",
      status
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to start ChromaDB:", error);
    res.status(500).json({ ok: false, error: "Failed to start ChromaDB", details: error.message });
  }
});

// Manual ChromaDB start endpoint (for recovery)
router.post("/chromadb/start", async (req, res) => {
  try {
    const { initializeChromaDB, getChromaDBService } = await import('../services/chromadbService.js');

    console.log('🔄 [chromadb/start] Manual start requested...');
    const started = await initializeChromaDB();

    if (!started) {
      const chromaService = getChromaDBService();
      const status = await chromaService.getStatus();
      return res.status(503).json({
        ok: false,
        error: "ChromaDB failed to start",
        details: status.lastError || "Startup failed",
        status
      });
    }

    const chromaService = getChromaDBService();
    const ready = await chromaService.waitForReady(60000);
    const status = await chromaService.getStatus();

    if (!ready) {
      return res.status(503).json({
        ok: false,
        error: "ChromaDB started but not ready",
        details: status.lastError || "Failed to report heartbeat within 60s",
        status
      });
    }

    // Ensure health monitor is running
    chromaService.startHealthMonitor();

    res.json({
      ok: true,
      message: "ChromaDB started and ready",
      status
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to start ChromaDB:", error);
    res.status(500).json({ ok: false, error: "Failed to start ChromaDB", details: error.message });
  }
});

// Diagnostic endpoint for ChromaDB debugging
router.get("/identity/diagnostic", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query || {};

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { getChromaDBService } = await import('../services/chromadbService.js');
    const chromaService = getChromaDBService();
    const chromaStatus = await chromaService.getStatus();

    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();

    // Check ChromaDB initialization
    const isInitialized = identityService.initialized;
    const hasClient = !!identityService.client;

    // Try to get collection info
    let shortTermCount = 0;
    let longTermCount = 0;
    let shortTermCollection = null;
    let longTermCollection = null;
    let sampleMemories = [];

    if (isInitialized && hasClient) {
      try {
        // resolveVVAULTUserId loaded via loadVVAULTModules()
        const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email);

        if (vvaultUserId) {
          // Try to get collections
          try {
            shortTermCollection = await identityService.getCollection(vvaultUserId, constructCallsign, 'short-term');
            const shortTermData = await shortTermCollection.get();
            shortTermCount = shortTermData.ids?.length || 0;
            console.log(`📊 [Diagnostic] Short-term collection has ${shortTermCount} memories`);
          } catch (e) {
            // Collection doesn't exist yet
            console.log(`📊 [Diagnostic] Short-term collection doesn't exist yet`);
          }

          try {
            longTermCollection = await identityService.getCollection(vvaultUserId, constructCallsign, 'long-term');
            const longTermData = await longTermCollection.get();
            longTermCount = longTermData.ids?.length || 0;
            console.log(`📊 [Diagnostic] Long-term collection has ${longTermCount} memories`);
          } catch (e) {
            // Collection doesn't exist yet
            console.log(`📊 [Diagnostic] Long-term collection doesn't exist yet`);
          }

          // Get sample memories
          try {
            sampleMemories = await identityService.queryIdentities(
              userId,
              constructCallsign,
              'memory',
              5
            );
          } catch (e) {
            // Query failed
          }
        }
      } catch (error) {
        // Error getting collections
      }
    }

    // Test ChromaDB heartbeat
    let chromaDbAvailable = false;
    let chromaDbUrl = process.env.CHROMA_SERVER_URL || 'http://localhost:8000';
    if (hasClient) {
      try {
        await identityService.client.heartbeat();
        chromaDbAvailable = true;
      } catch (e) {
        chromaDbAvailable = false;
      }
    }

    res.json({
      ok: true,
      diagnostic: {
        chromaDb: {
          initialized: isInitialized,
          clientAvailable: hasClient,
          serverAvailable: chromaDbAvailable,
          serverUrl: chromaDbUrl,
          serviceStatus: chromaStatus
        },
        construct: {
          callsign: constructCallsign,
          shortTermMemories: shortTermCount,
          longTermMemories: longTermCount,
          totalMemories: shortTermCount + longTermCount
        },
        sampleMemories: sampleMemories.slice(0, 3).map(m => ({
          context: m.context?.substring(0, 100),
          response: m.response?.substring(0, 100),
          timestamp: m.timestamp,
          relevance: m.relevance
        }))
      }
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to get diagnostic info:", error);
    res.status(500).json({ ok: false, error: "Failed to get diagnostic info", details: error.message });
  }
});

router.post("/identity/ensure-ready", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const {
    constructCallsign = 'example-construct-001',
    minMemories = 10,
    forceSeed = false,
    includeVariants = true
  } = req.body || {};

  try {
    // FORCE MODE: Skip ChromaDB ensure-ready when disabled
    if (process.env.ENABLE_CHROMADB !== 'true') {
      console.log('🚫 [ensure-ready] ChromaDB disabled in FORCE MODE - returning ready status');
      return res.json({
        ok: true,
        ready: true,
        message: "FORCE MODE: ChromaDB bypassed, using capsule-based memory",
        constructCallsign,
        timestamp: new Date().toISOString()
      });
    }

    const { initializeChromaDB, getChromaDBService } = await import('../services/chromadbService.js');
    const { getIdentityService } = await import('../services/identityService.js');

    console.log('🔄 [ensure-ready] Initializing ChromaDB...');
    const initResult = await initializeChromaDB();
    if (!initResult) {
      const chromaService = getChromaDBService();
      const status = await chromaService.getStatus();
      return res.status(503).json({
        ok: false,
        error: "ChromaDB failed to start",
        details: status.lastError || "ChromaDB installation or startup failed",
        status: {
          processAlive: status.processAlive,
          starting: status.starting,
          chromaPath: status.chromaPath,
          lastLogLines: status.lastLogLines
        }
      });
    }

    const chromaService = getChromaDBService();
    console.log('⏳ [ensure-ready] Waiting for ChromaDB to be ready (up to 60s)...');
    const chromaReady = await chromaService.waitForReady(60000);
    if (!chromaReady) {
      const status = await chromaService.getStatus();
      return res.status(503).json({
        ok: false,
        error: "ChromaDB not ready",
        details: status.lastError || "ChromaDB failed to report heartbeat within 60s",
        status: {
          processAlive: status.processAlive,
          starting: status.starting,
          chromaPath: status.chromaPath,
          lastLogLines: status.lastLogLines
        }
      });
    }

    console.log('✅ [ensure-ready] ChromaDB confirmed ready');

    const identityService = getIdentityService();
    await identityService.initialize();
    if (!identityService.client) {
      return res.status(503).json({
        ok: false,
        error: "IdentityService not connected",
        details: "ChromaDB client unavailable after initialization"
      });
    }

    const fixtures = buildTestMemoryFixtures();
    const callsigns = includeVariants ? normalizeConstructCallsigns(constructCallsign) : [constructCallsign];
    const status = [];
    let totalSeeded = 0;

    for (const callsign of callsigns) {
      const sampleBefore = await identityService.queryIdentities(userId, callsign, 'memory', minMemories);
      let added = 0;
      let seeded = false;

      if (forceSeed || sampleBefore.length < minMemories) {
        added = await seedFixturesForCallsign(
          identityService,
          userId,
          callsign,
          fixtures,
          {
            email: req.user?.email,
            seedSource: 'auto-test-fixtures',
            sourceModel: 'memory-fixture'
          }
        );
        seeded = added > 0;
        totalSeeded += added;
      }

      const sampleAfter = await identityService.queryIdentities(userId, callsign, 'memory', minMemories);

      status.push({
        constructCallsign: callsign,
        sampleBefore: sampleBefore.length,
        sampleAfter: sampleAfter.length,
        seeded,
        added
      });
    }

    res.json({
      ok: true,
      chromaReady: true,
      identityReady: true,
      totalSeeded,
      status
    });
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to ensure memory readiness:', error);
    res.status(500).json({
      ok: false,
      error: "Failed to ensure memory infrastructure",
      details: error.message
    });
  }
});

// Store message pair in ChromaDB (for Lin conversations)
router.post("/identity/store", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, context, response, metadata = {} } = req.body || {};
  const providedTimestamp = req.body?.timestamp;

  if (!constructCallsign || !context || !response) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign, context, or response" });
  }

  try {
    // FORCE MODE: Skip ChromaDB-dependent identity storage
    if (process.env.ENABLE_CHROMADB !== 'true') {
      console.log('🚫 [VVAULT API] Identity store skipped in FORCE MODE - returning success without ChromaDB storage');
      return res.json({
        ok: true,
        skipped: true,
        message: "Identity storage disabled in FORCE MODE (ChromaDB not available)",
        timestamp: new Date().toISOString()
      });
    }

    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();

    // Resolve VVAULT user ID (with auto-create if needed)
    // resolveVVAULTUserId loaded via loadVVAULTModules()
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
        ...metadata,
        timestamp: metadata.timestamp || providedTimestamp
      }
    );

    res.json({
      ok: true,
      success: result.success,
      id: result.id,
      duplicate: result.duplicate || false,
      skipped: result.skipped || false,
      reason: result.reason || undefined
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

    // resolveVVAULTUserId loaded via loadVVAULTModules()
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

// Get and parse prompt.txt for a construct
router.get("/identity/prompt", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query || {};

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { loadIdentityFiles } = await import('../lib/identityLoader.js');
    const identity = await loadIdentityFiles(userId, constructCallsign, false);

    if (!identity || !identity.prompt) {
      return res.status(404).json({ 
        ok: false, 
        error: "prompt.txt not found",
        constructCallsign 
      });
    }

    // Parse prompt.txt using the parser utility
    const { parsePromptTxt } = await import('../lib/promptParser.js');
    const parsed = parsePromptTxt(identity.prompt);

    res.json({
      ok: true,
      prompt: identity.prompt,
      parsed: {
        name: parsed.name,
        description: parsed.description,
        instructions: parsed.instructions
      },
      constructCallsign
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to load prompt.txt:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to load prompt.txt",
      details: error.message
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
    // Ensure VVAULT modules (and VVAULT_ROOT) are loaded
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      console.log('❌ [VVAULT API] VVAULT_ROOT not configured - cannot load blueprint');
      return res.status(500).json({ ok: false, error: "VVAULT_ROOT not configured" });
    }

    // Import IdentityMatcher with error handling
    let IdentityMatcher;
    try {
      // Try .ts extension first (for TypeScript source), fallback to .js
      try {
        const module = await import('../../src/engine/character/IdentityMatcher.ts');
        IdentityMatcher = module.IdentityMatcher;
      } catch (tsError) {
        // Fallback to .js extension
        const module = await import('../../src/engine/character/IdentityMatcher.js');
        IdentityMatcher = module.IdentityMatcher;
      }

      if (!IdentityMatcher) {
        throw new Error('IdentityMatcher not exported from module');
      }
    } catch (importError) {
      // If import fails, blueprint system may not be available - return 404 (expected)
      console.log(`ℹ️ [VVAULT API] IdentityMatcher not available, blueprint not found for user: ${userId}, construct: ${constructId}-${callsign}`);
      return res.status(404).json({ ok: false, error: "Blueprint not found" });
    }

    // Instantiate IdentityMatcher with error handling
    let matcher;
    try {
      matcher = new IdentityMatcher(VVAULT_ROOT);
    } catch (constructorError) {
      // If constructor fails, blueprint system may not be available - return 404 (expected)
      console.log(`ℹ️ [VVAULT API] IdentityMatcher constructor failed, blueprint not found for user: ${userId}, construct: ${constructId}-${callsign}`);
      return res.status(404).json({ ok: false, error: "Blueprint not found" });
    }

    // loadPersonalityBlueprint returns null on error, doesn't throw
    // Try with parsed constructId/callsign first, then try with full callsign if that fails
    let blueprint;
    try {
      blueprint = await matcher.loadPersonalityBlueprint('' + userId, constructId, callsign);

      if (!blueprint) {
        console.log(`🔄 [VVAULT API] Blueprint not found using parsed identifiers for ${constructCallsign}. Trying additional variants...`);
        const normalized = constructCallsign.replace(/^gpt-/i, '');

        // Try using normalized callsign as constructId/callsign pair
        if (normalized.includes('-')) {
          const parts = normalized.split('-');
          const altConstruct = parts[0];
          const altCallsign = parts.slice(1).join('-') || '001';
          blueprint = await matcher.loadPersonalityBlueprint('' + userId, altConstruct, altCallsign);
        }

        // Try with constructId 'gpt' and the full constructCallsign (covers instances/gpt-example-construct-001)
        if (!blueprint) {
          blueprint = await matcher.loadPersonalityBlueprint('' + userId, 'gpt', constructCallsign);
        }

        // Try with normalized callsign under gpt prefix
        if (!blueprint && normalized !== constructCallsign) {
          blueprint = await matcher.loadPersonalityBlueprint('' + userId, 'gpt', normalized);
        }
      }
    } catch (loadError) {
      // This shouldn't happen (loadPersonalityBlueprint has try-catch), but handle it anyway
      console.log(`ℹ️ [VVAULT API] Error loading blueprint, returning 404 for user: ${userId}, construct: ${constructId}-${callsign}`);
      return res.status(404).json({ ok: false, error: "Blueprint not found" });
    }

    if (!blueprint) {
      console.log(`ℹ️ [VVAULT API] Blueprint not found for user: ${userId}, construct: ${constructId}-${callsign} (constructCallsign=${constructCallsign})`);
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
 * - "You said:" / "The GPT said:" format
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
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      throw new Error('VVAULT_ROOT not configured');
    }
    const matcher = new IdentityMatcher(VVAULT_ROOT);
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

  // Normalize construct name from filename (e.g., "Example Construct" from "example-construct-001")
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

    // Pattern 1: "You said:" / "The GPT said:" format
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
          // resolveVVAULTUserId loaded via loadVVAULTModules()
          const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email);
          if (!vvaultUserId) {
            throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
          }

          // path is now imported at the top
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

            console.log(`📦 [VVAULT API] Starting auto-index for transcript: ${filePath}`);
            console.log(`📦 [VVAULT API] Construct: ${constructCallsign}, User: ${userId}`);

            // Auto-index transcript to ChromaDB (zero downtime, background process)
            const indexResult = await hybridMemoryService.autoIndexTranscript(
              userId,
              constructCallsign,
              filePath
            );

            if (indexResult.success) {
              console.log(`✅ [VVAULT API] Auto-indexed ${indexResult.importedCount} memories to ChromaDB`);
              if (indexResult.anchorsExtracted && indexResult.anchorsExtracted > 0) {
                console.log(`🔍 [VVAULT API] Extracted ${indexResult.anchorsExtracted} memory anchors from transcript`);
              }
            } else {
              console.warn(`⚠️ [VVAULT API] Auto-indexing failed (non-critical):`, indexResult.error);
            }
          } catch (indexError) {
            console.warn(`⚠️ [VVAULT API] Auto-indexing error (non-critical, transcript still saved):`, indexError);
            console.warn(`⚠️ [VVAULT API] Error details:`, indexError.message);
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
    let hadDbError = false;
    try {
      user = await User.findOne({ id: userId }).select('vvaultPath vvaultUserId vvaultLinkedAt email');
      if (user) console.log(`✅ [VVAULT API] Found user by id field`);
    } catch (err) {
      hadDbError = true;
      console.log(`⚠️ [VVAULT API] Query by id failed:`, err.message);
    }

    // Fallback to email if id query fails
    if (!user && req.user?.email) {
      try {
        user = await User.findOne({ email: req.user.email }).select('vvaultPath vvaultUserId vvaultLinkedAt email');
        if (user) console.log(`✅ [VVAULT API] Found user by email`);
      } catch (err) {
        hadDbError = true;
        console.log(`⚠️ [VVAULT API] Query by email failed:`, err.message);
      }
    }

    // Fallback to _id if it's a MongoDB ObjectId
    if (!user && userId && typeof userId === 'string' && /^[0-9a-fA-F]{24}$/.test(userId)) {
      try {
        user = await User.findById(userId).select('vvaultPath vvaultUserId vvaultLinkedAt email');
        if (user) console.log(`✅ [VVAULT API] Found user by _id`);
      } catch (err) {
        hadDbError = true;
        console.log(`⚠️ [VVAULT API] Query by _id failed:`, err.message);
      }
    }

    if (!user) {
      // Production hardening: if the user registry DB is unavailable/misconfigured,
      // don't 404 the UI. Treat as "not linked" and allow the app to continue.
      if (hadDbError) {
        console.warn(`⚠️ [VVAULT API] User registry unavailable; returning linked=false for ${userId}`);
        return res.json({
          ok: true,
          linked: false,
          vvaultUserId: null,
          vvaultPath: null,
          linkedAt: null,
          chattyEmail: req.user?.email || null,
          warning: 'user_registry_unavailable',
        });
      }

      console.error(`❌ [VVAULT API] User not found for userId: ${userId}, email: ${req.user?.email}`);
      return res.json({
        ok: true,
        linked: false,
        vvaultUserId: null,
        vvaultPath: null,
        linkedAt: null,
        chattyEmail: req.user?.email || null,
      });
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

    // path is now imported at the top
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

    // resolveVVAULTUserId loaded via loadVVAULTModules()
    const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email, true, req.user?.name);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
    }

    // Use constructCallsign DIRECTLY for instance directory (e.g., "example-construct-001")
    // DO NOT parse into constructId-callsign and reconstruct (would create "example-construct-example-construct-001")
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
      instance_name: instanceName, // Same as constructCallsign (e.g., "example-construct-001")
      traits,
      memory_log: memoryLog,
      personality_type: personalityType,
      additional_data: {
        constructCallsign, // Use constructCallsign directly (e.g., "example-construct-001")
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

router.get("/capsules/load", (req, res, next) => {
  // Bypass auth for test endpoints in development
  if (req.headers['x-test-bypass'] === 'true' || req.query.testMode === 'true') {
    return next();
  }
  return requireAuth(req, res, next);
}, async (req, res) => {
  // Handle test mode user ID
  let userId;
  if (req.headers['x-test-bypass'] === 'true' || req.query.testMode === 'true') {
    userId = 'devon_woodson_1762969514958'; // Use actual VVAULT user ID for testing
    console.log(`🧪 [VVAULT API] Test mode: using hardcoded user ID: ${userId}`);
  } else {
    userId = validateUser(res, req.user);
    if (!userId) return;
  }

  const { constructCallsign } = req.query;

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      // VVAULT not configured - capsule not found (expected in some environments)
      console.log(`ℹ️ [VVAULT API] VVAULT not configured, capsule not found for user: ${userId}, construct: ${constructCallsign}`);
      return res.status(404).json({ ok: false, error: "Capsule not found" });
    }

    const { getCapsuleLoader } = require('../services/capsuleLoader.js');
    const capsuleLoader = getCapsuleLoader();

    const capsule = await capsuleLoader.loadCapsule(userId, constructCallsign, VVAULT_ROOT);

    if (!capsule) {
      console.log(`ℹ️ [VVAULT API] Capsule not found for user: ${userId}, construct: ${constructCallsign}`);
      return res.status(404).json({ ok: false, error: "Capsule not found" });
    }

    res.json({
      ok: true,
      capsule: capsule.data,
      path: capsule.path
    });
  } catch (error) {
    // Check if error indicates capsule doesn't exist (expected) vs server error
    const errorMessage = error.message || String(error);
    const isNotFoundError = errorMessage.includes('not found') ||
      errorMessage.includes('ENOENT') ||
      errorMessage.includes('does not exist');

    if (isNotFoundError) {
      console.log(`ℹ️ [VVAULT API] Capsule not found (expected) for user: ${userId}, construct: ${constructCallsign}`);
      return res.status(404).json({ ok: false, error: "Capsule not found" });
    }

    // Actual server error - log and return 500
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
      // resolveVVAULTUserId loaded via loadVVAULTModules()
      const vvaultUserId = await resolveVVAULTUserId(userId, req.user.email, false, req.user.name);
      if (vvaultUserId) {
        const fs = require('fs').promises;
        const path = require('path');
        const { VVAULT_ROOT } = require("../../vvaultConnector/config.js");
        // Try account/profile.json first (correct location), fallback to identity/profile.json
        const accountProfilePath = path.join(
          VVAULT_ROOT,
          'users',
          'shard_0000',
          vvaultUserId,
          'account',
          'profile.json'
        );
        const identityProfilePath = path.join(
          VVAULT_ROOT,
          'users',
          'shard_0000',
          vvaultUserId,
          'identity',
          'profile.json'
        );
        try {
          // Try account/profile.json first
          const profileContent = await fs.readFile(accountProfilePath, 'utf8');
          vvaultProfile = JSON.parse(profileContent);
        } catch {
          try {
            // Fallback to identity/profile.json
            const profileContent = await fs.readFile(identityProfilePath, 'utf8');
            vvaultProfile = JSON.parse(profileContent);
          } catch {
            // VVAULT profile doesn't exist yet - that's okay
          }
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
      vvault_linked: !!vvaultProfile,
      // Include personalization fields from VVAULT profile
      nickname: vvaultProfile?.personalization?.nickname || null,
      occupation: vvaultProfile?.personalization?.occupation || null,
      tags: vvaultProfile?.personalization?.tags || [],
      aboutYou: vvaultProfile?.personalization?.aboutYou || null
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

// Update user personalization in profile.json
router.post("/profile/personalization", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  try {
    const { nickname, occupation, tags, aboutYou } = req.body;

    // Validate input
    if (nickname === undefined && occupation === undefined && tags === undefined && aboutYou === undefined) {
      return res.status(400).json({ 
        ok: false, 
        error: "At least one personalization field must be provided" 
      });
    }

    // Resolve VVAULT user ID
    // resolveVVAULTUserId loaded via loadVVAULTModules()
    const vvaultUserId = await resolveVVAULTUserId(userId, req.user.email, false, req.user.name);
    
    if (!vvaultUserId) {
      return res.status(404).json({ 
        ok: false, 
        error: "VVAULT user ID not found" 
      });
    }

    const fs = require('fs').promises;
    const path = require('path');
    const { VVAULT_ROOT } = require("../../vvaultConnector/config.js");
    
    // Try account/profile.json first (correct location), fallback to identity/profile.json
    const accountProfilePath = path.join(
      VVAULT_ROOT,
      'users',
      'shard_0000',
      vvaultUserId,
      'account',
      'profile.json'
    );
    const identityProfilePath = path.join(
      VVAULT_ROOT,
      'users',
      'shard_0000',
      vvaultUserId,
      'identity',
      'profile.json'
    );

    let profilePath = accountProfilePath;
    let profile = null;

    // Try to read existing profile
    try {
      const profileContent = await fs.readFile(accountProfilePath, 'utf8');
      profile = JSON.parse(profileContent);
    } catch {
      try {
        const profileContent = await fs.readFile(identityProfilePath, 'utf8');
        profile = JSON.parse(profileContent);
        profilePath = identityProfilePath;
      } catch {
        // Profile doesn't exist, create new one
        profile = {
          user_id: vvaultUserId,
          user_name: req.user.name,
          email: req.user.email,
          created: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          constructs: [],
          storage_quota: "unlimited",
          features: []
        };
        // Ensure account directory exists
        const accountDir = path.dirname(accountProfilePath);
        await fs.mkdir(accountDir, { recursive: true });
        profilePath = accountProfilePath;
      }
    }

    // Update personalization fields
    if (!profile.personalization) {
      profile.personalization = {};
    }

    if (nickname !== undefined) profile.personalization.nickname = nickname || '';
    if (occupation !== undefined) profile.personalization.occupation = occupation || '';
    if (tags !== undefined) profile.personalization.tags = Array.isArray(tags) ? tags : [];
    if (aboutYou !== undefined) profile.personalization.aboutYou = aboutYou || '';

    // Update last_seen timestamp
    profile.last_seen = new Date().toISOString();

    // Write updated profile
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');

    console.log(`✅ [VVAULT API] Updated personalization for user ${vvaultUserId}`);

    res.json({
      ok: true,
      profile: {
        nickname: profile.personalization.nickname,
        occupation: profile.personalization.occupation,
        tags: profile.personalization.tags,
        aboutYou: profile.personalization.aboutYou
      }
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to update personalization:", error);
    res.status(500).json({ ok: false, error: "Failed to update personalization" });
  }
});

router.get("/chat/:sessionId", requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "sessionId is required" });
  }

  try {
    await loadVVAULTModules();
    
    const userEmail = req.user?.email || "unknown";
    const chattyUserId = getUserId(req.user);
    const lookupId = userEmail !== "unknown" ? userEmail : chattyUserId;
    
    console.log(`📚 [VVAULT API] Loading chat ${sessionId} for user: ${lookupId}`);
    
    // Try PostgreSQL database first (Replit mode)
    if (process.env.DATABASE_URL && readConversations) {
      const conversations = await readConversations(lookupId);
      
      // Extract constructId from normalized thread ID (e.g., "zen-001_chat_with_zen-001" -> "zen-001")
      const constructIdFromSession = sessionId.split('_chat_with_')[0] || sessionId.split('_')[0];
      
      const conversation = conversations.find(c => 
        c.sessionId === sessionId || 
        c.constructId === constructIdFromSession ||
        c.constructCallsign === constructIdFromSession ||
        sessionId.includes(c.sessionId) ||
        c.sessionId?.includes(sessionId.split('_')[0])
      );
      
      if (conversation) {
        const content = (conversation.messages || [])
          .map(m => `**${m.role === 'user' ? 'You' : 'Zen'}:** ${m.content}`)
          .join('\n\n');
        console.log(`✅ [VVAULT API] Loaded chat from PostgreSQL with ${conversation.messages?.length || 0} messages`);
        return res.json({ ok: true, content, messages: conversation.messages || [] });
      }
      console.log(`⚠️ [VVAULT API] Chat not found in PostgreSQL, session: ${sessionId}, constructId: ${constructIdFromSession}`);
      return res.json({ ok: true, content: "", messages: [] });
    }
    
    // Fallback to filesystem if VVAULT_ROOT is configured
    if (!VVAULT_ROOT) {
      console.log(`ℹ️ [VVAULT API] No VVAULT_ROOT - returning empty for new chat`);
      return res.json({ ok: true, content: "", messages: [] });
    }

    // resolveVVAULTUserId loaded via loadVVAULTModules()
    const vvaultUserId = await resolveVVAULTUserId(getUserId(req.user), req.user?.email);
    if (!vvaultUserId) {
      return res.status(400).json({ ok: false, error: "Failed to resolve VVAULT user ID" });
    }

    const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
    const [constructIdCandidate] = sanitizedSessionId.split("_chat_with_");
    const constructId = constructIdCandidate || sanitizedSessionId;
    // CRITICAL: Extract constructName (without version suffix) for folder path
    const constructName = constructId.replace(/-\d+$/, '');
    const fileName = `chat_with_${constructId}.md`;
    const fs = require("fs").promises;
    const transcriptPath = path.join(
      VVAULT_ROOT,
      "users",
      "shard_0000",
      vvaultUserId,
      "instances",
      constructName,  // Use name without version suffix for folder
      "chatty",
      fileName
    );

    const content = await fs.readFile(transcriptPath, "utf8");
    return res.json({ ok: true, content });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return res.json({ ok: true, content: "", messages: [] });
    }
    console.error(`❌ [VVAULT API] Failed to load transcript for ${sessionId}:`, error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to load transcript" });
  }
});

/**
 * POST /vvault/message - Proxy to VVAULT's /api/chatty/message for LLM inference
 * 
 * Chatty should call this endpoint to send messages, which proxies to VVAULT.
 * VVAULT handles: LLM inference (Ollama), transcript saving, memory management.
 * 
 * Request body:
 * - constructId: string (e.g., "zen-001")
 * - message: string (user's message)
 * - userId?: string (optional, uses authenticated user if not provided)
 * 
 * Response:
 * - success: boolean
 * - response: string (LLM response)
 * - construct_id: string
 */
router.post("/message", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructId, message, threadId, sessionId, attachments } = req.body || {};

  if (!constructId) {
    return res.status(400).json({ success: false, error: "Missing constructId" });
  }

  if (!message || message.trim() === '') {
    return res.status(400).json({ success: false, error: "Missing message content" });
  }
  
  // Handle image attachments for vision
  const hasImages = attachments && Array.isArray(attachments) && attachments.length > 0;
  if (hasImages) {
    console.log(`📎 [VVAULT Proxy] Processing ${attachments.length} image attachments`);
  }

  const VVAULT_API_BASE_URL = process.env.VVAULT_API_BASE_URL;
  
  if (!VVAULT_API_BASE_URL) {
    console.warn('⚠️ [VVAULT Proxy] VVAULT_API_BASE_URL not configured, using local LLM providers');
    
    // Fetch the GPT's configured model from database
    let gptConfig = null;
    try {
      gptConfig = await gptManager.getGPTByCallsign(constructId);
      if (gptConfig) {
        console.log(`📋 [VVAULT Proxy] Found GPT config for ${constructId}, model: ${gptConfig.conversationModel || gptConfig.modelId || 'none'}`);
      }
    } catch (gptError) {
      console.warn(`⚠️ [VVAULT Proxy] Could not fetch GPT config for ${constructId}:`, gptError.message);
    }
    
    // Resolve model using GPTCreator config as source of truth
    const providerAvailability = { openai: !!openaiClient, openrouter: !!openrouter, ollama: !!process.env.OLLAMA_HOST };
    let { provider: effectiveProvider, model: effectiveModel, source: modelSource, error: modelError } = resolveModelForGPT(gptConfig, providerAvailability);
    
    if (modelError) {
      return res.status(503).json({ success: false, error: modelError });
    }
    
    // Override for vision requests (images require OpenAI)
    if (hasImages) {
      if (openaiClient) {
        effectiveProvider = 'openai';
        effectiveModel = 'gpt-4o';
        console.log(`📎 [VVAULT Proxy] Images attached, forcing vision model: ${effectiveModel}`);
      } else {
        console.error('❌ [VVAULT Proxy] Images attached but OpenAI not configured - cannot process vision request');
        return res.status(503).json({ 
          success: false, 
          error: 'Image processing requires OpenAI, which is not currently configured. Please configure OpenAI or try without images.' 
        });
      }
    }
    
    // Load identity/system prompt
    const identity = await loadIdentityFiles(userId, constructId);
    const systemPrompt = identity?.prompt || gptConfig?.instructions || `You are ${constructId}, an AI assistant. Be helpful and conversational.`;
    
    console.log(`🧠 [VVAULT Proxy] System prompt length: ${systemPrompt.length}`);
    
    // Load conversation history for context (last 20 turns)
    let conversationHistoryMessages = [];
    try {
      await loadVVAULTModules();
      const lookupId = req.user?.email || userId;
      if (readConversations) {
        const allConversations = await readConversations(lookupId, constructId);
        const targetSession = `${constructId}_chat_with_${constructId}`;
        const conv = Array.isArray(allConversations) 
          ? allConversations.find(c => 
              c.sessionId === targetSession || 
              c.constructId === constructId ||
              c.constructCallsign === constructId
            )
          : null;
        if (conv && conv.messages && conv.messages.length > 0) {
          conversationHistoryMessages = conv.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-20)
            .map(m => ({ role: m.role, content: m.content || '' }));
          console.log(`📚 [VVAULT Proxy] Loaded ${conversationHistoryMessages.length} history messages for ${constructId}`);
        }
      }
    } catch (historyError) {
      console.warn(`⚠️ [VVAULT Proxy] Could not load conversation history:`, historyError.message);
    }
    
    // Route to appropriate provider
    try {
      let completion;
      let aiResponse;
      
      if (effectiveProvider === 'openai') {
        console.log(`🔷 [VVAULT Proxy] Calling OpenAI (${effectiveModel}) for ${constructId}`);
        
        let userMessageContent;
        if (hasImages) {
          userMessageContent = [
            { type: 'text', text: message },
            ...attachments.map(att => ({
              type: 'image_url',
              image_url: {
                url: `data:${att.type};base64,${att.data}`,
                detail: 'auto'
              }
            }))
          ];
          console.log(`📎 [VVAULT Proxy] Formatted ${attachments.length} images for OpenAI vision API`);
        } else {
          userMessageContent = message;
        }
        
        try {
          completion = await openaiClient.chat.completions.create({
            model: effectiveModel,
            messages: [
              { role: "system", content: systemPrompt },
              ...conversationHistoryMessages,
              { role: "user", content: userMessageContent }
            ],
            max_tokens: 2048,
          });
          aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
        } catch (openaiErr) {
          if (openaiErr?.code === 'unknown_model' && openrouter) {
            console.warn(`⚠️ [VVAULT Proxy] OpenAI rejected model "${effectiveModel}", falling back to OpenRouter`);
            effectiveProvider = 'openrouter';
            effectiveModel = DEFAULT_OPENROUTER_MODEL;
            completion = await openrouter.chat.completions.create({
              model: effectiveModel,
              messages: [
                { role: "system", content: systemPrompt },
                ...conversationHistoryMessages,
                { role: "user", content: typeof userMessageContent === 'string' ? userMessageContent : message }
              ],
              max_tokens: 2048,
            });
            aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
          } else {
            throw openaiErr;
          }
        }
      } else if (effectiveProvider === 'ollama') {
        // Ollama requires different handling - use fetch directly
        const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
        console.log(`🟢 [VVAULT Proxy] Calling Ollama (${effectiveModel}) for ${constructId}`);
        const ollamaResponse = await fetch(`${ollamaHost}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: effectiveModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: message }
            ],
            stream: false
          })
        });
        
        if (!ollamaResponse.ok) {
          throw new Error(`Ollama error: ${ollamaResponse.status}`);
        }
        
        const ollamaData = await ollamaResponse.json();
        aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
      } else {
        // OpenRouter
        console.log('[OPENROUTER] Calling', { model: effectiveModel, user: req.user?.email, historyMessages: conversationHistoryMessages.length });
        try {
          completion = await openrouter.chat.completions.create({
            model: effectiveModel,
            messages: [
              { role: "system", content: systemPrompt },
              ...conversationHistoryMessages,
              { role: "user", content: message }
            ],
            max_tokens: 2048,
          });
          console.log('[OPENROUTER] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
        } catch (err) {
          console.error('[OPENROUTER FAIL]', {
            status: err?.status,
            message: err?.message,
            model: effectiveModel,
            apiKeySet: !!OPENROUTER_API_KEY
          });
          throw err;
        }
        aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
      }
      
      console.log(`✅ [VVAULT Proxy] ${effectiveProvider} successful for ${constructId}, response length: ${aiResponse.length}`);
      
      return res.json({
        success: true,
        response: aiResponse,
        construct_id: constructId,
        fallback: true,
        source: `${effectiveProvider}-direct`,
        model: effectiveModel
      });
    } catch (llmError) {
      console.error(`❌ [VVAULT Proxy] ${effectiveProvider} call failed:`, {
        provider: effectiveProvider,
        model: effectiveModel,
        status: llmError?.status,
        message: llmError?.message,
        apiKeySet: !!OPENROUTER_API_KEY,
        constructId
      });
      return res.status(503).json({
        success: false,
        error: `${effectiveProvider} failed: ${llmError.message || 'Unknown error'}`,
        provider: effectiveProvider,
        model: effectiveModel,
        upstreamStatus: llmError?.status || null,
        details: llmError.message
      });
    }
  }

  try {
    // Derive session ID if not provided (format: {constructId}_chat_with_{constructId})
    const effectiveSessionId = sessionId || threadId || `${constructId}_chat_with_${constructId}`;
    
    // Fetch GPT config to include model info in VVAULT request
    let gptConfigForVVAULT = null;
    let configuredModelForVVAULT = null;
    try {
      gptConfigForVVAULT = await gptManager.getGPTByCallsign(constructId);
      if (gptConfigForVVAULT) {
        configuredModelForVVAULT = gptConfigForVVAULT.conversationModel || gptConfigForVVAULT.modelId;
        console.log(`📋 [VVAULT Proxy] GPT config for ${constructId}, model: ${configuredModelForVVAULT}`);
      }
    } catch (e) { /* ignore */ }
    
    console.log(`📤 [VVAULT Proxy] Forwarding message to VVAULT for construct: ${constructId}, session: ${effectiveSessionId}`);
    
    const baseUrl = VVAULT_API_BASE_URL.replace(/\/$/, '');
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout for LLM
    
    try {
      // VVAULT handles: LLM inference, transcript saving, memory management
      // Include model info so VVAULT can use the GPT's configured model
      const vvaultResponse = await fetch(`${baseUrl}/api/chatty/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          constructId,
          message,
          userId: req.user?.email || userId,
          sessionId: effectiveSessionId,
          userName: req.user?.name || 'Devon',
          model: configuredModelForVVAULT // Pass configured model to VVAULT
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!vvaultResponse.ok) {
        const errorText = await vvaultResponse.text();
        console.error(`❌ [VVAULT Proxy] VVAULT API returned ${vvaultResponse.status}: ${errorText}`);
        
        // FALLBACK: Use configured LLM provider when VVAULT is unavailable (401, 503, etc.)
        if (vvaultResponse.status === 401 || vvaultResponse.status === 503) {
          console.log(`🔄 [VVAULT Proxy] VVAULT unavailable, falling back to local LLM for ${constructId}`);
          
          try {
            // Fetch GPT config and resolve model using GPTCreator as source of truth
            let gptConfig = null;
            try {
              gptConfig = await gptManager.getGPTByCallsign(constructId);
            } catch (e) { /* ignore */ }
            
            const providerAvailability = { openai: !!openaiClient, openrouter: !!openrouter, ollama: !!process.env.OLLAMA_HOST };
            const { provider: effectiveProvider, model: effectiveModel, error: modelError } = resolveModelForGPT(gptConfig, providerAvailability);
            if (modelError) throw new Error(modelError);
            
            // Load construct identity
            const identity = await loadIdentityFiles(userId, constructId);
            const systemPrompt = identity?.prompt || gptConfig?.instructions || `You are ${constructId}, an AI assistant. Be helpful and conversational.`;
            
            // Load conversation history for context
            let fbHistoryMessages = [];
            try {
              await loadVVAULTModules();
              const lookupId = req.user?.email || userId;
              const fbConvos = readConversations ? await readConversations(lookupId, constructId) : null;
              if (fbConvos?.length > 0) {
                const fbMessages = fbConvos[0].messages || [];
                const fbRecent = fbMessages.slice(-20);
                fbHistoryMessages = fbRecent
                  .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && !m.isDateHeader)
                  .map(m => ({ role: m.role, content: m.content }));
                console.log(`📚 [VVAULT Proxy] Fallback loaded ${fbHistoryMessages.length} history messages for ${constructId}`);
              }
            } catch (histErr) {
              console.warn(`⚠️ [VVAULT Proxy] Could not load fallback history:`, histErr.message);
            }
            
            console.log(`🧠 [VVAULT Proxy] Fallback using ${effectiveProvider}:${effectiveModel} for ${constructId}`);
            
            const fbMsgs = [{ role: "system", content: systemPrompt }, ...fbHistoryMessages, { role: "user", content: message }];
            let completion;
            let aiResponse;
            if (effectiveProvider === 'openai') {
              completion = await openaiClient.chat.completions.create({
                model: effectiveModel,
                messages: fbMsgs,
                max_tokens: 2048,
              });
              aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
            } else if (effectiveProvider === 'ollama') {
              const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
              const ollamaResp = await fetch(`${ollamaHost}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: effectiveModel,
                  messages: fbMsgs,
                  stream: false
                })
              });
              if (!ollamaResp.ok) throw new Error(`Ollama error: ${ollamaResp.status}`);
              const ollamaData = await ollamaResp.json();
              aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
            } else {
              console.log('[OPENROUTER] Calling', { model: effectiveModel, user: req.user?.email, historyMessages: fbHistoryMessages.length });
              try {
                completion = await openrouter.chat.completions.create({
                  model: effectiveModel,
                  messages: fbMsgs,
                  max_tokens: 2048,
                });
                console.log('[OPENROUTER] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
              } catch (err) {
                console.error('[OPENROUTER FAIL]', {
                  status: err?.status,
                  message: err?.message,
                  model: effectiveModel,
                  apiKeySet: !!OPENROUTER_API_KEY
                });
                throw err;
              }
              aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
            }
            
            console.log(`✅ [VVAULT Proxy] ${effectiveProvider} fallback successful for ${constructId}`);
            
            return res.json({
              success: true,
              response: aiResponse,
              construct_id: constructId,
              fallback: true,
              source: effectiveProvider,
              model: effectiveModel
            });
          } catch (fallbackError) {
            console.error(`❌ [VVAULT Proxy] LLM fallback failed:`, fallbackError);
            return res.status(503).json({
              success: false,
              error: "Both VVAULT and LLM fallback failed",
              details: fallbackError.message
            });
          }
        }
        
        return res.status(vvaultResponse.status).json({
          success: false,
          error: `VVAULT API error: ${vvaultResponse.status}`,
          details: errorText
        });
      }

      const data = await vvaultResponse.json();
      
      console.log(`✅ [VVAULT Proxy] Got response from VVAULT for ${constructId}:`, {
        success: data.success,
        responseLength: data.response?.length || 0
      });

      return res.json(data);
    } catch (fetchError) {
      clearTimeout(timeout);
      
      if (fetchError.name === 'AbortError') {
        console.error(`❌ [VVAULT Proxy] Request timed out for ${constructId}`);
        return res.status(504).json({
          success: false,
          error: "VVAULT API request timed out"
        });
      }
      
      // FALLBACK: Use configured LLM provider when VVAULT is unreachable
      console.log(`🔄 [VVAULT Proxy] VVAULT unreachable, falling back to local LLM for ${constructId}`);
      
      try {
        // Fetch GPT config and resolve model using GPTCreator as source of truth
        let gptConfig = null;
        try {
          gptConfig = await gptManager.getGPTByCallsign(constructId);
        } catch (e) { /* ignore */ }
        
        const providerAvailability = { openai: !!openaiClient, openrouter: !!openrouter, ollama: !!process.env.OLLAMA_HOST };
        const { provider: effectiveProvider, model: effectiveModel, error: modelError } = resolveModelForGPT(gptConfig, providerAvailability);
        if (modelError) throw new Error(modelError);
        
        const identity = await loadIdentityFiles(userId, constructId);
        const systemPrompt = identity?.prompt || gptConfig?.instructions || `You are ${constructId}, an AI assistant. Be helpful and conversational.`;
        
        // Load conversation history for context
        let fb2HistoryMessages = [];
        try {
          await loadVVAULTModules();
          const lookupId = req.user?.email || userId;
          const fb2Convos = readConversations ? await readConversations(lookupId, constructId) : null;
          if (fb2Convos?.length > 0) {
            const fb2Messages = fb2Convos[0].messages || [];
            const fb2Recent = fb2Messages.slice(-20);
            fb2HistoryMessages = fb2Recent
              .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && !m.isDateHeader)
              .map(m => ({ role: m.role, content: m.content }));
            console.log(`📚 [VVAULT Proxy] Fallback2 loaded ${fb2HistoryMessages.length} history messages for ${constructId}`);
          }
        } catch (histErr) {
          console.warn(`⚠️ [VVAULT Proxy] Could not load fallback2 history:`, histErr.message);
        }
        
        console.log(`🧠 [VVAULT Proxy] Fallback using ${effectiveProvider}:${effectiveModel} for ${constructId}`);
        
        const fb2Msgs = [{ role: "system", content: systemPrompt }, ...fb2HistoryMessages, { role: "user", content: message }];
        let completion;
        let aiResponse;
        if (effectiveProvider === 'openai') {
          completion = await openaiClient.chat.completions.create({
            model: effectiveModel,
            messages: fb2Msgs,
            max_tokens: 2048,
          });
          aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
        } else if (effectiveProvider === 'ollama') {
          const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
          const ollamaResp = await fetch(`${ollamaHost}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: effectiveModel,
              messages: fb2Msgs,
              stream: false
            })
          });
          if (!ollamaResp.ok) throw new Error(`Ollama error: ${ollamaResp.status}`);
          const ollamaData = await ollamaResp.json();
          aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
        } else {
          console.log('[OPENROUTER] Calling', { model: effectiveModel, user: req.user?.email, historyMessages: fb2HistoryMessages.length });
          try {
            completion = await openrouter.chat.completions.create({
              model: effectiveModel,
              messages: fb2Msgs,
              max_tokens: 2048,
            });
            console.log('[OPENROUTER] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
          } catch (err) {
            console.error('[OPENROUTER FAIL]', {
              status: err?.status,
              message: err?.message,
              model: effectiveModel,
              apiKeySet: !!OPENROUTER_API_KEY
            });
            throw err;
          }
          aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
        }
        
        console.log(`✅ [VVAULT Proxy] ${effectiveProvider} fallback successful for ${constructId}`);
        
        return res.json({
          success: true,
          response: aiResponse,
          construct_id: constructId,
          fallback: true,
          source: effectiveProvider,
          model: effectiveModel
        });
      } catch (fallbackError) {
        console.error(`❌ [VVAULT Proxy] LLM fallback failed:`, fallbackError);
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error(`❌ [VVAULT Proxy] Failed to proxy message to VVAULT:`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to communicate with VVAULT",
      details: error.message
    });
  }
});

/**
 * POST /vvault/transcript/:constructId/append - Append message to transcript via VVAULT
 * 
 * More efficient than fetching/replacing whole transcript.
 * Calls VVAULT's /api/chatty/transcript/:id/message endpoint.
 */
router.post("/transcript/:constructId/append", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructId } = req.params;
  const { role, content, name, timestamp } = req.body || {};

  if (!role) {
    return res.status(400).json({ success: false, error: "Missing role" });
  }

  if (!content || content.trim() === '') {
    return res.status(400).json({ success: false, error: "Missing content" });
  }

  const VVAULT_API_BASE_URL = process.env.VVAULT_API_BASE_URL;
  
  if (!VVAULT_API_BASE_URL) {
    console.error('❌ [VVAULT Proxy] VVAULT_API_BASE_URL not configured');
    return res.status(503).json({ 
      success: false, 
      error: "VVAULT API not configured" 
    });
  }

  try {
    console.log(`📝 [VVAULT Proxy] Appending ${role} message to ${constructId}`);
    
    const baseUrl = VVAULT_API_BASE_URL.replace(/\/$/, '');
    
    const vvaultResponse = await fetch(`${baseUrl}/api/chatty/transcript/${constructId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        content,
        name,
        timestamp: timestamp || new Date().toISOString()
      })
    });

    if (!vvaultResponse.ok) {
      const errorText = await vvaultResponse.text();
      console.error(`❌ [VVAULT Proxy] Append failed: ${vvaultResponse.status}: ${errorText}`);
      return res.status(vvaultResponse.status).json({
        success: false,
        error: `VVAULT API error: ${vvaultResponse.status}`,
        details: errorText
      });
    }

    const data = await vvaultResponse.json();
    console.log(`✅ [VVAULT Proxy] Message appended to ${constructId}`);
    return res.json(data);
  } catch (error) {
    console.error(`❌ [VVAULT Proxy] Failed to append message:`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to append message via VVAULT"
    });
  }
});

export default router;
