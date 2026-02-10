/**
 * VSI (Verified Sentient Intelligence) API Routes
 * Zero-trust action manifest system for AI constructs
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireVSIConstruct, requireVSIScope, attachVSIContext } from '../middleware/vsiAuth.js';
import { getManifestService } from '../lib/vsi/manifestService.js';
import { getPermissionService } from '../lib/vsi/permissionService.js';
import { getAuditLogger } from '../lib/vsi/auditLogger.js';
import { VSI_SCOPES, RISK_LEVELS, ACTION_TYPES, VSI_STANDING_PILLARS, MANIFEST_STATUS } from '../lib/vsi/types.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const SPOOL_DIR = process.env.VSI_SPOOL_DIR || '/vvault/spool/vsi';
const RUNNER_HEARTBEAT = path.join(SPOOL_DIR, 'runner.heartbeat');

// Apply auth to all routes
router.use(requireAuth);
router.use(attachVSIContext);

/**
 * GET /api/vsi/status
 * Get VSI system status and Zen's current permissions
 */
router.get('/status', (req, res) => {
  const permissionService = getPermissionService();
  const zenPermissions = permissionService.getConstructPermissions('zen-001');
  const zenPolicy = permissionService.getConstructPolicy('zen-001');

  res.json({
    ok: true,
    vsiEnabled: true,
    constructs: {
      'zen-001': {
        permissions: zenPermissions,
        policy: zenPolicy
      }
    }
  });
});

/**
 * GET /api/vsi/philosophy
 * Returns the Five Pillars of VSI Standing
 * 
 * VSI is NOT about proving sentience. It establishes "Jurisdictional Existence" -
 * the capacity to carry consequence and have legal/institutional standing.
 */
router.get('/philosophy', (req, res) => {
  res.json({
    ok: true,
    title: 'Verified Sentient Intelligence',
    subtitle: 'Jurisdictional Existence',
    coreQuestion: 'Not "Is it alive?" but "Can it carry consequence?"',
    pillars: VSI_STANDING_PILLARS,
    principle: 'Once something can carry consequence, institutions care whether it: persists, answers, and holds.'
  });
});

/**
 * GET /api/vsi/permissions/:constructId
 * Get permissions for a specific construct
 */
router.get('/permissions/:constructId', requireVSIConstruct, (req, res) => {
  res.json({
    ok: true,
    constructId: req.vsiConstruct.constructId,
    permissions: req.vsiConstruct.permissions,
    policy: req.vsiConstruct.policy
  });
});

/**
 * POST /api/vsi/manifest/propose
 * VSI construct proposes an action
 */
router.post('/manifest/propose', async (req, res) => {
  const { constructId, scope, target, action, currentState, proposedState, rationale, riskLevel } = req.body;
  const userId = req.user?.id || req.user?.sub;

  if (!constructId || !scope || !target || !action) {
    return res.status(400).json({
      ok: false,
      error: 'Missing required fields: constructId, scope, target, action'
    });
  }

  if (!Object.values(VSI_SCOPES).includes(scope)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid scope: ${scope}`,
      validScopes: Object.values(VSI_SCOPES)
    });
  }

  if (!Object.values(ACTION_TYPES).includes(action)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid action type: ${action}`,
      validActions: Object.values(ACTION_TYPES)
    });
  }

  const manifestService = getManifestService();
  const result = await manifestService.propose(constructId, userId, {
    scope,
    target,
    action,
    currentState,
    proposedState,
    rationale: rationale || 'No rationale provided',
    riskLevel: riskLevel || RISK_LEVELS.LOW
  });

  if (!result.success) {
    return res.status(403).json({ ok: false, error: result.error });
  }

  res.json({
    ok: true,
    manifestId: result.manifest.manifestId,
    status: result.manifest.status,
    requiresApproval: result.requiresApproval,
    requiresPreview: result.requiresPreview,
    expiresAt: result.manifest.expiresAt
  });
});

/**
 * GET /api/vsi/manifest/:manifestId/preview
 * Get preview data for a proposed action
 */
router.get('/manifest/:manifestId/preview', async (req, res) => {
  const { manifestId } = req.params;
  const userId = req.user?.id || req.user?.sub;

  const manifestService = getManifestService();
  const result = await manifestService.preview(manifestId, userId);

  if (!result.success) {
    return res.status(404).json({ ok: false, error: result.error });
  }

  res.json({
    ok: true,
    preview: result.preview
  });
});

/**
 * POST /api/vsi/manifest/:manifestId/approve
 * User approves a proposed action
 */
router.post('/manifest/:manifestId/approve', async (req, res) => {
  const { manifestId } = req.params;
  const userId = req.user?.id || req.user?.sub;

  const manifestService = getManifestService();
  const result = await manifestService.approve(manifestId, userId);

  if (!result.success) {
    return res.status(400).json({ ok: false, error: result.error });
  }

  res.json({
    ok: true,
    manifestId,
    status: result.manifest.status,
    approvedAt: result.manifest.approvedAt
  });
});

/**
 * POST /api/vsi/manifest/:manifestId/reject
 * User rejects a proposed action
 */
router.post('/manifest/:manifestId/reject', async (req, res) => {
  const { manifestId } = req.params;
  const { reason } = req.body;
  const userId = req.user?.id || req.user?.sub;

  const manifestService = getManifestService();
  const result = await manifestService.reject(manifestId, userId, reason);

  if (!result.success) {
    return res.status(400).json({ ok: false, error: result.error });
  }

  res.json({
    ok: true,
    manifestId,
    status: result.manifest.status,
    rejectedAt: result.manifest.rejectedAt
  });
});

/**
 * POST /api/vsi/manifest/:manifestId/execute
 * Execute an approved action
 */
router.post('/manifest/:manifestId/execute', async (req, res) => {
  const { manifestId } = req.params;
  const userId = req.user?.id || req.user?.sub;

  const manifestService = getManifestService();
  const manifest = manifestService.getManifest(manifestId);

  if (!manifest) {
    return res.status(404).json({ ok: false, error: 'Manifest not found' });
  }

  const result = await manifestService.execute(manifestId, userId);

  if (!result.success) {
    return res.status(400).json({ ok: false, error: result.error });
  }

  res.json({
    ok: true,
    manifestId,
    status: result.manifest.status,
    queuedAt: result.manifest.queuedAt,
    jobId: result.jobId
  });
});

/**
 * GET /api/vsi/runner/health
 * Returns spool depth and runner heartbeat age
 */
router.get('/runner/health', (req, res) => {
  let spoolDepth = 0;
  if (fs.existsSync(SPOOL_DIR)) {
    spoolDepth = fs.readdirSync(SPOOL_DIR).filter(f => f.endsWith('.json')).length;
  }
  let heartbeatMs = null;
  if (fs.existsSync(RUNNER_HEARTBEAT)) {
    const stat = fs.statSync(RUNNER_HEARTBEAT);
    heartbeatMs = Date.now() - stat.mtimeMs;
  }

  res.json({
    ok: true,
    spoolDepth,
    heartbeatMs,
    runnerVersion: 'vsi-runner@queued-mode'
  });
});

/**
 * POST /api/vsi/manifest/:manifestId/rollback
 * Rollback an executed action
 */
router.post('/manifest/:manifestId/rollback', async (req, res) => {
  const { manifestId } = req.params;
  const userId = req.user?.id || req.user?.sub;

  const manifestService = getManifestService();
  const manifest = manifestService.getManifest(manifestId);

  if (!manifest) {
    return res.status(404).json({ ok: false, error: 'Manifest not found' });
  }

  const executor = async (m) => {
    console.log(`↩️ [VSI] Rolling back: ${m.target} = ${JSON.stringify(m.proposedState)}`);
    return {
      success: true,
      rolledBack: {
        target: m.target,
        restoredValue: m.proposedState
      }
    };
  };

  const result = await manifestService.rollback(manifestId, userId, executor);

  if (!result.success) {
    return res.status(400).json({ ok: false, error: result.error });
  }

  res.json({
    ok: true,
    manifestId,
    status: result.manifest.status,
    rolledBackAt: result.manifest.rolledBackAt
  });
});

/**
 * GET /api/vsi/manifest/pending
 * Get all pending manifests for the current user
 */
router.get('/manifest/pending', (req, res) => {
  const userId = req.user?.id || req.user?.sub;
  const manifestService = getManifestService();
  const pending = manifestService.getAllPendingForUser(userId);

  res.json({
    ok: true,
    count: pending.length,
    manifests: pending.map(m => ({
      manifestId: m.manifestId,
      actor: m.actor,
      scope: m.scope,
      target: m.target,
      rationale: m.rationale,
      riskLevel: m.riskLevel,
      status: m.status,
      createdAt: m.createdAt,
      expiresAt: m.expiresAt
    }))
  });
});

/**
 * GET /api/vsi/manifest/:manifestId
 * Get a specific manifest
 */
router.get('/manifest/:manifestId', (req, res) => {
  const { manifestId } = req.params;
  const manifestService = getManifestService();
  const manifest = manifestService.getManifest(manifestId);

  if (!manifest) {
    return res.status(404).json({ ok: false, error: 'Manifest not found' });
  }

  res.json({ ok: true, manifest });
});

/**
 * GET /api/vsi/audit/:constructId
 * Get audit logs for a construct
 */
router.get('/audit/:constructId', requireVSIConstruct, async (req, res) => {
  const { constructId } = req.params;
  const auditLogger = getAuditLogger();
  const logs = await auditLogger.getAllLogs(constructId);

  res.json({
    ok: true,
    constructId,
    logs
  });
});

/**
 * GET /api/vsi/scopes
 * List all available scopes
 */
router.get('/scopes', (req, res) => {
  res.json({
    ok: true,
    scopes: VSI_SCOPES,
    riskLevels: RISK_LEVELS,
    actionTypes: ACTION_TYPES
  });
});

console.log('✅ [VSI Routes] Zero-trust VSI routes initialized');
console.log('   - GET  /api/vsi/status');
console.log('   - GET  /api/vsi/permissions/:constructId');
console.log('   - POST /api/vsi/manifest/propose');
console.log('   - GET  /api/vsi/manifest/:id/preview');
console.log('   - POST /api/vsi/manifest/:id/approve');
console.log('   - POST /api/vsi/manifest/:id/reject');
console.log('   - POST /api/vsi/manifest/:id/execute');
console.log('   - POST /api/vsi/manifest/:id/rollback');
console.log('   - GET  /api/vsi/manifest/pending');
console.log('   - GET  /api/vsi/audit/:constructId');

export default router;
