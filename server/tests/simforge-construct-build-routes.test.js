import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Router } from 'express';
import { createConstructSimBuildService, isPlatformConstruct } from '../lib/constructSimBuildService.js';

function buildIsolatedRouter() {
  const svc = createConstructSimBuildService();
  const router = Router();

  router.post('/build/sim', async (req, res) => {
    try {
      const { callsign, dryRun = true, watch = false, includeCapsuleSummary = true, requestId } = req.body || {};
      const normalizedCallsign = String(callsign || '').trim().toLowerCase();

      if (!normalizedCallsign) return res.status(400).json({ ok: false, error: 'invalid_callsign' });
      if (watch) return res.status(400).json({ ok: false, error: 'watch_not_supported' });
      if (isPlatformConstruct(normalizedCallsign)) return res.status(403).json({ ok: false, error: 'platform_construct_managed' });

      let started;
      try {
        started = svc.startJob(normalizedCallsign, { dryRun, includeCapsuleSummary, requestId });
      } catch (jobErr) {
        if (jobErr.statusCode === 400) return res.status(400).json({ ok: false, error: 'invalid_callsign' });
        if (jobErr.statusCode === 403) return res.status(403).json({ ok: false, error: jobErr.code || jobErr.message || 'platform_construct_managed' });
        if (jobErr.statusCode === 409) return res.status(409).json({ ok: false, error: 'build_already_running_for_construct', activeJobId: jobErr.activeJobId });
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

  router.get('/build/sim/:jobId', async (req, res) => {
    try {
      const job = svc.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ ok: false, error: 'job_not_found' });
      return res.status(200).json({
        ok: true,
        jobId: job.jobId,
        normalizedCallsign: job.normalizedCallsign,
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        exitCode: job.exitCode,
        summary: job.summary,
        logsTail: job.logsTail,
      });
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

describe('simForge construct sim build routes', () => {
  it('starts a dry-run sim build for non-platform construct', async () => {
    await withServer(async (baseUrl) => {
      const { status, payload } = await postJson(baseUrl, '/api/simforge/build/sim', { callsign: 'luna-001', dryRun: true });
      assert.equal(status, 202);
      assert.equal(payload.ok, true);
      assert.equal(payload.normalizedCallsign, 'luna-001');
      assert.equal(payload.mode, 'dry-run');
      assert.equal(payload.status, 'queued');
    });
  });

  it('blocks platform constructs zen-001 and lin-001', async () => {
    await withServer(async (baseUrl) => {
      const zen = await postJson(baseUrl, '/api/simforge/build/sim', { callsign: 'zen-001', dryRun: true });
      assert.equal(zen.status, 403);
      assert.equal(zen.payload.error, 'platform_construct_managed');

      const lin = await postJson(baseUrl, '/api/simforge/build/sim', { callsign: 'lin-001', dryRun: true });
      assert.equal(lin.status, 403);
      assert.equal(lin.payload.error, 'platform_construct_managed');
    });
  });

  it('blocks protected canonical construct names pending restricted-name review', async () => {
    await withServer(async (baseUrl) => {
      for (const callsign of ['nova-001', 'katana-001', 'sera-001', 'aurora-001', 'monday-001']) {
        const result = await postJson(baseUrl, '/api/simforge/build/sim', { callsign, dryRun: true });
        assert.equal(result.status, 403);
        assert.equal(result.payload.ok, false);
        assert.equal(result.payload.error, 'restricted_construct_name');
      }
    });
  });

  it('rejects missing or malformed callsign', async () => {
    await withServer(async (baseUrl) => {
      const missing = await postJson(baseUrl, '/api/simforge/build/sim', { dryRun: true });
      assert.equal(missing.status, 400);
      assert.equal(missing.payload.error, 'invalid_callsign');

      const malformed = await postJson(baseUrl, '/api/simforge/build/sim', { callsign: '../oops', dryRun: true });
      assert.equal(malformed.status, 400);
      assert.equal(malformed.payload.error, 'invalid_callsign');
    });
  });

  it('returns status for existing job and 404 for unknown job', async () => {
    await withServer(async (baseUrl) => {
      const start = await postJson(baseUrl, '/api/simforge/build/sim', { callsign: 'luna-002', dryRun: true });
      assert.equal(start.status, 202);

      const found = await getJson(baseUrl, `/api/simforge/build/sim/${start.payload.jobId}`);
      assert.equal(found.status, 200);
      assert.equal(found.payload.ok, true);
      assert.equal(found.payload.jobId, start.payload.jobId);

      const notFound = await getJson(baseUrl, '/api/simforge/build/sim/does-not-exist');
      assert.equal(notFound.status, 404);
      assert.equal(notFound.payload.error, 'job_not_found');
    });
  });

  it('returns 409 when same construct already has a running build', async () => {
    await withServer(async (baseUrl) => {
      const first = await postJson(baseUrl, '/api/simforge/build/sim', { callsign: 'luna-003', dryRun: false });
      assert.equal(first.status, 202);

      const second = await postJson(baseUrl, '/api/simforge/build/sim', { callsign: 'luna-003', dryRun: false });
      assert.equal(second.status, 409);
      assert.equal(second.payload.error, 'build_already_running_for_construct');
      assert.equal(typeof second.payload.activeJobId, 'string');
    });
  });
});
