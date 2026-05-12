export async function loadVvaultRouteRuntimeState({
  req,
  constructId,
  effectiveTurnSessionId,
  dataOwnerUserId,
  supabaseSessionUserId,
  userId,
  routeTurnEnvelope,
  buildConversationLookupContext,
  readLatestRuntimeTurnState,
  uuidLookupRe,
}) {
  const persistedRuntimeState = await readLatestRuntimeTurnState(
    buildConversationLookupContext({
      userEmail: req.user?.email || null,
      supabaseUserId: uuidLookupRe.test(String(dataOwnerUserId || '').trim())
        ? dataOwnerUserId
        : supabaseSessionUserId,
      userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
    }),
    {
      sessionId: effectiveTurnSessionId,
      constructId,
      allowLocalFallback: false,
    },
  );

  if (persistedRuntimeState?.runtimeTurnState) {
    routeTurnEnvelope.runtimeTurnState = persistedRuntimeState.runtimeTurnState;
    routeTurnEnvelope.persistedStateSource = persistedRuntimeState.source || 'unknown';
  }

  return {
    routeTurnEnvelope,
    persistedRuntimeState,
  };
}

export async function attemptCanonicalContinuityRecovery({
  constructId,
  effectiveTurnSessionId,
  dataOwnerUserId,
  supabaseSessionUserId,
  userId,
  req,
  routeTurnEnvelope,
  continuityResumeRequest,
  continuityResumeValidation,
  buildConversationLookupContext,
  readConversations,
  buildTranscriptTruthPreflight,
  validateRuntimeResumeRequest,
  uuidLookupRe,
}) {
  const transcriptTruthLookupId = buildConversationLookupContext({
    userEmail: req.user?.email || null,
    supabaseUserId: uuidLookupRe.test(String(dataOwnerUserId || '').trim())
      ? dataOwnerUserId
      : supabaseSessionUserId,
    userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
  });
  const preloadedTranscriptTruthRows = await readConversations(transcriptTruthLookupId, constructId, {
    allowLocalFallback: false,
  });
  const preRecoveryTranscriptTruth = buildTranscriptTruthPreflight({
    readPathAvailable: true,
    conversations: preloadedTranscriptTruthRows,
    sessionId: effectiveTurnSessionId,
    constructId,
    runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
  });
  const recoveredRuntimeTurnState = preRecoveryTranscriptTruth.runtimeTurnState || null;

  if (recoveredRuntimeTurnState) {
    routeTurnEnvelope.runtimeTurnState = recoveredRuntimeTurnState;
    routeTurnEnvelope.persistedStateSource = 'canonical_tail_metadata';
    continuityResumeValidation = validateRuntimeResumeRequest({
      runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
      resumeRequest: continuityResumeRequest,
      sessionId: effectiveTurnSessionId,
      constructId,
    });
    routeTurnEnvelope.continuityExpected =
      continuityResumeValidation.continuityExpected === true;
    routeTurnEnvelope.continuityResume = continuityResumeValidation;
  }

  return {
    transcriptTruthLookupId,
    preloadedTranscriptTruthRows,
    continuityResumeValidation,
    routeTurnEnvelope,
  };
}

export async function processCanonicalTranscriptTruth({
  req,
  res,
  authReceipt,
  dataOwnerUserId,
  userId,
  supabaseSessionUserId,
  constructId,
  rawConstructId,
  canonicalConstructId,
  message,
  threadId,
  sessionId,
  hasImages,
  previewMode,
  gptConfig,
  continueTurn,
  continuityResumeRequest,
  continuityResumeValidation,
  routeTurnEnvelope,
  effectiveTurnSessionId,
  skipPersistence,
  preloadedTranscriptTruthRows = null,
  transcriptTruthLookupId = null,
  loadVVAULTModules,
  readConversations,
  buildConversationLookupContext,
  uuidLookupRe,
  buildTranscriptTruthPreflight,
  shouldRequireCanonicalTranscriptTruth,
  isExplicitResumeContinuationCue,
  rebuildRuntimeTurnStateFromCanonicalTranscript,
  validateRuntimeResumeRequest,
  buildTranscriptTruthFailurePayload,
  sendSerializedJson,
  buildContinuityProofReceipt,
  deriveConstructReceiptName,
  buildOrchestrationChecklist,
}) {
  routeTurnEnvelope.transcriptTruth = {
    required: false,
    eligible: false,
    hydrationSource: 'not_required',
    hydrationComplete: null,
  };

  const transcriptTruthRequired = shouldRequireCanonicalTranscriptTruth({
    continueTurn,
    continuityResume: continuityResumeValidation,
    runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
    sessionId: effectiveTurnSessionId,
    constructId,
    message,
    previewMode,
    skipPersistence,
  });
  const implicitContinuationRequest =
    isExplicitResumeContinuationCue(message) &&
    continuityResumeValidation?.continuityExpected !== true;
  const transcriptTruthRequiresRuntimeState =
    continueTurn === true ||
    continuityResumeValidation?.continuityExpected === true ||
    implicitContinuationRequest === true ||
    Boolean(routeTurnEnvelope.runtimeTurnState?.assistantTurnId);

  const buildUnavailablePayload = ({
    code,
    error,
    responseStatus,
    transcriptTruthOverride,
  }) =>
    buildTranscriptTruthFailurePayload({
      authReceipt,
      userId: dataOwnerUserId,
      user: req.user,
      constructId,
      rawConstructId,
      canonicalConstructId,
      message,
      threadId,
      sessionId,
      hasImages,
      previewMode,
      gptConfig,
      continuityResume: routeTurnEnvelope.continuityResume,
      transcriptTruth:
        transcriptTruthOverride ||
        buildTranscriptTruthPreflight({
          readPathAvailable: false,
          sessionId: effectiveTurnSessionId,
          constructId,
          runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
          requireRuntimeTurnState: transcriptTruthRequiresRuntimeState,
        }),
      code,
      error,
      responseStatus,
    });

  if (!transcriptTruthRequired) {
    return {
      handled: false,
      preloadedTranscriptTruthRows,
      transcriptTruthLookupId,
      continuityResumeValidation,
      routeTurnEnvelope,
    };
  }

  routeTurnEnvelope.transcriptTruth.required = true;
  try {
    await loadVVAULTModules();
  } catch (_error) {
    const payload = buildUnavailablePayload({
      code: 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE',
      error: 'Canonical transcript read path is unavailable, so continuation generation is blocked.',
      responseStatus: 'canonical_transcript_read_unavailable',
    });
    await sendSerializedJson(res, 503, payload, 'transcript-truth-unavailable');
    return { handled: true };
  }

  if (typeof readConversations !== 'function') {
    const payload = buildUnavailablePayload({
      code: 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE',
      error: 'Canonical transcript read path is unavailable, so continuation generation is blocked.',
      responseStatus: 'canonical_transcript_read_unavailable',
    });
    await sendSerializedJson(res, 503, payload, 'transcript-truth-unavailable');
    return { handled: true };
  }

  transcriptTruthLookupId =
    transcriptTruthLookupId ||
    buildConversationLookupContext({
      userEmail: req.user?.email || null,
      supabaseUserId: uuidLookupRe.test(String(dataOwnerUserId || '').trim())
        ? dataOwnerUserId
        : supabaseSessionUserId,
      userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
    });

  try {
    preloadedTranscriptTruthRows =
      preloadedTranscriptTruthRows ||
      await readConversations(transcriptTruthLookupId, constructId, {
        allowLocalFallback: false,
      });
  } catch (error) {
    const payload = buildUnavailablePayload({
      code: 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE',
      error: `Canonical transcript read failed: ${error.message}`,
      responseStatus: 'canonical_transcript_read_unavailable',
    });
    await sendSerializedJson(res, 503, payload, 'transcript-truth-unavailable');
    return { handled: true };
  }

  if (routeTurnEnvelope.persistedStateSource === 'local_fallback_metadata') {
    routeTurnEnvelope.runtimeTurnState = null;
  }

  let transcriptTruth = buildTranscriptTruthPreflight({
    readPathAvailable: true,
    conversations: preloadedTranscriptTruthRows,
    sessionId: effectiveTurnSessionId,
    constructId,
    runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
    requireRuntimeTurnState: transcriptTruthRequiresRuntimeState,
  });
  const rebuiltRuntimeTurnState =
    transcriptTruthRequiresRuntimeState !== true &&
    transcriptTruth.exactThreadFound === true &&
    transcriptTruth.hydrationSource === 'full' &&
    (transcriptTruth.reason === 'runtime_turn_state_missing' ||
      transcriptTruth.reason === 'runtime_turn_state_hydration_unproven' ||
      transcriptTruth.reason === 'runtime_turn_state_thread_mismatch')
      ? rebuildRuntimeTurnStateFromCanonicalTranscript({
          exactMessages: transcriptTruth.exactMessages,
          sessionId: effectiveTurnSessionId,
          constructId,
        })
      : null;

  if (rebuiltRuntimeTurnState) {
    routeTurnEnvelope.runtimeTurnState = rebuiltRuntimeTurnState;
    routeTurnEnvelope.persistedStateSource = 'canonical_tail_rebuild';
    transcriptTruth = buildTranscriptTruthPreflight({
      readPathAvailable: true,
      conversations: preloadedTranscriptTruthRows,
      sessionId: effectiveTurnSessionId,
      constructId,
      runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
      requireRuntimeTurnState: transcriptTruthRequiresRuntimeState,
    });
    const recoveredContinuityResumeValidation = validateRuntimeResumeRequest({
      runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
      resumeRequest: continuityResumeRequest,
      sessionId: effectiveTurnSessionId,
      constructId,
    });
    routeTurnEnvelope.continuityExpected =
      recoveredContinuityResumeValidation.continuityExpected === true;
    routeTurnEnvelope.continuityResume = recoveredContinuityResumeValidation;
    continuityResumeValidation = recoveredContinuityResumeValidation;
  }

  routeTurnEnvelope.transcriptTruth = {
    required: true,
    ...transcriptTruth,
  };

  if (transcriptTruth.runtimeTurnState) {
    routeTurnEnvelope.runtimeTurnState = transcriptTruth.runtimeTurnState;
    routeTurnEnvelope.persistedStateSource = 'canonical_tail_metadata';
    const effectiveResumeRequest =
      implicitContinuationRequest === true
        ? {
            continuity_expected: true,
            resume_from_turn_id: routeTurnEnvelope.runtimeTurnState.assistantTurnId,
            resume_from_continuity_seq: routeTurnEnvelope.runtimeTurnState.continuitySeq,
            resume_tail_hash: routeTurnEnvelope.runtimeTurnState.tailHash,
            resume_construct_revision: routeTurnEnvelope.runtimeTurnState.constructRevision,
            resume_source_seat: 'chatty',
          }
        : continuityResumeRequest;
    continuityResumeValidation = validateRuntimeResumeRequest({
      runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
      resumeRequest: effectiveResumeRequest,
      sessionId: effectiveTurnSessionId,
      constructId,
    });
    routeTurnEnvelope.continuityExpected =
      continuityResumeValidation.continuityExpected === true;
    routeTurnEnvelope.continuityResume = continuityResumeValidation;
  }

  if (!transcriptTruth.eligible) {
    const payload = buildUnavailablePayload({
      code: 'TRANSCRIPT_HYDRATION_REQUIRED',
      error: 'Canonical transcript hydration is incomplete, fallback-shaped, or missing the real assistant tail.',
      responseStatus: 'transcript_hydration_required',
      transcriptTruthOverride: transcriptTruth,
    });
    await sendSerializedJson(res, 409, payload, 'transcript-truth-required');
    return { handled: true };
  }

  if (
    routeTurnEnvelope.continuityResume?.continuityExpected === true &&
    routeTurnEnvelope.continuityResume?.continuityRestored !== true
  ) {
    const continuityFailureCode = routeTurnEnvelope.continuityResume.staleSeatRejected
      ? 'CONTINUITY_RESUME_STALE'
      : 'CONTINUITY_RESUME_UNPROVEN';
    const continuityFailureMessage = routeTurnEnvelope.continuityResume.staleSeatRejected
      ? 'Continuity resume was rejected because this seat is stale. Reload the canonical thread and try again.'
      : 'Continuity resume could not be proven from the canonical thread tail. Reload the thread and try again.';
    const continuityReceipt = buildContinuityProofReceipt({
      hydration: routeTurnEnvelope.continuityResume.hydration,
      hydrationComplete: routeTurnEnvelope.continuityResume.hydrationComplete,
      resumeValidation: routeTurnEnvelope.continuityResume,
    });
    const continuityFailureReceipt = {
      created_at: new Date().toISOString(),
      user_id: dataOwnerUserId || null,
      auth: authReceipt,
      construct_id: constructId,
      effective_construct_id: constructId,
      effective_construct_name: deriveConstructReceiptName(constructId, gptConfig),
      orchestration_mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
      route_mode: 'vvault_message',
      persistence_owner: 'continuity_resume_blocked',
      continuity: continuityReceipt,
      ...continuityReceipt,
      transcript_truth: {
        eligible: routeTurnEnvelope.transcriptTruth?.eligible === true,
        source: routeTurnEnvelope.transcriptTruth?.hydrationSource || 'none',
        hydration_complete: routeTurnEnvelope.transcriptTruth?.hydrationComplete === true,
        exact_thread_id: effectiveTurnSessionId,
        exact_thread_found: routeTurnEnvelope.transcriptTruth?.exactThreadFound === true,
        assistant_tail_found: routeTurnEnvelope.transcriptTruth?.assistantTailFound === true,
        runtime_state_found: routeTurnEnvelope.transcriptTruth?.runtimeStateFound === true,
        runtime_state_hydration_truth:
          routeTurnEnvelope.transcriptTruth?.runtimeStateHydrationTruth || null,
        evidence_count: Number(routeTurnEnvelope.transcriptTruth?.evidenceCount || 0),
        evidence_sources: routeTurnEnvelope.transcriptTruth?.evidenceSources || [],
        fallback_rejected: routeTurnEnvelope.transcriptTruth?.fallbackRejected === true,
        retrieval_status: 'verified',
        blocked_reason: routeTurnEnvelope.continuityResume.failureReason || null,
      },
      capsule_runtime: {
        capsuleLoaded: null,
        capsuleSource: null,
        contextProfile: null,
        continuityFromRuntimeState: false,
        continuityMemorySource: null,
      },
      memory: {
        retrieval_ran: false,
        memory_query_detected: false,
        evidence_count: 0,
        transcript_memory_status: 'blocked',
        history_source: routeTurnEnvelope.transcriptTruth?.hydrationSource || 'none',
        transcript_sources: routeTurnEnvelope.transcriptTruth?.evidenceSources || [],
      },
      provider: {
        final_provider: null,
        provider: null,
        model: null,
        mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
        fallback_used: false,
      },
    };
    const continuityFailureChecklist = buildOrchestrationChecklist({
      userId: dataOwnerUserId,
      user: req.user,
      constructId,
      threadId: effectiveTurnSessionId,
      userMessage: message,
      gptConfig,
      runtimeReceipt: continuityFailureReceipt,
      responseStatus: 'continuity_resume_blocked',
      skipPersistence: false,
    });
    res.status(409).json({
      ok: false,
      success: false,
      constructId,
      construct_id: constructId,
      code: continuityFailureCode,
      error: continuityFailureMessage,
      details: routeTurnEnvelope.continuityResume,
      runtime_receipt: continuityFailureReceipt,
      orchestration_checklist: continuityFailureChecklist,
      has_images: hasImages,
    });
    return { handled: true };
  }

  return {
    handled: false,
    preloadedTranscriptTruthRows,
    transcriptTruthLookupId,
    continuityResumeValidation,
    routeTurnEnvelope,
  };
}
