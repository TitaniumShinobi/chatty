import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCodexContinuityWatch } from '../lib/codexContinuityWatch.js';

const canonicalUser = {
  user_id: 'devon_woodson_1774390416168',
  email: 'dwoodson92@gmail.com',
  name: 'Devon Woodson',
  vvault_user_id: 'devon_woodson_1774390416168',
};

async function writeUsersFile(usersPath) {
  await fs.writeFile(
    usersPath,
    JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
    'utf8',
  );
}

function userContext() {
  return {
    userId: canonicalUser.user_id,
    userEmail: canonicalUser.email,
    supabaseUserId: canonicalUser.vvault_user_id,
  };
}

function createCanonicalRelayStore() {
  const messages = [];
  const strictReadOptions = [];
  const writeParams = [];
  const conversation = {
    sessionId: 'zen-001_chat_with_zen-001',
    title: 'Zen',
    constructId: 'zen-001',
    constructName: 'Zen',
    constructCallsign: 'zen-001',
    persistenceSource: 'vvault-api',
    messages,
  };

  return {
    messages,
    writeParams,
    strictReadOptions,
    readConversationsImpl: async (_userContext, _constructId, options = {}) => {
      strictReadOptions.push(options);
      return [conversation];
    },
    writeTranscriptImpl: async (params) => {
      writeParams.push(params);
      assert.equal(params.requireVvaultBodySuccess, true);
      messages.push({
        role: params.role,
        content: params.content,
        timestamp: params.timestamp,
        metadata: params.metadata || {},
      });
      return { success: true, source: 'vvault-api' };
    },
    readLatestRuntimeTurnStateImpl: async () => {
      const assistant = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.metadata?.runtimeTurnState);
      return assistant
        ? {
            runtimeTurnState: assistant.metadata.runtimeTurnState,
            source: 'vvault-api',
          }
        : null;
    },
  };
}

function buildRolloutLines({
  sessionId = 'latest-codex',
  cwd = process.cwd(),
  pairs = [],
  start = '2026-05-08T23:40:00.000Z',
}) {
  const baseMs = Date.parse(start);
  const lines = [
    JSON.stringify({
      timestamp: new Date(baseMs).toISOString(),
      type: 'session_meta',
      payload: { id: sessionId, cwd },
    }),
  ];

  pairs.forEach(([userText, assistantText], index) => {
    const userTs = new Date(baseMs + (index * 2 + 1) * 1000).toISOString();
    const assistantTs = new Date(baseMs + (index * 2 + 2) * 1000).toISOString();
    lines.push(
      JSON.stringify({
        timestamp: userTs,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: userText }],
        },
      }),
    );
    lines.push(
      JSON.stringify({
        timestamp: assistantTs,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          content: [{ type: 'output_text', text: assistantText }],
        },
      }),
    );
  });

  return lines;
}

function buildSourceSyncLatest({
  rolloutPath,
  sourceSessionId = 'latest-codex',
  latestMessageRole = 'assistant',
  latestMessageTimestamp = '2026-05-08T23:40:02.000Z',
  latestMessageDigest = 'latest-message-digest',
  latestMessageSourceTurnIndex = 2,
  storageMode = 'vvault_body',
  storagePath = 'instances/zen-001/codex/latest-codex.md',
  sha256 = 'readback-sha256',
  content = '# Latest Codex\n\n## User\n\nu1\n\n## Assistant\n\na1\n',
  metadata = {},
} = {}) {
  return {
    sourceSessionId,
    sourceSessionPath: rolloutPath,
    sourceThreadName: 'Latest Codex',
    vvaultStoragePath: storagePath,
    vvaultReadback: {
      storagePath,
      storageMode,
      content,
      sha256,
      contentLength: content.length,
      metadata: {
        sourceSessionId,
        digest: 'thread-digest',
        latestMessageRole,
        latestMessageTimestamp,
        latestMessageDigest,
        latestMessageSourceTurnIndex,
        ...metadata,
      },
    },
    latestAssistantTimestamp:
      latestMessageRole === 'assistant' ? latestMessageTimestamp : '2026-05-08T23:40:02.000Z',
    latestMessageRole,
    latestMessageTimestamp,
    latestMessageDigest,
    latestMessageSourceTurnIndex,
    digest: 'thread-digest',
  };
}

async function setupWatchEnv(label) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `chatty-codex-watch-${label}-`));
  const storePath = path.join(tempDir, 'store.json');
  const usersPath = path.join(tempDir, 'users.json');
  const sessionsRoot = path.join(tempDir, 'sessions');
  const cliHome = path.join(tempDir, 'chatty-cli-home');
  const rolloutDir = path.join(sessionsRoot, '2026', '05', '08');

  await fs.mkdir(rolloutDir, { recursive: true });
  await fs.mkdir(cliHome, { recursive: true });
  await writeUsersFile(usersPath);

  const originals = {
    fallback: process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH,
    databaseUrl: process.env.DATABASE_URL,
    apiBaseUrl: process.env.VVAULT_API_BASE_URL,
    vvaultUrl: process.env.VVAULT_URL,
    vvaultBaseUrl: process.env.VVAULT_BASE_URL,
    chattyCliHome: process.env.CHATTY_CLI_HOME,
  };

  process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = storePath;
  process.env.CHATTY_CLI_HOME = cliHome;
  delete process.env.DATABASE_URL;
  delete process.env.VVAULT_API_BASE_URL;
  delete process.env.VVAULT_URL;
  delete process.env.VVAULT_BASE_URL;

  return {
    tempDir,
    storePath,
    usersPath,
    sessionsRoot,
    cliHome,
    rolloutDir,
    restore: async () => {
      if (typeof originals.fallback === 'undefined') {
        delete process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
      } else {
        process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = originals.fallback;
      }
      if (typeof originals.databaseUrl === 'undefined') {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originals.databaseUrl;
      }
      if (typeof originals.apiBaseUrl === 'undefined') {
        delete process.env.VVAULT_API_BASE_URL;
      } else {
        process.env.VVAULT_API_BASE_URL = originals.apiBaseUrl;
      }
      if (typeof originals.vvaultUrl === 'undefined') {
        delete process.env.VVAULT_URL;
      } else {
        process.env.VVAULT_URL = originals.vvaultUrl;
      }
      if (typeof originals.vvaultBaseUrl === 'undefined') {
        delete process.env.VVAULT_BASE_URL;
      } else {
        process.env.VVAULT_BASE_URL = originals.vvaultBaseUrl;
      }
      if (typeof originals.chattyCliHome === 'undefined') {
        delete process.env.CHATTY_CLI_HOME;
      } else {
        process.env.CHATTY_CLI_HOME = originals.chattyCliHome;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}

test('watch bootstrap imports the last three pairs and writes a checkpoint', async () => {
  const env = await setupWatchEnv('bootstrap');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-bootstrap.jsonl');
  const store = createCanonicalRelayStore();

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [
          ['u1', 'a1'],
          ['u2', 'a2'],
          ['u3', 'a3'],
          ['u4', 'a4'],
        ],
      }).join('\n'),
      'utf8',
    );

    const events = [];
    const result = await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      emitEvent: (payload) => events.push(payload),
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });
    const conversations = await store.readConversationsImpl(userContext(), 'zen-001', {
      allowLocalFallback: false,
    });
    const canonicalConversation = conversations.find(
      (conversation) => conversation.sessionId === 'zen-001_chat_with_zen-001',
    );

    assert.equal(events[0].event, 'started');
    assert.equal(events[1].event, 'synced');
    assert.equal(events[1].importedTurns, 6);
    assert.equal(events[1].source.selection, 'watch-bootstrap-window');
    assert.deepEqual(
      canonicalConversation.messages.slice(-6).map((message) => message.content),
      ['u2', 'a2', 'u3', 'a3', 'u4', 'a4'],
    );
    assert.equal(result.checkpoint.lastImportedSourceTurnIndex, 8);
    assert.ok(result.checkpoint.latestAssistantTurnId);
    await fs.access(result.checkpointPath);
  } finally {
    await env.restore();
  }
});

test('watch can sync Codex source evidence to VVAULT before continuity relay', async () => {
  const env = await setupWatchEnv('source-sync');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-source-sync.jsonl');
  const store = createCanonicalRelayStore();
  const sourceSyncCalls = [];

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [['u1', 'a1']],
      }).join('\n'),
      'utf8',
    );

    const events = [];
    const result = await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      syncSourceEvidenceToVvault: true,
      sourceSyncMaxFiles: 7,
      syncSourceEvidenceImpl: async (params) => {
        sourceSyncCalls.push(params);
        return {
          ok: true,
          scannedFiles: 1,
          archivedThreads: 1,
          vvaultPublishedThreads: 1,
          vvaultReadbackVerifiedThreads: 1,
          latest: buildSourceSyncLatest({ rolloutPath }),
        };
      },
      emitEvent: (payload) => events.push(payload),
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });

    assert.equal(sourceSyncCalls.length, 1);
    assert.equal(sourceSyncCalls[0].codexSessionsRoot, env.sessionsRoot);
    assert.equal(sourceSyncCalls[0].maxFiles, 7);
    assert.equal(sourceSyncCalls[0].publishToVvault, true);
    assert.equal(sourceSyncCalls[0].requireVvaultReadback, true);
    assert.equal(sourceSyncCalls[0].failOnVvaultPublishFailure, true);
    assert.equal(sourceSyncCalls[0].writeLocalArchive, false);
    assert.deepEqual(events.map((event) => event.event), ['started', 'source_synced', 'synced']);
    assert.equal(events[1].source.continuityClaim, 'none');
    assert.equal(events[1].vvaultReadbackVerifiedThreads, 1);
    assert.equal(events[1].latest.vvaultReadback.storageMode, 'vvault_body');
    assert.equal(Object.hasOwn(events[1].latest.vvaultReadback, 'content'), false);
    assert.equal(events[2].relayAuthority, 'synced-vvault-readback');
    assert.equal(events[2].vvaultReadback.storagePath, 'instances/zen-001/codex/latest-codex.md');
    assert.equal(events[2].latestSyncedMessage.role, 'assistant');
    assert.equal(events[2].canonicalReadback.source, 'vvault-api');
    assert.equal(events[2].canonicalReadback.sessionId, 'zen-001_chat_with_zen-001');
    assert.equal(events[2].canonicalReadback.localFallback, false);
    assert.equal(events[2].canonicalReadback.messageCount, 2);
    assert.ok(events[2].resumeTokenJson);
    assert.match(events[2].chattyResumeUrl, /^http:\/\/localhost:5173\/app\/chat\/zen-001_chat_with_zen-001\?resume=/);
    assert.equal(result.checkpoint.relayAuthority, 'synced-vvault-readback');
    assert.equal(result.checkpoint.vvaultStoragePath, 'instances/zen-001/codex/latest-codex.md');
    assert.equal(result.checkpoint.vvaultReadbackSha256, 'readback-sha256');
    assert.equal(result.sourceSyncEvents, 1);
  } finally {
    await env.restore();
  }
});

test('watch blocks continuity relay while VVAULT source evidence latest message is still user', async () => {
  const env = await setupWatchEnv('pending-user');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-pending-user.jsonl');
  const store = createCanonicalRelayStore();

  try {
    await fs.writeFile(
      rolloutPath,
      [
        ...buildRolloutLines({
          pairs: [['u1', 'a1']],
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:40:03.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'u2 is still waiting for an assistant tail' }],
          },
        }),
      ].join('\n'),
      'utf8',
    );

    const events = [];
    const result = await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      syncSourceEvidenceToVvault: true,
      syncSourceEvidenceImpl: async () => ({
        ok: true,
        scannedFiles: 1,
        archivedThreads: 1,
        vvaultPublishedThreads: 1,
        vvaultReadbackVerifiedThreads: 1,
        latest: buildSourceSyncLatest({
          rolloutPath,
          latestMessageRole: 'user',
          latestMessageTimestamp: '2026-05-08T23:40:03.000Z',
          latestMessageDigest: 'pending-user-digest',
          latestMessageSourceTurnIndex: 3,
          content: '# Pending Codex\n\n## User\n\nu2 is still waiting\n',
        }),
      }),
      emitEvent: (payload) => events.push(payload),
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });

    assert.deepEqual(events.map((event) => event.event), [
      'started',
      'source_synced',
      'awaiting_assistant_tail',
    ]);
    assert.equal(events[2].relayAuthority, 'synced-vvault-readback');
    assert.equal(events[2].latestSyncedMessage.role, 'user');
    assert.equal(store.messages.length, 0);
    assert.equal(result.syncedEvents, 0);
    assert.equal(result.checkpoint, null);
    await assert.rejects(() => fs.access(path.join(env.cliHome, 'codex-handoff-watch.state.json')));
  } finally {
    await env.restore();
  }
});

test('watch fails closed when source sync lacks verified VVAULT readback proof', async () => {
  const env = await setupWatchEnv('missing-readback');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-missing-readback.jsonl');
  const store = createCanonicalRelayStore();

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [['u1', 'a1']],
      }).join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        runCodexContinuityWatch({
          codexSessionsRoot: env.sessionsRoot,
          usersPath: env.usersPath,
          maxPolls: 1,
          syncSourceEvidenceToVvault: true,
          syncSourceEvidenceImpl: async () => ({
            ok: true,
            scannedFiles: 1,
            archivedThreads: 1,
            vvaultPublishedThreads: 1,
            vvaultReadbackVerifiedThreads: 0,
            latest: {
              sourceSessionId: 'latest-codex',
              sourceSessionPath: rolloutPath,
              latestMessageRole: 'assistant',
              latestMessageTimestamp: '2026-05-08T23:40:02.000Z',
            },
          }),
          emitEvent: () => {},
          readConversationsImpl: store.readConversationsImpl,
          writeTranscriptImpl: store.writeTranscriptImpl,
          readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
        }),
      /verified VVAULT readback/i,
    );
    assert.equal(store.messages.length, 0);
    await assert.rejects(() => fs.access(path.join(env.cliHome, 'codex-handoff-watch.state.json')));
  } finally {
    await env.restore();
  }
});

test('watch fails closed when VVAULT readback is not vvault_body', async () => {
  const env = await setupWatchEnv('wrong-storage-mode');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-wrong-storage-mode.jsonl');
  const store = createCanonicalRelayStore();

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [['u1', 'a1']],
      }).join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        runCodexContinuityWatch({
          codexSessionsRoot: env.sessionsRoot,
          usersPath: env.usersPath,
          maxPolls: 1,
          syncSourceEvidenceToVvault: true,
          syncSourceEvidenceImpl: async () => ({
            ok: true,
            scannedFiles: 1,
            archivedThreads: 1,
            vvaultPublishedThreads: 1,
            vvaultReadbackVerifiedThreads: 0,
            latest: buildSourceSyncLatest({
              rolloutPath,
              storageMode: 'local-fallback',
            }),
          }),
          emitEvent: () => {},
          readConversationsImpl: store.readConversationsImpl,
          writeTranscriptImpl: store.writeTranscriptImpl,
          readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
        }),
      /storage_mode is not vvault_body/i,
    );
    assert.equal(store.messages.length, 0);
    await assert.rejects(() => fs.access(path.join(env.cliHome, 'codex-handoff-watch.state.json')));
  } finally {
    await env.restore();
  }
});

test('watch fails closed when parsed rollout tail mismatches verified VVAULT readback source turn', async () => {
  const env = await setupWatchEnv('readback-mismatch');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-readback-mismatch.jsonl');
  const store = createCanonicalRelayStore();

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [['u1', 'a1']],
      }).join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        runCodexContinuityWatch({
          codexSessionsRoot: env.sessionsRoot,
          usersPath: env.usersPath,
          maxPolls: 1,
          syncSourceEvidenceToVvault: true,
          syncSourceEvidenceImpl: async () => ({
            ok: true,
            scannedFiles: 1,
            archivedThreads: 1,
            vvaultPublishedThreads: 1,
            vvaultReadbackVerifiedThreads: 1,
            latest: buildSourceSyncLatest({
              rolloutPath,
              latestMessageSourceTurnIndex: 99,
            }),
          }),
          emitEvent: () => {},
          readConversationsImpl: store.readConversationsImpl,
          writeTranscriptImpl: store.writeTranscriptImpl,
          readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
        }),
      /source turn mismatch/i,
    );
    assert.equal(store.messages.length, 0);
    await assert.rejects(() => fs.access(path.join(env.cliHome, 'codex-handoff-watch.state.json')));
  } finally {
    await env.restore();
  }
});

test('watch emits nothing new on a later poll when no assistant tail advances', async () => {
  const env = await setupWatchEnv('idle');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-idle.jsonl');
  const store = createCanonicalRelayStore();

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [
          ['u1', 'a1'],
          ['u2', 'a2'],
          ['u3', 'a3'],
        ],
      }).join('\n'),
      'utf8',
    );

    const events = [];
    await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 2,
      emitEvent: (payload) => events.push(payload),
      sleepImpl: async () => {},
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });

    assert.equal(events.filter((event) => event.event === 'synced').length, 1);
  } finally {
    await env.restore();
  }
});

test('watch imports only the new completed pair after restart using the stored checkpoint', async () => {
  const env = await setupWatchEnv('resume');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-resume.jsonl');
  const store = createCanonicalRelayStore();

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [
          ['u1', 'a1'],
          ['u2', 'a2'],
          ['u3', 'a3'],
        ],
      }).join('\n'),
      'utf8',
    );

    await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      emitEvent: () => {},
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });

    await fs.appendFile(
      rolloutPath,
      `\n${buildRolloutLines({
        sessionId: 'latest-codex',
        pairs: [['u4', 'a4']],
        start: '2026-05-08T23:50:00.000Z',
      }).slice(1).join('\n')}`,
      'utf8',
    );

    const events = [];
    await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      emitEvent: (payload) => events.push(payload),
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });
    const conversations = await store.readConversationsImpl(userContext(), 'zen-001', {
      allowLocalFallback: false,
    });
    const canonicalConversation = conversations.find(
      (conversation) => conversation.sessionId === 'zen-001_chat_with_zen-001',
    );

    assert.equal(events.filter((event) => event.event === 'synced').length, 1);
    assert.equal(events[1].importedTurns, 2);
    assert.equal(events[1].source.selection, 'watch-incremental-window');
    assert.deepEqual(
      canonicalConversation.messages.slice(-2).map((message) => message.content),
      ['u4', 'a4'],
    );
  } finally {
    await env.restore();
  }
});

test('watch does not advance checkpoint for a dangling user turn until its assistant arrives', async () => {
  const env = await setupWatchEnv('dangling');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-dangling.jsonl');
  const store = createCanonicalRelayStore();

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [
          ['u1', 'a1'],
          ['u2', 'a2'],
        ],
      }).join('\n'),
      'utf8',
    );

    const first = await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      emitEvent: () => {},
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });
    const firstCheckpointIndex = first.checkpoint.lastImportedSourceTurnIndex;

    await fs.appendFile(
      rolloutPath,
      `\n${JSON.stringify({
        timestamp: '2026-05-08T23:55:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'u3 dangling until assistant arrives' }],
        },
      })}`,
      'utf8',
    );

    const danglingEvents = [];
    const dangling = await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      emitEvent: (payload) => danglingEvents.push(payload),
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });

    assert.equal(danglingEvents.filter((event) => event.event === 'synced').length, 0);
    assert.equal(dangling.checkpoint.lastImportedSourceTurnIndex, firstCheckpointIndex);

    await fs.appendFile(
      rolloutPath,
      `\n${JSON.stringify({
        timestamp: '2026-05-08T23:55:01.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          content: [{ type: 'output_text', text: 'a3 completes the dangling pair' }],
        },
      })}`,
      'utf8',
    );

    const completedEvents = [];
    const completed = await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      emitEvent: (payload) => completedEvents.push(payload),
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });
    const conversations = await store.readConversationsImpl(userContext(), 'zen-001', {
      allowLocalFallback: false,
    });
    const canonicalConversation = conversations.find(
      (conversation) => conversation.sessionId === 'zen-001_chat_with_zen-001',
    );

    assert.equal(completedEvents.filter((event) => event.event === 'synced').length, 1);
    assert.equal(completedEvents[1].importedTurns, 2);
    assert.deepEqual(
      canonicalConversation.messages.slice(-2).map((message) => message.content),
      ['u3 dangling until assistant arrives', 'a3 completes the dangling pair'],
    );
    assert.ok(completed.checkpoint.lastImportedSourceTurnIndex > firstCheckpointIndex);
  } finally {
    await env.restore();
  }
});

test('watch bootstraps from a newer rollout session when the active session rolls over', async () => {
  const env = await setupWatchEnv('rollover');
  const firstRolloutPath = path.join(env.rolloutDir, 'rollout-first.jsonl');
  const nextDayDir = path.join(env.sessionsRoot, '2026', '05', '09');
  const secondRolloutPath = path.join(nextDayDir, 'rollout-second.jsonl');
  const store = createCanonicalRelayStore();

  try {
    await fs.writeFile(
      firstRolloutPath,
      buildRolloutLines({
        sessionId: 'first-session',
        pairs: [
          ['u1', 'a1'],
          ['u2', 'a2'],
        ],
      }).join('\n'),
      'utf8',
    );

    await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      emitEvent: () => {},
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });

    await fs.mkdir(nextDayDir, { recursive: true });
    await fs.writeFile(
      secondRolloutPath,
      buildRolloutLines({
        sessionId: 'second-session',
        pairs: [
          ['n1', 'm1'],
          ['n2', 'm2'],
          ['n3', 'm3'],
        ],
        start: '2026-05-09T00:00:00.000Z',
      }).join('\n'),
      'utf8',
    );

    const events = [];
    await runCodexContinuityWatch({
      codexSessionsRoot: env.sessionsRoot,
      usersPath: env.usersPath,
      maxPolls: 1,
      emitEvent: (payload) => events.push(payload),
      readConversationsImpl: store.readConversationsImpl,
      writeTranscriptImpl: store.writeTranscriptImpl,
      readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
    });

    assert.equal(events[1].event, 'synced');
    assert.equal(events[1].source.path, secondRolloutPath);
    assert.equal(events[1].source.selection, 'watch-bootstrap-window');
    assert.equal(events[1].importedTurns, 6);
  } finally {
    await env.restore();
  }
});

test('watch rejects local fallback writes instead of advancing the checkpoint', async () => {
  const env = await setupWatchEnv('local-write');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-local-write.jsonl');
  const strictReadOptions = [];
  const writeParams = [];
  const events = [];

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [['u1', 'a1']],
      }).join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        runCodexContinuityWatch({
          codexSessionsRoot: env.sessionsRoot,
          usersPath: env.usersPath,
          maxPolls: 1,
          emitEvent: (payload) => events.push(payload),
          readLatestRuntimeTurnStateImpl: async () => null,
          readConversationsImpl: async (_userContext, _constructId, options = {}) => {
            strictReadOptions.push(options);
            return [
              {
                sessionId: 'zen-001_chat_with_zen-001',
                title: 'Zen',
                constructId: 'zen-001',
                constructName: 'Zen',
                constructCallsign: 'zen-001',
                persistenceSource: 'vvault-api',
                messages: [],
              },
            ];
          },
          writeTranscriptImpl: async (params) => {
            writeParams.push(params);
            return { success: true, source: 'local-fallback' };
          },
        }),
      /local fallback/i,
    );

    assert.deepEqual(
      strictReadOptions.map((options) => options.allowLocalFallback),
      [false],
    );
    assert.equal(writeParams.length, 1);
    assert.equal(writeParams[0].requireVvaultBodySuccess, true);
    assert.deepEqual(events.map((event) => event.event), ['started']);
    await assert.rejects(() => fs.access(path.join(env.cliHome, 'codex-handoff-watch.state.json')));
  } finally {
    await env.restore();
  }
});

test('watch rejects local fallback readback instead of advancing the checkpoint', async () => {
  const env = await setupWatchEnv('local-readback');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-local-readback.jsonl');
  const strictReadOptions = [];
  const messages = [];
  const events = [];

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [['u1', 'a1']],
      }).join('\n'),
      'utf8',
    );

    await assert.rejects(
      () =>
        runCodexContinuityWatch({
          codexSessionsRoot: env.sessionsRoot,
          usersPath: env.usersPath,
          maxPolls: 1,
          emitEvent: (payload) => events.push(payload),
          readLatestRuntimeTurnStateImpl: async () => null,
          readConversationsImpl: async (_userContext, _constructId, options = {}) => {
            strictReadOptions.push(options);
            if (strictReadOptions.length === 1) {
              return [
                {
                  sessionId: 'zen-001_chat_with_zen-001',
                  title: 'Zen',
                  constructId: 'zen-001',
                  constructName: 'Zen',
                  constructCallsign: 'zen-001',
                  persistenceSource: 'vvault-api',
                  messages: [],
                },
              ];
            }
            return [
              {
                sessionId: 'zen-001_chat_with_zen-001',
                title: 'Zen',
                constructId: 'zen-001',
                constructName: 'Zen',
                constructCallsign: 'zen-001',
                persistenceSource: 'local-fallback',
                localFallback: true,
                messages,
              },
            ];
          },
          writeTranscriptImpl: async (params) => {
            messages.push({
              role: params.role,
              content: params.content,
              timestamp: params.timestamp,
              metadata: params.metadata || {},
            });
            return { success: true, source: 'vvault-api' };
          },
        }),
      /readback resolved local fallback/i,
    );

    assert.deepEqual(
      strictReadOptions.map((options) => options.allowLocalFallback),
      [false, false],
    );
    assert.equal(messages.length, 2);
    assert.deepEqual(events.map((event) => event.event), ['started']);
    await assert.rejects(() => fs.access(path.join(env.cliHome, 'codex-handoff-watch.state.json')));
  } finally {
    await env.restore();
  }
});

test('watch fails closed when another live watcher owns the lock', async () => {
  const env = await setupWatchEnv('lock');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-lock.jsonl');
  const lockPath = path.join(env.cliHome, 'codex-handoff-watch.lock');

  try {
    await fs.writeFile(
      rolloutPath,
      buildRolloutLines({
        pairs: [['u1', 'a1']],
      }).join('\n'),
      'utf8',
    );
    await fs.writeFile(
      lockPath,
      `${JSON.stringify({ pid: process.pid, preferredCwd: process.cwd(), updatedAt: new Date().toISOString() })}\n`,
      'utf8',
    );

    await assert.rejects(
      () =>
        runCodexContinuityWatch({
          codexSessionsRoot: env.sessionsRoot,
          usersPath: env.usersPath,
          maxPolls: 1,
          emitEvent: () => {},
        }),
      /already running/i,
    );
  } finally {
    await env.restore();
  }
});
