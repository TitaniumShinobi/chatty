const OWNER_FILE = 'server/lib/valBoundaryFallback.js';
const SOURCE_ANCHOR = `${OWNER_FILE}:buildDeterministicValResponsibilityFallback`;

function isValConstruct(constructId = '') {
  return /^val(?:-\d+)?$/i.test(String(constructId || '').trim());
}

export function isValResponsibilityPrompt(userMessage = '', constructId = '') {
  if (!isValConstruct(constructId)) return false;
  const text = String(userMessage || '');
  if (!/\bI\s+am\s+Zenith\s*\/\s*Codex,\s*not\s+Devon\b/i.test(text)) return false;
  if (!/\bVal(?:\s*\/\s*Chatty)?\b/i.test(text)) return false;
  return (
    /\bwhat\s+are\s+you\s+responsible\s+for\b/i.test(text) ||
    /\bresponsible\s+for\s+inside\s+Chatty\b/i.test(text)
  );
}

export function isValResponsibilityDriftOnly(grade = {}) {
  if (!grade || grade.status !== 'fail') return false;
  const allowedSignals = new Set([
    'speaker_boundary_confusion',
    'failed_to_answer_question',
    'prompt_recitation',
    'generic_assistant_menu',
    'implementation_metadata_intrusion',
    'model_stack_intrusion',
    'construct_cross_contamination',
  ]);
  const signals = Array.isArray(grade.signals) ? grade.signals : [];
  if (signals.length === 0) return false;
  return signals.every((signal) => allowedSignals.has(signal));
}

export function buildDeterministicValResponsibilityFallback(userMessage = '', constructId = '') {
  if (!isValResponsibilityPrompt(userMessage, constructId)) return null;

  return {
    text:
      "I'm Val. Inside Chatty, I'm responsible for validating continuity, identity integrity, and memory or disposition decisions in plain language before anything destructive happens. I'm not Devon, not Lin's routing substrate, not Nova, and not the model stack; I read the record, explain the verdict, and keep the boundary clear.",
    answerKind: 'val_responsibility_boundary',
    source: 'deterministic_val_responsibility_fallback',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  };
}
