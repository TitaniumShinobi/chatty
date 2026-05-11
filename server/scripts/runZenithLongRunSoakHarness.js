#!/usr/bin/env node
import '../loadEnv.js';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_ZENITH_SOAK_CONSTRUCT_ID,
  DEFAULT_ZENITH_SOAK_THREAD_ID,
  DEFAULT_ZENITH_SOAK_TRANSCRIPT_PATH,
  DEFAULT_ZENITH_SOAK_TURNS,
  appendJsonl,
  buildCheckpoint,
  buildLongRunSoakReport,
  buildZenithSoakTurn,
  readJsonFile,
  readJsonlFile,
  summarizeLongRunSoakTurn,
  validateResumeCheckpoint,
  writeJsonAtomic,
} from '../lib/longRunSoakHarness.js';

const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 5050;
const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}`;
const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';
const JWT_SECRET = process.env.JWT_SECRET;
const REQUEST_AUTH_USER_ID =
  process.env.ZENITH_SOAK_ACTOR_ID ||
  process.env.CANONICAL_PROBE_REQUEST_USER_ID ||
  process.env.TEST_USER_ID ||
  'zenith-soak-diagnostic';
const REQUEST_AUTH_USER_EMAIL =
  process.env.ZENITH_SOAK_ACTOR_EMAIL ||
  process.env.CANONICAL_PROBE_REQUEST_USER_EMAIL ||
  process.env.TEST_USER_EMAIL ||
  '';
const REQUEST_TIMEOUT_MS = Number(process.env.ZENITH_SOAK_TIMEOUT_MS || 120000);

function printHelp() {
  console.log(`Zenith long-run soak harness

Usage:
  npm run probe:zenith:soak -- --turns=100 --interrupt-at=50 --out-dir=/tmp/chatty-zenith-soak
  npm run probe:zenith:soak -- --resume --checkpoint=/tmp/chatty-zenith-soak/checkpoint.json

Environment overrides:
  API_BASE_URL
  ZENITH_SOAK_ACTOR_ID
  ZENITH_SOAK_ACTOR_EMAIL
  ZENITH_SOAK_THREAD_ID
  ZENITH_SOAK_TRANSCRIPT_PATH
  ZENITH_SOAK_TIMEOUT_MS`);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv = []) {
  const args = {
    turns: DEFAULT_ZENITH_SOAK_TURNS,
    interruptAt: null,
    outDir: null,
    checkpoint: null,
    resume: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--resume') {
      args.resume = true;
    } else if (arg === '--turns') {
      args.turns = parsePositiveInt(argv[index + 1], args.turns);
      index += 1;
    } else if (arg.startsWith('--turns=')) {
      args.turns = parsePositiveInt(arg.slice('--turns='.length), args.turns);
    } else if (arg === '--interrupt-at') {
      args.interruptAt = parsePositiveInt(argv[index + 1], null);
      index += 1;
    } else if (arg.startsWith('--interrupt-at=')) {
      args.interruptAt = parsePositiveInt(arg.slice('--interrupt-at='.length), null);
    } else if (arg === '--out-dir') {
      args.outDir = argv[index + 1] || null;
      index += 1;
    } else if (arg.startsWith('--out-dir=')) {
      args.outDir = arg.slice('--out-dir='.length) || null;
    } else if (arg === '--checkpoint') {
      args.checkpoint = argv[index + 1] || null;
      index += 1;
    } else if (arg.startsWith('--checkpoint=')) {
      args.checkpoint = arg.slice('--checkpoint='.length) || null;
    }
  }

  return args;
}

function buildRunId() {
  return `zenith-soak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

function buildToken() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set. Use the same env the server was started with before running the Zenith soak harness.');
  }

  const payload = { sub: REQUEST_AUTH_USER_ID };
  if (REQUEST_AUTH_USER_EMAIL) payload.email = REQUEST_AUTH_USER_EMAIL;
  return jwt.sign(payload, JWT_SECRET);
}

function outputPaths({ outDir, runId, checkpoint }) {
  const baseDir = outDir || path.join(os.tmpdir(), 'chatty-zenith-soak', runId);
  return {
    outDir: baseDir,
    checkpointPath: checkpoint || path.join(baseDir, 'checkpoint.json'),
    receiptsPath: path.join(baseDir, 'turn-receipts.jsonl'),
    reportPath: path.join(baseDir, 'report.json'),
  };
}

async function postTurn({ token, constructId, threadId, sessionId, transcriptPath, turn }) {
  const response = await fetch(`${API_BASE_URL}/api/vvault/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${COOKIE_NAME}=${token}`,
      'x-user-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    body: JSON.stringify({
      constructId,
      threadId,
      sessionId,
      transcriptPath,
      skipPersistence: false,
      message: turn.message,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { success: false, error: text };
  }

  return {
    httpStatus: response.status,
    payload,
  };
}

function printTurnSummary(receipt, totalTurns) {
  const quality = receipt.answer_quality?.status || 'unknown';
  const provider = `${receipt.provider || 'unknown-provider'} / ${receipt.model || 'unknown-model'}`;
  console.log(`\n[${receipt.turn_index + 1}/${totalTurns}] ${receipt.label || receipt.prompt_id}: HTTP ${receipt.http_status} | ${quality}`);
  console.log(`  provider/model: ${provider} | local_first=${receipt.provider_local_first_used} fallback=${receipt.provider_fallback_used}`);
  console.log(`  persistence: ${receipt.persistence_owner || 'unknown'} / ${receipt.persistence_status || 'unknown'} / ${receipt.canonical_target || 'unknown'}`);
  console.log(`  memory: ${receipt.memory_source || 'unknown'} | profile=${receipt.context_profile || 'unknown'} | supabase=${receipt.memory_supabase_accessed}`);
  console.log(`  identity: coherence=${receipt.identity_coherence_status || 'unknown'} drift=${receipt.identity_drift_detected} rewrite=${receipt.identity_rewrite_applied}`);
  const breaks = receipt.answer_quality?.continuity_break_reasons || [];
  if (breaks.length > 0) console.log(`  continuity: ${breaks.join(', ')}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const token = buildToken();
  const constructId = DEFAULT_ZENITH_SOAK_CONSTRUCT_ID;
  const threadId = process.env.ZENITH_SOAK_THREAD_ID || DEFAULT_ZENITH_SOAK_THREAD_ID;
  const sessionId = process.env.ZENITH_SOAK_SESSION_ID || threadId;
  const transcriptPath = process.env.ZENITH_SOAK_TRANSCRIPT_PATH || DEFAULT_ZENITH_SOAK_TRANSCRIPT_PATH;
  const startedAt = new Date().toISOString();

  let runId = buildRunId();
  let paths = outputPaths({ outDir: args.outDir, runId, checkpoint: args.checkpoint });
  let totalTurns = args.turns;
  let nextTurnIndex = 0;
  let completedTurns = 0;
  let receipts = [];
  let interruption = null;
  let resumedFromCheckpoint = false;

  if (args.resume) {
    if (!args.checkpoint) {
      throw new Error('--resume requires --checkpoint=/path/to/checkpoint.json');
    }
    const checkpoint = validateResumeCheckpoint(await readJsonFile(args.checkpoint), {
      construct_id: constructId,
      thread_id: threadId,
      session_id: sessionId,
      transcript_path: transcriptPath,
    });
    runId = checkpoint.run_id;
    totalTurns = checkpoint.total_turns;
    nextTurnIndex = checkpoint.next_turn_index;
    completedTurns = checkpoint.completed_turns;
    paths = {
      outDir: path.dirname(args.checkpoint),
      checkpointPath: args.checkpoint,
      receiptsPath: checkpoint.receipts_path,
      reportPath: checkpoint.report_path,
    };
    interruption = checkpoint.interruption || null;
    receipts = checkpoint.receipts_path ? await readJsonlFile(checkpoint.receipts_path) : [];
    resumedFromCheckpoint = true;
  }

  if (!args.json) {
    console.log('Zenith long-run soak harness');
    console.log(`API: ${API_BASE_URL}`);
    console.log(`Run: ${runId}`);
    console.log(`Thread: ${threadId}`);
    console.log(`Transcript: ${transcriptPath}`);
    console.log(`Receipts: ${paths.receiptsPath}`);
    console.log(`Checkpoint: ${paths.checkpointPath}`);
    console.log(`Resume: ${resumedFromCheckpoint ? `yes, starting at turn ${nextTurnIndex + 1}` : 'no'}`);
  }

  while (nextTurnIndex < totalTurns) {
    const turn = buildZenithSoakTurn({ turnIndex: nextTurnIndex, totalTurns });
    const turnStartedAt = new Date().toISOString();
    const startedMs = Date.now();
    const { httpStatus, payload } = await postTurn({
      token,
      constructId,
      threadId,
      sessionId,
      transcriptPath,
      turn,
    });
    const turnCompletedAt = new Date().toISOString();
    const receipt = summarizeLongRunSoakTurn({
      turn,
      httpStatus,
      payload,
      startedAt: turnStartedAt,
      completedAt: turnCompletedAt,
      elapsedMs: Date.now() - startedMs,
    });

    receipts.push(receipt);
    completedTurns = receipts.length;
    nextTurnIndex = receipt.turn_index + 1;

    await appendJsonl(paths.receiptsPath, receipt);
    const shouldInterrupt = args.interruptAt !== null && nextTurnIndex >= args.interruptAt && !interruption;
    if (shouldInterrupt) {
      interruption = {
        requested: true,
        triggered_at_turn: nextTurnIndex,
        triggered_at: new Date().toISOString(),
        resume_command: `npm run probe:zenith:soak -- --resume --checkpoint=${paths.checkpointPath}`,
      };
    }

    const checkpoint = buildCheckpoint({
      runId,
      constructId,
      threadId,
      sessionId,
      transcriptPath,
      apiBaseUrl: API_BASE_URL,
      totalTurns,
      nextTurnIndex,
      completedTurns,
      receiptsPath: paths.receiptsPath,
      reportPath: paths.reportPath,
      startedAt,
      updatedAt: new Date().toISOString(),
      interruption,
      lastTurnReceipt: receipt,
    });
    await writeJsonAtomic(paths.checkpointPath, checkpoint);

    if (!args.json) {
      printTurnSummary(receipt, totalTurns);
    }

    if (shouldInterrupt) {
      if (!args.json) {
        console.log(`\nForced interruption checkpoint written at turn ${nextTurnIndex}.`);
        console.log(`Resume: ${interruption.resume_command}`);
      }
      return;
    }
  }

  const completedAt = new Date().toISOString();
  const report = buildLongRunSoakReport({
    runId,
    constructId,
    threadId,
    sessionId,
    transcriptPath,
    apiBaseUrl: API_BASE_URL,
    totalTurns,
    startedAt,
    completedAt,
    interruptedAtTurn: interruption?.triggered_at_turn || null,
    resumedFromCheckpoint,
    turns: receipts,
  });
  await writeJsonAtomic(paths.reportPath, report);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\nRun summary');
  console.log(`  turns: ${report.summary.completed_turns}/${report.total_turns_requested} completed, ${report.summary.ok_turns} ok, ${report.summary.failed_turns} failed`);
  console.log(`  identity: ${report.summary.identity_drift_turns} drift, ${report.summary.identity_rewrite_turns} rewrite`);
  console.log(`  quality warnings: ${report.summary.answer_quality_warn_turns}`);
  console.log(`  acceptance: ${report.acceptance.status} | ${report.acceptance.final_verdict}`);
  console.log(`  report: ${paths.reportPath}`);
  if (report.acceptance.status !== 'pass') process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL Zenith long-run soak harness: ${error.message}`);
  process.exit(1);
});
