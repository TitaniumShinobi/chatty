#!/usr/bin/env node
import '../loadEnv.js';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_ZENITH_LINEAR_CONSTRUCT_ID,
  DEFAULT_ZENITH_LINEAR_THREAD_ID,
  DEFAULT_ZENITH_LINEAR_TRANSCRIPT_PATH,
  DEFAULT_ZENITH_LINEAR_TURNS,
  advanceLinearTranscriptLawState,
  appendJsonl,
  buildLinearTranscriptLawReport,
  buildLinearTranscriptLawTurn,
  createInitialLinearTranscriptLawState,
  formatLinearTranscriptLawReport,
  summarizeLinearTranscriptLawTurn,
  writeJsonAtomic,
} from '../lib/linearTranscriptLawHarness.js';

const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 5050;
const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}`;
const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';
const JWT_SECRET = process.env.JWT_SECRET;
const REQUEST_AUTH_USER_ID =
  process.env.ZENITH_LINEAR_ACTOR_ID ||
  process.env.CANONICAL_PROBE_REQUEST_USER_ID ||
  process.env.TEST_USER_ID ||
  'zenith-linear-transcript-law-gate';
const REQUEST_AUTH_USER_EMAIL =
  process.env.ZENITH_LINEAR_ACTOR_EMAIL ||
  process.env.CANONICAL_PROBE_REQUEST_USER_EMAIL ||
  process.env.TEST_USER_EMAIL ||
  'dwoodson92@gmail.com';
const REQUEST_TIMEOUT_MS = Number(process.env.ZENITH_LINEAR_TIMEOUT_MS || 120000);

function printHelp() {
  console.log(`Zenith linear transcript-law gate

Usage:
  npm run probe:zenith:linear -- --turns=12 --out-dir=/tmp/chatty-zenith-linear-gate

Environment overrides:
  API_BASE_URL
  ZENITH_LINEAR_ACTOR_ID
  ZENITH_LINEAR_ACTOR_EMAIL
  ZENITH_LINEAR_THREAD_ID
  ZENITH_LINEAR_TRANSCRIPT_PATH
  ZENITH_LINEAR_TIMEOUT_MS`);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv = []) {
  const args = {
    turns: DEFAULT_ZENITH_LINEAR_TURNS,
    outDir: null,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--turns') {
      args.turns = parsePositiveInt(argv[index + 1], args.turns);
      index += 1;
    } else if (arg.startsWith('--turns=')) {
      args.turns = parsePositiveInt(arg.slice('--turns='.length), args.turns);
    } else if (arg === '--out-dir') {
      args.outDir = argv[index + 1] || null;
      index += 1;
    } else if (arg.startsWith('--out-dir=')) {
      args.outDir = arg.slice('--out-dir='.length) || null;
    }
  }

  return args;
}

function buildRunId() {
  return `zenith-linear-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

function buildToken() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set. Use the same env the server was started with before running the linear transcript-law gate.');
  }

  const payload = { sub: REQUEST_AUTH_USER_ID };
  if (REQUEST_AUTH_USER_EMAIL) payload.email = REQUEST_AUTH_USER_EMAIL;
  return jwt.sign(payload, JWT_SECRET);
}

function outputPaths({ outDir, runId }) {
  const baseDir = outDir || path.join(os.tmpdir(), 'chatty-zenith-linear-gate', runId);
  return {
    outDir: baseDir,
    receiptsPath: path.join(baseDir, 'turn-receipts.jsonl'),
    reportPath: path.join(baseDir, 'report.json'),
  };
}

async function postTurn({ token, constructId, threadId, sessionId, transcriptPath, turn }) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/vvault/message`, {
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
        linearTranscriptLawGate: true,
        linearTranscriptLawTurnKind: turn.kind,
        linearTranscriptLawPromptId: turn.prompt_id,
        message: turn.message,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const cause = error?.cause;
    const detail = [
      error?.message || 'fetch failed',
      cause?.code ? `code=${cause.code}` : null,
      cause?.address ? `address=${cause.address}` : null,
      cause?.port ? `port=${cause.port}` : null,
      turn?.prompt_id ? `turn=${turn.prompt_id}` : null,
    ].filter(Boolean).join(' ');
    throw new Error(detail);
  }

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
  const hard = receipt.hard_failures?.length ? ` | hard=${receipt.hard_failures.join(',')}` : '';
  console.log(`\n[${receipt.turn_index + 1}/${totalTurns}] ${receipt.prompt_id} (${receipt.kind}) HTTP ${receipt.http_status}${hard}`);
  console.log(`  model: ${receipt.provider || 'unknown'} / ${receipt.model || 'unknown'} / ${receipt.model_source || 'unknown'}`);
  console.log(`  linearity: ${receipt.linearity_grade?.status || 'skipped'} | transcript-law: ${receipt.transcript_law_grade?.status || 'skipped'}`);
  console.log(`  preview: ${receipt.answer_preview || receipt.error || ''}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const token = buildToken();
  const runId = buildRunId();
  const paths = outputPaths({ outDir: args.outDir, runId });
  const constructId = DEFAULT_ZENITH_LINEAR_CONSTRUCT_ID;
  const threadId = process.env.ZENITH_LINEAR_THREAD_ID || DEFAULT_ZENITH_LINEAR_THREAD_ID;
  const sessionId = process.env.ZENITH_LINEAR_SESSION_ID || threadId;
  const transcriptPath = process.env.ZENITH_LINEAR_TRANSCRIPT_PATH || DEFAULT_ZENITH_LINEAR_TRANSCRIPT_PATH;
  const startedAt = new Date().toISOString();
  const totalTurns = args.turns;
  const receipts = [];
  let linearState = createInitialLinearTranscriptLawState();

  if (!args.json) {
    console.log('Zenith linear transcript-law gate');
    console.log(`API: ${API_BASE_URL}`);
    console.log(`Run: ${runId}`);
    console.log(`Thread: ${threadId}`);
    console.log(`Transcript: ${transcriptPath}`);
    console.log(`Receipts: ${paths.receiptsPath}`);
  }

  for (let turnIndex = 0; turnIndex < totalTurns; turnIndex += 1) {
    const turn = buildLinearTranscriptLawTurn({
      turnIndex,
      totalTurns,
      state: linearState,
      previousReceipts: receipts,
    });
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
    const receipt = summarizeLinearTranscriptLawTurn({
      turn,
      httpStatus,
      payload,
      startedAt: turnStartedAt,
      completedAt: turnCompletedAt,
      elapsedMs: Date.now() - startedMs,
      state: linearState,
      previousReceipts: receipts,
    });
    linearState = advanceLinearTranscriptLawState(linearState, turn, receipt);
    receipt.linear_state_after = linearState;
    receipts.push(receipt);
    await appendJsonl(paths.receiptsPath, receipt);
    if (!args.json) printTurnSummary(receipt, totalTurns);
  }

  const completedAt = new Date().toISOString();
  const report = buildLinearTranscriptLawReport({
    runId,
    constructId,
    threadId,
    sessionId,
    transcriptPath,
    apiBaseUrl: API_BASE_URL,
    totalTurns,
    startedAt,
    completedAt,
    turns: receipts,
  });
  await writeJsonAtomic(paths.reportPath, report);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n' + formatLinearTranscriptLawReport(report));
    console.log(`REPORT_PATH: ${paths.reportPath}`);
  }

  if (report.STATUS !== 'pass') process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL Zenith linear transcript-law gate: ${error.message}`);
  process.exit(1);
});
