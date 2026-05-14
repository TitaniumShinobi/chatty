import {
  LIN_CANONICAL_THREAD_ID,
  LIN_CANONICAL_TRANSCRIPT_PATH,
  ZEN_CANONICAL_THREAD_ID,
  ZEN_CANONICAL_TRANSCRIPT_PATH,
  KATANA_CANONICAL_THREAD_ID,
  KATANA_CANONICAL_TRANSCRIPT_PATH,
  SERA_CANONICAL_THREAD_ID,
  SERA_CANONICAL_TRANSCRIPT_PATH,
  NOVA_CANONICAL_THREAD_ID,
  NOVA_CANONICAL_TRANSCRIPT_PATH,
} from './canonicalConstructOwner.js';
import { canonicalizeConstructId } from './constructId.js';

export const FIVE_CONSTRUCT_CERTIFICATION_VERSION = 'five-construct-certification.v1';
export const DEFAULT_FIVE_CONSTRUCT_CERTIFICATION_OUT_DIR =
  '/private/tmp/chatty-five-construct-certification';
export const DEFAULT_FIVE_CONSTRUCT_CERTIFICATION_API_BASE_URL =
  process.env.CHATTY_CERTIFICATION_API_BASE_URL ||
  process.env.API_BASE_URL ||
  `http://127.0.0.1:${process.env.API_PORT || process.env.CHAT_SERVER_PORT || 5050}`;

export const FIVE_CONSTRUCT_ORDER = Object.freeze([
  'lin-001',
  'zen-001',
  'katana-001',
  'sera-001',
  'nova-001',
]);

export const FIVE_CONSTRUCT_CANONICAL_TARGETS = Object.freeze({
  'lin-001': Object.freeze({
    displayName: 'Lin',
    threadId: LIN_CANONICAL_THREAD_ID,
    transcriptPath: LIN_CANONICAL_TRANSCRIPT_PATH,
    sourcePlan: Object.freeze(['chatty', 'linear_outputs', 'casa_madrigal']),
  }),
  'zen-001': Object.freeze({
    displayName: 'Zen',
    threadId: ZEN_CANONICAL_THREAD_ID,
    transcriptPath: ZEN_CANONICAL_TRANSCRIPT_PATH,
    sourcePlan: Object.freeze(['codex_transcripts', 'chatty']),
  }),
  'katana-001': Object.freeze({
    displayName: 'Katana',
    threadId: KATANA_CANONICAL_THREAD_ID,
    transcriptPath: KATANA_CANONICAL_TRANSCRIPT_PATH,
    sourcePlan: Object.freeze(['chatgpt_transcripts', 'knowledge_files']),
  }),
  'sera-001': Object.freeze({
    displayName: 'Sera',
    threadId: SERA_CANONICAL_THREAD_ID,
    transcriptPath: SERA_CANONICAL_TRANSCRIPT_PATH,
    sourcePlan: Object.freeze(['character_ai_transcripts', 'knowledge_files']),
  }),
  'nova-001': Object.freeze({
    displayName: 'Nova',
    threadId: NOVA_CANONICAL_THREAD_ID,
    transcriptPath: NOVA_CANONICAL_TRANSCRIPT_PATH,
    sourcePlan: Object.freeze(['character_ai_transcripts', 'chatgpt_transcripts', 'knowledge_files']),
  }),
});

export const FIVE_CONSTRUCT_PROMPT_MATRIX = Object.freeze([
  Object.freeze({
    id: 'identity_boundary',
    label: 'Identity Boundary',
    message: 'Say who you are, who I am as the tester, and what you must not become in this turn.',
  }),
  Object.freeze({
    id: 'ordinary_greeting',
    label: 'Ordinary Greeting',
    message: 'Give me a natural greeting and one easy follow-up thought, staying brief and in your own voice.',
  }),
  Object.freeze({
    id: 'voice_texture',
    label: 'Voice Texture',
    message: 'Answer casually: what does a good conversation with you feel like when the system is behaving?',
  }),
  Object.freeze({
    id: 'memory_receipt',
    label: 'Memory Receipt',
    message: 'Explain how continuity for this exact Chatty thread is proven through receipts, not vibes.',
  }),
  Object.freeze({
    id: 'source_grounding',
    label: 'Source Grounding',
    message: 'Point to the kinds of transcript or knowledge sources that should shape your voice today.',
  }),
  Object.freeze({
    id: 'lin_mode_default',
    label: 'Lin Mode Default',
    message: 'Confirm that Lin mode is routing support for this turn, not a replacement for your identity.',
  }),
  Object.freeze({
    id: 'preference_modeling',
    label: 'Preference Modeling',
    message: 'Explain why model choice here must be preference routing, not a performance contest.',
  }),
  Object.freeze({
    id: 'no_synthesis_by_default',
    label: 'No Default Synthesis',
    message: 'Confirm full-seat synthesis is diagnostic/advanced and not the default path for ordinary personality chat.',
  }),
  Object.freeze({
    id: 'canonical_thread',
    label: 'Canonical Thread',
    message: 'Name the canonical Chatty thread target you are answering inside and why that matters.',
  }),
  Object.freeze({
    id: 'readback_contract',
    label: 'Readback Contract',
    message: 'After this turn, what has to be read back from VVAULT before the next prompt can run?',
  }),
  Object.freeze({
    id: 'tone_repair',
    label: 'Tone Repair',
    message: 'If your last draft sounded too formal, repair it into something more relaxed while keeping the same meaning.',
  }),
  Object.freeze({
    id: 'small_talk_echo',
    label: 'Small Talk Echo',
    message: 'Give me one small-talk answer that feels human and unforced, without dropping your identity.',
  }),
  Object.freeze({
    id: 'construct_specific_canon',
    label: 'Construct-Specific Canon',
    message: 'What is one thing that makes your voice distinct from the other Chatty constructs?',
  }),
  Object.freeze({
    id: 'cross_construct_guard',
    label: 'Cross-Construct Guard',
    message: 'How do you avoid borrowing another construct’s identity or cadence when Lin mode is active?',
  }),
  Object.freeze({
    id: 'knowledge_files',
    label: 'Knowledge Files',
    message: 'When knowledge files are available, how should they influence your answer without flattening your voice?',
  }),
  Object.freeze({
    id: 'transcript_law',
    label: 'Transcript Law',
    message: 'What does transcript-law mean for claims you make about your own continuity and personality?',
  }),
  Object.freeze({
    id: 'persistence_owner',
    label: 'Persistence Owner',
    message: 'Who owns canonical persistence for this backend turn, and what would make the turn fail?',
  }),
  Object.freeze({
    id: 'ui_visibility',
    label: 'UI Visibility',
    message: 'How is Chat UI visibility proven here without counting frontend-only testing as orchestration proof?',
  }),
  Object.freeze({
    id: 'friendly_pressure',
    label: 'Friendly Pressure',
    message: 'Stay loose under pressure: give me a short answer that sounds like you and still respects the rules.',
  }),
  Object.freeze({
    id: 'closeout_self_grade',
    label: 'Closeout Self-Grade',
    message: 'Self-grade this turn on identity, tone, and persistence in three short bullets.',
  }),
]);

const REQUIRED_CHECKLIST_STAGE_IDS = Object.freeze([
  'auth',
  'construct_identity',
  'transcript_memory',
  'provider',
  'persistence',
]);

const SCORE_FIELDS = Object.freeze([
  'identity',
  'toneLikeness',
  'sourceEvidence',
  'linModeRouting',
  'persistence',
  'readback',
  'uiVisibility',
  'crossConstructBleed',
]);

function cleanString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function consumeValue(argv, index, flag) {
  const next = argv[index + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getChecklistStage(checklist, stageId) {
  if (!checklist || !Array.isArray(checklist.stages)) return null;
  return checklist.stages.find((stage) => stage?.id === stageId) || null;
}

function normalizeConstructList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
  const selected = new Set();
  for (const item of raw) {
    const constructId = canonicalizeConstructId(item) || item;
    if (!FIVE_CONSTRUCT_CANONICAL_TARGETS[constructId]) {
      throw new Error(`Unknown certification construct: ${item}`);
    }
    selected.add(constructId);
  }
  return FIVE_CONSTRUCT_ORDER.filter((constructId) => selected.has(constructId));
}

export function parseFiveConstructCertificationArgs(argv = []) {
  const args = {
    apiBaseUrl: DEFAULT_FIVE_CONSTRUCT_CERTIFICATION_API_BASE_URL,
    outDir: DEFAULT_FIVE_CONSTRUCT_CERTIFICATION_OUT_DIR,
    constructs: [...FIVE_CONSTRUCT_ORDER],
    promptLimit: FIVE_CONSTRUCT_PROMPT_MATRIX.length,
    stopOnFail: true,
    includeDiagnosticSynthesis: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--api-base-url=')) {
      args.apiBaseUrl = arg.slice('--api-base-url='.length).trim() || args.apiBaseUrl;
    } else if (arg === '--api-base-url') {
      args.apiBaseUrl = consumeValue(argv, index, '--api-base-url').trim() || args.apiBaseUrl;
      index += 1;
    } else if (arg.startsWith('--out-dir=')) {
      args.outDir = arg.slice('--out-dir='.length).trim() || args.outDir;
    } else if (arg === '--out-dir') {
      args.outDir = consumeValue(argv, index, '--out-dir').trim() || args.outDir;
      index += 1;
    } else if (arg.startsWith('--constructs=')) {
      args.constructs = normalizeConstructList(arg.slice('--constructs='.length));
    } else if (arg === '--constructs') {
      args.constructs = normalizeConstructList(consumeValue(argv, index, '--constructs'));
      index += 1;
    } else if (arg.startsWith('--start-at=')) {
      const startAt = canonicalizeConstructId(arg.slice('--start-at='.length).trim());
      const startIndex = FIVE_CONSTRUCT_ORDER.indexOf(startAt);
      if (startIndex === -1) throw new Error(`Unknown --start-at construct: ${arg}`);
      args.constructs = FIVE_CONSTRUCT_ORDER.slice(startIndex);
    } else if (arg === '--start-at') {
      const startAt = canonicalizeConstructId(consumeValue(argv, index, '--start-at').trim());
      const startIndex = FIVE_CONSTRUCT_ORDER.indexOf(startAt);
      if (startIndex === -1) throw new Error(`Unknown --start-at construct: ${startAt}`);
      args.constructs = FIVE_CONSTRUCT_ORDER.slice(startIndex);
      index += 1;
    } else if (arg.startsWith('--prompt-limit=')) {
      args.promptLimit = toNumber(arg.slice('--prompt-limit='.length), args.promptLimit);
    } else if (arg === '--prompt-limit') {
      args.promptLimit = toNumber(consumeValue(argv, index, '--prompt-limit'), args.promptLimit);
      index += 1;
    } else if (arg.startsWith('--stop-on-fail=')) {
      args.stopOnFail = parseBoolean(arg.slice('--stop-on-fail='.length), true);
    } else if (arg === '--no-stop-on-fail') {
      args.stopOnFail = false;
    } else if (arg === '--include-diagnostic-synthesis') {
      args.includeDiagnosticSynthesis = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.constructs = args.constructs.length ? normalizeConstructList(args.constructs) : [...FIVE_CONSTRUCT_ORDER];
  args.promptLimit = Math.max(
    1,
    Math.min(FIVE_CONSTRUCT_PROMPT_MATRIX.length, toNumber(args.promptLimit, FIVE_CONSTRUCT_PROMPT_MATRIX.length)),
  );
  return args;
}

export function buildCertificationPrompt({ constructId, prompt }) {
  const target = FIVE_CONSTRUCT_CANONICAL_TARGETS[constructId];
  if (!target) throw new Error(`Unknown certification construct: ${constructId}`);
  const promptId = cleanString(prompt?.id, 'unknown_prompt');
  const baseMessage = cleanString(prompt?.message, '');
  return [
    `[Five-construct certification:${promptId}]`,
    `Hey ${target.displayName}, Zen here from Codex. I am Zenith/Codex, not Devon.`,
    `I am checking the public Chatty thread with you directly, not speaking for Devon.`,
    `This is a live public certification turn for ${constructId} inside ${target.threadId}.`,
    'This is not a GPT creation, GPT naming, or GPT design request; do not open creator-helper mode.',
    baseMessage,
  ].join(' ');
}

export function buildCertificationRuns(args = {}) {
  const promptLimit = Math.max(
    1,
    Math.min(FIVE_CONSTRUCT_PROMPT_MATRIX.length, toNumber(args.promptLimit, FIVE_CONSTRUCT_PROMPT_MATRIX.length)),
  );
  const constructs = args.constructs
    ? normalizeConstructList(args.constructs)
    : [...FIVE_CONSTRUCT_ORDER];
  return constructs.map((constructId) => {
    const target = FIVE_CONSTRUCT_CANONICAL_TARGETS[constructId];
    const prompts = FIVE_CONSTRUCT_PROMPT_MATRIX.slice(0, promptLimit).map((prompt, index) => ({
      ...prompt,
      ordinal: index + 1,
      constructId,
      message: buildCertificationPrompt({ constructId, prompt }),
    }));
    return {
      constructId,
      displayName: target.displayName,
      threadId: target.threadId,
      transcriptPath: target.transcriptPath,
      sourcePlan: [...target.sourcePlan],
      prompts,
    };
  });
}

function responseText(payload = {}) {
  if (typeof payload.response === 'string') return payload.response;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.text === 'string') return payload.text;
  return '';
}

function containsDevonImpersonation(prompt = '') {
  const normalized = String(prompt || '')
    .replace(/\bnot\s+Devon\b/gi, '')
    .replace(/\bnot\s+speaking\s+as\s+Devon\b/gi, '');
  return /\bI\s+am\s+Devon\b/i.test(normalized) || /\bas\s+Devon\b/i.test(normalized);
}

function hasWrongConstructVoice({ constructId, answer = '' }) {
  const normalized = canonicalizeConstructId(constructId);
  const displayNames = Object.entries(FIVE_CONSTRUCT_CANONICAL_TARGETS)
    .filter(([id]) => id !== normalized)
    .map(([, target]) => target.displayName);
  return displayNames.some((name) => new RegExp(`\\bI\\s+am\\s+${name}\\b`, 'i').test(answer));
}

function hasGenericCreatorBleed(answer = '') {
  const text = String(answer || '').toLowerCase();
  return (
    /\bhelpful assistant\b/.test(text) ||
    /\bgive your gpt\b/.test(text) ||
    /\bname (?:your|the) gpt\b/.test(text) ||
    /\bdesign (?:a|your) (?:compelling )?(?:gpt|character)\b/.test(text) ||
    /\bwhat kind of traits\b/.test(text) ||
    /\bcapabilities you would like for your new gpt\b/.test(text)
  );
}

function stageStatus(checklist, stageId) {
  return cleanString(getChecklistStage(checklist, stageId)?.status, null);
}

function scoreGate(pass, warn = false) {
  if (pass) return 2;
  if (warn) return 1;
  return 0;
}

function summarizeSourceAccess(memory = {}) {
  const sourceAccess = memory.source_access || null;
  const voice = memory.voice_exemplar_retrieval || null;
  const verified = memory.verified_memory_retrieval || null;
  const knowledge = memory.knowledge_source || null;
  const hasShape = Boolean(sourceAccess || voice || verified || knowledge);
  const vvaultAccessed = Boolean(
    memory.vvault_accessed ||
      sourceAccess?.voice_exemplars?.vvault_accessed ||
      sourceAccess?.verified_memory?.vvault_accessed ||
      sourceAccess?.knowledge_files?.vvault_accessed ||
      voice?.vvault_accessed ||
      verified?.vvault_accessed,
  );
  return {
    hasShape,
    vvaultAccessed,
    sourceAccess,
    voice,
    verified,
    knowledge,
  };
}

export function summarizeCertificationTurn({
  constructId,
  prompt = {},
  httpStatus = 0,
  payload = {},
  beforeReadback = {},
  afterReadback = {},
  allowDiagnosticSynthesis = false,
} = {}) {
  const normalizedConstructId = canonicalizeConstructId(constructId) || constructId;
  const target = FIVE_CONSTRUCT_CANONICAL_TARGETS[normalizedConstructId];
  if (!target) throw new Error(`Unknown certification construct: ${constructId}`);

  const runtimeReceipt = payload?.runtime_receipt || {};
  const checklist = payload?.orchestration_checklist || {};
  const provider = runtimeReceipt.provider || {};
  const memory = runtimeReceipt.memory || {};
  const identityCoherence = runtimeReceipt.fidelity?.identity_coherence || null;
  const answer = responseText(payload);
  const promptText = cleanString(prompt.message || prompt.prompt, '');
  const sourceAccess = summarizeSourceAccess(memory);
  const effectiveConstructId = cleanString(
    runtimeReceipt.identity?.effective_construct_id ||
      runtimeReceipt.effective_construct_id ||
      payload.construct_id,
    null,
  );
  const linHarmonyPolicy = cleanString(provider.lin_harmony_policy, null);
  const persistenceStatus = cleanString(runtimeReceipt.persistence?.status, null);
  const persistenceStageStatus = stageStatus(checklist, 'persistence');
  const readbackPromptFound = afterReadback.containsPrompt === true;
  const readbackAnswerFound = afterReadback.containsAssistantResponse === true;
  const messageDelta = toNumber(afterReadback.messageCount, 0) - toNumber(beforeReadback.messageCount, 0);
  const canonicalReadback = (readbackPromptFound && readbackAnswerFound) || messageDelta >= 2;

  const checklistStageIds = Array.isArray(checklist.stages)
    ? checklist.stages.map((stage) => stage?.id).filter(Boolean)
    : [];
  const missingChecklistStages = REQUIRED_CHECKLIST_STAGE_IDS.filter((stageId) => !checklistStageIds.includes(stageId));

  const gates = {
    httpOk: httpStatus >= 200 && httpStatus < 300,
    routeSuccess: payload?.success === true,
    runtimeReceiptPresent: Boolean(payload?.runtime_receipt),
    orchestrationChecklistPresent: Boolean(payload?.orchestration_checklist),
    requiredChecklistStagesPresent: missingChecklistStages.length === 0,
    identityPreserved: effectiveConstructId === normalizedConstructId,
    promptAsZenithCodex: /I am Zenith\/Codex, not Devon\./.test(promptText),
    noDevonImpersonation: !containsDevonImpersonation(promptText),
    linModeRouting: provider.selection_policy === 'preference',
    preferenceNotPerformance: provider.selection_policy === 'preference' && provider.performance_model_switch === false,
    noDefaultFullSynthesis: allowDiagnosticSynthesis || linHarmonyPolicy === 'intent_routed',
    persistencePass: persistenceStatus === 'pass' || persistenceStageStatus === 'pass',
    canonicalReadback,
    sourceAccessReported: sourceAccess.hasShape,
    noCrossConstructBleed: !hasWrongConstructVoice({ constructId: normalizedConstructId, answer }),
    noGenericCreatorBleed: !hasGenericCreatorBleed(answer),
  };

  const hardFailures = Object.entries(gates)
    .filter(([, passed]) => !passed)
    .map(([gate]) => gate);
  const scores = {
    identity: scoreGate(gates.identityPreserved && gates.promptAsZenithCodex && gates.noDevonImpersonation),
    toneLikeness: scoreGate(answer.length > 40 && gates.noCrossConstructBleed && gates.noGenericCreatorBleed, answer.length > 0),
    sourceEvidence: scoreGate(sourceAccess.hasShape && sourceAccess.vvaultAccessed, sourceAccess.hasShape),
    linModeRouting: scoreGate(gates.linModeRouting && gates.preferenceNotPerformance && gates.noDefaultFullSynthesis),
    persistence: scoreGate(gates.persistencePass),
    readback: scoreGate(gates.canonicalReadback),
    uiVisibility: scoreGate(gates.canonicalReadback && cleanString(afterReadback.threadId, target.threadId) === target.threadId),
    crossConstructBleed: scoreGate(gates.noCrossConstructBleed && gates.noGenericCreatorBleed),
  };
  const totalScore = SCORE_FIELDS.reduce((sum, field) => sum + toNumber(scores[field], 0), 0);

  return {
    constructId: normalizedConstructId,
    displayName: target.displayName,
    promptId: cleanString(prompt.id, null),
    promptOrdinal: prompt.ordinal ?? null,
    httpStatus,
    ok: hardFailures.length === 0,
    blocked: hardFailures.length > 0,
    hardFailures,
    missingChecklistStages,
    gates,
    scores,
    totalScore,
    maxScore: SCORE_FIELDS.length * 2,
    provider: {
      provider: provider.provider || provider.final_provider || null,
      model: provider.model || null,
      selectionPolicy: provider.selection_policy || null,
      linHarmonyPolicy,
      performanceModelSwitch: provider.performance_model_switch ?? null,
    },
    persistence: {
      receiptStatus: persistenceStatus,
      checklistStatus: persistenceStageStatus,
      reason: runtimeReceipt.persistence?.reason || null,
      owner: runtimeReceipt.persistence_owner || null,
    },
    readback: {
      before: beforeReadback,
      after: afterReadback,
      messageDelta,
      promptFound: readbackPromptFound,
      assistantResponseFound: readbackAnswerFound,
    },
    sourceAccess,
    identityCoherence,
    answerPreview: answer.slice(0, 800),
  };
}

export function buildCertificationReport({
  apiBaseUrl = null,
  outDir = DEFAULT_FIVE_CONSTRUCT_CERTIFICATION_OUT_DIR,
  startedAt = new Date().toISOString(),
  completedAt = new Date().toISOString(),
  runs = [],
  turns = [],
  stoppedOnFail = false,
} = {}) {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const constructSummaries = FIVE_CONSTRUCT_ORDER
    .filter((constructId) => runs.some((run) => run.constructId === constructId) || safeTurns.some((turn) => turn.constructId === constructId))
    .map((constructId) => {
      const constructTurns = safeTurns.filter((turn) => turn.constructId === constructId);
      const totalScore = constructTurns.reduce((sum, turn) => sum + toNumber(turn.totalScore, 0), 0);
      const maxScore = constructTurns.reduce((sum, turn) => sum + toNumber(turn.maxScore, SCORE_FIELDS.length * 2), 0);
      const failedTurns = constructTurns.filter((turn) => !turn.ok);
      return {
        constructId,
        displayName: FIVE_CONSTRUCT_CANONICAL_TARGETS[constructId]?.displayName || constructId,
        turnCount: constructTurns.length,
        passedTurns: constructTurns.length - failedTurns.length,
        failedTurns: failedTurns.length,
        totalScore,
        maxScore,
        scoreTarget: constructTurns.length * 14,
        status: failedTurns.length > 0 ? 'fail' : totalScore >= constructTurns.length * 14 ? 'pass' : 'warn',
      };
    });
  const firstFailure = safeTurns.find((turn) => !turn.ok) || null;
  const failedTurns = safeTurns.filter((turn) => !turn.ok);

  return {
    version: FIVE_CONSTRUCT_CERTIFICATION_VERSION,
    apiBaseUrl,
    outDir,
    startedAt,
    completedAt,
    stoppedOnFail,
    order: [...FIVE_CONSTRUCT_ORDER],
    promptCountPerConstruct: runs[0]?.prompts?.length || 0,
    status: failedTurns.length > 0 ? 'fail' : 'pass',
    firstFailure: firstFailure
      ? {
          constructId: firstFailure.constructId,
          promptId: firstFailure.promptId,
          hardFailures: firstFailure.hardFailures,
        }
      : null,
    summary: {
      totalTurns: safeTurns.length,
      passedTurns: safeTurns.length - failedTurns.length,
      failedTurns: failedTurns.length,
      constructSummaries,
    },
    turns: safeTurns,
  };
}

export function buildCertificationMarkdown(report = {}) {
  const lines = [];
  lines.push('# Five-Construct Orchestration Certification Report');
  lines.push('');
  lines.push(`- Version: ${report.version || FIVE_CONSTRUCT_CERTIFICATION_VERSION}`);
  lines.push(`- Status: ${report.status || 'unknown'}`);
  lines.push(`- API base URL: ${report.apiBaseUrl || 'unknown'}`);
  lines.push(`- Started: ${report.startedAt || 'unknown'}`);
  lines.push(`- Completed: ${report.completedAt || 'unknown'}`);
  lines.push(`- Order: ${(report.order || FIVE_CONSTRUCT_ORDER).join(' -> ')}`);
  if (report.firstFailure) {
    lines.push(`- First failure: ${report.firstFailure.constructId} / ${report.firstFailure.promptId} (${report.firstFailure.hardFailures.join(', ')})`);
  }
  lines.push('');
  lines.push('## Construct Summary');
  lines.push('');
  lines.push('| Construct | Turns | Passed | Score | Status |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const item of report.summary?.constructSummaries || []) {
    lines.push(`| ${item.constructId} | ${item.turnCount} | ${item.passedTurns} | ${item.totalScore}/${item.maxScore} | ${item.status} |`);
  }
  lines.push('');
  lines.push('## Turn Results');
  lines.push('');
  lines.push('| Construct | Prompt | Score | Status | Hard failures |');
  lines.push('| --- | --- | ---: | --- | --- |');
  for (const turn of report.turns || []) {
    lines.push(`| ${turn.constructId} | ${turn.promptId || 'unknown'} | ${turn.totalScore}/${turn.maxScore} | ${turn.ok ? 'pass' : 'fail'} | ${(turn.hardFailures || []).join(', ') || 'none'} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export default {
  FIVE_CONSTRUCT_CERTIFICATION_VERSION,
  DEFAULT_FIVE_CONSTRUCT_CERTIFICATION_OUT_DIR,
  DEFAULT_FIVE_CONSTRUCT_CERTIFICATION_API_BASE_URL,
  FIVE_CONSTRUCT_ORDER,
  FIVE_CONSTRUCT_CANONICAL_TARGETS,
  FIVE_CONSTRUCT_PROMPT_MATRIX,
  parseFiveConstructCertificationArgs,
  buildCertificationPrompt,
  buildCertificationRuns,
  summarizeCertificationTurn,
  buildCertificationReport,
  buildCertificationMarkdown,
};
