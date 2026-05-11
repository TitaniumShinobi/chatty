import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { syncCodexThreadsArchive } from '../lib/codexThreadArchive.js';

function codexMessage({ timestamp, role, text, phase }) {
  return JSON.stringify({
    timestamp,
    type: 'response_item',
    payload: {
      type: 'message',
      role,
      ...(phase ? { phase } : {}),
      content: [
        {
          type: role === 'assistant' ? 'output_text' : 'input_text',
          text,
        },
      ],
    },
  });
}

test('syncCodexThreadsArchive writes normalized Codex source-evidence files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-archive-'));
  const sessionsRoot = path.join(tempRoot, 'sessions');
  const sessionIndexPath = path.join(tempRoot, 'session_index.jsonl');
  const archiveRoot = path.join(tempRoot, 'instances', 'zen-001', 'codex');
  const rolloutDir = path.join(sessionsRoot, '2026', '05', '09');
  await fs.mkdir(rolloutDir, { recursive: true });
  await fs.writeFile(
    sessionIndexPath,
    `${JSON.stringify({
      id: '019e-test-session',
      thread_name: 'Build transcript syncing system',
      updated_at: '2026-05-09T02:00:00.000Z',
    })}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rolloutDir, 'rollout-2026-05-09T01-02-03-019e-test.jsonl'),
    [
      JSON.stringify({
        timestamp: '2026-05-09T01:02:03.000Z',
        type: 'session_meta',
        payload: {
          id: '019e-test-session',
          cwd: '/Users/devonwoodson/Documents/GitHub/chatty',
        },
      }),
      codexMessage({
        timestamp: '2026-05-09T01:02:04.000Z',
        role: 'user',
        text: '<environment_context>\n<cwd>/tmp</cwd>',
      }),
      codexMessage({
        timestamp: '2026-05-09T01:02:05.000Z',
        role: 'user',
        text: 'Scrape the active Codex thread.',
      }),
      codexMessage({
        timestamp: '2026-05-09T01:02:06.000Z',
        role: 'assistant',
        phase: 'commentary',
        text: 'I am checking the local rollout files.',
      }),
      codexMessage({
        timestamp: '2026-05-09T01:02:07.000Z',
        role: 'assistant',
        phase: 'final_answer',
        text: 'The active Codex thread is archived. The literal `<heartbeat>` tag can be mentioned in prose.\n\n<heartbeat>\n  <automation_id>codex-vvault-sync-watch</automation_id>\n</heartbeat>',
      }),
      codexMessage({
        timestamp: '2026-05-09T01:02:08.000Z',
        role: 'user',
        text: '<heartbeat>\n  <automation_id>codex-vvault-sync-watch</automation_id>\n</heartbeat>',
      }),
    ].join('\n'),
    'utf8',
  );

  const result = await syncCodexThreadsArchive({
    codexSessionsRoot: sessionsRoot,
    sessionIndexPath,
    targetRoot: archiveRoot,
    lifeUserId: 'devon_woodson_1774390416168',
    now: '2026-05-09T02:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.scannedFiles, 1);
  assert.equal(result.archivedThreads, 1);
  assert.equal(result.skippedThreads, 0);
  assert.equal(result.archiveRoot, archiveRoot);

  const index = JSON.parse(await fs.readFile(result.indexPath, 'utf8'));
  assert.equal(index.lifeUserId, 'devon_woodson_1774390416168');
  assert.equal(index.constructId, 'zen-001');
  assert.equal(index.canonicalThreadId, 'zen-001_chat_with_zen-001');
  assert.equal(index.threadNamesResolved, 1);
  assert.equal(index.threads[0].sourceSessionId, '019e-test-session');
  assert.equal(index.threads[0].sourceThreadName, 'Build transcript syncing system');
  assert.equal(index.threads[0].sourceSessionPath.endsWith('rollout-2026-05-09T01-02-03-019e-test.jsonl'), true);
  assert.equal(index.threads[0].latestMessageRole, 'assistant');
  assert.equal(index.threads[0].latestMessageTimestamp, '2026-05-09T01:02:07.000Z');
  assert.equal(path.basename(index.threads[0].jsonPath), 'Build transcript syncing system.json');
  assert.equal(path.basename(index.threads[0].markdownPath), 'Build transcript syncing system.md');
  assert.equal(index.latest.sourceSessionPath, index.threads[0].sourceSessionPath);
  assert.equal(index.latest.latestMessageRole, 'assistant');
  assert.equal(index.latest.latestMessageTimestamp, '2026-05-09T01:02:07.000Z');

  const threadJson = JSON.parse(await fs.readFile(index.threads[0].jsonPath, 'utf8'));
  assert.equal(threadJson.sourceThreadName, 'Build transcript syncing system');
  assert.deepEqual(
    threadJson.turns.map((turn) => turn.role),
    ['user', 'assistant'],
  );
  assert.equal(threadJson.turns[0].content, 'Scrape the active Codex thread.');
  assert.equal(
    threadJson.turns[1].content,
    'The active Codex thread is archived. The literal `<heartbeat>` tag can be mentioned in prose.',
  );

  const threadMarkdown = await fs.readFile(index.threads[0].markdownPath, 'utf8');
  assert.match(threadMarkdown, /^# Build transcript syncing system/m);
  assert.match(threadMarkdown, /sourceThreadName: Build transcript syncing system/);
  assert.match(threadMarkdown, /## User/);
  assert.match(threadMarkdown, /Scrape the active Codex thread\./);
  assert.doesNotMatch(threadMarkdown, /environment_context/);
  assert.doesNotMatch(threadMarkdown, /codex-vvault-sync-watch/);
  assert.doesNotMatch(threadMarkdown, /^<heartbeat>/m);
  assert.match(threadMarkdown, /literal `<heartbeat>` tag can be mentioned in prose/);
  assert.doesNotMatch(threadMarkdown, /checking the local rollout files/);
});

test('syncCodexThreadsArchive can publish title-named transcript files into VVAULT file records', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-vvault-publish-'));
  const sessionsRoot = path.join(tempRoot, 'sessions');
  const sessionIndexPath = path.join(tempRoot, 'session_index.jsonl');
  const archiveRoot = path.join(tempRoot, 'instances', 'zen-001', 'codex');
  const rolloutDir = path.join(sessionsRoot, '2026', '05', '09');
  const posted = [];
  await fs.mkdir(rolloutDir, { recursive: true });
  await fs.writeFile(
    sessionIndexPath,
    `${JSON.stringify({
      id: '019e-visible-session',
      thread_name: 'Build transcript syncing system',
      updated_at: '2026-05-09T02:00:00.000Z',
    })}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rolloutDir, 'rollout-2026-05-09T01-02-03-019e-visible.jsonl'),
    [
      JSON.stringify({
        timestamp: '2026-05-09T01:02:03.000Z',
        type: 'session_meta',
        payload: {
          id: '019e-visible-session',
          cwd: '/Users/devonwoodson/Documents/GitHub/chatty',
        },
      }),
      codexMessage({
        timestamp: '2026-05-09T01:02:04.000Z',
        role: 'user',
        text: 'Put the transcript in the VVAULT folder.',
      }),
      codexMessage({
        timestamp: '2026-05-09T01:02:05.000Z',
        role: 'assistant',
        phase: 'final_answer',
        text: 'The transcript is visible in VVAULT.',
      }),
    ].join('\n'),
    'utf8',
  );

  const result = await syncCodexThreadsArchive({
    codexSessionsRoot: sessionsRoot,
    sessionIndexPath,
    targetRoot: archiveRoot,
    publishToVvault: true,
    requireVvaultReadback: true,
    writeLocalArchive: false,
    vvaultApiBaseUrl: 'http://127.0.0.1:8000',
    vvaultServiceToken: 'test-service-token',
    fetchImpl: async (url, options) => {
      const body = options?.body ? JSON.parse(options.body) : null;
      posted.push({ url: String(url), options, body });
      if (options?.method === 'GET') {
        const publish = posted.find((item) => item.options?.method === 'POST');
        return Response.json({
          success: true,
          file: {
            storage_path: publish.body.storage_path,
            filename: publish.body.filename,
            content: publish.body.content,
            sha256: crypto.createHash('sha256').update(publish.body.content, 'utf8').digest('hex'),
            metadata: JSON.stringify(publish.body.metadata),
          },
          storage_mode: 'vvault_body',
        });
      }
      return Response.json({
        success: true,
        action: 'created',
        sha256: 'abc123',
        storage_path: posted.at(-1).body.storage_path,
      });
    },
    now: '2026-05-09T02:00:00.000Z',
  });

  assert.equal(result.vvaultPublishedThreads, 1);
  assert.equal(result.vvaultReadbackVerifiedThreads, 1);
  assert.equal(result.vvaultPublishFailedThreads, 0);
  assert.equal(result.archiveRoot, null);
  assert.equal(result.indexPath, null);
  assert.equal(result.latestPath, null);
  assert.equal(result.latest.sourceSessionId, '019e-visible-session');
  assert.equal(
    result.latest.vvaultReadback.storagePath,
    'instances/zen-001/codex/Build transcript syncing system.md',
  );
  assert.equal(result.latest.vvaultReadback.storageMode, 'vvault_body');
  assert.match(result.latest.vvaultReadback.content, /^# Build transcript syncing system/m);
  assert.match(result.latest.vvaultReadback.content, /## Assistant \(2026-05-09T01:02:05.000Z\)/);
  assert.equal(result.latest.vvaultReadback.metadata.sourceSessionId, '019e-visible-session');
  assert.equal(result.latest.vvaultReadback.metadata.digest, result.latest.digest);
  assert.equal(result.latest.vvaultReadback.contentLength, result.latest.vvaultReadback.content.length);
  assert.equal(posted.length, 2);
  assert.equal(posted[0].url, 'http://127.0.0.1:8000/api/vault/system-files');
  assert.match(posted[1].url, /^http:\/\/127\.0\.0\.1:8000\/api\/vault\/system-files\?storage_path=/);
  assert.equal(posted[1].options.method, 'GET');
  assert.equal(posted[0].options.headers.Authorization, 'Bearer test-service-token');
  assert.equal(
    posted[0].body.storage_path,
    'instances/zen-001/codex/Build transcript syncing system.md',
  );
  assert.equal(posted[0].body.file_type, 'transcript');
  assert.equal(posted[0].body.metadata.folder, 'codex');
  assert.equal(posted[0].body.metadata.sourceSessionId, '019e-visible-session');
  assert.equal(posted[0].body.metadata.latestMessageRole, 'assistant');
  assert.equal(posted[0].body.metadata.latestMessageTimestamp, '2026-05-09T01:02:05.000Z');
  assert.ok(posted[0].body.metadata.latestMessageDigest);
  assert.match(posted[0].body.content, /^# Build transcript syncing system/m);
});

test('syncCodexThreadsArchive chooses latest by newest normalized message, not only assistant tail', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-latest-message-'));
  const sessionsRoot = path.join(tempRoot, 'sessions');
  const sessionIndexPath = path.join(tempRoot, 'session_index.jsonl');
  const archiveRoot = path.join(tempRoot, 'instances', 'zen-001', 'codex');
  const rolloutDir = path.join(sessionsRoot, '2026', '05', '09');
  await fs.mkdir(rolloutDir, { recursive: true });
  await fs.writeFile(
    sessionIndexPath,
    [
      JSON.stringify({ id: '019e-complete-session', thread_name: 'Complete Thread', updated_at: '2026-05-09T02:00:00.000Z' }),
      JSON.stringify({ id: '019e-pending-session', thread_name: 'Pending Thread', updated_at: '2026-05-09T02:05:00.000Z' }),
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(rolloutDir, 'rollout-complete.jsonl'),
    [
      JSON.stringify({ timestamp: '2026-05-09T01:00:00.000Z', type: 'session_meta', payload: { id: '019e-complete-session' } }),
      codexMessage({ timestamp: '2026-05-09T01:00:01.000Z', role: 'user', text: 'Complete user.' }),
      codexMessage({ timestamp: '2026-05-09T01:00:02.000Z', role: 'assistant', phase: 'final_answer', text: 'Complete assistant.' }),
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(rolloutDir, 'rollout-pending.jsonl'),
    [
      JSON.stringify({ timestamp: '2026-05-09T01:00:00.000Z', type: 'session_meta', payload: { id: '019e-pending-session' } }),
      codexMessage({ timestamp: '2026-05-09T01:00:01.000Z', role: 'user', text: 'Older user.' }),
      codexMessage({ timestamp: '2026-05-09T01:00:02.000Z', role: 'assistant', phase: 'final_answer', text: 'Older assistant.' }),
      codexMessage({ timestamp: '2026-05-09T01:05:00.000Z', role: 'user', text: 'Newest prompt still awaiting final assistant.' }),
    ].join('\n'),
    'utf8',
  );

  const result = await syncCodexThreadsArchive({
    codexSessionsRoot: sessionsRoot,
    sessionIndexPath,
    targetRoot: archiveRoot,
    now: '2026-05-09T02:10:00.000Z',
  });

  assert.equal(result.latest.sourceSessionId, '019e-pending-session');
  assert.equal(result.latest.sourceThreadName, 'Pending Thread');
  assert.equal(result.latest.latestMessageRole, 'user');
  assert.equal(result.latest.latestMessageTimestamp, '2026-05-09T01:05:00.000Z');
  assert.ok(result.latest.latestMessageDigest);
});

test('syncCodexThreadsArchive publishes pending user prompts as VVAULT source evidence', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-pending-source-'));
  const sessionsRoot = path.join(tempRoot, 'sessions');
  const sessionIndexPath = path.join(tempRoot, 'session_index.jsonl');
  const rolloutDir = path.join(sessionsRoot, '2026', '05', '10');
  const posted = [];
  await fs.mkdir(rolloutDir, { recursive: true });
  await fs.writeFile(
    sessionIndexPath,
    `${JSON.stringify({
      id: '019e-pending-only',
      thread_name: 'Pending Prompt Thread',
      updated_at: '2026-05-10T01:00:00.000Z',
    })}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rolloutDir, 'rollout-pending-only.jsonl'),
    [
      JSON.stringify({
        timestamp: '2026-05-10T01:00:00.000Z',
        type: 'session_meta',
        payload: { id: '019e-pending-only' },
      }),
      codexMessage({
        timestamp: '2026-05-10T01:00:01.000Z',
        role: 'user',
        text: 'This prompt should appear in VVAULT before the assistant finishes.',
      }),
    ].join('\n'),
    'utf8',
  );

  const result = await syncCodexThreadsArchive({
    codexSessionsRoot: sessionsRoot,
    sessionIndexPath,
    publishToVvault: true,
    requireVvaultReadback: true,
    failOnVvaultPublishFailure: true,
    writeLocalArchive: false,
    vvaultApiBaseUrl: 'http://127.0.0.1:8000',
    vvaultServiceToken: 'test-service-token',
    fetchImpl: async (_url, options) => {
      const body = options?.body ? JSON.parse(options.body) : null;
      posted.push({ method: options?.method || 'GET', body });
      if (options?.method === 'GET') {
        const publish = posted.find((item) => item.method === 'POST');
        return Response.json({
          success: true,
          storage_mode: 'vvault_body',
          file: {
            storage_path: publish.body.storage_path,
            filename: publish.body.filename,
            content: publish.body.content,
            sha256: crypto.createHash('sha256').update(publish.body.content, 'utf8').digest('hex'),
            metadata: JSON.stringify(publish.body.metadata),
          },
        });
      }
      return Response.json({ success: true, action: 'updated', sha256: 'new' });
    },
    now: '2026-05-10T01:00:02.000Z',
  });

  assert.equal(result.vvaultPublishedThreads, 1);
  assert.equal(result.vvaultReadbackVerifiedThreads, 1);
  assert.equal(result.latest.sourceSessionId, '019e-pending-only');
  assert.equal(result.latest.latestMessageRole, 'user');
  assert.equal(result.latest.latestAssistantTimestamp, null);
  assert.equal(result.latest.vvaultReadback.storageMode, 'vvault_body');
  assert.match(result.latest.vvaultReadback.content, /This prompt should appear in VVAULT before the assistant finishes\./);
  assert.match(posted[0].body.content, /This prompt should appear in VVAULT before the assistant finishes\./);
  assert.equal(posted[0].body.metadata.latestMessageRole, 'user');
});

test('syncCodexThreadsArchive rejects readback without VVAULT-body proof', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-storage-mode-'));
  const sessionsRoot = path.join(tempRoot, 'sessions');
  const sessionIndexPath = path.join(tempRoot, 'session_index.jsonl');
  const rolloutDir = path.join(sessionsRoot, '2026', '05', '09');
  let postedBody = null;
  await fs.mkdir(rolloutDir, { recursive: true });
  await fs.writeFile(
    sessionIndexPath,
    `${JSON.stringify({
      id: '019e-local-mode-session',
      thread_name: 'Storage Mode Proof',
      updated_at: '2026-05-09T02:00:00.000Z',
    })}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rolloutDir, 'rollout-2026-05-09T01-02-03-019e-local-mode.jsonl'),
    [
      JSON.stringify({ timestamp: '2026-05-09T01:02:03.000Z', type: 'session_meta', payload: { id: '019e-local-mode-session' } }),
      codexMessage({ timestamp: '2026-05-09T01:02:04.000Z', role: 'user', text: 'Prove storage mode.' }),
      codexMessage({ timestamp: '2026-05-09T01:02:05.000Z', role: 'assistant', phase: 'final_answer', text: 'Storage mode proven.' }),
    ].join('\n'),
    'utf8',
  );

  await assert.rejects(
    () => syncCodexThreadsArchive({
      codexSessionsRoot: sessionsRoot,
      sessionIndexPath,
      publishToVvault: true,
      requireVvaultReadback: true,
      failOnVvaultPublishFailure: true,
      writeLocalArchive: false,
      vvaultApiBaseUrl: 'http://127.0.0.1:8000',
      vvaultServiceToken: 'test-service-token',
      fetchImpl: async (_url, options) => {
        if (options?.method === 'GET') {
          return Response.json({
            success: true,
            storage_mode: 'local_archive',
            file: {
              storage_path: postedBody.storage_path,
              content: postedBody.content,
              sha256: crypto.createHash('sha256').update(postedBody.content, 'utf8').digest('hex'),
              metadata: JSON.stringify(postedBody.metadata),
            },
          });
        }
        postedBody = JSON.parse(options.body);
        return Response.json({ success: true, action: 'updated', sha256: 'new' });
      },
      now: '2026-05-09T02:00:00.000Z',
    }),
    /vvault_readback_storage_mode_unproven/,
  );
});

test('syncCodexThreadsArchive strict VVAULT mode fails when authority is unavailable', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-no-vvault-'));
  const sessionsRoot = path.join(tempRoot, 'sessions');
  const sessionIndexPath = path.join(tempRoot, 'session_index.jsonl');
  await fs.mkdir(sessionsRoot, { recursive: true });
  await fs.writeFile(sessionIndexPath, '', 'utf8');

  await assert.rejects(
    () => syncCodexThreadsArchive({
      codexSessionsRoot: sessionsRoot,
      sessionIndexPath,
      publishToVvault: true,
      requireVvaultReadback: true,
      failOnVvaultPublishFailure: true,
      writeLocalArchive: false,
      vvaultApiBaseUrl: '',
      vvaultServiceToken: '',
      fetchImpl: async () => Response.json({ success: true }),
      now: '2026-05-09T02:00:00.000Z',
    }),
    /missing_vvault_api_base_url/,
  );
});

test('syncCodexThreadsArchive strict VVAULT mode fails when no Codex threads publish', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-empty-strict-'));
  const sessionsRoot = path.join(tempRoot, 'sessions');
  const sessionIndexPath = path.join(tempRoot, 'session_index.jsonl');
  await fs.mkdir(sessionsRoot, { recursive: true });
  await fs.writeFile(sessionIndexPath, '', 'utf8');

  await assert.rejects(
    () => syncCodexThreadsArchive({
      codexSessionsRoot: sessionsRoot,
      sessionIndexPath,
      publishToVvault: true,
      requireVvaultReadback: true,
      failOnVvaultPublishFailure: true,
      writeLocalArchive: false,
      vvaultApiBaseUrl: 'http://127.0.0.1:8000',
      vvaultServiceToken: 'test-service-token',
      fetchImpl: async () => Response.json({ success: true }),
      now: '2026-05-09T02:00:00.000Z',
    }),
    /no_codex_threads_published/,
  );
});

test('syncCodexThreadsArchive keeps duplicate Codex titles unique and deterministic', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-duplicates-'));
  const sessionsRoot = path.join(tempRoot, 'sessions');
  const sessionIndexPath = path.join(tempRoot, 'session_index.jsonl');
  const archiveRoot = path.join(tempRoot, 'instances', 'zen-001', 'codex');
  const rolloutDir = path.join(sessionsRoot, '2026', '05', '09');
  await fs.mkdir(rolloutDir, { recursive: true });
  await fs.writeFile(
    sessionIndexPath,
    [
      JSON.stringify({ id: '019e-dupe-a', thread_name: 'Same Codex Name', updated_at: '2026-05-09T02:00:00.000Z' }),
      JSON.stringify({ id: '019e-dupe-b', thread_name: 'Same Codex Name', updated_at: '2026-05-09T02:01:00.000Z' }),
    ].join('\n'),
    'utf8',
  );

  for (const id of ['019e-dupe-a', '019e-dupe-b']) {
    await fs.writeFile(
      path.join(rolloutDir, `rollout-2026-05-09T01-02-03-${id}.jsonl`),
      [
        JSON.stringify({ timestamp: '2026-05-09T01:02:03.000Z', type: 'session_meta', payload: { id } }),
        codexMessage({ timestamp: '2026-05-09T01:02:04.000Z', role: 'user', text: `User ${id}` }),
        codexMessage({ timestamp: '2026-05-09T01:02:05.000Z', role: 'assistant', phase: 'final_answer', text: `Assistant ${id}` }),
      ].join('\n'),
      'utf8',
    );
  }

  const result = await syncCodexThreadsArchive({
    codexSessionsRoot: sessionsRoot,
    sessionIndexPath,
    targetRoot: archiveRoot,
    now: '2026-05-09T02:00:00.000Z',
  });
  const index = JSON.parse(await fs.readFile(result.indexPath, 'utf8'));
  const filenames = index.threads.map((thread) => path.basename(thread.markdownPath)).sort();
  assert.deepEqual(filenames, [
    'Same Codex Name - 019e-dup.md',
    'Same Codex Name.md',
  ]);
});

test('syncCodexThreadsArchive fails closed when strict VVAULT readback is stale', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-codex-stale-readback-'));
  const sessionsRoot = path.join(tempRoot, 'sessions');
  const sessionIndexPath = path.join(tempRoot, 'session_index.jsonl');
  const rolloutDir = path.join(sessionsRoot, '2026', '05', '09');
  await fs.mkdir(rolloutDir, { recursive: true });
  await fs.writeFile(
    sessionIndexPath,
    `${JSON.stringify({
      id: '019e-stale-session',
      thread_name: 'Stale Readback Thread',
      updated_at: '2026-05-09T02:00:00.000Z',
    })}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(rolloutDir, 'rollout-2026-05-09T01-02-03-019e-stale.jsonl'),
    [
      JSON.stringify({ timestamp: '2026-05-09T01:02:03.000Z', type: 'session_meta', payload: { id: '019e-stale-session' } }),
      codexMessage({ timestamp: '2026-05-09T01:02:04.000Z', role: 'user', text: 'Publish me.' }),
      codexMessage({ timestamp: '2026-05-09T01:02:05.000Z', role: 'assistant', phase: 'final_answer', text: 'Published.' }),
    ].join('\n'),
    'utf8',
  );

  await assert.rejects(
    () => syncCodexThreadsArchive({
      codexSessionsRoot: sessionsRoot,
      sessionIndexPath,
      publishToVvault: true,
      requireVvaultReadback: true,
      failOnVvaultPublishFailure: true,
      writeLocalArchive: false,
      vvaultApiBaseUrl: 'http://127.0.0.1:8000',
      vvaultServiceToken: 'test-service-token',
      fetchImpl: async (_url, options) => {
        if (options?.method === 'GET') {
          return Response.json({
            success: true,
            storage_mode: 'vvault_body',
            file: {
              storage_path: 'instances/zen-001/codex/Stale Readback Thread.md',
              content: 'old content',
              sha256: 'stale',
              metadata: JSON.stringify({ digest: 'old', sourceSessionId: '019e-stale-session' }),
            },
          });
        }
        return Response.json({ success: true, action: 'updated', sha256: 'new' });
      },
      now: '2026-05-09T02:00:00.000Z',
    }),
    /vvault_readback_content_mismatch/,
  );
});
