import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.resolve(__dirname, '../routes/vvault.js');

async function readCodexSyncRouteBlock() {
  const source = await fs.readFile(routePath, 'utf8');
  const start = source.indexOf('router.post("/codex/sync"');
  assert.notEqual(start, -1, 'codex sync route must exist');
  const end = source.indexOf('router.get("/conversations"', start);
  assert.notEqual(end, -1, 'codex sync route block must end before conversations route');
  return source.slice(start, end);
}

test('/api/vvault/codex/sync is a strict VVAULT source-evidence route', async () => {
  const routeBlock = await readCodexSyncRouteBlock();

  assert.match(routeBlock, /router\.post\("\/codex\/sync", requireSharedAuth/);
  assert.match(routeBlock, /lifeUserId:\s*DEFAULT_CODEX_ARCHIVE_LIFE_USER_ID/);
  assert.match(routeBlock, /constructId:\s*'zen-001'/);
  assert.match(routeBlock, /canonicalThreadId:\s*'zen-001_chat_with_zen-001'/);
  assert.match(routeBlock, /publishToVvault:\s*true/);
  assert.match(routeBlock, /requireVvaultReadback:\s*true/);
  assert.match(routeBlock, /failOnVvaultPublishFailure:\s*true/);
  assert.match(routeBlock, /writeLocalArchive:\s*false/);
  assert.match(routeBlock, /vaultFileVisibility:/);
  assert.match(routeBlock, /vvaultPublishedThreads > 0/);
  assert.match(routeBlock, /vvaultReadbackVerifiedThreads/);
  assert.match(routeBlock, /'vvault_body'/);
  assert.match(routeBlock, /'unverified'/);
  assert.match(routeBlock, /continuityClaim:\s*'none'/);
});

test('/api/vvault/codex/sync does not trust browser-supplied VVAULT authority fields', async () => {
  const routeBlock = await readCodexSyncRouteBlock();

  assert.doesNotMatch(routeBlock, /req\.body\?\.targetRoot/);
  assert.doesNotMatch(routeBlock, /req\.body\?\.vvaultApiBaseUrl/);
  assert.doesNotMatch(routeBlock, /req\.body\?\.vvaultServiceToken/);
  assert.doesNotMatch(routeBlock, /req\.body\?\.lifeUserId/);
  assert.doesNotMatch(routeBlock, /req\.body\?\.constructId/);
  assert.doesNotMatch(routeBlock, /local_archive_only/);
});
