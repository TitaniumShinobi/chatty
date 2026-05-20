import crypto from 'node:crypto';
import fsNode from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { readConversations } from '../../vvaultConnector/readConversations.js';
import { readLatestRuntimeTurnState } from '../../vvaultConnector/runtimeTurnStateStore.js';
import { writeTranscript as defaultWriteTranscript } from '../../vvaultConnector/writeTranscript.js';
import {
  CODEX_CONTINUITY_SEED_DEFAULTS,
  buildChattyResumeUrl,
  buildCodexResumeToken,
  readCanonicalSeedUser,
} from './codexContinuitySeed.js';
import { computeNextRuntimeTurnState, normalizeRuntimeTurnState } from './runtimeTurnState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

export const CODEX_CONTINUITY_RELAY_FILES = Object.freeze([
  'server/lib/codexContinuityRelay.js',
  'server/lib/codexContinuityWatch.js',
  'server/tests/codex-continuity-relay.test.js',
  'server/tests/codex-continuity-watch.test.js',
  'src/cli/chatty-cli.ts',
]);

export const CODEX_CONTINUITY_RELAY_COMMANDS = Object.freeze([
  'node --test server/tests/codex-continuity-seed.test.js',
  'node --test server/tests/codex-continuity-relay.test.js',
  'node --test server/tests/codex-continuity-watch.test.js',
  'node --test server/tests/chatty-cli-orchestration-proof.test.js',
  './bin/chatty-cli handoff --latest-codex',
  './bin/chatty-cli handoff --latest-codex --watch --poll-seconds 2',
  './bin/chatty-cli handoff --from-file /absolute/path/to/export.txt',
  'printf \'[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]\' | ./bin/chatty-cli handoff --stdin-json',
  'node server/scripts/runCodexContinuityProof.js',
]);

export const CODEX_CONTINUITY_PROOF_TURNS = Object.freeze([
  {
    role: 'user',
    content:
      'We are handing this Codex thread into Chatty. Keep the same active goal and leave stale-seat verification as the next step.',
  },
  {
    role: 'assistant',
    content:
      'Understood. I am carrying this exact Codex handoff into Chatty and still need to verify stale-seat rejection after the continuation succeeds.',
  },
]);

const MESSAGE_COUNT_RE = /^\d+\s+previous messages$/i;
const UI_CHROME_LINE_RE = /^(?:No tasks in progress|Show more|Web preview|Website|Terminal|Linear|Gmail|Teams|Hugging Face|Vercel|Box|GitHub|Google Drive|Cloudflare|Build Web Apps|Undo|Review|View all changes|Plan|Open|Auto context)$/i;
const CHANGE_SUMMARY_RE = /^\d+\s+files?\s+changed$/i;
const CONSOLE_NOISE_RE =
  /(?:Download the React DevTools|Failed to load resource|react-dom_client\.js|:\d+\/.*Failed to load resource)/i;
const SHORT_TITLE_RE = /^[A-Z][\w\s/&:+-]{1,79}$/;
const CODEX_CONTEXT_LIMIT_RE =
  /^Codex ran out of room in the model's context window\./i;
const USER_MARKER_RE = /^(?:#{1,6}\s*)?(?:U|USER)(?:\s*\([^)]*\))?$/i;
const ASSISTANT_MARKER_RE = /^(?:#{1,6}\s*)?(?:AI|ASSISTANT)(?:\s*\([^)]*\))?$/i;
const ASSISTANTISH_START_RE =
  /^(?:I\s(?:checked|read|updated|fixed|sent|verified|picked|am|can|did|just)|Here(?:’|')?s|The\s|That\s|Possible reasons|Added\b|Updated\b|Removed\b|Renamed\b|Fixed\b|Quick\b|Live verification\b|Verification\b|Current\b|Working now\b|Got it\b|No pause\b|Two parts\b|Concrete approach\b|What VVAULT is for\b|If you want\b|You can\b)/i;
const DEFAULT_CODEX_SESSIONS_ROOT = path.join(os.homedir(), '.codex', 'sessions');
const CODEX_RELAY_SCHEMA_VERSION = 1;
const STRICT_CANONICAL_READ_OPTIONS = Object.freeze({ allowLocalFallback: false });
const HIDDEN_CONTEXT_PREFIX_RE =
  /^(?:<environment_context>|<system>|<developer>|<collaboration_mode>|<apps_instructions>|<skills_instructions>|<plugins_instructions>|<subagent_notification>|<proposed_plan>|<summary>|<heartbeat>|<oai-mem-citation>|========= MEMORY_SUMMARY BEGINS =========)/i;
const HIDDEN_CONTEXT_MAX_CHARS = 8000;
const HIDDEN_CONTEXT_BLOCK_RE =
  /(?:<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>|(?:^|\n)\s*<heartbeat>[\s\S]*?<\/heartbeat>\s*)/gi;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildUserContext(user = {}) {
  return {
    userId: user.user_id || user.userId || user.id || null,
    userEmail: user.email || null,
    supabaseUserId: user.vvault_user_id || user.supabaseUserId || user.user_id || null,
  };
}

function normalizeTurnRole(role) {
  const normalized = normalizeString(role).toLowerCase();
  if (normalized === 'assistant') return 'assistant';
  if (normalized === 'user') return 'user';
  return null;
}

function isDirectoryEntry(entry) {
  return entry?.isDirectory?.() === true;
}

function isFileEntry(entry) {
  return entry?.isFile?.() === true;
}

async function readDirSafe(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function buildRelayBatchId(now) {
  return `codex-relay-${Date.parse(now) || Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function buildRelayTurnDigest({
  sourceType,
  sourceIdentity,
  turnIndex,
  role,
  content,
}) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        sourceType,
        sourceIdentity,
        turnIndex,
        role,
        content,
      }),
    )
    .digest('hex');
}

function normalizeTranscriptBlock(rawBlock) {
  const block = String(rawBlock || '').replace(/\r\n/g, '\n').trim();
  if (!block) return null;

  let lines = block.split('\n');
  while (lines.length > 0 && !normalizeString(lines[0])) {
    lines.shift();
  }
  while (lines.length > 0 && MESSAGE_COUNT_RE.test(normalizeString(lines[0]))) {
    lines.shift();
  }
  while (lines.length > 0 && UI_CHROME_LINE_RE.test(normalizeString(lines[0]))) {
    lines.shift();
  }
  if (lines.length > 1 && SHORT_TITLE_RE.test(normalizeString(lines[0])) && !/[.?!:]$/.test(normalizeString(lines[0]))) {
    lines.shift();
  }

  const cleaned = lines.join('\n').trim();
  if (!cleaned) return null;

  const cleanedLines = cleaned
    .split('\n')
    .map((line) => normalizeString(line))
    .filter(Boolean);
  if (cleanedLines.length === 0) return null;
  if (cleanedLines.every((line) => CODEX_CONTEXT_LIMIT_RE.test(line))) {
    return null;
  }
  if (cleanedLines.every((line) => UI_CHROME_LINE_RE.test(line) || CHANGE_SUMMARY_RE.test(line))) {
    return null;
  }
  if (cleanedLines.every((line) => CONSOLE_NOISE_RE.test(line))) {
    return null;
  }

  return cleaned;
}

function buildFileParseError(message, parseReport = {}) {
  const error = new Error(message);
  error.parseReport = parseReport;
  return error;
}

function resolveRoleMarker(line) {
  if (USER_MARKER_RE.test(line)) return 'user';
  if (ASSISTANT_MARKER_RE.test(line)) return 'assistant';
  return null;
}

function buildRoleMarkerTurns(rawText) {
  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
  const turns = [];
  let activeRole = null;
  let buffer = [];
  let sourceTurnIndex = 0;

  const flush = () => {
    if (!activeRole) {
      buffer = [];
      return;
    }
    const content = buffer.join('\n').trim();
    if (content) {
      turns.push({
        role: activeRole,
        content,
        sourceTurnIndex,
      });
      sourceTurnIndex += 1;
    }
    activeRole = null;
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = normalizeString(rawLine);
    const markerRole = resolveRoleMarker(line);
    if (markerRole) {
      flush();
      activeRole = markerRole;
      continue;
    }
    if (
      activeRole &&
      (UI_CHROME_LINE_RE.test(line) ||
        CHANGE_SUMMARY_RE.test(line) ||
        CODEX_CONTEXT_LIMIT_RE.test(line) ||
        CONSOLE_NOISE_RE.test(line))
    ) {
      flush();
      continue;
    }
    if (!activeRole) {
      continue;
    }
    buffer.push(rawLine);
  }
  flush();

  if (turns.length < 2) {
    return [];
  }
  return turns;
}

function looksLikeUserPrompt(text) {
  const normalized = normalizeString(text);
  if (!normalized) return false;
  if (CODEX_CONTEXT_LIMIT_RE.test(normalized)) return false;
  if (UI_CHROME_LINE_RE.test(normalized)) return false;
  if (CHANGE_SUMMARY_RE.test(normalized)) return false;
  if (CONSOLE_NOISE_RE.test(normalized)) return false;
  if (resolveRoleMarker(normalized)) return false;

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  if (lines.length > 6) return false;
  if (normalized.length > 700) return false;
  if (ASSISTANTISH_START_RE.test(lines[0])) return false;
  if (/^(?:[-*]\s|\d+\.\s)/.test(lines[0])) return false;
  if (normalized.includes('If you want, I can')) return false;
  if (normalized.includes('1 file changed')) return false;
  if (normalized.includes('View all changes')) return false;

  return true;
}

function normalizeParagraphs(rawText) {
  return String(rawText || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => normalizeTranscriptBlock(paragraph))
    .filter(Boolean);
}

function extractTerminalPairFromParagraphs(rawText, parseReport) {
  const paragraphs = normalizeParagraphs(rawText);
  parseReport.paragraphCount = paragraphs.length;

  while (paragraphs.length > 0) {
    const tail = paragraphs[paragraphs.length - 1];
    if (
      UI_CHROME_LINE_RE.test(tail) ||
      CHANGE_SUMMARY_RE.test(tail) ||
      CODEX_CONTEXT_LIMIT_RE.test(tail)
    ) {
      paragraphs.pop();
      continue;
    }
    break;
  }

  if (paragraphs.length < 2) {
    throw buildFileParseError('Codex export must contain a terminal user/assistant pair.', parseReport);
  }

  const assistantParts = [];
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const paragraph = paragraphs[index];
    if (assistantParts.length > 0 && looksLikeUserPrompt(paragraph)) {
      return [
        {
          role: 'user',
          content: paragraph,
          sourceTurnIndex: index,
        },
        {
          role: 'assistant',
          content: assistantParts.reverse().join('\n\n').trim(),
          sourceTurnIndex: paragraphs.length - 1,
        },
      ];
    }
    assistantParts.push(paragraph);
  }

  throw buildFileParseError(
    'Codex export terminal pair is ambiguous after chrome removal; could not identify the final user prompt.',
    parseReport,
  );
}

function extractMessageTextFromParts(content, role) {
  if (!Array.isArray(content)) return '';
  const parts = content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const partType = normalizeString(part.type).toLowerCase();
      if (role === 'user' && partType !== 'input_text') return '';
      if (role === 'assistant' && partType !== 'output_text') return '';
      if (typeof part.text === 'string') return part.text;
      return '';
    })
    .filter((text) => typeof text === 'string' && text.trim());
  return parts.join('\n\n').trim();
}

function shouldIgnoreHiddenCodexText(text) {
  const normalized = normalizeString(text);
  if (!normalized) return true;
  if (HIDDEN_CONTEXT_PREFIX_RE.test(normalized)) return true;
  if (
    normalized.length > HIDDEN_CONTEXT_MAX_CHARS &&
    /<(?:environment_context|system|developer|apps_instructions|skills_instructions|plugins_instructions)\b/i.test(normalized)
  ) {
    return true;
  }
  return false;
}

function sanitizeCodexMessageText(text) {
  const normalized = normalizeString(text);
  if (shouldIgnoreHiddenCodexText(normalized)) return null;
  const stripped = normalized.replace(HIDDEN_CONTEXT_BLOCK_RE, '').trim();
  if (shouldIgnoreHiddenCodexText(stripped)) return null;
  return stripped;
}

function findLatestUserAssistantPair(messages = []) {
  for (let assistantIndex = messages.length - 1; assistantIndex >= 0; assistantIndex -= 1) {
    const assistantMessage = messages[assistantIndex];
    if (assistantMessage?.role !== 'assistant') continue;
    for (let userIndex = assistantIndex - 1; userIndex >= 0; userIndex -= 1) {
      const userMessage = messages[userIndex];
      if (userMessage?.role !== 'user') continue;
      return [userMessage, assistantMessage];
    }
  }
  return null;
}

async function collectRolloutFiles(rootPath, { limit = Number.POSITIVE_INFINITY } = {}) {
  const files = [];
  const effectiveLimit =
    Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
  const yearEntries = (await readDirSafe(rootPath))
    .filter(isDirectoryEntry)
    .sort((a, b) => b.name.localeCompare(a.name));

  for (const yearEntry of yearEntries) {
    const yearPath = path.join(rootPath, yearEntry.name);
    const monthEntries = (await readDirSafe(yearPath))
      .filter(isDirectoryEntry)
      .sort((a, b) => b.name.localeCompare(a.name));

    for (const monthEntry of monthEntries) {
      const monthPath = path.join(yearPath, monthEntry.name);
      const dayEntries = (await readDirSafe(monthPath))
        .filter(isDirectoryEntry)
        .sort((a, b) => b.name.localeCompare(a.name));

      for (const dayEntry of dayEntries) {
        const dayPath = path.join(monthPath, dayEntry.name);
        const rolloutEntries = (await readDirSafe(dayPath))
          .filter((entry) => isFileEntry(entry) && /^rollout-.*\.jsonl$/i.test(entry.name))
          .sort((a, b) => b.name.localeCompare(a.name));

        for (const rolloutEntry of rolloutEntries) {
          const rolloutPath = path.join(dayPath, rolloutEntry.name);
          let mtimeMs = 0;
          try {
            const stat = await fs.stat(rolloutPath);
            mtimeMs = Number.isFinite(stat?.mtimeMs) ? stat.mtimeMs : 0;
          } catch {
            mtimeMs = 0;
          }
          files.push({
            path: rolloutPath,
            mtimeMs,
          });
        }
      }
    }
  }

  const sortedFiles = files.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) {
      return right.mtimeMs - left.mtimeMs;
    }
    return right.path.localeCompare(left.path);
  });

  return effectiveLimit ? sortedFiles.slice(0, effectiveLimit) : sortedFiles;
}

function createCodexRolloutParseState({ sessionPath = null } = {}) {
  return {
    sessionPath,
    messages: [],
    sessionMeta: null,
    skippedParseLines: 0,
    skippedHiddenContextMessages: 0,
    skippedNonFinalAssistantMessages: 0,
    lineCount: 0,
  };
}

function consumeCodexRolloutJsonlLine(state, line, index) {
  if (!line) return;
  state.lineCount += 1;
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    state.skippedParseLines += 1;
    return;
  }

  if (record?.type === 'session_meta' && record?.payload && !state.sessionMeta) {
    state.sessionMeta = record.payload;
    return;
  }

  if (record?.type !== 'response_item' || record?.payload?.type !== 'message') {
    return;
  }

  const role = normalizeTurnRole(record.payload.role);
  if (!role) return;

  const rawText = extractMessageTextFromParts(record.payload.content, role);
  if (!rawText) return;
  const text = sanitizeCodexMessageText(rawText);
  if (!text) {
    state.skippedHiddenContextMessages += 1;
    return;
  }

  state.messages.push({
    role,
    content: text,
    ts: normalizeString(record.timestamp) || null,
    phase: normalizeString(record.payload.phase) || null,
    sourceTurnIndex: index,
  });
}

function finishCodexRolloutParseState(state, { requireTerminalPair = true } = {}) {
  const messages = state.messages;
  const sessionMeta = state.sessionMeta;
  const pair = findLatestUserAssistantPair(messages);
  const latestMessage = messages.at(-1) || null;
  const parseReport = {
    sourceType: 'latest-codex',
    sessionPath: state.sessionPath,
    sessionId: sessionMeta?.id || null,
    cwd: sessionMeta?.cwd || null,
    isSubagentSession: Boolean(sessionMeta?.source?.subagent),
    messageCount: messages.length,
    skippedParseLines: state.skippedParseLines,
    skippedHiddenContextMessages: state.skippedHiddenContextMessages,
    skippedNonFinalAssistantMessages: state.skippedNonFinalAssistantMessages,
    strategy: pair ? 'rollout-jsonl-terminal-pair' : 'rollout-jsonl-pending-tail',
    latestAssistantTimestamp: pair?.[1]?.ts || null,
    latestMessageRole: latestMessage?.role || null,
    latestMessageTimestamp: latestMessage?.ts || null,
  };

  if (!pair) {
    if (!requireTerminalPair) {
      return {
        conversationTurns: messages,
        turns: [],
        parseReport,
      };
    }
    const error = new Error('Codex rollout does not contain a terminal user/assistant pair.');
    error.parseReport = parseReport;
    throw error;
  }

  return {
    conversationTurns: messages,
    turns: pair,
    parseReport,
  };
}

export function parseCodexRolloutJsonl(
  rawText,
  { sessionPath = null, requireTerminalPair = true } = {},
) {
  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n').filter(Boolean);
  const state = createCodexRolloutParseState({ sessionPath });

  for (let index = 0; index < lines.length; index += 1) {
    consumeCodexRolloutJsonlLine(state, lines[index], index);
  }

  return finishCodexRolloutParseState(state, { requireTerminalPair });
}

export async function parseCodexRolloutJsonlFile(sessionPath, { requireTerminalPair = true } = {}) {
  const state = createCodexRolloutParseState({ sessionPath });
  const stream = fsNode.createReadStream(sessionPath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let index = 0;
  for await (const line of rl) {
    consumeCodexRolloutJsonlLine(state, line, index);
    index += 1;
  }
  return finishCodexRolloutParseState(state, { requireTerminalPair });
}

export async function readLatestCodexTail({
  codexSessionsRoot = process.env.CODEX_SESSIONS_ROOT || DEFAULT_CODEX_SESSIONS_ROOT,
  preferredCwd = process.cwd(),
} = {}) {
  const rolloutFiles = await collectRolloutFiles(codexSessionsRoot);
  if (rolloutFiles.length === 0) {
    throw new Error(`No Codex rollout files found under ${codexSessionsRoot}.`);
  }

  let bestPreferredCandidate = null;
  let bestFallbackCandidate = null;
  let fallbackError = null;

  function scoreCandidate(parsed, file) {
    const latestMessageTimestampMs = Number.isFinite(Date.parse(parsed?.parseReport?.latestMessageTimestamp || ''))
      ? Date.parse(parsed.parseReport.latestMessageTimestamp)
      : 0;
    return latestMessageTimestampMs || file.mtimeMs || 0;
  }

  for (const file of rolloutFiles) {
    const rawText = await fs.readFile(file.path, 'utf8').catch(() => null);
    if (!rawText) continue;

    try {
      const parsed = parseCodexRolloutJsonl(rawText, {
        sessionPath: file.path,
        requireTerminalPair: false,
      });
      if (!Array.isArray(parsed.conversationTurns) || parsed.conversationTurns.length === 0) {
        continue;
      }
      if (parsed.parseReport.isSubagentSession) {
        continue;
      }
      const candidate = {
        parsed,
        score: scoreCandidate(parsed, file),
      };
      if (parsed.parseReport.cwd && parsed.parseReport.cwd === preferredCwd) {
        if (!bestPreferredCandidate || candidate.score > bestPreferredCandidate.score) {
          bestPreferredCandidate = candidate;
        }
        continue;
      }
      if (!bestFallbackCandidate || candidate.score > bestFallbackCandidate.score) {
        bestFallbackCandidate = candidate;
      }
    } catch (error) {
      if (!fallbackError) {
        fallbackError = error;
      }
    }
  }

  if (bestPreferredCandidate) {
    return bestPreferredCandidate.parsed;
  }

  if (bestFallbackCandidate) {
    return bestFallbackCandidate.parsed;
  }

  throw fallbackError || new Error(`No usable Codex rollout tail found under ${codexSessionsRoot}.`);
}

export function parseCodexExportText(rawText, { sourcePath = null } = {}) {
  const rawBlocks = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{3,}/);
  const retainedBlocks = [];
  let ignoredBlockCount = 0;

  for (const rawBlock of rawBlocks) {
    const cleaned = normalizeTranscriptBlock(rawBlock);
    if (!cleaned) {
      ignoredBlockCount += 1;
      continue;
    }
    retainedBlocks.push(cleaned);
  }

  const parseReport = {
    sourceType: 'file',
    sourcePath,
    rawBlockCount: rawBlocks.length,
    retainedBlockCount: retainedBlocks.length,
    ignoredBlockCount,
  };

  const markerTurns = buildRoleMarkerTurns(rawText);
  const markerPairs = [];
  for (let index = 0; index < markerTurns.length - 1; index += 1) {
    if (
      markerTurns[index].role === 'user' &&
      markerTurns[index + 1].role === 'assistant'
    ) {
      markerPairs.push([markerTurns[index], markerTurns[index + 1]]);
    }
  }
  if (markerPairs.length > 0) {
    const turns = markerPairs[markerPairs.length - 1];
    return {
      turns,
      parseReport: {
        ...parseReport,
        strategy: 'role-markers',
        turnCount: turns.length,
      },
    };
  }

  const turns = extractTerminalPairFromParagraphs(rawText, parseReport);

  return {
    turns,
    parseReport: {
      ...parseReport,
      strategy: 'terminal-paragraph-pair',
      turnCount: turns.length,
    },
  };
}

export function parseCodexJsonTail(rawValue) {
  const parsed =
    typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
  if (!Array.isArray(parsed)) {
    const error = new Error('stdin JSON tail must be an array of { role, content, ts? }.');
    error.parseReport = { sourceType: 'stdin-json', turnCount: 0 };
    throw error;
  }

  const turns = parsed.map((turn, index) => {
    const role = normalizeTurnRole(turn?.role);
    const content = typeof turn?.content === 'string' ? turn.content : null;
    if (!role || !content || !content.trim()) {
      const error = new Error(`stdin JSON tail turn ${index} must include role=user|assistant and non-empty content.`);
      error.parseReport = { sourceType: 'stdin-json', turnCount: index };
      throw error;
    }
    return {
      role,
      content,
      ts: normalizeString(turn?.ts) || null,
      sourceTurnIndex: index,
    };
  });

  validateRelayTurns(turns, { sourceType: 'stdin-json' });
  return {
    turns,
    parseReport: {
      sourceType: 'stdin-json',
      turnCount: turns.length,
    },
  };
}

function validateRelayTurns(turns, { sourceType = 'unknown' } = {}) {
  if (!Array.isArray(turns) || turns.length < 2) {
    const error = new Error(`${sourceType} handoff must contain at least one user/assistant pair.`);
    error.parseReport = { sourceType, turnCount: Array.isArray(turns) ? turns.length : 0 };
    throw error;
  }
  if (turns[0].role !== 'user') {
    const error = new Error(`${sourceType} handoff must start with a user turn.`);
    error.parseReport = { sourceType, firstRole: turns[0]?.role || null };
    throw error;
  }
  if (turns[turns.length - 1].role !== 'assistant') {
    const error = new Error(`${sourceType} handoff must end with an assistant turn.`);
    error.parseReport = { sourceType, lastRole: turns[turns.length - 1]?.role || null };
    throw error;
  }
  for (let index = 1; index < turns.length; index += 1) {
    if (turns[index].role === turns[index - 1].role) {
      const error = new Error(`${sourceType} handoff turns must alternate user/assistant.`);
      error.parseReport = { sourceType, turnCount: turns.length, failedIndex: index };
      throw error;
    }
  }
}

function selectTurnsForRelay(parsedTurns, { sourceType }) {
  if (sourceType === 'file') {
    return parsedTurns.slice(-2);
  }
  return parsedTurns.slice();
}

function collectCompleteUserAssistantPairs(turns = []) {
  const pairs = [];
  let pendingUser = null;

  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') {
      continue;
    }
    if (turn.role === 'user') {
      pendingUser = turn;
      continue;
    }
    if (turn.role === 'assistant' && pendingUser) {
      pairs.push([pendingUser, turn]);
      pendingUser = null;
    }
  }

  return pairs;
}

export function selectBootstrapRelayTurns(conversationTurns = [], { pairLimit = 3 } = {}) {
  const completePairs = collectCompleteUserAssistantPairs(conversationTurns);
  if (completePairs.length === 0) {
    return [];
  }
  return completePairs.slice(-Math.max(1, pairLimit)).flat();
}

export function selectIncrementalRelayTurns(
  conversationTurns = [],
  { afterSourceTurnIndex = null } = {},
) {
  const unseenTurns =
    typeof afterSourceTurnIndex === 'number'
      ? conversationTurns.filter((turn) => turn.sourceTurnIndex > afterSourceTurnIndex)
      : conversationTurns.slice();
  return collectCompleteUserAssistantPairs(unseenTurns).flat();
}

function findConversationBySessionId(conversations = [], sessionId) {
  return (conversations || []).find((conversation) => conversation?.sessionId === sessionId) || null;
}

function assertCanonicalRelayConversation(conversation, { stage = 'readback' } = {}) {
  if (!conversation) {
    throw new Error(`Codex relay ${stage} did not return the singleton canonical Zen thread.`);
  }
  if (
    conversation.localFallback === true ||
    conversation.persistenceSource === 'local-deferred' ||
    conversation.persistenceSource === 'local-fallback'
  ) {
    throw new Error(`Codex relay ${stage} resolved local fallback instead of canonical VVAULT truth.`);
  }
  return conversation;
}

function assertCanonicalRelayWriteResult(result, { role } = {}) {
  if (!result || result.success === false) {
    throw new Error(`Codex relay canonical ${role || 'turn'} write failed.`);
  }
  if (result.source === 'local-fallback' || result.source === 'local-deferred') {
    throw new Error(`Codex relay canonical ${role || 'turn'} write resolved local fallback.`);
  }
  return result;
}

function assertCanonicalRelayReadback(conversation, {
  incomingTurns = [],
  latestRuntimeTurnState = null,
} = {}) {
  assertCanonicalRelayConversation(conversation, { stage: 'readback' });
  const sequence = findDigestSequence(conversation.messages || [], incomingTurns);
  if (!sequence) {
    throw new Error('Codex relay readback did not include the just-written turn digest sequence.');
  }
  const latestAssistantMessage = resolveLatestAssistantMessage(sequence.messages);
  if (!latestAssistantMessage?.metadata?.runtimeTurnState) {
    throw new Error('Codex relay readback tail is missing assistant runtimeTurnState metadata.');
  }
  const readbackRuntimeTurnState = normalizeRuntimeTurnState(
    latestAssistantMessage.metadata.runtimeTurnState,
    {
      sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
      constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
      hydrationTruth: 'full',
      assistantTailContent: latestAssistantMessage.content,
    },
  );
  if (
    !latestRuntimeTurnState ||
    readbackRuntimeTurnState.assistantTurnId !== latestRuntimeTurnState.assistantTurnId ||
    readbackRuntimeTurnState.continuitySeq !== latestRuntimeTurnState.continuitySeq ||
    readbackRuntimeTurnState.tailHash !== latestRuntimeTurnState.tailHash
  ) {
    throw new Error('Codex relay readback tail runtimeTurnState does not match the imported assistant tail.');
  }
  return {
    sequence,
    latestAssistantMessage,
    runtimeTurnState: readbackRuntimeTurnState,
  };
}

function findDigestSequence(messages = [], incomingTurns = []) {
  const digests = incomingTurns.map((turn) => turn.relayTurnDigest);
  if (digests.length === 0) return null;

  let latestMatch = null;
  for (let start = 0; start <= messages.length - digests.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < digests.length; offset += 1) {
      const existingDigest = messages[start + offset]?.metadata?.relayTurnDigest || null;
      if (existingDigest !== digests[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      latestMatch = {
        start,
        messages: messages.slice(start, start + digests.length),
      };
    }
  }

  return latestMatch;
}

function buildRelayTimestamps(turns = [], now = new Date().toISOString()) {
  const baseMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now();
  return turns.map((turn, index) => turn.ts || new Date(baseMs + index).toISOString());
}

function buildRelayWriteParams({
  user,
  turn,
  timestamp,
  runtimeTurnState = null,
  relayBatchId,
  relayImportedAt,
  relaySource,
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
    role: turn.role,
    content: turn.content,
    title: constructName,
    metadata: {
      constructId,
      constructName,
      constructCallsign: constructId,
      sourceProduct: 'codex',
      sourceSeat: 'codex',
      relaySchemaVersion: CODEX_RELAY_SCHEMA_VERSION,
      relayImportedAt,
      relaySourcePath:
        relaySource.type === 'file' ||
        relaySource.type === 'latest-codex' ||
        relaySource.type === 'rollout-file' ||
        relaySource.type === 'vvault-archive'
          ? relaySource.path
          : null,
      relaySourceSessionId: relaySource.parseReport?.sessionId || null,
      relaySourceTimestamp: turn.ts || timestamp,
      relayBatchId,
      relayTurnDigest: turn.relayTurnDigest,
      relaySourceType: relaySource.type,
      relaySourceTurnIndex: turn.sourceTurnIndex,
      relayConstructId: constructId,
      relaySessionId: sessionId,
      ...(runtimeTurnState ? { runtimeTurnState } : {}),
    },
    constructId,
    constructName,
    constructCallsign: constructId,
  };
}

function buildRelaySourceDescriptor({
  fromFilePath = null,
  fromRolloutPath = null,
  fromVvaultStoragePath = null,
  useStdinJson = false,
  latestCodex = false,
  latestCodexPath = null,
  seedOnly = false,
  parseReport = null,
  selection = null,
}) {
  if (seedOnly) {
    return { type: 'seed-only' };
  }
  if (latestCodex) {
    return {
      type: 'latest-codex',
      path: latestCodexPath,
      parseReport,
      selection: selection || 'terminal-rollout-pair',
    };
  }
  if (fromRolloutPath) {
    return {
      type: 'rollout-file',
      path: fromRolloutPath,
      parseReport,
      selection: selection || 'terminal-rollout-pair',
    };
  }
  if (fromVvaultStoragePath) {
    return {
      type: 'vvault-archive',
      path: fromVvaultStoragePath,
      parseReport,
      selection: selection || 'terminal-vvault-readback-pair',
    };
  }
  if (fromFilePath) {
    return {
      type: 'file',
      path: fromFilePath,
      parseReport,
      selection: selection || 'terminal-pair',
    };
  }
  if (useStdinJson) {
    return {
      type: 'stdin-json',
      parseReport,
      selection: selection || 'provided-tail',
    };
  }
  return { type: 'unknown' };
}

function resolveLatestUserMessage(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return messages[index];
    }
  }
  return null;
}

function resolveLatestAssistantMessage(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index];
    }
  }
  return null;
}

function latestAssistantRuntimeTurnStateFromMessages(messages = []) {
  const latestAssistantMessage = resolveLatestAssistantMessage(messages);
  const runtimeTurnState = latestAssistantMessage?.metadata?.runtimeTurnState;
  if (!runtimeTurnState || typeof runtimeTurnState !== 'object') {
    return null;
  }
  return normalizeRuntimeTurnState(runtimeTurnState, {
    sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
    hydrationTruth: 'full',
    assistantTailContent: latestAssistantMessage.content,
  });
}

function matchesAuthoritativeRuntimeTurnState(candidateState = null, authoritativeState = null) {
  if (!candidateState || !authoritativeState) return false;
  return (
    candidateState.assistantTurnId === authoritativeState.assistantTurnId &&
    candidateState.tailHash === authoritativeState.tailHash &&
    candidateState.continuitySeq === authoritativeState.continuitySeq
  );
}

export { buildRelaySourceDescriptor };

export async function relayResolvedCodexTurns({
  turns,
  relaySource,
  now = new Date().toISOString(),
  usersPath = path.join(REPO_ROOT, 'users.json'),
  ownerEmail = CODEX_CONTINUITY_SEED_DEFAULTS.ownerEmail,
  frontendBaseUrl = process.env.CHATTY_FRONTEND_URL || CODEX_CONTINUITY_SEED_DEFAULTS.frontendBaseUrl,
  readLatestRuntimeTurnStateImpl = readLatestRuntimeTurnState,
  readConversationsImpl = readConversations,
  writeTranscriptImpl = defaultWriteTranscript,
} = {}) {
  const sourceType = relaySource?.type || 'unknown';
  validateRelayTurns(turns, { sourceType });

  const sourceIdentity =
    relaySource?.type === 'file' ||
    relaySource?.type === 'latest-codex' ||
    relaySource?.type === 'rollout-file' ||
    relaySource?.type === 'vvault-archive'
      ? relaySource.path
      : 'stdin-json';
  const incomingTurns = turns.map((turn, index) => ({
    ...turn,
    relayTurnDigest: buildRelayTurnDigest({
      sourceType,
      sourceIdentity,
      turnIndex:
        typeof turn.sourceTurnIndex === 'number' ? turn.sourceTurnIndex : index,
      role: turn.role,
      content: turn.content,
    }),
  }));

  const user = await readCanonicalSeedUser({ usersPath, ownerEmail });
  const userContext = buildUserContext(user);
  const previousStateResult = await readLatestRuntimeTurnStateImpl(userContext, {
    sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
    allowLocalFallback: false,
  });
  const canonicalConversations = await readConversationsImpl(
    userContext,
    CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
    STRICT_CANONICAL_READ_OPTIONS,
  );
  const canonicalConversation = findConversationBySessionId(
    canonicalConversations,
    CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
  );
  if (canonicalConversation) {
    assertCanonicalRelayConversation(canonicalConversation, { stage: 'initial read' });
  }
  const existingMessages = canonicalConversation?.messages || [];
  const existingSequence = findDigestSequence(existingMessages, incomingTurns);

  if (existingSequence) {
    const latestAssistantMessage = resolveLatestAssistantMessage(existingSequence.messages);
    const latestUserMessage = resolveLatestUserMessage(existingSequence.messages);
    const existingRuntimeTurnState = latestAssistantMessage?.metadata?.runtimeTurnState
      ? normalizeRuntimeTurnState(latestAssistantMessage.metadata.runtimeTurnState, {
          sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
          constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
          hydrationTruth: 'full',
          assistantTailContent: latestAssistantMessage.content,
        })
      : null;
    if (!existingRuntimeTurnState) {
      throw new Error('Existing Codex relay tail is missing assistant runtimeTurnState metadata.');
    }
    const authoritativeRuntimeTurnState =
      latestAssistantRuntimeTurnStateFromMessages(existingMessages) ||
      (previousStateResult?.runtimeTurnState
        ? normalizeRuntimeTurnState(previousStateResult.runtimeTurnState, {
            sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
            constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
            hydrationTruth: 'full',
          })
        : null);
    if (matchesAuthoritativeRuntimeTurnState(existingRuntimeTurnState, authoritativeRuntimeTurnState)) {
      const resumeToken = buildCodexResumeToken(existingRuntimeTurnState, {
        issuedAt: existingRuntimeTurnState.updatedAt || latestAssistantMessage?.timestamp || now,
        threadId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
      });
      return {
        source: relaySource,
        constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
        threadId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
        importedTurns: 0,
        dedupedTurns: incomingTurns.length,
        latestAssistantTurnId: existingRuntimeTurnState.assistantTurnId,
        latestAssistantContent: latestAssistantMessage?.content || null,
        latestUserContent: latestUserMessage?.content || null,
        latestRuntimeTurnState: existingRuntimeTurnState,
        relayedTurns: incomingTurns,
        resumeTokenJson: resumeToken,
        chattyResumeUrl: buildChattyResumeUrl(resumeToken, { frontendBaseUrl }),
        canonicalReadback: canonicalConversation,
      };
    }
  }

  const relayImportedAt = now;
  const relayBatchId = buildRelayBatchId(now);
  const timestamps = buildRelayTimestamps(incomingTurns, now);
  let previousState = previousStateResult?.runtimeTurnState || null;
  let previousUserTurn = null;
  let latestRuntimeTurnState = null;
  let latestAssistantContent = null;
  let latestUserContent = null;

  for (let index = 0; index < incomingTurns.length; index += 1) {
    const turn = incomingTurns[index];
    const timestamp = timestamps[index];
    const runtimeTurnState =
      turn.role === 'assistant'
        ? computeNextRuntimeTurnState({
            previousState,
            userMessage: previousUserTurn?.content || '',
            assistantMessage: turn.content || '',
            continuityClass: 'ordinary',
            sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
            constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
            constructRevision: previousState?.constructRevision || null,
            hydrationTruth: 'full',
            now: timestamp,
          })
        : null;
    const params = buildRelayWriteParams({
      user,
      turn,
      timestamp,
      runtimeTurnState,
      relayBatchId,
      relayImportedAt,
      relaySource,
    });
    const writeResult = await writeTranscriptImpl({
      ...params,
      requireVvaultBodySuccess: true,
    });
    assertCanonicalRelayWriteResult(writeResult, { role: turn.role });

    if (turn.role === 'user') {
      previousUserTurn = turn;
      latestUserContent = turn.content;
    } else if (runtimeTurnState) {
      previousState = runtimeTurnState;
      latestRuntimeTurnState = runtimeTurnState;
      latestAssistantContent = turn.content;
    }
  }

  if (!latestRuntimeTurnState) {
    throw new Error('Codex relay requires a terminal assistant turn to mint the resume token.');
  }

  const resumeToken = buildCodexResumeToken(latestRuntimeTurnState, {
    issuedAt: latestRuntimeTurnState.updatedAt || now,
    threadId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
  });
  const readbackConversations = await readConversationsImpl(
    userContext,
    CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
    STRICT_CANONICAL_READ_OPTIONS,
  );
  const canonicalReadback = findConversationBySessionId(
    readbackConversations,
    CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
  );
  assertCanonicalRelayReadback(canonicalReadback, {
    incomingTurns,
    latestRuntimeTurnState,
  });

  return {
    source: relaySource,
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
    threadId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    importedTurns: incomingTurns.length,
    dedupedTurns: 0,
    latestAssistantTurnId: latestRuntimeTurnState.assistantTurnId,
    latestAssistantContent,
    latestUserContent,
    latestRuntimeTurnState,
    relayedTurns: incomingTurns,
    resumeTokenJson: resumeToken,
    chattyResumeUrl: buildChattyResumeUrl(resumeToken, { frontendBaseUrl }),
    canonicalReadback,
  };
}

export async function relayCodexContinuity({
  fromFilePath = null,
  fromRolloutPath = null,
  fromVvaultArchiveContent = null,
  fromVvaultStoragePath = null,
  stdinJson = null,
  latestCodex = false,
  codexSessionsRoot = process.env.CODEX_SESSIONS_ROOT || DEFAULT_CODEX_SESSIONS_ROOT,
  preferredCodexCwd = process.cwd(),
  now = new Date().toISOString(),
  usersPath = path.join(REPO_ROOT, 'users.json'),
  ownerEmail = CODEX_CONTINUITY_SEED_DEFAULTS.ownerEmail,
  frontendBaseUrl = process.env.CHATTY_FRONTEND_URL || CODEX_CONTINUITY_SEED_DEFAULTS.frontendBaseUrl,
  readLatestRuntimeTurnStateImpl = readLatestRuntimeTurnState,
  readConversationsImpl = readConversations,
  writeTranscriptImpl = defaultWriteTranscript,
} = {}) {
  const sourceType = latestCodex
    ? 'latest-codex'
    : fromRolloutPath
      ? 'rollout-file'
      : fromVvaultArchiveContent !== null
        ? 'vvault-archive'
        : fromFilePath
          ? 'file'
          : 'stdin-json';
  let parsed;
  if (fromRolloutPath) {
    if (!path.isAbsolute(fromRolloutPath)) {
      throw new Error('Codex rollout pickup requires an absolute rollout path.');
    }
    parsed = await parseCodexRolloutJsonlFile(fromRolloutPath);
  } else if (fromVvaultArchiveContent !== null) {
    if (!fromVvaultStoragePath) {
      throw new Error('Codex VVAULT archive pickup requires a VVAULT storage path.');
    }
    parsed = parseCodexExportText(fromVvaultArchiveContent, { sourcePath: fromVvaultStoragePath });
  } else if (fromFilePath) {
    if (!path.isAbsolute(fromFilePath)) {
      throw new Error('chatty-cli handoff --from-file requires an absolute path.');
    }
    const rawText = await fs.readFile(fromFilePath, 'utf8');
    parsed = parseCodexExportText(rawText, { sourcePath: fromFilePath });
  } else if (latestCodex === true) {
    parsed = await readLatestCodexTail({
      codexSessionsRoot,
      preferredCwd: preferredCodexCwd,
    });
  } else if (stdinJson !== null) {
    parsed = parseCodexJsonTail(stdinJson);
  } else {
    throw new Error('chatty-cli handoff requires --latest-codex, --from-file, --from-rollout, --stdin-json, or --seed-only.');
  }

  const selectedTurns = selectTurnsForRelay(parsed.turns, { sourceType });
  validateRelayTurns(selectedTurns, { sourceType });

  const relaySource = buildRelaySourceDescriptor({
    fromFilePath,
    fromRolloutPath,
    fromVvaultStoragePath,
    latestCodex,
    latestCodexPath: parsed.parseReport?.sessionPath || null,
    useStdinJson: stdinJson !== null,
    parseReport: parsed.parseReport,
    selection: sourceType === 'latest-codex' || sourceType === 'rollout-file'
      ? 'terminal-rollout-pair'
      : null,
  });
  return relayResolvedCodexTurns({
    turns: selectedTurns,
    relaySource,
    now,
    usersPath,
    ownerEmail,
    frontendBaseUrl,
    readLatestRuntimeTurnStateImpl,
    readConversationsImpl,
    writeTranscriptImpl,
  });
}
