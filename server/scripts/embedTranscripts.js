import { getSupabaseClient } from '../lib/supabaseClient.js';
import { embedBatch, storeEmbedding, getEmbeddingCount, embedText } from '../services/embeddingService.js';

const TARGET_CHUNK_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN;

function chunkTranscript(content, sourceFile) {
  if (!content || content.length < 50) return [];

  const lines = content.split('\n');
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (const line of lines) {
    const lineLen = line.length + 1;

    if (currentLength + lineLen > TARGET_CHUNK_CHARS && currentLength > 200) {
      chunks.push({
        content: currentChunk.join('\n').trim(),
        sourceFile,
        chunkIndex: chunks.length,
      });

      const overlapLines = [];
      let overlapLen = 0;
      for (let i = currentChunk.length - 1; i >= 0 && overlapLen < OVERLAP_CHARS; i--) {
        overlapLines.unshift(currentChunk[i]);
        overlapLen += currentChunk[i].length + 1;
      }
      currentChunk = overlapLines;
      currentLength = overlapLen;
    }

    currentChunk.push(line);
    currentLength += lineLen;
  }

  if (currentChunk.length > 0 && currentLength > 50) {
    chunks.push({
      content: currentChunk.join('\n').trim(),
      sourceFile,
      chunkIndex: chunks.length,
    });
  }

  return chunks;
}

function parseTranscriptPairsToText(content) {
  const lines = content.split('\n');
  const cleaned = [];
  let currentSpeaker = '';
  let currentText = '';

  for (const line of lines) {
    const userMatch = line.match(/^(?:User|Human|You|Me|Devon)[\s:>]+(.+)/i);
    const assistantMatch = line.match(/^(?:Assistant|AI|Nova|Sera|Zen|Lin|Katana|GPT|ChatGPT|Character)[\s:>]+(.+)/i);

    if (userMatch) {
      if (currentSpeaker && currentText) {
        cleaned.push(`${currentSpeaker}: ${currentText.trim()}`);
      }
      currentSpeaker = 'User';
      currentText = userMatch[1];
    } else if (assistantMatch) {
      if (currentSpeaker && currentText) {
        cleaned.push(`${currentSpeaker}: ${currentText.trim()}`);
      }
      currentSpeaker = 'AI';
      currentText = assistantMatch[1];
    } else if (line.trim()) {
      currentText += ' ' + line.trim();
    }
  }

  if (currentSpeaker && currentText) {
    cleaned.push(`${currentSpeaker}: ${currentText.trim()}`);
  }

  return cleaned.length > 0 ? cleaned.join('\n') : content;
}

const TRANSCRIPT_KEYWORDS = [
  'chat_with_', 'chatgpt', 'character_ai', 'transcript',
  'continuity', 'convo', 'memory_anchors', 'ledger',
  'conversation', 'export'
];

async function discoverTranscriptFiles(supabase, constructId) {
  console.log(`  🔍 Discovering transcript files for ${constructId}...`);

  const { data: fileList, error: listErr } = await supabase
    .from('vault_files')
    .select('filename, user_id')
    .eq('construct_id', constructId)
    .not('content', 'is', null);

  if (listErr) {
    console.warn(`  ⚠️ File listing failed:`, listErr.message);
    return [];
  }

  if (!fileList || fileList.length === 0) return [];

  const transcriptFiles = fileList.filter(f => {
    const fnLower = f.filename.toLowerCase();
    return TRANSCRIPT_KEYWORDS.some(kw => fnLower.includes(kw));
  });

  console.log(`  📋 Found ${transcriptFiles.length} transcript filenames out of ${fileList.length} total files`);

  const allFiles = [];
  const batchSize = 20;

  for (let i = 0; i < transcriptFiles.length; i += batchSize) {
    const batch = transcriptFiles.slice(i, i + batchSize);
    const filenames = batch.map(f => f.filename);

    try {
      const { data, error } = await supabase
        .from('vault_files')
        .select('filename, content, construct_id, user_id')
        .eq('construct_id', constructId)
        .in('filename', filenames);

      if (error) {
        console.warn(`  ⚠️ Batch ${i}-${i + batchSize} load failed:`, error.message);
        continue;
      }

      if (data) {
        for (const file of data) {
          if (file.content && file.content.length >= 100) {
            allFiles.push(file);
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Batch ${i}-${i + batchSize} error:`, err.message);
    }

    if (i > 0 && i % 100 === 0) {
      process.stdout.write(`\r  📥 Loaded ${allFiles.length} files so far (${i}/${transcriptFiles.length} checked)`);
    }
  }

  console.log(`\n  ✅ Loaded content for ${allFiles.length} transcript files`);
  return allFiles;
}

async function clearExistingEmbeddings(supabase, userId, constructId) {
  const { error } = await supabase
    .from('memory_embeddings')
    .delete()
    .eq('user_id', userId)
    .eq('construct_id', constructId);

  if (error) {
    console.warn(`  ⚠️ Failed to clear existing embeddings:`, error.message);
  }
}

async function embedTranscriptsForConstruct(constructId, userId, options = {}) {
  const { clearExisting = true, dryRun = false } = options;
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('❌ No Supabase client');
    return { success: false, error: 'No Supabase client' };
  }

  console.log(`\n🧠 Embedding transcripts for construct: ${constructId}`);
  console.log(`   User: ${userId}`);

  const files = await discoverTranscriptFiles(supabase, constructId);
  console.log(`   📁 Discovered ${files.length} transcript files`);

  if (files.length === 0) {
    console.log('   ⚠️ No transcript files found — nothing to embed');
    return { success: true, filesProcessed: 0, chunksEmbedded: 0 };
  }

  for (const f of files) {
    console.log(`      • ${f.filename} (${f.content.length} chars)`);
  }

  let allChunks = [];
  for (const file of files) {
    const processedContent = parseTranscriptPairsToText(file.content);
    const chunks = chunkTranscript(processedContent, file.filename);
    allChunks.push(...chunks.map(c => ({ ...c, userId: file.user_id || userId })));
  }

  console.log(`   📦 Total chunks to embed: ${allChunks.length}`);

  if (dryRun) {
    console.log('   🏁 Dry run — stopping before embedding');
    return { success: true, filesProcessed: files.length, chunksToEmbed: allChunks.length, dryRun: true };
  }

  if (clearExisting) {
    console.log('   🗑️ Clearing existing embeddings...');
    await clearExistingEmbeddings(supabase, userId, constructId);
  }

  let embedded = 0;
  let failed = 0;
  const batchSize = 20;

  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.content);

    try {
      const embeddings = await embedBatch(texts);

      for (let j = 0; j < embeddings.length; j++) {
        const chunk = batch[j];
        const embedding = embeddings[j];

        if (!embedding) {
          failed++;
          continue;
        }

        const stored = await storeEmbedding({
          userId: chunk.userId || userId,
          constructId,
          sourceFile: chunk.sourceFile,
          content: chunk.content,
          embedding,
        });

        if (stored) {
          embedded++;
        } else {
          failed++;
        }
      }

      const progress = Math.min(100, Math.round(((i + batch.length) / allChunks.length) * 100));
      process.stdout.write(`\r   ⏳ Progress: ${progress}% (${embedded} embedded, ${failed} failed)`);
    } catch (err) {
      console.warn(`\n   ❌ Batch ${i}-${i + batchSize} failed:`, err.message);
      failed += batch.length;
    }
  }

  console.log(`\n   ✅ Embedding complete: ${embedded} stored, ${failed} failed`);

  const totalCount = await getEmbeddingCount(userId, constructId);
  console.log(`   📊 Total embeddings for ${constructId}: ${totalCount}`);

  return { success: true, filesProcessed: files.length, chunksEmbedded: embedded, chunksFailed: failed, totalEmbeddings: totalCount };
}

const args = process.argv.slice(2);
const constructId = args[0];
const userId = args[1];

if (!constructId || !userId) {
  console.log(`
Usage: node server/scripts/embedTranscripts.js <construct_id> <user_id> [--dry-run] [--no-clear]

Examples:
  node server/scripts/embedTranscripts.js nova-001 devon@example.com
  node server/scripts/embedTranscripts.js nova-001 devon@example.com --dry-run
  node server/scripts/embedTranscripts.js sera-001 devon@example.com --no-clear
  `);
  process.exit(1);
}

const dryRun = args.includes('--dry-run');
const clearExisting = !args.includes('--no-clear');

embedTranscriptsForConstruct(constructId, userId, { clearExisting, dryRun })
  .then(result => {
    console.log('\n📋 Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });

export { embedTranscriptsForConstruct, chunkTranscript, discoverTranscriptFiles };
