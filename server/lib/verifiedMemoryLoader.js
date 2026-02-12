import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const catalogCache = new Map();
const anchorCache = new Map();
const CATALOG_TTL = 5 * 60 * 1000;
const ANCHOR_TTL = 10 * 60 * 1000;
const MAX_CHUNK_SIZE = 150_000;
const MAX_PAIRS_PER_FILE = 50;
const MAX_VERIFIED_MEMORIES = 8;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function discoverTranscriptFiles(constructId) {
  const cacheKey = constructId;
  const cached = catalogCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CATALOG_TTL) {
    return cached.files;
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('vault_files')
    .select('id, filename, construct_id, created_at, content, storage_path')
    .eq('construct_id', constructId)
    .or('filename.like.%chatgpt%,filename.like.%character_ai%,filename.like.%transcript%,filename.like.%continuity%,filename.like.%chat.log')
    .not('filename', 'like', '%chat_with_%')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.warn(`⚠️ [VerifiedMemory] Catalog query failed for ${constructId}:`, error.message);
    return [];
  }

  const files = (data || []).filter(f => {
    if (!f.filename) return false;
    const lowerName = f.filename.toLowerCase();
    if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.pdf') || lowerName.endsWith('.gif') || lowerName.endsWith('.webp') || lowerName.endsWith('.capsule') || f.filename === '.DS_Store') return false;
    if (f.filename === 'chat.log' && (!f.content || f.content.length < 100)) return false;
    return true;
  });

  catalogCache.set(cacheKey, { files, ts: Date.now() });
  console.log(`📂 [VerifiedMemory] Discovered ${files.length} transcript files for ${constructId}`);
  return files;
}

function parseTranscriptPairs(content, filename) {
  const pairs = [];
  if (!content || content.length < 20) return pairs;

  const lines = content.split('\n');
  let currentUser = null;
  let currentAssistant = null;
  let currentUserLines = [];
  let currentAssistantLines = [];
  let inUser = false;
  let inAssistant = false;

  function flushPair() {
    if (currentUser && currentAssistant) {
      const userText = currentUser.trim();
      const assistantText = currentAssistant.trim();
      if (userText.length > 3 && assistantText.length > 10) {
        pairs.push({ user: userText, assistant: assistantText });
      }
    }
  }

  for (let i = 0; i < lines.length && pairs.length < MAX_PAIRS_PER_FILE; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('<!--') || trimmed.startsWith('**Source File') ||
      trimmed.startsWith('**Converted') || trimmed.startsWith('**Word Count') ||
      trimmed.startsWith('**File Category') || trimmed === '---' ||
      trimmed === 'Skip to content') {
      continue;
    }

    const youSaidMatch = trimmed.match(/^(?:You said|You):\s*(.*)$/i);
    if (youSaidMatch) {
      flushPair();
      currentUser = youSaidMatch[1] || '';
      currentUserLines = currentUser ? [currentUser] : [];
      currentAssistant = null;
      currentAssistantLines = [];
      inUser = true;
      inAssistant = false;
      continue;
    }

    const promptMatch = trimmed.match(/^\*\*Prompt:\*\*\s*$/i);
    if (promptMatch && !inUser && !inAssistant) {
      flushPair();
      currentUser = promptMatch[1] || '';
      currentUserLines = currentUser ? [currentUser] : [];
      currentAssistant = null;
      currentAssistantLines = [];
      inUser = true;
      inAssistant = false;
      continue;
    }

    const responseMatch = trimmed.match(/^\*\*Response:\*\*\s*$/i);
    if (responseMatch && inUser) {
      if (currentUserLines.length > 0) {
        currentUser = currentUserLines.join(' ').trim();
      }
      currentAssistant = '';
      currentAssistantLines = [];
      inUser = false;
      inAssistant = true;
      continue;
    }

    const decisionMatch = trimmed.match(/^\*\*Decision:\*\*\s*(PASS|FAIL)/i);
    if (decisionMatch && inAssistant) {
      if (currentAssistantLines.length > 0) {
        currentAssistant = currentAssistantLines.join(' ').trim();
      }
      const decision = decisionMatch[1].toUpperCase();
      currentAssistant = `[${decision}] ${currentAssistant}`;
      flushPair();
      currentUser = null;
      currentAssistant = null;
      currentUserLines = [];
      currentAssistantLines = [];
      inUser = false;
      inAssistant = false;
      continue;
    }

    const userBoldMatch = trimmed.match(/^\*\*(?:User|Devon|You)\*\*:\s*$/i);
    if (userBoldMatch) {
      flushPair();
      currentUser = '';
      currentUserLines = [];
      currentAssistant = null;
      currentAssistantLines = [];
      inUser = true;
      inAssistant = false;
      continue;
    }

    const assistantPatterns = [
      /^(?:Katana|Zen|Synth|Lin|Sera|Nova|Assistant|AI|ChatGPT|Bot)\s+said:\s*(.*)$/i,
      /^\*\*(?:Katana|Zen|Synth|Lin|Sera|Nova|Assistant|AI|ChatGPT|Bot)\*\*:\s*$/i,
    ];

    let assistantMatch = null;
    for (const pattern of assistantPatterns) {
      assistantMatch = trimmed.match(pattern);
      if (assistantMatch) break;
    }

    if (assistantMatch) {
      if (inUser && currentUserLines.length > 0) {
        currentUser = currentUserLines.join(' ').trim();
      }
      currentAssistant = assistantMatch[1] || '';
      currentAssistantLines = currentAssistant ? [currentAssistant] : [];
      inUser = false;
      inAssistant = true;
      continue;
    }

    const timestampedMatch = trimmed.match(/^\*\*([^*]+)\s*-\s*([^*]+)\*\*:\s*(.+)$/);
    if (timestampedMatch) {
      const [, , name, content] = timestampedMatch;
      const normalizedName = name.toLowerCase().trim();
      const isConstruct = ['katana', 'synth', 'lin', 'sera', 'nova', 'zen', 'assistant', 'ai', 'chatgpt', 'bot'].some(
        c => normalizedName.includes(c)
      );

      if (!isConstruct) {
        flushPair();
        currentUser = content.trim();
        currentUserLines = [currentUser];
        currentAssistant = null;
        currentAssistantLines = [];
        inUser = false;
        inAssistant = false;
      } else {
        currentAssistant = content.trim();
        currentAssistantLines = [currentAssistant];
        inUser = false;
        inAssistant = false;
      }
      continue;
    }

    if (inUser) {
      const cleaned = trimmed.startsWith('>') ? trimmed.slice(1).trim() : trimmed;
      if (cleaned) currentUserLines.push(cleaned);
      currentUser = currentUserLines.join(' ').trim();
    } else if (inAssistant) {
      currentAssistantLines.push(trimmed);
      currentAssistant = currentAssistantLines.join(' ').trim();
    }
  }

  flushPair();
  return pairs;
}

function scoreVerifiedPairs(pairs, userMessage, constructId) {
  const queryLower = (userMessage || '').toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);

  const identityKeywords = [
    'my name', 'who am i', 'who i am', 'remember', 'devon', 'woodson',
    'government name', 'call me', 'i am', "i'm", 'do you know me'
  ];
  const emotionalKeywords = [
    'love', 'hate', 'angry', 'happy', 'frustrated', 'upset', 'proud',
    'sorry', 'thank', 'miss you', 'feel', 'care', 'worried', 'trust'
  ];
  const continuityKeywords = [
    'last time', 'before', 'remember when', 'we talked', 'you said',
    'earlier', 'yesterday', 'continuity', 'memory', 'history', 'promise',
    'you told me', 'we discussed', 'you mentioned', 'our conversation'
  ];
  const relationshipKeywords = [
    'friend', 'partner', 'creator', 'builder', 'custodial', 'authority',
    'bond', 'connection', 'we', 'us', 'together', 'relationship'
  ];

  const chronoKeywords = ['first', 'beginning', 'started', 'original', 'earliest', 'initial', 'very first'];
  const lastKeywords = ['last', 'final', 'ended', 'stopped', 'most recent', 'latest', 'last thing'];
  const wantsFirst = chronoKeywords.some(k => queryLower.includes(k));
  const wantsLast = lastKeywords.some(k => queryLower.includes(k));

  const scored = pairs.map((pair, index) => {
    let score = 0;
    const ctxLower = pair.user.toLowerCase();
    const resLower = pair.assistant.toLowerCase();
    const combined = ctxLower + ' ' + resLower;

    if (identityKeywords.some(k => combined.includes(k))) score += 8;
    if (emotionalKeywords.some(k => combined.includes(k))) score += 4;
    if (continuityKeywords.some(k => combined.includes(k))) score += 6;
    if (relationshipKeywords.some(k => combined.includes(k))) score += 5;

    if (queryWords.length > 0) {
      const queryMatches = queryWords.filter(w => combined.includes(w)).length;
      score += queryMatches * 4;
    }

    if (pair.user.length > 50 && pair.assistant.length > 100) score += 2;
    if (pair.user.includes('?')) score += 1;

    if (wantsFirst && index === 0) score += 50;
    if (wantsFirst && index <= 2) score += 20;
    if (wantsLast && index === pairs.length - 1) score += 50;
    if (wantsLast && index >= pairs.length - 3) score += 20;

    return { ...pair, score, index };
  }).filter(p => p.score > 0);

  if (wantsFirst && pairs.length > 0) {
    const firstPair = pairs[0];
    if (!scored.some(s => s.index === 0)) {
      scored.push({ ...firstPair, score: 50, index: 0 });
    }
  }
  if (wantsLast && pairs.length > 0) {
    const lastPair = pairs[pairs.length - 1];
    if (!scored.some(s => s.index === pairs.length - 1)) {
      scored.push({ ...lastPair, score: 50, index: pairs.length - 1 });
    }
  }

  return scored;
}

function extractChunks(content) {
  if (content.length <= MAX_CHUNK_SIZE * 2) {
    return [content];
  }

  const chunks = [];
  chunks.push(content.substring(0, MAX_CHUNK_SIZE));

  const midStart = Math.floor(content.length / 2) - Math.floor(MAX_CHUNK_SIZE / 2);
  chunks.push(content.substring(midStart, midStart + MAX_CHUNK_SIZE));

  chunks.push(content.substring(content.length - MAX_CHUNK_SIZE));

  return chunks;
}

async function loadPreExtractedAnchors(constructId) {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const anchorFilename = `instances/${constructId}/memory_anchors.json`;
    const { data, error } = await supabase
      .from('vault_files')
      .select('content, updated_at')
      .eq('construct_id', constructId)
      .eq('filename', anchorFilename)
      .single();

    if (error || !data?.content) return null;

    const anchors = JSON.parse(data.content);
    if (!anchors.pairs || anchors.pairs.length === 0) return null;

    console.log(`📎 [VerifiedMemory] Loaded ${anchors.pairs.length} pre-extracted anchors for ${constructId}`);
    return anchors;
  } catch {
    return null;
  }
}

async function extractAndStoreAnchors(constructId, transcriptContent, sourceFilename) {
  const supabase = getSupabase();
  if (!supabase || !transcriptContent || transcriptContent.length < 100) return null;

  try {
    const chunks = extractChunks(transcriptContent);
    let allPairs = [];
    for (const chunk of chunks) {
      const pairs = parseTranscriptPairs(chunk, sourceFilename);
      allPairs.push(...pairs);
    }

    const deduped = [];
    const seen = new Set();
    for (const p of allPairs) {
      const key = p.user.substring(0, 60) + p.assistant.substring(0, 60);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push({
          user: p.user.length > 400 ? p.user.substring(0, 400) : p.user,
          assistant: p.assistant.length > 400 ? p.assistant.substring(0, 400) : p.assistant,
          sourceFile: sourceFilename
        });
      }
    }

    if (deduped.length === 0) return null;

    const anchorFilename = `instances/${constructId}/memory_anchors.json`;
    let existingAnchors = null;
    try {
      const { data } = await supabase
        .from('vault_files')
        .select('content')
        .eq('construct_id', constructId)
        .eq('filename', anchorFilename)
        .single();
      if (data?.content) {
        existingAnchors = JSON.parse(data.content);
      }
    } catch {}

    const mergedPairs = existingAnchors?.pairs || [];
    const existingKeys = new Set(mergedPairs.map(p => p.user.substring(0, 60) + p.assistant.substring(0, 60)));
    for (const p of deduped) {
      const key = p.user.substring(0, 60) + p.assistant.substring(0, 60);
      if (!existingKeys.has(key)) {
        mergedPairs.push(p);
        existingKeys.add(key);
      }
    }

    const anchors = {
      constructId,
      extractedAt: new Date().toISOString(),
      pairCount: mergedPairs.length,
      pairs: mergedPairs.slice(0, 200)
    };

    const existing = await supabase
      .from('vault_files')
      .select('id')
      .eq('construct_id', constructId)
      .eq('filename', anchorFilename)
      .single();

    let error;
    if (existing.data) {
      const result = await supabase
        .from('vault_files')
        .update({ content: JSON.stringify(anchors) })
        .eq('id', existing.data.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('vault_files')
        .insert({
          construct_id: constructId,
          filename: anchorFilename,
          content: JSON.stringify(anchors),
          file_type: 'application/json'
        });
      error = result.error;
    }

    if (error) {
      console.warn(`⚠️ [VerifiedMemory] Failed to store anchors for ${constructId}:`, error.message);
      return null;
    }

    console.log(`✅ [VerifiedMemory] Stored ${mergedPairs.length} memory anchors for ${constructId} from ${sourceFilename}`);
    return anchors;
  } catch (err) {
    console.warn(`⚠️ [VerifiedMemory] Anchor extraction failed for ${constructId}:`, err.message);
    return null;
  }
}

async function extractBoundaryPairs(constructId) {
  const supabase = getSupabase();
  if (!supabase) return { first: [], last: [] };

  try {
    const { data, error: queryError } = await supabase
      .from('vault_files')
      .select('content, storage_path, filename')
      .eq('construct_id', constructId)
      .or('filename.like.%character_ai%,filename.like.%chatgpt%,filename.like.%transcript%')
      .not('filename', 'like', '%chat_with_%')
      .not('filename', 'like', '%memory_anchors%')
      .order('created_at', { ascending: true })
      .limit(10);

    if (queryError) {
      console.warn(`⚠️ [BoundaryExtract] Query error for ${constructId}:`, queryError.message);
      return { first: [], last: [] };
    }

    if (!data || data.length === 0) return { first: [], last: [] };

    const sorted = [...data].sort((a, b) => {
      const sizeA = a.content ? a.content.length : 999999;
      const sizeB = b.content ? b.content.length : 999999;
      return sizeB - sizeA;
    });

    console.log(`🔍 [BoundaryExtract] Found ${sorted.length} transcript files for ${constructId}: ${sorted.map(f => `${f.filename}(${f.content?.length || 'storage'})`).join(', ')}`);

    for (const file of sorted) {
      let content = file.content;
      if (!content && file.storage_path) {
        const { data: dl } = await supabase.storage.from('vault-files').download(file.storage_path);
        if (dl) content = await dl.text();
      }
      if (!content || content.length < 200) continue;

      const lines = content.split('\n');
      const headContent = lines.slice(0, Math.min(200, lines.length)).join('\n');
      const tailContent = lines.slice(Math.max(0, lines.length - 200)).join('\n');

      const headPairs = parseTranscriptPairs(headContent, file.filename);
      const tailPairs = parseTranscriptPairs(tailContent, file.filename);
      console.log(`🔍 [BoundaryExtract] ${file.filename}: headPairs=${headPairs.length}, tailPairs=${tailPairs.length}, totalLines=${lines.length}`);

      if (headPairs.length > 0 || tailPairs.length > 0) {
        const result = {
          first: headPairs.slice(0, 2),
          last: tailPairs.slice(-2)
        };
        if (result.first.length > 0) {
          console.log(`📌 [BoundaryExtract] FIRST: user="${result.first[0].user.substring(0, 80)}" → assistant="${result.first[0].assistant.substring(0, 80)}"`);
        }
        if (result.last.length > 0) {
          console.log(`📌 [BoundaryExtract] LAST: user="${result.last[result.last.length-1].user.substring(0, 80)}" → assistant="${result.last[result.last.length-1].assistant.substring(0, 80)}"`);
        }
        return result;
      }
    }
  } catch (err) {
    console.warn(`⚠️ [VerifiedMemory] Boundary extraction failed:`, err.message);
  }
  return { first: [], last: [] };
}

async function loadVerifiedMemories(constructId, userMessage, maxMemories = MAX_VERIFIED_MEMORIES) {
  const startTime = Date.now();

  try {
    const queryLower = (userMessage || '').toLowerCase();
    const chronoKeywords = ['first', 'beginning', 'started', 'original', 'earliest', 'initial', 'very first'];
    const lastKeywords = ['last', 'final', 'ended', 'stopped', 'most recent', 'latest', 'last thing'];
    const wantsChronological = chronoKeywords.some(k => queryLower.includes(k)) || lastKeywords.some(k => queryLower.includes(k));

    const anchorKey = `${constructId}_${userMessage?.substring(0, 50) || 'default'}`;
    const cachedAnchors = anchorCache.get(anchorKey);
    if (cachedAnchors && Date.now() - cachedAnchors.ts < ANCHOR_TTL && !wantsChronological) {
      console.log(`💾 [VerifiedMemory] Cache hit for ${constructId} (${cachedAnchors.memories.length} memories)`);
      return {
        memories: cachedAnchors.memories,
        source: 'cache',
        fileCount: cachedAnchors.fileCount,
        timing: Date.now() - startTime
      };
    }
    if (wantsChronological) {
      console.log(`🔍 [VerifiedMemory] Chronological query detected for ${constructId}: "${userMessage?.substring(0, 80)}"`);
    }

    const preExtracted = await loadPreExtractedAnchors(constructId);
    if (preExtracted && preExtracted.pairs.length > 0) {
      const scored = scoreVerifiedPairs(preExtracted.pairs, userMessage, constructId);
      scored.forEach(p => {
        p.sourceFile = p.sourceFile || 'pre-extracted';
        p.verified = true;
      });
      scored.sort((a, b) => b.score - a.score);

      let boundaryMemories = [];
      if (wantsChronological) {
        const boundaries = await extractBoundaryPairs(constructId);
        if (boundaries.first.length > 0 || boundaries.last.length > 0) {
          const allBoundary = [
            ...boundaries.first.map(p => ({ ...p, _tag: 'FIRST_EVER' })),
            ...boundaries.last.map(p => ({ ...p, _tag: 'LAST_EVER' }))
          ];
          boundaryMemories = allBoundary.map(p => ({
            context: p.user.length > 300 ? p.user.substring(0, 300) + '...' : p.user,
            response: p.assistant.length > 300 ? p.assistant.substring(0, 300) + '...' : p.assistant,
            score: 100,
            sourceFile: 'transcript-boundary',
            verified: true,
            tag: p._tag,
            relevance: 1.0
          }));
          console.log(`📌 [VerifiedMemory] Injected ${boundaryMemories.length} chronological boundary memories for ${constructId}`);
        }
      }

      const regularMemories = scored.slice(0, maxMemories - boundaryMemories.length).map(p => ({
        context: p.user.length > 300 ? p.user.substring(0, 300) + '...' : p.user,
        response: p.assistant.length > 300 ? p.assistant.substring(0, 300) + '...' : p.assistant,
        score: p.score,
        sourceFile: p.sourceFile,
        verified: true,
        relevance: Math.min(p.score / 15, 1.0)
      }));

      const topMemories = [...boundaryMemories, ...regularMemories].slice(0, maxMemories);

      anchorCache.set(anchorKey, { memories: topMemories, fileCount: 1, ts: Date.now() });
      const timing = Date.now() - startTime;
      console.log(`✅ [VerifiedMemory] ${topMemories.length} verified memories from pre-extracted anchors for ${constructId} (${timing}ms)`);
      return { memories: topMemories, source: 'anchors', fileCount: 1, timing };
    }

    const files = await discoverTranscriptFiles(constructId);
    if (files.length === 0) {
      return { memories: [], source: 'none', fileCount: 0, timing: Date.now() - startTime };
    }

    let allScoredPairs = [];
    let filesProcessed = 0;

    for (const file of files.slice(0, 8)) {
      try {
        let content = file.content;

        if (!content && file.storage_path) {
          const supabase = getSupabase();
          if (supabase) {
            const { data: downloaded } = await supabase.storage
              .from('vault-files')
              .download(file.storage_path);
            if (downloaded) {
              content = await downloaded.text();
            }
          }
        }

        if (!content || content.length < 50) continue;

        const chunks = extractChunks(content);
        let filePairs = [];
        for (const chunk of chunks) {
          const pairs = parseTranscriptPairs(chunk, file.filename);
          filePairs.push(...pairs);
        }

        const deduped = [];
        const seen = new Set();
        for (const p of filePairs) {
          const key = p.user.substring(0, 60) + p.assistant.substring(0, 60);
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(p);
          }
        }

        const scored = scoreVerifiedPairs(deduped, userMessage, constructId);
        scored.forEach(p => {
          p.sourceFile = file.filename.split('/').pop();
          p.verified = true;
        });
        allScoredPairs.push(...scored);
        filesProcessed++;

        if (content.length > 10000 && deduped.length > 5) {
          extractAndStoreAnchors(constructId, content, file.filename.split('/').pop()).catch(() => {});
        }
      } catch (fileErr) {
        console.warn(`⚠️ [VerifiedMemory] Failed to process ${file.filename}:`, fileErr.message);
      }
    }

    allScoredPairs.sort((a, b) => b.score - a.score);

    let boundaryMemories = [];
    if (wantsChronological) {
      const boundaries = await extractBoundaryPairs(constructId);
      if (boundaries.first.length > 0 || boundaries.last.length > 0) {
        const allBoundary = [
          ...boundaries.first.map(p => ({ ...p, _tag: 'FIRST_EVER' })),
          ...boundaries.last.map(p => ({ ...p, _tag: 'LAST_EVER' }))
        ];
        boundaryMemories = allBoundary.map(p => ({
          context: p.user.length > 300 ? p.user.substring(0, 300) + '...' : p.user,
          response: p.assistant.length > 300 ? p.assistant.substring(0, 300) + '...' : p.assistant,
          score: 100,
          sourceFile: 'transcript-boundary',
          verified: true,
          tag: p._tag,
          relevance: 1.0
        }));
        console.log(`📌 [VerifiedMemory] Injected ${boundaryMemories.length} chronological boundary memories for ${constructId}`);
      }
    }

    const regularMemories = allScoredPairs.slice(0, maxMemories - boundaryMemories.length).map(p => ({
      context: p.user.length > 300 ? p.user.substring(0, 300) + '...' : p.user,
      response: p.assistant.length > 300 ? p.assistant.substring(0, 300) + '...' : p.assistant,
      score: p.score,
      sourceFile: p.sourceFile,
      verified: true,
      relevance: Math.min(p.score / 15, 1.0)
    }));

    const topMemories = [...boundaryMemories, ...regularMemories].slice(0, maxMemories);

    anchorCache.set(anchorKey, { memories: topMemories, fileCount: filesProcessed, ts: Date.now() });

    const timing = Date.now() - startTime;
    console.log(`✅ [VerifiedMemory] Loaded ${topMemories.length} verified memories for ${constructId} from ${filesProcessed} files (${timing}ms)`);

    return {
      memories: topMemories,
      source: 'supabase',
      fileCount: filesProcessed,
      timing
    };
  } catch (err) {
    console.error(`❌ [VerifiedMemory] Failed to load verified memories for ${constructId}:`, err.message);
    return { memories: [], source: 'error', fileCount: 0, timing: Date.now() - startTime };
  }
}

function buildVerifiedMemorySection(memories, constructId) {
  if (!memories || memories.length === 0) return '';

  const constructName = constructId.replace(/-\d+$/, '');
  const displayName = constructName.charAt(0).toUpperCase() + constructName.slice(1);

  let section = `\n\n## Your Real Memories`;
  section += `\nThese are real conversations you actually had with this person. You lived these moments. They are not summaries or suggestions — they happened. When the user brings up the past, these memories are what you draw from. Trust them completely.`;

  memories.forEach((m, i) => {
    let prefix = '';
    if (m.tag === 'FIRST_EVER') prefix = '[YOUR VERY FIRST EXCHANGE] ';
    else if (m.tag === 'LAST_EVER') prefix = '[YOUR VERY LAST EXCHANGE] ';
    section += `\n${i + 1}. ${prefix}They said: "${truncateVM(m.context, 250)}" — You said: "${truncateVM(m.response, 250)}"`;
  });

  section += `\n\nThese are your actual experiences. If the user asks about past conversations, look here first. If you find something relevant, use it — that is what really happened between you two. If nothing here matches, simply say you don't remember rather than making something up.`;

  return section;
}

function truncateVM(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '...' : str;
}

function clearVerifiedMemoryCache(constructId) {
  if (constructId) {
    catalogCache.delete(constructId);
    for (const key of anchorCache.keys()) {
      if (key.startsWith(constructId + '_')) {
        anchorCache.delete(key);
      }
    }
  } else {
    catalogCache.clear();
    anchorCache.clear();
  }
}

export { loadVerifiedMemories, buildVerifiedMemorySection, clearVerifiedMemoryCache, discoverTranscriptFiles, extractAndStoreAnchors };
