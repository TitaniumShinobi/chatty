import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildAssistantTurnId,
  buildConstructRevision,
  buildRuntimeTailHash,
  normalizeRuntimeTurnState,
} from './runtimeTurnState.js';
import { readLatestRuntimeTurnState } from '../../vvaultConnector/runtimeTurnStateStore.js';
import { writeTranscript as defaultWriteTranscript } from '../../vvaultConnector/writeTranscript.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

export const CODEX_CONTINUITY_SEED_FILES = Object.freeze([
  'server/lib/codexContinuitySeed.js',
  'server/scripts/seedCodexContinuity.js',
  'server/tests/codex-continuity-seed.test.js',
]);

export const CODEX_CONTINUITY_SEED_COMMANDS = Object.freeze([
  'node --test server/tests/runtime-turn-state.test.js',
  'node --test server/tests/runtime-turn-state-store.test.js',
  'node --test server/tests/codex-continuity-seed.test.js',
  'node server/scripts/seedCodexContinuity.js',
]);

export const CODEX_CONTINUITY_SEED_DEFAULTS = Object.freeze({
  constructId: 'zen-001',
  sessionId: 'zen-001_chat_with_zen-001',
  constructName: 'Zen',
  ownerEmail: process.env.CANONICAL_OWNER_EMAIL || '',
  frontendBaseUrl: 'http://localhost:5173',
  activeGoal: 'Move from this Codex seat into Chatty without losing Zen, thread, active work, or open loop.',
  openLoop: 'Codex-to-Chatty continuity is not finished until the bridge seed is real and continue resumes the same work.',
  nextStep: 'Open Chatty with the resume URL and use continue to validate against the canonical thread tail.',
  awaiting: 'user',
});

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeFrontendBaseUrl(value) {
  const normalized = normalizeString(value) || CODEX_CONTINUITY_SEED_DEFAULTS.frontendBaseUrl;
  return normalized.replace(/\/+$/, '');
}

function normalizeContinuitySeq(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

function buildUserContext(user) {
  return {
    userId: user.user_id || user.userId || user.id || null,
    userEmail: user.email || null,
    supabaseUserId: user.vvault_user_id || user.supabaseUserId || user.user_id || null,
  };
}

function selectCanonicalUserByEmail(users = {}, email) {
  const normalizedEmail = normalizeEmail(email);
  const matches = Object.values(users).filter(
    (user) => normalizeEmail(user?.email) === normalizedEmail,
  );
  if (matches.length === 0) {
    return null;
  }
  return matches.find((user) => user?.user_id === user?.vvault_user_id) || matches[0];
}

export async function readCanonicalSeedUser({
  usersPath = path.join(REPO_ROOT, 'users.json'),
  ownerEmail = CODEX_CONTINUITY_SEED_DEFAULTS.ownerEmail,
} = {}) {
  const raw = await fs.readFile(usersPath, 'utf8');
  const registry = JSON.parse(raw);
  const user = selectCanonicalUserByEmail(registry?.users || {}, ownerEmail);
  if (!user) {
    throw new Error(`No canonical Chatty user found for ${ownerEmail}`);
  }
  return user;
}

export function buildCodexContinuityRuntimeTurnState({
  previousState = null,
  now = new Date().toISOString(),
  constructId = CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  sessionId = CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
  activeGoal = CODEX_CONTINUITY_SEED_DEFAULTS.activeGoal,
  openLoop = CODEX_CONTINUITY_SEED_DEFAULTS.openLoop,
  nextStep = CODEX_CONTINUITY_SEED_DEFAULTS.nextStep,
  awaiting = CODEX_CONTINUITY_SEED_DEFAULTS.awaiting,
} = {}) {
  const prior = previousState
    ? normalizeRuntimeTurnState(previousState, { sessionId, constructId })
    : null;
  const continuitySeq = normalizeContinuitySeq(prior?.continuitySeq) + 1;
  const constructRevision = buildConstructRevision({
    constructId,
    revisionHint: prior?.constructRevision,
  });
  const assistantTurnId = buildAssistantTurnId({
    sessionId,
    constructId,
    continuitySeq,
    now,
  });
  const tailHash = buildRuntimeTailHash({
    sessionId,
    constructId,
    constructRevision,
    continuitySeq,
    assistantTurnId,
  });

  return normalizeRuntimeTurnState({
    sessionId,
    constructId,
    constructRevision,
    updatedAt: now,
    continuitySeq,
    assistantTurnId,
    tailHash,
    hydrationTruth: 'full',
    activeGoal,
    openLoop,
    nextStep,
    awaiting,
    activeMode: 'ordinary',
    lastTurnType: 'ordinary',
  }, { sessionId, constructId });
}

export function buildCodexResumeToken(runtimeTurnState, {
  issuedAt = runtimeTurnState?.updatedAt || new Date().toISOString(),
  threadId = CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
} = {}) {
  const state = normalizeRuntimeTurnState(runtimeTurnState, {
    sessionId: threadId,
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  });
  return {
    v: 1,
    sourceSeat: 'codex',
    constructId: state.constructId,
    constructRevision: state.constructRevision,
    threadId,
    continuitySeq: state.continuitySeq,
    assistantTurnId: state.assistantTurnId,
    tailHash: state.tailHash,
    hydrationTruth: 'full',
    issuedAt,
  };
}

export function isCodexContinuitySeedState(runtimeTurnState, {
  constructId = CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  sessionId = CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
} = {}) {
  if (!runtimeTurnState || typeof runtimeTurnState !== 'object') return false;
  const state = normalizeRuntimeTurnState(runtimeTurnState, { sessionId, constructId });
  return (
    state.sessionId === sessionId &&
    state.constructId === constructId &&
    state.activeGoal === CODEX_CONTINUITY_SEED_DEFAULTS.activeGoal &&
    state.openLoop === CODEX_CONTINUITY_SEED_DEFAULTS.openLoop &&
    state.nextStep === CODEX_CONTINUITY_SEED_DEFAULTS.nextStep &&
    state.awaiting === CODEX_CONTINUITY_SEED_DEFAULTS.awaiting &&
    state.hydrationTruth === 'full' &&
    Boolean(state.assistantTurnId) &&
    Boolean(state.tailHash)
  );
}

export function encodeResumeToken(token) {
  return Buffer.from(JSON.stringify(token), 'utf8').toString('base64url');
}

export function buildChattyResumeUrl(token, {
  frontendBaseUrl = CODEX_CONTINUITY_SEED_DEFAULTS.frontendBaseUrl,
} = {}) {
  const encoded = encodeResumeToken(token);
  return `${normalizeFrontendBaseUrl(frontendBaseUrl)}/app/chat/${encodeURIComponent(token.threadId)}?resume=${encoded}`;
}

export function buildSeedWriteParams({
  user,
  runtimeTurnState,
  timestamp = runtimeTurnState.updatedAt || new Date().toISOString(),
  constructId = CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  sessionId = CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
  constructName = CODEX_CONTINUITY_SEED_DEFAULTS.constructName,
} = {}) {
  const context = buildUserContext(user || {});
  return {
    userId: context.userId,
    userEmail: context.userEmail,
    supabaseUserId: context.supabaseUserId,
    sessionId,
    timestamp,
    role: 'assistant',
    content: CODEX_CONTINUITY_SEED_DEFAULTS.nextStep,
    title: constructName,
    metadata: {
      constructId,
      constructName,
      constructCallsign: constructId,
      runtimeTurnState,
      codexContinuitySeed: {
        sourceSeat: 'codex',
        bounded: true,
      },
    },
    constructId,
    constructName,
    constructCallsign: constructId,
  };
}

export async function seedCodexContinuity({
  now = new Date().toISOString(),
  usersPath = path.join(REPO_ROOT, 'users.json'),
  ownerEmail = CODEX_CONTINUITY_SEED_DEFAULTS.ownerEmail,
  frontendBaseUrl = process.env.CHATTY_FRONTEND_URL || CODEX_CONTINUITY_SEED_DEFAULTS.frontendBaseUrl,
  readLatestRuntimeTurnStateImpl = readLatestRuntimeTurnState,
  writeTranscriptImpl = defaultWriteTranscript,
} = {}) {
  const user = await readCanonicalSeedUser({ usersPath, ownerEmail });
  const userContext = buildUserContext(user);
  const previous = await readLatestRuntimeTurnStateImpl(userContext, {
    sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  });
  const previousRuntimeTurnState = previous?.runtimeTurnState || null;
  const alreadySeeded = isCodexContinuitySeedState(previousRuntimeTurnState);
  const runtimeTurnState = alreadySeeded
    ? normalizeRuntimeTurnState(previousRuntimeTurnState, {
        sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
        constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
      })
    : buildCodexContinuityRuntimeTurnState({
        previousState: previousRuntimeTurnState,
        now,
      });
  const writeResult = alreadySeeded
    ? {
        success: true,
        source: previous?.source || 'runtimeTurnState',
        action: 'already_seeded',
      }
    : await writeTranscriptImpl(buildSeedWriteParams({
        user,
        runtimeTurnState,
        timestamp: now,
      }));
  const resumeToken = buildCodexResumeToken(runtimeTurnState, {
    issuedAt: runtimeTurnState.updatedAt || now,
    threadId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
  });
  const chattyResumeUrl = buildChattyResumeUrl(resumeToken, { frontendBaseUrl });

  return {
    filesChanged: [...CODEX_CONTINUITY_SEED_FILES],
    writePathUsed: 'writeTranscript(metadata.runtimeTurnState) -> assistant message metadata on zen-001_chat_with_zen-001',
    seededRuntimeTurnState: runtimeTurnState,
    resumeTokenJson: resumeToken,
    chattyResumeUrl,
    verificationCommandsRun: [...CODEX_CONTINUITY_SEED_COMMANDS],
    writeResult,
  };
}
