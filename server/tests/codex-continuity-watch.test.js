import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readConversations } from '../../vvaultConnector/readConversations.js';
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
    });
    const conversations = await readConversations(userContext(), 'zen-001');
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

test('watch emits nothing new on a later poll when no assistant tail advances', async () => {
  const env = await setupWatchEnv('idle');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-idle.jsonl');

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
    });

    assert.equal(events.filter((event) => event.event === 'synced').length, 1);
  } finally {
    await env.restore();
  }
});

test('watch imports only the new completed pair after restart using the stored checkpoint', async () => {
  const env = await setupWatchEnv('resume');
  const rolloutPath = path.join(env.rolloutDir, 'rollout-resume.jsonl');

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
    });
    const conversations = await readConversations(userContext(), 'zen-001');
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

test('watch bootstraps from a newer rollout session when the active session rolls over', async () => {
  const env = await setupWatchEnv('rollover');
  const firstRolloutPath = path.join(env.rolloutDir, 'rollout-first.jsonl');
  const nextDayDir = path.join(env.sessionsRoot, '2026', '05', '09');
  const secondRolloutPath = path.join(nextDayDir, 'rollout-second.jsonl');

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
    });

    assert.equal(events[1].event, 'synced');
    assert.equal(events[1].source.path, secondRolloutPath);
    assert.equal(events[1].source.selection, 'watch-bootstrap-window');
    assert.equal(events[1].importedTurns, 6);
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
