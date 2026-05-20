import assert from 'node:assert/strict';

import { isLinOrchestratedConstruct } from './constructMemoryPolicy.js';
import { RESEARCH_WORKFLOW_STEPS } from './researchWorkflowReceipt.js';

const OWNERS = {
  auth: 'server/routes/vvault.js:5936',
  identity: 'server/lib/memoryContextBuilder.js:1172',
  previewIdentity: 'server/lib/memoryContextBuilder.js:1213',
  orchestration: 'src/lib/aiService.ts:646',
  capabilities: 'server/lib/capabilityManifest.js:46',
  selfprompt: 'server/lib/selfpromptEngine.js:39',
  transcriptMemory: 'server/lib/memoryContextBuilder.js:1165',
  continuity: 'server/routes/vvault.js:/api/vvault/message',
  transcriptTruth: 'server/lib/vvaultConversationRouteContract.js:buildTranscriptTruthPreflight',
  capsuleRuntime: 'server/lib/memoryContextBuilder.js:buildEnrichedContext',
  cognition: 'server/lib/cognitionContainer.js:inferCognitionForLin',
  verifiedLoader: 'server/lib/verifiedMemoryLoader.js:67',
  knowledge: 'server/lib/memoryContextBuilder.js:1037',
  runtimePolicy: 'server/lib/constructRuntimePolicy.js:buildConstructRuntimePolicyContext',
  promptMode: 'server/lib/memoryContextBuilder.js:1155',
  provider: 'server/routes/vvault.js:6720',
  modelSynthesis: 'server/lib/fullSeatSynthesis.js:runFullSeatSynthesis',
  researchWorkflow: 'server/lib/researchWorkflowReceipt.js:buildResearchWorkflowReceipt',
  assignmentQa: 'server/lib/assignmentQaGuard.js:evaluateAssignmentQa',
  postGuard: 'server/lib/responsePostProcessor.js:3',
  identityCoherence: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
  transcriptLawGovernance: 'server/lib/identityCoherenceGuard.js:evaluateTranscriptLawGovernance',
  persistence: 'src/components/Layout.tsx:2882',
  notificationUi: 'src/components/Layout.tsx:3124',
};

const OPTIONAL_SKIPPED_STAGE_IDS = new Set([
  'capabilities_selfprompt',
  'knowledge_files',
  'runtime_policy',
  'cognition_policy',
  'persistence',
]);

function clean(value, fallback = 'unknown') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function stage(id, label, status, why, owner, details = {}) {
  return {
    id,
    label,
    status,
    why: clean(why, 'No reason recorded.'),
    owner,
    details,
  };
}

function resolveMode(gptConfig = {}) {
  const config = gptConfig || {};
  return (
    config.orchestrationMode ||
    config.orchestration_mode ||
    config.configJson?.orchestrationMode ||
    config.configJson?.orchestration_mode ||
    'unknown'
  );
}

function summarizeMemory(enrichedContext = {}, retrievalDiagnostics = {}) {
  const phase = retrievalDiagnostics.phase_timing?.memorySearch || enrichedContext.phaseTiming?.memorySearch || {};
  const vectorPhase = retrievalDiagnostics.phase_timing?.vectorSearch || enrichedContext.phaseTiming?.vectorSearch || {};
  const counts = retrievalDiagnostics.retrieval_counts || {};
  const evidenceCount = Number(retrievalDiagnostics.evidence_count ?? enrichedContext.evidence_count ?? 0);
  const retrievalRan = Boolean(enrichedContext.memory_retrieval_ran);
  const memoryQueryDetected = Boolean(enrichedContext.memory_query_detected);
  const reason = phase.reason || enrichedContext.continuityMemorySearch?.reason || null;
  const details = {
    retrievalRan,
    memoryQueryDetected,
    reason,
    counts,
    evidenceCount,
    vectorRetrieval: {
      status: vectorPhase.status || enrichedContext.vectorRetrieval?.status || null,
      optional: vectorPhase.optional ?? enrichedContext.vectorRetrieval?.optional ?? true,
      degraded: Boolean(vectorPhase.degraded ?? enrichedContext.vectorRetrieval?.degraded),
      error: vectorPhase.error || enrichedContext.vectorRetrieval?.error || null,
      timeoutMs: vectorPhase.timeoutMs ?? enrichedContext.vectorRetrieval?.timeout_ms ?? null,
    },
  };

  if (evidenceCount > 0 || counts.verified > 0 || counts.needle > 0 || counts.transcript > 0) {
    return {
      status: 'pass',
      why: `Transcript/continuity retrieval produced ${evidenceCount} evidence item(s).`,
      details,
    };
  }

  if (retrievalRan) {
    return {
      status: 'warn',
      why: 'Transcript retrieval ran, but no verified evidence entered the turn.',
      details,
    };
  }

  return {
    status: 'skipped',
    why: `Transcript retrieval did not run${reason ? `: ${reason}` : memoryQueryDetected ? ': disabled' : ': not_memory_query'}.`,
    details: {
      ...details,
      reason: reason || 'not_memory_query',
    },
  };
}

function assertMemoryOwnerReceipt(enrichedContext = {}, runtimeReceipt = {}) {
  const memoryQueryDetected = Boolean(enrichedContext.memory_query_detected);
  if (!memoryQueryDetected) return;

  assert(
    runtimeReceipt.auth?.memory_lookup_user_id,
    'Missing memory_lookup_user_id for detected memory query',
  );
  assert(
    runtimeReceipt.auth?.data_owner_user_id,
    'Missing data_owner_user_id for detected memory query',
  );
  assert.equal(
    runtimeReceipt.auth.memory_lookup_user_id,
    runtimeReceipt.auth.data_owner_user_id,
    'memory_lookup_user_id must match data_owner_user_id for detected memory query',
  );
}

function summarizeKnowledge(enrichedContext = {}) {
  const phase = enrichedContext.phaseTiming?.knowledge || {};
  if (phase.error) {
    return {
      status: 'fail',
      why: `Knowledge loading failed: ${phase.error}`,
      details: phase,
    };
  }
  if (phase.skipped) {
    return {
      status: 'skipped',
      why: `Knowledge grounding skipped: ${phase.reason || 'not applicable for this turn'}.`,
      details: phase,
    };
  }
  if (Number(phase.files || 0) > 0 || enrichedContext.knowledgeFiles) {
    return {
      status: phase.relevant ? 'pass' : 'warn',
      why: phase.relevant
        ? `${phase.files} relevant knowledge file(s) grounded the turn internally.`
        : `${phase.files || 0} knowledge file(s) loaded, but none were query-relevant.`,
      details: {
        ...phase,
        matchedFiles: (enrichedContext.knowledgeMatchedFiles || []).slice(0, 5).map((file) => ({
          filename: file.filename,
          score: file.score || file.queryScore || 0,
        })),
      },
    };
  }
  return {
    status: 'skipped',
    why: 'No knowledge file entered this turn.',
    details: phase,
  };
}

function summarizeRuntimePolicy(enrichedContext = {}, runtimeReceipt = {}) {
  const policy = runtimeReceipt.policy || enrichedContext.runtimePolicy || null;
  if (!policy) {
    return {
      status: 'skipped',
      why: 'No construct runtime policy context was needed for this turn.',
      details: {
        injected: false,
        ownerFile: 'server/lib/constructRuntimePolicy.js',
        sourceAnchor: 'server/lib/constructRuntimePolicy.js:buildConstructRuntimePolicyContext',
      },
    };
  }

  const status = policy.status === 'error' ? 'fail' : policy.status === 'warn' ? 'warn' : 'pass';
  return {
    status,
    why: status === 'pass'
      ? 'Construct runtime policy context was injected from structured policy facts.'
      : `Construct runtime policy context reported ${policy.status || status}.`,
    details: {
      policy: policy.policy || 'construct_runtime_policy',
      injected: policy.status === 'injected' || policy.applies === true,
      source: policy.source || 'structured_helper',
      signals: policy.signals || [],
      promptMentionsPublicUser: Boolean(policy.promptMentionsPublicUser),
      actorIsCanonicalOwner: policy.actorIsCanonicalOwner ?? null,
      protectedNames: policy.protectedNames || [],
      facts: policy.facts || null,
      ownerFile: policy.ownerFile || 'server/lib/constructRuntimePolicy.js',
      sourceAnchor: policy.sourceAnchor || 'server/lib/constructRuntimePolicy.js:buildConstructRuntimePolicyContext',
      humanSource: policy.humanSource || 'docs/standards/construct-tier-and-need-to-know-policy.md',
    },
  };
}

function summarizeCognitionPolicy(enrichedContext = {}, runtimeReceipt = {}) {
  const cognition = runtimeReceipt.cognition || {};
  const policy = cognition.policy || enrichedContext.cognitionPolicy || null;
  const auditEvidence = cognition.audit_evidence || enrichedContext.cognitionAudit || null;
  const readiness = cognition.readiness || enrichedContext.cognitionReadiness || null;
  const linReceipt = cognition.lin_receipt || null;
  const fallbackUsed = Boolean(
    auditEvidence?.fallbackUsed ||
      readiness?.fallbackPolicyUsed ||
      linReceipt?.fallback ||
      policy?.policySource === 'default_fallback',
  );

  if (!policy) {
    return {
      status: 'skipped',
      why: 'No cognition policy advisory entered this turn.',
      details: {
        policyApplied: false,
        ownerFile: 'server/lib/cognitionContainer.js',
        sourceAnchor: 'server/lib/cognitionContainer.js:inferCognitionForLin',
      },
    };
  }

  return {
    status: fallbackUsed || readiness?.status === 'DEGRADED' ? 'warn' : 'pass',
    why: fallbackUsed
      ? 'Cognition used conservative default fallback policy and remained advisory.'
      : 'Cognition inferred an advisory policy before memory/context construction.',
    details: {
      policyVersion: policy.policyVersion || null,
      policySource: policy.policySource || null,
      confidenceBucket: policy.confidenceBucket || null,
      reasoningDepth: policy.reasoningDepth || null,
      responseStyle: policy.responseStyle || null,
      riskMode: policy.riskMode || null,
      salienceBoost: policy.salienceBoost || [],
      continuityBias: policy.continuityBias || null,
      proceediveFlags: policy.proceediveFlags || null,
      inputFingerprint: auditEvidence?.inputFingerprint || null,
      decisionReason: auditEvidence?.decisionReason || null,
      fallbackUsed,
      readinessStatus: readiness?.status || null,
      fallbackPolicyUsed: Boolean(readiness?.fallbackPolicyUsed),
      linReceipt,
      traceId: cognition.trace_id || linReceipt?.traceId || enrichedContext.cognitionTraceId || null,
      sourceAnchor: 'server/lib/cognitionContainer.js:inferCognitionForLin',
    },
  };
}

function summarizeModelSynthesis(runtimeReceipt = {}) {
  const synthesis = runtimeReceipt.synthesis || null;
  if (!synthesis) {
    return {
      present: false,
      status: 'skipped',
      why: 'Full-seat synthesis was not requested for this turn.',
      details: { profile: null, policy: runtimeReceipt.provider?.lin_harmony_policy || 'intent_routed' },
    };
  }

  const seats = Array.isArray(synthesis.seats) ? synthesis.seats : [];
  const requiredSeats = new Set(['coding', 'creative', 'conversational']);
  const presentSeats = new Set(seats.map((item) => item?.seat).filter(Boolean));
  const missingSeats = [...requiredSeats].filter((seat) => !presentSeats.has(seat));
  const failedSeats = seats.filter((item) => item?.status === 'fail' || item?.status === 'failed' || item?.status === 'timeout');
  const weakSeats = seats.filter((item) => {
    const summary = String(item?.summary || '').trim();
    return item?.status === 'warn' || !summary;
  });
  const final = synthesis.final || {};
  const finalFailed = final.status === 'fail' || final.status === 'failed' || final.status === 'timeout';

  if (failedSeats.length > 0 || finalFailed || synthesis.status === 'fail') {
    return {
      present: true,
      status: 'fail',
      why: 'Full-seat synthesis reported a failed seat or final synthesis step.',
      details: {
        profile: synthesis.profile || 'full_seat_synthesis',
        policy: synthesis.policy || runtimeReceipt.provider?.lin_harmony_policy || 'full_seat_synthesis',
        canon: synthesis.canon || runtimeReceipt.provider?.lin_seat_canon || null,
        seats,
        final,
        assignment: synthesis.assignment || null,
        assignmentContractReceived: Boolean(synthesis.assignment_contract_received || synthesis.assignment?.final_prompt_received_contract),
        missingSeats,
        totalDurationMs: synthesis.total_duration_ms || 0,
      },
    };
  }

  if (missingSeats.length > 0 || seats.length < requiredSeats.size || !final.model) {
    return {
      present: true,
      status: 'warn',
      why: `Full-seat synthesis ran, but the receipt is missing ${missingSeats.length ? missingSeats.join(', ') : 'final synthesis'} metadata.`,
      details: {
        profile: synthesis.profile || 'full_seat_synthesis',
        policy: synthesis.policy || runtimeReceipt.provider?.lin_harmony_policy || 'full_seat_synthesis',
        canon: synthesis.canon || runtimeReceipt.provider?.lin_seat_canon || null,
        seats,
        final,
        assignment: synthesis.assignment || null,
        assignmentContractReceived: Boolean(synthesis.assignment_contract_received || synthesis.assignment?.final_prompt_received_contract),
        missingSeats,
        totalDurationMs: synthesis.total_duration_ms || 0,
      },
    };
  }

  if (weakSeats.length > 0 || synthesis.status === 'warn') {
    return {
      present: true,
      status: 'warn',
      why: `Full-seat synthesis ran, but ${weakSeats.length} seat summary${weakSeats.length === 1 ? ' was' : 'ies were'} incomplete or warned.`,
      details: {
        profile: synthesis.profile || 'full_seat_synthesis',
        policy: synthesis.policy || runtimeReceipt.provider?.lin_harmony_policy || 'full_seat_synthesis',
        canon: synthesis.canon || runtimeReceipt.provider?.lin_seat_canon || null,
        seats,
        final,
        assignment: synthesis.assignment || null,
        assignmentContractReceived: Boolean(synthesis.assignment_contract_received || synthesis.assignment?.final_prompt_received_contract),
        missingSeats: [],
        weakSeats: weakSeats.map((seat) => seat?.seat).filter(Boolean),
        totalDurationMs: synthesis.total_duration_ms || 0,
      },
    };
  }

  return {
    present: true,
    status: 'pass',
    why: 'Intelligence, Ingenuity, Interaction, and final synthesis steps completed for this response.',
    details: {
      profile: synthesis.profile || 'full_seat_synthesis',
      policy: synthesis.policy || runtimeReceipt.provider?.lin_harmony_policy || 'full_seat_synthesis',
      canon: synthesis.canon || runtimeReceipt.provider?.lin_seat_canon || null,
      seats,
      final,
      assignment: synthesis.assignment || null,
      assignmentContractReceived: Boolean(synthesis.assignment_contract_received || synthesis.assignment?.final_prompt_received_contract),
      missingSeats: [],
      totalDurationMs: synthesis.total_duration_ms || 0,
    },
  };
}

function summarizeAssignmentQa(runtimeReceipt = {}, validatorDebug = {}) {
  const assignmentQa = runtimeReceipt.assignment_qa || validatorDebug.assignment_qa || null;
  if (!assignmentQa) {
    return {
      present: false,
      status: 'skipped',
      why: 'No assignment QA profile was active for this turn.',
      details: {
        assignmentProfile: null,
        ownerFile: 'server/lib/assignmentQaGuard.js',
        sourceAnchor: 'server/lib/assignmentQaGuard.js:evaluateAssignmentQa',
      },
    };
  }

  const status = assignmentQa.status === 'fail'
    ? 'fail'
    : assignmentQa.status === 'warn'
      ? 'warn'
      : 'pass';
  const reasons = Array.isArray(assignmentQa.reasons) ? assignmentQa.reasons : [];
  const expectedTask = assignmentQa.expectedTask || 'Assignment QA turn contract.';

  return {
    present: true,
    status,
    why: status === 'fail'
      ? `Assignment QA failed${reasons.length ? `: ${reasons[0]}` : '.'}`
      : status === 'warn'
        ? `Assignment QA passed with warning${reasons.length ? `: ${reasons[0]}` : '.'}`
        : 'Assignment QA passed before canonical persistence.',
    details: {
      assignmentProfile: assignmentQa.assignmentProfile || assignmentQa.profile || null,
      expectedTurn: assignmentQa.expectedTurn ?? null,
      expectedTask,
      status: assignmentQa.status || status,
      reasons,
      signals: assignmentQa.signals || [],
      evidencePacketCount: Number(assignmentQa.evidencePacketCount ?? 0),
      repairAttempted: Boolean(assignmentQa.repair_attempted || assignmentQa.repair?.attempted),
      repairApplied: Boolean(assignmentQa.repair_applied || assignmentQa.repair?.applied),
      deterministicAssignmentFallbackAttempted: Boolean(assignmentQa.repair?.deterministic_assignment_fallback_attempted),
      deterministicAssignmentFallbackApplied: Boolean(assignmentQa.repair?.deterministic_assignment_fallback_applied),
      repair: assignmentQa.repair || null,
      finalAnswerSource: assignmentQa.final_answer_source || assignmentQa.repair?.final_answer_source || null,
      identityFailureReasons: assignmentQa.identity_failure_reasons || assignmentQa.repair?.identity_failure_reasons || [],
      assignmentFailureReasons: assignmentQa.assignment_failure_reasons || assignmentQa.repair?.assignment_failure_reasons || [],
      responsibleSubsystem: 'assignment_qa_guard',
      ownerFile: assignmentQa.ownerFile || assignmentQa.owner_file || 'server/lib/assignmentQaGuard.js',
      sourceAnchor: assignmentQa.sourceAnchor || assignmentQa.source_anchor || 'server/lib/assignmentQaGuard.js:evaluateAssignmentQa',
      persistCanonical: assignmentQa.persist_canonical ?? assignmentQa.persistCanonical ?? status !== 'fail',
    },
  };
}

function summarizeResearchWorkflow(runtimeReceipt = {}) {
  const research = runtimeReceipt.research || null;
  if (!research?.requested) return [];

  const steps = research.steps && typeof research.steps === 'object' ? research.steps : {};
  return RESEARCH_WORKFLOW_STEPS.map((definition) => {
    const item = steps[definition.id] || {};
    const status = ['pass', 'warn', 'fail', 'skipped'].includes(item.status) ? item.status : 'warn';
    return stage(
      definition.id,
      definition.label,
      status,
      item.why || `Research workflow checkpoint ${definition.id} did not report a reason.`,
      item.sourceAnchor || definition.sourceAnchor || OWNERS.researchWorkflow,
      {
        command: research.command || 'research',
        profile: research.profile || 'research_workflow.v1',
        researchStatus: research.status || null,
        mode: research.mode || null,
        evidencePacketCount: Number(research.evidencePacketCount || 0),
        webSearchRan: Boolean(research.webSearchRan),
        boundedEvidenceRequest: Boolean(research.boundedEvidenceRequest),
        selectedSourceCount: Number(research.selectedSourceCount || 0),
        sourceAgreement: research.sourceAgreement || null,
        credibilityGradingRan: Boolean(research.credibilityGradingRan),
        citationExtractionRan: Boolean(research.citationExtractionRan),
        collegeStructure: research.collegeStructure || null,
        finalWordCount: Number(research.finalWordCount || 0),
        ownerFile: item.ownerFile || definition.ownerFile,
        sourceAnchor: item.sourceAnchor || definition.sourceAnchor,
        ...(item.details && typeof item.details === 'object' ? item.details : {}),
      },
    );
  });
}

function summarizePostGuard(validatorDebug = {}, runtimeReceipt = {}) {
  const fidelity = runtimeReceipt.fidelity || {};
  const identityCoherence = fidelity.identity_coherence || validatorDebug.identity_coherence || {};
  const flags = {
    identity_drift_detected: Boolean(validatorDebug.identity_drift_detected || fidelity.identity_drift_detected),
    identity_rewrite_applied: Boolean(validatorDebug.identity_rewrite_applied || fidelity.identity_rewrite_applied),
    identity_fallback_applied: Boolean(validatorDebug.identity_fallback_applied || fidelity.identity_fallback_applied),
    cutoff_violation_detected: Boolean(validatorDebug.cutoff_violation_detected),
    rewrite_applied: Boolean(validatorDebug.rewrite_applied),
    capability_violations: validatorDebug.capability_violations || [],
    identity_coherence_status: identityCoherence.status || null,
    identity_coherence_repair_attempted: Boolean(identityCoherence.repair_attempted),
    identity_coherence_repair_applied: Boolean(identityCoherence.repair_applied),
    deterministic_policy_fallback_attempted: Boolean(identityCoherence.deterministic_policy_fallback_attempted),
    deterministic_policy_fallback_applied: Boolean(identityCoherence.deterministic_policy_fallback_applied),
    deterministic_construct_fallback_attempted: Boolean(identityCoherence.deterministic_construct_fallback_attempted),
    deterministic_construct_fallback_applied: Boolean(identityCoherence.deterministic_construct_fallback_applied),
    final_answer_source: identityCoherence.final_answer_source || validatorDebug.final_answer_source || null,
  };
  const corrected = Boolean(
    flags.identity_coherence_repair_applied ||
    flags.identity_rewrite_applied ||
    flags.identity_fallback_applied ||
    flags.rewrite_applied ||
    flags.deterministic_policy_fallback_applied ||
    flags.deterministic_construct_fallback_applied
  );
  const unresolved = Boolean(
    (Array.isArray(flags.capability_violations) && flags.capability_violations.length > 0) ||
    (flags.identity_coherence_status && flags.identity_coherence_status !== 'pass') ||
    (flags.identity_drift_detected && !corrected) ||
    (flags.cutoff_violation_detected && !flags.rewrite_applied)
  );
  return {
    status: unresolved ? 'warn' : 'pass',
    why: unresolved
      ? 'A post-response guard detected remaining drift/recital/capability risk after correction.'
      : corrected
        ? 'A post-response guard corrected drift before persistence; the repaired final answer is the canonical reply.'
        : 'No post-response drift correction was reported.',
    details: flags,
  };
}

function summarizeIdentityCoherence(validatorDebug = {}, runtimeReceipt = {}) {
  const fidelity = runtimeReceipt.fidelity || {};
  const coherence = fidelity.identity_coherence || validatorDebug.identity_coherence || null;

  if (!coherence) {
    return {
      status: 'skipped',
      why: 'Identity/coherence grading did not report a result.',
      details: {
        status: 'missing',
        ownerFile: 'server/lib/identityCoherenceGuard.js',
        sourceAnchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
      },
    };
  }

  const status = coherence.status === 'fail'
    ? 'fail'
    : coherence.status === 'warn'
      ? 'warn'
      : 'pass';
  const reasons = Array.isArray(coherence.reasons) ? coherence.reasons : [];
  const repairAttempted = Boolean(coherence.repair_attempted || coherence.repair?.attempted);
  const repairApplied = Boolean(coherence.repair_applied || coherence.repair?.applied);
  const deterministicPolicyFallbackAttempted = Boolean(
    coherence.deterministic_policy_fallback_attempted ||
    coherence.deterministic_policy_fallback?.attempted
  );
  const deterministicPolicyFallbackApplied = Boolean(
    coherence.deterministic_policy_fallback_applied ||
    coherence.deterministic_policy_fallback?.applied
  );
  const deterministicConstructFallbackAttempted = Boolean(
    coherence.deterministic_construct_fallback_attempted ||
    coherence.deterministic_construct_fallback?.attempted
  );
  const deterministicConstructFallbackApplied = Boolean(
    coherence.deterministic_construct_fallback_applied ||
    coherence.deterministic_construct_fallback?.applied
  );
  const blocked = Boolean(coherence.blocked_canonical_persistence);

  return {
    status,
    why: status === 'fail'
      ? `Identity/coherence failed${reasons.length ? `: ${reasons[0]}` : '.'}`
        : status === 'warn'
          ? `Identity/coherence passed with warning${reasons.length ? `: ${reasons[0]}` : '.'}`
          : deterministicPolicyFallbackApplied
            ? 'Identity/coherence passed after deterministic runtime-policy fallback; only the final fallback reply is eligible for persistence.'
          : deterministicConstructFallbackApplied
            ? 'Identity/coherence passed after deterministic construct-boundary fallback; only the final fallback reply is eligible for persistence.'
          : repairApplied
            ? 'Identity/coherence passed after one repair; only the repaired reply is eligible for persistence.'
            : 'Identity/coherence passed before persistence.',
    details: {
      status: coherence.status || status,
      identityStatus: coherence.identity_status || coherence.identityStatus || null,
      coherenceStatus: coherence.coherence_status || coherence.coherenceStatus || null,
      reasons,
      signals: coherence.signals || [],
      violations: coherence.violations || [],
      repairable: Boolean(coherence.repairable),
      repairAttempted,
      repairApplied,
      deterministicPolicyFallbackAttempted,
      deterministicPolicyFallbackApplied,
      deterministicConstructFallbackAttempted,
      deterministicConstructFallbackApplied,
      finalAnswerSource: coherence.final_answer_source || null,
      blockedCanonicalPersistence: blocked,
      persistCanonical: coherence.persist_canonical ?? !blocked,
      responsibleSubsystem: 'identity_coherence_guard',
      ownerFile: coherence.owner_file || coherence.ownerFile || 'server/lib/identityCoherenceGuard.js',
      sourceAnchor: coherence.source_anchor || coherence.sourceAnchor || 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
      repair: coherence.repair || null,
      deterministicPolicyFallback: coherence.deterministic_policy_fallback || null,
      deterministicConstructFallback: coherence.deterministic_construct_fallback || null,
    },
  };
}

function summarizeTranscriptLawGovernance(validatorDebug = {}, runtimeReceipt = {}) {
  const fidelity = runtimeReceipt.fidelity || {};
  const governance = fidelity.transcript_law_governance || validatorDebug.transcript_law_governance || null;

  if (!governance || governance.requested_fact === null || governance.requested_fact === undefined) {
    return {
      present: false,
      status: 'skipped',
      why: 'No transcript-law governance profile was active for this turn.',
      details: {
        requestedFact: null,
        ownerFile: 'server/lib/identityCoherenceGuard.js',
        sourceAnchor: 'server/lib/identityCoherenceGuard.js:evaluateTranscriptLawGovernance',
      },
    };
  }

  const status = governance.status === 'fail'
    ? 'fail'
    : governance.status === 'warn'
      ? 'warn'
      : 'pass';
  const reasons = Array.isArray(governance.reasons) ? governance.reasons : [];
  const repairAttempted = Boolean(governance.repair_attempted || governance.repair?.attempted);
  const repairApplied = Boolean(governance.repair_applied || governance.repair?.applied);
  const blocked = Boolean(governance.blocked_canonical_persistence);

  return {
    present: true,
    status,
    why: status === 'fail'
      ? `Transcript-law governance failed${reasons.length ? `: ${reasons[0]}` : '.'}`
      : repairApplied
        ? 'Transcript-law governance passed after source-grounded repair; only the final repaired reply is eligible for persistence.'
        : 'Transcript-law governance passed with transcript/capsule grounding before persistence.',
    details: {
      status: governance.status || status,
      requestedFact: governance.requested_fact || null,
      reasons,
      signals: governance.signals || [],
      groundingVerdict: governance.grounding_verdict || null,
      evidenceSources: governance.evidence_sources || [],
      transcriptMemoryStatus: governance.transcript_memory_status || null,
      voiceExemplarCount: Number(governance.voice_exemplar_count || 0),
      voiceExemplarSources: governance.voice_exemplar_sources || [],
      capsuleSource: governance.capsule_source || null,
      capsuleLoaded: Boolean(governance.capsule_loaded),
      sourceGrounded: Boolean(governance.source_grounded),
      repairAttempted,
      repairApplied,
      repair: governance.repair || null,
      finalAnswerSource: governance.final_answer_source || null,
      blockedCanonicalPersistence: blocked,
      persistCanonical: governance.persist_canonical ?? !blocked,
      groundingSubsystem: 'transcript_law_governance_guard',
      ownerFile: governance.owner_file || 'server/lib/identityCoherenceGuard.js',
      sourceAnchor: governance.source_anchor || 'server/lib/identityCoherenceGuard.js:evaluateTranscriptLawGovernance',
    },
  };
}

function summarizeContinuityRestored(runtimeReceipt = {}) {
  const continuity = runtimeReceipt.continuity || {};
  const continuityExpected = continuity.continuityExpected === true;
  const continuityRestored = continuity.continuityRestored === true;
  const present =
    continuityExpected ||
    continuityRestored ||
    Boolean(continuity.continuedFromTurnId) ||
    runtimeReceipt.continuedFromTurnId != null;

  if (!present) {
    return {
      status: 'skipped',
      why: 'No continuity resume contract was active for this turn.',
      details: {
        continuityExpected: false,
        continuityRestored: false,
        continuedFromTurnId: null,
        continuitySource: 'none',
        hydration: null,
        hydrationComplete: null,
        integrityStatus: null,
        integrityReasons: [],
      },
    };
  }

  const integrityStatus = continuity.integrityStatus || continuity.integrity_status || null;
  const integrityReasons = Array.isArray(continuity.integrityReasons)
    ? continuity.integrityReasons
    : Array.isArray(continuity.integrity_reasons)
      ? continuity.integrity_reasons
      : [];
  const failed =
    continuityRestored !== true ||
    !continuity.continuedFromTurnId ||
    integrityStatus === 'fail';

  return {
    status: failed ? 'fail' : 'pass',
    why: failed
      ? continuityRestored !== true
        ? 'Continuity resume was requested but not restored from the canonical assistant tail.'
        : integrityStatus === 'fail'
          ? `Continuity restored, but resumed-turn integrity failed${integrityReasons[0] ? `: ${integrityReasons[0]}` : '.'}`
          : 'Continuity restored, but the canonical assistant tail anchor was missing.'
      : 'Continuity resumed from the canonical assistant tail without greeting/orientation drift.',
    details: {
      continuityExpected,
      continuityRestored,
      continuedFromTurnId: continuity.continuedFromTurnId || runtimeReceipt.continuedFromTurnId || null,
      continuitySource: continuity.continuitySource || runtimeReceipt.continuitySource || 'none',
      hydration: continuity.hydration || null,
      hydrationComplete:
        typeof continuity.hydrationComplete === 'boolean' ? continuity.hydrationComplete : null,
      continuitySeq:
        typeof continuity.continuitySeq === 'number' ? continuity.continuitySeq : null,
      staleSeatRejected: continuity.staleSeatRejected === true,
      integrityStatus,
      integrityReasons,
    },
  };
}

function summarizeTranscriptLawEvidence(runtimeReceipt = {}) {
  const transcriptTruth = runtimeReceipt.transcript_truth || {};
  const retrievalStatus = transcriptTruth.retrieval_status || transcriptTruth.retrievalStatus || null;

  if (!retrievalStatus || retrievalStatus === 'not_required') {
    return {
      status: 'skipped',
      why: 'Canonical transcript-truth evidence was not required for this turn.',
      details: {
        transcriptTruthSource: transcriptTruth.source || null,
        retrievalStatus: retrievalStatus || 'not_required',
        evidenceCount: Number(transcriptTruth.evidence_count || transcriptTruth.evidenceCount || 0),
        evidenceSources: transcriptTruth.evidence_sources || transcriptTruth.evidenceSources || [],
        fallbackHydrationRejected: transcriptTruth.fallback_rejected === true,
        hydrationComplete:
          typeof transcriptTruth.hydration_complete === 'boolean'
            ? transcriptTruth.hydration_complete
            : transcriptTruth.hydrationComplete ?? null,
      },
    };
  }

  const passed =
    transcriptTruth.eligible === true &&
    transcriptTruth.source === 'full' &&
    transcriptTruth.fallback_rejected !== true;

  return {
    status: passed ? 'pass' : 'fail',
    why: passed
      ? 'Canonical transcript truth was verified before generation and fallback hydration was explicitly rejected.'
      : `Canonical transcript truth was not strong enough for generation${transcriptTruth.blocked_reason ? `: ${transcriptTruth.blocked_reason}` : '.'}`,
    details: {
      transcriptTruthSource: transcriptTruth.source || null,
      retrievalStatus,
      evidenceCount: Number(transcriptTruth.evidence_count || transcriptTruth.evidenceCount || 0),
      evidenceSources: transcriptTruth.evidence_sources || transcriptTruth.evidenceSources || [],
      exactThreadId: transcriptTruth.exact_thread_id || transcriptTruth.exactThreadId || null,
      exactThreadFound: transcriptTruth.exact_thread_found === true,
      assistantTailFound: transcriptTruth.assistant_tail_found === true,
      runtimeStateFound: transcriptTruth.runtime_state_found === true,
      runtimeStateHydrationTruth:
        transcriptTruth.runtime_state_hydration_truth || transcriptTruth.runtimeStateHydrationTruth || null,
      hydrationComplete:
        typeof transcriptTruth.hydration_complete === 'boolean'
          ? transcriptTruth.hydration_complete
          : transcriptTruth.hydrationComplete ?? null,
      fallbackHydrationRejected: transcriptTruth.fallback_rejected === true,
      blockedReason: transcriptTruth.blocked_reason || transcriptTruth.blockedReason || null,
    },
  };
}

function summarizeCapsuleRuntimeEvidence(runtimeReceipt = {}, enrichedContext = {}) {
  const capsuleRuntime = runtimeReceipt.capsule_runtime || {};
  const contextProfile =
    capsuleRuntime.context_profile ||
    capsuleRuntime.contextProfile ||
    runtimeReceipt.memory?.context_profile ||
    enrichedContext.context_profile ||
    enrichedContext.context_budget?.profile ||
    null;
  const hasShape =
    Object.prototype.hasOwnProperty.call(capsuleRuntime, 'capsuleLoaded') ||
    Object.prototype.hasOwnProperty.call(capsuleRuntime, 'capsuleSource') ||
    contextProfile !== null;

  if (!hasShape) {
    return {
      status: 'skipped',
      why: 'Capsule/runtime evidence was not captured for this turn.',
      details: {
        capsuleLoaded: null,
        capsuleSource: null,
        contextProfile: null,
        continuityFromRuntimeState: null,
      },
    };
  }

  const capsuleLoaded =
    typeof capsuleRuntime.capsuleLoaded === 'boolean'
      ? capsuleRuntime.capsuleLoaded
      : null;
  const continuityFromRuntimeState =
    capsuleRuntime.continuity_from_runtime_state === true ||
    capsuleRuntime.continuityFromRuntimeState === true;

  return {
    status: contextProfile ? 'pass' : 'warn',
    why: contextProfile
      ? 'Capsule/runtime grounding was captured with bounded context metadata for this turn.'
      : 'Capsule/runtime grounding shape exists, but the bounded context profile was missing.',
    details: {
      capsuleLoaded,
      capsuleSource: capsuleRuntime.capsuleSource || capsuleRuntime.capsule_source || null,
      contextProfile,
      continuityFromRuntimeState,
      continuityMemorySource:
        capsuleRuntime.continuity_memory_source ||
        capsuleRuntime.continuityMemorySource ||
        runtimeReceipt.memory?.memory_source ||
        null,
    },
  };
}

function summarizePersistence(runtimeReceipt = {}, skipPersistence = true, threadId = null) {
  const persistence = runtimeReceipt.persistence || null;
  const persistenceOwner = runtimeReceipt.persistence_owner || (skipPersistence ? 'layout' : 'server');
  const normalizedStatus = String(persistence?.status || '').toLowerCase();

  if (normalizedStatus === 'fail' || normalizedStatus === 'error' || normalizedStatus === 'timeout') {
    return {
      status: 'fail',
      why: persistence?.message || persistence?.error || 'Transcript persistence did not complete.',
      details: {
        threadId,
        skipPersistence: false,
        persistenceOwner,
        code: persistence?.code || null,
        reason: persistence?.reason || null,
        timeoutMs: persistence?.timeout_ms || null,
        bounded: Boolean(persistence?.bounded),
        stage: persistence?.stage || null,
        attempted: persistence?.attempted ?? true,
        partialWriteRisk: Boolean(persistence?.partial_write_risk),
        roles: Array.isArray(persistence?.roles) ? persistence.roles : [],
        canonicalTarget: persistence?.canonical_target || null,
        canonicalTargetTable: persistence?.canonical_target_table || null,
        routeSideCanonicalFailoverAvailable: persistence?.route_side_canonical_failover_available ?? null,
        routeSideCanonicalFailoverReason: persistence?.route_side_canonical_failover_reason || null,
        connectorFallbackStorage: persistence?.connector_fallback_storage || null,
        connectorFallbackCountsAsCanonical: persistence?.connector_fallback_counts_as_canonical ?? null,
        failureClassification: persistence?.failure_classification || null,
        upstreamWriteBlocked: persistence?.upstream_write_blocked ?? null,
      },
    };
  }

  if (skipPersistence || normalizedStatus === 'skipped') {
    return {
      status: 'skipped',
      why: `${persistenceOwner || 'Layout'} owns visible Chatty/VVAULT transcript persistence.`,
      details: {
        threadId,
        skipPersistence: true,
        persistenceOwner,
        code: persistence?.code || null,
        reason: persistence?.reason || null,
        canonicalTarget: persistence?.canonical_target || null,
        canonicalTargetTable: persistence?.canonical_target_table || null,
        routeSideCanonicalFailoverAvailable: persistence?.route_side_canonical_failover_available ?? null,
        routeSideCanonicalFailoverReason: persistence?.route_side_canonical_failover_reason || null,
        connectorFallbackStorage: persistence?.connector_fallback_storage || null,
        connectorFallbackCountsAsCanonical: persistence?.connector_fallback_counts_as_canonical ?? null,
      },
    };
  }

  return {
    status: 'pass',
    why: 'Server-side transcript persistence was enabled for this response.',
    details: {
      threadId,
      skipPersistence: false,
      persistenceOwner,
      code: persistence?.code || null,
      reason: persistence?.reason || null,
      timeoutMs: persistence?.timeout_ms || null,
      bounded: Boolean(persistence?.bounded),
      stage: persistence?.stage || null,
      attempted: persistence?.attempted ?? true,
      roles: Array.isArray(persistence?.roles) ? persistence.roles : [],
      canonicalTarget: persistence?.canonical_target || null,
      canonicalTargetTable: persistence?.canonical_target_table || null,
      routeSideCanonicalFailoverAvailable: persistence?.route_side_canonical_failover_available ?? null,
      routeSideCanonicalFailoverReason: persistence?.route_side_canonical_failover_reason || null,
      connectorFallbackStorage: persistence?.connector_fallback_storage || null,
      connectorFallbackCountsAsCanonical: persistence?.connector_fallback_counts_as_canonical ?? null,
    },
  };
}

function isCanonicalContinuationTurn(runtimeReceipt = {}) {
  const continuity = runtimeReceipt.continuity || {};
  return (
    continuity.continuityExpected === true ||
    continuity.continuityRestored === true
  );
}

function requireStageForCanonicalContinuation(stageResult, stageId, canonicalContinuation) {
  if (!canonicalContinuation || stageResult?.status !== 'skipped') {
    return stageResult;
  }

  switch (stageId) {
    case 'continuity_restored':
      return {
        ...stageResult,
        status: 'fail',
        why: 'Canonical continuation cannot skip continuity restoration evidence.',
      };
    case 'transcript_law_evidence':
      return {
        ...stageResult,
        status: 'fail',
        why: 'Canonical continuation cannot skip transcript-law evidence.',
      };
    case 'capsule_runtime_evidence':
      return {
        ...stageResult,
        status: 'fail',
        why: 'Canonical continuation cannot skip capsule/runtime evidence.',
      };
    default:
      return stageResult;
  }
}

export function buildOrchestrationChecklist({
  userId,
  user,
  constructId,
  threadId,
  userMessage,
  gptConfig = {},
  enrichedContext = {},
  retrievalDiagnostics = {},
  promptDiagnostics = {},
  providerTrace = {},
  validatorDebug = {},
  runtimeReceipt = {},
  contextMode = 'unknown',
  relationalTurn = false,
  lowComplexityTurn = false,
  hasImages = false,
  skipPersistence = true,
  previewMode = false,
  requestedConstructId = null,
  canonicalConstructId = null,
  responseStatus = 'success',
} = {}) {
  gptConfig = gptConfig || {};
  const stages = [];
  const identityPhase = enrichedContext.phaseTiming?.identity || {};
  const mode = resolveMode(gptConfig);
  const capabilityManifest = enrichedContext.capabilityManifest || {};
  const capabilityEnabled = capabilityManifest.enabled || {};
  const selfpromptOn = Boolean(capabilityManifest.state?.selfpromptOn || capabilityEnabled.selfprompt);
  const memory = summarizeMemory(enrichedContext, retrievalDiagnostics);
  assertMemoryOwnerReceipt(enrichedContext, runtimeReceipt);
  const knowledge = summarizeKnowledge(enrichedContext);
  const runtimePolicy = summarizeRuntimePolicy(enrichedContext, runtimeReceipt);
  const cognitionPolicy = summarizeCognitionPolicy(enrichedContext, runtimeReceipt);
  const modelSynthesis = summarizeModelSynthesis(runtimeReceipt);
  const researchWorkflowStages = summarizeResearchWorkflow(runtimeReceipt);
  const assignmentQa = summarizeAssignmentQa(runtimeReceipt, validatorDebug);
  const postGuard = summarizePostGuard(validatorDebug, runtimeReceipt);
  const identityCoherence = summarizeIdentityCoherence(validatorDebug, runtimeReceipt);
  const transcriptLawGovernance = summarizeTranscriptLawGovernance(validatorDebug, runtimeReceipt);
  const canonicalContinuationTurn = isCanonicalContinuationTurn(runtimeReceipt);
  const continuityRestoredStage = requireStageForCanonicalContinuation(
    summarizeContinuityRestored(runtimeReceipt),
    'continuity_restored',
    canonicalContinuationTurn,
  );
  const transcriptMemoryStage =
    canonicalContinuationTurn &&
    continuityRestoredStage.status === 'pass' &&
    memory.status === 'skipped'
      ? {
          status: 'pass',
          why: 'Transcript continuity was restored from the canonical assistant tail runtimeTurnState; no broad memory retrieval was needed.',
          details: {
            ...memory.details,
            continuitySource: continuityRestoredStage.details.continuitySource,
            continuedFromTurnId: continuityRestoredStage.details.continuedFromTurnId,
            continuitySeq: continuityRestoredStage.details.continuitySeq,
            hydration: continuityRestoredStage.details.hydration,
            hydrationComplete: continuityRestoredStage.details.hydrationComplete,
          },
        }
      : memory;
  const transcriptLawEvidenceStage = requireStageForCanonicalContinuation(
    summarizeTranscriptLawEvidence(runtimeReceipt),
    'transcript_law_evidence',
    canonicalContinuationTurn,
  );
  const capsuleRuntimeEvidenceStage = requireStageForCanonicalContinuation(
    summarizeCapsuleRuntimeEvidence(runtimeReceipt, enrichedContext),
    'capsule_runtime_evidence',
    canonicalContinuationTurn,
  );
  const persistence = summarizePersistence(runtimeReceipt, skipPersistence, threadId);
  const providerFinal = providerTrace.final_provider || runtimeReceipt.provider?.final_provider || runtimeReceipt.provider?.provider || null;
  const providerModel = runtimeReceipt.provider?.model || gptConfig.model || gptConfig.modelId || null;
  const providerStageDetails = runtimeReceipt.provider || {};
  const providerFallbackUsed = Boolean(providerTrace.fallback_used || runtimeReceipt.provider?.fallback_used);

  stages.push(stage(
    'auth',
    'Auth',
    userId ? 'pass' : 'fail',
    userId
      ? `Authenticated as ${clean(runtimeReceipt.auth?.auth_email || user?.email || userId)}; data owner ${clean(runtimeReceipt.auth?.data_owner_user_id || userId)}.`
      : 'No authenticated user id reached the response path.',
    OWNERS.auth,
    {
      userId: userId || null,
      email: user?.email || null,
      authEmail: runtimeReceipt.auth?.auth_email || user?.email || null,
      authProvider: runtimeReceipt.auth?.auth_provider || user?.auth_provider || null,
      authSource: runtimeReceipt.auth?.auth_source || null,
      authUserId: runtimeReceipt.auth?.auth_user_id || null,
      supabaseSessionUserId: runtimeReceipt.auth?.supabase_session_user_id || null,
      dataOwnerUserId: runtimeReceipt.auth?.data_owner_user_id || userId || null,
      dataOwnerSource: runtimeReceipt.auth?.data_owner_source || null,
      memoryLookupUserId: runtimeReceipt.auth?.memory_lookup_user_id || userId || null,
      devAuthFallback: Boolean(runtimeReceipt.auth?.dev_auth_fallback),
      devDataOwnerOverride: Boolean(runtimeReceipt.auth?.dev_data_owner_override),
      dataOwnerMatchesAuth: runtimeReceipt.auth?.data_owner_matches_auth ?? null,
      canonicalConstructOwner: runtimeReceipt.auth?.canonical_construct_owner || null,
      canonicalConstructOwnerApplied: Boolean(runtimeReceipt.auth?.canonical_construct_owner?.applied),
    },
  ));

  stages.push(stage(
    'construct_identity',
    'Construct Identity',
    identityPhase.source === 'error' ? 'fail' : identityPhase.source ? 'pass' : 'warn',
    identityPhase.source === 'error'
      ? `Identity load failed: ${identityPhase.error || 'unknown error'}`
      : `Identity source: ${identityPhase.source || 'unknown'}.`,
    OWNERS.identity,
    {
      constructId,
      effectiveConstructId: runtimeReceipt.effective_construct_id || runtimeReceipt.identity?.effective_construct_id || constructId,
      effectiveConstructName: runtimeReceipt.effective_construct_name || runtimeReceipt.identity?.effective_construct_name || gptConfig.name || null,
      identitySource: identityPhase.source || 'unknown',
      basePromptSource: enrichedContext.phaseTiming?.basePromptSource || promptDiagnostics.base_prompt_source || 'unknown',
      conditioningInjected: Boolean(enrichedContext.phaseTiming?.conditioningInjected || promptDiagnostics.conditioning_appended),
      identityBundleHash: runtimeReceipt.identity?.identity_bundle_hash || enrichedContext.identity_bundle_hash || null,
      preflight: runtimeReceipt.identity?.preflight || null,
    },
  ));

  if (previewMode) {
    const previewReceipt = runtimeReceipt.preview || {};
    const effectiveConstructId = previewReceipt.effective_construct_id || constructId;
    const selectedConstructId = previewReceipt.selected_construct_id || canonicalConstructId || constructId;
    const basePromptSource = previewReceipt.base_prompt_source || enrichedContext.phaseTiming?.basePromptSource || promptDiagnostics.base_prompt_source || 'unknown';
    const suppressedOverride = Boolean(previewReceipt.suppressed_system_prompt_override || enrichedContext.phaseTiming?.preview?.suppressedSystemPromptOverride);
    const identityMismatch = Boolean(selectedConstructId && effectiveConstructId && selectedConstructId !== effectiveConstructId);
    const overrideReplacedIdentity = basePromptSource === 'systemPromptOverride';
    stages.push(stage(
      'preview_identity',
      'Preview Identity Truth',
      identityMismatch || overrideReplacedIdentity ? 'fail' : suppressedOverride ? 'warn' : 'pass',
      identityMismatch
        ? `Preview selected ${selectedConstructId}, but runtime answered as ${effectiveConstructId}.`
        : overrideReplacedIdentity
          ? 'Preview identity was replaced by systemPromptOverride.'
          : suppressedOverride
            ? 'Canonical construct identity won; a legacy preview systemPromptOverride was suppressed.'
            : 'Preview identity is receipt-backed by the canonical construct identity.',
      OWNERS.previewIdentity,
      {
        previewMode: true,
        requestedConstructId: requestedConstructId || previewReceipt.raw_construct_id || null,
        selectedConstructId,
        effectiveConstructId,
        identitySource: previewReceipt.identity_source || identityPhase.source || 'unknown',
        basePromptSource,
        draftOverlayApplied: Boolean(previewReceipt.draft_overlay_applied || enrichedContext.phaseTiming?.preview?.draftOverlayApplied),
        draftOverlayKeys: previewReceipt.draft_overlay_keys || enrichedContext.phaseTiming?.preview?.draftOverlayKeys || [],
        previewOverlayState: previewReceipt.preview_overlay_state || (previewReceipt.draft_overlay_applied ? 'applied_bounded_overlay' : 'not_applied'),
        suppressedSystemPromptOverride: suppressedOverride,
        skipPersistence: Boolean(skipPersistence),
      },
    ));
  }

  stages.push(stage(
    'orchestration_mode',
    'Orchestration Mode',
    constructId ? 'pass' : 'fail',
    isLinOrchestratedConstruct(constructId)
      ? `Effective route is Lin-orchestrated; active construct remains ${constructId}.`
      : `Effective orchestration mode is ${mode}.`,
    OWNERS.orchestration,
    {
      configuredMode: mode,
      routeMode: runtimeReceipt.route_mode || 'vvault_message',
      linOrchestrated: isLinOrchestratedConstruct(constructId),
      activeConstruct: constructId,
      effectiveConstructId: runtimeReceipt.effective_construct_id || constructId,
      identityPreserved: (runtimeReceipt.effective_construct_id || constructId) === constructId,
    },
  ));

  stages.push(stage(
    'cognition_policy',
    'Cognition Policy',
    cognitionPolicy.status,
    cognitionPolicy.why,
    cognitionPolicy.details.sourceAnchor || OWNERS.cognition,
    cognitionPolicy.details,
  ));

  stages.push(stage(
    'capabilities_selfprompt',
    'Capabilities / Selfprompt',
    capabilityEnabled.proactiveInitiation
      ? (selfpromptOn ? 'pass' : 'skipped')
      : 'skipped',
    capabilityEnabled.proactiveInitiation
      ? (selfpromptOn
          ? 'Proactive initiation is enabled and selfprompt is on for this thread.'
          : 'Proactive initiation is available for this construct, but inactive on this thread.')
      : 'Proactive initiation is disabled by capability manifest.',
    capabilityEnabled.proactiveInitiation ? OWNERS.selfprompt : OWNERS.capabilities,
    {
      proactiveInitiation: Boolean(capabilityEnabled.proactiveInitiation),
      selfpromptOn,
      capabilitySource: enrichedContext.phaseTiming?.capabilities?.source || 'unknown',
    },
  ));

  stages.push(stage(
    'transcript_memory',
    'Transcript Memory',
    transcriptMemoryStage.status,
    transcriptMemoryStage.why,
    transcriptMemoryStage.status === 'pass' ? OWNERS.verifiedLoader : OWNERS.transcriptMemory,
    {
      ...transcriptMemoryStage.details,
      memoryProfile: runtimeReceipt.memory?.memory_profile || gptConfig.memoryProfile || gptConfig.memory_profile || 'off',
      voiceExemplarCount: Number(runtimeReceipt.memory?.voice_exemplar_count ?? enrichedContext.voiceExemplarCount ?? 0),
      voiceExemplarSources: runtimeReceipt.memory?.voice_exemplar_sources || enrichedContext.voiceExemplarSources || [],
      transcriptSources: runtimeReceipt.memory?.transcript_sources || [],
      supabaseAccessed: Boolean(runtimeReceipt.memory?.supabase_accessed || enrichedContext.supabase_accessed),
      vvaultAccessed: Boolean(runtimeReceipt.memory?.vvault_accessed || enrichedContext.vvault_accessed),
      sourceAccess: runtimeReceipt.memory?.source_access || enrichedContext.source_access || null,
      knowledgeSource: runtimeReceipt.memory?.knowledge_source || enrichedContext.knowledgeSource || enrichedContext.phaseTiming?.knowledge?.source || null,
      voiceExemplarRetrieval: runtimeReceipt.memory?.voice_exemplar_retrieval || enrichedContext.voiceExemplarRetrieval || null,
      verifiedMemoryRetrieval: runtimeReceipt.memory?.verified_memory_retrieval || enrichedContext.verifiedMemoryRetrieval || null,
      vectorRetrieval: runtimeReceipt.memory?.vector_retrieval || transcriptMemoryStage.details.vectorRetrieval || enrichedContext.vectorRetrieval || null,
      capsuleLoaded: Boolean(enrichedContext.capsuleLoaded),
      capsuleSource: enrichedContext.phaseTiming?.capsule?.source || null,
    },
  ));

  stages.push(stage(
    'continuity_restored',
    'Continuity Restored',
    continuityRestoredStage.status,
    continuityRestoredStage.why,
    OWNERS.continuity,
    continuityRestoredStage.details,
  ));

  stages.push(stage(
    'transcript_law_evidence',
    'Transcript-Law Evidence',
    transcriptLawEvidenceStage.status,
    transcriptLawEvidenceStage.why,
    OWNERS.transcriptTruth,
    transcriptLawEvidenceStage.details,
  ));

  stages.push(stage(
    'capsule_runtime_evidence',
    'Capsule / Runtime Evidence',
    capsuleRuntimeEvidenceStage.status,
    capsuleRuntimeEvidenceStage.why,
    OWNERS.capsuleRuntime,
    capsuleRuntimeEvidenceStage.details,
  ));

  stages.push(stage(
    'knowledge_files',
    'Knowledge Files',
    knowledge.status,
    knowledge.why,
    OWNERS.knowledge,
    knowledge.details,
  ));

  stages.push(stage(
    'runtime_policy',
    'Runtime Policy',
    runtimePolicy.status,
    runtimePolicy.why,
    runtimePolicy.details.sourceAnchor || OWNERS.runtimePolicy,
    runtimePolicy.details,
  ));

  stages.push(stage(
    'prompt_conditioning',
    'Prompt Conditioning',
    'pass',
    enrichedContext.evidence_style_requested
      ? 'Evidence/document mode was requested, so source-visible language may be allowed.'
      : 'Companion mode active; docs should remain internal grounding unless asked for evidence.',
    OWNERS.promptMode,
    {
      evidenceStyleRequested: Boolean(enrichedContext.evidence_style_requested),
      lowInformationPrompt: Boolean(enrichedContext.lowInformationPrompt || lowComplexityTurn),
      relationalTurn: Boolean(relationalTurn),
      contextMode,
      contextProfile: enrichedContext.context_profile || enrichedContext.context_budget?.profile || retrievalDiagnostics.context_profile || promptDiagnostics.context_profile || 'standard_turn',
      includedSections: enrichedContext.context_budget?.included_sections || retrievalDiagnostics.included_sections || promptDiagnostics.included_sections || [],
      delayedSections: enrichedContext.context_budget?.delayed_sections || retrievalDiagnostics.delayed_sections || promptDiagnostics.delayed_sections || [],
      hasImages: Boolean(hasImages),
      promptChars: retrievalDiagnostics.system_prompt_chars || promptDiagnostics.prompt_chars || 0,
    },
  ));

  stages.push(...researchWorkflowStages);

  stages.push(stage(
    'provider',
    'Provider / Model',
    providerFinal ? (providerFallbackUsed ? 'warn' : 'pass') : 'warn',
    providerFinal
      ? `${providerFinal}${providerModel ? ` / ${providerModel}` : ''}${providerFallbackUsed ? ' after fallback' : ''}.`
      : 'No final provider was reported.',
    OWNERS.provider,
    {
      finalProvider: providerFinal,
      model: providerModel,
      mode: providerStageDetails.mode || mode,
      modelSource: providerStageDetails.model_source || providerStageDetails.source || null,
      configuredModel: providerStageDetails.configured_model || null,
      suppressedConfiguredModel: providerStageDetails.suppressed_configured_model || null,
      requestedProvider: providerStageDetails.requested_provider || null,
      requestedModel: providerStageDetails.requested_model || null,
      routingOverride: Boolean(providerStageDetails.routing_override),
      seatDefaultsOrOverrides: providerStageDetails.seat_defaults_or_overrides || null,
      selectionPolicy: providerStageDetails.selection_policy || null,
      linHarmonyPolicy: providerStageDetails.lin_harmony_policy || null,
      linSeatCanon: providerStageDetails.lin_seat_canon || providerStageDetails.seat_plan?.canon || null,
      performanceModelSwitch: providerStageDetails.performance_model_switch ?? null,
      requestedSeat: providerStageDetails.requested_seat || providerStageDetails.seat_plan?.requested_seat || null,
      requestedCanonicalSeat: providerStageDetails.requested_canonical_seat || providerStageDetails.seat_plan?.requested_canonical_seat || null,
      seatPlan: providerStageDetails.seat_plan || null,
      localFirstUsed: Boolean(providerStageDetails.local_first_used),
      localCloudFallbackState: providerStageDetails.local_cloud_fallback_state || null,
      fallbackUsed: providerFallbackUsed,
      attempts: Array.isArray(providerTrace.attempts) ? providerTrace.attempts.length : 0,
    },
  ));

  if (modelSynthesis.present) {
    stages.push(stage(
      'model_synthesis',
      'Model Synthesis',
      modelSynthesis.status,
      modelSynthesis.why,
      OWNERS.modelSynthesis,
      modelSynthesis.details,
    ));
  }

  if (assignmentQa.present) {
    stages.push(stage(
      'assignment_qa',
      'Assignment QA',
      assignmentQa.status,
      assignmentQa.why,
      assignmentQa.details.sourceAnchor || OWNERS.assignmentQa,
      assignmentQa.details,
    ));
  }

  stages.push(stage(
    'identity_coherence',
    'Identity / Coherence',
    identityCoherence.status,
    identityCoherence.why,
    identityCoherence.details.sourceAnchor || OWNERS.identityCoherence,
    identityCoherence.details,
  ));

  if (transcriptLawGovernance.present) {
    stages.push(stage(
      'transcript_law_governance',
      'Transcript-Law Governance',
      transcriptLawGovernance.status,
      transcriptLawGovernance.why,
      transcriptLawGovernance.details.sourceAnchor || OWNERS.transcriptLawGovernance,
      transcriptLawGovernance.details,
    ));
  }

  stages.push(stage(
    'post_response_guard',
    'Post-Response Guard',
    postGuard.status,
    postGuard.why,
    OWNERS.postGuard,
    postGuard.details,
  ));

  stages.push(stage(
    'persistence',
    'Persistence',
    persistence.status,
    persistence.why,
    OWNERS.persistence,
    persistence.details,
  ));

  stages.push(stage(
    'notification_ui',
    'UI Delivery / Notifications',
    responseStatus === 'success' ? 'pass' : 'warn',
    responseStatus === 'success'
      ? 'The response includes receipt metadata for Chatty to render and optionally notify from Layout.'
      : 'The response did not complete normally; UI should surface the failure receipt instead of hiding it.',
    OWNERS.notificationUi,
    {
      responseStatus,
      checklistRenderable: true,
      notificationGate: 'responsesPush + document.hidden + Notification permission',
    },
  ));

  const failCount = stages.filter((item) => item.status === 'fail').length;
  const warnCount = stages.filter((item) => item.status === 'warn').length;
  const skippedCount = stages.filter((item) => item.status === 'skipped').length;
  const optionalSkippedStageIds = canonicalContinuationTurn
    ? OPTIONAL_SKIPPED_STAGE_IDS
    : new Set([
        ...OPTIONAL_SKIPPED_STAGE_IDS,
        'continuity_restored',
        'transcript_law_evidence',
        'capsule_runtime_evidence',
      ]);
  const materialSkippedCount = stages.filter(
    (item) => item.status === 'skipped' && !optionalSkippedStageIds.has(item.id),
  ).length;
  const overallStatus = failCount > 0
    ? 'fail'
    : warnCount > 0
      ? 'warn'
      : materialSkippedCount > 0
        ? 'partial'
        : 'pass';

  return {
    version: 'orchestration-checklist.v1',
    generatedAt: new Date().toISOString(),
    responseStatus,
    constructId,
    threadId,
    messagePreview: clean(userMessage, '').slice(0, 120),
    overallStatus,
    summary: { pass: stages.filter((item) => item.status === 'pass').length, warn: warnCount, fail: failCount, skipped: skippedCount },
    stages,
  };
}
