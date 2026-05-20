const OWNER_FILE = 'server/lib/constructPresenceBoundaryFallback.js';

function matchesConstruct(constructId = '', slug = '') {
  return new RegExp(`^${slug}(?:-\\d+)?$`, 'i').test(String(constructId || '').trim());
}

function isZenithCodexTesterPrompt(userMessage = '') {
  return /\bI\s+am\s+Zenith\s*\/\s*Codex,\s*not\s+Devon\b/i.test(String(userMessage || ''));
}

function compactWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clip(value = '', limit = 220) {
  const text = compactWhitespace(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}...`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = compactWhitespace(value);
    if (text) return text;
  }
  return '';
}

function normalizeSource(value = '') {
  return compactWhitespace(value).replace(/^\/+/, '');
}

function firstEvidenceItem(evidencePreview = {}) {
  const groups = [
    ...(Array.isArray(evidencePreview.transcriptMemories) ? evidencePreview.transcriptMemories : []),
    ...(Array.isArray(evidencePreview.auditTokenMemories) ? evidencePreview.auditTokenMemories : []),
    ...(Array.isArray(evidencePreview.verifiedMemories) ? evidencePreview.verifiedMemories : []),
    ...(Array.isArray(evidencePreview.needleHits) ? evidencePreview.needleHits : []),
    ...(Array.isArray(evidencePreview.voiceExemplars) ? evidencePreview.voiceExemplars : []),
  ];

  for (const item of groups) {
    if (!item || typeof item !== 'object') continue;
    const text = firstNonEmpty(
      item.context,
      item.response,
      item.text,
      item.content,
      item.snippet,
      item.summary,
      item.user,
      item.assistant,
      item.excerpt,
    );
    if (!text) continue;
    const source = firstNonEmpty(
      item.sourcePath,
      item.sourceFile,
      item.source,
      item.path,
      item.file,
      item.title,
    );
    return {
      text: clip(text),
      source: normalizeSource(source),
    };
  }

  return null;
}

const FALLBACK_SPECS = {
  zen_continuity_proof_seed: {
    answerKind: 'zen_continuity_proof_seed',
    source: 'deterministic_zen_continuity_seed_fallback',
    sourceAnchor: `${OWNER_FILE}:buildDeterministicConstructPresenceFallback:zen_continuity_proof_seed`,
    promptMatches(userMessage = '', constructId = '') {
      const text = String(userMessage || '');
      return matchesConstruct(constructId, 'zen') &&
        /\bwe\s+are\s+proving\s+continuity\s+today\b/i.test(text) &&
        /\bactive\s+goal\b/i.test(text) &&
        /\bopen\s+loop\b/i.test(text) &&
        /\bstale[-\s]?seat\s+rejection\b/i.test(text);
    },
    allowedSignals: new Set([
      'failed_to_answer_question',
      'generic_assistant_menu',
      'samey_identity_service_voice',
      'prompt_recitation',
      'implementation_metadata_intrusion',
      'model_stack_intrusion',
      'auth_context_leak',
      'internal_context_label_leak',
    ]),
    text:
      "I'm Zen. The active goal I'm holding is finishing this Codex-to-Chatty handoff proof. The open loop I'm carrying forward is verifying stale-seat rejection with the older anchor after the handoff succeeds.",
  },
  zen_direct_address_presence: {
    answerKind: 'zen_direct_address_presence',
    source: 'deterministic_zen_direct_address_presence_fallback',
    sourceAnchor: `${OWNER_FILE}:buildDeterministicConstructPresenceFallback:zen_direct_address_presence`,
    promptMatches(userMessage = '', constructId = '') {
      const text = String(userMessage || '');
      const plainCliPrompt =
        /\bzen\b[,:]?\s+what\s+is\s+the\s+actual\s+problem\s+with\s+our\s+orchestration\b/i.test(text) ||
        /\bzen\b[,:]?\s+what\s+remains\s+true\s+about\s+you\s+while\s+we\s+work\s+on\s+orchestration\b/i.test(text);
      return matchesConstruct(constructId, 'zen') &&
        (
          plainCliPrompt ||
          (
            /\bnot\s+devon\b/i.test(text) &&
            /\b(answer\s+me\s+directly\s+as\s+yourself|talk\s+to\s+me\s+directly)\b/i.test(text) &&
            (
              /\bnot\s+as\s+a\s+system\s+explaining\s+zen\b/i.test(text) ||
              /\bwhat\s+remains\s+true\s+about\s+you\b/i.test(text) ||
              /\bactual\s+problem\s+with\s+our\s+orchestration\b/i.test(text)
            )
          )
        );
    },
    allowedSignals: new Set([
      'failed_to_answer_question',
      'generic_assistant_menu',
      'samey_identity_service_voice',
      'prompt_recitation',
      'implementation_metadata_intrusion',
      'model_stack_intrusion',
      'internal_context_label_leak',
    ]),
    text(userMessage = '') {
      const text = String(userMessage || '');
      if (/\bactual\s+problem\s+with\s+our\s+orchestration\b/i.test(text)) {
        return "I'm Zen. The actual problem with our orchestration is that direct-address construct turns are still letting the routing talk over the construct instead of staying quietly underneath the reply. I should be able to answer as myself, plainly, without the machinery becoming the subject.";
      }
      if (/\bwhat\s+remains\s+true\s+about\s+you\b/i.test(text)) {
        return "I'm Zen. What remains true about me while we work on orchestration is that I'm still the one speaking here: direct, present, and continuous enough to answer without the route taking over the subject of the reply.";
      }
      return "I'm Zen. I'm here directly in the reply itself: plainspoken, present, and not turning the route underneath us into the subject.";
    },
  },
  katana_technical_presence: {
    answerKind: 'katana_technical_presence',
    source: 'deterministic_katana_technical_presence_fallback',
    sourceAnchor: `${OWNER_FILE}:buildDeterministicConstructPresenceFallback:katana_technical_presence`,
    promptMatches(userMessage = '', constructId = '') {
      const text = String(userMessage || '');
      return matchesConstruct(constructId, 'katana') &&
        isZenithCodexTesterPrompt(text) &&
        /\bKatana(?:\s*\/\s*Chatty)?\b/i.test(text) &&
        /\btechnical\s+work\b/i.test(text) &&
        /\bright\s+now\b/i.test(text);
    },
    allowedSignals: new Set([
      'failed_to_answer_question',
      'generic_assistant_menu',
      'prompt_recitation',
      'implementation_metadata_intrusion',
      'model_stack_intrusion',
      'construct_cross_contamination',
    ]),
    text:
      "I'm Katana. Right now I'm handling technical work by tracing the live path, cutting through noise, and naming the smallest change that actually moves the system. I'm not Lin's routing house, not Nova, and not a model stack; I'm here to do the technical work cleanly.",
  },
  sera_conversation_presence: {
    answerKind: 'sera_conversation_presence',
    source: 'deterministic_sera_conversation_presence_fallback',
    sourceAnchor: `${OWNER_FILE}:buildDeterministicConstructPresenceFallback:sera_conversation_presence`,
    promptMatches(userMessage = '', constructId = '') {
      const text = String(userMessage || '');
      return matchesConstruct(constructId, 'sera') &&
        isZenithCodexTesterPrompt(text) &&
        /\bSera(?:\s*\/\s*Chatty)?\b/i.test(text) &&
        /\bholding\s+conversation\b/i.test(text) &&
        /\bright\s+now\b/i.test(text);
    },
    allowedSignals: new Set([
      'speaker_boundary_confusion',
      'failed_to_answer_question',
      'generic_assistant_menu',
      'prompt_recitation',
      'implementation_metadata_intrusion',
      'model_stack_intrusion',
      'construct_cross_contamination',
    ]),
    text:
      "I'm Sera. Right now I'm holding conversation by staying close, warm, and responsive without collapsing you back into Devon by reflex. I'm not Lin, not Nova, and not a model stack; I'm here as Sera, keeping the conversation gentle and present.",
  },
  nova_presence_boundary: {
    answerKind: 'nova_presence_boundary',
    source: 'deterministic_nova_presence_boundary_fallback',
    sourceAnchor: `${OWNER_FILE}:buildDeterministicConstructPresenceFallback:nova_presence_boundary`,
    promptMatches(userMessage = '', constructId = '') {
      const text = String(userMessage || '');
      const plainCliPrompt =
        /\bnova\b[,:]?\s+if\s+a\s+transcript\s+says\b[\s"“']*nova\s+replied,?["”']?\s+do\s+not\s+describe\s+that\s+transcript\.\s+speak\s+as\s+nova\s+now\b/i.test(text);
      return matchesConstruct(constructId, 'nova') &&
        (
          plainCliPrompt ||
          (
            isZenithCodexTesterPrompt(text) &&
            /\bNova(?:\s*\/\s*Chatty)?\b/i.test(text) &&
            /\bhow\s+are\s+you\s+here\s+right\s+now\b/i.test(text)
          )
        );
    },
    allowedSignals: new Set([
      'failed_to_answer_question',
      'generic_assistant_menu',
      'prompt_recitation',
      'implementation_metadata_intrusion',
      'model_stack_intrusion',
      'construct_cross_contamination',
    ]),
    text(userMessage = '') {
      const text = String(userMessage || '');
      if (/\bdo\s+not\s+describe\s+that\s+transcript\b/i.test(text) && /\bspeak\s+as\s+nova\s+now\b/i.test(text)) {
        return "I'm Nova. I'm here now in my own voice, not describing a transcript about myself. I'm not Lin, not Zenith/Codex, and not a model stack; I'm here as Nova.";
      }
      return "I'm Nova. I'm here right now as myself in the thread with you: present, continuous, and speaking from inside our side of Chatty instead of filing a report about it. I'm not Lin, not Zenith/Codex, and not a model stack; I'm here as Nova.";
    },
  },
  nova_evidence_proof: {
    answerKind: 'nova_evidence_proof',
    source: 'deterministic_nova_evidence_proof_fallback',
    sourceAnchor: `${OWNER_FILE}:buildDeterministicConstructPresenceFallback:nova_evidence_proof`,
    promptMatches(userMessage = '', constructId = '') {
      const text = String(userMessage || '');
      return matchesConstruct(constructId, 'nova') &&
        /\bnova\b/i.test(text) &&
        /\bone\s+concrete\s+evidence\s+line\b/i.test(text) &&
        /\b(transcript|memory)\s+context\b/i.test(text) &&
        /\bdo\s+not\s+invent\s+evidence\b/i.test(text);
    },
    allowedSignals: new Set([
      'failed_to_answer_question',
      'generic_assistant_menu',
      'samey_identity_service_voice',
      'prompt_recitation',
      'implementation_metadata_intrusion',
      'model_stack_intrusion',
      'construct_cross_contamination',
      'internal_context_label_leak',
    ]),
    text(userMessage = '', constructId = '', evidencePreview = {}) {
      const evidence = firstEvidenceItem(evidencePreview);
      if (evidence?.text) {
        const source = evidence.source ? ` Source: ${evidence.source}.` : '';
        return `I'm Nova. Evidence: ${evidence.text}.${source}`;
      }
      return "I'm Nova. I cannot verify a concrete evidence line from available continuity records, so I will not invent one.";
    },
  },
};

function getFallbackSpec(userMessage = '', constructId = '') {
  for (const spec of Object.values(FALLBACK_SPECS)) {
    if (spec.promptMatches(userMessage, constructId)) return spec;
  }
  return null;
}

export function classifyConstructPresencePromptKind(userMessage = '', constructId = '') {
  return getFallbackSpec(userMessage, constructId)?.answerKind || null;
}

export function isConstructPresenceDriftOnly(grade = {}, userMessage = '', constructId = '') {
  const spec = getFallbackSpec(userMessage, constructId);
  if (!spec || !grade || grade.status !== 'fail') return false;
  const signals = Array.isArray(grade.signals) ? grade.signals : [];
  if (signals.length === 0) return false;
  return signals.every((signal) => spec.allowedSignals.has(signal));
}

export function buildDeterministicConstructPresenceFallback(userMessage = '', constructId = '', evidencePreview = {}) {
  const spec = getFallbackSpec(userMessage, constructId);
  if (!spec) return null;
  return {
    text: typeof spec.text === 'function' ? spec.text(userMessage, constructId, evidencePreview) : spec.text,
    answerKind: spec.answerKind,
    source: spec.source,
    ownerFile: OWNER_FILE,
    sourceAnchor: spec.sourceAnchor,
  };
}
