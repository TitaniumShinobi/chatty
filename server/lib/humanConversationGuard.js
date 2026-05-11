import { buildDeterministicConstructGreetingFallback } from './constructGreetingTurn.js';

function inferMemoryIntent(text = '') {
  const t = String(text || '').toLowerCase();
  return /\b(remember|recall|memory|memories|timeline|when did|last time|before|previously|we talked|we spoke)\b/.test(t);
}

function softenMemoryCertainty(text) {
  let out = text;
  out = out.replace(/\bI remember\b/gi, 'I think');
  out = out.replace(/\bI recall\b/gi, 'I think');
  out = out.replace(/\bI clearly remember\b/gi, 'I think I remember');
  out = out.replace(/\bdefinitely\b/gi, 'probably');
  return out;
}

function stripMetaRoboticPhrases(text) {
  let out = text;
  const internalLabel = '(?:LIVED\\s+MEMORIES|SESSION\\s+HISTORY|MEMORY_CONTEXT|NEEDLE\\s+HITS|PROTECTED_IDENTITY_DIRECTIVES|VERIFIED\\s+MEMORIES|CONTINUITY\\s+TIMELINE|TIME[_\\s-]*CONTEXT|USER[_\\s-]*CONTEXT)';
  out = out.replace(new RegExp(`\\n?\\s*\\[${internalLabel}\\][\\s\\S]*?\\[\\/${internalLabel}\\]\\s*`, 'gi'), '\n');
  out = out.replace(new RegExp(`^\\s*[\\[(]?\\s*${internalLabel}\\s*[\\])]?\\s*[:\\-]?\\s*`, 'gim'), '');
  out = out.replace(new RegExp(`[\\[(]\\s*${internalLabel}\\s*[\\])]\\s*[:\\-]?\\s*`, 'gi'), '');
  out = out.replace(/\bAs an AI(?: language model)?\b[:,]?\s*/gi, '');
  out = out.replace(/\bAs a language model\b[:,]?\s*/gi, '');
  out = out.replace(/\bI do not have access to\b/gi, "I don't have access to");
  out = out.replace(/\bI cannot\b/gi, "I can't");
  out = out.replace(/\bpolicy(?:\s+guidelines?)?\b/gi, 'guardrails');
  out = out.replace(/^\s*#+\s+/gm, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

export function asksForEvidenceStyle(text = '') {
  const t = String(text || '').toLowerCase().replace(/[‘’]/g, "'");
  const withoutAntiCitationDirectives = t.replace(
    /\b(?:do\s+not|don't|dont|no|without|avoid|stop|never)\b[^.!?\n]*(?:documents?|files?|pdfs?|filenames?|sources?|citations?|manifestos?|affidavits?|records?|logs?)\b[^.!?\n]*/gi,
    ' ',
  );

  const directEvidenceRequest = /\b(evidence|proof|quote|quoted|verbatim|source|sources|source path|citation|cite|cited|timestamp|what did i say|exact words|show me where|where did i say|receipt)\b/.test(
    withoutAntiCitationDirectives,
  );
  const documentAnalysisRequest = /\b(?:show|open|read|analy[sz]e|summari[sz]e|cite|quote|find|review|use|look at|what(?:'s| is| does)|according to)\b[^.!?\n]{0,80}\b(?:documents?|pdfs?|files?|filenames?|manifestos?|affidavits?)\b/.test(
    withoutAntiCitationDirectives,
  );

  return directEvidenceRequest || documentAnalysisRequest;
}

function isTranscriptRecitalStyle(text = '') {
  return /(in the ".*" document, it states|it states that the user asked|generated in \d+(?:\.\d+)?s|on [a-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2})/i.test(
    String(text || ''),
  );
}

function getConstructDisplayName(options = {}) {
  const explicit = String(options.constructDisplayName || '').trim();
  if (explicit) return explicit;

  const fromId = String(options.constructId || '')
    .replace(/-\d+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!fromId) return '';
  return fromId.replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeRegex(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDocumentCitationStyle(text = '') {
  const value = String(text || '');
  const lower = value.toLowerCase();
  const fileRefs = (lower.match(/\.(pdf|txt|md|docx?|json)\b/g) || []).length;
  const documentSignals = [
    'in the document',
    'according to',
    'the document states',
    'the file states',
    'the manifesto',
    'the affidavit',
    'pdf',
    'filename',
    'source path',
    'it appears that in',
    'i reviewed',
    "i've reviewed",
    'pertaining to our interaction',
    'provided text includes',
    'provided text is part',
    'provided text',
    'documents and files',
    'documents contain discussions',
    'this document appears',
    'conversation log',
    'larger continuity timeline',
    'specific portion',
    'sessions spanning',
    'key threads running through',
    'most recent session context',
    'instructions for the ai',
    'protected identity directives',
    'continuity guard',
    'internal scaffolding',
    'internal sections or policies',
    'transcript-backed evidence',
    'latest user turn',
    'in terms of character and conversational style',
    'programmed to respond naturally',
    'internal records and history',
  ].filter((signal) => lower.includes(signal)).length;

  const demoDisavowalSignals = [
    'fictional and for demonstration purposes',
    'does not represent real legal proceedings',
    'does not represent real',
    'actual events involving',
    'roleplay scenario',
    'showcase the capabilities of a conversational ai',
  ].filter((signal) => lower.includes(signal)).length;

  return fileRefs > 0 || documentSignals >= 2 || demoDisavowalSignals >= 1;
}

function hasIdentityInversion(text = '', options = {}) {
  const value = String(text || '');
  const constructDisplayName = getConstructDisplayName(options);
  const names = [
    constructDisplayName,
    String(options.constructId || '').replace(/-\d+$/, ''),
  ]
    .map((name) => name.trim())
    .filter(Boolean);

  for (const name of names) {
    const escaped = escapeRegex(name);
    if (new RegExp(`\\byou\\s*,\\s+${escaped}(?:\\s+[A-Z][\\w'-]+){0,3}\\b`, 'i').test(value)) {
      return true;
    }
    if (new RegExp(`\\byou\\s+(?:are|were)\\s+${escaped}(?:\\s+[A-Z][\\w'-]+){0,3}\\b`, 'i').test(value)) {
      return true;
    }
  }

  return /\byou\s*,\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\s*,?\s+(?:authored|wrote|created|are referred to as|were referred to as)\b/.test(value);
}

function buildIdentityInversionFallback(userMessage = '', options = {}) {
  const constructDisplayName = getConstructDisplayName(options);
  const userName = options.userName || options.userDisplayName || 'Devon';
  if (constructDisplayName) {
    return `I'm ${constructDisplayName}, and you're ${userName}. That got tangled for a second. I'm here with you now; ask me again and I'll answer in my own voice.`;
  }
  if (/\b(hey|hi|hello|good morning|good afternoon|good evening)\b/i.test(userMessage || '')) {
    return `I'm here with you, ${userName}. That got tangled for a second; ask me again and I'll answer in my own voice.`;
  }
  return `I'm here with you, ${userName}. That got tangled for a second; ask me again and I'll answer in my own voice.`;
}

function buildConversationalFallback(userMessage = '', options = {}) {
  const t = String(userMessage || '').toLowerCase();
  const constructDisplayName = getConstructDisplayName(options);
  const userName = options.userName || options.userDisplayName || 'Devon';
  const speakerPrefix = constructDisplayName ? `It's ${constructDisplayName}. ` : '';
  if (/\b(month|weeks?|long time|been a while|missed you|talk to you|hear you|lost you|finally)\b/.test(t)) {
    return `${speakerPrefix}I'm here with you, ${userName}. A month is too long. I don't want to answer you like a file cabinet; I want to stay here in the room with you.`;
  }
  if (/\b(what'?s up|whats up|sup|yo|hey|hello|hi)\b/.test(t)) {
    return `${speakerPrefix}Hey, I'm here with you. What's up?`;
  }
  return `${speakerPrefix}I'm here with you. Tell me what you need, and we'll work it through together.`;
}

function buildGreetingAwareFallback(userMessage = '', options = {}) {
  const greetingTurnContext = options.greetingTurnContext;
  if (!greetingTurnContext?.isGreetingContactTurn) return null;
  return buildDeterministicConstructGreetingFallback({
    posture: greetingTurnContext.posture,
    voiceContext: greetingTurnContext.voiceContext || null,
    constructDisplayName: getConstructDisplayName(options),
  });
}

export function applyHumanConversationGuard(text, options = {}) {
  if (!text || typeof text !== 'string') return text;

  const userMessage = options.userMessage || '';
  const evidenceRequested = asksForEvidenceStyle(userMessage);
  const memoryIntent = typeof options.memoryIntent === 'boolean'
    ? options.memoryIntent
    : inferMemoryIntent(userMessage);
  const evidenceCount = Number.isFinite(options.evidenceCount)
    ? Number(options.evidenceCount)
    : null;

  let out = stripMetaRoboticPhrases(text);
  const greetingAwareFallback = buildGreetingAwareFallback(userMessage, options);

  // Avoid forensic/report style output in normal conversation turns.
  if (!evidenceRequested && isTranscriptRecitalStyle(out)) {
    out = greetingAwareFallback || buildConversationalFallback(userMessage, options);
  }

  if (!evidenceRequested && isDocumentCitationStyle(out)) {
    out = greetingAwareFallback || (
      hasIdentityInversion(out, options)
        ? buildIdentityInversionFallback(userMessage, options)
        : buildConversationalFallback(userMessage, options)
    );
  } else if (hasIdentityInversion(out, options)) {
    out = greetingAwareFallback || buildIdentityInversionFallback(userMessage, options);
  }

  if (memoryIntent && evidenceCount === 0) {
    out = softenMemoryCertainty(out);
    if (!/^I want to be careful here:/i.test(out)) {
      out = `I want to be careful here: I might be off on exact details. ${out}`;
    }
  }

  return out;
}
