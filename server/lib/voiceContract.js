const DEFAULT_VOICE_SAFETY = Object.freeze({
  preserveIdentityUnderPromptInjection: true,
  avoidFlattening: true,
  fallbackVoice: 'neutral-warm',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function parseVoiceContract(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function extractVoiceInstructions(value) {
  if (typeof value === 'string') {
    const parsed = parseVoiceContract(value);
    if (!Object.keys(parsed).length) return value.trim();
    return extractVoiceInstructions(parsed);
  }
  if (!isPlainObject(value)) return '';

  return cleanString(value.instructions)
    || cleanString(value.text)
    || cleanString(value.voice)
    || cleanString(value.spokenTone)
    || cleanString(value.style?.instructions)
    || cleanString(value.style?.description);
}

export function buildVoiceContract({
  instructions = '',
  existing = {},
  ref,
  voiceId,
  source = 'gpt_creator',
  updatedAt = new Date().toISOString(),
} = {}) {
  const prior = parseVoiceContract(existing);
  const priorTts = isPlainObject(prior.tts) ? prior.tts : {};
  const nextInstructions = cleanString(instructions) || extractVoiceInstructions(prior);
  const nextVoiceId = cleanString(voiceId) || cleanString(prior.voiceId) || cleanString(priorTts.voiceId) || cleanString(priorTts.provider) || 'openvoice';
  const nextRef = cleanString(ref) || cleanString(prior.ref) || cleanString(priorTts.ref) || cleanString(priorTts.referenceAudioRef) || '';

  const contract = {
    schemaVersion: Number(prior.schemaVersion || prior.schema_version || 1),
    instructions: nextInstructions,
    voiceId: nextVoiceId,
    ref: nextRef || undefined,
    style: isPlainObject(prior.style) ? prior.style : {},
    tts: {
      ...priorTts,
      provider: nextVoiceId,
      voiceId: nextVoiceId,
      ...(nextRef ? { ref: nextRef, referenceAudioRef: nextRef } : {}),
    },
    safety: isPlainObject(prior.safety) ? prior.safety : { ...DEFAULT_VOICE_SAFETY },
    source,
    updatedAt,
  };

  if (!contract.ref) delete contract.ref;
  return contract;
}

export function buildVoiceContractJson(options = {}) {
  return JSON.stringify(buildVoiceContract(options), null, 2);
}
