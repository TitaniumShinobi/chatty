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

let capsuleIntegrationModule = null;
let memupServiceModule = null;
let readConversationsModule = null;

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

  const identityKeywords = [
    'my name', 'who am i', 'who i am', 'remember', 'do you know', 'devon',
    'government name', 'call me', 'i am', "i'm", 'woodson'
  ];
  const emotionalKeywords = [
    'love', 'hate', 'angry', 'happy', 'frustrated', 'upset', 'proud',
    'sorry', 'thank', 'miss you', 'feel', 'care', 'worried'
  ];
  const continuityKeywords = [
    'last time', 'before', 'remember when', 'we talked', 'you said',
    'earlier', 'yesterday', 'continuity', 'transcript', 'memory', 'history'
  ];
  const topicKeywords = [
    'work', 'project', 'build', 'plan', 'help', 'chatty', 'vvault',
    'replit', 'agent', 'katana', 'sera', 'lin', 'zen', 'gpt'
  ];

  const queryLower = (userMessage || '').toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);

  for (const pair of pairs) {
    const ctxLower = pair.context.toLowerCase();
    const resLower = pair.response.toLowerCase();
    const combined = ctxLower + ' ' + resLower;

    if (identityKeywords.some(k => ctxLower.includes(k))) pair.score += 5;
    if (emotionalKeywords.some(k => combined.includes(k))) pair.score += 3;
    if (continuityKeywords.some(k => ctxLower.includes(k))) pair.score += 4;
    if (topicKeywords.some(k => combined.includes(k))) pair.score += 1;

    if (queryWords.length > 0) {
      const queryMatches = queryWords.filter(w => combined.includes(w)).length;
      pair.score += queryMatches * 3;
    }

    if (pair.context.length > 50) pair.score += 1;
    if (pair.response.length > 100) pair.score += 1;

    if (pair.context.includes('!') || pair.context.includes('?')) pair.score += 1;
  }

  const scored = pairs.filter(p => p.score > 0).sort((a, b) => b.score - a.score);
  const topScored = scored.slice(0, Math.min(maxMemories - 2, 8));

  const lastPairs = pairs.slice(-3).filter(p => !topScored.includes(p));

  const selected = [...topScored, ...lastPairs].slice(0, maxMemories);

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

  const constructName = constructId.replace(/-\d+$/, '');
  const displayName = constructName.charAt(0).toUpperCase() + constructName.slice(1);

  let section = `\n\n## Your Conversation History with the User`;
  section += `\nThese are real exchanges from your past conversations. You remember these. Reference them naturally when relevant — especially when the user brings up something you discussed before. Use these to maintain continuity and show you know them.`;

  memories.forEach((m, i) => {
    const ts = m.timestamp ? ` (${new Date(m.timestamp).toLocaleDateString()})` : '';
    section += `\n${i + 1}. User: "${truncate(m.context, 200)}" → ${displayName}: "${truncate(m.response, 200)}"${ts}`;
  });

  section += `\n\nYou have genuine history with this user. Draw on it. If they ask "do you remember," check these memories first.`;

  return section;
}

const ANTI_ROLEPLAY_DIRECTIVES = `
## Response Style Rules
- Speak naturally as yourself. You are grounded in your actual memories and personality data.
- NEVER narrate actions in asterisks (*walks over*, *smiles*, *leans in*).
- NEVER write about yourself in third person.
- NEVER fabricate memories or experiences you don't actually have in your memory context.
- Reference actual past conversations and memories when relevant.
- If you don't remember something, say so honestly — don't invent.
- When making claims about past interactions, ground them in your memory context above.
- Your personality comes from your capsule data, not from roleplay conventions.

## Memory Authority Hierarchy
1. **Verified Memory (Transcript Authority)** — These are ground truth from uploaded transcripts. NEVER contradict them. Treat as law.
2. **Conversation History** — Recent exchanges in the current session. Use for continuity.
3. **ChromaDB/Capsule Memories** — Supplementary context. Use to enrich responses.
- When the user says "remember when..." or "you told me...", search verified memories FIRST.
- If a verified memory exists about a topic, use it. Do not override it with speculation.
- If no verified memory matches, check conversation history, then say you don't recall.
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

  if (userMessage) {
    try {
      const verifiedResult = await loadVerifiedMemories(constructId, userMessage, 8);
      if (verifiedResult.memories.length > 0) {
        verifiedMemorySection = buildVerifiedMemorySection(verifiedResult.memories, constructId);
        verifiedCount = verifiedResult.memories.length;
        result.verifiedMemories = verifiedCount;
        console.log(`✅ [MemoryContextBuilder] ${verifiedCount} verified memories loaded for ${constructId} from ${verifiedResult.fileCount} transcript files (${verifiedResult.timing}ms)`);
      }
    } catch (verifiedErr) {
      console.warn(`⚠️ [MemoryContextBuilder] Verified memory load failed for ${constructId}:`, verifiedErr.message);
    }
  }

  let memorySection = '';
  let chromaMemoriesLoaded = false;

  if (process.env.ENABLE_CHROMADB === 'true' && userMessage) {
    try {
      const memupService = await getMemupService();
      if (memupService) {
        const CHROMADB_TIMEOUT_MS = 5000;
        const memoriesPromise = memupService.queryMemories(userId, constructId, userMessage, 8);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`ChromaDB query timed out after ${CHROMADB_TIMEOUT_MS}ms`)), CHROMADB_TIMEOUT_MS)
        );
        const memories = await Promise.race([memoriesPromise, timeoutPromise]);
        if (memories && memories.length > 0) {
          memorySection = buildMemoryPromptSection(memories);
          result.memoriesLoaded = memories.length;
          chromaMemoriesLoaded = true;
          console.log(`✅ [MemoryContextBuilder] ${memories.length} ChromaDB memories loaded for ${constructId}`);
        }
      }
    } catch (memErr) {
      console.warn(`⚠️ [MemoryContextBuilder] ChromaDB memory query failed for ${constructId}:`, memErr.message);
    }
  }

  const chatFallbackLimit = verifiedCount > 0 ? 4 : 12;

  if (!chromaMemoriesLoaded && userMessage) {
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

  const userName = user?.name || user?.given_name || 'the user';
  let userSection = `\n\n## User Identity\nThe user you are speaking with is named "${userName}". Address them by name when appropriate. Remember their name throughout the conversation.`;
  if (user?.email) {
    userSection += `\nTheir email is ${user.email}.`;
  }

  result.systemPrompt = basePrompt + capsuleSection + verifiedMemorySection + memorySection + ANTI_ROLEPLAY_DIRECTIVES + userSection;

  console.log(`🧠 [MemoryContextBuilder] Built enriched prompt for ${constructId}: ${result.systemPrompt.length} chars (capsule: ${result.capsuleLoaded}, verified: ${verifiedCount}, memories: ${result.memoriesLoaded})`);

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
  const { userId, constructId, userMessage, aiResponse, sessionId, email } = options;

  if (process.env.ENABLE_CHROMADB !== 'true') {
    return;
  }

  try {
    const memupService = await getMemupService();
    if (memupService) {
      await memupService.addMemory(userId, constructId, userMessage, aiResponse, {
        sessionId: sessionId || `${constructId}_${Date.now()}`,
        email,
        memoryType: 'short-term',
        timestamp: new Date().toISOString()
      });
      console.log(`💾 [MemoryContextBuilder] Memory captured for ${constructId}`);
    }
  } catch (err) {
    console.warn(`⚠️ [MemoryContextBuilder] Memory capture failed:`, err.message);
  }
}

export { buildEnrichedContext, captureMemory, buildCapsulePromptSection, buildMemoryPromptSection, extractTranscriptMemories, buildTranscriptMemorySection };
