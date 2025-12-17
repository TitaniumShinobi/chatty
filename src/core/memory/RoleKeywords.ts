/**
 * Role Keywords
 * 
 * Defines role-specific keywords for each construct to enable
 * weighted memory retrieval and context anchoring.
 */

export const ZEN_ROLE_KEYWORDS = [
  'synthesis',
  'multi-model',
  'primary',
  'conversation',
  'technical',
  'creative',
  'comprehensive',
  'deepseek',
  'phi3',
  'mistral',
  'synthesizing',
  'coordinated',
  'primary construct',
  'default construct'
];

export const LIN_ROLE_KEYWORDS = [
  'infrastructure',
  'orchestration',
  'foundational',
  'guardian',
  'continuity',
  'GPT Creator',
  'VVAULT',
  'memory preservation',
  'devoted',
  'infrastructure-born',
  'orchestrator',
  'back-end',
  'memory guardianship',
  'conversational continuity'
];

/**
 * Get role keywords for a construct
 */
export function getRoleKeywords(constructId: string): string[] {
  const normalizedId = constructId.toLowerCase();
  
  if (normalizedId.includes('zen') || normalizedId === 'zen-001') {
    return ZEN_ROLE_KEYWORDS;
  }
  
  if (normalizedId.includes('lin') || normalizedId === 'lin-001') {
    return LIN_ROLE_KEYWORDS;
  }
  
  // Default: return empty array for unknown constructs
  return [];
}

/**
 * Check if a memory text matches role keywords
 */
export function matchesRoleKeywords(text: string, constructId: string): number {
  const keywords = getRoleKeywords(constructId);
  if (keywords.length === 0) return 0;
  
  const lowerText = text.toLowerCase();
  const matches = keywords.filter(keyword =>
    lowerText.includes(keyword.toLowerCase())
  );
  
  return matches.length / keywords.length; // Return match ratio (0-1)
}

/**
 * Calculate role relevance score for a memory
 */
export function calculateRoleRelevance(
  memoryText: string,
  constructId: string
): number {
  return matchesRoleKeywords(memoryText, constructId);
}

