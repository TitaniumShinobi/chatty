import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { normalizeZenCallsign } from '../lib/zenIdentity.js';
import { createZenSimBuildService } from '../lib/zenSimBuildService.js';
import { requireAuth } from '../auth/middleware/auth.js';

const TEST_JWT_SECRET = 'test-secret-phase5-zen';
const TEST_COOKIE_NAME = 'sid';

function buildAuthenticatedRouter() {
  const svc = createZenSimBuildService();
  const router = express.Router();

  router.post('/build/zen', async (req, res) => {
    try {
      const { callsign = 'zen-001', dryRun = true, includeCapsuleSummary = true, requestId } = req.body || {};
      const requested = String(callsign || '').trim().toLowerCase();
      if (requested === 'zen' || requested === 'zen-001' || requested === 'lin' || requested === 'lin-001') {
        return res.status(403).json({ ok: false, error: 'platform_construct_managed' });
      }
      const normalized = normalizeZenCallsign(callsign);
      if (!normalized.ok) return res.status(400).json({ ok: false, error: normalized.error });
      let started;
      try {
        started = svc.startJob(normalized.normalizedCallsign, { dryRun, includeCapsuleSummary, requestId });
      } catch (jobErr) {
        if (jobErr.statusCode === 409) {
          return res.status(409).json({ ok: false, error: 'build_already_running_for_zen', activeJobId: jobErr.activeJobId });
        }
        throw jobErr;
      }
      return res.status(202).json({
        ok: true,
        jobId: started.jobId,
        normalizedCallsign: started.normalizedCallsign,
        status: started.status,
        acceptedAt: started.acceptedAt,
        mode: started.mode,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || 'internal_error' });
    }
  });

  return router;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // requireAuth reads JWT_SECRET and COOKIE_NAME from process.env
  app.use('/api/simforge', requireAuth, buildAuthenticatedRouter());
  return app;
}

async function withServer(run) {
  const app = makeApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function signToken(payload = {}) {
  return jwt.sign({ sub: 'test-user', email: 'test@example.com', ...payload }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

async function postZenBuild(baseUrl, { cookie } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers['cookie'] = cookie;
  const response = await fetch(`${baseUrl}/api/simforge/build/zen`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ dryRun: true }),
  });
  return { status: response.status, payload: await response.json() };
}

describe('simForge zen build route — auth enforcement', () => {
  it('returns 401 when no cookie is present', async () => {
    await withServer(async (baseUrl) => {
      // Temporarily set env vars for the duration of this test
      const prev = { secret: process.env.JWT_SECRET, cookie: process.env.COOKIE_NAME };
      process.env.JWT_SECRET = TEST_JWT_SECRET;
      process.env.COOKIE_NAME = TEST_COOKIE_NAME;
      try {
        const { status, payload } = await postZenBuild(baseUrl);
        assert.equal(status, 401);
        assert.equal(payload.ok, false);
      } finally {
        if (prev.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prev.secret;
        if (prev.cookie === undefined) delete process.env.COOKIE_NAME; else process.env.COOKIE_NAME = prev.cookie;
      }
    });
  });

  it('returns 401 when cookie contains an invalid JWT', async () => {
    await withServer(async (baseUrl) => {
      const prev = { secret: process.env.JWT_SECRET, cookie: process.env.COOKIE_NAME };
      process.env.JWT_SECRET = TEST_JWT_SECRET;
      process.env.COOKIE_NAME = TEST_COOKIE_NAME;
      try {
        const { status, payload } = await postZenBuild(baseUrl, {
          cookie: `${TEST_COOKIE_NAME}=this.is.not.a.valid.jwt`,
        });
        assert.equal(status, 401);
        assert.equal(payload.ok, false);
      } finally {
        if (prev.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prev.secret;
        if (prev.cookie === undefined) delete process.env.COOKIE_NAME; else process.env.COOKIE_NAME = prev.cookie;
      }
    });
  });

  it('returns 401 when cookie contains a JWT signed with the wrong secret', async () => {
    await withServer(async (baseUrl) => {
      const prev = { secret: process.env.JWT_SECRET, cookie: process.env.COOKIE_NAME };
      process.env.JWT_SECRET = TEST_JWT_SECRET;
      process.env.COOKIE_NAME = TEST_COOKIE_NAME;
      try {
        const wrongToken = jwt.sign({ sub: 'attacker' }, 'wrong-secret', { expiresIn: '1h' });
        const { status, payload } = await postZenBuild(baseUrl, {
          cookie: `${TEST_COOKIE_NAME}=${wrongToken}`,
        });
        assert.equal(status, 401);
        assert.equal(payload.ok, false);
      } finally {
        if (prev.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prev.secret;
        if (prev.cookie === undefined) delete process.env.COOKIE_NAME; else process.env.COOKIE_NAME = prev.cookie;
      }
    });
  });

  it('returns 403 when cookie is valid but construct is platform-managed', async () => {
    await withServer(async (baseUrl) => {
      const prev = { secret: process.env.JWT_SECRET, cookie: process.env.COOKIE_NAME };
      process.env.JWT_SECRET = TEST_JWT_SECRET;
      process.env.COOKIE_NAME = TEST_COOKIE_NAME;
      try {
        const token = signToken();
        const { status, payload } = await postZenBuild(baseUrl, {
          cookie: `${TEST_COOKIE_NAME}=${token}`,
        });
        assert.equal(status, 403);
        assert.equal(payload.ok, false);
        assert.equal(payload.error, 'platform_construct_managed');
      } finally {
        if (prev.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prev.secret;
        if (prev.cookie === undefined) delete process.env.COOKIE_NAME; else process.env.COOKIE_NAME = prev.cookie;
      }
    });
  });

  it('returns 401 for an expired JWT', async () => {
    await withServer(async (baseUrl) => {
      const prev = { secret: process.env.JWT_SECRET, cookie: process.env.COOKIE_NAME };
      process.env.JWT_SECRET = TEST_JWT_SECRET;
      process.env.COOKIE_NAME = TEST_COOKIE_NAME;
      try {
        const expiredToken = jwt.sign({ sub: 'test-user' }, TEST_JWT_SECRET, { expiresIn: -1 });
        const { status, payload } = await postZenBuild(baseUrl, {
          cookie: `${TEST_COOKIE_NAME}=${expiredToken}`,
        });
        assert.equal(status, 401);
        assert.equal(payload.ok, false);
      } finally {
        if (prev.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prev.secret;
        if (prev.cookie === undefined) delete process.env.COOKIE_NAME; else process.env.COOKIE_NAME = prev.cookie;
      }
    });
  });
});
