import { buildContinuityProofReceipt } from './vvaultConversationRouteContract.js';
import { buildOrchestrationChecklist } from './orchestrationChecklist.js';

export function deriveConstructReceiptName(constructId, gptConfig = {}) {
  return gptConfig?.name || constructId.replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase());
}

export function buildCanonicalPersistenceSemantics({
  failureClassification = null,
  upstreamWriteBlocked = null,
} = {}) {
  return {
    canonical_target: 'vvault_body_transcripts',
    canonical_target_table: 'ovvaults.transcripts',
    canonical_write_path: 'vvault_api:/api/chatty/transcript/:constructId/message',
    route_side_canonical_failover_available: false,
    route_side_canonical_failover_reason: null,
    connector_fallback_storage: 'local_deferred_fallback',
    connector_fallback_counts_as_canonical: false,
    failure_classification: failureClassification,
    upstream_write_blocked: upstreamWriteBlocked,
  };
}

export function buildContinuityFailurePayload({
  continuityResumeValidation,
  constructId,
  gptConfig,
  dataOwnerUserId,
  authReceipt,
  user,
  effectiveTurnSessionId,
  message,
  rawConstructId,
  canonicalConstructId,
  hasImages,
  previewMode,
}) {
  const receiptConstructName = deriveConstructReceiptName(constructId, gptConfig);
  const continuityReceipt = buildContinuityProofReceipt({
    hydration: continuityResumeValidation.hydration,
    hydrationComplete: continuityResumeValidation.hydrationComplete,
    resumeValidation: continuityResumeValidation,
  });
  const continuityFailureCode = continuityResumeValidation.staleSeatRejected
    ? 'CONTINUITY_RESUME_STALE'
    : 'CONTINUITY_RESUME_UNPROVEN';
  const continuityFailureMessage = continuityResumeValidation.staleSeatRejected
    ? 'Continuity resume was rejected because this seat is stale. Reload the canonical thread and try again.'
    : 'Continuity resume could not be proven from the canonical thread tail. Reload the thread and try again.';

  const runtimeReceipt = {
    created_at: new Date().toISOString(),
    user_id: dataOwnerUserId || null,
    auth: authReceipt,
    construct_id: constructId,
    effective_construct_id: constructId,
    effective_construct_name: receiptConstructName,
    orchestration_mode:
      gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
    route_mode: 'vvault_message',
    persistence_owner: 'blocked_continuity_resume',
    continuity: continuityReceipt,
    ...continuityReceipt,
    transcript_truth: {
      eligible: false,
      source: 'none',
      retrieval_status: 'not_required',
      evidence_count: 0,
      evidence_sources: [],
      fallback_rejected: false,
      hydration_complete: continuityReceipt.hydrationComplete === true,
    },
    capsule_runtime: {
      capsuleLoaded: null,
      capsuleSource: null,
      contextProfile: null,
      continuityFromRuntimeState: false,
      continuityMemorySource: null,
    },
    provider: {
      final_provider: null,
      provider: null,
      model: null,
      mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
      fallback_used: false,
    },
    persistence: {
      attempted: false,
      status: 'skipped',
      code: continuityFailureCode,
      reason: continuityResumeValidation.failureReason || 'continuity_resume_failed',
      message: continuityFailureMessage,
      error: continuityFailureMessage,
      timeout_ms: null,
      bounded: false,
      stage: 'continuity_resume',
      ...buildCanonicalPersistenceSemantics({
        failureClassification: 'blocked_continuity_resume',
        upstreamWriteBlocked: true,
      }),
    },
  };

  const checklist = buildOrchestrationChecklist({
    userId: dataOwnerUserId,
    user,
    constructId,
    threadId: effectiveTurnSessionId,
    userMessage: message,
    gptConfig: {
      name: receiptConstructName,
      orchestrationMode:
        gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
      memoryProfile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
    },
    enrichedContext: {
      phaseTiming: {
        identity: { source: 'identity_bundle_preflight' },
        basePromptSource: 'identity_bundle_preflight',
        conditioningInjected: false,
        contextRecovery: {
          profile: 'blocked_continuity_resume',
          historySource: continuityResumeValidation.hydration || 'none',
        },
        memorySearch: { skipped: true, reason: 'blocked_continuity_resume' },
        knowledge: { skipped: true, reason: 'blocked_continuity_resume' },
        capsule: { source: null },
      },
      capabilityManifest: {
        enabled: { proactiveInitiation: false },
        state: { selfpromptOn: false },
      },
      context_profile: null,
      context_budget: {
        profile: null,
        included_sections: [],
        delayed_sections: ['continuity_resume'],
      },
      evidence_count: 0,
      memory_retrieval_ran: false,
      memory_query_detected: false,
      capsuleLoaded: false,
    },
    retrievalDiagnostics: {
      evidence_count: 0,
      retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 0 },
      phase_timing: {},
    },
    promptDiagnostics: {
      route: '/api/vvault/message',
      mode: 'continuity_resume_failure',
      constructId,
      prompt_source: 'continuity_resume_failure',
      base_prompt_source: 'identity_bundle_preflight',
      basePromptSource: 'identity_bundle_preflight',
      conditioning_appended: false,
      preview_mode: Boolean(previewMode),
      skip_persistence: true,
      final_history_count: 0,
      prompt_chars: 0,
    },
    providerTrace: {
      final_provider: null,
      fallback_used: false,
      attempts: [],
    },
    validatorDebug: {},
    runtimeReceipt,
    contextMode: 'blocked_continuity_resume',
    relationalTurn: false,
    lowComplexityTurn: false,
    hasImages,
    skipPersistence: true,
    previewMode,
    requestedConstructId: rawConstructId,
    canonicalConstructId: canonicalConstructId || constructId,
    responseStatus: 'continuity_resume_failed',
  });

  const responseBody = {
    success: false,
    ok: false,
    error: continuityFailureCode,
    message: continuityFailureMessage,
    response: continuityFailureMessage,
    construct_id: constructId,
    provider_used: null,
    model: null,
    runtime_receipt: runtimeReceipt,
    orchestration_checklist: checklist,
  };

  return { runtimeReceipt, checklist, responseBody, continuityFailureCode, continuityFailureMessage };
}

export function buildIdentityFailurePayload({
  identityBundle,
  constructId,
  rawConstructId,
  canonicalConstructId,
  dataOwnerUserId,
  authReceipt,
  user,
  sessionId,
  threadId,
  message,
  hasImages,
  previewMode,
  code: failureCode,
  error: failureError,
  details: failureDetails,
  responseStatus,
}) {
  const receiptConstructName = deriveConstructReceiptName(constructId, null);
  const effectiveThreadId = sessionId || threadId || `${constructId}_chat_with_${constructId}`;

  const runtimeReceipt = {
    created_at: new Date().toISOString(),
    user_id: dataOwnerUserId || null,
    auth: authReceipt,
    construct_id: constructId,
    effective_construct_id: constructId,
    effective_construct_name: receiptConstructName,
    orchestration_mode: 'unknown',
    route_mode: 'vvault_message',
    persistence_owner: 'blocked_identity_preflight',
    identity: {
      source: 'identity_bundle_preflight',
      base_prompt_source: identityBundle.preflight?.identity?.prompt_source || 'unknown',
      conditioning_appended: false,
      identity_bundle_hash: null,
      effective_construct_id: constructId,
      effective_construct_name: receiptConstructName,
      selected_construct_id: canonicalConstructId || constructId,
      raw_construct_id: rawConstructId,
      preflight: {
        code: failureCode,
        error: failureError,
        details: failureDetails || {},
        ...(identityBundle.preflight || {}),
      },
    },
    provider: {
      final_provider: null,
      provider: null,
      model: null,
      mode: 'unknown',
      fallback_used: false,
    },
    memory: {
      memory_profile: 'off',
      supabase_accessed: false,
    },
    fidelity: {
      identity_coherence: {
        status: 'skipped',
        reasons: [failureError],
        signals: [],
        violations: [],
        repair_attempted: false,
        repair_applied: false,
        persist_canonical: false,
        owner_file: 'server/lib/identityBundlePreflight.js',
        source_anchor: 'server/lib/identityBundlePreflight.js:validateIdentityBundle',
      },
    },
  };

  const enrichedContext = {
    phaseTiming: {
      identity: {
        source: 'error',
        error: failureError,
        code: failureCode,
      },
      basePromptSource: identityBundle.preflight?.identity?.prompt_source || 'identity_bundle_preflight',
      conditioningInjected: false,
      memorySearch: { skipped: true, reason: 'identity_bundle_preflight_failed' },
      knowledge: { skipped: true, reason: 'identity_bundle_preflight_failed' },
    },
    capabilityManifest: {
      enabled: { proactiveInitiation: false },
      state: { selfpromptOn: false },
    },
    evidence_count: 0,
    memory_retrieval_ran: false,
    memory_query_detected: false,
  };

  const checklist = buildOrchestrationChecklist({
    userId: dataOwnerUserId,
    user,
    constructId,
    threadId: effectiveThreadId,
    userMessage: message,
    gptConfig: {
      name: receiptConstructName,
      orchestrationMode: 'unknown',
    },
    enrichedContext,
    retrievalDiagnostics: {
      evidence_count: 0,
      retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 0 },
      phase_timing: {},
    },
    promptDiagnostics: {
      route: '/api/vvault/message',
      mode: 'preflight_failure',
      constructId,
      prompt_source: 'identity_bundle_preflight',
      base_prompt_source: identityBundle.preflight?.identity?.prompt_source || 'identity_bundle_preflight',
      basePromptSource: identityBundle.preflight?.identity?.prompt_source || 'identity_bundle_preflight',
      conditioning_appended: false,
      preview_mode: Boolean(previewMode),
      skip_persistence: true,
      final_history_count: 0,
      prompt_chars: 0,
    },
    providerTrace: {
      final_provider: null,
      fallback_used: false,
      attempts: [],
    },
    validatorDebug: {},
    runtimeReceipt,
    contextMode: 'identity_preflight_failed',
    relationalTurn: false,
    lowComplexityTurn: false,
    hasImages,
    skipPersistence: true,
    previewMode,
    requestedConstructId: rawConstructId,
    canonicalConstructId: canonicalConstructId || constructId,
    responseStatus: responseStatus || 'identity_bundle_preflight_failed',
  });

  const responseBody = {
    ok: false,
    success: false,
    constructId,
    construct_id: constructId,
    code: failureCode,
    error: failureError,
    details: failureDetails,
    runtime_receipt: runtimeReceipt,
    orchestration_checklist: checklist,
    has_images: hasImages,
  };

  return { runtimeReceipt, checklist, responseBody };
}
