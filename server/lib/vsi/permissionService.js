/**
 * VSI Permission Service
 * Manages permission grants and validation for VSI constructs
 */

import { 
  VSI_SCOPES, 
  DEFAULT_ZEN_PERMISSIONS, 
  DEFAULT_TRUST_POLICY,
  validateScope,
  isScopeReadOnly,
  scopeRequiresApproval
} from './types.js';

const permissionCache = new Map();

export class PermissionService {
  constructor() {
    this.grants = new Map();
    this.policies = new Map();
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
    const policy = this.policies.get(constructId);
    if (!policy || !policy.autoApprove.enabled) return false;

    const scopeAllowed = policy.autoApprove.scopes.includes(scope) || 
                         policy.autoApprove.scopes.includes('*');
    const riskAllowed = policy.autoApprove.riskLevels.includes(riskLevel) ||
                        policy.autoApprove.riskLevels.includes('*');

    return scopeAllowed && riskAllowed;
  }

  requiresPreview(constructId, scope) {
    const policy = this.policies.get(constructId);
    if (!policy) return true; // Default to requiring preview
    
    return policy.requirePreview.always.includes(scope);
  }

  toJSON(constructId) {
    return {
      permissions: this.grants.get(constructId) || null,
      policy: this.policies.get(constructId) || null
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
