import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.resolve(__dirname, '../routes/codex.js');
const docsPath = path.resolve(__dirname, '../../docs/standards/codex-pickup-command.md');

async function readPickupRouteSource() {
  return fs.readFile(routePath, 'utf8');
}

test('/api/codex/pickup relays from VVAULT readback content after sync proof', async () => {
  const source = await readPickupRouteSource();

  assert.match(source, /syncArchive = syncCodexThreadsArchive/);
  assert.match(source, /publishToVvault:\s*true/);
  assert.match(source, /requireVvaultReadback:\s*true/);
  assert.match(source, /failOnVvaultPublishFailure:\s*true/);
  assert.match(source, /writeLocalArchive:\s*false/);
  assert.doesNotMatch(source, /fromRolloutPath:\s*syncedTranscript\.sourceSessionPath/);
  assert.match(source, /fromVvaultArchiveContent:\s*syncedTranscript\.vvaultReadback\.content/);
  assert.match(source, /fromVvaultStoragePath:\s*syncedTranscript\.vvaultReadback\.storagePath/);
  assert.doesNotMatch(source, /latestCodex:\s*true/);
  assert.match(source, /pickupSource:\s*'synced-vvault-readback-transcript'/);
});

test('/api/codex/pickup rejects synced transcripts without a completed assistant tail', async () => {
  const source = await readPickupRouteSource();

  assert.match(source, /syncedTranscript\.latestMessageRole === 'assistant'/);
  assert.match(source, /!hasCompletedAssistantTail\(syncedTranscript\)/);
  assert.match(source, /CODEX_PICKUP_AWAITING_ASSISTANT_TAIL/);
  assert.match(source, /res\.status\(409\)/);
});

test('/pickup docs require VVAULT readback source and assistant-tail failure', async () => {
  const docs = await fs.readFile(docsPath, 'utf8');

  assert.match(docs, /Treat the verified VVAULT readback content as the pickup source/);
  assert.match(docs, /synced transcript's newest message/);
  assert.match(docs, /CODEX_PICKUP_AWAITING_ASSISTANT_TAIL/);
  assert.match(docs, /must not invent or infer a tail when no completed assistant answer exists/);
});
