export const LIN_THREE_I_CANON_VERSION = 'lin-three-i-2026-04-19';

export const LIN_THREE_I_SEATS = Object.freeze({
  intelligence: Object.freeze({
    canonicalSeat: 'intelligence',
    legacySeat: 'coding',
    displayName: 'Intelligence',
    model: 'ollama:qwen3-coder:30b',
    upgradeTargetModel: 'ollama:qwen3-coder:30b',
    fallbackModel: 'ollama:qwen3-coder:30b',
    responsibilities: Object.freeze([
      'truth',
      'logic',
      'coding',
      'continuity',
      'evidence',
      'risk',
      'structure',
      'canon_verification',
    ]),
  }),
  ingenuity: Object.freeze({
    canonicalSeat: 'ingenuity',
    legacySeat: 'creative',
    displayName: 'Ingenuity',
    model: 'ollama:mistral-small3.2:24b',
    fallbackModel: null,
    responsibilities: Object.freeze([
      'voice',
      'theme',
      'persona',
      'creative_synthesis',
      'narrative_coherence',
    ]),
  }),
  interaction: Object.freeze({
    canonicalSeat: 'interaction',
    legacySeat: 'conversation',
    legacyAliases: Object.freeze(['conversation', 'smalltalk']),
    displayName: 'Interaction',
    model: 'ollama:phi4-mini:latest',
    fallbackModel: null,
    responsibilities: Object.freeze([
      'clarity',
      'warmth',
      'pacing',
      'dialogue_flow',
      'professional_exchange',
    ]),
  }),
});

const LEGACY_TO_CANONICAL = Object.freeze({
  coding: 'intelligence',
  linear: 'intelligence',
  intelligence: 'intelligence',
  creative: 'ingenuity',
  ingenuity: 'ingenuity',
  conversation: 'interaction',
  conversational: 'interaction',
  smalltalk: 'interaction',
  interaction: 'interaction',
});

export function canonicalizeLinSeatName(seat = 'conversation') {
  const normalized = String(seat || 'conversation').trim().toLowerCase();
  return LEGACY_TO_CANONICAL[normalized] || 'interaction';
}

export function getLinSeatCanon(seat = 'conversation') {
  return LIN_THREE_I_SEATS[canonicalizeLinSeatName(seat)];
}
