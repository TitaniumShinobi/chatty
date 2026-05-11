#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalizeConstructId } from '../lib/constructId.js';
import { normalizeTranscriptSource } from '../lib/transcriptSource.js';
import { classifyDiscoveredSource } from './sourceDiscoveryDryRun.js';
import { buildRecoveryManifest } from './sourceRecoveryManifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

export const APPROVED_NOVA_PILOT_SOURCE_SHA256 = Object.freeze([
  '7af8aea4ce47e04e363baa76ebe088c4f81e71c53cee540dca9e1c73998e6ff4',
  'd6743dcbe3a2f092adf66eb13d2dc9d009387f03118d84f4ed2ada63f57dbafe',
  '05004c00fcc6da6850c1b436e87e7eaef84249d0cabab3ca8847e31f8f87c4ee',
]);

export const DEFAULT_PILOT_BATCH_ID = 'nova-001-chatgpt-pilot-20260416-01';
export const DEFAULT_MAX_CONTENT_CHARS = 45000;
const DEFAULT_ICLOUD_VAULT_ROOT = '/Users/devonwoodson/Library/Mobile Documents/com~apple~CloudDocs/Vault';
const DEFAULT_VVAULT_ROOT = '/Users/devonwoodson/Documents/GitHub/vvault';
const DEFAULT_SQLITE_PATH = path.join(REPO_ROOT, 'chatty.db');
const REST_TIMEOUT_MS = Number(process.env.SOURCE_RECOVERY_REST_TIMEOUT_MS || 10000);
let envLoaded = false;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sha256(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
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

function ensureSupportedPilotScope(options) {
  if (options.constructId !== 'nova-001') {
    throw new Error('sourceRecoveryPilotImport is scoped to nova-001 only for this pilot');
  }
  if (options.source !== 'chatgpt') {
    throw new Error('sourceRecoveryPilotImport is scoped to Nova ChatGPT sources only for this pilot');
  }
  if (options.pilotBatchId !== DEFAULT_PILOT_BATCH_ID) {
    throw new Error(`sourceRecoveryPilotImport is scoped to pilot batch ${DEFAULT_PILOT_BATCH_ID}`);
  }
  if (options.contentMode !== 'bounded-companion-excerpt') {
    throw new Error('Only --content-mode bounded-companion-excerpt is supported for this pilot');
  }
  if (!Number.isInteger(options.maxContentChars) || options.maxContentChars <= 0) {
    throw new Error('--max-content-chars must be a positive integer');
  }

  const approved = new Set(APPROVED_NOVA_PILOT_SOURCE_SHA256);
  const unknown = options.includeShas.filter((hash) => !approved.has(hash));
  if (unknown.length > 0) {
    throw new Error(`Unapproved Nova pilot source hash(es): ${unknown.join(', ')}`);
  }
  if (options.includeShas.length !== APPROVED_NOVA_PILOT_SOURCE_SHA256.length) {
    throw new Error(`This pilot must include exactly ${APPROVED_NOVA_PILOT_SOURCE_SHA256.length} approved Nova source hashes`);
  }
}

export function parsePilotArgs(argv = process.argv.slice(2)) {
  const options = {
    email: null,
    targetLifeId: null,
    legacyLifeAliases: [],
    constructId: 'nova-001',
    source: 'chatgpt',
    includeShas: [],
    pilotBatchId: DEFAULT_PILOT_BATCH_ID,
    contentMode: 'bounded-companion-excerpt',
    maxContentChars: DEFAULT_MAX_CONTENT_CHARS,
    apply: false,
    json: true,
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

    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--json') {
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
    } else if (arg === '--pilot-batch-id' || arg.startsWith('--pilot-batch-id=')) {
      options.pilotBatchId = readValue();
    } else if (arg === '--include-sha' || arg.startsWith('--include-sha=')) {
      options.includeShas.push(readValue());
    } else if (arg === '--content-mode' || arg.startsWith('--content-mode=')) {
      options.contentMode = readValue();
    } else if (arg === '--max-content-chars' || arg.startsWith('--max-content-chars=')) {
      options.maxContentChars = Number(readValue());
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
  options.source = normalizeTranscriptSource(options.source || 'chatgpt', { fallback: 'chatgpt' });
  options.legacyLifeAliases = unique(options.legacyLifeAliases);
  options.includeShas = unique(options.includeShas.length > 0
    ? options.includeShas
    : APPROVED_NOVA_PILOT_SOURCE_SHA256);

  if (!options.email) throw new Error('Missing required --email');
  if (!options.targetLifeId) throw new Error('Missing required --target-life-id');
  if (!options.pilotBatchId) throw new Error('Missing required --pilot-batch-id');

  ensureSupportedPilotScope(options);
  return options;
}

export function makeBoundedContent(content, maxContentChars = DEFAULT_MAX_CONTENT_CHARS) {
  const text = String(content || '').replace(/\r\n/g, '\n');
  if (text.length <= maxContentChars) {
    return { content: text, truncated: false };
  }

  const hardSlice = text.slice(0, maxContentChars);
  const lastNewline = hardSlice.lastIndexOf('\n');
  const boundary = lastNewline > Math.floor(maxContentChars * 0.8) ? lastNewline : maxContentChars;
  return {
    content: text.slice(0, boundary).trimEnd(),
    truncated: true,
  };
}

export function selectPilotManifestRows(manifest, includeShas) {
  const plannedByHash = new Map((manifest.plannedCanonicalRows || []).map((row) => [row.sourceSha256, row]));
  const rejectedByHash = new Map((manifest.rejected || []).map((row) => [row.sourceSha256, row]));
  const selected = [];
  const unavailable = [];
  const rejected = [];

  for (const sourceSha256 of includeShas) {
    const planned = plannedByHash.get(sourceSha256);
    if (planned) {
      selected.push(planned);
      continue;
    }

    const rejectedRow = rejectedByHash.get(sourceSha256);
    if (rejectedRow) {
      rejected.push(rejectedRow);
      continue;
    }

    unavailable.push(sourceSha256);
  }

  return { selected, rejected, unavailable };
}

export async function buildPilotPayload(manifestRow, options, generatedAt = new Date().toISOString(), manifestContext = {}) {
  const sourcePath = manifestRow.source?.path;
  if (!sourcePath) {
    throw new Error(`Manifest row ${manifestRow.sourceSha256} is missing source.path`);
  }

  const sourceContent = await fs.readFile(sourcePath, 'utf8');
  const bounded = makeBoundedContent(sourceContent, options.maxContentChars);
  const importedContentSha256 = sha256(bounded.content);
  const baseMetadata = parseMaybeJson(manifestRow.plannedRow?.metadata);

  const payload = {
    user_id: manifestContext.supabaseUserId || null,
    construct_id: options.constructId,
    filename: manifestRow.canonicalFilename,
    storage_path: null,
    content: bounded.content,
    file_type: 'transcript',
    sha256: importedContentSha256,
    metadata: {
      ...baseMetadata,
      source: options.source,
      recoveryKind: 'supabase-first-source-recovery',
      recoveryStage: 'pilot',
      pilotBatchId: options.pilotBatchId,
      recoveryRunId: manifestContext.recoveryRunId || baseMetadata.recoveryRunId || null,
      bridgeSource: manifestRow.source?.surface || baseMetadata.bridgeSource || null,
      originalPath: normalizePath(sourcePath),
      originalOwner: manifestRow.source?.owner || baseMetadata.originalOwner || null,
      originalRowId: manifestRow.source?.rowId || baseMetadata.originalRowId || null,
      sourceSha256: manifestRow.sourceSha256,
      importedContentSha256,
      sourceContentLength: sourceContent.length,
      importedContentLength: bounded.content.length,
      contentMode: options.contentMode,
      maxContentChars: options.maxContentChars,
      contentTruncated: bounded.truncated,
      targetLifeId: options.targetLifeId,
      legacyLifeAliases: options.legacyLifeAliases,
      plannedAt: baseMetadata.plannedAt || manifestContext.manifestGeneratedAt || generatedAt,
      importedAt: generatedAt,
    },
  };

  const reachability = classifyDiscoveredSource({
    surface: 'supabase',
    kind: 'transcript',
    id: null,
    user_id: payload.user_id,
    construct_id: payload.construct_id,
    filename: payload.filename,
    storage_path: payload.storage_path,
    file_type: payload.file_type,
    metadata: payload.metadata,
    content: payload.content,
  }, {
    constructId: options.constructId,
    supabaseUserId: manifestContext.supabaseUserId || null,
  });

  return {
    payload,
    sourceSha256: manifestRow.sourceSha256,
    canonicalFilename: manifestRow.canonicalFilename,
    sourcePath: normalizePath(sourcePath),
    sourceContentLength: sourceContent.length,
    contentLength: bounded.content.length,
    truncated: bounded.truncated,
    expectedReachability: {
      supabaseCanonical: reachability.supabaseCanonical,
      finalPromptReachable: reachability.finalPromptReachable,
      promptLoader: reachability.promptLoader,
      blockedReason: reachability.blockedReason,
    },
  };
}

function getMetadataHash(metadata) {
  const parsed = parseMaybeJson(metadata);
  return parsed.sourceSha256
    || parsed.source_sha256
    || parsed.contentSha256
    || parsed.content_sha256
    || parsed.sha256
    || null;
}

export function findDuplicateMatches(payload, existingRows = []) {
  const sourceSha256 = payload.metadata?.sourceSha256;
  const importedContentSha256 = payload.metadata?.importedContentSha256 || payload.sha256;
  return existingRows
    .filter((row) => {
      const metadataHash = getMetadataHash(row.metadata);
      return row.construct_id === payload.construct_id
        && (
          normalizePath(row.filename) === payload.filename
          || normalizePath(row.storage_path) === payload.filename
          || metadataHash === sourceSha256
          || row.sha256 === sourceSha256
          || row.sha256 === importedContentSha256
        );
    })
    .map((row) => ({
      id: row.id,
      user_id: row.user_id || null,
      filename: row.filename || null,
      storage_path: row.storage_path || null,
      sha256: row.sha256 || null,
      sourceSha256: getMetadataHash(row.metadata),
      created_at: row.created_at || null,
    }));
}

async function fetchDuplicateRows(supabase, constructId) {
  if (!supabase) {
    return { available: false, error: 'Supabase client unavailable', rows: [] };
  }

  const { data, error } = await supabase
    .from('vault_files')
    .select('id,user_id,construct_id,filename,storage_path,sha256,metadata,created_at')
    .eq('construct_id', constructId)
    .limit(10000);

  if (error) {
    return { available: true, error: error.message, rows: [] };
  }

  return { available: true, error: null, rows: data || [] };
}

function getRestConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return { available: false, error: 'SUPABASE_URL or SUPABASE_SERVICE_KEY is missing' };
  }
  return {
    available: true,
    url: url.replace(/\/$/, ''),
    serviceKey,
    error: null,
  };
}

async function supabaseRestRequest(pathname, {
  method = 'GET',
  params = {},
  body,
  prefer,
} = {}, fetchImpl = globalThis.fetch) {
  const config = getRestConfig();
  if (!config.available) {
    return { available: false, error: config.error, rows: [] };
  }
  if (typeof fetchImpl !== 'function') {
    return { available: false, error: 'fetch is unavailable in this Node runtime', rows: [] };
  }

  const url = new URL(`${config.url}/rest/v1/${pathname}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
  try {
    const headers = {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (prefer) {
      headers.Prefer = prefer;
    }

    const response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        available: true,
        error: `Supabase REST ${pathname} returned ${response.status}: ${text.slice(0, 300)}`,
        rows: [],
      };
    }
    const rows = text ? JSON.parse(text) : [];
    return {
      available: true,
      error: null,
      rows: Array.isArray(rows) ? rows : [],
    };
  } catch (error) {
    return {
      available: true,
      error: error.name === 'AbortError'
        ? `Supabase REST ${pathname} timed out after ${REST_TIMEOUT_MS}ms`
        : error.message,
      rows: [],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resolveSupabaseUserIdRest(email, fetchImpl = globalThis.fetch) {
  const result = await supabaseRestRequest('users', {
    params: {
      select: 'id,email,name',
      email: `eq.${email}`,
      limit: 20,
    },
  }, fetchImpl);

  return {
    attempted: true,
    available: result.available,
    succeeded: result.available && !result.error && Boolean(result.rows?.[0]?.id),
    supabaseUserId: result.rows?.[0]?.id || null,
    rowCount: result.rows?.length || 0,
    error: result.error || (!result.rows?.[0]?.id ? 'Supabase REST user lookup returned no matching row' : null),
  };
}

export async function fetchDuplicateRowsRest(constructId, fetchImpl = globalThis.fetch) {
  const result = await supabaseRestRequest('vault_files', {
    params: {
      select: 'id,user_id,construct_id,filename,storage_path,sha256,metadata,created_at',
      construct_id: `eq.${constructId}`,
      limit: 10000,
    },
  }, fetchImpl);

  return {
    available: result.available,
    error: result.error,
    rows: result.rows || [],
    method: 'rest',
  };
}

function validateRestApplyRows(rows, options, resolvedSupabaseUserId) {
  if (!options.apply) {
    throw new Error('REST apply validation requires --apply');
  }
  ensureSupportedPilotScope(options);

  const approved = new Set(APPROVED_NOVA_PILOT_SOURCE_SHA256);
  const seen = new Set();
  if (!Array.isArray(rows) || rows.length !== APPROVED_NOVA_PILOT_SOURCE_SHA256.length) {
    throw new Error(`REST apply must insert exactly ${APPROVED_NOVA_PILOT_SOURCE_SHA256.length} Nova pilot rows`);
  }

  for (const row of rows) {
    const sourceSha256 = row.payload?.metadata?.sourceSha256;
    if (!approved.has(sourceSha256)) {
      throw new Error(`REST apply payload contains unapproved source hash: ${sourceSha256 || 'missing'}`);
    }
    if (seen.has(sourceSha256)) {
      throw new Error(`REST apply payload contains duplicate source hash: ${sourceSha256}`);
    }
    seen.add(sourceSha256);
    if (row.payload.user_id !== resolvedSupabaseUserId) {
      throw new Error(`REST apply payload user_id mismatch for ${sourceSha256}`);
    }
    if (row.payload.construct_id !== 'nova-001') {
      throw new Error(`REST apply payload construct_id mismatch for ${sourceSha256}`);
    }
    if (row.payload.file_type !== 'transcript') {
      throw new Error(`REST apply payload file_type mismatch for ${sourceSha256}`);
    }
    if (row.payload.metadata?.source !== 'chatgpt') {
      throw new Error(`REST apply payload source mismatch for ${sourceSha256}`);
    }
    if (row.payload.metadata?.pilotBatchId !== DEFAULT_PILOT_BATCH_ID) {
      throw new Error(`REST apply payload pilot batch mismatch for ${sourceSha256}`);
    }
    if (!normalizePath(row.payload.filename).startsWith('instances/nova-001/chatgpt/')) {
      throw new Error(`REST apply payload filename is outside Nova ChatGPT canonical path for ${sourceSha256}`);
    }
    if (row.payload.storage_path !== null) {
      throw new Error(`REST apply payload storage_path must be null for ${sourceSha256}`);
    }
    if (typeof row.payload.content !== 'string' || row.payload.content.length === 0) {
      throw new Error(`REST apply payload content is empty for ${sourceSha256}`);
    }
  }

  for (const approvedHash of approved) {
    if (!seen.has(approvedHash)) {
      throw new Error(`REST apply payload is missing approved source hash: ${approvedHash}`);
    }
  }
}

export async function insertVaultFilesRest(plannedRows, options, resolvedSupabaseUserId, fetchImpl = globalThis.fetch) {
  validateRestApplyRows(plannedRows, options, resolvedSupabaseUserId);

  const result = await supabaseRestRequest('vault_files', {
    method: 'POST',
    params: {
      select: 'id,user_id,construct_id,filename,sha256,metadata,created_at',
    },
    prefer: 'return=representation',
    body: plannedRows.map((row) => row.payload),
  }, fetchImpl);

  return {
    available: result.available,
    error: result.error,
    rows: result.rows || [],
    method: 'rest',
  };
}

async function getSupabaseClientOptional() {
  try {
    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    return { supabase: getSupabaseClient(), error: null };
  } catch (error) {
    return { supabase: null, error: error.message };
  }
}

function summarizePlanRow(row, duplicateMatches = []) {
  return {
    canonicalFilename: row.canonicalFilename,
    sourceSha256: row.sourceSha256,
    sourcePath: row.sourcePath,
    sha256: row.payload.sha256,
    contentLength: row.contentLength,
    sourceContentLength: row.sourceContentLength,
    contentMode: row.payload.metadata.contentMode,
    maxContentChars: row.payload.metadata.maxContentChars,
    truncated: row.truncated,
    duplicate: duplicateMatches.length > 0,
    duplicateMatches,
    expectedReachability: row.expectedReachability,
    payloadFields: {
      user_id: row.payload.user_id,
      construct_id: row.payload.construct_id,
      filename: row.payload.filename,
      storage_path: row.payload.storage_path,
      file_type: row.payload.file_type,
      sha256: row.payload.sha256,
      metadata: row.payload.metadata,
    },
  };
}

export async function buildPilotImportReceipt(inputOptions, dependencies = {}) {
  await loadEnvFilesOptional();
  const options = {
    ...inputOptions,
    legacyLifeAliases: unique(inputOptions.legacyLifeAliases || []),
    includeShas: unique(inputOptions.includeShas || APPROVED_NOVA_PILOT_SOURCE_SHA256),
  };
  ensureSupportedPilotScope(options);

  const generatedAt = dependencies.generatedAt || new Date().toISOString();
  const manifest = dependencies.manifest || await buildRecoveryManifest(options);
  const supabaseResult = dependencies.supabase !== undefined
    ? { supabase: dependencies.supabase, error: null }
    : await getSupabaseClientOptional();
  const supabase = supabaseResult.supabase;
  const selectedRows = selectPilotManifestRows(manifest, options.includeShas);
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const restEnabled = dependencies.restFallbackEnabled !== false;
  let restUserLookup = {
    attempted: false,
    available: false,
    succeeded: false,
    supabaseUserId: null,
    rowCount: 0,
    error: null,
  };
  if (restEnabled && (options.apply || !manifest.identity?.supabaseUserId)) {
    restUserLookup = await resolveSupabaseUserIdRest(options.email, fetchImpl);
  }
  const resolvedSupabaseUserId = options.apply
    ? restUserLookup.supabaseUserId || null
    : manifest.identity?.supabaseUserId || restUserLookup.supabaseUserId || null;

  const errors = selectedRows.unavailable.map((sourceSha256) => ({
    sourceSha256,
    error: 'source_hash_not_found_in_manifest',
  }));
  if (options.apply && manifest.identity?.supabaseUserId && restUserLookup.supabaseUserId
    && manifest.identity.supabaseUserId !== restUserLookup.supabaseUserId) {
    errors.push({
      error: 'supabase_user_id_mismatch',
      manifestSupabaseUserId: manifest.identity.supabaseUserId,
      restSupabaseUserId: restUserLookup.supabaseUserId,
    });
  }
  errors.push(...selectedRows.rejected.map((row) => ({
    sourceSha256: row.sourceSha256,
    canonicalFilename: row.canonicalFilename || null,
    error: 'source_hash_rejected_by_manifest',
    rejectionReasons: row.rejectionReasons || [],
    duplicateStatus: row.duplicateStatus || null,
  })));

  const preparedRows = [];
  for (const row of selectedRows.selected) {
    try {
      preparedRows.push(await buildPilotPayload(row, options, generatedAt, {
        supabaseUserId: resolvedSupabaseUserId,
        recoveryRunId: manifest.recoveryRunId || null,
        manifestGeneratedAt: manifest.generatedAt || null,
      }));
    } catch (error) {
      errors.push({
        sourceSha256: row.sourceSha256,
        canonicalFilename: row.canonicalFilename,
        error: error.message,
      });
    }
  }

  let duplicateSelect;
  let duplicateDetectionMethod;
  if (options.apply) {
    duplicateSelect = restEnabled
      ? await fetchDuplicateRowsRest(options.constructId, fetchImpl)
      : { available: false, error: 'REST fallback is disabled', rows: [] };
    duplicateDetectionMethod = duplicateSelect.available && !duplicateSelect.error ? 'rest' : 'unavailable';
  } else {
    duplicateSelect = await fetchDuplicateRows(supabase, options.constructId);
    duplicateDetectionMethod = duplicateSelect.available && !duplicateSelect.error ? 'sdk' : 'unavailable';
    if (!duplicateSelect.available && supabaseResult.error) {
      duplicateSelect.error = supabaseResult.error;
    }
    if (restEnabled && (!duplicateSelect.available || duplicateSelect.error)) {
      const restDuplicateSelect = await fetchDuplicateRowsRest(options.constructId, fetchImpl);
      if (restDuplicateSelect.available && !restDuplicateSelect.error) {
        duplicateSelect = restDuplicateSelect;
        duplicateDetectionMethod = 'rest';
      } else {
        duplicateSelect = {
          ...duplicateSelect,
          restAvailable: restDuplicateSelect.available,
          restError: restDuplicateSelect.error,
        };
      }
    }
  }
  const duplicateMap = new Map();
  for (const row of preparedRows) {
    duplicateMap.set(row.sourceSha256, findDuplicateMatches(row.payload, duplicateSelect.rows));
  }

  const plannedInsertRows = preparedRows.filter((row) => (duplicateMap.get(row.sourceSha256) || []).length === 0);
  const skippedDuplicates = preparedRows.filter((row) => (duplicateMap.get(row.sourceSha256) || []).length > 0);

  const receipt = {
    mode: options.apply ? 'apply_requested' : 'dry_run',
    generatedAt,
    pilotBatchId: options.pilotBatchId,
    constructId: options.constructId,
    source: options.source,
    inputs: {
      email: options.email,
      targetLifeId: options.targetLifeId,
      legacyLifeAliases: options.legacyLifeAliases,
      includeShas: options.includeShas,
      contentMode: options.contentMode,
      maxContentChars: options.maxContentChars,
    },
    identity: {
      resolvedSupabaseUserId,
      resolutionMethod: manifest.identity?.supabaseUserId ? 'sdk' : (restUserLookup.supabaseUserId ? 'rest' : 'unresolved'),
      supabaseAvailable: manifest.identity?.supabaseAvailable === true || restUserLookup.succeeded,
      supabaseError: manifest.identity?.supabaseError || null,
      restUserLookup,
    },
    duplicateDetection: {
      available: duplicateSelect.available,
      method: duplicateDetectionMethod,
      error: duplicateSelect.error,
      restAvailable: duplicateSelect.restAvailable,
      restError: duplicateSelect.restError,
      scannedRowCount: duplicateSelect.rows.length,
    },
    plannedInsertCount: plannedInsertRows.length,
    skippedDuplicateCount: skippedDuplicates.length,
    errorCount: errors.length,
    expectedFinalPromptReachableAfterImport: plannedInsertRows.length > 0
      && plannedInsertRows.every((row) => row.expectedReachability.finalPromptReachable === true),
    plannedRows: plannedInsertRows.map((row) => summarizePlanRow(row, duplicateMap.get(row.sourceSha256) || [])),
    skipped: skippedDuplicates.map((row) => ({
      reason: 'skipped_duplicate',
      ...summarizePlanRow(row, duplicateMap.get(row.sourceSha256) || []),
    })),
    inserted: [],
    errors,
  };

  if (!options.apply) {
    return receipt;
  }

  if (!restEnabled) {
    throw new Error('Cannot apply pilot import because REST fallback is disabled');
  }
  if (!restUserLookup.succeeded || !restUserLookup.supabaseUserId) {
    throw new Error(`Cannot apply pilot import without successful REST user lookup: ${restUserLookup.error || 'unresolved'}`);
  }
  if (!resolvedSupabaseUserId) {
    throw new Error('Cannot apply pilot import without a resolved Supabase user id');
  }
  if (!duplicateSelect.available || duplicateSelect.error || duplicateDetectionMethod !== 'rest') {
    throw new Error(`Cannot apply pilot import because REST duplicate detection failed: ${duplicateSelect.error || 'unavailable'}`);
  }
  if (skippedDuplicates.length > 0) {
    throw new Error('Cannot apply pilot import because duplicate rows already exist');
  }
  if (errors.length > 0) {
    throw new Error('Cannot apply pilot import while manifest/source errors are present');
  }
  if (plannedInsertRows.length !== APPROVED_NOVA_PILOT_SOURCE_SHA256.length) {
    throw new Error(`Cannot apply pilot import unless exactly ${APPROVED_NOVA_PILOT_SOURCE_SHA256.length} rows are planned`);
  }

  const insertResult = await insertVaultFilesRest(plannedInsertRows, options, resolvedSupabaseUserId, fetchImpl);
  if (!insertResult.available || insertResult.error) {
    throw new Error(`Supabase REST insert failed: ${insertResult.error || 'unavailable'}`);
  }

  return {
    ...receipt,
    mode: 'applied',
    inserted: (insertResult.rows || []).map((row) => ({
      id: row.id,
      user_id: row.user_id || null,
      construct_id: row.construct_id,
      filename: row.filename,
      sourceSha256: getMetadataHash(row.metadata),
      sha256: row.sha256 || null,
      created_at: row.created_at || null,
      finalPromptExpected: true,
    })),
  };
}

async function main() {
  const options = parsePilotArgs();
  const receipt = await buildPilotImportReceipt(options);
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(JSON.stringify({
      mode: 'failed',
      error: error.message,
    }, null, 2));
    process.exit(1);
  });
}
