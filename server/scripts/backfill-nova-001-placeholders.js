import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const TARGET_CALLSIGN = 'nova-001';
const MODEL_FIELDS = ['model_id', 'conversation_model', 'creative_model', 'coding_model'];
const PLACEHOLDER_MODELS = new Set(['', 'openrouter/auto', 'openrouter:auto']);

function isPlaceholderModel(value) {
  if (value === null || value === undefined) return true;
  return PLACEHOLDER_MODELS.has(String(value).trim().toLowerCase());
}

function isEmptyText(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function resolveDbPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(path.join(__dirname, '..', '..', 'chatty.db'));
}

function main() {
  const dbPath = resolveDbPath();
  const db = new Database(dbPath);
  console.log(`🔧 [Backfill] DB: ${dbPath}`);

  const gptRow = db
    .prepare(`
      SELECT * FROM gpts
      WHERE construct_callsign = ? OR id = ?
      ORDER BY CASE WHEN construct_callsign = ? THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1
    `)
    .get(TARGET_CALLSIGN, TARGET_CALLSIGN, TARGET_CALLSIGN);

  if (!gptRow) {
    console.log(`ℹ️ [Backfill] No gpts source row found for ${TARGET_CALLSIGN}. Nothing to do.`);
    return;
  }

  const aisRows = db
    .prepare('SELECT * FROM ais WHERE construct_callsign = ? OR id = ?')
    .all(TARGET_CALLSIGN, TARGET_CALLSIGN);

  if (!aisRows.length) {
    console.log(`ℹ️ [Backfill] No ais rows found for ${TARGET_CALLSIGN}. Nothing to do.`);
    return;
  }

  let touched = 0;
  const updateOne = db.transaction((row) => {
    const updates = {};

    for (const field of MODEL_FIELDS) {
      if (isPlaceholderModel(row[field]) && !isPlaceholderModel(gptRow[field])) {
        updates[field] = gptRow[field];
      }
    }

    if (isEmptyText(row.instructions) && !isEmptyText(gptRow.instructions)) {
      updates.instructions = gptRow.instructions;
    }

    const keys = Object.keys(updates);
    if (!keys.length) return false;

    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => updates[k]);
    db.prepare(`UPDATE ais SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, row.id);

    console.log(`✅ [Backfill] Updated ais row ${row.id}: ${keys.join(', ')}`);
    return true;
  });

  for (const row of aisRows) {
    if (updateOne(row)) touched += 1;
  }

  if (!touched) {
    console.log('ℹ️ [Backfill] No updates required (already hydrated).');
  } else {
    console.log(`✅ [Backfill] Complete. Rows updated: ${touched}`);
  }
}

try {
  main();
} catch (error) {
  console.error('❌ [Backfill] Failed:', error.message);
  process.exitCode = 1;
}
