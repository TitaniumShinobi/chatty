#!/usr/bin/env node
/**
 * Sync Chatty DB → VVAULT (Supabase vault_files)
 *
 * VVAULT is canonical. This script pushes all construct identity for a user
 * from Chatty's SQLite DB into Supabase vault_files so VVAULT has the source of truth.
 *
 * What is already automated:
 * - PUT /api/ais/:id/identity-fields: when you save Conditioning / Forge fields in Configure,
 *   those are projected to VVAULT (Supabase) immediately.
 * - POST /api/ais (create): scaffoldConstruct writes prompt.json etc. to VVAULT/Supabase.
 *
 * What is NOT automated:
 * - PUT /api/ais/:id (main GPT save): name, description, instructions are written to the
 *   DB and to VVAULT filesystem only; they are not written to Supabase vault_files, so
 *   readers using mergeFromVVAULT can see stale data. This script (and a future API
 *   POST /api/ais/sync-to-vvault) fix that by pushing full identity to VVAULT.
 *
 * Usage:
 *   node server/scripts/syncChattyDBToVVAULT.js <userId> [--email user@example.com] [--dry-run]
 *
 * Env:
 *   CHATTY_SYNC_USER_EMAIL  optional; used to resolve Supabase user_id for vault_files
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const userId = args.find(a => !a.startsWith('--')) || process.env.CHATTY_SYNC_USER_ID;
const email = (() => {
  const i = args.indexOf('--email');
  return i >= 0 && args[i + 1] ? args[i + 1] : process.env.CHATTY_SYNC_USER_EMAIL;
})();
const dryRun = args.includes('--dry-run');

function isUuid(val) {
  if (val == null || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val.trim());
}

function normalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return String(val);
  return val.replace(/\r\n/g, '\n').trimEnd();
}

function physicalFeaturesTextToJson(text) {
  if (text === null || text === undefined) return null;
  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);
  const obj = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      obj[line.substring(0, colonIdx).trim()] = line.substring(colonIdx + 1).trim();
    }
  }
  return Object.keys(obj).length > 0 ? obj : {};
}

async function run() {
  if (!userId) {
    console.error('Usage: node server/scripts/syncChattyDBToVVAULT.js <userId> [--email user@example.com] [--dry-run]');
    console.error('   or set CHATTY_SYNC_USER_ID and optionally CHATTY_SYNC_USER_EMAIL');
    process.exit(1);
  }

  const { AIManager } = await import('../lib/aiManager.js');
  const { getSupabaseClient } = await import('../lib/supabaseClient.js');

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase not configured; cannot sync to VVAULT.');
    process.exit(1);
  }

  let supabaseUserId = null;
  if (email) {
    const { data: byEmail } = await supabase.from('users').select('id').eq('email', email).limit(1).maybeSingle();
    if (byEmail?.id) supabaseUserId = byEmail.id;
  }
  if (!supabaseUserId && userId) {
    const namePart = String(userId).split('_')[0];
    const { data: byName } = await supabase.from('users').select('id').ilike('name', `%${namePart}%`).limit(1).maybeSingle();
    if (byName?.id) supabaseUserId = byName.id;
  }
  if (!supabaseUserId) supabaseUserId = userId;
  const useUserFilter = isUuid(supabaseUserId);
  if (!useUserFilter && supabaseUserId) {
    console.warn('Supabase user_id is not a UUID; writing vault_files by construct_id only.');
  }

  const aiManager = AIManager.getInstance();
  const ais = await aiManager.getAllAIs(userId, userId, email || null);
  const withCallsign = ais.filter(ai => ai.constructCallsign);

  if (withCallsign.length === 0) {
    console.log('No AIs with construct callsign found for user.');
    return { synced: 0, errors: [] };
  }

  console.log(`Found ${withCallsign.length} AIs to sync to VVAULT${dryRun ? ' (dry-run)' : ''}.`);

  const upsertVaultFile = async (filename, fileType, content) => {
    const constructCallsign = filename.match(/instances\/([^/]+)\//)?.[1];
    if (!constructCallsign) throw new Error(`Invalid filename: ${filename}`);
    let selectQuery = supabase.from('vault_files').select('id').eq('filename', filename).eq('construct_id', constructCallsign);
    if (useUserFilter) selectQuery = selectQuery.eq('user_id', supabaseUserId);
    const { data: existing, error: selectError } = await selectQuery.maybeSingle();
    if (selectError) throw new Error(selectError.message);
    if (existing) {
      const { error: updateError } = await supabase.from('vault_files').update({ content, file_type: fileType }).eq('id', existing.id);
      if (updateError) throw new Error(updateError.message);
    } else {
      const insertPayload = { construct_id: constructCallsign, filename, file_type: fileType, content };
      if (useUserFilter) insertPayload.user_id = supabaseUserId;
      const { error: insertError } = await supabase.from('vault_files').insert(insertPayload);
      if (insertError) throw new Error(insertError.message);
    }
  };

  const synced = [];
  const errors = [];

  for (const ai of withCallsign) {
    const constructCallsign = ai.constructCallsign;
    const name = ai.name ?? constructCallsign?.split('-')[0] ?? 'Unknown';
    const description = ai.description ?? '';
    const instructions = ai.instructions ?? '';
    const conditioning = ai.conditioning ?? '';
    const physicalFeatures = ai.physicalFeatures ?? ai.physical_features ?? '';
    const definition = ai.definition ?? '';
    const voice = ai.voice ?? '';
    const gender = ai.gender ?? '';

    if (dryRun) {
      console.log(`  [dry-run] Would sync ${constructCallsign}: ${name}`);
      synced.push({ constructCallsign, name });
      continue;
    }

    try {
      const base = `instances/${constructCallsign}/identity`;

      const promptJson = JSON.stringify(
        { name, description, instructions, conversationStarters: ai.conversationStarters || ai.conversation_starters || [], source: 'chatty-sync' },
        null,
        2
      );
      await upsertVaultFile(`${base}/prompt.json`, 'identity', promptJson);

      if (conditioning !== undefined && conditioning !== null) {
        await upsertVaultFile(`${base}/conditioning.txt`, 'identity', String(conditioning));
      }
      const physObj = physicalFeaturesTextToJson(physicalFeatures);
      await upsertVaultFile(`${base}/physical_features.json`, 'identity', JSON.stringify(physObj || {}, null, 2));

      if (definition !== undefined && definition !== null) {
        await upsertVaultFile(`${base}/definition.txt`, 'identity', String(definition));
      }
      const normalizedVoice = normalizeValue(voice) ?? '';
      await upsertVaultFile(`${base}/voice.md`, 'identity', normalizedVoice);
      await upsertVaultFile(`${base}/voice.json`, 'identity', JSON.stringify({ text: normalizedVoice }, null, 2));

      if (gender !== undefined && gender !== null) {
        await upsertVaultFile(
          `${base}/gender.json`,
          'identity',
          JSON.stringify({ gender: String(gender), training: 'Use gender to enforce identity boundaries and protection; never misgender constructs.' }, null, 2)
        );
      }

      console.log(`  Synced ${constructCallsign}: ${name}`);
      synced.push({ constructCallsign, name });
    } catch (err) {
      console.error(`  Failed ${constructCallsign}:`, err.message);
      errors.push({ constructCallsign, error: err.message });
    }
  }

  return { synced, errors };
}

run()
  .then(({ synced, errors }) => {
    console.log('');
    console.log(`Done. Synced: ${synced.length}, Errors: ${errors.length}`);
    if (errors.length) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
