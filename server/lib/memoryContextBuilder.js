/**
 * Memory Context Builder
 * 
 * Centralizes the construction of enriched system prompts by loading:
 * 1. Identity files (prompt.txt, conditioning.txt) via identityLoader
 * 2. Capsule data (MBTI, Big Five, traits, memories) via capsuleIntegration
 * 3. Memory context (recent exchanges) via memupMemoryService
 * 4. Anti-roleplay directives
 * 5. User personalization context
 * 
 * This replaces the bare prompt.txt loading in the primary message path
 * and the capsule-only injection in the fallback path, unifying both into
 * a single always-on pipeline.
 */

import { loadIdentityFiles } from './identityLoader.js';

let capsuleIntegrationModule = null;
let memupServiceModule = null;

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

  let memorySection = '';
  if (process.env.ENABLE_CHROMADB === 'true' && userMessage) {
    try {
      const memupService = await getMemupService();
      if (memupService) {
        const memories = await memupService.queryMemories(userId, constructId, userMessage, 8);
        if (memories && memories.length > 0) {
          memorySection = buildMemoryPromptSection(memories);
          result.memoriesLoaded = memories.length;
          console.log(`✅ [MemoryContextBuilder] ${memories.length} memories loaded for ${constructId}`);
        }
      }
    } catch (memErr) {
      console.warn(`⚠️ [MemoryContextBuilder] Memory query failed for ${constructId}:`, memErr.message);
    }
  }

  const userName = user?.name || user?.given_name || 'the user';
  let userSection = `\n\n## User Identity\nThe user you are speaking with is named "${userName}". Address them by name when appropriate. Remember their name throughout the conversation.`;
  if (user?.email) {
    userSection += `\nTheir email is ${user.email}.`;
  }

  result.systemPrompt = basePrompt + capsuleSection + memorySection + ANTI_ROLEPLAY_DIRECTIVES + userSection;

  console.log(`🧠 [MemoryContextBuilder] Built enriched prompt for ${constructId}: ${result.systemPrompt.length} chars (capsule: ${result.capsuleLoaded}, memories: ${result.memoriesLoaded})`);

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

export { buildEnrichedContext, captureMemory, buildCapsulePromptSection, buildMemoryPromptSection };
