import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { disableAgentsHandler } from '../routes/vsi.js';
import { getPermissionService } from '../lib/vsi/permissionService.js';
import { ManifestService } from '../lib/vsi/manifestService.js';
import { PermissionService } from '../lib/vsi/permissionService.js';
import { ACTION_TYPES, MANIFEST_STATUS, RISK_LEVELS, VSI_SCOPES } from '../lib/vsi/types.js';
import { requireAuth } from '../auth/middleware/auth.js';
import { requireVSIAdminAccess } from '../middleware/vsiAuth.js';

const TEST_JWT_SECRET = 'test-secret-vsi-governance';
const TEST_ADMIN_TOKEN = 'test-admin-token-vsi-governance';

function setEnv(next) {
  const previous = {};
  for (const [key, value] of Object.entries(next)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function signUserToken(payload = {}) {
  return jwt.sign(
    {
      sub: 'test-user',
      id: 'test-user',
      email: 'admin@example.com',
      ...payload
    },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function invokeMiddleware(middleware, req) {
  const res = createMockRes();
  let nextCalled = false;
  let nextError = null;

  await middleware(req, res, (err) => {
    nextCalled = true;
    nextError = err || null;
  });

  return { res, nextCalled, nextError };
}

describe('VSI governance', () => {
  it('defaults apply edits to off when the env flag is unset', () => {
    const restoreEnv = setEnv({ AGENTS_ALLOW_APPLY_EDITS: undefined });
    try {
      const permissionService = new PermissionService();
      assert.equal(permissionService.canApplyEdits(), false);
    } finally {
      restoreEnv();
    }
  });

  it('requires explicit approval and never auto-approves apply flows', async () => {
    const permissionService = new PermissionService({
      runtimeControls: { allowApplyEdits: true }
    });
    const manifestService = new ManifestService({ permissionService });

    const proposed = await manifestService.propose('zen-001', 'user-1', {
      scope: VSI_SCOPES.PROPOSE_UI_PATCH,
      target: 'composer/send-button',
      action: ACTION_TYPES.UPDATE,
      currentState: { label: 'Send' },
      proposedState: { label: 'Apply' },
      rationale: 'Update the button copy',
      riskLevel: RISK_LEVELS.LOW
    });

    assert.equal(proposed.success, true);
    assert.equal(proposed.requiresApproval, true);
    assert.equal(proposed.manifest.status, MANIFEST_STATUS.PROPOSED);
    assert.equal(proposed.manifest.autoApproved, undefined);

    const approved = await manifestService.approve(proposed.manifest.manifestId, 'user-1');
    assert.equal(approved.success, true);
    assert.equal(approved.manifest.status, MANIFEST_STATUS.APPROVED);
    assert.equal(approved.manifest.autoApproved, false);
  });

  it('blocks approval and execution when apply edits are disabled', async () => {
    const permissionService = new PermissionService({
      runtimeControls: { allowApplyEdits: false }
    });
    const manifestService = new ManifestService({ permissionService });

    const proposed = await manifestService.propose('zen-001', 'user-1', {
      scope: VSI_SCOPES.PROPOSE_UI_PATCH,
      target: 'composer/send-button',
      action: ACTION_TYPES.UPDATE,
      currentState: { label: 'Send' },
      proposedState: { label: 'Apply' },
      rationale: 'Update the button copy',
      riskLevel: RISK_LEVELS.LOW
    });

    assert.equal(proposed.success, true);
    assert.equal(proposed.requiresApproval, true);

    const approved = await manifestService.approve(proposed.manifest.manifestId, 'user-1');
    assert.equal(approved.success, false);
    assert.match(approved.error, /read-only/i);

    const writeValidation = permissionService.validateAction('zen-001', VSI_SCOPES.WRITE_UI_PATCH);
    assert.equal(writeValidation.allowed, false);
    assert.match(writeValidation.reason, /read-only/i);
  });

  it('disables VSI agent edits through the authenticated admin route', async () => {
    const restoreEnv = setEnv({
      JWT_SECRET: TEST_JWT_SECRET,
      VSI_ADMIN_TOKEN: TEST_ADMIN_TOKEN
    });

    const permissionService = getPermissionService();
    const previousRuntime = permissionService.getRuntimeControls();
    permissionService.setApplyEditsAllowed(true, { actor: 'test-bootstrap', reason: 'ensure_editable_start' });

    try {
      const authReq = {
        method: 'POST',
        url: '/api/vsi/admin/disable-agents',
        headers: {},
        cookies: {}
      };

      const authResult = await invokeMiddleware(requireAuth, authReq);
      assert.equal(authResult.nextCalled, false);
      assert.equal(authResult.res.statusCode, 401);
      assert.equal(authResult.res.body.ok, false);

      authReq.cookies.sid = signUserToken();
      authReq.headers['x-vsi-admin-token'] = TEST_ADMIN_TOKEN;

      const rejectedAdminGate = await invokeMiddleware(requireVSIAdminAccess, {
        ...authReq,
        user: { sub: 'test-user', email: 'admin@example.com' },
        headers: { 'x-vsi-admin-token': 'wrong-token' }
      });
      assert.equal(rejectedAdminGate.nextCalled, false);
      assert.equal(rejectedAdminGate.res.statusCode, 403);
      assert.equal(rejectedAdminGate.res.body.ok, false);

      const adminGateResult = await invokeMiddleware(requireVSIAdminAccess, {
        ...authReq,
        user: { sub: 'test-user', email: 'admin@example.com' }
      });
      assert.equal(adminGateResult.nextCalled, true);
      assert.equal(adminGateResult.nextError, null);

      const handlerRes = createMockRes();
      await disableAgentsHandler({
        ...authReq,
        user: { sub: 'test-user', email: 'admin@example.com' },
        vsiAdmin: { actor: 'admin@example.com', tokenAuthenticated: true },
        body: { reason: 'incident_response' }
      }, handlerRes);

      assert.equal(handlerRes.statusCode, 200);
      assert.equal(handlerRes.body.ok, true);
      assert.equal(handlerRes.body.mode, 'read_only');
      assert.equal(handlerRes.body.runtime.applyEditsAllowed, false);

      const runtime = permissionService.getRuntimeControls();
      assert.equal(runtime.allowApplyEdits, false);
    } finally {
      permissionService.setApplyEditsAllowed(previousRuntime.allowApplyEdits, {
        actor: previousRuntime.updatedBy || 'test-restore',
        reason: previousRuntime.disabledReason || 'test_restore'
      });
      restoreEnv();
    }
  });
});
