import { loadIdentityFiles, loadIdentityFilesDetailed } from './identityLoader.js';
import { buildSyntheticCapsulePayload, getCapsuleIntegration } from './capsuleIntegration.js';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isProtectedZenConstruct(constructId) {
  return String(constructId || '').trim().toLowerCase() === 'zen-001';
}

function isProtectedSystemConstruct(constructId) {
  const normalized = String(constructId || '').trim().toLowerCase();
  return normalized === 'zen-001' || normalized === 'val-001';
}

function isProtectedValConstruct(constructId) {
  return String(constructId || '').trim().toLowerCase() === 'val-001';
}

function buildIdentityDiagnostics(identity = {}, details = {}) {
  return {
    prompt_present: nonEmptyString(identity?.prompt),
    conditioning_present: nonEmptyString(identity?.conditioning),
    prompt_source: details?.promptSource || null,
    conditioning_source: details?.conditioningSource || null,
    prompt_diagnostics: details?.diagnostics?.prompt || {},
    conditioning_diagnostics: details?.diagnostics?.conditioning || {},
  };
}

function buildCapsuleDiagnostics(capsuleResult = {}) {
  return {
    present: Boolean(capsuleResult?.capsule && typeof capsuleResult.capsule === 'object'),
    source: capsuleResult?.source || null,
    recovery: capsuleResult?.recovery || { attempted: false, applied: false, kind: null },
    transient_failure: capsuleResult?.transientFailure || null,
    error_category: capsuleResult?.errorCategory || null,
    error_message: capsuleResult?.errorMessage || null,
  };
}

/**
 * Strict identity bundle preflight. Fails closed when required identity
 * components are missing or malformed.
 */
export async function validateIdentityBundle(
  {
    userId,
    constructId,
    userEmail = null,
    includeUndertone = false,
  },
  deps = {}
) {
  const loadIdentity = deps.loadIdentityFiles || loadIdentityFiles;
  const loadIdentityDetailed = deps.loadIdentityFilesDetailed || loadIdentityFilesDetailed;
  const getCapsule = deps.getCapsuleIntegration || getCapsuleIntegration;

  const missing = [];
  const invalid = [];

  let identity = null;
  let identityDetails = null;
  let capsule = null;
  let capsuleResult = null;

  try {
    if (typeof loadIdentityDetailed === 'function') {
      identityDetails = await loadIdentityDetailed(userId, constructId, includeUndertone, userEmail);
      identity = identityDetails;
    } else {
      identity = await loadIdentity(userId, constructId, includeUndertone, userEmail);
    }
  } catch (error) {
    return {
      ok: false,
      code: 'IDENTITY_BUNDLE_INVALID',
      error: 'Identity loader failed',
      details: { reason: 'identity_loader_exception', message: error.message },
      preflight: {
        identity: { prompt_present: false, conditioning_present: false },
        capsule: { present: false },
      },
    };
  }

  if (!identity || typeof identity !== 'object') {
    return {
      ok: false,
      code: 'IDENTITY_BUNDLE_MISSING',
      error: 'Identity bundle missing',
      details: { missing: ['prompt', 'conditioning'] },
      preflight: {
        identity: { prompt_present: false, conditioning_present: false },
        capsule: { present: false },
      },
    };
  }

  if ('prompt' in identity && identity.prompt != null && typeof identity.prompt !== 'string') {
    invalid.push('prompt');
  } else if (!('prompt' in identity) || !nonEmptyString(identity.prompt)) {
    missing.push('prompt');
  }
  if ('conditioning' in identity && identity.conditioning != null && typeof identity.conditioning !== 'string') {
    invalid.push('conditioning');
  } else if (!('conditioning' in identity) || !nonEmptyString(identity.conditioning)) {
    missing.push('conditioning');
  }

  try {
    const capsuleIntegration = await getCapsule();
    if (!capsuleIntegration || (typeof capsuleIntegration.loadCapsule !== 'function' && typeof capsuleIntegration.loadCapsuleWithDiagnostics !== 'function')) {
      return {
        ok: false,
        code: 'IDENTITY_BUNDLE_INVALID',
        error: 'Capsule integration unavailable',
        details: { reason: 'capsule_integration_missing' },
        preflight: {
          identity: buildIdentityDiagnostics(identity, identityDetails),
          capsule: { present: false, source: null },
        },
      };
    }

    if (typeof capsuleIntegration.loadCapsuleWithDiagnostics === 'function') {
      capsuleResult = await capsuleIntegration.loadCapsuleWithDiagnostics(constructId, {
        userId,
        allowZenLocalIdentityFallback: isProtectedZenConstruct(constructId),
      });
      capsule = capsuleResult?.capsule || null;
    } else {
      capsule = await capsuleIntegration.loadCapsule(constructId);
      capsuleResult = {
        capsule,
        source: capsule ? 'legacy_loader' : 'legacy_loader_missing',
        recovery: { attempted: false, applied: false, kind: null },
        transientFailure: null,
      };
    }

    const allowEmbeddedSystemCapsuleRecovery =
      !capsule &&
      String(identityDetails?.promptSource || '') === 'embedded_system_identity' &&
      String(identityDetails?.conditioningSource || '') === 'embedded_system_identity' &&
      nonEmptyString(identity?.prompt) &&
      nonEmptyString(identity?.conditioning) &&
      isProtectedSystemConstruct(constructId);

    if (allowEmbeddedSystemCapsuleRecovery) {
      capsule = buildSyntheticCapsulePayload({
        callsign: constructId,
        promptData: {
          name: String(constructId || '').replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase()),
          instructions: identity.prompt,
        },
        conditioningText: identity.conditioning,
        personalityData: null,
        generator: 'IdentityBundlePreflight',
        vaultSource: 'embedded_system_identity',
      });
      capsuleResult = {
        capsule,
        source: 'embedded_system_identity_synthetic_capsule',
        recovery: { attempted: true, applied: true, kind: 'embedded_system_identity' },
        transientFailure: capsuleResult?.transientFailure || null,
        errorCategory: capsuleResult?.errorCategory || null,
        errorMessage: capsuleResult?.errorMessage || null,
      };
    }

    const allowFilesystemValCapsuleRecovery =
      !capsule &&
      isProtectedValConstruct(constructId) &&
      String(identityDetails?.promptSource || '') === 'filesystem_identity' &&
      String(identityDetails?.conditioningSource || '') === 'filesystem_identity' &&
      nonEmptyString(identity?.prompt) &&
      nonEmptyString(identity?.conditioning);

    if (allowFilesystemValCapsuleRecovery) {
      capsule = buildSyntheticCapsulePayload({
        callsign: constructId,
        promptData: {
          name: String(constructId || '').replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase()),
          instructions: identity.prompt,
        },
        conditioningText: identity.conditioning,
        personalityData: null,
        generator: 'IdentityBundlePreflight',
        vaultSource: 'filesystem_identity',
      });
      capsuleResult = {
        capsule,
        source: 'filesystem_identity_synthetic_capsule',
        recovery: { attempted: true, applied: true, kind: 'filesystem_identity' },
        transientFailure: capsuleResult?.transientFailure || null,
        errorCategory: capsuleResult?.errorCategory || null,
        errorMessage: capsuleResult?.errorMessage || null,
      };
    }

    if (!capsule) {
      if (capsuleResult?.transientFailure) {
        return {
          ok: false,
          code: 'IDENTITY_BUNDLE_UNAVAILABLE',
          error: 'Identity bundle temporarily unavailable',
          details: {
            reason: 'capsule_transient_upstream_failure',
            missing: ['capsule'],
          },
          preflight: {
            identity: buildIdentityDiagnostics(identity, identityDetails),
            capsule: buildCapsuleDiagnostics(capsuleResult),
          },
        };
      }
      missing.push('capsule');
    } else if (typeof capsule !== 'object') {
      invalid.push('capsule');
    } else if (capsuleResult?.recovery?.applied && !isProtectedSystemConstruct(constructId)) {
      return {
        ok: false,
        code: 'IDENTITY_BUNDLE_INVALID',
        error: 'Recovered capsule is not authorized for this construct',
        details: { reason: 'unauthorized_capsule_recovery' },
        preflight: {
          identity: buildIdentityDiagnostics(identity, identityDetails),
          capsule: buildCapsuleDiagnostics(capsuleResult),
        },
      };
    }
  } catch (error) {
    return {
      ok: false,
      code: 'IDENTITY_BUNDLE_INVALID',
      error: 'Capsule load failed',
      details: { reason: 'capsule_loader_exception', message: error.message },
      preflight: {
        identity: buildIdentityDiagnostics(identity, identityDetails),
        capsule: { present: false, source: null },
      },
    };
  }

  if (missing.length > 0) {
    return {
      ok: false,
      code: 'IDENTITY_BUNDLE_MISSING',
      error: 'Required identity bundle components are missing',
      details: { missing },
      preflight: {
        identity: buildIdentityDiagnostics(identity, identityDetails),
        capsule: buildCapsuleDiagnostics(capsuleResult),
      },
    };
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      code: 'IDENTITY_BUNDLE_INVALID',
      error: 'Identity bundle components are invalid',
      details: { invalid },
      preflight: {
        identity: buildIdentityDiagnostics(identity, identityDetails),
        capsule: buildCapsuleDiagnostics(capsuleResult),
      },
    };
  }

  return {
    ok: true,
    identity,
    capsule,
    preflight: {
      identity: buildIdentityDiagnostics(identity, identityDetails),
      capsule: buildCapsuleDiagnostics(capsuleResult),
    },
  };
}
