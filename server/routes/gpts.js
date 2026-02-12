// GPT Creator API Routes
import express from 'express';
import multer from 'multer';
import { GPTManager } from '../lib/gptManager.js';

const router = express.Router();

const gptManager = GPTManager.getInstance();

async function resolveUserId(req) {
  const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || null;
  if (!chattyUserId) return { userId: null, chattyUserId: null };
  let userId = chattyUserId;
  try {
    const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
    const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email);
    if (vvaultUserId) userId = vvaultUserId;
  } catch {}
  return { userId, chattyUserId };
}

async function verifyFileOwnership(req, fileId) {
  const gptId = gptManager.getFileGPTId(fileId);
  if (!gptId) return { allowed: false, gptId: null };
  return verifyGPTOwnership(req, gptId);
}

async function verifyActionOwnership(req, actionId) {
  const gptId = gptManager.getActionGPTId(actionId);
  if (!gptId) return { allowed: false, gptId: null };
  return verifyGPTOwnership(req, gptId);
}

async function verifyGPTOwnership(req, gptId) {
  const { userId, chattyUserId } = await resolveUserId(req);
  if (!userId) return { allowed: false, gpt: null, userId: null };
  const gpt = gptManager.getGPTConfig ? gptManager.getGPTConfig(gptId) : await gptManager.getGPT(gptId);
  if (!gpt) return { allowed: false, gpt: null, userId };
  const ownerMatch = gpt.userId === userId || gpt.userId === chattyUserId;
  if (!ownerMatch) {
    console.warn(`🔒 [GPTs API] Ownership denied: user ${userId} tried to access GPT ${gptId} owned by ${gpt.userId}`);
  }
  return { allowed: ownerMatch, gpt, userId };
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
    const { userId, chattyUserId } = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    console.log(`📋 [GPTs API] GET /api/gpts - User: ${userId}`);
    
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

router.get('/:id', async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    res.json({ success: true, gpt });
  } catch (error) {
    console.error('Error fetching GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { userId, chattyUserId } = await resolveUserId(req);
    const userEmail = req.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    console.log(`➕ [GPTs API] Creating GPT for user: ${userId}`);
    
    const gptData = {
      ...req.body,
      userId,
      isActive: false
    };

    const gpt = await gptManager.createGPT(gptData);
    
    // Scaffold instance folder structure in VVAULT (API first, Supabase fallback)
    if (gpt.constructCallsign) {
      try {
        const { scaffoldConstruct } = await import('../lib/constructScaffolder.js');
        const { getSupabaseClient } = await import('../lib/supabaseClient.js');
        const constructId = gpt.constructCallsign;
        const supabase = getSupabaseClient();
        
        let scaffoldUserId = userId;
        if (supabase && userEmail) {
          const { data: byEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', userEmail)
            .limit(1)
            .maybeSingle();
          if (byEmail?.id) {
            scaffoldUserId = byEmail.id;
          } else {
            const { data: byName } = await supabase
              .from('users')
              .select('id')
              .eq('name', userEmail)
              .limit(1)
              .maybeSingle();
            if (byName?.id) {
              scaffoldUserId = byName.id;
            }
          }
          if (scaffoldUserId !== userId) {
            console.log(`✅ [GPTs API] Resolved Supabase user: ${userEmail} → ${scaffoldUserId}`);
          } else {
            console.warn(`⚠️ [GPTs API] Could not resolve Supabase UUID for ${userEmail}, scaffold may fail`);
          }
        }
        
        console.log(`📦 [GPTs API] Scaffolding instance for new GPT: ${constructId}`);
        
        const result = await scaffoldConstruct(constructId, gpt, {
          userId: scaffoldUserId,
          userEmail,
          supabase,
        });
        
        console.log(`✅ [GPTs API] Scaffolded instance for ${constructId} via ${result.source || 'unknown'}`);
        if (result.failed > 0) {
          console.error(`❌ [GPTs API] Scaffold had ${result.failed} failures for ${constructId}`);
        }
      } catch (scaffoldError) {
        console.error(`❌ [GPTs API] Instance scaffold failed for ${gpt.constructCallsign}: ${scaffoldError.message}`);
      }
    } else {
      console.warn(`⚠️ [GPTs API] No constructCallsign for ${gpt.id}, skipping scaffold`);
    }
    
    res.json({ success: true, gpt });
  } catch (error) {
    console.error('Error creating GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { allowed, gpt: existing } = await verifyGPTOwnership(req, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const gpt = await gptManager.updateGPT(req.params.id, req.body);
    res.json({ success: true, gpt });
  } catch (error) {
    console.error('Error updating GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const success = await gptManager.deleteGPT(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/files', upload.single('file'), async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
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

router.get('/:id/files', async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const localFiles = await gptManager.getGPTFiles(req.params.id);
    let supabaseFiles = [];

    const constructCallsign = gpt?.constructCallsign;

    if (constructCallsign) {
      try {
        const { getSupabaseClient } = await import('../lib/supabaseClient.js');
        const supabase = getSupabaseClient();
        if (supabase) {
          const constructVariants = [
            constructCallsign,
            constructCallsign.replace(/-\d+$/, '')
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
                const storagePath = f.storage_path || '';
                const pathParts = storagePath.split('/');
                const constructIdx = pathParts.findIndex(p => /^[a-z]+-\d{3}$/.test(p));
                const subdir = constructIdx >= 0 && pathParts[constructIdx + 1] ? pathParts[constructIdx + 1] : '';

                const transcriptPlatforms = ['chatty', 'chatgpt', 'gemini', 'claude', 'openrouter', 'ollama'];
                let category = 'other';
                if (subdir === 'identity') category = 'identity';
                else if (subdir === 'assets' || subdir === 'documents') category = 'knowledge';
                else if (transcriptPlatforms.includes(subdir)) category = 'transcript';
                else if (subdir === 'tests') category = 'test';
                else if (subdir === 'lin') category = 'orchestration';

                const isImage = /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(f.filename || '');
                const mimeType = isImage
                  ? `image/${(f.filename.split('.').pop() || 'png').toLowerCase()}`
                  : (f.file_type === 'binary' ? 'application/octet-stream' : 'text/plain');
                const displayName = f.filename.split('/').pop() || f.filename;

                return {
                  id: f.id,
                  gptId: req.params.id,
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
              supabaseFiles.push(...mapped);
            }
          }
          if (supabaseFiles.length > 0) {
            console.log(`✅ [GPTs API] Loaded ${supabaseFiles.length} files from Supabase for ${constructCallsign}`);
          }
        }
      } catch (sbErr) {
        console.warn(`⚠️ [GPTs API] Supabase files fallback failed for ${constructCallsign}:`, sbErr.message);
      }
    }

    const allFiles = [...localFiles, ...supabaseFiles];
    res.json({ success: true, files: allFiles });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a file
router.delete('/files/:fileId', async (req, res) => {
  try {
    const { allowed } = await verifyFileOwnership(req, req.params.fileId);
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
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

router.put('/files/:fileId/gpt', async (req, res) => {
  try {
    const { allowed } = await verifyFileOwnership(req, req.params.fileId);
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const { gptId } = req.body;
    const { allowed: targetAllowed } = await verifyGPTOwnership(req, gptId);
    if (!targetAllowed) return res.status(403).json({ success: false, error: 'Access denied to target GPT' });
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

router.post('/:id/actions', async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const action = await gptManager.createAction(req.params.id, req.body);
    res.json({ success: true, action });
  } catch (error) {
    console.error('Error creating action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/actions', async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const actions = await gptManager.getGPTActions(req.params.id);
    res.json({ success: true, actions });
  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/actions/:actionId', async (req, res) => {
  try {
    const { allowed } = await verifyActionOwnership(req, req.params.actionId);
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
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

router.post('/actions/:actionId/execute', async (req, res) => {
  try {
    const { allowed } = await verifyActionOwnership(req, req.params.actionId);
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const result = await gptManager.executeAction(req.params.actionId, req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error executing action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/avatar', async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const { name, description } = req.body;
    const avatar = gptManager.generateAvatar(name, description);
    res.json({ success: true, avatar });
  } catch (error) {
    console.error('Error generating avatar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/context', async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const context = await gptManager.getGPTContext(req.params.id);
    res.json({ success: true, context });
  } catch (error) {
    console.error('Error fetching context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/context', async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const { context } = req.body;
    await gptManager.updateGPTContext(req.params.id, context);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/load', async (req, res) => {
  try {
    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!gpt) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    const runtime = await gptManager.loadGPTForRuntime(req.params.id);
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
