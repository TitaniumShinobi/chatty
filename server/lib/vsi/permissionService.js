/**
 * VSI Permission Service
 * Manages permission grants and validation for VSI constructs
 */

import { 
  VSI_SCOPES, 
  DEFAULT_ZEN_PERMISSIONS, 
  DEFAULT_TRUST_POLICY,
  validateScope,
  scopeRequiresApproval
} from './types.js';

const permissionCache = new Map();

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function createRuntimeControls(overrides = {}) {
  const allowApplyEdits = overrides.allowApplyEdits ?? parseBoolean(process.env.AGENTS_ALLOW_APPLY_EDITS, false);
  const now = new Date().toISOString();

  return {
    allowApplyEdits,
    disabledAt: overrides.disabledAt ?? (allowApplyEdits ? null : now),
    disabledBy: overrides.disabledBy ?? (allowApplyEdits ? null : 'env:AGENTS_ALLOW_APPLY_EDITS'),
    disabledReason: overrides.disabledReason ?? (allowApplyEdits ? null : 'default_read_only'),
    updatedAt: overrides.updatedAt ?? now,
    updatedBy: overrides.updatedBy ?? (allowApplyEdits ? 'env:AGENTS_ALLOW_APPLY_EDITS' : 'default_read_only')
  };
}

export class PermissionService {
  constructor(options = {}) {
    this.grants = new Map();
    this.policies = new Map();
    this.runtimeControls = createRuntimeControls(options.runtimeControls || {});
    this.initializeZen();
  }

  initializeZen() {
    const zenId = 'zen-001';
    this.grants.set(zenId, {
      constructId: zenId,
      scopes: [...DEFAULT_ZEN_PERMISSIONS],
      grantedAt: new Date().toISOString(),
      grantedBy: 'system',
      active: true
    });
    this.policies.set(zenId, { ...DEFAULT_TRUST_POLICY, constructId: zenId });
    console.log(`✅ [PermissionService] Zen-001 initialized with ${DEFAULT_ZEN_PERMISSIONS.length} scopes`);
  }

  getConstructPermissions(constructId) {
    return this.grants.get(constructId) || null;
  }

  getConstructPolicy(constructId) {
    return this.policies.get(constructId) || null;
  }

  hasScope(constructId, scope) {
    const grant = this.grants.get(constructId);
    if (!grant || !grant.active) return false;
    return grant.scopes.includes(scope);
  }

  validateAction(constructId, scope) {
    if (!validateScope(scope)) {
      return { allowed: false, reason: `Invalid scope: ${scope}` };
    }

    if (!this.canApplyEdits() && scope.includes(':write:')) {
      return {
        allowed: false,
        reason: 'Agent runtime is read-only; apply/edit operations are disabled'
      };
    }

    const grant = this.grants.get(constructId);
    if (!grant) {
      return { allowed: false, reason: `No permissions granted to construct: ${constructId}` };
    }

    if (!grant.active) {
      return { allowed: false, reason: `Permissions suspended for construct: ${constructId}` };
    }

    if (!grant.scopes.includes(scope)) {
      return { allowed: false, reason: `Scope not granted: ${scope}` };
    }

    if (scopeRequiresApproval(scope)) {
      return { 
        allowed: true, 
        requiresApproval: true, 
        reason: `Scope ${scope} requires user approval` 
      };
    }

    return { allowed: true, requiresApproval: false };
  }

  grantScope(constructId, scope, grantedBy = 'system') {
    if (!validateScope(scope)) {
      throw new Error(`Invalid scope: ${scope}`);
    }

    let grant = this.grants.get(constructId);
    if (!grant) {
      grant = {
        constructId,
        scopes: [],
        grantedAt: new Date().toISOString(),
        grantedBy,
        active: true
      };
      this.grants.set(constructId, grant);
    }

    if (!grant.scopes.includes(scope)) {
      grant.scopes.push(scope);
      console.log(`🔐 [PermissionService] Granted ${scope} to ${constructId}`);
    }

    return grant;
  }

  revokeScope(constructId, scope) {
    const grant = this.grants.get(constructId);
    if (!grant) return false;

    const idx = grant.scopes.indexOf(scope);
    if (idx > -1) {
      grant.scopes.splice(idx, 1);
      console.log(`🔓 [PermissionService] Revoked ${scope} from ${constructId}`);
      return true;
    }
    return false;
  }

  suspendConstruct(constructId, reason) {
    const grant = this.grants.get(constructId);
    if (!grant) return false;

    grant.active = false;
    grant.suspendedAt = new Date().toISOString();
    grant.suspendReason = reason;
    console.log(`⛔ [PermissionService] Suspended ${constructId}: ${reason}`);
    return true;
  }

  reinstateConstruct(constructId) {
    const grant = this.grants.get(constructId);
    if (!grant) return false;

    grant.active = true;
    delete grant.suspendedAt;
    delete grant.suspendReason;
    console.log(`✅ [PermissionService] Reinstated ${constructId}`);
    return true;
  }

  updatePolicy(constructId, policyUpdates) {
    let policy = this.policies.get(constructId);
    if (!policy) {
      policy = { ...DEFAULT_TRUST_POLICY, constructId };
    }
    
    Object.assign(policy, policyUpdates);
    this.policies.set(constructId, policy);
    console.log(`📋 [PermissionService] Updated policy for ${constructId}`);
    return policy;
  }

  shouldAutoApprove(constructId, scope, riskLevel) {
    void constructId;
    void scope;
    void riskLevel;
    return false;
  }

  requiresPreview(constructId, scope) {
    const policy = this.policies.get(constructId);
    if (!policy) return true; // Default to requiring preview
    
    return policy.requirePreview.always.includes(scope);
  }

  canApplyEdits() {
    return Boolean(this.runtimeControls.allowApplyEdits);
  }

  getRuntimeControls() {
    return { ...this.runtimeControls };
  }

  setApplyEditsAllowed(allowApplyEdits, { actor = 'system', reason = null } = {}) {
    const now = new Date().toISOString();
    this.runtimeControls = {
      allowApplyEdits: Boolean(allowApplyEdits),
      disabledAt: allowApplyEdits ? null : now,
      disabledBy: allowApplyEdits ? null : actor,
      disabledReason: allowApplyEdits ? null : reason || 'manual_read_only',
      updatedAt: now,
      updatedBy: actor
    };
    return this.getRuntimeControls();
  }

  setReadOnlyMode({ actor = 'system', reason = 'manual_read_only' } = {}) {
    return this.setApplyEditsAllowed(false, { actor, reason });
  }

  toJSON(constructId) {
    return {
      permissions: this.grants.get(constructId) || null,
      policy: this.policies.get(constructId) || null,
      runtime: this.getRuntimeControls()
    };
  }
}

let instance = null;

export function getPermissionService() {
  if (!instance) {
    instance = new PermissionService();
  }
  return instance;
}

export default PermissionService;
