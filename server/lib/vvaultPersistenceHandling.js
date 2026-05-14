export function sendTranscriptPersistenceFailure({
  res,
  statusCode,
  label,
  buildTranscriptPersistenceFailurePayload,
  sendSerializedJson,
  payloadInput,
  decoratePayload = null,
}) {
  const basePayload = buildTranscriptPersistenceFailurePayload(payloadInput);
  const payload =
    typeof decoratePayload === 'function'
      ? decoratePayload(basePayload)
      : basePayload;
  return sendSerializedJson(res, statusCode, payload, label);
}

export async function handleCanonicalTranscriptPersistence({
  req,
  res,
  skipPersistence,
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
  mainPromptDiagnostics,
  providerTrace,
  validatorDebug,
  runtimeReceipt,
  orchestrationChecklist,
  aiResponse,
  nextRuntimeTurnState,
  routeTurnEnvelope,
  isSyntheticContinueTurn,
  dataOwnerUserId,
  userId,
  canonicalTurnMetadata,
  transcriptPath,
  attachments,
  effectiveModel,
  buildTranscriptPersistenceFailurePayload,
  sendSerializedJson,
  sendTranscriptPersistenceFailure,
  mergeToolTrace,
  drainToolEvents,
  loadVVAULTModules,
  writeTranscript,
  resolveSupabaseUserId,
  performTranscriptWriteWithRecovery,
  detectContinuityResetDraft,
  readConversations,
  buildConversationLookupContext,
  stripChattyMetadataComment,
  clearConversationReadCaches,
  buildCanonicalPersistenceSemantics,
  resolveConversationTitle,
  normalizeTranscriptPath,
  buildCanonicalTranscriptWriteTargetPath,
  isCanonicalConstructTranscriptWrite,
  isCanonicalLinTranscriptWrite,
  requiresVvaultBodyPersistence,
  buildPersistenceRoleResult,
  linCanonicalThreadId,
  linCanonicalTranscriptPath,
}) {
  if (skipPersistence) {
    return { handled: false };
  }

  const effectiveSession = sessionId || threadId || `${constructId}_chat_with_${constructId}`;
  const constructName = constructId.replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase());
  const decorateRoutePayload = (basePayload) => ({
    ...basePayload,
    tool_trace: mergeToolTrace(
      drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`),
      enrichedContext,
    ),
    ...(process.env.SHOW_DEV_INFO === 'true'
      ? {
          validator: validatorDebug,
          provider_trace: providerTrace,
          retrieval_diagnostics: retrievalDiagnostics,
          prompt_diagnostics: mainPromptDiagnostics,
        }
      : {}),
  });

  try {
    await loadVVAULTModules();
    if (!writeTranscript) {
      console.error(`❌ [VVAULT Proxy] Transcript persistence unavailable for ${constructId}: writeTranscript function not loaded`);
      await sendTranscriptPersistenceFailure({
        res,
        statusCode: 503,
        label: 'transcript_persistence_failure',
        buildTranscriptPersistenceFailurePayload,
        sendSerializedJson,
        payloadInput: {
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
          enrichedContext,
          retrievalDiagnostics,
          promptDiagnostics: mainPromptDiagnostics,
          providerTrace,
          validatorDebug,
          runtimeReceipt,
          details: {
            code: 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
            reason: 'write_transcript_unavailable',
            message: 'Transcript persistence module unavailable before canonical write.',
            error: 'writeTranscript function not loaded',
            timeout_ms: null,
            bounded: false,
            stage: 'bootstrap',
          },
        },
        decoratePayload: decorateRoutePayload,
      });
      return { handled: true };
    }

    const now = new Date();
    const conversationTitle = resolveConversationTitle({
      canonicalTurnMetadata,
      constructName,
    });
    const normalizedRequestedTranscriptPath = normalizeTranscriptPath(
      canonicalTurnMetadata.transcriptPath || transcriptPath || '',
    );
    const canonicalTranscriptWriteTargetPath = buildCanonicalTranscriptWriteTargetPath({
      constructId,
    });
    const canonicalConstructWrite = isCanonicalConstructTranscriptWrite({
      effectiveSession,
      constructId,
      canonicalTurnMetadata,
      normalizedRequestedTranscriptPath,
      canonicalTranscriptWriteTargetPath,
    });
    const canonicalLinWrite = isCanonicalLinTranscriptWrite({
      constructId,
      effectiveSession,
      canonicalTurnMetadata,
      normalizedRequestedTranscriptPath,
      linCanonicalThreadId,
      linCanonicalTranscriptPath,
    });
    const vvaultBodyPersistenceRequired = requiresVvaultBodyPersistence({
      isCanonicalConstructTranscriptWrite: canonicalConstructWrite,
      isCanonicalLinTranscriptWrite: canonicalLinWrite,
    });

    let transcriptWriteSupabaseUserId = dataOwnerUserId;
    if (canonicalConstructWrite) {
      const { supabaseUserId: resolvedTranscriptWriteSupabaseUserId } =
        await resolveSupabaseUserId({
          email: req.user?.email || null,
          chattyUserId: dataOwnerUserId,
        });
      if (resolvedTranscriptWriteSupabaseUserId) {
        transcriptWriteSupabaseUserId = resolvedTranscriptWriteSupabaseUserId;
      } else {
        console.warn(
          `⚠️ [VVAULT Proxy] Could not resolve canonical transcript write target for ${constructId}; falling back to current owner targeting`,
        );
      }
    }

    const persistenceRoleResults = [];
    const persistWrite = async (role, params) => {
      const outcome = await performTranscriptWriteWithRecovery(params, {
        label: `transcript_persistence_${role}`,
      });
      persistenceRoleResults.push(
        buildPersistenceRoleResult(role, outcome),
      );
      return outcome;
    };

    const continuityResetBlockReason =
      (isSyntheticContinueTurn ||
        routeTurnEnvelope.continuityResume?.continuityExpected === true)
        ? detectContinuityResetDraft(aiResponse)
        : null;
    if (continuityResetBlockReason) {
      const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
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
        enrichedContext,
        retrievalDiagnostics,
        promptDiagnostics: mainPromptDiagnostics,
        providerTrace,
        validatorDebug,
        runtimeReceipt,
        details: {
          code: 'CONTINUITY_RESET_DRAFT_BLOCKED',
          reason: continuityResetBlockReason,
          message: 'Assistant draft looked like a continuity reset, so canonical persistence was blocked.',
          error: 'continuity_reset_draft_blocked',
          timeout_ms: null,
          bounded: false,
          stage: 'assistant_prewrite',
          roles: persistenceRoleResults,
          partial_write_risk: !isSyntheticContinueTurn,
        },
      });
      console.warn('[CONTINUITY_PERSISTENCE_GATE] Blocked assistant persistence', {
        constructId,
        sessionId: effectiveSession,
        reason: continuityResetBlockReason,
      });
      await sendSerializedJson(
        res,
        422,
        decorateRoutePayload({
          ...persistenceFailurePayload,
          code: 'CONTINUITY_RESET_DRAFT_BLOCKED',
          error: 'Assistant draft looked like a continuity reset, so canonical persistence was blocked.',
          response: 'Assistant draft blocked before canonical persistence.',
        }),
        'continuity_reset_draft_blocked',
      );
      return { handled: true };
    }

    if (!isSyntheticContinueTurn) {
      const userPersistOutcome = await persistWrite('user', {
        userId: dataOwnerUserId,
        userEmail: req.user?.email,
        supabaseUserId: transcriptWriteSupabaseUserId,
        requireVvaultBodySuccess: vvaultBodyPersistenceRequired,
        sessionId: effectiveSession,
        timestamp: new Date(now.getTime()).toISOString(),
        role: 'user',
        content: message,
        title: conversationTitle,
        metadata: {
          ...canonicalTurnMetadata,
          attachments,
        },
        constructId,
        constructName,
        constructCallsign: constructId,
      });

      if (!userPersistOutcome.ok) {
        const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
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
          enrichedContext,
          retrievalDiagnostics,
          promptDiagnostics: mainPromptDiagnostics,
          providerTrace,
          validatorDebug,
          runtimeReceipt,
          details: {
            code: 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
            reason: 'transcript_user_write_failed',
            message: 'Transcript persistence failed before the user turn could be canonically recorded.',
            error: userPersistOutcome.error,
            timeout_ms: null,
            bounded: false,
            stage: 'user',
            roles: persistenceRoleResults,
            partial_write_risk: false,
          },
        });
        console.error(`❌ [VVAULT Proxy] Transcript persistence failed for ${constructId} at user write:`, userPersistOutcome.error);
        await sendSerializedJson(
          res,
          503,
          decorateRoutePayload(persistenceFailurePayload),
          'transcript_persistence_failure',
        );
        return { handled: true };
      }
    }

    const assistantPersistOutcome = await persistWrite('assistant', {
      userId: dataOwnerUserId,
      userEmail: req.user?.email,
      supabaseUserId: transcriptWriteSupabaseUserId,
      requireVvaultBodySuccess: vvaultBodyPersistenceRequired,
      sessionId: effectiveSession,
      timestamp: new Date(now.getTime() + 2).toISOString(),
      role: 'assistant',
      content: aiResponse,
      title: conversationTitle,
      metadata: {
        ...canonicalTurnMetadata,
        modelKey: canonicalTurnMetadata.modelKey || effectiveModel,
        modelLabel: canonicalTurnMetadata.modelLabel || effectiveModel,
        runtimeReceipt,
        orchestrationChecklist,
        runtimeTurnState: nextRuntimeTurnState,
      },
      constructId,
      constructName,
      constructCallsign: constructId,
    });

    if (!assistantPersistOutcome.ok) {
      const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
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
        enrichedContext,
        retrievalDiagnostics,
        promptDiagnostics: mainPromptDiagnostics,
        providerTrace,
        validatorDebug,
        runtimeReceipt,
        details: {
          code: 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
          reason: 'transcript_assistant_write_failed',
          message: 'Transcript persistence failed before the assistant reply could be canonically recorded.',
          error: assistantPersistOutcome.error,
          timeout_ms: null,
          bounded: false,
          stage: 'assistant',
          roles: persistenceRoleResults,
          partial_write_risk: true,
        },
      });
      console.error(`❌ [VVAULT Proxy] Transcript persistence failed for ${constructId} at assistant write:`, assistantPersistOutcome.error);
      await sendSerializedJson(
        res,
        503,
        decorateRoutePayload(persistenceFailurePayload),
        'transcript_persistence_failure',
      );
      return { handled: true };
    }

    clearConversationReadCaches();

    if (vvaultBodyPersistenceRequired) {
      const canonicalReadbackRows = await readConversations(
        buildConversationLookupContext({
          userEmail: req.user?.email || null,
          supabaseUserId: transcriptWriteSupabaseUserId,
          userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
        }),
        constructId,
        { allowLocalFallback: false },
      );
      const canonicalReadbackConversation = (Array.isArray(canonicalReadbackRows)
        ? canonicalReadbackRows
        : []
      ).find((row) => row?.sessionId === effectiveSession || row?.id === effectiveSession);
      const readbackAssistantTail = (canonicalReadbackConversation?.messages || [])
        .filter((row) => row?.role === 'assistant')
        .at(-1);

      if (
        !readbackAssistantTail ||
        stripChattyMetadataComment(readbackAssistantTail.content) !== String(aiResponse || '').trimEnd()
      ) {
        const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
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
          enrichedContext,
          retrievalDiagnostics,
          promptDiagnostics: mainPromptDiagnostics,
          providerTrace,
          validatorDebug,
          runtimeReceipt,
          details: {
            code: 'TRANSCRIPT_READBACK_MISMATCH',
            reason: 'canonical_vvault_readback_tail_mismatch',
            message: 'Transcript write completed, but canonical VVAULT readback did not return the assistant tail.',
            error: 'canonical_vvault_readback_tail_mismatch',
            timeout_ms: null,
            bounded: false,
            stage: 'readback',
            roles: persistenceRoleResults,
            partial_write_risk: true,
          },
        });
        console.error(`❌ [VVAULT Proxy] Canonical readback mismatch for ${constructId} after transcript write`);
        await sendSerializedJson(
          res,
          503,
          decorateRoutePayload(persistenceFailurePayload),
          'transcript_readback_mismatch',
        );
        return { handled: true };
      }
    }

    console.log('[RUNTIME_TURN_STATE]', {
      stage: 'persisted',
      sessionId: effectiveSession,
      constructId,
      source: assistantPersistOutcome.value?.source || assistantPersistOutcome.source || null,
      runtimeTurnState: nextRuntimeTurnState,
    });

    runtimeReceipt.persistence_owner = 'vvault_body';
    runtimeReceipt.persistence = {
      ...runtimeReceipt.persistence,
      attempted: true,
      status: 'pass',
      timeout_ms: null,
      bounded: false,
      stage: 'assistant',
      roles: persistenceRoleResults,
      ...buildCanonicalPersistenceSemantics(),
    };
    console.log(
      `💾 [VVAULT Proxy] Transcript persisted for ${constructId} (${isSyntheticContinueTurn ? 'assistant-only continue turn' : 'user + assistant'})`,
    );
    return { handled: false };
  } catch (persistErr) {
    console.error(`❌ [VVAULT Proxy] Transcript persistence threw for ${constructId}:`, persistErr?.message || String(persistErr));
    await sendTranscriptPersistenceFailure({
      res,
      statusCode: 503,
      label: 'transcript_persistence_failure',
      buildTranscriptPersistenceFailurePayload,
      sendSerializedJson,
      payloadInput: {
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
        enrichedContext,
        retrievalDiagnostics,
        promptDiagnostics: mainPromptDiagnostics,
        providerTrace,
        validatorDebug,
        runtimeReceipt,
        details: {
          code: 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
          reason: 'transcript_persistence_exception',
          message: 'Transcript persistence failed before the canonical response could be recorded.',
          error: persistErr?.message || String(persistErr),
          timeout_ms: null,
          bounded: false,
          stage: 'unexpected',
        },
      },
      decoratePayload: decorateRoutePayload,
    });
    return { handled: true };
  }
}
