import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeConversationToLocalFallback } from '../../vvaultConnector/localConversationFallback.js';
import { readLatestRuntimeTurnState } from '../../vvaultConnector/runtimeTurnStateStore.js';
import { __test__ as runtimeTurnStateStoreTest } from '../../vvaultConnector/runtimeTurnStateStore.js';

let tempDir;
const originalPath = process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
const originalDatabaseUrl = process.env.DATABASE_URL;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-runtime-turn-state-store-'));
  process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = path.join(tempDir, 'store.json');
  delete process.env.DATABASE_URL;
});

afterEach(async () => {
  if (typeof originalPath === 'undefined') {
    delete process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
  } else {
    process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = originalPath;
  }
  if (typeof originalDatabaseUrl === 'undefined') {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe('runtimeTurnState metadata store', () => {
  it('prefers the highest continuity sequence across mixed sources even when Postgres looks newer by timestamp', () => {
    const postgresCandidate = {
      source: 'postgres_message_metadata',
      continuitySeq: 36,
      updatedAtMs: Date.parse('2026-05-09T06:24:00.000Z'),
      runtimeTurnState: {
        continuitySeq: 36,
        assistantTurnId: 'rt_36_postgres',
      },
    };
    const localFallbackCandidate = {
      source: 'local_fallback_metadata',
      continuitySeq: 37,
      updatedAtMs: Date.parse('2026-05-08T22:55:20.341Z'),
      runtimeTurnState: {
        continuitySeq: 37,
        assistantTurnId: 'rt_37_local',
      },
    };

    const selected = runtimeTurnStateStoreTest.selectLatestRuntimeTurnStateCandidate(
      postgresCandidate,
      localFallbackCandidate,
    );

    assert.equal(selected.source, 'local_fallback_metadata');
    assert.equal(selected.runtimeTurnState.assistantTurnId, 'rt_37_local');
    assert.equal(selected.runtimeTurnState.continuitySeq, 37);
  });

  it('reloads the latest assistant runtimeTurnState from the local metadata side-channel', async () => {
    const common = {
      userId: 'chatty-user-1',
      userEmail: 'devon@example.com',
      supabaseUserId: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
      sessionId: 'zen-001_chat_with_zen-001',
      title: 'Zen',
      constructId: 'zen-001',
      constructCallsign: 'zen-001',
    };

    await writeConversationToLocalFallback({
      ...common,
      role: 'assistant',
      content: 'ordinary reply one',
      timestamp: '2026-05-06T12:00:00.000Z',
      metadata: {
        runtimeTurnState: {
          version: 2,
          sessionId: common.sessionId,
          constructId: common.constructId,
          constructRevision: 'construct-runtime-v1:zen-001',
          updatedAt: '2026-05-06T12:00:00.000Z',
          continuitySeq: 4,
          assistantTurnId: 'rt_4_first',
          tailHash: 'a'.repeat(64),
          hydrationTruth: 'full',
          ordinaryThreadSummary: 'Keep the thread on continuity substrate.',
          activeTopic: 'continuity substrate',
          activeGoal: 'Keep the thread on continuity substrate.',
          activeMode: 'ordinary',
          focusRefs: ['continuity substrate'],
          openLoop: 'Who owns continuity?',
          nextStep: 'Decide ownership.',
          awaiting: 'user',
          unresolvedIntent: { kind: 'question', text: 'Who owns continuity?' },
          lastTurnType: 'ordinary',
        },
      },
    });

    await writeConversationToLocalFallback({
      ...common,
      role: 'assistant',
      content: 'ordinary reply two',
      timestamp: '2026-05-06T12:01:00.000Z',
      metadata: {
        runtimeTurnState: {
          version: 2,
          sessionId: common.sessionId,
          constructId: common.constructId,
          constructRevision: 'construct-runtime-v1:zen-001',
          updatedAt: '2026-05-06T12:01:00.000Z',
          continuitySeq: 5,
          assistantTurnId: 'rt_5_second',
          tailHash: 'b'.repeat(64),
          hydrationTruth: 'full',
          ordinaryThreadSummary: 'Keep the thread on runtime state, not prompts.',
          activeTopic: 'runtime state',
          activeGoal: 'Keep the thread on runtime state, not prompts.',
          activeMode: 'ordinary',
          focusRefs: ['runtime state'],
          openLoop: 'Implement Gate 1 first.',
          nextStep: 'Implement Gate 1 first.',
          awaiting: 'user',
          unresolvedIntent: { kind: 'handoff', text: 'Implement Gate 1 first.' },
          lastTurnType: 'ordinary',
        },
      },
    });

    const result = await readLatestRuntimeTurnState(
      {
        userEmail: common.userEmail,
        supabaseUserId: common.supabaseUserId,
        userId: common.userId,
      },
      {
        sessionId: common.sessionId,
        constructId: common.constructId,
        allowLocalFallback: true,
      },
    );

    assert.ok(result);
    assert.equal(result.source, 'local_fallback_metadata');
    assert.equal(result.runtimeTurnState.activeTopic, 'runtime state');
    assert.equal(result.runtimeTurnState.unresolvedIntent.kind, 'handoff');
    assert.equal(result.runtimeTurnState.continuitySeq, 5);
    assert.equal(result.runtimeTurnState.assistantTurnId, 'rt_5_second');
    assert.equal(result.runtimeTurnState.tailHash, 'b'.repeat(64));
    assert.ok(!result.runtimeTurnState.ordinaryThreadSummary.includes('reply two'));
  });

  it('prefers the freshest assistant runtimeTurnState by continuity sequence instead of local message order', async () => {
    const common = {
      userId: 'chatty-user-2',
      userEmail: 'devon@example.com',
      supabaseUserId: '6b6ef98b-60f0-4973-b489-c52aebf8f0be',
      sessionId: 'zen-001_chat_with_zen-001',
      title: 'Zen',
      constructId: 'zen-001',
      constructCallsign: 'zen-001',
    };

    await writeConversationToLocalFallback({
      ...common,
      role: 'assistant',
      content: 'authoritative later continuity',
      timestamp: '2026-05-08T22:55:20.341Z',
      metadata: {
        runtimeTurnState: {
          version: 2,
          sessionId: common.sessionId,
          constructId: common.constructId,
          constructRevision: 'construct-runtime-v1:zen-001',
          updatedAt: '2026-05-08T22:55:20.341Z',
          continuitySeq: 18,
          assistantTurnId: 'rt_18_authoritative',
          tailHash: 'c'.repeat(64),
          hydrationTruth: 'full',
          ordinaryThreadSummary: 'Authoritative imported Codex tail.',
          activeTopic: 'authoritative codex tail',
          activeGoal: 'Continue from the authoritative imported Codex tail.',
          activeMode: 'ordinary',
          focusRefs: ['authoritative codex tail'],
          openLoop: 'Continue from the imported Codex tail.',
          nextStep: 'Continue through the canonical route.',
          awaiting: 'user',
          unresolvedIntent: { kind: 'handoff', text: 'Continue through the canonical route.' },
          lastTurnType: 'ordinary',
        },
      },
    });

    await writeConversationToLocalFallback({
      ...common,
      role: 'assistant',
      content: 'stale file-order append',
      timestamp: '2026-05-08T22:53:33.718Z',
      metadata: {
        runtimeTurnState: {
          version: 2,
          sessionId: common.sessionId,
          constructId: common.constructId,
          constructRevision: 'construct-runtime-v1:zen-001',
          updatedAt: '2026-05-08T22:53:33.718Z',
          continuitySeq: 16,
          assistantTurnId: 'rt_16_stale',
          tailHash: 'd'.repeat(64),
          hydrationTruth: 'full',
          ordinaryThreadSummary: 'Stale synthetic append.',
          activeTopic: 'stale append',
          activeGoal: 'Do not continue from this stale append.',
          activeMode: 'ordinary',
          focusRefs: ['stale append'],
          openLoop: 'This stale append should not win.',
          nextStep: 'Ignore stale file-order append.',
          awaiting: 'user',
          unresolvedIntent: { kind: 'none', text: null },
          lastTurnType: 'ordinary',
        },
      },
    });

    const result = await readLatestRuntimeTurnState(
      {
        userEmail: common.userEmail,
        supabaseUserId: common.supabaseUserId,
        userId: common.userId,
      },
      {
        sessionId: common.sessionId,
        constructId: common.constructId,
        allowLocalFallback: true,
      },
    );

    assert.ok(result);
    assert.equal(result.runtimeTurnState.continuitySeq, 18);
    assert.equal(result.runtimeTurnState.assistantTurnId, 'rt_18_authoritative');
    assert.equal(result.runtimeTurnState.activeTopic, 'authoritative codex tail');
  });

  it('reloads a refreshed Codex continuity anchor even when the imported assistant text and timestamp are unchanged', async () => {
    const common = {
      userId: 'chatty-user-3',
      userEmail: 'devon@example.com',
      supabaseUserId: '29f57776-b3bf-4dfd-b560-c5a9a4811f78',
      sessionId: 'zen-001_chat_with_zen-001',
      title: 'Zen',
      constructId: 'zen-001',
      constructCallsign: 'zen-001',
      role: 'assistant',
      content: 'same imported Codex assistant tail',
      timestamp: '2026-05-08T22:55:20.341Z',
    };

    await writeConversationToLocalFallback({
      ...common,
      metadata: {
        sourceSeat: 'codex',
        runtimeTurnState: {
          version: 2,
          sessionId: common.sessionId,
          constructId: common.constructId,
          constructRevision: 'construct-runtime-v1:zen-001',
          updatedAt: '2026-05-08T22:55:20.341Z',
          continuitySeq: 18,
          assistantTurnId: 'rt_18_authoritative',
          tailHash: 'e'.repeat(64),
          hydrationTruth: 'full',
          ordinaryThreadSummary: 'Authoritative imported Codex tail.',
          activeTopic: 'authoritative codex tail',
          activeGoal: 'Continue from the authoritative imported Codex tail.',
          activeMode: 'ordinary',
          focusRefs: ['authoritative codex tail'],
          openLoop: 'Continue from the authoritative imported Codex tail.',
          nextStep: 'Continue through the canonical route.',
          awaiting: 'user',
          unresolvedIntent: { kind: 'handoff', text: 'Continue through the canonical route.' },
          lastTurnType: 'ordinary',
        },
      },
    });

    await writeConversationToLocalFallback({
      ...common,
      metadata: {
        sourceSeat: 'codex',
        runtimeTurnState: {
          version: 2,
          sessionId: common.sessionId,
          constructId: common.constructId,
          constructRevision: 'construct-runtime-v1:zen-001',
          updatedAt: '2026-05-09T05:53:49.280Z',
          continuitySeq: 20,
          assistantTurnId: 'rt_20_refreshed',
          tailHash: 'f'.repeat(64),
          hydrationTruth: 'full',
          ordinaryThreadSummary: 'Refreshed imported Codex tail.',
          activeTopic: 'refreshed codex tail',
          activeGoal: 'Continue from the refreshed imported Codex tail.',
          activeMode: 'ordinary',
          focusRefs: ['refreshed codex tail'],
          openLoop: 'Continue from the refreshed imported Codex tail.',
          nextStep: 'Continue through the canonical route.',
          awaiting: 'user',
          unresolvedIntent: { kind: 'handoff', text: 'Continue through the canonical route.' },
          lastTurnType: 'ordinary',
        },
      },
    });

    const result = await readLatestRuntimeTurnState(
      {
        userEmail: common.userEmail,
        supabaseUserId: common.supabaseUserId,
        userId: common.userId,
      },
      {
        sessionId: common.sessionId,
        constructId: common.constructId,
        allowLocalFallback: true,
      },
    );

    assert.ok(result);
    assert.equal(result.runtimeTurnState.continuitySeq, 20);
    assert.equal(result.runtimeTurnState.assistantTurnId, 'rt_20_refreshed');
    assert.equal(result.runtimeTurnState.activeTopic, 'refreshed codex tail');
  });
});
