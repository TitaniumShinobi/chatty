#!/usr/bin/env node
/**
 * Identity backfill from VVAULT projection API into Chatty DB.
 *
 * Defaults to dry-run. Use --apply to write changes.
 * Uses VVAULT projection endpoint first; optional Supabase fallback if enabled.
 *
 * Fields: conditioning, definition, physicalFeatures, voice
 * Backfills only when DB value is null/undefined (empty string is preserved).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const DO_APPLY = args.includes('--apply');
const CALLSIGN_FILTER = (() => {
  const idx = args.indexOf('--callsign');
  if (idx >= 0 && args[idx + 1]) return args[idx + 1].replace(/^gpt-/, '').trim();
  return null;
})();
const BASE_URL = process.env.VVAULT_BASE_URL || process.env.BASE_URL || null;
const VVAULT_TOKEN = process.env.VVAULT_SERVICE_TOKEN || process.env.VVAULT_TOKEN || null;
const USE_SUPABASE_FALLBACK = process.env.USE_SUPABASE_FALLBACK === 'true';

// Open DB directly (same path AIManager uses)
const dbPath = path.join(__dirname, '..', 'chatty.db');
const db = new Database(dbPath);

const fetchOpts = VVAULT_TOKEN
  ? { headers: { Authorization: `Bearer ${VVAULT_TOKEN}` }, credentials: 'include' }
  : {};

const FIELDS = ['conditioning', 'definition', 'physicalFeatures', 'voice'];

const needsBackfill = (val) => val === null || val === undefined;

const normalizeProjection = (proj) => {
  if (!proj || typeof proj !== 'object') return {};
  const out = {};
  out.conditioning = proj.conditioning ?? proj.personality ?? null;
  out.definition = proj.definition ?? proj.prompt ?? null;
  // physicalFeatures could be stored as object or text; accept either.
  const phys = proj.physicalFeatures ?? proj.physical_features ?? null;
  if (phys && typeof phys === 'object') {
    out.physicalFeatures = Object.entries(phys).map(([k, v]) => `${k}: ${v}`).join('\n');
  } else {
    out.physicalFeatures = phys;
  }
  const voice = proj.voice ?? null;
  if (voice && typeof voice === 'object') {
    out.voice = voice.text ?? null;
  } else {
    out.voice = voice;
  }
  return out;
};

async function fetchProjection(callsign) {
  if (!BASE_URL) throw new Error('VVAULT_BASE_URL not set');
  const url = `${BASE_URL.replace(/\/$/, '')}/api/vvault/constructs/${encodeURIComponent(callsign)}/identity-projection`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
    if (!res.ok) throw new Error(`projection fetch failed (${res.status})`);
    const data = await res.json();
    return normalizeProjection(data || {});
  } finally {
    clearTimeout(timeout);
  }
}

// optional Supabase fallback for environments without the projection API
async function fetchProjectionFallbackSupabase(callsign) {
  if (!USE_SUPABASE_FALLBACK) throw new Error('Supabase fallback disabled');
  const { getSupabaseClient } = await import('../server/lib/supabaseClient.js');
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not available');
  const withTimeout = async (p, ms = 5000) => {
    const to = new Promise((_, rej) => setTimeout(() => rej(new Error('supabase timeout')), ms));
    return Promise.race([p, to]);
  };
  const grab = async (pattern) => {
    const { data, error } = await withTimeout(
      supabase
        .from('vault_files')
        .select('content')
        .eq('construct_id', callsign)
        .like('filename', pattern)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    if (error) throw new Error(error.message);
    if (!data) return null;
    return data.content;
  };
  const conditioning = await grab('%conditioning.txt');
  const defTxt = await grab('%definition.txt');
  const defJson = await grab('%definition.json');
  const definition = defTxt ?? defJson ?? null;
  let physicalFeatures = await grab('%physical_features.json');
  if (physicalFeatures) {
    try {
      const parsed = JSON.parse(physicalFeatures);
      physicalFeatures = Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join('\n');
    } catch {
      // keep as-is
    }
  }
  let voice = await grab('%voice.json');
  if (voice) {
    try {
      const parsed = JSON.parse(voice);
      voice = parsed?.text ?? voice;
    } catch {
      // keep as-is
    }
  }
  return { conditioning, definition, physicalFeatures, voice };
}

function getRows(table) {
  try {
    return db
      .prepare(`SELECT id, construct_callsign, conditioning, physical_features, definition, voice FROM ${table}`)
      .all();
  } catch (err) {
    return [];
  }
}

async function main() {
  const aisRows = getRows('ais');
  const gptRows = getRows('gpts');

  const byCallsign = {};
  for (const row of [...aisRows, ...gptRows]) {
    if (!row.construct_callsign) continue;
    if (CALLSIGN_FILTER && row.construct_callsign !== CALLSIGN_FILTER) continue;
    if (!byCallsign[row.construct_callsign]) byCallsign[row.construct_callsign] = [];
    byCallsign[row.construct_callsign].push({ table: aisRows.includes(row) ? 'ais' : 'gpts', ...row });
  }

  const actions = [];

  for (const [callsign, rows] of Object.entries(byCallsign)) {
    let projection;
    try {
      projection = await fetchProjection(callsign);
    } catch (err) {
      try {
        projection = await fetchProjectionFallbackSupabase(callsign);
      } catch (fallbackErr) {
        console.warn(`⚠️ skip ${callsign}: ${err.message}; fallback: ${fallbackErr.message}`);
        continue;
      }
    }

    for (const row of rows) {
      const updates = {};
      if (needsBackfill(row.conditioning) && projection.conditioning != null) updates.conditioning = projection.conditioning;
      if (needsBackfill(row.definition) && projection.definition != null) updates.definition = projection.definition;
      if (needsBackfill(row.physical_features) && projection.physicalFeatures != null) updates.physicalFeatures = projection.physicalFeatures;
      if (needsBackfill(row.voice) && projection.voice != null) updates.voice = projection.voice;
      if (Object.keys(updates).length > 0) {
        actions.push({ callsign, id: row.id, table: row.table, updates });
      }
    }
  }

  if (!DO_APPLY) {
    console.log('Dry run (use --apply to write changes)');
    actions.forEach(a => {
      console.log(`${a.id} (${a.callsign}) [${a.table}] -> ${Object.keys(a.updates).join(', ')}`);
    });
    console.log(`Total pending updates: ${actions.length}`);
    return;
  }

  // Use AIManager updateAI to respect table selection/logic
  const { AIManager } = await import('../server/lib/aiManager.js');
  const manager = AIManager.getInstance();
  let ok = 0;
  for (const action of actions) {
    try {
      await manager.updateAI(action.id, action.updates);
      ok++;
      console.log(`✅ backfilled ${action.id} (${action.callsign}): ${Object.keys(action.updates).join(', ')}`);
    } catch (err) {
      console.error(`❌ failed to backfill ${action.id}: ${err.message}`);
    }
  }
  console.log(`Backfill applied: ${ok}/${actions.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
