/**
 * Identity Loader Service
 * 
 * Priority: VVAULT API (source of truth) → Supabase canonical identity → Filesystem cache → Embedded fallback (system constructs only)
 * 
 * Loads identity files (prompt.txt, conditioning.txt) for constructs.
 * Used to inject construct identity into orchestration and direct routing paths.
 * 
 * ARCHITECTURE:
 * - User-created GPTs: Load from VVAULT API or filesystem (no embedded fallback)
 * - System constructs: Have catalog-backed embedded fallback for resilience where policy allows
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getVvaultBridgeConfig } from './vvaultBridgeConfig.js';
import { findConstructIdentityDir } from './vvaultPaths.js';
import {
  buildSystemConstructPromptDocument,
  getSystemConstructCatalogEntry,
} from '../../src/lib/systemConstructCatalog.js';

// Prefer VVAULT_ROOT_PATH; VVAULT_PATH for compatibility. Set for local capsule/watcher/transcript reads.
// SYSTEM & KNOWN CONSTRUCTS - Catalog-backed fallback when VVAULT API unavailable
// Priority: VVAULT API (source of truth) → Supabase canonical identity → Filesystem cache → Embedded fallback
// Note: Katana remains VVAULT/DB-only by policy
const SUPABASE_REQUIRED_IDENTITY_CONSTRUCTS = new Set(['nova-001', 'lin-001', 'lin']);
const ZEN_CANONICAL_IDENTITY_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.ZEN_CANONICAL_IDENTITY_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2500;
})();

function requiresSupabaseBackedIdentity(constructId) {
  const normalized = String(constructId || '').toLowerCase();
  return SUPABASE_REQUIRED_IDENTITY_CONSTRUCTS.has(normalized) ||
    normalized.startsWith('nova') ||
    normalized.startsWith('lin');
}

function isProtectedZenConstructId(constructId) {
  return String(constructId || '').trim().toLowerCase() === 'zen-001';
}

function buildDefaultConditioning(constructId, displayName = constructId) {
  return `>>${constructId.toUpperCase()}_CONDITIONING_START

Identity enforcement:
- Always identify as ${displayName} when asked
- Maintain your unique identity and personality

>>${constructId.toUpperCase()}_CONDITIONING_END
`;
}

async function fetchIdentityFromVVAULTApi(constructId, userEmail) {
  const { vvaultApiBaseUrl, serviceToken } = getVvaultBridgeConfig();
  if (!vvaultApiBaseUrl) {
    console.log(`⚠️ [IdentityLoader] VVAULT_API_BASE_URL not set, skipping API fetch`);
    return null;
  }

  try {
    const baseUrl = vvaultApiBaseUrl.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (serviceToken) headers['X-Chatty-Key'] = serviceToken;
    if (userEmail) headers['X-Chatty-User'] = userEmail;
    const response = await fetch(`${baseUrl}/api/identity/${constructId}`, {
      method: 'GET',
      headers,
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

function getSystemConstructIdentity(constructId) {
  // Katana: identity only from VVAULT/DB + gptConfig.instructions (no embedded name-specific block)
  if (constructId === 'katana-001') return null;
  if (requiresSupabaseBackedIdentity(constructId)) {
    console.warn(`⚠️ [IdentityLoader] Embedded identity fallback disabled for ${constructId}; canonical identity is required`);
    return null;
  }
  const entry = getSystemConstructCatalogEntry(constructId);
  if (entry) {
    console.log(`✅ [IdentityLoader] Using system construct identity for ${constructId}`);
    return {
      prompt: buildSystemConstructPromptDocument(entry),
      conditioning: entry.conditioning || buildDefaultConditioning(entry.callsign, entry.name),
      personality: entry.personality || null,
    };
  }
  // User-created GPTs have no embedded fallback - they must load from VVAULT
  return null;
}

async function resolveSupabaseUserIdForIdentity(userId) {
  try {
    const { resolveSupabaseUserIdFromEmailOrId } = await import('../auth/lib/supabaseUserResolver.js');
    return await resolveSupabaseUserIdFromEmailOrId(userId).catch(() => null);
  } catch {
    return null;
  }
}

async function loadCanonicalIdentityForConstruct(userId, constructId, supabaseUserId = null) {
  let resolvedSupabaseUserId = supabaseUserId;
  try {
    resolvedSupabaseUserId = supabaseUserId || await resolveSupabaseUserIdForIdentity(userId);
    const { loadCanonicalConstructIdentity } = await import('./constructIdentityRepository.js');
    const loadCanonicalIdentityPromise = loadCanonicalConstructIdentity({
      constructId,
      supabaseUserId: resolvedSupabaseUserId,
    });

    let canonicalIdentity;
    if (isProtectedZenConstructId(constructId)) {
      canonicalIdentity = await Promise.race([
        loadCanonicalIdentityPromise,
        new Promise((_, reject) => {
          setTimeout(() => {
            const timeoutError = new Error(`Canonical identity load timed out after ${ZEN_CANONICAL_IDENTITY_TIMEOUT_MS}ms`);
            timeoutError.code = 'CANONICAL_IDENTITY_TIMEOUT';
            reject(timeoutError);
          }, ZEN_CANONICAL_IDENTITY_TIMEOUT_MS);
        }),
      ]);
    } else {
      canonicalIdentity = await loadCanonicalIdentityPromise;
    }

    return {
      canonicalIdentity,
      supabaseUserId: resolvedSupabaseUserId,
      error: null,
      timedOut: false,
    };
  } catch (sbErr) {
    console.warn(`⚠️ [IdentityLoader] Supabase canonical identity load failed for ${constructId}:`, sbErr.message);
    return {
      canonicalIdentity: null,
      supabaseUserId: resolvedSupabaseUserId,
      error: sbErr,
      timedOut: sbErr?.code === 'CANONICAL_IDENTITY_TIMEOUT',
    };
  }
}

function buildIdentityContentResult(content, source, diagnostics = {}) {
  return {
    content,
    source,
    diagnostics,
  };
}

async function loadPromptTxtDetailed(userId, constructId, userEmail = null) {
  console.log(`🔍 [IdentityLoader] Loading prompt for ${constructId}`);

  const diagnostics = {
    strictIdentity: requiresSupabaseBackedIdentity(constructId),
    canonicalLoadError: null,
    filesystemIdentityDir: null,
  };

  const apiIdentity = await fetchIdentityFromVVAULTApi(constructId, userEmail);
  if (apiIdentity?.prompt) {
    return buildIdentityContentResult(apiIdentity.prompt, 'vvault_api', diagnostics);
  }

  const canonical = await loadCanonicalIdentityForConstruct(userId, constructId);
  const supabaseUserId = canonical.supabaseUserId;
  if (canonical.error) {
    diagnostics.canonicalLoadError = canonical.error.message;
    diagnostics.canonicalLoadTimedOut = canonical.timedOut === true;
  }
  if (canonical.canonicalIdentity?.instructions) {
    console.log(`✅ [IdentityLoader] Loaded prompt from canonical identity for ${constructId}`);
    return buildIdentityContentResult(canonical.canonicalIdentity.instructions, 'canonical_supabase', diagnostics);
  }
  if (diagnostics.strictIdentity) {
    console.warn(`⚠️ [IdentityLoader] Canonical prompt missing for ${constructId}; refusing filesystem/embedded fallback`);
    return buildIdentityContentResult(null, 'strict_canonical_missing', diagnostics);
  }

  try {
    const identityDir = await findConstructIdentityDir({ constructId, userId, supabaseUserId });
    diagnostics.filesystemIdentityDir = identityDir || null;
    if (identityDir) {
      const prompt = await fs.readFile(path.join(identityDir, 'prompt.txt'), 'utf8').catch(() => null);
      if (prompt) {
        console.log(`✅ [IdentityLoader] Loaded prompt.txt from filesystem for ${constructId}`);
        return buildIdentityContentResult(prompt, 'filesystem_identity', diagnostics);
      }
    }
  } catch (fsErr) {
    console.warn(`⚠️ [IdentityLoader] Filesystem prompt fallback failed for ${constructId}:`, fsErr.message);
  }

  const systemIdentity = getSystemConstructIdentity(constructId);
  if (systemIdentity?.prompt) {
    return buildIdentityContentResult(systemIdentity.prompt, 'embedded_system_identity', diagnostics);
  }

  console.warn(`⚠️ [IdentityLoader] No identity found for ${constructId} - ensure it exists in VVAULT`);
  return buildIdentityContentResult(null, 'missing', diagnostics);
}

async function loadConditioningTxtDetailed(userId, constructId, userEmail = null) {
  console.log(`🔍 [IdentityLoader] Loading conditioning for ${constructId}`);

  const diagnostics = {
    strictIdentity: requiresSupabaseBackedIdentity(constructId),
    canonicalLoadError: null,
    filesystemIdentityDir: null,
  };

  const apiIdentity = await fetchIdentityFromVVAULTApi(constructId, userEmail);
  if (apiIdentity?.conditioning) {
    return buildIdentityContentResult(apiIdentity.conditioning, 'vvault_api', diagnostics);
  }

  const canonical = await loadCanonicalIdentityForConstruct(userId, constructId);
  const supabaseUserId = canonical.supabaseUserId;
  if (canonical.error) {
    diagnostics.canonicalLoadError = canonical.error.message;
    diagnostics.canonicalLoadTimedOut = canonical.timedOut === true;
  }
  if (canonical.canonicalIdentity?.conditioning) {
    console.log(`✅ [IdentityLoader] Loaded conditioning from canonical identity for ${constructId}`);
    return buildIdentityContentResult(canonical.canonicalIdentity.conditioning, 'canonical_supabase', diagnostics);
  }
  if (diagnostics.strictIdentity) {
    console.warn(`⚠️ [IdentityLoader] Canonical conditioning missing for ${constructId}; refusing filesystem/embedded fallback`);
    return buildIdentityContentResult(null, 'strict_canonical_missing', diagnostics);
  }

  try {
    const identityDir = await findConstructIdentityDir({ constructId, userId, supabaseUserId });
    diagnostics.filesystemIdentityDir = identityDir || null;
    if (identityDir) {
      const conditioning = await fs.readFile(path.join(identityDir, 'conditioning.txt'), 'utf8').catch(() => null);
      if (conditioning) {
        console.log(`✅ [IdentityLoader] Loaded conditioning.txt from filesystem for ${constructId}`);
        return buildIdentityContentResult(conditioning, 'filesystem_identity', diagnostics);
      }
    }
  } catch (fsErr) {
    console.warn(`⚠️ [IdentityLoader] Filesystem conditioning fallback failed for ${constructId}:`, fsErr.message);
  }

  const systemIdentity = getSystemConstructIdentity(constructId);
  if (systemIdentity?.conditioning) {
    return buildIdentityContentResult(systemIdentity.conditioning, 'embedded_system_identity', diagnostics);
  }

  if (canonical.canonicalIdentity?.instructions || canonical.canonicalIdentity?.name) {
    console.warn(`⚠️ [IdentityLoader] Canonical identity missing conditioning for ${constructId}; synthesizing fallback`);
    return buildIdentityContentResult(
      buildDefaultConditioning(constructId, canonical.canonicalIdentity.name || constructId),
      'synthesized_canonical_conditioning',
      diagnostics,
    );
  }

  try {
    const { getSupabaseClient } = await import('./supabaseClient.js');
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = await supabase
        .from('vault_files')
        .select('content')
        .eq('construct_id', constructId)
        .like('filename', '%conditioning.txt')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.content) {
        console.log(`✅ [IdentityLoader] Loaded conditioning.txt from Supabase for ${constructId} (${data.content.length} chars)`);
        return buildIdentityContentResult(data.content, 'supabase_conditioning_fallback', diagnostics);
      }
    }
  } catch (sbErr) {
    console.warn(`⚠️ [IdentityLoader] Supabase conditioning fallback failed for ${constructId}:`, sbErr.message);
  }

  if (constructId && !getSystemConstructIdentity(constructId)) {
    console.warn(`⚠️ [IdentityLoader] Falling back to default GPT conditioning for ${constructId}`);
    return buildIdentityContentResult(buildDefaultConditioning(constructId), 'default_conditioning', diagnostics);
  }

  return buildIdentityContentResult(null, 'missing', diagnostics);
}

/**
 * Load prompt.txt for a construct
 * Priority: VVAULT API → Embedded fallback → Local filesystem
 * @param {string} userId - Chatty user ID
 * @param {string} constructId - Construct ID (e.g., 'zen-001')
 * @returns {Promise<string|null>} Prompt content or null if not found
 */
async function loadPromptTxt(userId, constructId, userEmail = null) {
  const result = await loadPromptTxtDetailed(userId, constructId, userEmail);
  return result.content;
}

/**
 * Load conditioning.txt for a construct
 * Priority: VVAULT API → Embedded fallback
 * @param {string} userId - Chatty user ID
 * @param {string} constructId - Construct ID (e.g., 'zen-001')
 * @returns {Promise<string|null>} Conditioning content or null if not found
 */
async function loadConditioningTxt(userId, constructId, userEmail = null) {
  const result = await loadConditioningTxtDetailed(userId, constructId, userEmail);
  return result.content;
}

/**
 * Load undertone capsule files (prompt.txt, tone_profile.json, memory.json, voice.md)
 * @param {string} userId - Chatty user ID
 * @param {string} constructId - Construct ID (e.g., 'lin-001')
 * @returns {Promise<{prompt: string|null, toneProfile: object|null, memory: object|null, voice: string|null}>}
 */
async function loadUndertoneCapsule(userId, constructId) {
  try {
    const { resolveSupabaseUserIdFromEmailOrId } = await import('../auth/lib/supabaseUserResolver.js');
    const supabaseUserId = await resolveSupabaseUserIdFromEmailOrId(userId).catch(() => null);
    const identityDir = await findConstructIdentityDir({ constructId, userId, supabaseUserId });
    if (!identityDir) {
      return { prompt: null, toneProfile: null, memory: null, voice: null };
    }

    const [prompt, toneProfile, memory, voice] = await Promise.all([
      // Load prompt.txt
      fs.readFile(path.join(identityDir, 'prompt.txt'), 'utf8').catch(() => null),
      // Load tone_profile.json from config first, then identity legacy path
      Promise.any([
        fs.readFile(path.join(identityDir, '..', 'config', 'tone_profile.json'), 'utf8'),
        fs.readFile(path.join(identityDir, 'tone_profile.json'), 'utf8'),
      ])
        .then((content) => JSON.parse(content))
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
async function loadIdentityFiles(userId, constructId, includeUndertone = false, userEmail = null) {
  console.log(`🔍 [IdentityLoader] Loading identity files for ${constructId}`);
  
  const [prompt, conditioning] = await Promise.all([
    loadPromptTxt(userId, constructId, userEmail),
    loadConditioningTxt(userId, constructId, userEmail)
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

async function loadIdentityFilesDetailed(userId, constructId, includeUndertone = false, userEmail = null) {
  console.log(`🔍 [IdentityLoader] Loading detailed identity files for ${constructId}`);

  const [promptResult, conditioningResult] = await Promise.all([
    loadPromptTxtDetailed(userId, constructId, userEmail),
    loadConditioningTxtDetailed(userId, constructId, userEmail),
  ]);

  const result = {
    prompt: promptResult.content,
    conditioning: conditioningResult.content,
    promptSource: promptResult.source,
    conditioningSource: conditioningResult.source,
    diagnostics: {
      prompt: promptResult.diagnostics || {},
      conditioning: conditioningResult.diagnostics || {},
    },
  };

  if (includeUndertone && (constructId === 'lin-001' || constructId === 'lin')) {
    const undertone = await loadUndertoneCapsule(userId, constructId);
    result.undertone = undertone;
  }

  return result;
}

export {
  loadPromptTxt,
  loadConditioningTxt,
  loadIdentityFiles,
  loadIdentityFilesDetailed,
  loadUndertoneCapsule,
  fetchIdentityFromVVAULTApi,
  requiresSupabaseBackedIdentity
};
