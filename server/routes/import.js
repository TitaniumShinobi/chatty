import express from "express";
import multer from "multer";
import {
  extractExportMetadata,
  createImportedRuntime,
  persistImportToVVAULT,
} from "../services/importService.js";
import VVAULTMemoryManager from "../lib/vvaultMemoryManager.js";
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

const vvaultMemoryManager = new VVAULTMemoryManager({});

const MAX_IMPORT_FILE_MB = parseInt(process.env.IMPORT_MAX_MB || "250", 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isZip =
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.originalname.toLowerCase().endsWith(".zip");

    if (!isZip) {
      return cb(new Error("Only ZIP exports are supported"));
    }

    cb(null, true);
  },
});

router.post("/chat-export", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No file uploaded" });
    }

    const result = await extractExportMetadata(req.file.buffer);
    
    // Check for duplicate (allow override via query param)
    const allowDuplicate = req.query.allowDuplicate === 'true' || req.body.allowDuplicate === true;

    // Use req.user.sub consistently for both database and VVAULT
    const userId = req.user.sub;
    console.log(`📥 [Import] Processing import for user: ${req.user.email} (ID: ${userId})`);
    
    const runtimeResult = await createImportedRuntime({
      userId: userId,
      source: result.source,
      identity: result.identity,
      metadata: result.metadata,
      allowDuplicate,
    });
    
    // Handle duplicate detection
    if (runtimeResult.isDuplicate) {
      return res.status(409).json({
        ok: false,
        error: runtimeResult.error,
        isDuplicate: true,
        existingRuntime: runtimeResult.existingRuntime,
        source: result.source,
        identity: result.identity,
        metadata: result.metadata,
        archiveSummary: result.archiveSummary,
      });
    }

    // Store imported conversations in VVAULT (per VVAULT_FILE_STRUCTURE_SPEC.md)
    // Imports go to: users/{shard}/{user_id}/constructs/{construct}-{callsign}/chatty/
    try {
      console.log(`💾 [Import] Persisting imported conversations to VVAULT for user: ${userId}`);
      
      // Resolve VVAULT user ID from Chatty user ID (MongoDB ObjectId) or email
      // This ensures we use the correct LIFE format user ID
      const { resolveVVAULTUserId } = require('../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(userId, req.user?.email);
      
      if (!vvaultUserId) {
        throw new Error(`Cannot resolve VVAULT user ID for ${userId}. User must exist in VVAULT with profile.json.`);
      }
      
      console.log(`✅ [Import] Resolved VVAULT user ID: ${vvaultUserId}`);
      
      // Persist to VVAULT using the resolved user ID
      // runtimeResult.runtime.metadata should already have constructId from createImportedRuntime
      // But ensure it's passed correctly
      const runtimeMetadata = runtimeResult.runtime?.metadata || {};
      if (!runtimeMetadata.constructId) {
        console.warn('⚠️ [Import] Runtime metadata missing constructId, using fallback');
        // Fallback: build constructId (should match createImportedRuntime logic)
        const crypto = require('crypto');
        const sanitizeConstructId = (value = '') =>
          value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'imported-runtime';
        const buildConstructBase = (source, identity, fallbackId) => {
          const provider = sanitizeConstructId(source);
          const emailHandle = identity?.email ? sanitizeConstructId(identity.email.split('@')[0]) : '';
          const fallback = fallbackId ? sanitizeConstructId(fallbackId) : '';
          const suffix = emailHandle || fallback || 'runtime';
          return sanitizeConstructId(`${provider}-${suffix}`);
        };
        runtimeMetadata.constructId = sanitizeConstructId(
          buildConstructBase(result.source, result.identity, runtimeResult.runtime?.id)
        );
          }
      runtimeMetadata.runtimeId = runtimeResult.runtime?.id;
      
      console.log(`📦 [Import] Using runtimeMetadata:`, { constructId: runtimeMetadata.constructId, runtimeId: runtimeMetadata.runtimeId });
      
      await persistImportToVVAULT(
        req.file.buffer,
        vvaultUserId, // Use resolved VVAULT user ID (LIFE format)
        result.source,
        runtimeMetadata,
        result.identity
      );
      
      console.log(`✅ [Import] VVAULT persistence completed`);
    } catch (e) {
      console.error(`❌ [Import] VVAULT persistence failed for user ${userId}:`, e);
      // Don't fail the import if storage fails - runtime config is already created
      console.warn("VVAULT persistence failed (continuing):", e);
    }

    return res.json({
      ok: true,
      source: result.source,
      metadata: result.metadata,
      identity: result.identity,
      filesScanned: result.filesScanned,
      archiveSummary: result.archiveSummary,
      runtime: runtimeResult.runtime,
      preset: runtimeResult.preset,
    });
  } catch (error) {
    console.error("Import route error:", error);
    let message =
      error instanceof Error
        ? error.message
        : "Failed to process the uploaded export";
    let details;

    if (message?.includes("End of data reached")) {
      details =
        "The export ZIP looks truncated or corrupted. Please re-download the archive from ChatGPT and try importing again.";
      message = "Unable to read ZIP archive.";
    }

    res.status(400).json({
      ok: false,
      error: message,
      ...(details ? { details } : {}),
    });
  }
});

router.get("/chat-export/:runtimeId/messages", async (req, res) => {
  const { runtimeId } = req.params;

  if (!runtimeId) {
    return res.status(400).json({
      ok: false,
      error: "runtimeId is required",
    });
  }

  try {
    const messages = await vvaultMemoryManager.getAllMessages(runtimeId);
    return res.json({
      ok: true,
      runtimeId,
      messages,
      count: Array.isArray(messages) ? messages.length : 0,
    });
  } catch (error) {
    console.error(
      `Import route error: failed to load VVAULT messages for runtime ${runtimeId}:`,
      error
    );
    return res.status(500).json({
      ok: false,
      error: "Failed to load VVAULT messages for runtime",
    });
  }
});

/**
 * GET /api/import/runtime/:runtimeId/conversations
 * Get all imported conversations for a specific runtime
 * Returns format matching frontend ImportedRaw type
 */
router.get("/runtime/:runtimeId/conversations", async (req, res) => {
  try {
    const userId = req.user?.sub;
    const { runtimeId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Authentication required' 
      });
    }
    
    if (!runtimeId) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Runtime ID is required' 
      });
    }
    
    console.log(`📥 [Import API] Fetching imported conversations for runtime ${runtimeId}, user ${userId}`);
    
    const { readImportedConversations } = await import('../services/importStorageService.js');
    const conversations = await readImportedConversations(userId, runtimeId);
    
    // Return format matching frontend ImportedRaw type
    // Frontend expects: { id, title, content, timestamp, source, filename }
    const formattedConversations = conversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      content: conv.content, // Preview content
      timestamp: conv.timestamp,
      source: conv.source,
      filename: conv.filename
    }));
    
    res.json(formattedConversations);
  } catch (error) {
    console.error(`❌ [Import API] Failed to fetch imported conversations:`, error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch imported conversations'
    });
  }
});

// Unified error handler for import routes to avoid HTML responses
router.use((err, _req, res, _next) => {
  console.error('❌ [Import API] Unhandled route error:', err);
  const status =
    err?.status ||
    (err?.name === 'MulterError' ? 400 : 500);
  const message =
    err?.message ||
    'Failed to process the uploaded export';
  const details =
    err?.code === 'LIMIT_FILE_SIZE'
      ? `The uploaded ZIP exceeds the ${MAX_IMPORT_FILE_MB}MB limit.`
      : undefined;

  res.status(status).json({
    ok: false,
    error: message,
    ...(details ? { details } : {})
  });
});

export default router;
