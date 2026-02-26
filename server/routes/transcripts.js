import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { extractStartDate, extractFromPath } from '../lib/transcriptDateExtractor.js';
import { assertValidVaultFilename } from '../lib/vaultPathGuard.js';
import {
  normalizeTranscriptSource,
  extractSourceFromTranscriptPath,
  toCanonicalTranscriptFilename,
  isYearSegment,
  isMonthSegment,
} from '../lib/transcriptSource.js';

const router = express.Router();

const MAX_TEXT_SIZE = 50 * 1024 * 1024; // 50MB for text files

const MEDIA_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp']);

function isMediaFile(filename) {
  if (!filename) return false;
  const ext = filename.toLowerCase().split('.').pop();
  return MEDIA_EXTENSIONS.has(ext);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'text/rtf',
      'application/rtf',
      'application/pdf',
      'application/json',
      'image/png',
      'image/jpeg',
      'image/svg+xml',
      'image/gif',
      'image/webp',
      'text/csv',
      'text/xml',
      'application/xml',
      'application/x-yaml',
    ];
    const allowedExts = ['.md', '.txt', '.rtf', '.pdf', '.json', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.csv', '.xml', '.yaml', '.yml', '.log'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

async function resolveSupabaseUserId(supabase, userEmail) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .or(`email.eq.${userEmail},name.eq.${userEmail}`)
    .limit(1)
    .single();
  
  if (error || !data) {
    return null;
  }
  return data.id;
}

function getVvaultRoot() {
  // Server-side filesystem VVAULT root. Must be configured in production.
  return process.env.VVAULT_PATH || process.env.VVAULT_ROOT || '';
}

async function listTranscriptsFromFilesystem({ vvaultRoot, userId, constructCallsign }) {
  const baseDir = path.join(
    vvaultRoot,
    'users',
    'shard_0000',
    String(userId),
    'instances',
    String(constructCallsign),
  );

  const candidates = [
    path.join(baseDir, 'transcripts'),
    // Some installs may store at the instance root
    baseDir,
  ];

  const results = [];
  for (const dir of candidates) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        const name = ent.name;
        if (!/\.(md|txt|rtf|pdf|json)$/i.test(name)) continue;
        results.push({
          name,
          type: name.split('.').pop() || 'unknown',
          source: 'transcripts',
          year: null,
          month: null,
          startDate: null,
          dateConfidence: 0,
          uploadedAt: null,
          filename: path.join(dir, name),
        });
      }
    } catch {
      // ignore missing dirs
    }
  }

  return results;
}

router.post('/save', async (req, res) => {
  try {
    const { constructCallsign, transcripts } = req.body;
    
    if (!constructCallsign) {
      return res.status(400).json({ success: false, error: 'constructCallsign required' });
    }
    
    if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
      return res.status(400).json({ success: false, error: 'transcripts array required' });
    }
    
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }
    
    const userEmail = req.user?.email || 'anonymous';
    console.log(`📝 [Transcripts] Saving ${transcripts.length} transcripts for ${constructCallsign}`);
    
    const userId = await resolveSupabaseUserId(supabase, userEmail);
    if (!userId) {
      console.warn(`⚠️ [Transcripts] User not found: ${userEmail}`);
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const savedTranscripts = [];
    const failedTranscripts = [];
    
    for (const transcript of transcripts) {
      if (transcript.content && transcript.content.length > MAX_TEXT_SIZE) {
        console.warn(`⚠️ [Transcripts] File too large: ${transcript.name} (${transcript.content.length} bytes)`);
        failedTranscripts.push({ name: transcript.name, error: 'File too large (max 50MB)' });
        continue;
      }
      
      // VVAULT hierarchical path format:
      // Filename uses RELATIVE paths rooted at instances/{callsign}/
      // The user_id column links to the user; construct_id links to the construct.
      // NEVER use full internal VVAULT paths (vvault/users/shard_0000/...) as filenames.
      // Correct: instances/sera-001/transcripts/chat.txt
      // Wrong:   vvault/users/shard_0000/devon_woodson_.../instances/sera-001/transcripts/chat.txt
      
      let transcriptSource = normalizeTranscriptSource(transcript.source, { fallback: 'transcripts' });
      let transcriptYear = transcript.year || '';
      let transcriptMonth = transcript.month || '';
      
      let filename;

      if (transcript.path && transcript.path.includes('/')) {
        const zipParts = transcript.path.replace(/\\/g, '/').split('/').filter(p => p && !p.startsWith('.'));
        
        for (const part of zipParts) {
          if (isYearSegment(part)) {
            transcriptYear = part;
          } else if (isMonthSegment(part)) {
            transcriptMonth = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
          } else if (!transcriptSource || transcriptSource === 'transcripts') {
            const normalizedPart = normalizeTranscriptSource(part, { fallback: '' });
            if (normalizedPart && !part.includes('.')) {
              transcriptSource = normalizedPart;
            }
          }
        }

        const rawParts = [...zipParts];
        if (rawParts.length > 0 && ['assets', 'documents', 'transcripts'].includes(rawParts[0].toLowerCase())) {
          rawParts.shift();
        }

        if (rawParts.length > 0) {
          const first = rawParts[0];
          const firstSource = normalizeTranscriptSource(first, { fallback: '' });
          const looksLikeSource =
            !!firstSource &&
            !isYearSegment(first) &&
            !isMonthSegment(first) &&
            !first.includes('.');

          if (looksLikeSource) {
            if (!transcriptSource || transcriptSource === 'transcripts') {
              transcriptSource = firstSource;
            }
            if (firstSource === transcriptSource) {
              rawParts.shift();
            }
          }
        }

        filename = ['instances', constructCallsign, transcriptSource, ...rawParts].join('/');
      } else {
        const pathParts = [
          'instances',
          constructCallsign,
          transcriptSource
        ];
        if (transcriptYear) pathParts.push(transcriptYear);
        if (transcriptYear && transcriptMonth) pathParts.push(transcriptMonth);
        pathParts.push(transcript.name);
        
        filename = pathParts.join('/');
      }

      filename = toCanonicalTranscriptFilename(filename, constructCallsign, transcriptSource);
      transcriptSource = normalizeTranscriptSource(
        transcriptSource || extractSourceFromTranscriptPath(filename, constructCallsign),
        { fallback: 'transcripts' }
      );

      if (!filename.includes(`instances/${constructCallsign}/`)) {
        filename = ['instances', constructCallsign, transcriptSource, transcript.name].join('/');
      }

      console.log(`📁 [Transcripts] Routing ${transcript.name} → ${transcriptSource}/ (media: ${isMediaFile(transcript.name)})`);
      
      // Auto-detect start date from transcript content (runs in milliseconds)
      const dateResult = extractStartDate(transcript.content, transcript.name);
      const detectedStartDate = dateResult.startDate || null;
      const dateConfidence = dateResult.confidence || 0;
      
      console.log(`📅 [Transcripts] Date extraction for ${transcript.name}: ${detectedStartDate || 'null'} (${dateResult.processingTimeMs}ms, confidence: ${dateConfidence})`);
      
      assertValidVaultFilename(filename);
      
      // Check if file already exists
      const { data: existing } = await supabase
        .from('vault_files')
        .select('id')
        .eq('user_id', userId)
        .eq('filename', filename)
        .maybeSingle();
      
      let saveError;
      if (existing) {
        // Update existing file
        const { error } = await supabase
          .from('vault_files')
          .update({
            content: transcript.content,
            metadata: {
              originalName: transcript.name,
              type: transcript.type,
              uploadedAt: new Date().toISOString(),
              constructCallsign,
              source: transcriptSource,
              year: transcriptYear || null,
              month: transcriptMonth || null,
              startDate: detectedStartDate,
              dateConfidence,
              dateSource: dateResult.source || null,
              datePattern: dateResult.pattern || null,
              uploadSource: 'chatty-upload',
            },
          })
          .eq('id', existing.id);
        saveError = error;
      } else {
        // Insert new file
        const { error } = await supabase
          .from('vault_files')
          .insert({
            user_id: userId,
            filename,
            content: transcript.content,
            file_type: 'transcript',
            construct_id: constructCallsign,
            metadata: {
              originalName: transcript.name,
              type: transcript.type,
              uploadedAt: new Date().toISOString(),
              constructCallsign,
              source: transcriptSource,
              year: transcriptYear || null,
              month: transcriptMonth || null,
              startDate: detectedStartDate,
              dateConfidence,
              dateSource: dateResult.source || null,
              datePattern: dateResult.pattern || null,
              uploadSource: 'chatty-upload',
            },
          });
        saveError = error;
      }
      
      if (saveError) {
        console.error(`❌ [Transcripts] Failed to save ${transcript.name}:`, saveError);
        failedTranscripts.push({ name: transcript.name, error: saveError.message });
      } else {
        console.log(`✅ [Transcripts] Saved: ${filename}`);
        savedTranscripts.push(transcript.name);
      }
    }
    
    const allSucceeded = failedTranscripts.length === 0;
    res.json({ 
      success: allSucceeded,
      saved: savedTranscripts.length,
      transcripts: savedTranscripts,
      failed: failedTranscripts,
      message: allSucceeded 
        ? `Saved ${savedTranscripts.length} transcript(s)` 
        : `Saved ${savedTranscripts.length}, failed ${failedTranscripts.length}`,
    });
  } catch (error) {
    console.error('❌ [Transcripts] Save error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/append-preview', async (req, res) => {
  try {
    const { constructCallsign, constructName, messages, source } = req.body;
    
    if (!constructCallsign || !messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'constructCallsign and messages array required' 
      });
    }
    
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }
    
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const supabaseUserId = await resolveSupabaseUserId(supabase, userEmail);
    if (!supabaseUserId) {
      return res.status(404).json({ success: false, error: 'User not found in Supabase' });
    }
    
    console.log(`📝 [Transcripts] Appending ${messages.length} preview messages to ${constructCallsign}`);
    
    // Format messages as markdown transcript
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const formattedDate = now.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    let transcriptContent = `# Preview Conversation with ${constructName || constructCallsign}\n`;
    transcriptContent += `**Date:** ${formattedDate}\n`;
    transcriptContent += `**Source:** ${source || 'chatty-preview'}\n\n---\n\n`;
    
    for (const msg of messages) {
      const speaker = msg.role === 'user' ? 'User' : (constructName || constructCallsign);
      const msgTime = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
      transcriptContent += `**${speaker}${msgTime ? ` (${msgTime})` : ''}:** ${msg.content}\n\n`;
    }
    
    // Build the VVAULT path (always use 'chatty-preview' for preview conversations)
    const year = now.getFullYear().toString();
    const month = now.toLocaleString('en-US', { month: 'long' });
    const filename = `preview_${timestamp}.md`;
    const previewSource = 'chatty-preview';
    const vvaultPath = `instances/${constructCallsign}/${previewSource}/${year}/${month}/${filename}`;
    
    // Extract date info for metadata
    const dateInfo = {
      year,
      month,
      startDate: now.toISOString(),
      dateConfidence: 1.0,
      dateSource: 'session_timestamp'
    };
    
    // Save to Supabase vault_files
    const { data, error } = await supabase
      .from('vault_files')
      .insert({
        user_id: supabaseUserId,
        filename: vvaultPath,
        content: transcriptContent,
        file_type: 'transcript',
        metadata: {
          construct_id: constructCallsign,
          construct_name: constructName || constructCallsign,
          source: previewSource,
          message_count: messages.length,
          ...dateInfo,
          created_at: now.toISOString(),
          is_preview: true
        }
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ [Transcripts] Failed to save preview:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    console.log(`✅ [Transcripts] Saved preview transcript: ${vvaultPath}`);
    
    res.json({
      success: true,
      message: `Saved ${messages.length} messages to transcript`,
      path: vvaultPath,
      id: data.id
    });
  } catch (error) {
    console.error('❌ [Transcripts] Append preview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/list/:constructCallsign', async (req, res) => {
  try {
    const { constructCallsign } = req.params;
    
    const supabase = getSupabaseClient();
    const userEmail = req.user?.email || 'anonymous';

    // Prefer Supabase when configured; otherwise fall back to filesystem VVAULT.
    let transcripts = [];
    if (supabase) {
      const userId = await resolveSupabaseUserId(supabase, userEmail);

      const constructVariants = [
        constructCallsign,
        constructCallsign.replace(/-\d+$/, '')
      ];

      let allFiles = [];
      for (const cid of constructVariants) {
        let query = supabase
          .from('vault_files')
          .select('id, filename, metadata, created_at, construct_id')
          .eq('file_type', 'transcript')
          .eq('construct_id', cid);

        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }

        const { data: files, error: filesError } = await query;
        if (!filesError && files && files.length > 0) {
          allFiles.push(...files);
        }
      }

      const { data: files, error: filesError } = { data: allFiles, error: null };

      if (filesError) {
        console.error('❌ [Transcripts] List error:', filesError);
        return res.status(500).json({ success: false, error: filesError.message });
      }

      transcripts = (files || []).map(f => {
        // Prefer metadata for source/year/month (reliable), fall back to path parsing
        let source = normalizeTranscriptSource(f.metadata?.source, { fallback: '' });
        let year = f.metadata?.year;
        let month = f.metadata?.month;

        // If metadata missing, parse from path
        if (!source || source === 'transcripts') {
          // Path format: instances/{constructCallsign}/{source}/{year?}/{month?}/{filename}
          // Legacy format: vvault/users/shard_0000/{userId}/instances/{constructId}/{source}/...
          const pathParts = f.filename.split('/');
          const constructIdx = pathParts.indexOf('instances');
          const extractedSource = extractSourceFromTranscriptPath(f.filename, f.construct_id || constructCallsign);
          if (extractedSource) source = normalizeTranscriptSource(extractedSource, { fallback: source || 'transcripts' });

          if (constructIdx >= 0 && pathParts.length > constructIdx + 2) {
            // Check for year/month in subsequent parts
            for (let i = constructIdx + 3; i < pathParts.length - 1; i++) {
              const part = pathParts[i];
              if (isYearSegment(part) && !year) {
                year = part;
              } else if (isMonthSegment(part) && !month) {
                month = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
              }
            }
          }
        }

        source = normalizeTranscriptSource(source, { fallback: 'transcripts' });

        return {
          id: f.id,
          name: f.metadata?.originalName || f.filename.split('/').pop(),
          type: f.metadata?.type || 'unknown',
          source: source || 'unknown',
          year: year || null,
          month: month || null,
          startDate: f.metadata?.startDate || null,
          dateConfidence: f.metadata?.dateConfidence || 0,
          uploadedAt: f.metadata?.uploadedAt || f.created_at,
          filename: f.filename,
        };
      });
    } else {
      const vvaultRoot = getVvaultRoot();
      if (!vvaultRoot) {
        return res.status(500).json({
          success: false,
          error: 'Transcripts unavailable: set SUPABASE_* or VVAULT_PATH on the server',
        });
      }

      // In the VVAULT filesystem, the userId is Chatty's resolved ID (req.user.id).
      const fsUserId = req.user?.id;
      transcripts = await listTranscriptsFromFilesystem({
        vvaultRoot,
        userId: fsUserId,
        constructCallsign,
      });
    }
    
    // Group by source for frontend convenience
    const bySource = transcripts.reduce((acc, t) => {
      const src = t.source || 'unknown';
      if (!acc[src]) acc[src] = [];
      acc[src].push(t);
      return acc;
    }, {});
    
    // Also group by year/month for timeline view
    const byTimeline = transcripts.reduce((acc, t) => {
      if (t.year) {
        const key = t.month ? `${t.year}/${t.month}` : t.year;
        if (!acc[key]) acc[key] = [];
        acc[key].push(t);
      }
      return acc;
    }, {});
    
    // Group by detected start date for chronological ordering
    const byStartDate = transcripts
      .filter(t => t.startDate)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    res.json({ success: true, transcripts, bySource, byTimeline, byStartDate });
  } catch (error) {
    console.error('❌ [Transcripts] List error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ContinuityGPT-style auto-organize: detect dates and sort into year/month folders
router.post('/auto-organize/:constructCallsign', async (req, res) => {
  try {
    const { constructCallsign } = req.params;
    const { defaultYear } = req.body; // Optional: default year if not detected
    
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }
    
    const userEmail = req.user?.email || 'anonymous';
    const userId = await resolveSupabaseUserId(supabase, userEmail);
    
    if (!userId) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    console.log(`🗂️ [ContinuityGPT] Auto-organizing transcripts for ${constructCallsign}...`);
    
    // Fetch all transcripts with content
    const { data: files, error: filesError } = await supabase
      .from('vault_files')
      .select('id, filename, content, metadata, created_at')
      .eq('user_id', userId)
      .eq('file_type', 'transcript')
      .eq('construct_id', constructCallsign);
    
    if (filesError) {
      console.error('❌ [ContinuityGPT] Fetch error:', filesError);
      return res.status(500).json({ success: false, error: filesError.message });
    }
    
    if (!files || files.length === 0) {
      return res.json({ success: true, organized: 0, message: 'No transcripts to organize' });
    }
    
    console.log(`📁 [ContinuityGPT] Processing ${files.length} transcripts...`);
    
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    
    const results = {
      organized: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };
    
    for (const file of files) {
      try {
        const content = file.content || '';
        const filename = file.filename.split('/').pop();
        
        // Run date detection
        const dateResult = extractStartDate(content, filename);
        
        let year = null;
        let month = null;
        
        if (dateResult.startDate) {
          // Parse the detected date
          const date = new Date(dateResult.startDate);
          if (!isNaN(date.getTime())) {
            year = date.getFullYear().toString();
            month = MONTHS[date.getMonth()];
          }
        }
        
        // Fall back to path-based detection or default year
        if (!year) {
          const pathResult = extractFromPath(file.filename);
          if (pathResult.year) {
            year = pathResult.year;
            month = pathResult.month;
          } else if (defaultYear) {
            year = defaultYear;
          }
        }
        
        // Skip if no year could be determined
        if (!year) {
          results.skipped++;
          results.details.push({
            name: filename,
            status: 'skipped',
            reason: 'No date detected',
            confidence: dateResult.confidence || 0,
          });
          continue;
        }
        
        // Update metadata with detected date info
        const updatedMetadata = {
          ...file.metadata,
          year,
          month: month || null,
          startDate: dateResult.startDate || null,
          dateConfidence: dateResult.confidence || 0,
          dateSource: dateResult.source || 'auto-organize',
          datePattern: dateResult.pattern || null,
          autoOrganizedAt: new Date().toISOString(),
        };
        
        // Update the record in Supabase
        const { error: updateError } = await supabase
          .from('vault_files')
          .update({ metadata: updatedMetadata })
          .eq('id', file.id);
        
        if (updateError) {
          console.error(`❌ [ContinuityGPT] Failed to update ${filename}:`, updateError);
          results.failed++;
          results.details.push({
            name: filename,
            status: 'failed',
            error: updateError.message,
          });
        } else {
          results.organized++;
          results.details.push({
            name: filename,
            status: 'organized',
            year,
            month: month || 'Unknown',
            startDate: dateResult.startDate,
            confidence: dateResult.confidence || 0,
          });
          console.log(`✅ [ContinuityGPT] ${filename} → ${year}/${month || 'Unknown'} (conf: ${dateResult.confidence || 0})`);
        }
      } catch (fileError) {
        console.error(`❌ [ContinuityGPT] Error processing file:`, fileError);
        results.failed++;
        results.details.push({
          name: file.filename.split('/').pop(),
          status: 'failed',
          error: fileError.message,
        });
      }
    }
    
    console.log(`🗂️ [ContinuityGPT] Complete: ${results.organized} organized, ${results.skipped} skipped, ${results.failed} failed`);
    
    res.json({
      success: true,
      ...results,
      message: `Organized ${results.organized} of ${files.length} transcripts`,
    });
  } catch (error) {
    console.error('❌ [ContinuityGPT] Auto-organize error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/move', async (req, res) => {
  try {
    const { fileId, year, month, source } = req.body;
    const normalizedSource = source ? normalizeTranscriptSource(source, { fallback: 'transcripts' }) : null;

    if (!fileId) {
      return res.status(400).json({ success: false, error: 'fileId is required' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }

    const userEmail = req.user?.email || 'anonymous';
    const userId = await resolveSupabaseUserId(supabase, userEmail);

    console.log(`📦 [Transcripts] Moving file ${fileId} → ${normalizedSource || '?'}/${year || 'Unsorted'}/${month || ''}`);

    const { data: file, error: fetchError } = await supabase
      .from('vault_files')
      .select('id, metadata, user_id, filename, construct_id')
      .eq('id', fileId)
      .eq('file_type', 'transcript')
      .single();

    if (fetchError || !file) {
      console.error('❌ [Transcripts] File not found for move:', fetchError);
      return res.status(404).json({ success: false, error: 'Transcript file not found' });
    }

    if (file.user_id && userId && file.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to move this file' });
    }

    const updatedMetadata = {
      ...file.metadata,
      year: year || null,
      month: month || null,
      movedAt: new Date().toISOString(),
    };

    let newFilename = file.filename;

    if (normalizedSource && normalizedSource !== normalizeTranscriptSource(file.metadata?.source, { fallback: '' })) {
      updatedMetadata.source = normalizedSource;
      updatedMetadata.previousSource = file.metadata?.source || null;
      const constructId = file.construct_id || file.metadata?.constructCallsign;
      if (constructId) {
        const candidate = toCanonicalTranscriptFilename(file.filename, constructId, normalizedSource);
        try {
          assertValidVaultFilename(candidate);
          newFilename = candidate;
        } catch (e) {
          console.warn(`⚠️ [Transcripts] Invalid filename after source move, keeping original path`);
        }
      }
    }

    const { error: updateError } = await supabase
      .from('vault_files')
      .update({ filename: newFilename, metadata: updatedMetadata })
      .eq('id', file.id);

    if (updateError) {
      console.error('❌ [Transcripts] Move update error:', updateError);
      return res.status(500).json({ success: false, error: updateError.message });
    }

    const displayName = file.filename?.split('/').pop() || fileId;
    console.log(`✅ [Transcripts] Moved ${displayName} → ${normalizedSource || '?'}/${year || 'Unsorted'}/${month || ''}`);
    res.json({ success: true, year: year || null, month: month || null, source: normalizedSource || null });
  } catch (error) {
    console.error('❌ [Transcripts] Move error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/relocate-source', async (req, res) => {
  try {
    const { constructCallsign, fromSource, toSource } = req.body;
    const normalizedFrom = normalizeTranscriptSource(fromSource, { fallback: '' });
    const normalizedTo = normalizeTranscriptSource(toSource, { fallback: '' });

    if (!constructCallsign || !normalizedFrom || !normalizedTo) {
      return res.status(400).json({ success: false, error: 'constructCallsign, fromSource, and toSource are all required' });
    }

    if (normalizedFrom === normalizedTo) {
      return res.json({ success: true, moved: 0, message: 'Source and destination are the same' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }

    const userEmail = req.user?.email || 'anonymous';
    const userId = await resolveSupabaseUserId(supabase, userEmail);
    if (!userId) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log(`📦 [Transcripts] Relocating ${constructCallsign} files: ${normalizedFrom} → ${normalizedTo}`);

    const { data: files, error: fetchError } = await supabase
      .from('vault_files')
      .select('id, filename, metadata')
      .eq('user_id', userId)
      .eq('construct_id', constructCallsign)
      .eq('file_type', 'transcript');

    if (fetchError) {
      return res.status(500).json({ success: false, error: fetchError.message });
    }

    if (!files || files.length === 0) {
      return res.json({ success: true, moved: 0, message: 'No files found to relocate' });
    }

    let moved = 0;
    let skipped = 0;
    for (const file of files) {
      const currentSource = normalizeTranscriptSource(
        file.metadata?.source || extractSourceFromTranscriptPath(file.filename, constructCallsign),
        { fallback: '' }
      );
      if (!currentSource || currentSource !== normalizedFrom) {
        skipped++;
        continue;
      }

      const newFilename = toCanonicalTranscriptFilename(file.filename, constructCallsign, normalizedTo);

      try {
        assertValidVaultFilename(newFilename);
      } catch (e) {
        console.warn(`⚠️ [Transcripts] Invalid new filename, skipping: ${newFilename}`);
        skipped++;
        continue;
      }

      const updatedMetadata = {
        ...file.metadata,
        source: normalizedTo,
        previousSource: currentSource,
        relocatedAt: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('vault_files')
        .update({ filename: newFilename, metadata: updatedMetadata })
        .eq('id', file.id);

      if (!updateError) {
        moved++;
      } else {
        console.error(`❌ [Transcripts] Failed to relocate ${file.filename}:`, updateError);
      }
    }

    console.log(`✅ [Transcripts] Relocated ${moved}/${files.length} files to ${normalizedTo}/ (${skipped} skipped)`);
    res.json({ success: true, moved, skipped, total: files.length, fromSource: normalizedFrom, toSource: normalizedTo });
  } catch (error) {
    console.error('❌ [Transcripts] Relocate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/migrate-canonical', async (req, res) => {
  try {
    const { constructCallsign, dryRun = true } = req.body || {};
    if (!constructCallsign) {
      return res.status(400).json({ success: false, error: 'constructCallsign is required' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }

    const userEmail = req.user?.email || 'anonymous';
    const userId = await resolveSupabaseUserId(supabase, userEmail);
    if (!userId) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { data: files, error: fetchError } = await supabase
      .from('vault_files')
      .select('id, filename, metadata, content, file_type, created_at')
      .eq('user_id', userId)
      .eq('construct_id', constructCallsign)
      .eq('file_type', 'transcript')
      .order('created_at', { ascending: true });

    if (fetchError) {
      return res.status(500).json({ success: false, error: fetchError.message });
    }

    if (!files || files.length === 0) {
      return res.json({
        success: true,
        constructCallsign,
        dryRun: !!dryRun,
        scanned: 0,
        renamed: 0,
        metadataUpdated: 0,
        reindexed: 0,
        skipped: 0,
        updates: [],
      });
    }

    const updates = [];
    let renamed = 0;
    let metadataUpdated = 0;
    let skipped = 0;

    for (const file of files) {
      const fromPath = extractSourceFromTranscriptPath(file.filename, constructCallsign);
      const currentSource = normalizeTranscriptSource(file.metadata?.source || fromPath, { fallback: 'transcripts' });
      const nextFilename = toCanonicalTranscriptFilename(file.filename, constructCallsign, currentSource);
      const nextSource = normalizeTranscriptSource(currentSource, { fallback: 'transcripts' });
      const currentStoredSource = normalizeTranscriptSource(file.metadata?.source, { fallback: '' });

      const needsFilenameUpdate = nextFilename !== file.filename;
      const needsSourceUpdate = nextSource !== currentStoredSource;

      if (!needsFilenameUpdate && !needsSourceUpdate) {
        skipped++;
        continue;
      }

      const updatedMetadata = {
        ...(file.metadata || {}),
        source: nextSource,
        migratedCanonicalAt: new Date().toISOString(),
      };

      if (needsSourceUpdate) {
        updatedMetadata.previousSource = file.metadata?.source || null;
      }

      updates.push({
        id: file.id,
        oldFilename: file.filename,
        newFilename: nextFilename,
        oldSource: file.metadata?.source || null,
        newSource: nextSource,
        metadata: updatedMetadata,
        content: file.content,
      });

      if (needsFilenameUpdate) renamed++;
      if (needsSourceUpdate) metadataUpdated++;
    }

    let reindexed = 0;
    const reindexFailures = [];

    if (!dryRun && updates.length > 0) {
      for (const update of updates) {
        try {
          assertValidVaultFilename(update.newFilename);
          const { error: updateError } = await supabase
            .from('vault_files')
            .update({
              filename: update.newFilename,
              metadata: update.metadata,
            })
            .eq('id', update.id);

          if (updateError) {
            reindexFailures.push({ id: update.id, error: updateError.message });
            continue;
          }
        } catch (err) {
          reindexFailures.push({ id: update.id, error: err.message });
        }
      }

      try {
        const { clearVerifiedMemoryCache, extractAndStoreAnchors } = await import('../lib/verifiedMemoryLoader.js');
        clearVerifiedMemoryCache(constructCallsign);

        for (const target of updates) {
          const content = target.content || '';
          const isText = typeof content === 'string' && content.length > 100 && !content.startsWith('data:image/');
          if (!isText) continue;

          const anchorResult = await extractAndStoreAnchors(
            constructCallsign,
            content,
            target.newFilename.split('/').pop() || 'transcript.md'
          );
          if (anchorResult?.pairCount || anchorResult?.pairs?.length) {
            reindexed++;
          }
        }
      } catch (anchorErr) {
        reindexFailures.push({ id: 'anchors', error: anchorErr.message });
      }
    }

    return res.json({
      success: true,
      constructCallsign,
      dryRun: !!dryRun,
      scanned: files.length,
      renamed,
      metadataUpdated,
      reindexed,
      skipped,
      failed: reindexFailures.length,
      updates: updates.map(u => ({
        id: u.id,
        oldFilename: u.oldFilename,
        newFilename: u.newFilename,
        oldSource: u.oldSource,
        newSource: u.newSource,
      })),
      failures: reindexFailures,
    });
  } catch (error) {
    console.error('❌ [Transcripts] migrate-canonical error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/extract-pdf', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }
    
    console.log(`📄 [Transcripts] Processing PDF: ${file.originalname} (${file.size} bytes)`);
    
    let content = `# Transcript: ${file.originalname}\n\n`;
    content += `*Uploaded: ${new Date().toISOString()}*\n\n`;
    content += `---\n\n`;
    content += `**Note:** PDF text extraction pending. File stored for manual review.\n\n`;
    content += `- Original filename: ${file.originalname}\n`;
    content += `- File size: ${(file.size / 1024).toFixed(2)} KB\n`;
    
    res.json({ 
      success: true, 
      content,
      isPdfPlaceholder: true,
      message: 'PDF uploaded. Full text extraction is not yet available.',
    });
  } catch (error) {
    console.error('❌ [Transcripts] PDF extraction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
