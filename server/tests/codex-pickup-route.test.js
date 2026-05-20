import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

import { createCodexRouter } from '../routes/codex.js';

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use(router);
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

test('/api/codex/pickup blocks a synced transcript whose newest message is still user and never relays continuity', async () => {
  let relayCalled = false;
  const router = createCodexRouter({
    syncArchive: async () => ({
      latest: {
        sourceSessionId: '019da145-f041-7c32-b089-fe251bbf640e',
        sourceSessionPath:
          '/home/user/.codex/sessions/2026/04/18/rollout-2026-04-18T11-46-48-019da145-f041-7c32-b089-fe251bbf640e.jsonl',
        latestAssistantTimestamp: '2026-05-10T14:11:11.670Z',
        latestMessageRole: 'user',
        latestMessageTimestamp: '2026-05-10T15:48:32.539Z',
        latestMessageDigest: '1f1ef772d6516a9a9ddaa9438537e9db7cb9eaf5533d6e774421df908a11a512',
        latestMessageSourceTurnIndex: 70188,
      },
    }),
    relayContinuity: async () => {
      relayCalled = true;
      return null;
    },
  });

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/pickup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const payload = await response.json();

    assert.equal(response.status, 409);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'CODEX_PICKUP_AWAITING_ASSISTANT_TAIL');
    assert.equal(
      payload.error,
      'Codex pickup synced the latest transcript to VVAULT, but the newest synced message is not a completed assistant tail yet.',
    );
    assert.equal(payload.syncedTranscript.sourceSessionId, '019da145-f041-7c32-b089-fe251bbf640e');
    assert.equal(payload.syncedTranscript.latestAssistantTimestamp, '2026-05-10T14:11:11.670Z');
    assert.deepEqual(payload.latestSyncedMessage, {
      role: 'user',
      timestamp: '2026-05-10T15:48:32.539Z',
      digest: '1f1ef772d6516a9a9ddaa9438537e9db7cb9eaf5533d6e774421df908a11a512',
      sourceTurnIndex: 70188,
    });
  });

  assert.equal(relayCalled, false);
});

test('/api/codex/pickup relays VVAULT readback content when the newest message is the completed assistant tail', async () => {
  const syncedPath =
    '/home/user/.codex/sessions/2026/05/10/rollout-2026-05-10T08-17-52-019e11d2-8eab-75d2-b212-39ac5d96ef00.jsonl';
  const vvaultStoragePath = 'instances/zen-001/codex/Backend continuity authority.md';
  const vvaultContent = [
    '# Backend continuity authority',
    '',
    '- sourceSessionId: 019e11d2-8eab-75d2-b212-39ac5d96ef00',
    '- sourceSessionPath: /home/user/.codex/sessions/2026/05/10/rollout-2026-05-10T08-17-52-019e11d2-8eab-75d2-b212-39ac5d96ef00.jsonl',
    '- latestAssistantTimestamp: 2026-05-10T15:38:21.289Z',
    '- turnCount: 2',
    '- digest: transcript-digest',
    '',
    '---',
    '',
    '## User (2026-05-10T15:38:20.000Z)',
    '',
    'pickup from VVAULT',
    '',
    '## Assistant (2026-05-10T15:38:21.289Z)',
    '',
    'relay from VVAULT',
    '',
  ].join('\n');
  let relayInput = null;
  const router = createCodexRouter({
    syncArchive: async () => ({
      latest: {
        sourceSessionId: '019e11d2-8eab-75d2-b212-39ac5d96ef00',
        sourceSessionPath: syncedPath,
        sourceThreadName: 'Backend continuity authority',
        vvaultStoragePath,
        vvaultReadback: {
          storagePath: vvaultStoragePath,
          storageMode: 'vvault_body',
          content: vvaultContent,
          sha256: 'readback-sha',
          metadata: {
            sourceSessionId: '019e11d2-8eab-75d2-b212-39ac5d96ef00',
            digest: 'transcript-digest',
            latestMessageRole: 'assistant',
            latestMessageTimestamp: '2026-05-10T15:38:21.289Z',
            latestMessageDigest: 'abc123',
            latestMessageSourceTurnIndex: 88,
          },
        },
        latestAssistantTimestamp: '2026-05-10T15:38:21.289Z',
        latestMessageRole: 'assistant',
        latestMessageTimestamp: '2026-05-10T15:38:21.289Z',
        latestMessageDigest: 'abc123',
        latestMessageSourceTurnIndex: 88,
      },
    }),
    relayContinuity: async ({
      fromRolloutPath,
      fromVvaultArchiveContent,
      fromVvaultStoragePath,
    }) => {
      relayInput = {
        fromRolloutPath,
        fromVvaultArchiveContent,
        fromVvaultStoragePath,
      };
      return {
        source: {
          type: 'vvault-archive',
          path: vvaultStoragePath,
          parseReport: {
            latestAssistantTimestamp: '2026-05-10T15:38:21.289Z',
            sessionId: '019e11d2-8eab-75d2-b212-39ac5d96ef00',
            sourcePath: vvaultStoragePath,
            cwd: '/home/user/projects/chatty',
          },
        },
        constructId: 'zen-001',
        threadId: 'zen-001_chat_with_zen-001',
        importedTurns: 2,
        dedupedTurns: 0,
        latestAssistantTurnId: 'rt_test_assistant_turn',
        resumeTokenJson: {
          constructId: 'zen-001',
          threadId: 'zen-001_chat_with_zen-001',
          assistantTurnId: 'rt_test_assistant_turn',
        },
        chattyResumeUrl: 'http://localhost:5173/app/chat/zen-001_chat_with_zen-001?resume=test',
        canonicalReadback: {
          persistenceSource: 'vvault_body',
          sessionId: 'zen-001_chat_with_zen-001',
          messages: [],
          localFallback: false,
        },
      };
    },
  });

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/pickup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.pickupSource, 'synced-vvault-readback-transcript');
    assert.equal(payload.syncedTranscript.sourceSessionPath, syncedPath);
    assert.equal(payload.syncedTranscript.vvaultReadback.storagePath, vvaultStoragePath);
    assert.equal(payload.syncedTranscript.vvaultReadback.storageMode, 'vvault_body');
    assert.equal(payload.syncedTranscript.vvaultReadback.sha256, 'readback-sha');
    assert.equal(payload.syncedTranscript.vvaultReadback.contentLength, vvaultContent.length);
    assert.equal(Object.hasOwn(payload.syncedTranscript.vvaultReadback, 'content'), false);
    assert.equal(payload.vvaultReadback.storagePath, vvaultStoragePath);
    assert.equal(Object.hasOwn(payload.vvaultReadback, 'content'), false);
    assert.equal(payload.latestSyncedMessage.role, 'assistant');
  });

  assert.equal(relayInput.fromRolloutPath, undefined);
  assert.equal(relayInput.fromVvaultArchiveContent, vvaultContent);
  assert.equal(relayInput.fromVvaultStoragePath, vvaultStoragePath);
});
