#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { execSync, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const WORKSPACE = process.env.WORKSPACE_ROOT || '/home/runner/workspace';

const DEFAULT_PATHS = [
  'chatgpt/',
  'github_copilot/',
  'character.ai/',
  'codex_transcripts/',
  'instances/',
];

const EXCLUDE_PATTERNS = [
  'node_modules',
  '.venv',
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.bmp', '*.ico',
  '*.woff', '*.woff2', '*.ttf', '*.eot',
  '*.zip', '*.tar', '*.gz',
  '*.sqlite', '*.db',
  '*.mp3', '*.mp4', '*.wav',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function rgAvailable() {
  try {
    const result = spawnSync('rg', ['--version'], { encoding: 'utf-8', timeout: 3000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

function rankMatch(line, query, queryLower, tokens) {
  const lineLower = line.toLowerCase();
  if (lineLower.includes(queryLower)) return { tier: 1, label: 'exact_phrase' };
  if (tokens.length > 1) {
    const matched = tokens.filter(t => lineLower.includes(t));
    if (matched.length === tokens.length) return { tier: 2, label: 'exact_token_overlap' };
    if (matched.length >= Math.ceil(tokens.length * 0.6)) return { tier: 3, label: 'fuzzy_partial' };
  }
  return null;
}

function searchLines(lines, query, options = {}) {
  const { maxHits = 50, around = 1, caseSensitive = false } = options;
  const queryNorm = caseSensitive ? query : query.toLowerCase();
  const tokens = queryNorm.split(/\s+/).filter(w => w.length > 1);
  const results = [];

  for (let i = 0; i < lines.length && results.length < maxHits; i++) {
    const line = lines[i];
    const rank = rankMatch(line, query, queryNorm, tokens);
    if (!rank) continue;

    const contextBefore = [];
    const contextAfter = [];
    for (let j = Math.max(0, i - around); j < i; j++) {
      contextBefore.push({ line_number: j + 1, text: lines[j] });
    }
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + around); j++) {
      contextAfter.push({ line_number: j + 1, text: lines[j] });
    }

    results.push({
      line_number: i + 1,
      matched_line: line,
      rank: rank.tier,
      rank_label: rank.label,
      context_before: contextBefore,
      context_after: contextAfter,
    });
  }

  return results;
}

function searchLocalWithRg(query, searchPaths, options = {}) {
  const { maxHits = 50, around = 1, glob: fileGlob } = options;
  const validPaths = searchPaths
    .map(p => path.resolve(WORKSPACE, p))
    .filter(p => fs.existsSync(p));

  if (validPaths.length === 0) return [];

  const args = [
    '--json',
    '--line-number',
    '--no-heading',
    '--max-count', String(maxHits),
    '-C', String(around),
    '--ignore-case',
    '--fixed-strings',
  ];

  for (const ex of EXCLUDE_PATTERNS) {
    args.push('--glob', `!${ex}`);
  }

  if (fileGlob) {
    args.push('--glob', fileGlob);
  }

  args.push('--', query);
  args.push(...validPaths);

  try {
    const result = spawnSync('rg', args, {
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (result.status !== 0 && result.status !== 1) return [];

    const output = result.stdout || '';
    const jsonLines = output.split('\n').filter(l => l.trim());
    const receipts = [];
    let currentMatch = null;
    const contextBefore = [];

    for (const jsonLine of jsonLines) {
      try {
        const entry = JSON.parse(jsonLine);
        if (entry.type === 'match') {
          const filePath = path.relative(WORKSPACE, entry.data.path.text);
          currentMatch = {
            path: filePath,
            line_number: entry.data.line_number,
            matched_line: entry.data.lines.text.replace(/\n$/, ''),
            rank: 1,
            rank_label: 'exact_phrase',
            context_before: [...contextBefore],
            context_after: [],
          };
          contextBefore.length = 0;
          receipts.push(currentMatch);
        } else if (entry.type === 'context') {
          const ctx = {
            line_number: entry.data.line_number,
            text: entry.data.lines.text.replace(/\n$/, ''),
          };
          if (currentMatch && entry.data.line_number > currentMatch.line_number) {
            currentMatch.context_after.push(ctx);
          } else {
            contextBefore.push(ctx);
            if (contextBefore.length > around) contextBefore.shift();
          }
        } else if (entry.type === 'end' || entry.type === 'begin') {
          contextBefore.length = 0;
          currentMatch = null;
        }
      } catch {
        continue;
      }
    }

    return receipts.slice(0, maxHits);
  } catch (e) {
    console.error(`[Needling] rg error: ${e.message}`);
    return [];
  }
}

async function fetchSupabaseFiles(supabase, pathPattern, fileGlob, batchSize = 50) {
  const allFiles = [];
  let offset = 0;
  const maxBatches = 10;

  for (let batch = 0; batch < maxBatches; batch++) {
    let dbQuery = supabase
      .from('vault_files')
      .select('filename, content')
      .not('content', 'is', null)
      .like('filename', pathPattern);

    if (fileGlob) {
      const ext = fileGlob.replace(/^\*/, '');
      if (ext) dbQuery = dbQuery.like('filename', `%${ext}`);
    }

    dbQuery = dbQuery
      .range(offset, offset + batchSize - 1)
      .order('created_at', { ascending: false });

    const { data, error } = await dbQuery;
    if (error) {
      console.error(`[Needling] Supabase batch error: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    for (const file of data) {
      if (file.content && file.content.length > 30) {
        allFiles.push(file);
      }
    }

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return allFiles;
}

async function searchSupabase(query, options = {}) {
  const { maxHits = 50, around = 1, paths, glob: fileGlob } = options;
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const searchPaths = paths && paths.length > 0 ? paths : DEFAULT_PATHS;

    const filePromises = searchPaths.map(p => {
      const pattern = p.endsWith('/') ? `${p}%` : `${p}%`;
      return fetchSupabaseFiles(supabase, pattern, fileGlob);
    });

    const fileArrays = await Promise.all(filePromises);
    const allFiles = fileArrays.flat();

    const seen = new Set();
    const dedupedFiles = allFiles.filter(f => {
      const key = `${f.filename}:${f.content.length}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (dedupedFiles.length === 0) return [];

    const allReceipts = [];
    for (const file of dedupedFiles) {
      if (allReceipts.length >= maxHits) break;
      const lines = file.content.split('\n');
      const fileHits = searchLines(lines, query, { maxHits: maxHits - allReceipts.length, around });
      for (const hit of fileHits) {
        allReceipts.push({
          path: file.filename,
          ...hit,
        });
      }
    }

    allReceipts.sort((a, b) => a.rank - b.rank);
    return allReceipts.slice(0, maxHits);
  } catch (e) {
    console.error(`[Needling] Supabase search error: ${e.message}`);
    return [];
  }
}

async function searchLocalFallback(query, searchPaths, options = {}) {
  const { maxHits = 50, around = 1, glob: fileGlob } = options;
  const validPaths = searchPaths
    .map(p => path.resolve(WORKSPACE, p))
    .filter(p => fs.existsSync(p));

  if (validPaths.length === 0) return [];

  const allReceipts = [];

  function walkDir(dir) {
    if (allReceipts.length >= maxHits) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (allReceipts.length >= maxHits) return;
      const fullPath = path.join(dir, entry.name);

      if (EXCLUDE_PATTERNS.some(p => entry.name === p || entry.name.endsWith(p.replace('*', '')))) continue;

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        if (fileGlob) {
          const ext = fileGlob.replace(/^\*/, '');
          if (ext && !entry.name.endsWith(ext)) continue;
        }
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          const hits = searchLines(lines, query, { maxHits: maxHits - allReceipts.length, around });
          const relPath = path.relative(WORKSPACE, fullPath);
          for (const hit of hits) {
            allReceipts.push({ path: relPath, ...hit });
          }
        } catch { continue; }
      }
    }
  }

  for (const p of validPaths) {
    walkDir(p);
  }

  allReceipts.sort((a, b) => a.rank - b.rank);
  return allReceipts.slice(0, maxHits);
}

export async function needling(query, options = {}) {
  const {
    paths,
    glob: fileGlob,
    max = 50,
    around = 1,
    json: jsonMode = true,
  } = options;

  if (!query || query.trim().length === 0) {
    return {
      query: '',
      total_hits: 0,
      receipts: [],
      message: 'no receipts found',
      engine: 'none',
    };
  }

  const searchPaths = paths && paths.length > 0 ? paths : DEFAULT_PATHS;
  const searchOpts = { maxHits: max, around, glob: fileGlob, paths: searchPaths };

  let receipts = [];
  let engine = 'unknown';

  const supabaseReceipts = await searchSupabase(query, searchOpts);
  if (supabaseReceipts.length > 0) {
    receipts.push(...supabaseReceipts);
    engine = 'supabase';
  }

  const localPaths = searchPaths
    .map(p => path.resolve(WORKSPACE, p))
    .filter(p => fs.existsSync(p));

  if (localPaths.length > 0) {
    let localReceipts;
    if (rgAvailable()) {
      localReceipts = searchLocalWithRg(query, searchPaths, searchOpts);
      engine = receipts.length > 0 ? `supabase+rg` : 'rg';
    } else {
      localReceipts = await searchLocalFallback(query, searchPaths, searchOpts);
      engine = receipts.length > 0 ? `supabase+js_fallback` : 'js_fallback';
    }
    if (localReceipts.length > 0) {
      receipts.push(...localReceipts);
    }
  }

  const seen = new Set();
  receipts = receipts.filter(r => {
    const key = `${r.path}:${r.line_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  receipts.sort((a, b) => a.rank - b.rank);
  receipts = receipts.slice(0, max);

  return {
    query,
    total_hits: receipts.length,
    receipts,
    message: receipts.length === 0 ? 'no receipts found' : undefined,
    engine,
  };
}

export function formatForPromptInjection(result, topN = 8) {
  if (!result.receipts || result.receipts.length === 0) {
    return '## Transcript Evidence\nno receipts found';
  }

  const top = result.receipts.slice(0, topN);
  const lines = ['## Transcript Evidence (Needling)'];
  for (const r of top) {
    lines.push(`- **${r.path}:${r.line_number}** [${r.rank_label}]`);
    lines.push(`  > ${r.matched_line.trim()}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && (process.argv[1].endsWith('needle.js') || process.argv[1].endsWith('needle'))) {
  const args = process.argv.slice(2);
  const query = args.find(a => !a.startsWith('--'));
  const getFlag = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  const pathsRaw = getFlag('paths');
  const searchPaths = pathsRaw ? pathsRaw.split(',') : undefined;
  const fileGlob = getFlag('glob');
  const maxHits = parseInt(getFlag('max') || '50', 10);
  const contextAround = parseInt(getFlag('around') || '1', 10);
  const jsonOutput = hasFlag('json') || !hasFlag('text');

  if (!query) {
    console.error('Usage: needle "<query>" [--paths <p1,p2>] [--glob <pattern>] [--max 50] [--around 1] [--json]');
    process.exit(1);
  }

  needling(query, {
    paths: searchPaths,
    glob: fileGlob,
    max: maxHits,
    around: contextAround,
    json: jsonOutput,
  }).then(result => {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.total_hits === 0) {
        console.log('no receipts found');
      } else {
        for (const r of result.receipts) {
          console.log(`${r.path}:${r.line_number}: ${r.matched_line.trim()} [${r.rank_label}]`);
        }
      }
    }
  }).catch(e => {
    console.error(`[Needling] Fatal: ${e.message}`);
    process.exit(1);
  });
}
