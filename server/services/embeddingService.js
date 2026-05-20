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

const recentlyInjectedIds = new Map();
const RECENTLY_INJECTED_MAX = 20;

function extractDateFromSource(sourceFile) {
  if (!sourceFile) return null;
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/,
    /(\d{2})-(\d{2})-(\d{4})/,
    /(\d{2})_(\d{2})_(\d{4})/,
  ];
  for (const p of patterns) {
    const m = sourceFile.match(p);
    if (m) {
      if (m[3] && m[3].length === 4) return new Date(`${m[3]}-${m[1]}-${m[2]}`);
      if (m[1] && m[1].length === 4) return new Date(`${m[1]}-${m[2]}-${m[3]}`);
    }
  }
  return null;
}

function computeRankedScore(hit, activeConstructId) {
  const semanticSim = hit.similarity || 0;

  const sourceDate = extractDateFromSource(hit.source_file);
  let recencyWeight = 0.5;
  if (sourceDate && !isNaN(sourceDate.getTime())) {
    const daysSince = (Date.now() - sourceDate.getTime()) / (1000 * 60 * 60 * 24);
    recencyWeight = Math.exp(-daysSince / 365);
  }

  const constructWeight = 1.0;

  let antiRepeatPenalty = 0;
  if (hit.id && recentlyInjectedIds.has(hit.id)) {
    antiRepeatPenalty = -0.1;
  }

  const finalScore =
    (semanticSim * 0.60) +
    (recencyWeight * 0.20) +
    (constructWeight * 0.10) +
    (antiRepeatPenalty * 0.05) +
    (0 * 0.05);

  const confidence =
    (semanticSim * 0.7) +
    (recencyWeight * 0.2) +
    0.1;

  let confidenceTier = 'low';
  if (confidence >= 0.70) confidenceTier = 'high';
  else if (confidence >= 0.50) confidenceTier = 'moderate';

  return {
    ...hit,
    finalScore,
    confidence,
    confidenceTier,
    recencyWeight,
    sourceDate: sourceDate ? sourceDate.toISOString().split('T')[0] : null,
  };
}

function hasSemanticReceipt(hit) {
  return typeof hit?.source_file === 'string' &&
    hit.source_file.trim().length > 0 &&
    typeof hit?.content === 'string' &&
    hit.content.trim().length > 0;
}

function trackInjectedMemory(id) {
  if (!id) return;
  recentlyInjectedIds.set(id, Date.now());
  if (recentlyInjectedIds.size > RECENTLY_INJECTED_MAX) {
    const oldest = [...recentlyInjectedIds.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) recentlyInjectedIds.delete(oldest[0]);
  }
}

export async function retrieveSemanticMemories(query, userId, constructId, matchCount = 5) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const embedding = await embedText(query);
  if (!embedding) return [];

  try {
    const candidateCount = Math.max(matchCount * 5, 25);
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: JSON.stringify(embedding),
      match_count: candidateCount,
      p_user: userId,
      p_construct: constructId,
    });

    if (error) {
      console.warn(`⚠️ [EmbeddingService] match_memories RPC failed:`, error.message);
      return [];
    }

    if (!data || data.length === 0) return [];

    let ranked = data
      .map(hit => computeRankedScore(hit, constructId))
      .sort((a, b) => b.finalScore - a.finalScore);

    let filtered = ranked.filter(hit => hit.confidence >= 0.40 && hasSemanticReceipt(hit));

    if (filtered.length === 0 && ranked.length > 0) {
      console.log(`⚠️ [EmbeddingService] Semantic hits found but none had confidence >= 0.40 plus source_file/content receipts; returning no recall evidence`);
    }

    const selected = filtered.slice(0, matchCount);

    for (const r of selected) {
      trackInjectedMemory(r.id);
    }

    return selected;
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
