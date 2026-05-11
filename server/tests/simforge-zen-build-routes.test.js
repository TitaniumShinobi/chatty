import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Router } from 'express';
import { normalizeZenCallsign } from '../lib/zenIdentity.js';
import { createZenSimBuildService } from '../lib/zenSimBuildService.js';

// Each test server gets its own isolated build service so the singleton lock
// does not bleed between tests.
function buildIsolatedRouter() {
  const svc = createZenSimBuildService();
  const router = Router();

  router.post('/build/zen', async (req, res) => {
    try {
      const { callsign = 'zen-001', dryRun = true, watch = false, includeCapsuleSummary = true, requestId } = req.body || {};
      const requested = String(callsign || '').trim().toLowerCase();
      if (requested === 'zen' || requested === 'zen-001' || requested === 'lin' || requested === 'lin-001') {
        return res.status(403).json({ ok: false, error: 'platform_construct_managed' });
      }
      const normalized = normalizeZenCallsign(callsign);
      if (!normalized.ok) return res.status(400).json({ ok: false, error: normalized.error });
      let started;
      try {
        started = svc.startJob(normalized.normalizedCallsign, { dryRun, watch, includeCapsuleSummary, requestId });
      } catch (jobErr) {
        if (jobErr.statusCode === 409) return res.status(409).json({ ok: false, error: 'build_already_running_for_zen', activeJobId: jobErr.activeJobId });
        throw jobErr;
      }
      return res.status(202).json({ ok: true, jobId: started.jobId, normalizedCallsign: started.normalizedCallsign, status: started.status, acceptedAt: started.acceptedAt, mode: started.mode });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || 'internal_error' });
    }
  });

  router.get('/build/zen/:jobId', async (req, res) => {
    try {
      const job = svc.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ ok: false, error: 'job_not_found' });
      return res.status(200).json({ ok: true, jobId: job.jobId, normalizedCallsign: job.normalizedCallsign, status: job.status, startedAt: job.startedAt, finishedAt: job.finishedAt, exitCode: job.exitCode, summary: job.summary, logsTail: job.logsTail });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || 'internal_error' });
    }
  });

  return router;
}

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/api/simforge', buildIsolatedRouter());

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

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  const payload = await response.json();
  return { status: response.status, payload };
}

describe('simForge zen build routes', () => {
  it('blocks zen dry-run requests because platform constructs are managed by system policy', async () => {
    await withServer(async (baseUrl) => {
      const { status, payload } = await postJson(baseUrl, '/api/simforge/build/zen', { dryRun: true });
      assert.equal(status, 403);
      assert.equal(payload.ok, false);
      assert.equal(payload.error, 'platform_construct_managed');
    });
  });

  it('blocks lin requests because lin is a platform construct', async () => {
    await withServer(async (baseUrl) => {
      const { status, payload } = await postJson(baseUrl, '/api/simforge/build/zen', { callsign: 'lin-001', dryRun: true });
      assert.equal(status, 403);
      assert.equal(payload.ok, false);
      assert.equal(payload.error, 'platform_construct_managed');
    });
  });

  it('rejects invalid callsign', async () => {
    await withServer(async (baseUrl) => {
      const { status, payload } = await postJson(baseUrl, '/api/simforge/build/zen', { callsign: 'nova-001', dryRun: true });
      assert.equal(status, 400);
      assert.equal(payload.ok, false);
      assert.match(payload.error, /invalid callsign/i);
    });
  });

  it('blocks zen full build requests dryRun false', async () => {
    await withServer(async (baseUrl) => {
      const { status, payload } = await postJson(baseUrl, '/api/simforge/build/zen', { callsign: 'zen', dryRun: false });
      assert.equal(status, 403);
      assert.equal(payload.ok, false);
      assert.equal(payload.error, 'platform_construct_managed');
    });
  });

  it('returns 404 for unknown jobId', async () => {
    await withServer(async (baseUrl) => {
      const { status, payload } = await getJson(baseUrl, '/api/simforge/build/zen/does-not-exist');
      assert.equal(status, 404);
      assert.equal(payload.ok, false);
      assert.equal(payload.error, 'job_not_found');
    });
  });
});
