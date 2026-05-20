import { fileURLToPath } from 'url';
import path from 'path';
import '../loadEnv.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import {
  ensureThumbnailTableAvailable,
  getThumbnailByParentId,
  listMissingThumbnails,
  listMissingThumbnailsByConstruct,
  listMissingThumbnailsByUser,
  upsertThumbnailForParent,
} from '../lib/thumbnails.js';

const DEFAULT_BUCKET = 'vault-files';
const THUMBNAIL_PREFIX = 'thumbnails';
const THUMBNAILABLE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']);

function getClientOrThrow() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  return supabase;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : 'true';
    args[key] = value;
  }
  return args;
}

function parseMetadata(rawMetadata) {
  if (!rawMetadata) return {};
  if (typeof rawMetadata === 'object') return rawMetadata;
  try {
    return JSON.parse(rawMetadata);
  } catch {
    return {};
  }
}

function getExtension(value) {
  if (!value || typeof value !== 'string') return null;
  const clean = value.split('?')[0].split('#')[0];
  const ext = path.extname(clean).replace('.', '').toLowerCase();
  return ext || null;
}

function inferMimeType(vaultFile, metadata) {
  const metadataMime = metadata.mimeType || metadata.mime_type || metadata.content_type || null;
  if (metadataMime) return String(metadataMime).toLowerCase();

  const ext = inferExtension(vaultFile, metadata);
  if (!ext) return null;

  const mimeByExt = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
  };

  return mimeByExt[ext] ?? null;
}

function inferExtension(vaultFile, metadata) {
  const candidates = [
    metadata.extension,
    metadata.originalName,
    metadata.original_path,
    vaultFile.storage_path,
    vaultFile.filename,
  ];

  for (const candidate of candidates) {
    const ext = getExtension(candidate);
    if (ext) return ext;
  }

  const mime = metadata.mimeType || metadata.mime_type || metadata.content_type || '';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/avif') return 'avif';
  return null;
}

function isThumbnailable(vaultFile, metadata) {
  const mimeType = inferMimeType(vaultFile, metadata);
  if (mimeType?.startsWith('image/')) return true;
  const extension = inferExtension(vaultFile, metadata);
  return extension ? THUMBNAILABLE_EXTENSIONS.has(extension) : false;
}

function getStorageBucket(metadata) {
  return metadata.storage_bucket || metadata.storageBucket || DEFAULT_BUCKET;
}

function getSourceStoragePath(vaultFile, metadata) {
  return vaultFile.storage_path || metadata.storage_path || metadata.original_path || vaultFile.filename || null;
}

function getThumbnailStoragePath(parentId, extension) {
  const safeExtension = extension === 'jpeg' ? 'jpg' : (extension || 'png');
  return `${THUMBNAIL_PREFIX}/${parentId}.${safeExtension}`;
}

async function loadVaultFileById(parentId) {
  const supabase = getClientOrThrow();
  const { data, error } = await supabase
    .from('vault_files')
    .select('id,user_id,construct_id,filename,file_type,storage_path,sha256,metadata')
    .eq('id', parentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load vault_files row ${parentId}: ${error.message}`);
  }
  return data ?? null;
}

async function loadWorkItems({ userId, constructId, parentId, limit }) {
  if (parentId) {
    const row = await getThumbnailByParentId(parentId);
    return row ? [row] : [];
  }
  if (constructId) return listMissingThumbnailsByConstruct(constructId, limit);
  if (userId) return listMissingThumbnailsByUser(userId, limit);
  return listMissingThumbnails(limit);
}

async function markFailed(existingRow, parentId, fallbackUserId, fallbackConstructId, errorCode, errorMessage) {
  return upsertThumbnailForParent({
    parentId,
    userId: existingRow?.user_id || fallbackUserId,
    constructId: existingRow?.construct_id ?? fallbackConstructId ?? null,
    status: 'failed',
    source: existingRow?.source ?? null,
    sourceKind: existingRow?.source_kind ?? null,
    parentSha256: existingRow?.parent_sha256 ?? null,
    errorCode,
    errorMessage,
  });
}

/**
 * @param {{ parentId: string, existingRow?: import('../lib/thumbnails.js').ThumbnailRow | null }} options
 * @returns {Promise<{ parentId: string, outcome: 'hydrated'|'failed'|'skipped', detail: string, row: import('../lib/thumbnails.js').ThumbnailRow | null }>}
 */
export async function hydrateThumbnailForParent({ parentId, existingRow = null }) {
  const supabase = getClientOrThrow();
  const vaultFile = await loadVaultFileById(parentId);

  if (!vaultFile) {
    const failedRow = existingRow
      ? await markFailed(existingRow, parentId, existingRow.user_id, existingRow.construct_id, 'PARENT_NOT_FOUND', `vault_files row ${parentId} does not exist`)
      : null;
    return { parentId, outcome: 'failed', detail: 'Parent vault_files row not found', row: failedRow };
  }

  const metadata = parseMetadata(vaultFile.metadata);
  const thumbnailRow = existingRow || (await getThumbnailByParentId(parentId));

  if (thumbnailRow?.status === 'hydrated' && thumbnailRow.parent_sha256 && thumbnailRow.parent_sha256 === vaultFile.sha256 && thumbnailRow.source) {
    return { parentId, outcome: 'skipped', detail: 'Already hydrated for current parent fingerprint', row: thumbnailRow };
  }

  if (!isThumbnailable(vaultFile, metadata)) {
    const failedRow = await markFailed(
      thumbnailRow,
      parentId,
      vaultFile.user_id,
      vaultFile.construct_id,
      'UNSUPPORTED_TYPE',
      `File ${vaultFile.filename} is not thumbnailable`
    );
    return { parentId, outcome: 'failed', detail: 'Unsupported file type', row: failedRow };
  }

  const sourceStoragePath = getSourceStoragePath(vaultFile, metadata);
  if (!sourceStoragePath) {
    const failedRow = await markFailed(
      thumbnailRow,
      parentId,
      vaultFile.user_id,
      vaultFile.construct_id,
      'MISSING_SOURCE_PATH',
      `No storage path available for ${vaultFile.filename}`
    );
    return { parentId, outcome: 'failed', detail: 'Missing source storage path', row: failedRow };
  }

  const bucket = getStorageBucket(metadata);
  const sourceExtension = inferExtension(vaultFile, metadata) || 'png';
  const sourceMime = inferMimeType(vaultFile, metadata) || 'image/png';
  const thumbnailStoragePath = getThumbnailStoragePath(parentId, sourceExtension);

  await upsertThumbnailForParent({
    parentId,
    userId: vaultFile.user_id,
    constructId: vaultFile.construct_id,
    status: 'hydrating',
    source: thumbnailStoragePath,
    sourceKind: 'storage_path',
    parentSha256: thumbnailRow?.parent_sha256 ?? null,
    errorCode: null,
    errorMessage: null,
  });

  const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(sourceStoragePath);
  if (downloadError) {
    const failedRow = await markFailed(
      thumbnailRow,
      parentId,
      vaultFile.user_id,
      vaultFile.construct_id,
      'SOURCE_DOWNLOAD_FAILED',
      downloadError.message
    );
    return { parentId, outcome: 'failed', detail: `Download failed: ${downloadError.message}`, row: failedRow };
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from(bucket).upload(thumbnailStoragePath, buffer, {
    contentType: sourceMime,
    upsert: true,
  });

  if (uploadError) {
    const failedRow = await markFailed(
      thumbnailRow,
      parentId,
      vaultFile.user_id,
      vaultFile.construct_id,
      'THUMBNAIL_UPLOAD_FAILED',
      uploadError.message
    );
    return { parentId, outcome: 'failed', detail: `Upload failed: ${uploadError.message}`, row: failedRow };
  }

  const hydratedRow = await upsertThumbnailForParent({
    parentId,
    userId: vaultFile.user_id,
    constructId: vaultFile.construct_id,
    status: 'hydrated',
    source: thumbnailStoragePath,
    sourceKind: 'storage_path',
    parentSha256: vaultFile.sha256 ?? null,
    errorCode: null,
    errorMessage: null,
  });

  return { parentId, outcome: 'hydrated', detail: `Stored thumbnail at ${thumbnailStoragePath}`, row: hydratedRow };
}

/**
 * @param {{ userId?: string, constructId?: string, parentId?: string, limit?: number }} [options]
 */
export async function runHydrationOnce(options = {}) {
  await ensureThumbnailTableAvailable();

  const workItems = await loadWorkItems(options);
  const results = [];

  if (workItems.length === 0) {
    console.log('No thumbnail work items found for the requested scope.');
    return results;
  }

  for (const item of workItems) {
    console.log(`Hydrating thumbnail for parent ${item.parent_id} (status=${item.status})`);
    const result = await hydrateThumbnailForParent({ parentId: item.parent_id, existingRow: item });
    results.push(result);
    console.log(`  -> ${result.outcome.toUpperCase()}: ${result.detail}`);
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ? Number.parseInt(String(args.limit), 10) : 100;
  const results = await runHydrationOnce({
    userId: args.userId || args.user || undefined,
    constructId: args.constructId || args.construct || undefined,
    parentId: args.parentId || args.parent || undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
  });

  const summary = results.reduce((acc, result) => {
    acc[result.outcome] = (acc[result.outcome] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));

  console.log(`Hydration summary: ${JSON.stringify(summary)}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((error) => {
    console.error(`Thumbnail hydration failed: ${error.message}`);
    process.exit(1);
  });
}
