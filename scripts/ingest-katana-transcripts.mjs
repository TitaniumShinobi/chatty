#!/usr/bin/env node

/**
 * Katana transcript ingestion into VVAULT.
 *
 * Reads plaintext transcripts from a directory, chunks them, and (optionally) posts
 * them to the VVAULT identity store for a given construct callsign. Defaults to
 * dry-run; pass --commit to actually write.
 *
 * Usage:
 *   node scripts/ingest-katana-transcripts.mjs --dir "/path/to/transcripts" --construct "gpt-katana-001" --base "http://localhost:5173" --commit
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const options = {
  dir: null,
  construct: 'gpt-katana-001',
  base: process.env.VVAULT_BASE_URL || 'http://localhost:5173',
  commit: false,
  maxChunkSize: 900,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dir') options.dir = args[++i];
  else if (arg === '--construct') options.construct = args[++i];
  else if (arg === '--base') options.base = args[++i];
  else if (arg === '--commit') options.commit = true;
  else if (arg === '--max-chars') options.maxChunkSize = Number(args[++i]);
}

if (!options.dir) {
  console.error('Error: --dir is required.');
  process.exit(1);
}

if (!fs.existsSync(options.dir) || !fs.statSync(options.dir).isDirectory()) {
  console.error(`Error: ${options.dir} is not a readable directory.`);
  process.exit(1);
}

const isTextFile = (file) => ['.txt', '.md'].includes(path.extname(file).toLowerCase());

const readTextFiles = (dir) =>
  fs
    .readdirSync(dir)
    .filter(isTextFile)
    .map((name) => ({
      name,
      fullPath: path.join(dir, name),
      content: fs.readFileSync(path.join(dir, name), 'utf-8'),
      mtime: fs.statSync(path.join(dir, name)).mtime.toISOString(),
    }));

const chunkText = (text, maxLen) => {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const rawChunks = clean.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);

  const merged = [];
  for (const chunk of rawChunks) {
    if (!merged.length || merged[merged.length - 1].length + chunk.length + 1 > maxLen) {
      merged.push(chunk);
    } else {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${chunk}`;
    }
  }
  return merged;
};

const postMemory = async (base, payload) => {
  const res = await fetch(`${base}/api/vvault/identity/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`VVAULT store failed: ${res.status} ${errText}`);
  }
};

const run = async () => {
  const files = readTextFiles(options.dir);
  console.log(`Found ${files.length} transcript files under ${options.dir}`);

  let totalChunks = 0;
  for (const file of files) {
    const chunks = chunkText(file.content, options.maxChunkSize);
    totalChunks += chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      const context = chunks[i];
      const payload = {
        constructCallsign: options.construct,
        context,
        response: '',
        metadata: {
          source: 'transcript-ingest',
          file: file.name,
          chunkIndex: i,
          timestamp: file.mtime,
          memoryType: 'long-term',
        },
      };

      if (options.commit) {
        await postMemory(options.base, payload);
      }
    }
  }

  console.log(
    `${options.commit ? 'Ingested' : 'Dry-run for'} ${totalChunks} chunks from ${files.length} files into ${options.construct}`
  );
};

run().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
