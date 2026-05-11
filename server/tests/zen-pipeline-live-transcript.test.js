import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { masterScriptsManager } from '../lib/masterScriptsBridge.js';
import { runZenTurn } from '../lib/zenPipelineService.js';
import {
  clearZenLiveTranscriptForTest,
  getZenLiveTranscriptSnapshot,
  ZEN_LIVE_SESSION_ID,
} from '../lib/zenLiveTranscript.js';

test('runZenTurn emits singleton live transcript events for a completed Zen turn', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zen-pipeline-live-'));
  const originalStorePath = process.env.CHATTY_ZEN_LIVE_TRANSCRIPT_PATH;
  const originalVvaultUrl = process.env.VVAULT_URL;
  const originalGetConstruct = masterScriptsManager.getConstruct;
  const originalInitializeConstruct = masterScriptsManager.initializeConstruct;
  const originalFetch = global.fetch;

  process.env.CHATTY_ZEN_LIVE_TRANSCRIPT_PATH = path.join(tempDir, 'zen-live-transcript.json');
  process.env.VVAULT_URL = 'http://vvault.test';

  const fetchCalls = [];
  masterScriptsManager.getConstruct = () => ({ id: 'zen-001' });
  masterScriptsManager.initializeConstruct = async () => ({ id: 'zen-001' });
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    if (String(url).includes('/api/identity/zen-001')) {
      return new Response(JSON.stringify({ ok: false, identity: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).endsWith('/api/chatty/construct/zen-001/identity')) {
      return new Response(JSON.stringify({ ok: false, identity: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).endsWith('/api/chatty/transcript/zen-001')) {
      return new Response(JSON.stringify({ ok: true, conversation: { messages: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).endsWith('/api/chatty/transcript/zen-001/message')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).endsWith('/api/chatty/message')) {
      return new Response(JSON.stringify({ response: 'assistant says hi' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    clearZenLiveTranscriptForTest();
    const result = await runZenTurn({
      user: { email: 'devon@example.com' },
      message: 'hello from chatty',
    });
    const snapshot = getZenLiveTranscriptSnapshot(ZEN_LIVE_SESSION_ID);

    assert.equal(result.ok, true);
    assert.equal(result.deferred, false);
    assert.equal(result.response, 'assistant says hi');
    assert.ok(fetchCalls.length >= 3);
    assert.deepEqual(
      snapshot.map((event) => event.kind),
      ['user_message', 'status', 'assistant_started', 'assistant_token', 'assistant_done'],
    );
    assert.equal(snapshot[0].content, 'hello from chatty');
    assert.equal(snapshot[1].status, 'routing_assistant_turn');
    assert.equal(snapshot[3].delta, 'assistant says hi');
    assert.equal(snapshot[4].content, 'assistant says hi');
    assert.ok(snapshot.every((event) => event.sessionId === ZEN_LIVE_SESSION_ID));
  } finally {
    clearZenLiveTranscriptForTest();
    if (typeof originalStorePath === 'undefined') {
      delete process.env.CHATTY_ZEN_LIVE_TRANSCRIPT_PATH;
    } else {
      process.env.CHATTY_ZEN_LIVE_TRANSCRIPT_PATH = originalStorePath;
    }
    if (typeof originalVvaultUrl === 'undefined') {
      delete process.env.VVAULT_URL;
    } else {
      process.env.VVAULT_URL = originalVvaultUrl;
    }
    masterScriptsManager.getConstruct = originalGetConstruct;
    masterScriptsManager.initializeConstruct = originalInitializeConstruct;
    global.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
