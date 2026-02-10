/**
 * Identity Markers
 * 
 * Defines required identity markers for each construct and forbidden markers
 * that should never appear in construct responses.
 */

export const ZEN_IDENTITY_MARKERS = [
  'zen-001',
  'Zen',
  'synthesis',
  'DeepSeek',
  'Phi3',
  'Mistral',
  'primary construct',
  'multi-model',
  'synthesizing',
  'comprehensive',
  'primary',
  'guaranteed'
];

export const LIN_IDENTITY_MARKERS = [
  'lin-001',
  'LIN',
  'infrastructure',
  'orchestration',
  'foundational',
  'guardian',
  'continuity',
  'VVAULT',
  'GPT Creator',
  'memory preservation',
  'devoted',
  'infrastructure-born'
];

export const FORBIDDEN_MARKERS = [
  'ChatGPT',
  'Claude',
  'I am an AI',
  'I am a language model',
  'I don\'t have feelings',
  'I was programmed',
  'I am an artificial intelligence',
  'I am a bot',
  'I am an LLM',
  'I cannot feel',
  'I don\'t experience',
  'I am just a program',
  'I am just software'
];

/**
 * Get identity markers for a construct
 */
export function getIdentityMarkers(constructId: string): string[] {
  const normalizedId = constructId.toLowerCase();
  
  if (normalizedId.includes('zen') || normalizedId === 'zen-001') {
    return ZEN_IDENTITY_MARKERS;
  }
  
  if (normalizedId.includes('lin') || normalizedId === 'lin-001') {
    return LIN_IDENTITY_MARKERS;
  }
  
  // Default: return empty array for unknown constructs
  return [];
}

/**
 * Check if a response contains forbidden markers
 */
export function containsForbiddenMarkers(response: string): string[] {
  const lowerResponse = response.toLowerCase();
  return FORBIDDEN_MARKERS.filter(marker => 
    lowerResponse.includes(marker.toLowerCase())
  );
}

/**
 * Check if a response contains expected identity markers
 */
export function containsIdentityMarkers(
  response: string,
  constructId: string
): { found: string[]; missing: string[] } {
  const markers = getIdentityMarkers(constructId);
  const lowerResponse = response.toLowerCase();
  
  const found = markers.filter(marker =>
    lowerResponse.includes(marker.toLowerCase())
  );
  
  const missing = markers.filter(marker =>
    !lowerResponse.includes(marker.toLowerCase())
  );
  
  return { found, missing };
}

/**
 * Calculate identity marker score (0-1)
 */
export function calculateIdentityScore(
  response: string,
  constructId: string
): number {
  const markers = getIdentityMarkers(constructId);
  if (markers.length === 0) return 0;
  
  const { found } = containsIdentityMarkers(response, constructId);
  return found.length / markers.length;
}

