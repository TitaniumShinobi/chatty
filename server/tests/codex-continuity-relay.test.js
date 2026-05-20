import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
  user_id: 'test-user-001',
  email: 'user@example.com',
  name: 'Devon Woodson',
  vvault_user_id: 'test-user-001',
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
            cwd: '/home/user/projects/chatty',
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:01:01.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: '<environment_context>\n<cwd>/home/user/projects/chatty</cwd>' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:01:01.100Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'developer',
            content: [{ type: 'input_text', text: 'do not import developer instructions' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:01:01.200Z',
          type: 'response_item',
          payload: {
            type: 'function_call',
            name: 'exec_command',
            arguments: '{}',
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
          timestamp: '2026-05-08T23:01:03.500Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Assistant visible text without a final phase still imports.' }],
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
    assert.equal(parsed.conversationTurns.length, 4);
    assert.equal(parsed.turns[0].role, 'user');
    assert.equal(parsed.turns[0].content, 'carry this exact Codex thread into Chatty');
    assert.equal(parsed.turns[1].role, 'assistant');
    assert.equal(parsed.turns[1].content, 'Relay acknowledged and ready for Chatty continuation.');
    assert.deepEqual(
      parsed.conversationTurns.map((turn) => turn.content),
      [
        'carry this exact Codex thread into Chatty',
        'I am collecting the exact continuity tail now.',
        'Assistant visible text without a final phase still imports.',
        'Relay acknowledged and ready for Chatty continuation.',
      ],
    );
    assert.equal(parsed.parseReport.strategy, 'rollout-jsonl-terminal-pair');
    assert.equal(parsed.parseReport.cwd, '/home/user/projects/chatty');
    assert.equal(parsed.parseReport.skippedHiddenContextMessages, 1);
    assert.equal(parsed.parseReport.skippedNonFinalAssistantMessages, 0);
  });

  it('filters hidden Codex context blobs without importing them as user turns', () => {
    const parsed = parseCodexRolloutJsonl(
      [
        JSON.stringify({
          timestamp: '2026-05-08T23:05:00.000Z',
          type: 'session_meta',
          payload: {
            id: '019e-hidden-context',
            cwd: process.cwd(),
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:05:01.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: '<skills_instructions>\n'.padEnd(9000, 'x') }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:05:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'real user turn after hidden context' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:05:03.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            content: [{ type: 'output_text', text: 'real assistant turn after hidden context' }],
          },
        }),
      ].join('\n'),
    );

    assert.equal(parsed.conversationTurns.length, 2);
    assert.equal(parsed.turns[0].content, 'real user turn after hidden context');
    assert.equal(parsed.turns[1].content, 'real assistant turn after hidden context');
    assert.equal(parsed.parseReport.skippedHiddenContextMessages, 1);
  });

  it('filters Codex orchestration artifacts and strips memory citation blocks', () => {
    const parsed = parseCodexRolloutJsonl(
      [
        JSON.stringify({
          timestamp: '2026-05-08T23:06:00.000Z',
          type: 'session_meta',
          payload: {
            id: '019e-hidden-orchestration',
            cwd: process.cwd(),
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:06:01.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: '<subagent_notification>\n{"status":"completed"}' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:06:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            content: [{ type: 'output_text', text: '<proposed_plan>\nInternal plan only.</proposed_plan>' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:06:03.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'real user turn after orchestration noise' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-08T23:06:04.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            content: [{
              type: 'output_text',
              text: 'real assistant turn after orchestration noise\n\n<oai-mem-citation>\n<citation_entries>\nMEMORY.md:1-2|note=[hidden]\n</citation_entries>\n<rollout_ids>\n</rollout_ids>\n</oai-mem-citation>',
            }],
          },
        }),
      ].join('\n'),
    );

    assert.equal(parsed.conversationTurns.length, 2);
    assert.equal(parsed.turns[0].content, 'real user turn after orchestration noise');
    assert.equal(parsed.turns[1].content, 'real assistant turn after orchestration noise');
    assert.equal(parsed.parseReport.skippedHiddenContextMessages, 2);
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

  it('can parse pending source-evidence turns without a completed assistant tail', () => {
    const parsed = parseCodexRolloutJsonl(
      [
        JSON.stringify({
          timestamp: '2026-05-10T01:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'pending-source-session', cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: '2026-05-10T01:00:01.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'prompt should sync before assistant final' }],
          },
        }),
      ].join('\n'),
      { requireTerminalPair: false },
    );

    assert.equal(parsed.turns.length, 0);
    assert.equal(parsed.conversationTurns.length, 1);
    assert.equal(parsed.conversationTurns[0].content, 'prompt should sync before assistant final');
    assert.equal(parsed.parseReport.strategy, 'rollout-jsonl-pending-tail');
    assert.equal(parsed.parseReport.latestMessageRole, 'user');
  });

  it('selects the rollout with the newest normalized visible message, including pending user prompts', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-rollouts-pending-latest-'));
    const dayDir = path.join(tempRoot, '2026', '05', '10');
    await fs.mkdir(dayDir, { recursive: true });

    const olderCompletePath = path.join(dayDir, 'rollout-older-complete.jsonl');
    const pendingPath = path.join(dayDir, 'rollout-newer-pending.jsonl');

    await fs.writeFile(
      olderCompletePath,
      [
        JSON.stringify({
          timestamp: '2026-05-10T01:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'older-complete', cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: '2026-05-10T01:00:01.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'older complete user' }] },
        }),
        JSON.stringify({
          timestamp: '2026-05-10T01:00:02.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'older complete assistant' }] },
        }),
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      pendingPath,
      [
        JSON.stringify({
          timestamp: '2026-05-10T01:05:00.000Z',
          type: 'session_meta',
          payload: { id: 'newer-pending', cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: '2026-05-10T01:05:01.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'newer visible user prompt' }] },
        }),
      ].join('\n'),
      'utf8',
    );

    try {
      const parsed = await readLatestCodexTail({
        codexSessionsRoot: tempRoot,
        preferredCwd: process.cwd(),
      });

      assert.equal(parsed.parseReport.sessionPath, pendingPath);
      assert.equal(parsed.parseReport.latestMessageRole, 'user');
      assert.equal(parsed.parseReport.latestMessageTimestamp, '2026-05-10T01:05:01.000Z');
      assert.equal(parsed.conversationTurns[0].content, 'newer visible user prompt');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
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
          payload: { id: 'old', cwd: '/home/user/projects/other' },
        }),
        JSON.stringify({
          timestamp: '2026-05-07T20:00:01.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'other repo user' }] },
        }),
        JSON.stringify({
          timestamp: '2026-05-07T20:00:02.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'other repo assistant' }] },
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
          payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'chatty assistant turn' }] },
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

  it('still finds an older-dated active rollout when it has the freshest activity', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-rollouts-active-'));
    const crowdedNewerDir = path.join(tempRoot, '2026', '05', '08');
    const activeOlderDir = path.join(tempRoot, '2026', '04', '18');
    await fs.mkdir(crowdedNewerDir, { recursive: true });
    await fs.mkdir(activeOlderDir, { recursive: true });

    for (let index = 0; index < 70; index += 1) {
      const filePath = path.join(crowdedNewerDir, `rollout-${String(index).padStart(2, '0')}.jsonl`);
      await fs.writeFile(
        filePath,
        [
          JSON.stringify({
            timestamp: '2026-05-08T20:00:00.000Z',
            type: 'session_meta',
            payload: { id: `newer-${index}`, cwd: process.cwd() },
          }),
          JSON.stringify({
            timestamp: '2026-05-08T20:00:01.000Z',
            type: 'response_item',
            payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `newer user ${index}` }] },
          }),
          JSON.stringify({
            timestamp: `2026-05-08T20:00:${String((index % 50) + 10).padStart(2, '0')}.000Z`,
            type: 'response_item',
            payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: `newer assistant ${index}` }] },
          }),
        ].join('\n'),
        'utf8',
      );
    }

    const activeOlderPath = path.join(activeOlderDir, 'rollout-active-older.jsonl');
    await fs.writeFile(
      activeOlderPath,
      [
        JSON.stringify({
          timestamp: '2026-04-18T11:46:48.000Z',
          type: 'session_meta',
          payload: { id: 'active-older', cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: '2026-05-09T05:02:41.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'finish the live continuity proof from the real assistant tail' }] },
        }),
        JSON.stringify({
          timestamp: '2026-05-09T05:02:42.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'I grounded this in the repo first and the remaining gap is transcript truth before generation.' }] },
        }),
      ].join('\n'),
      'utf8',
    );
    const freshAt = new Date('2026-05-09T06:30:00.000Z');
    await fs.utimes(activeOlderPath, freshAt, freshAt);

    try {
      const parsed = await readLatestCodexTail({
        codexSessionsRoot: tempRoot,
        preferredCwd: process.cwd(),
      });

      assert.equal(parsed.parseReport.sessionPath, activeOlderPath);
      assert.equal(
        parsed.turns[0].content,
        'finish the live continuity proof from the real assistant tail',
      );
      assert.equal(
        parsed.turns[1].content,
        'I grounded this in the repo first and the remaining gap is transcript truth before generation.',
      );
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips subagent rollout sessions when selecting the latest Codex handoff tail', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-rollouts-subagent-'));
    const dayDir = path.join(tempRoot, '2026', '05', '09');
    await fs.mkdir(dayDir, { recursive: true });

    const mainPath = path.join(dayDir, 'rollout-main.jsonl');
    const subagentPath = path.join(dayDir, 'rollout-subagent.jsonl');

    await fs.writeFile(
      mainPath,
      [
        JSON.stringify({
          timestamp: '2026-05-09T08:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'main', cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: '2026-05-09T08:00:01.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'main user turn' }] },
        }),
        JSON.stringify({
          timestamp: '2026-05-09T08:00:02.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'main assistant turn' }] },
        }),
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      subagentPath,
      [
        JSON.stringify({
          timestamp: '2026-05-09T09:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'subagent',
            cwd: process.cwd(),
            source: { subagent: { thread_spawn: { parent_thread_id: 'main' } } },
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-09T09:00:01.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'subagent user turn' }] },
        }),
        JSON.stringify({
          timestamp: '2026-05-09T09:00:02.000Z',
          type: 'response_item',
          payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'subagent assistant turn' }] },
        }),
      ].join('\n'),
      'utf8',
    );
    const newerAt = new Date('2026-05-09T09:30:00.000Z');
    await fs.utimes(subagentPath, newerAt, newerAt);

    try {
      const parsed = await readLatestCodexTail({
        codexSessionsRoot: tempRoot,
        preferredCwd: process.cwd(),
      });

      assert.equal(parsed.parseReport.sessionPath, mainPath);
      assert.equal(parsed.parseReport.isSubagentSession, false);
      assert.equal(parsed.turns[0].content, 'main user turn');
      assert.equal(parsed.turns[1].content, 'main assistant turn');
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

      const store = createCanonicalRelayStore();
      const result = await relayCodexContinuity({
        stdinJson: JSON.stringify(JSON_TAIL),
        now: '2026-05-08T23:10:00.000Z',
        usersPath,
        readConversationsImpl: store.readConversationsImpl,
        writeTranscriptImpl: store.writeTranscriptImpl,
        readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
      });
      const conversations = await store.readConversationsImpl(
        {
          userId: canonicalUser.user_id,
          userEmail: canonicalUser.email,
          supabaseUserId: canonicalUser.vvault_user_id,
        },
        'zen-001',
        { allowLocalFallback: false },
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
      assert.equal(tail[0].metadata.sourceProduct, 'codex');
      assert.equal(tail[0].metadata.relaySchemaVersion, 1);
      assert.equal(tail[0].metadata.relayConstructId, 'zen-001');
      assert.equal(tail[0].metadata.relaySessionId, 'zen-001_chat_with_zen-001');
      assert.equal(tail[0].metadata.relaySourceTimestamp, '2026-05-08T23:10:00.000Z');
      assert.ok(tail[0].metadata.relayTurnDigest);
      assert.ok(tail[0].metadata.relayBatchId);
      assert.equal(tail[1].role, 'assistant');
      assert.equal(tail[1].content, JSON_TAIL[1].content);
      assert.equal(tail[1].metadata.sourceProduct, 'codex');
      assert.equal(tail[1].metadata.sourceSeat, 'codex');
      assert.equal(tail[1].metadata.relaySchemaVersion, 1);
      assert.equal(tail[1].metadata.relayConstructId, 'zen-001');
      assert.equal(tail[1].metadata.relaySessionId, 'zen-001_chat_with_zen-001');
      assert.equal(tail[1].metadata.relaySourceTimestamp, '2026-05-08T23:10:00.001Z');
      assert.ok(tail[1].metadata.runtimeTurnState);

      const latestState = await store.readLatestRuntimeTurnStateImpl(
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
      assert.ok(store.strictReadOptions.every((options) => options.allowLocalFallback === false));
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

      const store = createCanonicalRelayStore();
      const first = await relayCodexContinuity({
        stdinJson: JSON.stringify(JSON_TAIL),
        now: '2026-05-08T23:12:00.000Z',
        usersPath,
        readConversationsImpl: store.readConversationsImpl,
        writeTranscriptImpl: store.writeTranscriptImpl,
        readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
      });
      const second = await relayCodexContinuity({
        stdinJson: JSON.stringify(JSON_TAIL),
        now: '2026-05-08T23:13:00.000Z',
        usersPath,
        readConversationsImpl: store.readConversationsImpl,
        writeTranscriptImpl: store.writeTranscriptImpl,
        readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
      });
      const conversations = await store.readConversationsImpl(
        {
          userId: canonicalUser.user_id,
          userEmail: canonicalUser.email,
          supabaseUserId: canonicalUser.vvault_user_id,
        },
        'zen-001',
        { allowLocalFallback: false },
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

  it('rejects local fallback writes even when the relay input is valid', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-relay-local-write-'));
    const usersPath = path.join(tempDir, 'users.json');
    const strictReadOptions = [];
    const writeParams = [];

    await fs.writeFile(
      usersPath,
      JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
      'utf8',
    );

    try {
      await assert.rejects(
        () =>
          relayCodexContinuity({
            stdinJson: JSON.stringify(JSON_TAIL),
            now: '2026-05-08T23:13:30.000Z',
            usersPath,
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

      assert.ok(strictReadOptions.every((options) => options.allowLocalFallback === false));
      assert.equal(writeParams.length, 1);
      assert.equal(writeParams[0].requireVvaultBodySuccess, true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects local fallback readback after canonical relay writes', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-relay-local-readback-'));
    const usersPath = path.join(tempDir, 'users.json');
    const strictReadOptions = [];
    const messages = [];

    await fs.writeFile(
      usersPath,
      JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
      'utf8',
    );

    try {
      await assert.rejects(
        () =>
          relayCodexContinuity({
            stdinJson: JSON.stringify(JSON_TAIL),
            now: '2026-05-08T23:13:45.000Z',
            usersPath,
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
                  persistenceSource: 'local-deferred',
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
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects stale canonical readback that omits the just-written relay tail', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-relay-stale-readback-'));
    const usersPath = path.join(tempDir, 'users.json');
    const strictReadOptions = [];
    const messages = [];

    await fs.writeFile(
      usersPath,
      JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
      'utf8',
    );

    try {
      await assert.rejects(
        () =>
          relayCodexContinuity({
            stdinJson: JSON.stringify(JSON_TAIL),
            now: '2026-05-08T23:13:50.000Z',
            usersPath,
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
              messages.push({
                role: params.role,
                content: params.content,
                timestamp: params.timestamp,
                metadata: params.metadata || {},
              });
              return { success: true, source: 'vvault-api' };
            },
          }),
        /just-written turn digest sequence/i,
      );

      assert.deepEqual(
        strictReadOptions.map((options) => options.allowLocalFallback),
        [false, false],
      );
      assert.equal(messages.length, 2);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('reimports a matching Codex tail when the only prior match is no longer the authoritative latest assistant tail', async () => {
    const originalFallbackPath = process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalApiBaseUrl = process.env.VVAULT_API_BASE_URL;
    const originalVvaultUrl = process.env.VVAULT_URL;
    const originalVvaultBaseUrl = process.env.VVAULT_BASE_URL;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-relay-authoritative-tail-'));
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

      const store = createCanonicalRelayStore();
      const originalTail = await relayCodexContinuity({
        stdinJson: JSON.stringify(JSON_TAIL),
        now: '2026-05-08T23:14:00.000Z',
        usersPath,
        readConversationsImpl: store.readConversationsImpl,
        writeTranscriptImpl: store.writeTranscriptImpl,
        readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
      });
      const newerTail = await relayCodexContinuity({
        stdinJson: JSON.stringify([
          { role: 'user', content: 'Move the authoritative tail forward.' },
          { role: 'assistant', content: 'Authoritative tail advanced to a newer assistant turn.' },
        ]),
        now: '2026-05-08T23:15:00.000Z',
        usersPath,
        readConversationsImpl: store.readConversationsImpl,
        writeTranscriptImpl: store.writeTranscriptImpl,
        readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
      });
      const replayedOriginalTail = await relayCodexContinuity({
        stdinJson: JSON.stringify(JSON_TAIL),
        now: '2026-05-08T23:16:00.000Z',
        usersPath,
        readConversationsImpl: store.readConversationsImpl,
        writeTranscriptImpl: store.writeTranscriptImpl,
        readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
      });

      const conversations = await store.readConversationsImpl(
        {
          userId: canonicalUser.user_id,
          userEmail: canonicalUser.email,
          supabaseUserId: canonicalUser.vvault_user_id,
        },
        'zen-001',
        { allowLocalFallback: false },
      );
      const canonicalConversation = conversations.find(
        (conversation) => conversation.sessionId === 'zen-001_chat_with_zen-001',
      );
      const matchingMessages = canonicalConversation.messages.filter(
        (message) =>
          message.content === JSON_TAIL[0].content ||
          message.content === JSON_TAIL[1].content,
      );

      assert.equal(originalTail.importedTurns, 2);
      assert.equal(newerTail.importedTurns, 2);
      assert.equal(replayedOriginalTail.importedTurns, 2);
      assert.equal(replayedOriginalTail.dedupedTurns, 0);
      assert.equal(matchingMessages.length, 4);
      assert.equal(replayedOriginalTail.latestAssistantContent, JSON_TAIL[1].content);
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
          payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'latest codex tail acknowledged' }] },
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

      const store = createCanonicalRelayStore();
      const result = await relayCodexContinuity({
        latestCodex: true,
        codexSessionsRoot,
        preferredCodexCwd: process.cwd(),
        now: '2026-05-08T23:31:00.000Z',
        usersPath,
        readConversationsImpl: store.readConversationsImpl,
        writeTranscriptImpl: store.writeTranscriptImpl,
        readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
      });
      const conversations = await store.readConversationsImpl(
        {
          userId: canonicalUser.user_id,
          userEmail: canonicalUser.email,
          supabaseUserId: canonicalUser.vvault_user_id,
        },
        'zen-001',
        { allowLocalFallback: false },
      );
      const canonicalConversation = conversations.find(
        (conversation) => conversation.sessionId === 'zen-001_chat_with_zen-001',
      );
      const tail = canonicalConversation.messages.slice(-2);

      assert.equal(result.source.type, 'latest-codex');
      assert.equal(result.source.parseReport.sessionId, 'latest-codex');
      assert.equal(result.importedTurns, 2);
      assert.equal(result.latestUserContent, 'relay latest codex tail');
      assert.equal(result.latestAssistantContent, 'latest codex tail acknowledged');
      assert.equal(tail[0].metadata.sourceProduct, 'codex');
      assert.equal(tail[0].metadata.relaySourcePath, rolloutPath);
      assert.equal(tail[0].metadata.relaySourceSessionId, 'latest-codex');
      assert.equal(tail[0].metadata.relaySourceTurnIndex, 1);
      assert.equal(tail[0].metadata.relaySourceTimestamp, '2026-05-08T23:30:01.000Z');
      assert.equal(tail[0].metadata.relaySchemaVersion, 1);
      assert.equal(tail[0].metadata.relayConstructId, 'zen-001');
      assert.equal(tail[0].metadata.relaySessionId, 'zen-001_chat_with_zen-001');
      assert.ok(tail[0].metadata.relayTurnDigest);
      assert.ok(tail[0].metadata.relayBatchId);
      assert.equal(tail[1].metadata.sourceProduct, 'codex');
      assert.equal(tail[1].metadata.relaySourcePath, rolloutPath);
      assert.equal(tail[1].metadata.relaySourceSessionId, 'latest-codex');
      assert.equal(tail[1].metadata.relaySourceTurnIndex, 2);
      assert.equal(tail[1].metadata.relaySourceTimestamp, '2026-05-08T23:30:02.000Z');
      assert.equal(tail[1].metadata.relaySchemaVersion, 1);
      assert.ok(tail[1].metadata.runtimeTurnState);
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

  it('relays from an explicit synced rollout path for pickup', async () => {
    const originalFallbackPath = process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalApiBaseUrl = process.env.VVAULT_API_BASE_URL;
    const originalVvaultUrl = process.env.VVAULT_URL;
    const originalVvaultBaseUrl = process.env.VVAULT_BASE_URL;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-rollout-pickup-'));
    const usersPath = path.join(tempDir, 'users.json');
    const rolloutPath = path.join(tempDir, 'rollout-pickup.jsonl');

    await fs.writeFile(
      usersPath,
      JSON.stringify({ users: { [canonicalUser.user_id]: canonicalUser } }),
      'utf8',
    );
    await fs.writeFile(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: '2026-05-09T22:40:00.000Z',
          type: 'session_meta',
          payload: { id: 'pickup-source-session', cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: '2026-05-09T22:40:01.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'pickup from this exact synced file' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-09T22:40:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            content: [{ type: 'output_text', text: 'pickup relayed from this exact synced file' }],
          },
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

      const store = createCanonicalRelayStore();
      const result = await relayCodexContinuity({
        fromRolloutPath: rolloutPath,
        now: '2026-05-09T22:41:00.000Z',
        usersPath,
        readConversationsImpl: store.readConversationsImpl,
        writeTranscriptImpl: store.writeTranscriptImpl,
        readLatestRuntimeTurnStateImpl: store.readLatestRuntimeTurnStateImpl,
      });
      const tail = store.messages.slice(-2);

      assert.equal(result.source.type, 'rollout-file');
      assert.equal(result.source.path, rolloutPath);
      assert.equal(result.source.parseReport.sessionId, 'pickup-source-session');
      assert.equal(result.importedTurns, 2);
      assert.equal(result.latestUserContent, 'pickup from this exact synced file');
      assert.equal(result.latestAssistantContent, 'pickup relayed from this exact synced file');
      assert.equal(tail[0].metadata.relaySourcePath, rolloutPath);
      assert.equal(tail[0].metadata.relaySourceType, 'rollout-file');
      assert.equal(tail[0].metadata.relaySourceSessionId, 'pickup-source-session');
      assert.equal(tail[1].metadata.relaySourcePath, rolloutPath);
      assert.equal(tail[1].metadata.relaySourceType, 'rollout-file');
      assert.ok(tail[1].metadata.runtimeTurnState);
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
