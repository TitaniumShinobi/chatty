// AI Creator API Routes
import express from 'express';
import multer from 'multer';
import path from 'path';
import { AIManager } from '../lib/aiManager.js';
import { getGPTSaveHook } from '../lib/gptSaveHook.js';

const router = express.Router();

// Initialize AI Manager
const aiManager = AIManager.getInstance();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow text files, PDFs, images, videos, and common document formats
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/pdf',
      'application/json',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/svg+xml',
      'image/webp',
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-matroska',
      'video/webm',
      'video/x-flv',
      'video/x-ms-wmv',
      'video/mp2t',
      'video/3gpp',
      'video/ogg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

router.get('/', async (req, res) => {
  try {
    // Prefer stable identifiers; fall back to email, sub, uid
    const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || 'anonymous';
    console.log(`📋 [AIs API] GET /api/ais - User: ${chattyUserId}`);
    console.log(`🔍 [AIs API] req.user details:`, req.user ? { id: req.user.id, sub: req.user.sub, email: req.user.email } : 'none');
    
    // Resolve to VVAULT user ID format for database queries
    let userId = chattyUserId;
    try {
      const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email, true, req.user?.name); // Auto-create if needed
      if (vvaultUserId) {
        userId = vvaultUserId;
        console.log(`✅ [AIs API] Resolved user ID: ${chattyUserId} → ${vvaultUserId}`);
      } else {
        console.warn(`⚠️ [AIs API] Could not resolve VVAULT user ID for: ${chattyUserId}, using as-is`);
      }
    } catch (error) {
      console.warn(`⚠️ [AIs API] User ID resolution failed: ${error.message}, using original ID`);
      console.warn(`⚠️ [AIs API] Resolution error stack:`, error.stack);
    }
    
    console.log(`🔍 [AIs API] Querying with userId: ${userId}, originalUserId: ${chattyUserId}`);
    const ais = await aiManager.getAllAIs(userId, chattyUserId);
    console.log(`✅ [AIs API] Found ${ais?.length || 0} AIs`);
    if (ais && ais.length > 0) {
      console.log(`📊 [AIs API] AI names:`, ais.map(a => ({ id: a.id, name: a.name, constructCallsign: a.constructCallsign })));
    } else {
      console.log(`⚠️ [AIs API] No AIs found - checking if this is expected`);
    }
    
    // Ensure response is valid JSON
    if (!res.headersSent) {
      res.json({ success: true, ais: ais || [] });
    }
  } catch (error) {
    console.error('❌ [AIs API] Error fetching AIs:', error);
    console.error('❌ [AIs API] Error stack:', error.stack);
    
    // Ensure we always return valid JSON, even on error
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      console.error('❌ [AIs API] Response already sent, cannot send error response');
    }
  }
});

// Get all store/public AIs (for SimForge)
router.get('/store', async (req, res) => {
  try {
    const storeAIs = await aiManager.getStoreAIs();
    res.json({ success: true, ais: storeAIs });
  } catch (error) {
    console.error('Error fetching store AIs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a specific AI
router.get('/:id', async (req, res) => {
  try {
    const ai = await aiManager.getAI(req.params.id);
    if (!ai) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }
    res.json({ success: true, ai });
  } catch (error) {
    console.error('Error fetching AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new AI
router.post('/', async (req, res) => {
  try {
    const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || 'anonymous';
    
    // Resolve to VVAULT user ID format for database storage
    let userId = chattyUserId;
    try {
      const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email);
      if (vvaultUserId) {
        userId = vvaultUserId;
        console.log(`✅ [AIs API] Resolved user ID for creation: ${chattyUserId} → ${vvaultUserId}`);
      }
    } catch (error) {
      console.warn(`⚠️ [AIs API] User ID resolution failed during creation: ${error.message}`);
    }
    
    const aiData = {
      ...req.body,
      userId,
      isActive: false
    };

    const ai = await aiManager.createAI(aiData);
    
    // Trigger capsule generation for new GPT
    try {
      console.log(`🔗 [AIs API] Triggering capsule creation for new AI: ${ai.id}`);
      const saveHook = getGPTSaveHook();
      await saveHook.onGPTSave(ai.id, ai);
      console.log(`✅ [AIs API] Capsule creation completed for new AI: ${ai.id}`);
    } catch (capsuleError) {
      console.warn(`⚠️ [AIs API] Capsule creation failed for new AI ${ai.id}:`, capsuleError);
      // Don't fail the creation operation if capsule generation fails
    }
    
    res.json({ success: true, ai });
  } catch (error) {
    console.error('Error creating AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clone an AI
router.post('/:id/clone', async (req, res) => {
  try {
    const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || 'anonymous';
    
    // Resolve to VVAULT user ID format for database storage
    let userId = chattyUserId;
    try {
      const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email);
      if (vvaultUserId) {
        userId = vvaultUserId;
        console.log(`✅ [AIs API] Resolved user ID for clone: ${chattyUserId} → ${vvaultUserId}`);
      }
    } catch (error) {
      console.warn(`⚠️ [AIs API] User ID resolution failed during clone: ${error.message}`);
    }

    const clonedAI = await aiManager.cloneAI(req.params.id, userId);
    res.json({ success: true, ai: clonedAI });
  } catch (error) {
    console.error('Error cloning AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update an AI
router.put('/:id', async (req, res) => {
  try {
    const ai = await aiManager.updateAI(req.params.id, req.body);
    if (!ai) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }
    
    // Trigger capsule generation/update when GPT is saved
    try {
      console.log(`🔗 [AIs API] Triggering capsule update for AI: ${req.params.id}`);
      const saveHook = getGPTSaveHook();
      await saveHook.onGPTSave(req.params.id, ai);
      console.log(`✅ [AIs API] Capsule update completed for AI: ${req.params.id}`);
    } catch (capsuleError) {
      console.warn(`⚠️ [AIs API] Capsule update failed for AI ${req.params.id}:`, capsuleError);
      // Don't fail the save operation if capsule generation fails
    }
    
    res.json({ success: true, ai });
  } catch (error) {
    console.error('Error updating AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete an AI
router.delete('/:id', async (req, res) => {
  try {
    const success = await aiManager.deleteAI(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload file to AI
router.post('/:id/files', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const fileData = {
      name: req.file.originalname,
      content: req.file.buffer.toString('base64'),
      mimeType: req.file.mimetype,
      size: req.file.size
    };

    const file = await aiManager.uploadFile(req.params.id, fileData);
    res.json({ success: true, file });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get files for an AI
router.get('/:id/files', async (req, res) => {
  try {
    const files = await aiManager.getAIFiles(req.params.id);
    res.json({ success: true, files });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a file
router.delete('/files/:fileId', async (req, res) => {
  try {
    const success = await aiManager.deleteFile(req.params.fileId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update file's AI ID (for reassociating temp files)
router.put('/files/:fileId/ai', async (req, res) => {
  try {
    const { aiId } = req.body;
    const success = await aiManager.updateFileAIId(req.params.fileId, aiId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating file AI ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create an action for an AI
router.post('/:id/actions', async (req, res) => {
  try {
    const action = await aiManager.createAction(req.params.id, req.body);
    res.json({ success: true, action });
  } catch (error) {
    console.error('Error creating action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get actions for an AI
router.get('/:id/actions', async (req, res) => {
  try {
    const actions = await aiManager.getAIActions(req.params.id);
    res.json({ success: true, actions });
  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete an action
router.delete('/actions/:actionId', async (req, res) => {
  try {
    const success = await aiManager.deleteAction(req.params.actionId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute an action
router.post('/actions/:actionId/execute', async (req, res) => {
  try {
    const result = await aiManager.executeAction(req.params.actionId, req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error executing action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate avatar for AI
router.post('/:id/avatar', async (req, res) => {
  try {
    const { name, description } = req.body;
    const avatar = aiManager.generateAvatar(name, description);
    res.json({ success: true, avatar });
  } catch (error) {
    console.error('Error generating avatar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve avatar file from filesystem
router.get('/:id/avatar', async (req, res) => {
  try {
    const ai = await aiManager.getAI(req.params.id);
    if (!ai) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }

    // Get raw avatar path from database (before API URL conversion)
    let rawAvatarPath = null;
    try {
      const aisStmt = aiManager.db.prepare('SELECT avatar FROM ais WHERE id = ?');
      const aisRow = aisStmt.get(req.params.id);
      if (aisRow && aisRow.avatar) {
        rawAvatarPath = aisRow.avatar;
      } else {
        // Try gpts table
        const gptsStmt = aiManager.db.prepare('SELECT avatar FROM gpts WHERE id = ?');
        const gptsRow = gptsStmt.get(req.params.id);
        if (gptsRow && gptsRow.avatar) {
          rawAvatarPath = gptsRow.avatar;
        }
      }
    } catch (error) {
      console.warn(`⚠️ [AIs API] Failed to get avatar path from database: ${error.message}`);
    }

    // If avatar is a data URL (legacy), return it directly
    if (rawAvatarPath && rawAvatarPath.startsWith('data:image/')) {
      // Extract base64 data and serve as image
      const base64Match = rawAvatarPath.match(/^data:image\/([^;]+);base64,(.+)$/);
      if (base64Match) {
        const mimeType = base64Match[1];
        const base64Data = base64Match[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        res.setHeader('Content-Type', `image/${mimeType}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
        return res.send(buffer);
      }
    }

    // If avatar is a filesystem path, serve the file
    if (rawAvatarPath && rawAvatarPath.startsWith('instances/')) {
      try {
        // Import VVAULT_ROOT
        let VVAULT_ROOT;
        try {
          const config = await import('../../vvaultConnector/config.js');
          VVAULT_ROOT = config.VVAULT_ROOT || process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
        } catch {
          VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
        }

        const shard = 'shard_0000';
        const userId = ai.userId || 'anonymous';
        const fullPath = path.join(VVAULT_ROOT, 'users', shard, userId, rawAvatarPath);

        // Check if file exists
        const { promises: fs } = await import('fs');
        try {
          await fs.access(fullPath);
        } catch {
          return res.status(404).json({ success: false, error: 'Avatar file not found' });
        }

        // Read and serve file
        const fileBuffer = await fs.readFile(fullPath);
        const ext = path.extname(rawAvatarPath).toLowerCase().slice(1);
        const mimeTypes = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml'
        };
        const contentType = mimeTypes[ext] || 'image/png';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
        return res.send(fileBuffer);
      } catch (error) {
        console.error(`❌ [AIs API] Error serving avatar file:`, error);
        return res.status(500).json({ success: false, error: 'Failed to serve avatar file' });
      }
    }

    // No avatar found
    return res.status(404).json({ success: false, error: 'Avatar not found' });
  } catch (error) {
    console.error('Error serving avatar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to inspect avatar data
router.get('/:id/debug', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get raw database row from both tables
    let rawAisRow = null;
    let rawGptsRow = null;
    let tableUsed = 'none';
    
    try {
      const aisStmt = aiManager.db.prepare('SELECT * FROM ais WHERE id = ?');
      rawAisRow = aisStmt.get(id);
      if (rawAisRow) {
        tableUsed = 'ais';
      }
    } catch (error) {
      console.log(`Debug: ais table query failed: ${error.message}`);
    }
    
    try {
      const gptsStmt = aiManager.db.prepare('SELECT * FROM gpts WHERE id = ?');
      rawGptsRow = gptsStmt.get(id);
      if (rawGptsRow && !rawAisRow) {
        tableUsed = 'gpts';
      }
    } catch (error) {
      console.log(`Debug: gpts table query failed: ${error.message}`);
    }
    
    // Get processed AI object
    const processedAI = await aiManager.getAI(id);
    
    // Extract avatar information
    const debugInfo = {
      id,
      rawData: {
        ais: rawAisRow ? {
          avatar: rawAisRow.avatar,
          avatarType: rawAisRow.avatar === null ? 'null' : typeof rawAisRow.avatar,
          avatarLength: typeof rawAisRow.avatar === 'string' ? rawAisRow.avatar.length : 'N/A',
          avatarPreview: typeof rawAisRow.avatar === 'string' && rawAisRow.avatar.length > 0
            ? rawAisRow.avatar.substring(0, 100) + (rawAisRow.avatar.length > 100 ? '...' : '')
            : rawAisRow.avatar
        } : null,
        gpts: rawGptsRow ? {
          avatar: rawGptsRow.avatar,
          avatarType: rawGptsRow.avatar === null ? 'null' : typeof rawGptsRow.avatar,
          avatarLength: typeof rawGptsRow.avatar === 'string' ? rawGptsRow.avatar.length : 'N/A',
          avatarPreview: typeof rawGptsRow.avatar === 'string' && rawGptsRow.avatar.length > 0
            ? rawGptsRow.avatar.substring(0, 100) + (rawGptsRow.avatar.length > 100 ? '...' : '')
            : rawGptsRow.avatar
        } : null
      },
      processedData: processedAI ? {
        avatar: processedAI.avatar,
        avatarType: processedAI.avatar === null ? 'null' : typeof processedAI.avatar,
        avatarLength: typeof processedAI.avatar === 'string' ? processedAI.avatar.length : 'N/A',
        avatarPreview: typeof processedAI.avatar === 'string' && processedAI.avatar.length > 0
          ? processedAI.avatar.substring(0, 100) + (processedAI.avatar.length > 100 ? '...' : '')
          : processedAI.avatar,
        hasAvatar: !!processedAI.avatar
      } : null,
      tableUsed
    };
    
    res.json({ success: true, debug: debugInfo });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get AI context for runtime
router.get('/:id/context', async (req, res) => {
  try {
    const context = await aiManager.getAIContext(req.params.id);
    res.json({ success: true, context });
  } catch (error) {
    console.error('Error fetching context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update AI context
router.put('/:id/context', async (req, res) => {
  try {
    const { context } = req.body;
    await aiManager.updateAIContext(req.params.id, context);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Load AI for runtime
router.post('/:id/load', async (req, res) => {
  try {
    const runtime = await aiManager.loadAIForRuntime(req.params.id);
    if (!runtime) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }
    res.json({ success: true, runtime });
  } catch (error) {
    console.error('Error loading AI for runtime:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Migrate existing AIs to have constructCallsign
router.post('/migrate', async (req, res) => {
  try {
    console.log('🔄 [AIs API] Starting migration of existing AIs...');
    const result = await aiManager.migrateExistingAIs();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error migrating AIs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
