import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildRelaySourceDescriptor,
  readLatestCodexTail,
  relayResolvedCodexTurns,
  selectBootstrapRelayTurns,
  selectIncrementalRelayTurns,
} from './codexContinuityRelay.js';
import { syncCodexThreadsArchive } from './codexThreadArchive.js';

const DEFAULT_POLL_SECONDS = 2;
const DEFAULT_BOOTSTRAP_PAIR_LIMIT = 3;
const DEFAULT_CHATTY_CLI_HOME = path.join(os.homedir(), '.chatty-cli');

function resolveChattyCliHome() {
  const configured = process.env.CHATTY_CLI_HOME || DEFAULT_CHATTY_CLI_HOME;
  return path.resolve(configured);
}

function getWatchPaths() {
  const chattyCliHome = resolveChattyCliHome();
  return {
    chattyCliHome,
    checkpointPath: path.join(chattyCliHome, 'codex-handoff-watch.state.json'),
    lockPath: path.join(chattyCliHome, 'codex-handoff-watch.lock'),
  };
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function ensureCliHome(paths) {
  await fs.mkdir(paths.chattyCliHome, { recursive: true });
}

async function acquireWatchLock(paths, preferredCwd) {
  await ensureCliHome(paths);
  const existingLock = await readJsonFile(paths.lockPath);
  if (existingLock?.pid && isPidAlive(existingLock.pid)) {
    throw new Error(
      `chatty-cli handoff watch is already running (pid ${existingLock.pid}) for ${existingLock.preferredCwd || 'unknown cwd'}.`,
    );
  }

  const nextLock = {
    pid: process.pid,
    preferredCwd,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(paths.lockPath, `${JSON.stringify(nextLock, null, 2)}\n`, 'utf8');
  return nextLock;
}

async function releaseWatchLock(paths) {
  const existingLock = await readJsonFile(paths.lockPath);
  if (existingLock?.pid && existingLock.pid !== process.pid) {
    return;
  }
  await fs.unlink(paths.lockPath).catch(() => {});
}

function defaultEmitEvent(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildLatestSyncedMessage(syncedTranscript = {}) {
  return {
    role: syncedTranscript.latestMessageRole || null,
    timestamp: syncedTranscript.latestMessageTimestamp || null,
    digest: syncedTranscript.latestMessageDigest || null,
    sourceTurnIndex: syncedTranscript.latestMessageSourceTurnIndex ?? null,
  };
}

function sanitizeVvaultReadback(readback = null) {
  if (!readback || typeof readback !== 'object') return null;
  const metadata = readback.metadata && typeof readback.metadata === 'object'
    ? {
        sourceSessionId: readback.metadata.sourceSessionId || null,
        digest: readback.metadata.digest || null,
        latestMessageRole: readback.metadata.latestMessageRole || null,
        latestMessageTimestamp: readback.metadata.latestMessageTimestamp || null,
        latestMessageDigest: readback.metadata.latestMessageDigest || null,
        latestMessageSourceTurnIndex:
          readback.metadata.latestMessageSourceTurnIndex ?? null,
      }
    : null;
  return {
    storagePath: readback.storagePath || null,
    storageMode: readback.storageMode || null,
    sha256: readback.sha256 || null,
    contentLength:
      typeof readback.content === 'string'
        ? readback.content.length
        : readback.contentLength ?? null,
    metadata,
  };
}

function buildStartedEvent({ preferredCwd, pollSeconds, checkpointPath, lockPath }) {
  return {
    event: 'started',
    command: 'chatty-cli handoff',
    source: {
      type: 'latest-codex',
      preferredCwd,
    },
    pollSeconds,
    checkpointPath,
    lockPath,
  };
}

function buildSyncedEvent({ result, source, continuitySeq }) {
  return {
    event: 'synced',
    command: 'chatty-cli handoff',
    source,
    relayAuthority: source?.relayAuthority || null,
    vvaultReadback: source?.vvaultReadback || null,
    latestSyncedMessage: source?.latestSyncedMessage || null,
    constructId: result.constructId,
    threadId: result.threadId,
    importedTurns: result.importedTurns ?? 0,
    dedupedTurns: result.dedupedTurns ?? 0,
    latestAssistantTurnId: result.latestAssistantTurnId || null,
    continuitySeq,
    resumeTokenJson: result.resumeTokenJson || null,
    chattyResumeUrl: result.chattyResumeUrl || null,
    canonicalReadback: {
      source: result.canonicalReadback?.persistenceSource || result.canonicalReadback?.source || null,
      sessionId: result.canonicalReadback?.sessionId || result.canonicalReadback?.id || null,
      messageCount: Array.isArray(result.canonicalReadback?.messages)
        ? result.canonicalReadback.messages.length
        : null,
      localFallback: result.canonicalReadback?.localFallback === true,
    },
  };
}

function buildSourceSyncedEvent({ result }) {
  return {
    event: 'source_synced',
    command: 'chatty-cli handoff',
    source: {
      type: 'codex-vvault-source-evidence',
      continuityClaim: 'none',
    },
    scannedFiles: result?.scannedFiles ?? 0,
    archivedThreads: result?.archivedThreads ?? 0,
    vvaultPublishedThreads: result?.vvaultPublishedThreads ?? 0,
    vvaultReadbackVerifiedThreads: result?.vvaultReadbackVerifiedThreads ?? 0,
    latest: result?.latest
      ? {
          sourceSessionId: result.latest.sourceSessionId || null,
          sourceSessionPath: result.latest.sourceSessionPath || null,
          sourceThreadName: result.latest.sourceThreadName || null,
          vvaultStoragePath: result.latest.vvaultStoragePath || null,
          vvaultReadback: sanitizeVvaultReadback(result.latest.vvaultReadback),
          latestAssistantTimestamp: result.latest.latestAssistantTimestamp || null,
          latestMessageRole: result.latest.latestMessageRole || null,
          latestMessageTimestamp: result.latest.latestMessageTimestamp || null,
          latestMessageDigest: result.latest.latestMessageDigest || null,
          latestMessageSourceTurnIndex:
            result.latest.latestMessageSourceTurnIndex ?? null,
          digest: result.latest.digest || null,
        }
      : null,
  };
}

function buildAwaitingAssistantTailEvent({ sourceProof }) {
  return {
    event: 'awaiting_assistant_tail',
    command: 'chatty-cli handoff',
    relayAuthority: sourceProof.relayAuthority,
    vvaultReadback: sourceProof.vvaultReadback,
    latestSyncedMessage: sourceProof.latestSyncedMessage,
    sourceSessionId: sourceProof.sourceSessionId,
    sourceSessionPath: sourceProof.sourceSessionPath,
  };
}

function resolveCheckpointContinuitySeq(result) {
  return (
    result?.latestRuntimeTurnState?.continuitySeq ??
    result?.resumeTokenJson?.continuitySeq ??
    null
  );
}

function buildCheckpointState({
  previousCheckpoint = null,
  selectedTurns = [],
  result,
  preferredCwd,
  source,
  sourceProof = null,
  updatedAt,
}) {
  const latestTurn = selectedTurns[selectedTurns.length - 1] || null;
  return {
    pid: process.pid,
    preferredCwd,
    sourceSessionPath: source?.path || null,
    sourceSessionId: source?.parseReport?.sessionId || null,
    lastImportedSourceTurnIndex:
      typeof latestTurn?.sourceTurnIndex === 'number'
        ? latestTurn.sourceTurnIndex
        : previousCheckpoint?.lastImportedSourceTurnIndex ?? null,
    lastImportedRelayDigest:
      latestTurn?.relayTurnDigest || previousCheckpoint?.lastImportedRelayDigest || null,
    latestAssistantTurnId:
      result?.latestAssistantTurnId || previousCheckpoint?.latestAssistantTurnId || null,
    continuitySeq:
      resolveCheckpointContinuitySeq(result) ?? previousCheckpoint?.continuitySeq ?? null,
    chattyResumeUrl: result?.chattyResumeUrl || previousCheckpoint?.chattyResumeUrl || null,
    relayAuthority:
      sourceProof?.relayAuthority || previousCheckpoint?.relayAuthority || null,
    vvaultStoragePath:
      sourceProof?.vvaultReadback?.storagePath || previousCheckpoint?.vvaultStoragePath || null,
    vvaultReadbackSha256:
      sourceProof?.vvaultReadback?.sha256 || previousCheckpoint?.vvaultReadbackSha256 || null,
    latestSyncedMessage:
      sourceProof?.latestSyncedMessage || previousCheckpoint?.latestSyncedMessage || null,
    updatedAt,
  };
}

async function writeCheckpoint(paths, checkpoint) {
  await ensureCliHome(paths);
  await fs.writeFile(paths.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
}

function shouldBootstrapSession({ checkpoint, sourcePath, sourceSessionId }) {
  return (
    !checkpoint ||
    checkpoint.sourceSessionPath !== sourcePath ||
    checkpoint.sourceSessionId !== sourceSessionId
  );
}

function assertMetadataValueMatches({ metadata, latest, key, label = key }) {
  const expected = latest?.[key];
  if (expected === null || typeof expected === 'undefined') {
    return;
  }
  const actual = metadata?.[key];
  if (actual === null || typeof actual === 'undefined') {
    throw new Error(`Codex watch VVAULT readback metadata is missing ${label}.`);
  }
  if (String(actual) !== String(expected)) {
    throw new Error(`Codex watch VVAULT readback metadata ${label} mismatch.`);
  }
}

function buildVerifiedSourceProof(sourceSync) {
  const latest = sourceSync?.latest || null;
  if (!latest) {
    throw new Error('Codex watch VVAULT source sync did not return a latest transcript.');
  }
  const readback = latest.vvaultReadback;
  const sanitizedReadback = sanitizeVvaultReadback(readback);
  if (!sanitizedReadback?.storagePath || !sanitizedReadback?.sha256) {
    throw new Error('Codex watch requires verified VVAULT readback with storagePath and sha256.');
  }
  if (sanitizedReadback.storageMode !== 'vvault_body') {
    throw new Error('Codex watch VVAULT readback storage_mode is not vvault_body.');
  }
  if (!readback?.metadata || typeof readback.metadata !== 'object') {
    throw new Error('Codex watch VVAULT readback metadata is missing.');
  }
  if (typeof readback.content !== 'string' || readback.content.length === 0) {
    throw new Error('Codex watch requires verified VVAULT readback content.');
  }
  if (!normalizeString(latest.sourceSessionPath)) {
    throw new Error('Codex watch VVAULT source sync did not include a source rollout path.');
  }
  if (!normalizeString(latest.sourceSessionId)) {
    throw new Error('Codex watch VVAULT source sync did not include a source session id.');
  }

  const metadata = readback.metadata;
  assertMetadataValueMatches({ metadata, latest, key: 'sourceSessionId' });
  assertMetadataValueMatches({ metadata, latest, key: 'latestMessageRole' });
  assertMetadataValueMatches({ metadata, latest, key: 'latestMessageTimestamp' });
  assertMetadataValueMatches({ metadata, latest, key: 'latestMessageDigest' });
  assertMetadataValueMatches({
    metadata,
    latest,
    key: 'latestMessageSourceTurnIndex',
    label: 'latestMessageSourceTurnIndex',
  });

  return {
    relayAuthority: 'synced-vvault-readback',
    sourceSessionId: latest.sourceSessionId,
    sourceSessionPath: latest.sourceSessionPath,
    latestSyncedMessage: buildLatestSyncedMessage(latest),
    vvaultReadback: sanitizedReadback,
    assistantTailReady: latest.latestMessageRole === 'assistant',
  };
}

function assertParsedTailMatchesSyncedSource({ parsed, sourceProof }) {
  const parseReport = parsed?.parseReport || {};
  if (normalizeString(parseReport.sessionPath) !== normalizeString(sourceProof.sourceSessionPath)) {
    throw new Error('Codex watch parsed rollout path does not match verified VVAULT readback source path.');
  }
  if (normalizeString(parseReport.sessionId) !== normalizeString(sourceProof.sourceSessionId)) {
    throw new Error('Codex watch parsed rollout session does not match verified VVAULT readback source session.');
  }
  const latestParsedTurn = Array.isArray(parsed?.conversationTurns)
    ? parsed.conversationTurns[parsed.conversationTurns.length - 1]
    : null;
  const latestSyncedMessage = sourceProof.latestSyncedMessage || {};
  if (!latestParsedTurn) {
    throw new Error('Codex watch parsed rollout did not include a latest source turn.');
  }
  if (latestParsedTurn.role !== latestSyncedMessage.role) {
    throw new Error('Codex watch parsed latest role does not match verified VVAULT readback latest role.');
  }
  if (
    latestSyncedMessage.sourceTurnIndex !== null &&
    typeof latestParsedTurn.sourceTurnIndex === 'number' &&
    latestParsedTurn.sourceTurnIndex !== latestSyncedMessage.sourceTurnIndex
  ) {
    throw new Error('Codex watch parsed latest source turn mismatch with verified VVAULT readback.');
  }
  if (
    latestSyncedMessage.timestamp &&
    latestParsedTurn.ts &&
    latestParsedTurn.ts !== latestSyncedMessage.timestamp
  ) {
    throw new Error('Codex watch parsed latest timestamp does not match verified VVAULT readback.');
  }
}

export async function runCodexContinuityWatch({
  pollSeconds = DEFAULT_POLL_SECONDS,
  bootstrapPairLimit = DEFAULT_BOOTSTRAP_PAIR_LIMIT,
  codexSessionsRoot = process.env.CODEX_SESSIONS_ROOT,
  preferredCodexCwd = process.cwd(),
  nowFn = () => new Date().toISOString(),
  maxPolls = Number.POSITIVE_INFINITY,
  emitEvent = defaultEmitEvent,
  sleepImpl = sleep,
  usersPath,
  ownerEmail,
  frontendBaseUrl,
  readLatestRuntimeTurnStateImpl,
  readConversationsImpl,
  writeTranscriptImpl,
  syncSourceEvidenceToVvault = false,
  sourceSyncMaxFiles = 16,
  syncSourceEvidenceImpl = syncCodexThreadsArchive,
} = {}) {
  const effectivePollSeconds =
    typeof pollSeconds === 'number' && Number.isFinite(pollSeconds) && pollSeconds > 0
      ? pollSeconds
      : DEFAULT_POLL_SECONDS;
  const effectiveBootstrapPairLimit =
    typeof bootstrapPairLimit === 'number' &&
    Number.isFinite(bootstrapPairLimit) &&
    bootstrapPairLimit > 0
      ? Math.floor(bootstrapPairLimit)
      : DEFAULT_BOOTSTRAP_PAIR_LIMIT;
  const paths = getWatchPaths();
  let checkpoint = await readJsonFile(paths.checkpointPath);
  let syncedEvents = 0;
  let sourceSyncEvents = 0;

  await acquireWatchLock(paths, preferredCodexCwd);
  try {
    emitEvent(
      buildStartedEvent({
        preferredCwd: preferredCodexCwd,
        pollSeconds: effectivePollSeconds,
        checkpointPath: paths.checkpointPath,
        lockPath: paths.lockPath,
      }),
    );

    for (let pollIndex = 0; pollIndex < maxPolls; pollIndex += 1) {
      let sourceProof = null;
      if (syncSourceEvidenceToVvault) {
        const sourceSync = await syncSourceEvidenceImpl({
          codexSessionsRoot,
          maxFiles: sourceSyncMaxFiles,
          publishToVvault: true,
          requireVvaultReadback: true,
          failOnVvaultPublishFailure: true,
          writeLocalArchive: false,
          pruneExisting: false,
          now: nowFn(),
        });
        sourceSyncEvents += 1;
        emitEvent(buildSourceSyncedEvent({ result: sourceSync }));
        sourceProof = buildVerifiedSourceProof(sourceSync);
        if (!sourceProof.assistantTailReady) {
          emitEvent(buildAwaitingAssistantTailEvent({ sourceProof }));
          if (pollIndex + 1 < maxPolls) {
            await sleepImpl(effectivePollSeconds * 1000);
          }
          continue;
        }
      }

      const parsed = await readLatestCodexTail({
        codexSessionsRoot,
        preferredCwd: preferredCodexCwd,
      });
      if (sourceProof) {
        assertParsedTailMatchesSyncedSource({ parsed, sourceProof });
      }
      const source = buildRelaySourceDescriptor({
        latestCodex: true,
        latestCodexPath: parsed.parseReport?.sessionPath || null,
        parseReport: parsed.parseReport,
        selection: shouldBootstrapSession({
          checkpoint,
          sourcePath: parsed.parseReport?.sessionPath || null,
          sourceSessionId: parsed.parseReport?.sessionId || null,
        })
          ? 'watch-bootstrap-window'
          : 'watch-incremental-window',
      });
      if (sourceProof) {
        source.relayAuthority = sourceProof.relayAuthority;
        source.vvaultReadback = sourceProof.vvaultReadback;
        source.latestSyncedMessage = sourceProof.latestSyncedMessage;
      }
      const selectedTurns = shouldBootstrapSession({
        checkpoint,
        sourcePath: parsed.parseReport?.sessionPath || null,
        sourceSessionId: parsed.parseReport?.sessionId || null,
      })
        ? selectBootstrapRelayTurns(parsed.conversationTurns, {
            pairLimit: effectiveBootstrapPairLimit,
          })
        : selectIncrementalRelayTurns(parsed.conversationTurns, {
            afterSourceTurnIndex: checkpoint?.lastImportedSourceTurnIndex ?? null,
          });

      if (selectedTurns.length > 0) {
        const result = await relayResolvedCodexTurns({
          turns: selectedTurns,
          relaySource: source,
          now: nowFn(),
          usersPath,
          ownerEmail,
          frontendBaseUrl,
          readLatestRuntimeTurnStateImpl,
          readConversationsImpl,
          writeTranscriptImpl,
        });
        const nextCheckpoint = buildCheckpointState({
          previousCheckpoint: checkpoint,
          selectedTurns: result.relayedTurns || selectedTurns,
          result,
          preferredCwd: preferredCodexCwd,
          source,
          sourceProof,
          updatedAt: nowFn(),
        });
        const previousAssistantTurnId = checkpoint?.latestAssistantTurnId || null;
        checkpoint = nextCheckpoint;
        await writeCheckpoint(paths, checkpoint);

        if (result.latestAssistantTurnId && result.latestAssistantTurnId !== previousAssistantTurnId) {
          syncedEvents += 1;
          emitEvent(
            buildSyncedEvent({
              result,
              source,
              continuitySeq: checkpoint.continuitySeq,
            }),
          );
        }
      }

      if (pollIndex + 1 < maxPolls) {
        await sleepImpl(effectivePollSeconds * 1000);
      }
    }

    return {
      polls: Number.isFinite(maxPolls) ? maxPolls : null,
      syncedEvents,
      sourceSyncEvents,
      checkpointPath: paths.checkpointPath,
      lockPath: paths.lockPath,
      checkpoint,
    };
  } finally {
    await releaseWatchLock(paths);
  }
}
