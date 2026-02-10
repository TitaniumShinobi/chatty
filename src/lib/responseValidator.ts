/**
 * Response Validator
 * 
 * Validates Lin responses to ensure they maintain character consistency
 * and don't contain meta-commentary or generation notes.
 */

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  hasMetaCommentary: boolean;
  hasGenerationNotes: boolean;
  maintainsFirstPerson: boolean;
}

/**
 * Validate a Lin response for character consistency
 */
export function validateLinResponse(response: string): ValidationResult {
  const issues: string[] = [];
  let hasMetaCommentary = false;
  let hasGenerationNotes = false;
  let maintainsFirstPerson = true;

  // Check for meta-commentary patterns
  const metaCommentaryPatterns = [
    /You understand (it'?s|that|the).+/i,
    /The user seems (interested|to want|to be).+/i,
    /The user (is asking|wants|understands).+/i,
    /The user's (request|query|question).+/i
  ];

  for (const pattern of metaCommentaryPatterns) {
    if (pattern.test(response)) {
      hasMetaCommentary = true;
      issues.push(`Meta-commentary detected: "${pattern}"`);
      break;
    }
  }

  // Check for generation notes
  const generationNotePatterns = [
    /Here'?s? (?:a |the )?response (that|which).+/i,
    /Here'?s? (?:a |the )?response:/i,
    /Here is a (response|reply).+/i,
    /Response:.+/i,
    /Here'?s how (you|I) (should|can) respond/i
  ];

  for (const pattern of generationNotePatterns) {
    if (pattern.test(response)) {
      hasGenerationNotes = true;
      issues.push(`Generation notes detected: "${pattern}"`);
      break;
    }
  }

  // Check for first-person voice (Lin should speak in first person)
  // Look for patterns that suggest third-person or meta-analysis
  const thirdPersonPatterns = [
    /^The assistant (understands|sees|knows)/i,
    /^The GPT creation assistant (thinks|believes|suggests)/i
  ];

  // Check if response starts with first-person Lin voice
  const firstPersonStart = /^(I'?m|I am|I'?ll|I can|I will|I'm here|I help)/i.test(response.trim());
  
  // If it doesn't start with first person AND matches third-person patterns, flag it
  if (!firstPersonStart) {
    for (const pattern of thirdPersonPatterns) {
      if (pattern.test(response)) {
        maintainsFirstPerson = false;
        issues.push(`Third-person voice detected: "${pattern}"`);
        break;
      }
    }
  }

  const valid = !hasMetaCommentary && !hasGenerationNotes && maintainsFirstPerson;

  return {
    valid,
    issues,
    hasMetaCommentary,
    hasGenerationNotes,
    maintainsFirstPerson
  };
}

/**
 * Quick check if response needs filtering
 */
export function needsFiltering(response: string): boolean {
  const validation = validateLinResponse(response);
  return !validation.valid;
}

