import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { normalizeVvaultRouteRequest } from '../lib/vvaultRequestNormalization.js';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('normalizeVvaultRouteRequest preserves deterministic clock/request ids on invalid input', async () => {
  const result = await normalizeVvaultRouteRequest({
    req: {
      clock: '2026-05-11T12:00:00.000Z',
      requestId: 'req-vvault-normalize',
      headers: {},
      user: { id: 'dev-user', email: 'dev@example.com' },
      body: {},
    },
    resolveSupabaseUser: async () => {
      throw new Error('no supabase session');
    },
    buildAuthReceipt: (input) => input,
    normalizeInferenceRequest: () => ({ error: 'constructId is required' }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.inferenceClock, '2026-05-11T12:00:00.000Z');
  assert.equal(result.inferenceRequestId, 'req-vvault-normalize');
  assert.equal(result.body.error, 'constructId is required');
});

test('normalizeVvaultRouteRequest accepts explicit service-token operator auth', async () => {
  process.env.VVAULT_URL = 'https://vvault.example.test';
  process.env.VVAULT_SERVICE_TOKEN = 'service-token-1';
  process.env.NODE_ENV = 'production';

  const req = {
    clock: '2026-05-14T10:30:00.000Z',
    requestId: 'req-service-operator',
    headers: {
      authorization: 'Bearer service-token-1',
      'x-chatty-user-id': 'zenith-codex-operator',
      'x-chatty-user-email': 'zenith-codex@operator.chatty.local',
      'x-chatty-operator-name': 'Zenith/Codex',
    },
    body: {
      constructId: 'lin-001',
      message: 'Zenith/Codex live certification probe.',
    },
  };

  const result = await normalizeVvaultRouteRequest({
    req,
    resolveSupabaseUser: async () => {
      throw new Error('no supabase session');
    },
    buildAuthReceipt: (input) => input,
    normalizeInferenceRequest: () => ({
      constructId: 'lin-001',
      message: 'Zenith/Codex live certification probe.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.userId, 'zenith-codex-operator');
  assert.equal(result.authSource, 'service_token_operator');
  assert.equal(result.supabaseSessionUserId, null);
  assert.equal(req.user.email, 'zenith-codex@operator.chatty.local');
  assert.equal(req.user.name, 'Zenith/Codex');
  assert.equal(result.authReceipt.authSource, 'service_token_operator');
  assert.equal(result.authReceipt.userId, 'zenith-codex-operator');
});

test('normalizeVvaultRouteRequest accepts x-chatty-key service-token operator auth', async () => {
  process.env.VVAULT_URL = 'https://vvault.example.test';
  process.env.VVAULT_SERVICE_TOKEN = 'service-token-2';
  process.env.NODE_ENV = 'production';

  const req = {
    headers: {
      'x-chatty-key': 'service-token-2',
      'x-chatty-user-id': 'zenith-codex-operator',
      'x-chatty-operator-name': 'Zenith/Codex',
    },
    body: {
      constructId: 'lin-001',
      message: 'Zenith/Codex live certification probe.',
    },
  };

  const result = await normalizeVvaultRouteRequest({
    req,
    resolveSupabaseUser: async () => {
      throw new Error('no supabase session');
    },
    buildAuthReceipt: (input) => input,
    normalizeInferenceRequest: () => ({
      constructId: 'lin-001',
      message: 'Zenith/Codex live certification probe.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.authSource, 'service_token_operator');
  assert.equal(result.userId, 'zenith-codex-operator');
});

test('normalizeVvaultRouteRequest rejects service-token operator auth without an explicit user id', async () => {
  process.env.VVAULT_URL = 'https://vvault.example.test';
  process.env.VVAULT_SERVICE_TOKEN = 'service-token-1';
  process.env.NODE_ENV = 'production';

  const result = await normalizeVvaultRouteRequest({
    req: {
      clock: '2026-05-14T10:31:00.000Z',
      requestId: 'req-service-operator-missing-id',
      headers: {
        authorization: 'Bearer service-token-1',
      },
      body: {
        constructId: 'lin-001',
        message: 'Zenith/Codex live certification probe.',
      },
    },
    resolveSupabaseUser: async () => {
      throw new Error('no supabase session');
    },
    buildAuthReceipt: (input) => input,
    normalizeInferenceRequest: () => ({
      constructId: 'lin-001',
      message: 'Zenith/Codex live certification probe.',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.body.error, /x-chatty-user-id/i);
});

test('VVAULT route-local auth gate preserves validated service-token requests', () => {
  const source = fs.readFileSync(new URL('../routes/vvault.js', import.meta.url), 'utf8');
  assert.match(source, /requirePreferredAuthOrServiceToken\(req,\s*res,\s*next\)/);
  assert.match(
    source,
    /router\.get\("\/conversations\/:sessionId\/canonical-transcript",\s*requirePreferredAuthOrServiceToken/,
  );
});

test('VVAULT Ollama calls include bounded runtime options', () => {
  const source = fs.readFileSync(new URL('../routes/vvault.js', import.meta.url), 'utf8');
  assert.match(source, /const DEFAULT_OLLAMA_NUM_CTX = Number\.parseInt\(process\.env\.OLLAMA_NUM_CTX/);
  assert.match(source, /const DEFAULT_OLLAMA_NUM_PREDICT = Number\.parseInt\(process\.env\.OLLAMA_NUM_PREDICT/);
  assert.match(source, /function buildOllamaChatOptions\(generationParams = \{\}\)/);
  assert.match(source, /options: buildOllamaChatOptions\(generationParams\)/);
});
