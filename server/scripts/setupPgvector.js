import { getSupabaseClient } from '../lib/supabaseClient.js';

const SETUP_SQL = `
-- ============================================================
-- CHATTY VECTOR MEMORY — Supabase pgvector Setup
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- Step 1: Enable pgvector extension
create extension if not exists vector;

-- Step 2: Create memory_embeddings table
create table if not exists memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  construct_id text not null,
  source_file text,
  content text not null,
  embedding vector(1536),
  chunk_index int default 0,
  created_at timestamptz default now()
);

-- Step 3: Create lookup index
create index if not exists idx_memory_embeddings_user_construct 
on memory_embeddings(user_id, construct_id);

-- Step 4: Create match_memories function for vector similarity search
create or replace function match_memories(
  query_embedding vector(1536),
  match_count int,
  p_user text,
  p_construct text
)
returns table (
  id uuid,
  content text,
  source_file text,
  similarity float
)
language sql stable as $$
  select
    id,
    content,
    source_file,
    1 - (embedding <=> query_embedding) as similarity
  from memory_embeddings
  where user_id = p_user
    and construct_id = p_construct
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
`;

async function checkSetup() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('❌ No Supabase client available');
    process.exit(1);
  }

  console.log('🔍 Checking if memory_embeddings table exists...\n');

  try {
    const { data, error } = await supabase
      .from('memory_embeddings')
      .select('id', { count: 'exact', head: true });

    if (error && error.message.includes('does not exist')) {
      console.log('❌ Table memory_embeddings does NOT exist yet.\n');
      console.log('📋 Please run the following SQL in your Supabase SQL Editor:\n');
      console.log(SETUP_SQL);
      return false;
    } else if (error) {
      console.log(`⚠️  Table check returned error: ${error.message}`);
      console.log('📋 If the table does not exist, run this SQL in Supabase SQL Editor:\n');
      console.log(SETUP_SQL);
      return false;
    } else {
      console.log(`✅ Table memory_embeddings exists (${data} rows)`);

      const { data: rpcData, error: rpcError } = await supabase.rpc('match_memories', {
        query_embedding: JSON.stringify(new Array(1536).fill(0)),
        match_count: 1,
        p_user: 'test',
        p_construct: 'test',
      });

      if (rpcError) {
        console.log(`⚠️  match_memories function not found or broken: ${rpcError.message}`);
        console.log('\n📋 Run the match_memories function SQL from below in Supabase SQL Editor:\n');
        console.log(SETUP_SQL.split('-- Step 4:')[1] || SETUP_SQL);
        return false;
      } else {
        console.log('✅ match_memories RPC function is working');
        return true;
      }
    }
  } catch (err) {
    console.error('❌ Check failed:', err.message);
    console.log('\n📋 Run this SQL in your Supabase SQL Editor:\n');
    console.log(SETUP_SQL);
    return false;
  }
}

const isReady = await checkSetup();
if (isReady) {
  console.log('\n🎉 pgvector setup is complete! Ready to embed transcripts.');
} else {
  console.log('\n⚡ After running the SQL, re-run this script to verify:');
  console.log('   node server/scripts/setupPgvector.js');
}
