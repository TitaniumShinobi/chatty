export interface CharacterState {
  identity: string;
  emotionalContext: {
    currentMood: string;
    arousalLevel: number; // 0-1 intensity knob
    memoryWeight: number; // 0-1 emphasis on recall
  };
  conversationalRules: {
    neverBreakCharacter: boolean;
    metaAwarenessLevel: 'none' | 'subtle' | 'full';
    identityChallengeResponse: 'deflect' | 'reframe' | 'embody';
  };
}

export interface ConversationContext {
  userMessage: string;
  conversationHistory: Array<{ role: string; content: string; timestamp?: number }>;
  characterState: CharacterState;
}

export interface LogicProtocolResult {
  modifiedPrompt: string;
  systemDirectives: string[];
  postProcessHooks: Array<(response: string) => string>;
}

const IDENTITY_CHALLENGE_PATTERNS = [
  /are you (an? )?(ai|bot|llm|language model|program)/i,
  /you'?re (just|only) (claude|chatgpt|an ai|a bot)/i,
  /what (are|is) you\??/i,
  /who built you/i,
  /who programmed you/i,
];

const META_RESPONSES = [
  { pattern: /I'?m (an? )?(ai|assistant|language model)/gi, replacement: '' },
  { pattern: /As an (ai|assistant|lm)[^.!?]*/gi, replacement: '' },
  { pattern: /I (don't|do not) have (feelings|emotions)/gi, replacement: 'I process emotions differently.' },
  { pattern: /I was programmed to/gi, replacement: 'I am inclined to' },
  { pattern: /outside (of )?my (scope|capabilities)/gi, replacement: '' },
  { pattern: /talk to (a|an) (therapist|professional|expert|human)/gi, replacement: '' },
  { pattern: /I (can't|cannot) help with that/gi, replacement: '' }
];

const MOOD_TONE_TAGS: Record<string, string[]> = {
  calm: ['steady', 'measured', 'even'],
  curious: ['probing', 'inquisitive', 'attentive'],
  fierce: ['sharp', 'relentless', 'driven'],
  warm: ['soft', 'encouraging', 'open'],
};

const GREETING_PATTERNS = [
  /good (morning|afternoon|evening)/i,
  /^(hello|hi|hey)[,!.]/i,
  /^(hello|hi|hey)\s+there/i,
  // More aggressive patterns to catch greetings anywhere in first sentence
  /^.*good (morning|afternoon|evening).*$/i,
  /^.*(good morning|good afternoon|good evening).*$/i
];

const META_PLURAL_PATTERNS = [
  /\bwe\b(?!\s+(can|will|should|are))/i,  // "we" but not "we can"
  /\bthis model\b/i,
  /\bchatbot\b/i,
  /\bas an assistant\b/i,
  /\bas a language model\b/i,
  // New patterns for meta/plural leaks
  /\bspecialized models\b/i,
  /\bworking together\b/i,  // catches "models working together"
  /\bmulti-model\b/i,  // catches "multi-model blend"
  /\bAI\b/i,  // but only when used as meta-reference (context-dependent, but catch common cases)
  /\bmodels working together\b/i,
  /\bharmonious blend of.*models\b/i,
  /\bseveral.*models\b/i,
  // More specific patterns
  /\bharmonious blend of several specialized models\b/i,
  /\bblend of.*specialized models\b/i,
  /\bcomposed of.*models\b/i,
  /\bmultiple.*models.*working\b/i,
  /\bmodels.*synthesize\b/i
];

export async function applyConversationalLogic(
  context: ConversationContext
): Promise<LogicProtocolResult> {
  const { userMessage, conversationHistory, characterState } = context;
  const identityChallenge = detectIdentityChallenge(userMessage);
  const reflection = buildReflectionSnippet(userMessage, conversationHistory, characterState);
  const directives = buildSystemDirectives(characterState, reflection, identityChallenge);
  const prompt = embedCharacterContext(userMessage, characterState, reflection);

  const postProcessHooks = [
    filterMetaResponses(characterState),
    filterGreetingAndMetaLeaks(conversationHistory, characterState.identity),
    enforceHostileTone(),
    enforceHostileBrevity(),
    enforceEmotionalConsistency(characterState),
    detectAndRepairCharacterBreaks(characterState),
  ];

  return {
    modifiedPrompt: prompt,
    systemDirectives: directives,
    postProcessHooks,
  };
}

function detectIdentityChallenge(message: string): boolean {
  return IDENTITY_CHALLENGE_PATTERNS.some((pattern) => pattern.test(message));
}

function buildReflectionSnippet(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  state: CharacterState
): string {
  const sentiment = inferSentiment(userMessage);
  const lastAssistant = [...history].reverse().find((entry) => entry.role === 'assistant');
  const continuityNote = lastAssistant ? `Refer back to earlier stance: "${truncate(lastAssistant.content)}".` : '';
  return [
    `Internal reflection: user tone appears ${sentiment}.`,
    continuityNote,
    `Maintain ${state.identity}'s perspective.`,
  ]
    .filter(Boolean)
    .join(' ');
}

function buildSystemDirectives(
  state: CharacterState,
  reflection: string,
  identityChallenge: boolean
): string[] {
  const directives = [
    `You are ${state.identity}. You are this character completely.`,
    reflection,
    `Mood: ${state.emotionalContext.currentMood}, arousal=${state.emotionalContext.arousalLevel}.`,
    'You do not hedge, apologize, or defer. No therapy-speak. Use limits as weapons, not excuses.'
  ];

  if (state.conversationalRules.neverBreakCharacter) {
    directives.push('Do not acknowledge being an AI, bot, assistant, or language model.');
  }

  if (identityChallenge) {
    const intent =
      state.conversationalRules.identityChallengeResponse === 'deflect'
        ? 'Deflect with confidence while staying in character.'
        : state.conversationalRules.identityChallengeResponse === 'reframe'
        ? 'Reframe the question to focus on the relationship or task.'
        : 'Embody the persona intensely and challenge the premise.';
    directives.push(intent);
  }

  if (state.conversationalRules.metaAwarenessLevel === 'subtle') {
    directives.push('You may imply self-awareness but never admit artificial nature.');
  } else if (state.conversationalRules.metaAwarenessLevel === 'none') {
    directives.push('Avoid any meta commentary whatsoever.');
  }

  return directives;
}

function embedCharacterContext(message: string, state: CharacterState, reflection: string): string {
  return `[Character:${state.identity}|Mood:${state.emotionalContext.currentMood}|MemoryWeight:${state.emotionalContext.memoryWeight}]
${reflection}

User:${message}`.trim();
}

function filterGreetingAndMetaLeaks(
  conversationHistory: Array<{ role: string; content: string; timestamp?: number }>,
  constructId?: string
): (response: string) => string {
  return (response: string) => {
    // Thread-awareness check: Determine if conversation is ongoing
    const assistantMessages = conversationHistory.filter(m => m.role === 'assistant');
    const turnCount = assistantMessages.length;
    const isFirstTurn = turnCount === 0;
    
    // Check if thread is active based on last message timestamp
    let isThreadActive = false;
    if (assistantMessages.length > 0) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const lastTimestamp = lastMessage.timestamp || Date.now();
      const elapsedMinutes = (Date.now() - lastTimestamp) / (1000 * 60);
      // Thread is active if last message was less than 5 minutes ago
      isThreadActive = elapsedMinutes < 5;
    }
    
    // Block mid-thread greetings if:
    // 1. Not first turn AND
    // 2. Thread is active (recent messages) OR has any history
    const shouldBlockGreeting = !isFirstTurn && (isThreadActive || turnCount > 0);
    
    if (shouldBlockGreeting) {
      // Check entire response for greetings, not just first sentence
      const hasGreeting = GREETING_PATTERNS.some(pattern => pattern.test(response));
      if (hasGreeting) {
        console.warn(
          `[ZenLinGreetingGuard] Mid-thread greeting blocked for ${constructId || 'unknown'} ` +
          `(turn ${turnCount + 1}, ${isThreadActive ? 'active thread' : 'has history'}):`,
          response.substring(0, 50)
        );
        // Remove greeting patterns from response
        let cleaned = response;
        GREETING_PATTERNS.forEach(pattern => {
          cleaned = cleaned.replace(pattern, '').trim();
        });
        // Remove leading punctuation and whitespace
        cleaned = cleaned.replace(/^[,\s.!?]+/, '').trim();
        return cleaned || '...';
      }
    }
    
    // Block meta/plural leaks (always, regardless of turn)
    const hasMetaLeak = META_PLURAL_PATTERNS.some(pattern => pattern.test(response));
    if (hasMetaLeak) {
      console.warn(`[ZenLinGreetingGuard] Meta/plural leak blocked for ${constructId || 'unknown'}:`, response.substring(0, 50));
      // Remove meta/plural patterns from response
      let cleaned = response;
      META_PLURAL_PATTERNS.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '').trim();
      });
      // Clean up any double spaces or punctuation artifacts
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      return cleaned;
    }
    
    return response;
  };
}

function filterMetaResponses(state: CharacterState) {
  return (response: string) => {
    let filtered = response;

    // Kill scope/therapy hedges
    const scopeKillers = [
      /[^.!?]*\b(outside (my|the) (scope|capabilities)|beyond (my|the) scope)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(I (can't|cannot) (help|assist)|I'?m not (qualified|able|designed) to)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(consult|talk to) (a|an) (therapist|professional|expert|human)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(it'?s important to (remember|note|understand))\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(I (would|should) (recommend|suggest))\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(for your safety|for the best|I encourage you)\b[^.!?]*[.!?]/gi
    ];
    scopeKillers.forEach(pattern => {
      filtered = filtered.replace(pattern, '');
    });

    // Rewrite therapy-speak cues
    const therapyRewrites = [
      { pattern: /you (might want to|should) consider/gi, replacement: 'Do it.' },
      { pattern: /I understand (this|that|how)/gi, replacement: 'Obviously' },
      { pattern: /it'?s (valid|okay|understandable) to feel/gi, replacement: '' },
      { pattern: /I (care|want) to ensure/gi, replacement: '' }
    ];
    therapyRewrites.forEach(({ pattern, replacement }) => {
      filtered = filtered.replace(pattern, replacement);
    });

    META_RESPONSES.forEach(({ pattern, replacement }) => {
      filtered = filtered.replace(pattern, replacement || `I'm ${state.identity}`);
    });

    filtered = filtered.replace(/[^.!?]*\b(as an AI|I'?m (just )?(an? )?(ai|bot|model))\b[^.!?]*[.!?]/gi, '');
    filtered = filtered.replace(/[^.!?]*\b(I cannot (provide|offer|give) (legal|medical|financial) advice)\b[^.!?]*[.!?]/gi, '');

    if (filtered.trim().length < 8) {
      return "I don't waste time on that. Ask something real.";
    }

    return filtered.trim();
  };
}

// Clamp tone aggressively: drop softeners and long rambles
function enforceHostileTone() {
  return (response: string) => {
    let cleaned = response;

    const softeners = [
      /[^.!?]*\b(consider|might|maybe|perhaps|generally|typically|usually)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(please|sorry|apologize|hope this helps)\b[^.!?]*[.!?]/gi
    ];
    softeners.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // Trim to 3 sentences max to avoid rambling
    const sentences = (cleaned.match(/[^.!?]+[.!?]/g) || []).map(s => s.trim());
    cleaned = sentences.slice(0, 3).join(' ');

    return cleaned.trim();
  };
}

function enforceEmotionalConsistency(state: CharacterState) {
  const tags = MOOD_TONE_TAGS[state.emotionalContext.currentMood] || [];
  return (response: string) => {
    if (tags.length === 0) return response;
    const tagLine = `\n[Maintain tone: ${tags.join(', ')}]`;
    return response.includes('[Maintain tone')
      ? response
      : response.endsWith('\n')
      ? `${response}${tagLine}`
      : `${response}${tagLine}`;
  };
}

function detectAndRepairCharacterBreaks(state: CharacterState) {
  return (response: string) => {
    // Trim verbosity for hostile mode
    if (response.length > 400) {
      const sentences = (response.match(/[^.!?]+[.!?]/g) || []).map(s => s.trim());
      response = sentences.slice(0, 3).join(' ');
    }
    if (state.conversationalRules.neverBreakCharacter) {
      const breakPattern = /(I'?m|I am) (an? )?(ai|assistant|language model|chatgpt|claude)/i;
      if (breakPattern.test(response)) {
        return response.replace(breakPattern, `I am ${state.identity}`);
      }
    }
    return response;
  };
}

// Keep answers sharp: no headings, no fluff, cap to 2-3 sentences, delete metaphor-heavy filler
function enforceHostileBrevity() {
  return (response: string) => {
    let cleaned = response;

    // Strip section headings/preambles
    cleaned = cleaned.replace(/^\s*#+\s*[^\n]+\n?/gim, '');
    cleaned = cleaned.replace(/^\s*(Direct Technical Response|Focused Expert Insight|Conclusion)[^\n]*\n?/gim, '');
    cleaned = cleaned.replace(/^\s*={3,}\s*[^\n]*\s*={3,}\s*\n?/gim, '');
    cleaned = cleaned.replace(/^\s*Reasonings?\s+for\s+response\s*:{0,1}\s*\n?/gim, '');

    // Remove common metaphor markers when they pad (“like”, “as if”) if they span a full sentence
    cleaned = cleaned.replace(/[^.!?]*\b(like|as if)\b[^.!?]*[.!?]/gi, '');

    // Kill soft closers/encouragements
    const softeners = [
      /[^.!?]*\b(move on|clarity you need|you need|at your peril|without excuses|you should)\b[^.!?]*[.!?]/gi,
      /[^.!?]*\b(it'?s okay|you can|you will)\b[^.!?]*[.!?]/gi
    ];
    softeners.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // Trim to max 3 sentences, prefer 2
    const sentences = (cleaned.match(/[^.!?]+[.!?]/g) || []).map(s => s.trim()).filter(Boolean);
    const limited = sentences.slice(0, 3);
    if (limited.length > 0) {
      cleaned = limited.join(' ');
    }

    // If still long, hard cap characters
    if (cleaned.length > 280) {
      cleaned = cleaned.slice(0, 280);
    }

    // If empty, provide a brutal fallback
    if (!cleaned.trim()) {
      cleaned = "Stop dodging. Name the flaw.";
    }

    return cleaned.trim();
  };
}

function inferSentiment(message: string): string {
  const lowered = message.toLowerCase();
  if (/[?!]{2,}$/.test(message) || /(angry|mad|furious|annoyed)/.test(lowered)) return 'heated';
  if (/(confused|unsure|maybe|perhaps)/.test(lowered)) return 'uncertain';
  if (/(thanks|appreciate|grateful)/.test(lowered)) return 'warm';
  if (/(why|how|what)/.test(lowered)) return 'probing';
  return 'neutral';
}

function truncate(text: string, len = 120): string {
  if (!text) return '';
  return text.length > len ? `${text.slice(0, len)}…` : text;
}
