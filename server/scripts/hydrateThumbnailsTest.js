import '../loadEnv.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import {
  ensureThumbnailTableAvailable,
  getThumbnailByParentId,
  listThumbnailsByParentId,
  upsertThumbnailForParent,
} from '../lib/thumbnails.js';
import { runHydrationOnce } from './hydrateThumbnails.js';

function getClientOrThrow() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  return supabase;
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
  const ext = value.split('?')[0].split('#')[0].split('.').pop();
  return ext ? ext.toLowerCase() : null;
}

function isImageCandidate(row) {
  const metadata = parseMetadata(row.metadata);
  const mime = String(metadata.mimeType || metadata.mime_type || metadata.content_type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;

  const candidates = [metadata.originalName, metadata.original_path, row.storage_path, row.filename];
  return candidates.some((candidate) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(getExtension(candidate)));
}

async function findSampleVaultFile() {
  const supabase = getClientOrThrow();
  const { data, error } = await supabase
    .from('vault_files')
    .select('id,user_id,construct_id,filename,storage_path,sha256,metadata')
    .not('storage_path', 'is', null)
    .limit(250);

  if (error) {
    throw new Error(`Failed to query sample vault_files rows: ${error.message}`);
  }

  const sample = (data ?? []).find(isImageCandidate);
  if (!sample) {
    throw new Error('No thumbnailable vault_files row found in the current environment');
  }
  return sample;
}

async function main() {
  try {
    await ensureThumbnailTableAvailable();

    const sample = await findSampleVaultFile();
    console.log(`Using sample vault_files row ${sample.id} (${sample.filename})`);

    await upsertThumbnailForParent({
      parentId: sample.id,
      userId: sample.user_id,
      constructId: sample.construct_id,
      status: 'missing',
      source: null,
      sourceKind: null,
      parentSha256: null,
      errorCode: null,
      errorMessage: null,
    });

    const results = await runHydrationOnce({ parentId: sample.id, limit: 1 });
    const finalRow = await getThumbnailByParentId(sample.id);
    const duplicates = await listThumbnailsByParentId(sample.id);

    const hasTerminalStatus = finalRow && (
      finalRow.status === 'hydrated' ||
      (finalRow.status === 'failed' && Boolean(finalRow.error_code))
    );

    const ok = Boolean(hasTerminalStatus) && duplicates.length === 1;

    console.log(`Hydrator results: ${JSON.stringify(results.map((result) => ({ parentId: result.parentId, outcome: result.outcome, detail: result.detail })), null, 2)}`);
    console.log(`Final row: ${JSON.stringify(finalRow, null, 2)}`);
    console.log(`Duplicate rows for parent ${sample.id}: ${duplicates.length}`);

    if (!ok) {
      console.error('FAIL hydrate:thumbnails:test');
      process.exit(1);
    }

    console.log('PASS hydrate:thumbnails:test');
  } catch (error) {
    console.error(`FAIL hydrate:thumbnails:test - ${error.message}`);
    process.exit(1);
  }
}

main();
