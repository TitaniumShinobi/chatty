// AI Creator API Routes
import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { AIManager } from '../lib/aiManager.js';
import { getGPTSaveHook } from '../lib/gptSaveHook.js';
import { LIN_MODEL_DEFAULTS } from '../lib/linModelDefaults.js';
import { normalizeModelString } from '../lib/modelResolver.js';
import { loadIdentityFiles } from '../lib/identityLoader.js';
import { loadVerifiedMemories } from '../lib/verifiedMemoryLoader.js';
import { loadLedger } from '../lib/continuityParser.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { canonicalizeConstructId } from '../lib/constructId.js';
import { mergeFromVVAULT } from '../lib/vvaultHydration.js';
import { resolveSupabaseUserId } from '../auth/lib/supabaseUserResolver.js';
import { loadCanonicalConstructIdentity } from '../lib/constructIdentityRepository.js';
import {
  getAisRequestUserIds,
  getChattyUserIdFromRequest,
  getPreferredSupabaseUserIdFromRequest,
} from '../lib/aisRequestIdentity.js';
import {
  evaluateConstructSovereignty,
  isConstructSovereigntyError,
} from '../lib/constructSovereigntyPolicy.js';
import { buildSystemConstructSummaryFallback } from '../../src/lib/systemConstructCatalog.js';
import { buildVoiceContractJson, extractVoiceInstructions } from '../lib/voiceContract.js';
import { classifyConstructArtifactPath } from '../lib/artifactClassifier.js';
import { expandHomeDir } from '../lib/vvaultPaths.js';
import {
  applyForgedSimLockToRecord,
  buildOllamaLockedModelFromCallsign,
  readForgedSimLock,
} from '../lib/forgedSimLock.js';
import { buildOwnerCandidateIds, getUserIdsForEmailFromRegistry } from '../lib/aiUserAliases.js';
import { convertImageBufferToPng } from '../lib/avatarCanonicalization.js';

async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    const text = (data.text || '').trim();
    if (text.length > 0) {
      return text;
    }
    return null;
  } catch (err) {
    console.warn(`⚠️ [PDF Extract] Failed to parse PDF: ${err.message}`);
    return null;
  }
}

const router = express.Router();

const aiManager = AIManager.getInstance();
const ROUTES_DIR = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_VVAULT_ROOT_FALLBACK = path.resolve(ROUTES_DIR, '../../../vvault');

// ---- Supabase helpers for metadata hydration ----
const SUPABASE_AIS_COLUMNS = [
  'id',
  'construct_call_sign',
  'name',
  'description',
  'system_prompt_override',
  'model',
  'provider',
  'capabilities',
  'tags',
  'categories',
  'avatar_url',
  'config_json',
  'conversation_starters',
  'user_id'
];

const INVALID_AVATAR_VALUES = new Set(['', 'null', 'undefined', 'avatar']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORCHESTRATION_MODES = new Set(['lin', 'custom', 'sim']);

function normalizeAvatarValue(value) {
  if (typeof value !== 'string') return value || null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (INVALID_AVATAR_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function normalizeAIDLookupId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withoutSyntheticPrefix = trimmed.replace(/^supabase-/i, '');
  if (UUID_RE.test(withoutSyntheticPrefix)) return withoutSyntheticPrefix;
  const rowIdCallsignMatch = withoutSyntheticPrefix.match(/^(?:gpt|ai)-([a-z0-9]+-\d{3})(?:[-_].+)?$/i);
  if (rowIdCallsignMatch) {
    return canonicalizeConstructId(rowIdCallsignMatch[1]) || rowIdCallsignMatch[1];
  }
  return canonicalizeConstructId(withoutSyntheticPrefix) || withoutSyntheticPrefix;
}

function normalizeAIOrchestrationMode(value, fallback = 'lin') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (ORCHESTRATION_MODES.has(normalized)) return normalized;
  return ORCHESTRATION_MODES.has(fallback) ? fallback : 'lin';
}

function deriveSimLockedModel(record = {}) {
  const simLock = readForgedSimLock(record);
  if (simLock?.lockedModel) return simLock.lockedModel;
  const explicitCandidates = [
    record.modelId,
    record.model,
    record.conversationModel,
    record.creativeModel,
    record.codingModel,
  ];
  for (const candidate of explicitCandidates) {
    if (typeof candidate === 'string' && candidate.trim().startsWith('ollama:')) {
      return candidate.trim();
    }
  }

  const callsign = canonicalizeConstructId(
    record.constructCallsign ||
    record.construct_call_sign ||
    record.constructId ||
    record.construct_id ||
    record.id ||
    '',
  );
  if (callsign) {
    return `ollama:${callsign.replace(/-0*\d+$/, '')}`;
  }

  return LIN_MODEL_DEFAULTS.conversation;
}

function normalizeAIModelMetadataForMode(record = {}) {
  if (!record || typeof record !== 'object') return record;
  const forcedSimRecord = applyForgedSimLockToRecord(record);
  if (forcedSimRecord !== record) {
    return forcedSimRecord;
  }

  const configJson = parseJsonMaybe(record.configJson || record.config_json, {}) || {};
  const mode = normalizeAIOrchestrationMode(
    record.orchestrationMode ||
    record.orchestration_mode ||
    configJson.orchestrationMode ||
    configJson.orchestration_mode,
    'lin',
  );
  const primaryModel =
    typeof record.modelId === 'string' && record.modelId.trim()
      ? record.modelId.trim()
      : typeof record.model === 'string' && record.model.trim()
        ? record.model.trim()
        : typeof record.conversationModel === 'string' && record.conversationModel.trim()
          ? record.conversationModel.trim()
          : null;
  const conversationModel =
    typeof record.conversationModel === 'string' && record.conversationModel.trim()
      ? record.conversationModel.trim()
      : primaryModel;

  if (mode === 'lin') {
    return {
      ...record,
      orchestrationMode: 'lin',
      model: LIN_MODEL_DEFAULTS.conversation,
      modelId: LIN_MODEL_DEFAULTS.conversation,
      conversationModel: LIN_MODEL_DEFAULTS.conversation,
      creativeModel: LIN_MODEL_DEFAULTS.creative,
      codingModel: LIN_MODEL_DEFAULTS.coding,
      provider: '',
    };
  }

  if (mode === 'sim') {
    const lockedModel = deriveSimLockedModel(record);
    return {
      ...record,
      orchestrationMode: 'sim',
      model: lockedModel,
      modelId: lockedModel,
      conversationModel: lockedModel,
      creativeModel: lockedModel,
      codingModel: lockedModel,
      provider: 'ollama',
    };
  }

  return {
    ...record,
    orchestrationMode: 'custom',
    model: primaryModel,
    modelId: primaryModel,
    conversationModel,
    creativeModel:
      typeof record.creativeModel === 'string' && record.creativeModel.trim()
        ? record.creativeModel.trim()
        : conversationModel,
    codingModel:
      typeof record.codingModel === 'string' && record.codingModel.trim()
        ? record.codingModel.trim()
        : conversationModel,
  };
}

function buildSovereigntyActor(req, extras = {}) {
  return {
    id: req.user?.id,
    uid: req.user?.uid,
    sub: req.user?.sub,
    email: req.user?.email,
    userId: extras.userId,
    supabaseUserId: extras.supabaseUserId,
    chattyUserId: extras.chattyUserId,
    identifiers: extras.identifiers,
  };
}

function sendSovereigntyPolicyFailure(res, result) {
  return res.status(result.statusCode || 403).json({
    success: false,
    error: result.message || result.reason,
    code: result.reason,
    constructSovereignty: result.receipt,
  });
}

function handleSovereigntyError(res, error) {
  if (!isConstructSovereigntyError(error)) return false;
  sendSovereigntyPolicyFailure(res, error.policyResult);
  return true;
}

function isSameConstructLookup(requestedId, avatarLookup) {
  const requestedConstruct = normalizeAIDLookupId(requestedId);
  const lookupConstruct = normalizeAIDLookupId(avatarLookup?.constructCallsign);
  return Boolean(requestedConstruct && lookupConstruct && requestedConstruct === lookupConstruct);
}

function shouldForbiddenLocalAvatarBlockRequest(requestedId, avatarLookup) {
  if (!avatarLookup?.forbidden) return false;
  if (!avatarLookup?.id || String(avatarLookup.id) !== requestedId) return false;

  // VVAULT identity is the avatar authority. A stale local Chatty row can share
  // a construct callsign such as nova-001 while being owned by "system"; that
  // must not block /api/ais/:construct/avatar from checking canonical VVAULT
  // avatar rows. Exact local-only AI ids still fail closed below.
  return !isSameConstructLookup(requestedId, avatarLookup);
}

function canRecoverLegacyAvatarForRequest({ req, requestedId, avatarLookup, userId, chattyUserId }) {
  if (!avatarLookup?.forbidden || !avatarLookup?.rawAvatarPath || !avatarLookup?.userId) {
    return false;
  }
  if (!isSameConstructLookup(requestedId, avatarLookup)) {
    return false;
  }

  const sameEmailUserIds = getUserIdsForEmailFromRegistry(req.user?.email);
  sameEmailUserIds.add(String(userId || ''));
  sameEmailUserIds.add(String(chattyUserId || ''));
  sameEmailUserIds.delete('');
  return sameEmailUserIds.has(String(avatarLookup.userId));
}

function getAIDLookupCandidates(value) {
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  const candidates = [trimmed];
  const normalized = normalizeAIDLookupId(trimmed);
  if (normalized) {
    candidates.push(normalized);
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

function buildSummaryAvatarUrl({ id, constructCallsign, rawAvatar }) {
  const avatar = normalizeAvatarValue(rawAvatar);
  if (avatar && (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/api/'))) {
    if (constructCallsign && /^\/api\/ais\/[^/]+\/avatar(?:[?#].*)?$/i.test(avatar)) {
      return `/api/ais/${encodeURIComponent(constructCallsign)}/avatar`;
    }
    return avatar;
  }
  if (constructCallsign && avatar && (avatar.startsWith('data:image/') || avatar.startsWith('instances/'))) {
    return `/api/ais/${encodeURIComponent(constructCallsign)}/avatar`;
  }
  if (avatar && avatar.startsWith('instances/') && id) {
    return `/api/ais/${encodeURIComponent(id)}/avatar`;
  }
  return avatar;
}

function decodeAvatarDataUrl(avatarValue) {
  const avatar = normalizeAvatarValue(avatarValue);
  if (!avatar || !avatar.startsWith('data:image/')) return null;
  const match = avatar.match(/^data:(image\/[^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!match) return null;
  try {
    return {
      contentType: match[1].toLowerCase(),
      buffer: Buffer.from(match[2], 'base64'),
    };
  } catch {
    return null;
  }
}

async function upsertCanonicalAvatarVaultRow({ supabase, supabaseUserId, constructCallsign, buffer }) {
  const filename = `instances/${constructCallsign}/identity/avatar.png`;
  const base64Content = buffer.toString('base64');
  const metadata = {
    source: 'chatty-ai-avatar',
    contentType: 'image/png',
    mimeType: 'image/png',
    constructCallsign,
    normalizedAt: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await supabase
    .from('vault_files')
    .select('id')
    .eq('user_id', supabaseUserId)
    .eq('filename', filename)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`avatar lookup failed: ${existingError.message}`);
  }

  const rowPayload = {
    user_id: supabaseUserId,
    filename,
    content: base64Content,
    file_type: 'image/png',
    construct_id: constructCallsign,
    metadata,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('vault_files')
      .update({
        content: rowPayload.content,
        file_type: rowPayload.file_type,
        metadata: rowPayload.metadata,
        construct_id: rowPayload.construct_id,
      })
      .eq('id', existing.id);
    if (error) {
      throw new Error(`avatar update failed: ${error.message}`);
    }
  } else {
    const { error } = await supabase.from('vault_files').insert(rowPayload);
    if (error) {
      throw new Error(`avatar insert failed: ${error.message}`);
    }
  }

  return filename;
}

async function resolveCanonicalSupabaseAvatarValue({
  supabase,
  supabaseUserId,
  constructCallsign,
  avatarValue,
  existingAvatar = null,
}) {
  if (avatarValue === undefined) {
    return normalizeAvatarValue(existingAvatar);
  }
  const avatar = normalizeAvatarValue(avatarValue);
  const fallback = normalizeAvatarValue(existingAvatar);
  const canonicalPath = constructCallsign
    ? `instances/${constructCallsign}/identity/avatar.png`
    : null;

  if (avatar === null || avatar === '') {
    return null;
  }
  if (!constructCallsign) {
    return avatar;
  }
  if (avatar === canonicalPath) {
    return avatar;
  }
  if (/^\/api\/ais\/[^/]+\/avatar(?:[?#].*)?$/i.test(avatar)) {
    return canonicalPath;
  }

  const decodedAvatar = decodeAvatarDataUrl(avatar);
  if (decodedAvatar) {
    const pngBuffer = await convertImageBufferToPng(decodedAvatar.buffer, decodedAvatar.contentType);
    await upsertCanonicalAvatarVaultRow({
      supabase,
      supabaseUserId,
      constructCallsign,
      buffer: pngBuffer,
    });
    return canonicalPath;
  }

  if (/^instances\/.+\/identity\/avatar\.(png|jpe?g|webp|avif|svg|gif)$/i.test(avatar)) {
    if (/\/avatar\.png$/i.test(avatar)) {
      return avatar;
    }
    console.warn(
      `⚠️ [AIs API] Avatar compatibility path cannot satisfy canonical PNG conversion without bytes: ${avatar}`,
    );
    return avatar;
  }

  return avatar;
}

function buildRequestOwnerCandidateIds(req, userId = null, chattyUserId = null) {
  return buildOwnerCandidateIds({
    userId,
    chattyUserId,
    email: req.user?.email || null,
  });
}

function sendAvatarNotFound(res) {
  return res.status(404).json({ error: 'avatar_not_found' });
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendAvatarPlaceholder(res, requestedId = '') {
  const normalized = canonicalizeConstructId(requestedId) || normalizeAIDLookupId(requestedId) || 'ai';
  const digest = crypto.createHash('sha256').update(normalized).digest('hex');
  const hue = parseInt(digest.slice(0, 2), 16);
  const initial = escapeSvgText((normalized.match(/[a-z0-9]/i)?.[0] || 'A').toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="AI avatar"><rect width="96" height="96" rx="48" fill="hsl(${hue},55%,32%)"/><circle cx="67" cy="25" r="13" fill="rgba(255,255,255,.16)"/><text x="48" y="58" text-anchor="middle" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="38" font-weight="700" fill="white">${initial}</text></svg>`;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie, Authorization');
  return res.status(200).send(svg);
}

function parseAvatarMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object' && !Array.isArray(metadata)) return metadata;
  if (typeof metadata !== 'string') return {};
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function inferAvatarContentType(row = {}) {
  const metadata = parseAvatarMetadata(row.metadata);
  const metadataType = metadata.contentType || metadata.mimeType;
  if (typeof metadataType === 'string' && metadataType.trim()) return metadataType.trim();
  if (typeof row.file_type === 'string' && row.file_type.startsWith('image/')) return row.file_type;
  const sourcePath = row.storage_path || row.filename || '';
  const ext = path.extname(sourcePath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function decodeDataImageAvatar(value) {
  const avatar = normalizeAvatarValue(value);
  if (!avatar || !avatar.startsWith('data:image/')) return null;
  const match = avatar.match(/^data:(image\/[^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], 'base64');
    return buffer.length > 0 ? { buffer, contentType: match[1] } : null;
  } catch {
    return null;
  }
}

function decodeAvatarContent(content) {
  if (!content) return null;
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (content instanceof ArrayBuffer) return Buffer.from(content);
  if (typeof content !== 'string') return null;

  const dataUrlMatch = content.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (dataUrlMatch) return Buffer.from(dataUrlMatch[1], 'base64');
  if (content.startsWith('\\x')) return Buffer.from(content.slice(2), 'hex');
  if (content.startsWith('0x')) return Buffer.from(content.slice(2), 'hex');
  return Buffer.from(content, 'base64');
}

function buildCanonicalAvatarFilenames(constructId) {
  return [
    `instances/${constructId}/identity/avatar.png`,
    `instances/${constructId}/identity/avatar.jpg`,
    `instances/${constructId}/identity/avatar.jpeg`,
    `instances/${constructId}/identity/avatar.webp`,
    `instances/${constructId}/identity/avatar.avif`,
    `instances/${constructId}/identity/avatar.svg`,
    `instances/${constructId}/identity/avatar.gif`,
  ];
}

function normalizeAvatarPathCandidate(value) {
  const avatar = normalizeAvatarValue(value);
  if (!avatar) return null;
  if (avatar.startsWith('/')) return avatar.slice(1);
  return avatar;
}

function extractConstructIdFromAvatarPath(value) {
  const avatar = normalizeAvatarPathCandidate(value);
  if (!avatar) return null;
  const match = avatar.match(/^instances\/([^/]+)\/(?:identity|assets)\/avatar\.[a-z0-9]+$/i);
  if (!match) return null;
  return canonicalizeConstructId(match[1]) || match[1];
}

function getAvatarConstructCandidates(requestedId, avatarLookup = null) {
  const candidates = [
    avatarLookup?.constructCallsign,
    extractAvatarApiConstructId(avatarLookup?.rawAvatarPath),
    extractConstructIdFromAvatarPath(avatarLookup?.rawAvatarPath),
    normalizeAIDLookupId(requestedId),
    canonicalizeConstructId(requestedId) || requestedId,
  ];
  return Array.from(new Set(candidates.map((id) => (id ? canonicalizeConstructId(id) || id : null)).filter(Boolean)));
}

function getAvatarPathCandidates(constructIds, rawAvatarPath = null) {
  const paths = new Set();
  const normalizedRawPath = normalizeAvatarPathCandidate(rawAvatarPath);
  for (const constructId of constructIds || []) {
    for (const filename of buildCanonicalAvatarFilenames(constructId)) {
      paths.add(filename);
    }
  }
  if (normalizedRawPath && normalizedRawPath.startsWith('instances/')) {
    paths.add(normalizedRawPath);
  }
  return Array.from(paths);
}

const VAULT_AVATAR_COLUMNS = 'id,user_id,construct_id,filename,content,storage_path,file_type,metadata,sha256,created_at';

async function fetchSupabaseAvatarRow({ supabase, supabaseUserId, constructIds, pathCandidates }) {
  if (!supabase || !supabaseUserId) return null;
  const constructs = Array.from(new Set((constructIds || []).filter(Boolean)));
  const paths = Array.from(new Set((pathCandidates || []).filter(Boolean)));
  if (constructs.length === 0 && paths.length === 0) return null;

  const runQuery = async (label, buildQuery) => {
    try {
      const { data, error } = await buildQuery(
        supabase
          .from('vault_files')
          .select(VAULT_AVATAR_COLUMNS)
          .eq('user_id', supabaseUserId)
          .or('content.not.is.null,storage_path.not.is.null')
          .order('created_at', { ascending: false })
          .limit(1)
      ).maybeSingle();

      if (error) {
        console.warn(`⚠️ [AIs API] Avatar lookup failed (${label}):`, error.message);
        return null;
      }
      return data || null;
    } catch (error) {
      console.warn(`⚠️ [AIs API] Avatar lookup threw (${label}):`, error.message);
      return null;
    }
  };

  for (const constructId of constructs) {
    if (paths.length > 0) {
      const byFilename = await runQuery(`${constructId}:filename`, (query) =>
        query.eq('construct_id', constructId).in('filename', paths)
      );
      if (byFilename) return byFilename;

      const byStoragePath = await runQuery(`${constructId}:storage_path`, (query) =>
        query.eq('construct_id', constructId).in('storage_path', paths)
      );
      if (byStoragePath) return byStoragePath;
    }

    const constructOnly = await runQuery(`${constructId}:construct`, (query) =>
      query
        .eq('construct_id', constructId)
        .in('filename', buildCanonicalAvatarFilenames(constructId))
    );
    if (constructOnly) return constructOnly;
  }

  if (paths.length > 0) {
    const byFilename = await runQuery('path:filename', (query) =>
      query.in('filename', paths)
    );
    if (byFilename) return byFilename;

    const byStoragePath = await runQuery('path:storage_path', (query) =>
      query.in('storage_path', paths)
    );
    if (byStoragePath) return byStoragePath;
  }

  return null;
}

async function sendSupabaseAvatarRow(res, supabase, row, constructId) {
  if (!row) return false;
  let buffer = null;
  if (row.content) {
    buffer = decodeAvatarContent(row.content);
  } else if (row.storage_path && supabase) {
    const { data: storageData, error: storageError } = await supabase.storage
      .from('vault-files')
      .download(row.storage_path);

    if (storageError || !storageData) {
      console.warn(`⚠️ [AIs API] Avatar storage download failed for ${constructId}:`, storageError?.message || 'missing storage blob');
      return false;
    }

    const arrayBuffer = await storageData.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  }

  if (!buffer || buffer.length === 0) return false;

  res.setHeader('Content-Type', inferAvatarContentType(row));
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie, Authorization');
  res.send(buffer);
  return true;
}

async function sendLegacyAvatarLookup(res, avatarLookup = null) {
  const rawAvatarPath = normalizeAvatarValue(avatarLookup?.rawAvatarPath);
  if (!rawAvatarPath) return false;

  const decoded = decodeAvatarDataUrl(rawAvatarPath);
  if (decoded?.buffer?.length) {
    res.setHeader('Content-Type', decoded.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Cookie, Authorization');
    res.send(decoded.buffer);
    return true;
  }

  if (!rawAvatarPath.startsWith('instances/') || !avatarLookup?.userId) {
    return false;
  }

  let vvaultRoot = process.env.VVAULT_ROOT_PATH || LEGACY_VVAULT_ROOT_FALLBACK;
  try {
    const config = await import('../../vvaultConnector/config.js');
    vvaultRoot = config.VVAULT_ROOT || vvaultRoot;
  } catch {
    // Keep fallback root.
  }
  vvaultRoot = path.resolve(expandHomeDir(vvaultRoot));

  const localPath = path.join(vvaultRoot, 'users', 'shard_0000', avatarLookup.userId, rawAvatarPath);
  try {
    const buffer = await fs.promises.readFile(localPath);
    if (!buffer.length) return false;
    const ext = path.extname(rawAvatarPath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.avif': 'image/avif',
      '.svg': 'image/svg+xml',
      '.gif': 'image/gif',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Cookie, Authorization');
    res.send(buffer);
    return true;
  } catch {
    return false;
  }
}

async function sendLocalVvaultIdentityAvatar(res, userId, constructId) {
  if (!userId || !constructId) return false;
  for (const rawAvatarPath of buildCanonicalAvatarFilenames(constructId)) {
    if (await sendLegacyAvatarLookup(res, { userId, rawAvatarPath })) {
      return true;
    }
  }
  return false;
}

async function sendLocalVvaultIdentityAvatarForOwners(res, ownerIds, constructIds) {
  const owners = Array.from(new Set(Array.from(ownerIds || []).filter(Boolean)));
  const constructs = Array.from(new Set(Array.from(constructIds || []).filter(Boolean)));
  for (const ownerId of owners) {
    for (const constructId of constructs) {
      if (await sendLocalVvaultIdentityAvatar(res, ownerId, constructId)) {
        return true;
      }
    }
  }
  return false;
}

function isApiAvatarUrl(value) {
  return typeof value === 'string' && /^\/api\/ais\/[^/]+\/avatar(?:[?#].*)?$/i.test(value.trim());
}

function extractAvatarApiConstructId(value) {
  if (!isApiAvatarUrl(value)) return null;
  const match = value.trim().match(/^\/api\/ais\/([^/]+)\/avatar(?:[?#].*)?$/i);
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  return canonicalizeConstructId(decoded) || decoded;
}

function getSummaryConstructId(ai = {}) {
  const explicit =
    ai.constructCallsign ||
    ai.construct_call_sign ||
    ai.constructId ||
    ai.construct_id ||
    null;
  if (explicit) {
    return canonicalizeConstructId(explicit) || explicit;
  }

  const avatarConstructId =
    extractAvatarApiConstructId(ai.avatar) ||
    extractAvatarApiConstructId(ai.avatarUrl);
  if (avatarConstructId) return avatarConstructId;

  if (ai.id) {
    return canonicalizeConstructId(ai.id) || ai.id;
  }
  return null;
}

function withSummaryAvatar(ai, avatar) {
  return {
    ...ai,
    avatar,
    avatarUrl: avatar,
  };
}

async function fetchAvailableAvatarConstructIds({ supabase, supabaseUserId, constructIds }) {
  if (!supabase || !supabaseUserId || !Array.isArray(constructIds) || constructIds.length === 0) {
    return null;
  }

  const canonicalIds = Array.from(
    new Set(
      constructIds
        .map((id) => canonicalizeConstructId(id) || id)
        .filter(Boolean)
    )
  );

  if (canonicalIds.length === 0) return new Set();

  const canonicalFilenames = Array.from(
    new Set(canonicalIds.flatMap((constructId) => buildCanonicalAvatarFilenames(constructId)))
  );

  const { data, error } = await supabase
    .from('vault_files')
    .select('construct_id,filename,storage_path')
    .eq('user_id', supabaseUserId)
    .in('construct_id', canonicalIds)
    .in('filename', canonicalFilenames)
    .or('content.not.is.null,storage_path.not.is.null');

  if (error) {
    console.warn('⚠️ [AIs API] Avatar availability lookup failed:', error.message);
    return null;
  }

  const available = new Set();
  for (const row of data || []) {
    if (row?.construct_id) {
      available.add(canonicalizeConstructId(row.construct_id) || row.construct_id);
    }
  }
  return available;
}

async function applySummaryAvatarAvailability(ais, supabaseContext) {
  if (!Array.isArray(ais) || ais.length === 0) return ais || [];

  const apiAvatarConstructIds = ais
    .filter((ai) => isApiAvatarUrl(ai?.avatar) || isApiAvatarUrl(ai?.avatarUrl))
    .map(getSummaryConstructId)
    .filter(Boolean);

  if (apiAvatarConstructIds.length === 0) return ais;

  const availableAvatarIds = await fetchAvailableAvatarConstructIds({
    supabase: supabaseContext?.supabase,
    supabaseUserId: supabaseContext?.supabaseUserId,
    constructIds: apiAvatarConstructIds,
  });

  return ais.map((ai) => {
    const avatar = normalizeAvatarValue(ai?.avatar || ai?.avatarUrl);
    if (!isApiAvatarUrl(avatar)) return ai;

    const constructId = getSummaryConstructId(ai);
    if (availableAvatarIds?.has(constructId)) {
      return withSummaryAvatar(ai, `/api/ais/${encodeURIComponent(constructId)}/avatar`);
    }

    return ai;
  });
}

async function hydrateAISummaryAvatarsFromVVAULT(
  ais,
  {
    userId = null,
    userEmail = null,
    mergeFromVVAULTImpl = mergeFromVVAULT,
  } = {},
) {
  if (!Array.isArray(ais) || ais.length === 0) return ais || [];

  return Promise.all(
    ais.map(async (ai) => {
      const existingAvatar = normalizeAvatarValue(ai?.avatar || ai?.avatarUrl);
      if (existingAvatar) return ai;

      const constructId = getSummaryConstructId(ai);
      if (!constructId) return ai;

      const outcome = await withTimeoutResult(
        mergeFromVVAULTImpl(constructId, userId || ai.userId || ai.user_id || null, userEmail),
        AI_SUMMARY_VVAULT_AVATAR_TIMEOUT_MS,
        `GET /api/ais VVAULT avatar summary ${constructId}`,
      );

      if (outcome.status !== 'ok' || !outcome.value?.hasAvatar) {
        if (outcome.status !== 'ok') {
          console.warn(`⚠️ [AIs API] VVAULT avatar summary ${outcome.status} for ${constructId}:`, outcome.error);
        }
        return ai;
      }

      return withSummaryAvatar(ai, `/api/ais/${encodeURIComponent(constructId)}/avatar`);
    }),
  );
}

function mapSupabaseAisRow(row = {}) {
  const constructCallsign = row.construct_call_sign || row.constructCallsign || row.id;
  const caps = typeof row.capabilities === 'string' ? (() => { try { return JSON.parse(row.capabilities); } catch { return row.capabilities; } })() : (row.capabilities || {});
  const avatar = buildSummaryAvatarUrl({
    id: row.id,
    constructCallsign,
    rawAvatar: row.avatar_url || row.avatarUrl || row.avatar || null,
  });
  return normalizeAIModelMetadataForMode({
    id: row.id,
    constructCallsign,
    name: row.name || '',
    description: row.description || '',
    instructions: row.system_prompt_override || row.instructions || '',
    systemPromptOverride: row.system_prompt_override || row.instructions || '',
    model: row.model || row.model_id || row.modelId,
    provider: row.provider || null,
    capabilities: caps,
    tags: row.tags || [],
    categories: row.categories || [],
    avatar,
    avatarUrl: avatar,
    configJson: row.config_json || row.configJson || null,
    conversationStarters: row.conversation_starters || row.conversationStarters || [],
    files: [],
    actions: [],
    hasPersistentMemory: true,
    isActive: true,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    userId: row.user_id || null,
  });
}

async function resolveSupabaseContext(req) {
  const supabase = getSupabaseClient();
  if (!supabase) return { supabase: null, supabaseUserId: null };
  const directSupabaseUserId = getPreferredSupabaseUserIdFromRequest(req);
  if (directSupabaseUserId) {
    return { supabase, supabaseUserId: directSupabaseUserId };
  }
  const chattyUserId = getChattyUserIdFromRequest(req);
  const email = req.user?.email || null;
  try {
    const { supabaseUserId } = await resolveSupabaseUserId({ email, chattyUserId });
    return { supabase, supabaseUserId: supabaseUserId || null };
  } catch (err) {
    console.warn('[AIs API] Supabase resolver failed:', err.message);
    return { supabase, supabaseUserId: null };
  }
}

async function fetchSupabaseAIs({ supabase, supabaseUserId }) {
  if (!supabase || !supabaseUserId) return null;
  const query = supabase
    .from('ais')
    .select(SUPABASE_AIS_COLUMNS.join(','))
    .eq('user_id', supabaseUserId);
  const { data, error } = await query;
  if (error) {
    console.warn('⚠️ [AIs API] Supabase list failed:', error.message);
    return null;
  }
  return (data || []).map(mapSupabaseAisRow);
}

const AI_SUMMARY_SUPABASE_TIMEOUT_MS = Number(process.env.AI_SUMMARY_SUPABASE_TIMEOUT_MS || 1500);
const AI_SUMMARY_SUPABASE_MERGE_GRACE_MS = Number(process.env.AI_SUMMARY_SUPABASE_MERGE_GRACE_MS || 200);
const AI_SUMMARY_USER_RESOLVE_TIMEOUT_MS = Number(process.env.AI_SUMMARY_USER_RESOLVE_TIMEOUT_MS || 900);
const AI_SUMMARY_LOCAL_TIMEOUT_MS = Number(process.env.AI_SUMMARY_LOCAL_TIMEOUT_MS || 1200);
const AI_SUMMARY_VVAULT_AVATAR_TIMEOUT_MS = Number(process.env.AI_SUMMARY_VVAULT_AVATAR_TIMEOUT_MS || 900);

function safeTimeoutMs(rawValue, fallback) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function withTimeoutResult(promise, timeoutMs, label) {
  const boundedMs = safeTimeoutMs(timeoutMs, 1500);
  let timeoutId = null;
  try {
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({ status: 'timeout', value: null, error: `${label} timed out after ${boundedMs}ms` });
      }, boundedMs);
    });
    const settled = await Promise.race([
      Promise.resolve(promise)
        .then((value) => ({ status: 'ok', value, error: null }))
        .catch((error) => ({ status: 'error', value: null, error: error?.message || String(error) })),
      timeoutPromise,
    ]);
    return settled;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function resolveUserIdForSummary(req, label = 'AI summary user resolution') {
  const fallbackChattyUserId = getChattyUserIdFromRequest(req);
  const resolution = await withTimeoutResult(resolveUserId(req), AI_SUMMARY_USER_RESOLVE_TIMEOUT_MS, label);

  if (resolution.status === 'ok' && resolution.value?.userId) {
    return {
      userId: resolution.value.userId,
      chattyUserId: resolution.value.chattyUserId || fallbackChattyUserId,
      resolutionStatus: 'ok',
      usedFallback: false,
    };
  }

  if (fallbackChattyUserId) {
    console.warn(`⚠️ [AIs API] ${label} ${resolution.status}; using chatty fallback ID`);
    return {
      userId: fallbackChattyUserId,
      chattyUserId: fallbackChattyUserId,
      resolutionStatus: resolution.status,
      usedFallback: true,
    };
  }

  return {
    userId: null,
    chattyUserId: null,
    resolutionStatus: resolution.status,
    usedFallback: false,
  };
}

async function verifyAIOwnershipSummaryBounded(req, aiId) {
  const resolved = await resolveUserIdForSummary(req, `GET /api/ais/${aiId} user resolution`);
  const { userId, chattyUserId } = resolved;
  if (!userId) return { allowed: false, ai: null, userId: null, chattyUserId: null, resolutionStatus: resolved.resolutionStatus };
  const ownerCandidateIds = buildRequestOwnerCandidateIds(req, userId, chattyUserId);

  const lookupCandidates = getAIDLookupCandidates(aiId);
  let ai = null;
  for (const lookupId of lookupCandidates) {
    ai = await aiManager.getAISummary(lookupId, userId, { chattyUserId, email: req.user?.email || null });
    if (ai) break;
  }
  if (!ai && chattyUserId && chattyUserId !== userId) {
    for (const lookupId of lookupCandidates) {
      ai = await aiManager.getAISummary(lookupId, chattyUserId, { chattyUserId, email: req.user?.email || null });
      if (ai) break;
    }
  }

  if (!ai) {
    return { allowed: false, ai: null, userId, chattyUserId, resolutionStatus: resolved.resolutionStatus };
  }

  const ownerMatch = ownerCandidateIds.has(String(ai.userId || ''));
  return { allowed: ownerMatch, ai, userId, chattyUserId, resolutionStatus: resolved.resolutionStatus };
}

function mergeDefinedFields(base, preferred) {
  const merged = { ...(base || {}) };
  for (const [key, value] of Object.entries(preferred || {})) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

function getAISummaryKey(ai = {}) {
  const callsign = ai.constructCallsign || ai.construct_call_sign || null;
  if (callsign) return `callsign:${String(callsign).toLowerCase()}`;
  if (ai.id) return `id:${String(ai.id).toLowerCase()}`;
  return null;
}

function mergeAISummaries(localAIs = [], supabaseAIs = []) {
  const mergedByKey = new Map();
  const orderedKeys = [];

  for (const ai of localAIs || []) {
    const key = getAISummaryKey(ai) || `local:${orderedKeys.length}`;
    if (!mergedByKey.has(key)) {
      orderedKeys.push(key);
      mergedByKey.set(key, ai);
      continue;
    }
    mergedByKey.set(key, mergeDefinedFields(mergedByKey.get(key), ai));
  }

  for (const ai of supabaseAIs || []) {
    const key = getAISummaryKey(ai) || `supabase:${orderedKeys.length}`;
    if (!mergedByKey.has(key)) {
      orderedKeys.push(key);
      mergedByKey.set(key, ai);
      continue;
    }
    // Supabase wins on field conflicts.
    mergedByKey.set(key, mergeDefinedFields(mergedByKey.get(key), ai));
  }

  return orderedKeys.map((key) => mergedByKey.get(key)).filter(Boolean);
}

function stripAIFileContent(ai) {
  if (!ai || typeof ai !== 'object') return ai;
  return {
    ...ai,
    files: Array.isArray(ai.files)
      ? ai.files.map((file) => ({
          ...file,
          content: '',
        }))
      : [],
  };
}

function isEmptyHydrationValue(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

async function hydrateAIDetailFromVVAULT(ai, userId = null, userEmail = null) {
  if (!ai || typeof ai !== 'object') return ai;
  const constructCallsign = canonicalizeConstructId(
    ai.constructCallsign || ai.construct_call_sign || ai.constructId || ai.construct_id || ai.id,
  );
  if (!constructCallsign) return ai;

  const vvault = await mergeFromVVAULT(constructCallsign, userId || ai.userId || ai.user_id || null, userEmail);
  const hydrated = { ...ai };

  const fill = (key, value) => {
    if (!isEmptyHydrationValue(value) && isEmptyHydrationValue(hydrated[key])) {
      hydrated[key] = value;
    }
  };

  fill('name', vvault.name);
  fill('description', vvault.description);
  fill('instructions', vvault.instructions);
  fill('systemPromptOverride', vvault.instructions);
  fill('conditioning', vvault.conditioning);
  fill('physicalFeatures', vvault.physicalFeatures);
  fill('definition', vvault.definition);
  fill('voice', vvault.voice);

  if (vvault.hasAvatar && isEmptyHydrationValue(hydrated.avatar) && isEmptyHydrationValue(hydrated.avatarUrl)) {
    hydrated.avatar = `/api/ais/${encodeURIComponent(constructCallsign)}/avatar`;
    hydrated.avatarUrl = hydrated.avatar;
  }

  return normalizeAIModelMetadataForMode(hydrated);
}

function setAISourceHeaders(res, source, supabaseStatus = null) {
  if (!res.headersSent) {
    res.setHeader('X-Chatty-AIs-Source', source);
    if (supabaseStatus) {
      res.setHeader('X-Chatty-AIs-Supabase', supabaseStatus);
    }
  }
}

const DEFAULT_AI_CAPABILITIES = {
  webSearch: false,
  canvas: false,
  imageGeneration: false,
  codeInterpreter: false,
  agent: false,
  proactiveInitiation: false,
};

function parseJsonMaybe(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function coerceStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
}

function parsePromptText(content = '') {
  const text = typeof content === 'string' ? content : '';
  const nameMatch = text.match(/^Name:\s*(.+)/m);
  const descMatch = text.match(/^Description:\s*(.+)/m);
  const instrStart = text.indexOf('Instructions:');
  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : '',
    instructions: instrStart > -1 ? text.substring(instrStart + 'Instructions:'.length).trim() : text.trim(),
  };
}

function mapSupabaseVaultPromptFileToAI(file = {}, fallbackCallsign, requestedId, ownerUserId) {
  const callsign = canonicalizeConstructId(file.construct_id || fallbackCallsign || requestedId || '') || fallbackCallsign || requestedId;
  const filename = file.filename || '';
  const content = typeof file.content === 'string' ? file.content : '';
  const parsed = filename.endsWith('prompt.json')
    ? parseJsonMaybe(content, {})
    : parsePromptText(content);

  const config = parsed?.config && typeof parsed.config === 'object' ? parsed.config : {};
  const models = parsed?.models && typeof parsed.models === 'object' ? parsed.models : {};
  const capabilities = parsed?.capabilities && typeof parsed.capabilities === 'object'
    ? parsed.capabilities
    : DEFAULT_AI_CAPABILITIES;
  const instructions =
    parsed?.instructions ||
    parsed?.systemPromptOverride ||
    parsed?.system_prompt_override ||
    parsed?.prompt ||
    '';
  const conversationStarters = coerceStringArray(
    parsed?.conversationStarters || parsed?.conversation_starters || []
  );
  const modelId =
    parsed?.modelId ||
    parsed?.model ||
    models.primary ||
    config.modelId ||
    config.model ||
    null;

  return normalizeAIModelMetadataForMode({
    id: requestedId && /^supabase-/i.test(requestedId) ? requestedId : `supabase-${callsign}`,
    constructCallsign: callsign,
    name: parsed?.name || parsed?.displayName || callsign,
    displayName: parsed?.displayName || parsed?.name || callsign,
    fullName:
      parsed?.fullName ||
      parsed?.configJson?.fullName ||
      parsed?.displayName ||
      parsed?.name ||
      callsign,
    aliases: Array.isArray(parsed?.aliases)
      ? parsed.aliases.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : (Array.isArray(parsed?.configJson?.aliases)
          ? parsed.configJson.aliases.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
          : []),
    description: parsed?.description || '',
    instructions,
    systemPromptOverride: instructions,
    conversationStarters,
    avatar: null,
    avatarUrl: null,
    capabilities,
    tags: Array.isArray(parsed?.tags) ? parsed.tags : (Array.isArray(config.tags) ? config.tags : []),
    categories: Array.isArray(parsed?.categories) ? parsed.categories : (Array.isArray(config.categories) ? config.categories : []),
    canonRefs: Array.isArray(parsed?.canonRefs)
      ? parsed.canonRefs
      : (Array.isArray(parsed?.configJson?.canonRefs) ? parsed.configJson.canonRefs : []),
    knowledgeRefs: Array.isArray(parsed?.knowledgeRefs)
      ? parsed.knowledgeRefs
      : (Array.isArray(parsed?.configJson?.knowledgeRefs) ? parsed.configJson.knowledgeRefs : []),
    configJson: Object.prototype.hasOwnProperty.call(parsed || {}, 'configJson') ? parsed.configJson : null,
    model: modelId,
    modelId,
    conversationModel: parsed?.conversationModel || models.conversation || modelId,
    creativeModel: parsed?.creativeModel || models.creative || modelId,
    codingModel: parsed?.codingModel || models.coding || modelId,
    provider: parsed?.provider || config.provider || null,
    orchestrationMode:
      parsed?.orchestrationMode ||
      parsed?.orchestration_mode ||
      config.orchestrationMode ||
      config.orchestration_mode ||
      'lin',
    memoryEnabled: parsed?.memoryEnabled ?? config.memoryEnabled ?? true,
    memoryProfile: parsed?.memoryProfile || config.memoryProfile || 'continuitygpt',
    roleplayEnabled: parsed?.roleplayEnabled ?? config.roleplayEnabled ?? true,
    files: [],
    actions: [],
    hasPersistentMemory: parsed?.hasPersistentMemory ?? config.hasPersistentMemory ?? true,
    isActive: true,
    privacy: 'private',
    createdAt: file.created_at || new Date().toISOString(),
    updatedAt: file.updated_at || file.created_at || new Date().toISOString(),
    userId: ownerUserId || file.user_id || null,
  });
}

async function fetchSupabaseAI({ supabase, supabaseUserId, idOrCallsign }) {
  if (!supabase || !supabaseUserId || !idOrCallsign) return null;
  const canonical = normalizeAIDLookupId(idOrCallsign);
  const { data, error } = await supabase
    .from('ais')
    .select(SUPABASE_AIS_COLUMNS.join(','))
    .or(`id.eq.${canonical},construct_call_sign.eq.${canonical}`)
    .eq('user_id', supabaseUserId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('⚠️ [AIs API] Supabase fetch failed:', error.message);
    return null;
  }
  return data ? mapSupabaseAisRow(data) : null;
}

async function fetchSupabaseVaultIdentityAI({ supabase, supabaseUserId, idOrCallsign }) {
  if (!supabase || !supabaseUserId || !idOrCallsign) return null;
  const callsign = normalizeAIDLookupId(idOrCallsign);
  if (!callsign) return null;

  const constructVariants = Array.from(new Set([
    callsign,
    callsign.replace(/-\d+$/, ''),
  ].filter(Boolean)));

  for (const constructId of constructVariants) {
    const promptFilenames = [
      `instances/${constructId}/identity/prompt.json`,
      `instances/${constructId}/identity/prompt.txt`,
    ];

    const byConstruct = await supabase
      .from('vault_files')
      .select('id,filename,content,metadata,construct_id,user_id,created_at')
      .eq('user_id', supabaseUserId)
      .eq('construct_id', constructId)
      .in('filename', promptFilenames)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byConstruct.error) {
      console.warn(`⚠️ [AIs API] Supabase vault identity lookup failed for ${constructId}:`, byConstruct.error.message);
    } else if (byConstruct.data) {
      return mapSupabaseVaultPromptFileToAI(byConstruct.data, callsign, idOrCallsign, supabaseUserId);
    }

    const byFilename = await supabase
      .from('vault_files')
      .select('id,filename,content,metadata,construct_id,user_id,created_at')
      .eq('user_id', supabaseUserId)
      .in('filename', promptFilenames)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byFilename.error) {
      console.warn(`⚠️ [AIs API] Supabase vault filename lookup failed for ${constructId}:`, byFilename.error.message);
    } else if (byFilename.data) {
      return mapSupabaseVaultPromptFileToAI(byFilename.data, callsign, idOrCallsign, supabaseUserId);
    }
  }

  return null;
}

async function upsertSupabaseAI({ supabase, supabaseUserId, payload }) {
  if (!supabase || !supabaseUserId || !payload) return null;
  const canonical = canonicalizeConstructId(payload.construct_call_sign || payload.constructCallsign || payload.id || '');
  if (canonical) payload.construct_call_sign = canonical;
  payload.user_id = payload.user_id || supabaseUserId;

  const { data, error } = await supabase
    .from('ais')
    .upsert(payload, { onConflict: 'construct_call_sign' })
    .select(SUPABASE_AIS_COLUMNS.join(','))
    .limit(1)
    .single();
  if (error) {
    console.warn('⚠️ [AIs API] Supabase upsert failed:', error.message);
    return null;
  }
  return data ? mapSupabaseAisRow(data) : null;
}

function mapToVsiFolder(filename) {
  const lower = filename.toLowerCase();
  const baseName = lower.split('/').pop() || lower;
  if (baseName.endsWith('.capsule') || baseName.endsWith('.capsuleso')) return 'memup/';
  if (baseName.startsWith('chat_with_') && baseName.endsWith('.md')) return 'chatty/';
  if (baseName === 'prompt.json' || baseName === 'prompt.txt') return 'identity/';
  if (baseName === 'conditioning.txt' || baseName === 'definition.json' || baseName === 'voice.json' || baseName === 'voice.md') return 'identity/';
  if (/^avatar\.(png|jpe?g|webp|avif|svg|gif)$/i.test(baseName)) return 'identity/';
  if (baseName === 'metadata.json' || baseName === 'personality.json' || baseName === 'tone_profile.json') return 'config/';
  if (baseName.endsWith('.log')) return 'logs/';
  if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(baseName)) return 'assets/';
  return 'documents/';
}

function cleanConstructRelativePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\.\./g, '')
    .replace(/\/\//g, '/')
    .replace(/^\//, '');
}

function resolveConstructVaultPlacement({ constructCallsign, relativePath, mimeType }) {
  const cleanPath = cleanConstructRelativePath(relativePath);
  const classification = classifyConstructArtifactPath(cleanPath, { mimeType });
  if (classification.reviewRequired) {
    const error = new Error(classification.reason || 'File requires taxonomy review before canonical storage.');
    error.reviewRequired = true;
    error.artifactClass = classification.artifactClass;
    error.reason = classification.reason;
    throw error;
  }

  const firstSegment = cleanPath.split('/').filter(Boolean)[0] || '';
  const canonicalRelativePath = firstSegment === classification.folder
    ? cleanPath
    : `${classification.folder}/${cleanPath}`;

  return {
    vaultPath: `instances/${constructCallsign}/${canonicalRelativePath}`,
    resolvedFolder: classification.folder,
    fileType: classification.fileType,
    artifactClass: classification.artifactClass,
    classification,
  };
}

async function resolveUserId(req) {
  const { supabaseUserId, chattyUserId } = getAisRequestUserIds(req);
  if (supabaseUserId) {
    return { userId: supabaseUserId, chattyUserId };
  }
  if (!chattyUserId) return { userId: null, chattyUserId: null };
  let userId = chattyUserId;
  try {
    const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
    console.log(`🔍 [resolveUserId] Calling resolveVVAULTUserId with chattyUserId=${chattyUserId}, email=${req.user?.email}`);
    const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email);
    console.log(`🔍 [resolveUserId] resolveVVAULTUserId returned: ${vvaultUserId} (chatty was: ${chattyUserId})`);
    if (vvaultUserId) userId = vvaultUserId;
  } catch (err) {
    console.error(`❌ [resolveUserId] resolveVVAULTUserId FAILED:`, err.message);
  }
  return { userId, chattyUserId };
}

async function verifyAIOwnership(req, aiId) {
  return verifyAIOwnershipWithMode(req, aiId, { includeFull: false });
}

async function verifyAIOwnershipWithMode(req, aiId, options = {}) {
  const { includeFull = false } = options;
  const { userId, chattyUserId } = await resolveUserId(req);
  if (!userId) return { allowed: false, ai: null, userId: null };
  const lookupCandidates = getAIDLookupCandidates(aiId);
  const ownerCandidateIds = buildRequestOwnerCandidateIds(req, userId, chattyUserId);
  let ai = null;
  let forbiddenMatch = null;
  const ownerMatches = (candidate) =>
    !!candidate && ownerCandidateIds.has(String(candidate.userId || ''));

  for (const lookupId of lookupCandidates) {
    ai = includeFull
      ? await aiManager.getAI(lookupId)
      : await aiManager.getAISummary(lookupId, userId);
    if (includeFull && ai && !ownerMatches(ai)) {
      forbiddenMatch = forbiddenMatch || ai;
      ai = null;
      continue;
    }
    if (ai) break;
  }

  if (!ai && chattyUserId && chattyUserId !== userId) {
    for (const lookupId of lookupCandidates) {
      ai = includeFull
        ? await aiManager.getAIByCallsign(lookupId, chattyUserId, { chattyUserId, email: req.user?.email || null })
        : await aiManager.getAISummary(lookupId, chattyUserId, { chattyUserId, email: req.user?.email || null });
      if (ai) break;
    }
  }

  if (!ai && includeFull) {
    for (const lookupId of lookupCandidates) {
      ai = await aiManager.getAIByCallsign(lookupId, userId, { chattyUserId, email: req.user?.email || null });
      if (ai) break;
    }
  }

  if (!ai && forbiddenMatch) {
    const isSystemPlaceholder = includeFull && forbiddenMatch.userId === 'system';
    return {
      allowed: false,
      ai: isSystemPlaceholder ? null : forbiddenMatch,
      userId,
      chattyUserId,
      blockedBySystemPlaceholder: isSystemPlaceholder,
    };
  }
  if (!ai) return { allowed: false, ai: null, userId, chattyUserId };
  const ownerMatch = ownerMatches(ai);
  return { allowed: ownerMatch, ai, userId, chattyUserId };
}

function attachRouteTiming(res, routeName, req = null) {
  const start = Date.now();
  let finalized = false;

  const finalize = (phase = 'response') => {
    if (finalized) return;
    finalized = true;
    const elapsed = Date.now() - start;
    if (!res.headersSent) {
      res.setHeader('X-Chatty-Route-Latency-Ms', String(elapsed));
      res.setHeader('X-Chatty-Route', routeName);
    }
    const method = req?.method || 'GET';
    const url = req?.originalUrl || req?.url || routeName;
    console.log(`⏱️ [AIs API] ${routeName} ${method} ${url} ${elapsed}ms (${phase})`);
  };

  const originalJson = res.json.bind(res);
  res.json = (...args) => {
    finalize('json');
    return originalJson(...args);
  };

  const originalSend = res.send.bind(res);
  res.send = (...args) => {
    finalize('send');
    return originalSend(...args);
  };

  res.on('finish', () => finalize('finish'));
  return finalize;
}

function normalizeModelFields(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const next = { ...payload };
  for (const key of ['modelId', 'conversationModel', 'creativeModel', 'codingModel']) {
    if (typeof next[key] !== 'string') continue;
    const before = next[key];
    const after = normalizeModelString(before);
    if (after && after !== before) {
      console.log(`🤖 [AIs API] Normalized ${key}: "${before}" -> "${after}"`);
      next[key] = after;
    }
  }
  return normalizeAIModelMetadataForMode(next);
}

function applyExistingSimLockToSupabasePayload(existingAI, payload = {}) {
  const nextPayload = { ...payload };
  const simLock = readForgedSimLock(existingAI);
  if (!simLock) return nextPayload;

  const forced = applyForgedSimLockToRecord({
    ...existingAI,
    provider: nextPayload.provider ?? existingAI?.provider,
    modelId: nextPayload.model ?? nextPayload.modelId ?? existingAI?.modelId,
    conversationModel: nextPayload.model ?? nextPayload.modelId ?? existingAI?.conversationModel,
    configJson: Object.prototype.hasOwnProperty.call(nextPayload, 'config_json')
      ? nextPayload.config_json
      : (existingAI?.configJson || null),
  }, {
    lockedModel: simLock.lockedModel || buildOllamaLockedModelFromCallsign(existingAI?.constructCallsign || payload.construct_call_sign),
  });

  nextPayload.model = forced.modelId || nextPayload.model;
  nextPayload.provider = forced.provider || nextPayload.provider;
  nextPayload.config_json = forced.configJson || nextPayload.config_json;
  return nextPayload;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow text files, PDFs, images, videos, and common document formats
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/pdf',
      'application/json',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/svg+xml',
      'image/webp',
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-matroska',
      'video/webm',
      'video/x-flv',
      'video/x-ms-wmv',
      'video/mp2t',
      'video/3gpp',
      'video/ogg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

router.get('/', async (req, res) => {
  attachRouteTiming(res, 'GET /api/ais', req);
  try {
    const includeFull = String(req.query.include || '').toLowerCase() === 'full';

    // Full hydration remains local/full-path only.
    if (includeFull) {
      const { userId, chattyUserId } = await resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const email = req.user?.email || null;
      console.log(`📋 [AIs API] GET /api/ais?include=full - User: ${userId} (chatty: ${chattyUserId}, email: ${email})`);
      const ais = await aiManager.getAllAIs(userId, chattyUserId, email);
      setAISourceHeaders(res, 'full-local');
      return res.json({ success: true, ais: ais || [] });
    }

    // Summary fast path: run local + Supabase in parallel and fail-open.
    const localSummaryPromise = (async () => {
      const { userId, chattyUserId } = await resolveUserIdForSummary(req, 'GET /api/ais user resolution');
      if (!userId) return { userId: null, chattyUserId: null, email: null, ais: [] };
      const email = req.user?.email || null;
      try {
        const localSummary = await withTimeoutResult(
          aiManager.getAllAIsSummary(userId, chattyUserId, email, {
            includeSupabase: false,
          }),
          AI_SUMMARY_LOCAL_TIMEOUT_MS,
          'GET /api/ais local summary'
        );
        if (localSummary.status !== 'ok') {
          console.warn(`⚠️ [AIs API] Local summary ${localSummary.status} for ${userId}:`, localSummary.error);
          return { userId, chattyUserId, email, ais: [] };
        }
        const ais = Array.isArray(localSummary.value) ? localSummary.value : [];
        return { userId, chattyUserId, email, ais: ais || [] };
      } catch (error) {
        console.warn(`⚠️ [AIs API] Local summary query failed for ${userId}:`, error?.message || error);
        return { userId, chattyUserId, email, ais: [] };
      }
    })();

    const supabaseSummaryPromise = withTimeoutResult(
      (async () => {
        const supabaseCtx = await resolveSupabaseContext(req);
        if (!supabaseCtx.supabase || !supabaseCtx.supabaseUserId) {
          return { source: 'unavailable', ais: [] };
        }
        const ais = await fetchSupabaseAIs(supabaseCtx);
        return {
          source: 'ok',
          ais: Array.isArray(ais) ? ais : [],
          supabase: supabaseCtx.supabase,
          supabaseUserId: supabaseCtx.supabaseUserId,
        };
      })(),
      AI_SUMMARY_SUPABASE_TIMEOUT_MS,
      'GET /api/ais Supabase list'
    );

    const localSummary = await localSummaryPromise;
    const localAIs = Array.isArray(localSummary.ais) ? localSummary.ais : [];

    const graceMs = safeTimeoutMs(AI_SUMMARY_SUPABASE_MERGE_GRACE_MS, 200);
    const supabaseSummary = localAIs.length > 0
      ? await Promise.race([
          supabaseSummaryPromise,
          new Promise((resolve) => setTimeout(() => resolve({ status: 'grace-expired', value: [], error: null }), graceMs)),
        ])
      : await supabaseSummaryPromise;

    const supabasePayload = supabaseSummary?.status === 'ok' ? supabaseSummary.value : null;
    const supabaseAIs = Array.isArray(supabasePayload?.ais) ? supabasePayload.ais : [];
    const supabaseStatus = supabaseSummary?.status === 'ok' && supabasePayload?.source === 'unavailable'
      ? 'unavailable'
      : (supabaseSummary?.status || 'unknown');

    if (!localSummary.userId && supabaseAIs.length === 0) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const mergedAis = mergeAISummaries(localAIs, supabaseAIs);
    const vvaultAvatarAis = await hydrateAISummaryAvatarsFromVVAULT(mergedAis, {
      userId: localSummary.userId || supabasePayload?.supabaseUserId || null,
      userEmail: localSummary.email || req.user?.email || null,
    });
    const ais = await applySummaryAvatarAvailability(vvaultAvatarAis, supabasePayload);
    const source = localAIs.length > 0 && supabaseAIs.length > 0
      ? 'merged'
      : supabaseAIs.length > 0
      ? 'supabase'
      : 'local';
    setAISourceHeaders(res, source, supabaseStatus);

    if (supabaseStatus === 'timeout' || supabaseStatus === 'error') {
      console.warn(`⚠️ [AIs API] Supabase summary ${supabaseSummary.status}; returned ${localAIs.length} local summaries`);
    }

    return res.json({ success: true, ais });
  } catch (error) {
    console.error('❌ [AIs API] Error fetching AIs:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
});

// Lazy VSI status lookup (batched)
router.get('/vsi-status', async (req, res) => {
  attachRouteTiming(res, 'GET /api/ais/vsi-status', req);
  try {
    const idsRaw = typeof req.query.ids === 'string' ? req.query.ids : '';
    const requestedIds = idsRaw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (requestedIds.length === 0) {
      return res.json({ success: true, statuses: {} });
    }

    const uniqueIds = Array.from(new Set(requestedIds));
    if (uniqueIds.length > 50) {
      return res.status(400).json({ success: false, error: 'Maximum 50 IDs are allowed' });
    }

    const { userId, chattyUserId } = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { checkVSIStatus } = await import('../lib/vsiProtection.js');
    const statuses = {};

    for (const id of uniqueIds) {
      statuses[id] = { vsiProtected: false, vsiStatus: false };

      let ai = await aiManager.getAISummary(id, userId);
      if (!ai && chattyUserId && chattyUserId !== userId) {
        ai = await aiManager.getAISummary(id, chattyUserId);
      }

      if (!ai) continue;
      const ownerMatch = ai.userId === userId || ai.userId === chattyUserId;
      if (!ownerMatch || !ai.constructCallsign || !ai.userId) continue;

      try {
        const vsiCheck = await checkVSIStatus(ai.userId, ai.constructCallsign);
        statuses[id] = {
          vsiProtected: Boolean(vsiCheck?.isVSI),
          vsiStatus: Boolean(vsiCheck?.isVSI),
        };
      } catch (error) {
        console.warn(`⚠️ [AIs API] VSI status check failed for ${id}:`, error.message);
      }
    }

    return res.json({ success: true, statuses });
  } catch (error) {
    console.error('❌ [AIs API] Error fetching VSI statuses:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
});

// Get all store/public AIs (for SimForge)
router.get('/store', async (req, res) => {try {
    const storeAIs = await aiManager.getStoreAIs();res.json({ success: true, ais: storeAIs });
  } catch (error) {console.error('Error fetching store AIs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/file-preview', async (req, res) => {
  try {
    const filePath = req.query.path;
    const optional = String(req.query.optional || '').toLowerCase() === 'true';
    const accepts = String(req.headers.accept || '').toLowerCase();
    const bestEffortPreview = optional || accepts.includes('image/') || accepts.includes('video/') || accepts.includes('audio/');
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Missing path parameter' });
    }

    if (filePath.includes('..') || filePath.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const MEDIA_EXTENSIONS = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
      'mp4', 'mov', 'webm', 'mp3', 'wav', 'ogg'
    ]);
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    if (!MEDIA_EXTENSIONS.has(ext)) {
      return res.status(403).json({ error: 'Only media files allowed' });
    }

    const { userId } = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Storage unavailable' });
    }

    const storagePath = `knowledge/${userId}/${filePath}`;

    const { data, error } = await supabase.storage
      .from('vault-files')
      .download(storagePath);

    if (error || !data) {
      if (bestEffortPreview) {
        return res.status(204).end();
      }
      return res.status(404).json({ error: 'File not found' });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const mimeMap = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      bmp: 'image/bmp', ico: 'image/x-icon',
      mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(buffer);
  } catch (err) {
    console.error('❌ [AIs API] File preview error:', err.message);
    res.status(500).json({ error: 'Preview failed' });
  }
});

// Sync GPTs from VVAULT file system to database
router.post('/sync-from-vvault', async (req, res) => {
  try {
    const { userId, chattyUserId } = await resolveUserId(req);
    if (!userId || !chattyUserId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    console.log(`🔄 [AIs API] Sync request from user: ${userId} (chatty: ${chattyUserId})`);

    // Import and run sync function
    const { syncGPTsToDatabase } = await import('../scripts/syncGPTsFromVVAULT.js');
    const result = await syncGPTsToDatabase(userId);

    console.log(`✅ [AIs API] Sync completed: ${result.synced.length} synced, ${result.skipped.length} skipped, ${result.errors.length} errors`);

    res.json({
      success: true,
      result: {
        synced: result.synced.length,
        skipped: result.skipped.length,
        errors: result.errors.length,
        total: result.total,
        details: {
          synced: result.synced,
          skipped: result.skipped,
          errors: result.errors
        }
      }
    });
  } catch (error) {
    console.error('❌ [AIs API] Error syncing from VVAULT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  attachRouteTiming(res, 'GET /api/ais/:id', req);
  try {
    const includeFull = String(req.query.include || '').toLowerCase() === 'full';
    const requestedId = String(req.params.id || '').trim();
    const canonicalRequestedId = normalizeAIDLookupId(requestedId);
    const lookupId = requestedId;

    // Summary fast path with bounded Supabase lookup and local fail-open.
    if (!includeFull) {
      const localLookupPromise = (async () => {
        try {
          return await verifyAIOwnershipSummaryBounded(req, lookupId);
        } catch (error) {
          console.warn(`⚠️ [AIs API] Local detail lookup failed for ${requestedId}:`, error?.message || error);
          return { allowed: false, ai: null, userId: null, chattyUserId: null };
        }
      })();
      const supabaseLookupPromise = withTimeoutResult(
        (async () => {
          const supabaseCtx = await resolveSupabaseContext(req);
          if (!supabaseCtx.supabase || !supabaseCtx.supabaseUserId) {
            return { source: 'unavailable', ai: null };
          }
          const ai = await fetchSupabaseAI({
            supabase: supabaseCtx.supabase,
            supabaseUserId: supabaseCtx.supabaseUserId,
            idOrCallsign: requestedId,
          }) || await fetchSupabaseVaultIdentityAI({
            supabase: supabaseCtx.supabase,
            supabaseUserId: supabaseCtx.supabaseUserId,
            idOrCallsign: requestedId,
          });
          return { source: 'ok', ai: ai || null };
        })(),
        AI_SUMMARY_SUPABASE_TIMEOUT_MS,
        `GET /api/ais/${requestedId} Supabase fetch`
      );

      const localLookup = await localLookupPromise;
      const localAI = localLookup?.ai || null;
      const localAllowed = localLookup?.allowed !== false;

      const graceMs = safeTimeoutMs(AI_SUMMARY_SUPABASE_MERGE_GRACE_MS, 200);
      const supabaseLookup = localAI
        ? await Promise.race([
            supabaseLookupPromise,
            new Promise((resolve) => setTimeout(() => resolve({ status: 'grace-expired', value: null, error: null }), graceMs)),
          ])
        : await supabaseLookupPromise;
      const supabasePayload = supabaseLookup?.status === 'ok' ? supabaseLookup.value : null;
      const supabaseAI = supabasePayload?.ai || null;
      const supabaseLookupStatus = supabaseLookup?.status === 'ok' && supabasePayload?.source === 'unavailable'
        ? 'unavailable'
        : (supabaseLookup?.status || 'unknown');

      if (supabaseAI || (localAI && localAllowed)) {
        const merged = supabaseAI && localAI
          ? mergeDefinedFields(localAI, supabaseAI)
          : (supabaseAI || localAI);
        const ai = {
          ...merged,
          systemPromptOverride: merged.systemPromptOverride || merged.instructions || null,
        };
        const source = supabaseAI && localAI
          ? 'merged'
          : supabaseAI
          ? 'supabase'
          : 'local';
        setAISourceHeaders(res, source, supabaseLookupStatus);
        return res.json({ success: true, ai });
      }

      if (localAI && !localAllowed) {
        setAISourceHeaders(res, 'local-forbidden', supabaseLookupStatus);
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const systemConstructFallback = buildSystemConstructSummaryFallback(canonicalRequestedId);
      if (systemConstructFallback) {
        const fallbackSource = canonicalRequestedId === 'zen-001'
          ? 'zen-fallback'
          : 'system-construct-fallback';
        setAISourceHeaders(res, fallbackSource, supabaseLookupStatus);
        return res.json({ success: true, ai: systemConstructFallback });
      }

      const { userId, chattyUserId } = await resolveUserIdForSummary(req, `GET /api/ais/${requestedId} callsign fallback`);
      const ownerCandidateIds = buildRequestOwnerCandidateIds(req, userId, chattyUserId);
      if (userId) {
        let byCallsign = await aiManager.getAISummary(canonicalRequestedId || lookupId, userId, {
          chattyUserId,
          email: req.user?.email || null,
        });
        if (!byCallsign && chattyUserId && chattyUserId !== userId) {
          byCallsign = await aiManager.getAISummary(canonicalRequestedId || lookupId, chattyUserId, {
            chattyUserId,
            email: req.user?.email || null,
          });
        }
        if (byCallsign) {
          const ownerMatch = ownerCandidateIds.has(String(byCallsign.userId || ''));
          if (!ownerMatch) {
            return res.status(403).json({ success: false, error: 'Access denied' });
          }
          setAISourceHeaders(res, 'local-callsign', supabaseLookupStatus);
          return res.json({
            success: true,
            ai: {
              ...byCallsign,
              systemPromptOverride: byCallsign.systemPromptOverride || byCallsign.instructions || null,
            },
          });
        }
      }

      setAISourceHeaders(res, 'not-found', supabaseLookupStatus);
      return res.status(404).json({ success: false, error: 'AI not found' });
    }

    // Full hydration path (unchanged behavior).
    const { allowed, ai } = await verifyAIOwnershipWithMode(req, lookupId, {
      includeFull: true,
    });
    if (!ai) {
      const systemConstructFallback = buildSystemConstructSummaryFallback(canonicalRequestedId);
      if (systemConstructFallback) {
        const fallbackSource = canonicalRequestedId === 'zen-001'
          ? 'zen-fallback-full'
          : 'system-construct-fallback-full';
        setAISourceHeaders(res, fallbackSource);
        return res.json({ success: true, ai: systemConstructFallback });
      }
      const { userId } = await resolveUserId(req);
      const byCallsign = await aiManager.getAIByCallsign(canonicalRequestedId || lookupId, userId, {
        chattyUserId: req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || null,
        email: req.user?.email || null,
      });
      if (byCallsign) {
        const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || null;
        const ownerMatch = buildRequestOwnerCandidateIds(req, userId, chattyUserId).has(String(byCallsign.userId || ''));
        if (!ownerMatch) return res.status(403).json({ success: false, error: 'Access denied' });
        setAISourceHeaders(res, 'full-callsign');
        const hydrated = await hydrateAIDetailFromVVAULT(byCallsign, userId, req.user?.email);
        return res.json({ success: true, ai: stripAIFileContent(hydrated) });
      }

      const supabaseCtx = await resolveSupabaseContext(req);
      if (supabaseCtx.supabase && supabaseCtx.supabaseUserId) {
        const supabaseAI = await fetchSupabaseAI({
          supabase: supabaseCtx.supabase,
          supabaseUserId: supabaseCtx.supabaseUserId,
          idOrCallsign: requestedId,
        }) || await fetchSupabaseVaultIdentityAI({
          supabase: supabaseCtx.supabase,
          supabaseUserId: supabaseCtx.supabaseUserId,
          idOrCallsign: requestedId,
        });
        if (supabaseAI) {
          setAISourceHeaders(res, 'supabase-full');
          const hydrated = await hydrateAIDetailFromVVAULT(supabaseAI, supabaseCtx.supabaseUserId, req.user?.email);
          return res.json({ success: true, ai: hydrated });
        }
      }

      return res.status(404).json({ success: false, error: 'AI not found' });
    }
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
    setAISourceHeaders(res, 'full-local');
    const hydrated = await hydrateAIDetailFromVVAULT(ai, ai.userId || null, req.user?.email);
    return res.json({ success: true, ai: stripAIFileContent(hydrated) });
  } catch (error) {
    console.error('Error fetching AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new AI
router.post('/', async (req, res) => {
  try {
    // Supabase-first upsert
    const supabaseCtx = await resolveSupabaseContext(req);
    if (supabaseCtx.supabase && supabaseCtx.supabaseUserId) {
      const constructCallsign = canonicalizeConstructId(req.body.constructCallsign || req.body.construct_call_sign || req.body.callsign || req.body.id);
      const canonicalAvatarUrl = await resolveCanonicalSupabaseAvatarValue({
        supabase: supabaseCtx.supabase,
        supabaseUserId: supabaseCtx.supabaseUserId,
        constructCallsign,
        avatarValue: req.body.avatarUrl ?? req.body.avatar,
      });
      const sovereignty = evaluateConstructSovereignty({
        name: req.body.name,
        constructCallsign,
        id: req.body.id,
        actor: buildSovereigntyActor(req, { supabaseUserId: supabaseCtx.supabaseUserId }),
        operation: 'gpt_create',
      });
      if (!sovereignty.allowed) return sendSovereigntyPolicyFailure(res, sovereignty);

      const supabasePayload = {
        id: req.body.id,
        construct_call_sign: constructCallsign,
        name: req.body.name,
        description: req.body.description,
        system_prompt_override: req.body.systemPromptOverride || req.body.instructions,
        model: req.body.model || req.body.modelId,
        provider: req.body.provider,
        capabilities: req.body.capabilities,
        tags: req.body.tags,
        categories: req.body.categories,
        avatar_url: canonicalAvatarUrl,
        config_json: req.body.configJson,
        conversation_starters: req.body.conversationStarters,
        user_id: supabaseCtx.supabaseUserId,
      };
      const ai = await upsertSupabaseAI({ supabase: supabaseCtx.supabase, supabaseUserId: supabaseCtx.supabaseUserId, payload: supabasePayload });
      if (!ai) return res.status(500).json({ success: false, error: 'Supabase upsert failed' });
      return res.json({ success: true, ai });
    }

    const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || 'anonymous';
    // Resolve to VVAULT user ID format for database storage
    let userId = chattyUserId;
    try {
      const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email);
      if (vvaultUserId) {
        userId = vvaultUserId;
        console.log(`✅ [AIs API] Resolved user ID for creation: ${chattyUserId} → ${vvaultUserId}`);
      }
    } catch (error) {
      console.warn(`⚠️ [AIs API] User ID resolution failed during creation: ${error.message}`);
    }

    const sovereignty = evaluateConstructSovereignty({
      name: req.body.name,
      constructCallsign: req.body.constructCallsign || req.body.construct_call_sign || req.body.callsign || req.body.id,
      id: req.body.id,
      actor: buildSovereigntyActor(req, { userId, chattyUserId }),
      operation: 'gpt_create',
    });
    if (!sovereignty.allowed) return sendSovereigntyPolicyFailure(res, sovereignty);

    const aiData = {
      ...req.body,
      userId,
      isActive: false
    };

    const ai = await aiManager.createAI(normalizeModelFields(aiData));

    // Scaffold instance folder structure in VVAULT (API first, Supabase fallback)
    try {
      const { scaffoldConstruct } = await import('../lib/constructScaffolder.js');
      const { getSupabaseClient } = await import('../lib/supabaseClient.js');
      const constructCallsign = ai.constructCallsign || ai.id.replace(/^(ai-|gpt-)/, '');
      if (constructCallsign) {
        const supabase = getSupabaseClient();
        const userEmail = req.user?.email;

        let scaffoldUserId = userId;
        if (supabase && userEmail) {
          const { data: byEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', userEmail)
            .limit(1)
            .maybeSingle();
          if (byEmail?.id) {
            scaffoldUserId = byEmail.id;
          } else {
            const { data: byName } = await supabase
              .from('users')
              .select('id')
              .eq('name', userEmail)
              .limit(1)
              .maybeSingle();
            if (byName?.id) {
              scaffoldUserId = byName.id;
            }
          }
          if (scaffoldUserId !== userId) {
            console.log(`✅ [AIs API] Resolved Supabase user: ${userEmail} → ${scaffoldUserId}`);
          } else {
            console.warn(`⚠️ [AIs API] Could not resolve Supabase UUID for ${userEmail}, scaffold may fail`);
          }
        }

        const result = await scaffoldConstruct(constructCallsign, ai, {
          userId: scaffoldUserId,
          userEmail,
          supabase,
          localOnly: true,
          syncGenerated: false,
        });
        console.log(`✅ [AIs API] Scaffolded instance for ${ai.id} (${constructCallsign}) via ${result.source || 'unknown'}`);
        if (result.failed > 0) {
          console.error(`❌ [AIs API] Scaffold had ${result.failed} failures for ${constructCallsign}`);
        }
      } else {
        console.warn(`⚠️ [AIs API] No constructCallsign for ${ai.id}, skipping scaffold`);
      }
    } catch (scaffoldError) {
      console.error(`❌ [AIs API] Instance scaffold failed for ${ai.id}:`, scaffoldError.message);
    }

    // Trigger capsule generation for new GPT
    try {
      console.log(`🔗 [AIs API] Triggering capsule creation for new AI: ${ai.id}`);
      const saveHook = getGPTSaveHook();
      await saveHook.onGPTSave(ai.id, ai);
      console.log(`✅ [AIs API] Capsule creation completed for new AI: ${ai.id}`);
    } catch (capsuleError) {
      console.warn(`⚠️ [AIs API] Capsule creation failed for new AI ${ai.id}:`, capsuleError);
      // Don't fail the creation operation if capsule generation fails
    }

    res.json({ success: true, ai });
  } catch (error) {
    if (handleSovereigntyError(res, error)) return;
    console.error('Error creating AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clone an AI
router.post('/:id/clone', async (req, res) => {
  try {
    const chattyUserId = req.user?.id || req.user?.uid || req.user?.sub || req.user?.email || 'anonymous';

    // Resolve to VVAULT user ID format for database storage
    let userId = chattyUserId;
    try {
      const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(chattyUserId, req.user?.email);
      if (vvaultUserId) {
        userId = vvaultUserId;
        console.log(`✅ [AIs API] Resolved user ID for clone: ${chattyUserId} → ${vvaultUserId}`);
      }
    } catch (error) {
      console.warn(`⚠️ [AIs API] User ID resolution failed during clone: ${error.message}`);
    }

    const clonedAI = await aiManager.cloneAI(req.params.id, userId);
    res.json({ success: true, ai: clonedAI });
  } catch (error) {
    if (handleSovereigntyError(res, error)) return;
    console.error('Error cloning AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update an AI
router.put('/:id', async (req, res) => {
  try {
    // Supabase-first: upsert metadata row
    const supabaseCtx = await resolveSupabaseContext(req);
    if (supabaseCtx.supabase && supabaseCtx.supabaseUserId) {
      const requestedCallsign = req.body.constructCallsign || req.body.construct_call_sign || null;
      const existingSupabaseAI = await fetchSupabaseAI({
        supabase: supabaseCtx.supabase,
        supabaseUserId: supabaseCtx.supabaseUserId,
        idOrCallsign: req.params.id,
      }) || (requestedCallsign ? await fetchSupabaseAI({
        supabase: supabaseCtx.supabase,
        supabaseUserId: supabaseCtx.supabaseUserId,
        idOrCallsign: requestedCallsign,
      }) : null);
      const constructCallsign = canonicalizeConstructId(requestedCallsign || existingSupabaseAI?.constructCallsign || req.params.id);
      const sovereignty = evaluateConstructSovereignty({
        name: req.body.name || existingSupabaseAI?.name,
        constructCallsign,
        id: req.params.id,
        actor: buildSovereigntyActor(req, { supabaseUserId: supabaseCtx.supabaseUserId }),
        operation: 'gpt_update',
      });
      if (!sovereignty.allowed) return sendSovereigntyPolicyFailure(res, sovereignty);

      const canonicalAvatarUrl = await resolveCanonicalSupabaseAvatarValue({
        supabase: supabaseCtx.supabase,
        supabaseUserId: supabaseCtx.supabaseUserId,
        constructCallsign,
        avatarValue: req.body.avatarUrl ?? req.body.avatar,
        existingAvatar: existingSupabaseAI?.avatarUrl || existingSupabaseAI?.avatar || null,
      });

      const supabasePayload = applyExistingSimLockToSupabasePayload(existingSupabaseAI, {
        id: req.params.id,
        construct_call_sign: constructCallsign,
        name: req.body.name,
        description: req.body.description,
        system_prompt_override: req.body.systemPromptOverride || req.body.instructions,
        model: req.body.model || req.body.modelId,
        provider: req.body.provider,
        capabilities: req.body.capabilities,
        tags: req.body.tags,
        categories: req.body.categories,
        avatar_url: canonicalAvatarUrl,
        config_json: req.body.configJson,
        conversation_starters: req.body.conversationStarters,
        user_id: supabaseCtx.supabaseUserId,
      });
      const ai = await upsertSupabaseAI({ supabase: supabaseCtx.supabase, supabaseUserId: supabaseCtx.supabaseUserId, payload: supabasePayload });
      if (!ai) return res.status(500).json({ success: false, error: 'Supabase upsert failed' });
      return res.json({ success: true, ai });
    }

    const ownership = await verifyAIOwnership(req, req.params.id);
    if (!ownership.ai) return res.status(404).json({ success: false, error: 'AI not found' });
    if (!ownership.allowed) return res.status(403).json({ success: false, error: 'Access denied' });

    const sovereignty = evaluateConstructSovereignty({
      name: req.body.name || ownership.ai.name,
      constructCallsign: req.body.constructCallsign || req.body.construct_call_sign || ownership.ai.constructCallsign || req.params.id,
      id: req.params.id,
      actor: buildSovereigntyActor(req, { userId: ownership.userId }),
      operation: 'gpt_update',
    });
    if (!sovereignty.allowed) return sendSovereigntyPolicyFailure(res, sovereignty);

    const ai = await aiManager.updateAI(req.params.id, normalizeModelFields(req.body));
    if (!ai) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }

    try {
      const userId = ownership.userId;
      const { scaffoldConstruct } = await import('../lib/constructScaffolder.js');
      const constructCallsign = ai.constructCallsign || req.params.id.replace(/^(ai-|gpt-)/, '');
      if (constructCallsign) {
        await scaffoldConstruct(constructCallsign, ai, {
          userId,
          userEmail: req.user?.email,
          localOnly: true,
          syncGenerated: true,
        });
        console.log(`✅ [AIs API] Ensured and updated construct bundle for ${req.params.id} (${constructCallsign})`);
      }
    } catch (fileError) {
      console.warn(`⚠️ [AIs API] Construct bundle sync failed during update for ${req.params.id}:`, fileError);
      // Don't fail the update operation if file creation fails
    }

    // Trigger capsule generation/update when GPT is saved
    try {
      console.log(`🔗 [AIs API] Triggering capsule update for AI: ${req.params.id}`);
      const saveHook = getGPTSaveHook();
      await saveHook.onGPTSave(req.params.id, ai);
      console.log(`✅ [AIs API] Capsule update completed for AI: ${req.params.id}`);
    } catch (capsuleError) {
      console.warn(`⚠️ [AIs API] Capsule update failed for AI ${req.params.id}:`, capsuleError);
      // Don't fail the save operation if capsule generation fails
    }

    res.json({ success: true, ai });
  } catch (error) {
    if (handleSovereigntyError(res, error)) return;
    console.error('Error updating AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete an AI
router.delete('/:id', async (req, res) => {
  try {
    const ownership = await verifyAIOwnership(req, req.params.id);
    if (!ownership.ai) return res.status(404).json({ success: false, error: 'AI not found' });
    if (!ownership.allowed) return res.status(403).json({ success: false, error: 'Access denied' });

    const ai = ownership.ai;
    const constructCallsign = ai.constructCallsign;
    const userId = ai.userId;

    // Check VSI protection before deletion (VSIs are independent entities in intelligences/)
    if (constructCallsign) {
      const { checkDeletionProtection } = await import('../lib/vsiProtection.js');
      const protection = await checkDeletionProtection(constructCallsign, userId);

      if (protection.blocked) {
        console.warn(`🚫 [AIs API] Deletion blocked for ${constructCallsign}: VSI protection active`);
        return res.status(403).json({
          success: false,
          error: '⚠️ Deletion blocked: This GPT is protected under VSI safeguards and cannot be removed without sovereign override.',
          vsi_protected: true
        });
      }
    }

    // Delete from database first
    const success = await aiManager.deleteAI(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }

    // Delete all files from VVAULT if constructCallsign exists
    if (constructCallsign && userId) {
      try {
        const { FileManagementAutomation } = await import('../lib/fileManagementAutomation.js');
        const fileManager = new FileManagementAutomation(userId);

        // Permanently delete (not archive) - user explicitly requested permanent deletion
        console.log(`🗑️ [AIs API] Permanently deleting GPT files for ${constructCallsign} from VVAULT`);
        await fileManager.deleteGPT(constructCallsign, false); // false = permanent delete, not archive
        console.log(`✅ [AIs API] Successfully deleted all files for ${constructCallsign} from VVAULT`);
      } catch (fileError) {
        console.error(`⚠️ [AIs API] Failed to delete files from VVAULT for ${constructCallsign}:`, fileError);
        // Don't fail the delete operation if file deletion fails - database entry is already deleted
        // Log the error but continue
      }
    } else {
      console.warn(`⚠️ [AIs API] Cannot delete VVAULT files: missing constructCallsign (${constructCallsign}) or userId (${userId})`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/identity-fields', async (req, res) => {
  try {
    const { allowed, ai } = await verifyAIOwnership(req, req.params.id);
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });

    const constructCallsign = ai?.constructCallsign;
    if (!constructCallsign) {
      return res.json({
        success: true,
        conditioning: null,
        physicalFeatures: null,
        definition: null,
        voice: null,
        gender: null,
      });
    }

    let conditioning = null;
    let physicalFeatures = null;
    let definition = null;
    let voice = null;
    let gender = null;

    try {
      const { getSupabaseClient } = await import('../lib/supabaseClient.js');
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: condData } = await supabase
          .from('vault_files')
          .select('content')
          .eq('construct_id', constructCallsign)
          .like('filename', '%conditioning.txt')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (condData?.content) conditioning = condData.content;

        const { data: physData } = await supabase
          .from('vault_files')
          .select('content')
          .eq('construct_id', constructCallsign)
          .like('filename', '%physical_features.json')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (physData?.content) {
          try {
            const parsed = JSON.parse(physData.content);
            physicalFeatures = Object.entries(parsed)
              .map(([key, value]) => `${key}: ${value}`)
              .join('\n');
          } catch {
            physicalFeatures = physData.content;
          }
        }

        const { data: defData } = await supabase
          .from('vault_files')
          .select('content')
          .eq('construct_id', constructCallsign)
          .like('filename', '%definition.json')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (defData?.content) definition = defData.content;

        const { data: voiceData } = await supabase
          .from('vault_files')
          .select('content')
          .eq('construct_id', constructCallsign)
          .like('filename', '%voice.json')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (voiceData?.content) voice = extractVoiceInstructions(voiceData.content);
        if (!voice) {
          const { data: legacyVoiceData } = await supabase
            .from('vault_files')
            .select('content')
            .eq('construct_id', constructCallsign)
            .like('filename', '%voice.md')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (legacyVoiceData?.content) voice = legacyVoiceData.content;
        }

        const { data: genderData } = await supabase
          .from('vault_files')
          .select('content')
          .eq('construct_id', constructCallsign)
          .like('filename', '%gender.json')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (genderData?.content) {
          try {
            const parsed = JSON.parse(genderData.content);
            gender = parsed?.gender ?? genderData.content;
          } catch {
            gender = genderData.content;
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️ [AIs API] Identity fields load failed for ${constructCallsign}:`, err.message);
    }

    res.json({ success: true, conditioning, physicalFeatures, definition, voice, gender });
  } catch (error) {
    console.error('Error loading identity fields:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/identity-fields', async (req, res) => {
  try {
    const { allowed, ai } = await verifyAIOwnership(req, req.params.id);
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });

    const constructCallsign = ai?.constructCallsign;
    if (!constructCallsign) {
      return res.status(400).json({ success: false, error: 'No construct callsign' });
    }

    const { conditioning, physicalFeatures, definition, voice, gender } = req.body;
    const userId = ai?.userId;

    try {
      const { getSupabaseClient } = await import('../lib/supabaseClient.js');
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase not available');

      const upsertVaultFile = async (filename, fileType, content) => {
        const { data: existing } = await supabase
          .from('vault_files')
          .select('id')
          .eq('user_id', userId)
          .eq('filename', filename)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('vault_files')
            .update({ content, file_type: fileType })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('vault_files')
            .insert({
              user_id: userId,
              construct_id: constructCallsign,
              filename,
              file_type: fileType,
              content,
            });
        }
      };

      if (conditioning !== undefined) {
        const filePath = `instances/${constructCallsign}/identity/conditioning.txt`;
        await upsertVaultFile(filePath, 'identity', conditioning);
        console.log(`✅ [AIs API] Saved conditioning.txt for ${constructCallsign}`);
      }

      if (physicalFeatures !== undefined || gender !== undefined) {
        const merged = {};

        if (physicalFeatures !== undefined) {
          let parsed = null;
          try {
            parsed = JSON.parse(physicalFeatures);
          } catch {
            parsed = null;
          }

          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const [key, value] of Object.entries(parsed)) {
              if (String(key).trim()) {
                merged[String(key).trim()] = value == null ? '' : String(value).trim();
              }
            }
          } else {
            const lines = String(physicalFeatures).split('\n').map((line) => line.trim()).filter(Boolean);
            let parseable = lines.length > 0;
            for (const line of lines) {
              const colonIdx = line.indexOf(':');
              if (colonIdx <= 0) {
                parseable = false;
                break;
              }
              const key = line.substring(0, colonIdx).trim();
              const value = line.substring(colonIdx + 1).trim();
              if (!key) {
                parseable = false;
                break;
              }
              merged[key] = value;
            }

            if (!parseable) {
              const trimmed = String(physicalFeatures || '').trim();
              if (trimmed) {
                merged.description = trimmed;
              }
            }
          }
        }

        if (gender !== undefined) {
          const trimmedGender = String(gender || '').trim();
          if (trimmedGender) {
            merged.gender = trimmedGender;
          }
        }

        const filePath = `instances/${constructCallsign}/identity/physical-features.json`;
        await upsertVaultFile(filePath, 'identity', JSON.stringify(merged, null, 2));
        console.log(`✅ [AIs API] Saved physical-features.json for ${constructCallsign}`);
      }

      if (definition !== undefined) {
        const filePath = `instances/${constructCallsign}/identity/definition.json`;
        await upsertVaultFile(filePath, 'identity', definition);
        console.log(`✅ [AIs API] Saved definition.json for ${constructCallsign}`);
      }

      if (voice !== undefined) {
        const filePath = `instances/${constructCallsign}/identity/voice.json`;
        const { data: existingVoice } = await supabase
          .from('vault_files')
          .select('content')
          .eq('user_id', userId)
          .eq('filename', filePath)
          .maybeSingle();
        await upsertVaultFile(
          filePath,
          'identity',
          buildVoiceContractJson({
            instructions: voice,
            existing: existingVoice?.content,
            source: 'gpt_creator',
          }),
        );
        console.log(`✅ [AIs API] Saved voice.json for ${constructCallsign}`);
      }

      res.json({ success: true });
    } catch (err) {
      console.error(`❌ [AIs API] Identity fields save failed for ${constructCallsign}:`, err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  } catch (error) {
    console.error('Error saving identity fields:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload file to AI
router.post('/:id/files', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const fileData = {
      name: req.file.originalname,
      content: req.file.buffer.toString('base64'),
      mimeType: req.file.mimetype,
      size: req.file.size
    };

    const file = await aiManager.uploadFile(req.params.id, fileData);

    let supabaseSaved = false;
    let supabaseError = null;
    try {
      const ai = await aiManager.getAI(req.params.id);
      const constructCallsign = ai?.constructCallsign || req.params.id.replace(/^(ai-|gpt-)/, '');
      if (constructCallsign) {
        const { getSupabaseClient } = await import('../lib/supabaseClient.js');
        const supabase = getSupabaseClient();
        if (!supabase) {
          supabaseError = 'Supabase client not available';
          console.error(`❌ [AIs API] ${supabaseError} — knowledge file NOT persisted`);
        } else {
          const { userId } = await resolveUserId(req);
          let supabaseUserId = userId;
          if (supabaseUserId && req.user?.email) {
            const { data: byEmail } = await supabase
              .from('users')
              .select('id')
              .eq('email', req.user.email)
              .limit(1)
              .maybeSingle();
            if (byEmail?.id) supabaseUserId = byEmail.id;
          }

          if (!supabaseUserId) {
            supabaseError = `Could not resolve Supabase user_id for ${req.user?.email || 'unknown email'}`;
            console.error(`❌ [AIs API] ${supabaseError} — knowledge file NOT persisted to Supabase`);
          } else {
            const originalName = req.file.originalname;
            let rawZipPath = req.body.zipPath || '';

            if (rawZipPath) {
              rawZipPath = rawZipPath.replace(/\\/g, '/');
              rawZipPath = rawZipPath.replace(/^\.\//, '');
              const instancePrefixes = [
                `instances/${constructCallsign}/`,
                `${constructCallsign}/`,
              ];
              for (const prefix of instancePrefixes) {
                if (rawZipPath.startsWith(prefix)) {
                  rawZipPath = rawZipPath.slice(prefix.length);
                  break;
                }
              }
              rawZipPath = cleanConstructRelativePath(rawZipPath);
            }

            let relativePath = rawZipPath || originalName;
            const {
              vaultPath,
              resolvedFolder,
              fileType,
              artifactClass,
              classification,
            } = resolveConstructVaultPlacement({
              constructCallsign,
              relativePath,
              mimeType: req.file.mimetype,
            });

            try {
              const { assertValidVaultFilename } = await import('../lib/vaultPathGuard.js');
              assertValidVaultFilename(vaultPath);
            } catch (pathError) {
              console.warn(`⚠️ [AIs API] Invalid vault path for knowledge file: ${vaultPath}`, pathError.message);
              throw new Error(`Invalid file path: ${pathError.message}`);
            }

            const isTextType = /^text\/|application\/(json|xml|csv)/.test(req.file.mimetype);
            const isPdf = req.file.mimetype === 'application/pdf';
            let contentForVault;
            if (isTextType) {
              contentForVault = req.file.buffer.toString('utf8');
            } else if (isPdf) {
              const pdfText = await extractPdfText(req.file.buffer);
              contentForVault = pdfText || `[binary:${req.file.mimetype}:${req.file.size}]`;
              if (pdfText) console.log(`📄 [AIs API] Extracted ${pdfText.length} chars from PDF: ${originalName}`);
            } else {
              contentForVault = `[binary:${req.file.mimetype}:${req.file.size}]`;
            }

            const { data: existing } = await supabase
              .from('vault_files')
              .select('id')
              .eq('user_id', supabaseUserId)
              .eq('filename', vaultPath)
              .maybeSingle();

            if (existing) {
              const { error: updateErr } = await supabase
                .from('vault_files')
                .update({
                  content: contentForVault,
                  metadata: {
                    source: 'chatty-knowledge-upload',
                    originalName,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    artifactClass,
                    sourceKind: artifactClass,
                    classificationReason: classification.reason,
                    updatedAt: new Date().toISOString(),
                  },
                })
                .eq('id', existing.id);
              if (updateErr) throw updateErr;
              console.log(`✅ [AIs API] Updated vault_files: ${vaultPath}`);
            } else {
              const { error: insertErr } = await supabase
                .from('vault_files')
                .insert({
                  user_id: supabaseUserId,
                  filename: vaultPath,
                  content: contentForVault,
                  file_type: fileType,
                  construct_id: constructCallsign,
                  metadata: {
                    source: 'chatty-knowledge-upload',
                    originalName,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    artifactClass,
                    sourceKind: artifactClass,
                    classificationReason: classification.reason,
                    createdAt: new Date().toISOString(),
                  },
                });
              if (insertErr) throw insertErr;
              console.log(`✅ [AIs API] Created vault_files: ${vaultPath} (folder: ${resolvedFolder})`);
            }
            supabaseSaved = true;
          }
        }
      }
    } catch (vaultError) {
      supabaseError = vaultError.message || 'Unknown Supabase write error';
      console.error(`❌ [AIs API] Supabase vault_files write FAILED for knowledge file:`, supabaseError);
      if (vaultError.reviewRequired) {
        return res.status(400).json({
          success: false,
          reviewRequired: true,
          error: supabaseError,
          artifactClass: vaultError.artifactClass || 'review_required',
          reason: vaultError.reason || supabaseError,
        });
      }
    }

    res.json({ success: true, file, supabaseSaved, supabaseError });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const zipUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tmpDir = path.join(os.tmpdir(), 'chatty-zip-uploads');
      fs.mkdirSync(tmpDir, { recursive: true });
      cb(null, tmpDir);
    },
    filename: (req, file, cb) => {
      cb(null, `zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    },
  }),
  limits: {
    fileSize: 1024 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are accepted'), false);
    }
  },
});

router.post('/:id/upload-zip', zipUpload.single('file'), async (req, res) => {
  let tmpFilePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No ZIP file uploaded' });
    }
    tmpFilePath = req.file.path;

    const { allowed, ai, userId: ownerUserId } = await verifyAIOwnership(req, req.params.id);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Not authorized to upload files to this AI' });
    }

    const constructCallsign = ai?.constructCallsign || req.params.id.replace(/^(ai-|gpt-)/, '').replace(/-seed$/, '');
    if (!constructCallsign) {
      return res.status(400).json({ success: false, error: 'Could not determine construct callsign' });
    }

    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase client not available' });
    }

    let supabaseUserId = ownerUserId;
    if (supabaseUserId && req.user?.email) {
      const { data: byEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', req.user.email)
        .limit(1)
        .maybeSingle();
      if (byEmail?.id) supabaseUserId = byEmail.id;
    }
    if (!supabaseUserId) {
      return res.status(400).json({ success: false, error: 'Could not resolve user ID' });
    }

    const { assertValidVaultFilename } = await import('../lib/vaultPathGuard.js');

    console.log(`📦 [ZIP Upload] Processing ZIP (${(req.file.size / 1024 / 1024).toFixed(1)}MB) for ${constructCallsign}`);

    const zipBuffer = fs.readFileSync(tmpFilePath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const entries = Object.entries(zip.files).filter(([name, entry]) => {
      if (entry.dir) return false;
      const basename = path.basename(name);
      if (basename.startsWith('.') || basename === '__MACOSX' || name.includes('__MACOSX/')) return false;
      if (basename === 'Thumbs.db' || basename === 'desktop.ini') return false;
      return true;
    });

    console.log(`📦 [ZIP Upload] Found ${entries.length} files to process`);

    const results = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    const MAX_INDIVIDUAL_FILE_SIZE = 50 * 1024 * 1024;
    const BATCH_SIZE = 5;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async ([entryName, entry]) => {
        try {
          const fileBuffer = await entry.async('nodebuffer');

          if (fileBuffer.length > MAX_INDIVIDUAL_FILE_SIZE) {
            results.skipped++;
            results.errors.push({ file: entryName, error: `Exceeds ${MAX_INDIVIDUAL_FILE_SIZE / 1024 / 1024}MB limit` });
            return;
          }

          let relativePath = entryName.replace(/\\/g, '/').replace(/^\.\//, '');
          const instancePrefixes = [
            `instances/${constructCallsign}/`,
            `${constructCallsign}/`,
          ];
          for (const prefix of instancePrefixes) {
            if (relativePath.startsWith(prefix)) {
              relativePath = relativePath.slice(prefix.length);
              break;
            }
          }
          relativePath = cleanConstructRelativePath(relativePath);

          let vaultPath;
          let resolvedFolder;
          let fileType;
          let artifactClass;
          let classification;
          try {
            ({
              vaultPath,
              resolvedFolder,
              fileType,
              artifactClass,
              classification,
            } = resolveConstructVaultPlacement({
              constructCallsign,
              relativePath,
              mimeType: mimeForExt(path.extname(entryName).toLowerCase()),
            }));
          } catch (classificationError) {
            results.skipped++;
            results.errors.push({
              file: entryName,
              error: classificationError.message,
              reviewRequired: true,
              artifactClass: classificationError.artifactClass || 'review_required',
            });
            return;
          }

          try {
            assertValidVaultFilename(vaultPath);
          } catch (pathError) {
            results.skipped++;
            results.errors.push({ file: entryName, error: `Invalid path: ${pathError.message}` });
            return;
          }

          const ext = path.extname(entryName).toLowerCase();
          const isText = ['.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml', '.js', '.ts', '.py', '.html', '.css', '.log', '.capsule', '.capsuleso'].includes(ext);
          const isPdfFile = ext === '.pdf';
          let contentForVault;
          if (isText) {
            contentForVault = fileBuffer.toString('utf8');
          } else if (isPdfFile) {
            const pdfText = await extractPdfText(fileBuffer);
            contentForVault = pdfText || `[binary:${mimeForExt(ext)}:${fileBuffer.length}]`;
            if (pdfText) console.log(`📄 [ZIP Upload] Extracted ${pdfText.length} chars from PDF: ${entryName}`);
          } else {
            contentForVault = `[binary:${mimeForExt(ext)}:${fileBuffer.length}]`;
          }

          const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
          const originalName = path.basename(entryName);
          const { data: existing } = await supabase
            .from('vault_files')
            .select('id')
            .eq('user_id', supabaseUserId)
            .eq('filename', vaultPath)
            .maybeSingle();

          const metadata = {
            source: 'chatty-zip-upload',
            originalName,
            mimeType: mimeForExt(ext),
            size: fileBuffer.length,
            sha256,
            artifactClass,
            sourceKind: artifactClass,
            classificationReason: classification.reason,
          };

          if (existing) {
            metadata.updatedAt = new Date().toISOString();
            const { error: updateErr } = await supabase
              .from('vault_files')
              .update({ content: contentForVault, metadata })
              .eq('id', existing.id);
            if (updateErr) throw updateErr;
            results.updated++;
          } else {
            metadata.createdAt = new Date().toISOString();
            const { error: insertErr } = await supabase
              .from('vault_files')
              .insert({
                user_id: supabaseUserId,
                filename: vaultPath,
                content: contentForVault,
                file_type: fileType,
                construct_id: constructCallsign,
                metadata,
              });
            if (insertErr) throw insertErr;
            results.created++;
          }

          if (!isText) {
            const storagePath = `knowledge/${supabaseUserId}/${vaultPath}`;
            await supabase.storage
              .from('vault-files')
              .upload(storagePath, fileBuffer, {
                contentType: mimeForExt(ext),
                upsert: true,
              });
          }
        } catch (fileErr) {
          results.failed++;
          results.errors.push({ file: entryName, error: fileErr.message });
        }
      }));
    }

    console.log(`✅ [ZIP Upload] Complete for ${constructCallsign}: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.failed} failed`);

    res.json({
      success: true,
      constructCallsign,
      totalFiles: entries.length,
      ...results,
      errors: results.errors.slice(0, 20),
    });
  } catch (error) {
    console.error('❌ [ZIP Upload] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (tmpFilePath) {
      try { fs.unlinkSync(tmpFilePath); } catch {}
    }
  }
});

router.post('/:id/backfill-pdfs', async (req, res) => {
  try {
    const ai = await aiManager.getAI(req.params.id);
    if (!ai) return res.status(404).json({ success: false, error: 'AI not found' });

    const constructCallsign = ai.constructCallsign || req.params.id.replace(/^(ai-|gpt-)/, '');
    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase not available' });

    const { userId } = await resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const docsPath = `instances/${constructCallsign}/documents/`;
    const assetsPath = `instances/${constructCallsign}/assets/`;

    const { data: pdfRows, error } = await supabase
      .from('vault_files')
      .select('id, filename, content')
      .eq('user_id', userId)
      .or(`filename.like.${docsPath}%,filename.like.${assetsPath}%`)
      .like('filename', '%.pdf');

    if (error) throw error;

    const binaryPdfs = (pdfRows || []).filter(r => r.content && r.content.startsWith('[binary:'));
    console.log(`📄 [Backfill] Found ${binaryPdfs.length} PDFs with binary placeholders for ${constructCallsign}`);

    if (binaryPdfs.length === 0) {
      return res.json({ success: true, message: 'No PDFs need backfilling', processed: 0 });
    }

    let processed = 0;
    let failed = 0;
    const errors = [];

    for (const row of binaryPdfs) {
      try {
        const storagePath = `knowledge/${userId}/${row.filename}`;
        const { data: fileData, error: dlError } = await supabase.storage
          .from('vault-files')
          .download(storagePath);

        if (dlError || !fileData) {
          errors.push({ file: row.filename, error: dlError?.message || 'Download failed' });
          failed++;
          continue;
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        const pdfText = await extractPdfText(buffer);

        if (pdfText) {
          const { error: updateErr } = await supabase
            .from('vault_files')
            .update({
              content: pdfText,
              metadata: {
                source: 'chatty-pdf-backfill',
                extractedAt: new Date().toISOString(),
                extractedChars: pdfText.length,
              }
            })
            .eq('id', row.id);

          if (updateErr) throw updateErr;
          console.log(`✅ [Backfill] Extracted ${pdfText.length} chars from ${row.filename}`);
          processed++;
        } else {
          errors.push({ file: row.filename, error: 'PDF text extraction returned empty' });
          failed++;
        }
      } catch (fileErr) {
        errors.push({ file: row.filename, error: fileErr.message });
        failed++;
      }
    }

    res.json({
      success: true,
      constructCallsign,
      totalPdfs: binaryPdfs.length,
      processed,
      failed,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('❌ [Backfill] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function mimeForExt(ext) {
  const map = {
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
    '.csv': 'text/csv', '.xml': 'application/xml', '.yaml': 'text/yaml', '.yml': 'text/yaml',
    '.pdf': 'application/pdf',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/avi',
    '.js': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
    '.html': 'text/html', '.css': 'text/css',
    '.log': 'text/plain', '.capsule': 'text/plain', '.capsuleso': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

// Get files for an AI (local DB + Supabase identity files fallback)
router.get('/:id/files', async (req, res) => {
  try {
    const localFiles = await aiManager.getAIFiles(req.params.id);
    const ai = await aiManager.getAI(req.params.id);
    let vvaultFiles = [];

    if (ai && ai.constructCallsign) {
      const VVAULT_API_BASE_URL = process.env.VVAULT_API_BASE_URL;
      if (VVAULT_API_BASE_URL) {
        try {
          const baseUrl = VVAULT_API_BASE_URL.replace(/\/$/, '');
          const headers = { 'Content-Type': 'application/json' };
          const serviceToken = process.env.VVAULT_SERVICE_TOKEN;
          if (serviceToken) headers['X-Chatty-Key'] = serviceToken;
          const userEmail = req.user?.email;
          if (userEmail) headers['X-Chatty-User'] = userEmail;

          const response = await fetch(
            `${baseUrl}/api/chatty/construct/${ai.constructCallsign}/files`,
            { method: 'GET', headers, signal: AbortSignal.timeout(8000) }
          );

          if (response.ok) {
            const data = await response.json();
            const folderMap = { assets: 'knowledge', documents: 'knowledge', identity: 'identity' };

            for (const [folder, category] of Object.entries(folderMap)) {
              const files = data.files?.[folder] || data[folder] || [];
              for (const f of files) {
                const isImage = /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(f.filename || '');
                vvaultFiles.push({
                  id: f.id || `vvault-${folder}-${f.filename}`,
                  aiId: req.params.id,
                  filename: f.filename,
                  originalName: f.filename,
                  mimeType: isImage ? `image/${(f.filename.split('.').pop() || 'png').toLowerCase()}` : (f.mime_type || 'text/plain'),
                  size: f.size || 0,
                  content: '',
                  uploadedAt: f.created_at || f.updated_at || new Date().toISOString(),
                  isActive: true,
                  category,
                  source: 'vvault',
                  storagePath: f.storage_path || f.path || ''
                });
              }
            }
            console.log(`✅ [AIs API] Loaded ${vvaultFiles.length} files from VVAULT for ${ai.constructCallsign}`);
          }
        } catch (vvaultErr) {
          console.warn(`⚠️ [AIs API] VVAULT files lookup failed for ${ai.constructCallsign}:`, vvaultErr.message);
        }
      }

      if (vvaultFiles.length === 0) {
        try {
          const { getSupabaseClient } = await import('../lib/supabaseClient.js');
          const supabase = getSupabaseClient();
          if (supabase) {
            const constructVariants = [
              ai.constructCallsign,
              ai.constructCallsign.replace(/-\d+$/, '')
            ];

            for (const cid of constructVariants) {
              const { data, error } = await supabase
                .from('vault_files')
                .select('id, filename, file_type, storage_path, created_at, metadata')
                .eq('construct_id', cid)
                .not('file_type', 'eq', 'transcript')
                .not('file_type', 'eq', 'conversation');

              if (!error && data && data.length > 0) {
                const mapped = data.map(f => {
                  const meta = typeof f.metadata === 'string' ? JSON.parse(f.metadata || '{}') : (f.metadata || {});
                  const fullPath = f.filename || f.storage_path || '';
                  const pathParts = fullPath.split('/');
                  const constructIdx = pathParts.findIndex(p => /^[a-z]+-\d{3}$/.test(p));
                  const subdir = constructIdx >= 0 && pathParts[constructIdx + 1] ? pathParts[constructIdx + 1] : '';

                  const transcriptPlatforms = ['chatty', 'chatgpt', 'gemini', 'claude', 'openrouter', 'ollama', 'character.ai', 'codex', 'github_copilot'];
                  let category = 'other';
                  if (subdir === 'identity') category = 'identity';
                  else if (subdir === 'assets' || subdir === 'documents') category = 'knowledge';
                  else if (transcriptPlatforms.includes(subdir)) category = 'transcript';
                  else if (subdir === 'tests') category = 'test';
                  else if (subdir === 'lin') category = 'orchestration';
                  else if (subdir === 'memup') category = 'capsule';
                  else if (subdir === 'config') category = 'config';
                  else if (subdir === 'logs') category = 'log';

                  if (category === 'other' && f.file_type) {
                    const ft = f.file_type.toLowerCase();
                    if (ft === 'identity') category = 'identity';
                    else if (ft === 'knowledge' || ft === 'assets' || ft === 'documents') category = 'knowledge';
                    else if (ft === 'config' || ft === 'enforcement_config') category = 'config';
                    else if (ft === 'ledger' || ft === 'log' || ft === 'logs') category = 'log';
                    else if (ft === 'memup' || ft === 'capsule') category = 'capsule';
                  }

                  const isImage = /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(f.filename || '');
                  const mimeType = isImage
                    ? `image/${(f.filename.split('.').pop() || 'png').toLowerCase()}`
                    : (f.file_type === 'binary' ? 'application/octet-stream' : 'text/plain');
                  const displayName = f.filename.split('/').pop() || f.filename;

                  return {
                    id: f.id,
                    aiId: req.params.id,
                    filename: fullPath,
                    originalName: displayName,
                    mimeType,
                    size: meta.size || 0,
                    content: '',
                    uploadedAt: f.created_at,
                    isActive: true,
                    category,
                    source: 'supabase',
                    storagePath: f.storage_path || f.filename
                  };
                });
                vvaultFiles.push(...mapped);
              }
            }
          }
        } catch (sbErr) {
          console.warn(`⚠️ [AIs API] Supabase files fallback failed for ${ai.constructCallsign}:`, sbErr.message);
        }
      }
    }

    const allFiles = [...localFiles, ...vvaultFiles];
    res.json({ success: true, files: allFiles });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a file
router.delete('/files/:fileId', async (req, res) => {
  try {
    const success = await aiManager.deleteFile(req.params.fileId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update file's AI ID (for reassociating temp files)
router.put('/files/:fileId/ai', async (req, res) => {
  try {
    const { aiId } = req.body;
    const success = await aiManager.updateFileAIId(req.params.fileId, aiId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating file AI ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create an action for an AI
router.post('/:id/actions', async (req, res) => {
  try {
    const action = await aiManager.createAction(req.params.id, req.body);
    res.json({ success: true, action });
  } catch (error) {
    console.error('Error creating action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get actions for an AI
router.get('/:id/actions', async (req, res) => {
  try {
    const actions = await aiManager.getAIActions(req.params.id);
    res.json({ success: true, actions });
  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete an action
router.delete('/actions/:actionId', async (req, res) => {
  try {
    const success = await aiManager.deleteAction(req.params.actionId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute an action
router.post('/actions/:actionId/execute', async (req, res) => {
  try {
    const result = await aiManager.executeAction(req.params.actionId, req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error executing action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate avatar for AI
router.post('/:id/avatar', async (req, res) => {
  try {
    const { name, description } = req.body;
    const avatar = aiManager.generateAvatar(name, description);
    res.json({ success: true, avatar });
  } catch (error) {
    console.error('Error generating avatar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve canonical avatar from Supabase VVAULT records.
router.get('/:id/avatar', async (req, res) => {
  attachRouteTiming(res, 'GET /api/ais/:id/avatar', req);
  try {
    const requestedId = String(req.params.id || '').trim();
    const { userId, chattyUserId } = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const avatarLookup = await aiManager.getAIAvatarLookup(requestedId, {
      userId,
      chattyUserId,
      email: req.user?.email || null,
    });
    if (shouldForbiddenLocalAvatarBlockRequest(requestedId, avatarLookup)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const canRecoverLegacyAvatar = canRecoverLegacyAvatarForRequest({
      req,
      requestedId,
      avatarLookup,
      userId,
      chattyUserId,
    });

    const lookupForAvatar = avatarLookup?.forbidden && !canRecoverLegacyAvatar
      ? {
          ...avatarLookup,
          rawAvatarPath: null,
        }
      : avatarLookup;

    const constructIds = getAvatarConstructCandidates(requestedId, lookupForAvatar);
    const primaryConstructId = constructIds[0] || normalizeAIDLookupId(requestedId) || requestedId;
    if (!primaryConstructId) {
      return sendAvatarPlaceholder(res, requestedId);
    }

    const ownerCandidates = buildOwnerCandidateIds({
      userId,
      chattyUserId,
      email: req.user?.email || null,
    });
    if (await sendLocalVvaultIdentityAvatarForOwners(res, ownerCandidates, constructIds)) {
      return;
    }

    const rawAvatarPath = normalizeAvatarValue(lookupForAvatar?.rawAvatarPath);
    const prefersCanonicalLocalAvatar =
      !!rawAvatarPath && rawAvatarPath.startsWith('instances/');

    const { supabase, supabaseUserId } = await resolveSupabaseContext(req);

    for (const constructId of constructIds) {
      const canonicalIdentity = await loadCanonicalConstructIdentity({
        constructId,
        supabaseUserId: supabaseUserId || userId,
      }).catch((error) => {
        console.warn(`⚠️ [AIs API] VVAULT body avatar lookup failed for ${constructId}:`, error?.message || error);
        return null;
      });
      const avatarRow = canonicalIdentity?.avatarRow || null;
      if (avatarRow?.metadata?.source === 'vvault_body' && await sendSupabaseAvatarRow(res, supabase, avatarRow, constructId)) {
        return;
      }
    }

    if (prefersCanonicalLocalAvatar && (await sendLegacyAvatarLookup(res, lookupForAvatar))) {
      return;
    }

    for (const constructId of constructIds) {
      if (await sendLocalVvaultIdentityAvatar(res, userId, constructId)) {
        return;
      }
    }

    if (supabase && supabaseUserId) {
      for (const constructId of constructIds) {
        const canonicalIdentity = await loadCanonicalConstructIdentity({
          constructId,
          supabaseUserId,
        }).catch((error) => {
          console.warn(`⚠️ [AIs API] Canonical avatar lookup failed for ${constructId}:`, error?.message || error);
          return null;
        });

        const avatarRow = canonicalIdentity?.avatarRow || null;
        if (!avatarRow) continue;

        if (await sendSupabaseAvatarRow(res, supabase, avatarRow, constructId)) {
          return;
        }
      }
    }

    if (await sendLegacyAvatarLookup(res, lookupForAvatar)) {
      return;
    }

    return sendAvatarPlaceholder(res, primaryConstructId);
  } catch (error) {
    console.error('Error serving avatar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to inspect avatar data
router.get('/:id/debug', async (req, res) => {
  try {
    const { id } = req.params;

    // Get raw database row from both tables
    let rawAisRow = null;
    let rawGptsRow = null;
    let tableUsed = 'none';

    try {
      const aisStmt = aiManager.db.prepare('SELECT * FROM ais WHERE id = ?');
      rawAisRow = aisStmt.get(id);
      if (rawAisRow) {
        tableUsed = 'ais';
      }
    } catch (error) {
      console.log(`Debug: ais table query failed: ${error.message}`);
    }

    try {
      const gptsStmt = aiManager.db.prepare('SELECT * FROM gpts WHERE id = ?');
      rawGptsRow = gptsStmt.get(id);
      if (rawGptsRow && !rawAisRow) {
        tableUsed = 'gpts';
      }
    } catch (error) {
      console.log(`Debug: gpts table query failed: ${error.message}`);
    }

    // Get processed AI object
    const processedAI = await aiManager.getAI(id);

    // Extract avatar information
    const debugInfo = {
      id,
      rawData: {
        ais: rawAisRow ? {
          avatar: rawAisRow.avatar,
          avatarType: rawAisRow.avatar === null ? 'null' : typeof rawAisRow.avatar,
          avatarLength: typeof rawAisRow.avatar === 'string' ? rawAisRow.avatar.length : 'N/A',
          avatarPreview: typeof rawAisRow.avatar === 'string' && rawAisRow.avatar.length > 0
            ? rawAisRow.avatar.substring(0, 100) + (rawAisRow.avatar.length > 100 ? '...' : '')
            : rawAisRow.avatar
        } : null,
        gpts: rawGptsRow ? {
          avatar: rawGptsRow.avatar,
          avatarType: rawGptsRow.avatar === null ? 'null' : typeof rawGptsRow.avatar,
          avatarLength: typeof rawGptsRow.avatar === 'string' ? rawGptsRow.avatar.length : 'N/A',
          avatarPreview: typeof rawGptsRow.avatar === 'string' && rawGptsRow.avatar.length > 0
            ? rawGptsRow.avatar.substring(0, 100) + (rawGptsRow.avatar.length > 100 ? '...' : '')
            : rawGptsRow.avatar
        } : null
      },
      processedData: processedAI ? {
        avatar: processedAI.avatar,
        avatarType: processedAI.avatar === null ? 'null' : typeof processedAI.avatar,
        avatarLength: typeof processedAI.avatar === 'string' ? processedAI.avatar.length : 'N/A',
        avatarPreview: typeof processedAI.avatar === 'string' && processedAI.avatar.length > 0
          ? processedAI.avatar.substring(0, 100) + (processedAI.avatar.length > 100 ? '...' : '')
          : processedAI.avatar,
        hasAvatar: !!processedAI.avatar
      } : null,
      tableUsed
    };

    res.json({ success: true, debug: debugInfo });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get AI context for runtime
router.get('/:id/context', async (req, res) => {
  try {
    const context = await aiManager.getAIContext(req.params.id);
    res.json({ success: true, context });
  } catch (error) {
    console.error('Error fetching context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update AI context
router.put('/:id/context', async (req, res) => {
  try {
    const { context } = req.body;
    await aiManager.updateAIContext(req.params.id, context);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Load AI for runtime
router.post('/:id/load', async (req, res) => {
  try {
    const runtime = await aiManager.loadAIForRuntime(req.params.id);
    if (!runtime) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }
    res.json({ success: true, runtime });
  } catch (error) {
    console.error('Error loading AI for runtime:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Migrate existing AIs to have constructCallsign
router.post('/migrate', async (req, res) => {
  try {
    console.log('🔄 [AIs API] Starting migration of existing AIs...');
    const result = await aiManager.migrateExistingAIs();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error migrating AIs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/prompt-context', async (req, res) => {
  const startTime = Date.now();
  try {
    const { userId, chattyUserId } = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    let ai = await aiManager.getAI(req.params.id);
    if (!ai) {
      ai = await aiManager.getAIByCallsign(req.params.id, userId);
    }
    if (!ai) {
      return res.status(404).json({ success: false, error: 'AI not found' });
    }

    const ownerMatch = ai.userId === userId || ai.userId === chattyUserId;
    if (!ownerMatch) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const constructCallsign = ai.constructCallsign || (req.params.id.includes('-') ? req.params.id : null);
    if (!constructCallsign) {
      return res.status(400).json({ success: false, error: 'No construct callsign available for this AI' });
    }

    const supabase = getSupabaseClient();

    const [identityResult, physicalFeaturesResult, capsuleResult, verifiedMemoriesResult, knowledgeFilesResult, ledgerResult] = await Promise.allSettled([
      (async () => {
        const identity = await loadIdentityFiles(userId, constructCallsign);
        return {
          loaded: !!(identity.prompt || identity.conditioning),
          promptLength: identity.prompt ? identity.prompt.length : 0,
          hasConditioning: !!identity.conditioning,
          conditioningLength: identity.conditioning ? identity.conditioning.length : 0,
        };
      })(),

      (async () => {
        if (!supabase) throw new Error('Supabase not available');
        const { data, error } = await supabase
          .from('vault_files')
          .select('content')
          .eq('construct_id', constructCallsign)
          .like('filename', '%physical_features%')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data?.content) return { loaded: false, error: 'No physical features file found' };
        let features = data.content;
        try { features = JSON.parse(data.content); } catch {}
        return { loaded: true, features };
      })(),

      (async () => {
        if (!supabase) throw new Error('Supabase not available');
        const { data, error } = await supabase
          .from('vault_files')
          .select('content, filename')
          .eq('construct_id', constructCallsign)
          .like('filename', '%.capsule%')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data?.content) return { loaded: false, error: 'No capsule file found' };
        let capsuleData = data.content;
        try { capsuleData = JSON.parse(data.content); } catch {}
        return { loaded: true, filename: data.filename, contentLength: data.content.length };
      })(),

      (async () => {
        const memStart = Date.now();
        const result = await loadVerifiedMemories(constructCallsign, 'Tell me about yourself');
        return {
          loaded: !!(result.memories && result.memories.length > 0),
          count: result.memories ? result.memories.length : 0,
          source: result.source || 'unknown',
          timing: Date.now() - memStart,
        };
      })(),

      (async () => {
        if (!supabase) throw new Error('Supabase not available');
        const docsPath = `instances/${constructCallsign}/documents/`;
        const assetsPath = `instances/${constructCallsign}/assets/`;
        const { data, error } = await supabase
          .from('vault_files')
          .select('filename, content')
          .or(`filename.like.${docsPath}%,filename.like.${assetsPath}%`)
          .eq('construct_id', constructCallsign);
        if (error) throw new Error(error.message);
        const files = data || [];
        const totalChars = files.reduce((sum, f) => sum + (f.content ? f.content.length : 0), 0);
        return { loaded: files.length > 0, fileCount: files.length, totalChars };
      })(),

      (async () => {
        const ledger = await loadLedger(constructCallsign);
        if (!ledger) return { loaded: false, error: 'No ledger found' };
        return { loaded: true, sessionCount: ledger.sessionCount || (ledger.sessions ? ledger.sessions.length : 0) };
      })(),
    ]);

    const extractSection = (result) => {
      if (result.status === 'fulfilled') return result.value;
      return { loaded: false, error: result.reason?.message || 'Unknown error' };
    };

    res.json({
      constructId: constructCallsign,
      sections: {
        identity: extractSection(identityResult),
        physicalFeatures: extractSection(physicalFeaturesResult),
        capsule: extractSection(capsuleResult),
        verifiedMemories: extractSection(verifiedMemoriesResult),
        knowledgeFiles: extractSection(knowledgeFilesResult),
        ledger: extractSection(ledgerResult),
      },
      timing: { total: Date.now() - startTime },
    });
  } catch (error) {
    console.error('❌ [AIs API] Error loading prompt context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/reindex-knowledge', async (req, res) => {
  try {
    const { allowed, ai, userId } = await verifyAIOwnership(req, req.params.id);
    if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });

    const constructCallsign = ai?.constructCallsign || req.params.id.replace(/^(ai-|gpt-)/, '');
    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(503).json({ success: false, error: 'Supabase not available' });

    const { data: rows, error } = await supabase
      .from('vault_files')
      .select('id, filename, file_type, storage_path, metadata')
      .eq('user_id', userId)
      .eq('construct_id', constructCallsign);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return res.json({ success: true, message: 'No files to reindex', total: 0, moved: 0 });
    }

    const MEDIA_EXT = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|mov|avi|mkv|webm|mp3|wav|ogg|flac|aac|m4a)$/i;
    const TRANSCRIPT_PLATFORMS = new Set(['chatty', 'chatgpt', 'gemini', 'claude', 'openrouter', 'ollama', 'character.ai', 'codex', 'github_copilot']);
    const SYSTEM_FOLDERS = new Set(['identity', 'memup', 'config', 'logs', 'data', 'frame', 'simDrive', 'vxrunner', 'lin', 'tests']);

    let moved = 0;
    const changes = [];

    for (const row of rows) {
      const path = row.filename || '';
      const parts = path.split('/');
      const instancesIdx = parts.indexOf('instances');
      if (instancesIdx < 0 || parts.length <= instancesIdx + 2) continue;

      const topFolder = parts[instancesIdx + 2];
      const basename = parts[parts.length - 1];

      if (topFolder === 'assets' || topFolder === 'documents') continue;
      if (TRANSCRIPT_PLATFORMS.has(topFolder)) continue;
      if (SYSTEM_FOLDERS.has(topFolder)) continue;

      const isMedia = MEDIA_EXT.test(basename);
      const newFolder = isMedia ? 'assets' : 'documents';
      const remainder = parts.slice(instancesIdx + 3).join('/');
      const newPath = remainder
        ? `instances/${constructCallsign}/${newFolder}/${remainder}`
        : `instances/${constructCallsign}/${newFolder}/${basename}`;

      const { error: updateErr } = await supabase
        .from('vault_files')
        .update({
          filename: newPath,
          file_type: newFolder,
          metadata: {
            ...(typeof row.metadata === 'object' ? row.metadata : {}),
            reindexed_from: path,
            reindexed_at: new Date().toISOString(),
          }
        })
        .eq('id', row.id);

      if (!updateErr) {
        changes.push({ id: row.id, from: path, to: newPath, reason: `${topFolder} → ${newFolder}` });
        moved++;
      } else {
        console.warn(`⚠️ [Reindex] Failed to move ${row.id}: ${updateErr.message}`);
      }
    }

    console.log(`✅ [Reindex] ${constructCallsign}: ${moved}/${rows.length} files reindexed`);
    res.json({
      success: true,
      constructCallsign,
      total: rows.length,
      moved,
      changes: changes.slice(0, 50),
    });
  } catch (error) {
    console.error('❌ [Reindex] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export const __test__ = {
  buildSummaryAvatarUrl,
  getAIDLookupCandidates,
  hydrateAISummaryAvatarsFromVVAULT,
};

export default router;
