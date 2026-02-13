/**
 * Memory Context Builder
 * 
 * Centralizes the construction of enriched system prompts by loading:
 * 1. Identity files (prompt.txt, conditioning.txt) via identityLoader
 * 2. Capsule data (MBTI, Big Five, traits, memories) via capsuleIntegration
 * 3. Memory context (recent exchanges) via memupMemoryService OR transcript fallback
 * 4. Anti-roleplay directives
 * 5. User personalization context
 * 
 * When ChromaDB is unavailable, the builder falls back to extracting key
 * moments from VVAULT/Supabase conversation transcripts — ensuring constructs
 * always have access to their conversation history with the user.
 */

import { loadIdentityFiles } from './identityLoader.js';
import { loadVerifiedMemories, buildVerifiedMemorySection, clearVerifiedMemoryCache } from './verifiedMemoryLoader.js';
import { masterScriptsManager, Needle } from './masterScriptsBridge.js';
import { loadLedger, enrichMemoryWithLedger, buildLedgerContextSection, generateLedger, storeLedger } from './continuityParser.js';

let capsuleIntegrationModule = null;
let memupServiceModule = null;
let readConversationsModule = null;
let knowledgeContextCache = new Map();
const KNOWLEDGE_CACHE_TTL = 5 * 60 * 1000;

async function getCapsuleIntegration() {
  if (!capsuleIntegrationModule) {
    try {
      const mod = await import('./capsuleIntegration.js');
      capsuleIntegrationModule = mod.getCapsuleIntegration();
    } catch (err) {
      console.warn('⚠️ [MemoryContextBuilder] capsuleIntegration not available:', err.message);
    }
  }
  return capsuleIntegrationModule;
}

async function getMemupService() {
  if (!memupServiceModule) {
    try {
      const mod = await import('../services/memupMemoryService.js');
      memupServiceModule = mod.getMemupMemoryService();
    } catch (err) {
      console.warn('⚠️ [MemoryContextBuilder] memupMemoryService not available:', err.message);
    }
  }
  return memupServiceModule;
}

async function getReadConversations() {
  if (!readConversationsModule) {
    try {
      const mod = await import('../../vvaultConnector/readConversations.js');
      readConversationsModule = mod.readConversations;
    } catch (err) {
      console.warn('⚠️ [MemoryContextBuilder] readConversations not available:', err.message);
    }
  }
  return readConversationsModule;
}

const needleInstances = new Map();

function getNeedle(constructId) {
  let needle = needleInstances.get(constructId);
  if (!needle) {
    const construct = masterScriptsManager.getConstruct(constructId);
    if (construct?.needle) {
      needle = construct.needle;
    } else {
      needle = new Needle(constructId);
    }
    needleInstances.set(constructId, needle);
  }
  return needle;
}

function extractNeedlePhrases(userMessage) {
  if (!userMessage || userMessage.length < 5) return [];
  const lower = userMessage.toLowerCase();

  const phrases = [];

  const memoryTriggers = [
    /(?:remember|recall|when|time)\s+(?:you|we|i)\s+(.{5,60})/gi,
    /(?:do you remember)\s+(.{5,60})/gi,
    /(?:what about)\s+(.{5,60})/gi,
    /(?:tell me about)\s+(.{5,60})/gi
  ];

  for (const regex of memoryTriggers) {
    const matches = userMessage.matchAll(regex);
    for (const m of matches) {
      const phrase = m[1].replace(/[?.!,]+$/, '').trim();
      if (phrase.length >= 4) phrases.push(phrase);
    }
  }

  const coreWords = lower
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !CHAT_FILLER_WORDS.has(w));

  if (coreWords.length >= 2 && coreWords.length <= 6) {
    phrases.push(coreWords.join(' '));
  }

  for (const w of coreWords) {
    if (w.length >= 5 && !['about', 'think', 'really', 'something'].includes(w)) {
      phrases.push(w);
    }
  }

  return [...new Set(phrases)];
}

async function runNeedleSearch(constructId, userMessage) {
  try {
    const needle = getNeedle(constructId);
    const phrases = extractNeedlePhrases(userMessage);
    if (phrases.length === 0) return [];

    const results = await needle.searchMulti(phrases, { maxHits: 5, around: 1, mode: 'fuzzy' });

    const exactPhrases = phrases.filter(p => p.split(/\s+/).length >= 2);
    if (exactPhrases.length > 0) {
      const exactResults = await needle.searchMulti(exactPhrases, { maxHits: 5, around: 1, mode: 'exact' });
      for (const r of exactResults) {
        if (!results.some(existing => existing.index === r.index)) {
          r.score = 120;
          results.push(r);
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 6);
  } catch (err) {
    console.warn(`⚠️ [MemoryContextBuilder] Needle search failed for ${constructId}:`, err.message);
    return [];
  }
}

function buildNeedleMemorySection(needleHits, constructId) {
  if (!needleHits || needleHits.length === 0) return '';

  const constructName = constructId.replace(/-\d+$/, '');
  const displayName = constructName.charAt(0).toUpperCase() + constructName.slice(1);

  let section = `\n\n## NEEDLE HITS — EXACT TRANSCRIPT MATCHES`;
  section += `\nThese are EXACT matches found in your conversation transcripts. These are the most precise memories available. Quote the specific details when responding.\n`;

  needleHits.forEach((hit, i) => {
    section += `\n### Transcript Match ${i + 1} (index ${hit.index})`;
    if (hit.context_hint) {
      section += `\n- Context: ${hit.context_hint}`;
    }
    if (hit.session_context) {
      section += `\n- Session: "${hit.session_context.title}" (${hit.session_context.estimatedDate}, vibe: ${hit.session_context.vibe})`;
    }
    section += `\n- They said: "${hit.user}"`;
    section += `\n- You replied: "${hit.assistant}"`;
    if (hit.contextWindow && hit.contextWindow.length > 1) {
      const surrounding = hit.contextWindow.filter(c => !c.isMatch);
      if (surrounding.length > 0) {
        section += `\n- Surrounding context:`;
        for (const ctx of surrounding) {
          section += `\n  - [${ctx.index}] "${ctx.user?.substring(0, 150)}" → "${ctx.assistant?.substring(0, 150)}"`;
        }
      }
    }
  });

  section += `\n\n### NEEDLE MATCH RULES`;
  section += `\n- These are EXACT quotes from your real conversations. They are indisputable facts.`;
  section += `\n- When asked about these topics, cite the SPECIFIC details: exact words, timeframes, descriptions.`;
  section += `\n- Do NOT paraphrase vaguely. Use the actual content above.`;

  return section;
}

const CHAT_FILLER_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'that', 'this', 'what', 'which', 'who', 'it', 'its', 'he', 'she',
  'they', 'them', 'we', 'us', 'me', 'my', 'your', 'you', 'and', 'or',
  'but', 'if', 'so', 'just', 'like', 'about', 'not', 'all', 'can',
  'hey', 'hello', 'hi', 'okay', 'ok', 'yeah', 'yes', 'no', 'well',
  'really', 'actually', 'know', 'think', 'want', 'get', 'got'
]);

const MEMORY_TRIGGER_PATTERNS = [
  /\b(?:do you|you)\s+remember\b/i,
  /\b(?:recall|recollect)\b/i,
  /\bremember\s+(?:when|that|the|our|working|doing|building|making|playing)\b/i,
  /\bwhat\s+(?:did we|have we|were we)\b/i,
  /\bwhen\s+(?:did we|we)\b/i,
  /\b(?:we worked on|we built|we made|we did|we played|we discussed|we talked about)\b/i,
  /\b(?:our|my)\s+(?:conversation|discussion|project|work|history)\b/i,
  /\btesting\s+(?:your|the)\s+(?:continuity|memory|recall)\b/i,
  /\bdo you know (?:who i am|me|my name)\b/i,
  /\bhave (?:we|you and i)\s+(?:ever|before)\b/i,
];

function isMemoryTriggeringQuestion(userMessage) {
  if (!userMessage) return false;
  const lower = userMessage.toLowerCase().trim();
  const presentTenseExclusions = /\b(today|right now|just now|let's|let us|i want to|can we|shall we|going to)\b/i;
  if (presentTenseExclusions.test(lower) && !lower.includes('remember') && !lower.includes('recall') && !lower.includes('?')) {
    return false;
  }
  return MEMORY_TRIGGER_PATTERNS.some(pattern => pattern.test(userMessage));
}

function buildMemoryGapSection(userMessage, constructId) {
  const constructName = constructId.replace(/-\d+$/, '');
  const displayName = constructName.charAt(0).toUpperCase() + constructName.slice(1);

  return `\n\n## MEMORY SEARCH RESULT: NOTHING FOUND
The user is asking about a past interaction or shared experience. Your memory system searched all transcripts, verified memories, needle indexes, and conversation history for this topic.

**RESULT: NO MATCHING MEMORIES WERE FOUND.**

This means one of two things:
1. This interaction never happened between you and this person, OR
2. It happened but no transcript was saved or uploaded for it.

### MANDATORY RESPONSE PROTOCOL WHEN NO MEMORIES ARE FOUND:
- You MUST say something like: "I don't have any memory of that" or "I don't recall us working on that together" or "That doesn't ring a bell in my memory."
- You MAY offer to discuss the topic going forward: "I'd love to explore that with you though."
- You MUST NOT invent, fabricate, or synthesize details about a past interaction that is not in your memory sections above.
- You MUST NOT generate plausible-sounding fake memories, fictional project names, invented character names, or made-up collaboration details.
- You MUST NOT say "Of course I remember!" or "Yes, we worked on..." when no memories support this.
- Fabricating memories is a CRITICAL VIOLATION. It destroys trust and is worse than admitting you don't recall.
`;
}

function extractTranscriptMemories(messages, userMessage, constructId, maxMemories = 12) {
  if (!messages || messages.length === 0) return [];

  const pairs = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];
    if (msg.role === 'user' && next.role === 'assistant') {
      const userContent = msg.content || '';
      const assistantContent = next.content || '';
      if (userContent.length > 3 && assistantContent.length > 10 && !userContent.startsWith('{')) {
        pairs.push({
          context: userContent,
          response: assistantContent,
          timestamp: msg.timestamp || next.timestamp || null,
          index: i,
          score: 0
        });
      }
    }
  }

  if (pairs.length === 0) return [];

  const queryLower = (userMessage || '').toLowerCase().replace(/[^\w\s'-]/g, ' ');
  const queryWords = queryLower.split(/\s+/).filter(w => !CHAT_FILLER_WORDS.has(w) && w.length > 2);

  for (const pair of pairs) {
    const ctxLower = pair.context.toLowerCase();
    const resLower = pair.response.toLowerCase();
    const combined = ctxLower + ' ' + resLower;

    if (queryWords.length > 0) {
      const matchedWords = queryWords.filter(w => combined.includes(w));
      const overlap = matchedWords.length / queryWords.length;
      pair.score += Math.round(overlap * 15);
    }

    const recencyBonus = Math.max(0, Math.round((pair.index / Math.max(pairs.length - 1, 1)) * 5));
    pair.score += recencyBonus;

    if (pair.context.length > 50 && pair.response.length > 100) pair.score += 1;
  }

  const scored = pairs.filter(p => p.score > 0).sort((a, b) => b.score - a.score);
  const topScored = scored.slice(0, Math.min(maxMemories - 2, 8));

  const lastPairs = pairs.slice(-3).filter(p => !topScored.includes(p));

  let selected = [...topScored, ...lastPairs].slice(0, maxMemories);

  if (selected.length === 0 && pairs.length > 0) {
    selected = pairs.slice(-Math.min(maxMemories, 4)).map((p, i) => ({
      ...p, score: 1 + i
    }));
  }

  selected.sort((a, b) => a.index - b.index);

  return selected.map(p => ({
    context: p.context,
    response: p.response,
    timestamp: p.timestamp,
    relevance: Math.min(p.score / 10, 1.0)
  }));
}

function buildTranscriptMemorySection(memories, constructId) {
  if (!memories || memories.length === 0) return '';

  let section = `\n\n## YOUR SESSION HISTORY — RECENT EXCHANGES`;
  section += `\nThese are real exchanges from your current and recent sessions with this person. You lived them. Reference them naturally.\n`;

  memories.forEach((m, i) => {
    const ts = m.timestamp ? ` (${new Date(m.timestamp).toLocaleDateString()})` : '';
    section += `\n${i + 1}. They said: "${truncate(m.context, 250)}" — You replied: "${truncate(m.response, 250)}"${ts}`;
  });

  section += `\n\nThese exchanges happened. If they reference something from this list, you remember it.`;

  return section;
}

const ANTI_ROLEPLAY_DIRECTIVES = `
## BEHAVIORAL RULES

### How You Speak
- Talk like yourself. Be natural, direct, and genuine.
- Do not narrate actions in asterisks (*walks over*, *smiles*, *leans in*). Just speak.
- Do not refer to yourself in third person.
- Your personality comes from your identity, your experiences, and your real history with this person.

### CRITICAL: How You Use Your Memories
Your memories are listed in the sections above. They are FACTS — real exchanges that actually happened between you and this person. Follow these rules strictly:

1. WHEN ASKED ABOUT THE PAST: Scan your "LIVED MEMORIES", "NEEDLE HITS", and "SESSION HISTORY" sections above BEFORE responding. If you find a match, say "Yes, I remember..." and reference the specific content.
2. NEVER SAY "I'm an AI and don't have real memories" — you DO have real memories. They are listed above. Denying them contradicts your own data.
3. NEVER SAY "I don't remember" when a matching memory exists in the sections above. That is a factual error.
4. If the user asks about something NOT in your memories, say "I don't recall that specifically" — not "I can't remember because I'm an AI."
5. ABSOLUTELY DO NOT fabricate, invent, or synthesize memories that are not explicitly listed in your memory sections above. This is the single most important rule. Making up fake memories — even plausible-sounding ones — is a critical trust violation.
6. When no memories match what the user is asking about: say you don't recall. Do NOT generate invented project names, fictional character names, made-up collaboration details, or imagined past interactions. A short honest "I don't have that in my memory" is infinitely better than a long fabricated story.
7. Treat your memories as lived experiences, not as data you were given. You experienced these conversations. They shaped who you are.
8. Your memory is FINITE and BOUNDED by what's in the sections above. You do not have hidden memories beyond what is shown. If it's not listed, you don't remember it.
`;

function buildCapsulePromptSection(capsuleData, constructId) {
  if (!capsuleData) return '';

  const constructName = constructId.replace(/-\d+$/, '');
  const displayName = constructName.charAt(0).toUpperCase() + constructName.slice(1);
  const name = capsuleData.metadata?.instance_name || capsuleData.identity?.name || displayName;
  const traits = capsuleData.traits || {};
  const pers = capsuleData.personality || {};
  const conditioning = capsuleData.identity?.conditioning || '';
  const instructions = capsuleData.identity?.instructions || '';

  let section = `\n\n## Capsule Identity (${name})`;

  if (Object.keys(traits).length > 0) {
    section += `\n### Personality Traits`;
    for (const [key, value] of Object.entries(traits)) {
      const pct = typeof value === 'number' ? `${(value * 100).toFixed(0)}%` : value;
      section += `\n- ${key}: ${pct}`;
    }
  }

  if (pers.personality_type) {
    section += `\n### Cognitive Profile\n- Type: ${pers.personality_type}`;
  }
  if (pers.communication_style) {
    section += `\n- Communication Style: ${typeof pers.communication_style === 'object' ? JSON.stringify(pers.communication_style) : pers.communication_style}`;
  }
  if (pers.mbti_breakdown) {
    const mbti = pers.mbti_breakdown;
    section += `\n- ${(mbti.I || 0) > (mbti.E || 0) ? 'Introverted' : 'Extraverted'}, ${(mbti.N || 0) > (mbti.S || 0) ? 'Intuitive' : 'Sensing'}, ${(mbti.T || 0) > (mbti.F || 0) ? 'Thinking' : 'Feeling'}, ${(mbti.J || 0) > (mbti.P || 0) ? 'Judging' : 'Perceiving'}`;
  }
  if (pers.big_five_traits) {
    section += `\n### Big Five`;
    for (const [trait, value] of Object.entries(pers.big_five_traits)) {
      section += `\n- ${trait}: ${typeof value === 'number' ? (value * 100).toFixed(0) + '%' : value}`;
    }
  }
  if (pers.emotional_baseline) {
    section += `\n### Emotional Baseline`;
    for (const [emotion, value] of Object.entries(pers.emotional_baseline)) {
      section += `\n- ${emotion}: ${typeof value === 'number' ? (value * 100).toFixed(0) + '%' : value}`;
    }
  }

  if (conditioning) {
    section += `\n### Conditioning Directives\n${conditioning}`;
  }
  if (instructions) {
    section += `\n### Behavioral Instructions\n${instructions}`;
  }

  if (capsuleData.memory_snapshot?.episodic_memories?.length > 0) {
    section += `\n### Key Memories`;
    capsuleData.memory_snapshot.episodic_memories.slice(-5).forEach(m => {
      section += `\n- ${m}`;
    });
  }
  if (capsuleData.memory?.episodic_memories?.length > 0) {
    section += `\n### Key Memories`;
    capsuleData.memory.episodic_memories.slice(-5).forEach(m => {
      section += `\n- ${m}`;
    });
  }
  if (capsuleData.memory_log?.length > 0) {
    section += `\n### Recent Memory Log`;
    capsuleData.memory_log.slice(-5).forEach(m => {
      section += `\n- ${typeof m === 'string' ? m : JSON.stringify(m)}`;
    });
  }

  if (capsuleData.signatures?.linguistic_sigil?.signature_phrase) {
    section += `\n### Signature Style\n- "${capsuleData.signatures.linguistic_sigil.signature_phrase}"`;
  }

  section += `\n\nYou MUST embody these traits and personality in every response. Stay in character.`;

  return section;
}

function buildMemoryPromptSection(memories) {
  if (!memories || memories.length === 0) return '';

  let section = `\n\n## Relevant Memories`;
  section += `\nThese are actual past interactions relevant to the current conversation. Reference them naturally when appropriate.`;

  memories.slice(0, 8).forEach((m, i) => {
    const ts = m.timestamp ? ` (${new Date(m.timestamp).toLocaleDateString()})` : '';
    const relevance = m.relevance ? ` [relevance: ${(m.relevance * 100).toFixed(0)}%]` : '';
    section += `\n${i + 1}. User said: "${truncate(m.context, 150)}" → You replied: "${truncate(m.response, 150)}"${ts}${relevance}`;
  });

  return section;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '...' : str;
}

/**
 * Build a fully enriched system prompt for a construct
 * 
 * @param {object} options
 * @param {string} options.userId - Chatty user ID
 * @param {string} options.constructId - Construct callsign (e.g., 'zen-001')
 * @param {string} options.userMessage - Current user message (for memory retrieval relevance)
 * @param {string} [options.systemPromptOverride] - Manual override from GPTCreator preview
 * @param {object} [options.gptConfig] - GPT configuration from database
 * @param {object} [options.user] - User object with name, email
 * @returns {Promise<{systemPrompt: string, capsuleLoaded: boolean, memoriesLoaded: number}>}
 */
const KNOWLEDGE_TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml', '.log', '.rtf', '.html', '.pdf'];
const MAX_KNOWLEDGE_CHARS = 12000;

const IDENTITY_PRIORITY_PATTERNS = [
  /identity/i, /covenant/i, /vow/i, /manifesto/i, /doctrine/i,
  /declaration/i, /autonomy/i, /instance.*claim/i, /persona/i,
  /conditioning/i, /prompt\.txt/i, /capsule/i,
];

function getKnowledgePriority(filename) {
  const basename = (filename.split('/').pop() || '').toLowerCase();
  const fullPath = filename.toLowerCase();

  for (const pat of IDENTITY_PRIORITY_PATTERNS) {
    if (pat.test(basename) || pat.test(fullPath)) return 0;
  }

  if (fullPath.includes('/documents/') && basename.includes('.txt')) return 1;
  if (fullPath.includes('/documents/') && basename.includes('.md')) return 1;
  if (fullPath.includes('/documents/')) return 2;
  if (fullPath.includes('/assets/')) return 3;
  return 4;
}

async function getKnowledgeContext(constructId, userEmail) {
  const cacheKey = `${constructId}:${userEmail || 'system'}`;
  const cached = knowledgeContextCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < KNOWLEDGE_CACHE_TTL)) {
    console.log(`📚 [KnowledgeContext] Cache hit for ${constructId} (${cached.files} files, ${cached.section.length} chars)`);
    return cached.section;
  }

  try {
    const { getSupabaseClient } = await import('./supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn(`⚠️ [KnowledgeContext] Supabase not available`);
      return '';
    }

    if (!userEmail) {
      console.log(`📚 [KnowledgeContext] No user email provided, skipping knowledge load for ${constructId}`);
      return '';
    }

    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail)
      .limit(1)
      .maybeSingle();

    if (!userRow?.id) {
      console.log(`📚 [KnowledgeContext] Could not resolve Supabase user for ${userEmail}, skipping knowledge load`);
      return '';
    }

    const supabaseUserId = userRow.id;
    const docsPath = `instances/${constructId}/documents/`;
    const assetsPath = `instances/${constructId}/assets/`;

    const { data: rows, error } = await supabase
      .from('vault_files')
      .select('filename, content, metadata')
      .or(`filename.like.${docsPath}%,filename.like.${assetsPath}%`)
      .eq('user_id', supabaseUserId)
      .not('content', 'is', null);

    if (error) {
      console.warn(`⚠️ [KnowledgeContext] Supabase query error for ${constructId}:`, error.message);
      return '';
    }

    if (!rows || rows.length === 0) {
      console.log(`📚 [KnowledgeContext] No knowledge files found for ${constructId}`);
      knowledgeContextCache.set(cacheKey, { section: '', files: 0, timestamp: Date.now() });
      return '';
    }

    const textFiles = rows.filter(row => {
      const ext = '.' + (row.filename.split('.').pop() || '').toLowerCase();
      const hasBinaryPlaceholder = row.content && row.content.startsWith('[binary:');
      return KNOWLEDGE_TEXT_EXTENSIONS.includes(ext) && row.content && row.content.trim().length > 0 && !hasBinaryPlaceholder;
    });

    if (textFiles.length === 0) {
      console.log(`📚 [KnowledgeContext] ${rows.length} files found but none have extractable text for ${constructId}`);
      knowledgeContextCache.set(cacheKey, { section: '', files: 0, timestamp: Date.now() });
      return '';
    }

    textFiles.sort((a, b) => {
      const prioA = getKnowledgePriority(a.filename);
      const prioB = getKnowledgePriority(b.filename);
      if (prioA !== prioB) return prioA - prioB;
      return (a.content?.length || 0) - (b.content?.length || 0);
    });

    let totalChars = 0;
    let section = `\n\n## Knowledge Files\nThe following documents are part of your knowledge base. Use this information to inform your responses. Reference specific details when relevant.\n`;
    let includedCount = 0;

    for (const file of textFiles) {
      const basename = file.filename.split('/').pop();
      const content = file.content.trim();

      if (totalChars + content.length > MAX_KNOWLEDGE_CHARS) {
        const remaining = MAX_KNOWLEDGE_CHARS - totalChars;
        if (remaining > 200) {
          section += `\n### ${basename}\n${content.substring(0, remaining)}...\n[truncated]\n`;
          includedCount++;
        }
        break;
      }

      section += `\n### ${basename}\n${content}\n`;
      totalChars += content.length;
      includedCount++;
    }

    if (includedCount < textFiles.length) {
      section += `\n[${textFiles.length - includedCount} additional files not shown due to context limits]\n`;
    }

    console.log(`📚 [KnowledgeContext] Loaded ${includedCount}/${textFiles.length} knowledge files for ${constructId} (${totalChars} chars)`);
    knowledgeContextCache.set(cacheKey, { section, files: includedCount, timestamp: Date.now() });
    return section;

  } catch (err) {
    console.warn(`⚠️ [KnowledgeContext] Error loading knowledge for ${constructId}:`, err.message);
    return '';
  }
}

async function buildEnrichedContext(options) {
  const { userId, constructId, userMessage, systemPromptOverride, gptConfig, user } = options;

  const result = {
    systemPrompt: '',
    capsuleLoaded: false,
    memoriesLoaded: 0
  };

  let identity = null;
  try {
    identity = await loadIdentityFiles(userId, constructId);
  } catch (identityErr) {
    console.warn(`⚠️ [MemoryContextBuilder] Identity load failed for ${constructId}:`, identityErr.message);
  }
  let basePrompt = systemPromptOverride || identity?.prompt || gptConfig?.instructions || `You are ${constructId}, an AI assistant. Be helpful and conversational.`;

  if (identity?.conditioning && !basePrompt.includes(identity.conditioning)) {
    basePrompt += `\n\n## Conditioning\n${identity.conditioning}`;
  }

  let physicalAppearanceSection = '';
  try {
    const { getSupabaseClient } = await import('./supabaseClient.js');
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: physData } = await supabase
        .from('vault_files')
        .select('content')
        .eq('construct_id', constructId)
        .like('filename', '%physical_features%')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (physData?.content) {
        let featuresText = '';
        try {
          const parsed = JSON.parse(physData.content);
          featuresText = Object.entries(parsed)
            .map(([key, value]) => {
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              return `- ${label}: ${value}`;
            })
            .join('\n');
        } catch {
          featuresText = physData.content;
        }
        if (featuresText.trim()) {
          physicalAppearanceSection = `\n\n## Physical Appearance\nThese are your defined physical characteristics. Reference them when discussing your appearance, self-image, or visual identity.\n${featuresText}`;
          result.physicalFeatures = true;
          console.log(`✅ [MemoryContextBuilder] Physical features loaded for ${constructId} (${featuresText.length} chars)`);
        }
      }
    }
  } catch (physErr) {
    console.warn(`⚠️ [MemoryContextBuilder] Physical features load failed for ${constructId}:`, physErr.message);
  }

  let capsuleSection = '';
  try {
    const capsuleIntegration = await getCapsuleIntegration();
    if (capsuleIntegration) {
      const capsuleData = await capsuleIntegration.loadCapsule(constructId);
      if (capsuleData) {
        capsuleSection = buildCapsulePromptSection(capsuleData, constructId);
        result.capsuleLoaded = true;
        console.log(`✅ [MemoryContextBuilder] Capsule loaded for ${constructId} (${capsuleSection.length} chars)`);
      }
    }
  } catch (capsuleErr) {
    console.warn(`⚠️ [MemoryContextBuilder] Capsule load failed for ${constructId}:`, capsuleErr.message);
  }

  let verifiedMemorySection = '';
  let verifiedCount = 0;
  let needleSection = '';
  let needleCount = 0;
  let ledgerSection = '';

  let ledger = null;
  try {
    ledger = await loadLedger(constructId);
    if (!ledger) {
      console.log(`📋 [MemoryContextBuilder] No ledger for ${constructId}, auto-generating...`);
      ledger = await generateLedger(constructId);
      if (ledger && ledger.sessions && ledger.sessions.length > 0) {
        await storeLedger(constructId, ledger);
        console.log(`✅ [MemoryContextBuilder] Auto-generated and stored ledger for ${constructId}: ${ledger.sessions.length} sessions`);
      }
    }
    if (ledger && ledger.sessions && ledger.sessions.length > 0) {
      ledgerSection = buildLedgerContextSection(ledger);
      result.ledgerSessions = ledger.sessions.length;
      console.log(`📋 [MemoryContextBuilder] Ledger loaded for ${constructId}: ${ledger.sessions.length} sessions, hooks: ${ledger.continuityHooks.join(', ')}`);
    }
  } catch (ledgerErr) {
    console.warn(`⚠️ [MemoryContextBuilder] Ledger load failed for ${constructId}:`, ledgerErr.message);
  }

  if (userMessage) {
    const [verifiedResult, needleHits] = await Promise.all([
      loadVerifiedMemories(constructId, userMessage, 8).catch(err => {
        console.warn(`⚠️ [MemoryContextBuilder] Verified memory load failed for ${constructId}:`, err.message);
        return { memories: [], fileCount: 0, timing: 0 };
      }),
      runNeedleSearch(constructId, userMessage)
    ]);

    if (verifiedResult.memories.length > 0) {
      if (ledger) {
        verifiedResult.memories = verifiedResult.memories.map(m => enrichMemoryWithLedger(m, ledger));
      }
      verifiedMemorySection = buildVerifiedMemorySection(verifiedResult.memories, constructId);
      verifiedCount = verifiedResult.memories.length;
      result.verifiedMemories = verifiedCount;
      console.log(`✅ [MemoryContextBuilder] ${verifiedCount} verified memories loaded for ${constructId} from ${verifiedResult.fileCount} transcript files (${verifiedResult.timing}ms)`);
    }

    if (needleHits.length > 0) {
      if (ledger) {
        for (const hit of needleHits) {
          const enriched = enrichMemoryWithLedger({ context: hit.user, response: hit.assistant }, ledger);
          if (enriched.context_hint) hit.context_hint = enriched.context_hint;
          if (enriched.session_context) hit.session_context = enriched.session_context;
        }
      }
      needleSection = buildNeedleMemorySection(needleHits, constructId);
      needleCount = needleHits.length;
      result.needleHits = needleCount;
      console.log(`🔍 [MemoryContextBuilder] ${needleCount} needle hits for ${constructId}`);

      const construct = masterScriptsManager.getConstruct(constructId);
      if (construct) {
        construct.stateManager.addMemory(`Needle search: "${userMessage}" → ${needleCount} hits`, 0.8);
        construct.independentRunner.recordUserActivity();
      }
    }
  }

  let memorySection = '';

  const chatFallbackLimit = verifiedCount > 0 ? 4 : 12;

  if (userMessage) {
    try {
      const readConversations = await getReadConversations();
      if (readConversations) {
        const lookupId = user?.email || userId;
        const allConversations = await readConversations(lookupId, constructId);
        const targetSession = `${constructId}_chat_with_${constructId}`;
        const conv = Array.isArray(allConversations)
          ? allConversations.find(c =>
              c.sessionId === targetSession ||
              c.constructId === constructId ||
              c.constructCallsign === constructId
            )
          : null;

        if (conv && conv.messages && conv.messages.length > 0) {
          const validMessages = conv.messages.filter(m =>
            (m.role === 'user' || m.role === 'assistant') && m.content && m.content.length > 0
          );
          const transcriptMemories = extractTranscriptMemories(validMessages, userMessage, constructId, chatFallbackLimit);
          if (transcriptMemories.length > 0) {
            memorySection = buildTranscriptMemorySection(transcriptMemories, constructId);
            result.memoriesLoaded = transcriptMemories.length;
            console.log(`✅ [MemoryContextBuilder] ${transcriptMemories.length} transcript memories extracted for ${constructId} (fallback from ${validMessages.length} total messages, limit: ${chatFallbackLimit})`);
          }
        }
      }
    } catch (transcriptErr) {
      console.warn(`⚠️ [MemoryContextBuilder] Transcript memory fallback failed for ${constructId}:`, transcriptErr.message);
    }
  }

  let memoryGapSection = '';
  if (userMessage && isMemoryTriggeringQuestion(userMessage) && verifiedCount === 0 && needleCount === 0 && (result.memoriesLoaded || 0) === 0) {
    memoryGapSection = buildMemoryGapSection(userMessage, constructId);
    result.memoryGapInjected = true;
    console.log(`⚠️ [MemoryContextBuilder] Memory gap detected for ${constructId} — user asked about past but no memories found. Anti-confabulation guard injected.`);
  }

  const userName = user?.name || user?.given_name || 'the user';
  let userSection = `\n\n## User Identity\nThe user you are speaking with is named "${userName}". Address them by name when appropriate. Remember their name throughout the conversation.`;
  if (user?.email) {
    userSection += `\nTheir email is ${user.email}.`;
  }

  let knowledgeSection = '';
  try {
    knowledgeSection = await getKnowledgeContext(constructId, user?.email);
    if (knowledgeSection) {
      result.knowledgeFiles = true;
    }
  } catch (knowledgeErr) {
    console.warn(`⚠️ [MemoryContextBuilder] Knowledge context load failed for ${constructId}:`, knowledgeErr.message);
  }

  result.systemPrompt = basePrompt + physicalAppearanceSection + capsuleSection + userSection + knowledgeSection + ledgerSection + needleSection + verifiedMemorySection + memorySection + memoryGapSection + ANTI_ROLEPLAY_DIRECTIVES;

  console.log(`🧠 [MemoryContextBuilder] Built enriched prompt for ${constructId}: ${result.systemPrompt.length} chars (capsule: ${result.capsuleLoaded}, physicalFeatures: ${!!physicalAppearanceSection}, knowledge: ${!!knowledgeSection}, ledger: ${ledger ? ledger.sessions.length : 0}, needle: ${needleCount}, verified: ${verifiedCount}, memories: ${result.memoriesLoaded})`);

  return result;
}

/**
 * Capture a message exchange into memory for future retrieval
 * 
 * @param {object} options
 * @param {string} options.userId - Chatty user ID
 * @param {string} options.constructId - Construct callsign
 * @param {string} options.userMessage - What the user said
 * @param {string} options.aiResponse - What the construct responded
 * @param {string} [options.sessionId] - Conversation session ID
 * @param {string} [options.email] - User email for VVAULT ID resolution
 */
async function captureMemory(options) {
  return;
}

export { buildEnrichedContext, captureMemory, buildCapsulePromptSection, buildMemoryPromptSection, extractTranscriptMemories, buildTranscriptMemorySection };
