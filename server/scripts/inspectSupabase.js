import '../loadEnv.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

function parseColumnsFromDefinition(definition) {
  const properties = definition?.properties || {};
  return Object.keys(properties);
}

async function fetchSchemaSpec() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY is missing');
  }

  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Supabase REST schema cache: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function sampleVaultRows(supabase, queryBuilder) {
  const { data, error } = await queryBuilder.limit(1);
  if (error) {
    throw new Error(`Failed to sample vault_files rows: ${error.message}`);
  }
  return data ?? [];
}

function printSection(title, value) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  if (Array.isArray(value)) {
    console.log(value.length ? JSON.stringify(value, null, 2) : '[]');
    return;
  }
  if (typeof value === 'string') {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client could not be initialized');
  }

  const schemaSpec = await fetchSchemaSpec();
  const definitions = schemaSpec.definitions || {};
  const tables = Object.keys(definitions).sort();

  const requiredTables = ['users', 'vault_files'];
  const missingRequiredTables = requiredTables.filter((table) => !tables.includes(table));
  if (missingRequiredTables.length) {
    throw new Error(`Missing required Supabase tables: ${missingRequiredTables.join(', ')}`);
  }

  const vaultFileColumns = parseColumnsFromDefinition(definitions.vault_files);

  const avatarRows = await sampleVaultRows(
    supabase,
    supabase
      .from('vault_files')
      .select('id,user_id,construct_id,filename,storage_path,file_type,sha256,created_at')
      .or('filename.like.%avatar.png,filename.like.%avatar.jpg,filename.like.%avatar.jpeg,filename.like.%avatar.webp,filename.like.%avatar.svg,filename.like.%avatar.avif')
      .order('created_at', { ascending: false })
  );

  const conversationRows = await sampleVaultRows(
    supabase,
    supabase
      .from('vault_files')
      .select('id,user_id,construct_id,filename,file_type,sha256,created_at')
      .or('file_type.eq.conversation,filename.like.instances/%/chatty/%')
      .order('created_at', { ascending: false })
  );

  const genericBinaryRows = await sampleVaultRows(
    supabase,
    supabase
      .from('vault_files')
      .select('id,user_id,construct_id,filename,storage_path,file_type,sha256,created_at')
      .eq('file_type', 'binary')
      .order('created_at', { ascending: false })
  );

  printSection('Project', {
    host: new URL(process.env.SUPABASE_URL).host,
    url: process.env.SUPABASE_URL,
  });
  printSection('Tables', tables);
  printSection('users columns', parseColumnsFromDefinition(definitions.users));
  printSection('vault_files columns', vaultFileColumns);
  printSection('vault_file_thumbnails columns', definitions.vault_file_thumbnails ? parseColumnsFromDefinition(definitions.vault_file_thumbnails) : ['(table not present)']);
  printSection('Sample avatar rows', avatarRows);
  printSection('Sample conversation rows', conversationRows);
  printSection('Sample binary rows', genericBinaryRows);
}

main().catch((error) => {
  console.error(`supabase:inspect failed: ${error.message}`);
  process.exit(1);
});
