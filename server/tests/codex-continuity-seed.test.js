import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  CODEX_CONTINUITY_SEED_DEFAULTS,
  buildChattyResumeUrl,
  buildCodexContinuityRuntimeTurnState,
  buildCodexResumeToken,
  buildSeedWriteParams,
  encodeResumeToken,
  isCodexContinuitySeedState,
  seedCodexContinuity,
} from '../lib/codexContinuitySeed.js';
import { buildConstructRevision } from '../lib/runtimeTurnState.js';
import { readLatestRuntimeTurnState } from '../../vvaultConnector/runtimeTurnStateStore.js';
import { writeTranscript } from '../../vvaultConnector/writeTranscript.js';

const canonicalUser = {
  user_id: 'devon_woodson_1774390416168',
  email: 'dwoodson92@gmail.com',
  name: 'Devon Woodson',
  vvault_user_id: 'devon_woodson_1774390416168',
};

describe('Codex continuity seed', () => {
  it('builds a bounded runtimeTurnState seed for the canonical Zen thread', () => {
    const state = buildCodexContinuityRuntimeTurnState({
      now: '2026-05-08T20:00:00.000Z',
    });

    assert.equal(state.sessionId, CODEX_CONTINUITY_SEED_DEFAULTS.sessionId);
    assert.equal(state.constructId, CODEX_CONTINUITY_SEED_DEFAULTS.constructId);
    assert.equal(state.constructRevision, buildConstructRevision({ constructId: 'zen-001' }));
    assert.equal(state.continuitySeq, 1);
    assert.match(state.assistantTurnId, /^rt_1_[a-f0-9]{20}$/);
    assert.match(state.tailHash, /^[a-f0-9]{64}$/);
    assert.equal(state.activeGoal, CODEX_CONTINUITY_SEED_DEFAULTS.activeGoal);
    assert.equal(state.openLoop, CODEX_CONTINUITY_SEED_DEFAULTS.openLoop);
    assert.equal(state.nextStep, CODEX_CONTINUITY_SEED_DEFAULTS.nextStep);
    assert.equal(state.awaiting, 'user');
    assert.equal(state.hydrationTruth, 'full');
    assert.equal(state.ordinaryThreadSummary, null);
    assert.equal(state.activeTopic, null);
    assert.deepEqual(state.focusRefs, []);
  });

  it('builds a resume token and URL that match the seeded tail', () => {
    const state = buildCodexContinuityRuntimeTurnState({
      now: '2026-05-08T20:01:00.000Z',
    });
    const token = buildCodexResumeToken(state, {
      issuedAt: '2026-05-08T20:01:00.000Z',
    });

    assert.deepEqual(token, {
      v: 1,
      sourceSeat: 'codex',
      constructId: state.constructId,
      constructRevision: state.constructRevision,
      threadId: state.sessionId,
      continuitySeq: state.continuitySeq,
      assistantTurnId: state.assistantTurnId,
      tailHash: state.tailHash,
      hydrationTruth: 'full',
      issuedAt: '2026-05-08T20:01:00.000Z',
    });

    const encoded = encodeResumeToken(token);
    assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')), token);
    assert.equal(
      buildChattyResumeUrl(token, { frontendBaseUrl: 'http://localhost:5173/' }),
      `http://localhost:5173/app/chat/zen-001_chat_with_zen-001?resume=${encoded}`,
    );
  });

  it('increments continuitySeq from a stale persisted state instead of resetting', () => {
    const previousState = buildCodexContinuityRuntimeTurnState({
      now: '2026-05-08T20:02:00.000Z',
    });
    const nextState = buildCodexContinuityRuntimeTurnState({
      previousState,
      now: '2026-05-08T20:03:00.000Z',
    });

    assert.equal(nextState.continuitySeq, previousState.continuitySeq + 1);
    assert.notEqual(nextState.assistantTurnId, previousState.assistantTurnId);
    assert.notEqual(nextState.tailHash, previousState.tailHash);
    assert.equal(nextState.constructRevision, previousState.constructRevision);
  });

  it('recognizes an existing Codex continuity seed for idempotent reruns', () => {
    const state = buildCodexContinuityRuntimeTurnState({
      now: '2026-05-08T20:03:30.000Z',
    });

    assert.equal(isCodexContinuitySeedState(state), true);
    assert.equal(isCodexContinuitySeedState({ ...state, nextStep: 'Different step.' }), false);
  });

  it('writes one assistant metadata.runtimeTurnState through the canonical transcript params', () => {
    const state = buildCodexContinuityRuntimeTurnState({
      now: '2026-05-08T20:04:00.000Z',
    });
    const params = buildSeedWriteParams({
      user: canonicalUser,
      runtimeTurnState: state,
      timestamp: '2026-05-08T20:04:00.000Z',
    });

    assert.equal(params.sessionId, 'zen-001_chat_with_zen-001');
    assert.equal(params.constructId, 'zen-001');
    assert.equal(params.constructCallsign, 'zen-001');
    assert.equal(params.role, 'assistant');
    assert.equal(params.userId, canonicalUser.user_id);
    assert.equal(params.userEmail, canonicalUser.email);
    assert.equal(params.supabaseUserId, canonicalUser.vvault_user_id);
    assert.equal(params.metadata.runtimeTurnState, state);
    assert.equal(params.metadata.codexContinuitySeed.sourceSeat, 'codex');
  });

  it('orchestrates read, next-state build, write, token, and URL without a second store', async () => {
    const previousState = buildCodexContinuityRuntimeTurnState({
      now: '2026-05-08T20:05:00.000Z',
    });
    previousState.activeGoal = 'Previous non-seed continuity state.';
    previousState.openLoop = 'Previous open loop.';
    previousState.nextStep = 'Previous next step.';
    const calls = [];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-continuity-seed-'));
    const usersPath = path.join(tempDir, 'users.json');
    await fs.writeFile(
      usersPath,
      JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
      'utf8',
    );

    try {
    const result = await seedCodexContinuity({
      now: '2026-05-08T20:06:00.000Z',
      usersPath,
      frontendBaseUrl: 'http://localhost:5173',
        readLatestRuntimeTurnStateImpl: async (userContext, lookup) => {
          calls.push({ type: 'read', userContext, lookup });
          return { runtimeTurnState: previousState, source: 'test' };
        },
        writeTranscriptImpl: async (params) => {
          calls.push({ type: 'write', params });
          return { success: true, source: 'test-write' };
        },
      });

      assert.equal(result.seededRuntimeTurnState.continuitySeq, previousState.continuitySeq + 1);
      assert.equal(result.resumeTokenJson.sourceSeat, 'codex');
      assert.equal(result.resumeTokenJson.tailHash, result.seededRuntimeTurnState.tailHash);
      assert.match(result.chattyResumeUrl, /^http:\/\/localhost:5173\/app\/chat\/zen-001_chat_with_zen-001\?resume=/);
      assert.equal(calls[0].type, 'read');
      assert.deepEqual(calls[0].lookup, {
        sessionId: 'zen-001_chat_with_zen-001',
        constructId: 'zen-001',
      });
      assert.equal(calls[1].type, 'write');
      assert.equal(calls[1].params.metadata.runtimeTurnState, result.seededRuntimeTurnState);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('does not append a second seed when the latest runtimeTurnState is already the Codex seed', async () => {
    const existingSeed = buildCodexContinuityRuntimeTurnState({
      now: '2026-05-08T20:06:30.000Z',
    });
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-continuity-seed-'));
    const usersPath = path.join(tempDir, 'users.json');
    let writeCalled = false;
    await fs.writeFile(
      usersPath,
      JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
      'utf8',
    );

    try {
      const result = await seedCodexContinuity({
        now: '2026-05-08T20:07:00.000Z',
        usersPath,
        readLatestRuntimeTurnStateImpl: async () => ({
          runtimeTurnState: existingSeed,
          source: 'local_fallback_metadata',
        }),
        writeTranscriptImpl: async () => {
          writeCalled = true;
          return { success: true };
        },
      });

      assert.equal(writeCalled, false);
      assert.equal(result.writeResult.action, 'already_seeded');
      assert.equal(result.seededRuntimeTurnState.assistantTurnId, existingSeed.assistantTurnId);
      assert.equal(result.resumeTokenJson.issuedAt, existingSeed.updatedAt);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('round-trips the seed through writeTranscript and readLatestRuntimeTurnState local metadata', async () => {
    const originalFallbackPath = process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalApiBaseUrl = process.env.VVAULT_API_BASE_URL;
    const originalVvaultUrl = process.env.VVAULT_URL;
    const originalVvaultBaseUrl = process.env.VVAULT_BASE_URL;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-seed-roundtrip-'));

    try {
      process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = path.join(tempDir, 'store.json');
      delete process.env.DATABASE_URL;
      delete process.env.VVAULT_API_BASE_URL;
      delete process.env.VVAULT_URL;
      delete process.env.VVAULT_BASE_URL;

      const state = buildCodexContinuityRuntimeTurnState({
        now: '2026-05-08T20:07:00.000Z',
      });
      const writeResult = await writeTranscript(
        buildSeedWriteParams({
          user: canonicalUser,
          runtimeTurnState: state,
          timestamp: state.updatedAt,
        }),
      );
      const reloaded = await readLatestRuntimeTurnState(
        {
          userId: canonicalUser.user_id,
          userEmail: canonicalUser.email,
          supabaseUserId: canonicalUser.vvault_user_id,
        },
        {
          sessionId: 'zen-001_chat_with_zen-001',
          constructId: 'zen-001',
          allowLocalFallback: true,
        },
      );

      assert.equal(writeResult.success, true);
      assert.equal(reloaded.source, 'local_fallback_metadata');
      assert.equal(reloaded.runtimeTurnState.continuitySeq, state.continuitySeq);
      assert.equal(reloaded.runtimeTurnState.assistantTurnId, state.assistantTurnId);
      assert.equal(reloaded.runtimeTurnState.tailHash, state.tailHash);
      assert.equal(reloaded.runtimeTurnState.activeGoal, state.activeGoal);
    } finally {
      if (typeof originalFallbackPath === 'undefined') {
        delete process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
      } else {
        process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = originalFallbackPath;
      }
      if (typeof originalDatabaseUrl === 'undefined') {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
      if (typeof originalApiBaseUrl === 'undefined') {
        delete process.env.VVAULT_API_BASE_URL;
      } else {
        process.env.VVAULT_API_BASE_URL = originalApiBaseUrl;
      }
      if (typeof originalVvaultUrl === 'undefined') {
        delete process.env.VVAULT_URL;
      } else {
        process.env.VVAULT_URL = originalVvaultUrl;
      }
      if (typeof originalVvaultBaseUrl === 'undefined') {
        delete process.env.VVAULT_BASE_URL;
      } else {
        process.env.VVAULT_BASE_URL = originalVvaultBaseUrl;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
