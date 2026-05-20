import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveConstructReceiptName,
  buildCanonicalPersistenceSemantics,
  buildContinuityFailurePayload,
  buildIdentityFailurePayload,
} from '../lib/constructInferenceUtil.js';

describe('constructInferenceUtil', () => {
  describe('deriveConstructReceiptName', () => {
    it('uses gptConfig.name when available', () => {
      assert.equal(deriveConstructReceiptName('zen-001', { name: 'Zen' }), 'Zen');
    });

    it('derives name from constructId when no gptConfig.name', () => {
      assert.equal(deriveConstructReceiptName('zen-001'), 'Zen');
    });

    it('capitalizes first letter of derived name', () => {
      assert.equal(deriveConstructReceiptName('lin-001'), 'Lin');
    });

    it('handles empty gptConfig', () => {
      assert.equal(deriveConstructReceiptName('katana-001', {}), 'Katana');
    });
  });

  describe('buildCanonicalPersistenceSemantics', () => {
    it('returns default object when no args', () => {
      const result = buildCanonicalPersistenceSemantics();
      assert.equal(result.canonical_target, 'vvault_body_transcripts');
      assert.equal(result.canonical_target_table, 'ovvaults.transcripts');
      assert.equal(result.failure_classification, null);
      assert.equal(result.upstream_write_blocked, null);
    });

    it('sets failure classification when provided', () => {
      const result = buildCanonicalPersistenceSemantics({
        failureClassification: 'blocked_continuity_resume',
        upstreamWriteBlocked: true,
      });
      assert.equal(result.failure_classification, 'blocked_continuity_resume');
      assert.equal(result.upstream_write_blocked, true);
    });
  });

  describe('buildContinuityFailurePayload', () => {
    const baseParams = {
      continuityResumeValidation: {
        continuityExpected: true,
        continuityRestored: false,
        hydration: 'full',
        hydrationComplete: true,
        failureReason: 'tail_hash_mismatch',
        staleSeatRejected: false,
      },
      constructId: 'zen-001',
      gptConfig: { name: 'Zen', orchestrationMode: 'lin', memoryProfile: 'on' },
      dataOwnerUserId: 'user-001',
      authReceipt: { auth_email: 'test@test.com', auth_source: 'supabase_session' },
      user: { email: 'test@test.com' },
      effectiveTurnSessionId: 'zen-001_chat_with_zen-001',
      message: 'hello',
      rawConstructId: 'zen-001',
      canonicalConstructId: 'zen-001',
      hasImages: false,
      previewMode: false,
    };

    it('returns runtimeReceipt with expected structure', () => {
      const { runtimeReceipt } = buildContinuityFailurePayload(baseParams);
      assert.equal(runtimeReceipt.construct_id, 'zen-001');
      assert.equal(runtimeReceipt.effective_construct_name, 'Zen');
      assert.equal(runtimeReceipt.route_mode, 'vvault_message');
      assert.equal(runtimeReceipt.persistence_owner, 'blocked_continuity_resume');
      assert.equal(runtimeReceipt.transcript_truth.eligible, false);
      assert.equal(runtimeReceipt.provider.final_provider, null);
      assert.equal(runtimeReceipt.persistence.status, 'skipped');
      assert.equal(runtimeReceipt.persistence.code, 'CONTINUITY_RESUME_UNPROVEN');
    });

    it('returns checklist with expected structure', () => {
      const { checklist } = buildContinuityFailurePayload(baseParams);
      assert.equal(checklist.version, 'orchestration-checklist.v1');
      assert.equal(checklist.constructId, 'zen-001');
      assert.equal(checklist.threadId, 'zen-001_chat_with_zen-001');
      assert.ok(Array.isArray(checklist.stages));
    });

    it('returns stale seat code when staleSeatRejected', () => {
      const { continuityFailureCode } = buildContinuityFailurePayload({
        ...baseParams,
        continuityResumeValidation: {
          ...baseParams.continuityResumeValidation,
          staleSeatRejected: true,
        },
      });
      assert.equal(continuityFailureCode, 'CONTINUITY_RESUME_STALE');
    });

    it('returns deterministic output for same inputs', () => {
      const result1 = buildContinuityFailurePayload(baseParams);
      const result2 = buildContinuityFailurePayload(baseParams);
      assert.deepEqual(result1.responseBody, result2.responseBody);
    });
  });

  describe('buildIdentityFailurePayload', () => {
    const baseParams = {
      identityBundle: {
        ok: false,
        code: 'IDENTITY_UNAVAILABLE',
        error: 'Identity bundle could not be validated.',
        details: { reason: 'supabase_unavailable' },
        preflight: { identity: { prompt_source: 'supabase' } },
      },
      constructId: 'zen-001',
      rawConstructId: 'zen-001',
      canonicalConstructId: 'zen-001',
      dataOwnerUserId: 'user-001',
      authReceipt: { auth_email: 'test@test.com', auth_source: 'supabase_session' },
      user: { email: 'test@test.com' },
      sessionId: null,
      threadId: 'zen-001_chat_with_zen-001',
      message: 'hello',
      hasImages: false,
      previewMode: false,
      code: 'IDENTITY_UNAVAILABLE',
      error: 'Identity bundle could not be validated.',
      details: { reason: 'supabase_unavailable' },
      responseStatus: 'identity_bundle_preflight_failed',
    };

    it('returns runtimeReceipt with identity preflight failure details', () => {
      const { runtimeReceipt } = buildIdentityFailurePayload(baseParams);
      assert.equal(runtimeReceipt.construct_id, 'zen-001');
      assert.equal(runtimeReceipt.persistence_owner, 'blocked_identity_preflight');
      assert.equal(runtimeReceipt.identity.source, 'identity_bundle_preflight');
      assert.equal(runtimeReceipt.identity.preflight.code, 'IDENTITY_UNAVAILABLE');
      assert.deepEqual(runtimeReceipt.identity.preflight.details, { reason: 'supabase_unavailable' });
      assert.equal(runtimeReceipt.fidelity.identity_coherence.status, 'skipped');
    });

    it('returns checklist with identity_preflight_failed context', () => {
      const { checklist } = buildIdentityFailurePayload(baseParams);
      assert.equal(checklist.version, 'orchestration-checklist.v1');
      assert.equal(checklist.constructId, 'zen-001');
    });

    it('returns responseBody with expected fields', () => {
      const { responseBody } = buildIdentityFailurePayload(baseParams);
      assert.equal(responseBody.ok, false);
      assert.equal(responseBody.code, 'IDENTITY_UNAVAILABLE');
      assert.equal(responseBody.constructId, 'zen-001');
    });

    it('returns deterministic output for same inputs', () => {
      const result1 = buildIdentityFailurePayload(baseParams);
      const result2 = buildIdentityFailurePayload(baseParams);
      assert.deepEqual(result1.responseBody, result2.responseBody);
    });
  });
});
