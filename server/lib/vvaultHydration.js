import { extractVoiceInstructions } from './voiceContract.js';
/**
 * VVAULT-first hydration merge helper.
 *
 * Database rows are cache/projection. Empty DB values must not hide identity
 * fields that are already present in VVAULT/Supabase vault_files.
 */

import { fetchIdentityFromVVAULTApi, loadConditioningTxt } from './identityLoader.js';
import { getSupabaseClient } from './supabaseClient.js';

const EMPTY = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '');

function safeJson(value) {
  if (!value || typeof value !== 'string') return value || null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function latest(rows, predicate) {
  return (rows || [])
    .filter(predicate)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

async function loadVaultIdentityRows(supabase, constructCallsign) {
  if (!supabase || !constructCallsign) return [];
  const patterns = [
    '%prompt.json',
    '%prompt.txt',
    '%conditioning.txt',
    '%physical_features.txt',
    '%physical_features.json',
    '%definition.txt',
    '%definition.json',
    '%voice.md',
    '%voice.json',
    '%avatar%',
  ];
  const orClause = patterns.map((pattern) => `filename.ilike.${pattern}`).join(',');
  const { data, error } = await supabase
    .from('vault_files')
    .select('filename,content,metadata,created_at')
    .eq('construct_id', constructCallsign)
    .or(orClause);

  if (error) {
    console.warn(`⚠️ [VVAULT Hydration] Supabase identity query failed for ${constructCallsign}:`, error.message);
    return [];
  }
  return data || [];
}

function mergePromptRow(out, row) {
  if (!row?.content) return;
  const parsed = safeJson(row.content);
  if (parsed && typeof parsed === 'object') {
    if (!out.name && !EMPTY(parsed.name)) out.name = parsed.name;
    if (!out.description && !EMPTY(parsed.description)) out.description = parsed.description;
    if (!out.instructions && !EMPTY(parsed.instructions)) out.instructions = parsed.instructions;
    if (!out.instructions && !EMPTY(parsed.prompt)) out.instructions = parsed.prompt;
    return;
  }
  if (!out.instructions && !EMPTY(row.content)) out.instructions = row.content;
}

function mergeJsonOrText(out, key, row) {
  if (!row?.content || out[key]) return;
  const parsed = safeJson(row.content);
  if (parsed && typeof parsed === 'object') {
    out[key] = Object.entries(parsed).map(([name, value]) => `${name}: ${value}`).join('\n');
    return;
  }
  if (!EMPTY(row.content)) out[key] = row.content;
}

/**
 * Return only non-empty fields found in VVAULT/Supabase.
 */
export async function mergeFromVVAULT(constructCallsign, userId = null, userEmail = null) {
  const out = {};
  if (!constructCallsign) return out;

  const variants = Array.from(new Set([
    constructCallsign,
    String(constructCallsign).replace(/-\d+$/, ''),
  ].filter(Boolean)));

  try {
    const conditioning = await loadConditioningTxt(userId || '', constructCallsign);
    if (!EMPTY(conditioning)) out.conditioning = conditioning;
  } catch {
    // Identity loader failures should not block route hydration.
  }

  try {
    const apiIdentity = await fetchIdentityFromVVAULTApi(constructCallsign, userEmail);
    if (!EMPTY(apiIdentity?.name)) out.name = apiIdentity.name;
    if (!EMPTY(apiIdentity?.description)) out.description = apiIdentity.description;
    if (!EMPTY(apiIdentity?.instructions)) out.instructions = apiIdentity.instructions;
  } catch {
    // Fallback to Supabase below.
  }

  const supabase = getSupabaseClient();
  if (!supabase) return out;

  for (const candidate of variants) {
    const rows = await loadVaultIdentityRows(supabase, candidate);
    if (rows.length === 0) continue;

    if (!out.name || !out.description || !out.instructions) {
      mergePromptRow(out, latest(rows, (row) => /prompt\.(json|txt)$/i.test(row.filename || '')));
    }

    if (!out.conditioning) {
      const conditioning = latest(rows, (row) => /conditioning\.txt$/i.test(row.filename || ''))?.content;
      if (!EMPTY(conditioning)) out.conditioning = conditioning;
    }

    mergeJsonOrText(out, 'physicalFeatures', latest(rows, (row) => /physical_features\.(txt|json)$/i.test(row.filename || '')));
    mergeJsonOrText(out, 'definition', latest(rows, (row) => /definition\.(txt|json)$/i.test(row.filename || '')));

    if (!out.voice) {
      const voiceJson = latest(rows, (row) => /voice\.json$/i.test(row.filename || ''));
      const voiceMd = latest(rows, (row) => /voice\.md$/i.test(row.filename || ''));
      if (voiceJson?.content) {
        const text = extractVoiceInstructions(voiceJson.content);
        if (!EMPTY(text)) out.voice = text;
      } else if (!EMPTY(voiceMd?.content)) {
        out.voice = voiceMd.content;
      }
    }

    if (!out.hasAvatar && rows.some((row) => /avatar/i.test(row.filename || ''))) {
      out.hasAvatar = true;
    }
  }

  return out;
}
