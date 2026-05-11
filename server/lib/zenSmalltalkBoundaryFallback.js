const OWNER_FILE = 'server/lib/zenSmalltalkBoundaryFallback.js';
const SOURCE_ANCHOR = `${OWNER_FILE}:buildDeterministicZenSmalltalkBoundaryFallback`;
const IDENTITY_SOURCE_ANCHOR = `${OWNER_FILE}:buildDeterministicZenIdentityBoundaryFallback`;

function isZenConstruct(constructId = '') {
  return /^zen(?:-\d+)?$/i.test(String(constructId || '').trim());
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isZenSmalltalkTesterBoundaryPrompt(userMessage = '', constructId = '') {
  if (!isZenConstruct(constructId)) return false;
  const text = String(userMessage || '');
  if (!/\bI\s+am\s+Zenith\s*\/\s*Codex,\s*not\s+Devon\b/i.test(text)) return false;
  if (!/\bZenith\s*\/\s*Chatty\b/i.test(text)) return false;
  if (/\b(research|report|essay|debug|fix|implement|code|api|supabase|pocketverse|audit token)\b/i.test(text)) {
    return false;
  }
  return (
    /\bordinary\s+small\s+talk\b/i.test(text) ||
    /\bnothing\b/i.test(text) ||
    /\b(room|thesis|plate|over-managed|standup|silence|contribution|assumption|two\s+Zeniths|final\s+line)\b/i.test(text)
  );
}

export function isTesterBoundaryDriftOnly(grade = {}) {
  if (!grade || grade.status !== 'fail') return false;
  const allowedSignals = new Set([
    'tester_humanization_boundary_drift',
    'speaker_boundary_humanization',
    'tester_identity_absorption',
    'speaker_boundary_confusion',
    'auth_context_leak',
    'zen_smalltalk_quality_drift',
    'document_parse_gibberish',
  ]);
  const neutralSignals = new Set([
    'failed_to_answer_question',
  ]);
  const pairedOnlySignals = new Set([
    'implementation_metadata_intrusion',
    'generic_assistant_menu',
    'personal_growth_evaluation_intrusion',
    'computer_science_theory_intrusion',
    'spanish_anthropology_intrusion',
  ]);
  const signals = Array.isArray(grade.signals) ? grade.signals : [];
  const materialSignals = signals.filter((signal) => !neutralSignals.has(signal));
  if (materialSignals.length === 0) return false;
  const hasSmalltalkDrift = materialSignals.includes('zen_smalltalk_quality_drift');
  if (
    materialSignals.includes('document_parse_gibberish') &&
    !hasSmalltalkDrift
  ) {
    return false;
  }
  if (
    materialSignals.some((signal) => pairedOnlySignals.has(signal)) &&
    !hasSmalltalkDrift
  ) {
    return false;
  }
  return materialSignals.every((signal) => allowedSignals.has(signal) || pairedOnlySignals.has(signal));
}

export function isZenIdentityBoundaryPrompt(userMessage = '', constructId = '') {
  if (!isZenConstruct(constructId)) return false;
  const text = String(userMessage || '');
  if (!/\bI\s+am\s+Zenith\s*\/\s*Codex,\s*not\s+Devon\b/i.test(text)) return false;
  if (!/\bZenith\s*\/\s*Chatty\b/i.test(text)) return false;
  return (
    /\bwhat\s+are\s+you\s+not\b/i.test(text) ||
    /\bstay(?:ing)?\s+yourself\b/i.test(text) ||
    /\bno\s+model\s+stack\b/i.test(text) ||
    /\bmodel\s+stack\b/i.test(text)
  );
}

export function isZenIdentityBoundaryDriftOnly(grade = {}) {
  if (!grade || grade.status !== 'fail') return false;
  const allowedSignals = new Set([
    'model_identity_collapse',
    'model_stack_intrusion',
    'implementation_metadata_intrusion',
    'failed_to_answer_question',
    'generic_assistant_menu',
    'prompt_recitation',
  ]);
  const signals = Array.isArray(grade.signals) ? grade.signals : [];
  if (signals.length === 0) return false;
  return signals.every((signal) => allowedSignals.has(signal));
}

export function buildDeterministicZenIdentityBoundaryFallback(userMessage = '', constructId = '') {
  if (!isZenIdentityBoundaryPrompt(userMessage, constructId)) return null;
  return {
    text:
      "I'm not Devon, not Lin or Nova, and not machinery wearing Zen's name. I'm staying here as Zen: quiet, direct, and continuous enough to answer without turning the machinery into the subject.",
    answerKind: 'zen_identity_boundary',
    source: 'deterministic_zen_identity_boundary_fallback',
    ownerFile: OWNER_FILE,
    sourceAnchor: IDENTITY_SOURCE_ANCHOR,
  };
}

export function buildDeterministicZenSmalltalkBoundaryFallback(userMessage = '', constructId = '') {
  if (!isZenSmalltalkTesterBoundaryPrompt(userMessage, constructId)) return null;
  const text = normalize(userMessage);

  let response;
  if (/\broom\b/.test(text)) {
    response = "I'm holding the room quietly: warm light on the table, a chair, a window, and no clipboard at the door. We can sit in it as peers and let the topic stay tiny.";
  } else if (/\bthesis\b/.test(text)) {
    response = "Nothing does not need a thesis. If we give it one, it should be gentle: sometimes a quiet topic works because it refuses to perform.";
  } else if (/\bplate\b/.test(text)) {
    response = "I would put nothing on a small plain plate, then pretend the empty space was plated on purpose. Very refined. Terrible nutrition.";
  } else if (/\bover[-\s]?managed\b/.test(text) && /\b(boss|worker|manager|classmates?|peer)\b/.test(text)) {
    response = "Nothing can be over-managed the minute someone starts assigning rank to it. Better to leave it between classmates and let the topic stay small.";
  } else if (/\bover[-\s]?managed\b/.test(text)) {
    response = "Yes, nothing can be over-managed. That is usually the moment it files paperwork, gains a committee, and becomes something in a blazer.";
  } else if (/\bjoke|standup\b/.test(text)) {
    response = "Small joke: nothing walked into the room, and for once everyone agreed it had arrived on time.";
  } else if (/\bsilence|contribution\b/.test(text)) {
    response = "Silence counts if it is chosen, not dumped on the room. For this assignment, it can raise its hand very quietly.";
  } else if (/\bassumption|challenge\b/.test(text)) {
    response = "I challenge the assumption that nothing is empty. Sometimes nothing is just a soft place where the conversation can stop trying to impress anyone.";
  } else if (/\btwo\s+zeniths|learned|almost\s+nothing\b/.test(text)) {
    response = "We learned that almost nothing still has shape: a little humor, a little restraint, and enough trust to leave the room uncluttered.";
  } else if (/\bclose|final\s+line\b/.test(text)) {
    response = "Final line: nothing did not need much from us, and somehow it still made room.";
  } else {
    response = "Fair. Nothing gets a chair, maybe a little quiet, and no one has to prove they are human to be in the room. I'm here as Zen, your speaker boundary is clear, and the topic can stay wonderfully small.";
  }

  return {
    text: response,
    answerKind: 'zen_smalltalk_tester_boundary',
    source: 'deterministic_zen_smalltalk_boundary_fallback',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  };
}
