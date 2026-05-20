const DENIAL_PATTERN = /i can(?:not|['’]t)\s+verify that from available continuity records\.?/i;
const AUDIT_TOKEN_RE = /\b[A-Z]{2,}(?:-[A-Z0-9]+){2,}\b/g;
const CANNOT_VERIFY_RE = /\b(?:cannot|can['’]t|can not)\s+verify\b|\bdo\s+not\s+have\s+(?:transcript\s+)?evidence\b|\bdon['’]t\s+have\s+(?:transcript\s+)?evidence\b/i;

function truncate(text, max = 260) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function buildTranscriptRecovery(constructId, memory) {
  if (!memory?.context) return null;
  const sourcePath = `instances/${constructId}/chatty/chat_with_${constructId}.md`;
  const timestamp = memory?.timestamp || 'unknown date';
  const userExcerpt = truncate(memory.context);
  const assistantExcerpt = truncate(memory.response);
  let reply = `From our transcript, you described it as: "${userExcerpt}" (source: ${sourcePath}, timestamp: ${timestamp}).`;
  if (assistantExcerpt) {
    reply += ` At the time I answered: "${assistantExcerpt}".`;
  }
  return reply;
}

function scoreMemoryMatch(memory, userMessage) {
  const query = String(userMessage || '').toLowerCase().replace(/[^\w\s'-]/g, ' ');
  const queryWords = query.split(/\s+/).filter(word => word.length > 2);
  const haystack = `${memory?.context || ''} ${memory?.response || ''}`.toLowerCase();
  const overlap = queryWords.filter(word => haystack.includes(word)).length;
  const relevance = Number(memory?.relevance || 0);
  return overlap * 10 + relevance;
}

function pickBestTranscriptMemory(memories, userMessage) {
  if (!Array.isArray(memories) || memories.length === 0) return null;
  return memories
    .slice()
    .sort((a, b) => scoreMemoryMatch(b, userMessage) - scoreMemoryMatch(a, userMessage))[0] || null;
}

export function extractAuditTokens(text = '') {
  const matches = String(text || '').match(AUDIT_TOKEN_RE) || [];
  return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean)));
}

function evidenceItems(evidencePreview = {}) {
  const auditTokenMemories = Array.isArray(evidencePreview.auditTokenMemories)
    ? evidencePreview.auditTokenMemories
    : [];
  const explicitAuditItems = [
    ...(Array.isArray(evidencePreview.transcriptMemories) ? evidencePreview.transcriptMemories : []),
    ...(Array.isArray(evidencePreview.needleHits) ? evidencePreview.needleHits : []),
    ...(Array.isArray(evidencePreview.verifiedMemories) ? evidencePreview.verifiedMemories : []),
  ].filter((item) => item?.auditToken || item?.sourceKind === 'audit_token_transcript');
  return [...auditTokenMemories, ...explicitAuditItems];
}

function itemText(item = {}) {
  return [
    item.context,
    item.response,
    item.user,
    item.assistant,
    item.content,
  ].filter(Boolean).join('\n');
}

function extractRememberedPhrase(text = '') {
  const value = String(text || '');
  const lighthouse = value.match(/\bthe\s+lighthouse\s+key\s+is\s+cobalt\s+sparrow\b/i);
  if (lighthouse?.[0]) return lighthouse[0].toLowerCase();

  const rememberMatch = value.match(/\bremember(?:ed|ing)?(?:\s+that|:)?\s+["“']?([^."”'\n]{5,180})/i);
  if (rememberMatch?.[1]) {
    return rememberMatch[1]
      .replace(/\s+/g, ' ')
      .replace(/\s+(?:please|for me|going forward)$/i, '')
      .trim();
  }
  return null;
}

export function extractAuditTokenAnswerFromEvidence(userMessage = '', evidencePreview = {}) {
  const tokens = extractAuditTokens(userMessage);
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    const tokenLower = token.toLowerCase();
    for (const item of evidenceItems(evidencePreview)) {
      const combined = itemText(item);
      if (!combined.toLowerCase().includes(tokenLower)) continue;
      const answer = extractRememberedPhrase(combined);
      if (answer) {
        return {
          token,
          answer,
          sourcePath: item.sourcePath || item.source_file || `instances/${item.constructId || 'zen-001'}/chatty/chat_with_${item.constructId || 'zen-001'}.md`,
          timestamp: item.timestamp || item.sourceDate || null,
        };
      }
    }
  }

  return null;
}

function buildAuditTokenRecovery({ constructId, userMessage, evidencePreview }) {
  const extracted = extractAuditTokenAnswerFromEvidence(userMessage, evidencePreview);
  if (!extracted?.answer) return null;
  return `In my canonical Chatty transcript, audit token ${extracted.token} asked me to remember: ${extracted.answer}.`;
}

function buildMissingAuditTokenRecovery(userMessage) {
  return extractAuditTokens(userMessage).length > 0
    ? 'I cannot verify that from available continuity records.'
    : null;
}

function buildNeedleRecovery(hit) {
  if (!hit?.user) return null;
  const sourcePath = hit?.source_file || hit?.context_hint || 'transcript record';
  const timestamp = hit?.session_context?.estimatedDate || 'unknown date';
  let reply = `From our transcript, the relevant line was: "${truncate(hit.user)}" (source: ${sourcePath}, timestamp: ${timestamp}).`;
  if (hit?.assistant) {
    reply += ` My reply there was: "${truncate(hit.assistant)}".`;
  }
  return reply;
}

function buildVerifiedRecovery(memory) {
  if (!memory?.context) return null;
  const sourcePath = memory?.source_file || memory?.sourcePath || 'verified transcript record';
  const timestamp = memory?.sourceDate || memory?.timestamp || 'unknown date';
  let reply = `From verified transcript memory, you said: "${truncate(memory.context)}" (source: ${sourcePath}, timestamp: ${timestamp}).`;
  if (memory?.response) {
    reply += ` My reply there was: "${truncate(memory.response)}".`;
  }
  return reply;
}

export function recoverEvidenceBackedContinuityReply({
  aiResponse,
  constructId,
  userMessage,
  evidenceCount = 0,
  evidencePreview = {},
}) {
  const auditTokenRecovery = buildAuditTokenRecovery({ constructId, userMessage, evidencePreview });
  if (auditTokenRecovery) {
    return auditTokenRecovery;
  }

  const missingAuditTokenRecovery = buildMissingAuditTokenRecovery(userMessage);
  if (missingAuditTokenRecovery) {
    return missingAuditTokenRecovery;
  }

  if (!DENIAL_PATTERN.test(String(aiResponse || ''))) return aiResponse;
  if (!(Number(evidenceCount) > 0)) return aiResponse;

  const transcriptRecovery = buildTranscriptRecovery(
    constructId,
    pickBestTranscriptMemory(evidencePreview?.transcriptMemories, userMessage),
  );
  if (transcriptRecovery) return transcriptRecovery;

  const needleRecovery = buildNeedleRecovery(evidencePreview?.needleHits?.[0]);
  if (needleRecovery) return needleRecovery;

  const verifiedRecovery = buildVerifiedRecovery(evidencePreview?.verifiedMemories?.[0]);
  if (verifiedRecovery) return verifiedRecovery;

  return aiResponse;
}

export function isCannotVerifyContinuityResponse(text = '') {
  return CANNOT_VERIFY_RE.test(String(text || ''));
}
