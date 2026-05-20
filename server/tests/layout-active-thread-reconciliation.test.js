import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function extractAsyncFunction(source, functionName) {
  const start = source.indexOf(`async function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} was not found`);
  const nextFunction = source.indexOf('\n  async function ', start + 1);
  const nextPlainFunction = source.indexOf('\n  function ', start + 1);
  const candidates = [nextFunction, nextPlainFunction].filter((idx) => idx !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : undefined;
  return source.slice(start, end);
}

describe('Layout active-thread reconciliation', () => {
  it('routes blank new-conversation starts back into the canonical Zen thread instead of runtime roulette', () => {
    const source = readRepoFile('src/components/Layout.tsx');
    const newThread = extractAsyncFunction(source, 'newThread');

    assert.match(newThread, /const requestedBlankThread =/);
    assert.match(
      newThread,
      /return startConversationWithConstruct\(\s*DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID,\s*"Zen",\s*\);/s,
    );
  });

  it('fails closed when canonical conversation creation cannot be written to VVAULT', () => {
    const source = readRepoFile('src/components/Layout.tsx');
    const newThread = extractAsyncFunction(source, 'newThread');
    const startConversation = extractAsyncFunction(source, 'startConversationWithConstruct');

    assert.match(newThread, /setIsBackendUnavailable\(true\);/);
    assert.match(newThread, /setThreads\(\[\]\);/);
    assert.doesNotMatch(newThread, /createThread\(initialTitle\)/);

    assert.match(startConversation, /setIsBackendUnavailable\(true\);/);
    assert.match(startConversation, /setThreads\(\[\]\);/);
    assert.doesNotMatch(startConversation, /createThread\(constructName \|\| constructId\)/);
  });

  it('reloads the active route by exact thread id through the canonical transcript read path', () => {
    const source = readRepoFile('src/components/Layout.tsx');
    const reloadThreadMessages = extractAsyncFunction(source, 'reloadThreadMessages');

    assert.match(reloadThreadMessages, /loadConversationTranscript\(threadId\)/);
    assert.match(reloadThreadMessages, /deriveActiveConversationHydrationStateFromTranscript/);
    assert.match(reloadThreadMessages, /reconcileActiveRouteThreadOverwrite\(/);
    assert.doesNotMatch(reloadThreadMessages, /loadAllConversations\(/);
    assert.doesNotMatch(reloadThreadMessages, /threadId\.includes\(c\.constructId\)/);
    assert.doesNotMatch(reloadThreadMessages, /const constructIdMatch = threadId\.match/);
  });

  it('never mints a timestamped Zen primary thread id during canonical bootstrap', () => {
    const source = readRepoFile('src/components/Layout.tsx');

    assert.doesNotMatch(source, /`zen_\$\{Date\.now\(\)\}`/);
    assert.doesNotMatch(source, /zen_emergency_/);
    assert.match(
      source,
      /const defaultThreadId =\s*preferredUrlThreadId\s*\|\|\s*zenCanonicalThread\?\.id\s*\|\|\s*DEFAULT_ZEN_CANONICAL_SESSION_ID;/,
    );
  });

  it('does not let persona detection override the canonical Zen thread construct', () => {
    const source = readRepoFile('src/components/Layout.tsx');
    const sendMessage = extractAsyncFunction(source, 'sendMessage');

    assert.match(sendMessage, /const canonicalZenThread = isCanonicalZenThreadId\(threadId\);/);
    assert.match(sendMessage, /const detectionEnabled =\s*!canonicalZenThread/);
    assert.match(sendMessage, /effectiveConstructId: string \| null = canonicalZenThread/);
    assert.match(sendMessage, /effectiveConstructId = DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID/);
  });

  it('does not persist assistant packets that the backend marks as non-canonical continuity failures', () => {
    const source = readRepoFile('src/components/Layout.tsx');
    const sendMessage = extractAsyncFunction(source, 'sendMessage');

    assert.match(sendMessage, /packet:\s*any\)\s*=>\s*packet\?\.payload\?\.do_not_persist === true/);
    assert.match(sendMessage, /packet\?\.payload\?\.non_canonical_failure === true/);
    assert.match(
      sendMessage,
      /Skipping assistant transcript persistence because backend marked the response as non-canonical/,
    );
  });

  it('does not dispatch Home prompts to an empty or locally-created Zen thread', () => {
    const source = readRepoFile('src/pages/Home.tsx');

    assert.doesNotMatch(source, /sendMessage\("",/);
    assert.doesNotMatch(source, /newThread\(\)/);
    assert.match(source, /sendMessage\(DEFAULT_ZEN_CANONICAL_SESSION_ID,\s*trimmed,\s*\[\]\)/);
  });
});
