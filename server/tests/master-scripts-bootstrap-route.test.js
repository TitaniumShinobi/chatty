import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

import masterScriptsRouter from '../routes/masterScripts.js';
import { masterScriptsManager } from '../lib/masterScriptsBridge.js';

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: 'master-test-user',
      email: 'master-test@example.com',
    };
    next();
  });
  app.use('/api/master', masterScriptsRouter);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('GET /api/master/bootstrap returns 200 JSON with construct bootstrap payload', async () => {
  const originalInitializeConstruct = masterScriptsManager.initializeConstruct;

  masterScriptsManager.initializeConstruct = async (constructId, userId) => ({
    id: constructId,
    userId,
    initializedAt: '2026-05-12T00:00:00.000Z',
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/master/bootstrap`);
      const contentType = response.headers.get('content-type') || '';
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.match(contentType, /application\/json/i);
      assert.equal(payload.success, true);
      assert.ok(Array.isArray(payload.constructs));
      assert.deepEqual(
        payload.constructs.map((construct) => construct.constructId),
        ['zen-001', 'lin-001'],
      );
      assert.equal(payload.constructs[0].initialized, true);
      assert.equal(payload.constructs[0].identityBound, true);
      assert.ok(Array.isArray(payload.constructs[0].capabilities));
      assert.doesNotMatch(JSON.stringify(payload), /Cannot GET|<!DOCTYPE html>/i);
    });
  } finally {
    masterScriptsManager.initializeConstruct = originalInitializeConstruct;
  }
});

test('unsupported bootstrap methods return JSON instead of HTML fallthrough', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/master/bootstrap`, {
      method: 'PUT',
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = await response.json();

    assert.equal(response.status, 405);
    assert.match(contentType, /application\/json/i);
    assert.equal(payload.success, false);
    assert.deepEqual(payload.constructs, []);
    assert.deepEqual(payload.errors, ['method_not_allowed']);
  });
});
