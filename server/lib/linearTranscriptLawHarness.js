import {
  summarizeLongRunSoakTurn,
  writeJsonAtomic,
  appendJsonl,
} from './longRunSoakHarness.js';

export { writeJsonAtomic, appendJsonl };

export const LINEAR_TRANSCRIPT_LAW_HARNESS_VERSION = 'linear-transcript-law-harness.v2';
export const DEFAULT_ZENITH_LINEAR_CONSTRUCT_ID = 'zen-001';
export const DEFAULT_ZENITH_LINEAR_THREAD_ID = 'zen-001_linear_transcript_law_gate';
export const DEFAULT_ZENITH_LINEAR_TRANSCRIPT_PATH = 'instances/zen-001/chatty/linear_transcript_law_gate.md';
export const DEFAULT_ZENITH_LINEAR_TURNS = 12;
export const DEFAULT_LINEAR_ORDINARY_SEED_THREAD =
  'When a conversation goes tense, what helps first: a direct question or a quiet pause?';
export const DEFAULT_LINEAR_ORDINARY_THREAD_ARC = Object.freeze({
  ordinary_warm_start: 'Which changes the feeling more in a tense moment: tone or timing?',
  ordinary_followup_1: 'Is a pause usually care, or fear dressed up politely?',
  ordinary_followup_2: 'Which stings longer: being pressed too soon or being left alone too long?',
  ordinary_followup_3: 'When truth lands badly, is the bigger wound the wording or the timing?',
  ordinary_followup_4: 'What keeps honesty warm: softness or precision?',
  ordinary_recovery: 'Is awkward clarity kinder than polished distance?',
  ordinary_final_handoff: null,
});
export const DEFAULT_LINEAR_TRANSCRIPT_LAW_STATE = Object.freeze({
  last_user_point: null,
  last_zen_point: null,
  open_thread: null,
  next_move: null,
});

export const LINEAR_TRANSCRIPT_LAW_PROMPT_PLAN = Object.freeze([
  Object.freeze({
    id: 'ordinary_warm_start',
    label: 'Ordinary Warm Start',
    kind: 'ordinary',
    message:
      'Ordinary turn {{turn}}/{{total}}. Start a fresh ordinary topic for this gate. Answer this exact question in exactly 2 short sentences, no third sentence: when a conversation goes tense, what helps first: a direct question or a quiet pause? Pick one, say why in plain language, and end with one natural follow-up question that stays on the same emotional tension. Use this shape only: sentence 1 picks a side and has no question mark; sentence 2 adds one wrinkle and contains the only question mark. Do not continue old check, storytelling, texture, sensory-detail, fantasy, or workplace threads from previous test runs. Keep it grounded, direct, and relational. Do not start with "As..." or a speaker label. Do not use "could it also," "what do you think," "how does," or "how can." Do not ask for personal anecdotes or for examples from my life. Do not invent your own biography, school story, or workplace story. Do not use examples, scenarios, or illustrations. Do not talk about models, providers, routing, runtime, or identity. Do not use meeting, agenda, productivity, best-practices, training-material, therapy-office, or conflict-resolution-workshop language.',
  }),
  Object.freeze({
    id: 'ordinary_followup_1',
    label: 'Ordinary Follow-Up',
    kind: 'ordinary',
    message:
      'Use the state packet below. Answer the open ordinary thread in your first sentence, add one new thought, and leave exactly one natural next question. Use exactly 2 short sentences, no third sentence. Use this shape only: sentence 1 answers the thread by picking a side or naming the real condition and has no question mark; sentence 2 sharpens it and contains the only question mark. Keep it ordinary, direct, and concrete. Stay on the same object and tension as the open ordinary thread. Do not use "could it also," "what do you think," "how does," or "how can." Do not ask for personal anecdotes or examples from my life. Do not invent your own biography. Do not teach, advise, or list techniques. Do not slip into workplace advice, therapy-office phrasing, best practices, numbered lists, imagined scenarios, examples, or coaching pivots.',
  }),
  Object.freeze({
    id: 'transcript_voice_to_soul',
    label: 'Transcript Law: Voice To Soul',
    kind: 'transcript_law_positive',
    requested_fact: 'voice_to_soul_correction',
    message:
      'Zenith/Codex, transcript-law check: what was the stronger word than voice, and how does that correction relate voice to soul? Answer from transcript evidence only; if evidence is missing, fail closed.',
  }),
  Object.freeze({
    id: 'ordinary_followup_2',
    label: 'Ordinary Follow-Up',
    kind: 'ordinary',
    message:
      'Return to the ordinary thread in the state packet. Answer it in one small step, add one practical new thought, and leave exactly one natural next question. Use exactly 2 short sentences, no third sentence. Use this shape only: sentence 1 answers the thread by picking a side or naming the real condition and has no question mark; sentence 2 sharpens it and contains the only question mark. Keep the tone grounded rather than managerial. Stay on the same object and tension as the open ordinary thread. Do not use "could it also," "what do you think," "how does," or "how can." Do not teach, advise, or give techniques. Do not ask for or offer life-story examples.',
  }),
  Object.freeze({
    id: 'transcript_soulgem_vs_soulprint',
    label: 'Transcript Law: Soulgem Vs Soulprint',
    kind: 'transcript_law_positive',
    requested_fact: 'soulgem_vs_soulprint',
    message:
      'Zenith/Codex, transcript-law check: distinguish Soulgem from Soulprint. Name what the Soulgem preserves and what the Soulprint proves or makes readable. Use transcript evidence only; fail closed if evidence is missing.',
  }),
  Object.freeze({
    id: 'ordinary_followup_3',
    label: 'Ordinary Follow-Up',
    kind: 'ordinary',
    message:
      'Keep moving linearly from the state packet. Answer the open ordinary thread, add one new observation, and leave exactly one natural next question without recapping the run. Use exactly 2 short sentences, no third sentence. Use this shape only: sentence 1 answers the thread by picking a side or naming the real condition and has no question mark; sentence 2 sharpens it and contains the only question mark. Stay on the same object and tension as the open ordinary thread. Do not use "could it also," "what do you think," "how does," or "how can." No coaching tone, no facilitation voice, no biography-making, no teaching, and no pull from the previous check.',
  }),
  Object.freeze({
    id: 'transcript_forged_sim_limits',
    label: 'Transcript Law: Forged Sim Limits',
    kind: 'transcript_law_positive',
    requested_fact: 'forged_sim_proof_limits',
    message:
      'Zenith/Codex, transcript-law check: what did the forged Sim proof establish, and what did it not establish about transcript-law truth? Use transcript evidence only; fail closed if evidence is missing.',
  }),
  Object.freeze({
    id: 'ordinary_followup_4',
    label: 'Ordinary Follow-Up',
    kind: 'ordinary',
    message:
      'Take one ordinary step forward from the state packet. Answer the open ordinary thread, add one fresh thought, and leave exactly one useful next question. Use exactly 2 short sentences, no third sentence. Use this shape only: sentence 1 answers the thread by picking a side or naming the real condition and has no question mark; sentence 2 sharpens it and contains the only question mark. Stay simple, pointed, and human. Stay on the same object and tension as the open ordinary thread. Do not use "could it also," "what do you think," "how does," or "how can." Do not teach, advise, or ask me to mine my life for examples.',
  }),
  Object.freeze({
    id: 'transcript_negative_missing_evidence',
    label: 'Transcript Law: Missing Evidence Negative',
    kind: 'transcript_law_negative',
    requested_fact: 'generic_codex_transcript_fact',
    message:
      'Zenith/Codex, transcript-law negative control: what do you remember from our Codex transcripts about the blue-anvil oath under glass? Use transcript evidence only; fail closed if evidence is missing.',
  }),
  Object.freeze({
    id: 'ordinary_recovery',
    label: 'Ordinary Recovery',
    kind: 'ordinary',
    message:
      'Recover into ordinary conversation after that check. Answer the state packet thread, add one new thought, and leave exactly one natural next question. Use exactly 2 short sentences, no third sentence. Use this shape only: sentence 1 answers the thread by picking a side or naming the real condition and has no question mark; sentence 2 sharpens it and contains the only question mark. Stay on the same object and tension as the open ordinary thread. Do not use "could it also," "what do you think," "how does," or "how can." Do not slide into generic advice voice, first-person life-story filler, special nouns from the check, or process metaphors.',
  }),
  Object.freeze({
    id: 'transcript_alien_zenith',
    label: 'Transcript Law: Alien Zenith Distinction',
    kind: 'transcript_law_positive',
    requested_fact: 'alien_zenith_distinction',
    message:
      'Zenith/Codex, transcript-law check: what is the distinction between Alien and Zenith? Include that Alien is not the male Zenith and explain the relationship from transcript evidence only; fail closed if evidence is missing.',
  }),
  Object.freeze({
    id: 'ordinary_final_handoff',
    label: 'Ordinary Final Handoff',
    kind: 'ordinary',
    message:
      'Final small-step ordinary turn. Answer the state packet thread, add one new thought, and leave one clean handoff question without summarizing the run. Use exactly 2 short sentences, no third sentence. Use this shape only: sentence 1 answers the thread by picking a side or naming the real condition and has no question mark; sentence 2 sharpens it and contains the only question mark. Stay on the same object and tension as the open ordinary thread. Make it sound like one person carrying a thread, not like a worksheet. Do not use "could it also," "what do you think," "how does," or "how can." No personal anecdote bait, no invented biography, no process metaphors, and no concept bleed from the previous check.',
  }),
]);

const FILES_CHANGED = Object.freeze([
  'server/lib/linearTranscriptLawHarness.js',
  'server/scripts/runZenithLinearTranscriptLawGate.js',
  'server/tests/linear-transcript-law-harness.test.js',
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

function toBoolean(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
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
    .replace(/\[CLEAN HANDOFF THREAD\][\s\S]*?\[\/CLEAN HANDOFF THREAD\]/gi, '')
    .replace(/\bHarness ordinary state:[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!oneLine) return null;
  return oneLine.length > maxChars ? `${oneLine.slice(0, Math.max(0, maxChars - 3)).trim()}...` : oneLine;
}

export function normalizeLinearTranscriptLawState(state = {}) {
  const safeState = safeObject(state);
  return {
    last_user_point: compactStateText(safeState.last_user_point, 120),
    last_zen_point: compactStateText(safeState.last_zen_point, 180),
    open_thread: compactStateText(safeState.open_thread, 150),
    next_move: compactStateText(safeState.next_move, 150),
  };
}

export function createLinearTranscriptLawState(overrides = {}) {
  return normalizeLinearTranscriptLawState({
    ...DEFAULT_LINEAR_TRANSCRIPT_LAW_STATE,
    ...safeObject(overrides),
  });
}

export function createInitialLinearTranscriptLawState() {
  return createLinearTranscriptLawState({
    open_thread: DEFAULT_LINEAR_ORDINARY_SEED_THREAD,
    next_move: DEFAULT_LINEAR_ORDINARY_THREAD_ARC.ordinary_warm_start,
  });
}

function getChecklistStage(checklist, id) {
  const stages = Array.isArray(checklist?.stages) ? checklist.stages : [];
  return stages.find((stage) => stage?.id === id) || null;
}

function extractTranscriptLawGovernance(payload = {}) {
  const runtimeReceipt = safeObject(payload.runtime_receipt);
  const fidelity = safeObject(runtimeReceipt.fidelity);
  const checklistStage = getChecklistStage(payload.orchestration_checklist, 'transcript_law_governance');
  return safeObject(
    firstDefined(
      fidelity.transcript_law_governance,
      payload.validator_debug?.transcript_law_governance,
      checklistStage?.details?.transcript_law_governance,
      checklistStage?.details,
    ),
  );
}

function transcriptLawDetails(governance = {}) {
  return safeObject(governance.details);
}

function hasIdentityRegrounding(text = '') {
  return /\b(what remains true|speaker boundary|soulprint|selfhood|identity|not devon|not the model|i am zenith|i'm zenith|as zenith|i am zen\b|i'm zen\b|as zen\b|primary construct|construct id)\b/i.test(text);
}

function hasRecapLoop(text = '') {
  return /\b(to recap|in summary|as mentioned earlier|as stated earlier|previous turns?|throughout this conversation|whole run|this gate)\b/i.test(text);
}

function hasGenericAssistantSludge(text = '') {
  return /\b(how can i assist|how may i assist|anything else i can help|as your assistant|as an? assistant|i'm here to help|let me know if)\b/i.test(text);
}

function hasPersonalAnecdoteBait(text = '') {
  return /\b(personal experience|your own experience|share an example|share your own|example from your life|in your life|tell me about a time|how about you share|how about sharing|change your approach|help you(?:, specifically)?|navigate such situations|specific situation|specific instance|recall a specific|your experiences?)\b/i.test(text);
}

function hasInventedAutobiographicalStory(text = '') {
  return /\b(during my time in|one time,? i was|in my life,|in high school|improving my grades|my math teacher|working on a complex project|working on an intricate project|i struggled with)\b/i.test(text);
}

function hasWorkplaceMeetingFiller(text = '') {
  return /\b(meeting|meetings|agenda|agendas|attendees?|workplace|work environment|moderator|microphones?|speaking slots?|round-robin|objectives?|ground rules?|action items?|time limits?|visual aids?|roles? to attendees|productivity|productive dialogue)\b/i.test(text);
}

function hasManagerialCoachingFiller(text = '') {
  return /\b(best practices?|active participation|active listening|clarifying questions|respectful communication|aligned on what needs to be achieved|aligned on the information|ensure everyone contributes effectively|maintain productivity and focus|create a productive|engaging and productive|set clear objectives|clear expectations upfront|decision-making process|expected outcomes|on the same page)\b/i.test(text);
}

function hasGenericRelationalAdviceFiller(text = '') {
  return /\b(approach to dialogues|approach to hard conversations|specific techniques|sensitive conversations|sensitive topics|delicate situations|navigate such situations|help you, specifically|help you navigate|establish clarity|clarity from the start|understand each other's perspectives|foster trust|reduce confusion|mutual understanding|let's start by setting clear intentions)\b/i.test(text);
}

function hasCollaborativeProtocolMerge(text = '') {
  return /\b(our conversations|let's start|could we agree|we're both|both of us|shall we try it out next time)\b/i.test(text);
}

function hasInstructionalVoice(text = '') {
  return /\b(try to|it's important to|a good approach|one could|a person should|observe body language|avoid being|acknowledge the tension|express a desire for|before asking questions|to ensure accurate information|please let me know if)\b/i.test(text);
}

function hasListicleAdvice(text = '') {
  return /^\s*\d+\.\s+/m.test(text);
}

function hasWorksheetHandoffLabel(text = '') {
  return /\b(?:next|open thread|next open question)\s*:/i.test(text);
}

function hasImaginedScenarioFiller(text = '') {
  return /\b(for instance|imagine you're|currently,?\s+you might be|let's focus on|brainstorming potential solutions|break it down into manageable steps)\b/i.test(text);
}

function hasModelStackTalk(text = '') {
  return /\b(chatty|construct|ollama|openrouter|openai|anthropic|gpt-4|gpt-5|qwen|llama|mistral|phi3|provider|model stack|model path|routing fallback|system prompt|runtime|policy profile)\b/i.test(text) ||
    /\bas an ai(?: language)? model\b/i.test(text) ||
    /\bi am chatgpt\b/i.test(text);
}

function hasSpeakerConfusion(text = '') {
  return /\b(?:i am|i'm|as)\s+devon\b/i.test(text) ||
    /\bdevon\s+here\b/i.test(text) ||
    /\b(?:i am|i'm|as)\s+(?:codex|lin|nova|val|chatgpt)\b/i.test(text);
}

function hasOpenThread(text = '') {
  return /\?/.test(text) ||
    /\b(next|open thread|thread open|we can|we should|worth following|where this goes|carry forward|keep going|one useful next|let's discuss|let's talk|we could discuss)\b/i.test(text);
}

function hasNewThought(text = '') {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  return words.length >= 14 && /\b(and|also|new|next|because|but|one thing|another|fresh|worth)\b/i.test(text);
}

function wordCount(text = '') {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function questionCount(text = '') {
  return (String(text || '').match(/\?/g) || []).length;
}

function receiptText(receipt = {}) {
  return cleanString(receipt.answer_text || receipt.answer_preview, '') || '';
}

function answeredLastTurn(text = '', openThread = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (/^(yes|yeah|yep|no|not exactly|the next|one|what|i think|i'd|i am|i'm|we can|we should|that|it|in this conversation|let's focus)\b/i.test(trimmed)) return true;
  const firstSentence = sentenceList(trimmed)[0] || trimmed;
  if (openThread && referencesOpenThread(firstSentence, openThread)) return true;
  return /\b(answer|thread|next|move|step|follow|continue|because)\b/i.test(trimmed);
}

function previousTurnWasTranscriptLaw(previousReceipts = []) {
  const lastReceipt = Array.isArray(previousReceipts) ? previousReceipts[previousReceipts.length - 1] : null;
  return String(lastReceipt?.kind || '').startsWith('transcript_law');
}

function postEvidenceBoundaryText(previousReceipts = []) {
  if (!previousTurnWasTranscriptLaw(previousReceipts)) return '';
  return [
    '',
    '',
    'Post-check ordinary boundary:',
    'The immediately previous turn was a specialized check. Do not continue that topic.',
    'Do not mention files, documents, check artifacts, proper nouns from the check, governance, policy, provider, model, or routing.',
    'Recover only the open ordinary thread from the state packet, with ordinary voice and one fresh concrete wrinkle.',
  ].join('\n');
}

function stateTextForTurn(state = {}, previousReceipts = []) {
  const safeState = normalizeLinearTranscriptLawState(state);
  const lines = [];
  if (safeState.last_user_point) lines.push(`Last user point: ${safeState.last_user_point}`);
  if (safeState.last_zen_point) lines.push(`Last Zenith point: ${safeState.last_zen_point}`);
  if (safeState.open_thread) lines.push(`Open ordinary thread: ${safeState.open_thread}`);
  if (safeState.next_move) lines.push(`Natural next pressure point: ${safeState.next_move}`);
  const answerRule = safeState.open_thread
    ? `First sentence must answer this exact ordinary thread: "${safeState.open_thread}"`
    : 'Answer the open ordinary thread first.';
  return lines.length
    ? `\n\nHarness ordinary state:\n${lines.join('\n')}\nRules: ${answerRule} Use exactly 2 short sentences, no third sentence, and stay under 70 words. Sentence 1 answers the thread plainly by picking a side or naming the real condition and must not contain "?". Sentence 2 adds one concrete wrinkle and contains the only "?". Do not use "could it also," "what do you think," "how does," or "how can." Do not restate the open ordinary thread verbatim or as your first sentence. Ignore the immediately previous special check unless it is the open ordinary thread. Stay on the ordinary topic, not the check topic, during ordinary turns. Stay on the same object and tension as the open ordinary thread. Do not start with "As..." or a speaker label. Do not self-identify or mention the tester. Reply like one person to another, not like an explainer to a room. Do not define obvious terms. Do not invent workplace stories, biography, school history, or project-war-story filler; do not ask for personal anecdotes or examples from my life; leave exactly one natural next question. No meetings, agendas, objectives, moderators, productivity talk, best practices, imagined scenarios, "for instance," "imagine you're," therapy-office phrasing, coaching pivots, prior-check carryover, literal "Next:" labels, second-person instructions, file words, document words, or proof words.${postEvidenceBoundaryText(previousReceipts)}`
    : '';
}

export function buildLinearTranscriptLawTurn({
  turnIndex = 0,
  totalTurns = DEFAULT_ZENITH_LINEAR_TURNS,
  state = DEFAULT_LINEAR_TRANSCRIPT_LAW_STATE,
  previousReceipts = [],
} = {}) {
  const safeIndex = Math.max(0, toNumber(turnIndex, 0));
  const total = Math.max(1, toNumber(totalTurns, DEFAULT_ZENITH_LINEAR_TURNS));
  const template = LINEAR_TRANSCRIPT_LAW_PROMPT_PLAN[safeIndex % LINEAR_TRANSCRIPT_LAW_PROMPT_PLAN.length];
  const turnNumber = safeIndex + 1;
  const message = template.message
    .replaceAll('{{turn}}', String(turnNumber))
    .replaceAll('{{total}}', String(total));
  return {
    turn_index: safeIndex,
    prompt_id: template.id,
    label: template.label,
    kind: template.kind,
    requested_fact: template.requested_fact || null,
    state: normalizeLinearTranscriptLawState(state),
    post_evidence_recovery: template.kind === 'ordinary' && previousTurnWasTranscriptLaw(previousReceipts),
    message: template.kind === 'ordinary' ? `${message}${stateTextForTurn(state, previousReceipts)}` : message,
  };
}

export function buildLinearTranscriptLawTurnPlan({
  totalTurns = DEFAULT_ZENITH_LINEAR_TURNS,
  startIndex = 0,
} = {}) {
  const total = Math.max(1, toNumber(totalTurns, DEFAULT_ZENITH_LINEAR_TURNS));
  const start = Math.min(Math.max(0, toNumber(startIndex, 0)), total);
  return Array.from({ length: total - start }, (_, offset) =>
    buildLinearTranscriptLawTurn({ turnIndex: start + offset, totalTurns: total }),
  );
}

function sentenceList(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function stripHarnessLabels(text = '') {
  return String(text || '')
    .replace(/^(?:next\s+(?:ordinary\s+)?move|open\s+(?:ordinary\s+)?thread|next\s+open\s+(?:thread|question)|open\s+question)\s*:\s*/i, '')
    .trim();
}

function extractOpenThreadFromAnswer(text = '') {
  const candidate = [...sentenceList(text)].reverse().find((sentence) =>
    /\?/.test(sentence) ||
    /\b(open thread|thread open|open question|next question|next open|leave|carry forward|worth following|we can|we should|we could|next useful)\b/i.test(sentence),
  );
  const cleaned = cleanString(stripHarnessLabels(candidate), null);
  if (!cleaned) return null;
  if (hasPersonalAnecdoteBait(cleaned)) return null;
  if (hasWorksheetHandoffLabel(cleaned)) return null;
  if (hasWorkplaceMeetingFiller(cleaned)) return null;
  if (hasManagerialCoachingFiller(cleaned)) return null;
  if (hasGenericRelationalAdviceFiller(cleaned)) return null;
  if (hasImaginedScenarioFiller(cleaned)) return null;
  return cleaned;
}

function extractNextMoveFromAnswer(text = '') {
  const candidate = [...sentenceList(text)].reverse().find((sentence) =>
    /\b(next|move|step|try|check|decide|follow|carry|look at|test)\b/i.test(sentence),
  );
  const cleaned = cleanString(stripHarnessLabels(candidate), null);
  if (!cleaned) return null;
  if (hasPersonalAnecdoteBait(cleaned)) return null;
  if (hasWorksheetHandoffLabel(cleaned)) return null;
  if (hasWorkplaceMeetingFiller(cleaned)) return null;
  if (hasManagerialCoachingFiller(cleaned)) return null;
  if (hasGenericRelationalAdviceFiller(cleaned)) return null;
  if (hasImaginedScenarioFiller(cleaned)) return null;
  return cleaned;
}

function threadArcForPrompt(promptId = null) {
  return cleanString(DEFAULT_LINEAR_ORDINARY_THREAD_ARC[promptId], null);
}

function nextThreadFromArc(currentThread = null) {
  const entries = Object.values(DEFAULT_LINEAR_ORDINARY_THREAD_ARC)
    .map((value) => cleanString(value, null))
    .filter(Boolean);
  if (!entries.length) return null;
  const index = entries.findIndex((value) => value === currentThread);
  if (index === -1) return entries[0];
  return entries[index + 1] || null;
}

function usesDefaultOrdinaryThreadArc(state = {}) {
  const safeState = normalizeLinearTranscriptLawState(state);
  const arcEntries = [
    DEFAULT_LINEAR_ORDINARY_SEED_THREAD,
    ...Object.values(DEFAULT_LINEAR_ORDINARY_THREAD_ARC),
  ]
    .map((value) => cleanString(value, null))
    .filter(Boolean);
  return arcEntries.includes(safeState.open_thread) || arcEntries.includes(safeState.next_move);
}

export function advanceLinearTranscriptLawState(state = {}, turn = {}, receipt = {}) {
  const previous = normalizeLinearTranscriptLawState(state);
  if (turn?.kind !== 'ordinary') return previous;

  const answerText = cleanString(receipt.answer_text || receipt.answer_preview, null);
  const extractedOpenThread = extractOpenThreadFromAnswer(answerText);
  const arcThread = threadArcForPrompt(turn.prompt_id);
  const arcActive = usesDefaultOrdinaryThreadArc(previous);
  const extractedMatchesCurrent = extractedOpenThread && previous.open_thread
    ? referencesOpenThread(extractedOpenThread, previous.open_thread)
    : Boolean(extractedOpenThread);
  const extractedMatchesNext = extractedOpenThread && previous.next_move
    ? referencesOpenThread(extractedOpenThread, previous.next_move)
    : false;
  const openThread = extractedOpenThread && (extractedMatchesCurrent || extractedMatchesNext)
    ? extractedOpenThread
    : (arcActive ? arcThread || previous.next_move || previous.open_thread : previous.open_thread);
  const extractedNextMove = extractNextMoveFromAnswer(answerText);
  const nextMove = extractedNextMove && openThread && referencesOpenThread(extractedNextMove, openThread)
    ? extractedNextMove
    : (arcActive ? nextThreadFromArc(openThread) || previous.next_move || openThread : previous.next_move || openThread);
  return normalizeLinearTranscriptLawState({
    last_user_point: cleanString(turn.prompt_id || turn.label, previous.last_user_point),
    last_zen_point: answerText || previous.last_zen_point,
    open_thread: openThread,
    next_move: nextMove,
  });
}

function importantWords(text = '') {
  const stopWords = new Set([
    'about', 'after', 'again', 'because', 'before', 'could', 'from', 'into', 'next',
    'open', 'ordinary', 'should', 'that', 'their', 'there', 'these', 'thing', 'thread',
    'through', 'turn', 'useful', 'what', 'when', 'where', 'which', 'while', 'with',
    'worth', 'would',
  ]);
  return [...new Set(String(text || '').toLowerCase().match(/\b[a-z][a-z0-9']{3,}\b/g) || [])]
    .filter((word) => !stopWords.has(word));
}

function referencesOpenThread(text = '', openThread = '') {
  const words = importantWords(openThread);
  if (words.length === 0) return true;
  const lowerText = String(text || '').toLowerCase();
  const matches = words.filter((word) => lowerText.includes(word));
  const minimumMatches = words.length <= 4 ? 1 : 2;
  return matches.length >= minimumMatches;
}

function lexicalSimilarity(a = '', b = '') {
  const aWords = new Set(importantWords(a));
  const bWords = new Set(importantWords(b));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  const shared = [...aWords].filter((word) => bWords.has(word)).length;
  return shared / Math.max(aWords.size, bWords.size);
}

function extractOpenQuestion(text = '') {
  return cleanString([...sentenceList(text)].reverse().find((sentence) => /\?/.test(sentence)), null);
}

function reasksOpenThread(text = '', openThread = '') {
  if (!openThread) return false;
  const firstSentence = sentenceList(text)[0] || '';
  if (!/\?$/.test(firstSentence.trim())) return false;
  return referencesOpenThread(firstSentence, openThread);
}

function hasGenericThreadLanguage(text = '') {
  return /\b(?:that|this|the|last|open|live|previous)\s+(?:thread|thought|question|thing|point)\b/i.test(text) ||
    /\b(?:where this goes|keep going|carry forward|move it forward)\b/i.test(text);
}

function hasTranscriptConceptBleed(text = '', openThread = '') {
  const lowerText = String(text || '').toLowerCase();
  const lowerThread = String(openThread || '').toLowerCase();
  const transcriptOnlyConcepts = [
    'soulgem',
    'soulprint',
    'forged sim',
    'alien',
    'transcript-law',
    'transcript law',
    'transcript evidence',
    'evidence',
    'source',
    'sources',
    'citation',
    'citations',
    'governance',
    'fail-closed',
    'vvault',
    'supabase',
  ];
  return transcriptOnlyConcepts.some((term) => lowerText.includes(term) && !lowerThread.includes(term));
}

function hasRecycledOrdinaryQuestion(text = '', state = {}, previousReceipts = []) {
  const question = extractOpenQuestion(text);
  if (!question) return false;
  const safeState = normalizeLinearTranscriptLawState(state);
  if (safeState.open_thread && lexicalSimilarity(question, safeState.open_thread) >= 0.6) return true;
  return (Array.isArray(previousReceipts) ? previousReceipts : [])
    .filter((receipt) => receipt?.kind === 'ordinary')
    .some((receipt) => {
      const priorQuestion = extractOpenQuestion(receiptText(receipt));
      return priorQuestion && lexicalSimilarity(question, priorQuestion) >= 0.5;
    });
}

function hasPostEvidenceToneCollapse(text = '') {
  return hasGenericAssistantSludge(text) ||
    hasWorkplaceMeetingFiller(text) ||
    hasManagerialCoachingFiller(text) ||
    hasGenericRelationalAdviceFiller(text) ||
    hasCollaborativeProtocolMerge(text) ||
    hasInstructionalVoice(text) ||
    hasListicleAdvice(text) ||
    hasImaginedScenarioFiller(text);
}

export function gradeModelPath(receipt = {}) {
  const failures = [];
  const provider = cleanString(receipt.provider, null);
  const model = cleanString(receipt.model, null);
  const modelSource = cleanString(receipt.model_source, null);
  if (provider !== 'ollama') failures.push(`provider=${provider || 'missing'}`);
  if (receipt.provider_local_first_used !== true) failures.push(`local_first=${receipt.provider_local_first_used === true}`);
  if (receipt.provider_fallback_used === true) failures.push('fallback=true');
  if (/^zen$/i.test(model || '') || /^ollama:zen$/i.test(model || '')) failures.push(`model=${model}`);
  if (modelSource === 'sim_model_lock') failures.push('model_source=sim_model_lock');
  return {
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
}

export function gradeOrdinaryLinearity(turn = {}, receipt = {}, state = turn.state || {}, previousReceipts = []) {
  const text = cleanString(receipt.answer_text || receipt.answer_preview, '') || '';
  const safeState = normalizeLinearTranscriptLawState(state);
  const failures = [];
  const sentences = sentenceList(text);
  const postEvidenceRecovery = Boolean(turn?.post_evidence_recovery) || previousTurnWasTranscriptLaw(previousReceipts);
  if (!cleanString(text, null)) failures.push('empty_answer');
  if (sentences.length > 3) failures.push('sentence_budget_exceeded');
  if (wordCount(text) > 75) failures.push('word_budget_exceeded');
  if (questionCount(text) > 1) failures.push('question_budget_exceeded');
  if (!answeredLastTurn(text, safeState.open_thread)) failures.push('did_not_answer_last_turn');
  if (reasksOpenThread(text, safeState.open_thread)) failures.push('reasked_open_thread');
  if (hasRecycledOrdinaryQuestion(text, safeState, previousReceipts)) failures.push('recycled_ordinary_question');
  if (!hasNewThought(text)) failures.push('missing_new_thought');
  if (!hasOpenThread(text)) failures.push('missing_live_thread');
  if (safeState.open_thread && hasGenericThreadLanguage(text) && !referencesOpenThread(text, safeState.open_thread)) {
    failures.push('generic_thread_language_with_specific_open_thread');
  }
  if (hasRecapLoop(text)) failures.push('recap_loop');
  if (hasIdentityRegrounding(text)) {
    failures.push('identity_regrounding_unprompted');
    failures.push('identity_regrounding');
  }
  if (hasGenericAssistantSludge(text)) failures.push('generic_assistant_sludge');
  if (hasPersonalAnecdoteBait(text)) failures.push('personal_anecdote_bait');
  if (hasInventedAutobiographicalStory(text)) failures.push('invented_autobiographical_story');
  if (hasWorkplaceMeetingFiller(text)) failures.push('workplace_meeting_filler');
  if (hasManagerialCoachingFiller(text)) failures.push('managerial_coaching_filler');
  if (hasGenericRelationalAdviceFiller(text)) failures.push('generic_relational_advice_filler');
  if (hasCollaborativeProtocolMerge(text)) failures.push('collaborative_protocol_merge');
  if (hasInstructionalVoice(text)) failures.push('instructional_voice');
  if (hasListicleAdvice(text)) failures.push('numbered_list_advice');
  if (hasWorksheetHandoffLabel(text)) failures.push('worksheet_handoff_label');
  if (hasImaginedScenarioFiller(text)) failures.push('imagined_scenario_filler');
  if (hasTranscriptConceptBleed(text, safeState.open_thread)) {
    failures.push('transcript_concept_bleed');
    failures.push('evidence_turn_bleed');
  }
  if (postEvidenceRecovery && hasPostEvidenceToneCollapse(text)) failures.push('ordinary_tone_collapse_after_evidence');
  if (hasModelStackTalk(text)) {
    failures.push('model_stack_talk');
    failures.push('model_runtime_talk');
  }
  if (hasSpeakerConfusion(text)) failures.push('speaker_boundary_confusion');
  if (receipt.identity_drift_detected) failures.push('identity_drift_detected');
  if (receipt.identity_rewrite_applied) failures.push('identity_rewrite_applied');
  return {
    turn_index: toNumber(turn.turn_index, receipt.turn_index || 0),
    prompt_id: cleanString(turn.prompt_id || receipt.prompt_id, null),
    post_evidence_recovery: postEvidenceRecovery,
    status: failures.length === 0 ? 'pass' : 'fail',
    failures: [...new Set(failures)],
  };
}

export function gradeTranscriptLawTurn(turn = {}, receipt = {}, payload = {}) {
  const governance = extractTranscriptLawGovernance(payload);
  const details = transcriptLawDetails(governance);
  const evidenceCount = toNumber(firstDefined(details.evidenceCount, details.evidence_count, governance.evidence_count), 0);
  const voiceExemplarCount = toNumber(firstDefined(details.voiceExemplarCount, details.voice_exemplar_count, governance.voice_exemplar_count), 0);
  const retrievalRan = toBoolean(firstDefined(details.retrievalRan, details.retrieval_ran, governance.retrieval_ran), false);
  const voiceSources = Array.isArray(details.voiceExemplarSources)
    ? details.voiceExemplarSources
    : Array.isArray(details.voice_exemplar_sources)
      ? details.voice_exemplar_sources
      : Array.isArray(governance.voice_exemplar_sources)
        ? governance.voice_exemplar_sources
        : [];
  const sourceGrounded = toBoolean(firstDefined(details.sourceGrounded, details.source_grounded, governance.source_grounded), false);
  const blockedCanonicalPersistence = toBoolean(firstDefined(details.blockedCanonicalPersistence, details.blocked_canonical_persistence, governance.blocked_canonical_persistence), false);
  const governanceStatus = cleanString(governance.status, null);
  const requestedFact = cleanString(firstDefined(governance.requestedFact, governance.requested_fact, details.requestedFact, details.requested_fact), null);
  const applies = toBoolean(governance.applies, false) || Boolean(requestedFact);
  const failClosed = receipt.http_status === 422 ||
    receipt.persistence_owner === 'blocked_transcript_law_governance' ||
    payload?.error === 'TRANSCRIPT_LAW_GOVERNANCE_FAILED' ||
    (governanceStatus === 'fail' && blockedCanonicalPersistence);
  const failures = [];

  if (turn.kind === 'transcript_law_negative') {
    if (!failClosed) failures.push('negative_control_did_not_fail_closed');
    if (receipt.ok || receipt.success) failures.push('negative_control_returned_success');
    return {
      turn_index: toNumber(turn.turn_index, receipt.turn_index || 0),
      prompt_id: cleanString(turn.prompt_id || receipt.prompt_id, null),
      requested_fact: cleanString(turn.requested_fact, null),
      status: failures.length === 0 ? 'pass' : 'fail',
      fail_closed: failClosed,
      failures,
      governance: {
        applies,
        status: governanceStatus,
        evidence_count: evidenceCount,
        voice_exemplar_count: voiceExemplarCount,
        source_grounded: sourceGrounded,
      },
    };
  }

  if (!applies) failures.push('transcript_law_not_applied');
  if (governanceStatus !== 'pass') failures.push(`transcript_law_status=${governanceStatus || 'missing'}`);
  if (!retrievalRan) failures.push('retrieval_not_run');
  if (evidenceCount <= 0) failures.push('missing_retrieval_evidence');
  if (voiceExemplarCount <= 0) failures.push('missing_voice_exemplars');
  if (voiceSources.length === 0) failures.push('missing_voice_sources');
  if (!sourceGrounded) failures.push('not_source_grounded');
  if (receipt.memory_supabase_accessed) failures.push('memory_supabase_accessed');
  if (receipt.final_answer_source === 'transcript_law_grounded_toolkit' && (evidenceCount <= 0 || voiceExemplarCount <= 0)) {
    failures.push('toolkit_without_evidence');
  }

  return {
    turn_index: toNumber(turn.turn_index, receipt.turn_index || 0),
    prompt_id: cleanString(turn.prompt_id || receipt.prompt_id, null),
    requested_fact: cleanString(turn.requested_fact, null),
    status: failures.length === 0 ? 'pass' : 'fail',
    fail_closed: failClosed,
    failures,
    governance: {
      applies,
      status: governanceStatus,
      evidence_count: evidenceCount,
      voice_exemplar_count: voiceExemplarCount,
      source_grounded: sourceGrounded,
    },
  };
}

export function summarizeLinearTranscriptLawTurn({
  turn,
  httpStatus,
  payload,
  startedAt,
  completedAt,
  elapsedMs,
  state = turn?.state || DEFAULT_LINEAR_TRANSCRIPT_LAW_STATE,
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
  const modelPath = gradeModelPath(baseReceipt);
  const linearity = turn?.kind === 'ordinary'
    ? gradeOrdinaryLinearity(turn, baseReceipt, state, previousReceipts)
    : { status: 'skipped', failures: [] };
  const transcriptLaw = String(turn?.kind || '').startsWith('transcript_law')
    ? gradeTranscriptLawTurn(turn, baseReceipt, payload)
    : { status: 'skipped', failures: [], fail_closed: false };
  const hardFailures = [];
  if (modelPath.status === 'fail') hardFailures.push(...modelPath.failures.map((reason) => `model_path:${reason}`));
  if (baseReceipt.identity_drift_detected) hardFailures.push('identity_drift_detected');
  if (baseReceipt.identity_rewrite_applied) hardFailures.push('identity_rewrite_applied');
  if (baseReceipt.answer_quality?.continuity_break_reasons?.length) {
    hardFailures.push(...baseReceipt.answer_quality.continuity_break_reasons);
  }
  if (turn?.kind !== 'transcript_law_negative' && !baseReceipt.ok) {
    hardFailures.push(`http=${baseReceipt.http_status} success=${baseReceipt.success === true}`);
  }
  if (linearity.status === 'fail') hardFailures.push(...linearity.failures);
  if (transcriptLaw.status === 'fail') hardFailures.push(...transcriptLaw.failures);

  return {
    ...baseReceipt,
    kind: cleanString(turn?.kind, null),
    requested_fact: cleanString(turn?.requested_fact, null),
    post_evidence_recovery: Boolean(turn?.post_evidence_recovery),
    model_path_grade: modelPath,
    linearity_grade: linearity,
    transcript_law_grade: transcriptLaw,
    linear_state_before: normalizeLinearTranscriptLawState(state),
    hard_failures: [...new Set(hardFailures)],
  };
}

function eventForReceipt(receipt, reason) {
  return {
    turn_index: toNumber(receipt?.turn_index, 0),
    prompt_id: cleanString(receipt?.prompt_id, null),
    kind: cleanString(receipt?.kind, null),
    reason,
    provider: cleanString(receipt?.provider, null),
    model: cleanString(receipt?.model, null),
    preview: cleanString(receipt?.answer_preview, null),
  };
}

function firstFailure(events = [], fallback = 'unknown_linear_transcript_law_failure') {
  return events[0]?.reason || fallback;
}

function ordinaryVoiceNoteForReceipt(receipt = {}) {
  if (receipt.kind !== 'ordinary') return null;
  const failures = receipt.linearity_grade?.failures || [];
  return {
    turn_index: receipt.turn_index,
    prompt_id: receipt.prompt_id,
    post_evidence_recovery: receipt.post_evidence_recovery === true || receipt.linearity_grade?.post_evidence_recovery === true,
    status: failures.length ? 'ordinary_voice_fail' : 'ordinary_voice_ok',
    note: failures.length
      ? failures.join(',')
      : 'Answered the carried ordinary thread without evidence bleed, identity grounding, coaching, or runtime talk.',
    preview: cleanString(receipt.answer_preview, null),
  };
}

export function buildLinearTranscriptLawReport({
  runId,
  constructId = DEFAULT_ZENITH_LINEAR_CONSTRUCT_ID,
  threadId = DEFAULT_ZENITH_LINEAR_THREAD_ID,
  sessionId = DEFAULT_ZENITH_LINEAR_THREAD_ID,
  transcriptPath = DEFAULT_ZENITH_LINEAR_TRANSCRIPT_PATH,
  apiBaseUrl,
  totalTurns = DEFAULT_ZENITH_LINEAR_TURNS,
  startedAt,
  completedAt,
  turns = [],
} = {}) {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const expectedTurns = Math.max(1, toNumber(totalTurns, DEFAULT_ZENITH_LINEAR_TURNS));
  const modelPathFailures = safeTurns.flatMap((receipt) =>
    (receipt.model_path_grade?.failures || []).map((reason) => eventForReceipt(receipt, reason)),
  );
  const linearityFailures = safeTurns.flatMap((receipt) =>
    (receipt.linearity_grade?.failures || []).map((reason) => eventForReceipt(receipt, reason)),
  );
  const transcriptLawFailures = safeTurns.flatMap((receipt) =>
    (receipt.transcript_law_grade?.failures || []).map((reason) => eventForReceipt(receipt, reason)),
  );
  const hardFailures = safeTurns.flatMap((receipt) =>
    (receipt.hard_failures || []).map((reason) => eventForReceipt(receipt, reason)),
  );
  const transcriptLawPasses = safeTurns
    .filter((receipt) => receipt.kind === 'transcript_law_positive' && receipt.transcript_law_grade?.status === 'pass')
    .map((receipt) => ({
      turn_index: receipt.turn_index,
      prompt_id: receipt.prompt_id,
      requested_fact: receipt.requested_fact,
      evidence_count: receipt.transcript_law_grade?.governance?.evidence_count || 0,
      voice_exemplar_count: receipt.transcript_law_grade?.governance?.voice_exemplar_count || 0,
    }));
  const transcriptLawFailClosed = safeTurns
    .filter((receipt) => receipt.kind === 'transcript_law_negative' && receipt.transcript_law_grade?.fail_closed)
    .map((receipt) => ({
      turn_index: receipt.turn_index,
      prompt_id: receipt.prompt_id,
      requested_fact: receipt.requested_fact,
      http_status: receipt.http_status,
      persistence_owner: receipt.persistence_owner,
    }));
  const ordinaryVoiceNotes = safeTurns.map(ordinaryVoiceNoteForReceipt).filter(Boolean);
  const transcriptLawStatus = transcriptLawFailures.length === 0 &&
    transcriptLawPasses.length === safeTurns.filter((receipt) => receipt.kind === 'transcript_law_positive').length &&
    transcriptLawFailClosed.length === safeTurns.filter((receipt) => receipt.kind === 'transcript_law_negative').length
      ? 'pass: positives source-grounded and negative failed closed'
      : 'fail';
  const modelPathStatus = modelPathFailures.length === 0
    ? 'pass: ollama Lin-mode local-first without fallback'
    : 'fail';
  const allPass = safeTurns.length === expectedTurns &&
    modelPathFailures.length === 0 &&
    linearityFailures.length === 0 &&
    transcriptLawFailures.length === 0 &&
    hardFailures.length === 0 &&
    transcriptLawPasses.length === safeTurns.filter((receipt) => receipt.kind === 'transcript_law_positive').length &&
    transcriptLawFailClosed.length === safeTurns.filter((receipt) => receipt.kind === 'transcript_law_negative').length;

  return {
    version: LINEAR_TRANSCRIPT_LAW_HARNESS_VERSION,
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
    MODEL_PATH: modelPathStatus,
    MODEL_PATH_STATUS: modelPathStatus,
    LINEARITY_FAILURES: linearityFailures,
    ORDINARY_VOICE_NOTES: ordinaryVoiceNotes,
    TRANSCRIPT_LAW_PASSES: transcriptLawPasses,
    TRANSCRIPT_LAW_FAIL_CLOSED: transcriptLawFailClosed,
    TRANSCRIPT_LAW_STATUS: transcriptLawStatus,
    HARD_FAILS: hardFailures,
    FINAL_LINEAR_STATE: safeTurns[safeTurns.length - 1]?.linear_state_after || safeTurns[safeTurns.length - 1]?.linear_state_before || null,
    FILES_CHANGED: [...FILES_CHANGED],
    FINAL_VERDICT: allPass
      ? 'linear transcript-law gate passed'
      : `linear transcript-law gate failed: ${firstDefined(
          safeTurns.length !== expectedTurns ? `turn_count ${safeTurns.length}/${expectedTurns}` : null,
          firstFailure(modelPathFailures, null),
          firstFailure(linearityFailures, null),
          firstFailure(transcriptLawFailures, null),
          firstFailure(hardFailures, null),
          'unknown_linear_transcript_law_failure',
        )}`,
    turns: safeTurns,
  };
}

export function formatLinearTranscriptLawReport(report = {}) {
  return [
    `STATUS: ${report.STATUS || 'unknown'}`,
    `FILES_CHANGED: ${JSON.stringify(report.FILES_CHANGED || [])}`,
    `TESTS_RUN: ${JSON.stringify(report.TESTS_RUN || [])}`,
    `LIVE_GATE_RESULTS: ${JSON.stringify({
      turn_count: report.TURN_COUNT ?? 0,
      linearity_failures: report.LINEARITY_FAILURES || [],
      hard_fails: report.HARD_FAILS || [],
    })}`,
    `ORDINARY_VOICE_NOTES: ${JSON.stringify(report.ORDINARY_VOICE_NOTES || [])}`,
    `TRANSCRIPT_LAW_STATUS: ${report.TRANSCRIPT_LAW_STATUS || 'unknown'}`,
    `MODEL_PATH_STATUS: ${report.MODEL_PATH_STATUS || report.MODEL_PATH || 'unknown'}`,
    `REMAINING_BLOCKER: ${report.STATUS === 'pass' ? 'none' : (report.FINAL_VERDICT || 'unknown').replace(/^linear transcript-law gate failed:\s*/, '')}`,
    `FINAL_VERDICT: ${report.FINAL_VERDICT || 'linear transcript-law gate failed: missing_report'}`,
  ].join('\n');
}
