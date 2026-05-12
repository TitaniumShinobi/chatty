import {
  buildCanonicalPersistenceSemantics,
  deriveConstructReceiptName,
} from './constructInferenceUtil.js';
import { canonicalizeConstructId } from './constructId.js';
import { normalizeOrchestrationProfile } from './fullSeatSynthesis.js';
import { normalizeAssignmentQaInput } from './assignmentQaGuard.js';
import { buildContinuityProofReceipt } from './vvaultConversationRouteContract.js';
import { getLinSeatCanon, LIN_THREE_I_CANON_VERSION } from './linSeatCanon.js';
import { buildOrchestrationChecklist } from './orchestrationChecklist.js';

/**
 * Normalize an inference request body into a clean, consistently-shaped params object.
 * Pure function — no side effects, no I/O.
 */
export function normalizeInferenceRequest(body) {
  const {
    constructId: rawConstructId,
    __canonicalConstructId,
    message: incomingMessage,
    threadId,
    sessionId,
    attachments,
    projectName,
    rootPath,
    transcriptPath,
    runtime,
    chatMode,
    planMode,
    agentId,
    agentLabel,
    model: requestModelOverride,
    provider: requestProviderOverride,
    modelKey,
    modelLabel,
    systemPromptOverride,
    skipPersistence,
    previewMode = false,
    previewDraft = null,
    transientHistory = [],
    continueTurn = false,
    linearTranscriptLawGate = false,
    linearTranscriptLawTurnKind = null,
    zenOrdinaryVoiceGate = false,
    orchestrationProfile = null,
    assignmentProfile = null,
    expectedTurn = null,
    assignmentTurn = null,
    evidencePacket = null,
    continuity_expected = false,
    resume_from_turn_id = null,
    resume_from_continuity_seq = null,
    resume_tail_hash = null,
    resume_construct_revision = null,
    resume_source_seat = null,
  } = body || {};

  if (!rawConstructId) {
    return { error: 'Missing constructId' };
  }

  const canonicalConstructId = __canonicalConstructId || canonicalizeConstructId(rawConstructId);
  const constructId = canonicalConstructId || rawConstructId;

  const hasImages = attachments && Array.isArray(attachments) && attachments.length > 0;
  const hasTextMessage =
    typeof incomingMessage === 'string' && incomingMessage.trim().length > 0;
  const syntheticContinuePrompt =
    'Continue naturally from the previous assistant message without repeating yourself.';
  const imageOnlyCharacterPrompt = getImageTurnDefaultUserMessage(constructId);
  const isSyntheticContinueTurn =
    continueTurn === true && !hasTextMessage && !hasImages;
  const message = hasTextMessage
    ? incomingMessage
    : isSyntheticContinueTurn
      ? syntheticContinuePrompt
      : hasImages
        ? imageOnlyCharacterPrompt
        : String(incomingMessage ?? '');

  if (!hasTextMessage && !hasImages && continueTurn !== true) {
    return { error: 'Missing message content' };
  }

  const effectiveTurnSessionId = sessionId || threadId || `${constructId}_chat_with_${constructId}`;

  const normalizedLinearTranscriptLawTurnKind =
    typeof linearTranscriptLawTurnKind === 'string'
      ? linearTranscriptLawTurnKind.trim().toLowerCase()
      : null;

  const activeOrchestrationProfile = normalizeOrchestrationProfile(orchestrationProfile);
  const assignmentQaInput = normalizeAssignmentQaInput({
    runtime,
    assignmentProfile,
    expectedTurn,
    assignmentTurn,
    evidencePacket,
  });

  const isHydroProjectTurn =
    (typeof projectName === 'string' && projectName.trim()) ||
    (typeof rootPath === 'string' && rootPath.trim()) ||
    (typeof transcriptPath === 'string' && transcriptPath.trim());

  const canonicalTurnMetadata = {
    source: isHydroProjectTurn ? 'hydro-code' : 'chatty',
    projectName: typeof projectName === 'string' && projectName.trim() ? projectName.trim() : undefined,
    rootPath: typeof rootPath === 'string' && rootPath.trim() ? rootPath.trim() : undefined,
    transcriptPath: typeof transcriptPath === 'string' && transcriptPath.trim() ? transcriptPath.trim() : undefined,
    runtime: runtime && typeof runtime === 'object' ? runtime : undefined,
    chatMode: chatMode === false ? false : true,
    planMode: planMode === true,
    agentId: typeof agentId === 'string' ? agentId : undefined,
    agentLabel: typeof agentLabel === 'string' ? agentLabel : undefined,
    modelKey: typeof modelKey === 'string' ? modelKey : undefined,
    modelLabel: typeof modelLabel === 'string' ? modelLabel : undefined,
  };

  const explicitVisionIntent =
    hasImages && hasExplicitImageAnalysisIntent(typeof incomingMessage === 'string' ? incomingMessage : '');

  const previewSystemPromptOverrideSuppressed = Boolean(
    previewMode &&
    typeof systemPromptOverride === 'string' &&
    systemPromptOverride.trim()
  );

  const effectiveSystemPromptOverride = previewMode
    ? null
    : systemPromptOverride;

  const effectivePreviewDraft =
    previewMode && previewDraft && typeof previewDraft === 'object' && !Array.isArray(previewDraft)
      ? previewDraft
      : null;

  return {
    rawConstructId,
    canonicalConstructId,
    constructId,
    message,
    incomingMessage,
    threadId,
    sessionId,
    effectiveTurnSessionId,
    attachments,
    projectName,
    rootPath,
    transcriptPath,
    runtime,
    chatMode,
    planMode,
    agentId,
    agentLabel,
    modelKey,
    modelLabel,
    requestModelOverride,
    requestProviderOverride,
    systemPromptOverride: effectiveSystemPromptOverride,
    rawSystemPromptOverride: systemPromptOverride,
    skipPersistence: Boolean(skipPersistence),
    previewMode,
    previewDraft: effectivePreviewDraft,
    previewSystemPromptOverrideSuppressed,
    transientHistory,
    continueTurn: Boolean(continueTurn),
    isSyntheticContinueTurn,
    hasImages,
    hasTextMessage,
    explicitVisionIntent,
    linearTranscriptLawGate: Boolean(linearTranscriptLawGate),
    linearTranscriptLawTurnKind: normalizedLinearTranscriptLawTurnKind,
    zenOrdinaryVoiceGate: Boolean(zenOrdinaryVoiceGate),
    activeOrchestrationProfile,
    assignmentQaInput,
    isHydroProjectTurn,
    canonicalTurnMetadata,
    continuity_expected,
    resume_from_turn_id,
    resume_from_continuity_seq,
    resume_tail_hash,
    resume_construct_revision,
    resume_source_seat,
  };
}

/**
 * Build a runtime receipt object for the handleConstructInference response.
 * Pure function — no side effects.
 */
export function buildInferenceRuntimeReceipt({
  dataOwnerUserId,
  authReceipt,
  constructId,
  canonicalConstructId,
  rawConstructId,
  gptConfig,
  effectiveTurnSessionId,
  routeTurnEnvelope,
  enrichedContext,
  contextBudget,
  continuityReceipt,
  transcriptTruthReceipt,
  capsuleRuntimeReceipt,
  researchWorkflowReceipt,
  assignmentQa,
  fullSeatSynthesisResult,
  previewMode,
  skipPersistence,
  identityCoherenceBlocked,
  transcriptLawGovernanceBlocked,
  assignmentQaBlocked,
  continuityIntegrityBlocked,
  identityCoherence,
  identityCoherenceRepair,
  identityCoherencePolicyFallback,
  identityCoherenceConstructFallback,
  identityCoherenceCertificationFallback,
  transcriptLawGovernance,
  transcriptLawGovernanceRepair,
  continuityIntegrity,
  continuityIntegrityRepair,
  identityBundle,
  finalAnswerSource,
  effectiveProvider,
  effectiveModel,
  modelResolution,
  modelSource,
  providerTrace,
  effectiveRouteFallbackUsed,
  effectiveLocalFirstUsed,
  effectiveLocalCloudFallbackState,
  effectiveSeatDefaultsOrOverrides,
  metadataRecovery,
  requestedSeat,
  policyAnswerKind,
  validatorDebug,
  personaDriftDetected,
  personaRegenApplied,
  receiptConstructName,
  activeSimLock,
  simRefreshContract,
  searchInspectability,
  contextBudgetProfile,
  nextRuntimeTurnState,
  transcriptLawMemoryReceipt,
}) {
  const receiptConstructNameValue = receiptConstructName || deriveConstructReceiptName(constructId, gptConfig);
  const persistence_owner = assignmentQaBlocked
    ? 'blocked_assignment_qa'
    : continuityIntegrityBlocked
      ? 'blocked_continuity_integrity'
      : transcriptLawGovernanceBlocked
        ? 'blocked_transcript_law_governance'
        : identityCoherenceBlocked
          ? 'blocked_identity_coherence'
          : (skipPersistence ? 'layout' : 'vvault_body');

  const persistenceAttempted = !(skipPersistence || identityCoherenceBlocked || continuityIntegrityBlocked || transcriptLawGovernanceBlocked || assignmentQaBlocked);

  const runtimeReceipt = {
    created_at: new Date().toISOString(),
    user_id: dataOwnerUserId || null,
    auth: authReceipt,
    construct_id: constructId,
    effective_construct_id: constructId,
    effective_construct_name: receiptConstructNameValue,
    orchestration_mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
    route_mode: 'vvault_message',
    persistence_owner,
    continuity: continuityReceipt,
    ...continuityReceipt,
    transcript_truth: transcriptTruthReceipt,
    capsule_runtime: capsuleRuntimeReceipt,
    runtime_turn_state: nextRuntimeTurnState,
    identity: {
      source: enrichedContext?.phaseTiming?.identity?.source || 'unknown',
      base_prompt_source: enrichedContext?.phaseTiming?.basePromptSource || 'unknown',
      conditioning_appended: !!enrichedContext?.phaseTiming?.conditioningInjected,
      identity_bundle_hash: enrichedContext?.identity_bundle_hash || null,
      effective_construct_id: constructId,
      effective_construct_name: receiptConstructNameValue,
      selected_construct_id: canonicalConstructId || constructId,
      raw_construct_id: rawConstructId,
      preflight: identityBundle?.preflight || null,
    },
    policy: enrichedContext?.runtimePolicy || null,
    research: researchWorkflowReceipt,
    assignment_qa: assignmentQa,
    synthesis: fullSeatSynthesisResult
      ? {
          profile: fullSeatSynthesisResult.profile,
          status: fullSeatSynthesisResult.status,
          policy: 'full_seat_synthesis',
          canon: fullSeatSynthesisResult.canon || 'lin-three-i.v1',
          construct_id: fullSeatSynthesisResult.construct_id || constructId,
          seats: fullSeatSynthesisResult.seats || [],
          final: fullSeatSynthesisResult.final || null,
          assignment: fullSeatSynthesisResult.assignment || null,
          assignment_contract_received: Boolean(fullSeatSynthesisResult.assignment?.final_prompt_received_contract),
          total_duration_ms: fullSeatSynthesisResult.total_duration_ms || 0,
        }
      : null,
    preview: {
      preview_mode: Boolean(previewMode),
      skip_persistence: Boolean(skipPersistence || identityCoherenceBlocked || transcriptLawGovernanceBlocked || assignmentQaBlocked),
      effective_construct_id: constructId,
      selected_construct_id: canonicalConstructId || constructId,
      raw_construct_id: rawConstructId,
      identity_source: enrichedContext?.phaseTiming?.identity?.source || 'unknown',
      base_prompt_source: enrichedContext?.phaseTiming?.basePromptSource || 'unknown',
      draft_overlay_applied: Boolean(enrichedContext?.phaseTiming?.preview?.draftOverlayApplied),
      draft_overlay_keys: enrichedContext?.phaseTiming?.preview?.draftOverlayKeys || [],
      preview_overlay_state: enrichedContext?.phaseTiming?.preview?.draftOverlayApplied ? 'applied_bounded_overlay' : 'not_applied',
      suppressed_system_prompt_override: Boolean(enrichedContext?.phaseTiming?.preview?.suppressedSystemPromptOverride),
    },
    memory: {
      retrieval_ran: !!enrichedContext?.memory_retrieval_ran,
      memory_query_detected: !!enrichedContext?.memory_query_detected,
      evidence_count: enrichedContext?.evidence_count || 0,
      ledger_sessions: enrichedContext?.ledgerSessions || 0,
      memory_profile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
      voice_exemplar_sources: transcriptLawMemoryReceipt?.voice_exemplar_sources || enrichedContext?.voiceExemplarSources || [],
      voice_exemplar_count: transcriptLawMemoryReceipt?.voice_exemplar_count || enrichedContext?.voiceExemplarCount || 0,
      supabase_accessed: Boolean(enrichedContext?.supabase_accessed),
      vvault_accessed: Boolean(enrichedContext?.vvault_accessed),
      source_access: enrichedContext?.source_access || null,
      knowledge_source: enrichedContext?.knowledgeSource || enrichedContext?.phaseTiming?.knowledge?.source || null,
      voice_exemplar_retrieval: transcriptLawMemoryReceipt?.voice_exemplar_retrieval,
      verified_memory_retrieval: transcriptLawMemoryReceipt?.verified_memory_retrieval,
      vector_retrieval: transcriptLawMemoryReceipt?.vector_retrieval,
      memory_source: enrichedContext?.continuityMemorySearch?.source || enrichedContext?.phaseTiming?.memorySearch?.source || 'runtime_context_builder',
      context_profile: enrichedContext?.context_profile || enrichedContext?.context_budget?.profile || contextBudgetProfile,
      included_sections: enrichedContext?.context_budget?.included_sections || [],
      delayed_sections: enrichedContext?.context_budget?.delayed_sections || [],
      no_rewrite_identity_anchor: Boolean(enrichedContext?.no_rewrite_identity_anchor),
      identity_rewrite_prevented_by: enrichedContext?.identity_rewrite_prevented_by || null,
      context_recovery_profile: enrichedContext?.context_recovery_profile || 'standard',
      history_source: enrichedContext?.history_source || 'none',
      remote_history_skipped: Boolean(enrichedContext?.remote_history_skipped),
      sources: enrichedContext?.continuityMemorySearch || null,
      transcript_memory_status: transcriptLawMemoryReceipt?.transcript_memory_status,
      transcript_sources: transcriptLawMemoryReceipt?.transcript_sources,
    },
    persistence: {
      attempted: persistenceAttempted,
      status: persistenceAttempted ? 'pass' : 'skipped',
      code: null,
      reason: skipPersistence
        ? 'skip_persistence_requested'
        : continuityIntegrityBlocked
          ? 'blocked_continuity_integrity'
          : transcriptLawGovernanceBlocked
            ? 'blocked_transcript_law_governance'
            : identityCoherenceBlocked
              ? 'blocked_identity_coherence'
              : assignmentQaBlocked
                ? 'blocked_assignment_qa'
                : 'vvault_body_transcript_persistence',
      timeout_ms: null,
      bounded: false,
      stage: persistenceAttempted ? 'assistant' : null,
      ...buildCanonicalPersistenceSemantics(),
    },
    provider: {
      provider: effectiveProvider || null,
      model: effectiveModel || null,
      selection_policy: 'preference',
      lin_harmony_policy: fullSeatSynthesisResult ? 'full_seat_synthesis' : 'intent_routed',
      lin_seat_canon: LIN_THREE_I_CANON_VERSION,
      performance_model_switch: false,
      sim_artifact: activeSimLock
        ? {
            locked: true,
            locked_model: activeSimLock.lockedModel,
            model_name: activeSimLock.modelName,
            mode_label: activeSimLock.modeLabel,
            forged_from_mode: activeSimLock.forgedFromMode,
            forged_at: activeSimLock.forgedAt || null,
            source: activeSimLock.source,
            kind: activeSimLock.kind,
            refresh_contract: simRefreshContract,
          }
        : null,
      metadata_recovery: metadataRecovery,
      requested_seat: fullSeatSynthesisResult ? 'full_synthesis' : requestedSeat,
      requested_canonical_seat: fullSeatSynthesisResult
        ? 'full_synthesis'
        : getLinSeatCanon(requestedSeat).canonicalSeat,
      seat_plan: {
        policy: fullSeatSynthesisResult ? 'full_seat_synthesis' : 'intent_routed',
        canon: LIN_THREE_I_CANON_VERSION,
        requested_seat: fullSeatSynthesisResult ? 'full_synthesis' : requestedSeat,
        requested_canonical_seat: fullSeatSynthesisResult
          ? 'full_synthesis'
          : getLinSeatCanon(requestedSeat).canonicalSeat,
        selected_provider: effectiveProvider || null,
        selected_model: effectiveModel || null,
        lin_default_model: null,
        seats: fullSeatSynthesisResult?.seats || null,
        final: fullSeatSynthesisResult?.final || null,
        fallback_reason: (providerTrace?.fallback_used || effectiveRouteFallbackUsed)
          ? (effectiveLocalCloudFallbackState || 'fallback_used')
          : null,
      },
      model_source: modelSource,
      source: modelSource,
      mode: modelResolution?.mode || (gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown'),
      requested_provider: modelResolution?.requestedProvider || null,
      requested_model: modelResolution?.requestedModel || null,
      configured_model: modelResolution?.configuredModel || null,
      suppressed_configured_model: modelResolution?.suppressedConfiguredModel || null,
      routing_override: !!modelResolution?.routingOverride,
      seat_defaults_or_overrides: effectiveSeatDefaultsOrOverrides || null,
      local_first_used: effectiveLocalFirstUsed,
      local_cloud_fallback_state: (providerTrace?.fallback_used || effectiveRouteFallbackUsed)
        ? (effectiveLocalCloudFallbackState || 'fallback_used')
        : effectiveLocalCloudFallbackState || modelResolution?.localCloudFallbackState || (effectiveLocalFirstUsed
          ? 'local_first'
          : modelResolution?.routingOverride
            ? 'manual_routing_override'
            : 'direct'),
      fallback_used: !!(providerTrace?.fallback_used || effectiveRouteFallbackUsed),
      final_provider: providerTrace?.final_provider || effectiveProvider || null,
    },
    fidelity: {
      identity_drift_detected: !!validatorDebug?.identity_drift_detected,
      identity_rewrite_applied: !!validatorDebug?.identity_rewrite_applied,
      no_rewrite_identity_anchor: Boolean(enrichedContext?.no_rewrite_identity_anchor),
      identity_rewrite_prevented_by: validatorDebug?.identity_rewrite_prevented_by,
      identity_fallback_applied: !!validatorDebug?.identity_fallback_applied,
      continuity_integrity: {
        status: continuityIntegrity?.applies ? continuityIntegrity.status : 'skipped',
        reasons: continuityIntegrity?.reasons || [],
        blocked_canonical_persistence: continuityIntegrityBlocked,
        persist_canonical: !continuityIntegrityBlocked,
        owner_file: 'server/routes/vvault.js',
        source_anchor: 'server/routes/vvault.js:evaluateResumedTurnContinuityIntegrity',
      },
      persona_drift_detected: !!personaDriftDetected,
      persona_regen_applied: !!personaRegenApplied,
      identity_coherence: {
        status: identityCoherence?.status,
        identity_status: identityCoherence?.identityStatus,
        coherence_status: identityCoherence?.coherenceStatus,
        reasons: identityCoherence?.reasons || [],
        signals: identityCoherence?.signals || [],
        violations: identityCoherence?.violations || [],
        repairable: !!identityCoherence?.repairable,
        repair_attempted: !!identityCoherenceRepair?.attempted,
        repair_applied: !!identityCoherenceRepair?.applied,
        repair: identityCoherenceRepair,
        deterministic_policy_fallback_attempted: !!identityCoherencePolicyFallback?.attempted,
        deterministic_policy_fallback_applied: !!identityCoherencePolicyFallback?.applied,
        deterministic_policy_fallback: identityCoherencePolicyFallback,
        deterministic_construct_fallback_attempted: !!identityCoherenceConstructFallback?.attempted,
        deterministic_construct_fallback_applied: !!identityCoherenceConstructFallback?.applied,
        deterministic_construct_fallback: identityCoherenceConstructFallback,
        deterministic_certification_fallback_attempted: !!identityCoherenceCertificationFallback?.attempted,
        deterministic_certification_fallback_applied: !!identityCoherenceCertificationFallback?.applied,
        deterministic_certification_fallback: identityCoherenceCertificationFallback,
        final_answer_source: finalAnswerSource,
        blocked_canonical_persistence: !!identityCoherenceBlocked,
        persist_canonical: !identityCoherenceBlocked,
        owner_file: identityCoherence?.ownerFile || 'server/lib/identityCoherenceGuard.js',
        source_anchor: identityCoherence?.sourceAnchor || 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
      },
      transcript_law_governance: transcriptLawGovernance?.applies
        ? {
            status: transcriptLawGovernance.status,
            requested_fact: transcriptLawGovernance.requestedFact,
            reasons: transcriptLawGovernance.reasons || [],
            signals: transcriptLawGovernance.signals || [],
            grounding_verdict: transcriptLawGovernance.details?.groundingVerdict || null,
            retrieval_ran: Boolean(transcriptLawGovernance.details?.retrievalRan),
            evidence_count: Number(transcriptLawGovernance.details?.evidenceCount || 0),
            transcript_sources: transcriptLawGovernance.details?.transcriptSources || [],
            evidence_sources: transcriptLawGovernance.details?.evidenceSources || [],
            voice_exemplar_sources: transcriptLawGovernance.details?.voiceExemplarSources || [],
            voice_exemplar_count: transcriptLawGovernance.details?.voiceExemplarCount || 0,
            transcript_memory_status: transcriptLawGovernance.details?.transcriptMemoryStatus || null,
            capsule_source: transcriptLawGovernance.details?.capsuleSource || null,
            capsule_loaded: Boolean(transcriptLawGovernance.details?.capsuleLoaded),
            source_grounded: Boolean(transcriptLawGovernance.details?.sourceGrounded),
            repair_attempted: Boolean(transcriptLawGovernanceRepair?.attempted),
            repair_applied: Boolean(transcriptLawGovernanceRepair?.applied),
            repair: transcriptLawGovernanceRepair,
            final_answer_source: finalAnswerSource,
            blocked_canonical_persistence: !!transcriptLawGovernanceBlocked,
            persist_canonical: !transcriptLawGovernanceBlocked,
            owner_file: transcriptLawGovernance.ownerFile || 'server/lib/identityCoherenceGuard.js',
            source_anchor: transcriptLawGovernance.sourceAnchor || 'server/lib/identityCoherenceGuard.js:evaluateTranscriptLawGovernance',
          }
        : null,
    },
  };

  if (searchInspectability?.search) {
    runtimeReceipt.search = searchInspectability.search;
  }
  if (searchInspectability?.housing) {
    runtimeReceipt.housing = searchInspectability.housing;
  }
  if (runtimeReceipt.policy && policyAnswerKind && finalAnswerSource === 'deterministic_policy_primary') {
    runtimeReceipt.policy.answer_kind = policyAnswerKind;
    runtimeReceipt.policy.answer_source = finalAnswerSource;
  }

  return runtimeReceipt;
}

/**
 * Classify the inference response status and blocked reason based on governance flags.
 * Pure function — no side effects.
 */
export function classifyInferenceResponseStatus({
  identityCoherenceBlocked,
  continuityIntegrityBlocked,
  transcriptLawGovernanceBlocked,
  assignmentQaBlocked,
  skipPersistence,
}) {
  if (assignmentQaBlocked) {
    return {
      status: 'assignment_qa_failed',
      blocked: true,
      persistenceSkipped: true,
      errorCode: 'ASSIGNMENT_QA_FAILED',
      errorMessage: 'Assignment QA guard blocked this assistant draft before canonical persistence.',
    };
  }
  if (continuityIntegrityBlocked) {
    return {
      status: 'continuity_integrity_failed',
      blocked: true,
      persistenceSkipped: true,
      errorCode: 'CONTINUITY_INTEGRITY_FAILED',
      errorMessage: 'Continuity was restored, but the resumed answer drifted into greeting/orientation or recap behavior before canonical persistence.',
    };
  }
  if (transcriptLawGovernanceBlocked) {
    return {
      status: 'transcript_law_governance_failed',
      blocked: true,
      persistenceSkipped: true,
      errorCode: 'TRANSCRIPT_LAW_GOVERNANCE_FAILED',
      errorMessage: 'Transcript-law governance blocked this assistant draft before canonical persistence.',
    };
  }
  if (identityCoherenceBlocked) {
    return {
      status: 'identity_coherence_failed',
      blocked: true,
      persistenceSkipped: true,
      errorCode: 'IDENTITY_COHERENCE_FAILED',
      errorMessage: 'Identity/coherence guard blocked this assistant draft before canonical persistence.',
    };
  }
  return {
    status: 'success',
    blocked: false,
    persistenceSkipped: Boolean(skipPersistence),
    errorCode: null,
    errorMessage: null,
  };
}

/**
 * Build transcript truth receipt from routeTurnEnvelope.
 * Pure function.
 */
export function buildTranscriptTruthReceipt(routeTurnEnvelope, effectiveTurnSessionId) {
  if (routeTurnEnvelope?.transcriptTruth?.required === true) {
    return {
      eligible: routeTurnEnvelope.transcriptTruth.eligible === true,
      source: routeTurnEnvelope.transcriptTruth.hydrationSource || 'none',
      hydration_complete: routeTurnEnvelope.transcriptTruth.hydrationComplete === true,
      exact_thread_id: routeTurnEnvelope.transcriptTruth.exactThreadId || effectiveTurnSessionId,
      exact_thread_found: routeTurnEnvelope.transcriptTruth.exactThreadFound === true,
      assistant_tail_found: routeTurnEnvelope.transcriptTruth.assistantTailFound === true,
      runtime_state_found: routeTurnEnvelope.transcriptTruth.runtimeStateFound === true,
      runtime_state_hydration_truth: routeTurnEnvelope.transcriptTruth.runtimeStateHydrationTruth || null,
      evidence_count: Number(routeTurnEnvelope.transcriptTruth.evidenceCount || 0),
      evidence_sources: routeTurnEnvelope.transcriptTruth.evidenceSources || [],
      fallback_rejected: routeTurnEnvelope.transcriptTruth.fallbackRejected === true,
      retrieval_status: routeTurnEnvelope.transcriptTruth.eligible === true ? 'full' : 'blocked',
      blocked_reason: routeTurnEnvelope.transcriptTruth.reason || null,
    };
  }
  return {
    eligible: null,
    source: 'not_required',
    hydration_complete: null,
    exact_thread_id: effectiveTurnSessionId,
    exact_thread_found: null,
    assistant_tail_found: null,
    runtime_state_found: Boolean(routeTurnEnvelope?.runtimeTurnState),
    runtime_state_hydration_truth: routeTurnEnvelope?.runtimeTurnState?.hydrationTruth || null,
    evidence_count: 0,
    evidence_sources: [],
    fallback_rejected: false,
    retrieval_status: 'not_required',
    blocked_reason: null,
  };
}

/**
 * Build capsule runtime receipt.
 * Pure function.
 */
export function buildCapsuleRuntimeReceipt(enrichedContext, routeTurnEnvelope, contextBudgetProfile) {
  return {
    capsuleLoaded: Boolean(enrichedContext?.capsuleLoaded),
    capsuleSource: enrichedContext?.phaseTiming?.capsule?.source || null,
    contextProfile:
      enrichedContext?.context_profile ||
      enrichedContext?.context_budget?.profile ||
      contextBudgetProfile,
    continuityFromRuntimeState: routeTurnEnvelope?.continuityResume?.continuityRestored === true,
    continuityMemorySource:
      routeTurnEnvelope?.continuityResume?.continuityRestored === true
        ? 'runtimeTurnState'
        : enrichedContext?.continuityMemorySearch?.source ||
          enrichedContext?.phaseTiming?.memorySearch?.source ||
          null,
  };
}

/**
 * Build continuity receipt from routeTurnEnvelope and continuityIntegrity.
 * Pure function.
 */
export function buildInferenceContinuityReceipt({
  routeTurnEnvelope,
  continuityIntegrity,
  continuityIntegrityRepair,
  effectiveTurnSessionId,
}) {
  const baseReceipt = buildContinuityProofReceipt({
    hydration: routeTurnEnvelope?.continuityResume?.hydration || 'full',
    hydrationComplete:
      routeTurnEnvelope?.continuityResume?.continuityExpected === true
        ? routeTurnEnvelope?.continuityResume?.hydrationComplete === true
        : true,
    resumeValidation: routeTurnEnvelope?.continuityResume,
    assistantResetDetected:
      continuityIntegrity?.applies &&
      (continuityIntegrity?.status === 'fail' || continuityIntegrityRepair?.attempted),
  });
  return {
    ...baseReceipt,
    integrityStatus: continuityIntegrity?.applies ? continuityIntegrity.status : null,
    integrityReasons: continuityIntegrity?.reasons || [],
    integrityMetaContinuityHits: continuityIntegrity?.metaContinuityHits || 0,
    integrityTrajectoryOverlap: continuityIntegrity?.trajectoryOverlap || 0,
    integrityRepairAttempted: continuityIntegrityRepair?.attempted,
    integrityRepairApplied: continuityIntegrityRepair?.applied,
    integrityRepairSource: continuityIntegrityRepair?.source || null,
    integrityRepairFailureReason: continuityIntegrityRepair?.failure_reason || null,
  };
}

// Internal: getImageTurnDefaultUserMessage is used when there's no text but there are images.
// This mirrors the original inline default in handleConstructInference.
function getImageTurnDefaultUserMessage(constructId) {
  return `The user sent an image. Respond naturally while staying in character as ${constructId}.`;
}

// Internal: hasExplicitImageAnalysisIntent checks if a message contains explicit image analysis intent.
// This mirrors the original inline logic.
function hasExplicitImageAnalysisIntent(message) {
  if (!message || typeof message !== 'string') return false;
  const analysisPatterns = [
    /what.*(see|this|image|picture)/i,
    /describe/i,
    /analyze/i,
    /look at/i,
    /tell me about/i,
    /explain.*(image|picture|photo)/i,
  ];
  return analysisPatterns.some((p) => p.test(message));
}

/**
 * Build a provider trace object for inference request tracking.
 * Pure function.
 */
export function buildProviderTrace({
  requestId,
  constructId,
  lowComplexityTurn,
  promptChars,
}) {
  return {
    request_id: requestId,
    construct_id: constructId,
    low_complexity_turn: lowComplexityTurn,
    prompt_chars: promptChars,
    attempts: [],
    final_provider: null,
    fallback_used: false,
    total_duration_ms: 0,
  };
}

/**
 * Build a validator debug object for inference response diagnostics.
 * Pure function.
 */
export function buildValidatorDebug({
  enrichedContext,
  greetingTurnContext,
}) {
  return {
    memory_retrieval_ran: !!enrichedContext?.memory_retrieval_ran,
    memory_query_detected: !!enrichedContext?.memory_query_detected,
    evidence_count: enrichedContext?.evidence_count || 0,
    greeting_turn: greetingTurnContext
      ? {
          posture: greetingTurnContext.posture,
          identity_available: greetingTurnContext.voiceContext?.identityAvailable === true,
          low_confidence: greetingTurnContext.voiceContext?.lowConfidence === true,
        }
      : null,
    identity_drift_detected: false,
    identity_rewrite_applied: false,
    identity_fallback_applied: false,
    cutoff_violation_detected: false,
    rewrite_applied: false,
  };
}

/**
 * Build retrieval diagnostics for inference context.
 * Pure function.
 */
export function buildRetrievalDiagnostics({
  lowComplexityTurn,
  systemPromptLength,
  enrichedContext,
  contextBudgetProfile,
  greetingTurnContext,
}) {
  return {
    low_complexity_turn: lowComplexityTurn,
    system_prompt_chars: systemPromptLength,
    phase_timing: enrichedContext?.phaseTiming || {},
    context_profile: enrichedContext?.context_profile || enrichedContext?.context_budget?.profile || contextBudgetProfile,
    included_sections: enrichedContext?.context_budget?.included_sections || [],
    delayed_sections: enrichedContext?.context_budget?.delayed_sections || [],
    no_rewrite_identity_anchor: Boolean(enrichedContext?.no_rewrite_identity_anchor),
    identity_rewrite_prevented_by: enrichedContext?.identity_rewrite_prevented_by || null,
    evidence_count: enrichedContext?.evidence_count ?? 0,
    retrieval_counts: {
      vector: enrichedContext?.vectorMemories || 0,
      verified: enrichedContext?.verifiedMemories || 0,
      needle: enrichedContext?.needleHits || 0,
      transcript: enrichedContext?.memoriesLoaded || 0,
    },
    greeting_turn: greetingTurnContext
      ? {
          active: true,
          posture: greetingTurnContext.posture,
          identity_available: greetingTurnContext.voiceContext?.identityAvailable === true,
          low_confidence: greetingTurnContext.voiceContext?.lowConfidence === true,
        }
      : { active: false },
  };
}

/**
 * Build prompt diagnostics for inference context.
 * Pure function.
 */
export function buildPromptDiagnostics({
  mode,
  enriched,
  historyCount,
  searchInjectedValue,
  systemPromptText,
  constructId,
  canonicalConstructId,
  rawConstructId,
  gptConfig,
  previewMode,
  skipPersistence,
}) {
  return {
    route: '/api/vvault/message',
    mode,
    constructId,
    prompt_source: 'enriched_context',
    base_prompt_source: enriched?.phaseTiming?.basePromptSource || 'unknown',
    gpt_config_present: !!gptConfig,
    identity_source: enriched?.phaseTiming?.identity?.source || 'unknown',
    conditioning_appended: !!enriched?.phaseTiming?.conditioningInjected,
    preview_mode: Boolean(previewMode),
    skip_persistence: Boolean(skipPersistence),
    preview_identity: {
      effective_construct_id: constructId,
      selected_construct_id: canonicalConstructId || constructId,
      raw_construct_id: rawConstructId,
      draft_overlay_applied: Boolean(enriched?.phaseTiming?.preview?.draftOverlayApplied),
      draft_overlay_keys: enriched?.phaseTiming?.preview?.draftOverlayKeys || [],
      suppressed_system_prompt_override: Boolean(enriched?.phaseTiming?.preview?.suppressedSystemPromptOverride),
    },
    retrieval_injected: searchInjectedValue === true || (enriched?.evidence_count ?? 0) > 0,
    final_history_count: historyCount,
    prompt_chars: typeof systemPromptText === 'string' ? systemPromptText.length : 0,
    context_profile: enriched?.context_profile || enriched?.context_budget?.profile || 'standard_turn',
    included_sections: enriched?.context_budget?.included_sections || [],
    delayed_sections: enriched?.context_budget?.delayed_sections || [],
    no_rewrite_identity_anchor: Boolean(enriched?.no_rewrite_identity_anchor),
    identity_rewrite_prevented_by: enriched?.identity_rewrite_prevented_by || null,
  };
}

/**
 * Build LLM messages array from system prompt, history, and user content.
 * Pure function.
 */
export function buildLLMMessages(systemPrompt, userContent, history = []) {
  return [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userContent },
  ];
}

/**
 * Resolve generation parameters from metadata config JSON.
 * Pure function.
 */
export function resolveGenerationParams(meta) {
  const generationParams = {};
  const cfg = meta?.configJson;
  if (cfg) {
    if (Number.isFinite(cfg.temperature)) generationParams.temperature = cfg.temperature;
    if (Number.isFinite(cfg.top_p)) generationParams.top_p = cfg.top_p;
    if (Number.isFinite(cfg.max_tokens)) generationParams.max_tokens = cfg.max_tokens;
    if (cfg.maxTokens && Number.isFinite(cfg.maxTokens)) generationParams.max_tokens = cfg.maxTokens;
  }
  return generationParams;
}
