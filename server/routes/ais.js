// AI Creator API Routes
import express from 'express';
import multer from 'multer';
import path from 'path';
import { AIManager } from '../lib/aiManager.js';
import { getGPTSaveHook } from '../lib/gptSaveHook.js';
import { normalizeModelString } from '../lib/modelResolver.js';

const router = express.Router();

// Initialize AI Manager
const aiManager = AIManager.getInstance();

function normalizeModelFields(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const next = { ...payload };
  for (const key of ['modelId', 'conversationModel', 'creativeModel', 'codingModel']) {
    if (typeof next[key] !== 'string') continue;
    const before = next[key];
    const after = normalizeModelString(before);
    if (after && after !== before) {
      console.log(`🤖 [AIs API] Normalized ${key}: "${before}" -> "${after}"`);
      next[key] = after;
    }
  }
  return next;
}

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
router.get('/store', async (req, res) => {try {
    const storeAIs = await aiManager.getStoreAIs();res.json({ success: true, ais: storeAIs });
  } catch (error) {console.error('Error fetching store AIs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync GPTs from VVAULT file system to database
router.post('/sync-from-vvault', async (req, res) => {
  try {
    const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || 'anonymous';
    console.log(`🔄 [AIs API] Sync request from user: ${chattyUserId}`);
    
    // Resolve to VVAULT user ID format
    let userId = chattyUserId;
    try {
      const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email, true, req.user?.name);
      if (vvaultUserId) {
        userId = vvaultUserId;
        console.log(`✅ [AIs API] Resolved user ID for sync: ${chattyUserId} → ${vvaultUserId}`);
      } else {
        console.warn(`⚠️ [AIs API] Could not resolve VVAULT user ID for: ${chattyUserId}, using as-is`);
      }
    } catch (error) {
      console.warn(`⚠️ [AIs API] User ID resolution failed during sync: ${error.message}`);
    }
    
    // Import and run sync function
    const { syncGPTsToDatabase } = await import('../scripts/syncGPTsFromVVAULT.js');
    const result = await syncGPTsToDatabase(userId);
    
    console.log(`✅ [AIs API] Sync completed: ${result.synced.length} synced, ${result.skipped.length} skipped, ${result.errors.length} errors`);
    
    res.json({
      success: true,
      result: {
        synced: result.synced.length,
        skipped: result.skipped.length,
        errors: result.errors.length,
        total: result.total,
        details: {
          synced: result.synced,
          skipped: result.skipped,
          errors: result.errors
        }
      }
    });
  } catch (error) {
    console.error('❌ [AIs API] Error syncing from VVAULT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a specific AI
router.get('/:id', async (req, res) => {
  try {
    let ai = await aiManager.getAI(req.params.id);
    if (!ai) {
      const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || 'anonymous';
      let userId = chattyUserId;
      try {
        const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
        const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email, false);
        if (vvaultUserId) userId = vvaultUserId;
      } catch (e) {}
      ai = await aiManager.getAIByCallsign(req.params.id, userId);
    }
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

    const ai = await aiManager.createAI(normalizeModelFields(aiData));
    
    // Ensure all required files are created in VVAULT
    try {
      const { FileManagementAutomation } = await import('../lib/fileManagementAutomation.js');
      const constructCallsign = ai.constructCallsign || ai.id.replace(/^(ai-|gpt-)/, '');
      if (constructCallsign) {
        const fileManager = new FileManagementAutomation(userId);
        // Ensure files exist (creates if missing)
        await fileManager.ensureGPTCreationFiles(constructCallsign, ai);
        // Update prompt.txt with current form data (name, description, instructions)
        await fileManager.updateGPTPrompt(constructCallsign, ai);
        console.log(`✅ [AIs API] Created and updated all required files for ${ai.id} (${constructCallsign})`);
      } else {
        console.warn(`⚠️ [AIs API] No constructCallsign for ${ai.id}, skipping file creation`);
      }
    } catch (fileError) {
      console.warn(`⚠️ [AIs API] File creation failed for ${ai.id}:`, fileError);
      // Don't fail the creation operation if file creation fails
    }
    
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
    const ai = await aiManager.updateAI(req.params.id, normalizeModelFields(req.body));
    if (!ai) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }
    
    // Ensure all required files are still present in VVAULT (in case constructCallsign changed)
    try {
      const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || 'anonymous';
      let userId = chattyUserId;
      try {
        const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
        const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email);
        if (vvaultUserId) {
          userId = vvaultUserId;
        }
      } catch (error) {
        console.warn(`⚠️ [AIs API] User ID resolution failed during update: ${error.message}`);
      }
      
      const { FileManagementAutomation } = await import('../lib/fileManagementAutomation.js');
      const constructCallsign = ai.constructCallsign || req.params.id.replace(/^(ai-|gpt-)/, '');
      if (constructCallsign) {
        const fileManager = new FileManagementAutomation(userId);
        // Ensure files exist (creates if missing)
        await fileManager.ensureGPTCreationFiles(constructCallsign, ai);
        // Update prompt.txt with current form data (name, description, instructions)
        await fileManager.updateGPTPrompt(constructCallsign, ai);
        console.log(`✅ [AIs API] Ensured and updated files for ${req.params.id} (${constructCallsign})`);
      }
    } catch (fileError) {
      console.warn(`⚠️ [AIs API] File creation failed during update for ${req.params.id}:`, fileError);
      // Don't fail the update operation if file creation fails
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
    // Get AI info before deleting (to get constructCallsign and userId)
    const ai = await aiManager.getAI(req.params.id);
    if (!ai) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }

    const constructCallsign = ai.constructCallsign;
    const userId = ai.userId;

    // Check VSI protection before deletion (VSIs are independent entities in intelligences/)
    if (constructCallsign) {
      const { checkDeletionProtection } = await import('../lib/vsiProtection.js');
      const protection = await checkDeletionProtection(constructCallsign, userId);
      
      if (protection.blocked) {
        console.warn(`🚫 [AIs API] Deletion blocked for ${constructCallsign}: VSI protection active`);
        return res.status(403).json({ 
          success: false, 
          error: '⚠️ Deletion blocked: This GPT is protected under VSI safeguards and cannot be removed without sovereign override.',
          vsi_protected: true
        });
      }
    }

    // Delete from database first
    const success = await aiManager.deleteAI(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }

    // Delete all files from VVAULT if constructCallsign exists
    if (constructCallsign && userId) {
      try {
        const { FileManagementAutomation } = await import('../lib/fileManagementAutomation.js');
        const fileManager = new FileManagementAutomation(userId);
        
        // Permanently delete (not archive) - user explicitly requested permanent deletion
        console.log(`🗑️ [AIs API] Permanently deleting GPT files for ${constructCallsign} from VVAULT`);
        await fileManager.deleteGPT(constructCallsign, false); // false = permanent delete, not archive
        console.log(`✅ [AIs API] Successfully deleted all files for ${constructCallsign} from VVAULT`);
      } catch (fileError) {
        console.error(`⚠️ [AIs API] Failed to delete files from VVAULT for ${constructCallsign}:`, fileError);
        // Don't fail the delete operation if file deletion fails - database entry is already deleted
        // Log the error but continue
      }
    } else {
      console.warn(`⚠️ [AIs API] Cannot delete VVAULT files: missing constructCallsign (${constructCallsign}) or userId (${userId})`);
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

// Get files for an AI (local DB + Supabase identity files fallback)
router.get('/:id/files', async (req, res) => {
  try {
    const localFiles = await aiManager.getAIFiles(req.params.id);
    const ai = await aiManager.getAI(req.params.id);
    let vvaultFiles = [];

    if (ai && ai.constructCallsign) {
      const VVAULT_API_BASE_URL = process.env.VVAULT_API_BASE_URL;
      if (VVAULT_API_BASE_URL) {
        try {
          const baseUrl = VVAULT_API_BASE_URL.replace(/\/$/, '');
          const headers = { 'Content-Type': 'application/json' };
          const serviceToken = process.env.VVAULT_SERVICE_TOKEN;
          if (serviceToken) headers['X-Chatty-Key'] = serviceToken;
          const userEmail = req.user?.email;
          if (userEmail) headers['X-Chatty-User'] = userEmail;

          const response = await fetch(
            `${baseUrl}/api/chatty/construct/${ai.constructCallsign}/files`,
            { method: 'GET', headers, signal: AbortSignal.timeout(8000) }
          );

          if (response.ok) {
            const data = await response.json();
            const folderMap = { assets: 'knowledge', documents: 'knowledge', identity: 'identity' };

            for (const [folder, category] of Object.entries(folderMap)) {
              const files = data.files?.[folder] || data[folder] || [];
              for (const f of files) {
                const isImage = /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(f.filename || '');
                vvaultFiles.push({
                  id: f.id || `vvault-${folder}-${f.filename}`,
                  aiId: req.params.id,
                  filename: f.filename,
                  originalName: f.filename,
                  mimeType: isImage ? `image/${(f.filename.split('.').pop() || 'png').toLowerCase()}` : (f.mime_type || 'text/plain'),
                  size: f.size || 0,
                  content: '',
                  uploadedAt: f.created_at || f.updated_at || new Date().toISOString(),
                  isActive: true,
                  category,
                  source: 'vvault',
                  storagePath: f.storage_path || f.path || ''
                });
              }
            }
            console.log(`✅ [AIs API] Loaded ${vvaultFiles.length} files from VVAULT for ${ai.constructCallsign}`);
          }
        } catch (vvaultErr) {
          console.warn(`⚠️ [AIs API] VVAULT files lookup failed for ${ai.constructCallsign}:`, vvaultErr.message);
        }
      }

      if (vvaultFiles.length === 0) {
        try {
          const { getSupabaseClient } = await import('../lib/supabaseClient.js');
          const supabase = getSupabaseClient();
          if (supabase) {
            const constructVariants = [
              ai.constructCallsign,
              ai.constructCallsign.replace(/-\d+$/, '')
            ];

            for (const cid of constructVariants) {
              const { data, error } = await supabase
                .from('vault_files')
                .select('id, filename, file_type, storage_path, created_at, metadata')
                .eq('construct_id', cid)
                .not('file_type', 'eq', 'transcript')
                .not('file_type', 'eq', 'conversation');

              if (!error && data && data.length > 0) {
                const mapped = data.map(f => {
                  const meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata || '{}') : (f.metadata || {});
                  const origPath = meta.original_path || f.storage_path || f.filename || '';
                  const baseName = (f.filename || '').split('/').pop() || '';
                  const isIdentityFile = origPath.includes('/identity/') ||
                    /^(avatar|prompt|conditioning|personality|memory)\.(png|jpg|jpeg|txt|json)$/i.test(baseName) ||
                    /^(continuity|CONTINUITY_GPT_PROMPT)/i.test(baseName);
                  const isKnowledgeFile = origPath.includes('/assets/') ||
                    origPath.includes('/documents/') ||
                    /\.(pdf)$/i.test(baseName) ||
                    (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(baseName) && !isIdentityFile);
                  let category = 'other';
                  if (isIdentityFile) category = 'identity';
                  else if (isKnowledgeFile) category = 'knowledge';
                  else if (origPath.includes('/tests/') || /^test_/i.test(baseName)) category = 'test';
                  else if (origPath.includes('/chatgpt/') || /-K1\.md$/i.test(baseName)) category = 'chatgpt';

                  const isImage = /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(f.filename || '');
                  const mimeType = isImage
                    ? `image/${(f.filename.split('.').pop() || 'png').toLowerCase()}`
                    : (f.file_type === 'binary' ? 'application/octet-stream' : 'text/plain');
                  const displayName = f.filename.split('/').pop() || f.filename;

                  return {
                    id: f.id,
                    aiId: req.params.id,
                    filename: displayName,
                    originalName: displayName,
                    mimeType,
                    size: meta.size || 0,
                    content: '',
                    uploadedAt: f.created_at,
                    isActive: true,
                    category,
                    source: 'supabase',
                    storagePath: f.storage_path || f.filename
                  };
                });
                vvaultFiles.push(...mapped);
              }
            }
          }
        } catch (sbErr) {
          console.warn(`⚠️ [AIs API] Supabase files fallback failed for ${ai.constructCallsign}:`, sbErr.message);
        }
      }
    }

    const allFiles = [...localFiles, ...vvaultFiles];
    res.json({ success: true, files: allFiles });
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

    // If construct has a callsign, try Supabase for a real avatar FIRST
    // This takes priority over auto-generated SVG placeholders
    if (ai.constructCallsign) {
      try {
        const { getSupabaseClient } = await import('../lib/supabaseClient.js');
        const supabase = getSupabaseClient();
        if (supabase) {
          const constructVariants = [
            ai.constructCallsign,
            ai.constructCallsign.replace(/-\d+$/, '')
          ];

          let supabaseAvatarData = null;
          for (const cid of constructVariants) {
            const { data, error } = await supabase
              .from('vault_files')
              .select('content, file_type, storage_path')
              .eq('construct_id', cid)
              .ilike('filename', '%avatar%')
              .limit(1)
              .single();

            if (!error && data) {
              supabaseAvatarData = data;
              console.log(`✅ [AIs API] Found real avatar in Supabase for construct: ${cid}`);
              break;
            }
          }

          if (supabaseAvatarData) {
            let buffer;

            if (!supabaseAvatarData.content && supabaseAvatarData.storage_path) {
              const { data: storageData, error: storageError } = await supabase.storage
                .from('vault-files')
                .download(supabaseAvatarData.storage_path);

              if (!storageError && storageData) {
                const arrayBuffer = await storageData.arrayBuffer();
                buffer = Buffer.from(arrayBuffer);
                console.log(`✅ [AIs API] Downloaded real avatar from Supabase Storage: ${buffer.length} bytes`);
              }
            } else if (supabaseAvatarData.content) {
              if (supabaseAvatarData.content.startsWith('data:image/')) {
                const base64Match = supabaseAvatarData.content.match(/^data:image\/[^;]+;base64,(.+)$/);
                if (base64Match) buffer = Buffer.from(base64Match[1], 'base64');
              } else {
                buffer = Buffer.from(supabaseAvatarData.content, 'base64');
              }
            }

            if (buffer && buffer.length > 0) {
              const ext = supabaseAvatarData.storage_path ? path.extname(supabaseAvatarData.storage_path).toLowerCase().slice(1) : 'png';
              const mimeTypes = { 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml' };
              res.setHeader('Content-Type', mimeTypes[ext] || 'image/png');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              return res.send(buffer);
            }
          }
        }
      } catch (supabaseErr) {
        console.warn(`⚠️ [AIs API] Supabase avatar lookup failed for ${ai.constructCallsign}:`, supabaseErr.message);
      }
    }

    // Fallback: If avatar is a data URL (legacy/placeholder), return it directly
    if (rawAvatarPath && rawAvatarPath.startsWith('data:image/')) {
      const base64Match = rawAvatarPath.match(/^data:image\/([^;]+);base64,(.+)$/);
      if (base64Match) {
        const mimeType = base64Match[1];
        const base64Data = base64Match[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        res.setHeader('Content-Type', `image/${mimeType}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.send(buffer);
      }
    }

    // If avatar is a filesystem path, serve the file
    if (rawAvatarPath && rawAvatarPath.startsWith('instances/')) {
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

      // Try local filesystem first
      try {
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

        const { promises: fs } = await import('fs');
        await fs.access(fullPath);
        const fileBuffer = await fs.readFile(fullPath);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.send(fileBuffer);
      } catch (localError) {
        console.log(`📡 [AIs API] Local avatar not found, trying Supabase for: ${rawAvatarPath}`);
      }

      // Fallback to Supabase
      try {
        const { getSupabaseClient } = await import('../lib/supabaseClient.js');
        const { resolveSupabaseUserId } = await import('../../vvaultConnector/supabaseStore.js');
        
        const supabase = getSupabaseClient();
        if (!supabase) {
          console.warn('⚠️ [AIs API] No Supabase client available for avatar fallback');
          return res.status(404).json({ success: false, error: 'Avatar file not found' });
        }

        const userId = ai.userId || 'anonymous';
        const supabaseUserId = await resolveSupabaseUserId(userId);
        
        if (!supabaseUserId) {
          console.warn(`⚠️ [AIs API] Could not resolve Supabase user for avatar: ${userId}`);
          return res.status(404).json({ success: false, error: 'Avatar file not found' });
        }

        // Query vault_files for the avatar (try multiple strategies)
        const possiblePaths = [
          rawAvatarPath,
          rawAvatarPath.replace('/identity/', '/assets/'),
          rawAvatarPath.replace('/assets/', '/identity/')
        ];

        let avatarData = null;
        
        // Strategy 1: Try by full filepath
        for (const filePath of possiblePaths) {
          const { data, error } = await supabase
            .from('vault_files')
            .select('content, file_type, storage_path')
            .eq('user_id', supabaseUserId)
            .eq('filename', filePath)
            .single();

          if (!error && data) {
            avatarData = data;
            console.log(`✅ [AIs API] Found avatar in Supabase by path: ${filePath}`);
            break;
          }
        }
        
        // Strategy 2: Try by construct_id (avatar might be stored simply as 'avatar.png' with construct_id)
        if (!avatarData && ai.constructCallsign) {
          // Try with full callsign (e.g., 'katana-001') and base name (e.g., 'katana')
          const constructVariants = [
            ai.constructCallsign,
            ai.constructCallsign.replace(/-\d+$/, '') // Remove trailing number suffix
          ];
          
          for (const constructId of constructVariants) {
            const { data, error } = await supabase
              .from('vault_files')
              .select('content, file_type, storage_path')
              .eq('construct_id', constructId)
              .ilike('filename', '%avatar%')
              .limit(1)
              .single();

            if (!error && data) {
              avatarData = data;
              console.log(`✅ [AIs API] Found avatar in Supabase by construct_id: ${constructId}`);
              break;
            }
          }
        }

        if (!avatarData) {
          console.warn(`⚠️ [AIs API] Avatar not found in Supabase for paths: ${possiblePaths.join(', ')}`);
          return res.status(404).json({ success: false, error: 'Avatar file not found' });
        }

        let buffer;
        
        // If content is null but storage_path exists, fetch from Supabase Storage
        if (!avatarData.content && avatarData.storage_path) {
          console.log(`📥 [AIs API] Fetching avatar from Supabase Storage: ${avatarData.storage_path}`);
          const { data: storageData, error: storageError } = await supabase.storage
            .from('vault-files')
            .download(avatarData.storage_path);
          
          if (storageError) {
            console.error(`❌ [AIs API] Supabase Storage download failed:`, storageError);
            return res.status(500).json({ success: false, error: 'Failed to download avatar from storage' });
          }
          
          // Convert Blob to Buffer
          const arrayBuffer = await storageData.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          console.log(`✅ [AIs API] Downloaded avatar from Supabase Storage: ${buffer.length} bytes`);
        }
        // Content is in the database
        else if (avatarData.content) {
          if (avatarData.content.startsWith('data:image/')) {
            // Data URL format
            const base64Match = avatarData.content.match(/^data:image\/[^;]+;base64,(.+)$/);
            if (base64Match) {
              buffer = Buffer.from(base64Match[1], 'base64');
            }
          } else {
            // Assume base64 encoded binary
            buffer = Buffer.from(avatarData.content, 'base64');
          }
        }

        if (!buffer) {
          return res.status(500).json({ success: false, error: 'Failed to decode avatar' });
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.send(buffer);
      } catch (supabaseError) {
        console.error(`❌ [AIs API] Supabase avatar fetch failed:`, supabaseError);
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
