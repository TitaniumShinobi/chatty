import express from 'express';

import { buildLatestCodexContinuePayload } from '../lib/chattyCliOrchestrationProof.js';
import { relayCodexContinuity } from '../lib/codexContinuityRelay.js';
import { syncCodexThreadsArchive } from '../lib/codexThreadArchive.js';

function summarizeRelay(result = {}) {
  const resumeToken = result.resumeTokenJson || null;
  const parseReport = result.source?.parseReport || null;
  return {
    ok: true,
    source: result.source || { type: 'latest-codex' },
    constructId: result.constructId || resumeToken?.constructId || 'zen-001',
    threadId: result.threadId || resumeToken?.threadId || 'zen-001_chat_with_zen-001',
    importedTurns: result.importedTurns ?? 0,
    dedupedTurns: result.dedupedTurns ?? 0,
    latestAssistantTurnId:
      result.latestAssistantTurnId || result.latestRuntimeTurnState?.assistantTurnId || null,
    latestAssistantTimestamp: parseReport?.latestAssistantTimestamp || null,
    sourceSessionId: parseReport?.sessionId || null,
    sourceSessionPath: parseReport?.sessionPath || null,
    sourceCwd: parseReport?.cwd || null,
    resumeTokenJson: resumeToken,
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

function buildLatestSyncedMessage(syncedTranscript = {}) {
  return {
    role: syncedTranscript.latestMessageRole || null,
    timestamp: syncedTranscript.latestMessageTimestamp || null,
    digest: syncedTranscript.latestMessageDigest || null,
    sourceTurnIndex: syncedTranscript.latestMessageSourceTurnIndex ?? null,
  };
}

function sanitizeVvaultReadback(readback = null) {
  if (!readback) return null;
  return {
    storagePath: readback.storagePath || null,
    storageMode: readback.storageMode || null,
    sha256: readback.sha256 || null,
    contentLength: typeof readback.content === 'string'
      ? readback.content.length
      : readback.contentLength ?? null,
    metadata: readback.metadata
      ? {
          sourceSessionId: readback.metadata.sourceSessionId || null,
          digest: readback.metadata.digest || null,
          latestMessageRole: readback.metadata.latestMessageRole || null,
          latestMessageTimestamp: readback.metadata.latestMessageTimestamp || null,
          latestMessageDigest: readback.metadata.latestMessageDigest || null,
          latestMessageSourceTurnIndex:
            readback.metadata.latestMessageSourceTurnIndex ?? null,
        }
      : null,
  };
}

function sanitizeSyncedTranscript(syncedTranscript = {}) {
  return {
    sourceSessionId: syncedTranscript.sourceSessionId || null,
    sourceSessionPath: syncedTranscript.sourceSessionPath || null,
    sourceThreadName: syncedTranscript.sourceThreadName || null,
    vvaultStoragePath: syncedTranscript.vvaultStoragePath || null,
    vvaultReadback: sanitizeVvaultReadback(syncedTranscript.vvaultReadback),
    latestAssistantTimestamp: syncedTranscript.latestAssistantTimestamp || null,
    latestMessageRole: syncedTranscript.latestMessageRole || null,
    latestMessageTimestamp: syncedTranscript.latestMessageTimestamp || null,
    latestMessageDigest: syncedTranscript.latestMessageDigest || null,
    latestMessageSourceTurnIndex: syncedTranscript.latestMessageSourceTurnIndex ?? null,
    digest: syncedTranscript.digest || null,
  };
}

export function hasCompletedAssistantTail(syncedTranscript = {}) {
  return Boolean(
    syncedTranscript.latestAssistantTimestamp &&
      syncedTranscript.latestMessageRole === 'assistant',
  );
}

export function createCodexRouter({
  syncArchive = syncCodexThreadsArchive,
  relayContinuity = relayCodexContinuity,
} = {}) {
  const router = express.Router();

  router.post('/pickup', async (req, res) => {
    try {
      const archiveSync = await syncArchive({
        maxFiles: 5,
        publishToVvault: true,
        requireVvaultReadback: true,
        failOnVvaultPublishFailure: true,
        writeLocalArchive: false,
        pruneExisting: false,
      });
      const syncedTranscript = archiveSync?.latest || null;
      if (!syncedTranscript) {
        return res.status(502).json({
          ok: false,
          error: 'Codex pickup could not sync a latest Codex transcript file to VVAULT.',
        });
      }
      if (!syncedTranscript.sourceSessionPath) {
        return res.status(502).json({
          ok: false,
          error: 'Codex pickup synced a VVAULT transcript without a source rollout path.',
          syncedTranscript: sanitizeSyncedTranscript(syncedTranscript),
        });
      }
      if (!hasCompletedAssistantTail(syncedTranscript)) {
        return res.status(409).json({
          ok: false,
          code: 'CODEX_PICKUP_AWAITING_ASSISTANT_TAIL',
          error:
            'Codex pickup synced the latest transcript to VVAULT, but the newest synced message is not a completed assistant tail yet.',
          syncedTranscript: sanitizeSyncedTranscript(syncedTranscript),
          latestSyncedMessage: buildLatestSyncedMessage(syncedTranscript),
        });
      }
      if (!syncedTranscript.vvaultReadback?.content || !syncedTranscript.vvaultReadback?.storagePath) {
        return res.status(502).json({
          ok: false,
          error: 'Codex pickup synced a VVAULT transcript without verified VVAULT readback content.',
          syncedTranscript: sanitizeSyncedTranscript(syncedTranscript),
        });
      }
      const result = await relayContinuity({
        fromVvaultArchiveContent: syncedTranscript.vvaultReadback.content,
        fromVvaultStoragePath: syncedTranscript.vvaultReadback.storagePath,
      });
      if (!result?.resumeTokenJson) {
        return res.status(502).json({
          ok: false,
          error: 'Codex pickup did not produce a resume token.',
        });
      }
      const pickup = summarizeRelay(result);
      return res.json({
        ...pickup,
        pickupSource: 'synced-vvault-readback-transcript',
        syncedTranscript: sanitizeSyncedTranscript(syncedTranscript),
        vvaultReadback: sanitizeVvaultReadback(syncedTranscript.vvaultReadback),
        latestSyncedMessage: buildLatestSyncedMessage(syncedTranscript),
        continuePayload: buildLatestCodexContinuePayload({
          resumeToken: result.resumeTokenJson,
        }),
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        error: error?.message || String(error),
      });
    }
  });

  return router;
}

export default createCodexRouter();
