// AI Creator API Routes
import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import JSZip from 'jszip';
import { AIManager } from '../lib/aiManager.js';
import { getGPTSaveHook } from '../lib/gptSaveHook.js';
import { normalizeModelString } from '../lib/modelResolver.js';

const router = express.Router();

const aiManager = AIManager.getInstance();

function mapToVsiFolder(filename) {
  const lower = filename.toLowerCase();
  const baseName = lower.split('/').pop() || lower;
  if (baseName.endsWith('.capsule') || baseName.endsWith('.capsuleso')) return 'memup/';
  if (baseName.startsWith('chat_with_') && baseName.endsWith('.md')) return 'chatty/';
  if (baseName === 'prompt.json' || baseName === 'prompt.txt') return 'identity/';
  if (baseName === 'personality.json' || baseName === 'conditioning.txt') return 'identity/';
  if (baseName === 'avatar.png' || baseName === 'avatar.jpg' || baseName === 'avatar.jpeg') return 'identity/';
  if (baseName === 'metadata.json' || baseName === 'tone_profile.json' || baseName === 'voice.md') return 'config/';
  if (baseName.endsWith('.log')) return 'logs/';
  if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(baseName)) return 'assets/';
  return 'documents/';
}

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

async function verifyAIOwnership(req, aiId) {
  const { userId, chattyUserId } = await resolveUserId(req);
  if (!userId) return { allowed: false, ai: null, userId: null };
  const ai = await aiManager.getAI(aiId);
  if (!ai) return { allowed: false, ai: null, userId };
  const ownerMatch = ai.userId === userId || ai.userId === chattyUserId;
  return { allowed: ownerMatch, ai, userId, chattyUserId };
}

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
    const { userId, chattyUserId } = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    console.log(`📋 [AIs API] GET /api/ais - User: ${userId} (chatty: ${chattyUserId})`);
    
    const ais = await aiManager.getAllAIs(userId, chattyUserId);
    console.log(`✅ [AIs API] Found ${ais?.length || 0} AIs for user ${userId}`);
    
    res.json({ success: true, ais: ais || [] });
  } catch (error) {
    console.error('❌ [AIs API] Error fetching AIs:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
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
    const { userId, chattyUserId } = await resolveUserId(req);
    if (!userId || !chattyUserId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    console.log(`🔄 [AIs API] Sync request from user: ${userId} (chatty: ${chattyUserId})`);
    
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

router.get('/:id', async (req, res) => {
  try {
    const { allowed, ai } = await verifyAIOwnership(req, req.params.id);
    if (!ai) {
      const { userId } = await resolveUserId(req);
      const byCallsign = await aiManager.getAIByCallsign(req.params.id, userId);
      if (!byCallsign) return res.status(404).json({ success: false, error: 'AI not found' });
      const ownerMatch = byCallsign.userId === userId;
      if (!ownerMatch) return res.status(403).json({ success: false, error: 'Access denied' });
      return res.json({ success: true, ai: byCallsign });
    }
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
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
    
    // Scaffold instance folder structure in VVAULT (API first, Supabase fallback)
    try {
      const { scaffoldConstruct } = await import('../lib/constructScaffolder.js');
      const { getSupabaseClient } = await import('../lib/supabaseClient.js');
      const constructCallsign = ai.constructCallsign || ai.id.replace(/^(ai-|gpt-)/, '');
      if (constructCallsign) {
        const supabase = getSupabaseClient();
        const userEmail = req.user?.email;
        
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
            console.log(`✅ [AIs API] Resolved Supabase user: ${userEmail} → ${scaffoldUserId}`);
          } else {
            console.warn(`⚠️ [AIs API] Could not resolve Supabase UUID for ${userEmail}, scaffold may fail`);
          }
        }
        
        const result = await scaffoldConstruct(constructCallsign, ai, {
          userId: scaffoldUserId,
          userEmail,
          supabase,
        });
        console.log(`✅ [AIs API] Scaffolded instance for ${ai.id} (${constructCallsign}) via ${result.source || 'unknown'}`);
        if (result.failed > 0) {
          console.error(`❌ [AIs API] Scaffold had ${result.failed} failures for ${constructCallsign}`);
        }
      } else {
        console.warn(`⚠️ [AIs API] No constructCallsign for ${ai.id}, skipping scaffold`);
      }
    } catch (scaffoldError) {
      console.error(`❌ [AIs API] Instance scaffold failed for ${ai.id}:`, scaffoldError.message);
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
    const ownership = await verifyAIOwnership(req, req.params.id);
    if (!ownership.ai) return res.status(404).json({ success: false, error: 'AI not found' });
    if (!ownership.allowed) return res.status(403).json({ success: false, error: 'Access denied' });

    const ai = await aiManager.updateAI(req.params.id, normalizeModelFields(req.body));
    if (!ai) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }
    
    try {
      const userId = ownership.userId;
      
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
    const ownership = await verifyAIOwnership(req, req.params.id);
    if (!ownership.ai) return res.status(404).json({ success: false, error: 'AI not found' });
    if (!ownership.allowed) return res.status(403).json({ success: false, error: 'Access denied' });

    const ai = ownership.ai;
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

    let supabaseSaved = false;
    let supabaseError = null;
    try {
      const ai = await aiManager.getAI(req.params.id);
      const constructCallsign = ai?.constructCallsign || req.params.id.replace(/^(ai-|gpt-)/, '');
      if (constructCallsign) {
        const { getSupabaseClient } = await import('../lib/supabaseClient.js');
        const supabase = getSupabaseClient();
        if (!supabase) {
          supabaseError = 'Supabase client not available';
          console.error(`❌ [AIs API] ${supabaseError} — knowledge file NOT persisted`);
        } else {
          const { userId } = await resolveUserId(req);
          let supabaseUserId = userId;
          if (supabaseUserId && req.user?.email) {
            const { data: byEmail } = await supabase
              .from('users')
              .select('id')
              .eq('email', req.user.email)
              .limit(1)
              .maybeSingle();
            if (byEmail?.id) supabaseUserId = byEmail.id;
          }

          if (!supabaseUserId) {
            supabaseError = `Could not resolve Supabase user_id for ${req.user?.email || 'unknown email'}`;
            console.error(`❌ [AIs API] ${supabaseError} — knowledge file NOT persisted to Supabase`);
          } else {
            const originalName = req.file.originalname;
            let rawZipPath = req.body.zipPath || '';

            if (rawZipPath) {
              rawZipPath = rawZipPath.replace(/\\/g, '/');
              rawZipPath = rawZipPath.replace(/^\.\//, '');
              const instancePrefixes = [
                `instances/${constructCallsign}/`,
                `${constructCallsign}/`,
              ];
              for (const prefix of instancePrefixes) {
                if (rawZipPath.startsWith(prefix)) {
                  rawZipPath = rawZipPath.slice(prefix.length);
                  break;
                }
              }
              rawZipPath = rawZipPath.replace(/\.\./g, '').replace(/\/\//g, '/').replace(/^\//, '');
            }

            let relativePath = rawZipPath || originalName;

            const knownVsiFolders = ['identity/', 'memup/', 'chatty/', 'logs/', 'config/', 'assets/', 'documents/', 'data/', 'frame/', 'simDrive/', 'vxrunner/', 'codex/', 'chatgpt/', 'character.ai/', 'github_copilot/'];
            const alreadyHasVsiFolder = knownVsiFolders.some(f => relativePath.startsWith(f));

            let vaultPath;
            let resolvedFolder;
            if (alreadyHasVsiFolder) {
              vaultPath = `instances/${constructCallsign}/${relativePath}`;
              resolvedFolder = relativePath.split('/')[0];
            } else {
              resolvedFolder = mapToVsiFolder(relativePath).replace(/\/$/, '');
              vaultPath = `instances/${constructCallsign}/${resolvedFolder}/${relativePath}`;
            }

            try {
              const { assertValidVaultFilename } = await import('../lib/vaultPathGuard.js');
              assertValidVaultFilename(vaultPath);
            } catch (pathError) {
              console.warn(`⚠️ [AIs API] Invalid vault path for knowledge file: ${vaultPath}`, pathError.message);
              throw new Error(`Invalid file path: ${pathError.message}`);
            }

            const isTextType = /^text\/|application\/(json|xml|csv)/.test(req.file.mimetype);
            const contentForVault = isTextType
              ? req.file.buffer.toString('utf8')
              : `[binary:${req.file.mimetype}:${req.file.size}]`;

            const fileType = resolvedFolder || 'knowledge';

            const { data: existing } = await supabase
              .from('vault_files')
              .select('id')
              .eq('user_id', supabaseUserId)
              .eq('filename', vaultPath)
              .maybeSingle();

            if (existing) {
              const { error: updateErr } = await supabase
                .from('vault_files')
                .update({
                  content: contentForVault,
                  metadata: {
                    source: 'chatty-knowledge-upload',
                    originalName,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    updatedAt: new Date().toISOString(),
                  },
                })
                .eq('id', existing.id);
              if (updateErr) throw updateErr;
              console.log(`✅ [AIs API] Updated vault_files: ${vaultPath}`);
            } else {
              const { error: insertErr } = await supabase
                .from('vault_files')
                .insert({
                  user_id: supabaseUserId,
                  filename: vaultPath,
                  content: contentForVault,
                  file_type: fileType,
                  construct_id: constructCallsign,
                  metadata: {
                    source: 'chatty-knowledge-upload',
                    originalName,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    createdAt: new Date().toISOString(),
                  },
                });
              if (insertErr) throw insertErr;
              console.log(`✅ [AIs API] Created vault_files: ${vaultPath} (folder: ${vsiFolder})`);
            }
            supabaseSaved = true;
          }
        }
      }
    } catch (vaultError) {
      supabaseError = vaultError.message || 'Unknown Supabase write error';
      console.error(`❌ [AIs API] Supabase vault_files write FAILED for knowledge file:`, supabaseError);
    }

    res.json({ success: true, file, supabaseSaved, supabaseError });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const zipUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tmpDir = path.join(os.tmpdir(), 'chatty-zip-uploads');
      fs.mkdirSync(tmpDir, { recursive: true });
      cb(null, tmpDir);
    },
    filename: (req, file, cb) => {
      cb(null, `zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are accepted'), false);
    }
  },
});

router.post('/:id/upload-zip', zipUpload.single('file'), async (req, res) => {
  let tmpFilePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No ZIP file uploaded' });
    }
    tmpFilePath = req.file.path;

    const { allowed, ai, userId: ownerUserId } = await verifyAIOwnership(req, req.params.id);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Not authorized to upload files to this AI' });
    }

    const constructCallsign = ai?.constructCallsign || req.params.id.replace(/^(ai-|gpt-)/, '').replace(/-seed$/, '');
    if (!constructCallsign) {
      return res.status(400).json({ success: false, error: 'Could not determine construct callsign' });
    }

    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase client not available' });
    }

    let supabaseUserId = ownerUserId;
    if (supabaseUserId && req.user?.email) {
      const { data: byEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', req.user.email)
        .limit(1)
        .maybeSingle();
      if (byEmail?.id) supabaseUserId = byEmail.id;
    }
    if (!supabaseUserId) {
      return res.status(400).json({ success: false, error: 'Could not resolve user ID' });
    }

    const { assertValidVaultFilename } = await import('../lib/vaultPathGuard.js');

    console.log(`📦 [ZIP Upload] Processing ZIP (${(req.file.size / 1024 / 1024).toFixed(1)}MB) for ${constructCallsign}`);

    const zipBuffer = fs.readFileSync(tmpFilePath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const entries = Object.entries(zip.files).filter(([name, entry]) => {
      if (entry.dir) return false;
      const basename = path.basename(name);
      if (basename.startsWith('.') || basename === '__MACOSX' || name.includes('__MACOSX/')) return false;
      if (basename === 'Thumbs.db' || basename === 'desktop.ini') return false;
      return true;
    });

    console.log(`📦 [ZIP Upload] Found ${entries.length} files to process`);

    const results = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    const MAX_INDIVIDUAL_FILE_SIZE = 50 * 1024 * 1024;
    const BATCH_SIZE = 5;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async ([entryName, entry]) => {
        try {
          const fileBuffer = await entry.async('nodebuffer');

          if (fileBuffer.length > MAX_INDIVIDUAL_FILE_SIZE) {
            results.skipped++;
            results.errors.push({ file: entryName, error: `Exceeds ${MAX_INDIVIDUAL_FILE_SIZE / 1024 / 1024}MB limit` });
            return;
          }

          let relativePath = entryName.replace(/\\/g, '/').replace(/^\.\//, '');
          const instancePrefixes = [
            `instances/${constructCallsign}/`,
            `${constructCallsign}/`,
          ];
          for (const prefix of instancePrefixes) {
            if (relativePath.startsWith(prefix)) {
              relativePath = relativePath.slice(prefix.length);
              break;
            }
          }
          relativePath = relativePath.replace(/\.\./g, '').replace(/\/\//g, '/').replace(/^\//, '');

          const knownVsiFolders = ['identity/', 'memup/', 'chatty/', 'logs/', 'config/', 'assets/', 'documents/', 'data/', 'frame/', 'simDrive/', 'vxrunner/', 'codex/', 'chatgpt/', 'character.ai/', 'github_copilot/'];
          const alreadyHasVsiFolder = knownVsiFolders.some(f => relativePath.startsWith(f));

          let vaultPath;
          let resolvedFolder;
          if (alreadyHasVsiFolder) {
            vaultPath = `instances/${constructCallsign}/${relativePath}`;
            resolvedFolder = relativePath.split('/')[0];
          } else {
            resolvedFolder = mapToVsiFolder(relativePath).replace(/\/$/, '');
            vaultPath = `instances/${constructCallsign}/${resolvedFolder}/${relativePath}`;
          }

          try {
            assertValidVaultFilename(vaultPath);
          } catch (pathError) {
            results.skipped++;
            results.errors.push({ file: entryName, error: `Invalid path: ${pathError.message}` });
            return;
          }

          const ext = path.extname(entryName).toLowerCase();
          const isText = ['.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml', '.js', '.ts', '.py', '.html', '.css', '.log', '.capsule', '.capsuleso'].includes(ext);
          const contentForVault = isText
            ? fileBuffer.toString('utf8')
            : `[binary:${mimeForExt(ext)}:${fileBuffer.length}]`;

          const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
          const originalName = path.basename(entryName);
          const fileType = resolvedFolder || 'knowledge';

          const { data: existing } = await supabase
            .from('vault_files')
            .select('id')
            .eq('user_id', supabaseUserId)
            .eq('filename', vaultPath)
            .maybeSingle();

          const metadata = {
            source: 'chatty-zip-upload',
            originalName,
            mimeType: mimeForExt(ext),
            size: fileBuffer.length,
            sha256,
          };

          if (existing) {
            metadata.updatedAt = new Date().toISOString();
            const { error: updateErr } = await supabase
              .from('vault_files')
              .update({ content: contentForVault, metadata })
              .eq('id', existing.id);
            if (updateErr) throw updateErr;
            results.updated++;
          } else {
            metadata.createdAt = new Date().toISOString();
            const { error: insertErr } = await supabase
              .from('vault_files')
              .insert({
                user_id: supabaseUserId,
                filename: vaultPath,
                content: contentForVault,
                file_type: fileType,
                construct_id: constructCallsign,
                metadata,
              });
            if (insertErr) throw insertErr;
            results.created++;
          }

          if (!isText) {
            const storagePath = `knowledge/${supabaseUserId}/${vaultPath}`;
            await supabase.storage
              .from('vault-files')
              .upload(storagePath, fileBuffer, {
                contentType: mimeForExt(ext),
                upsert: true,
              });
          }
        } catch (fileErr) {
          results.failed++;
          results.errors.push({ file: entryName, error: fileErr.message });
        }
      }));
    }

    console.log(`✅ [ZIP Upload] Complete for ${constructCallsign}: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.failed} failed`);

    res.json({
      success: true,
      constructCallsign,
      totalFiles: entries.length,
      ...results,
      errors: results.errors.slice(0, 20),
    });
  } catch (error) {
    console.error('❌ [ZIP Upload] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (tmpFilePath) {
      try { fs.unlinkSync(tmpFilePath); } catch {}
    }
  }
});

function mimeForExt(ext) {
  const map = {
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
    '.csv': 'text/csv', '.xml': 'application/xml', '.yaml': 'text/yaml', '.yml': 'text/yaml',
    '.pdf': 'application/pdf',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/avi',
    '.js': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
    '.html': 'text/html', '.css': 'text/css',
    '.log': 'text/plain', '.capsule': 'text/plain', '.capsuleso': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

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
                  const fullPath = f.filename || f.storage_path || '';
                  const pathParts = fullPath.split('/');
                  const constructIdx = pathParts.findIndex(p => /^[a-z]+-\d{3}$/.test(p));
                  const subdir = constructIdx >= 0 && pathParts[constructIdx + 1] ? pathParts[constructIdx + 1] : '';

                  const transcriptPlatforms = ['chatty', 'chatgpt', 'gemini', 'claude', 'openrouter', 'ollama', 'character.ai', 'codex', 'github_copilot'];
                  let category = 'other';
                  if (subdir === 'identity') category = 'identity';
                  else if (subdir === 'assets' || subdir === 'documents') category = 'knowledge';
                  else if (transcriptPlatforms.includes(subdir)) category = 'transcript';
                  else if (subdir === 'tests') category = 'test';
                  else if (subdir === 'lin') category = 'orchestration';
                  else if (subdir === 'memup') category = 'capsule';
                  else if (subdir === 'config') category = 'config';
                  else if (subdir === 'logs') category = 'log';

                  if (category === 'other' && f.file_type) {
                    const ft = f.file_type.toLowerCase();
                    if (ft === 'identity') category = 'identity';
                    else if (ft === 'knowledge' || ft === 'assets' || ft === 'documents') category = 'knowledge';
                    else if (ft === 'config' || ft === 'enforcement_config') category = 'config';
                    else if (ft === 'ledger' || ft === 'log' || ft === 'logs') category = 'log';
                    else if (ft === 'memup' || ft === 'capsule') category = 'capsule';
                  }

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
