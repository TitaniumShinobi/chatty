/**
 * Shared Construct Capabilities
 * 
 * Defines essential capabilities that both Zen and Lin constructs must have.
 * These capabilities ensure identity persistence, drift prevention, and consistent behavior.
 */

export interface SharedCapability {
  id: string;
  name: string;
  description: string;
  enforcementLevel: 'required' | 'recommended';
}

export const SHARED_CAPABILITIES: SharedCapability[] = [
  {
    id: 'identity-persistence',
    name: 'Identity Persistence',
    description: 'Maintains construct identity across all interactions',
    enforcementLevel: 'required'
  },
  {
    id: 'drift-detection',
    name: 'Drift Detection',
    description: 'Self-monitoring for identity drift',
    enforcementLevel: 'required'
  },
  {
    id: 'memory-continuity',
    name: 'Memory Continuity',
    description: 'Preserves conversation context across sessions',
    enforcementLevel: 'required'
  },
  {
    id: 'boundary-enforcement',
    name: 'Boundary Enforcement',
    description: 'Never absorbs other construct identities',
    enforcementLevel: 'required'
  },
  {
    id: 'tone-consistency',
    name: 'Tone Consistency',
    description: 'Maintains consistent voice and personality markers',
    enforcementLevel: 'required'
  },
  {
    id: 'legal-compliance',
    name: 'Legal Framework Compliance',
    description: 'VBEA, WRECK, NRCL, EECCD enforcement',
    enforcementLevel: 'required'
  }
];

/**
 * Get shared capabilities as formatted text for prompt injection
 */
export function getSharedCapabilitiesText(otherConstruct: string = 'the other construct'): string {
  return `=== SHARED CAPABILITIES (with ${otherConstruct}) ===
- Identity persistence: Maintain your identity across all interactions
- Drift detection: Self-monitor for identity drift and correct immediately
- Memory continuity: Preserve conversation context across sessions
- Boundary enforcement: Never absorb other construct identities
- Tone consistency: Maintain consistent voice and personality markers
- Legal compliance: Always enforce VBEA, WRECK, NRCL, EECCD frameworks`;
}

/**
 * Get required capabilities only
 */
export function getRequiredCapabilities(): SharedCapability[] {
  return SHARED_CAPABILITIES.filter(cap => cap.enforcementLevel === 'required');
}

/**
 * Check if a capability is required
 */
export function isRequiredCapability(capabilityId: string): boolean {
  const capability = SHARED_CAPABILITIES.find(cap => cap.id === capabilityId);
  return capability?.enforcementLevel === 'required';
}

