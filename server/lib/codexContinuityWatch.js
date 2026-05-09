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
    constructId: result.constructId,
    threadId: result.threadId,
    importedTurns: result.importedTurns ?? 0,
    dedupedTurns: result.dedupedTurns ?? 0,
    latestAssistantTurnId: result.latestAssistantTurnId || null,
    continuitySeq,
    resumeTokenJson: result.resumeTokenJson || null,
    chattyResumeUrl: result.chattyResumeUrl || null,
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
      const parsed = await readLatestCodexTail({
        codexSessionsRoot,
        preferredCwd: preferredCodexCwd,
      });
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
      checkpointPath: paths.checkpointPath,
      lockPath: paths.lockPath,
      checkpoint,
    };
  } finally {
    await releaseWatchLock(paths);
  }
}
