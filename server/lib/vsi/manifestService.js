/**
 * VSI Action Manifest Service
 * Manages proposal, approval, and execution of VSI actions
 */

import fs from 'fs';
import path from 'path';
import process from 'process';
import { 
  createActionManifest, 
  MANIFEST_STATUS, 
  getWriteScopeForPropose,
  VSI_SCOPES
} from './types.js';
import { getPermissionService } from './permissionService.js';
import { getAuditLogger } from './auditLogger.js';

const SPOOL_DIR = process.env.VSI_SPOOL_DIR || '/vvault/spool/vsi';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export class ManifestService {
  constructor() {
    this.manifests = new Map();
    this.pendingByUser = new Map();
    this.executedByUser = new Map();
  }

  async propose(constructId, userId, manifestData) {
    const permissionService = getPermissionService();
    const auditLogger = getAuditLogger();

    // Validate scope permission
    const validation = permissionService.validateAction(constructId, manifestData.scope);
    if (!validation.allowed) {
      await auditLogger.logManifest(constructId, 'proposal_denied', null, {
        userId,
        scope: manifestData.scope,
        reason: validation.reason
      });
      return { success: false, error: validation.reason };
    }

    // Create manifest
    const manifest = createActionManifest({
      actor: constructId,
      ...manifestData
    });

    // Sign the manifest (simple hash for now)
    manifest.actorSignature = this.computeSignature(manifest);

    // Store manifest
    this.manifests.set(manifest.manifestId, manifest);
    
    // Track pending by user
    if (!this.pendingByUser.has(userId)) {
      this.pendingByUser.set(userId, []);
    }
    this.pendingByUser.get(userId).push(manifest.manifestId);

    // Check policy limits
    const policy = permissionService.getConstructPolicy(constructId);
    const pendingCount = this.getPendingManifests(constructId, userId).length;
    if (policy && pendingCount > policy.maxPendingManifests) {
      manifest.status = MANIFEST_STATUS.REJECTED;
      manifest.rejectedReason = 'Too many pending manifests';
      await auditLogger.logManifest(constructId, 'proposal_auto_rejected', manifest.manifestId, {
        userId,
        reason: 'max_pending_exceeded'
      });
      return { success: false, error: 'Too many pending proposals. Please approve or reject existing ones.' };
    }

    // Log the proposal
    await auditLogger.logManifest(constructId, 'proposed', manifest.manifestId, {
      userId,
      scope: manifest.scope,
      target: manifest.target,
      riskLevel: manifest.riskLevel,
      rationale: manifest.rationale
    });

    // Check auto-approve
    if (permissionService.shouldAutoApprove(constructId, manifest.scope, manifest.riskLevel)) {
      return this.approve(manifest.manifestId, userId, true);
    }

    return { 
      success: true, 
      manifest,
      requiresApproval: true,
      requiresPreview: permissionService.requiresPreview(constructId, manifest.scope)
    };
  }

  async preview(manifestId, userId) {
    const manifest = this.manifests.get(manifestId);
    if (!manifest) {
      return { success: false, error: 'Manifest not found' };
    }

    if (manifest.status !== MANIFEST_STATUS.PROPOSED) {
      return { success: false, error: `Cannot preview manifest in status: ${manifest.status}` };
    }

    if (!manifest.previewable) {
      return { success: false, error: 'This action cannot be previewed' };
    }

    manifest.status = MANIFEST_STATUS.PREVIEWING;
    
    const auditLogger = getAuditLogger();
    await auditLogger.logManifest(manifest.actor, 'previewing', manifestId, { userId });

    return {
      success: true,
      preview: {
        manifestId,
        target: manifest.target,
        currentState: manifest.currentState,
        proposedState: manifest.proposedState,
        diff: manifest.diff,
        rationale: manifest.rationale,
        riskLevel: manifest.riskLevel,
        reversible: manifest.reversible,
        expiresAt: manifest.expiresAt
      }
    };
  }

  async approve(manifestId, userId, isAutoApprove = false) {
    const manifest = this.manifests.get(manifestId);
    if (!manifest) {
      return { success: false, error: 'Manifest not found' };
    }

    if (![MANIFEST_STATUS.PROPOSED, MANIFEST_STATUS.PREVIEWING].includes(manifest.status)) {
      return { success: false, error: `Cannot approve manifest in status: ${manifest.status}` };
    }

    // Check expiration
    if (new Date(manifest.expiresAt) < new Date()) {
      manifest.status = MANIFEST_STATUS.EXPIRED;
      return { success: false, error: 'Manifest has expired' };
    }

    manifest.status = MANIFEST_STATUS.APPROVED;
    manifest.approvedAt = new Date().toISOString();
    manifest.approvedBy = userId;
    manifest.autoApproved = isAutoApprove;

    // Grant the corresponding write scope for this approved manifest
    const permissionService = getPermissionService();
    const writeScope = getWriteScopeForPropose(manifest.scope);
    if (writeScope) {
      permissionService.grantScope(manifest.actor, writeScope, userId);
      manifest.grantedWriteScope = writeScope;
    }

    const auditLogger = getAuditLogger();
    await auditLogger.logManifest(manifest.actor, 'approved', manifestId, {
      userId,
      autoApproved: isAutoApprove,
      grantedWriteScope: writeScope
    });

    // Remove from pending
    this.removePending(userId, manifestId);

    return { success: true, manifest };
  }

  async reject(manifestId, userId, reason = null) {
    const manifest = this.manifests.get(manifestId);
    if (!manifest) {
      return { success: false, error: 'Manifest not found' };
    }

    if (![MANIFEST_STATUS.PROPOSED, MANIFEST_STATUS.PREVIEWING].includes(manifest.status)) {
      return { success: false, error: `Cannot reject manifest in status: ${manifest.status}` };
    }

    manifest.status = MANIFEST_STATUS.REJECTED;
    manifest.rejectedAt = new Date().toISOString();
    manifest.rejectedBy = userId;
    manifest.rejectedReason = reason;

    const auditLogger = getAuditLogger();
    await auditLogger.logManifest(manifest.actor, 'rejected', manifestId, {
      userId,
      reason
    });

    // Remove from pending
    this.removePending(userId, manifestId);

    return { success: true, manifest };
  }

  async execute(manifestId, userId, executor) {
    const manifest = this.manifests.get(manifestId);
    if (!manifest) {
      return { success: false, error: 'Manifest not found' };
    }

    if (manifest.status !== MANIFEST_STATUS.APPROVED) {
      return { success: false, error: `Cannot execute manifest in status: ${manifest.status}` };
    }

    const permissionService = getPermissionService();
    const auditLogger = getAuditLogger();

    // Verify write permission
    const writeScope = getWriteScopeForPropose(manifest.scope);
    if (writeScope) {
      const validation = permissionService.validateAction(manifest.actor, writeScope);
      if (!validation.allowed) {
        await auditLogger.logManifest(manifest.actor, 'execution_denied', manifestId, {
          userId,
          reason: validation.reason
        });
        return { success: false, error: validation.reason };
      }
    }

    // Enqueue for runner instead of executing in-process
    const enqueueTs = new Date().toISOString();
    const jobId = `job_${manifest.manifestId}`;
    const spoolPayload = {
      manifestId: manifest.manifestId,
      actor: manifest.actor,
      status: MANIFEST_STATUS.QUEUED,
      action: manifest.action,
      target: manifest.target,
      payload: manifest.proposedState ?? null,
      approvedAt: manifest.approvedAt,
      expiresAt: manifest.expiresAt,
      signature: manifest.actorSignature || null,
      prev_hash: manifest.prev_hash || null,
      hash: manifest.hash || null,
      enqueueTs,
      manifest
    };

    ensureDir(SPOOL_DIR);
    const spoolPath = path.join(SPOOL_DIR, `${jobId}.json`);
    fs.writeFileSync(spoolPath, JSON.stringify(spoolPayload, null, 2));

    manifest.status = MANIFEST_STATUS.QUEUED;
    manifest.queuedAt = enqueueTs;
    manifest.jobId = jobId;

    await auditLogger.logManifest(manifest.actor, 'queued', manifestId, {
      userId,
      target: manifest.target,
      jobId,
      spoolPath
    });

    // Remove from pending tracker
    this.removePending(userId, manifestId);

    return { success: true, manifest, jobId };
  }

  async rollback(manifestId, userId, executor) {
    const manifest = this.manifests.get(manifestId);
    if (!manifest) {
      return { success: false, error: 'Manifest not found' };
    }

    if (manifest.status !== MANIFEST_STATUS.EXECUTED) {
      return { success: false, error: `Cannot rollback manifest in status: ${manifest.status}` };
    }

    if (!manifest.reversible) {
      return { success: false, error: 'This action is not reversible' };
    }

    const auditLogger = getAuditLogger();

    try {
      // Create reverse manifest
      const rollbackResult = await executor({
        ...manifest,
        currentState: manifest.proposedState,
        proposedState: manifest.currentState
      });

      manifest.status = MANIFEST_STATUS.ROLLED_BACK;
      manifest.rolledBackAt = new Date().toISOString();
      manifest.rolledBackBy = userId;

      await auditLogger.logManifest(manifest.actor, 'rolled_back', manifestId, {
        userId
      });

      return { success: true, manifest, result: rollbackResult };
    } catch (err) {
      await auditLogger.logManifest(manifest.actor, 'rollback_failed', manifestId, {
        userId,
        error: err.message
      });
      return { success: false, error: err.message };
    }
  }

  getManifest(manifestId) {
    return this.manifests.get(manifestId) || null;
  }

  getPendingManifests(constructId, userId) {
    const pendingIds = this.pendingByUser.get(userId) || [];
    return pendingIds
      .map(id => this.manifests.get(id))
      .filter(m => m && m.actor === constructId && 
        [MANIFEST_STATUS.PROPOSED, MANIFEST_STATUS.PREVIEWING].includes(m.status));
  }

  getAllPendingForUser(userId) {
    const pendingIds = this.pendingByUser.get(userId) || [];
    return pendingIds
      .map(id => this.manifests.get(id))
      .filter(m => m && [MANIFEST_STATUS.PROPOSED, MANIFEST_STATUS.PREVIEWING].includes(m.status));
  }

  removePending(userId, manifestId) {
    const pending = this.pendingByUser.get(userId);
    if (pending) {
      const idx = pending.indexOf(manifestId);
      if (idx > -1) pending.splice(idx, 1);
    }
  }

  computeSignature(manifest) {
    const data = `${manifest.actor}:${manifest.scope}:${manifest.target}:${manifest.createdAt}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sig_${Math.abs(hash).toString(16)}`;
  }

  cleanupExpired() {
    const now = new Date();
    let cleaned = 0;
    
    for (const [id, manifest] of this.manifests.entries()) {
      if ([MANIFEST_STATUS.PROPOSED, MANIFEST_STATUS.PREVIEWING].includes(manifest.status)) {
        if (new Date(manifest.expiresAt) < now) {
          manifest.status = MANIFEST_STATUS.EXPIRED;
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [ManifestService] Cleaned up ${cleaned} expired manifests`);
    }
    return cleaned;
  }
}

let instance = null;

export function getManifestService() {
  if (!instance) {
    instance = new ManifestService();
    // Cleanup expired manifests every minute
    setInterval(() => instance.cleanupExpired(), 60000);
  }
  return instance;
}

export default ManifestService;
