import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

import linChatRouter, { __test__ as linChatRouteTest } from '../routes/linChat.js';

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.clock = '2026-05-11T12:30:00.000Z';
    req.requestId = 'req-lin-deterministic';
    req.user = {
      id: 'lin-test-user',
      email: 'lin-test@example.com',
      name: 'Lin Tester',
    };
    next();
  });
  app.use('/api/lin', linChatRouter);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
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

test('/api/lin/generate marks helper-route provider fallback explicitly and deterministically', async () => {
  linChatRouteTest.setRouteOverrides({
    callOpenRouter: async () => {
      const error = new Error('429 rate limited');
      error.status = 429;
      throw error;
    },
    openaiDirectClient: {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: 'fallback response' } }],
          }),
        },
      },
    },
  });

  try {
    await withServer(async (baseUrl) => {
      const makeRequest = async () => {
        const response = await fetch(`${baseUrl}/api/lin/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: 'hello from deterministic fallback',
            seat: 'creative',
            model: 'openrouter:meta-llama/llama-3.3-70b-instruct:free',
          }),
        });
        return {
          status: response.status,
          payload: await response.json(),
        };
      };

      const first = await makeRequest();
      const second = await makeRequest();

      assert.equal(first.status, 200);
      assert.equal(first.payload.runtime_receipt.created_at, '2026-05-11T12:30:00.000Z');
      assert.equal(first.payload.runtime_receipt.request_id, 'req-lin-deterministic');
      assert.equal(first.payload.runtime_receipt.provider.fallback_used, true);
      assert.equal(first.payload.runtime_receipt.runtime_path.canonical, false);
      assert.equal(first.payload.orchestration_checklist.runtime_path.canonical, false);
      assert.equal(first.payload.runtime_receipt.fallback.fallback_reason, 'provider_fallback');
      assert.deepEqual(first.payload.runtime_receipt, second.payload.runtime_receipt);
      assert.deepEqual(first.payload.orchestration_checklist, second.payload.orchestration_checklist);
    });
  } finally {
    linChatRouteTest.clearRouteOverrides();
  }
});
