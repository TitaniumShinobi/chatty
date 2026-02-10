/**
 * Developer Note:
 * IdentityEnforcementService validates fingerprints, prevents shell impersonation,
 * and emits drift/alert telemetry for observability pipelines.
 */

export class IdentityEnforcementService {
  constructor({ registry, driftDetector }) {
    if (!registry) {
      throw new Error('IdentityEnforcementService requires a ConstructRegistry instance');
    }
    this.registry = registry;
    this.driftDetector = driftDetector;
  }

  validateIncomingMessage({ constructId, fingerprint, content }) {
    const result = this.registry.validateFingerprint(constructId, fingerprint);
    if (!result.valid) {
      console.warn('[Identity] Fingerprint validation failed', {
        constructId,
        reason: result.reason,
      });
      return {
        valid: false,
        reason: result.reason ?? 'validation_failed',
      };
    }

    const impersonation = this.detectImpersonation(result.construct, content || '');
    if (impersonation) {
      console.warn('[Identity] Impersonation detected', {
        constructId: result.construct.id,
      });
      this.emitAlert('impersonation', { constructId: result.construct.id, content });
      return { valid: false, reason: impersonation };
    }

    return { valid: true, construct: result.construct };
  }

  detectImpersonation(construct, content) {
    if (!content) return null;
    const normalized = content.toLowerCase();
    const constructs = this.registry.listConstructs();
    for (const candidate of constructs) {
      if (candidate.id === construct.id) continue;
      const markers = [candidate.name.toLowerCase(), candidate.id.toLowerCase()];
      if (markers.some(marker => marker && normalized.includes(`i am ${marker}`))) {
        return 'impersonation_attempt';
      }
    }
    return null;
  }

  enforceShellProtection(requestedConstructId, actingConstructId) {
    return this.registry.assertShellProtection(requestedConstructId, actingConstructId);
  }

  recordDrift(construct, message) {
    if (!this.driftDetector || !construct) return null;
    const result = this.driftDetector.recordMessage(construct, message);
    if (result?.isDrifting) {
      this.emitAlert('drift', {
        constructId: construct.id,
        driftScore: result.driftScore,
      });
    }
    return result;
  }

  emitAlert(eventType, payload) {
    if (!eventType) return;
    const target = process.env.IDENTITY_ALERT_WEBHOOK_URL;
    const logPayload = { eventType, ...payload };
    if (!target) {
      console.warn('[Identity][Alert]', logPayload);
      return;
    }
    // Lightweight webhook dispatch using fetch (fire-and-forget)
    if (typeof fetch !== 'function') {
      console.warn('[Identity] fetch unavailable, skipping webhook dispatch');
      return;
    }
    try {
      fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logPayload),
      }).catch((error) => {
        console.warn('[Identity] Alert webhook failed', error.message);
      });
    } catch (error) {
      console.warn('[Identity] Alert dispatch error', error.message);
    }
  }
}

export default IdentityEnforcementService;
