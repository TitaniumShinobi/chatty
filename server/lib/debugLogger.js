/**
 * Debug Logger - Conditional debug logging helper
 * 
 * Only attempts HTTP fetch to debug endpoint if DEBUG_MODE env var is set.
 * Always falls back to file logging for reliability.
 */

import { promises as fs } from 'fs';

const DEBUG_LOG_PATH = '/Users/devonwoodson/Documents/GitHub/.cursor/debug.log';
const DEBUG_ENDPOINT = 'http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073';
const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || process.env.NODE_ENV === 'development';

/**
 * Log debug entry - tries HTTP fetch only if DEBUG_MODE enabled, always writes to file
 */
export async function debugLog(location, message, data = {}, hypothesisId = null) {
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
  
  // Always write to file first (most reliable)
  try {
    await fs.appendFile(DEBUG_LOG_PATH, logLine);
  } catch (fileErr) {
    // File write failed - that's okay, continue
  }
  
  // Only try HTTP fetch if DEBUG_MODE is enabled (reduces console noise)
  if (DEBUG_MODE && typeof fetch !== 'undefined') {
    try {
      await fetch(DEBUG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      }).catch(() => {
        // HTTP fetch failed - that's expected if debug server isn't running
        // File logging already happened above, so we're good
      });
    } catch {
      // Fetch not available or failed - file logging already happened
    }
  }
}

/**
 * Inline debug log for one-liner usage (browser-compatible)
 * Returns a no-op function if DEBUG_MODE is disabled
 */
export function createDebugLog(location, hypothesisId = null) {
  if (!DEBUG_MODE && typeof window === 'undefined') {
    // Server-side and DEBUG_MODE disabled - return no-op
    return () => {};
  }
  
  return (message, data = {}) => {
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
    
    // Browser: try fetch (will fail silently if server not running)
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      fetch(DEBUG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      }).catch(() => {});
    }
    
    // Server: write to file
    if (typeof window === 'undefined') {
      fs.appendFile(DEBUG_LOG_PATH, logLine).catch(() => {});
    }
  };
}

