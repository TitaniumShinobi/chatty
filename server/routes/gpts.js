// GPT Creator API Routes
import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import JSZip from 'jszip';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { GPTManager } from '../lib/gptManager.js';
import { enforceRoleplayToggle } from '../lib/contentGuard.js';

const router = express.Router();

const gptManager = GPTManager.getInstance();

async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    const text = data?.text?.trim();
    if (text && text.length > 0) return text;
    return null;
  } catch (err) {
    console.warn(`⚠️ [PDF Extract] Failed to parse PDF: ${err.message}`);
    return null;
  }
}

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

function mimeForExt(ext) {
  const map = {
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
    '.csv': 'text/csv', '.xml': 'application/xml', '.yaml': 'text/yaml', '.yml': 'text/yaml',
    '.js': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
    '.html': 'text/html', '.css': 'text/css', '.log': 'text/plain',
    '.capsule': 'text/plain', '.capsuleso': 'text/plain',
    '.pdf': 'application/pdf',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp',
  };
  return map[ext] || 'application/octet-stream';
}

async function syncPromptJsonToSupabase(gpt, userEmail) {
  const { getSupabaseClient } = await import('../lib/supabaseClient.js');
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const rawCallsign = gpt.constructCallsign;
  const callsign = rawCallsign.match(/-\d+$/) ? rawCallsign : `${rawCallsign}-001`;
  const vaultPath = `instances/${callsign}/identity/prompt.json`;

  const promptData = {
    name: gpt.name || '',
    description: gpt.description || '',
    instructions: gpt.instructions || '',
    conversationStarters: gpt.conversationStarters || [],
    createdAt: gpt.createdAt || new Date().toISOString(),
    source: 'chatty-gpt-creator',
  };
  const content = JSON.stringify(promptData, null, 2);

  let userId = null;
  if (userEmail) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail)
      .limit(1)
      .maybeSingle();
    userId = byEmail?.id;
  }
  if (!userId) {
    const { data: byName } = await supabase
      .from('users')
      .select('id')
      .ilike('name', `%${(userEmail || '').split('@')[0]}%`)
      .limit(1)
      .maybeSingle();
    userId = byName?.id;
  }
  if (!userId) {
    console.warn(`⚠️ [GPTs API] prompt.json sync skipped for ${callsign}: could not resolve Supabase user`);
    return;
  }

  const { data: existing } = await supabase
    .from('vault_files')
    .select('id')
    .eq('user_id', userId)
    .eq('filename', vaultPath)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('vault_files').update({
      content,
    }).eq('id', existing.id);
    if (error) console.warn(`⚠️ [GPTs API] prompt.json update failed for ${callsign}:`, error.message);
  } else {
    const { error } = await supabase.from('vault_files').insert({
      user_id: userId,
      filename: vaultPath,
      content,
      file_type: 'identity',
      construct_id: callsign,
      metadata: { originalName: 'prompt.json', sha256: null },
    });
    if (error) console.warn(`⚠️ [GPTs API] prompt.json insert failed for ${callsign}:`, error.message);
  }

  console.log(`✅ [GPTs API] Synced prompt.json to Supabase for ${callsign}`);

  const bakPath = `instances/${callsign}/identity/identity.bak.json`;
  const bakContent = JSON.stringify({ ...promptData, backupTimestamp: new Date().toISOString(), backupSource: 'save-gpt' }, null, 2);

  const { data: existingBak } = await supabase
    .from('vault_files')
    .select('id')
    .eq('user_id', userId)
    .eq('filename', bakPath)
    .maybeSingle();

  if (existingBak) {
    const { error: bakErr } = await supabase.from('vault_files').update({ content: bakContent }).eq('id', existingBak.id);
    if (bakErr) console.warn(`⚠️ [GPTs API] identity.bak.json update failed for ${callsign}:`, bakErr.message);
  } else {
    const { error: bakErr } = await supabase.from('vault_files').insert({
      user_id: userId,
      filename: bakPath,
      content: bakContent,
      file_type: 'identity',
      construct_id: callsign,
      metadata: { originalName: 'identity.bak.json', sha256: null },
    });
    if (bakErr) console.warn(`⚠️ [GPTs API] identity.bak.json insert failed for ${callsign}:`, bakErr.message);
  }
  console.log(`🔒 [GPTs API] Identity backup saved to identity.bak.json for ${callsign}`);
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

    if (req.body.roleplayEnabled === true || req.body.roleplayEnabled === 1) {
      const userId = req.user?.id || req.user?.email;
      if (userId) {
        const rpCheck = await enforceRoleplayToggle(userId);
        if (!rpCheck.allowed) {
          return res.status(403).json({ success: false, error: rpCheck.reason, roleplayBlocked: true });
        }
      }
    }

    const gpt = await gptManager.updateGPT(req.params.id, req.body);
    res.json({ success: true, gpt });

    if (gpt?.constructCallsign) {
      syncPromptJsonToSupabase(gpt, req.user?.email).catch(err =>
        console.warn(`⚠️ [GPTs API] prompt.json sync failed for ${gpt.constructCallsign}:`, err.message)
      );
    }
  } catch (error) {
    console.error('Error updating GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/restore-from-supabase', async (req, res) => {
  try {
    const { allowed, gpt: existing } = await verifyGPTOwnership(req, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'GPT not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });

    const callsign = existing.constructCallsign || existing.construct_callsign;
    if (!callsign) return res.status(400).json({ success: false, error: 'No construct callsign' });

    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(503).json({ success: false, error: 'Supabase not configured' });

    const fullCallsign = callsign.match(/-\d+$/) ? callsign : `${callsign}-001`;
    const vaultPath = `instances/${fullCallsign}/identity/prompt.json`;

    const { data: files } = await supabase
      .from('vault_files')
      .select('content')
      .eq('filename', vaultPath)
      .limit(1)
      .maybeSingle();

    if (!files?.content) {
      return res.status(404).json({ success: false, error: 'No prompt.json found in Supabase for this construct' });
    }

    let parsed;
    try {
      parsed = typeof files.content === 'string' ? JSON.parse(files.content) : files.content;
    } catch {
      return res.status(422).json({ success: false, error: 'Supabase prompt.json contains invalid JSON' });
    }

    const updates = {};
    if (parsed.name) updates.name = parsed.name;
    if (parsed.description) updates.description = parsed.description;
    if (parsed.instructions) updates.instructions = parsed.instructions;
    if (parsed.conversationStarters) updates.conversationStarters = parsed.conversationStarters;

    const gpt = await gptManager.updateGPT(req.params.id, updates);
    console.log(`🔄 [GPTs API] Restored ${fullCallsign} identity from Supabase prompt.json (user-initiated)`);
    res.json({ success: true, gpt, restoredFields: Object.keys(updates) });
  } catch (error) {
    console.error('Error restoring from Supabase:', error);
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

    let supabaseSaved = false;
    let supabaseError = null;
    try {
      const constructCallsign = gpt?.constructCallsign;
      if (constructCallsign) {
        const { getSupabaseClient } = await import('../lib/supabaseClient.js');
        const supabase = getSupabaseClient();
        if (supabase) {
          const { userId: chattyUserId } = await resolveUserId(req);
          let supabaseUserId = chattyUserId;
          if (req.user?.email) {
            const { data: byEmail } = await supabase
              .from('users').select('id').eq('email', req.user.email).limit(1).maybeSingle();
            if (byEmail?.id) supabaseUserId = byEmail.id;
          }
          if (!supabaseUserId) {
            const { data: anyUser } = await supabase.from('users').select('id').limit(1).maybeSingle();
            if (anyUser?.id) supabaseUserId = anyUser.id;
          }

          if (supabaseUserId) {
            const originalName = req.file.originalname;
            let rawZipPath = req.body.zipPath || '';
            if (rawZipPath) {
              rawZipPath = rawZipPath.replace(/\\/g, '/').replace(/^\.\//, '');
              const instancePrefixes = [`instances/${constructCallsign}/`, `${constructCallsign}/`];
              for (const prefix of instancePrefixes) {
                if (rawZipPath.startsWith(prefix)) { rawZipPath = rawZipPath.slice(prefix.length); break; }
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
              console.warn(`⚠️ [GPTs API] Invalid vault path: ${vaultPath}`, pathError.message);
              throw new Error(`Invalid file path: ${pathError.message}`);
            }

            const isTextType = /^text\/|application\/(json|xml|csv)/.test(req.file.mimetype);
            const isPdf = req.file.mimetype === 'application/pdf';
            let contentForVault;
            if (isTextType) {
              contentForVault = req.file.buffer.toString('utf8');
            } else if (isPdf) {
              const pdfText = await extractPdfText(req.file.buffer);
              contentForVault = pdfText || `[binary:${req.file.mimetype}:${req.file.size}]`;
              if (pdfText) console.log(`📄 [GPTs API] Extracted ${pdfText.length} chars from PDF: ${originalName}`);
            } else {
              contentForVault = `[binary:${req.file.mimetype}:${req.file.size}]`;
            }

            const fileType = resolvedFolder || 'knowledge';

            const { data: existing } = await supabase
              .from('vault_files').select('id').eq('user_id', supabaseUserId).eq('filename', vaultPath).maybeSingle();

            if (existing) {
              const { error: updateErr } = await supabase.from('vault_files')
                .update({ content: contentForVault, metadata: { source: 'chatty-knowledge-upload', originalName, mimeType: req.file.mimetype, size: req.file.size, updatedAt: new Date().toISOString() } })
                .eq('id', existing.id);
              if (updateErr) throw updateErr;
              console.log(`✅ [GPTs API] Updated vault_files: ${vaultPath}`);
            } else {
              const { error: insertErr } = await supabase.from('vault_files')
                .insert({ user_id: supabaseUserId, filename: vaultPath, content: contentForVault, file_type: fileType, construct_id: constructCallsign, metadata: { source: 'chatty-knowledge-upload', originalName, mimeType: req.file.mimetype, size: req.file.size, createdAt: new Date().toISOString() } });
              if (insertErr) throw insertErr;
              console.log(`✅ [GPTs API] Created vault_files: ${vaultPath} (folder: ${resolvedFolder})`);
            }

            if (!isTextType && !isPdf) {
              const storagePath = `knowledge/${supabaseUserId}/${vaultPath}`;
              await supabase.storage.from('vault-files').upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
            }
            supabaseSaved = true;
          }
        }
      }
    } catch (vaultError) {
      supabaseError = vaultError.message || 'Unknown Supabase write error';
      console.error(`❌ [GPTs API] Supabase vault_files write FAILED:`, supabaseError);
    }

    res.json({ success: true, file, supabaseSaved, supabaseError });
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
    const rawLocalFiles = await gptManager.getGPTFiles(req.params.id);
    const localFiles = rawLocalFiles.map(f => ({
      ...f,
      content: '',
      extractedText: undefined,
    }));
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
                const filePath = f.filename || f.storage_path || '';
                const pathParts = filePath.split('/');
                const constructIdx = pathParts.findIndex(p => /^[a-z]+-\d{3}$/.test(p));
                const subdir = constructIdx >= 0 && pathParts[constructIdx + 1] ? pathParts[constructIdx + 1] : '';

                const transcriptPlatforms = ['chatty', 'chatgpt', 'gemini', 'claude', 'openrouter', 'ollama', 'codex', 'character.ai', 'github_copilot'];
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

// ZIP upload for GPTs
const zipUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tmpDir = path.join(os.tmpdir(), 'chatty-gpt-zip-uploads');
      fs.mkdirSync(tmpDir, { recursive: true });
      cb(null, tmpDir);
    },
    filename: (req, file, cb) => {
      cb(null, `zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    },
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.toLowerCase().endsWith('.zip')) {
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

    const { allowed, gpt } = await verifyGPTOwnership(req, req.params.id);
    if (!allowed) return res.status(403).json({ success: false, error: 'Not authorized' });

    const constructCallsign = gpt?.constructCallsign || req.params.id.replace(/^gpt-/, '').replace(/-seed$/, '');
    if (!constructCallsign) {
      return res.status(400).json({ success: false, error: 'Could not determine construct callsign' });
    }

    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase client not available' });
    }

    let supabaseUserId = null;
    if (req.user?.email) {
      const { data: byEmail } = await supabase.from('users').select('id').eq('email', req.user.email).limit(1).maybeSingle();
      if (byEmail?.id) supabaseUserId = byEmail.id;
    }
    if (!supabaseUserId) {
      const { data: anyUser } = await supabase.from('users').select('id').limit(1).maybeSingle();
      if (anyUser?.id) supabaseUserId = anyUser.id;
    }
    if (!supabaseUserId) {
      return res.status(400).json({ success: false, error: 'Could not resolve user ID' });
    }

    const { assertValidVaultFilename } = await import('../lib/vaultPathGuard.js');

    console.log(`📦 [GPT ZIP Upload] Processing ZIP (${(req.file.size / 1024 / 1024).toFixed(1)}MB) for ${constructCallsign}`);

    const zipBuffer = fs.readFileSync(tmpFilePath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const entries = Object.entries(zip.files).filter(([name, entry]) => {
      if (entry.dir) return false;
      const basename = path.basename(name);
      if (basename.startsWith('.') || basename === '__MACOSX' || name.includes('__MACOSX/')) return false;
      if (basename === 'Thumbs.db' || basename === 'desktop.ini') return false;
      return true;
    });

    console.log(`📦 [GPT ZIP Upload] Found ${entries.length} files in ZIP`);

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
          const instancePrefixes = [`instances/${constructCallsign}/`, `${constructCallsign}/`];
          for (const prefix of instancePrefixes) {
            if (relativePath.startsWith(prefix)) { relativePath = relativePath.slice(prefix.length); break; }
          }
          relativePath = relativePath.replace(/\.\./g, '').replace(/\/\//g, '/').replace(/^\//, '');

          const originalName = path.basename(relativePath);
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
          const isPdfFile = ext === '.pdf';
          let contentForVault;
          if (isText) {
            contentForVault = fileBuffer.toString('utf8');
          } else if (isPdfFile) {
            const pdfText = await extractPdfText(fileBuffer);
            contentForVault = pdfText || `[binary:${mimeForExt(ext)}:${fileBuffer.length}]`;
            if (pdfText) console.log(`📄 [GPT ZIP Upload] Extracted ${pdfText.length} chars from PDF: ${entryName}`);
          } else {
            contentForVault = `[binary:${mimeForExt(ext)}:${fileBuffer.length}]`;
          }

          const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

          const { data: existing } = await supabase
            .from('vault_files').select('id').eq('user_id', supabaseUserId).eq('filename', vaultPath).maybeSingle();

          const metadata = { source: 'chatty-zip-upload', originalName, mimeType: mimeForExt(ext), size: fileBuffer.length, sha256 };

          if (existing) {
            metadata.updatedAt = new Date().toISOString();
            const { error: updateErr } = await supabase.from('vault_files').update({ content: contentForVault, metadata }).eq('id', existing.id);
            if (updateErr) throw updateErr;
            results.updated++;
          } else {
            const { error: insertErr } = await supabase.from('vault_files')
              .insert({ user_id: supabaseUserId, filename: vaultPath, content: contentForVault, file_type: resolvedFolder || 'knowledge', construct_id: constructCallsign, metadata });
            if (insertErr) throw insertErr;
            results.created++;
          }

          if (!isText && !isPdfFile) {
            const storagePath = `knowledge/${supabaseUserId}/${vaultPath}`;
            await supabase.storage.from('vault-files').upload(storagePath, fileBuffer, { contentType: mimeForExt(ext), upsert: true });
          }
        } catch (fileErr) {
          results.failed++;
          results.errors.push({ file: entryName, error: fileErr.message });
        }
      }));
    }

    console.log(`✅ [GPT ZIP Upload] Complete for ${constructCallsign}: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.failed} failed`);

    res.json({ success: true, constructCallsign, totalFiles: entries.length, ...results, errors: results.errors.slice(0, 20) });
  } catch (error) {
    console.error('Error in GPT ZIP upload:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (tmpFilePath) {
      try { fs.unlinkSync(tmpFilePath); } catch (e) {}
    }
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
