#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { canonicalizeConstructId } from '../lib/constructId.js';
import {
  getHistoricalMemorySources,
  getTranscriptSourceForFile,
  isCanonicalChattyThreadFile,
  matchesHistoricalSourcePolicy,
  usesCanonicalChattyHistory,
} from '../lib/constructMemoryPolicy.js';
import {
  canonicalSourceFolderList,
  extractSourceFromTranscriptPath,
  normalizeTranscriptSource,
} from '../lib/transcriptSource.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_ICLOUD_VAULT_ROOT = '/Users/devonwoodson/Library/Mobile Documents/com~apple~CloudDocs/Vault';
const DEFAULT_VVAULT_ROOT = '/Users/devonwoodson/Documents/GitHub/vvault';
const DEFAULT_SQLITE_PATH = path.join(REPO_ROOT, 'chatty.db');
const KNOWLEDGE_TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml', '.log', '.rtf', '.html', '.pdf']);
const VERIFIED_EXCLUDED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.gif', '.webp', '.capsule']);
const CANONICAL_SOURCE_SET = new Set(canonicalSourceFolderList().map((source) => normalizeTranscriptSource(source, { fallback: '' })));
const LEGACY_SOURCE_HINTS = ['character_ai'];
const SCAN_FOLDERS = ['chatgpt', 'documents', 'assets', 'chatty', 'character.ai', '.history/chatgpt'];
const SUPABASE_SELECT_TIMEOUT_MS = Number(process.env.SOURCE_DISCOVERY_SUPABASE_TIMEOUT_MS || 2500);
let envLoaded = false;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function truncate(value, max = 84) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadEnvFilesOptional() {
  if (envLoaded) return;
  envLoaded = true;
  for (const envPath of [path.join(REPO_ROOT, '.env'), path.join(REPO_ROOT, 'server', '.env')]) {
    let raw = '';
    try {
      raw = await fs.readFile(envPath, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    email: null,
    targetLifeId: null,
    legacyLifeAliases: [],
    constructId: 'nova-001',
    json: false,
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

  if (!options.email) throw new Error('Missing required --email');
  if (!options.targetLifeId) throw new Error('Missing required --target-life-id');
  if (!options.constructId) throw new Error('Missing required --construct-id');

  return options;
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

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function getContentLength(row) {
  if (Number.isFinite(row?.contentLength)) return Number(row.contentLength);
  if (Number.isFinite(row?.content_length)) return Number(row.content_length);
  const content = row?.content ?? row?.extracted_text ?? row?.extractedText ?? '';
  return typeof content === 'string' ? content.length : 0;
}

function hasUsableContent(row) {
  return getContentLength(row) > 0;
}

function extnameForPath(value) {
  return path.extname(String(value || '').split('?')[0]).toLowerCase();
}

function isBinaryPlaceholder(row) {
  return typeof row?.content === 'string' && row.content.startsWith('[binary:');
}

function looksLikeVerifiedTranscriptCandidate(file, constructId) {
  const filename = String(file?.filename || '');
  if (!filename) return false;
  const lowerName = filename.toLowerCase();

  if (file?.file_type === 'transcript') return true;

  const metadataSource = normalizeTranscriptSource(file?.metadata?.source, { fallback: '' });
  if (metadataSource && CANONICAL_SOURCE_SET.has(metadataSource)) return true;

  const extractedSource = normalizeTranscriptSource(extractSourceFromTranscriptPath(filename, constructId), { fallback: '' });
  if (extractedSource && CANONICAL_SOURCE_SET.has(extractedSource)) return true;

  if (LEGACY_SOURCE_HINTS.some((hint) => lowerName.includes(hint))) return true;

  if (lowerName.includes('/documents/')) {
    return lowerName.includes('/transcript')
      || lowerName.includes('/chatgpt')
      || lowerName.includes('/character.ai')
      || lowerName.includes('/character_ai');
  }

  return lowerName.includes('chatgpt')
    || lowerName.includes('character.ai')
    || lowerName.includes('character_ai')
    || lowerName.includes('transcript')
    || lowerName.includes('continuity')
    || lowerName.includes('chat.log');
}

function isVerifiedExcludedFile(row) {
  const filename = String(row?.filename || '');
  const lowerName = filename.toLowerCase();
  const ext = extnameForPath(lowerName);
  if (VERIFIED_EXCLUDED_EXTENSIONS.has(ext)) return true;
  if (filename === '.DS_Store') return true;
  if (filename === 'chat.log' && getContentLength(row) < 100) return true;
  return false;
}

function isRootKnowledgePath(filename, constructId) {
  const normalized = normalizePath(filename);
  return normalized.startsWith(`instances/${constructId}/documents/`)
    || normalized.startsWith(`instances/${constructId}/assets/`);
}

function isUserPrefixedConstructPath(filename, constructId) {
  const normalized = normalizePath(filename);
  return normalized.includes(`/instances/${constructId}/`) && !normalized.startsWith(`instances/${constructId}/`);
}

function isBackupSurface(surface) {
  return surface === 'icloud' || surface === 'sqlite' || surface === 'vvault_local';
}

function isSupabaseCanonicalEntry(entry, { filename, storagePath, constructId }) {
  if (entry?.surface !== 'supabase') return false;
  if (entry.construct_id !== constructId) return false;

  const rootPrefix = `instances/${constructId}/`;
  const filenameCanonical = filename.startsWith(rootPrefix) && !isUserPrefixedConstructPath(filename, constructId);
  const storageCanonical = storagePath.startsWith(rootPrefix) && !isUserPrefixedConstructPath(storagePath, constructId);
  return filenameCanonical || storageCanonical;
}

function extractMetadataHash(metadata) {
  return metadata?.sourceSha256
    || metadata?.source_sha256
    || metadata?.contentSha256
    || metadata?.content_sha256
    || metadata?.sha256
    || null;
}

function isKnowledgeTextRow(row) {
  const ext = extnameForPath(row?.filename || row?.path || row?.storage_path);
  return KNOWLEDGE_TEXT_EXTENSIONS.has(ext)
    && hasUsableContent(row)
    && !isBinaryPlaceholder(row);
}

function sourceFromPathOrMetadata(row, constructId) {
  const metadata = parseMaybeJson(row?.metadata);
  const file = {
    ...row,
    metadata,
    filename: row?.filename || row?.path || row?.storage_path || '',
  };
  return getTranscriptSourceForFile(file, constructId)
    || normalizeTranscriptSource(extractSourceFromTranscriptPath(file.filename, constructId), { fallback: '' })
    || extractSourceFromLocalConstructPath(file.filename, constructId)
    || '';
}

function extractSourceFromLocalConstructPath(filename, constructId) {
  const parts = normalizePath(filename).split('/').filter(Boolean);
  const constructIndex = parts.findIndex((part) => part === constructId);
  if (constructIndex < 0) return '';
  const next = parts[constructIndex + 1];
  if (!next) return '';
  if (next === '.history') {
    return normalizeTranscriptSource(parts[constructIndex + 2], { fallback: '' });
  }
  return normalizeTranscriptSource(next, { fallback: '' });
}

export function classifyDiscoveredSource(entry, context = {}) {
  const constructId = canonicalizeConstructId(context.constructId || 'nova-001');
  const supabaseUserId = context.supabaseUserId || null;
  const metadata = parseMaybeJson(entry.metadata);
  const filename = normalizePath(entry.filename || entry.path || entry.storagePath || entry.storage_path || '');
  const storagePath = normalizePath(entry.storagePath || entry.storage_path || '');
  const source = entry.source || sourceFromPathOrMetadata({ ...entry, filename, metadata }, constructId);
  const owner = entry.owner || entry.user_id || null;
  const base = {
    surface: entry.surface || 'unknown',
    kind: entry.kind || 'unknown',
    source,
    path: filename,
    owner,
    rowId: entry.rowId || entry.id || null,
    contentLength: getContentLength(entry),
    storagePath,
    entersFinalPromptNow: false,
    finalPromptReachable: false,
    backupVisible: isBackupSurface(entry.surface || 'unknown'),
    supabaseCanonical: isSupabaseCanonicalEntry(entry, { filename, storagePath, constructId }),
    promptLoader: null,
    blockedReason: null,
    bridgeCandidate: false,
    sourceSha256: extractMetadataHash(metadata),
    metadata,
  };

  if (base.surface !== 'supabase') {
    const reasonBySurface = {
      sqlite: 'sqlite_not_in_prompt_loader',
      icloud: 'icloud_not_in_prompt_loader',
      vvault_local: 'not_supabase_backed',
    };
    return {
      ...base,
      blockedReason: reasonBySurface[base.surface] || 'not_supabase_backed',
      bridgeCandidate: true,
    };
  }

  const loaders = [];
  const blockers = [];

  if (isRootKnowledgePath(filename, constructId)) {
    if (!supabaseUserId || owner !== supabaseUserId) {
      blockers.push('wrong_user_id');
    } else if (!isKnowledgeTextRow({ ...entry, filename })) {
      blockers.push('missing_content_or_storage_path');
    } else {
      loaders.push('knowledgeContext');
    }
  } else if (isUserPrefixedConstructPath(filename, constructId) && (filename.includes('/documents/') || filename.includes('/assets/'))) {
    blockers.push('user_prefixed_path_not_matched_by_knowledge_loader');
  }

  const transcriptFile = { ...entry, filename, metadata };
  if (isCanonicalChattyThreadFile(filename, constructId) && !usesCanonicalChattyHistory(constructId)) {
    blockers.push('canonical_chatty_disabled_for_nova');
  } else if (looksLikeVerifiedTranscriptCandidate(transcriptFile, constructId)) {
    if (entry.construct_id !== constructId) {
      blockers.push('construct_id_mismatch');
    } else if (isVerifiedExcludedFile(transcriptFile)) {
      blockers.push('source_policy_mismatch');
    } else if (!matchesHistoricalSourcePolicy(transcriptFile, constructId)) {
      blockers.push('source_policy_mismatch');
    } else if (!hasUsableContent(entry) && !storagePath) {
      blockers.push('missing_content_or_storage_path');
    } else {
      loaders.push('verifiedMemoryLoader');
    }
  }

  if (loaders.length > 0) {
    return {
      ...base,
      promptLoader: unique(loaders).join('+'),
      entersFinalPromptNow: true,
      finalPromptReachable: true,
      blockedReason: null,
      bridgeCandidate: false,
    };
  }

  const blockedReason = blockers[0]
    || (entry.construct_id && entry.construct_id !== constructId ? 'construct_id_mismatch' : null)
    || (source ? 'source_policy_mismatch' : 'missing_content_or_storage_path');

  return {
    ...base,
    blockedReason,
    bridgeCandidate: ['sqlite_not_in_prompt_loader', 'icloud_not_in_prompt_loader', 'not_supabase_backed', 'user_prefixed_path_not_matched_by_knowledge_loader'].includes(blockedReason),
  };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { __error: error.message };
  }
}

async function loadRegistryRows(filePath, { email, targetLifeId, legacyLifeAliases }) {
  const data = await readJsonFile(filePath);
  if (data.__error) {
    return { available: false, error: data.__error, rows: [] };
  }
  const ids = new Set([targetLifeId, ...legacyLifeAliases]);
  const users = data.users || {};
  const rows = Object.values(users).filter((user) => {
    const id = user.user_id || user.id;
    return user.email === email || ids.has(id);
  }).map((user) => ({
    id: user.user_id || user.id || null,
    email: user.email || null,
    name: user.name || null,
    vvaultUserId: user.vvault_user_id || null,
    vvaultLinked: user.vvault_linked ?? null,
    constructs: Array.isArray(user.constructs) ? user.constructs : undefined,
  }));
  return { available: true, rows };
}

function dedupeEntries(entries) {
  const seen = new Set();
  const deduped = [];
  for (const entry of entries) {
    const key = [
      entry.surface,
      entry.rowId || entry.id || '',
      entry.owner || entry.user_id || '',
      entry.path || entry.filename || entry.storagePath || entry.storage_path || '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

async function resolveSupabaseIdentitySelectOnly(email) {
  const { supabase, error: clientError } = await getSupabaseClientOptional();
  if (!supabase) return { available: false, supabaseUserId: null, rows: [], error: clientError || 'Supabase client unavailable' };

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('users')
        .select('id,email,name')
        .eq('email', email)
        .limit(20),
      SUPABASE_SELECT_TIMEOUT_MS,
      'Supabase users select'
    );
    if (error) {
      return { available: true, supabaseUserId: null, rows: [], error: error.message };
    }
    return {
      available: true,
      supabaseUserId: data?.[0]?.id || null,
      rows: data || [],
      error: null,
    };
  } catch (error) {
    return { available: true, supabaseUserId: null, rows: [], error: error.message };
  }
}

async function getSupabaseClientOptional() {
  try {
    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    return { supabase: getSupabaseClient(), error: null };
  } catch (error) {
    return { supabase: null, error: error.message };
  }
}

async function fetchSupabasePages(queryFactory, pageSize = 1000, maxRows = 10000) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await withTimeout(
      queryFactory().range(from, to),
      SUPABASE_SELECT_TIMEOUT_MS,
      `Supabase vault_files select ${from}-${to}`
    );
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function collectSupabaseSources({ supabaseUserId, targetLifeId, legacyLifeAliases, constructId }) {
  const { supabase, error: clientError } = await getSupabaseClientOptional();
  if (!supabase) return { available: false, error: clientError || 'Supabase client unavailable', entries: [] };

  const fields = 'id,user_id,filename,storage_path,construct_id,file_type,metadata,content,created_at';
  const bareConstructId = constructId.replace(/-\d+$/, '');
  const aliases = unique([targetLifeId, ...legacyLifeAliases]);
  const querySpecs = [
    ['construct_exact', () => supabase.from('vault_files').select(fields).eq('construct_id', constructId)],
  ];
  if (bareConstructId !== constructId) {
    querySpecs.push(['construct_bare', () => supabase.from('vault_files').select(fields).eq('construct_id', bareConstructId)]);
  }
  if (supabaseUserId) {
    querySpecs.push(
      ['user_root_filename', () => supabase.from('vault_files').select(fields).eq('user_id', supabaseUserId).like('filename', `instances/${constructId}/%`)],
      ['user_root_storage', () => supabase.from('vault_files').select(fields).eq('user_id', supabaseUserId).like('storage_path', `instances/${constructId}/%`)],
      ['user_prefixed_filename', () => supabase.from('vault_files').select(fields).eq('user_id', supabaseUserId).like('filename', `%/instances/${constructId}/%`)],
      ['user_prefixed_storage', () => supabase.from('vault_files').select(fields).eq('user_id', supabaseUserId).like('storage_path', `%/instances/${constructId}/%`)],
    );
  }
  for (const alias of aliases) {
    querySpecs.push(
      [`alias_filename_${alias}`, () => supabase.from('vault_files').select(fields).like('filename', `%${alias}%/instances/${constructId}/%`)],
      [`alias_storage_${alias}`, () => supabase.from('vault_files').select(fields).like('storage_path', `%${alias}%/instances/${constructId}/%`)],
    );
  }

  const entries = [];
  const errors = [];
  for (const [queryName, factory] of querySpecs) {
    try {
      const rows = await fetchSupabasePages(factory);
      for (const row of rows) {
        const filename = row.filename || row.storage_path || '';
        entries.push({
          surface: 'supabase',
          kind: isRootKnowledgePath(filename, constructId) ? 'knowledge' : 'transcript_or_file',
          queryName,
          ...row,
          rowId: row.id,
          owner: row.user_id,
          path: filename,
          storagePath: row.storage_path || '',
          metadata: parseMaybeJson(row.metadata),
        });
      }
    } catch (error) {
      errors.push({ queryName, error: error.message });
    }
  }

  return { available: true, errors, entries: dedupeEntries(entries) };
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqliteJson(sqlitePath, sql) {
  const output = execFileSync('sqlite3', ['-readonly', '-json', sqlitePath, sql], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (!output.trim()) return [];
  return JSON.parse(output);
}

async function collectSqliteSources({ sqlitePath, targetLifeId, legacyLifeAliases, constructId }) {
  if (!(await exists(sqlitePath))) {
    return { available: false, error: `SQLite DB not found: ${sqlitePath}`, entries: [] };
  }

  const ownerIds = unique([targetLifeId, ...legacyLifeAliases]);
  const ownerList = ownerIds.map(sqlLiteral).join(',');
  const constructLiteral = sqlLiteral(constructId);
  const entries = [];

  try {
    const gptFiles = sqliteJson(sqlitePath, `
      SELECT
        'gpt_files' AS table_name,
        g.user_id,
        g.id AS parent_id,
        g.construct_callsign,
        f.id AS file_id,
        f.filename,
        f.original_name,
        f.mime_type,
        f.size,
        length(coalesce(f.extracted_text, f.content, '')) AS content_length,
        f.metadata,
        f.uploaded_at
      FROM gpts g
      JOIN gpt_files f ON f.gpt_id = g.id
      WHERE g.user_id IN (${ownerList}) AND g.construct_callsign = ${constructLiteral}
      ORDER BY g.user_id, f.uploaded_at DESC
    `);

    const aiFiles = sqliteJson(sqlitePath, `
      SELECT
        'ai_files' AS table_name,
        a.user_id,
        a.id AS parent_id,
        a.construct_callsign,
        f.id AS file_id,
        f.filename,
        f.original_name,
        f.mime_type,
        f.size,
        length(coalesce(f.extracted_text, f.content, '')) AS content_length,
        f.metadata,
        f.uploaded_at
      FROM ais a
      JOIN ai_files f ON f.ai_id = a.id
      WHERE a.user_id IN (${ownerList}) AND a.construct_callsign = ${constructLiteral}
      ORDER BY a.user_id, f.uploaded_at DESC
    `);

    for (const row of [...gptFiles, ...aiFiles]) {
      entries.push({
        surface: 'sqlite',
        kind: row.mime_type?.startsWith('image/') ? 'asset' : 'knowledge',
        source: sourceFromPathOrMetadata({ filename: row.original_name || row.filename, metadata: parseMaybeJson(row.metadata) }, constructId),
        path: row.original_name || row.filename,
        filename: row.original_name || row.filename,
        storagePath: row.filename,
        rowId: row.file_id,
        owner: row.user_id,
        content: 'x'.repeat(Math.min(Number(row.content_length || 0), 1)),
        contentLength: Number(row.content_length || 0),
        metadata: parseMaybeJson(row.metadata),
        parentId: row.parent_id,
        tableName: row.table_name,
      });
    }

    return { available: true, entries };
  } catch (error) {
    return { available: false, error: error.message, entries };
  }
}

async function scanFilesUnder(rootPath, { surface, owner, constructId }) {
  const entries = [];
  async function walk(current) {
    let dirents;
    try {
      dirents = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      const fullPath = path.join(current, dirent.name);
      if (dirent.isDirectory()) {
        if (dirent.name === 'node_modules' || dirent.name === '.git') continue;
        await walk(fullPath);
        continue;
      }
      if (!dirent.isFile()) continue;
      let stat = null;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        // Keep reporting path visibility even if stat fails.
      }
      const normalizedFullPath = normalizePath(fullPath);
      entries.push({
        surface,
        kind: normalizedFullPath.includes('/assets/') ? 'asset' : 'transcript_or_file',
        source: sourceFromPathOrMetadata({ filename: normalizedFullPath }, constructId),
        path: normalizedFullPath,
        filename: normalizedFullPath,
        owner,
        rowId: null,
        content: '',
        size: stat?.size ?? null,
      });
    }
  }
  await walk(rootPath);
  return entries;
}

async function collectIcloudSources({ icloudVaultRoot, constructId }) {
  const constructRoot = path.join(icloudVaultRoot, constructId);
  if (!(await exists(constructRoot))) {
    return { available: false, error: `iCloud construct root not found: ${constructRoot}`, entries: [] };
  }

  const entries = [];
  for (const folder of SCAN_FOLDERS) {
    const folderPath = path.join(constructRoot, folder);
    if (!(await exists(folderPath))) continue;
    entries.push(...await scanFilesUnder(folderPath, {
      surface: 'icloud',
      owner: `icloud:${constructId}`,
      constructId,
    }));
  }
  return { available: true, entries };
}

async function collectVvaultLocalSources({ vvaultRoot, constructId }) {
  const roots = [];
  const rootInstancesPath = path.join(vvaultRoot, 'instances', constructId);
  if (await exists(rootInstancesPath)) roots.push({ owner: 'vvault_root_instances', path: rootInstancesPath });

  const usersRoot = path.join(vvaultRoot, 'users');
  try {
    const shards = await fs.readdir(usersRoot, { withFileTypes: true });
    for (const shard of shards) {
      if (!shard.isDirectory()) continue;
      const shardPath = path.join(usersRoot, shard.name);
      const users = await fs.readdir(shardPath, { withFileTypes: true }).catch(() => []);
      for (const userDir of users) {
        if (!userDir.isDirectory()) continue;
        const candidate = path.join(shardPath, userDir.name, 'instances', constructId);
        if (await exists(candidate)) roots.push({ owner: userDir.name, path: candidate });
      }
    }
  } catch {
    // Missing local VVAULT users tree is a normal diagnostic outcome.
  }

  const entries = [];
  for (const root of roots) {
    entries.push(...await scanFilesUnder(root.path, {
      surface: 'vvault_local',
      owner: root.owner,
      constructId,
    }));
  }
  return { available: roots.length > 0, entries, roots };
}

function summarizeCounts(rows) {
  const bySurface = {};
  let entersFinalPromptNow = 0;
  let finalPromptReachable = 0;
  let backupVisible = 0;
  let supabaseCanonical = 0;
  let bridgeCandidates = 0;
  for (const row of rows) {
    bySurface[row.surface] = (bySurface[row.surface] || 0) + 1;
    if (row.entersFinalPromptNow) entersFinalPromptNow += 1;
    if (row.finalPromptReachable) finalPromptReachable += 1;
    if (row.backupVisible) backupVisible += 1;
    if (row.supabaseCanonical) supabaseCanonical += 1;
    if (row.bridgeCandidate) bridgeCandidates += 1;
  }
  return {
    totalSources: rows.length,
    entersFinalPromptNow,
    finalPromptReachable,
    backupVisible,
    supabaseCanonical,
    bridgeCandidates,
    bySurface,
  };
}

function buildVerdict(rows, constructId) {
  const expectedSources = getHistoricalMemorySources(constructId);
  const transcriptPromptRows = rows.filter((row) =>
    row.finalPromptReachable
    && row.promptLoader?.includes('verifiedMemoryLoader')
    && expectedSources.includes(row.source)
  );
  const knowledgePromptRows = rows.filter((row) =>
    row.finalPromptReachable
    && row.promptLoader?.includes('knowledgeContext')
  );
  const visibleExpectedRows = rows.filter((row) => expectedSources.includes(row.source));
  const visibleBridgeCandidates = rows.filter((row) => row.bridgeCandidate);

  if (transcriptPromptRows.length > 0) {
    return {
      status: 'proven',
      message: `${constructId} has ${transcriptPromptRows.length} ${expectedSources.join('/')} transcript source(s) that match current final-prompt retrieval rules.`,
      promptTranscriptSources: transcriptPromptRows.length,
      promptKnowledgeSources: knowledgePromptRows.length,
      visibleExpectedSources: visibleExpectedRows.length,
      bridgeCandidates: visibleBridgeCandidates.length,
    };
  }

  if (visibleExpectedRows.length > 0 || visibleBridgeCandidates.length > 0 || knowledgePromptRows.length > 0) {
    return {
      status: 'partially_proven',
      message: `${constructId} has visible sources, but no ${expectedSources.join('/')} transcript source currently reaches verified-memory prompt assembly.`,
      promptTranscriptSources: 0,
      promptKnowledgeSources: knowledgePromptRows.length,
      visibleExpectedSources: visibleExpectedRows.length,
      bridgeCandidates: visibleBridgeCandidates.length,
    };
  }

  return {
    status: 'not_proven',
    message: `${constructId} has no visible source that proves the current memory bridge.`,
    promptTranscriptSources: 0,
    promptKnowledgeSources: 0,
    visibleExpectedSources: 0,
    bridgeCandidates: 0,
  };
}

export async function buildSourceDiscoveryReport(inputOptions) {
  await loadEnvFilesOptional();
  const options = {
    ...inputOptions,
    constructId: canonicalizeConstructId(inputOptions.constructId),
    legacyLifeAliases: unique(inputOptions.legacyLifeAliases || []),
  };
  const allLifeIds = unique([options.targetLifeId, ...options.legacyLifeAliases]);

  const [chattyRegistry, vvaultRegistry, supabaseIdentity] = await Promise.all([
    loadRegistryRows(path.join(REPO_ROOT, 'users.json'), options),
    loadRegistryRows(path.join(options.vvaultRoot, 'users.json'), options),
    resolveSupabaseIdentitySelectOnly(options.email),
  ]);

  const supabaseUserId = supabaseIdentity.supabaseUserId || null;
  const context = { constructId: options.constructId, supabaseUserId };

  const [supabaseSources, sqliteSources, icloudSources, vvaultLocalSources] = await Promise.all([
    collectSupabaseSources({ ...options, supabaseUserId }),
    collectSqliteSources(options),
    collectIcloudSources(options),
    collectVvaultLocalSources(options),
  ]);

  const rawSources = [
    ...supabaseSources.entries,
    ...sqliteSources.entries,
    ...icloudSources.entries,
    ...vvaultLocalSources.entries,
  ];
  const sources = dedupeEntries(rawSources)
    .map((entry) => classifyDiscoveredSource(entry, context))
    .sort((a, b) => {
      if (a.finalPromptReachable !== b.finalPromptReachable) return a.finalPromptReachable ? -1 : 1;
      if (a.supabaseCanonical !== b.supabaseCanonical) return a.supabaseCanonical ? -1 : 1;
      if (a.bridgeCandidate !== b.bridgeCandidate) return a.bridgeCandidate ? -1 : 1;
      return `${a.surface}:${a.path}`.localeCompare(`${b.surface}:${b.path}`);
    });

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      email: options.email,
      targetLifeId: options.targetLifeId,
      legacyLifeAliases: options.legacyLifeAliases,
      allLifeIds,
      constructId: options.constructId,
      icloudVaultRoot: options.icloudVaultRoot,
      vvaultRoot: options.vvaultRoot,
      sqlitePath: options.sqlitePath,
    },
    identity: {
      chattyRegistry,
      vvaultRegistry,
      supabase: supabaseIdentity,
    },
    memoryPolicy: {
      constructId: options.constructId,
      expectedHistoricalSources: getHistoricalMemorySources(options.constructId),
      canonicalChattyHistoryEnabled: usesCanonicalChattyHistory(options.constructId),
    },
    surfaceStatus: {
      supabase: { available: supabaseSources.available, errors: supabaseSources.errors || [], error: supabaseSources.error || null },
      sqlite: { available: sqliteSources.available, error: sqliteSources.error || null },
      icloud: { available: icloudSources.available, error: icloudSources.error || null },
      vvaultLocal: { available: vvaultLocalSources.available, roots: vvaultLocalSources.roots || [], error: vvaultLocalSources.error || null },
    },
    counts: summarizeCounts(sources),
    verdict: buildVerdict(sources, options.constructId),
    sources,
  };
}

function formatHumanReport(report) {
  const lines = [];
  lines.push('Nova Source-Discovery Dry Run');
  lines.push('================================');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Construct: ${report.inputs.constructId}`);
  lines.push(`Email: ${report.inputs.email}`);
  lines.push(`Target LIFE id: ${report.inputs.targetLifeId}`);
  lines.push(`Legacy aliases: ${report.inputs.legacyLifeAliases.join(', ') || '(none)'}`);
  lines.push(`Supabase user id: ${report.identity.supabase.supabaseUserId || '(unresolved)'}`);
  lines.push(`Memory policy: expected=${report.memoryPolicy.expectedHistoricalSources.join(', ')} canonicalChatty=${report.memoryPolicy.canonicalChattyHistoryEnabled}`);
  lines.push('');
  lines.push(`Verdict: ${report.verdict.status}`);
  lines.push(report.verdict.message);
  lines.push('');
  lines.push('Counts');
  lines.push('------');
  lines.push(`Total sources: ${report.counts.totalSources}`);
  lines.push(`Backup-visible sources: ${report.counts.backupVisible}`);
  lines.push(`Supabase-canonical sources: ${report.counts.supabaseCanonical}`);
  lines.push(`Final-prompt-reachable sources: ${report.counts.finalPromptReachable}`);
  lines.push(`Enter final prompt now: ${report.counts.entersFinalPromptNow}`);
  lines.push(`Bridge candidates: ${report.counts.bridgeCandidates}`);
  for (const [surface, count] of Object.entries(report.counts.bySurface)) {
    lines.push(`- ${surface}: ${count}`);
  }
  lines.push('');
  lines.push('Sources');
  lines.push('-------');
  lines.push(['surface', 'loader', 'backup', 'supabaseCanonical', 'finalPrompt', 'bridge', 'source', 'owner', 'reason', 'path'].join('\t'));
  for (const row of report.sources) {
    lines.push([
      row.surface,
      row.promptLoader || '-',
      row.backupVisible ? 'yes' : 'no',
      row.supabaseCanonical ? 'yes' : 'no',
      row.finalPromptReachable ? 'yes' : 'no',
      row.bridgeCandidate ? 'yes' : 'no',
      row.source || '-',
      truncate(row.owner || '-', 30),
      row.blockedReason || '-',
      truncate(row.path || row.storagePath || '-', 120),
    ].join('\t'));
  }
  return lines.join('\n');
}

async function main() {
  const options = parseArgs();
  const report = await buildSourceDiscoveryReport(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatHumanReport(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(`FAIL source-discovery-dry-run - ${error.message}`);
    process.exit(1);
  });
}
