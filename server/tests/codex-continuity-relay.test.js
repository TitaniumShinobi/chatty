import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readConversations } from '../../vvaultConnector/readConversations.js';
import { readLatestRuntimeTurnState } from '../../vvaultConnector/runtimeTurnStateStore.js';
import {
  parseCodexExportText,
  parseCodexJsonTail,
  parseCodexRolloutJsonl,
  readLatestCodexTail,
  relayCodexContinuity,
  selectBootstrapRelayTurns,
  selectIncrementalRelayTurns,
} from '../lib/codexContinuityRelay.js';

const canonicalUser = {
  user_id: 'devon_woodson_1774390416168',
  email: 'dwoodson92@gmail.com',
  name: 'Devon Woodson',
  vvault_user_id: 'devon_woodson_1774390416168',
};

const JSON_TAIL = [
  {
    role: 'user',
    content: 'Please carry this exact Codex thread into Chatty.',
  },
  {
    role: 'assistant',
    content: 'I am carrying this exact Codex thread into Chatty.',
  },
];

describe('Codex continuity relay', () => {
  it('parses a saved Codex export down to the terminal user/assistant pair', () => {
    const parsed = parseCodexExportText(`
No tasks in progress


pick back up where we left off


16 previous messages
I picked back up where we left off and turned the remaining smoke-test item into a real regression guard.

Verification: npm test passes on the current working tree.


ok... i just need my openai api key to work and call all their real models so do that first


32 previous messages
The OpenAI path is wired now and the remaining blocker is the actual OPENAI_API_KEY value loaded from code/.env.
`);

    assert.equal(parsed.turns.length, 2);
    assert.equal(parsed.turns[0].role, 'user');
    assert.equal(
      parsed.turns[0].content,
      'ok... i just need my openai api key to work and call all their real models so do that first',
    );
    assert.equal(parsed.turns[1].role, 'assistant');
    assert.equal(
      parsed.turns[1].content,
      'The OpenAI path is wired now and the remaining blocker is the actual OPENAI_API_KEY value loaded from code/.env.',
    );
    assert.equal(typeof parsed.turns[0].sourceTurnIndex, 'number');
    assert.equal(typeof parsed.turns[1].sourceTurnIndex, 'number');
    assert.equal(parsed.parseReport.strategy, 'terminal-paragraph-pair');
  });

  it('prefers explicit role markers when present in the saved export tail', () => {
    const parsed = parseCodexExportText(`
Some earlier export chrome


U
yo

AI
Relay acknowledged and ready for Chatty continuation.

Codex ran out of room in the model's context window. Start a new conversation or clear earlier history before retrying.

Auto context
`);

    assert.equal(parsed.turns[0].role, 'user');
    assert.equal(parsed.turns[0].content, 'yo');
    assert.equal(parsed.turns[1].role, 'assistant');
    assert.equal(
      parsed.turns[1].content,
      'Relay acknowledged and ready for Chatty continuation.',
    );
    assert.equal(typeof parsed.turns[0].sourceTurnIndex, 'number');
    assert.equal(typeof parsed.turns[1].sourceTurnIndex, 'number');
    assert.equal(parsed.parseReport.strategy, 'role-markers');
  });

  it('parses stdin JSON tails with explicit roles', () => {
    const parsed = parseCodexJsonTail(JSON.stringify(JSON_TAIL));

    assert.equal(parsed.turns.length, 2);
    assert.equal(parsed.turns[0].role, 'user');
    assert.equal(parsed.turns[1].role, 'assistant');
    assert.equal(parsed.parseReport.sourceType, 'stdin-json');
  });

  it('parses a Codex rollout JSONL file down to the latest real user/assistant pair', () => {
    const parsed = parseCodexRolloutJsonl(
      [
        JSON.stringify({
          timestamp: '2026-05-08T23:01:00.000Z',
          type: 'session_meta',
          payload: {
            id: '019e-rollout',
            cwd: '/Users/devonwoodson/Documents/GitHub/chatty',
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:01:01.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: '<environment_context>\n<cwd>/Users/devonwoodson/Documents/GitHub/chatty</cwd>' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:01:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'carry this exact Codex thread into Chatty' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:01:03.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            phase: 'commentary',
            content: [{ type: 'output_text', text: 'I am collecting the exact continuity tail now.' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:01:04.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            content: [{ type: 'output_text', text: 'Relay acknowledged and ready for Chatty continuation.' }],
          },
        }),
      ].join('\n'),
      { sessionPath: '/tmp/rollout-test.jsonl' },
    );

    assert.equal(parsed.turns.length, 2);
    assert.equal(parsed.conversationTurns.length, 2);
    assert.equal(parsed.turns[0].role, 'user');
    assert.equal(parsed.turns[0].content, 'carry this exact Codex thread into Chatty');
    assert.equal(parsed.turns[1].role, 'assistant');
    assert.equal(parsed.turns[1].content, 'Relay acknowledged and ready for Chatty continuation.');
    assert.equal(parsed.parseReport.strategy, 'rollout-jsonl-terminal-pair');
    assert.equal(parsed.parseReport.cwd, '/Users/devonwoodson/Documents/GitHub/chatty');
  });

  it('selects the bootstrap relay window as the last three complete pairs', () => {
    const selected = selectBootstrapRelayTurns([
      { role: 'user', content: 'u1', sourceTurnIndex: 1 },
      { role: 'assistant', content: 'a1', sourceTurnIndex: 2 },
      { role: 'user', content: 'u2', sourceTurnIndex: 3 },
      { role: 'assistant', content: 'a2', sourceTurnIndex: 4 },
      { role: 'user', content: 'u3', sourceTurnIndex: 5 },
      { role: 'assistant', content: 'a3', sourceTurnIndex: 6 },
      { role: 'user', content: 'u4', sourceTurnIndex: 7 },
      { role: 'assistant', content: 'a4', sourceTurnIndex: 8 },
    ]);

    assert.deepEqual(
      selected.map((turn) => turn.content),
      ['u2', 'a2', 'u3', 'a3', 'u4', 'a4'],
    );
  });

  it('selects only complete incremental pairs and skips a trailing dangling user turn', () => {
    const selected = selectIncrementalRelayTurns(
      [
        { role: 'user', content: 'u1', sourceTurnIndex: 1 },
        { role: 'assistant', content: 'a1', sourceTurnIndex: 2 },
        { role: 'user', content: 'u2', sourceTurnIndex: 3 },
        { role: 'assistant', content: 'a2', sourceTurnIndex: 4 },
        { role: 'user', content: 'u3', sourceTurnIndex: 5 },
      ],
      { afterSourceTurnIndex: 2 },
    );

    assert.deepEqual(
      selected.map((turn) => turn.content),
      ['u2', 'a2'],
    );
  });

  it('fails closed on ambiguous export input', () => {
    assert.throws(
      () =>
        parseCodexExportText(`
No tasks in progress


Added a verification report.


Verification: npm test passes.
`),
      /terminal pair is ambiguous|must contain a terminal user\/assistant pair/i,
    );
  });

  it('fails closed when the tail ends on a user turn', () => {
    assert.throws(
      () =>
        parseCodexJsonTail(
          JSON.stringify([
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi' },
            { role: 'user', content: 'dangling user turn' },
          ]),
        ),
      /must end with an assistant turn/i,
    );
  });

  it('prefers the newest usable rollout matching the current repo cwd', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-rollouts-'));
    const otherDir = path.join(tempRoot, '2026', '05', '07');
    const currentDir = path.join(tempRoot, '2026', '05', '08');
    await fs.mkdir(otherDir, { recursive: true });
    await fs.mkdir(currentDir, { recursive: true });

    const oldRolloutPath = path.join(otherDir, 'rollout-old.jsonl');
    const currentRolloutPath = path.join(currentDir, 'rollout-current.jsonl');

    await fs.writeFile(
      oldRolloutPath,
      [
        JSON.stringify({
          timestamp: '2026-05-07T20:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'old', cwd: '/Users/devonwoodson/Documents/GitHub/other' },
        }),
        JSON.stringify({
          timestamp: '2026-05-07T20:00:01.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'other repo user' }] },
        }),
        JSON.stringify({
          timestamp: '2026-05-07T20:00:02.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'other repo assistant' }] },
        }),
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      currentRolloutPath,
      [
        JSON.stringify({
          timestamp: '2026-05-08T21:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'current', cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T21:00:01.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'chatty user turn' }] },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T21:00:02.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'chatty assistant turn' }] },
        }),
      ].join('\n'),
      'utf8',
    );

    try {
      const parsed = await readLatestCodexTail({
        codexSessionsRoot: tempRoot,
        preferredCwd: process.cwd(),
      });

      assert.equal(parsed.parseReport.sessionPath, currentRolloutPath);
      assert.equal(parsed.turns[0].content, 'chatty user turn');
      assert.equal(parsed.turns[1].content, 'chatty assistant turn');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('imports real user and assistant turns and stores runtimeTurnState only on assistant messages', async () => {
    const originalFallbackPath = process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalApiBaseUrl = process.env.VVAULT_API_BASE_URL;
    const originalVvaultUrl = process.env.VVAULT_URL;
    const originalVvaultBaseUrl = process.env.VVAULT_BASE_URL;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-relay-'));
    const usersPath = path.join(tempDir, 'users.json');

    await fs.writeFile(
      usersPath,
      JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
      'utf8',
    );

    try {
      process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = path.join(tempDir, 'store.json');
      delete process.env.DATABASE_URL;
      delete process.env.VVAULT_API_BASE_URL;
      delete process.env.VVAULT_URL;
      delete process.env.VVAULT_BASE_URL;

      const result = await relayCodexContinuity({
        stdinJson: JSON.stringify(JSON_TAIL),
        now: '2026-05-08T23:10:00.000Z',
        usersPath,
      });
      const conversations = await readConversations(
        {
          userId: canonicalUser.user_id,
          userEmail: canonicalUser.email,
          supabaseUserId: canonicalUser.vvault_user_id,
        },
        'zen-001',
      );
      const canonicalConversation = conversations.find(
        (conversation) => conversation.sessionId === 'zen-001_chat_with_zen-001',
      );
      const tail = canonicalConversation.messages.slice(-2);

      assert.equal(result.importedTurns, 2);
      assert.equal(result.dedupedTurns, 0);
      assert.equal(result.latestAssistantContent, JSON_TAIL[1].content);
      assert.equal(tail[0].role, 'user');
      assert.equal(tail[0].content, JSON_TAIL[0].content);
      assert.equal(tail[0].metadata.runtimeTurnState, undefined);
      assert.equal(tail[1].role, 'assistant');
      assert.equal(tail[1].content, JSON_TAIL[1].content);
      assert.equal(tail[1].metadata.sourceSeat, 'codex');
      assert.ok(tail[1].metadata.runtimeTurnState);

      const latestState = await readLatestRuntimeTurnState(
        {
          userId: canonicalUser.user_id,
          userEmail: canonicalUser.email,
          supabaseUserId: canonicalUser.vvault_user_id,
        },
        {
          sessionId: 'zen-001_chat_with_zen-001',
          constructId: 'zen-001',
        },
      );
      assert.equal(latestState.runtimeTurnState.assistantTurnId, result.latestAssistantTurnId);
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

  it('is idempotent when the same relay input is rerun', async () => {
    const originalFallbackPath = process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalApiBaseUrl = process.env.VVAULT_API_BASE_URL;
    const originalVvaultUrl = process.env.VVAULT_URL;
    const originalVvaultBaseUrl = process.env.VVAULT_BASE_URL;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-relay-idempotent-'));
    const usersPath = path.join(tempDir, 'users.json');

    await fs.writeFile(
      usersPath,
      JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
      'utf8',
    );

    try {
      process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = path.join(tempDir, 'store.json');
      delete process.env.DATABASE_URL;
      delete process.env.VVAULT_API_BASE_URL;
      delete process.env.VVAULT_URL;
      delete process.env.VVAULT_BASE_URL;

      const first = await relayCodexContinuity({
        stdinJson: JSON.stringify(JSON_TAIL),
        now: '2026-05-08T23:12:00.000Z',
        usersPath,
      });
      const second = await relayCodexContinuity({
        stdinJson: JSON.stringify(JSON_TAIL),
        now: '2026-05-08T23:13:00.000Z',
        usersPath,
      });
      const conversations = await readConversations(
        {
          userId: canonicalUser.user_id,
          userEmail: canonicalUser.email,
          supabaseUserId: canonicalUser.vvault_user_id,
        },
        'zen-001',
      );
      const canonicalConversation = conversations.find(
        (conversation) => conversation.sessionId === 'zen-001_chat_with_zen-001',
      );
      const matchingMessages = canonicalConversation.messages.filter(
        (message) =>
          message.content === JSON_TAIL[0].content ||
          message.content === JSON_TAIL[1].content,
      );

      assert.equal(first.importedTurns, 2);
      assert.equal(second.importedTurns, 0);
      assert.equal(second.dedupedTurns, 2);
      assert.equal(matchingMessages.length, 2);
      assert.equal(second.latestAssistantContent, JSON_TAIL[1].content);
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

  it('relays the newest local Codex rollout tail through the canonical continuity path', async () => {
    const originalFallbackPath = process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalApiBaseUrl = process.env.VVAULT_API_BASE_URL;
    const originalVvaultUrl = process.env.VVAULT_URL;
    const originalVvaultBaseUrl = process.env.VVAULT_BASE_URL;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-relay-latest-'));
    const usersPath = path.join(tempDir, 'users.json');
    const codexSessionsRoot = path.join(tempDir, 'sessions');
    const rolloutDir = path.join(codexSessionsRoot, '2026', '05', '08');
    const rolloutPath = path.join(rolloutDir, 'rollout-latest.jsonl');

    await fs.mkdir(rolloutDir, { recursive: true });
    await fs.writeFile(
      usersPath,
      JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
      'utf8',
    );
    await fs.writeFile(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: '2026-05-08T23:30:00.000Z',
          type: 'session_meta',
          payload: { id: 'latest-codex', cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:30:01.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'relay latest codex tail' }] },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:30:02.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'latest codex tail acknowledged' }] },
        }),
      ].join('\n'),
      'utf8',
    );

    try {
      process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = path.join(tempDir, 'store.json');
      delete process.env.DATABASE_URL;
      delete process.env.VVAULT_API_BASE_URL;
      delete process.env.VVAULT_URL;
      delete process.env.VVAULT_BASE_URL;

      const result = await relayCodexContinuity({
        latestCodex: true,
        codexSessionsRoot,
        preferredCodexCwd: process.cwd(),
        now: '2026-05-08T23:31:00.000Z',
        usersPath,
      });

      assert.equal(result.source.type, 'latest-codex');
      assert.equal(result.importedTurns, 2);
      assert.equal(result.latestUserContent, 'relay latest codex tail');
      assert.equal(result.latestAssistantContent, 'latest codex tail acknowledged');
      assert.match(result.chattyResumeUrl, /^http:\/\/localhost:5173\/app\/chat\/zen-001_chat_with_zen-001\?resume=/);
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
