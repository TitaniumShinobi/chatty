import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(__dirname, '../../src/pages/VVAULTPage.tsx');

async function readForceSyncBlock() {
  const source = await fs.readFile(pagePath, 'utf8');
  const start = source.indexOf('const handleForceCodexSync = async () => {');
  assert.notEqual(start, -1, 'VVAULTPage must define Force Codex Sync handler');
  const end = source.indexOf('const getStatusIcon', start);
  assert.notEqual(end, -1, 'Force Codex Sync handler block must end before getStatusIcon');
  return source.slice(start, end);
}

test('VVAULTPage Force Codex Sync posts a non-privileged browser trigger', async () => {
  const block = await readForceSyncBlock();

  assert.match(block, /fetch\('\/api\/vvault\/codex\/sync'/);
  assert.match(block, /method:\s*'POST'/);
  assert.match(block, /credentials:\s*'include'/);
  assert.match(block, /headers:\s*\{\s*'Content-Type':\s*'application\/json'\s*\}/);
  assert.match(block, /body:\s*JSON\.stringify\(\{\}\)/);
  assert.doesNotMatch(block, /lifeUserId/);
  assert.doesNotMatch(block, /constructId/);
  assert.doesNotMatch(block, /vvaultApiBaseUrl|serviceToken|targetRoot/);
});

test('VVAULTPage Force Codex Sync copy never reports local archive success', async () => {
  const source = await fs.readFile(pagePath, 'utf8');
  const block = await readForceSyncBlock();

  assert.match(source, /Force Codex Sync/);
  assert.match(block, /const publishedCount = Number\(data\.vvaultPublishedThreads \|\| 0\)/);
  assert.match(block, /const verifiedCount = Number\(data\.vvaultReadbackVerifiedThreads\)/);
  assert.match(block, /verifiedCount !== publishedCount/);
  assert.match(block, /Codex sync did not return verified VVAULT readback proof/);
  assert.match(block, /Published \$\{publishedCount\} Codex threads to VVAULT/);
  assert.match(block, /vvaultReadbackVerifiedThreads/);
  assert.match(block, /readbacks verified/);
  assert.match(block, /failed readbacks/);
  assert.match(block, /layoutContext\.forceRefreshConversations\?\.\(\)/);
  assert.doesNotMatch(block, /Archived .* locally|local_archive_only|archive was not configured/i);
});
