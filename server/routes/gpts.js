// GPT Creator API Routes
import express from 'express';
import multer from 'multer';
import { GPTManager } from '../lib/gptManager.js';

const router = express.Router();

// Initialize GPT Manager
const gptManager = GPTManager.getInstance();

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
    console.log(`📋 [GPTs API] GET /api/gpts - User: ${chattyUserId}`);
    
    // Resolve to VVAULT user ID format for database queries
    let userId = chattyUserId;
    try {
      const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email);
      if (vvaultUserId) {
        userId = vvaultUserId;
        console.log(`✅ [GPTs API] Resolved user ID: ${chattyUserId} → ${vvaultUserId}`);
      } else {
        console.warn(`⚠️ [GPTs API] Could not resolve VVAULT user ID for: ${chattyUserId}, using as-is`);
      }
    } catch (error) {
      console.warn(`⚠️ [GPTs API] User ID resolution failed: ${error.message}, using original ID`);
      console.warn(`⚠️ [GPTs API] Resolution error stack:`, error.stack);
    }
    
    const gpts = await gptManager.getAllGPTs(userId, chattyUserId);
    console.log(`✅ [GPTs API] Returning ${gpts?.length || 0} GPTs`);
    
    // Ensure response is valid JSON
    if (!res.headersSent) {
      res.json({ success: true, gpts: gpts || [] });
    }
  } catch (error) {
    console.error('❌ [GPTs API] Error fetching GPTs:', error);
    console.error('❌ [GPTs API] Error stack:', error.stack);
    
    // Ensure we always return valid JSON, even on error
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      console.error('❌ [GPTs API] Response already sent, cannot send error response');
    }
  }
});

// Get a specific GPT
router.get('/:id', async (req, res) => {
  try {
    const gpt = await gptManager.getGPT(req.params.id);
    if (!gpt) {
      return res.status(404).json({ success: false, error: 'GPT not found' });
    }
    res.json({ success: true, gpt });
  } catch (error) {
    console.error('Error fetching GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new GPT
router.post('/', async (req, res) => {
  try {
    const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || 'anonymous';
    const userEmail = req.user?.email;
    
    // Resolve to VVAULT user ID format for database storage
    let userId = chattyUserId;
    try {
      const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(chattyUserId, userEmail);
      if (vvaultUserId) {
        userId = vvaultUserId;
        console.log(`✅ [GPTs API] Resolved user ID for creation: ${chattyUserId} → ${vvaultUserId}`);
      }
    } catch (error) {
      console.warn(`⚠️ [GPTs API] User ID resolution failed during creation: ${error.message}`);
    }
    
    const gptData = {
      ...req.body,
      userId,
      isActive: false
    };

    const gpt = await gptManager.createGPT(gptData);
    
    // Bootstrap conversation scaffold in Supabase so GPT appears in Address Book immediately
    if (gpt.constructCallsign) {
      try {
        const { writeConversationToSupabase } = await import('../../vvaultConnector/supabaseStore.js');
        const constructId = gpt.constructCallsign;
        const sessionId = `${constructId}_chat_with_${constructId}`;
        
        console.log(`📝 [GPTs API] Bootstrapping conversation for new GPT: ${constructId}`);
        
        await writeConversationToSupabase({
          userId,
          userEmail,
          sessionId,
          title: gpt.name,
          constructId,
          constructName: gpt.name,
          constructCallsign: constructId,
          role: 'assistant',
          content: 'CONVERSATION_CREATED:New conversation',
          timestamp: new Date().toISOString(),
          metadata: {
            source: 'chatty',
            createdBy: userEmail || userId,
            isPrimary: false
          }
        });
        
        console.log(`✅ [GPTs API] Conversation scaffold created for: ${constructId}`);
      } catch (bootstrapError) {
        console.warn(`⚠️ [GPTs API] Failed to bootstrap conversation: ${bootstrapError.message}`);
        // Don't fail the GPT creation if conversation bootstrap fails
      }
    }
    
    res.json({ success: true, gpt });
  } catch (error) {
    console.error('Error creating GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a GPT
router.put('/:id', async (req, res) => {
  try {
    const gpt = await gptManager.updateGPT(req.params.id, req.body);
    if (!gpt) {
      return res.status(404).json({ success: false, error: 'GPT not found' });
    }
    res.json({ success: true, gpt });
  } catch (error) {
    console.error('Error updating GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a GPT
router.delete('/:id', async (req, res) => {
  try {
    const success = await gptManager.deleteGPT(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'GPT not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload file to GPT
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

    const file = await gptManager.uploadFile(req.params.id, fileData);
    res.json({ success: true, file });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get files for a GPT
router.get('/:id/files', async (req, res) => {
  try {
    const files = await gptManager.getGPTFiles(req.params.id);
    res.json({ success: true, files });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a file
router.delete('/files/:fileId', async (req, res) => {
  try {
    const success = await gptManager.deleteFile(req.params.fileId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update file's GPT ID (for reassociating temp files)
router.put('/files/:fileId/gpt', async (req, res) => {
  try {
    const { gptId } = req.body;
    const success = await gptManager.updateFileGPTId(req.params.fileId, gptId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating file GPT ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create an action for a GPT
router.post('/:id/actions', async (req, res) => {
  try {
    const action = await gptManager.createAction(req.params.id, req.body);
    res.json({ success: true, action });
  } catch (error) {
    console.error('Error creating action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get actions for a GPT
router.get('/:id/actions', async (req, res) => {
  try {
    const actions = await gptManager.getGPTActions(req.params.id);
    res.json({ success: true, actions });
  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete an action
router.delete('/actions/:actionId', async (req, res) => {
  try {
    const success = await gptManager.deleteAction(req.params.actionId);
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
    const result = await gptManager.executeAction(req.params.actionId, req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error executing action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate avatar for GPT
router.post('/:id/avatar', async (req, res) => {
  try {
    const { name, description } = req.body;
    const avatar = gptManager.generateAvatar(name, description);
    res.json({ success: true, avatar });
  } catch (error) {
    console.error('Error generating avatar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get GPT context for runtime
router.get('/:id/context', async (req, res) => {
  try {
    const context = await gptManager.getGPTContext(req.params.id);
    res.json({ success: true, context });
  } catch (error) {
    console.error('Error fetching context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update GPT context
router.put('/:id/context', async (req, res) => {
  try {
    const { context } = req.body;
    await gptManager.updateGPTContext(req.params.id, context);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Load GPT for runtime
router.post('/:id/load', async (req, res) => {
  try {
    const runtime = await gptManager.loadGPTForRuntime(req.params.id);
    if (!runtime) {
      return res.status(404).json({ success: false, error: 'GPT not found' });
    }
    res.json({ success: true, runtime });
  } catch (error) {
    console.error('Error loading GPT for runtime:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Migrate existing GPTs to have constructCallsign
router.post('/migrate', async (req, res) => {
  try {
    console.log('🔄 [GPTs API] Starting migration of existing GPTs...');
    const result = await gptManager.migrateExistingGPTs();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error migrating GPTs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
