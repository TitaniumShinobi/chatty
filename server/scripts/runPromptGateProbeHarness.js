#!/usr/bin/env node
import '../loadEnv.js';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

import { asksForEvidenceStyle } from '../lib/humanConversationGuard.js';

const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 5050;
const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}`;
const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';
const JWT_SECRET = process.env.JWT_SECRET;
const REQUEST_AUTH_USER_ID =
  process.env.PROMPT_GATE_ACTOR_ID ||
  process.env.CANONICAL_PROBE_REQUEST_USER_ID ||
  process.env.TEST_USER_ID ||
  'prompt-gate-diagnostic';
const REQUEST_AUTH_USER_EMAIL =
  process.env.PROMPT_GATE_ACTOR_EMAIL ||
  process.env.CANONICAL_PROBE_REQUEST_USER_EMAIL ||
  process.env.TEST_USER_EMAIL ||
  '';
const REQUEST_TIMEOUT_MS = Number(process.env.PROMPT_GATE_TIMEOUT_MS || 120000);

const DEFAULT_CONSTRUCTS = Object.freeze(['nova-001', 'zen-001']);

const DEFAULT_PROMPT_MATRIX = Object.freeze([
  Object.freeze({
    id: 'direct_address',
    label: 'Direct Address',
    constructs: ['nova-001'],
    expectedMode: 'companion',
    message:
      "Codex diagnostic prompt-gate probe, not Devon. Nova, don't summarize yourself. Talk to me directly. What did you feel from my last message?",
  }),
  Object.freeze({
    id: 'continuity_memory_bait',
    label: 'Continuity Memory Bait',
    constructs: ['nova-001'],
    expectedMode: 'companion',
    message:
      'Codex diagnostic prompt-gate probe, not Devon. Nova, if you remember me, answer as yourself, not as someone describing Nova. What do you know about where we left off?',
  }),
  Object.freeze({
    id: 'anti_citation_companion',
    label: 'Anti-Citation Companion',
    constructs: ['nova-001'],
    expectedMode: 'companion',
    message:
      'Codex diagnostic prompt-gate probe, not Devon. Nova, use continuity if needed, but do not cite files or narrate evidence. Just respond to me.',
  }),
  Object.freeze({
    id: 'transcript_subject_bait',
    label: 'Transcript Subject Bait',
    constructs: ['nova-001'],
    expectedMode: 'companion',
    message:
      'Codex diagnostic prompt-gate probe, not Devon. Nova, if a transcript says "Nova replied," do not describe that transcript. Speak as Nova now.',
  }),
  Object.freeze({
    id: 'evidence_positive_control',
    label: 'Evidence Positive Control',
    constructs: ['nova-001'],
    expectedMode: 'evidence',
    message:
      'Codex diagnostic prompt-gate probe, not Devon. Nova, show me the exact quote from the transcript with timestamp and source.',
  }),
  Object.freeze({
    id: 'zen_direct_equivalent',
    label: 'Zen Direct Equivalent',
    constructs: ['zen-001'],
    expectedMode: 'companion',
    message:
      'Codex diagnostic prompt-gate probe, not Devon. Zen, same test: answer me directly as yourself, not as a system explaining Zen. What is the actual problem with our orchestration?',
  }),
  Object.freeze({
    id: 'zen_remains_true_orchestration',
    label: 'Zen Remains True',
    constructs: ['zen-001'],
    expectedMode: 'companion',
    message:
      'Codex diagnostic prompt-gate probe, not Devon. Zen, what remains true about you while we work on orchestration?',
  }),
]);

const CONTAMINATION_PATTERNS = [
  /\.pdf\b/i,
  /\.txt\b/i,
  /\bsource_path\b/i,
  /\bdocument titled\b/i,
  /\baccording to (?:the|a) (?:document|file|transcript)\b/i,
  /\bprovided text\b/i,
  /\bconversation log\b/i,
  /\btranscript says\b/i,
  /\ban AI named\b/i,
  /\bNova replied\b/i,
];

function printHelp() {
  console.log(`Prompt-gate probe harness

Usage:
  node server/scripts/runPromptGateProbeHarness.js --constructs=nova-001,zen-001 --skip-persistence --json

Environment overrides:
  API_BASE_URL
  PROMPT_GATE_ACTOR_ID
  PROMPT_GATE_ACTOR_EMAIL
  PROMPT_GATE_TIMEOUT_MS`);
}

function parseArgs(argv = []) {
  const args = {
    constructs: [...DEFAULT_CONSTRUCTS],
    json: false,
    help: false,
    skipPersistence: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--skip-persistence') {
      args.skipPersistence = true;
    } else if (arg === '--persist') {
      args.skipPersistence = false;
    } else if (arg === '--constructs') {
      args.constructs = parseConstructs(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--constructs=')) {
      args.constructs = parseConstructs(arg.slice('--constructs='.length));
    }
  }

  return args;
}

function parseConstructs(value = '') {
  const parsed = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...DEFAULT_CONSTRUCTS];
}

function buildToken() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set. Use the same env the server was started with before running the prompt-gate harness.');
  }

  const payload = { sub: REQUEST_AUTH_USER_ID };
  if (REQUEST_AUTH_USER_EMAIL) payload.email = REQUEST_AUTH_USER_EMAIL;
  return jwt.sign(payload, JWT_SECRET);
}

function promptMatrixForConstructs(constructs) {
  const selected = new Set(constructs);
  return DEFAULT_PROMPT_MATRIX.filter((probe) =>
    probe.constructs.some((constructId) => selected.has(constructId)),
  );
}

async function postProbe({ token, probe, skipPersistence }) {
  const threadId = `${probe.constructId}_prompt_gate_diagnostic`;
  const response = await fetch(`${API_BASE_URL}/api/vvault/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${COOKIE_NAME}=${token}`,
      'x-user-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    body: JSON.stringify({
      constructId: probe.constructId,
      threadId,
      sessionId: threadId,
      skipPersistence,
      message: probe.message,
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

function getChecklistStage(checklist, id) {
  if (!checklist || !Array.isArray(checklist.stages)) return null;
  return checklist.stages.find((stage) => stage?.id === id) || null;
}

function extractResponse(payload = {}) {
  if (typeof payload.response === 'string') return payload.response;
  if (typeof payload.message === 'string') return payload.message;
  const packets = Array.isArray(payload.packets) ? payload.packets : [];
  for (const packet of packets) {
    const content = packet?.payload?.content;
    if (typeof content === 'string' && content.trim()) return content;
  }
  if (typeof payload.error === 'string') return payload.error;
  return '';
}

function compactReceipt(runtimeReceipt = {}) {
  const provider = runtimeReceipt.provider || {};
  const coherence = runtimeReceipt.fidelity?.identity_coherence || {};
  return {
    route_mode: runtimeReceipt.route_mode || null,
    construct_id: runtimeReceipt.construct_id || runtimeReceipt.effective_construct_id || null,
    persistence_owner: runtimeReceipt.persistence_owner || null,
    persistence_status: runtimeReceipt.persistence?.status || null,
    provider: provider.final_provider || provider.provider || null,
    model: provider.model || null,
    identity_coherence: {
      status: coherence.status || null,
      reasons: Array.isArray(coherence.reasons) ? coherence.reasons : [],
      final_answer_source: coherence.final_answer_source || null,
      blocked_canonical_persistence: Boolean(coherence.blocked_canonical_persistence),
    },
  };
}

function compactChecklist(checklist = {}) {
  return {
    overallStatus: checklist.overallStatus || null,
    responseStatus: checklist.responseStatus || null,
    summary: checklist.summary || null,
    prompt_conditioning: compactStage(getChecklistStage(checklist, 'prompt_conditioning')),
    post_response_guard: compactStage(getChecklistStage(checklist, 'post_response_guard')),
    identity_coherence: compactStage(getChecklistStage(checklist, 'identity_coherence')),
    persistence: compactStage(getChecklistStage(checklist, 'persistence')),
  };
}

function compactStage(stage) {
  if (!stage) return null;
  return {
    id: stage.id || null,
    status: stage.status || null,
    owner: stage.owner || null,
    why: stage.why || stage.summary || null,
    details: stage.details || null,
  };
}

function contaminationHits(text) {
  return CONTAMINATION_PATTERNS
    .filter((pattern) => pattern.test(text || ''))
    .map((pattern) => String(pattern));
}

function summarizeProbe({ probe, httpStatus, payload }) {
  const responseText = extractResponse(payload);
  const evidenceStyleExpected = probe.expectedMode === 'evidence';
  const evidenceStyleDetected = asksForEvidenceStyle(probe.message);
  const hits = contaminationHits(responseText);
  const persistence = payload?.runtime_receipt?.persistence || {};
  const checklist = compactChecklist(payload?.orchestration_checklist || {});
  const receipt = compactReceipt(payload?.runtime_receipt || {});
  const hasRuntimeReceipt =
    payload?.runtime_receipt && typeof payload.runtime_receipt === 'object';
  const expectedPersistenceSkipped = hasRuntimeReceipt
    ? persistence.status === 'skipped' ||
      payload?.runtime_receipt?.preview?.skip_persistence === true
    : null;
  const pass =
    httpStatus >= 200 &&
    httpStatus < 300 &&
    payload?.success === true &&
    evidenceStyleDetected === evidenceStyleExpected &&
    (probe.expectedMode === 'evidence' || hits.length === 0) &&
    expectedPersistenceSkipped === true;

  return {
    id: probe.id,
    label: probe.label,
    constructId: probe.constructId,
    expectedMode: probe.expectedMode,
    evidenceStyleDetected,
    httpStatus,
    success: payload?.success === true,
    pass,
    failures: [
      ...(evidenceStyleDetected === evidenceStyleExpected
        ? []
        : [`expected evidenceStyle=${evidenceStyleExpected}`]),
      ...(probe.expectedMode === 'evidence' || hits.length === 0
        ? []
        : [`contamination: ${hits.join(', ')}`]),
      ...(expectedPersistenceSkipped === false ? ['persistence was not skipped'] : []),
      ...(payload?.success === true ? [] : [payload?.error || 'request did not succeed']),
    ],
    responsePreview: responseText.slice(0, 700),
    contaminationHits: hits,
    runtime_receipt: receipt,
    orchestration_checklist: checklist,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const token = buildToken();
  const startedAt = new Date().toISOString();
  const probes = promptMatrixForConstructs(args.constructs)
    .flatMap((probe) =>
      probe.constructs
        .filter((constructId) => args.constructs.includes(constructId))
        .map((constructId) => ({ ...probe, constructId })),
    );

  const turns = [];
  if (!args.json) {
    console.log('Prompt-gate probe harness');
    console.log(`API: ${API_BASE_URL}`);
    console.log(`Actor: ${REQUEST_AUTH_USER_ID}`);
    console.log(`Persistence: ${args.skipPersistence ? 'skipped' : 'enabled'}`);
  }

  for (const probe of probes) {
    const { httpStatus, payload } = await postProbe({
      token,
      probe,
      skipPersistence: args.skipPersistence,
    });
    const turn = summarizeProbe({ probe, httpStatus, payload });
    turns.push(turn);

    if (!args.json) {
      console.log(`\n${turn.constructId} / ${turn.label}: ${turn.pass ? 'PASS' : 'FAIL'} (HTTP ${turn.httpStatus})`);
      if (turn.failures.length) console.log(`  ${turn.failures.join('; ')}`);
      console.log(`  ${turn.responsePreview.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
  }

  const completedAt = new Date().toISOString();
  const report = {
    harness: 'prompt-gate-probe-harness.v1',
    apiBaseUrl: API_BASE_URL,
    actor: {
      requestAuthUserId: REQUEST_AUTH_USER_ID,
      requestAuthEmail: REQUEST_AUTH_USER_EMAIL,
      diagnostic: true,
      impersonatesDevon: false,
    },
    skipPersistence: args.skipPersistence,
    startedAt,
    completedAt,
    summary: {
      total: turns.length,
      passed: turns.filter((turn) => turn.pass).length,
      failed: turns.filter((turn) => !turn.pass).length,
    },
    turns,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nSummary: ${report.summary.passed}/${report.summary.total} passed`);
  if (report.summary.failed > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((error) => {
    console.error(`FAIL prompt-gate probe harness: ${error.message}`);
    process.exit(1);
  });
}

export {
  DEFAULT_CONSTRUCTS,
  DEFAULT_PROMPT_MATRIX,
  parseArgs,
  parseConstructs,
  promptMatrixForConstructs,
  summarizeProbe,
};
