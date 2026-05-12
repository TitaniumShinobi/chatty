import path from 'path';
import { canonicalizeConstructId } from './constructId.js';
import { getSupabaseClient } from './supabaseClient.js';
import { extractVoiceInstructions } from './voiceContract.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const STORAGE_BUCKET = 'vault-files';
const IDENTITY_BASENAMES = new Set([
  'prompt.json',
  'prompt.txt',
  'definition.json',
  'definitions.json',
  'definition.txt',
  'conditioning.txt',
  'physical-features.json',
  'physical_features.json',
  'physicalfeatures.json',
  'voice.md',
  'voice.json',
  'gender.json',
  'avatar.png',
  'avatar.jpg',
  'avatar.jpeg',
  'avatar.webp',
  'avatar.avif',
  'avatar.svg',
]);
const AVATAR_BASENAMES = new Set([
  'avatar.png',
  'avatar.jpg',
  'avatar.jpeg',
  'avatar.webp',
  'avatar.avif',
  'avatar.svg',
]);
const GLYPH_AVATAR_RE = /^[a-z0-9-]+_glyph\.(png|jpe?g|webp|avif|svg|gif)$/i;
const AVATAR_EXTENSION_PRIORITY = new Map([
  ['png', 60],
  ['jpg', 50],
  ['jpeg', 45],
  ['webp', 40],
  ['avif', 35],
  ['svg', 30],
]);
const DEFAULT_MODELS = {
  modelId: 'openrouter:meta-llama/llama-3.3-70b-instruct',
  conversationModel: 'openrouter:meta-llama/llama-3.3-70b-instruct',
  creativeModel: 'openrouter:mistralai/mistral-7b-instruct',
  codingModel: 'ollama:qwen2.5-coder:latest',
};
const DEFAULT_CAPABILITIES = {
  webSearch: false,
  canvas: false,
  imageGeneration: false,
  codeInterpreter: false,
  agent: false,
  proactiveInitiation: false,
};

const identityCache = new Map();
let vvaultApiClientPromise = null;

function getSupabaseOrThrow() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not initialized');
  return supabase;
}

function cacheKeyFor(supabaseUserId, constructId) {
  return `${supabaseUserId || 'system'}|${constructId}`;
}

function getCachedIdentity(cacheKey) {
  const cached = identityCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    identityCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedIdentity(cacheKey, value) {
  identityCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

export function clearCanonicalConstructIdentityCache(constructId = null) {
  const normalizedConstructId = constructId ? canonicalizeConstructId(constructId) : null;
  for (const key of identityCache.keys()) {
    if (!normalizedConstructId || key.endsWith(`|${normalizedConstructId}`)) {
      identityCache.delete(key);
    }
  }
}

function basename(filename = '') {
  return path.basename(filename || '');
}

function identityBasenamesFor(normalizedConstructId) {
  return new Set([
    ...IDENTITY_BASENAMES,
    `${normalizedConstructId}_glyph.png`,
    `${normalizedConstructId}_glyph.jpg`,
    `${normalizedConstructId}_glyph.jpeg`,
    `${normalizedConstructId}_glyph.webp`,
    `${normalizedConstructId}_glyph.avif`,
    `${normalizedConstructId}_glyph.svg`,
    `${normalizedConstructId}_glyph.gif`,
  ]);
}

function safeParseJson(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    console.warn(`[ConstructIdentity] safeParseJson failed — expected JSON string, got malformed input`);
    return null;
  }
}

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  return safeParseJson(metadata) || {};
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function firstNonEmptyString(values) {
  for (const value of values) {
    if (isNonEmptyString(value)) return value.trim();
  }
  return '';
}

function firstNonEmptyArray(values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value
        .filter((item) => isNonEmptyString(item))
        .map((item) => item.trim());
    }
  }
  return [];
}

function firstNonEmptyObject(values) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function normalizeCapabilities(candidate) {
  const normalized = { ...DEFAULT_CAPABILITIES };
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return normalized;
  }

  for (const key of Object.keys(DEFAULT_CAPABILITIES)) {
    normalized[key] = toBoolean(candidate[key], DEFAULT_CAPABILITIES[key]);
  }

  return normalized;
}

function rowScore(row, supabaseUserId) {
  const userScore = supabaseUserId && row.user_id === supabaseUserId ? 1000 : 0;
  const sourcePath = String(row?.storage_path || row?.filename || '').toLowerCase();
  const fileBase = basename(sourcePath);
  const ext = path.extname(sourcePath).replace('.', '').toLowerCase();
  const avatarScore = isIdentityAvatarRow(row)
    ? 200 + (GLYPH_AVATAR_RE.test(fileBase) ? 5 : (AVATAR_EXTENSION_PRIORITY.get(ext) || 0))
    : 0;
  const contentScore = isNonEmptyString(row.content) ? 100 : 0;
  const storageScore = isNonEmptyString(row.storage_path) ? 10 : 0;
  const createdAtScore = row.created_at ? new Date(row.created_at).getTime() : 0;
  return { total: userScore + avatarScore + contentScore + storageScore, createdAtScore };
}

function pickBestRow(rows, supabaseUserId) {
  return (rows || [])
    .slice()
    .sort((left, right) => {
      const a = rowScore(left, supabaseUserId);
      const b = rowScore(right, supabaseUserId);
      if (b.total !== a.total) return b.total - a.total;
      return b.createdAtScore - a.createdAtScore;
    })[0] || null;
}

export function isIdentityAvatarRow(row) {
  const fileBase = basename(row?.filename || row?.storage_path || '');
  if (!AVATAR_BASENAMES.has(fileBase) && !GLYPH_AVATAR_RE.test(fileBase)) return false;
  const sourcePath = String(row?.storage_path || row?.filename || '').toLowerCase();
  return !sourcePath || !sourcePath.includes('/assets/') || sourcePath.includes('/identity/');
}

export function pickCanonicalAvatarRow(rows, supabaseUserId = null) {
  return pickBestRow((rows || []).filter((row) => isIdentityAvatarRow(row)), supabaseUserId);
}

function latestTimestamp(rows) {
  const timestamps = (rows || [])
    .map((row) => row?.created_at)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function earliestTimestamp(rows) {
  const timestamps = (rows || [])
    .map((row) => row?.created_at)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

async function readTextContent(row, supabase) {
  if (!row) return '';
  if (isNonEmptyString(row.content)) {
    return row.content;
  }

  const storagePath = row.storage_path || row.filename || null;
  if (!storagePath) return '';

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
  if (error || !data) return '';
  return Buffer.from(await data.arrayBuffer()).toString('utf8');
}

function objectToEditorText(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join('\n');
}

function constructIdVariants(normalizedConstructId) {
  const variants = new Set([normalizedConstructId]);
  variants.add(`gpt-${normalizedConstructId}-seed`);
  variants.add(`gpt-${normalizedConstructId}-seed-001`);
  variants.add(`ai-${normalizedConstructId}`);
  return Array.from(variants);
}

function inferAvatarContentType(row) {
  const metadata = parseMetadata(row?.metadata);
  const metadataType = metadata.mimeType || metadata.mime_type || metadata.content_type;
  if (isNonEmptyString(metadataType)) return metadataType.trim().toLowerCase();

  const ext = path.extname(row?.filename || row?.storage_path || '').replace('.', '').toLowerCase();
  const types = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
  };
  return types[ext] || 'image/png';
}

async function buildAvatarDescriptor({ row, constructId, supabase }) {
  if (!row) return null;

  let signedUrl = null;
  const storagePath = row.storage_path || null;
  if (storagePath) {
    const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 300);
    signedUrl = data?.signedUrl || null;
  }

  return {
    status: 'present',
    constructId,
    filename: row.filename || storagePath || null,
    storagePath,
    signedUrl,
    contentType: inferAvatarContentType(row),
    sha256: row.sha256 || null,
  };
}

function summarizeFileRows(rows) {
  const ordered = (rows || [])
    .slice()
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
  const totalBytes = ordered.reduce((acc, row) => {
    const metadata = parseMetadata(row?.metadata);
    const size = metadata.size || metadata.bytes || metadata.contentLength || 0;
    return acc + (typeof size === 'number' ? size : 0);
  }, 0);

  return {
    totalCount: ordered.length,
    totalBytes,
    sampleFilenames: ordered.slice(0, 20).map((row) => row.filename),
    updatedAt: latestTimestamp(ordered) || new Date().toISOString(),
  };
}

function emptyIdentity(normalizedConstructId, supabaseUserId) {
  return {
    constructId: normalizedConstructId,
    exists: false,
    name: '',
    displayName: '',
    fullName: '',
    aliases: [],
    description: '',
    instructions: '',
    definition: '',
    conversationStarters: [],
    conditioning: '',
    physicalFeatures: '',
    voice: '',
    gender: '',
    avatarDescriptor: null,
    sourceFiles: {},
    createdAt: null,
    updatedAt: null,
    userId: supabaseUserId || null,
    provider: '',
    tags: [],
    categories: [],
    canonRefs: [],
    knowledgeRefs: [],
    orchestrationMode: 'lin',
    memoryEnabled: false,
    memoryProfile: 'off',
    hasPersistentMemory: true,
    roleplayEnabled: false,
    configJson: null,
    modelId: DEFAULT_MODELS.modelId,
    conversationModel: DEFAULT_MODELS.conversationModel,
    creativeModel: DEFAULT_MODELS.creativeModel,
    codingModel: DEFAULT_MODELS.codingModel,
    capabilities: { ...DEFAULT_CAPABILITIES },
  };
}

async function getVvaultApiClient() {
  if (!vvaultApiClientPromise) {
    vvaultApiClientPromise = import('../../vvaultConnector/vvaultApiClient.js').catch((error) => {
      vvaultApiClientPromise = null;
      console.warn(`⚠️ [Construct Identity] VVAULT API client import failed: ${error?.message || error}`);
      throw error;
    });
  }
  return vvaultApiClientPromise;
}

function normalizeBodySourceFiles(rawFiles, normalizedConstructId) {
  const sourceFiles = {};
  const addFile = (name, content = '', metadata = {}) => {
    if (!isNonEmptyString(name)) return;
    const filename = name.trim();
    sourceFiles[filename] = {
      id: `vvault-body:${normalizedConstructId}:${filename}`,
      user_id: metadata.user_id || null,
      construct_id: normalizedConstructId,
      filename,
      storage_path: metadata.storage_path || metadata.storagePath || `instances/${normalizedConstructId}/identity/${filename}`,
      content: typeof content === 'string' ? content : JSON.stringify(content ?? ''),
      file_type: metadata.file_type || metadata.fileType || 'identity',
      metadata: {
        ...metadata,
        source: 'vvault_body',
      },
      sha256: metadata.sha256 || null,
      created_at: metadata.created_at || metadata.createdAt || null,
    };
  };

  if (Array.isArray(rawFiles)) {
    for (const file of rawFiles) {
      if (typeof file === 'string') {
        addFile(file, '', {});
      } else if (file && typeof file === 'object') {
        addFile(
          file.filename || file.name || file.storage_path || file.storagePath,
          file.content || '',
          file,
        );
      }
    }
  } else if (rawFiles && typeof rawFiles === 'object') {
    for (const [name, file] of Object.entries(rawFiles)) {
      if (file && typeof file === 'object') {
        addFile(file.filename || name, file.content || '', file);
      } else {
        addFile(name, typeof file === 'string' ? file : '', {});
      }
    }
  }

  return sourceFiles;
}

function normalizeBodyAvatarDescriptor(rawAvatar, sourceFiles, normalizedConstructId) {
  const avatar = rawAvatar && typeof rawAvatar === 'object' && !Array.isArray(rawAvatar)
    ? rawAvatar
    : null;
  const row =
    sourceFiles['avatar.png'] ||
    (avatar?.filename || avatar?.storagePath || avatar?.storage_path
      ? sourceFiles[basename(avatar.filename || avatar.storagePath || avatar.storage_path)]
      : null);
  if (!avatar && !row) return { avatarDescriptor: null, avatarRow: null };

  const filename = avatar?.filename || row?.filename || `instances/${normalizedConstructId}/identity/avatar.png`;
  const storagePath =
    avatar?.storagePath ||
    avatar?.storage_path ||
    row?.storage_path ||
    filename;
  const contentType =
    avatar?.contentType ||
    avatar?.content_type ||
    avatar?.mimeType ||
    avatar?.mime_type ||
    row?.metadata?.contentType ||
    row?.metadata?.mimeType ||
    'image/png';
  const avatarRow = row || {
    id: `vvault-body:${normalizedConstructId}:avatar.png`,
    user_id: null,
    construct_id: normalizedConstructId,
    filename: basename(filename),
    storage_path: storagePath,
    content: avatar?.content || '',
    file_type: 'binary',
    metadata: {
      source: 'vvault_body',
      contentType,
      mimeType: contentType,
    },
    sha256: avatar?.sha256 || null,
    created_at: avatar?.created_at || avatar?.createdAt || null,
  };

  avatarRow.metadata = {
    ...(avatarRow.metadata || {}),
    source: 'vvault_body',
    contentType,
    mimeType: contentType,
    pngMagicOk: avatar?.pngMagicOk ?? avatar?.png_magic_ok ?? avatarRow.metadata?.pngMagicOk,
  };
  if (isNonEmptyString(avatar?.content) && !isNonEmptyString(avatarRow.content)) {
    avatarRow.content = avatar.content;
  }

  return {
    avatarRow,
    avatarDescriptor: {
      status: avatar?.status || 'present',
      constructId: normalizedConstructId,
      filename,
      storagePath,
      signedUrl: null,
      contentType,
      sha256: avatar?.sha256 || avatarRow.sha256 || null,
      source: 'vvault_body',
      pngMagicOk: avatar?.pngMagicOk ?? avatar?.png_magic_ok ?? avatarRow.metadata?.pngMagicOk ?? null,
    },
  };
}

function normalizeVvaultBodyIdentity(apiResult, normalizedConstructId, supabaseUserId) {
  const body = apiResult?.identity || apiResult?.construct || apiResult?.data || apiResult;
  if (!body || typeof body !== 'object') return null;

  const base = emptyIdentity(normalizedConstructId, supabaseUserId);
  const promptConfigJson = firstNonEmptyObject([body.configJson, body.config_json, body.prompt_config]) || null;
  const displayName = firstNonEmptyString([
    body.displayName,
    body.display_name,
    body.name,
    promptConfigJson?.displayName,
  ]) || normalizedConstructId;
  const fullName = firstNonEmptyString([
    body.fullName,
    body.full_name,
    promptConfigJson?.fullName,
    displayName,
  ]) || displayName;
  const sourceFiles = normalizeBodySourceFiles(
    body.sourceFiles || body.source_files || body.files,
    normalizedConstructId,
  );
  const { avatarDescriptor, avatarRow } = normalizeBodyAvatarDescriptor(
    body.avatarDescriptor || body.avatar_descriptor || body.avatar,
    sourceFiles,
    normalizedConstructId,
  );
  if (avatarRow) {
    sourceFiles['avatar.png'] = avatarRow;
  }

  const definition = firstNonEmptyString([
    body.definition,
    body.system_definition,
    body.systemDefinition,
    body.prompt,
  ]);
  const instructions = firstNonEmptyString([
    body.instructions,
    body.system_prompt,
    body.systemPrompt,
    body.prompt_text,
  ]);
  const conditioning = firstNonEmptyString([body.conditioning]);
  const physicalFeatures = firstNonEmptyString([
    body.physicalFeatures,
    body.physical_features,
    objectToEditorText(body.physicalFeatures),
    objectToEditorText(body.physical_features),
  ]);
  const voice =
    firstNonEmptyString([
      typeof body.voice === 'string' ? body.voice : '',
      body.voice?.instructions,
      body.voice?.style,
      extractVoiceInstructions(body.voice && typeof body.voice === 'object' ? body.voice : {}),
    ]);

  if (instructions || definition || body.description || body.conversationStarters || body.conversation_starters) {
    sourceFiles['prompt.json'] ||= {
      id: `vvault-body:${normalizedConstructId}:prompt.json`,
      user_id: supabaseUserId || null,
      construct_id: normalizedConstructId,
      filename: 'prompt.json',
      storage_path: `instances/${normalizedConstructId}/identity/prompt.json`,
      content: JSON.stringify({
        name: displayName,
        fullName,
        description: body.description || '',
        instructions,
        definition,
        conversationStarters: body.conversationStarters || body.conversation_starters || [],
      }),
      file_type: 'identity',
      metadata: { source: 'vvault_body', synthetic: true },
      sha256: null,
      created_at: null,
    };
  }
  if (definition) {
    sourceFiles['definition.txt'] ||= {
      id: `vvault-body:${normalizedConstructId}:definition.txt`,
      user_id: supabaseUserId || null,
      construct_id: normalizedConstructId,
      filename: 'definition.txt',
      storage_path: `instances/${normalizedConstructId}/identity/definition.txt`,
      content: definition,
      file_type: 'identity',
      metadata: { source: 'vvault_body', synthetic: true },
      sha256: null,
      created_at: null,
    };
  }
  if (voice) {
    sourceFiles['voice.json'] ||= {
      id: `vvault-body:${normalizedConstructId}:voice.json`,
      user_id: supabaseUserId || null,
      construct_id: normalizedConstructId,
      filename: 'voice.json',
      storage_path: `instances/${normalizedConstructId}/identity/voice.json`,
      content: JSON.stringify({ voice }),
      file_type: 'identity',
      metadata: { source: 'vvault_body', synthetic: true },
      sha256: null,
      created_at: null,
    };
  }

  return {
    ...base,
    exists: true,
    name: displayName,
    displayName,
    fullName,
    aliases: firstNonEmptyArray([body.aliases, promptConfigJson?.aliases]),
    description: firstNonEmptyString([body.description]),
    instructions,
    definition,
    conversationStarters: firstNonEmptyArray([
      body.conversationStarters,
      body.conversation_starters,
    ]),
    conditioning,
    physicalFeatures,
    voice,
    gender: firstNonEmptyString([body.gender, body.physical_features?.gender, body.physicalFeatures?.gender]),
    avatarDescriptor,
    avatarRow,
    sourceFiles,
    createdAt: body.createdAt || body.created_at || null,
    updatedAt: body.updatedAt || body.updated_at || apiResult?.updated_at || null,
    userId: body.user_id || body.userId || supabaseUserId || null,
    provider: firstNonEmptyString([body.provider, promptConfigJson?.provider]),
    tags: firstNonEmptyArray([body.tags, promptConfigJson?.tags]),
    categories: firstNonEmptyArray([body.categories, promptConfigJson?.categories]),
    canonRefs: firstNonEmptyArray([body.canonRefs, body.canon_refs, promptConfigJson?.canonRefs]),
    knowledgeRefs: firstNonEmptyArray([body.knowledgeRefs, body.knowledge_refs, promptConfigJson?.knowledgeRefs]),
    orchestrationMode: firstNonEmptyString([body.orchestrationMode, body.orchestration_mode]) || base.orchestrationMode,
    memoryEnabled: toBoolean(body.memoryEnabled ?? body.memory_enabled, base.memoryEnabled),
    memoryProfile: firstNonEmptyString([body.memoryProfile, body.memory_profile]) || base.memoryProfile,
    hasPersistentMemory: toBoolean(body.hasPersistentMemory ?? body.has_persistent_memory, base.hasPersistentMemory),
    roleplayEnabled: toBoolean(body.roleplayEnabled ?? body.roleplay_enabled, base.roleplayEnabled),
    configJson: promptConfigJson,
    modelId: firstNonEmptyString([body.modelId, body.model_id]) || base.modelId,
    conversationModel: firstNonEmptyString([body.conversationModel, body.conversation_model]) || base.conversationModel,
    creativeModel: firstNonEmptyString([body.creativeModel, body.creative_model]) || base.creativeModel,
    codingModel: firstNonEmptyString([body.codingModel, body.coding_model]) || base.codingModel,
    capabilities: normalizeCapabilities(body.capabilities || promptConfigJson?.capabilities),
    identitySource: 'vvault_body',
    source: 'vvault_body',
    storageMode: 'vvault_body',
    bodyNative: true,
  };
}

async function loadVvaultBodyIdentity({ normalizedConstructId, supabaseUserId }) {
  try {
    const { getConstructIdentity } = await getVvaultApiClient();
    if (typeof getConstructIdentity !== 'function') return null;
    const apiResult = await getConstructIdentity(normalizedConstructId, { supabaseUserId });
    if (!apiResult) return null;
    return normalizeVvaultBodyIdentity(apiResult, normalizedConstructId, supabaseUserId);
  } catch (error) {
    console.warn(`⚠️ [Construct Identity] VVAULT body identity unavailable for ${normalizedConstructId}:`, error.message);
    return null;
  }
}

async function loadIdentityRows({ normalizedConstructId, supabaseUserId, supabase }) {
  const identityBasenames = identityBasenamesFor(normalizedConstructId);
  const filenameConditions = Array.from(identityBasenames)
    .flatMap((name) => [
      `filename.eq.${name}`,
      `filename.ilike.%/${name}`,
    ])
    .join(',');

  let query = supabase
    .from('vault_files')
    .select('id,user_id,construct_id,filename,storage_path,content,file_type,metadata,sha256,created_at')
    .in('construct_id', constructIdVariants(normalizedConstructId))
    .or(filenameConditions)
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load canonical identity for ${normalizedConstructId}: ${error.message}`);
  }

  const rows = (data || []).filter((row) => identityBasenames.has(basename(row.filename)));
  if (!supabaseUserId) return rows;

  const userScopedRows = rows.filter((row) => row.user_id === supabaseUserId || row.user_id == null);
  return userScopedRows.length ? userScopedRows : rows;
}

export async function loadCanonicalConstructIdentity({ constructId, supabaseUserId = null }) {
  const normalizedConstructId = canonicalizeConstructId(constructId);
  if (!normalizedConstructId) return emptyIdentity('', supabaseUserId);

  const cacheKey = cacheKeyFor(supabaseUserId, normalizedConstructId);
  const cached = getCachedIdentity(cacheKey);
  if (cached) return cached;

  const bodyIdentity = await loadVvaultBodyIdentity({ normalizedConstructId, supabaseUserId });
  if (bodyIdentity?.exists) {
    // VVAULT body identity is authoritative for text/config identity. Avatar
    // authority still requires a concrete identity avatar file row/descriptor,
    // including avatar.webp. A body-native text response must never hide the
    // canonical avatar file lookup.
    if (bodyIdentity.avatarDescriptor) {
      return setCachedIdentity(cacheKey, bodyIdentity);
    }

    const supabaseForAvatar = getSupabaseClient();
    if (!supabaseForAvatar) {
      return setCachedIdentity(cacheKey, bodyIdentity);
    }

    const avatarRows = await loadIdentityRows({
      normalizedConstructId,
      supabaseUserId,
      supabase: supabaseForAvatar,
    }).then((rows) => rows.filter((row) => isIdentityAvatarRow(row))).catch((error) => {
      console.warn(`⚠️ [Construct Identity] Avatar row fallback failed for ${normalizedConstructId}:`, error.message);
      return [];
    });
    const avatarRow = pickCanonicalAvatarRow(avatarRows, supabaseUserId);
    const avatarDescriptor = await buildAvatarDescriptor({
      row: avatarRow,
      constructId: normalizedConstructId,
      supabase: supabaseForAvatar,
    });

    if (avatarDescriptor) {
      return setCachedIdentity(cacheKey, {
        ...bodyIdentity,
        avatarDescriptor,
        avatarRow,
        sourceFiles: {
          ...bodyIdentity.sourceFiles,
          [basename(avatarRow.filename)]: avatarRow,
        },
      });
    }

    return setCachedIdentity(cacheKey, bodyIdentity);
  }

  const supabase = getSupabaseOrThrow();
  const relevantRows = await loadIdentityRows({ normalizedConstructId, supabaseUserId, supabase });
  if (!relevantRows.length) {
    return setCachedIdentity(cacheKey, emptyIdentity(normalizedConstructId, supabaseUserId));
  }

  const rowsByName = new Map();
  for (const row of relevantRows) {
    const name = basename(row.filename);
    if (!rowsByName.has(name)) rowsByName.set(name, []);
    rowsByName.get(name).push(row);
  }

  const sourceFiles = {};
  for (const [name, rows] of rowsByName.entries()) {
    const row = pickBestRow(rows, supabaseUserId);
    if (row) sourceFiles[name] = row;
  }

  const [
    promptJsonText,
    promptTxtText,
    definitionJsonText,
    definitionsJsonText,
    definitionTxtText,
    conditioningText,
    physicalFeaturesDashText,
    physicalFeaturesText,
    physicalFeaturesNoUnderscoreText,
    voiceMdText,
    voiceJsonText,
    genderJsonText,
  ] = await Promise.all([
    readTextContent(sourceFiles['prompt.json'], supabase),
    readTextContent(sourceFiles['prompt.txt'], supabase),
    readTextContent(sourceFiles['definition.json'], supabase),
    readTextContent(sourceFiles['definitions.json'], supabase),
    readTextContent(sourceFiles['definition.txt'], supabase),
    readTextContent(sourceFiles['conditioning.txt'], supabase),
    readTextContent(sourceFiles['physical-features.json'], supabase),
    readTextContent(sourceFiles['physical_features.json'], supabase),
    readTextContent(sourceFiles['physicalfeatures.json'], supabase),
    readTextContent(sourceFiles['voice.md'], supabase),
    readTextContent(sourceFiles['voice.json'], supabase),
    readTextContent(sourceFiles['gender.json'], supabase),
  ]);

  const promptJson = safeParseJson(promptJsonText) || {};
  const definitionJson = safeParseJson(definitionJsonText) || safeParseJson(definitionsJsonText) || {};
  const physicalFeaturesTextResolved = firstNonEmptyString([
    physicalFeaturesDashText,
    physicalFeaturesText,
    physicalFeaturesNoUnderscoreText,
  ]);
  const physicalFeaturesJson = safeParseJson(physicalFeaturesTextResolved) || {};
  const physicalFeaturesEditorObject =
    physicalFeaturesJson && typeof physicalFeaturesJson === 'object' && !Array.isArray(physicalFeaturesJson)
      ? { ...physicalFeaturesJson }
      : {};
  delete physicalFeaturesEditorObject.gender;
  const voiceJson = safeParseJson(voiceJsonText) || {};
  const genderJson = safeParseJson(genderJsonText) || {};

  const avatarRows = relevantRows.filter((row) => isIdentityAvatarRow(row));
  if (avatarRows.length > 1) {
    console.warn(
      `⚠️ [Construct Identity] Duplicate identity avatars detected for ${normalizedConstructId}; using deterministic winner`,
      avatarRows.map((row) => row.storage_path || row.filename || row.id),
    );
  }
  const avatarRow = pickCanonicalAvatarRow(avatarRows, supabaseUserId);
  const avatarDescriptor = await buildAvatarDescriptor({
    row: avatarRow,
    constructId: normalizedConstructId,
    supabase,
  });

  const instructionsFromJson = firstNonEmptyString([promptJson.instructions, promptJson.prompt]);
  const promptCapabilities = normalizeCapabilities(promptJson.capabilities);
  const promptConfigJson = firstNonEmptyObject([promptJson.configJson]) || null;
  const displayName = firstNonEmptyString([
    promptJson.displayName,
    promptConfigJson?.displayName,
    promptJson.name,
  ]) || normalizedConstructId;
  const fullName = firstNonEmptyString([
    promptJson.fullName,
    promptConfigJson?.fullName,
    displayName,
  ]) || displayName;
  const aliases = firstNonEmptyArray([
    promptJson.aliases,
    promptConfigJson?.aliases,
  ]);
  const modelId = firstNonEmptyString([promptJson.modelId]) || DEFAULT_MODELS.modelId;
  const conversationModel = firstNonEmptyString([promptJson.conversationModel]) || modelId || DEFAULT_MODELS.conversationModel;
  const creativeModel = firstNonEmptyString([promptJson.creativeModel]) || DEFAULT_MODELS.creativeModel;
  const codingModel = firstNonEmptyString([promptJson.codingModel]) || DEFAULT_MODELS.codingModel;
  const provider = firstNonEmptyString([promptJson.provider, promptConfigJson?.provider]);
  const tags = firstNonEmptyArray([promptJson.tags, promptConfigJson?.tags]);
  const categories = firstNonEmptyArray([promptJson.categories, promptConfigJson?.categories]);
  const canonRefs = firstNonEmptyArray([promptJson.canonRefs, promptConfigJson?.canonRefs]);
  const knowledgeRefs = firstNonEmptyArray([
    promptJson.knowledgeRefs,
    promptConfigJson?.knowledgeRefs,
  ]);
  const orchestrationMode = firstNonEmptyString([promptJson.orchestrationMode]) || 'lin';
  const memoryEnabled = toBoolean(promptJson.memoryEnabled, false);
  const memoryProfile = firstNonEmptyString([promptJson.memoryProfile]) || 'off';
  const hasPersistentMemory = toBoolean(promptJson.hasPersistentMemory, true);
  const roleplayEnabled = toBoolean(promptJson.roleplayEnabled, false);
  const configJson = promptConfigJson;

  const identity = {
    constructId: normalizedConstructId,
    exists: true,
    name: displayName,
    displayName,
    fullName,
    aliases,
    description: firstNonEmptyString([promptJson.description]),
    instructions: instructionsFromJson || firstNonEmptyString([promptTxtText]),
    definition: firstNonEmptyString([
      definitionJson.instructions,
      definitionJson.prompt,
      definitionJson.definition,
      definitionJsonText,
      definitionsJsonText,
      definitionTxtText,
    ]),
    conversationStarters: firstNonEmptyArray([
      promptJson.conversationStarters,
      promptJson.conversation_starters,
    ]),
    conditioning: firstNonEmptyString([conditioningText]),
    physicalFeatures: firstNonEmptyString([
      objectToEditorText(physicalFeaturesEditorObject),
      physicalFeaturesTextResolved,
    ]),
    voice: firstNonEmptyString([extractVoiceInstructions(voiceJson), voiceMdText]),
    gender: firstNonEmptyString([physicalFeaturesJson.gender, genderJson.gender]),
    avatarDescriptor,
    avatarRow,
    sourceFiles,
    createdAt: earliestTimestamp(Object.values(sourceFiles)),
    updatedAt: latestTimestamp(Object.values(sourceFiles)),
    userId:
      sourceFiles['prompt.json']?.user_id ||
      sourceFiles['conditioning.txt']?.user_id ||
      supabaseUserId ||
      null,
    provider,
    tags,
    categories,
    canonRefs,
    knowledgeRefs,
    orchestrationMode,
    memoryEnabled,
    memoryProfile,
    hasPersistentMemory,
    roleplayEnabled,
    configJson,
    modelId,
    conversationModel,
    creativeModel,
    codingModel,
    capabilities: promptCapabilities,
  };

  return setCachedIdentity(cacheKey, identity);
}

export async function loadCanonicalFilesSummary({ constructId, supabaseUserId = null }) {
  const normalizedConstructId = canonicalizeConstructId(constructId);
  if (!normalizedConstructId) {
    return {
      ok: false,
      callsign: constructId || '',
      totalCount: 0,
      totalBytes: 0,
      sampleFilenames: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const supabase = getSupabaseOrThrow();
  let query = supabase
    .from('vault_files')
    .select('filename,metadata,created_at,user_id,construct_id')
    .in('construct_id', constructIdVariants(normalizedConstructId))
    .order('created_at', { ascending: false });

  if (supabaseUserId) {
    query = query.eq('user_id', supabaseUserId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load canonical files summary for ${normalizedConstructId}: ${error.message}`);
  }

  return {
    ok: true,
    callsign: normalizedConstructId,
    ...summarizeFileRows(data || []),
  };
}
