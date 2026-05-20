import '../loadEnv.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

const AVATAR_NAMES = ['avatar.png', 'avatar.jpg', 'avatar.jpeg', 'avatar.webp', 'avatar.svg'];

function basename(filename = '') {
  const parts = filename.split('/');
  return parts[parts.length - 1] || filename;
}

async function main() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client could not be initialized');
  }

  const filters = AVATAR_NAMES.map((name) => `filename.like.%/${name}`).join(',');
  const { data, error } = await supabase
    .from('vault_files')
    .select('id,user_id,construct_id,filename,storage_path,created_at')
    .not('construct_id', 'is', null)
    .or(filters)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to audit avatar rows: ${error.message}`);
  }

  const byConstruct = new Map();
  for (const row of data || []) {
    if (!row.construct_id) continue;
    if (!byConstruct.has(row.construct_id)) byConstruct.set(row.construct_id, []);
    byConstruct.get(row.construct_id).push(row);
  }

  const missingCanonical = [];
  const alreadyCanonical = [];
  for (const [constructId, rows] of byConstruct.entries()) {
    const names = new Set(rows.map((row) => basename(row.filename)));
    const legacyNames = Array.from(names).filter((name) => name !== 'avatar.png');
    if (names.has('avatar.png')) {
      alreadyCanonical.push({ constructId, files: Array.from(names).sort() });
      continue;
    }
    if (legacyNames.length > 0) {
      missingCanonical.push({ constructId, files: legacyNames.sort() });
    }
  }

  console.log('Summary');
  console.log('-------');
  console.log(`Constructs with canonical avatar.png: ${alreadyCanonical.length}`);
  console.log(`Constructs needing avatar.png backfill: ${missingCanonical.length}`);
  console.log('\nMissing avatar.png');
  console.log('------------------');
  console.log(JSON.stringify(missingCanonical, null, 2));
}

main().catch((error) => {
  console.error(`FAIL avatars:audit - ${error.message}`);
  process.exit(1);
});
