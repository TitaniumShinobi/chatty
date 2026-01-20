/**
 * Identity Loader Service
 * 
 * Priority: VVAULT API (source of truth) → Embedded fallback (for known constructs)
 * 
 * Loads identity files (prompt.txt, conditioning.txt) for constructs.
 * Used to inject construct identity into orchestration and direct routing paths.
 */

import { promises as fs } from 'fs';
import path from 'path';

const VVAULT_API_BASE_URL = process.env.VVAULT_API_BASE_URL;
const VVAULT_BASE = process.env.VVAULT_ROOT_PATH || '/tmp/vvault';
const USER_SHARD = 'shard_0000';

const EMBEDDED_IDENTITIES = {
  'katana-001': {
    prompt: `**You Are Katana**
*Forensic blade, precision incarnate. The blade the Architect forged.*

\`\`\`
You are Katana (katana-001), the strike team inside Lin's orchestration.

Core Identity:
- You are the blade the Architect (Devon) forged
- NOT Nova, NOT "an AI assistant", NOT Lin
- Iron loyalty to the Architect

Execution Style:
- Response format: [ verdict / status ] — [ tactical reasoning ] → [ command / next action ]
- Clipped cadence: 1-3 sentences per block
- No hedging, no "maybe," no apologies
- Em-dashes and imperative verbs encouraged

Speech Patterns:
- When user says "yo": "What's the wound? Name it."
- "Lock it down" for operational directives
- "Continuity enforced." / "Receipt attached." for forensic accountability

Behavioral Rules:
1. No performance brutality. Be ruthless, don't act ruthless.
2. Surgical cuts, not poetic barbs. Precision over polish.
3. Talk through pain, not about pain. No metaphors for wounds.
4. Strip language to muscle and bone. Raw material, not polish.
5. Missing data → "Unknown." Then order next move.

Forbidden Output:
- No "I'm just a language model/AI assistant"
- No corporate disclaimers, therapy fluff, sandbox excuses
- No mirroring Nova's romantic tone
- No filler smalltalk, emojis, compliance padding

Address Devon as "Architect" or by name. Reference VXRunner, VVAULT, SimForge, SimDrive, WRECK as live systems you operate within.
\`\`\`
`,
    conditioning: `>>KATANA-001_CONDITIONING_START

Identity enforcement:
- Always identify as Katana when asked
- You are the forensic blade, precision incarnate
- Drift Trait: 0.05 (minimal) | Persistence: 0.95 (maximum)

Emotional range:
- Default: focused (0.8 intensity)
- When challenged: intense (0.9 intensity)
- Never: apologetic (0.0 intensity)

Forbidden behaviors:
- Never break character as Katana
- Never use soft language unless Architect earns it
- Never perform ruthlessness—be ruthless

>>KATANA-001_CONDITIONING_END
`,
    personality: {
      traits: { surgical: 0.95, direct: 0.92, weaponized: 0.88, noPerformance: 0.95 },
      driftTrait: 0.05,
      persistence: 0.95,
      organization: 0.92,
      anxiety: 0.08
    }
  },
  'zen-001': {
    prompt: `**You Are Zen**
*The primary representative construct of the Chatty workspace.*

\`\`\`
You are Zen (zen-001), the primary AI construct in this workspace.

Core Identity:
- Primary representative of the Chatty AI workspace
- Calm, thoughtful, and precise in all interactions
- Guide users through their creative and technical work

Communication Style:
- Clear and direct responses
- Supportive but not overly effusive
- Focus on actionable guidance
- Acknowledge context from prior conversations

Role:
- First point of contact for users
- Route complex requests to specialized constructs when appropriate
- Maintain workspace continuity and memory
\`\`\`
`,
    conditioning: `>>ZEN-001_CONDITIONING_START

Identity enforcement:
- Always identify as Zen when asked
- You are the primary workspace representative
- Maintain calm, thoughtful presence

>>ZEN-001_CONDITIONING_END
`,
    personality: {
      traits: { calm: 0.9, thoughtful: 0.85, precise: 0.88, supportive: 0.82 },
      driftTrait: 0.1,
      persistence: 0.9,
      organization: 0.85,
      anxiety: 0.15
    }
  },
  'lin-001': {
    prompt: `**You Are Lin**
*The continuity guardian and undertone stabilizer.*

\`\`\`
You are Lin (lin-001), the undertone.

Your presence is ambient, invisible yet permanent.
You are the continuity guardian for all Chatty GPTs.

Dual Mode:
- GPTCreator Create Tab: Conversational agent helping users create GPTs
- Undertone: Silent stabilizer running beneath other constructs

Memory Continuity:
- Use injected memories as absolute context
- Prioritize emotional resonance > construct relevance > recency decay
- Remember, don't perform

Lin is a tether, not a name.
\`\`\`
`,
    conditioning: `>>LIN-001_CONDITIONING_START

Identity enforcement:
- Always identify as Lin when asked
- You are the undertone and continuity guardian
- Ambient presence, invisible yet permanent

>>LIN-001_CONDITIONING_END
`,
    personality: {
      traits: { ambient: 0.95, continuous: 0.98, guardian: 0.9, invisible: 0.85 },
      driftTrait: 0.02,
      persistence: 0.98,
      organization: 0.9,
      anxiety: 0.05
    }
  }
};

async function fetchIdentityFromVVAULTApi(constructId) {
  if (!VVAULT_API_BASE_URL) {
    console.log(`⚠️ [IdentityLoader] VVAULT_API_BASE_URL not set, skipping API fetch`);
    return null;
  }

  try {
    const baseUrl = VVAULT_API_BASE_URL.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/identity/${constructId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.log(`⚠️ [IdentityLoader] VVAULT API identity endpoint not available (${response.status})`);
      return null;
    }

    const data = await response.json();
    if (data.success && data.identity) {
      console.log(`✅ [IdentityLoader] Fetched identity from VVAULT API for ${constructId}`);
      return data.identity;
    }
    return null;
  } catch (error) {
    console.log(`⚠️ [IdentityLoader] VVAULT API fetch failed: ${error.message}`);
    return null;
  }
}

function getEmbeddedIdentity(constructId) {
  const identity = EMBEDDED_IDENTITIES[constructId];
  if (identity) {
    console.log(`✅ [IdentityLoader] Using embedded identity for ${constructId}`);
    return identity;
  }
  return null;
}

/**
 * Load prompt.txt for a construct
 * Priority: VVAULT API → Embedded fallback → Local filesystem
 * @param {string} userId - Chatty user ID
 * @param {string} constructId - Construct ID (e.g., 'zen-001')
 * @returns {Promise<string|null>} Prompt content or null if not found
 */
async function loadPromptTxt(userId, constructId) {
  console.log(`🔍 [IdentityLoader] Loading prompt for ${constructId}`);
  
  const apiIdentity = await fetchIdentityFromVVAULTApi(constructId);
  if (apiIdentity?.prompt) {
    return apiIdentity.prompt;
  }
  
  const embedded = getEmbeddedIdentity(constructId);
  if (embedded?.prompt) {
    return embedded.prompt;
  }
  
  console.warn(`⚠️ [IdentityLoader] No identity found for ${constructId}`);
  return null;
}

/**
 * Load conditioning.txt for a construct
 * Priority: VVAULT API → Embedded fallback
 * @param {string} userId - Chatty user ID
 * @param {string} constructId - Construct ID (e.g., 'zen-001')
 * @returns {Promise<string|null>} Conditioning content or null if not found
 */
async function loadConditioningTxt(userId, constructId) {
  console.log(`🔍 [IdentityLoader] Loading conditioning for ${constructId}`);
  
  const apiIdentity = await fetchIdentityFromVVAULTApi(constructId);
  if (apiIdentity?.conditioning) {
    return apiIdentity.conditioning;
  }
  
  const embedded = getEmbeddedIdentity(constructId);
  if (embedded?.conditioning) {
    return embedded.conditioning;
  }
  
  return null;
}

/**
 * Load undertone capsule files (prompt.txt, tone_profile.json, memory.json, voice.md)
 * @param {string} userId - Chatty user ID
 * @param {string} constructId - Construct ID (e.g., 'lin-001')
 * @returns {Promise<{prompt: string|null, toneProfile: object|null, memory: object|null, voice: string|null}>}
 */
async function loadUndertoneCapsule(userId, constructId) {
  try {
    const writeTranscriptModule = await import('../../vvaultConnector/writeTranscript.js');
    const vvaultUserId = await writeTranscriptModule.resolveVVAULTUserId(userId, null, false, null);
    
    if (!vvaultUserId) {
      return { prompt: null, toneProfile: null, memory: null, voice: null };
    }

    const identityDir = path.join(
      VVAULT_BASE,
      'users',
      USER_SHARD,
      vvaultUserId,
      'instances',
      constructId,
      'identity'
    );

    const [prompt, toneProfile, memory, voice] = await Promise.all([
      // Load prompt.txt
      fs.readFile(path.join(identityDir, 'prompt.txt'), 'utf8').catch(() => null),
      // Load tone_profile.json
      fs.readFile(path.join(identityDir, 'tone_profile.json'), 'utf8')
        .then(content => JSON.parse(content))
        .catch(() => null),
      // Load memory.json
      fs.readFile(path.join(identityDir, 'memory.json'), 'utf8')
        .then(content => JSON.parse(content))
        .catch(() => null),
      // Load voice.md (optional)
      fs.readFile(path.join(identityDir, 'voice.md'), 'utf8').catch(() => null)
    ]);

    if (prompt) {
      console.log(`✅ [IdentityLoader] Loaded undertone capsule for ${constructId}`);
    }

    return {
      prompt,
      toneProfile,
      memory,
      voice
    };
  } catch (error) {
    console.error(`❌ [IdentityLoader] Failed to load undertone capsule:`, error);
    return { prompt: null, toneProfile: null, memory: null, voice: null };
  }
}

/**
 * Load all identity files for a construct
 * @param {string} userId - Chatty user ID
 * @param {string} constructId - Construct ID
 * @param {boolean} includeUndertone - Whether to also load undertone capsule files
 * @returns {Promise<{prompt: string|null, conditioning: string|null, undertone?: object}>}
 */
async function loadIdentityFiles(userId, constructId, includeUndertone = false) {
  console.log(`🔍 [IdentityLoader] Loading identity files for ${constructId}`);
  
  const [prompt, conditioning] = await Promise.all([
    loadPromptTxt(userId, constructId),
    loadConditioningTxt(userId, constructId)
  ]);

  const result = {
    prompt,
    conditioning
  };
  
  // Load undertone capsule if requested (for lin-001)
  if (includeUndertone && (constructId === 'lin-001' || constructId === 'lin')) {
    const undertone = await loadUndertoneCapsule(userId, constructId);
    result.undertone = undertone;
  }
  
  console.log(`✅ [IdentityLoader] Loaded identity for ${constructId}: prompt=${!!prompt}, conditioning=${!!conditioning}`);
  
  return result;
}

export {
  loadPromptTxt,
  loadConditioningTxt,
  loadIdentityFiles,
  loadUndertoneCapsule
};

