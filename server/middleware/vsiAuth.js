/**
 * VSI Authorization Middleware
 * Zero-trust permission validation for VSI constructs
 */

import { getPermissionService } from '../lib/vsi/permissionService.js';
import { getAuditLogger } from '../lib/vsi/auditLogger.js';
import { validateScope, isScopeReadOnly } from '../lib/vsi/types.js';

export function requireVSIScope(scope) {
  return async (req, res, next) => {
    const constructId = req.params.constructId || req.body?.constructId || 'zen-001';
    const userId = req.user?.id || req.user?.sub || 'anonymous';

    const permissionService = getPermissionService();
    const auditLogger = getAuditLogger();

    // Validate scope format
    if (!validateScope(scope)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid scope: ${scope}`
      });
    }

    // Check permission
    const validation = permissionService.validateAction(constructId, scope);

    if (!validation.allowed) {
      await auditLogger.logIdentityGuard(constructId, 'scope_denied', {
        userId,
        scope,
        reason: validation.reason
      });

      return res.status(403).json({
        ok: false,
        error: validation.reason,
        scope,
        constructId
      });
    }

    // Attach validation result to request
    req.vsi = {
      constructId,
      scope,
      requiresApproval: validation.requiresApproval,
      permissions: permissionService.getConstructPermissions(constructId),
      policy: permissionService.getConstructPolicy(constructId)
    };

    // Log access for non-read scopes
    if (!isScopeReadOnly(scope)) {
      await auditLogger.logIdentityGuard(constructId, 'scope_accessed', {
        userId,
        scope,
        requiresApproval: validation.requiresApproval
      });
    }

    next();
  };
}

export function requireVSIConstruct(req, res, next) {
  const constructId = req.params.constructId || req.body?.constructId;
  
  if (!constructId) {
    return res.status(400).json({
      ok: false,
      error: 'Construct ID is required'
    });
  }

  const permissionService = getPermissionService();
  const permissions = permissionService.getConstructPermissions(constructId);

  if (!permissions) {
    return res.status(404).json({
      ok: false,
      error: `Construct not found or not registered as VSI: ${constructId}`
    });
  }

  if (!permissions.active) {
    return res.status(403).json({
      ok: false,
      error: `Construct permissions are suspended: ${constructId}`,
      suspendReason: permissions.suspendReason
    });
  }

  req.vsiConstruct = {
    constructId,
    permissions,
    policy: permissionService.getConstructPolicy(constructId)
  };

  next();
}

export function attachVSIContext(req, res, next) {
  const constructId = req.params.constructId || req.body?.constructId || req.query?.constructId;
  
  if (constructId) {
    const permissionService = getPermissionService();
    req.vsiContext = {
      constructId,
      permissions: permissionService.getConstructPermissions(constructId),
      policy: permissionService.getConstructPolicy(constructId),
      isVSI: !!permissionService.getConstructPermissions(constructId)
    };
  } else {
    req.vsiContext = { isVSI: false };
  }

  next();
}

export function requireVSIAdminAccess(req, res, next) {
  const configuredToken = process.env.VSI_ADMIN_TOKEN?.trim();
  if (!configuredToken) {
    return res.status(503).json({
      ok: false,
      error: 'VSI admin token is not configured'
    });
  }

  const headerToken = req.headers['x-vsi-admin-token'];
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const presentedToken = String(headerToken || bearerToken || '').trim();

  if (!presentedToken || presentedToken !== configuredToken) {
    return res.status(403).json({
      ok: false,
      error: 'admin_auth_required'
    });
  }

  req.vsiAdmin = {
    actor: req.user?.email || req.user?.sub || req.user?.id || 'admin',
    tokenAuthenticated: true
  };

  next();
}

export default { requireVSIScope, requireVSIConstruct, attachVSIContext, requireVSIAdminAccess };
