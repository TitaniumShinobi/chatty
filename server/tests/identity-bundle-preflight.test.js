import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateIdentityBundle } from '../lib/identityBundlePreflight.js';

describe('identity bundle preflight', () => {
  it('returns missing code when required identity parts are absent', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'zen-001',
      },
      {
        loadIdentityFilesDetailed: async () => ({
          prompt: '',
          conditioning: '',
          promptSource: 'filesystem_identity',
          conditioningSource: 'filesystem_identity',
          diagnostics: {},
        }),
        getCapsuleIntegration: async () => ({
          loadCapsuleWithDiagnostics: async () => ({
            capsule: null,
            source: 'supabase_capsule',
            recovery: { attempted: false, applied: false, kind: null },
            transientFailure: null,
          }),
        }),
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 'IDENTITY_BUNDLE_MISSING');
    assert.deepEqual(result.details.missing.sort(), ['capsule', 'conditioning', 'prompt']);
  });

  it('returns invalid code when identity fields are malformed', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'zen-001',
      },
      {
        loadIdentityFilesDetailed: async () => ({
          prompt: { bad: true },
          conditioning: ['x'],
          promptSource: 'filesystem_identity',
          conditioningSource: 'filesystem_identity',
          diagnostics: {},
        }),
        getCapsuleIntegration: async () => ({
          loadCapsuleWithDiagnostics: async () => ({
            capsule: { identity: { name: 'Zen' } },
            source: 'memory_cache',
            recovery: { attempted: false, applied: false, kind: null },
            transientFailure: null,
          }),
        }),
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 'IDENTITY_BUNDLE_INVALID');
    assert.deepEqual(result.details.invalid.sort(), ['conditioning', 'prompt']);
  });

  it('passes when prompt + conditioning + capsule are present', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'zen-001',
      },
      {
        loadIdentityFilesDetailed: async () => ({
          prompt: 'p',
          conditioning: 'c',
          promptSource: 'canonical_supabase',
          conditioningSource: 'canonical_supabase',
          diagnostics: {},
        }),
        getCapsuleIntegration: async () => ({
          loadCapsuleWithDiagnostics: async () => ({
            capsule: { identity: { name: 'Zen' } },
            source: 'supabase_capsule',
            recovery: { attempted: false, applied: false, kind: null },
            transientFailure: null,
          }),
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.preflight.identity.prompt_source, 'canonical_supabase');
    assert.equal(result.preflight.capsule.source, 'supabase_capsule');
    assert.equal(result.preflight.capsule.recovery.applied, false);
  });

  it('passes when protected Zen recovers from transient capsule upstream failure via local deterministic capsule', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'zen-001',
      },
      {
        loadIdentityFilesDetailed: async () => ({
          prompt: 'p',
          conditioning: 'c',
          promptSource: 'filesystem_identity',
          conditioningSource: 'filesystem_identity',
          diagnostics: {},
        }),
        getCapsuleIntegration: async () => ({
          loadCapsuleWithDiagnostics: async () => ({
            capsule: { identity: { name: 'Zen', instructions: 'p', conditioning: 'c' } },
            source: 'filesystem_identity_synthetic_capsule',
            recovery: { attempted: true, applied: true, kind: 'local_identity_dir' },
            transientFailure: { category: 'transient_upstream_failure', message: '522 Connection timed out' },
          }),
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.preflight.capsule.source, 'filesystem_identity_synthetic_capsule');
    assert.equal(result.preflight.capsule.recovery.applied, true);
    assert.equal(result.preflight.capsule.transient_failure.category, 'transient_upstream_failure');
  });

  it('passes when an already-warmed in-memory capsule cache is available', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'zen-001',
      },
      {
        loadIdentityFilesDetailed: async () => ({
          prompt: 'p',
          conditioning: 'c',
          promptSource: 'filesystem_identity',
          conditioningSource: 'filesystem_identity',
          diagnostics: {},
        }),
        getCapsuleIntegration: async () => ({
          loadCapsuleWithDiagnostics: async () => ({
            capsule: { identity: { name: 'Zen' } },
            source: 'memory_cache',
            recovery: { attempted: false, applied: false, kind: null },
            transientFailure: null,
          }),
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.preflight.capsule.source, 'memory_cache');
    assert.equal(result.preflight.capsule.recovery.applied, false);
  });

  it('passes when Val synthesizes a protected system capsule from embedded identity', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'val-001',
      },
      {
        loadIdentityFilesDetailed: async () => ({
          prompt: 'You are Val.',
          conditioning: 'Stay exact and grounded.',
          promptSource: 'embedded_system_identity',
          conditioningSource: 'embedded_system_identity',
          diagnostics: {},
        }),
        getCapsuleIntegration: async () => ({
          loadCapsuleWithDiagnostics: async () => ({
            capsule: null,
            source: 'supabase_capsule',
            errorCategory: 'capsule_missing',
            errorMessage: 'No capsule or identity-file fallback found in Supabase',
            recovery: { attempted: false, applied: false, kind: null },
            transientFailure: null,
          }),
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.preflight.identity.prompt_source, 'embedded_system_identity');
    assert.equal(result.preflight.capsule.source, 'embedded_system_identity_synthetic_capsule');
    assert.equal(result.preflight.capsule.recovery.applied, true);
    assert.equal(result.preflight.capsule.recovery.kind, 'embedded_system_identity');
  });

  it('passes when Val synthesizes a protected system capsule from filesystem identity', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'val-001',
      },
      {
        loadIdentityFilesDetailed: async () => ({
          prompt: 'You are Val.',
          conditioning: 'Stay exact and grounded.',
          promptSource: 'filesystem_identity',
          conditioningSource: 'filesystem_identity',
          diagnostics: {},
        }),
        getCapsuleIntegration: async () => ({
          loadCapsuleWithDiagnostics: async () => ({
            capsule: null,
            source: 'supabase_capsule',
            errorCategory: 'capsule_missing',
            errorMessage: 'No capsule or identity-file fallback found in Supabase',
            recovery: { attempted: false, applied: false, kind: null },
            transientFailure: null,
          }),
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.preflight.identity.prompt_source, 'filesystem_identity');
    assert.equal(result.preflight.capsule.source, 'filesystem_identity_synthetic_capsule');
    assert.equal(result.preflight.capsule.recovery.applied, true);
    assert.equal(result.preflight.capsule.recovery.kind, 'filesystem_identity');
  });

  it('returns unavailable when transient capsule failure has no safe recovery', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'zen-001',
      },
      {
        loadIdentityFilesDetailed: async () => ({
          prompt: 'p',
          conditioning: 'c',
          promptSource: 'filesystem_identity',
          conditioningSource: 'filesystem_identity',
          diagnostics: {},
        }),
        getCapsuleIntegration: async () => ({
          loadCapsuleWithDiagnostics: async () => ({
            capsule: null,
            source: 'supabase_capsule',
            errorCategory: 'transient_upstream_failure',
            errorMessage: '522 Connection timed out',
            recovery: { attempted: true, applied: false, kind: 'local_identity_dir' },
            transientFailure: { category: 'transient_upstream_failure', message: '522 Connection timed out' },
          }),
        }),
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 'IDENTITY_BUNDLE_UNAVAILABLE');
    assert.equal(result.preflight.capsule.transient_failure.category, 'transient_upstream_failure');
  });

  it('does not allow recovered synthetic capsule bypass for non-Zen constructs', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'katana-001',
      },
      {
        loadIdentityFilesDetailed: async () => ({
          prompt: 'p',
          conditioning: 'c',
          promptSource: 'filesystem_identity',
          conditioningSource: 'filesystem_identity',
          diagnostics: {},
        }),
        getCapsuleIntegration: async () => ({
          loadCapsuleWithDiagnostics: async () => ({
            capsule: { identity: { name: 'Katana' } },
            source: 'filesystem_identity_synthetic_capsule',
            recovery: { attempted: true, applied: true, kind: 'local_identity_dir' },
            transientFailure: { category: 'transient_upstream_failure', message: '522 Connection timed out' },
          }),
        }),
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 'IDENTITY_BUNDLE_INVALID');
    assert.equal(result.details.reason, 'unauthorized_capsule_recovery');
  });
});
