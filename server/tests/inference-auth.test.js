import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthReceipt,
  applyCanonicalOwnerResolution,
  buildIdentityCoherenceRepairDefaults,
  buildIdentityCoherencePolicyFallbackDefaults,
  buildIdentityCoherenceConstructFallbackDefaults,
  buildIdentityCoherenceCertificationFallbackDefaults,
  buildTranscriptLawGovernanceRepairDefaults,
  buildAssignmentQaRepairDefaults,
  buildContinuityIntegrityRepairDefaults,
} from '../lib/inferenceAuth.js';

describe('buildAuthReceipt', () => {
  it('returns all fields with full arguments', () => {
    const user = { email: 'a@b.com', auth_provider: 'google', id: 'uid-1' };
    const result = buildAuthReceipt({
      user,
      userId: 'uid-1',
      supabaseSessionUserId: 'ssuid-1',
      authSource: 'google_token',
      authRecovered: true,
      devDataOwnerOverride: true,
      dataOwnerUserId: 'uid-1',
      dataOwnerSource: 'supabase_session',
    });

    assert.equal(result.auth_email, 'a@b.com');
    assert.equal(result.auth_provider, 'google');
    assert.equal(result.auth_source, 'google_token');
    assert.equal(result.auth_user_id, 'uid-1');
    assert.equal(result.supabase_session_user_id, 'ssuid-1');
    assert.equal(result.data_owner_user_id, 'uid-1');
    assert.equal(result.data_owner_source, 'supabase_session');
    assert.equal(result.memory_lookup_user_id, 'uid-1');
    assert.equal(result.dev_auth_fallback, true);
    assert.equal(result.dev_data_owner_override, true);
    assert.equal(result.data_owner_matches_auth, true);
    assert.equal(result.canonical_construct_owner, null);
  });

  it('sets auth_email from user.email', () => {
    const user = { email: 'test@example.com', auth_provider: 'github' };
    const result = buildAuthReceipt({ user, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.auth_email, 'test@example.com');
  });

  it('sets auth_email to null when user has no email', () => {
    const user = { auth_provider: 'github' };
    const result = buildAuthReceipt({ user, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.auth_email, null);
  });

  it('sets auth_provider from user.auth_provider', () => {
    const user = { email: 'a@b.com', auth_provider: 'github' };
    const result = buildAuthReceipt({ user, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.auth_provider, 'github');
  });

  it('sets auth_provider to null when user has no auth_provider', () => {
    const user = { email: 'a@b.com' };
    const result = buildAuthReceipt({ user, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.auth_provider, null);
  });

  it('sets auth_user_id from user.id', () => {
    const user = { id: 'my-id', sub: 'my-sub' };
    const result = buildAuthReceipt({ user, userId: 'my-id', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.auth_user_id, 'my-id');
  });

  it('falls back to user.sub when user.id is absent', () => {
    const user = { sub: 'my-sub' };
    const result = buildAuthReceipt({ user, userId: 'my-sub', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.auth_user_id, 'my-sub');
  });

  it('sets auth_user_id to null when user has neither id nor sub', () => {
    const user = { email: 'a@b.com' };
    const result = buildAuthReceipt({ user, userId: null, supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.auth_user_id, null);
  });

  it('sets auth_source as provided', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: 'app_jwt', authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.auth_source, 'app_jwt');
  });

  it('sets supabase_session_user_id as provided', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: 'ssuid', authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.supabase_session_user_id, 'ssuid');
  });

  it('sets data_owner_user_id from dataOwnerUserId', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: 'owner-1', dataOwnerSource: null });
    assert.equal(result.data_owner_user_id, 'owner-1');
  });

  it('sets data_owner_user_id to null when dataOwnerUserId is null', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.data_owner_user_id, null);
  });

  it('sets data_owner_source as provided', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: 'supabase_session' });
    assert.equal(result.data_owner_source, 'supabase_session');
  });

  it('sets memory_lookup_user_id from dataOwnerUserId', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: 'mem-owner', dataOwnerSource: null });
    assert.equal(result.memory_lookup_user_id, 'mem-owner');
  });

  it('sets dev_auth_fallback to true when authRecovered is truthy', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: 'some_token', devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.dev_auth_fallback, true);
  });

  it('sets dev_auth_fallback to false when authRecovered is falsy', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.dev_auth_fallback, false);
  });

  it('sets dev_data_owner_override to true when devDataOwnerOverride is truthy', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: 'yes', dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.dev_data_owner_override, true);
  });

  it('sets dev_data_owner_override to false when devDataOwnerOverride is falsy', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.dev_data_owner_override, false);
  });

  it('sets data_owner_matches_auth to true when dataOwnerUserId matches userId', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'same-id', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: 'same-id', dataOwnerSource: null });
    assert.equal(result.data_owner_matches_auth, true);
  });

  it('sets data_owner_matches_auth to false when dataOwnerUserId differs from userId', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'uid-a', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: 'uid-b', dataOwnerSource: null });
    assert.equal(result.data_owner_matches_auth, false);
  });

  it('sets data_owner_matches_auth to false when dataOwnerUserId is null', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'uid-a', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.data_owner_matches_auth, false);
  });

  it('sets all auth fields to null when no user provided', () => {
    const result = buildAuthReceipt({
      user: null,
      userId: null,
      supabaseSessionUserId: null,
      authSource: null,
      authRecovered: false,
      devDataOwnerOverride: false,
      dataOwnerUserId: null,
      dataOwnerSource: null,
    });

    assert.equal(result.auth_email, null);
    assert.equal(result.auth_provider, null);
    assert.equal(result.auth_user_id, null);
    assert.equal(result.data_owner_user_id, null);
    assert.equal(result.supabase_session_user_id, null);
    assert.equal(result.dev_auth_fallback, false);
    assert.equal(result.dev_data_owner_override, false);
    assert.equal(result.data_owner_matches_auth, false);
  });

  it('sets canonical_construct_owner to null', () => {
    const result = buildAuthReceipt({ user: { email: 'a@b.com' }, userId: 'x', supabaseSessionUserId: null, authSource: null, authRecovered: false, devDataOwnerOverride: false, dataOwnerUserId: null, dataOwnerSource: null });
    assert.equal(result.canonical_construct_owner, null);
  });
});

describe('applyCanonicalOwnerResolution', () => {
  it('overrides dataOwnerUserId and dataOwnerSource from canonicalOwnerResolution', () => {
    const authReceipt = {
      auth_email: 'a@b.com',
      auth_provider: 'google',
      auth_source: 'google_token',
      auth_user_id: 'uid-1',
      supabase_session_user_id: 'ssuid',
      data_owner_user_id: 'old-owner',
      data_owner_source: 'supabase_session',
      memory_lookup_user_id: 'old-owner',
      dev_auth_fallback: false,
      dev_data_owner_override: false,
      data_owner_matches_auth: true,
      canonical_construct_owner: null,
    };

    const result = applyCanonicalOwnerResolution({
      canonicalOwnerResolution: {
        dataOwnerUserId: 'new-owner',
        dataOwnerSource: 'canonical_zen_chatty_owner',
        receipt: { some: 'data' },
      },
      authReceipt,
      dataOwnerUserId: 'old-owner',
      dataOwnerSource: 'supabase_session',
      userId: 'uid-1',
    });

    assert.equal(result.dataOwnerUserId, 'new-owner');
    assert.equal(result.dataOwnerSource, 'canonical_zen_chatty_owner');
    assert.equal(result.authReceipt.data_owner_user_id, 'new-owner');
    assert.equal(result.authReceipt.data_owner_source, 'canonical_zen_chatty_owner');
    assert.equal(result.authReceipt.memory_lookup_user_id, 'new-owner');
    assert.deepEqual(result.authReceipt.canonical_construct_owner, { some: 'data' });
    assert.equal(result.authReceipt.auth_email, 'a@b.com');
  });

  it('falls back to original dataOwnerUserId when canonical resolution has none', () => {
    const authReceipt = { data_owner_user_id: null, data_owner_source: null, memory_lookup_user_id: null, data_owner_matches_auth: false, canonical_construct_owner: null };

    const result = applyCanonicalOwnerResolution({
      canonicalOwnerResolution: { dataOwnerUserId: null, dataOwnerSource: null, receipt: null },
      authReceipt,
      dataOwnerUserId: 'original-owner',
      dataOwnerSource: 'app_jwt',
      userId: 'uid-1',
    });

    assert.equal(result.dataOwnerUserId, 'original-owner');
    assert.equal(result.dataOwnerSource, 'app_jwt');
    assert.equal(result.authReceipt.data_owner_user_id, 'original-owner');
    assert.equal(result.authReceipt.data_owner_source, 'app_jwt');
    assert.equal(result.authReceipt.memory_lookup_user_id, 'original-owner');
    assert.equal(result.authReceipt.canonical_construct_owner, null);
  });

  it('recalculates data_owner_matches_auth after resolution', () => {
    const authReceipt = { data_owner_user_id: null, data_owner_source: null, memory_lookup_user_id: null, data_owner_matches_auth: false, canonical_construct_owner: null };

    const result = applyCanonicalOwnerResolution({
      canonicalOwnerResolution: { dataOwnerUserId: 'uid-1', dataOwnerSource: 'canonical', receipt: null },
      authReceipt,
      dataOwnerUserId: null,
      dataOwnerSource: null,
      userId: 'uid-1',
    });

    assert.equal(result.authReceipt.data_owner_matches_auth, true);
  });

  it('sets data_owner_matches_auth to false when resolved owner differs from userId', () => {
    const authReceipt = { data_owner_user_id: null, data_owner_source: null, memory_lookup_user_id: null, data_owner_matches_auth: false, canonical_construct_owner: null };

    const result = applyCanonicalOwnerResolution({
      canonicalOwnerResolution: { dataOwnerUserId: 'other-user', dataOwnerSource: 'canonical', receipt: null },
      authReceipt,
      dataOwnerUserId: null,
      dataOwnerSource: null,
      userId: 'uid-1',
    });

    assert.equal(result.authReceipt.data_owner_matches_auth, false);
  });

  it('sets canoncial_construct_owner from canonicalOwnerResolution.receipt', () => {
    const authReceipt = { data_owner_user_id: null, data_owner_source: null, memory_lookup_user_id: null, data_owner_matches_auth: false, canonical_construct_owner: null };

    const result = applyCanonicalOwnerResolution({
      canonicalOwnerResolution: { dataOwnerUserId: 'x', dataOwnerSource: 'y', receipt: 'receipt-data' },
      authReceipt,
      dataOwnerUserId: null,
      dataOwnerSource: null,
      userId: 'uid-1',
    });

    assert.equal(result.authReceipt.canonical_construct_owner, 'receipt-data');
  });

  it('preserves other authReceipt fields', () => {
    const authReceipt = { auth_email: 'a@b.com', auth_provider: 'google', data_owner_user_id: null, data_owner_source: null, memory_lookup_user_id: null, data_owner_matches_auth: false, canonical_construct_owner: null };

    const result = applyCanonicalOwnerResolution({
      canonicalOwnerResolution: { dataOwnerUserId: 'new', dataOwnerSource: 'new-src', receipt: null },
      authReceipt,
      dataOwnerUserId: null,
      dataOwnerSource: null,
      userId: 'uid-1',
    });

    assert.equal(result.authReceipt.auth_email, 'a@b.com');
    assert.equal(result.authReceipt.auth_provider, 'google');
  });

  it('fails closed when a canonical owner resolution applied but produced no owner id', () => {
    const authReceipt = { data_owner_user_id: 'request-owner', data_owner_source: 'supabase_session', memory_lookup_user_id: 'request-owner', data_owner_matches_auth: false, canonical_construct_owner: null };

    const result = applyCanonicalOwnerResolution({
      canonicalOwnerResolution: {
        applied: true,
        dataOwnerUserId: null,
        dataOwnerSource: 'canonical_zen_chatty_owner',
        receipt: { failureReason: 'canonical_owner_unconfigured' },
      },
      authReceipt,
      dataOwnerUserId: 'request-owner',
      dataOwnerSource: 'supabase_session',
      userId: 'uid-1',
    });

    assert.equal(result.dataOwnerUserId, null);
    assert.equal(result.dataOwnerSource, 'canonical_zen_chatty_owner');
    assert.equal(result.authReceipt.data_owner_user_id, null);
    assert.equal(result.authReceipt.memory_lookup_user_id, null);
    assert.equal(result.authReceipt.canonical_construct_owner.failureReason, 'canonical_owner_unconfigured');
  });
});

describe('buildIdentityCoherenceRepairDefaults', () => {
  it('returns repair object with attempted and applied false', () => {
    const result = buildIdentityCoherenceRepairDefaults(null);

    assert.equal(result.attempted, false);
    assert.equal(result.applied, false);
    assert.equal(result.provider, null);
    assert.equal(result.model, null);
    assert.equal(result.failure_reason, null);
  });

  it('sets initial_status and final_status from identityCoherenceInitial.status', () => {
    const result = buildIdentityCoherenceRepairDefaults({ status: 'pass' });

    assert.equal(result.initial_status, 'pass');
    assert.equal(result.final_status, 'pass');
  });

  it('sets initial_status and final_status to undefined when no status', () => {
    const result = buildIdentityCoherenceRepairDefaults({});

    assert.equal(result.initial_status, undefined);
    assert.equal(result.final_status, undefined);
  });

  it('sets initial_status and final_status to undefined when identityCoherenceInitial is null', () => {
    const result = buildIdentityCoherenceRepairDefaults(null);

    assert.equal(result.initial_status, undefined);
    assert.equal(result.final_status, undefined);
  });

  it('sets initial_status and final_status to undefined when identityCoherenceInitial is undefined', () => {
    const result = buildIdentityCoherenceRepairDefaults(undefined);

    assert.equal(result.initial_status, undefined);
    assert.equal(result.final_status, undefined);
  });

  it('sets status to any string value from input', () => {
    const result = buildIdentityCoherenceRepairDefaults({ status: 'fail' });

    assert.equal(result.initial_status, 'fail');
    assert.equal(result.final_status, 'fail');
  });
});

describe('buildIdentityCoherencePolicyFallbackDefaults', () => {
  it('returns policy fallback object with source', () => {
    const result = buildIdentityCoherencePolicyFallbackDefaults({
      policyAnswerKind: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.attempted, false);
    assert.equal(result.applied, false);
    assert.equal(result.answer_kind, null);
    assert.equal(result.provider, null);
    assert.equal(result.model, null);
    assert.equal(result.source, 'construct_runtime_policy_deterministic_fallback');
    assert.equal(result.final_status, null);
    assert.deepEqual(result.final_reasons, []);
    assert.equal(result.failure_reason, null);
  });

  it('sets answer_kind when policyAnswerKind is provided', () => {
    const result = buildIdentityCoherencePolicyFallbackDefaults({
      policyAnswerKind: 'memory_game',
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.answer_kind, 'memory_game');
  });

  it('sets provider and model from inputs', () => {
    const result = buildIdentityCoherencePolicyFallbackDefaults({
      policyAnswerKind: null,
      effectiveProvider: 'gpt-4',
      effectiveModel: 'gpt-4-turbo',
    });

    assert.equal(result.provider, 'gpt-4');
    assert.equal(result.model, 'gpt-4-turbo');
  });

  it('sets provider and model to null when inputs are null', () => {
    const result = buildIdentityCoherencePolicyFallbackDefaults({
      policyAnswerKind: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.provider, null);
    assert.equal(result.model, null);
  });

  it('sets answer_kind to null when policyAnswerKind is null', () => {
    const result = buildIdentityCoherencePolicyFallbackDefaults({
      policyAnswerKind: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.answer_kind, null);
  });

  it('sets final_reasons as empty array', () => {
    const result = buildIdentityCoherencePolicyFallbackDefaults({
      policyAnswerKind: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.deepEqual(result.final_reasons, []);
  });
});

describe('buildIdentityCoherenceConstructFallbackDefaults', () => {
  it('returns construct fallback with provider and model from inputs', () => {
    const result = buildIdentityCoherenceConstructFallbackDefaults({
      effectiveProvider: 'claude',
      effectiveModel: 'claude-3',
    });

    assert.equal(result.attempted, false);
    assert.equal(result.applied, false);
    assert.equal(result.answer_kind, null);
    assert.equal(result.provider, 'claude');
    assert.equal(result.model, 'claude-3');
    assert.equal(result.source, null);
    assert.equal(result.final_status, null);
    assert.deepEqual(result.final_reasons, []);
    assert.equal(result.failure_reason, null);
    assert.equal(result.owner_file, null);
    assert.equal(result.source_anchor, null);
  });

  it('sets provider and model to null when inputs are null', () => {
    const result = buildIdentityCoherenceConstructFallbackDefaults({
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.provider, null);
    assert.equal(result.model, null);
  });

  it('sets owner_file and source_anchor to null', () => {
    const result = buildIdentityCoherenceConstructFallbackDefaults({
      effectiveProvider: 'test',
      effectiveModel: 'test',
    });

    assert.equal(result.owner_file, null);
    assert.equal(result.source_anchor, null);
  });
});

describe('buildIdentityCoherenceCertificationFallbackDefaults', () => {
  it('returns certification fallback with deterministic provider and model', () => {
    const result = buildIdentityCoherenceCertificationFallbackDefaults({ promptId: null });

    assert.equal(result.attempted, false);
    assert.equal(result.applied, false);
    assert.equal(result.prompt_id, null);
    assert.equal(result.provider, 'deterministic');
    assert.equal(result.model, 'five_construct_certification_proof_fallback');
    assert.equal(result.source, 'deterministic_five_construct_certification_proof_fallback');
    assert.equal(result.final_status, null);
    assert.deepEqual(result.final_reasons, []);
    assert.equal(result.failure_reason, null);
    assert.equal(result.owner_file, null);
    assert.equal(result.source_anchor, null);
  });

  it('sets prompt_id from input', () => {
    const result = buildIdentityCoherenceCertificationFallbackDefaults({ promptId: 'id001' });

    assert.equal(result.prompt_id, 'id001');
  });

  it('sets prompt_id to null when promptId is null', () => {
    const result = buildIdentityCoherenceCertificationFallbackDefaults({ promptId: null });

    assert.equal(result.prompt_id, null);
  });

  it('always uses deterministic provider and model regardless of input', () => {
    const result = buildIdentityCoherenceCertificationFallbackDefaults({ promptId: 'anything' });

    assert.equal(result.provider, 'deterministic');
    assert.equal(result.model, 'five_construct_certification_proof_fallback');
    assert.equal(result.source, 'deterministic_five_construct_certification_proof_fallback');
  });
});

describe('buildTranscriptLawGovernanceRepairDefaults', () => {
  it('returns repair with fields from transcriptLawGovernance', () => {
    const result = buildTranscriptLawGovernanceRepairDefaults({
      requestedFact: 'fact-1',
      status: 'verified',
      reasons: ['reason-a', 'reason-b'],
    });

    assert.equal(result.attempted, false);
    assert.equal(result.applied, false);
    assert.equal(result.provider, null);
    assert.equal(result.model, null);
    assert.equal(result.source, null);
    assert.equal(result.requested_fact, 'fact-1');
    assert.equal(result.initial_status, 'verified');
    assert.equal(result.final_status, 'verified');
    assert.deepEqual(result.final_reasons, ['reason-a', 'reason-b']);
    assert.equal(result.failure_reason, null);
  });

  it('defaults initial_status and final_status to skipped when input is null', () => {
    const result = buildTranscriptLawGovernanceRepairDefaults(null);

    assert.equal(result.initial_status, 'skipped');
    assert.equal(result.final_status, 'skipped');
  });

  it('defaults initial_status and final_status to skipped when input is undefined', () => {
    const result = buildTranscriptLawGovernanceRepairDefaults(undefined);

    assert.equal(result.initial_status, 'skipped');
    assert.equal(result.final_status, 'skipped');
  });

  it('defaults requested_fact to null when input is null', () => {
    const result = buildTranscriptLawGovernanceRepairDefaults(null);

    assert.equal(result.requested_fact, null);
  });

  it('defaults final_reasons to empty array when input is null', () => {
    const result = buildTranscriptLawGovernanceRepairDefaults(null);

    assert.deepEqual(result.final_reasons, []);
  });

  it('uses requestedFact from input', () => {
    const result = buildTranscriptLawGovernanceRepairDefaults({ requestedFact: 'my-fact' });

    assert.equal(result.requested_fact, 'my-fact');
  });

  it('sets requested_fact to null when requestedFact is missing', () => {
    const result = buildTranscriptLawGovernanceRepairDefaults({ status: 'pass' });

    assert.equal(result.requested_fact, null);
  });
});

describe('buildAssignmentQaRepairDefaults', () => {
  it('returns QA repair with full arguments', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: { status: 'pass', reasons: ['ic-reason'] },
      assignmentQa: { status: 'done', reasons: ['qa-reason'] },
      finalAnswerSource: 'direct_answer',
      effectiveProvider: 'gpt-4',
      effectiveModel: 'gpt-4-turbo',
    });

    assert.equal(result.attempted, false);
    assert.equal(result.applied, false);
    assert.equal(result.provider, 'gpt-4');
    assert.equal(result.model, 'gpt-4-turbo');
    assert.equal(result.seat, 'full_synthesis');
    assert.equal(result.initial_status, 'done');
    assert.equal(result.final_status, null);
    assert.deepEqual(result.initial_reasons, ['qa-reason']);
    assert.deepEqual(result.final_reasons, []);
    assert.equal(result.identity_initial_status, 'pass');
    assert.equal(result.identity_final_status, 'pass');
    assert.deepEqual(result.identity_failure_reasons, ['ic-reason']);
    assert.deepEqual(result.assignment_failure_reasons, ['qa-reason']);
    assert.equal(result.final_answer_source, 'direct_answer');
    assert.equal(result.deterministic_assignment_fallback_attempted, false);
    assert.equal(result.deterministic_assignment_fallback_applied, false);
    assert.equal(result.failure_reason, null);
  });

  it('sets initial_status to null when assignmentQa is null', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: null,
      assignmentQa: null,
      finalAnswerSource: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.initial_status, null);
    assert.deepEqual(result.initial_reasons, []);
  });

  it('sets initial_reasons to empty array when assignmentQa is null', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: null,
      assignmentQa: null,
      finalAnswerSource: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.deepEqual(result.initial_reasons, []);
    assert.deepEqual(result.assignment_failure_reasons, []);
  });

  it('maps identityCoherence status and reasons', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: { status: 'fail', reasons: ['err1', 'err2'] },
      assignmentQa: null,
      finalAnswerSource: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.identity_initial_status, 'fail');
    assert.equal(result.identity_final_status, 'fail');
    assert.deepEqual(result.identity_failure_reasons, ['err1', 'err2']);
  });

  it('sets identity_initial_status and identity_final_status to null when identityCoherence is null', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: null,
      assignmentQa: null,
      finalAnswerSource: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.identity_initial_status, null);
    assert.equal(result.identity_final_status, null);
  });

  it('sets identity_failure_reasons to empty array when identityCoherence is null', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: null,
      assignmentQa: null,
      finalAnswerSource: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.deepEqual(result.identity_failure_reasons, []);
  });

  it('sets identity_failure_reasons to empty array when identityCoherence has no reasons', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: { status: 'pass' },
      assignmentQa: null,
      finalAnswerSource: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.deepEqual(result.identity_failure_reasons, []);
  });

  it('sets provider and model from inputs', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: null,
      assignmentQa: null,
      finalAnswerSource: 'source',
      effectiveProvider: 'claude',
      effectiveModel: 'claude-opus',
    });

    assert.equal(result.provider, 'claude');
    assert.equal(result.model, 'claude-opus');
  });

  it('sets provider and model to null when inputs are null', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: null,
      assignmentQa: null,
      finalAnswerSource: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.provider, null);
    assert.equal(result.model, null);
  });

  it('sets seat to full_synthesis', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: null,
      assignmentQa: null,
      finalAnswerSource: null,
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.seat, 'full_synthesis');
  });

  it('sets final_answer_source from input', () => {
    const result = buildAssignmentQaRepairDefaults({
      identityCoherence: null,
      assignmentQa: null,
      finalAnswerSource: 'synthesis',
      effectiveProvider: null,
      effectiveModel: null,
    });

    assert.equal(result.final_answer_source, 'synthesis');
  });
});

describe('buildContinuityIntegrityRepairDefaults', () => {
  it('returns continuity repair with fields from input', () => {
    const result = buildContinuityIntegrityRepairDefaults({
      metaContinuityHits: 3,
      trajectoryOverlap: 5,
    });

    assert.equal(result.attempted, false);
    assert.equal(result.applied, false);
    assert.equal(result.source, null);
    assert.equal(result.failure_reason, null);
    assert.equal(result.meta_continuity_hits, 3);
    assert.equal(result.trajectory_overlap, 5);
  });

  it('defaults meta_continuity_hits to 0 when input is null', () => {
    const result = buildContinuityIntegrityRepairDefaults(null);

    assert.equal(result.meta_continuity_hits, 0);
    assert.equal(result.trajectory_overlap, 0);
  });

  it('defaults meta_continuity_hits to 0 when input is undefined', () => {
    const result = buildContinuityIntegrityRepairDefaults(undefined);

    assert.equal(result.meta_continuity_hits, 0);
    assert.equal(result.trajectory_overlap, 0);
  });

  it('defaults meta_continuity_hits to 0 when metaContinuityHits is missing', () => {
    const result = buildContinuityIntegrityRepairDefaults({ trajectoryOverlap: 2 });

    assert.equal(result.meta_continuity_hits, 0);
    assert.equal(result.trajectory_overlap, 2);
  });

  it('defaults trajectory_overlap to 0 when trajectoryOverlap is missing', () => {
    const result = buildContinuityIntegrityRepairDefaults({ metaContinuityHits: 1 });

    assert.equal(result.meta_continuity_hits, 1);
    assert.equal(result.trajectory_overlap, 0);
  });

  it('never sets attempted or applied to true', () => {
    const result = buildContinuityIntegrityRepairDefaults({
      metaContinuityHits: 10,
      trajectoryOverlap: 20,
    });

    assert.equal(result.attempted, false);
    assert.equal(result.applied, false);
  });
});
