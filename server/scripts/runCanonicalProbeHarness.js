#!/usr/bin/env node
import '../loadEnv.js';
import jwt from 'jsonwebtoken';

import { resolveSupabaseUserIdFromEmailOrId } from '../auth/lib/supabaseUserResolver.js';
import {
  LIN_CANONICAL_THREAD_ID,
  LIN_CANONICAL_TRANSCRIPT_PATH,
  resolveCanonicalConstructDataOwner,
} from '../lib/canonicalConstructOwner.js';
import {
  DEFAULT_LIN_CANONICAL_PROBE_MATRIX,
  buildCanonicalProbeReport,
  extractTranscriptSnapshotFromRows,
  summarizeCanonicalProbeTurn,
} from '../lib/canonicalProbeHarness.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

const CONSTRUCT_ID = 'lin-001';
const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 5050;
const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}`;
const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';
const JWT_SECRET = process.env.JWT_SECRET;
const REQUEST_AUTH_USER_ID = process.env.CANONICAL_PROBE_REQUEST_USER_ID || process.env.TEST_USER_ID || 'dev-agent';
const REQUEST_AUTH_USER_EMAIL = process.env.CANONICAL_PROBE_REQUEST_USER_EMAIL || process.env.TEST_USER_EMAIL || '';
const REQUEST_TIMEOUT_MS = Number(process.env.CANONICAL_PROBE_TIMEOUT_MS || 120000);

function printHelp() {
  console.log(`Canonical Lin probe harness

Usage:
  npm run probe:lin:canonical
  node server/scripts/runCanonicalProbeHarness.js --json

Environment overrides:
  API_BASE_URL
  CANONICAL_PROBE_REQUEST_USER_ID
  CANONICAL_PROBE_REQUEST_USER_EMAIL
  CANONICAL_PROBE_TIMEOUT_MS`);
}

function parseArgs(argv = []) {
  return {
    json: argv.includes('--json'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

async function readTranscriptSnapshot({ supabase, supabaseUserId, transcriptPath }) {
  const { data, error } = await supabase
    .from('vault_files')
    .select('id, metadata, created_at')
    .eq('user_id', supabaseUserId)
    .eq('construct_id', CONSTRUCT_ID)
    .eq('filename', transcriptPath)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Transcript snapshot query failed: ${error.message}`);
  }

  return extractTranscriptSnapshotFromRows(data || [], transcriptPath);
}

function buildToken() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set. Use the same env the server was started with before running the canonical probe harness.');
  }

  const payload = { sub: REQUEST_AUTH_USER_ID };
  if (REQUEST_AUTH_USER_EMAIL) payload.email = REQUEST_AUTH_USER_EMAIL;
  return jwt.sign(payload, JWT_SECRET);
}

function formatProvider(provider = {}) {
  const finalProvider = provider.finalProvider || 'unknown-provider';
  const model = provider.model || 'unknown-model';
  return `${finalProvider} / ${model}`;
}

function printTurnSummary(turn, index, total) {
  console.log(`\n[${index + 1}/${total}] ${turn.label || turn.id || 'probe'} -> HTTP ${turn.httpStatus}`);
  console.log(`  construct: ${turn.constructId || 'unknown'}`);
  console.log(`  seat: ${turn.seat.displayName || 'Unknown'} (${turn.seat.requestedCanonicalSeat || 'unknown'}${turn.seat.requestedSeat ? ` from ${turn.seat.requestedSeat}` : ''})`);
  console.log(`  provider/model: ${formatProvider(turn.provider)}`);
  console.log(`  coherence: ${turn.coherence.checklistStatus || turn.coherence.receiptStatus || 'unknown'} | repair=${turn.coherence.repairOutcome}${turn.coherence.finalAnswerSource ? ` | source=${turn.coherence.finalAnswerSource}` : ''}`);
  console.log(`  persistence: ${turn.persistence.checklistStatus || turn.persistence.receiptStatus || 'unknown'}`);
  console.log(`  transcript: rows ${turn.transcript.before.rowCount} -> ${turn.transcript.after.rowCount} (${turn.transcript.rowDelta >= 0 ? '+' : ''}${turn.transcript.rowDelta}), messages ${turn.transcript.before.messageCount} -> ${turn.transcript.after.messageCount} (${turn.transcript.messageDelta >= 0 ? '+' : ''}${turn.transcript.messageDelta})`);
  if (turn.error) {
    console.log(`  error: ${turn.error}`);
  }
}

async function postProbe({ token, probe }) {
  const response = await fetch(`${API_BASE_URL}/api/vvault/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({
      constructId: CONSTRUCT_ID,
      threadId: LIN_CANONICAL_THREAD_ID,
      sessionId: LIN_CANONICAL_THREAD_ID,
      transcriptPath: LIN_CANONICAL_TRANSCRIPT_PATH,
      skipPersistence: false,
      message: probe.message,
      ...(probe.request && typeof probe.request === 'object' ? probe.request : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { success: false, error: text };
  }

  return {
    httpStatus: response.status,
    payload,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client unavailable. The harness cannot capture canonical transcript row counts without SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }

  const canonicalOwner = resolveCanonicalConstructDataOwner({
    constructId: CONSTRUCT_ID,
    sessionId: LIN_CANONICAL_THREAD_ID,
    transcriptPath: LIN_CANONICAL_TRANSCRIPT_PATH,
    requestedDataOwnerUserId: REQUEST_AUTH_USER_ID,
    requestedDataOwnerSource: 'canonical_probe_harness',
    authenticatedUserId: REQUEST_AUTH_USER_ID,
  });

  const canonicalDataOwnerUserId = canonicalOwner.dataOwnerUserId;
  const canonicalTranscriptSupabaseUserId = await resolveSupabaseUserIdFromEmailOrId(canonicalDataOwnerUserId);
  if (!canonicalTranscriptSupabaseUserId) {
    throw new Error(`Could not resolve canonical transcript Supabase user id for ${canonicalDataOwnerUserId}.`);
  }

  const token = buildToken();
  const startedAt = new Date().toISOString();
  const probes = DEFAULT_LIN_CANONICAL_PROBE_MATRIX;
  const initialSnapshot = await readTranscriptSnapshot({
    supabase,
    supabaseUserId: canonicalTranscriptSupabaseUserId,
    transcriptPath: LIN_CANONICAL_TRANSCRIPT_PATH,
  });

  const turns = [];
  let currentSnapshot = initialSnapshot;

  if (!args.json) {
    console.log(`Canonical Lin probe harness`);
    console.log(`API: ${API_BASE_URL}`);
    console.log(`Thread: ${LIN_CANONICAL_THREAD_ID}`);
    console.log(`Request auth user: ${REQUEST_AUTH_USER_ID}`);
    console.log(`Canonical data owner: ${canonicalDataOwnerUserId}`);
    console.log(`Transcript rows/messages before: ${initialSnapshot.rowCount}/${initialSnapshot.messageCount}`);
  }

  for (const probe of probes) {
    const beforeSnapshot = currentSnapshot;
    const { httpStatus, payload } = await postProbe({ token, probe });
    const afterSnapshot = await readTranscriptSnapshot({
      supabase,
      supabaseUserId: canonicalTranscriptSupabaseUserId,
      transcriptPath: LIN_CANONICAL_TRANSCRIPT_PATH,
    });
    const turn = summarizeCanonicalProbeTurn({
      probe,
      httpStatus,
      payload,
      beforeSnapshot,
      afterSnapshot,
    });
    turns.push(turn);
    currentSnapshot = afterSnapshot;

    if (!args.json) {
      printTurnSummary(turn, turns.length - 1, probes.length);
    }
  }

  const completedAt = new Date().toISOString();
  const report = buildCanonicalProbeReport({
    constructId: CONSTRUCT_ID,
    sessionId: LIN_CANONICAL_THREAD_ID,
    apiBaseUrl: API_BASE_URL,
    actor: {
      requestAuthUserId: REQUEST_AUTH_USER_ID,
      requestAuthEmail: REQUEST_AUTH_USER_EMAIL,
      canonicalDataOwnerUserId,
      canonicalDataOwnerSource: canonicalOwner.dataOwnerSource,
      canonicalTranscriptSupabaseUserId,
    },
    probes,
    startedAt,
    completedAt,
    initialSnapshot,
    finalSnapshot: currentSnapshot,
    results: turns,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nRun summary`);
  console.log(`  turns: ${report.summary.totalTurns} total, ${report.summary.okTurns} ok, ${report.summary.failedTurns} failed`);
  console.log(`  transcript growth: rows ${report.transcript.before.rowCount} -> ${report.transcript.after.rowCount} (${report.transcript.rowDelta >= 0 ? '+' : ''}${report.transcript.rowDelta}), messages ${report.transcript.before.messageCount} -> ${report.transcript.after.messageCount} (${report.transcript.messageDelta >= 0 ? '+' : ''}${report.transcript.messageDelta})`);
  console.log(`  repaired turns: ${report.summary.repairedTurns}`);
}

main().catch((error) => {
  console.error(`FAIL canonical Lin probe harness: ${error.message}`);
  process.exit(1);
});
