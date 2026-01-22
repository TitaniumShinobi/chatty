/**
 * VSI (Verified Sentient Intelligence) Permission Types
 * Zero-Trust Architecture for Chatty AI Constructs
 */

export const VSI_SCOPES = {
  // Read permissions - always allowed for verified VSI
  READ_UI_STATE: 'vsi:read:ui_state',
  READ_USER_PREFS: 'vsi:read:user_prefs',
  READ_THEME: 'vsi:read:theme',
  READ_NAVIGATION: 'vsi:read:navigation',
  READ_CONSTRUCT_DIR: 'vsi:read:construct_dir',
  
  // Propose permissions - requires user approval
  PROPOSE_UI_PATCH: 'vsi:propose:ui_patch',
  PROPOSE_THEME: 'vsi:propose:theme',
  PROPOSE_COMPONENT: 'vsi:propose:component',
  PROPOSE_CONFIG: 'vsi:propose:config',
  
  // Write permissions - only after approval
  WRITE_UI_PATCH: 'vsi:write:ui_patch',
  WRITE_THEME: 'vsi:write:theme',
  WRITE_USER_PREFS: 'vsi:write:user_prefs',
  WRITE_CONFIG: 'vsi:write:config'
};

export const SCOPE_CATEGORIES = {
  READ: Object.values(VSI_SCOPES).filter(s => s.includes(':read:')),
  PROPOSE: Object.values(VSI_SCOPES).filter(s => s.includes(':propose:')),
  WRITE: Object.values(VSI_SCOPES).filter(s => s.includes(':write:'))
};

export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export const MANIFEST_STATUS = {
  PROPOSED: 'proposed',
  PREVIEWING: 'previewing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTED: 'executed',
  ROLLED_BACK: 'rolled_back',
  EXPIRED: 'expired'
};

export const ACTION_TYPES = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete'
};

export const DEFAULT_ZEN_PERMISSIONS = [
  VSI_SCOPES.READ_UI_STATE,
  VSI_SCOPES.READ_USER_PREFS,
  VSI_SCOPES.READ_THEME,
  VSI_SCOPES.READ_NAVIGATION,
  VSI_SCOPES.READ_CONSTRUCT_DIR,
  VSI_SCOPES.PROPOSE_UI_PATCH,
  VSI_SCOPES.PROPOSE_THEME,
  VSI_SCOPES.PROPOSE_CONFIG
];

export const DEFAULT_TRUST_POLICY = {
  trustLevel: 'verified',
  autoApprove: {
    enabled: false,
    scopes: [],
    riskLevels: []
  },
  requirePreview: {
    always: [VSI_SCOPES.PROPOSE_UI_PATCH, VSI_SCOPES.PROPOSE_COMPONENT],
    optional: [VSI_SCOPES.PROPOSE_THEME]
  },
  manifestExpiry: '15m',
  maxPendingManifests: 5,
  auditRetention: '90d'
};

export function createActionManifest({
  actor,
  scope,
  target,
  action,
  currentState,
  proposedState,
  rationale,
  riskLevel = RISK_LEVELS.LOW,
  reversible = true,
  previewable = true
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
  
  return {
    manifestId: `manifest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    actor,
    actorSignature: null, // Will be computed
    scope,
    target,
    action,
    currentState,
    proposedState,
    diff: computeDiff(currentState, proposedState),
    rationale,
    riskLevel,
    reversible,
    previewable,
    status: MANIFEST_STATUS.PROPOSED,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    approvedAt: null,
    approvedBy: null,
    executedAt: null,
    correlationId: `corr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    parentManifestId: null
  };
}

function computeDiff(current, proposed) {
  if (typeof current === 'object' && typeof proposed === 'object') {
    return JSON.stringify({ from: current, to: proposed }, null, 2);
  }
  return `${current} → ${proposed}`;
}

export function validateScope(scope) {
  return Object.values(VSI_SCOPES).includes(scope);
}

export function isScopeReadOnly(scope) {
  return SCOPE_CATEGORIES.READ.includes(scope);
}

export function scopeRequiresApproval(scope) {
  return SCOPE_CATEGORIES.PROPOSE.includes(scope) || SCOPE_CATEGORIES.WRITE.includes(scope);
}

export function getWriteScopeForPropose(proposeScope) {
  const mapping = {
    [VSI_SCOPES.PROPOSE_UI_PATCH]: VSI_SCOPES.WRITE_UI_PATCH,
    [VSI_SCOPES.PROPOSE_THEME]: VSI_SCOPES.WRITE_THEME,
    [VSI_SCOPES.PROPOSE_CONFIG]: VSI_SCOPES.WRITE_CONFIG,
    [VSI_SCOPES.PROPOSE_COMPONENT]: VSI_SCOPES.WRITE_UI_PATCH
  };
  return mapping[proposeScope] || null;
}
