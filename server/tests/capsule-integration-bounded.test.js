import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CapsuleIntegration } from '../lib/capsuleIntegration.js';

describe('CapsuleIntegration bounded Zen recovery', () => {
  it('bounds protected Zen Supabase capsule waits and falls back to a local synthetic capsule', async () => {
    const integration = new CapsuleIntegration();
    integration.findLatestCapsule = async () => null;
    integration.loadCapsuleFromSupabaseWithDiagnostics = async () => new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          capsule: { identity: { name: 'too-late' } },
          source: 'supabase_capsule',
          transientFailure: null,
        });
      }, 50);
    });
    integration.buildCapsuleFromLocalIdentityDir = async () => ({
      capsule: { identity: { name: 'Zen' } },
      identityDir: '/tmp/zen-identity',
    });

    const startedAt = Date.now();
    const result = await integration.loadCapsuleWithDiagnostics('zen-001', {
      allowZenLocalIdentityFallback: true,
      supabaseTimeoutMs: 5,
    });

    assert.equal(result.ok, true);
    assert.equal(result.source, 'filesystem_identity_synthetic_capsule');
    assert.equal(result.recovery.applied, true);
    assert.equal(result.recovery.kind, 'local_identity_dir');
    assert.equal(result.transientFailure?.category, 'transient_upstream_failure');
    assert.ok(Date.now() - startedAt < 40);
  });

  it('does not unlock Zen-only recovery for non-Zen constructs', async () => {
    const integration = new CapsuleIntegration();
    integration.findLatestCapsule = async () => null;
    integration.loadCapsuleFromSupabaseWithDiagnostics = async () => ({
      capsule: null,
      source: 'supabase_capsule',
      errorCategory: 'transient_upstream_failure',
      errorMessage: '522 Connection timed out',
      transientFailure: { category: 'transient_upstream_failure', message: '522 Connection timed out' },
    });

    let localFallbackCalled = false;
    integration.buildCapsuleFromLocalIdentityDir = async () => {
      localFallbackCalled = true;
      return {
        capsule: { identity: { name: 'Katana' } },
        identityDir: '/tmp/katana-identity',
      };
    };

    const result = await integration.loadCapsuleWithDiagnostics('katana-001', {
      allowZenLocalIdentityFallback: true,
      supabaseTimeoutMs: 5,
    });

    assert.equal(result.ok, false);
    assert.equal(result.source, 'supabase_capsule');
    assert.equal(result.transientFailure?.category, 'transient_upstream_failure');
    assert.equal(localFallbackCalled, false);
  });
});
