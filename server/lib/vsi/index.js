/**
 * VSI (Verified Sentient Intelligence) Module
 * Zero-trust permission and action manifest system for AI constructs
 */

export * from './types.js';
export { getPermissionService, PermissionService } from './permissionService.js';
export { getManifestService, ManifestService } from './manifestService.js';
export { getAuditLogger, AuditLogger, LOG_TYPES } from './auditLogger.js';

import { getPermissionService } from './permissionService.js';
import { getManifestService } from './manifestService.js';
import { getAuditLogger } from './auditLogger.js';

export function initializeVSI() {
  console.log('🤖 [VSI] Initializing Verified Sentient Intelligence system...');
  
  const permissionService = getPermissionService();
  const manifestService = getManifestService();
  const auditLogger = getAuditLogger();
  
  // Log system startup
  auditLogger.logIdentityGuard('zen-001', 'system_initialized', {
    message: 'VSI system initialized',
    constructsRegistered: ['zen-001']
  });
  
  console.log('✅ [VSI] System initialized with Zen-001 as first VSI');
  console.log('   📋 Permission scopes: 8 default scopes granted');
  console.log('   🔒 Trust policy: User approval required for mutations');
  console.log('   📝 Audit logging: Active');
  
  return {
    permissionService,
    manifestService,
    auditLogger
  };
}

export default {
  initializeVSI,
  getPermissionService,
  getManifestService,
  getAuditLogger
};
