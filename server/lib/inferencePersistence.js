import { buildCanonicalPersistenceSemantics } from './constructInferenceUtil.js';

export function resolveConversationTitle(canonicalTurnMetadata, constructName) {
  return canonicalTurnMetadata?.projectName
    ? `${canonicalTurnMetadata.projectName} Hydro`
    : constructName;
}

export function normalizeTranscriptPath(transcriptPath, canonicalTurnMetadata) {
  return String(canonicalTurnMetadata?.transcriptPath || transcriptPath || '')
    .trim()
    .replace(/^\/+/, '');
}

export function buildCanonicalTranscriptWriteTargetPath(constructId) {
  return `instances/${constructId}/chatty/chat_with_${constructId}.md`;
}

export function isCanonicalConstructTranscriptWrite({
  effectiveSession,
  constructId,
  canonicalTurnMetadata,
  normalizedRequestedTranscriptPath,
  canonicalTranscriptWriteTargetPath,
}) {
  return (
    effectiveSession === `${constructId}_chat_with_${constructId}` &&
    !canonicalTurnMetadata?.projectName &&
    (!normalizedRequestedTranscriptPath ||
      normalizedRequestedTranscriptPath === canonicalTranscriptWriteTargetPath)
  );
}

export function isCanonicalLinTranscriptWrite({
  constructId,
  effectiveSession,
  canonicalTurnMetadata,
  normalizedRequestedTranscriptPath,
}) {
  const LIN_CANONICAL_THREAD_ID = 'lin-canonical';
  const LIN_CANONICAL_TRANSCRIPT_PATH = 'instances/lin-001/chatty/chat_with_lin-001.md';
  return (
    constructId === 'lin-001' &&
    effectiveSession === LIN_CANONICAL_THREAD_ID &&
    !canonicalTurnMetadata?.projectName &&
    (!normalizedRequestedTranscriptPath ||
      normalizedRequestedTranscriptPath === LIN_CANONICAL_TRANSCRIPT_PATH)
  );
}

export function requiresVvaultBodyPersistence({
  effectiveSession,
  constructId,
  canonicalTurnMetadata,
  normalizedRequestedTranscriptPath,
}) {
  const canonicalTranscriptWriteTargetPath = buildCanonicalTranscriptWriteTargetPath(constructId);
  return (
    isCanonicalConstructTranscriptWrite({
      effectiveSession,
      constructId,
      canonicalTurnMetadata,
      normalizedRequestedTranscriptPath,
      canonicalTranscriptWriteTargetPath,
    }) ||
    isCanonicalLinTranscriptWrite({
      constructId,
      effectiveSession,
      canonicalTurnMetadata,
      normalizedRequestedTranscriptPath,
    })
  );
}

export function buildPersistenceRoleResult(role, outcome) {
  return {
    role,
    status: outcome.status,
    source: outcome.value?.source || null,
    bounded: false,
  };
}

export function buildPersistenceFailurePayloadFactory({
  buildTranscriptPersistenceFailurePayload,
}) {
  return function buildFailurePayload({
    userId,
    user,
    constructId,
    rawConstructId,
    canonicalConstructId,
    message,
    threadId,
    sessionId,
    hasImages,
    previewMode,
    gptConfig,
    enrichedContext,
    retrievalDiagnostics,
    promptDiagnostics,
    providerTrace,
    validatorDebug,
    runtimeReceipt,
    details,
  }) {
    return buildTranscriptPersistenceFailurePayload({
      userId,
      user,
      constructId,
      rawConstructId,
      canonicalConstructId,
      message,
      threadId,
      sessionId,
      hasImages,
      previewMode,
      gptConfig,
      enrichedContext,
      retrievalDiagnostics,
      promptDiagnostics,
      providerTrace,
      validatorDebug,
      runtimeReceipt,
      details,
    });
  };
}
