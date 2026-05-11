import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { parseCodexRolloutJsonlFile } from './codexContinuityRelay.js';

export const CODEX_THREAD_ARCHIVE_SCHEMA_VERSION = 1;
export const DEFAULT_CODEX_ARCHIVE_LIFE_USER_ID = 'devon_woodson_1774390416168';
export const DEFAULT_CODEX_ARCHIVE_CONSTRUCT_ID = 'zen-001';
export const DEFAULT_CODEX_ARCHIVE_THREAD_ID = 'zen-001_chat_with_zen-001';

const DEFAULT_CODEX_SESSIONS_ROOT = path.join(os.homedir(), '.codex', 'sessions');
const DEFAULT_CODEX_SESSION_INDEX_PATH = path.join(os.homedir(), '.codex', 'session_index.jsonl');
const DEFAULT_VVAULT_ROOT = '/Users/devonwoodson/Documents/GitHub/vvault';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function parseMetadataObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeFileStem(value, fallback) {
  const raw = normalizeString(value) || normalizeString(fallback) || 'codex-session';
  return raw
    .replace(/[/:\\\0-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 160) || 'codex-session';
}

function resolveArchiveRoot({ targetRoot, constructId = DEFAULT_CODEX_ARCHIVE_CONSTRUCT_ID } = {}) {
  if (targetRoot) {
    return path.resolve(targetRoot);
  }
  const vvaultRoot =
    process.env.CHATTY_CODEX_ARCHIVE_VVAULT_ROOT ||
    process.env.VVAULT_ROOT_PATH ||
    process.env.VVAULT_PATH ||
    DEFAULT_VVAULT_ROOT;
  return path.join(path.resolve(vvaultRoot), 'instances', constructId, 'codex');
}

async function readDirSafe(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function collectJsonlFiles(rootPath) {
  const files = [];

  async function walk(dirPath) {
    const entries = await readDirSafe(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !/\.jsonl$/i.test(entry.name)) {
        continue;
      }
      let stat = null;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        // Keep the walk resilient to files that rotate while syncing.
      }
      files.push({
        path: fullPath,
        mtimeMs: Number.isFinite(stat?.mtimeMs) ? stat.mtimeMs : 0,
        sizeBytes: Number.isFinite(stat?.size) ? stat.size : 0,
      });
    }
  }

  await walk(rootPath);
  return files.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) return right.mtimeMs - left.mtimeMs;
    return right.path.localeCompare(left.path);
  });
}

async function readCodexSessionIndex(sessionIndexPath = DEFAULT_CODEX_SESSION_INDEX_PATH) {
  const index = new Map();
  const raw = await fs.readFile(sessionIndexPath, 'utf8').catch(() => '');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const id = normalizeString(record?.id);
    if (!id) continue;
    const threadName = normalizeString(record?.thread_name);
    const updatedAt = normalizeString(record?.updated_at);
    if (!threadName) continue;
    const previous = index.get(id);
    const previousMs = Date.parse(previous?.updatedAt || '') || 0;
    const currentMs = Date.parse(updatedAt || '') || 0;
    if (!previous || currentMs >= previousMs) {
      index.set(id, { threadName, updatedAt });
    }
  }
  return index;
}

async function pruneGeneratedThreadFiles(archiveRoot) {
  const threadsDir = path.join(archiveRoot, 'threads');
  const resolvedThreadsDir = path.resolve(threadsDir);
  const resolvedArchiveRoot = path.resolve(archiveRoot);
  if (!resolvedThreadsDir.startsWith(`${resolvedArchiveRoot}${path.sep}`)) {
    throw new Error('Refusing to prune Codex archive outside the archive root.');
  }
  const entries = await readDirSafe(threadsDir);
  await Promise.all(entries
    .filter((entry) => entry.isFile() && /\.(?:json|md)$/i.test(entry.name))
    .map((entry) => fs.unlink(path.join(threadsDir, entry.name)).catch(() => {})));
}

function buildTurnDigest({ sessionId, turn }) {
  return sha256(JSON.stringify({
    sessionId,
    role: turn.role,
    ts: turn.ts || null,
    sourceTurnIndex: turn.sourceTurnIndex,
    content: turn.content,
  }));
}

function normalizeArchiveTurn(turn, sessionId) {
  return {
    role: turn.role,
    content: turn.content,
    ts: turn.ts || null,
    sourceTurnIndex:
      typeof turn.sourceTurnIndex === 'number' ? turn.sourceTurnIndex : null,
    digest: buildTurnDigest({ sessionId, turn }),
  };
}

function formatThreadMarkdown(thread) {
  const title = thread.sourceThreadName || `Codex Session ${thread.sourceSessionId || thread.fileStem}`;
  const lines = [
    `# ${title}`,
    '',
    `- schemaVersion: ${thread.schemaVersion}`,
    `- sourceProduct: ${thread.sourceProduct}`,
    `- lifeUserId: ${thread.lifeUserId}`,
    `- constructId: ${thread.constructId}`,
    `- canonicalThreadId: ${thread.canonicalThreadId}`,
    `- sourceThreadName: ${thread.sourceThreadName || ''}`,
    `- sourceSessionId: ${thread.sourceSessionId || ''}`,
    `- sourceSessionPath: ${thread.sourceSessionPath}`,
    `- sourceCwd: ${thread.sourceCwd || ''}`,
    `- latestAssistantTimestamp: ${thread.latestAssistantTimestamp || ''}`,
    `- turnCount: ${thread.turnCount}`,
    `- digest: ${thread.digest}`,
    '',
    '---',
    '',
  ];

  for (const turn of thread.turns) {
    const label = turn.role === 'user' ? 'User' : 'Assistant';
    const timestamp = turn.ts ? ` (${turn.ts})` : '';
    lines.push(`## ${label}${timestamp}`, '', turn.content, '');
  }

  return `${lines.join('\n').trim()}\n`;
}

function buildVvaultThreadStoragePath({ constructId, thread }) {
  return `instances/${constructId}/codex/${thread.fileStem}.md`;
}

function buildVvaultThreadMetadata(thread) {
  return {
    folder: 'codex',
    sourceProduct: thread.sourceProduct,
    sourceThreadName: thread.sourceThreadName,
    sourceThreadNameUpdatedAt: thread.sourceThreadNameUpdatedAt,
    sourceSessionId: thread.sourceSessionId,
    sourceSessionPath: thread.sourceSessionPath,
    latestAssistantTimestamp: thread.latestAssistantTimestamp,
    latestMessageRole: thread.latestMessageRole,
    latestMessageTimestamp: thread.latestMessageTimestamp,
    latestMessageDigest: thread.latestMessageDigest,
    latestMessageSourceTurnIndex: thread.latestMessageSourceTurnIndex,
    digest: thread.digest,
    turnCount: thread.turnCount,
    lifeUserId: thread.lifeUserId,
    constructId: thread.constructId,
    canonicalThreadId: thread.canonicalThreadId,
    codexThreadArchiveSchemaVersion: thread.schemaVersion,
  };
}

async function publishThreadToVvault({
  thread,
  constructId,
  vvaultApiBaseUrl,
  vvaultServiceToken,
  fetchImpl = globalThis.fetch,
  requireReadback = false,
}) {
  const baseUrl = normalizeString(vvaultApiBaseUrl).replace(/\/$/, '');
  const serviceToken = normalizeString(vvaultServiceToken);
  if (!baseUrl || !serviceToken) {
    return {
      ok: false,
      skipped: true,
      reason: !baseUrl ? 'missing_vvault_api_base_url' : 'missing_vvault_service_token',
    };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, skipped: true, reason: 'fetch_unavailable' };
  }

  const storagePath = buildVvaultThreadStoragePath({ constructId, thread });
  const content = formatThreadMarkdown(thread);
  const expectedSha256 = sha256(content);
  const metadata = buildVvaultThreadMetadata(thread);
  const response = await fetchImpl(`${baseUrl}/api/vault/system-files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceToken}`,
      'X-Service-Token': serviceToken,
    },
    body: JSON.stringify({
      storage_path: storagePath,
      filename: storagePath,
      file_type: 'transcript',
      content,
      metadata,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false) {
    return {
      ok: false,
      skipped: false,
      status: response.status,
      storagePath,
      reason: payload?.error || response.statusText || 'vvault_upsert_failed',
    };
  }

  let readback = null;
  if (requireReadback) {
    readback = await readBackPublishedThreadFromVvault({
      thread,
      storagePath,
      content,
      expectedSha256,
      expectedMetadata: metadata,
      vvaultApiBaseUrl: baseUrl,
      vvaultServiceToken: serviceToken,
      fetchImpl,
    });
    if (!readback.ok) {
      return {
        ok: false,
        skipped: false,
        status: readback.status || response.status,
        storagePath,
        sha256: payload?.sha256 || null,
        readbackVerified: false,
        reason: readback.reason,
      };
    }
  }

  return {
    ok: true,
    skipped: false,
    status: response.status,
    action: payload?.action || null,
    storagePath,
    sha256: payload?.sha256 || expectedSha256,
    readbackVerified: requireReadback ? Boolean(readback?.ok) : false,
    readback: readback?.ok
      ? {
          storagePath: readback.storagePath,
          storageMode: readback.storageMode,
          content: readback.content,
          metadata: readback.metadata,
          sha256: readback.sha256,
          contentLength: readback.content.length,
        }
      : null,
  };
}

async function readBackPublishedThreadFromVvault({
  thread,
  storagePath,
  content,
  expectedSha256,
  expectedMetadata,
  vvaultApiBaseUrl,
  vvaultServiceToken,
  fetchImpl = globalThis.fetch,
}) {
  const params = new URLSearchParams({ storage_path: storagePath });
  const response = await fetchImpl(`${vvaultApiBaseUrl}/api/vault/system-files?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${vvaultServiceToken}`,
      'X-Service-Token': vvaultServiceToken,
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.error || response.statusText || 'vvault_readback_failed',
    };
  }

  const file = payload?.file || {};
  const metadata = parseMetadataObject(file.metadata);
  const storageMode = normalizeString(payload?.storage_mode || file.storage_mode || file.storageMode);
  if (storageMode !== 'vvault_body') {
    return { ok: false, status: response.status, reason: 'vvault_readback_storage_mode_unproven' };
  }
  const actualStoragePath = normalizeString(file.storage_path || file.storagePath || file.filename);
  if (actualStoragePath !== storagePath) {
    return { ok: false, status: response.status, reason: 'vvault_readback_storage_path_mismatch' };
  }
  if (String(file.content || '') !== content) {
    return { ok: false, status: response.status, reason: 'vvault_readback_content_mismatch' };
  }
  if (normalizeString(file.sha256) && normalizeString(file.sha256) !== expectedSha256) {
    return { ok: false, status: response.status, reason: 'vvault_readback_sha256_mismatch' };
  }
  if (metadata.digest !== expectedMetadata.digest) {
    return { ok: false, status: response.status, reason: 'vvault_readback_digest_mismatch' };
  }
  if (metadata.sourceSessionId !== thread.sourceSessionId) {
    return { ok: false, status: response.status, reason: 'vvault_readback_source_session_mismatch' };
  }

  return {
    ok: true,
    status: response.status,
    storagePath,
    storageMode,
    content: String(file.content || ''),
    metadata,
    sha256: normalizeString(file.sha256) || expectedSha256,
  };
}

function buildThreadArchive({
  parsed,
  sourceFile,
  scrapedAt,
  lifeUserId,
  constructId,
  canonicalThreadId,
  sessionIndexEntry = null,
}) {
  const sessionId =
    normalizeString(parsed.parseReport?.sessionId) ||
    path.basename(sourceFile.path, '.jsonl').replace(/^rollout-/, '');
  const turns = (parsed.conversationTurns || []).map((turn) =>
    normalizeArchiveTurn(turn, sessionId),
  );
  const latestAssistant = [...turns].reverse().find((turn) => turn.role === 'assistant') || null;
  const latestMessage = turns.at(-1) || null;
  const sourceThreadName = sessionIndexEntry?.threadName || null;
  const baseFileStem = safeFileStem(sourceThreadName || sessionId, path.basename(sourceFile.path, '.jsonl'));
  const digest = sha256(JSON.stringify({
    sourceSessionId: sessionId,
    sourceSessionPath: sourceFile.path,
    turns: turns.map((turn) => turn.digest),
  }));

  return {
    schemaVersion: CODEX_THREAD_ARCHIVE_SCHEMA_VERSION,
    sourceProduct: 'codex',
    lifeUserId,
    constructId,
    canonicalThreadId,
    scrapedAt,
    sourceSessionId: sessionId,
    sourceThreadName,
    sourceThreadNameUpdatedAt: sessionIndexEntry?.updatedAt || null,
    sourceSessionPath: sourceFile.path,
    sourceCwd: parsed.parseReport?.cwd || null,
    latestAssistantTimestamp:
      parsed.parseReport?.latestAssistantTimestamp || latestAssistant?.ts || null,
    latestMessageRole: latestMessage?.role || null,
    latestMessageTimestamp: latestMessage?.ts || null,
    latestMessageDigest: latestMessage?.digest || null,
    latestMessageSourceTurnIndex: latestMessage?.sourceTurnIndex ?? null,
    sourceFileMtimeMs: sourceFile.mtimeMs,
    sourceFileSizeBytes: sourceFile.sizeBytes,
    isSubagentSession: Boolean(parsed.parseReport?.isSubagentSession),
    turnCount: turns.length,
    digest,
    fileStem: baseFileStem,
    baseFileStem,
    turns,
  };
}

async function writeThreadArchive({ archiveRoot, thread }) {
  const threadsDir = path.join(archiveRoot, 'threads');
  await fs.mkdir(threadsDir, { recursive: true });

  const jsonPath = path.join(threadsDir, `${thread.fileStem}.json`);
  const markdownPath = path.join(threadsDir, `${thread.fileStem}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(thread, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, formatThreadMarkdown(thread), 'utf8');
  return { jsonPath, markdownPath };
}

export async function syncCodexThreadsArchive({
  codexSessionsRoot = process.env.CODEX_SESSIONS_ROOT || DEFAULT_CODEX_SESSIONS_ROOT,
  sessionIndexPath = process.env.CODEX_SESSION_INDEX_PATH || DEFAULT_CODEX_SESSION_INDEX_PATH,
  targetRoot,
  lifeUserId = process.env.VVAULT_USER_ID || DEFAULT_CODEX_ARCHIVE_LIFE_USER_ID,
  constructId = DEFAULT_CODEX_ARCHIVE_CONSTRUCT_ID,
  canonicalThreadId = DEFAULT_CODEX_ARCHIVE_THREAD_ID,
  includeSubagents = false,
  maxFiles = Number.POSITIVE_INFINITY,
  pruneExisting = true,
  publishToVvault = false,
  requireVvaultReadback = false,
  failOnVvaultPublishFailure = false,
  writeLocalArchive = true,
  vvaultApiBaseUrl = process.env.VVAULT_API_BASE_URL || process.env.VVAULT_URL || process.env.VVAULT_BASE_URL,
  vvaultServiceToken = process.env.VVAULT_SERVICE_TOKEN,
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
} = {}) {
  const archiveRoot = writeLocalArchive ? resolveArchiveRoot({ targetRoot, constructId }) : null;
  if (publishToVvault && failOnVvaultPublishFailure) {
    const baseUrl = normalizeString(vvaultApiBaseUrl);
    const serviceToken = normalizeString(vvaultServiceToken);
    if (!baseUrl || !serviceToken || typeof fetchImpl !== 'function') {
      const reason = !baseUrl
        ? 'missing_vvault_api_base_url'
        : !serviceToken
          ? 'missing_vvault_service_token'
          : 'fetch_unavailable';
      const error = new Error(`Codex thread VVAULT sync unavailable: ${reason}`);
      error.code = 'CODEX_THREAD_VVAULT_SYNC_FAILED';
      error.syncFailure = { ok: false, skipped: true, reason };
      throw error;
    }
  }
  const sessionIndex = await readCodexSessionIndex(sessionIndexPath);
  const sourceFiles = await collectJsonlFiles(codexSessionsRoot);
  const selectedFiles = Number.isFinite(maxFiles)
    ? sourceFiles.slice(0, Math.max(0, Math.floor(maxFiles)))
    : sourceFiles;
  const threads = [];
  const skipped = [];
  const vvaultPublishes = [];
  const fileStemCounts = new Map();

  if (writeLocalArchive && pruneExisting) {
    await pruneGeneratedThreadFiles(archiveRoot);
  }

  for (const sourceFile of selectedFiles) {
    let parsed;
    try {
      parsed = await parseCodexRolloutJsonlFile(sourceFile.path, {
        requireTerminalPair: false,
      });
    } catch (error) {
      skipped.push({
        path: sourceFile.path,
        reason: 'parse_failed',
        message: error?.message || String(error),
      });
      continue;
    }

    if (parsed.parseReport?.isSubagentSession && !includeSubagents) {
      skipped.push({ path: sourceFile.path, reason: 'subagent_session' });
      continue;
    }
    if (!Array.isArray(parsed.conversationTurns) || parsed.conversationTurns.length === 0) {
      skipped.push({ path: sourceFile.path, reason: 'no_normalized_turns' });
      continue;
    }

    const thread = buildThreadArchive({
      parsed,
      sourceFile,
      scrapedAt: now,
      lifeUserId,
      constructId,
      canonicalThreadId,
      sessionIndexEntry: sessionIndex.get(parsed.parseReport?.sessionId || '') || null,
    });
    const collisionCount = fileStemCounts.get(thread.baseFileStem) || 0;
    fileStemCounts.set(thread.baseFileStem, collisionCount + 1);
    thread.fileStem = collisionCount === 0
      ? thread.baseFileStem
      : `${thread.baseFileStem} - ${thread.sourceSessionId.slice(0, 8)}`;
    const paths = writeLocalArchive
      ? await writeThreadArchive({ archiveRoot, thread })
      : { jsonPath: null, markdownPath: null };
    let vvaultPublish = null;
    if (publishToVvault) {
      vvaultPublish = await publishThreadToVvault({
        thread,
        constructId,
        vvaultApiBaseUrl,
        vvaultServiceToken,
        fetchImpl,
        requireReadback: requireVvaultReadback,
      });
      vvaultPublishes.push({
        sourceSessionId: thread.sourceSessionId,
        sourceThreadName: thread.sourceThreadName,
        fileStem: thread.fileStem,
        ...vvaultPublish,
        readback: vvaultPublish?.readback
          ? {
              storagePath: vvaultPublish.readback.storagePath,
              storageMode: vvaultPublish.readback.storageMode,
              sha256: vvaultPublish.readback.sha256,
              contentLength: vvaultPublish.readback.contentLength,
              metadata: vvaultPublish.readback.metadata,
            }
          : null,
      });
      if (!vvaultPublish.ok && failOnVvaultPublishFailure) {
        const error = new Error(`Codex thread VVAULT sync failed for ${thread.fileStem}: ${vvaultPublish.reason || 'unknown_failure'}`);
        error.code = 'CODEX_THREAD_VVAULT_SYNC_FAILED';
        error.syncFailure = vvaultPublish;
        throw error;
      }
    }
    threads.push({
      ...thread,
      jsonPath: paths.jsonPath,
      markdownPath: paths.markdownPath,
      vvaultStoragePath: vvaultPublish?.storagePath || null,
      vvaultPublished: Boolean(vvaultPublish?.ok),
      vvaultReadback: vvaultPublish?.readback || null,
      turns: undefined,
    });
  }

  if (publishToVvault && failOnVvaultPublishFailure && vvaultPublishes.length === 0) {
    const error = new Error('Codex thread VVAULT sync failed: no_codex_threads_published');
    error.code = 'CODEX_THREAD_VVAULT_SYNC_FAILED';
    error.syncFailure = { ok: false, skipped: false, reason: 'no_codex_threads_published' };
    throw error;
  }

  const latestThread = threads.reduce((latest, thread) => {
    const latestMs =
      Date.parse(latest?.latestMessageTimestamp || '') ||
      latest?.sourceFileMtimeMs ||
      0;
    const threadMs =
      Date.parse(thread.latestMessageTimestamp || '') ||
      thread.sourceFileMtimeMs ||
      0;
    return threadMs > latestMs ? thread : latest;
  }, null);

  const index = {
    schemaVersion: CODEX_THREAD_ARCHIVE_SCHEMA_VERSION,
    sourceProduct: 'codex',
    lifeUserId,
    constructId,
    canonicalThreadId,
    codexSessionsRoot: path.resolve(codexSessionsRoot),
    codexSessionIndexPath: path.resolve(sessionIndexPath),
    archiveRoot,
    scrapedAt: now,
    scannedFiles: selectedFiles.length,
    archivedThreads: threads.length,
    skippedThreads: skipped.length,
    threadNamesResolved: threads.filter((thread) => thread.sourceThreadName).length,
    vvaultPublishRequested: Boolean(publishToVvault),
    vvaultPublishedThreads: vvaultPublishes.filter((item) => item.ok).length,
    vvaultReadbackVerifiedThreads: vvaultPublishes.filter((item) => item.ok && item.readbackVerified).length,
    vvaultPublishSkippedThreads: vvaultPublishes.filter((item) => item.skipped).length,
    vvaultPublishFailedThreads: vvaultPublishes.filter((item) => !item.ok && !item.skipped).length,
    includeSubagents,
    latest: latestThread
      ? {
          sourceSessionId: latestThread.sourceSessionId,
          sourceSessionPath: latestThread.sourceSessionPath,
          sourceThreadName: latestThread.sourceThreadName,
          vvaultStoragePath: latestThread.vvaultStoragePath,
          vvaultReadback: latestThread.vvaultReadback,
          latestAssistantTimestamp: latestThread.latestAssistantTimestamp,
          latestMessageRole: latestThread.latestMessageRole,
          latestMessageTimestamp: latestThread.latestMessageTimestamp,
          latestMessageDigest: latestThread.latestMessageDigest,
          latestMessageSourceTurnIndex: latestThread.latestMessageSourceTurnIndex,
          jsonPath: latestThread.jsonPath,
          markdownPath: latestThread.markdownPath,
          digest: latestThread.digest,
        }
      : null,
    threads,
    skipped,
    vvaultPublishes,
  };

  let indexPath = null;
  let latestPath = null;
  if (writeLocalArchive) {
    await fs.mkdir(archiveRoot, { recursive: true });
    indexPath = path.join(archiveRoot, 'index.json');
    latestPath = path.join(archiveRoot, 'latest.json');
    await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    await fs.writeFile(
      latestPath,
      `${JSON.stringify(index.latest ? threads.find((thread) => thread.digest === index.latest.digest) : null, null, 2)}\n`,
      'utf8',
    );
  }

  return {
    ok: true,
    archiveRoot,
    indexPath,
    latestPath,
    scannedFiles: index.scannedFiles,
    archivedThreads: index.archivedThreads,
    skippedThreads: index.skippedThreads,
    threadNamesResolved: index.threadNamesResolved,
    vvaultPublishRequested: index.vvaultPublishRequested,
    vvaultPublishedThreads: index.vvaultPublishedThreads,
    vvaultReadbackVerifiedThreads: index.vvaultReadbackVerifiedThreads,
    vvaultPublishSkippedThreads: index.vvaultPublishSkippedThreads,
    vvaultPublishFailedThreads: index.vvaultPublishFailedThreads,
    latest: index.latest,
  };
}
