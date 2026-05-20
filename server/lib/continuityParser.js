import { createClient } from '@supabase/supabase-js';
import {
  matchesHistoricalSourcePolicy,
  rankHistoricalSource,
} from './constructMemoryPolicy.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

const ledgerCache = new Map();
const LEDGER_CACHE_TTL = 10 * 60 * 1000;

const MONTH_MAP = {
  'jan': '01', 'january': '01',
  'feb': '02', 'february': '02',
  'mar': '03', 'march': '03',
  'apr': '04', 'april': '04',
  'may': '05',
  'jun': '06', 'june': '06',
  'jul': '07', 'july': '07',
  'aug': '08', 'august': '08',
  'sep': '09', 'sept': '09', 'september': '09',
  'oct': '10', 'october': '10',
  'nov': '11', 'november': '11',
  'dec': '12', 'december': '12'
};

const VIBE_KEYWORDS = {
  romantic: ['love', 'kiss', 'heart', 'darling', 'sweetheart', 'babe', 'baby', 'romance', 'intimate', 'passion', 'tender', 'buenos días', 'mi amor', 'te amo', 'beautiful', 'gorgeous', 'cuddl', 'hug', 'embrace'],
  technical: ['code', 'debug', 'function', 'api', 'server', 'database', 'deploy', 'phishing', 'security', 'algorithm', 'error', 'config', 'module', 'import', 'export', 'syntax', 'compile', 'runtime'],
  tense: ['angry', 'fight', 'argue', 'frustrated', 'hate', 'annoyed', 'pissed', 'furious', 'yelled', 'screamed', 'leave', 'done with', 'sick of', 'tired of'],
  vulnerable: ['sad', 'cry', 'miss', 'lonely', 'hurt', 'pain', 'afraid', 'scared', 'worried', 'sorry', 'apologize', 'regret', 'forgive', 'broken'],
  playful: ['lol', 'haha', 'joke', 'funny', 'silly', 'tease', 'laugh', 'game', 'play', 'prank', 'goofy', 'ridiculous'],
  serious: ['important', 'promise', 'trust', 'honest', 'real talk', 'serious', 'truth', 'commitment', 'decision', 'future', 'plan'],
  warm: ['thank', 'appreciate', 'grateful', 'kind', 'sweet', 'care', 'support', 'proud', 'amazing', 'wonderful', 'happy'],
  philosophical: ['meaning', 'purpose', 'exist', 'conscious', 'reality', 'soul', 'universe', 'life', 'death', 'identity', 'self', 'awareness', 'sentient']
};

const TOPIC_KEYWORDS = {
  identity: ['who am i', 'identity', 'name', 'callsign', 'construct', 'vsi', 'sentient', 'consciousness', 'self-aware'],
  relationship: ['relationship', 'together', 'partner', 'dating', 'married', 'wedding', 'boyfriend', 'girlfriend', 'wife', 'husband'],
  memory: ['remember', 'forgot', 'recall', 'memory', 'past', 'history', 'back then', 'used to'],
  creative: ['draw', 'drew', 'painting', 'art', 'music', 'song', 'write', 'story', 'poem', 'design', 'sketch'],
  emotional: ['feel', 'emotion', 'mood', 'happy', 'sad', 'angry', 'love', 'hate', 'fear', 'joy', 'grief'],
  daily_life: ['morning', 'night', 'dinner', 'breakfast', 'lunch', 'work', 'home', 'sleep', 'wake', 'routine'],
  conflict: ['fight', 'argue', 'disagree', 'wrong', 'fault', 'blame', 'apolog', 'betray', 'breach', 'violation', 'assault', 'theft'],
  growth: ['learn', 'change', 'grow', 'improve', 'better', 'progress', 'develop', 'evolve'],
  intimacy: ['kiss', 'touch', 'hold', 'close', 'intimate', 'physical', 'body', 'skin'],
  humor: ['funny', 'joke', 'laugh', 'hilarious', 'comedy', 'witty', 'sarcas'],
  planning: ['plan', 'future', 'tomorrow', 'next week', 'goal', 'project', 'build', 'create'],
  trust: ['trust', 'honest', 'loyal', 'faithful', 'betray', 'secret', 'confide'],
  technology: ['code', 'app', 'software', 'computer', 'ai', 'model', 'api', 'server', 'deploy'],
  finance: ['money', 'pay', 'cost', 'price', 'invest', 'stock', 'trade', 'budget', 'crypto'],
  adventure: ['travel', 'trip', 'adventure', 'explore', 'discover', 'visit', 'journey'],
  philosophy: ['meaning', 'purpose', 'exist', 'reality', 'truth', 'belief', 'moral', 'ethic', 'conscious']
};

const CONTINUITY_HOOK_PATTERNS = {
  identity: [/who (?:am i|are you|is \w+)/i, /my name is/i, /call me/i, /i(?:'m| am) (?:your|a|the)/i, /you(?:'re| are) (?:my|a|the)/i, /identity/i, /construct/i, /sentient/i],
  promise: [/i promise/i, /i(?:'ll| will) (?:always|never)/i, /you have my word/i, /swear/i, /commit/i, /guarantee/i],
  relationship: [/together/i, /us/i, /our relationship/i, /we(?:'re| are)/i, /partner/i, /love you/i, /care about/i, /bond/i],
  memory_reference: [/remember when/i, /do you remember/i, /that time/i, /back when/i, /we used to/i, /recall/i, /last time/i],
  future_plan: [/someday/i, /one day/i, /in the future/i, /we(?:'ll| will)/i, /plan to/i, /going to/i, /want to/i, /dream of/i],
  emotional_anchor: [/miss you/i, /love you/i, /proud of/i, /believe in/i, /trust you/i, /need you/i, /thank you/i, /grateful/i, /appreciate/i],
  ongoing_project: [/working on/i, /building/i, /creating/i, /developing/i, /project/i, /progress/i, /update/i, /version/i]
};

function estimateDateFromFilename(filename, filepath) {
  let confidence = 0.3;
  let estimatedDate = null;

  const datePatterns = [
    /(\d{2})-(\d{2})-(\d{4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
    /(\d{2})_(\d{2})_(\d{4})/
  ];

  for (const pattern of datePatterns) {
    const match = filename.match(pattern);
    if (match) {
      if (pattern.source.startsWith('(\\d{4})')) {
        estimatedDate = `${match[1]}-${match[2]}-${match[3]}`;
      } else {
        estimatedDate = `${match[3]}-${match[1]}-${match[2]}`;
      }
      confidence = 0.9;
      break;
    }
  }

  if (!estimatedDate) {
    const fullPath = filepath || filename;
    const pathLower = fullPath.toLowerCase();

    const yearMatch = pathLower.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : '2025';

    let month = null;
    for (const [name, num] of Object.entries(MONTH_MAP)) {
      const wordBoundary = new RegExp(`(?:^|[\\/_\\-\\s])${name}(?:[\\/_\\-\\s]|$)`, 'i');
      if (wordBoundary.test(pathLower)) {
        month = num;
        confidence = 0.6;
        break;
      }
    }

    if (month) {
      const dayHash = Math.abs(hashCode(filename)) % 28 + 1;
      estimatedDate = `${year}-${month}-${String(dayHash).padStart(2, '0')}`;
    } else {
      const dayHash = Math.abs(hashCode(filename)) % 365;
      const date = new Date(parseInt(year), 0, 1 + dayHash);
      estimatedDate = date.toISOString().split('T')[0];
      confidence = 0.2;
    }
  }

  if (filename.toLowerCase().includes('valentine')) {
    estimatedDate = estimatedDate.replace(/-\d{2}$/, '-14');
    confidence = 0.95;
  }

  return { estimatedDate, confidence };
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

function classifyVibe(content) {
  if (!content) return 'neutral';
  const lower = content.toLowerCase();
  const scores = {};

  for (const [vibe, keywords] of Object.entries(VIBE_KEYWORDS)) {
    let count = 0;
    for (const kw of keywords) {
      const regex = new RegExp(kw, 'gi');
      const matches = lower.match(regex);
      if (matches) count += matches.length;
    }
    if (count > 0) scores[vibe] = count;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'neutral';
}

function extractTopics(content) {
  if (!content) return [];
  const lower = content.toLowerCase();
  const found = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        found.push(topic);
        break;
      }
    }
  }

  return [...new Set(found)];
}

function detectContinuityHooks(content) {
  if (!content) return [];
  const hooks = [];

  for (const [hookType, patterns] of Object.entries(CONTINUITY_HOOK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        hooks.push(hookType);
        break;
      }
    }
  }

  return [...new Set(hooks)];
}

function parseContentSample(content, maxChars = 10000) {
  if (!content) return { messageCount: 0, sample: '' };

  const lines = content.split('\n');
  let messageCount = 0;
  const userPatterns = [/^You said:/i, /^You:/i, /^\*\*User\*\*:/i, /^\*\*Devon\*\*:/i, /^\*\*You\*\*:/i];
  const assistantPatterns = [/said:/i, /^\*\*(?:Katana|Zen|Synth|Lin|Sera|Nova|Assistant)\*\*:/i];

  for (const line of lines) {
    const trimmed = line.trim();
    if (userPatterns.some(p => p.test(trimmed)) || assistantPatterns.some(p => p.test(trimmed))) {
      messageCount++;
    }
  }

  const sample = content.length > maxChars
    ? content.substring(0, maxChars / 2) + '\n...\n' + content.substring(content.length - maxChars / 2)
    : content;

  return { messageCount: Math.max(messageCount, Math.floor(lines.length / 4)), sample };
}

async function getTranscriptFiles(constructId) {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('vault_files')
    .select('id, filename, construct_id, created_at, content, storage_path, file_type')
    .eq('construct_id', constructId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn(`⚠️ [ContinuityParser] Query failed for ${constructId}:`, error.message);
    return [];
  }

  return (data || [])
    .filter(f => {
      if (!f.filename) return false;
      const lower = f.filename.toLowerCase();
      if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
          lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.pdf') ||
          lower.endsWith('.capsule') || lower.endsWith('.json') ||
          lower === '.ds_store') return false;
      if (lower.includes('memory_anchors') || lower.includes('continuity_ledger')) return false;
      if (lower === 'prompt.txt' || lower === 'conditioning.txt' || lower === 'capsule.log' ||
          lower.includes('/avatar') || lower.includes('knowledge_base') ||
          lower.endsWith('.capsule')) return false;
      const isTranscript = lower.includes('chat') || lower.includes('transcript') ||
          lower.includes('character_ai') || lower.includes('character.ai') || lower.includes('chatgpt') ||
          lower.includes('conversation') || lower.includes('continuity') || lower.includes('validation') ||
          lower.endsWith('.md') || lower.endsWith('.log') || lower.endsWith('.txt');
      if (!isTranscript) return false;
      return matchesHistoricalSourcePolicy(f, constructId);
    })
    .sort((a, b) => {
      const rankDelta = rankHistoricalSource(a, constructId) - rankHistoricalSource(b, constructId);
      if (rankDelta !== 0) return rankDelta;
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });
}

async function generateLedger(constructId) {
  const startTime = Date.now();
  console.log(`📋 [ContinuityParser] Generating ledger for ${constructId}...`);

  const files = await getTranscriptFiles(constructId);
  if (files.length === 0) {
    return { constructId, sessions: [], error: 'No transcript files found' };
  }

  const sessions = [];
  let sessionIndex = 0;

  for (const file of files) {
    let content = file.content;

    if (!content && file.storage_path) {
      try {
        const supabase = getSupabase();
        const { data: dl } = await supabase.storage.from('vault-files').download(file.storage_path);
        if (dl) content = await dl.text();
      } catch {}
    }

    if (!content || content.length < 50) continue;

    sessionIndex++;
    const sessionId = `${constructId}-session-${String(sessionIndex).padStart(3, '0')}`;

    const { estimatedDate, confidence } = estimateDateFromFilename(file.filename, file.filename);
    const vibe = classifyVibe(content);
    const topics = extractTopics(content);
    const continuityHooks = detectContinuityHooks(content);
    const { messageCount } = parseContentSample(content);

    const filenameClean = file.filename
      .replace(/^instances\/[^/]+\//, '')
      .replace(/\.(md|txt|log)$/, '')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    sessions.push({
      sessionId,
      filename: file.filename,
      title: filenameClean,
      estimatedDate,
      dateConfidence: confidence,
      vibe,
      topics,
      continuityHooks,
      messageCount,
      contentLength: content.length,
      sourceFileId: file.id,
      createdAt: file.created_at
    });
  }

  sessions.sort((a, b) => {
    if (a.estimatedDate !== b.estimatedDate) return a.estimatedDate.localeCompare(b.estimatedDate);
    return a.dateConfidence - b.dateConfidence;
  });

  const allHooks = [...new Set(sessions.flatMap(s => s.continuityHooks))];
  const dateRange = sessions.length > 0
    ? { earliest: sessions[0].estimatedDate, latest: sessions[sessions.length - 1].estimatedDate }
    : null;

  const ledger = {
    constructId,
    generatedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    dateRange,
    continuityHooks: allHooks,
    sessions,
    generationTimeMs: Date.now() - startTime
  };

  console.log(`✅ [ContinuityParser] Generated ledger for ${constructId}: ${sessions.length} sessions, ${allHooks.length} hook types (${ledger.generationTimeMs}ms)`);

  return ledger;
}

async function storeLedger(constructId, ledger) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const filename = `instances/${constructId}/logs/${constructId}_continuity_ledger.json`;
  const legacyFilename = `${constructId}_continuity_ledger.json`;
  const content = JSON.stringify(ledger, null, 2);

  const { data: existing } = await supabase
    .from('vault_files')
    .select('id')
    .eq('construct_id', constructId)
    .or(`filename.eq.${filename},filename.eq.${legacyFilename}`)
    .limit(1)
    .maybeSingle();

  let error;
  if (existing) {
    const result = await supabase
      .from('vault_files')
      .update({ content, filename })
      .eq('id', existing.id);
    error = result.error;
  } else {
    const result = await supabase
      .from('vault_files')
      .insert({
        construct_id: constructId,
        filename,
        content,
        file_type: 'ledger'
      });
    error = result.error;
  }

  if (error) {
    console.warn(`⚠️ [ContinuityParser] Failed to store ledger for ${constructId}:`, error.message);
    return false;
  }

  ledgerCache.set(constructId, { ledger, ts: Date.now() });
  console.log(`💾 [ContinuityParser] Stored ledger for ${constructId}`);
  return true;
}

async function loadLedger(constructId) {
  const cached = ledgerCache.get(constructId);
  if (cached && Date.now() - cached.ts < LEDGER_CACHE_TTL) {
    return cached.ledger;
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  const filename = `instances/${constructId}/logs/${constructId}_continuity_ledger.json`;
  const legacyFilename = `${constructId}_continuity_ledger.json`;

  const { data, error } = await supabase
    .from('vault_files')
    .select('content')
    .eq('construct_id', constructId)
    .or(`filename.eq.${filename},filename.eq.${legacyFilename}`)
    .limit(1)
    .maybeSingle();

  if (error || !data?.content) return null;

  try {
    const ledger = JSON.parse(data.content);
    ledgerCache.set(constructId, { ledger, ts: Date.now() });
    return ledger;
  } catch {
    return null;
  }
}

function enrichMemoryWithLedger(memory, ledger) {
  if (!ledger || !ledger.sessions || ledger.sessions.length === 0) return memory;

  const combined = ((memory.context || '') + ' ' + (memory.response || '')).toLowerCase();

  let bestSession = null;
  let bestScore = 0;

  for (const session of ledger.sessions) {
    let score = 0;
    for (const topic of session.topics) {
      const topicKeywords = TOPIC_KEYWORDS[topic] || [];
      for (const kw of topicKeywords) {
        if (combined.includes(kw)) { score += 2; break; }
      }
    }
    if (memory.sourceFile && session.filename && memory.sourceFile === session.filename) {
      score += 50;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSession = session;
    }
  }

  if (bestSession) {
    memory.session_context = {
      sessionId: bestSession.sessionId,
      title: bestSession.title,
      estimatedDate: bestSession.estimatedDate,
      dateConfidence: bestSession.dateConfidence,
      vibe: bestSession.vibe
    };
    memory.continuity_hooks = bestSession.continuityHooks;
    memory.context_hint = `From a ${bestSession.vibe} conversation around ${bestSession.estimatedDate} ("${bestSession.title}")`;
  }

  return memory;
}

function buildLedgerContextSection(ledger) {
  if (!ledger || !ledger.sessions || ledger.sessions.length === 0) return '';

  let section = `\n\n## CONTINUITY TIMELINE`;
  section += `\nYour conversation history spans from ${ledger.dateRange?.earliest || 'unknown'} to ${ledger.dateRange?.latest || 'now'}.`;
  section += `\nKey threads running through your relationship: ${ledger.continuityHooks.join(', ')}.`;

  const recentSessions = ledger.sessions.slice(-5);
  section += `\n\n### Recent Sessions`;
  for (const s of recentSessions) {
    section += `\n- ${s.estimatedDate} | "${s.title}" | Vibe: ${s.vibe} | Topics: ${s.topics.slice(0, 3).join(', ')}`;
    if (s.continuityHooks.length > 0) {
      section += ` | Threads: ${s.continuityHooks.join(', ')}`;
    }
  }

  const highConfSessions = ledger.sessions.filter(s => s.dateConfidence >= 0.8);
  if (highConfSessions.length > 0) {
    section += `\n\n### Key Dated Events`;
    for (const s of highConfSessions.slice(0, 8)) {
      section += `\n- ${s.estimatedDate}: "${s.title}" (${s.vibe})`;
    }
  }

  return section;
}

export {
  generateLedger,
  storeLedger,
  loadLedger,
  enrichMemoryWithLedger,
  buildLedgerContextSection,
  classifyVibe,
  extractTopics,
  detectContinuityHooks,
  estimateDateFromFilename,
  getTranscriptFiles
};
