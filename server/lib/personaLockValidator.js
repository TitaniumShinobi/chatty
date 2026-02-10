/**
 * Persona Lock Validation Utility
 * 
 * Validates persona locks to prevent prompt bypass and ensure single prompt source.
 * Used by backend routes and services to enforce lock integrity.
 */

/**
 * Validate persona lock requirements
 * @param {Object} options - Validation options
 * @param {Object} options.personaLock - Persona lock object with constructId and remaining
 * @param {string} options.constructId - Requested construct ID
 * @param {string} options.personaSystemPrompt - System prompt from orchestrator
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePersonaLock({ personaLock, constructId, personaSystemPrompt }) {
  // If no lock, validation passes (no restrictions)
  if (!personaLock) {
    return { valid: true };
  }

  // Lock is active - enforce strict requirements
  const expectedConstructId = personaLock.constructId;
  
  // 1. Check constructId matches lock
  if (constructId && constructId !== expectedConstructId && !constructId.includes(expectedConstructId)) {
    return {
      valid: false,
      error: `Lock violation: expected constructId ${expectedConstructId}, got ${constructId}`
    };
  }

  // 2. Check systemPrompt is provided
  if (!personaSystemPrompt || typeof personaSystemPrompt !== 'string' || personaSystemPrompt.trim() === '') {
    return {
      valid: false,
      error: `Lock active for ${expectedConstructId} but no systemPrompt provided from orchestrator`
    };
  }

  return { valid: true };
}

/**
 * Middleware for Express routes to validate persona lock
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function personaLockValidationMiddleware(req, res, next) {
  const { personaLock, constructId, personaSystemPrompt } = req.body || {};

  // Only validate if lock is present
  if (personaLock) {
    const validation = validatePersonaLock({ personaLock, constructId, personaSystemPrompt });
    
    if (!validation.valid) {
      console.error(`❌ [PersonaLockValidator] Validation failed: ${validation.error}`);
      return res.status(403).json({
        success: false,
        error: validation.error,
        code: 'PERSONA_LOCK_VIOLATION'
      });
    }
    
    console.log(`✅ [PersonaLockValidator] Lock validated for ${personaLock.constructId}`);
  }

  next();
}

