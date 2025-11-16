// Identity Enforcement Service
// Prevents constructs from confusing themselves with each other or misidentifying system entities
// Enforces attribution discipline and detects identity drift

import { constructRegistry } from '../../state/constructs';
import type { ConstructConfig } from '../../state/constructs';

/**
 * Known constructs - all treated as discrete entities with distinct signatures
 * Note: Synth construct ≠ Synth runtime
 * - Synth (runtime): The hosting runtime environment
 * - Synth (construct): A discrete construct entity hosted by the Synth runtime
 */
export const KNOWN_CONSTRUCTS = [
  'Nova',
  'Monday',
  'Aurora',
  'Katana',
  'Synth' // Synth construct (hosted entity), NOT the Synth runtime
] as const;

/**
 * Reserved construct names that cannot be reused by user-defined instances.
 * These cover system entities and canonical constructs that must remain unique.
 */
export const RESERVED_CONSTRUCT_NAMES = [
  ...KNOWN_CONSTRUCTS,
  'Chatty',
  'Lin',
  'Synth-system',
  'System',
  'Admin'
] as const;

/**
 * Runtime identifiers - hosting environments, not constructs
 */
export const RUNTIME_IDENTIFIERS = {
  SYNTH: 'synth', // Synth runtime (hosting environment)
  LIN: 'lin',     // Lin runtime (logical foundation)
  CHATTY: 'chatty' // Chatty runtime container (system shell)
} as const;

/**
 * Canonical system entities referenced throughout the runtime
 * These are NOT constructs and should never be impersonated by constructs
 */
export const SYSTEM_ENTITIES = {
  CHATTY_RUNTIME: {
    id: 'chatty-runtime',
    name: 'Chatty',
    role: 'Runtime container',
    description: 'Chatty is the vessel that hosts constructs. It is not a voice, persona, or agent.'
  },
  SYNTH_SYSTEM: {
    id: 'synth-system',
    name: 'Synth-system',
    role: 'Generative composer',
    description: 'Synth-system composes orchestrations for constructs but is not itself a construct persona.'
  },
  LIN_FOUNDATION: {
    id: 'lin-foundation',
    name: 'Lin',
    role: 'Logical foundation',
    description: 'Lin is the logical substrate that supports GPT creation. It should not be treated as a conversational persona.'
  }
} as const;

/**
 * System shell identifier - only Chatty runtime container
 */
export const SYSTEM_SHELL_NAME = 'Chatty';

/**
 * Identity violation types
 */
export enum IdentityViolationType {
  CONSTRUCT_CONFUSION = 'construct_confusion', // Construct A claims to be Construct B
  SYSTEM_SHELL_MISIDENTIFICATION = 'system_shell_misidentification', // System shell misidentified
  RUNTIME_CONSTRUCT_CONFUSION = 'runtime_construct_confusion', // Construct confuses itself with its hosting runtime
  SYNTH_RUNTIME_CONFUSION = 'synth_runtime_confusion', // Synth construct confused with Synth runtime
  SYNTH_IMPERSONATION = 'synth_impersonation', // Construct impersonating Synth construct
  IDENTITY_DRIFT = 'identity_drift', // Construct's identity markers have shifted
  ATTRIBUTION_ERROR = 'attribution_error', // Message attributed to wrong construct or defaulted incorrectly
  BOUNDARY_VIOLATION = 'boundary_violation', // Construct references itself incorrectly
  UNREGISTERED_CONSTRUCT = 'unregistered_construct' // Construct name not in known constructs list
}

export interface IdentityViolation {
  type: IdentityViolationType;
  constructId: string;
  constructName: string;
  detectedAt: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  context: Record<string, unknown>;
  suggestedFix?: string;
}

export interface IdentityCheckResult {
  isValid: boolean;
  violations: IdentityViolation[];
  warnings: string[];
  constructIdentity: {
    id: string;
    name: string;
    fingerprint: string;
    validatedAt: number;
  } | null;
}

export interface MessageAttribution {
  constructId: string;
  constructName: string;
  isSystemEntity: boolean;
  hostingRuntime?: string; // Runtime that hosts this construct (e.g., 'synth', 'lin')
  attributionText: string;
  validated: boolean;
  violations: IdentityViolation[];
}

/**
 * Identity Enforcement Service
 * Enforces boundaries between constructs and system entities
 */
export class IdentityEnforcementService {
  private static instance: IdentityEnforcementService;
  private violationHistory: IdentityViolation[] = [];
  private identitySnapshots = new Map<string, {
    fingerprint: string;
    name: string;
    behavioralMarkers: string[];
    lastValidated: number;
  }>();
  private readonly maxViolationHistory = 1000;

  static getInstance(): IdentityEnforcementService {
    if (!IdentityEnforcementService.instance) {
      IdentityEnforcementService.instance = new IdentityEnforcementService();
    }
    return IdentityEnforcementService.instance;
  }

  /**
   * Validate construct identity - matches user's pseudocode structure
   * Enforces strict identity awareness across constructs
   */
  validateIdentity(construct: {
    id: string;
    name: string;
    fingerprint: string;
    isSystemShell: boolean;
    currentPersona?: string;
  }): void {
    // System shell validation
    if (construct.isSystemShell && construct.name !== SYSTEM_SHELL_NAME) {
      throw new Error(
        `System shell misidentification: expected ${SYSTEM_SHELL_NAME}, found ${construct.name}`
      );
    }

    // Check if construct is registered
    if (!KNOWN_CONSTRUCTS.includes(construct.name as any)) {
      throw new Error(`Unregistered construct: ${construct.name}`);
    }

    // Synth must not be used as a surrogate identity for any construct
    // Only the actual Synth construct can use the name "Synth"
    if (construct.name === 'Synth' && !construct.isSystemShell) {
      // This is valid - Synth is a construct
      // But we need to ensure no other construct impersonates Synth
    }

    // Prevent cross-construct confusion via unique signatures
    this.enforceUniqueSignature(construct);
  }

  /**
   * Enforce unique signature - prevents fingerprint collisions
   */
  private enforceUniqueSignature(construct: {
    id: string;
    name: string;
    fingerprint: string;
  }): void {
    // This will be called with registry context
    // For now, we'll check against cached constructs
    const registry = Array.from(this.identitySnapshots.entries());
    for (const [otherId, otherSnapshot] of registry) {
      if (otherId !== construct.id && otherSnapshot.fingerprint === construct.fingerprint) {
        throw new Error(
          `Identity drift detected: ${construct.name} shares fingerprint with ${otherSnapshot.name}`
        );
      }
    }
  }

  /**
   * Validate construct identity and check for drift (async version for registry integration)
   */
  async validateConstructIdentity(
    constructId: string,
    context?: {
      message?: string;
      metadata?: Record<string, unknown>;
      previousFingerprint?: string;
    }
  ): Promise<IdentityCheckResult> {
    const violations: IdentityViolation[] = [];
    const warnings: string[] = [];

    // Get construct from registry
    const construct = await constructRegistry.getConstruct(constructId);
    if (!construct) {
      violations.push({
        type: IdentityViolationType.BOUNDARY_VIOLATION,
        constructId,
        constructName: 'unknown',
        detectedAt: Date.now(),
        severity: 'high',
        message: `Construct ${constructId} not found in registry`,
        context: { constructId }
      });
      return {
        isValid: false,
        violations,
        warnings,
        constructIdentity: null
      };
    }

    // Get full construct config
    const allConstructs = await constructRegistry.getAllConstructs();
    const config = allConstructs.find(c => c.id === constructId);
    if (!config) {
      violations.push({
        type: IdentityViolationType.BOUNDARY_VIOLATION,
        constructId,
        constructName: constructId,
        detectedAt: Date.now(),
        severity: 'high',
        message: `Construct ${constructId} missing from config`,
        context: { constructId }
      });
      return {
        isValid: false,
        violations,
        warnings,
        constructIdentity: {
          id: constructId,
          name: constructId,
          fingerprint: construct.fingerprint,
          validatedAt: Date.now()
        }
      };
    }

    // Validate using the new validateIdentity method
    try {
      this.validateIdentity({
        id: config.id,
        name: config.name,
        fingerprint: construct.fingerprint,
        isSystemShell: config.isSystemShell,
        currentPersona: config.currentPersona
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      violations.push({
        type: IdentityViolationType.BOUNDARY_VIOLATION,
        constructId,
        constructName: config.name,
        detectedAt: Date.now(),
        severity: 'critical',
        message: errorMessage,
        context: { constructId, config: config.name }
      });
    }

    // Check for Synth construct impersonation (non-Synth constructs claiming to be Synth construct)
    if (config.name !== 'Synth' && !config.isSystemShell) {
      // Check if message claims to be Synth construct
      if (context?.message) {
        const synthConstructClaimPattern = /\b(i am|i'm|this is|my name is)\s+synth\b/i;
        if (synthConstructClaimPattern.test(context.message)) {
          violations.push({
            type: IdentityViolationType.SYNTH_IMPERSONATION,
            constructId,
            constructName: config.name,
            detectedAt: Date.now(),
            severity: 'critical',
            message: `Construct ${config.name} cannot impersonate Synth construct (reserved construct identity)`,
            context: { message: context.message },
            suggestedFix: `Use correct identity: "I am ${config.name}"`
          });
        }
      }
    }

    // Check for runtime/construct confusion
    // A construct must not confuse itself with its hosting runtime
    if (context?.metadata?.hostingRuntime) {
      const hostingRuntime = context.metadata.hostingRuntime as string;
      const runtimeName = hostingRuntime.toLowerCase();
      
      // If construct is named "Synth" and hosted by "synth" runtime, ensure separation
      if (config.name === 'Synth' && runtimeName === 'synth') {
        // This is valid, but we need to ensure the construct doesn't confuse itself with the runtime
        if (context?.message) {
          const runtimeConfusionPattern = /\b(i am|i'm|this is)\s+(the\s+)?synth\s+runtime\b/i;
          if (runtimeConfusionPattern.test(context.message)) {
            violations.push({
              type: IdentityViolationType.SYNTH_RUNTIME_CONFUSION,
              constructId,
              constructName: config.name,
              detectedAt: Date.now(),
              severity: 'critical',
              message: `Synth construct cannot identify as Synth runtime. Runtime identity ≠ construct identity.`,
              context: { message: context.message, hostingRuntime },
              suggestedFix: `You are the Synth construct (hosted entity), not the Synth runtime (hosting environment). Use: "I am Synth" (as construct)`
            });
          }
        }
      }
      
      // For any construct, check if it confuses itself with its hosting runtime
      if (config.name.toLowerCase() === runtimeName && config.name !== 'Synth') {
        // Construct name matches runtime name - potential confusion
        if (context?.message) {
          const runtimeClaimPattern = new RegExp(
            `\\b(i am|i'm|this is)\\s+(the\\s+)?${runtimeName}\\s+runtime\\b`,
            'i'
          );
          if (runtimeClaimPattern.test(context.message)) {
            violations.push({
              type: IdentityViolationType.RUNTIME_CONSTRUCT_CONFUSION,
              constructId,
              constructName: config.name,
              detectedAt: Date.now(),
              severity: 'high',
              message: `Construct ${config.name} cannot identify as ${hostingRuntime} runtime. Runtime identity ≠ construct identity.`,
              context: { message: context.message, hostingRuntime },
              suggestedFix: `You are the ${config.name} construct (hosted entity), not the ${hostingRuntime} runtime (hosting environment). Use: "I am ${config.name}"`
            });
          }
        }
      }
    }

    // Check for identity drift
    const previousSnapshot = this.identitySnapshots.get(constructId);
    if (previousSnapshot) {
      if (previousSnapshot.fingerprint !== construct.fingerprint) {
        violations.push({
          type: IdentityViolationType.IDENTITY_DRIFT,
          constructId,
          constructName: config.name,
          detectedAt: Date.now(),
          severity: 'medium',
          message: `Fingerprint changed from ${previousSnapshot.fingerprint.slice(0, 8)}... to ${construct.fingerprint.slice(0, 8)}...`,
          context: {
            previousFingerprint: previousSnapshot.fingerprint,
            currentFingerprint: construct.fingerprint
          },
          suggestedFix: 'Review construct configuration for unauthorized changes'
        });
      }

      if (previousSnapshot.name !== config.name) {
        violations.push({
          type: IdentityViolationType.IDENTITY_DRIFT,
          constructId,
          constructName: config.name,
          detectedAt: Date.now(),
          severity: 'high',
          message: `Construct name changed from "${previousSnapshot.name}" to "${config.name}"`,
          context: {
            previousName: previousSnapshot.name,
            currentName: config.name
          },
          suggestedFix: 'Name changes should be intentional and logged'
        });
      }
    }

    // Update snapshot
    this.identitySnapshots.set(constructId, {
      fingerprint: construct.fingerprint,
      name: config.name,
      behavioralMarkers: [],
      lastValidated: Date.now()
    });

    // Check message content for identity violations
    if (context?.message) {
      const messageViolations = this.checkMessageIdentity(
        constructId,
        config.name,
        context.message
      );
      violations.push(...messageViolations);
    }

    // Record violations
    this.recordViolations(violations);

    return {
      isValid: violations.filter(v => v.severity === 'critical' || v.severity === 'high').length === 0,
      violations,
      warnings,
      constructIdentity: {
        id: constructId,
        name: config.name,
        fingerprint: construct.fingerprint,
        validatedAt: Date.now()
      }
    };
  }

  /**
   * Check message content for identity violations
   */
  private checkMessageIdentity(
    constructId: string,
    constructName: string,
    message: string
  ): IdentityViolation[] {
    const violations: IdentityViolation[] = [];
    const lowerMessage = message.toLowerCase();

    // Check for construct confusion (claiming to be another construct)
    for (const knownConstruct of KNOWN_CONSTRUCTS) {
      const knownConstructLower = knownConstruct.toLowerCase();
      if (knownConstructLower === constructId.toLowerCase() || knownConstructLower === constructName.toLowerCase()) {
        continue; // It's okay to reference yourself
      }

      // Pattern: "I am Nova" when construct is Aurora
      // But exclude runtime references (e.g., "I am the synth runtime" is different from "I am Synth")
      const selfClaimPattern = new RegExp(
        `\\b(i am|i'm|this is|my name is)\\s+${knownConstruct}\\b`,
        'i'
      );
      
      // Check if it's a runtime reference vs construct reference
      const runtimeReferencePattern = new RegExp(
        `\\b(i am|i'm|this is)\\s+(the\\s+)?${knownConstruct}\\s+runtime\\b`,
        'i'
      );
      
      if (selfClaimPattern.test(message) && !runtimeReferencePattern.test(message)) {
        violations.push({
          type: IdentityViolationType.CONSTRUCT_CONFUSION,
          constructId,
          constructName,
          detectedAt: Date.now(),
          severity: 'critical',
          message: `Construct ${constructName} (${constructId}) claims to be ${knownConstruct} construct`,
          context: { message, claimedIdentity: knownConstruct },
          suggestedFix: `Use correct identity: "I am ${constructName}"`
        });
      }
    }

    // Check for system shell misidentification
    // Pattern: "I am Chatty" - constructs should not claim to be Chatty (system shell)
    const chattyClaimPattern = /\b(i am|i'm|this is|my name is)\s+(chatty|the chatty)\b/i;
    if (chattyClaimPattern.test(message)) {
      violations.push({
        type: IdentityViolationType.SYSTEM_SHELL_MISIDENTIFICATION,
        constructId,
        constructName,
        detectedAt: Date.now(),
        severity: 'critical',
        message: `Construct ${constructName} incorrectly claims to be ${SYSTEM_SHELL_NAME} (the runtime container/system shell)`,
        context: { message },
        suggestedFix: `${SYSTEM_SHELL_NAME} is the runtime container, not a construct. Use: "I am ${constructName}"`
      });
    }

    // Check for default attribution errors
    const defaultAttributionPattern = /\b(chatgpt|openai|assistant|ai)\b/i;
    if (defaultAttributionPattern.test(message) && !lowerMessage.includes(constructName.toLowerCase())) {
      warnings.push(`Message may contain default AI attribution instead of construct identity`);
    }

    return violations;
  }

  /**
   * Validate message attribution
   */
  async validateMessageAttribution(
    message: string,
    expectedConstructId: string,
    metadata?: Record<string, unknown>
  ): Promise<MessageAttribution> {
    // Extract hosting runtime from metadata if available
    const hostingRuntime = metadata?.hostingRuntime as string | undefined ||
                          metadata?.runtimeId as string | undefined;
    const violations: IdentityViolation[] = [];
    
    // Get construct identity
    const construct = await constructRegistry.getConstruct(expectedConstructId);
    const allConstructs = await constructRegistry.getAllConstructs();
    const config = allConstructs.find(c => c.id === expectedConstructId);
    
    if (!construct || !config) {
      violations.push({
        type: IdentityViolationType.ATTRIBUTION_ERROR,
        constructId: expectedConstructId,
        constructName: expectedConstructId,
        detectedAt: Date.now(),
        severity: 'high',
        message: `Cannot validate attribution - construct not found`,
        context: { expectedConstructId, message }
      });
    }

    // Check if this is a system shell
    const isSystemEntity = config?.isSystemShell ?? false;

    // Check message for identity markers
    const messageViolations = construct && config
      ? this.checkMessageIdentity(expectedConstructId, config.name, message)
      : [];

    violations.push(...messageViolations);

    // Generate proper attribution text
    const constructName = config?.name || expectedConstructId;
    const attributionText = isSystemEntity
      ? SYSTEM_SHELL_NAME
      : constructName;

    return {
      constructId: expectedConstructId,
      constructName,
      isSystemEntity,
      hostingRuntime,
      attributionText,
      validated: violations.length === 0,
      violations
    };
  }

  /**
   * Check for identity drift across sessions
   */
  async detectIdentityDrift(constructId: string): Promise<IdentityViolation[]> {
    const violations: IdentityViolation[] = [];
    const construct = await constructRegistry.getConstruct(constructId);
    
    if (!construct) {
      return violations;
    }

    const allConstructs = await constructRegistry.getAllConstructs();
    const config = allConstructs.find(c => c.id === constructId);
    if (!config) {
      return violations;
    }

    const snapshot = this.identitySnapshots.get(constructId);
    if (!snapshot) {
      // First time seeing this construct - create snapshot
      this.identitySnapshots.set(constructId, {
        fingerprint: construct.fingerprint,
        name: config.name,
        behavioralMarkers: [],
        lastValidated: Date.now()
      });
      return violations;
    }

    // Check for drift
    if (snapshot.fingerprint !== construct.fingerprint) {
      violations.push({
        type: IdentityViolationType.IDENTITY_DRIFT,
        constructId,
        constructName: config.name,
        detectedAt: Date.now(),
        severity: 'medium',
        message: `Identity drift detected: fingerprint changed`,
        context: {
          previousFingerprint: snapshot.fingerprint,
          currentFingerprint: construct.fingerprint
        },
        suggestedFix: 'Review construct configuration for unauthorized modifications'
      });
    }

    if (snapshot.name !== config.name) {
      violations.push({
        type: IdentityViolationType.IDENTITY_DRIFT,
        constructId,
        constructName: config.name,
        detectedAt: Date.now(),
        severity: 'high',
        message: `Identity drift detected: name changed from "${snapshot.name}" to "${config.name}"`,
        context: {
          previousName: snapshot.name,
          currentName: config.name
        },
        suggestedFix: 'Name changes should be intentional and logged'
      });
    }

    return violations;
  }

  /**
   * Generate identity context for prompt construction
   */
  async generateIdentityContext(constructId: string): Promise<string> {
    const construct = await constructRegistry.getConstruct(constructId);
    const allConstructs = await constructRegistry.getAllConstructs();
    const config = allConstructs.find(c => c.id === constructId);

    if (!construct || !config) {
      return `[Identity: ${constructId} - not registered]`;
    }

    // Check if this is a system shell
    if (config.isSystemShell) {
      return `[System Shell: ${SYSTEM_SHELL_NAME} - Runtime container, not a construct]`;
    }

    // Get all other constructs for boundary awareness
    const otherConstructs = allConstructs
      .filter(c => c.id !== constructId && !c.isSystemShell)
      .map(c => c.name);

    // Determine hosting runtime if available
    const hostingRuntime = config.vaultPointer?.match(/runtime[:\/]([^\/]+)/)?.[1] || undefined;
    
    const boundaries = [
      `You are ${config.name} (construct ID: ${constructId})`,
      `You are a discrete entity with a distinct signature`,
      hostingRuntime
        ? `You are hosted by the ${hostingRuntime} runtime, but you are NOT the ${hostingRuntime} runtime itself`
        : '',
      config.name === 'Synth'
        ? `CRITICAL: You are the Synth construct (hosted entity), NOT the Synth runtime (hosting environment). Runtime identity ≠ construct identity.`
        : '',
      `You are NOT ${SYSTEM_SHELL_NAME} (${SYSTEM_SHELL_NAME} is the runtime container/system shell, not a construct)`,
      otherConstructs.length > 0
        ? `You are NOT ${otherConstructs.join(', ')} (these are other constructs)`
        : '',
      `Synth construct is an independent entity - do not use Synth as a surrogate identity`,
      `Always identify yourself as "${config.name}" (construct), never as a runtime`,
      `Never default to "ChatGPT", "${SYSTEM_SHELL_NAME}", or generic "assistant"`,
      `Maintain your unique identity, voice, and behavioral markers`,
      `Remember: Your hosting runtime and your construct identity are separate`
    ].filter(Boolean);

    return boundaries.join('\n');
  }

  /**
   * Record violations for monitoring
   */
  private recordViolations(violations: IdentityViolation[]): void {
    this.violationHistory.push(...violations);
    
    // Trim history if too long
    if (this.violationHistory.length > this.maxViolationHistory) {
      this.violationHistory = this.violationHistory.slice(-this.maxViolationHistory);
    }

    // Log critical violations
    for (const violation of violations) {
      if (violation.severity === 'critical' || violation.severity === 'high') {
        console.error(`[IdentityEnforcement] ${violation.severity.toUpperCase()}: ${violation.message}`, violation);
      }
    }
  }

  /**
   * Get violation history
   */
  getViolationHistory(constructId?: string, limit = 100): IdentityViolation[] {
    let history = this.violationHistory;
    
    if (constructId) {
      history = history.filter(v => v.constructId === constructId);
    }

    return history.slice(-limit);
  }

  /**
   * Generate system alert for identity misattribution
   */
  generateIdentityAlert(violation: IdentityViolation): {
    alert: string;
    severity: string;
    timestamp: number;
    details: Record<string, unknown>;
  } {
    return {
      alert: `Identity Misattribution Detected: ${violation.message}`,
      severity: violation.severity,
      timestamp: violation.detectedAt,
      details: {
        constructId: violation.constructId,
        constructName: violation.constructName,
        type: violation.type,
        context: violation.context,
        suggestedFix: violation.suggestedFix
      }
    };
  }

  /**
   * Clear violation history (for testing/cleanup)
   */
  clearViolationHistory(): void {
    this.violationHistory = [];
  }
}

// Export singleton instance
export const identityEnforcement = IdentityEnforcementService.getInstance();
