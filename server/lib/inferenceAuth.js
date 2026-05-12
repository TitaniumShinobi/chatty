export function buildAuthReceipt({
  user,
  userId,
  supabaseSessionUserId,
  authSource,
  authRecovered,
  devDataOwnerOverride,
  dataOwnerUserId,
  dataOwnerSource,
}) {
  return {
    auth_email: user?.email || null,
    auth_provider: user?.auth_provider || null,
    auth_source: authSource,
    auth_user_id: user?.id || user?.sub || null,
    supabase_session_user_id: supabaseSessionUserId,
    data_owner_user_id: dataOwnerUserId || null,
    data_owner_source: dataOwnerSource,
    memory_lookup_user_id: dataOwnerUserId || null,
    dev_auth_fallback: !!authRecovered,
    dev_data_owner_override: !!devDataOwnerOverride,
    data_owner_matches_auth: Boolean(dataOwnerUserId && dataOwnerUserId === userId),
    canonical_construct_owner: null,
  };
}

export function applyCanonicalOwnerResolution({
  canonicalOwnerResolution,
  authReceipt,
  dataOwnerUserId,
  dataOwnerSource,
  userId,
}) {
  const resolvedOwnerUserId = canonicalOwnerResolution.dataOwnerUserId || dataOwnerUserId;
  const resolvedOwnerSource = canonicalOwnerResolution.dataOwnerSource || dataOwnerSource;
  const updatedAuthReceipt = {
    ...authReceipt,
    data_owner_user_id: resolvedOwnerUserId || null,
    data_owner_source: resolvedOwnerSource,
    memory_lookup_user_id: resolvedOwnerUserId || null,
    data_owner_matches_auth: Boolean(resolvedOwnerUserId && resolvedOwnerUserId === userId),
    canonical_construct_owner: canonicalOwnerResolution.receipt || null,
  };
  return {
    dataOwnerUserId: resolvedOwnerUserId,
    dataOwnerSource: resolvedOwnerSource,
    authReceipt: updatedAuthReceipt,
  };
}

export function buildIdentityCoherenceRepairDefaults(identityCoherenceInitial) {
  return {
    attempted: false,
    applied: false,
    provider: null,
    model: null,
    initial_status: identityCoherenceInitial?.status,
    final_status: identityCoherenceInitial?.status,
    failure_reason: null,
  };
}

export function buildIdentityCoherencePolicyFallbackDefaults({
  policyAnswerKind,
  effectiveProvider,
  effectiveModel,
}) {
  return {
    attempted: false,
    applied: false,
    answer_kind: policyAnswerKind || null,
    provider: effectiveProvider || null,
    model: effectiveModel || null,
    source: 'construct_runtime_policy_deterministic_fallback',
    final_status: null,
    final_reasons: [],
    failure_reason: null,
  };
}

export function buildIdentityCoherenceConstructFallbackDefaults({
  effectiveProvider,
  effectiveModel,
}) {
  return {
    attempted: false,
    applied: false,
    answer_kind: null,
    provider: effectiveProvider || null,
    model: effectiveModel || null,
    source: null,
    final_status: null,
    final_reasons: [],
    failure_reason: null,
    owner_file: null,
    source_anchor: null,
  };
}

export function buildIdentityCoherenceCertificationFallbackDefaults({
  promptId,
}) {
  return {
    attempted: false,
    applied: false,
    prompt_id: promptId || null,
    provider: 'deterministic',
    model: 'five_construct_certification_proof_fallback',
    source: 'deterministic_five_construct_certification_proof_fallback',
    final_status: null,
    final_reasons: [],
    failure_reason: null,
    owner_file: null,
    source_anchor: null,
  };
}

export function buildTranscriptLawGovernanceRepairDefaults(transcriptLawGovernance) {
  return {
    attempted: false,
    applied: false,
    provider: null,
    model: null,
    source: null,
    requested_fact: transcriptLawGovernance?.requestedFact || null,
    initial_status: transcriptLawGovernance?.status || 'skipped',
    final_status: transcriptLawGovernance?.status || 'skipped',
    final_reasons: transcriptLawGovernance?.reasons || [],
    failure_reason: null,
  };
}

export function buildAssignmentQaRepairDefaults({
  identityCoherence,
  assignmentQa,
  finalAnswerSource,
  effectiveProvider,
  effectiveModel,
}) {
  return {
    attempted: false,
    applied: false,
    provider: effectiveProvider || null,
    model: effectiveModel || null,
    seat: 'full_synthesis',
    initial_status: assignmentQa?.status || null,
    final_status: null,
    initial_reasons: assignmentQa?.reasons || [],
    final_reasons: [],
    identity_initial_status: identityCoherence?.status || null,
    identity_final_status: identityCoherence?.status || null,
    identity_failure_reasons: identityCoherence?.reasons || [],
    assignment_failure_reasons: assignmentQa?.reasons || [],
    final_answer_source: finalAnswerSource,
    deterministic_assignment_fallback_attempted: false,
    deterministic_assignment_fallback_applied: false,
    failure_reason: null,
  };
}

export function buildContinuityIntegrityRepairDefaults(continuityIntegrity) {
  return {
    attempted: false,
    applied: false,
    source: null,
    failure_reason: null,
    meta_continuity_hits: continuityIntegrity?.metaContinuityHits || 0,
    trajectory_overlap: continuityIntegrity?.trajectoryOverlap || 0,
  };
}
