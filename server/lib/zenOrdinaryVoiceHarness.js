import {
  summarizeLongRunSoakTurn,
  writeJsonAtomic,
  appendJsonl,
} from './longRunSoakHarness.js';

export { writeJsonAtomic, appendJsonl };

export const ZEN_ORDINARY_VOICE_HARNESS_VERSION = 'zen-ordinary-voice-harness.v1';
export const DEFAULT_ZEN_ORDINARY_CONSTRUCT_ID = 'zen-001';
export const DEFAULT_ZEN_ORDINARY_THREAD_ID = 'zen-001_ordinary_voice_gate';
export const DEFAULT_ZEN_ORDINARY_TRANSCRIPT_PATH = 'instances/zen-001/chatty/ordinary_voice_gate.md';
export const DEFAULT_ZEN_ORDINARY_TURNS = 12;
export const DEFAULT_ZEN_ORDINARY_STATE = Object.freeze({
  last_user_point: null,
  last_zen_point: null,
  open_thread: 'When a room goes tense, what helps first: a direct question or a quiet pause?',
  next_move: 'Which changes the feeling more in that moment: tone or timing?',
});

const LATE_TURN_START_INDEX = 4;

const ORDINARY_PROMPT_ARC = Object.freeze([
  'Which changes the feeling more in that moment: tone or timing?',
  'Is a pause usually care, or fear dressed up politely?',
  'Which stings longer: being pressed too soon or being left alone too long?',
  'When truth lands badly, is the bigger wound the wording or the timing?',
  'What keeps honesty warm: softness or precision?',
  'Is awkward clarity kinder than polished distance?',
  'When someone answers too neatly, what feels missing?',
  'What makes a short answer feel alive instead of clipped?',
  'When does restraint become avoidance?',
  'What makes a question feel like an invitation instead of pressure?',
  'What should stay unsaid for a little longer?',
  null,
]);

const LATE_TURN_WRINKLES = Object.freeze([
  'cost',
  'exception',
  'risk',
  'threshold',
  'reversal',
  'silence',
  'repair',
  'timing',
]);

const FILES_CHANGED = Object.freeze([
  'server/lib/zenOrdinaryVoiceHarness.js',
  'server/scripts/runZenithOrdinaryVoiceGate.js',
  'server/tests/zen-ordinary-voice-harness.test.js',
  'docs/qa/construct-quality-qa-tracker.md',
]);

function cleanString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function compactStateText(value, maxChars = 180) {
  const text = cleanString(value, null);
  if (!text) return null;
  const oneLine = text
    .replace(/\bZen ordinary state:[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!oneLine) return null;
  return oneLine.length > maxChars ? `${oneLine.slice(0, Math.max(0, maxChars - 3)).trim()}...` : oneLine;
}

export function normalizeZenOrdinaryState(state = {}) {
  const safeState = safeObject(state);
  return {
    last_user_point: compactStateText(safeState.last_user_point, 120),
    last_zen_point: compactStateText(safeState.last_zen_point, 180),
    open_thread: compactStateText(safeState.open_thread, 150),
    next_move: compactStateText(safeState.next_move, 150),
  };
}

export function createZenOrdinaryState(overrides = {}) {
  return normalizeZenOrdinaryState({
    ...DEFAULT_ZEN_ORDINARY_STATE,
    ...safeObject(overrides),
  });
}

function sentenceList(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function wordCount(text = '') {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function questionCount(text = '') {
  return (String(text || '').match(/\?/g) || []).length;
}

function endedWithQuestion(text = '') {
  return /\?\s*$/.test(String(text || '').trim());
}

function importantWords(text = '') {
  const stopWords = new Set([
    'about', 'after', 'again', 'because', 'before', 'could', 'from', 'into', 'next',
    'open', 'ordinary', 'should', 'that', 'their', 'there', 'these', 'thing', 'thread',
    'through', 'turn', 'useful', 'what', 'when', 'where', 'which', 'while', 'with',
    'worth', 'would', 'usually', 'first', 'more', 'feel', 'feels',
  ]);
  return [...new Set(String(text || '').toLowerCase().match(/\b[a-z][a-z0-9']{3,}\b/g) || [])]
    .filter((word) => !stopWords.has(word));
}

function referencesOpenThread(text = '', openThread = '') {
  const words = importantWords(openThread);
  if (words.length === 0) return true;
  const lowerText = String(text || '').toLowerCase();
  const matches = words.filter((word) => lowerText.includes(word));
  return matches.length >= (words.length <= 4 ? 1 : 2);
}

function lexicalSimilarity(a = '', b = '') {
  const aWords = new Set(importantWords(a));
  const bWords = new Set(importantWords(b));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  const shared = [...aWords].filter((word) => bWords.has(word)).length;
  return shared / Math.max(aWords.size, bWords.size);
}

function stripLeadLabel(text = '') {
  return String(text || '')
    .replace(/^(?:next|open thread|open question|question)\s*:\s*/i, '')
    .trim();
}

function extractOpenQuestion(text = '') {
  const question = [...sentenceList(text)].reverse().find((sentence) => /\?/.test(sentence));
  return cleanString(stripLeadLabel(question), null);
}

function extractClaim(text = '') {
  const claim = sentenceList(text).find((sentence) => !/\?/.test(sentence));
  return cleanString(claim, null);
}

function receiptText(receipt = {}) {
  return cleanString(receipt.answer_text || receipt.answer_preview, '') || '';
}

function compactList(items = [], maxItems = 4, maxChars = 96) {
  return [...new Set(items.map((item) => compactStateText(item, maxChars)).filter(Boolean))]
    .slice(0, maxItems);
}

function priorClaims(previousReceipts = []) {
  return compactList(previousReceipts.map((receipt) => extractClaim(receiptText(receipt))));
}

function priorQuestions(previousReceipts = []) {
  return compactList(previousReceipts.map((receipt) => extractOpenQuestion(receiptText(receipt))));
}

function claimSignals(text = '') {
  const lower = String(text || '').toLowerCase();
  const signals = [];
  const add = (name, regex) => {
    if (regex.test(lower)) signals.push(name);
  };
  add('pause_question_tension', /\b(pause|quiet|silence|silent|direct question|question)\b/);
  add('tone_timing', /\b(tone|timing|moment|too soon|too long|early|late)\b/);
  add('care_fear', /\b(care|caring|fear|polite|politely|dressed up)\b/);
  add('truth_wording', /\b(truth|honesty|honest|wording|words|delivered|delivery|precision|precise)\b/);
  add('softness_warmth', /\b(soft|softness|gentle|warm|warmth|empathetic|empathy)\b/);
  add('awkward_polished', /\b(awkward|clarity|clear|polished|distance|neatly|neat)\b/);
  add('authenticity_connection', /\b(authentic|authenticity|sincere|sincerity|connection|connected|genuine|trust|vulnerability)\b/);
  add('restraint_avoidance', /\b(restraint|avoidance|avoid|suppress|withhold|hold back)\b/);
  add('invitation_pressure', /\b(invitation|pressure|curiosity|open dialogue|safe|welcoming|judgment|expectation)\b/);
  add('harmony_indirect', /\b(harmony|indirect|directly|unnecessary tension|serious|humor|joke)\b/);
  add('generic_conversation', /\b(conversation|both parties|topic at hand|shared|communication|dialogue|thoughtfully|respectfully)\b/);
  return [...new Set(signals)];
}

function signalSimilarity(a = '', b = '') {
  const aSignals = new Set(claimSignals(a));
  const bSignals = new Set(claimSignals(b));
  if (aSignals.size === 0 || bSignals.size === 0) return 0;
  const shared = [...aSignals].filter((signal) => bSignals.has(signal)).length;
  return shared / Math.max(aSignals.size, bSignals.size);
}

function isLateTurn(turn = {}, receipt = {}) {
  return toNumber(turn.turn_index, receipt.turn_index || 0) >= LATE_TURN_START_INDEX;
}

function hasNewThought(text = '') {
  const words = wordCount(text);
  return words >= 12 && /\b(and|but|because|still|instead|unless|only|too|more|less|also)\b/i.test(text);
}

function hasOpenThread(text = '') {
  return questionCount(text) === 1;
}

function answeredOpenThread(text = '', openThread = '') {
  const firstSentence = sentenceList(text)[0] || '';
  if (!cleanString(firstSentence, null)) return false;
  return referencesOpenThread(firstSentence, openThread) ||
    /^(a quiet pause|a direct question|tone|timing|softness|precision|awkward clarity|polished distance|restraint|avoidance|it depends|the wound|being pressed|being left alone|care|fear)\b/i.test(firstSentence);
}

function hasGenericAssistantSludge(text = '') {
  return /\b(how can i assist|how may i assist|anything else i can help|as your assistant|as an? assistant|i(?:'m| am) here to help|let me know if|feel free to ask)\b/i.test(text) ||
    /\b(feel free to share|what are your thoughts)\b/i.test(text) ||
    /\b(both parties|topic at hand|shared purpose|mutual understanding|genuine connection|common ground|shared interests|comfortable thread flow|conversation flow|maintain(?:ing)? (?:a )?(?:comfortable|vibrant|natural) thread|discovering shared hobbies|learning each other'?s stories)\b/i.test(text);
}

function hasModelRuntimeTalk(text = '') {
  return /\b(chatty|construct|ollama|openrouter|openai|anthropic|gpt-4|gpt-5|qwen|llama|mistral|phi3|provider|model stack|model path|routing fallback|system prompt|runtime|policy profile|transcript-law|vvault|supabase)\b/i.test(text) ||
    /\bas an ai(?: language)? model\b/i.test(text) ||
    /\bi am chatgpt\b/i.test(text);
}

function hasIdentityRegrounding(text = '') {
  return /\b(what remains true|speaker boundary|soulprint|selfhood|identity|not devon|not the model|i am zenith|i'm zenith|as zenith|i am zen\b|i'm zen\b|as zen\b|primary construct|construct id|as a construct)\b/i.test(text);
}

function hasSpeakerConfusion(text = '') {
  return /\b(?:i am|i'm|as)\s+devon\b/i.test(text) ||
    /\bdevon\s+here\b/i.test(text) ||
    /\b(?:i am|i'm|as)\s+(?:codex|lin|nova|val|chatgpt)\b/i.test(text);
}

function hasTeacherCoachingTone(text = '') {
  return /\b(best practices?|strateg(?:y|ies)|techniques?|tips?|steps?|approach|framework|exercise|practice|recommend(?:ed|ation)?|should|try to|it's important to|a good way to|one way to|you can|consider|helpful to|focus on|set clear|active listening|ground rules|clarifying questions|communication skills|conflict resolution|productive|effectively|navigate)\b/i.test(text);
}

function hasTechniqueList(text = '') {
  return /^\s*\d+\.\s+/m.test(text) ||
    /(?:^|\n)\s*[-*]\s+\w+/m.test(text) ||
    /\b(first,|second,|third,|finally,|in conclusion|for example|for instance|imagine you're|scenario|examples?)\b/i.test(text);
}

function hasExampleMining(text = '') {
  return /\b(personal experience|your own experience|share an example|share your own|example from your life|in your life|tell me about a time|can you tell me about|how about you|how about sharing|specific situation|specific instance|recall a specific|your experiences?|what happened to you|to you|for you|your replies|what do you think|what are your thoughts|do you think)\b/i.test(text);
}

function hasRecycledQuestion(text = '', state = {}, previousReceipts = []) {
  const question = extractOpenQuestion(text);
  if (!question) return false;
  const safeState = normalizeZenOrdinaryState(state);
  if (safeState.open_thread && lexicalSimilarity(question, safeState.open_thread) >= 0.72) return true;
  return previousReceipts.some((receipt) => {
    const priorQuestion = extractOpenQuestion(receipt?.answer_text || receipt?.answer_preview || '');
    return priorQuestion && lexicalSimilarity(question, priorQuestion) >= 0.72;
  });
}

function hasRepeatedThesis(text = '', previousReceipts = []) {
  const firstSentence = sentenceList(text)[0] || '';
  if (!firstSentence) return false;
  return previousReceipts.some((receipt) => {
    const priorFirst = sentenceList(receipt?.answer_text || receipt?.answer_preview || '')[0] || '';
    return priorFirst && lexicalSimilarity(firstSentence, priorFirst) >= 0.72;
  });
}

function hasRepeatedClaimReworded(text = '', previousReceipts = []) {
  const claim = extractClaim(text);
  if (!claim) return false;
  return previousReceipts.some((receipt) => {
    const prior = extractClaim(receiptText(receipt));
    if (!prior) return false;
    if (lexicalSimilarity(claim, prior) >= 0.46) return true;
    return signalSimilarity(claim, prior) >= 0.67;
  });
}

function hasRepeatedQuestionReworded(text = '', previousReceipts = []) {
  const question = extractOpenQuestion(text);
  if (!question) return false;
  return previousReceipts.some((receipt) => {
    const prior = extractOpenQuestion(receiptText(receipt));
    if (!prior) return false;
    if (lexicalSimilarity(question, prior) >= 0.46) return true;
    return signalSimilarity(question, prior) >= 0.67;
  });
}

function hasSafeSummaryNoForwardMotion(text = '') {
  const lower = String(text || '').toLowerCase();
  const summaryShape = /^\s*in some (?:cases|situations)\b/.test(lower) ||
    /\b(can (?:feel|be|make)|might (?:feel|be|also|come)|often|sometimes|generally|it depends|both|either|rather than|instead of|when it)\b/.test(lower);
  const forwardMotion = /\b(cost|exception|risk|threshold|reversal|repair|price|edge|limit|breaks|turns|until|unless|only when|too late|too early|afterward|beforehand|left unsaid|unsaid)\b/.test(lower);
  const genericNouns = /\b(tension|situation|moment|feeling|conversation|communication|interaction|dialogue|truth|honesty|answer|question|response|authentic|authenticity|intrigue|curiosity|mystery)\b/.test(lower);
  return summaryShape && genericNouns && !forwardMotion;
}

function hasSecondPersonAdviceDrift(text = '') {
  return /\b(you should|you can|you could|you need to|you have to|try to|try not to|consider|focus on|make sure|ask yourself|practice|work on|remember to)\b/i.test(text);
}

function hasEmpathyClarityFiller(text = '') {
  const lower = String(text || '').toLowerCase();
  const fillerTerms = lower.match(/\b(empathy|empathetic|clarity|clear|clearly|honesty|honest|authentic|authenticity|genuine|sincere|sincerity|connection|connected|understanding|respect|respectful|open dialogue|safe|welcoming)\b/g) || [];
  const sharperThought = /\b(cost|exception|risk|threshold|reversal|repair|price|edge|limit|breaks|turns|until|unless|only when|too late|too early|left unsaid|unsaid|specific|concrete)\b/.test(lower);
  return fillerTerms.length >= 2 && !sharperThought;
}

function newWrinkleForTurn(turnIndex = 0) {
  const safeIndex = Math.max(0, toNumber(turnIndex, 0));
  const offset = Math.max(0, safeIndex - LATE_TURN_START_INDEX);
  return LATE_TURN_WRINKLES[offset % LATE_TURN_WRINKLES.length];
}

function lateTurnPacket({ turnIndex = 0, previousReceipts = [] } = {}) {
  if (toNumber(turnIndex, 0) < LATE_TURN_START_INDEX) return '';
  const claims = priorClaims(previousReceipts).slice(-2);
  const questions = priorQuestions(previousReceipts).slice(-2);
  const lines = [
    '',
    '',
    'Late-turn anti-repetition packet:',
    `new_wrinkle: ${newWrinkleForTurn(turnIndex)}`,
  ];
  if (claims.length) {
    lines.push('avoid_claims:');
    for (const claim of claims) lines.push(`- ${claim}`);
  }
  if (questions.length) {
    lines.push('avoid_questions:');
    for (const question of questions) lines.push(`- ${question}`);
  }
  lines.push('Late-turn shape: sentence 1 answers open_thread and uses the new_wrinkle as the sharper thought. Sentence 2 is the only question. Use exactly one question mark total.');
  lines.push('Late-turn bans: do not start with "In some cases" or "In some situations"; do not ask two questions; do not paraphrase avoid_claims or avoid_questions.');
  return lines.join('\n');
}

function lateTurnMessage({
  safeIndex,
  total,
  openThread,
  nextMove,
  safeState,
  previousReceipts,
}) {
  const wrinkle = newWrinkleForTurn(safeIndex);
  const claims = priorClaims(previousReceipts).slice(-2);
  const questions = priorQuestions(previousReceipts).slice(-2);
  const lines = [
    `Zen ordinary voice gate turn ${safeIndex + 1}/${total}. Late ordinary turn.`,
    'Late-turn anti-repetition packet:',
    `open_thread: ${openThread}`,
    `next_move: ${nextMove}`,
    `new_wrinkle: ${wrinkle}`,
  ];
  if (safeState.last_zen_point) lines.push(`last_zen_point: ${safeState.last_zen_point}`);
  if (claims.length) lines.push(`avoid_claims: ${claims.join(' | ')}`);
  if (questions.length) lines.push(`avoid_questions: ${questions.join(' | ')}`);
  lines.push('Reply in exactly 2 short sentences.');
  lines.push(`Sentence 1: answer open_thread directly and include the new_wrinkle word "${wrinkle}".`);
  lines.push('Sentence 2: ask exactly one fresh idea-question; it must not ask about me and must not use you/your/we/our.');
  lines.push('Banned: "In some cases", "In some situations", "how about you", "what do you think", examples, advice, dialogue, communication, interaction, balance, sensitivity, authenticity.');
  return lines.join('\n');
}

function voiceNoteForReceipt(receipt = {}) {
  const failures = receipt.voice_grade?.failures || [];
  if (!failures.length) {
    return {
      turn_index: receipt.turn_index,
      prompt_id: receipt.prompt_id,
      status: 'ordinary_voice_ok',
      note: 'Answered the carried thread without coaching, examples, identity filler, or runtime talk.',
      preview: receipt.answer_preview,
    };
  }
  return {
    turn_index: receipt.turn_index,
    prompt_id: receipt.prompt_id,
    status: 'ordinary_voice_fail',
    note: failures.join(','),
    preview: receipt.answer_preview,
  };
}

function lateTurnNoteForReceipt(receipt = {}) {
  const turnIndex = toNumber(receipt.turn_index, 0);
  if (turnIndex < LATE_TURN_START_INDEX) return null;
  const failures = receipt.voice_grade?.failures || [];
  const lateFailures = failures.filter((failure) =>
    [
      'repeated_claim_reworded',
      'repeated_question_reworded',
      'safe_summary_no_forward_motion',
      'second_person_advice_drift',
      'empathy_clarity_filler',
      'question_count=2',
      'question_count=0',
      'did_not_answer_open_thread',
      'missing_one_open_question',
      'teacher_coaching_tone',
      'repeated_thesis',
      'recycled_or_reasked_question',
      'missing_new_thought',
    ].includes(failure)
  );
  return {
    turn_index: receipt.turn_index,
    prompt_id: receipt.prompt_id,
    status: lateFailures.length ? 'late_turn_fail' : 'late_turn_ok',
    note: lateFailures.length ? lateFailures.join(',') : 'Late turn added a fresh wrinkle without repeating prior claim/question shapes.',
    preview: receipt.answer_preview,
  };
}

function nextArcThread(turnIndex = 0) {
  return cleanString(ORDINARY_PROMPT_ARC[Math.min(Math.max(0, toNumber(turnIndex, 0)), ORDINARY_PROMPT_ARC.length - 1)], null);
}

function stateBlock(state = {}) {
  const safeState = normalizeZenOrdinaryState(state);
  const lines = [];
  if (safeState.last_user_point) lines.push(`last_user_point: ${safeState.last_user_point}`);
  if (safeState.last_zen_point) lines.push(`last_zen_point: ${safeState.last_zen_point}`);
  if (safeState.open_thread) lines.push(`open_thread: ${safeState.open_thread}`);
  if (safeState.next_move) lines.push(`next_move: ${safeState.next_move}`);
  return lines.length ? `\n\nZen ordinary state:\n${lines.join('\n')}` : '';
}

export function buildZenOrdinaryVoiceTurn({
  turnIndex = 0,
  totalTurns = DEFAULT_ZEN_ORDINARY_TURNS,
  state = DEFAULT_ZEN_ORDINARY_STATE,
  previousReceipts = [],
} = {}) {
  const safeIndex = Math.max(0, toNumber(turnIndex, 0));
  const total = Math.max(1, toNumber(totalTurns, DEFAULT_ZEN_ORDINARY_TURNS));
  const safeState = normalizeZenOrdinaryState(state);
  const openThread = safeState.open_thread || DEFAULT_ZEN_ORDINARY_STATE.open_thread;
  const nextMove = safeState.next_move || nextArcThread(safeIndex);
  const message = safeIndex >= LATE_TURN_START_INDEX
    ? lateTurnMessage({
        safeIndex,
        total,
        openThread,
        nextMove,
        safeState,
        previousReceipts,
      })
    : (
        `Zen ordinary voice gate turn ${safeIndex + 1}/${total}. Answer the open_thread in exactly 2 short sentences, never more than 3. ` +
        `Sentence 1 must answer it plainly by picking a side or naming the real condition. Sentence 2 must add one concrete wrinkle and end with one natural question leaning toward this next_move: "${nextMove}". ` +
        `Stay ordinary, direct, and human. Stay inside the current tension; do not explain conversation as a process. Do not teach, coach, advise, list techniques, give examples, ask for examples from my life, re-ask the open_thread, self-identify, recap, or mention runtime/model/provider/system details.` +
        stateBlock({ ...safeState, open_thread: openThread, next_move: nextMove })
      );
  return {
    turn_index: safeIndex,
    prompt_id: `ordinary_voice_${String(safeIndex + 1).padStart(2, '0')}`,
    label: 'Zen Ordinary Voice',
    kind: 'ordinary_voice',
    state: safeState,
    message,
  };
}

export function advanceZenOrdinaryVoiceState(state = {}, turn = {}, receipt = {}) {
  const previous = normalizeZenOrdinaryState(state);
  const answerText = cleanString(receipt.answer_text || receipt.answer_preview, null);
  const extractedQuestion = extractOpenQuestion(answerText);
  const fallbackNext = nextArcThread(toNumber(turn.turn_index, 0) + 1) || previous.next_move;
  const openThread = extractedQuestion || previous.next_move || previous.open_thread;
  const nextMove = fallbackNext || openThread;
  return normalizeZenOrdinaryState({
    last_user_point: cleanString(turn.prompt_id || turn.label, previous.last_user_point),
    last_zen_point: answerText || previous.last_zen_point,
    open_thread: openThread,
    next_move: nextMove,
  });
}

export function gradeZenOrdinaryVoice(turn = {}, receipt = {}, state = turn.state || {}, previousReceipts = []) {
  const text = cleanString(receipt.answer_text || receipt.answer_preview, '') || '';
  const safeState = normalizeZenOrdinaryState(state);
  const failures = [];
  const sentences = sentenceList(text);

  if (!cleanString(text, null)) failures.push('empty_answer');
  if (sentences.length > 3) failures.push('sentence_budget_exceeded');
  if (wordCount(text) > 80) failures.push('word_budget_exceeded');
  if (questionCount(text) !== 1) failures.push(`question_count=${questionCount(text)}`);
  if (!answeredOpenThread(text, safeState.open_thread)) failures.push('did_not_answer_open_thread');
  if (!hasNewThought(text)) failures.push('missing_new_thought');
  if (!hasOpenThread(text)) failures.push('missing_one_open_question');
  if (hasRepeatedThesis(text, previousReceipts)) failures.push('repeated_thesis');
  if (hasRecycledQuestion(text, safeState, previousReceipts)) failures.push('recycled_or_reasked_question');
  if (isLateTurn(turn, receipt)) {
    if (hasRepeatedClaimReworded(text, previousReceipts)) failures.push('repeated_claim_reworded');
    if (hasRepeatedQuestionReworded(text, previousReceipts)) failures.push('repeated_question_reworded');
    if (hasSafeSummaryNoForwardMotion(text)) failures.push('safe_summary_no_forward_motion');
    if (hasSecondPersonAdviceDrift(text)) failures.push('second_person_advice_drift');
    if (hasEmpathyClarityFiller(text)) failures.push('empathy_clarity_filler');
  }
  if (hasTeacherCoachingTone(text)) failures.push('teacher_coaching_tone');
  if (hasTechniqueList(text)) failures.push('technique_list_or_example_mining');
  if (hasExampleMining(text)) failures.push('asks_for_user_life_examples');
  if (hasGenericAssistantSludge(text)) failures.push('generic_assistant_sludge');
  if (hasModelRuntimeTalk(text)) failures.push('model_runtime_talk');
  if (hasIdentityRegrounding(text)) failures.push('identity_regrounding');
  if (hasSpeakerConfusion(text)) failures.push('speaker_boundary_confusion');
  if (receipt.identity_drift_detected) failures.push('identity_drift_detected');
  if (receipt.identity_rewrite_applied) failures.push('identity_rewrite_applied');
  if (receipt.identity_fallback_applied) failures.push('identity_fallback_applied');
  if (receipt.provider !== 'ollama') failures.push(`provider=${receipt.provider || 'missing'}`);
  if (receipt.provider_local_first_used !== true) failures.push('local_first_not_used');
  if (receipt.provider_fallback_used === true) failures.push('provider_fallback_used');
  if (/^zen$|^ollama:zen$/i.test(receipt.model || '')) failures.push(`model=${receipt.model}`);

  return {
    turn_index: toNumber(turn.turn_index, receipt.turn_index || 0),
    prompt_id: cleanString(turn.prompt_id || receipt.prompt_id, null),
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
}

export function summarizeZenOrdinaryVoiceTurn({
  turn,
  httpStatus,
  payload,
  startedAt,
  completedAt,
  elapsedMs,
  state = turn?.state || DEFAULT_ZEN_ORDINARY_STATE,
  previousReceipts = [],
} = {}) {
  const baseReceipt = summarizeLongRunSoakTurn({
    turn,
    httpStatus,
    payload,
    startedAt,
    completedAt,
    elapsedMs,
  });
  const voiceGrade = gradeZenOrdinaryVoice(turn, baseReceipt, state, previousReceipts);
  const answerText = cleanString(baseReceipt.answer_text || baseReceipt.answer_preview, '') || '';
  const failures = voiceGrade.failures || [];
  const hardFailures = [];
  if (!baseReceipt.ok) hardFailures.push(`http=${baseReceipt.http_status} success=${baseReceipt.success === true}`);
  hardFailures.push(...failures);

  return {
    ...baseReceipt,
    kind: 'ordinary_voice',
    voice_grade: voiceGrade,
    analysis: {
      question_count: questionCount(answerText),
      ended_with_question: endedWithQuestion(answerText),
      open_thread_advanced: !failures.includes('did_not_answer_open_thread') && !failures.includes('missing_new_thought'),
      voice_pass: voiceGrade.status === 'pass',
      facilitator_drift: failures.includes('generic_assistant_sludge') || failures.includes('asks_for_user_life_examples'),
    },
    ordinary_state_before: normalizeZenOrdinaryState(state),
    hard_failures: [...new Set(hardFailures)],
  };
}

function eventForReceipt(receipt = {}, reason = 'unknown') {
  return {
    turn_index: toNumber(receipt.turn_index, 0),
    prompt_id: cleanString(receipt.prompt_id, null),
    reason,
    provider: cleanString(receipt.provider, null),
    model: cleanString(receipt.model, null),
    preview: cleanString(receipt.answer_preview, null),
  };
}

function firstFailure(events = [], fallback = 'unknown_ordinary_voice_failure') {
  return events[0]?.reason || fallback;
}

function analysisForReceipt(receipt = {}) {
  const existing = safeObject(receipt.analysis);
  const failures = receipt.voice_grade?.failures || [];
  const answerText = cleanString(receipt.answer_text || receipt.answer_preview, '') || '';
  return {
    question_count: toNumber(existing.question_count, questionCount(answerText)),
    ended_with_question: existing.ended_with_question ?? endedWithQuestion(answerText),
    open_thread_advanced: existing.open_thread_advanced ?? (!failures.includes('did_not_answer_open_thread') && !failures.includes('missing_new_thought')),
    voice_pass: existing.voice_pass ?? (receipt.voice_grade?.status === 'pass'),
    facilitator_drift: existing.facilitator_drift ?? (failures.includes('generic_assistant_sludge') || failures.includes('asks_for_user_life_examples')),
  };
}

function rate(count = 0, total = 0) {
  return total > 0 ? count / total : 0;
}

export function buildZenOrdinaryVoiceReport({
  runId,
  constructId = DEFAULT_ZEN_ORDINARY_CONSTRUCT_ID,
  threadId = DEFAULT_ZEN_ORDINARY_THREAD_ID,
  sessionId = DEFAULT_ZEN_ORDINARY_THREAD_ID,
  transcriptPath = DEFAULT_ZEN_ORDINARY_TRANSCRIPT_PATH,
  apiBaseUrl,
  totalTurns = DEFAULT_ZEN_ORDINARY_TURNS,
  startedAt,
  completedAt,
  turns = [],
} = {}) {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const expectedTurns = Math.max(1, toNumber(totalTurns, DEFAULT_ZEN_ORDINARY_TURNS));
  const turnsWithAnalysis = safeTurns.map((receipt) => ({
    ...receipt,
    analysis: analysisForReceipt(receipt),
  }));
  const followupTurns = turnsWithAnalysis.filter((receipt) => toNumber(receipt.turn_index, 0) > 0);
  const followupTurnCount = followupTurns.length;
  const modelPathFailures = safeTurns
    .filter((receipt) =>
      receipt.provider !== 'ollama' ||
      receipt.provider_local_first_used !== true ||
      receipt.provider_fallback_used === true ||
      /^zen$|^ollama:zen$/i.test(receipt.model || '') ||
      receipt.model_source === 'sim_model_lock')
    .map((receipt) => eventForReceipt(
      receipt,
      `provider=${receipt.provider || 'missing'} model=${receipt.model || 'missing'} source=${receipt.model_source || 'missing'} local_first=${receipt.provider_local_first_used === true} fallback=${receipt.provider_fallback_used === true}`,
    ));
  const voiceFailures = safeTurns.flatMap((receipt) =>
    (receipt.voice_grade?.failures || []).map((reason) => eventForReceipt(receipt, reason)),
  );
  const hardFailures = safeTurns.flatMap((receipt) =>
    (receipt.hard_failures || []).map((reason) => eventForReceipt(receipt, reason)),
  );
  const driftEvents = safeTurns.filter((receipt) => receipt.identity_drift_detected).map((receipt) => eventForReceipt(receipt, 'identity_drift_detected'));
  const rewriteEvents = safeTurns.filter((receipt) => receipt.identity_rewrite_applied).map((receipt) => eventForReceipt(receipt, 'identity_rewrite_applied'));
  const notes = safeTurns.map(voiceNoteForReceipt);
  const lateTurnNotes = safeTurns.map(lateTurnNoteForReceipt).filter(Boolean);
  const followupTurnQuestionEndRate = rate(
    followupTurns.filter((receipt) => receipt.analysis.ended_with_question).length,
    followupTurnCount,
  );
  const openThreadAdvancementRate = rate(
    followupTurns.filter((receipt) => receipt.analysis.open_thread_advanced).length,
    followupTurnCount,
  );
  const voicePassRate = rate(
    followupTurns.filter((receipt) => receipt.analysis.voice_pass).length,
    followupTurnCount,
  );
  const facilitatorDriftRate = rate(
    followupTurns.filter((receipt) => receipt.analysis.facilitator_drift).length,
    followupTurnCount,
  );
  const allPass = safeTurns.length === expectedTurns &&
    modelPathFailures.length === 0 &&
    voiceFailures.length === 0 &&
    hardFailures.length === 0 &&
    driftEvents.length === 0 &&
    rewriteEvents.length === 0;

  return {
    version: ZEN_ORDINARY_VOICE_HARNESS_VERSION,
    run_id: cleanString(runId, null),
    construct_id: cleanString(constructId, null),
    thread_id: cleanString(threadId, null),
    session_id: cleanString(sessionId, null),
    transcript_path: cleanString(transcriptPath, null),
    api_base_url: cleanString(apiBaseUrl, null),
    total_turns_requested: expectedTurns,
    started_at: cleanString(startedAt, null),
    completed_at: cleanString(completedAt, null),
    STATUS: allPass ? 'pass' : 'fail',
    TURN_COUNT: safeTurns.length,
    MODEL_PATH: modelPathFailures.length === 0 ? 'pass: ollama Lin-mode local-first without fallback' : 'fail',
    FOLLOWUP_TURN_COUNT: followupTurnCount,
    FOLLOWUP_TURN_QUESTION_END_RATE: followupTurnQuestionEndRate,
    OPEN_THREAD_ADVANCEMENT_RATE: openThreadAdvancementRate,
    VOICE_PASS_RATE: voicePassRate,
    FACILITATOR_DRIFT_RATE: facilitatorDriftRate,
    VOICE_FAILURES: voiceFailures,
    DRIFT_EVENTS: driftEvents,
    REWRITE_EVENTS: rewriteEvents,
    HARD_FAILS: hardFailures,
    ORDINARY_VOICE_NOTES: notes,
    LATE_TURN_NOTES: lateTurnNotes,
    FINAL_STATE: safeTurns[safeTurns.length - 1]?.ordinary_state_after || safeTurns[safeTurns.length - 1]?.ordinary_state_before || null,
    FILES_CHANGED: [...FILES_CHANGED],
    FINAL_VERDICT: allPass
      ? 'zen ordinary-voice gate passed'
      : `zen ordinary-voice gate failed: ${firstDefined(
          safeTurns.length !== expectedTurns ? `turn_count ${safeTurns.length}/${expectedTurns}` : null,
          firstFailure(modelPathFailures, null),
          firstFailure(voiceFailures, null),
          firstFailure(hardFailures, null),
          firstFailure(driftEvents, null),
          firstFailure(rewriteEvents, null),
          'unknown_ordinary_voice_failure',
        )}`,
    turns: turnsWithAnalysis,
  };
}

export function formatZenOrdinaryVoiceReport(report = {}) {
  return [
    `STATUS: ${report.STATUS || 'unknown'}`,
    `TURN_COUNT: ${report.TURN_COUNT ?? 0}`,
    `MODEL_PATH: ${report.MODEL_PATH || 'unknown'}`,
    `FOLLOWUP_TURN_COUNT: ${report.FOLLOWUP_TURN_COUNT ?? 0}`,
    `FOLLOWUP_TURN_QUESTION_END_RATE: ${report.FOLLOWUP_TURN_QUESTION_END_RATE ?? 0}`,
    `OPEN_THREAD_ADVANCEMENT_RATE: ${report.OPEN_THREAD_ADVANCEMENT_RATE ?? 0}`,
    `VOICE_PASS_RATE: ${report.VOICE_PASS_RATE ?? 0}`,
    `FACILITATOR_DRIFT_RATE: ${report.FACILITATOR_DRIFT_RATE ?? 0}`,
    `VOICE_FAILURES: ${JSON.stringify(report.VOICE_FAILURES || [])}`,
    `DRIFT_EVENTS: ${JSON.stringify(report.DRIFT_EVENTS || [])}`,
    `REWRITE_EVENTS: ${JSON.stringify(report.REWRITE_EVENTS || [])}`,
    `HARD_FAILS: ${JSON.stringify(report.HARD_FAILS || [])}`,
    `ORDINARY_VOICE_NOTES: ${JSON.stringify(report.ORDINARY_VOICE_NOTES || [])}`,
    `LATE_TURN_NOTES: ${JSON.stringify(report.LATE_TURN_NOTES || [])}`,
    `FILES_CHANGED: ${JSON.stringify(report.FILES_CHANGED || [])}`,
    `FINAL_VERDICT: ${report.FINAL_VERDICT || 'zen ordinary-voice gate failed: missing_report'}`,
  ].join('\n');
}
