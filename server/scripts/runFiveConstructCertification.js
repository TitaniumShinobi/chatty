#!/usr/bin/env node
import '../loadEnv.js';

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac } from 'node:crypto';

import {
  buildCertificationMarkdown,
  buildCertificationReport,
  buildCertificationRuns,
  parseFiveConstructCertificationArgs,
  summarizeCertificationTurn,
} from '../lib/fiveConstructCertification.js';

const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 5050;
const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}`;
const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';
const JWT_SECRET = process.env.JWT_SECRET;
const SERVICE_TOKEN =
  process.env.FIVE_CONSTRUCT_CERTIFICATION_SERVICE_TOKEN ||
  process.env.VVAULT_SERVICE_TOKEN ||
  '';
const REQUEST_AUTH_USER_ID =
  process.env.FIVE_CONSTRUCT_CERTIFICATION_USER_ID ||
  process.env.TEST_USER_ID ||
  'zenith-codex-certification';
const REQUEST_AUTH_USER_EMAIL =
  process.env.FIVE_CONSTRUCT_CERTIFICATION_USER_EMAIL ||
  process.env.TEST_USER_EMAIL ||
  '';
const REQUEST_TIMEOUT_MS = Number(process.env.FIVE_CONSTRUCT_CERTIFICATION_TIMEOUT_MS || 120000);
const READBACK_RETRY_COUNT = Number(process.env.FIVE_CONSTRUCT_CERTIFICATION_READBACK_RETRIES || 6);
const READBACK_RETRY_DELAY_MS = Number(process.env.FIVE_CONSTRUCT_CERTIFICATION_READBACK_RETRY_DELAY_MS || 750);
const VVAULT_READY_URL = process.env.FIVE_CONSTRUCT_CERTIFICATION_VVAULT_READY_URL || null;

function printHelp() {
  console.log(`Five-construct orchestration certification

Usage:
  npm run probe:five-construct:certification
  node server/scripts/runFiveConstructCertification.js --prompt-limit=1 --json

Environment:
  API_BASE_URL
  JWT_SECRET
  FIVE_CONSTRUCT_CERTIFICATION_USER_ID
  FIVE_CONSTRUCT_CERTIFICATION_USER_EMAIL
  FIVE_CONSTRUCT_CERTIFICATION_SERVICE_TOKEN
  FIVE_CONSTRUCT_CERTIFICATION_VVAULT_READY_URL
  FIVE_CONSTRUCT_CERTIFICATION_TIMEOUT_MS

Resume:
  --prompt-start-ordinal=2 --prompt-limit=19`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildToken() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set. Start Chatty with the same env before running certification.');
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: REQUEST_AUTH_USER_ID };
  if (REQUEST_AUTH_USER_EMAIL) payload.email = REQUEST_AUTH_USER_EMAIL;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function buildAuthHeaders() {
  if (SERVICE_TOKEN) {
    return {
      Authorization: `Bearer ${SERVICE_TOKEN}`,
      'X-Chatty-Key': SERVICE_TOKEN,
      'X-Chatty-User-Id': REQUEST_AUTH_USER_ID,
      'X-Chatty-User-Email': REQUEST_AUTH_USER_EMAIL,
      'X-Chatty-Operator-Name': 'Zenith/Codex',
    };
  }
  return {
    Cookie: `${COOKIE_NAME}=${buildToken()}`,
  };
}

async function fetchJsonWithStatus(url, authHeaders = {}, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders,
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const cause = error?.cause?.message || error?.cause?.code || '';
    throw new Error(`fetch failed for ${url}${cause ? `: ${cause}` : ''}`);
  }
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { ok: false, error: text };
  }
  return {
    status: response.status,
    ok: response.ok,
    payload,
    error: response.ok ? null : payload?.error || payload?.message || text || `HTTP ${response.status}`,
  };
}

function messageText(message) {
  if (typeof message === 'string') return message;
  if (!message || typeof message !== 'object') return '';
  return String(message.content || message.text || message.message || message.body || '');
}

function transcriptTurns(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.messages)) return payload.messages;
  if (Array.isArray(payload.turns)) return payload.turns;
  if (Array.isArray(payload.conversation?.messages)) return payload.conversation.messages;
  return [];
}

function transcriptRawText(payload) {
  const parts = [];
  if (typeof payload?.content === 'string') parts.push(payload.content);
  if (typeof payload?.rawMarkdown === 'string') parts.push(payload.rawMarkdown);
  for (const turn of transcriptTurns(payload)) {
    parts.push(messageText(turn));
  }
  return parts.join('\n');
}

function normalizeComparableText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function previewText(value, maxChars = 160) {
  const text = normalizeComparableText(value);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

function transcriptContainsText(payload, needle) {
  const raw = transcriptRawText(payload);
  const normalizedRaw = normalizeComparableText(raw);
  const normalizedNeedle = normalizeComparableText(needle);
  return Boolean(needle && (raw.includes(needle) || normalizedRaw.includes(normalizedNeedle)));
}

function answerText(payload = {}) {
  if (typeof payload.response === 'string') return payload.response;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.text === 'string') return payload.text;
  return '';
}

function snapshotCanonicalTranscript(payload, threadId, prompt = '', answer = '') {
  const promptPreview = previewText(prompt);
  const answerPreview = previewText(answer);
  const turns = transcriptTurns(payload);
  return {
    threadId,
    ok: payload?.ok === true,
    source: payload?.source || payload?.thread?.source || payload?.conversation?.source || 'canonical-transcript',
    messageCount: turns.length,
    containsPrompt: Boolean(promptPreview) && (
      transcriptContainsText(payload, prompt) ||
      transcriptContainsText(payload, promptPreview)
    ),
    containsAssistantResponse: Boolean(answerPreview) && (
      transcriptContainsText(payload, answer) ||
      transcriptContainsText(payload, answerPreview)
    ),
    lastUpdated:
      payload?.conversation?.updated_at ||
      payload?.conversation?.lastMessageAt ||
      payload?.updatedAt ||
      null,
  };
}

async function fetchCanonicalTranscript(apiBaseUrl, authHeaders, threadId) {
  return fetchJsonWithStatus(
    `${apiBaseUrl}/api/vvault/conversations/${encodeURIComponent(threadId)}/canonical-transcript`,
    authHeaders,
  );
}

async function fetchCanonicalTranscriptUntilReadback(apiBaseUrl, authHeaders, threadId, prompt, answer, initial) {
  let latest = initial;
  for (let attempt = 0; attempt < READBACK_RETRY_COUNT; attempt += 1) {
    const snapshot = snapshotCanonicalTranscript(latest.payload, threadId, prompt, answer);
    if (latest.ok && snapshot.containsPrompt && snapshot.containsAssistantResponse) {
      return latest;
    }
    await sleep(READBACK_RETRY_DELAY_MS);
    latest = await fetchCanonicalTranscript(apiBaseUrl, authHeaders, threadId);
  }
  return latest;
}

async function postCertificationPrompt({
  apiBaseUrl,
  authHeaders,
  run,
  prompt,
  includeDiagnosticSynthesis,
}) {
  const body = {
    constructId: run.constructId,
    threadId: run.threadId,
    sessionId: run.threadId,
    transcriptPath: run.transcriptPath,
    skipPersistence: false,
    message: prompt.message,
  };
  if (includeDiagnosticSynthesis) {
    body.orchestrationProfile = 'diagnostic_full_seat_synthesis';
  }
  return fetchJsonWithStatus(`${apiBaseUrl}/api/vvault/message`, authHeaders, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function assertReady(apiBaseUrl, authHeaders) {
  const health = await fetchJsonWithStatus(`${apiBaseUrl}/api/health`, authHeaders);
  if (!health.ok || health.payload?.ready !== true) {
    throw new Error(`Chatty API is not ready at ${apiBaseUrl}/api/health`);
  }
  if (VVAULT_READY_URL) {
    const vvaultReady = await fetchJsonWithStatus(VVAULT_READY_URL, authHeaders);
    if (!vvaultReady.ok || vvaultReady.payload?.ready !== true) {
      throw new Error(`VVAULT is not ready at ${VVAULT_READY_URL}`);
    }
  }
}

async function writeReport(outDir, report) {
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'five-construct-certification-report.json');
  const markdownPath = path.join(outDir, 'five-construct-certification-report.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, buildCertificationMarkdown(report), 'utf8');
  return { jsonPath, markdownPath };
}

function printTurn(turn, index, total) {
  console.log(`\n[${index + 1}/${total}] ${turn.constructId} / ${turn.promptId}`);
  console.log(`  status: ${turn.ok ? 'pass' : 'fail'} | score ${turn.totalScore}/${turn.maxScore}`);
  console.log(`  provider: ${turn.provider.selectionPolicy || 'unknown'} / ${turn.provider.linHarmonyPolicy || 'unknown'}`);
  console.log(`  persistence: ${turn.persistence.receiptStatus || turn.persistence.checklistStatus || 'unknown'}`);
  console.log(`  readback: prompt=${turn.readback.promptFound} assistant=${turn.readback.assistantResponseFound} delta=${turn.readback.messageDelta}`);
  if (turn.hardFailures.length) {
    console.log(`  hard failures: ${turn.hardFailures.join(', ')}`);
  }
}

async function main() {
  const args = parseFiveConstructCertificationArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const apiBaseUrl = args.apiBaseUrl || API_BASE_URL;
  const authHeaders = buildAuthHeaders();
  const runs = buildCertificationRuns(args);
  const totalPrompts = runs.reduce((sum, run) => sum + run.prompts.length, 0);

  await assertReady(apiBaseUrl, authHeaders);

  const startedAt = new Date().toISOString();
  const turns = [];
  let stoppedOnFail = false;

  if (!args.json) {
    console.log('Five-construct orchestration certification');
    console.log(`API: ${apiBaseUrl}`);
    console.log(`Order: ${runs.map((run) => run.constructId).join(' -> ')}`);
    console.log(`Prompts: ${totalPrompts}`);
  }

  for (const run of runs) {
    for (const prompt of run.prompts) {
      const beforeTranscript = await fetchCanonicalTranscript(apiBaseUrl, authHeaders, run.threadId);
      const beforeReadback = snapshotCanonicalTranscript(beforeTranscript.payload, run.threadId);
      const response = await postCertificationPrompt({
        apiBaseUrl,
        authHeaders,
        run,
        prompt,
        includeDiagnosticSynthesis: args.includeDiagnosticSynthesis,
      });
      const answer = answerText(response.payload);
      const initialAfter = await fetchCanonicalTranscript(apiBaseUrl, authHeaders, run.threadId);
      const finalAfter = await fetchCanonicalTranscriptUntilReadback(
        apiBaseUrl,
        authHeaders,
        run.threadId,
        prompt.message,
        answer,
        initialAfter,
      );
      const afterReadback = snapshotCanonicalTranscript(finalAfter.payload, run.threadId, prompt.message, answer);
      const turn = summarizeCertificationTurn({
        constructId: run.constructId,
        prompt,
        httpStatus: response.status,
        payload: response.payload,
        beforeReadback,
        afterReadback,
        allowDiagnosticSynthesis: args.includeDiagnosticSynthesis,
      });
      turns.push(turn);
      if (!args.json) {
        printTurn(turn, turns.length - 1, totalPrompts);
      }
      if (!turn.ok && args.stopOnFail) {
        stoppedOnFail = true;
        break;
      }
    }
    if (stoppedOnFail) break;
  }

  const completedAt = new Date().toISOString();
  const report = buildCertificationReport({
    apiBaseUrl,
    outDir: args.outDir,
    startedAt,
    completedAt,
    runs,
    turns,
    stoppedOnFail,
  });
  const written = await writeReport(args.outDir, report);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\nRun summary');
    console.log(`  status: ${report.status}`);
    console.log(`  turns: ${report.summary.totalTurns} total, ${report.summary.passedTurns} passed, ${report.summary.failedTurns} failed`);
    console.log(`  json: ${written.jsonPath}`);
    console.log(`  markdown: ${written.markdownPath}`);
  }

  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`FAIL five-construct certification: ${error.message}`);
  process.exit(1);
});
