import crypto from 'node:crypto';

const RUNTIME_TURN_STATE_VERSION = 4;
const MAX_ACTIVE_TOPIC_CHARS = 80;
const MAX_ORDINARY_THREAD_SUMMARY_CHARS = 220;
const MAX_UNRESOLVED_INTENT_TEXT_CHARS = 140;
const MAX_ACTIVE_GOAL_CHARS = 160;
const MAX_ACTIVE_MODE_CHARS = 48;
const MAX_OPEN_LOOP_CHARS = 160;
const MAX_NEXT_STEP_CHARS = 160;
const MAX_CONSTRUCT_REVISION_CHARS = 96;
const MAX_ASSISTANT_TURN_ID_CHARS = 72;
const MAX_TAIL_HASH_CHARS = 64;
const MAX_TAIL_HASH_CONTENT_CHARS = 2400;
const MAX_FOCUS_REF_CHARS = 96;
const MAX_FOCUS_REFS = 4;
const DEFAULT_CONSTRUCT_REVISION_PREFIX = 'construct-runtime-v1';
const NONE_INTENT = Object.freeze({
  kind: 'none',
  text: null,
});
const LOW_SIGNAL_MESSAGE_RE = /^(?:hi|hello|hey|yo|sup|ok|okay|k|yes|yep|no|nah|thanks|thank you|lol|haha|cool|nice|got it|sounds good|alright)[.!?\s]*$/i;
const DECISION_INTENT_RE = /\b(?:should we|should i|do we|do i|which one|which option|choose|pick|decide|decision)\b/i;
const CLARIFICATION_INTENT_RE = /\b(?:clarify|clarification|what do you mean|explain|spell out|be more specific)\b/i;
const HANDOFF_INTENT_RE = /\b(?:next step|handoff|hand off|follow up|follow-up|come back to|return to|circle back)\b/i;
const ACTIVE_GOAL_DIRECTIVE_RE = /\bactive goal(?:\s+on)?\s*:?\s*(.+?)(?:,\s+and\b|;\s*|$)/i;
const OPEN_LOOP_DIRECTIVE_RE = /\b(?:leave\s+(?:this\s+)?open loop(?:\s+unresolved)?|open loop(?:\s+unresolved)?|next step)\s*:?\s*(.+)$/i;
const EVIDENCE_NOISE_RE = /\b(?:source_path|timestamp|session\s*:|according to|transcript(?:s)?|filename|evidence|citation(?:s)?)\b/gi;
const ISO_TIMESTAMP_RE = /\b\d{4}-\d{2}-\d{2}T[^\s)\]]+\b/g;
const GENERIC_IMPERATIVE_CONTINUITY_RE =
  /^(?:finish(?:\s+it)?|do it|work|keep going|carry on|move forward|push through|fully)(?:[.!?\s]+(?:fully|please|now|directly))*[.!?\s]*$/i;

function cleanWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hashParts(parts = []) {
  const serialized = parts
    .map((part) => cleanWhitespace(part == null ? '' : String(part)))
    .join('|');
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function cleanBoundedText(value, maxChars) {
  const cleaned = cleanWhitespace(
    String(value || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(ISO_TIMESTAMP_RE, ' ')
      .replace(EVIDENCE_NOISE_RE, ' ')
      .replace(/\[[^\]]{0,120}\]/g, ' ')
      .replace(/[>*_`#]/g, ' ')
  );
  if (!cleaned) return null;
  return cleaned.length <= maxChars
    ? cleaned
    : `${cleaned.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function normalizeTurnType(value) {
  return value === 'transcript_law' ? 'transcript_law' : 'ordinary';
}

function normalizeAwaiting(value) {
  return value === 'assistant' ? 'assistant' : 'user';
}

function normalizeContinuitySeq(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.floor(numeric);
}

function normalizeHydrationTruth(value) {
  return cleanWhitespace(value) === 'full' ? 'full' : 'unproven';
}

function normalizeConstructRevision(value, constructId = null) {
  const fallbackConstructId = cleanWhitespace(constructId);
  const cleaned = cleanBoundedText(value, MAX_CONSTRUCT_REVISION_CHARS);
  if (cleaned) return cleaned;
  if (!fallbackConstructId) return null;
  return `${DEFAULT_CONSTRUCT_REVISION_PREFIX}:${fallbackConstructId}`;
}

function normalizeAssistantTurnId(value) {
  const cleaned = cleanWhitespace(value || '');
  if (!cleaned) return null;
  return cleaned.length <= MAX_ASSISTANT_TURN_ID_CHARS
    ? cleaned
    : cleaned.slice(0, MAX_ASSISTANT_TURN_ID_CHARS);
}

function normalizeTailHash(value) {
  const cleaned = cleanWhitespace(value || '').toLowerCase();
  return /^[a-f0-9]{12,128}$/.test(cleaned)
    ? cleaned.slice(0, MAX_TAIL_HASH_CHARS)
    : null;
}

function normalizeFocusRefs(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? [value]
      : [];
  return Array.from(
    new Set(
      source
        .map((entry) => cleanBoundedText(entry, MAX_FOCUS_REF_CHARS))
        .filter(Boolean),
    ),
  ).slice(0, MAX_FOCUS_REFS);
}

function maybeParseMetadata(metadata = null) {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata;
  try {
    const parsed = JSON.parse(String(metadata));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function toEpochMs(value) {
  const parsed = Date.parse(cleanWhitespace(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeIntentKind(value) {
  switch (value) {
    case 'question':
    case 'decision':
    case 'clarification':
    case 'handoff':
      return value;
    default:
      return 'none';
  }
}

function normalizeUnresolvedIntent(intent) {
  const kind = normalizeIntentKind(intent?.kind);
  const text = kind === 'none'
    ? null
    : cleanBoundedText(intent?.text || '', MAX_UNRESOLVED_INTENT_TEXT_CHARS);
  return text ? { kind, text } : NONE_INTENT;
}

export function buildConstructRevision({
  constructId = null,
  revisionHint = null,
} = {}) {
  return normalizeConstructRevision(revisionHint, constructId);
}

export function buildRuntimeTailHash({
  sessionId = null,
  canonicalThreadId = null,
  constructId = null,
  constructRevision = null,
  continuitySeq = 0,
  assistantTurnId = null,
  assistantTailContent = null,
  assistantMessage = null,
} = {}) {
  const normalizedAssistantTurnId = normalizeAssistantTurnId(assistantTurnId);
  if (!normalizedAssistantTurnId) return null;
  const threadId = cleanWhitespace(canonicalThreadId || sessionId);
  const normalizedAssistantTail = cleanBoundedText(
    assistantTailContent || assistantMessage || '',
    MAX_TAIL_HASH_CONTENT_CHARS,
  );
  return hashParts([
    threadId,
    cleanWhitespace(constructId),
    normalizeConstructRevision(constructRevision, constructId),
    normalizeContinuitySeq(continuitySeq, 0),
    normalizedAssistantTurnId,
    normalizedAssistantTail,
  ]).slice(0, MAX_TAIL_HASH_CHARS);
}

export function buildAssistantTurnId({
  sessionId = null,
  constructId = null,
  continuitySeq = 0,
  now = new Date().toISOString(),
} = {}) {
  const seq = normalizeContinuitySeq(continuitySeq, 0);
  const digest = hashParts([
    cleanWhitespace(sessionId),
    cleanWhitespace(constructId),
    seq,
    cleanWhitespace(now),
  ]).slice(0, 20);
  return `rt_${seq}_${digest}`;
}

export function normalizeRuntimeTurnState(state = {}, defaults = {}) {
  const canonicalThreadId =
    cleanWhitespace(
      state?.canonicalThreadId ||
        state?.canonical_thread_id ||
        state?.sessionId ||
        defaults.canonicalThreadId ||
        defaults.sessionId ||
        '',
    ) || null;
  const sessionId = canonicalThreadId;
  const constructId = cleanWhitespace(state?.constructId || defaults.constructId || '') || null;
  const continuitySeq = normalizeContinuitySeq(
    state?.continuitySeq,
    defaults.continuitySeq || 0,
  );
  const constructRevision = normalizeConstructRevision(
    state?.constructRevision || defaults.constructRevision,
    constructId,
  );
  const assistantTurnId = normalizeAssistantTurnId(
    state?.assistantTurnId || defaults.assistantTurnId,
  );
  const tailHash = normalizeTailHash(
    state?.tailHash ||
      defaults.tailHash ||
      buildRuntimeTailHash({
        canonicalThreadId,
        constructId,
        constructRevision,
        continuitySeq,
        assistantTurnId,
        assistantTailContent:
          state?.assistantTailContent ||
          state?.assistantMessage ||
          defaults.assistantTailContent ||
          defaults.assistantMessage,
      }),
  );
  const ordinaryThreadSummary = cleanBoundedText(
    state?.ordinaryThreadSummary,
    MAX_ORDINARY_THREAD_SUMMARY_CHARS,
  );
  const activeTopic = cleanBoundedText(state?.activeTopic, MAX_ACTIVE_TOPIC_CHARS);
  const unresolvedIntent = normalizeUnresolvedIntent(state?.unresolvedIntent);
  const activeGoal = cleanBoundedText(
    state?.activeGoal || ordinaryThreadSummary || activeTopic,
    MAX_ACTIVE_GOAL_CHARS,
  );
  const openLoop = cleanBoundedText(
    state?.openLoop || unresolvedIntent?.text || activeGoal,
    MAX_OPEN_LOOP_CHARS,
  );
  const nextStep = cleanBoundedText(
    state?.nextStep || unresolvedIntent?.text || openLoop || activeGoal,
    MAX_NEXT_STEP_CHARS,
  );
  return {
    version: RUNTIME_TURN_STATE_VERSION,
    canonicalThreadId,
    sessionId,
    constructId,
    constructRevision,
    updatedAt: cleanWhitespace(state?.updatedAt || defaults.updatedAt || '') || null,
    continuitySeq,
    assistantTurnId,
    tailHash,
    hydrationTruth: normalizeHydrationTruth(state?.hydrationTruth || defaults.hydrationTruth),
    ordinaryThreadSummary,
    activeTopic,
    activeGoal,
    activeMode: cleanBoundedText(
      state?.activeMode || defaults.activeMode || normalizeTurnType(state?.lastTurnType),
      MAX_ACTIVE_MODE_CHARS,
    ),
    focusRefs: normalizeFocusRefs(state?.focusRefs),
    openLoop,
    nextStep,
    awaiting: normalizeAwaiting(state?.awaiting || defaults.awaiting),
    unresolvedIntent,
    lastTurnType: normalizeTurnType(state?.lastTurnType),
  };
}

function isLowSignalOrdinaryMessage(message = '') {
  const cleaned = cleanWhitespace(message);
  return !cleaned || cleaned.length < 12 || LOW_SIGNAL_MESSAGE_RE.test(cleaned);
}

function stripGenericImperativeLead(text = '', maxChars = MAX_ORDINARY_THREAD_SUMMARY_CHARS * 2) {
  const cleaned = cleanBoundedText(text, maxChars);
  if (!cleaned) return null;
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => cleanWhitespace(sentence))
    .filter(Boolean);
  while (sentences.length > 1 && GENERIC_IMPERATIVE_CONTINUITY_RE.test(sentences[0])) {
    sentences.shift();
  }
  return cleanWhitespace(sentences.join(' ')) || cleaned;
}

function shouldPreferAssistantNarrativeSeed({
  userMessage = '',
  assistantMessage = '',
} = {}) {
  const cleanedUserMessage = cleanWhitespace(userMessage);
  const cleanedAssistantMessage = cleanBoundedText(
    assistantMessage,
    MAX_ORDINARY_THREAD_SUMMARY_CHARS * 2,
  );
  if (!cleanedAssistantMessage) return false;
  return GENERIC_IMPERATIVE_CONTINUITY_RE.test(cleanedUserMessage);
}

function firstSentenceLike(text = '', maxChars = MAX_ORDINARY_THREAD_SUMMARY_CHARS) {
  const cleaned = stripGenericImperativeLead(text, maxChars * 2);
  if (!cleaned) return null;
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return cleanBoundedText(firstSentence, maxChars);
}

function deriveUnresolvedIntent(message = '') {
  const cleaned = cleanBoundedText(message, MAX_UNRESOLVED_INTENT_TEXT_CHARS * 2);
  if (!cleaned) return NONE_INTENT;
  if (cleaned.includes('?')) {
    return {
      kind: 'question',
      text: firstSentenceLike(cleaned, MAX_UNRESOLVED_INTENT_TEXT_CHARS),
    };
  }
  if (DECISION_INTENT_RE.test(cleaned)) {
    return {
      kind: 'decision',
      text: firstSentenceLike(cleaned, MAX_UNRESOLVED_INTENT_TEXT_CHARS),
    };
  }
  if (CLARIFICATION_INTENT_RE.test(cleaned)) {
    return {
      kind: 'clarification',
      text: firstSentenceLike(cleaned, MAX_UNRESOLVED_INTENT_TEXT_CHARS),
    };
  }
  if (HANDOFF_INTENT_RE.test(cleaned)) {
    return {
      kind: 'handoff',
      text: firstSentenceLike(cleaned, MAX_UNRESOLVED_INTENT_TEXT_CHARS),
    };
  }
  return NONE_INTENT;
}

function deriveActiveTopic(message = '', previousState = null) {
  const cleaned = stripGenericImperativeLead(message, MAX_ACTIVE_TOPIC_CHARS * 2);
  if (!cleaned) return previousState?.activeTopic || null;
  const clause = cleaned.split(/[:;.!?]/)[0] || cleaned;
  return cleanBoundedText(clause, MAX_ACTIVE_TOPIC_CHARS);
}

function deriveOrdinaryThreadSummary(message = '', activeTopic = null, unresolvedIntent = NONE_INTENT) {
  const summarySeed = firstSentenceLike(message, MAX_ORDINARY_THREAD_SUMMARY_CHARS);
  if (summarySeed) return summarySeed;
  if (unresolvedIntent?.kind && unresolvedIntent.kind !== 'none' && unresolvedIntent.text) {
    return cleanBoundedText(
      `${activeTopic || 'Open thread'}: ${unresolvedIntent.text}`,
      MAX_ORDINARY_THREAD_SUMMARY_CHARS,
    );
  }
  return cleanBoundedText(activeTopic, MAX_ORDINARY_THREAD_SUMMARY_CHARS);
}

function extractExplicitActiveGoal(message = '') {
  const cleaned = cleanBoundedText(message, MAX_ACTIVE_GOAL_CHARS * 2);
  if (!cleaned) return null;
  const match = cleaned.match(ACTIVE_GOAL_DIRECTIVE_RE);
  return match?.[1] ? cleanBoundedText(match[1], MAX_ACTIVE_GOAL_CHARS) : null;
}

function extractExplicitOpenLoop(message = '') {
  const cleaned = cleanBoundedText(message, MAX_OPEN_LOOP_CHARS * 2);
  if (!cleaned) return null;
  const match = cleaned.match(OPEN_LOOP_DIRECTIVE_RE);
  return match?.[1] ? cleanBoundedText(match[1], MAX_OPEN_LOOP_CHARS) : null;
}

function deriveActiveGoal({
  userMessage = '',
  ordinaryThreadSummary = null,
  activeTopic = null,
  unresolvedIntent = NONE_INTENT,
  previousState = null,
  lowSignal = false,
} = {}) {
  if (lowSignal) {
    return previousState?.activeGoal || previousState?.ordinaryThreadSummary || activeTopic || null;
  }
  const explicitActiveGoal = extractExplicitActiveGoal(userMessage);
  if (explicitActiveGoal) {
    return explicitActiveGoal;
  }
  return cleanBoundedText(
    ordinaryThreadSummary || unresolvedIntent?.text || activeTopic || previousState?.activeGoal,
    MAX_ACTIVE_GOAL_CHARS,
  );
}

function deriveActiveMode({
  continuityClass = 'ordinary',
  previousState = null,
} = {}) {
  if (normalizeTurnType(continuityClass) === 'transcript_law') {
    return cleanBoundedText(previousState?.activeMode || 'transcript_law', MAX_ACTIVE_MODE_CHARS);
  }
  return 'ordinary';
}

function deriveFocusRefs({
  activeTopic = null,
  activeGoal = null,
  previousState = null,
  lowSignal = false,
} = {}) {
  if (lowSignal) {
    return normalizeFocusRefs(previousState?.focusRefs);
  }
  return normalizeFocusRefs([activeTopic, activeGoal]);
}

function deriveOpenLoop({
  userMessage = '',
  unresolvedIntent = NONE_INTENT,
  activeGoal = null,
  previousState = null,
  lowSignal = false,
} = {}) {
  if (lowSignal) {
    return cleanBoundedText(
      previousState?.openLoop || unresolvedIntent?.text || activeGoal,
      MAX_OPEN_LOOP_CHARS,
    );
  }
  const explicitOpenLoop = extractExplicitOpenLoop(userMessage);
  if (explicitOpenLoop) {
    return explicitOpenLoop;
  }
  return cleanBoundedText(
    unresolvedIntent?.text || activeGoal || previousState?.openLoop,
    MAX_OPEN_LOOP_CHARS,
  );
}

function deriveNextStep({
  userMessage = '',
  unresolvedIntent = NONE_INTENT,
  openLoop = null,
  activeGoal = null,
  previousState = null,
  lowSignal = false,
} = {}) {
  if (lowSignal) {
    return cleanBoundedText(
      previousState?.nextStep || previousState?.openLoop || openLoop || activeGoal,
      MAX_NEXT_STEP_CHARS,
    );
  }
  const explicitOpenLoop = extractExplicitOpenLoop(userMessage);
  if (explicitOpenLoop) {
    return cleanBoundedText(explicitOpenLoop, MAX_NEXT_STEP_CHARS);
  }
  return cleanBoundedText(
    unresolvedIntent?.text || openLoop || activeGoal || previousState?.nextStep,
    MAX_NEXT_STEP_CHARS,
  );
}

function compareRuntimeTurnStateCandidates(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  if (right.continuitySeq !== left.continuitySeq) {
    return right.continuitySeq > left.continuitySeq ? right : left;
  }
  if (right.updatedAtMs !== left.updatedAtMs) {
    return right.updatedAtMs > left.updatedAtMs ? right : left;
  }
  return left;
}

function buildRuntimeTurnStateCandidateFromAssistantMessage(
  message = {},
  { sessionId = null, constructId = null } = {},
) {
  if (!message || message.role !== 'assistant') return null;
  const metadata = maybeParseMetadata(message.metadata);
  if (!metadata?.runtimeTurnState || typeof metadata.runtimeTurnState !== 'object') {
    return null;
  }

  const runtimeTurnState = normalizeRuntimeTurnState(metadata.runtimeTurnState, {
    sessionId,
    constructId,
    updatedAt: message.timestamp || null,
    hydrationTruth: 'full',
    assistantTailContent: message.content,
  });

  if (
    runtimeTurnState.sessionId !== cleanWhitespace(sessionId) ||
    runtimeTurnState.constructId !== cleanWhitespace(constructId) ||
    runtimeTurnState.tailHash !==
      buildRuntimeTailHash({
        canonicalThreadId: runtimeTurnState.canonicalThreadId || runtimeTurnState.sessionId,
        constructId: runtimeTurnState.constructId,
        constructRevision: runtimeTurnState.constructRevision,
        continuitySeq: runtimeTurnState.continuitySeq,
        assistantTurnId: runtimeTurnState.assistantTurnId,
        assistantTailContent: message.content,
      })
  ) {
    return null;
  }

  return {
    runtimeTurnState,
    continuitySeq: Number.isFinite(runtimeTurnState?.continuitySeq)
      ? runtimeTurnState.continuitySeq
      : 0,
    updatedAtMs: toEpochMs(runtimeTurnState?.updatedAt || message.timestamp),
  };
}

function inferContinuityClassFromAssistantMessage(message = {}) {
  const metadata = maybeParseMetadata(message.metadata);
  return metadata?.runtimeTurnState?.lastTurnType === 'transcript_law'
    ? 'transcript_law'
    : 'ordinary';
}

export function buildRouteTurnEnvelope({
  sessionId,
  constructId,
  runtimeTurnState = null,
  continuityClass = 'ordinary',
  transcriptLawRequired = false,
  evidenceAttached = false,
  persistedStateSource = 'none',
  continuityExpected = false,
  continuityResume = null,
} = {}) {
  return {
    sessionId: cleanWhitespace(sessionId) || null,
    constructId: cleanWhitespace(constructId) || null,
    runtimeTurnState: runtimeTurnState
      ? normalizeRuntimeTurnState(runtimeTurnState, { sessionId, constructId })
      : null,
    continuityClass: normalizeTurnType(continuityClass),
    transcriptLawRequired: transcriptLawRequired === true,
    evidenceAttached: evidenceAttached === true,
    persistedStateSource: cleanWhitespace(persistedStateSource) || 'none',
    continuityExpected: continuityExpected === true,
    continuityResume:
      continuityResume && typeof continuityResume === 'object'
        ? { ...continuityResume }
        : null,
  };
}

export function computeNextRuntimeTurnState({
  previousState = null,
  userMessage = '',
  assistantMessage = '',
  continuityClass = 'ordinary',
  sessionId = null,
  constructId = null,
  constructRevision = null,
  hydrationTruth = 'full',
  assistantTurnId = null,
  now = new Date().toISOString(),
} = {}) {
  const prior = normalizeRuntimeTurnState(previousState, {
    sessionId,
    constructId,
    updatedAt: now,
    constructRevision,
    hydrationTruth,
  });
  const nextTurnType = normalizeTurnType(continuityClass);
  const continuitySeq = normalizeContinuitySeq(prior.continuitySeq, 0) + 1;
  const resolvedConstructRevision = normalizeConstructRevision(
    constructRevision || prior.constructRevision,
    constructId || prior.constructId,
  );
  const resolvedAssistantTurnId =
    normalizeAssistantTurnId(assistantTurnId) ||
    buildAssistantTurnId({
      sessionId: cleanWhitespace(sessionId) || prior.canonicalThreadId || prior.sessionId,
      constructId: cleanWhitespace(constructId) || prior.constructId,
      continuitySeq,
      now,
    });
  if (nextTurnType === 'transcript_law') {
    return {
      ...prior,
      version: RUNTIME_TURN_STATE_VERSION,
      constructRevision: resolvedConstructRevision,
      updatedAt: now,
      continuitySeq,
      assistantTurnId: resolvedAssistantTurnId,
      tailHash: buildRuntimeTailHash({
        canonicalThreadId: cleanWhitespace(sessionId) || prior.canonicalThreadId || prior.sessionId,
        constructId: cleanWhitespace(constructId) || prior.constructId,
        constructRevision: resolvedConstructRevision,
        continuitySeq,
        assistantTurnId: resolvedAssistantTurnId,
        assistantTailContent: assistantMessage,
      }),
      hydrationTruth: normalizeHydrationTruth(hydrationTruth),
      lastTurnType: 'transcript_law',
    };
  }

  const cleanedMessage = cleanWhitespace(userMessage);
  const cleanedAssistantMessage = cleanWhitespace(assistantMessage);
  const narrativeSeedMessage = shouldPreferAssistantNarrativeSeed({
    userMessage: cleanedMessage,
    assistantMessage: cleanedAssistantMessage,
  })
    ? cleanedAssistantMessage
    : cleanedMessage;
  const lowSignal = isLowSignalOrdinaryMessage(cleanedMessage);
  const unresolvedIntent = lowSignal
    ? prior.unresolvedIntent
    : deriveUnresolvedIntent(narrativeSeedMessage);
  const activeTopic = lowSignal
    ? prior.activeTopic
    : deriveActiveTopic(narrativeSeedMessage, prior);
  const ordinaryThreadSummary = lowSignal
    ? prior.ordinaryThreadSummary
    : deriveOrdinaryThreadSummary(narrativeSeedMessage, activeTopic, unresolvedIntent);
  const activeGoal = deriveActiveGoal({
    userMessage: narrativeSeedMessage,
    ordinaryThreadSummary,
    activeTopic,
    unresolvedIntent,
    previousState: prior,
    lowSignal,
  });
  const activeMode = deriveActiveMode({
    continuityClass: nextTurnType,
    previousState: prior,
  });
  const focusRefs = deriveFocusRefs({
    activeTopic,
    activeGoal,
    previousState: prior,
    lowSignal,
  });
  const openLoop = deriveOpenLoop({
    userMessage: narrativeSeedMessage,
    unresolvedIntent,
    activeGoal,
    previousState: prior,
    lowSignal,
  });
  const nextStep = deriveNextStep({
    userMessage: narrativeSeedMessage,
    unresolvedIntent,
    openLoop,
    activeGoal,
    previousState: prior,
    lowSignal,
  });

  return {
    version: RUNTIME_TURN_STATE_VERSION,
    canonicalThreadId: cleanWhitespace(sessionId) || prior.canonicalThreadId || prior.sessionId,
    sessionId: cleanWhitespace(sessionId) || prior.canonicalThreadId || prior.sessionId,
    constructId: cleanWhitespace(constructId) || prior.constructId,
    constructRevision: resolvedConstructRevision,
    updatedAt: now,
    continuitySeq,
    assistantTurnId: resolvedAssistantTurnId,
    tailHash: buildRuntimeTailHash({
      canonicalThreadId: cleanWhitespace(sessionId) || prior.canonicalThreadId || prior.sessionId,
      constructId: cleanWhitespace(constructId) || prior.constructId,
      constructRevision: resolvedConstructRevision,
      continuitySeq,
      assistantTurnId: resolvedAssistantTurnId,
      assistantTailContent: assistantMessage,
    }),
    hydrationTruth: normalizeHydrationTruth(hydrationTruth),
    ordinaryThreadSummary,
    activeTopic,
    activeGoal,
    activeMode,
    focusRefs,
    openLoop,
    nextStep,
    awaiting: 'user',
    unresolvedIntent: normalizeUnresolvedIntent(unresolvedIntent),
    lastTurnType: 'ordinary',
  };
}

export function rebuildRuntimeTurnStateFromCanonicalTranscript({
  exactMessages = [],
  sessionId = null,
  constructId = null,
} = {}) {
  const normalizedSessionId = cleanWhitespace(sessionId) || null;
  const normalizedConstructId = cleanWhitespace(constructId) || null;
  if (!normalizedSessionId || !normalizedConstructId) {
    return null;
  }

  const transcriptMessages = (Array.isArray(exactMessages) ? exactMessages : [])
    .filter(
      (message) =>
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0,
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || null,
      metadata: message.metadata || null,
    }));

  if (transcriptMessages.length === 0) {
    return null;
  }

  let rebuiltState = null;
  let pendingUserTurn = null;
  let bestMetadataCandidate = null;

  for (const message of transcriptMessages) {
    if (message.role === 'user') {
      pendingUserTurn = message;
      continue;
    }

    const metadataCandidate = buildRuntimeTurnStateCandidateFromAssistantMessage(
      message,
      {
        sessionId: normalizedSessionId,
        constructId: normalizedConstructId,
      },
    );
    bestMetadataCandidate = compareRuntimeTurnStateCandidates(
      bestMetadataCandidate,
      metadataCandidate,
    );

    if (metadataCandidate?.runtimeTurnState) {
      rebuiltState = metadataCandidate.runtimeTurnState;
      pendingUserTurn = null;
      continue;
    }

    if (!pendingUserTurn?.content) {
      continue;
    }

    rebuiltState = computeNextRuntimeTurnState({
      previousState: rebuiltState,
      userMessage: pendingUserTurn.content,
      assistantMessage: message.content,
      continuityClass: inferContinuityClassFromAssistantMessage(message),
      sessionId: normalizedSessionId,
      constructId: normalizedConstructId,
      constructRevision:
        rebuiltState?.constructRevision ||
        buildConstructRevision({ constructId: normalizedConstructId }),
      hydrationTruth: 'full',
      now: message.timestamp || new Date().toISOString(),
    });
    pendingUserTurn = null;
  }

  const authoritativeState = normalizeRuntimeTurnState(
    rebuiltState || bestMetadataCandidate?.runtimeTurnState,
    {
      sessionId: normalizedSessionId,
      constructId: normalizedConstructId,
      hydrationTruth: 'full',
    },
  );

  if (
    !authoritativeState?.assistantTurnId ||
    authoritativeState.sessionId !== normalizedSessionId ||
    authoritativeState.constructId !== normalizedConstructId ||
    authoritativeState.hydrationTruth !== 'full'
  ) {
    return null;
  }

  return authoritativeState;
}

export function normalizeRuntimeResumeRequest(request = {}) {
  return {
    continuityExpected: request?.continuityExpected === true || request?.continuity_expected === true,
    resumeFromTurnId: normalizeAssistantTurnId(
      request?.resumeFromTurnId || request?.resume_from_turn_id,
    ),
    resumeFromContinuitySeq: (() => {
      const numeric = Number(
        request?.resumeFromContinuitySeq ?? request?.resume_from_continuity_seq,
      );
      return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
    })(),
    resumeTailHash: normalizeTailHash(
      request?.resumeTailHash || request?.resume_tail_hash,
    ),
    resumeConstructRevision: normalizeConstructRevision(
      request?.resumeConstructRevision || request?.resume_construct_revision,
      request?.constructId || request?.construct_id || null,
    ),
    resumeSourceSeat:
      cleanWhitespace(request?.resumeSourceSeat || request?.resume_source_seat) === 'codex'
        ? 'codex'
        : cleanWhitespace(request?.resumeSourceSeat || request?.resume_source_seat) === 'chatty'
          ? 'chatty'
          : null,
    hydrationTruth:
      cleanWhitespace(request?.hydrationTruth || request?.hydration_truth) === 'full'
        ? 'full'
        : null,
  };
}

export function validateRuntimeTurnStatePacket({
  runtimeTurnState = null,
  sessionId = null,
  constructId = null,
  hydration = null,
  hydrationComplete = null,
  latestAssistantTurn = null,
  assistantTailContent = null,
} = {}) {
  const hydratedThreadId = cleanWhitespace(sessionId) || null;
  const hydratedConstructId = cleanWhitespace(constructId) || null;
  const latestAssistantContent =
    typeof assistantTailContent === 'string'
      ? assistantTailContent
      : typeof latestAssistantTurn?.content === 'string'
        ? latestAssistantTurn.content
        : '';
  const normalizedState = runtimeTurnState
    ? normalizeRuntimeTurnState(runtimeTurnState, {
        sessionId: hydratedThreadId,
        constructId: hydratedConstructId,
        hydrationTruth: hydration === 'full' ? 'full' : runtimeTurnState?.hydrationTruth,
        assistantTailContent: latestAssistantContent,
      })
    : null;
  const packetThreadId = normalizedState?.canonicalThreadId || normalizedState?.sessionId || null;
  const expectedTailHash = normalizedState
    ? buildRuntimeTailHash({
        canonicalThreadId: packetThreadId,
        constructId: normalizedState.constructId,
        constructRevision: normalizedState.constructRevision,
        continuitySeq: normalizedState.continuitySeq,
        assistantTurnId: normalizedState.assistantTurnId,
        assistantTailContent: latestAssistantContent,
      })
    : null;
  const hydrationIsFull =
    hydration === 'full' &&
    hydrationComplete === true &&
    normalizedState?.hydrationTruth === 'full';
  const threadMatch = Boolean(normalizedState && packetThreadId === hydratedThreadId);
  const constructMatch = Boolean(
    normalizedState && normalizedState.constructId === hydratedConstructId,
  );
  const assistantTurnIdMatch = Boolean(
    normalizedState &&
      normalizedState.assistantTurnId &&
      (!latestAssistantTurn?.id || latestAssistantTurn.id === normalizedState.assistantTurnId),
  );
  const tailHashMatch = Boolean(
    normalizedState?.tailHash &&
      expectedTailHash &&
      normalizedState.tailHash === expectedTailHash,
  );

  let failureReason = null;
  if (!hydrationIsFull) {
    failureReason = 'hydration_not_full';
  } else if (!normalizedState) {
    failureReason = 'runtime_turn_state_missing';
  } else if (!threadMatch) {
    failureReason = 'thread_mismatch';
  } else if (!constructMatch) {
    failureReason = 'construct_mismatch';
  } else if (!normalizedState.assistantTurnId) {
    failureReason = 'assistant_turn_missing';
  } else if (!assistantTurnIdMatch) {
    failureReason = 'assistant_turn_mismatch';
  } else if (!tailHashMatch) {
    failureReason = 'tail_hash_mismatch';
  }

  return {
    valid: !failureReason,
    failureReason,
    runtimeTurnState: !failureReason ? normalizedState : null,
    normalizedRuntimeTurnState: normalizedState,
    expectedTailHash,
    latestAssistantContentHash: latestAssistantContent
      ? hashParts([latestAssistantContent]).slice(0, MAX_TAIL_HASH_CHARS)
      : null,
    hydration,
    hydrationComplete: hydrationComplete === true,
    hydrationTruth: normalizedState?.hydrationTruth || null,
    threadMatch,
    constructMatch,
    assistantTurnIdMatch,
    tailHashMatch,
    continuitySeqMatch: true,
  };
}

export function validateRuntimeResumeRequest({
  runtimeTurnState = null,
  resumeRequest = null,
  sessionId = null,
  constructId = null,
} = {}) {
  const normalizedResume = normalizeRuntimeResumeRequest(resumeRequest || {});
  const normalizedState = runtimeTurnState
    ? normalizeRuntimeTurnState(runtimeTurnState, { sessionId, constructId })
    : null;
  const expected = normalizedResume.continuityExpected === true;
  const hydratedThreadId = cleanWhitespace(sessionId) || null;
  const hydratedConstructId = cleanWhitespace(constructId) || null;
  const constructMatch = normalizedState
    ? normalizedState.constructId === hydratedConstructId
    : false;
  const threadMatch = normalizedState
    ? (normalizedState.canonicalThreadId || normalizedState.sessionId) === hydratedThreadId
    : false;
  const constructRevisionMatch =
    !normalizedResume.resumeConstructRevision ||
    (normalizedState?.constructRevision || null) === normalizedResume.resumeConstructRevision;
  const assistantTurnIdMatch =
    !normalizedResume.resumeFromTurnId ||
    (normalizedState?.assistantTurnId || null) === normalizedResume.resumeFromTurnId;
  const continuitySeqMatch =
    normalizedResume.resumeFromContinuitySeq == null ||
    (normalizedState?.continuitySeq ?? null) === normalizedResume.resumeFromContinuitySeq;
  const tailHashMatch =
    !normalizedResume.resumeTailHash ||
    (normalizedState?.tailHash || null) === normalizedResume.resumeTailHash;
  const hydration = normalizedState?.hydrationTruth || normalizedResume.hydrationTruth || 'unproven';
  const hydrationComplete = hydration === 'full';
  const hasResumeAnchor = Boolean(
    normalizedResume.resumeFromTurnId ||
      normalizedResume.resumeFromContinuitySeq != null ||
      normalizedResume.resumeTailHash,
  );
  const staleSeatRejected = Boolean(
    expected &&
      normalizedState &&
      hasResumeAnchor &&
      (
        (normalizedResume.resumeFromTurnId &&
          normalizedState.assistantTurnId &&
          normalizedResume.resumeFromTurnId !== normalizedState.assistantTurnId) ||
        (normalizedResume.resumeTailHash &&
          normalizedState.tailHash &&
          normalizedResume.resumeTailHash !== normalizedState.tailHash) ||
        (normalizedResume.resumeFromContinuitySeq != null &&
          normalizedState.continuitySeq != null &&
          normalizedResume.resumeFromContinuitySeq !== normalizedState.continuitySeq)
      ),
  );

  let failureReason = null;
  if (expected) {
    if (!hasResumeAnchor) {
      failureReason = 'resume_anchor_missing';
    } else if (!normalizedState) {
      failureReason = 'resume_state_missing';
    } else if (!threadMatch) {
      failureReason = 'thread_mismatch';
    } else if (!constructMatch) {
      failureReason = 'construct_mismatch';
    } else if (!constructRevisionMatch) {
      failureReason = 'construct_revision_mismatch';
    } else if (!assistantTurnIdMatch) {
      failureReason = 'assistant_turn_mismatch';
    } else if (!continuitySeqMatch) {
      failureReason = 'continuity_seq_mismatch';
    } else if (!tailHashMatch) {
      failureReason = 'tail_hash_mismatch';
    } else if (!hydrationComplete) {
      failureReason = 'hydration_unproven';
    }
  }

  return {
    continuityExpected: expected,
    resumeSourceSeat: normalizedResume.resumeSourceSeat,
    continuityRestored:
      expected &&
      !failureReason &&
      Boolean(normalizedState) &&
      constructMatch &&
      threadMatch,
    continuitySource: expected && !failureReason ? 'runtimeTurnState' : 'none',
    continuedFromTurnId:
      normalizedState?.assistantTurnId ||
      normalizedResume.resumeFromTurnId ||
      null,
    continuitySeq: normalizedState?.continuitySeq ?? normalizedResume.resumeFromContinuitySeq ?? null,
    hydration,
    hydrationComplete,
    constructMatch,
    threadMatch,
    continuitySeqMatch,
    assistantTurnIdMatch,
    tailHashMatch,
    staleSeatRejected,
    failureReason,
    runtimeTurnState: expected && !failureReason ? normalizedState : null,
    request: normalizedResume,
  };
}

export const __test__ = {
  buildAssistantTurnId,
  buildConstructRevision,
  buildRuntimeTailHash,
  buildRuntimeTurnStateCandidateFromAssistantMessage,
  cleanBoundedText,
  compareRuntimeTurnStateCandidates,
  deriveUnresolvedIntent,
  deriveActiveTopic,
  deriveOrdinaryThreadSummary,
  deriveActiveGoal,
  deriveActiveMode,
  deriveFocusRefs,
  deriveOpenLoop,
  deriveNextStep,
  inferContinuityClassFromAssistantMessage,
  isLowSignalOrdinaryMessage,
  maybeParseMetadata,
  normalizeRuntimeResumeRequest,
  rebuildRuntimeTurnStateFromCanonicalTranscript,
  toEpochMs,
  validateRuntimeResumeRequest,
  validateRuntimeTurnStatePacket,
};
