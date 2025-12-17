/**
 * Identity Loader Service
 * 
 * Loads identity files (prompt.txt, conditioning.txt) from VVAULT instance directories.
 * Used to inject construct identity into orchestration and direct routing paths.
 */

import { promises as fs } from 'fs';
import path from 'path';

const DEBUG_LOG_PATH = '/Users/devonwoodson/Documents/GitHub/.cursor/debug.log';
const DEBUG_ENDPOINT = 'http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073';

async function debugLog(location, message, data, hypothesisId) {
  const logEntry = {
    location,
    message,
    data,
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'run1',
    hypothesisId
  };
  
  const logLine = JSON.stringify(logEntry) + '\n';
  
  // Try fetch first (Node.js 18+ has native fetch)
  try {
    if (typeof fetch !== 'undefined') {
      await fetch(DEBUG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      }).catch(() => {
        // Fallback to file if fetch fails
        fs.appendFile(DEBUG_LOG_PATH, logLine).catch(() => {});
      });
    } else {
      // Try node-fetch if global fetch unavailable
      try {
        const nodeFetch = (await import('node-fetch')).default;
        await nodeFetch(DEBUG_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logEntry)
        }).catch(() => {
          fs.appendFile(DEBUG_LOG_PATH, logLine).catch(() => {});
        });
      } catch {
        // Direct file logging fallback
        fs.appendFile(DEBUG_LOG_PATH, logLine).catch(() => {});
      }
    }
  } catch {
    // Direct file logging fallback
    fs.appendFile(DEBUG_LOG_PATH, logLine).catch(() => {});
  }
}

const VVAULT_BASE = process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
const USER_SHARD = 'shard_0000';

/**
 * Load prompt.txt from identity directory
 * @param {string} userId - Chatty user ID
 * @param {string} constructId - Construct ID (e.g., 'zen-001')
 * @returns {Promise<string|null>} Prompt content or null if not found
 */
async function loadPromptTxt(userId, constructId) {
  // #region agent log
  debugLog('identityLoader.js:20', 'loadPromptTxt entry', { userId, constructId, vvaultBase: VVAULT_BASE }, 'A');
  // #endregion
  try {
    const writeTranscriptModule = await import('../../vvaultConnector/writeTranscript.js');
    // #region agent log
    debugLog('identityLoader.js:25', 'writeTranscriptModule imported', {
      hasResolveVVAULTUserId: !!writeTranscriptModule.resolveVVAULTUserId,
      hasDefault: !!writeTranscriptModule.default,
      moduleKeys: Object.keys(writeTranscriptModule)
    }, 'A');
    // #endregion
    
    // Handle both ES module and CommonJS import patterns
    // Test shows: resolveVVAULTUserId is available directly on the module
    const resolveFn = writeTranscriptModule.resolveVVAULTUserId;
    if (!resolveFn || typeof resolveFn !== 'function') {
      console.error(`❌ [IdentityLoader] resolveVVAULTUserId not found in writeTranscript module. Available keys:`, Object.keys(writeTranscriptModule));
      // #region agent log
      debugLog('identityLoader.js:31', 'resolveVVAULTUserId not found', { moduleKeys: Object.keys(writeTranscriptModule) }, 'A');
      // #endregion
      return null;
    }
    
    console.log(`🔍 [IdentityLoader] Calling resolveVVAULTUserId for userId: ${userId}`);
    let vvaultUserId;
    try {
      vvaultUserId = await resolveFn(userId, null, false, null);
      console.log(`✅ [IdentityLoader] resolveVVAULTUserId returned: ${vvaultUserId}`);
    } catch (resolveError) {
      console.error(`❌ [IdentityLoader] resolveVVAULTUserId threw error:`, resolveError);
      // #region agent log
      debugLog('identityLoader.js:38', 'resolveVVAULTUserId error', { errorMessage: resolveError.message, errorStack: resolveError.stack }, 'A');
      // #endregion
      throw resolveError;
    }
    
    // #region agent log
    debugLog('identityLoader.js:40', 'vvaultUserId resolved', { vvaultUserId, userId }, 'A');
    // #endregion
    
    if (!vvaultUserId) {
      console.warn(`[IdentityLoader] Cannot resolve VVAULT user ID for: ${userId}`);
      // #region agent log
      debugLog('identityLoader.js:27', 'vvaultUserId is null', { userId }, 'A');
      // #endregion
      return null;
    }

    const promptPath = path.join(
      VVAULT_BASE,
      'users',
      USER_SHARD,
      vvaultUserId,
      'instances',
      constructId,
      'identity',
      'prompt.txt'
    );

    // #region agent log
    debugLog('identityLoader.js:42', 'attempting to read prompt.txt', { promptPath }, 'A');
    // #endregion

    try {
      const content = await fs.readFile(promptPath, 'utf8');
      console.log(`✅ [IdentityLoader] Loaded prompt.txt for ${constructId}`);
      // #region agent log
      debugLog('identityLoader.js:45', 'prompt.txt loaded successfully', { constructId, contentLength: content.length }, 'A');
      // #endregion
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`⚠️ [IdentityLoader] prompt.txt not found for ${constructId} at ${promptPath}`);
        // #region agent log
        debugLog('identityLoader.js:49', 'prompt.txt not found', { constructId, promptPath, errorCode: error.code }, 'A');
        // #endregion
      } else {
        console.error(`❌ [IdentityLoader] Error loading prompt.txt for ${constructId}:`, error);
        // #region agent log
        debugLog('identityLoader.js:52', 'prompt.txt read error', { constructId, promptPath, errorMessage: error.message, errorCode: error.code }, 'A');
        // #endregion
      }
      return null;
    }
  } catch (error) {
    console.error(`❌ [IdentityLoader] Failed to load prompt.txt:`, error);
    // #region agent log
    debugLog('identityLoader.js:55', 'loadPromptTxt catch block', { userId, constructId, errorMessage: error.message, errorStack: error.stack }, 'A');
    // #endregion
    return null;
  }
}

/**
 * Load conditioning.txt from identity directory
 * @param {string} userId - Chatty user ID
 * @param {string} constructId - Construct ID (e.g., 'zen-001')
 * @returns {Promise<string|null>} Conditioning content or null if not found
 */
async function loadConditioningTxt(userId, constructId) {
  try {
    const writeTranscriptModule = await import('../../vvaultConnector/writeTranscript.js');
    const vvaultUserId = await writeTranscriptModule.resolveVVAULTUserId(userId, null, false, null);
    
    if (!vvaultUserId) {
      return null;
    }

    const conditioningPath = path.join(
      VVAULT_BASE,
      'users',
      USER_SHARD,
      vvaultUserId,
      'instances',
      constructId,
      'identity',
      'conditioning.txt'
    );

    try {
      const content = await fs.readFile(conditioningPath, 'utf8');
      console.log(`✅ [IdentityLoader] Loaded conditioning.txt for ${constructId}`);
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Conditioning is optional, so don't warn
        return null;
      }
      console.error(`❌ [IdentityLoader] Error loading conditioning.txt for ${constructId}:`, error);
      return null;
    }
  } catch (error) {
    console.error(`❌ [IdentityLoader] Failed to load conditioning.txt:`, error);
    return null;
  }
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
  // #region agent log
  debugLog('identityLoader.js:109', 'loadIdentityFiles entry', { userId, constructId, includeUndertone }, 'B');
  // #endregion
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
  
  // #region agent log
  debugLog('identityLoader.js:118', 'loadIdentityFiles result', {
    hasPrompt: !!prompt,
    hasConditioning: !!conditioning,
    promptLength: prompt?.length || 0,
    conditioningLength: conditioning?.length || 0,
    hasUndertone: !!result.undertone
  }, 'B');
  // #endregion
  
  return result;
}

export {
  loadPromptTxt,
  loadConditioningTxt,
  loadIdentityFiles,
  loadUndertoneCapsule
};

