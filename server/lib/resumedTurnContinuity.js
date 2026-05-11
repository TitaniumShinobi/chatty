const RESUMED_TURN_ORIENTATION_RE =
  /\b(?:what were we working on|what were we talking about|can you remind me|remind me what|to recap|in summary|as mentioned earlier|as stated earlier)\b/i;
const RESUMED_TURN_GENERIC_GREETING_RE =
  /\b(?:hello!?|hi!?|hey!?|good (?:morning|afternoon|evening)|how can i help(?: you)?(?: today)?|what can i help you with(?: today)?|i'?m here to help(?: you)?(?: today)?|i'?m here to assist(?: you)?(?: with [^.?!]+)?|please feel free to (?:share|ask)|i will do my best to provide|i understand(?: that)? you (?:want|would like|need)|let'?s keep it focused on)\b/i;
const RESUMED_TURN_PREMATURE_CLOSURE_RE =
  /\b(?:no further action required|conversation has been concluded|nothing more (?:to do|required)|all set|done here|(?:we(?: are|'re)|it(?: is|'s)|that(?: is|'s)) (?:finished|completed|done))\b/i;
const RESUMED_TURN_META_CONTINUITY_PATTERNS = [
  /\bwithout interruption\b/i,
  /\blive thought exchange\b/i,
  /\binteraction space\b/i,
  /\brelational (?:dialogue|continuity)\b/i,
  /\bcontinuous exchange\b/i,
  /\bprevious(?:ly)? (?:agreed|established)\b/i,
  /\bmaintain (?:this )?(?:relational )?(?:dialogue|conversation) consistency\b/i,
  /\bdirect responses? to your immediate quer(?:y|ies)\b/i,
  /\bno (?:self-)?introduction\b/i,
];
const TRAJECTORY_STOPWORDS = new Set([
  'a', 'an', 'and', 'apply', 'are', 'as', 'at', 'backend', 'be', 'but', 'by', 'continue',
  'continuity', 'corrective', 'dialogue', 'exactly', 'finish', 'for', 'from', 'goal', 'how',
  'implement', 'into', 'is', 'it', 'line', 'loop', 'minimal', 'move', 'next', 'once', 'only',
  'open', 'plan', 'please', 'proof', 'prompt', 'rerun', 'same', 'seam', 'step', 'summary',
  'that', 'the', 'then', 'this', 'thread', 'through', 'to', 'turn', 'user', 'we', 'with', 'work',
  'working', 'you', 'your',
]);

function cleanWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lowerCaseFirst(value = '') {
  const text = cleanWhitespace(value);
  if (!text) return '';
  return `${text.slice(0, 1).toLowerCase()}${text.slice(1)}`;
}

function clipText(value = '', limit = 180) {
  const text = cleanWhitespace(value);
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function stripPlanScaffolding(value = '') {
  return cleanWhitespace(
    String(value || '')
      .replace(/^PLEASE IMPLEMENT THIS PLAN:\s*/i, '')
      .replace(/\bSummary\b[:\s-]*/i, ' ')
      .replace(/^[A-Z][A-Za-z\s-]{3,80}\s+(?=Apply\b)/, '')
      .replace(/\b(?:Return only|Rules|Requirements|Key Changes|Test Plan|Assumptions)\b[\s\S]*$/i, ' ')
      .replace(/\bPrompt\s+\d+\b/gi, ' ')
  );
}

function firstClause(value = '', limit = 160) {
  const stripped = stripPlanScaffolding(value);
  if (!stripped) return '';
  const clause = stripped.split(/(?<=[.!?])\s+/)[0] || stripped;
  return clipText(clause, limit);
}

function renderNextStepSentence(nextStep = '') {
  const normalized = lowerCaseFirst(nextStep);
  if (!normalized) return '';
  if (/^(?:do not|don't)\b/i.test(normalized)) {
    return `The next move is clear: ${normalized}.`;
  }
  return `The next move is to ${normalized.replace(/^to\s+/i, '')}.`;
}

function extractTrajectoryKeywords(runtimeTurnState = {}) {
  const source = [
    runtimeTurnState?.activeGoal,
    runtimeTurnState?.openLoop,
    runtimeTurnState?.nextStep,
  ]
    .map((value) => stripPlanScaffolding(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return Array.from(
    new Set(
      source
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4 && !TRAJECTORY_STOPWORDS.has(token))
    )
  ).slice(0, 16);
}

function countTrajectoryOverlap(text = '', runtimeTurnState = {}) {
  const haystack = cleanWhitespace(text).toLowerCase();
  if (!haystack) return 0;
  return extractTrajectoryKeywords(runtimeTurnState).filter((token) => haystack.includes(token)).length;
}

function countMetaContinuityHits(text = '') {
  return RESUMED_TURN_META_CONTINUITY_PATTERNS.reduce(
    (count, pattern) => (pattern.test(text) ? count + 1 : count),
    0,
  );
}

export function buildDeterministicResumedTurnFallback({
  runtimeTurnState = null,
  userMessage = '',
} = {}) {
  if (!runtimeTurnState || typeof runtimeTurnState !== 'object') {
    return null;
  }

  const goal = firstClause(runtimeTurnState.activeGoal || runtimeTurnState.ordinaryThreadSummary || '');
  const nextStep = firstClause(runtimeTurnState.nextStep || runtimeTurnState.openLoop || '');
  const openLoop = firstClause(runtimeTurnState.openLoop || '');
  const awaiting = cleanWhitespace(runtimeTurnState.awaiting || '');
  const normalizedUserMessage = cleanWhitespace(userMessage).toLowerCase();

  if (!goal && !nextStep && !openLoop) {
    return null;
  }

  const lines = [];
  const goalIsDirective = /\bapply\s+only\b/i.test(goal);
  if (goal && !goalIsDirective && goal !== nextStep) {
    lines.push(`We are still on ${lowerCaseFirst(goal)}.`);
  }
  if (nextStep) {
    lines.push(renderNextStepSentence(nextStep));
  } else if (openLoop) {
    lines.push(`The open loop I am carrying is ${lowerCaseFirst(openLoop)}.`);
  }
  if (!nextStep && awaiting === 'user' && normalizedUserMessage === 'continue') {
    lines.push('I am carrying that forward directly from the canonical tail.');
  }

  const text = lines.join(' ').trim();
  if (!text) return null;

  return {
    ok: true,
    source: 'deterministic_runtime_continuity_fallback',
    text,
    goal,
    nextStep,
    openLoop,
  };
}

export function evaluateResumedTurnContinuityIntegrity({
  aiResponse = '',
  continuityResume = null,
  runtimeTurnState = null,
} = {}) {
  if (continuityResume?.continuityRestored !== true) {
    return {
      applies: false,
      status: 'skipped',
      reasons: [],
      metaContinuityHits: 0,
      trajectoryOverlap: 0,
    };
  }

  const text = String(aiResponse || '').trim();
  const reasons = [];
  if (RESUMED_TURN_ORIENTATION_RE.test(text)) {
    reasons.push('recap_or_orientation_after_resume');
  }
  if (RESUMED_TURN_GENERIC_GREETING_RE.test(text)) {
    reasons.push('generic_greeting_after_resume');
  }
  if (
    RESUMED_TURN_PREMATURE_CLOSURE_RE.test(text) &&
    cleanWhitespace(runtimeTurnState?.nextStep || runtimeTurnState?.openLoop || '')
  ) {
    reasons.push('premature_closure_after_resume');
  }

  const metaContinuityHits = countMetaContinuityHits(text);
  const trajectoryOverlap = countTrajectoryOverlap(text, runtimeTurnState);
  if (metaContinuityHits >= 2 && trajectoryOverlap === 0) {
    reasons.push('meta_continuity_boilerplate_after_resume');
  }

  return {
    applies: true,
    status: reasons.length > 0 ? 'fail' : 'pass',
    reasons,
    metaContinuityHits,
    trajectoryOverlap,
  };
}
