import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeVvaultRouteRequest } from '../lib/vvaultRequestNormalization.js';

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
