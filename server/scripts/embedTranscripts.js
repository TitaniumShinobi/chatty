import { getSupabaseClient } from '../lib/supabaseClient.js';
import { embedBatch, storeEmbedding, storeEmbeddingBatch, getEmbeddingCount, embedText } from '../services/embeddingService.js';

const TARGET_CHUNK_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN;
const DEFAULT_BATCH_SIZE = 25;

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

async function discoverTranscriptFilenames(supabase, constructId) {
  const { data, error } = await supabase
    .from('vault_files')
    .select('filename, user_id')
    .eq('construct_id', constructId)
    .not('content', 'is', null);

  if (error || !data) return [];

  return data.filter(f => {
    const fnLower = f.filename.toLowerCase();
    return TRANSCRIPT_KEYWORDS.some(kw => fnLower.includes(kw));
  });
}

async function loadFileContent(supabase, constructId, filename) {
  const { data, error } = await supabase
    .from('vault_files')
    .select('filename, content, construct_id, user_id')
    .eq('construct_id', constructId)
    .eq('filename', filename)
    .single();

  if (error || !data?.content || data.content.length < 100) return null;
  return data;
}

async function getProcessedFiles(supabase, userId, constructId) {
  const allFiles = new Set();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('memory_embeddings')
      .select('source_file')
      .eq('user_id', userId)
      .eq('construct_id', constructId)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.warn(`  ⚠️ Could not fetch processed files (offset ${offset}):`, error.message);
      break;
    }

    if (!data || data.length === 0) break;

    for (const d of data) {
      allFiles.add(d.source_file);
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return allFiles;
}

async function embedTranscriptsForConstruct(constructId, userId, options = {}) {
  const { clearExisting = false, dryRun = false, batchMode = false, batchSize = DEFAULT_BATCH_SIZE } = options;
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('❌ No Supabase client');
    return { success: false, error: 'No Supabase client' };
  }

  console.log(`\n🧠 Embedding transcripts for construct: ${constructId}`);
  console.log(`   User: ${userId}`);
  if (batchMode) console.log(`   📦 Batch mode: processing up to ${batchSize} files per run`);

  const fileList = await discoverTranscriptFilenames(supabase, constructId);
  console.log(`   📁 Discovered ${fileList.length} transcript files`);

  if (fileList.length === 0) {
    console.log('   ⚠️ No transcript files found — nothing to embed');
    return { success: true, filesProcessed: 0, chunksEmbedded: 0 };
  }

  if (clearExisting) {
    console.log('   🗑️ Clearing existing embeddings...');
    await clearExistingEmbeddings(supabase, userId, constructId);
  }

  const processed = clearExisting ? new Set() : await getProcessedFiles(supabase, userId, constructId);
  const unprocessed = fileList.filter(f => !processed.has(f.filename));
  console.log(`   ✅ Already processed: ${processed.size} files`);
  console.log(`   📋 Remaining: ${unprocessed.length} files`);

  if (unprocessed.length === 0) {
    console.log('   🎉 All files already processed!');
    const totalCount = await getEmbeddingCount(userId, constructId);
    console.log(`   📊 Total embeddings for ${constructId}: ${totalCount}`);
    return { success: true, filesProcessed: 0, chunksEmbedded: 0, totalEmbeddings: totalCount, allDone: true };
  }

  const filesToProcess = batchMode ? unprocessed.slice(0, batchSize) : unprocessed;
  console.log(`   🎯 Processing ${filesToProcess.length} files this run`);

  if (dryRun) {
    let totalChunks = 0;
    for (const fl of filesToProcess) {
      const file = await loadFileContent(supabase, constructId, fl.filename);
      if (!file) continue;
      const processedContent = parseTranscriptPairsToText(file.content);
      totalChunks += chunkTranscript(processedContent, file.filename).length;
    }
    console.log(`   📦 Total chunks to embed: ${totalChunks}`);
    console.log('   🏁 Dry run — stopping before embedding');
    return { success: true, filesToProcess: filesToProcess.length, chunksToEmbed: totalChunks, remaining: unprocessed.length - filesToProcess.length, dryRun: true };
  }

  let embedded = 0;
  let failed = 0;
  let skipped = 0;
  let filesProcessed = 0;
  const startTime = Date.now();

  for (const fl of filesToProcess) {
    const file = await loadFileContent(supabase, constructId, fl.filename);
    if (!file) { skipped++; continue; }

    if (file.content.length > 200000) {
      console.log(`   ⏭️ ${fl.filename.split('/').pop()} too large (${(file.content.length/1000).toFixed(0)}KB) — skipping`);
      skipped++;
      continue;
    }

    const processedContent = parseTranscriptPairsToText(file.content);
    const chunks = chunkTranscript(processedContent, file.filename);
    if (chunks.length === 0) { skipped++; continue; }

    const fileUserId = file.user_id || userId;
    let fileEmbedded = 0;
    let fileFailed = 0;

    const embedBatchSize = 25;
    for (let i = 0; i < chunks.length; i += embedBatchSize) {
      const batch = chunks.slice(i, i + embedBatchSize);
      const texts = batch.map(c => c.content);

      try {
        const embeddings = await embedBatch(texts);

        const toStore = [];
        for (let j = 0; j < embeddings.length; j++) {
          if (!embeddings[j]) { fileFailed++; continue; }
          toStore.push({
            userId: fileUserId,
            constructId,
            sourceFile: batch[j].sourceFile,
            content: batch[j].content,
            embedding: embeddings[j],
          });
        }

        if (toStore.length > 0) {
          const stored = await storeEmbeddingBatch(toStore);
          if (stored > 0) {
            fileEmbedded += stored;
          } else {
            fileFailed += toStore.length;
          }
        }
      } catch (err) {
        console.warn(`\n   ❌ Batch failed for ${file.filename}:`, err.message);
        fileFailed += batch.length;

        if (err.message?.includes('429') || err.message?.includes('rate')) {
          if (err.message?.includes('quota')) {
            console.log('   🛑 API quota exceeded — stopping. Resume later.');
            return { success: false, error: 'quota_exceeded', filesProcessed, chunksEmbedded: embedded, chunksFailed: failed, filesSkipped: skipped };
          }
          console.log('   ⏸️ Rate limited — waiting 30s...');
          await new Promise(r => setTimeout(r, 30000));
          i -= embedBatchSize;
        }
      }
    }

    embedded += fileEmbedded;
    failed += fileFailed;
    filesProcessed++;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (embedded / (elapsed || 1)).toFixed(1);
    const remaining = filesToProcess.length - filesProcessed - skipped;
    console.log(`   📄 ${filesProcessed}/${filesToProcess.length} | ${file.filename.split('/').pop()} → ${chunks.length} chunks (${fileEmbedded} ok, ${fileFailed} fail) | total: ${embedded} | ${elapsed}s | ${rate}/s | ${remaining} remaining`);
  }

  console.log(`\n   ✅ Batch complete: ${embedded} stored, ${failed} failed, ${skipped} skipped`);

  const totalCount = await getEmbeddingCount(userId, constructId);
  const totalProcessed = processed.size + filesProcessed + skipped;
  const totalRemaining = fileList.length - totalProcessed;
  console.log(`   📊 Total embeddings for ${constructId}: ${totalCount}`);
  console.log(`   📊 Progress: ${totalProcessed}/${fileList.length} files (${totalRemaining} remaining)`);

  if (totalRemaining > 0) {
    console.log(`\n   💡 Run again to process next batch of ${Math.min(batchSize, totalRemaining)} files`);
  } else {
    console.log(`\n   🎉 All files processed!`);
  }

  return { success: true, filesProcessed, chunksEmbedded: embedded, chunksFailed: failed, filesSkipped: skipped, totalEmbeddings: totalCount, totalFilesProcessed: totalProcessed, totalFiles: fileList.length, remaining: totalRemaining };
}

const args = process.argv.slice(2);
const constructId = args[0];
const userId = args[1];

if (!constructId || !userId) {
  console.log(`
Usage: node server/scripts/embedTranscripts.js <construct_id> <user_id> [options]

Options:
  --batch          Process files in batches (default: 25 per run)
  --batch-size=N   Set batch size (e.g., --batch-size=10)
  --dry-run        Show what would be embedded without doing it
  --clear          Clear all existing embeddings first (destructive)

Examples:
  node server/scripts/embedTranscripts.js nova-001 7e34f6b8-... --batch
  node server/scripts/embedTranscripts.js nova-001 7e34f6b8-... --batch --batch-size=10
  node server/scripts/embedTranscripts.js nova-001 7e34f6b8-... --dry-run
  `);
  process.exit(1);
}

const dryRun = args.includes('--dry-run');
const batchMode = args.includes('--batch') || args.some(a => a.startsWith('--batch-size'));
const clearExisting = args.includes('--clear');
let batchSize = DEFAULT_BATCH_SIZE;
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
if (batchSizeArg) {
  batchSize = parseInt(batchSizeArg.split('=')[1], 10) || DEFAULT_BATCH_SIZE;
}

embedTranscriptsForConstruct(constructId, userId, { clearExisting, dryRun, batchMode, batchSize })
  .then(result => {
    console.log('\n📋 Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });

export { embedTranscriptsForConstruct, chunkTranscript, discoverTranscriptFiles };
