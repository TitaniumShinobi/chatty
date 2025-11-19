/**
 * Developer Note:
 * MessageAttributionService stamps every packet with construct metadata and
 * verifies signatures downstream before persisting logs or sending to clients.
 */

export class MessageAttributionService {
  constructor({ registry }) {
    if (!registry) {
      throw new Error('MessageAttributionService requires a ConstructRegistry instance');
    }
    this.registry = registry;
  }

  attachMetadata({ constructId, content, metadata = {} }) {
    const construct = this.registry.getConstruct(constructId);
    if (!construct) {
      throw new Error(`Unknown construct "${constructId}"`);
    }

    return {
      constructId: construct.id,
      constructName: construct.name,
      fingerprint: construct.fingerprint,
      timestamp: new Date().toISOString(),
      contentPreview: typeof content === 'string' ? content.slice(0, 120) : undefined,
      ...metadata,
    };
  }

  verifyAttribution(attribution) {
    if (!attribution?.constructId) {
      return { valid: false, reason: 'missing_construct' };
    }
    const construct = this.registry.getConstruct(attribution.constructId);
    if (!construct) {
      return { valid: false, reason: 'unknown_construct' };
    }
    if (construct.fingerprint !== attribution.fingerprint) {
      return { valid: false, reason: 'fingerprint_mismatch' };
    }
    return { valid: true, construct };
  }
}

export default MessageAttributionService;
