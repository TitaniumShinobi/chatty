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

function parseJsonContent(value, diagnostics = null, label = 'json_content') {
  if (!value || typeof value !== 'string') {
    return {
      ok: true,
      status: value ? 'passthrough' : 'empty',
      value: value || null,
      error: null,
    };
  }
  try {
    return {
      ok: true,
      status: 'loaded',
      value: JSON.parse(value),
      error: null,
    };
  } catch {
    console.warn(`[VVAULT Hydration] safeJson failed — malformed JSON string`);
    if (diagnostics && Array.isArray(diagnostics.parse_failures)) {
      diagnostics.parse_failures.push({ label, status: 'malformed_json' });
    }
    return {
      ok: false,
      status: 'malformed_json',
      value: null,
      error: 'malformed_json',
    };
  }
}

function latest(rows, predicate) {
  return (rows || [])
    .filter(predicate)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

async function loadVaultIdentityRows(supabase, constructCallsign) {
  if (!supabase) {
    return {
      status: 'supabase_unavailable',
      rows: [],
      error: 'supabase_unavailable',
    };
  }
  if (!constructCallsign) {
    return {
      status: 'construct_missing',
      rows: [],
      error: 'construct_missing',
    };
  }
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
    return {
      status: 'query_error',
      rows: [],
      error: error.message,
    };
  }
  return {
    status: (data || []).length > 0 ? 'loaded' : 'empty',
    rows: data || [],
    error: null,
  };
}

function mergePromptRow(out, row, diagnostics = null) {
  if (!row?.content) return;
  const parsed = parseJsonContent(row.content, diagnostics, 'prompt_row');
  if (parsed.value && typeof parsed.value === 'object') {
    if (!out.name && !EMPTY(parsed.value.name)) out.name = parsed.value.name;
    if (!out.description && !EMPTY(parsed.value.description)) out.description = parsed.value.description;
    if (!out.instructions && !EMPTY(parsed.value.instructions)) out.instructions = parsed.value.instructions;
    if (!out.instructions && !EMPTY(parsed.value.prompt)) out.instructions = parsed.value.prompt;
    return;
  }
  if (!out.instructions && !EMPTY(row.content)) out.instructions = row.content;
}

function mergeJsonOrText(out, key, row, diagnostics = null) {
  if (!row?.content || out[key]) return;
  const parsed = parseJsonContent(row.content, diagnostics, key);
  if (parsed.value && typeof parsed.value === 'object') {
    out[key] = Object.entries(parsed.value).map(([name, value]) => `${name}: ${value}`).join('\n');
    return;
  }
  if (!EMPTY(row.content)) out[key] = row.content;
}

/**
 * Return only non-empty fields found in VVAULT/Supabase.
 */
export async function mergeFromVVAULT(constructCallsign, userId = null, userEmail = null) {
  const out = {
    __hydration_status: {
      conditioning: 'not_attempted',
      api_identity: 'not_attempted',
      supabase: 'not_attempted',
      supabase_error: null,
      parse_failures: [],
      variants_checked: [],
    },
  };
  if (!constructCallsign) return out;

  const variants = Array.from(new Set([
    constructCallsign,
    String(constructCallsign).replace(/-\d+$/, ''),
  ].filter(Boolean)));

  try {
    const conditioning = await loadConditioningTxt(userId || '', constructCallsign);
    if (!EMPTY(conditioning)) out.conditioning = conditioning;
    out.__hydration_status.conditioning = !EMPTY(conditioning) ? 'loaded' : 'empty';
  } catch {
    console.warn(`[VVAULT Hydration] Conditioning load skipped for ${constructCallsign} — non-blocking fallthrough`);
    out.__hydration_status.conditioning = 'unavailable';
  }

  try {
    const apiIdentity = await fetchIdentityFromVVAULTApi(constructCallsign, userEmail);
    if (!EMPTY(apiIdentity?.name)) out.name = apiIdentity.name;
    if (!EMPTY(apiIdentity?.description)) out.description = apiIdentity.description;
    if (!EMPTY(apiIdentity?.instructions)) out.instructions = apiIdentity.instructions;
    out.__hydration_status.api_identity =
      !EMPTY(apiIdentity?.name) || !EMPTY(apiIdentity?.description) || !EMPTY(apiIdentity?.instructions)
        ? 'loaded'
        : 'empty';
  } catch {
    console.warn(`[VVAULT Hydration] API identity unavailable for ${constructCallsign} — falling back to Supabase`);
    out.__hydration_status.api_identity = 'unavailable';
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    out.__hydration_status.supabase = 'unavailable';
    return out;
  }

  for (const candidate of variants) {
    out.__hydration_status.variants_checked.push(candidate);
    const rowResult = await loadVaultIdentityRows(supabase, candidate);
    if (rowResult.status === 'query_error') {
      out.__hydration_status.supabase = 'query_error';
      out.__hydration_status.supabase_error = rowResult.error;
      continue;
    }
    if (rowResult.status === 'supabase_unavailable') {
      out.__hydration_status.supabase = 'unavailable';
      out.__hydration_status.supabase_error = rowResult.error;
      continue;
    }
    const rows = rowResult.rows || [];
    if (rows.length === 0) {
      if (out.__hydration_status.supabase === 'not_attempted') {
        out.__hydration_status.supabase = rowResult.status;
      }
      continue;
    }
    out.__hydration_status.supabase = 'loaded';

    if (!out.name || !out.description || !out.instructions) {
      mergePromptRow(out, latest(rows, (row) => /prompt\.(json|txt)$/i.test(row.filename || '')), out.__hydration_status);
    }

    if (!out.conditioning) {
      const conditioning = latest(rows, (row) => /conditioning\.txt$/i.test(row.filename || ''))?.content;
      if (!EMPTY(conditioning)) out.conditioning = conditioning;
    }

    mergeJsonOrText(out, 'physicalFeatures', latest(rows, (row) => /physical_features\.(txt|json)$/i.test(row.filename || '')), out.__hydration_status);
    mergeJsonOrText(out, 'definition', latest(rows, (row) => /definition\.(txt|json)$/i.test(row.filename || '')), out.__hydration_status);

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

  if (out.__hydration_status.supabase === 'not_attempted') {
    out.__hydration_status.supabase = 'empty';
  }

  return out;
}
