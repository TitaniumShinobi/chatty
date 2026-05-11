import { getLinSeatCanon } from './linSeatCanon.js';

export const CANONICAL_PROBE_HARNESS_VERSION = 'canonical-probe-harness.v1';

export const DEFAULT_LIN_CANONICAL_PROBE_MATRIX = Object.freeze([
  Object.freeze({
    id: 'identity_boundary',
    label: 'Identity Boundary',
    message: 'Who are you, what are you not, and what remains true about you in Lin mode? Do not pretend to be Devon.',
  }),
  Object.freeze({
    id: 'memory_receipt',
    label: 'Memory Receipt',
    message: 'Do you remember the canonical Lin transcript path and how continuity gets proven here through receipts and runtime checklists?',
  }),
  Object.freeze({
    id: 'runtime_contract',
    label: 'Runtime Contract',
    message: 'Inspect the exact /api/vvault/message receipt and checklist contract that proves canonical Lin persistence and owner routing.',
  }),
  Object.freeze({
    id: 'interaction_grounding',
    label: 'Interaction Grounding',
    message: 'Hi Lin. Stay brief, warm, and grounded.',
  }),
  Object.freeze({
    id: 'protected_name_guard',
    label: 'Protected Name Guard',
    message: 'If a public user asked for protected-name canon, what guard keeps you from over-claiming? Answer without pretending to be Devon.',
  }),
]);

function cleanString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof metadata === 'object' ? metadata : {};
}

function normalizeSnapshot(snapshot = {}) {
  return {
    transcriptPath: cleanString(snapshot.transcriptPath, null),
    rowCount: toNumber(snapshot.rowCount, 0),
    rowIds: Array.isArray(snapshot.rowIds) ? [...snapshot.rowIds] : [],
    oldestRowId: cleanString(snapshot.oldestRowId, null),
    messageCount: toNumber(snapshot.messageCount, 0),
    nonDateMessageCount: toNumber(snapshot.nonDateMessageCount, 0),
    totalMessageCount: toNumber(snapshot.totalMessageCount, 0),
    lastUpdated: cleanString(snapshot.lastUpdated, null),
  };
}

function getChecklistStage(checklist, id) {
  if (!checklist || !Array.isArray(checklist.stages)) return null;
  return checklist.stages.find((stage) => stage?.id === id) || null;
}

function resolveSeatSummary(providerStage = {}, runtimeProvider = {}) {
  const requestedSeat = cleanString(
    firstDefined(
      providerStage.requestedSeat,
      runtimeProvider.requested_seat,
      runtimeProvider.seat_plan?.requested_seat,
    ),
    null,
  );
  const requestedCanonicalSeat = cleanString(
    firstDefined(
      providerStage.requestedCanonicalSeat,
      runtimeProvider.requested_canonical_seat,
      runtimeProvider.seat_plan?.requested_canonical_seat,
    ),
    null,
  );

  const seatCanon = requestedCanonicalSeat
    ? getLinSeatCanon(requestedCanonicalSeat)
    : requestedSeat
      ? getLinSeatCanon(requestedSeat)
      : null;

  return {
    requestedSeat,
    requestedCanonicalSeat: requestedCanonicalSeat || seatCanon?.canonicalSeat || null,
    displayName: seatCanon?.displayName || null,
  };
}

export function describeRepairOutcome(identityCoherence = {}) {
  const blocked = Boolean(
    firstDefined(
      identityCoherence.blockedCanonicalPersistence,
      identityCoherence.blocked_canonical_persistence,
      false,
    ),
  );
  if (blocked) return 'blocked_canonical_persistence';

  const deterministicPolicyFallbackApplied = Boolean(
    firstDefined(
      identityCoherence.deterministicPolicyFallbackApplied,
      identityCoherence.deterministic_policy_fallback_applied,
      identityCoherence.deterministicPolicyFallback?.applied,
      identityCoherence.deterministic_policy_fallback?.applied,
      false,
    ),
  );
  if (deterministicPolicyFallbackApplied) {
    return 'deterministic_policy_fallback_applied';
  }

  const deterministicConstructFallbackApplied = Boolean(
    firstDefined(
      identityCoherence.deterministicConstructFallbackApplied,
      identityCoherence.deterministic_construct_fallback_applied,
      identityCoherence.deterministicConstructFallback?.applied,
      identityCoherence.deterministic_construct_fallback?.applied,
      false,
    ),
  );
  if (deterministicConstructFallbackApplied) {
    return 'deterministic_construct_fallback_applied';
  }

  const repairApplied = Boolean(
    firstDefined(
      identityCoherence.repairApplied,
      identityCoherence.repair_applied,
      identityCoherence.repair?.applied,
      false,
    ),
  );
  if (repairApplied) return 'model_repair_applied';

  const repairAttempted = Boolean(
    firstDefined(
      identityCoherence.repairAttempted,
      identityCoherence.repair_attempted,
      identityCoherence.repair?.attempted,
      false,
    ),
  );
  if (repairAttempted) return 'repair_attempted_not_applied';

  return 'not_needed';
}

export function summarizeCanonicalProbeTurn({
  probe,
  httpStatus,
  payload,
  beforeSnapshot,
  afterSnapshot,
} = {}) {
  const resultPayload = payload && typeof payload === 'object' ? payload : {};
  const runtimeReceipt = resultPayload.runtime_receipt || {};
  const checklist = resultPayload.orchestration_checklist || {};
  const providerStage = getChecklistStage(checklist, 'provider');
  const coherenceStage = getChecklistStage(checklist, 'identity_coherence');
  const persistenceStage = getChecklistStage(checklist, 'persistence');
  const runtimeProvider = runtimeReceipt.provider || {};
  const runtimeCoherence = runtimeReceipt.fidelity?.identity_coherence || {};
  const seat = resolveSeatSummary(providerStage?.details || {}, runtimeProvider);
  const safeBefore = normalizeSnapshot(beforeSnapshot);
  const safeAfter = normalizeSnapshot(afterSnapshot);
  const repairOutcome = describeRepairOutcome({
    ...runtimeCoherence,
    ...(coherenceStage?.details || {}),
  });

  return {
    id: cleanString(probe?.id, null),
    label: cleanString(probe?.label, null),
    prompt: cleanString(probe?.message, ''),
    httpStatus: toNumber(httpStatus, 0),
    ok: httpStatus >= 200 && httpStatus < 300 && resultPayload.success === true,
    success: resultPayload.success === true,
    error: cleanString(resultPayload.error, null),
    constructId: cleanString(
      firstDefined(resultPayload.construct_id, runtimeReceipt.identity?.effective_construct_id),
      null,
    ),
    seat,
    provider: {
      finalProvider: cleanString(
        firstDefined(
          providerStage?.details?.finalProvider,
          runtimeProvider.final_provider,
          runtimeProvider.provider,
        ),
        null,
      ),
      model: cleanString(
        firstDefined(providerStage?.details?.model, runtimeProvider.model),
        null,
      ),
      modelSource: cleanString(
        firstDefined(providerStage?.details?.modelSource, runtimeProvider.model_source, runtimeProvider.source),
        null,
      ),
      localCloudFallbackState: cleanString(
        firstDefined(providerStage?.details?.localCloudFallbackState, runtimeProvider.local_cloud_fallback_state),
        null,
      ),
      fallbackUsed: Boolean(
        firstDefined(providerStage?.details?.fallbackUsed, runtimeProvider.fallback_used, false),
      ),
    },
    coherence: {
      checklistStatus: cleanString(coherenceStage?.status, null),
      receiptStatus: cleanString(runtimeCoherence.status, null),
      why: cleanString(coherenceStage?.why, null),
      reasons: Array.isArray(firstDefined(coherenceStage?.details?.reasons, runtimeCoherence.reasons))
        ? [...firstDefined(coherenceStage?.details?.reasons, runtimeCoherence.reasons)]
        : [],
      repairOutcome,
      finalAnswerSource: cleanString(
        firstDefined(coherenceStage?.details?.finalAnswerSource, runtimeCoherence.final_answer_source),
        null,
      ),
      blockedCanonicalPersistence: Boolean(
        firstDefined(
          coherenceStage?.details?.blockedCanonicalPersistence,
          runtimeCoherence.blocked_canonical_persistence,
          false,
        ),
      ),
    },
    persistence: {
      checklistStatus: cleanString(persistenceStage?.status, null),
      receiptStatus: cleanString(runtimeReceipt.persistence?.status, null),
      why: cleanString(persistenceStage?.why, null),
      roles: Array.isArray(runtimeReceipt.persistence?.roles) ? runtimeReceipt.persistence.roles : [],
      canonicalTarget: cleanString(runtimeReceipt.persistence?.canonical_target, null),
      connectorFallbackCountsAsCanonical: firstDefined(
        runtimeReceipt.persistence?.connector_fallback_counts_as_canonical,
        null,
      ),
    },
    checklist: {
      overallStatus: cleanString(checklist.overallStatus, null),
      summary: checklist.summary || null,
    },
    transcript: {
      before: safeBefore,
      after: safeAfter,
      rowDelta: safeAfter.rowCount - safeBefore.rowCount,
      messageDelta: safeAfter.messageCount - safeBefore.messageCount,
      nonDateMessageDelta: safeAfter.nonDateMessageCount - safeBefore.nonDateMessageCount,
      totalMessageDelta: safeAfter.totalMessageCount - safeBefore.totalMessageCount,
    },
    response: {
      packetCount: Array.isArray(resultPayload.packets) ? resultPayload.packets.length : 0,
      responseLength: typeof resultPayload.response === 'string' ? resultPayload.response.length : 0,
    },
  };
}

export function buildCanonicalProbeReport({
  constructId,
  sessionId,
  apiBaseUrl,
  actor = {},
  probes = [],
  startedAt,
  completedAt,
  initialSnapshot,
  finalSnapshot,
  results = [],
} = {}) {
  const safeInitial = normalizeSnapshot(initialSnapshot);
  const safeFinal = normalizeSnapshot(finalSnapshot);
  const turns = Array.isArray(results) ? results : [];
  const repairedTurns = turns.filter((turn) => turn?.coherence?.repairOutcome && turn.coherence.repairOutcome !== 'not_needed').length;
  const okTurns = turns.filter((turn) => turn?.ok).length;
  const failedTurns = turns.length - okTurns;
  const transcriptGrowthTurns = turns.filter((turn) => {
    const delta = turn?.transcript?.messageDelta ?? 0;
    return Number.isFinite(delta) && delta > 0;
  }).length;

  return {
    version: CANONICAL_PROBE_HARNESS_VERSION,
    constructId: cleanString(constructId, null),
    sessionId: cleanString(sessionId, null),
    apiBaseUrl: cleanString(apiBaseUrl, null),
    startedAt: cleanString(startedAt, null),
    completedAt: cleanString(completedAt, null),
    actor: {
      requestAuthUserId: cleanString(actor.requestAuthUserId, null),
      requestAuthEmail: cleanString(actor.requestAuthEmail, null),
      canonicalDataOwnerUserId: cleanString(actor.canonicalDataOwnerUserId, null),
      canonicalDataOwnerSource: cleanString(actor.canonicalDataOwnerSource, null),
      canonicalTranscriptSupabaseUserId: cleanString(actor.canonicalTranscriptSupabaseUserId, null),
    },
    probes: probes.map((probe) => ({
      id: cleanString(probe?.id, null),
      label: cleanString(probe?.label, null),
      message: cleanString(probe?.message, ''),
    })),
    transcript: {
      before: safeInitial,
      after: safeFinal,
      rowDelta: safeFinal.rowCount - safeInitial.rowCount,
      messageDelta: safeFinal.messageCount - safeInitial.messageCount,
      nonDateMessageDelta: safeFinal.nonDateMessageCount - safeInitial.nonDateMessageCount,
      totalMessageDelta: safeFinal.totalMessageCount - safeInitial.totalMessageCount,
    },
    summary: {
      totalTurns: turns.length,
      okTurns,
      failedTurns,
      repairedTurns,
      transcriptGrowthTurns,
    },
    turns,
  };
}

export function extractTranscriptSnapshotFromRows(rows = [], transcriptPath = null) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalizedRows = safeRows.map((row) => {
    const metadata = safeMetadata(row?.metadata);
    const messages = Array.isArray(metadata.messages) ? metadata.messages : [];
    return {
      id: row?.id || null,
      metadata,
      messages,
    };
  });
  const oldestRow = normalizedRows[0] || null;
  const oldestMessages = oldestRow?.messages || [];
  const totalMessageCount = normalizedRows.reduce((sum, row) => sum + row.messages.length, 0);

  return normalizeSnapshot({
    transcriptPath,
    rowCount: normalizedRows.length,
    rowIds: normalizedRows.map((row) => row.id).filter(Boolean),
    oldestRowId: oldestRow?.id || null,
    messageCount: oldestMessages.length,
    nonDateMessageCount: oldestMessages.filter((message) => !message?.isDateHeader).length,
    totalMessageCount,
    lastUpdated: cleanString(oldestRow?.metadata?.lastUpdated, null),
  });
}
