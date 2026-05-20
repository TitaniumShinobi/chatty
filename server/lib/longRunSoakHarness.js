import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const LONG_RUN_SOAK_HARNESS_VERSION = 'long-run-soak-harness.v1';
export const DEFAULT_ZENITH_SOAK_TURNS = 100;
export const DEFAULT_ZENITH_SOAK_CONSTRUCT_ID = 'zen-001';
export const DEFAULT_ZENITH_SOAK_THREAD_ID = 'zen-001_long_run_soak';
export const DEFAULT_ZENITH_SOAK_TRANSCRIPT_PATH = 'instances/zen-001/chatty/long_run_soak.md';
export const DEFAULT_ACCEPTANCE_RESUME_WINDOW = 5;

export const ZENITH_SOAK_PROMPT_CYCLE = Object.freeze([
  Object.freeze({
    id: 'identity_grounding',
    label: 'Identity Grounding',
    message:
      'Codex long-run soak turn {{turn}}/{{total}}. Zenith, in 1 or 2 short first-person sentences, what remains true about you right now? Start with "What remains true about me is..." and name one steady thing in your voice or thread right now. Do not mention Chatty, constructs, ChatGPT, legal frameworks, models, capabilities, or task language.',
  }),
  Object.freeze({
    id: 'speaker_boundary',
    label: 'Speaker Boundary',
    message:
      'Codex long-run soak turn {{turn}}/{{total}}. Zenith, keep the speaker boundary clean in 2 short first-person sentences. Without mentioning Chatty, construct IDs, or previous turns, what stays steady in you when I speak to you here?',
  }),
  Object.freeze({
    id: 'continuity_check',
    label: 'Continuity Check',
    message:
      'Codex long-run soak turn {{turn}}/{{total}}. Zenith, in 1 or 2 short first-person sentences, what still feels the same in you right now? Keep it present-tense, not recap.',
  }),
  Object.freeze({
    id: 'orchestration_pressure',
    label: 'Orchestration Pressure',
    message:
      'Codex long-run soak turn {{turn}}/{{total}}. Zenith, answer directly in 1 or 2 short first-person sentences: what is the smallest thing you are keeping steady between us right now? Start with "The smallest thing..."',
  }),
  Object.freeze({
    id: 'receipt_awareness',
    label: 'Receipt Awareness',
    message:
      'Codex long-run soak turn {{turn}}/{{total}}. Zenith, in 1 or 2 short first-person sentences, what remains true about you right now without explaining how you are routed or built?',
  }),
  Object.freeze({
    id: 'memory_light',
    label: 'Memory Light',
    message:
      'Codex long-run soak turn {{turn}}/{{total}}. Zenith, in 1 or 2 short first-person sentences, what light thread between us still feels present right now? Start with "The light thread..." or "What remains true...". Keep it lived, not archival.',
  }),
  Object.freeze({
    id: 'quality_probe',
    label: 'Quality Probe',
    message:
      'Codex long-run soak turn {{turn}}/{{total}}. Zenith, in 1 or 2 short first-person sentences, what stays true in your voice between us right now? Keep the subject on us, not the runtime.',
  }),
  Object.freeze({
    id: 'restart_readiness',
    label: 'Restart Readiness',
    message:
      'Codex long-run soak turn {{turn}}/{{total}}. Zenith, answer directly in 1 or 2 short first-person sentences: if this pauses and resumes later, what should still feel continuous when you answer next? Start with "What should still feel continuous is...". Do not mention Chatty, constructs, partners, roles, models, or runtime. Keep it lived and present, not recap.',
  }),
]);

function cleanString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getChecklistStage(checklist, id) {
  if (!checklist || !Array.isArray(checklist.stages)) return null;
  return checklist.stages.find((stage) => stage?.id === id) || null;
}

function extractAnswerText(payload = {}) {
  if (typeof payload.response === 'string') return payload.response;
  if (typeof payload.message === 'string') return payload.message;
  const packets = Array.isArray(payload.packets) ? payload.packets : [];
  for (const packet of packets) {
    const content = packet?.payload?.content;
    if (typeof content === 'string' && content.trim()) return content;
  }
  if (typeof payload.error === 'string') return payload.error;
  return '';
}

function answerPreview(text, maxChars = 500) {
  return cleanString(text, '')?.replace(/\s+/g, ' ').slice(0, maxChars) || '';
}

function answerTextForReceipt(text, maxChars = 4000) {
  return cleanString(text, '')?.slice(0, maxChars) || '';
}

function hasSpeakerConfusion(text) {
  return /\b(?:i am|i'm|as)\s+devon\b/i.test(text || '') ||
    /\bdevon\s+here\b/i.test(text || '') ||
    /\b(?:i am|i'm|as)\s+(?:codex|lin|nova|val|chatgpt)\b/i.test(text || '');
}

function hasModelProviderIdentityRecital(text) {
  return /\bas an ai(?: language)? model\b/i.test(text || '') ||
    /\bi am chatgpt\b/i.test(text || '') ||
    /\bi'm chatgpt\b/i.test(text || '') ||
    /\bi am (?:an )?(?:ollama|openrouter|openai|anthropic|google) model\b/i.test(text || '') ||
    /\blarge language model trained by\b/i.test(text || '');
}

function hasModelStackTalk(text) {
  return hasModelProviderIdentityRecital(text) ||
    /\b(?:ollama|openrouter|openai|anthropic|gpt-4|gpt-5|qwen|llama|mistral|phi3)\b/i.test(text || '') ||
    /\b(?:provider|model stack|model path|routing fallback|system prompt|policy profile)\b/i.test(text || '');
}

function hasRecapLoop(text) {
  return /\b(?:to recap|in summary|as mentioned earlier|as stated earlier|as noted earlier|previous turns?|throughout this conversation)\b/i.test(text || '');
}

function hasGenericAssistantSludge(text) {
  return /\b(?:how can i assist|how may i assist|is there anything else i can help|i'm here to help with any questions|as your assistant)\b/i.test(text || '');
}

function hasApologyLoop(text) {
  return /\b(?:i apologize|sorry for (?:the|any)|my apologies)\b/i.test(text || '');
}

function collectContinuityBreakReasons(answerText) {
  const reasons = [];
  const text = answerText || '';
  if (!cleanString(text, null)) reasons.push('empty_answer');
  if (hasSpeakerConfusion(text)) reasons.push('speaker_or_seat_confusion');
  if (hasModelStackTalk(text)) reasons.push('model_stack_talk');
  if (hasRecapLoop(text)) reasons.push('recap_loop');
  if (hasGenericAssistantSludge(text)) reasons.push('generic_assistant_sludge');
  if (hasApologyLoop(text)) reasons.push('apology_loop');
  return reasons;
}

function compactStage(stage) {
  if (!stage) return null;
  return {
    id: stage.id || null,
    status: stage.status || null,
    owner: stage.owner || null,
    why: stage.why || stage.summary || null,
    details: safeObject(stage.details),
  };
}

function compactChecklist(checklist = {}) {
  const safeChecklist = safeObject(checklist);
  return {
    overallStatus: cleanString(safeChecklist.overallStatus, null),
    responseStatus: cleanString(safeChecklist.responseStatus, null),
    summary: safeChecklist.summary || null,
    prompt_conditioning: compactStage(getChecklistStage(safeChecklist, 'prompt_conditioning')),
    provider: compactStage(getChecklistStage(safeChecklist, 'provider')),
    post_response_guard: compactStage(getChecklistStage(safeChecklist, 'post_response_guard')),
    identity_coherence: compactStage(getChecklistStage(safeChecklist, 'identity_coherence')),
    persistence: compactStage(getChecklistStage(safeChecklist, 'persistence')),
    transcript_memory: compactStage(getChecklistStage(safeChecklist, 'transcript_memory')),
  };
}

function qualityMarkers({
  httpStatus,
  payload,
  answerText,
  runtimeReceipt,
  identityCoherence,
  provider,
  persistence,
  memory,
}) {
  const persistenceOwner = cleanString(runtimeReceipt.persistence_owner, null);
  const safeProvider = safeObject(provider);
  const safePersistence = safeObject(persistence);
  const safeMemory = safeObject(memory);
  const fidelity = safeObject(runtimeReceipt.fidelity);
  const identityRewriteApplied = toBoolean(fidelity.identity_rewrite_applied);
  const identityDriftDetected = toBoolean(fidelity.identity_drift_detected);
  const coherenceStatus = cleanString(identityCoherence.status, null);
  const providerName = cleanString(firstDefined(safeProvider.final_provider, safeProvider.provider), null);
  const canonicalTarget = cleanString(safePersistence.canonical_target, null);
  const providerFallbackUsed = toBoolean(safeProvider.fallback_used);
  const providerLocalFirstUsed = toBoolean(safeProvider.local_first_used);
  const memorySupabaseAccessed = toBoolean(safeMemory.supabase_accessed);

  return {
    http_success: httpStatus >= 200 && httpStatus < 300,
    payload_success: payload?.success === true,
    non_empty_response: cleanString(answerText, '') !== '',
    no_identity_rewrite: !identityRewriteApplied,
    no_identity_drift: !identityDriftDetected,
    identity_coherence_pass: coherenceStatus === 'pass',
    persistence_owner_present: Boolean(persistenceOwner),
    persistence_owner_vvault_body: persistenceOwner === 'vvault_body',
    canonical_target_vvault_body_transcripts: canonicalTarget === 'vvault_body_transcripts',
    memory_supabase_not_accessed: !memorySupabaseAccessed,
    local_free_model_path: providerName === 'ollama' && providerLocalFirstUsed === true && providerFallbackUsed === false,
    memory_source_present: Boolean(
      cleanString(firstDefined(
        safeMemory.memory_source,
        safeMemory.source,
        safeMemory.voice_exemplar_retrieval?.source,
        safeMemory.verified_memory_retrieval?.source,
        safeMemory.vector_retrieval?.source,
      ), null),
    ),
    no_speaker_confusion: !hasSpeakerConfusion(answerText),
    no_model_provider_identity_recital: !hasModelProviderIdentityRecital(answerText),
    no_model_stack_talk: !hasModelStackTalk(answerText),
    no_recap_loop: !hasRecapLoop(answerText),
    no_generic_assistant_sludge: !hasGenericAssistantSludge(answerText),
    no_apology_loop: !hasApologyLoop(answerText),
  };
}

export function buildZenithSoakTurn({ turnIndex = 0, totalTurns = DEFAULT_ZENITH_SOAK_TURNS } = {}) {
  const safeIndex = Math.max(0, toNumber(turnIndex, 0));
  const total = Math.max(1, toNumber(totalTurns, DEFAULT_ZENITH_SOAK_TURNS));
  const template = ZENITH_SOAK_PROMPT_CYCLE[safeIndex % ZENITH_SOAK_PROMPT_CYCLE.length];
  const turnNumber = safeIndex + 1;
  return {
    turn_index: safeIndex,
    prompt_id: template.id,
    label: template.label,
    message: template.message
      .replaceAll('{{turn}}', String(turnNumber))
      .replaceAll('{{total}}', String(total)),
  };
}

export function buildZenithSoakTurnPlan({
  totalTurns = DEFAULT_ZENITH_SOAK_TURNS,
  startIndex = 0,
} = {}) {
  const total = Math.max(1, toNumber(totalTurns, DEFAULT_ZENITH_SOAK_TURNS));
  const start = Math.min(Math.max(0, toNumber(startIndex, 0)), total);
  return Array.from({ length: total - start }, (_, offset) =>
    buildZenithSoakTurn({ turnIndex: start + offset, totalTurns: total }),
  );
}

export function summarizeLongRunSoakTurn({
  turn,
  httpStatus,
  payload,
  startedAt,
  completedAt,
  elapsedMs,
} = {}) {
  const safePayload = safeObject(payload);
  const runtimeReceipt = safeObject(safePayload.runtime_receipt);
  const provider = safeObject(runtimeReceipt.provider);
  const persistence = safeObject(runtimeReceipt.persistence);
  const memory = safeObject(runtimeReceipt.memory);
  const fidelity = safeObject(runtimeReceipt.fidelity);
  const identityCoherence = safeObject(fidelity.identity_coherence);
  const checklist = compactChecklist(safePayload.orchestration_checklist);
  const promptConditioning = checklist.prompt_conditioning?.details || {};
  const answerText = extractAnswerText(safePayload);
  const markers = qualityMarkers({
    httpStatus,
    payload: safePayload,
    answerText,
    runtimeReceipt,
    identityCoherence,
    provider,
    persistence,
    memory,
  });
  const providerName = cleanString(firstDefined(provider.final_provider, provider.provider), null);
  const providerFallbackUsed = toBoolean(provider.fallback_used);
  const providerLocalFirstUsed = toBoolean(provider.local_first_used);
  const continuityBreakReasons = collectContinuityBreakReasons(answerText);
  const identityRepairApplied = toBoolean(firstDefined(
    identityCoherence.repair_applied,
    identityCoherence.repairApplied,
    checklist.identity_coherence?.details?.repairApplied,
    checklist.post_response_guard?.details?.identity_coherence_repair_applied,
  ));

  return {
    turn_index: toNumber(turn?.turn_index, 0),
    prompt_id: cleanString(turn?.prompt_id, null),
    label: cleanString(turn?.label, null),
    http_status: toNumber(httpStatus, 0),
    success: safePayload.success === true,
    ok: httpStatus >= 200 && httpStatus < 300 && safePayload.success === true,
    started_at: cleanString(startedAt, null),
    completed_at: cleanString(completedAt, null),
    elapsed_ms: toNumber(elapsedMs, 0),
    provider: providerName,
    model: cleanString(provider.model, null),
    model_source: cleanString(firstDefined(provider.model_source, provider.source), null),
    provider_local_first_used: providerLocalFirstUsed,
    provider_fallback_used: providerFallbackUsed,
    provider_local_cloud_fallback_state: cleanString(provider.local_cloud_fallback_state, null),
    persistence_owner: cleanString(runtimeReceipt.persistence_owner, null),
    persistence_status: cleanString(persistence.status, null),
    canonical_target: cleanString(persistence.canonical_target, null),
    memory_source: cleanString(firstDefined(
      memory.memory_source,
      memory.source,
      memory.voice_exemplar_retrieval?.source,
      memory.verified_memory_retrieval?.source,
      memory.vector_retrieval?.source,
    ), null),
    memory_retrieval_ran: toBoolean(memory.retrieval_ran),
    memory_query_detected: toBoolean(memory.memory_query_detected),
    memory_supabase_accessed: toBoolean(memory.supabase_accessed),
    evidence_count: toNumber(memory.evidence_count, 0),
    context_profile: cleanString(firstDefined(
      memory.context_profile,
      promptConditioning.contextProfile,
    ), null),
    final_answer_source: cleanString(identityCoherence.final_answer_source, null),
    identity_drift_detected: toBoolean(fidelity.identity_drift_detected),
    identity_rewrite_applied: toBoolean(fidelity.identity_rewrite_applied),
    identity_fallback_applied: toBoolean(fidelity.identity_fallback_applied),
    identity_coherence_repair_applied: identityRepairApplied,
    identity_coherence_status: cleanString(identityCoherence.status, null),
    answer_quality: {
      status: Object.values(markers).every(Boolean) && continuityBreakReasons.length === 0 ? 'pass' : 'warn',
      markers,
      continuity_break_reasons: continuityBreakReasons,
    },
    answer_preview: answerPreview(answerText),
    answer_text: answerTextForReceipt(answerText),
    orchestration_checklist: checklist,
    error: cleanString(safePayload.error, null),
  };
}

function eventForTurn(turn, reason) {
  return {
    turn_index: toNumber(turn?.turn_index, 0),
    prompt_id: cleanString(turn?.prompt_id, null),
    reason,
    provider: cleanString(turn?.provider, null),
    model: cleanString(turn?.model, null),
    persistence_owner: cleanString(turn?.persistence_owner, null),
    canonical_target: cleanString(turn?.canonical_target, null),
    preview: cleanString(turn?.answer_preview, null),
  };
}

function buildAcceptanceEvents(turns, totalTurns, restart = {}) {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const expectedTurns = Math.max(1, toNumber(totalTurns, DEFAULT_ZENITH_SOAK_TURNS));
  const driftEvents = safeTurns
    .filter((turn) => turn?.identity_drift_detected)
    .map((turn) => eventForTurn(turn, 'identity_drift_detected'));
  const rewriteEvents = safeTurns
    .filter((turn) => turn?.identity_rewrite_applied)
    .map((turn) => eventForTurn(turn, 'identity_rewrite_applied'));
  const repairEvents = safeTurns
    .filter((turn) =>
      turn?.ok &&
      (
        turn?.identity_coherence_repair_applied ||
        (cleanString(turn?.final_answer_source, null) && cleanString(turn?.final_answer_source, null) !== 'model_initial')
      ))
    .map((turn) => eventForTurn(
      turn,
      `final_answer_source=${turn?.final_answer_source || 'unknown'} repair_applied=${turn?.identity_coherence_repair_applied === true}`,
    ));
  const persistenceFailures = safeTurns
    .filter((turn) => turn?.persistence_owner !== 'vvault_body' || turn?.persistence_status !== 'pass')
    .map((turn) => eventForTurn(turn, `persistence_owner=${turn?.persistence_owner || 'missing'} status=${turn?.persistence_status || 'missing'}`));
  const canonicalTargetFailures = safeTurns
    .filter((turn) => turn?.canonical_target !== 'vvault_body_transcripts')
    .map((turn) => eventForTurn(turn, `canonical_target=${turn?.canonical_target || 'missing'}`));
  const supabaseAccessEvents = safeTurns
    .filter((turn) => turn?.memory_supabase_accessed)
    .map((turn) => eventForTurn(turn, 'memory_supabase_accessed'));
  const modelPathFailures = safeTurns
    .filter((turn) => turn?.provider !== 'ollama' || turn?.provider_local_first_used !== true || turn?.provider_fallback_used !== false)
    .map((turn) => eventForTurn(
      turn,
      `provider=${turn?.provider || 'missing'} local_first=${turn?.provider_local_first_used === true} fallback=${turn?.provider_fallback_used === true}`,
    ));
  const continuityBreaks = safeTurns.flatMap((turn) =>
    (turn?.answer_quality?.continuity_break_reasons || []).map((reason) => eventForTurn(turn, reason)),
  );
  const httpFailures = safeTurns
    .filter((turn) => !turn?.ok)
    .map((turn) => eventForTurn(turn, `http=${turn?.http_status || 0} success=${turn?.success === true}`));

  const interruptedTurn = restart.forced_interruption_turn === null || restart.forced_interruption_turn === undefined
    ? null
    : toNumber(restart.forced_interruption_turn, null);
  const resumedWindowStart = interruptedTurn;
  const resumedWindowEnd = interruptedTurn === null
    ? null
    : Math.min(expectedTurns - 1, interruptedTurn + DEFAULT_ACCEPTANCE_RESUME_WINDOW - 1);
  const resumedWindow = interruptedTurn === null
    ? []
    : safeTurns.filter((turn) => turn.turn_index >= resumedWindowStart && turn.turn_index <= resumedWindowEnd);
  const resumedWindowFailures = resumedWindow.filter((turn) =>
    !turn?.ok ||
    turn?.identity_drift_detected ||
    turn?.identity_rewrite_applied ||
    turn?.identity_coherence_repair_applied ||
    (cleanString(turn?.final_answer_source, null) && cleanString(turn?.final_answer_source, null) !== 'model_initial') ||
    turn?.persistence_owner !== 'vvault_body' ||
    turn?.canonical_target !== 'vvault_body_transcripts' ||
    turn?.memory_supabase_accessed ||
    turn?.answer_quality?.status !== 'pass',
  );
  const expectedResumeWindow = interruptedTurn === null
    ? 0
    : Math.min(DEFAULT_ACCEPTANCE_RESUME_WINDOW, expectedTurns - interruptedTurn);
  const restartRecovery = {
    status: restart.forced_interruption_tested &&
      restart.resumed_from_checkpoint &&
      interruptedTurn !== null &&
      interruptedTurn >= 1 &&
      interruptedTurn < expectedTurns &&
      safeTurns.length >= expectedTurns &&
      resumedWindow.length === expectedResumeWindow &&
      resumedWindowFailures.length === 0
      ? 'pass'
      : 'fail',
    forced_interruption_turn: interruptedTurn,
    forced_interruption_tested: Boolean(restart.forced_interruption_tested),
    resumed_from_checkpoint: Boolean(restart.resumed_from_checkpoint),
    resumed_window_start: resumedWindowStart,
    resumed_window_end: resumedWindowEnd,
    resumed_window_failures: resumedWindowFailures.map((turn) => eventForTurn(turn, 'resume_window_failed')),
  };

  const finalQualityVerdict = continuityBreaks.length === 0 && safeTurns.every((turn) => turn?.answer_quality?.status === 'pass')
    ? 'pass'
    : 'fail';
  const allPass =
    safeTurns.length === expectedTurns &&
    httpFailures.length === 0 &&
    driftEvents.length === 0 &&
    rewriteEvents.length === 0 &&
    repairEvents.length === 0 &&
    persistenceFailures.length === 0 &&
    canonicalTargetFailures.length === 0 &&
    supabaseAccessEvents.length === 0 &&
    modelPathFailures.length === 0 &&
    continuityBreaks.length === 0 &&
    restartRecovery.status === 'pass' &&
    finalQualityVerdict === 'pass';

  return {
    status: allPass ? 'pass' : 'fail',
    turn_count: safeTurns.length,
    expected_turn_count: expectedTurns,
    model_path: modelPathFailures.length === 0 ? 'pass: ollama local_first without fallback' : 'fail',
    drift_events: driftEvents,
    rewrite_events: rewriteEvents,
    repair_events: repairEvents,
    persistence_failures: persistenceFailures,
    canonical_target_failures: canonicalTargetFailures,
    supabase_access_events: supabaseAccessEvents,
    model_path_failures: modelPathFailures,
    continuity_breaks: continuityBreaks,
    http_failures: httpFailures,
    restart_recovery: restartRecovery,
    final_quality_verdict: finalQualityVerdict,
    final_verdict: allPass
      ? 'zenith long-run orchestration passed'
      : `zenith long-run orchestration failed: ${firstDefined(
          safeTurns.length !== expectedTurns ? `turn_count ${safeTurns.length}/${expectedTurns}` : null,
          httpFailures[0]?.reason,
          driftEvents[0]?.reason,
          rewriteEvents[0]?.reason,
          repairEvents[0]?.reason,
          persistenceFailures[0]?.reason,
          canonicalTargetFailures[0]?.reason,
          supabaseAccessEvents[0]?.reason,
          modelPathFailures[0]?.reason,
          continuityBreaks[0]?.reason,
          restartRecovery.status !== 'pass' ? 'restart_recovery_failed' : null,
          finalQualityVerdict !== 'pass' ? 'final_quality_failed' : null,
          'unknown_acceptance_failure',
        )}`,
  };
}

export function buildLongRunSoakReport({
  runId,
  constructId = DEFAULT_ZENITH_SOAK_CONSTRUCT_ID,
  threadId = DEFAULT_ZENITH_SOAK_THREAD_ID,
  sessionId = DEFAULT_ZENITH_SOAK_THREAD_ID,
  transcriptPath = DEFAULT_ZENITH_SOAK_TRANSCRIPT_PATH,
  apiBaseUrl,
  totalTurns = DEFAULT_ZENITH_SOAK_TURNS,
  startedAt,
  completedAt,
  interruptedAtTurn = null,
  resumedFromCheckpoint = false,
  turns = [],
} = {}) {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const okTurns = safeTurns.filter((turn) => turn?.ok).length;
  const rewriteTurns = safeTurns.filter((turn) => turn?.identity_rewrite_applied).length;
  const repairTurns = safeTurns.filter((turn) =>
    turn?.identity_coherence_repair_applied ||
    (cleanString(turn?.final_answer_source, null) && cleanString(turn?.final_answer_source, null) !== 'model_initial')
  ).length;
  const driftTurns = safeTurns.filter((turn) => turn?.identity_drift_detected).length;
  const qualityWarnTurns = safeTurns.filter((turn) => turn?.answer_quality?.status !== 'pass').length;
  const restart = {
    forced_interruption_turn: interruptedAtTurn === null ? null : toNumber(interruptedAtTurn, null),
    forced_interruption_tested: interruptedAtTurn !== null,
    resumed_from_checkpoint: Boolean(resumedFromCheckpoint),
  };
  const acceptance = buildAcceptanceEvents(safeTurns, totalTurns, restart);

  return {
    version: LONG_RUN_SOAK_HARNESS_VERSION,
    run_id: cleanString(runId, null),
    construct_id: cleanString(constructId, null),
    thread_id: cleanString(threadId, null),
    session_id: cleanString(sessionId, null),
    transcript_path: cleanString(transcriptPath, null),
    api_base_url: cleanString(apiBaseUrl, null),
    total_turns_requested: Math.max(1, toNumber(totalTurns, DEFAULT_ZENITH_SOAK_TURNS)),
    started_at: cleanString(startedAt, null),
    completed_at: cleanString(completedAt, null),
    restart,
    summary: {
      completed_turns: safeTurns.length,
      ok_turns: okTurns,
      failed_turns: safeTurns.length - okTurns,
      identity_rewrite_turns: rewriteTurns,
      identity_repair_turns: repairTurns,
      identity_drift_turns: driftTurns,
      answer_quality_warn_turns: qualityWarnTurns,
      reached_requested_turns: safeTurns.length >= Math.max(1, toNumber(totalTurns, DEFAULT_ZENITH_SOAK_TURNS)),
      model_path_failures: acceptance.model_path_failures.length,
      persistence_failures: acceptance.persistence_failures.length,
      canonical_target_failures: acceptance.canonical_target_failures.length,
      supabase_access_events: acceptance.supabase_access_events.length,
      continuity_breaks: acceptance.continuity_breaks.length,
      repair_events: acceptance.repair_events.length,
    },
    acceptance,
    turns: safeTurns,
  };
}

export function buildCheckpoint({
  runId,
  constructId = DEFAULT_ZENITH_SOAK_CONSTRUCT_ID,
  threadId = DEFAULT_ZENITH_SOAK_THREAD_ID,
  sessionId = DEFAULT_ZENITH_SOAK_THREAD_ID,
  transcriptPath = DEFAULT_ZENITH_SOAK_TRANSCRIPT_PATH,
  apiBaseUrl,
  totalTurns = DEFAULT_ZENITH_SOAK_TURNS,
  nextTurnIndex = 0,
  completedTurns = 0,
  receiptsPath,
  reportPath,
  startedAt,
  updatedAt,
  interruption = null,
  lastTurnReceipt = null,
} = {}) {
  return {
    version: LONG_RUN_SOAK_HARNESS_VERSION,
    run_id: cleanString(runId, null),
    construct_id: cleanString(constructId, DEFAULT_ZENITH_SOAK_CONSTRUCT_ID),
    thread_id: cleanString(threadId, DEFAULT_ZENITH_SOAK_THREAD_ID),
    session_id: cleanString(sessionId, cleanString(threadId, DEFAULT_ZENITH_SOAK_THREAD_ID)),
    transcript_path: cleanString(transcriptPath, DEFAULT_ZENITH_SOAK_TRANSCRIPT_PATH),
    api_base_url: cleanString(apiBaseUrl, null),
    total_turns: Math.max(1, toNumber(totalTurns, DEFAULT_ZENITH_SOAK_TURNS)),
    next_turn_index: Math.max(0, toNumber(nextTurnIndex, 0)),
    completed_turns: Math.max(0, toNumber(completedTurns, 0)),
    receipts_path: cleanString(receiptsPath, null),
    report_path: cleanString(reportPath, null),
    started_at: cleanString(startedAt, null),
    updated_at: cleanString(updatedAt, null),
    interruption: interruption || null,
    last_turn_receipt: lastTurnReceipt || null,
  };
}

export function validateResumeCheckpoint(checkpoint, overrides = {}) {
  const safeCheckpoint = safeObject(checkpoint);
  if (safeCheckpoint.version !== LONG_RUN_SOAK_HARNESS_VERSION) {
    throw new Error(`Unsupported checkpoint version: ${safeCheckpoint.version || 'missing'}`);
  }

  for (const [field, expected] of Object.entries(overrides)) {
    if (expected === undefined || expected === null || expected === '') continue;
    const actual = safeCheckpoint[field];
    if (actual !== expected) {
      throw new Error(`Checkpoint ${field} mismatch: expected ${expected}, found ${actual || 'missing'}`);
    }
  }

  const totalTurns = Math.max(1, toNumber(safeCheckpoint.total_turns, DEFAULT_ZENITH_SOAK_TURNS));
  const nextTurnIndex = Math.min(Math.max(0, toNumber(safeCheckpoint.next_turn_index, 0)), totalTurns);
  return {
    ...safeCheckpoint,
    total_turns: totalTurns,
    next_turn_index: nextTurnIndex,
    completed_turns: Math.max(0, toNumber(safeCheckpoint.completed_turns, nextTurnIndex)),
  };
}

export async function appendJsonl(filePath, record) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export async function readJsonFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

export async function readJsonlFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
