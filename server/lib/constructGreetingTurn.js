const GREETING_POSTURES = new Set([
  'excited',
  'tentative',
  'annoyed',
  'playful',
  'formal',
  'worried',
  'presence_check',
  'exaggerated_chaotic',
]);

const STYLE_DIMENSIONS = ['warmth', 'playfulness', 'precision', 'softness', 'bluntness', 'formality'];

const STYLE_KEYWORDS = {
  warmth: [
    'warm',
    'gentle',
    'kind',
    'tender',
    'supportive',
    'close',
    'caring',
    'steady',
    'calm',
    'soft',
    'quiet',
    'patient',
  ],
  playfulness: [
    'playful',
    'bright',
    'teasing',
    'mischief',
    'mischievous',
    'joke',
    'joking',
    'laugh',
    'grin',
    'spark',
    'light',
    'cheeky',
  ],
  precision: [
    'precise',
    'exact',
    'careful',
    'rigorous',
    'clear',
    'technical',
    'structured',
    'methodical',
    'deliberate',
    'focused',
  ],
  softness: [
    'soft',
    'quiet',
    'still',
    'easy',
    'gentle',
    'slow',
    'hush',
    'calm',
    'tender',
  ],
  bluntness: [
    'blunt',
    'sharp',
    'direct',
    'no nonsense',
    'terse',
    'clipped',
    'unsentimental',
    'cut through',
  ],
  formality: [
    'formal',
    'professional',
    'proper',
    'measured',
    'composed',
    'courteous',
    'reserved',
    'dignified',
    'polished',
  ],
};

const TRAIT_ALIASES = {
  calm: { warmth: 0.12, softness: 0.16, formality: 0.08 },
  supportive: { warmth: 0.18, softness: 0.08 },
  caring: { warmth: 0.2, softness: 0.1 },
  gentle: { warmth: 0.14, softness: 0.18 },
  warm: { warmth: 0.2, softness: 0.08 },
  playful: { playfulness: 0.22 },
  bright: { playfulness: 0.14, warmth: 0.06 },
  mischievous: { playfulness: 0.18, bluntness: 0.04 },
  precise: { precision: 0.22 },
  careful: { precision: 0.16, formality: 0.06 },
  methodical: { precision: 0.18, formality: 0.08 },
  direct: { precision: 0.12, bluntness: 0.18 },
  blunt: { bluntness: 0.24 },
  sharp: { bluntness: 0.18, precision: 0.08 },
  formal: { formality: 0.24 },
  professional: { formality: 0.2, precision: 0.08 },
  composed: { formality: 0.16, softness: 0.06 },
  quiet: { softness: 0.16, warmth: 0.04 },
  soft: { softness: 0.22 },
};

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeConstructDisplayName(constructId = '', constructDisplayName = '', gptConfig = {}) {
  const explicit = normalizeWhitespace(
    constructDisplayName ||
      gptConfig?.displayName ||
      gptConfig?.fullName ||
      gptConfig?.name ||
      gptConfig?.configJson?.displayName ||
      gptConfig?.configJson?.fullName
  );
  if (explicit) return explicit;

  const base = normalizeWhitespace(String(constructId || '').replace(/-\d+$/, '').replace(/[_-]+/g, ' '));
  if (!base) return 'the active construct';
  return base.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeGreetingInput(userMessage = '') {
  const raw = String(userMessage || '').trim();
  if (!raw) {
    return {
      raw,
      normalized: '',
      stripped: '',
      strippedNoPunctuation: '',
    };
  }

  const normalized = raw
    .toLowerCase()
    .replace(/[^\w\s?!.,'’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const strippedAddressee = normalized.replace(/^[a-z][a-z0-9_-]{1,32}[,:]\s+/, '');
  const strippedNoPunctuation = strippedAddressee
    .replace(/[?!.,'’-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    raw,
    normalized,
    stripped: strippedAddressee,
    strippedNoPunctuation,
  };
}

function countMatches(text = '', pattern) {
  const matches = String(text || '').match(pattern);
  return matches ? matches.length : 0;
}

function buildEmptyGreetingDetection() {
  return {
    isGreetingContactTurn: false,
    posture: null,
    normalizedGreeting: '',
    energySignals: {
      exclamationCount: 0,
      questionCount: 0,
      uppercaseRatio: 0,
      hasEllipsis: false,
      hasRepeatedLetters: false,
      hasRepeatedVowels: false,
      matchedGreeting: false,
      matchedPresenceCheck: false,
    },
  };
}

export function detectConstructGreetingTurn(userMessage = '') {
  const normalized = normalizeGreetingInput(userMessage);
  if (!normalized.raw) return buildEmptyGreetingDetection();

  const exclamationCount = countMatches(normalized.raw, /!/g);
  const questionCount = countMatches(normalized.raw, /\?/g);
  const uppercaseCount = countMatches(normalized.raw, /[A-Z]/g);
  const alphaCount = countMatches(normalized.raw, /[A-Za-z]/g);
  const uppercaseRatio = alphaCount > 0 ? uppercaseCount / alphaCount : 0;
  const hasEllipsis = /\.{3,}|…/.test(normalized.raw);
  const hasRepeatedLetters = /(.)\1{2,}/i.test(normalized.strippedNoPunctuation);
  const hasRepeatedVowels = /(a{3,}|e{3,}|i{3,}|o{3,}|u{3,}|y{3,})/i.test(normalized.strippedNoPunctuation);
  const matchedGreeting =
    /^(hello|hi|hey|yo|hiya|heya|hii+|heyy+|yoo+|good morning|good afternoon|good evening|greetings)\b/.test(
      normalized.stripped,
    );
  const matchedPresenceCheck = /^(you there|are you there|still there|anyone there)\b/.test(
    normalized.strippedNoPunctuation,
  );

  const wordCount = normalized.strippedNoPunctuation ? normalized.strippedNoPunctuation.split(' ').length : 0;
  const isGreetingContactTurn =
    (matchedGreeting || matchedPresenceCheck) &&
    wordCount <= 5 &&
    normalized.stripped.length <= 48;

  if (!isGreetingContactTurn) {
    return {
      ...buildEmptyGreetingDetection(),
      normalizedGreeting: normalized.strippedNoPunctuation,
      energySignals: {
        exclamationCount,
        questionCount,
        uppercaseRatio,
        hasEllipsis,
        hasRepeatedLetters,
        hasRepeatedVowels,
        matchedGreeting,
        matchedPresenceCheck,
      },
    };
  }

  let posture = 'presence_check';
  if (/\b(are you okay|you okay|please answer|please respond|please pick up)\b/.test(normalized.strippedNoPunctuation)) {
    posture = 'worried';
  } else if (/^(good morning|good afternoon|good evening|greetings)\b/.test(normalized.strippedNoPunctuation)) {
    posture = 'formal';
  } else if (matchedPresenceCheck) {
    posture = 'presence_check';
  } else if ((uppercaseRatio >= 0.65 && questionCount >= 3) || (questionCount + exclamationCount >= 5 && (hasRepeatedLetters || hasRepeatedVowels))) {
    posture = 'exaggerated_chaotic';
  } else if (questionCount >= 2) {
    posture = 'annoyed';
  } else if (exclamationCount >= 2) {
    posture = 'excited';
  } else if (hasEllipsis || questionCount === 1) {
    posture = 'tentative';
  } else if (/^(yo|hiya|hii+|heyy+|yoo+)/.test(normalized.strippedNoPunctuation) || hasRepeatedLetters || hasRepeatedVowels) {
    posture = 'playful';
  }

  return {
    isGreetingContactTurn: true,
    posture: GREETING_POSTURES.has(posture) ? posture : 'presence_check',
    normalizedGreeting: normalized.strippedNoPunctuation,
    energySignals: {
      exclamationCount,
      questionCount,
      uppercaseRatio,
      hasEllipsis,
      hasRepeatedLetters,
      hasRepeatedVowels,
      matchedGreeting,
      matchedPresenceCheck,
    },
  };
}

function stringifyRecentMessages(recentMessages = []) {
  return Array.isArray(recentMessages)
    ? recentMessages
        .filter((message) => message?.role === 'assistant' && typeof message?.content === 'string')
        .map((message) => normalizeWhitespace(message.content))
        .filter(Boolean)
        .slice(-4)
    : [];
}

function collectVoiceSources({ gptConfig = {}, identityBundle = null, recentMessages = [] } = {}) {
  const identity = identityBundle?.identity || {};
  const capsule = identityBundle?.capsule || {};
  const configJson = gptConfig?.configJson && typeof gptConfig.configJson === 'object' ? gptConfig.configJson : {};
  const recentAssistantMessages = stringifyRecentMessages(recentMessages);

  const sources = [];
  const pushText = (text, label, weight = 0.1) => {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return;
    sources.push({ label, weight, text: normalized });
  };

  pushText(identity?.prompt, 'identity_prompt', 0.32);
  pushText(identity?.conditioning, 'identity_conditioning', 0.2);
  pushText(capsule?.identity?.instructions, 'capsule_identity', 0.18);
  pushText(capsule?.identity?.conditioning, 'capsule_conditioning', 0.12);
  pushText(capsule?.signatures?.linguistic_sigil?.signature_phrase, 'capsule_signature', 0.18);
  pushText(gptConfig?.description, 'gpt_description', 0.1);
  pushText(gptConfig?.conditioning, 'gpt_conditioning', 0.1);
  pushText(gptConfig?.fullName, 'gpt_full_name', 0.04);
  pushText((gptConfig?.tags || []).join(' '), 'gpt_tags', 0.08);
  pushText((gptConfig?.categories || []).join(' '), 'gpt_categories', 0.04);
  pushText((gptConfig?.summaryCapabilities || []).join(' '), 'gpt_capabilities', 0.06);
  pushText((configJson?.tags || []).join(' '), 'config_tags', 0.06);
  pushText((configJson?.categories || []).join(' '), 'config_categories', 0.04);
  pushText((configJson?.summaryCapabilities || []).join(' '), 'config_capabilities', 0.04);
  for (const message of recentAssistantMessages) {
    pushText(message, 'recent_assistant_turn', 0.16);
  }

  return {
    textSources: sources,
    capsule,
    recentAssistantMessages,
  };
}

function addKeywordScores(scores, text = '', weight = 0.1) {
  const lower = String(text || '').toLowerCase();
  if (!lower) return;

  for (const dimension of STYLE_DIMENSIONS) {
    const keywords = STYLE_KEYWORDS[dimension] || [];
    let hits = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) hits += 1;
    }
    if (hits > 0) {
      scores[dimension] += Math.min(0.3, hits * weight);
    }
  }
}

function addTraitScores(scores, traitSource = {}) {
  if (!traitSource || typeof traitSource !== 'object' || Array.isArray(traitSource)) return;
  for (const [key, value] of Object.entries(traitSource)) {
    const alias = TRAIT_ALIASES[String(key || '').trim().toLowerCase()];
    if (!alias) continue;
    const magnitude = Number.isFinite(value) ? Math.max(0, Math.min(Number(value), 1)) : 0.5;
    for (const [dimension, delta] of Object.entries(alias)) {
      scores[dimension] += delta * magnitude;
    }
  }
}

function collectTraitSources(capsule = {}) {
  return [
    capsule?.traits,
    capsule?.personality,
    capsule?.personality?.traits,
    capsule?.identity?.traits,
  ];
}

function normalizeScores(scores) {
  const normalized = {};
  for (const dimension of STYLE_DIMENSIONS) {
    normalized[dimension] = clampScore(scores[dimension]);
  }
  return normalized;
}

export function buildConstructGreetingVoiceContext({
  constructId = '',
  constructDisplayName = '',
  gptConfig = {},
  identityBundle = null,
  recentMessages = [],
} = {}) {
  const displayName = normalizeConstructDisplayName(constructId, constructDisplayName, gptConfig);
  const { textSources, capsule, recentAssistantMessages } = collectVoiceSources({
    gptConfig,
    identityBundle,
    recentMessages,
  });
  const scores = Object.fromEntries(STYLE_DIMENSIONS.map((dimension) => [dimension, 0]));

  for (const source of textSources) {
    addKeywordScores(scores, source.text, source.weight);
  }
  for (const traitSource of collectTraitSources(capsule)) {
    addTraitScores(scores, traitSource);
  }

  const style = normalizeScores(scores);
  const dominantTraits = Object.entries(style)
    .filter(([, value]) => value >= 0.18)
    .sort((left, right) => right[1] - left[1])
    .map(([dimension]) => dimension)
    .slice(0, 3);

  const identityAvailable =
    Boolean(textSources.length) ||
    Boolean(recentAssistantMessages.length) ||
    Boolean(capsule && typeof capsule === 'object' && Object.keys(capsule).length > 0);
  const confidence = dominantTraits.length > 0
    ? Math.max(...dominantTraits.map((trait) => style[trait] || 0))
    : 0;
  const lowConfidence = !identityAvailable || confidence < 0.18;

  return {
    constructId,
    constructDisplayName: displayName,
    identityAvailable,
    lowConfidence,
    confidence: clampScore(confidence),
    style,
    dominantTraits,
    signature:
      normalizeWhitespace(capsule?.signatures?.linguistic_sigil?.signature_phrase) || null,
    recentVoiceNotes: recentAssistantMessages.slice(-3),
    sourcesUsed: textSources.map((source) => source.label),
  };
}

function describeGreetingStyle(voiceContext = {}) {
  if (voiceContext?.lowConfidence) return ['minimal', 'neutral'];
  const dominant = Array.isArray(voiceContext?.dominantTraits) ? voiceContext.dominantTraits : [];
  if (dominant.length > 0) return dominant;

  const style = voiceContext?.style || {};
  const sorted = Object.entries(style)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([dimension]) => dimension)
    .slice(0, 2);
  return sorted.length > 0 ? sorted : ['neutral'];
}

function buildEnergyInstruction(posture = 'presence_check') {
  switch (posture) {
    case 'excited':
      return 'Meet the energy lightly and warmly.';
    case 'tentative':
      return 'Answer softly and reassure presence without over-explaining.';
    case 'annoyed':
      return 'Stay calm, direct, and non-defensive.';
    case 'playful':
      return 'Answer with a little lightness, not a performance.';
    case 'formal':
      return 'Answer in a composed, courteous tone.';
    case 'worried':
      return 'Answer with steady reassurance and calm presence.';
    case 'exaggerated_chaotic':
      return 'Mirror the energy briefly, then steady it.';
    case 'presence_check':
    default:
      return 'Answer as a simple presence check.';
  }
}

export function buildGreetingTurnDirective({
  posture = 'presence_check',
  voiceContext = null,
  constructDisplayName = '',
} = {}) {
  const activeName = normalizeWhitespace(constructDisplayName || voiceContext?.constructDisplayName);
  const style = describeGreetingStyle(voiceContext);
  const styleText = style.join(', ');
  const confidenceRule = voiceContext?.lowConfidence
    ? 'Keep it minimal and neutral rather than inventing extra personality.'
    : `Lean into this construct voice: ${styleText}.`;

  return `## GREETING CONTACT TURN
The latest user message is a plain greeting/contact turn with posture "${posture}".
Reply as ${activeName || 'the active construct'} in one short first-person line.
${buildEnergyInstruction(posture)}
${confidenceRule}
Stay presence-forward.
Do not mention models, providers, tools, capabilities, policies, files, transcripts, documents, or orchestration.
Do not narrate yourself in third person.
Do not offer a help menu.`;
}

function resolveGreetingOpener(posture = 'presence_check', voiceContext = {}) {
  const style = voiceContext?.style || {};
  if (posture === 'formal' || style.formality >= 0.42) return 'Hello.';
  if (posture === 'playful' || style.playfulness >= 0.45) return 'Hey.';
  if (posture === 'excited') return 'Hey.';
  if (posture === 'tentative') return 'Hey.';
  if (posture === 'exaggerated_chaotic') return 'Hey.';
  return "I'm here.";
}

function resolveGreetingTail(posture = 'presence_check', voiceContext = {}) {
  const style = voiceContext?.style || {};
  const lowConfidence = voiceContext?.lowConfidence === true;

  if (lowConfidence) {
    if (posture === 'formal') return "I'm here.";
    if (posture === 'tentative' || posture === 'worried') return "I'm here with you.";
    if (posture === 'annoyed') return 'Go ahead.';
    if (posture === 'playful' || posture === 'excited' || posture === 'exaggerated_chaotic') return "I'm here.";
    return "I'm here.";
  }

  if (style.formality >= 0.42) return "I'm here and listening.";
  if (style.bluntness >= 0.48) return posture === 'annoyed' ? 'Go on.' : "I'm here. Say it.";
  if (style.precision >= 0.42) return "I'm here and listening.";
  if (style.playfulness >= 0.45) return posture === 'exaggerated_chaotic' ? "I'm here. Easy." : "I'm here.";
  if (style.warmth >= 0.4 && style.softness >= 0.32) return "I'm right here with you.";
  if (style.softness >= 0.42) return posture === 'exaggerated_chaotic' ? "I'm here. Easy." : "I'm here with you.";
  if (style.warmth >= 0.34) return "I'm here with you.";
  if (posture === 'worried') return "I'm here with you.";
  if (posture === 'presence_check') return "I'm here.";
  return "I'm here.";
}

export function buildDeterministicConstructGreetingFallback({
  posture = 'presence_check',
  voiceContext = null,
  constructDisplayName = '',
} = {}) {
  const activeName = normalizeWhitespace(constructDisplayName || voiceContext?.constructDisplayName);
  const opener = resolveGreetingOpener(posture, voiceContext);
  const tail = resolveGreetingTail(posture, voiceContext);

  let text = opener;
  if (opener === "I'm here.") {
    text = tail === "I'm here." ? opener : `${opener} ${tail}`;
  } else {
    text = `${opener} ${tail}`;
  }

  if (!activeName || voiceContext?.lowConfidence) {
    return normalizeWhitespace(text);
  }

  const style = voiceContext?.style || {};
  if (style.precision >= 0.52 && posture === 'presence_check') {
    return normalizeWhitespace(`I'm here and listening.`);
  }

  return normalizeWhitespace(text);
}
