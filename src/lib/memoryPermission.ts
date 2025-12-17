/**
 * Memory Permission Utility
 * 
 * Checks if memory operations are allowed based on user settings.
 * Handles both client-side (React context) and server-side scenarios.
 */

/**
 * Check if memory operations are allowed
 * 
 * @param settings - Optional settings object. If not provided, will try to access from context (client-side only)
 * @returns true if memory is allowed, false otherwise
 */
export function isMemoryAllowed(settings?: { personalization?: { allowMemory?: boolean } }): boolean {
  // If settings provided directly, use them
  if (settings?.personalization?.allowMemory !== undefined) {
    return settings.personalization.allowMemory;
  }

  // Client-side: Try to access from localStorage as fallback
  if (typeof window !== 'undefined') {
    try {
      const storedSettings = localStorage.getItem('chatty_settings_v2');
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        if (parsed?.personalization?.allowMemory !== undefined) {
          return parsed.personalization.allowMemory;
        }
      }
    } catch (error) {
      console.warn('[memoryPermission] Failed to read settings from localStorage:', error);
    }
  }

  // Default to false (memory disabled) if we can't determine the setting
  // This is a safe default that prevents memory operations when uncertain
  return false;
}

/**
 * Check if memory is allowed and log if disabled
 * 
 * @param settings - Optional settings object
 * @param operation - Name of the operation being gated (for logging)
 * @returns true if memory is allowed, false otherwise
 */
export function checkMemoryPermission(
  settings?: { personalization?: { allowMemory?: boolean } },
  operation?: string
): boolean {
  const allowed = isMemoryAllowed(settings);
  
  if (!allowed && operation) {
    console.log(`[memoryPermission] Memory operation "${operation}" blocked: allowMemory is disabled`);
  }
  
  return allowed;
}

