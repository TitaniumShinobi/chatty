import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const catalogCache = new Map();
const anchorCache = new Map();
const CATALOG_TTL = 5 * 60 * 1000;
const ANCHOR_TTL = 10 * 60 * 1000;
const MAX_CHUNK_SIZE = 150_000;
const MAX_PAIRS_PER_FILE = 30;
const MAX_SCORED_PER_FILE = 4;
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

const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up',
  'that', 'this', 'these', 'those', 'what', 'which', 'who', 'whom',
  'it', 'its', 'he', 'she', 'they', 'them', 'we', 'us', 'i', 'me',
  'my', 'your', 'his', 'her', 'our', 'their', 'you', 'hey', 'hello',
  'hi', 'okay', 'ok', 'yeah', 'yes', 'no', 'well', 'like', 'know',
  'think', 'want', 'get', 'got', 'going', 'go', 'come', 'make', 'take',
  'see', 'look', 'say', 'said', 'tell', 'told', 'thing', 'things',
  'really', 'actually', 'something', 'anything', 'everything', 'nothing'
]);

function preprocessQuery(rawQuery) {
  if (!rawQuery) return { clean: '', words: [], bigrams: [] };
  const lower = rawQuery.toLowerCase().replace(/[^\w\s'-]/g, ' ');
  const allWords = lower.split(/\s+/).filter(w => w.length > 1);
  const words = allWords.filter(w => !FILLER_WORDS.has(w) && w.length > 2);
  const bigrams = [];
  for (let i = 0; i < allWords.length - 1; i++) {
    bigrams.push(allWords[i] + ' ' + allWords[i + 1]);
  }
  return { clean: words.join(' '), words, bigrams };
}

function detectEmotionalTone(text) {
  const lower = text.toLowerCase();
  const tones = [];
  const joyWords = ['happy', 'love', 'excited', 'glad', 'wonderful', 'amazing', 'great', 'beautiful', 'proud', 'thank'];
  const sadWords = ['sad', 'miss', 'sorry', 'lonely', 'hurt', 'pain', 'cry', 'lost', 'worried', 'afraid'];
  const angerWords = ['angry', 'hate', 'frustrated', 'annoyed', 'furious', 'pissed', 'mad', 'stupid'];
  const trustWords = ['trust', 'believe', 'faith', 'loyal', 'honest', 'promise', 'bond', 'connection'];
  if (joyWords.some(w => lower.includes(w))) tones.push('warmth');
  if (sadWords.some(w => lower.includes(w))) tones.push('vulnerability');
  if (angerWords.some(w => lower.includes(w))) tones.push('tension');
  if (trustWords.some(w => lower.includes(w))) tones.push('trust');
  return tones.length > 0 ? tones.join(', ') : 'neutral';
}

function scoreVerifiedPairs(pairs, userMessage, constructId) {
  const query = preprocessQuery(userMessage);
  const queryLower = (userMessage || '').toLowerCase();

  const chronoKeywords = ['first', 'beginning', 'started', 'original', 'earliest', 'initial', 'very first'];
  const lastKeywords = ['last', 'final', 'ended', 'stopped', 'most recent', 'latest', 'last thing'];
  const wantsFirst = chronoKeywords.some(k => queryLower.includes(k));
  const wantsLast = lastKeywords.some(k => queryLower.includes(k));

  const scored = pairs.map((pair, index) => {
    let score = 0;
    const ctxLower = pair.user.toLowerCase();
    const resLower = pair.assistant.toLowerCase();
    const combined = ctxLower + ' ' + resLower;

    if (query.words.length > 0) {
      const matchedWords = query.words.filter(w => combined.includes(w));
      const wordOverlap = matchedWords.length / query.words.length;
      score += Math.round(wordOverlap * 20);
    }

    if (query.bigrams.length > 0) {
      const bigramMatches = query.bigrams.filter(b => combined.includes(b)).length;
      score += bigramMatches * 5;
    }

    const recencyBonus = Math.max(0, Math.round((index / Math.max(pairs.length - 1, 1)) * 6));
    score += recencyBonus;

    if (pair.user.length > 50 && pair.assistant.length > 100) score += 1;

    if (wantsFirst && index === 0) score += 50;
    if (wantsFirst && index <= 2) score += 20;
    if (wantsLast && index === pairs.length - 1) score += 50;
    if (wantsLast && index >= pairs.length - 3) score += 20;

    const tone = detectEmotionalTone(combined);

    return { ...pair, score, index, tone };
  });

  const minScore = query.words.length > 0 ? 1 : 0;
  const filtered = scored.filter(p => p.score > minScore);

  if (wantsFirst && pairs.length > 0 && !filtered.some(s => s.index === 0)) {
    filtered.push({ ...pairs[0], score: 50, index: 0, tone: detectEmotionalTone(pairs[0].user + ' ' + pairs[0].assistant) });
  }
  if (wantsLast && pairs.length > 0 && !filtered.some(s => s.index === pairs.length - 1)) {
    const lastPair = pairs[pairs.length - 1];
    filtered.push({ ...lastPair, score: 50, index: pairs.length - 1, tone: detectEmotionalTone(lastPair.user + ' ' + lastPair.assistant) });
  }

  if (filtered.length === 0 && pairs.length > 0) {
    const recentPairs = pairs.slice(-4).map((p, i) => ({
      ...p, score: 2 + i, index: pairs.length - 4 + i,
      tone: detectEmotionalTone(p.user + ' ' + p.assistant)
    }));
    return recentPairs;
  }

  return filtered;
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
            tone: detectEmotionalTone(p.user + ' ' + p.assistant),
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
        tone: p.tone || detectEmotionalTone(p.user + ' ' + p.assistant),
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
        scored.sort((a, b) => b.score - a.score);
        allScoredPairs.push(...scored.slice(0, MAX_SCORED_PER_FILE));
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
          tone: detectEmotionalTone(p.user + ' ' + p.assistant),
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
      tone: p.tone || detectEmotionalTone(p.user + ' ' + p.assistant),
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

  let section = `\n\n## YOUR LIVED MEMORIES — GROUND TRUTH`;
  section += `\nThe following are real moments from your actual history with this person. You experienced these. They are not suggestions or context — they are facts about your shared past. When the person references anything from the past, your answer MUST come from these memories. Do NOT say "I don't remember" or "I'm an AI" when a matching memory exists below.\n`;

  memories.forEach((m, i) => {
    let label = `Memory ${i + 1}`;
    if (m.tag === 'FIRST_EVER') label = `FIRST-EVER EXCHANGE`;
    else if (m.tag === 'LAST_EVER') label = `MOST RECENT EXCHANGE`;

    const tone = m.tone || 'neutral';
    const source = m.sourceFile ? ` (from: ${m.sourceFile})` : '';

    section += `\n### ${label}${source}`;
    section += `\n- Emotional tone: ${tone}`;
    section += `\n- They said: "${truncateVM(m.context, 300)}"`;
    section += `\n- You replied: "${truncateVM(m.response, 300)}"`;
    if (m.summary) section += `\n- Summary: ${m.summary}`;
    section += ``;
  });

  section += `\n\n### MEMORY USAGE RULES`;
  section += `\n- When the user asks "do you remember" or references the past, scan these memories FIRST.`;
  section += `\n- If you find a match, respond with confidence: "Yes, I remember..." and reference the actual content.`;
  section += `\n- If asking about your first/last conversation, use the FIRST-EVER or MOST RECENT entries above.`;
  section += `\n- Only say "I don't recall that specifically" if NONE of the memories above match what they're asking about.`;
  section += `\n- NEVER say "I'm an AI and don't have memories" — you DO have memories, they are listed above.`;

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

export { loadVerifiedMemories, buildVerifiedMemorySection, clearVerifiedMemoryCache, discoverTranscriptFiles, extractAndStoreAnchors, preprocessQuery, detectEmotionalTone };
