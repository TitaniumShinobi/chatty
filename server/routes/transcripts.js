import express from 'express';
import multer from 'multer';
import { getSupabaseClient } from '../lib/supabaseClient.js';

const router = express.Router();

const MAX_TEXT_SIZE = 5 * 1024 * 1024; // 5MB for text files

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'text/rtf',
      'application/rtf',
      'application/pdf',
    ];
    const allowedExts = ['.md', '.txt', '.rtf', '.pdf'];
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
    
    // Get user identifier for VVAULT path (email formatted as name_timestamp or fallback)
    const userIdentifier = req.user?.name || userEmail.replace('@', '_').replace(/\./g, '_') || 'anonymous';
    
    for (const transcript of transcripts) {
      if (transcript.content && transcript.content.length > MAX_TEXT_SIZE) {
        console.warn(`⚠️ [Transcripts] File too large: ${transcript.name} (${transcript.content.length} bytes)`);
        failedTranscripts.push({ name: transcript.name, error: 'File too large (max 5MB)' });
        continue;
      }
      
      // VVAULT hierarchical path format:
      // - With organization: /vvault/users/shard_0000/{userId}/instances/{constructId}/{source}/{year}/{month}/{filename}
      // - Without organization: /vvault/users/shard_0000/{userId}/instances/{constructId}/transcripts/{filename}
      // - From zip: uses transcript.path directly (preserves original directory structure)
      
      // Parse source/year/month from zip path or use provided values
      let transcriptSource = transcript.source || 'transcripts';
      let transcriptYear = transcript.year || '';
      let transcriptMonth = transcript.month || '';
      
      let filename;
      
      // If transcript has a path from zip extraction, parse and use it
      if (transcript.path && transcript.path.includes('/')) {
        // Parse source/year/month from zip path for metadata
        const zipParts = transcript.path.split('/').filter(p => p && !p.startsWith('.'));
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
        
        for (const part of zipParts) {
          if (/^\d{4}$/.test(part)) {
            transcriptYear = part;
          } else if (months.includes(part.toLowerCase())) {
            transcriptMonth = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
          } else if (!transcriptSource || transcriptSource === 'transcripts') {
            // First non-year, non-month segment is likely the platform
            const normalizedPart = part.toLowerCase().replace(/\s+/g, '_');
            if (['chatgpt', 'gemini', 'grok', 'copilot', 'claude', 'chai', 
                 'character.ai', 'deepseek', 'codex', 'github_copilot'].includes(normalizedPart)) {
              transcriptSource = normalizedPart;
            } else if (part !== transcript.name && !part.includes('.')) {
              transcriptSource = normalizedPart;
            }
          }
        }
        
        // Preserve the zip directory structure
        filename = `vvault/users/shard_0000/${userIdentifier}/instances/${constructCallsign}/${transcript.path}`;
      } else {
        // Build hierarchical path from dropdowns
        let pathParts = [
          'vvault/users/shard_0000',
          userIdentifier,
          'instances',
          constructCallsign,
          transcriptSource
        ];
        if (transcriptYear) pathParts.push(transcriptYear);
        if (transcriptYear && transcriptMonth) pathParts.push(transcriptMonth);
        pathParts.push(transcript.name);
        
        filename = pathParts.join('/');
      }
      
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

router.get('/list/:constructCallsign', async (req, res) => {
  try {
    const { constructCallsign } = req.params;
    
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }
    
    const userEmail = req.user?.email || 'anonymous';
    const userId = await resolveSupabaseUserId(supabase, userEmail);
    
    if (!userId) {
      return res.json({ success: true, transcripts: [] });
    }
    
    const { data: files, error: filesError } = await supabase
      .from('vault_files')
      .select('filename, metadata, created_at')
      .eq('user_id', userId)
      .eq('file_type', 'transcript')
      .eq('construct_id', constructCallsign);
    
    if (filesError) {
      console.error('❌ [Transcripts] List error:', filesError);
      return res.status(500).json({ success: false, error: filesError.message });
    }
    
    const transcripts = (files || []).map(f => {
      // Prefer metadata for source/year/month (reliable), fall back to path parsing
      let source = f.metadata?.source;
      let year = f.metadata?.year;
      let month = f.metadata?.month;
      
      // If metadata missing, parse from path
      if (!source || source === 'transcripts') {
        // Path format: vvault/users/shard_0000/{userId}/instances/{constructId}/{source}/{year?}/{month?}/{filename}
        const pathParts = f.filename.split('/');
        const constructIdx = pathParts.indexOf('instances');
        if (constructIdx >= 0 && pathParts.length > constructIdx + 2) {
          source = pathParts[constructIdx + 2];
          // Check for year/month in subsequent parts
          const months = ['january', 'february', 'march', 'april', 'may', 'june',
                          'july', 'august', 'september', 'october', 'november', 'december'];
          for (let i = constructIdx + 3; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (/^\d{4}$/.test(part) && !year) {
              year = part;
            } else if (months.includes(part.toLowerCase()) && !month) {
              month = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            }
          }
        }
      }
      
      return {
        name: f.metadata?.originalName || f.filename.split('/').pop(),
        type: f.metadata?.type || 'unknown',
        source: source || 'unknown',
        year: year || null,
        month: month || null,
        uploadedAt: f.metadata?.uploadedAt || f.created_at,
        filename: f.filename,
      };
    });
    
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
    
    res.json({ success: true, transcripts, bySource, byTimeline });
  } catch (error) {
    console.error('❌ [Transcripts] List error:', error);
    res.status(500).json({ success: false, error: error.message });
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
