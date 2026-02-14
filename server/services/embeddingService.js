import OpenAI from 'openai';
import { getSupabaseClient } from '../lib/supabaseClient.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

let openaiClient = null;

function getOpenAI() {
  if (openaiClient) return openaiClient;

  const directKey = process.env.OPENAI_API_KEY;
  if (directKey) {
    openaiClient = new OpenAI({ apiKey: directKey });
    return openaiClient;
  }

  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const integrationBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (integrationKey && integrationKey !== '_DUMMY_API_KEY_' && integrationBase) {
    openaiClient = new OpenAI({ apiKey: integrationKey, baseURL: integrationBase });
    return openaiClient;
  }

  console.warn('⚠️ [EmbeddingService] No OpenAI key found (OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI) — embeddings disabled');
  return null;
}

export async function embedText(text) {
  const client = getOpenAI();
  if (!client) return null;

  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length < 10) return null;

  const truncated = cleaned.length > 8000 ? cleaned.substring(0, 8000) : cleaned;

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncated,
  });

  return response.data[0].embedding;
}

export async function embedBatch(texts) {
  const client = getOpenAI();
  if (!client) return [];

  const cleaned = texts
    .map(t => t.replace(/\s+/g, ' ').trim())
    .filter(t => t.length >= 10)
    .map(t => t.length > 8000 ? t.substring(0, 8000) : t);

  if (cleaned.length === 0) return [];

  const batchSize = 100;
  const allEmbeddings = [];

  for (let i = 0; i < cleaned.length; i += batchSize) {
    const batch = cleaned.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    allEmbeddings.push(...response.data.map(d => d.embedding));
  }

  return allEmbeddings;
}

export async function retrieveSemanticMemories(query, userId, constructId, matchCount = 5) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const embedding = await embedText(query);
  if (!embedding) return [];

  try {
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: JSON.stringify(embedding),
      match_count: matchCount,
      p_user: userId,
      p_construct: constructId,
    });

    if (error) {
      console.warn(`⚠️ [EmbeddingService] match_memories RPC failed:`, error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn(`⚠️ [EmbeddingService] Semantic retrieval error:`, err.message);
    return [];
  }
}

export async function storeEmbedding({ userId, constructId, sourceFile, content, embedding }) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('memory_embeddings')
    .insert({
      user_id: userId,
      construct_id: constructId,
      source_file: sourceFile,
      content,
      embedding: JSON.stringify(embedding),
    })
    .select('id')
    .single();

  if (error) {
    console.warn(`⚠️ [EmbeddingService] Failed to store embedding:`, error.message);
    return null;
  }

  return data?.id;
}

export async function storeEmbeddingBatch(rows) {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const formatted = rows.map(r => ({
    user_id: r.userId,
    construct_id: r.constructId,
    source_file: r.sourceFile,
    content: r.content,
    embedding: JSON.stringify(r.embedding),
  }));

  const { error } = await supabase
    .from('memory_embeddings')
    .insert(formatted);

  if (error) {
    console.warn(`⚠️ [EmbeddingService] Batch store failed:`, error.message);
    return 0;
  }

  return formatted.length;
}

export async function getEmbeddingCount(userId, constructId) {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from('memory_embeddings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('construct_id', constructId);

  if (error) return 0;
  return count || 0;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
