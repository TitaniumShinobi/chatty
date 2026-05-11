import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import simForgeRoutes from '../routes/simForge.js';
import { simForge } from '../lib/simForge.js';

const originals = {
  loadTranscriptsForConstruct: null,
  extractMessagesFromTranscripts: null,
};

beforeEach(() => {
  originals.loadTranscriptsForConstruct = simForge.loadTranscriptsForConstruct;
  originals.extractMessagesFromTranscripts = simForge.extractMessagesFromTranscripts;
});

afterEach(() => {
  simForge.loadTranscriptsForConstruct = originals.loadTranscriptsForConstruct;
  simForge.extractMessagesFromTranscripts = originals.extractMessagesFromTranscripts;
});

async function withServer(run) {
  const app = express();
  app.use(express.json());

  // Simulate authenticated request for routes that read req.user.
  app.use((req, _res, next) => {
    req.user = { id: 'test-user-123', email: 'test-user@example.com' };
    next();
  });

  app.use('/api/simforge', simForgeRoutes);

  const server = await new Promise((resolveServer) => {
    const s = app.listen(0, () => resolveServer(s));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolveClose, rejectClose) => {
      server.close((err) => (err ? rejectClose(err) : resolveClose()));
    });
  }
}

async function getJson(baseUrl, routePath) {
  const response = await fetch(`${baseUrl}${routePath}`);
  const payload = await response.json();
  return { status: response.status, payload };
}

describe('simForge preview readiness gating', () => {
  it('returns readyToForge=false when extracted message count is below 10', async () => {
    let seenUserId = null;
    let seenCallsign = null;

    simForge.loadTranscriptsForConstruct = async (userId, constructCallsign) => {
      seenUserId = userId;
      seenCallsign = constructCallsign;
      return [{ content: 'ignored', metadata: { definition: 'optional' } }];
    };
    simForge.extractMessagesFromTranscripts = () => (
      Array.from({ length: 9 }, (_, i) => ({ role: 'assistant', content: `line-${i}` }))
    );

    await withServer(async (baseUrl) => {
      const { status, payload } = await getJson(baseUrl, '/api/simforge/preview/nova-001');

      assert.equal(status, 200);
      assert.equal(payload.constructCallsign, 'nova-001');
      assert.equal(payload.messageCount, 9);
      assert.equal(payload.readyToForge, false);
      assert.equal(seenUserId, 'test-user@example.com');
      assert.equal(seenCallsign, 'nova-001');
    });
  });

  it('returns readyToForge=true when extracted message count reaches 10', async () => {
    simForge.loadTranscriptsForConstruct = async () => ([{ content: 'any transcript' }]);
    simForge.extractMessagesFromTranscripts = () => (
      Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `message-${i}`,
      }))
    );

    await withServer(async (baseUrl) => {
      const { status, payload } = await getJson(baseUrl, '/api/simforge/preview/nova-001');

      assert.equal(status, 200);
      assert.equal(payload.messageCount, 10);
      assert.equal(payload.readyToForge, true);
      assert.equal(Array.isArray(payload.sampleMessages), true);
      assert.equal(payload.sampleMessages.length, 10);
    });
  });

  it('wires construct sim build service to scripts/build_sims.py via python3 args', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'server/lib/constructSimBuildService.js'),
      'utf8',
    );

    assert.match(
      source,
      /const BUILD_SCRIPT = join\(__dirname, '\.\.\/\.\.\/scripts\/build_sims\.py'\);/,
    );
    assert.match(
      source,
      /const args = \['python3', BUILD_SCRIPT, '--instances-dir', BUILD_INSTANCES_DIR, '--base-model', BUILD_BASE_MODEL, '--callsign', normalizedCallsign\];/,
    );
  });

  it('treats prompt.json as canonical source in build_sims with prompt.txt fallback', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/build_sims.py'),
      'utf8',
    );

    const promptJsonIdx = source.indexOf('prompt_json_path = identity_dir / "prompt.json"');
    const promptTxtIdx = source.indexOf('prompt_txt = _read_text(identity_dir / "prompt.txt")');

    assert.notEqual(promptJsonIdx, -1);
    assert.notEqual(promptTxtIdx, -1);
    assert.ok(promptJsonIdx < promptTxtIdx);
  });
});
