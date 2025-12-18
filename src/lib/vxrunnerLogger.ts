/**
 * VXRunner Logger
 * 
 * Logs persona violations to VXRunner endpoint or JSON file for tracking and analysis.
 */

export interface PersonaViolation {
  type: 'meta_plural_leak' | 'greeting_injection' | 'content_leakage' | 'tone_drift';
  constructId: string;
  threadId: string;
  timestamp: string;
  content: string;
  detectedPattern?: string;
  context?: string;
}

/**
 * Log persona violation to VXRunner endpoint or JSON file
 * Non-blocking - failures won't break response flow
 */
export function logPersonaViolation(violation: PersonaViolation): void {
  try {
    // Try to log to VXRunner endpoint first
    const vxrunnerEndpoint = 'http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073';
    
    const logEntry = {
      location: 'vxrunnerLogger.ts',
      message: `Persona violation detected: ${violation.type}`,
      data: {
        type: violation.type,
        constructId: violation.constructId,
        threadId: violation.threadId,
        timestamp: violation.timestamp,
        content: violation.content.substring(0, 200), // Truncate for logging
        detectedPattern: violation.detectedPattern,
        context: violation.context
      },
      timestamp: Date.now(),
      sessionId: violation.threadId || 'unknown',
      runId: `violation-${Date.now()}`,
      hypothesisId: violation.type.charAt(0).toUpperCase()
    };

    // Non-blocking fetch - don't await, just fire and forget
    fetch(vxrunnerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logEntry)
    }).catch((error) => {
      // If VXRunner endpoint fails, try to log to console at least
      console.warn(`[VXRunnerLogger] Failed to log to VXRunner endpoint:`, error);
      console.warn(`[VXRunnerLogger] Violation:`, logEntry);
    });

    // Also log to console for immediate visibility
    console.warn(`[VXRunnerLogger] Persona violation detected:`, {
      type: violation.type,
      constructId: violation.constructId,
      threadId: violation.threadId,
      content: violation.content.substring(0, 100)
    });
  } catch (error) {
    // Even if everything fails, don't break the response flow
    console.error(`[VXRunnerLogger] Error logging violation:`, error);
  }
}

/**
 * Helper to create violation from detected pattern
 */
export function createViolation(
  type: PersonaViolation['type'],
  constructId: string,
  threadId: string,
  content: string,
  detectedPattern?: string,
  context?: string
): PersonaViolation {
  return {
    type,
    constructId,
    threadId,
    timestamp: new Date().toISOString(),
    content,
    detectedPattern,
    context
  };
}

