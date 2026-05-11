#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalizeConstructId } from '../lib/constructId.js';
import {
  getHistoricalMemorySources,
  isCanonicalChattyThreadFile,
  usesCanonicalChattyHistory,
} from '../lib/constructMemoryPolicy.js';
import { normalizeTranscriptSource } from '../lib/transcriptSource.js';
import { buildSourceDiscoveryReport } from './sourceDiscoveryDryRun.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_ICLOUD_VAULT_ROOT = '/Users/devonwoodson/Library/Mobile Documents/com~apple~CloudDocs/Vault';
const DEFAULT_VVAULT_ROOT = '/Users/devonwoodson/Documents/GitHub/vvault';
const DEFAULT_SQLITE_PATH = path.join(REPO_ROOT, 'chatty.db');
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.json', '.log', '.csv', '.html', '.htm', '.xml', '.yaml', '.yml']);
const EXCLUDED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.capsule', '.zip', '.mp3', '.wav', '.mp4', '.mov']);
const BACKUP_SURFACES = new Set(['icloud', 'sqlite', 'vvault_local']);

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function parseMaybeJson(value) {
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

function sha256(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function extnameForPath(value) {
  return path.posix.extname(normalizePath(value).split('?')[0]).toLowerCase();
}

function isTextLikePath(value) {
  const ext = extnameForPath(value);
  if (EXCLUDED_EXTENSIONS.has(ext)) return false;
  return TEXT_EXTENSIONS.has(ext);
}

function safeSegment(value) {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 120);
  return cleaned || 'source';
}

function safeRelativePath(value) {
  const parts = normalizePath(value)
    .split('/')
    .filter(Boolean)
    .filter((part) => part !== '.' && part !== '..')
    .map(safeSegment)
    .filter(Boolean);
  return parts.length > 0 ? parts.join('/') : 'source.md';
}

function relativeSourcePath(candidate, constructId, source) {
  const normalized = normalizePath(candidate.path || candidate.filename || candidate.storagePath || candidate.storage_path || '');
  const rootMarkers = [
    `instances/${constructId}/${source}/`,
    `/${constructId}/${source}/`,
  ];

  for (const marker of rootMarkers) {
    const idx = normalized.indexOf(marker);
    if (idx >= 0) {
      return normalized.slice(idx + marker.length);
    }
  }

  const historyMarker = `/${constructId}/.history/${source}/`;
  const historyIdx = normalized.indexOf(historyMarker);
  if (historyIdx >= 0) {
    return `history/${normalized.slice(historyIdx + historyMarker.length)}`;
  }

  return path.posix.basename(normalized) || `${candidate.surface || 'backup'}-${candidate.rowId || 'source'}.md`;
}

function canonicalFilenameForCandidate(candidate, { constructId, source, sourceSha256 }) {
  const relative = safeRelativePath(relativeSourcePath(candidate, constructId, source));
  const ext = path.posix.extname(relative) || '.md';
  const withoutExt = ext ? relative.slice(0, -ext.length) : relative;
  const filename = `${withoutExt}-${sourceSha256.slice(0, 12)}${ext || '.md'}`;
  return `instances/${constructId}/${source}/${filename}`;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqliteJson(sqlitePath, sql) {
  const output = execFileSync('sqlite3', ['-readonly', '-json', sqlitePath, sql], {
    encoding: 'utf8',
    maxBuffer: 150 * 1024 * 1024,
  });
  if (!output.trim()) return [];
  return JSON.parse(output);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectSqliteContentMap({ sqlitePath, targetLifeId, legacyLifeAliases, constructId }) {
  if (!(await exists(sqlitePath))) return new Map();

  const ownerIds = unique([targetLifeId, ...legacyLifeAliases]);
  if (ownerIds.length === 0) return new Map();

  const ownerList = ownerIds.map(sqlLiteral).join(',');
  const constructLiteral = sqlLiteral(constructId);
  const rows = [];

  for (const spec of [
    { table: 'gpt_files', parentTable: 'gpts', fk: 'gpt_id' },
    { table: 'ai_files', parentTable: 'ais', fk: 'ai_id' },
  ]) {
    try {
      rows.push(...sqliteJson(sqlitePath, `
        SELECT
          ${sqlLiteral(spec.table)} AS table_name,
          parent.user_id,
          parent.construct_callsign,
          files.id AS file_id,
          files.filename,
          files.original_name,
          files.mime_type,
          files.metadata,
          coalesce(files.extracted_text, files.content, '') AS source_content
        FROM ${spec.parentTable} parent
        JOIN ${spec.table} files ON files.${spec.fk} = parent.id
        WHERE parent.user_id IN (${ownerList})
          AND parent.construct_callsign = ${constructLiteral}
          AND coalesce(files.is_active, 1) = 1
      `));
    } catch {
      // Some local databases may not have both legacy tables. Keep the manifest read-only and best-effort.
    }
  }

  const map = new Map();
  for (const row of rows) {
    const keys = unique([
      row.file_id,
      `${row.table_name}:${row.file_id}`,
      row.original_name,
      row.filename,
    ]);
    for (const key of keys) {
      map.set(String(key), row);
    }
  }
  return map;
}

async function readBackupContent(candidate, sqliteContentMap) {
  if (candidate.surface === 'sqlite') {
    const row = sqliteContentMap.get(String(candidate.rowId)) || sqliteContentMap.get(`${candidate.tableName}:${candidate.rowId}`);
    if (!row) return { content: '', error: 'sqlite_content_unavailable' };
    const content = String(row.source_content || '');
    if (!content.trim()) return { content: '', error: 'missing_content' };
    return {
      content,
      originalName: row.original_name || row.filename || candidate.path,
      metadata: parseMaybeJson(row.metadata),
    };
  }

  const sourcePath = candidate.path || candidate.filename || '';
  if (!isTextLikePath(sourcePath)) {
    return { content: '', error: 'unsupported_or_binary_extension' };
  }

  try {
    const stat = await fs.stat(sourcePath);
    if (stat.size > MAX_SOURCE_BYTES) {
      return { content: '', error: 'source_too_large' };
    }
    const content = await fs.readFile(sourcePath, 'utf8');
    if (!content.trim()) return { content: '', error: 'missing_content' };
    return { content };
  } catch (error) {
    return { content: '', error: `read_failed:${error.message}` };
  }
}

function duplicateStatusFor({ canonicalFilename, sourceSha256 }, existingSupabaseRows, supabaseAvailable) {
  if (!supabaseAvailable) return 'unknown_supabase_unavailable';
  const byFilename = existingSupabaseRows.find((row) => normalizePath(row.path || row.storagePath) === canonicalFilename);
  if (byFilename) return 'duplicate_filename';
  const byHash = existingSupabaseRows.find((row) => row.sourceSha256 && row.sourceSha256 === sourceSha256);
  if (byHash) return 'duplicate_hash';
  return 'none';
}

export function planRecoveryManifestEntry({
  candidate,
  content,
  contentError = null,
  existingSupabaseRows = [],
  supabaseAvailable = false,
  options,
  generatedAt = new Date().toISOString(),
}) {
  const constructId = canonicalizeConstructId(options.constructId || 'nova-001');
  const expectedSources = getHistoricalMemorySources(constructId);
  const requestedSource = normalizeTranscriptSource(options.source || expectedSources[0], { fallback: expectedSources[0] || 'chatgpt' });
  const candidatePath = normalizePath(candidate.path || candidate.filename || candidate.storagePath || '');
  const candidateSource = normalizeTranscriptSource(candidate.source, { fallback: '' });
  const rejectionReasons = [];

  if (!BACKUP_SURFACES.has(candidate.surface)) rejectionReasons.push('not_backup_source');
  if (!candidate.backupVisible) rejectionReasons.push('not_backup_visible');
  if (!candidateSource) rejectionReasons.push('missing_source');
  if (candidateSource && candidateSource !== requestedSource) rejectionReasons.push('source_policy_mismatch');
  if (!expectedSources.includes(requestedSource)) rejectionReasons.push('requested_source_not_allowed_for_construct');
  if (isCanonicalChattyThreadFile(candidatePath, constructId) && !usesCanonicalChattyHistory(constructId)) {
    rejectionReasons.push('canonical_chatty_disabled_for_construct');
  }
  if (candidate.surface !== 'sqlite' && !isTextLikePath(candidatePath)) {
    rejectionReasons.push('unsupported_or_binary_extension');
  }
  if (contentError) rejectionReasons.push(contentError);
  if (!content || !String(content).trim()) rejectionReasons.push('missing_content');

  const sourceSha256 = content ? sha256(content) : null;
  const canonicalFilename = sourceSha256
    ? canonicalFilenameForCandidate(candidate, { constructId, source: requestedSource, sourceSha256 })
    : null;
  const duplicateStatus = canonicalFilename && sourceSha256
    ? duplicateStatusFor({ canonicalFilename, sourceSha256 }, existingSupabaseRows, supabaseAvailable)
    : (supabaseAvailable ? 'not_checked' : 'unknown_supabase_unavailable');

  if (duplicateStatus !== 'none' && duplicateStatus !== 'unknown_supabase_unavailable' && duplicateStatus !== 'not_checked') {
    rejectionReasons.push(duplicateStatus);
  }

  const planned = rejectionReasons.length === 0;
  const plannedRow = planned ? {
    user_id: options.supabaseUserId || null,
    construct_id: constructId,
    filename: canonicalFilename,
    storage_path: null,
    file_type: 'transcript',
    metadata: {
      source: requestedSource,
      recoveryKind: 'supabase-first-source-recovery',
      recoveryRunId: options.recoveryRunId || null,
      bridgeSource: candidate.surface,
      originalPath: candidatePath,
      originalOwner: candidate.owner || null,
      originalRowId: candidate.rowId || null,
      sourceSha256,
      targetLifeId: options.targetLifeId || null,
      legacyLifeAliases: options.legacyLifeAliases || [],
      plannedAt: generatedAt,
    },
  } : null;

  return {
    candidate: {
      surface: candidate.surface,
      source: candidateSource || null,
      owner: candidate.owner || null,
      rowId: candidate.rowId || null,
      path: candidatePath,
    },
    planned,
    rejectionReasons: unique(rejectionReasons),
    duplicateStatus,
    canonicalFilename,
    sourceSha256,
    contentLength: content ? String(content).length : 0,
    plannedRow,
  };
}

export function summarizeManifestEntries(entries, report) {
  const planned = entries.filter((entry) => entry.planned);
  const rejected = entries.filter((entry) => !entry.planned);
  const supabaseAvailable = report.surfaceStatus?.supabase?.available === true;
  const currentSupabaseFinalPromptReachable = report.sources.filter((row) =>
    row.surface === 'supabase'
    && row.finalPromptReachable
    && row.promptLoader?.includes('verifiedMemoryLoader')
  );

  return {
    candidateCount: entries.length,
    rejectedCount: rejected.length,
    plannedCanonicalRowCount: planned.length,
    topPlannedCanonicalFilenames: planned.slice(0, 3).map((entry) => entry.canonicalFilename),
    currentSupabaseFinalPromptReachableCount: currentSupabaseFinalPromptReachable.length,
    currentSupabaseFinalPromptReachable: supabaseAvailable
      ? currentSupabaseFinalPromptReachable.length > 0
      : null,
    currentSupabaseReachabilityStatus: supabaseAvailable
      ? (currentSupabaseFinalPromptReachable.length > 0 ? 'yes' : 'no')
      : 'unknown_supabase_unavailable',
  };
}

export function parseManifestArgs(argv = process.argv.slice(2)) {
  const options = {
    email: null,
    targetLifeId: null,
    legacyLifeAliases: [],
    constructId: 'nova-001',
    source: null,
    json: false,
    out: null,
    icloudVaultRoot: DEFAULT_ICLOUD_VAULT_ROOT,
    vvaultRoot: DEFAULT_VVAULT_ROOT,
    sqlitePath: DEFAULT_SQLITE_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
      i += 1;
      return argv[i];
    };

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--email' || arg.startsWith('--email=')) {
      options.email = readValue();
    } else if (arg === '--target-life-id' || arg.startsWith('--target-life-id=')) {
      options.targetLifeId = readValue();
    } else if (arg === '--legacy-life-alias' || arg.startsWith('--legacy-life-alias=')) {
      options.legacyLifeAliases.push(readValue());
    } else if (arg === '--construct-id' || arg.startsWith('--construct-id=')) {
      options.constructId = readValue();
    } else if (arg === '--source' || arg.startsWith('--source=')) {
      options.source = readValue();
    } else if (arg === '--out' || arg.startsWith('--out=')) {
      options.out = readValue();
    } else if (arg === '--icloud-vault-root' || arg.startsWith('--icloud-vault-root=')) {
      options.icloudVaultRoot = readValue();
    } else if (arg === '--vvault-root' || arg.startsWith('--vvault-root=')) {
      options.vvaultRoot = readValue();
    } else if (arg === '--sqlite-path' || arg.startsWith('--sqlite-path=')) {
      options.sqlitePath = readValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.constructId = canonicalizeConstructId(options.constructId || 'nova-001');
  options.legacyLifeAliases = unique(options.legacyLifeAliases);
  options.source = normalizeTranscriptSource(options.source || getHistoricalMemorySources(options.constructId)[0], { fallback: 'chatgpt' });

  if (!options.email) throw new Error('Missing required --email');
  if (!options.targetLifeId) throw new Error('Missing required --target-life-id');
  if (!options.constructId) throw new Error('Missing required --construct-id');

  return options;
}

export async function buildRecoveryManifest(inputOptions) {
  const options = {
    ...inputOptions,
    constructId: canonicalizeConstructId(inputOptions.constructId || 'nova-001'),
    legacyLifeAliases: unique(inputOptions.legacyLifeAliases || []),
  };
  options.source = normalizeTranscriptSource(options.source || getHistoricalMemorySources(options.constructId)[0], { fallback: 'chatgpt' });

  const generatedAt = new Date().toISOString();
  const recoveryRunId = `source-recovery-${options.constructId}-${generatedAt.replace(/[^0-9TZ]/g, '')}`;
  const report = await buildSourceDiscoveryReport(options);
  const supabaseUserId = report.identity.supabase.supabaseUserId || null;
  const sqliteContentMap = await collectSqliteContentMap(options);
  const existingSupabaseRows = report.sources.filter((row) => row.surface === 'supabase');
  const supabaseAvailable = !!report.surfaceStatus.supabase.available;

  const entries = [];
  const backupCandidates = report.sources.filter((row) => row.backupVisible);
  for (const candidate of backupCandidates) {
    let contentResult = { content: '', error: null };
    const cheapSource = normalizeTranscriptSource(candidate.source, { fallback: '' });
    const cheapPath = normalizePath(candidate.path || candidate.filename || '');
    const shouldRead =
      cheapSource === options.source
      && !isCanonicalChattyThreadFile(cheapPath, options.constructId)
      && (candidate.surface === 'sqlite' || isTextLikePath(cheapPath));

    if (shouldRead) {
      contentResult = await readBackupContent(candidate, sqliteContentMap);
    } else if (cheapSource !== options.source) {
      contentResult = { content: '', error: null };
    } else if (candidate.surface !== 'sqlite' && !isTextLikePath(cheapPath)) {
      contentResult = { content: '', error: 'unsupported_or_binary_extension' };
    }

    entries.push(planRecoveryManifestEntry({
      candidate,
      content: contentResult.content,
      contentError: contentResult.error,
      existingSupabaseRows,
      supabaseAvailable,
      generatedAt,
      options: {
        ...options,
        supabaseUserId,
        recoveryRunId,
      },
    }));
  }

  const summary = summarizeManifestEntries(entries, report);
  return {
    generatedAt,
    recoveryRunId,
    mode: 'read_only_manifest',
    inputs: {
      email: options.email,
      targetLifeId: options.targetLifeId,
      legacyLifeAliases: options.legacyLifeAliases,
      constructId: options.constructId,
      source: options.source,
      icloudVaultRoot: options.icloudVaultRoot,
      vvaultRoot: options.vvaultRoot,
      sqlitePath: options.sqlitePath,
    },
    identity: {
      supabaseUserId,
      supabaseAvailable,
      supabaseError: report.surfaceStatus.supabase.error || null,
    },
    summary,
    plannedCanonicalRows: entries.filter((entry) => entry.planned).map((entry) => ({
      canonicalFilename: entry.canonicalFilename,
      sourceSha256: entry.sourceSha256,
      contentLength: entry.contentLength,
      duplicateStatus: entry.duplicateStatus,
      plannedRow: entry.plannedRow,
      source: entry.candidate,
    })),
    rejected: entries.filter((entry) => !entry.planned).map((entry) => ({
      source: entry.candidate,
      rejectionReasons: entry.rejectionReasons,
      duplicateStatus: entry.duplicateStatus,
      canonicalFilename: entry.canonicalFilename,
      sourceSha256: entry.sourceSha256,
      contentLength: entry.contentLength,
    })),
  };
}

function formatHumanManifest(manifest) {
  const lines = [];
  lines.push('Source Recovery Manifest');
  lines.push('========================');
  lines.push(`Generated: ${manifest.generatedAt}`);
  lines.push(`Mode: ${manifest.mode}`);
  lines.push(`Construct: ${manifest.inputs.constructId}`);
  lines.push(`Source: ${manifest.inputs.source}`);
  lines.push(`Email: ${manifest.inputs.email}`);
  lines.push(`Target LIFE id: ${manifest.inputs.targetLifeId}`);
  lines.push(`Legacy aliases: ${manifest.inputs.legacyLifeAliases.join(', ') || '(none)'}`);
  lines.push(`Supabase user id: ${manifest.identity.supabaseUserId || '(unresolved)'}`);
  lines.push('');
  lines.push(`Candidate count: ${manifest.summary.candidateCount}`);
  lines.push(`Rejected count: ${manifest.summary.rejectedCount}`);
  lines.push(`Planned canonical row count: ${manifest.summary.plannedCanonicalRowCount}`);
  lines.push(`Current Supabase row already final-prompt-reachable: ${manifest.summary.currentSupabaseReachabilityStatus} (${manifest.summary.currentSupabaseFinalPromptReachableCount})`);
  lines.push('');
  lines.push('Top planned canonical filenames');
  lines.push('-------------------------------');
  if (manifest.summary.topPlannedCanonicalFilenames.length === 0) {
    lines.push('(none)');
  } else {
    for (const filename of manifest.summary.topPlannedCanonicalFilenames) {
      lines.push(`- ${filename}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const options = parseManifestArgs();
  const manifest = await buildRecoveryManifest(options);

  if (options.out) {
    await fs.writeFile(options.out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  console.log(formatHumanManifest(manifest));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(`FAIL source-recovery-manifest - ${error.message}`);
    process.exit(1);
  });
}
