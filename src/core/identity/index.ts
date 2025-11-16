// Identity Enforcement System
// Exports all identity-related services and types

export {
  IdentityEnforcementService,
  identityEnforcement,
  SYSTEM_ENTITIES,
  RESERVED_CONSTRUCT_NAMES,
  IdentityViolationType,
  type IdentityViolation,
  type IdentityCheckResult,
  type MessageAttribution
} from './IdentityEnforcementService';

export {
  IdentityAwarePromptBuilder,
  identityAwarePromptBuilder,
  type IdentityAwarePromptOptions
} from './IdentityAwarePromptBuilder';

export {
  MessageAttributionService,
  messageAttributionService,
  type AttributedMessage
} from './MessageAttributionService';

export {
  IdentityDriftDetector,
  identityDriftDetector,
  type DriftDetectionResult
} from './IdentityDriftDetector';

