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
  it('routes every risky thread-list overwrite through the active-route reconciliation helper', () => {
    const source = readRepoFile('src/components/Layout.tsx');

    assert.match(source, /const reconcileActiveRouteThreadOverwrite = useCallback/);
    assert.match(source, /reconcileIncomingThreadsForActiveRoute/);
    assert.ok(
      (source.match(/reconcileActiveRouteThreadOverwrite\(/g) || []).length >= 12,
      'expected active-route reconciliation helper to remain the dominant thread overwrite path',
    );

    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*snapshot\.threads as any,/,
    );
    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*fallbackThreads,\s*\{\s*hydrationSource:\s*retriedResponse\?\.hydrationSource/s,
    );
    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*mappedRetryThreads,\s*\{\s*hydrationSource:\s*retriedResponse\?\.hydrationSource/s,
    );
    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*fallbackThreads,\s*\{\s*hydrationSource:\s*indexResponse\?\.hydrationSource/s,
    );
    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*threadsWithVoiceOverlay,\s*\{\s*hydrationSource:\s*indexResponse\?\.hydrationSource/s,
    );
    assert.equal(
      (
        source.match(
          /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*threadsWithVoiceOverlay,\s*\{\s*activeThreadId:\s*requestedStartupThreadId,\s*hydrationSource:\s*fullConversationResponse\?\.hydrationSource/gs,
        ) || []
      ).length,
      3,
    );
    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*threadsWithVoiceOverlay,\s*\{\s*activeThreadId:\s*requestedStartupThreadId,\s*hydrationSource:\s*fullConversationResponse\?\.hydrationSource/s,
    );
    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*fallbackThreads,\s*\{\s*activeThreadId:\s*requestedThreadId,\s*hydrationSource:\s*conversationResponse\?\.hydrationSource/s,
    );
    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*sortedThreads,\s*\{\s*activeThreadId:\s*requestedThreadId,\s*hydrationSource:\s*conversationResponse\?\.hydrationSource/s,
    );
    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*fallbackThreads,\s*\{\s*activeThreadId:\s*requestedThreadId,\s*hydrationComplete:\s*false/s,
    );
    assert.match(
      source,
      /reconcileActiveRouteThreadOverwrite\(\s*prevThreads,\s*\[\],\s*\{\s*activeThreadId:\s*requestedThreadId,\s*hydrationComplete:\s*false/s,
    );
  });

  it('reloads the active route by exact thread id and no longer uses soft active-thread replacement heuristics', () => {
    const source = readRepoFile('src/components/Layout.tsx');
    const reloadThreadMessages = extractAsyncFunction(source, 'reloadThreadMessages');

    assert.match(reloadThreadMessages, /loadConversationTranscript\(threadId\)/);
    assert.match(reloadThreadMessages, /emitLayoutClientTrace\("exact-thread-transcript"/);
    assert.match(reloadThreadMessages, /deriveActiveConversationHydrationStateFromTranscript/);
    assert.doesNotMatch(reloadThreadMessages, /threadId\.includes\(t\.constructId\)/);
    assert.doesNotMatch(reloadThreadMessages, /t\.id === finalThreadId/);
    assert.doesNotMatch(reloadThreadMessages, /\$\{t\.constructId\}_chat_with_\$\{t\.constructId\}/);
    assert.doesNotMatch(reloadThreadMessages, /constructId === "zen-001"/);
  });

  it('prefers durable Zen live snapshot threads before local hydration cache fallbacks', () => {
    const source = readRepoFile('src/components/Layout.tsx');

    assert.match(source, /const zenLiveSnapshotThreadsRef = useRef<Thread\[] \| null>\(null\)/);
    assert.match(
      source,
      /Array\.isArray\(zenLiveSnapshotThreadsRef\.current\)\s*&&\s*zenLiveSnapshotThreadsRef\.current\.length > 0/,
    );
    assert.match(source, /zenLiveSnapshotThreadsRef\.current = nextThreads/);
    assert.match(source, /zenLiveSnapshotThreadsRef\.current = replayHydratedThreads/);
    assert.match(source, /createSnapshotReplayActiveConversationHydrationState/);
    assert.match(source, /void reloadThreadMessages\(DEFAULT_ZEN_CANONICAL_SESSION_ID\)/);
  });

  it('does not impersonate full hydration when bootstrapping local-deferred canonical threads', () => {
    const source = readRepoFile('src/components/Layout.tsx');
    const localDeferredHydrationBlocks =
      source.match(
        /persistenceSource:\s*"local-deferred"[\s\S]{0,240}?hydrationSource:\s*"local-fallback"[\s\S]{0,80}?hydrationComplete:\s*false/gs,
      ) || [];

    assert.equal(localDeferredHydrationBlocks.length, 2);
    assert.equal(
      (
        source.match(
          /persistenceSource:\s*"local-deferred"[\s\S]{0,240}?hydrationSource:\s*"full"[\s\S]{0,80}?hydrationComplete:\s*true/gs,
        ) || []
      ).length,
      0,
    );
  });

  it('keeps replay-only Zen snapshot hydration partial until exact transcript readback succeeds', () => {
    const source = readRepoFile('src/components/Layout.tsx');

    assert.match(source, /createSnapshotReplayActiveConversationHydrationState\(\s*DEFAULT_ZEN_CANONICAL_SESSION_ID/s);
    assert.doesNotMatch(
      source,
      /zenReplayEvents\.length > 0[\s\S]{0,320}hydrationSource:\s*"full"[\s\S]{0,80}hydrationComplete:\s*true/s,
    );
  });

  it('never mints a timestamped Zen primary thread id during canonical bootstrap', () => {
    const source = readRepoFile('src/components/Layout.tsx');

    assert.doesNotMatch(source, /`zen_\$\{Date\.now\(\)\}`/);
    assert.doesNotMatch(source, /zen_emergency_/);
    assert.match(
      source,
      /const defaultThreadId =\s*canonicalZenUrlThreadId \|\|\s*zenCanonicalThread\?\.id \|\|\s*DEFAULT_ZEN_CANONICAL_SESSION_ID;/,
    );
  });

  it('does not let persona detection override the canonical Zen thread construct', () => {
    const source = readRepoFile('src/components/Layout.tsx');
    const sendMessage = extractAsyncFunction(source, 'sendMessage');

    assert.match(sendMessage, /isCanonicalZenThreadId\(threadId\)/);
    assert.match(sendMessage, /effectiveConstructId = DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID/);
  });

  it('does not dispatch Home prompts to an empty or locally-created Zen thread', () => {
    const source = readRepoFile('src/pages/Home.tsx');

    assert.doesNotMatch(source, /sendMessage\("",/);
    assert.doesNotMatch(source, /newThread\(\)/);
    assert.match(source, /sendMessage\(DEFAULT_ZEN_CANONICAL_SESSION_ID,\s*trimmed,\s*\[\]\)/);
  });
});
