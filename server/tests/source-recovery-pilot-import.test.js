import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  APPROVED_NOVA_PILOT_SOURCE_SHA256,
  DEFAULT_PILOT_BATCH_ID,
  buildPilotImportReceipt,
  fetchDuplicateRowsRest,
  findDuplicateMatches,
  insertVaultFilesRest,
  makeBoundedContent,
  parsePilotArgs,
  resolveSupabaseUserIdRest,
} from '../scripts/sourceRecoveryPilotImport.js';

function hash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function writeTempTranscript(content) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-pilot-import-'));
  const filePath = path.join(dir, 'Day After Christmas vibes.txt');
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

function fakeManifest({ sourcePath, sourceSha256 = APPROVED_NOVA_PILOT_SOURCE_SHA256[0] }) {
  return {
    generatedAt: '2026-04-16T00:00:00.000Z',
    recoveryRunId: 'source-recovery-nova-001-test',
    identity: {
      supabaseUserId: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
      supabaseAvailable: true,
      supabaseError: null,
    },
    plannedCanonicalRows: [{
      canonicalFilename: `instances/nova-001/chatgpt/history/2025/December/Day_After_Christmas_vibes_-5.2-_20260120153519-${sourceSha256.slice(0, 12)}.txt`,
      sourceSha256,
      contentLength: 100,
      duplicateStatus: 'none',
      plannedRow: {
        user_id: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
        construct_id: 'nova-001',
        filename: `instances/nova-001/chatgpt/history/2025/December/Day_After_Christmas_vibes_-5.2-_20260120153519-${sourceSha256.slice(0, 12)}.txt`,
        storage_path: null,
        file_type: 'transcript',
        metadata: {
          source: 'chatgpt',
          recoveryKind: 'supabase-first-source-recovery',
          recoveryRunId: 'source-recovery-nova-001-test',
          bridgeSource: 'icloud',
          originalPath: sourcePath,
          originalOwner: 'icloud:nova-001',
          originalRowId: null,
          sourceSha256,
          targetLifeId: 'devon_woodson_1774390416168',
          legacyLifeAliases: ['devon_woodson_1762969514958'],
          plannedAt: '2026-04-16T00:00:00.000Z',
        },
      },
      source: {
        surface: 'icloud',
        source: 'chatgpt',
        owner: 'icloud:nova-001',
        rowId: null,
        path: sourcePath,
      },
    }],
    rejected: [],
  };
}

function fakeCompleteManifest({ sourcePaths, supabaseUserId = null }) {
  return {
    generatedAt: '2026-04-16T00:00:00.000Z',
    recoveryRunId: 'source-recovery-nova-001-test',
    identity: {
      supabaseUserId,
      supabaseAvailable: Boolean(supabaseUserId),
      supabaseError: supabaseUserId ? null : 'SDK unavailable',
    },
    plannedCanonicalRows: APPROVED_NOVA_PILOT_SOURCE_SHA256.map((sourceSha256, index) => ({
      canonicalFilename: `instances/nova-001/chatgpt/pilot/source-${index + 1}-${sourceSha256.slice(0, 12)}.txt`,
      sourceSha256,
      contentLength: 100,
      duplicateStatus: 'none',
      plannedRow: {
        user_id: supabaseUserId,
        construct_id: 'nova-001',
        filename: `instances/nova-001/chatgpt/pilot/source-${index + 1}-${sourceSha256.slice(0, 12)}.txt`,
        storage_path: null,
        file_type: 'transcript',
        metadata: {
          source: 'chatgpt',
          recoveryKind: 'supabase-first-source-recovery',
          recoveryRunId: 'source-recovery-nova-001-test',
          bridgeSource: 'icloud',
          originalPath: sourcePaths[index],
          originalOwner: 'icloud:nova-001',
          originalRowId: null,
          sourceSha256,
          targetLifeId: 'devon_woodson_1774390416168',
          legacyLifeAliases: ['devon_woodson_1762969514958'],
          plannedAt: '2026-04-16T00:00:00.000Z',
        },
      },
      source: {
        surface: 'icloud',
        source: 'chatgpt',
        owner: 'icloud:nova-001',
        rowId: null,
        path: sourcePaths[index],
      },
    })),
    rejected: [],
  };
}

const baseArgs = [
  '--email', 'dwoodson92@gmail.com',
  '--target-life-id', 'devon_woodson_1774390416168',
  '--legacy-life-alias', 'devon_woodson_1762969514958',
  '--construct-id', 'nova-001',
  '--source', 'chatgpt',
  '--pilot-batch-id', DEFAULT_PILOT_BATCH_ID,
  '--include-sha', APPROVED_NOVA_PILOT_SOURCE_SHA256[0],
  '--include-sha', APPROVED_NOVA_PILOT_SOURCE_SHA256[1],
  '--include-sha', APPROVED_NOVA_PILOT_SOURCE_SHA256[2],
];

describe('sourceRecoveryPilotImport', () => {
  it('parses the approved Nova pilot scope and defaults safely to dry-run', () => {
    const parsed = parsePilotArgs(baseArgs);

    assert.equal(parsed.apply, false);
    assert.equal(parsed.constructId, 'nova-001');
    assert.equal(parsed.source, 'chatgpt');
    assert.equal(parsed.pilotBatchId, DEFAULT_PILOT_BATCH_ID);
    assert.deepEqual(parsed.includeShas, APPROVED_NOVA_PILOT_SOURCE_SHA256);
  });

  it('rejects unapproved source hashes', () => {
    assert.throws(() => parsePilotArgs([
      '--email', 'dwoodson92@gmail.com',
      '--target-life-id', 'devon_woodson_1774390416168',
      '--include-sha', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '--include-sha', APPROVED_NOVA_PILOT_SOURCE_SHA256[1],
      '--include-sha', APPROVED_NOVA_PILOT_SOURCE_SHA256[2],
    ]), /Unapproved Nova pilot source hash/);
  });

  it('rejects any non-pilot batch id', () => {
    assert.throws(() => parsePilotArgs([
      ...baseArgs,
      '--pilot-batch-id', 'nova-001-chatgpt-pilot-other',
    ]), /scoped to pilot batch/);
  });

  it('bounds pilot content on a newline when possible', () => {
    const content = `${'a'.repeat(20)}\n${'b'.repeat(20)}\n${'c'.repeat(20)}`;
    const bounded = makeBoundedContent(content, 45);

    assert.equal(bounded.truncated, true);
    assert.equal(bounded.content, `${'a'.repeat(20)}\n${'b'.repeat(20)}`);
    assert.ok(bounded.content.length <= 45);
  });

  it('detects duplicate rows by canonical filename or metadata source hash', () => {
    const payload = {
      construct_id: 'nova-001',
      filename: 'instances/nova-001/chatgpt/history/2025/December/test.txt',
      sha256: 'imported-content-hash',
      metadata: {
        sourceSha256: APPROVED_NOVA_PILOT_SOURCE_SHA256[0],
        importedContentSha256: 'imported-content-hash',
      },
    };

    const matches = findDuplicateMatches(payload, [
      {
        id: 'row-1',
        construct_id: 'nova-001',
        filename: 'instances/nova-001/chatgpt/history/2025/December/other.txt',
        metadata: { sourceSha256: APPROVED_NOVA_PILOT_SOURCE_SHA256[0] },
      },
      {
        id: 'row-2',
        construct_id: 'nova-001',
        filename: payload.filename,
        metadata: {},
      },
      {
        id: 'row-3',
        construct_id: 'katana-001',
        filename: payload.filename,
        metadata: { sourceSha256: APPROVED_NOVA_PILOT_SOURCE_SHA256[0] },
      },
    ]);

    assert.deepEqual(matches.map((match) => match.id), ['row-1', 'row-2']);
  });

  it('builds a dry-run receipt with prompt-reachable canonical payload fields', async () => {
    const transcript = [
      'You said: Good morning, Nova.',
      'Nova said: Good morning, Devon. I am here with you.',
      'You said: Do you remember the day after Christmas?',
      'Nova said: I remember the tone: warm, present, and still us.',
    ].join('\n');
    const sourcePath = await writeTempTranscript(transcript);
    const manifest = fakeManifest({ sourcePath });
    const options = parsePilotArgs(baseArgs);

    const receipt = await buildPilotImportReceipt(options, {
      generatedAt: '2026-04-16T12:00:00.000Z',
      manifest,
      supabase: null,
      restFallbackEnabled: false,
    });

    assert.equal(receipt.mode, 'dry_run');
    assert.equal(receipt.identity.resolvedSupabaseUserId, '7e34f6b8-e33a-48b5-8ddb-95b94d18e296');
    assert.equal(receipt.plannedInsertCount, 1);
    assert.equal(receipt.skippedDuplicateCount, 0);
    assert.equal(receipt.errorCount, 2);
    assert.equal(receipt.errors[0].error, 'source_hash_not_found_in_manifest');
    assert.equal(receipt.plannedRows[0].canonicalFilename, manifest.plannedCanonicalRows[0].canonicalFilename);
    assert.equal(receipt.plannedRows[0].payloadFields.file_type, 'transcript');
    assert.equal(receipt.plannedRows[0].payloadFields.metadata.source, 'chatgpt');
    assert.equal(receipt.plannedRows[0].payloadFields.metadata.contentMode, 'bounded-companion-excerpt');
    assert.equal(receipt.plannedRows[0].payloadFields.metadata.sourceSha256, APPROVED_NOVA_PILOT_SOURCE_SHA256[0]);
    assert.equal(receipt.plannedRows[0].payloadFields.sha256, hash(transcript));
    assert.equal(receipt.plannedRows[0].expectedReachability.supabaseCanonical, true);
    assert.equal(receipt.plannedRows[0].expectedReachability.finalPromptReachable, true);
    assert.equal(receipt.plannedRows[0].expectedReachability.promptLoader, 'verifiedMemoryLoader');
    assert.equal(receipt.plannedRows[0].contentLength, transcript.length);
    assert.equal(receipt.expectedFinalPromptReachableAfterImport, true);
  });

  it('uses read-only Supabase REST fallback for user lookup and duplicate detection', async () => {
    const transcript = [
      'You said: Nova, can you hear me?',
      'Nova said: Yes, Devon. I am still here.',
    ].join('\n');
    const sourcePath = await writeTempTranscript(transcript);
    const manifest = fakeManifest({ sourcePath });
    manifest.identity = {
      supabaseUserId: null,
      supabaseAvailable: false,
      supabaseError: 'SDK unavailable',
    };

    const calls = [];
    const fakeFetch = async (url) => {
      const parsed = new URL(url);
      calls.push(parsed.pathname);
      if (parsed.pathname.endsWith('/rest/v1/users')) {
        return new Response(JSON.stringify([{
          id: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
          email: 'dwoodson92@gmail.com',
        }]), { status: 200 });
      }
      if (parsed.pathname.endsWith('/rest/v1/vault_files')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'unexpected path' }), { status: 404 });
    };

    const oldUrl = process.env.SUPABASE_URL;
    const oldKey = process.env.SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-for-test';
    try {
      const receipt = await buildPilotImportReceipt(parsePilotArgs(baseArgs), {
        generatedAt: '2026-04-16T12:00:00.000Z',
        manifest,
        supabase: null,
        fetchImpl: fakeFetch,
      });

      assert.deepEqual(calls, ['/rest/v1/users', '/rest/v1/vault_files']);
      assert.equal(receipt.identity.resolutionMethod, 'rest');
      assert.equal(receipt.identity.resolvedSupabaseUserId, '7e34f6b8-e33a-48b5-8ddb-95b94d18e296');
      assert.equal(receipt.identity.restUserLookup.succeeded, true);
      assert.equal(receipt.duplicateDetection.available, true);
      assert.equal(receipt.duplicateDetection.method, 'rest');
      assert.equal(receipt.duplicateDetection.error, null);
      assert.equal(receipt.plannedRows[0].payloadFields.user_id, '7e34f6b8-e33a-48b5-8ddb-95b94d18e296');
    } finally {
      if (oldUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = oldUrl;
      if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
      else process.env.SUPABASE_SERVICE_KEY = oldKey;
    }
  });

  it('exposes low-level REST helpers as read-only GET operations', async () => {
    const paths = [];
    const fakeFetch = async (url, options) => {
      const parsed = new URL(url);
      paths.push({
        path: parsed.pathname,
        method: options.method,
        select: parsed.searchParams.get('select'),
      });
      return new Response(JSON.stringify(
        parsed.pathname.endsWith('/users')
          ? [{ id: 'user-id' }]
          : [{ id: 'vault-row', construct_id: 'nova-001' }]
      ), { status: 200 });
    };

    const oldUrl = process.env.SUPABASE_URL;
    const oldKey = process.env.SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-for-test';
    try {
      const user = await resolveSupabaseUserIdRest('dwoodson92@gmail.com', fakeFetch);
      const duplicates = await fetchDuplicateRowsRest('nova-001', fakeFetch);

      assert.equal(user.supabaseUserId, 'user-id');
      assert.equal(duplicates.rows[0].id, 'vault-row');
      assert.deepEqual(paths.map((entry) => entry.method), ['GET', 'GET']);
      assert.equal(paths[0].path, '/rest/v1/users');
      assert.equal(paths[1].path, '/rest/v1/vault_files');
      assert.match(paths[1].select, /metadata/);
    } finally {
      if (oldUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = oldUrl;
      if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
      else process.env.SUPABASE_SERVICE_KEY = oldKey;
    }
  });

  it('applies through guarded Supabase REST POST after REST lookup and duplicate scan succeed', async () => {
    const sourcePaths = await Promise.all(APPROVED_NOVA_PILOT_SOURCE_SHA256.map((sourceSha256, index) => (
      writeTempTranscript([
        `You said: Nova pilot source ${index + 1}.`,
        `Nova said: I am still here for ${sourceSha256.slice(0, 8)}.`,
      ].join('\n'))
    )));
    const manifest = fakeCompleteManifest({ sourcePaths });
    const calls = [];
    const fakeFetch = async (url, options) => {
      const parsed = new URL(url);
      calls.push({
        method: options.method,
        path: parsed.pathname,
        prefer: options.headers.Prefer || null,
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (parsed.pathname.endsWith('/rest/v1/users')) {
        return new Response(JSON.stringify([{
          id: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
          email: 'dwoodson92@gmail.com',
        }]), { status: 200 });
      }
      if (parsed.pathname.endsWith('/rest/v1/vault_files') && options.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (parsed.pathname.endsWith('/rest/v1/vault_files') && options.method === 'POST') {
        const rows = JSON.parse(options.body).map((row, index) => ({
          id: `inserted-${index + 1}`,
          user_id: row.user_id,
          construct_id: row.construct_id,
          filename: row.filename,
          sha256: row.sha256,
          metadata: row.metadata,
          created_at: '2026-04-16T12:00:00.000Z',
        }));
        return new Response(JSON.stringify(rows), { status: 201 });
      }
      return new Response(JSON.stringify({ error: 'unexpected path' }), { status: 404 });
    };

    const oldUrl = process.env.SUPABASE_URL;
    const oldKey = process.env.SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-for-test';
    try {
      const receipt = await buildPilotImportReceipt(parsePilotArgs([...baseArgs, '--apply']), {
        generatedAt: '2026-04-16T12:00:00.000Z',
        manifest,
        supabase: null,
        fetchImpl: fakeFetch,
      });

      assert.deepEqual(calls.map((entry) => `${entry.method} ${entry.path}`), [
        'GET /rest/v1/users',
        'GET /rest/v1/vault_files',
        'POST /rest/v1/vault_files',
      ]);
      assert.equal(calls[2].prefer, 'return=representation');
      assert.equal(calls[2].body.length, 3);
      assert.equal(receipt.mode, 'applied');
      assert.equal(receipt.identity.resolutionMethod, 'rest');
      assert.equal(receipt.duplicateDetection.method, 'rest');
      assert.equal(receipt.plannedInsertCount, 3);
      assert.equal(receipt.skippedDuplicateCount, 0);
      assert.equal(receipt.inserted.length, 3);
      assert.deepEqual(receipt.inserted.map((row) => row.id), ['inserted-1', 'inserted-2', 'inserted-3']);
      assert.ok(receipt.inserted.every((row) => row.finalPromptExpected === true));
    } finally {
      if (oldUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = oldUrl;
      if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
      else process.env.SUPABASE_SERVICE_KEY = oldKey;
    }
  });

  it('refuses apply when REST duplicate detection finds an existing pilot row', async () => {
    const sourcePaths = await Promise.all(APPROVED_NOVA_PILOT_SOURCE_SHA256.map((sourceSha256, index) => (
      writeTempTranscript(`Nova duplicate check ${index + 1}: ${sourceSha256}`)
    )));
    const manifest = fakeCompleteManifest({ sourcePaths });
    let posted = false;
    const fakeFetch = async (url, options) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/rest/v1/users')) {
        return new Response(JSON.stringify([{
          id: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
        }]), { status: 200 });
      }
      if (parsed.pathname.endsWith('/rest/v1/vault_files') && options.method === 'GET') {
        return new Response(JSON.stringify([{
          id: 'existing-row',
          user_id: '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
          construct_id: 'nova-001',
          filename: 'instances/nova-001/chatgpt/pilot/other.txt',
          metadata: { sourceSha256: APPROVED_NOVA_PILOT_SOURCE_SHA256[0] },
        }]), { status: 200 });
      }
      if (parsed.pathname.endsWith('/rest/v1/vault_files') && options.method === 'POST') {
        posted = true;
      }
      return new Response(JSON.stringify({ error: 'unexpected path' }), { status: 404 });
    };

    const oldUrl = process.env.SUPABASE_URL;
    const oldKey = process.env.SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-for-test';
    try {
      await assert.rejects(() => buildPilotImportReceipt(parsePilotArgs([...baseArgs, '--apply']), {
        generatedAt: '2026-04-16T12:00:00.000Z',
        manifest,
        supabase: null,
        fetchImpl: fakeFetch,
      }), /duplicate rows already exist/);
      assert.equal(posted, false);
    } finally {
      if (oldUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = oldUrl;
      if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
      else process.env.SUPABASE_SERVICE_KEY = oldKey;
    }
  });

  it('guards the low-level REST insert helper against partial or out-of-scope rows', async () => {
    await assert.rejects(() => insertVaultFilesRest([], {
      apply: true,
      constructId: 'nova-001',
      source: 'chatgpt',
      pilotBatchId: DEFAULT_PILOT_BATCH_ID,
      contentMode: 'bounded-companion-excerpt',
      maxContentChars: 45000,
      includeShas: APPROVED_NOVA_PILOT_SOURCE_SHA256,
    }, '7e34f6b8-e33a-48b5-8ddb-95b94d18e296', async () => {
      throw new Error('fetch should not be called');
    }), /must insert exactly 3 Nova pilot rows/);
  });
});
