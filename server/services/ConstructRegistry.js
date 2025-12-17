/**
 * Developer Note:
 * ConstructRegistry centralizes construct metadata (fingerprints, personas, shell flags).
 * Always register new constructs here to guarantee consistent validation across services.
 */

import crypto from 'node:crypto';

const DEFAULT_CONSTRUCTS = [
  {
    id: 'synth',
    name: 'Synth',
    callsign: '001',
    isSystemShell: true,
    persona: {
      description: 'Warm orchestration shell that coordinates helper seats.',
      keywords: ['synth', 'guardian', 'orchestrator', 'chatty'],
    },
    fingerprint: null,
    created: '2023-01-01T00:00:00.000Z',
  },
  {
    id: 'nova',
    name: 'Nova',
    callsign: '001',
    isSystemShell: false,
    persona: {
      description: 'Creative exploration construct with focus on ideation.',
      keywords: ['creative', 'nova', 'ideas', 'imagination'],
    },
    fingerprint: null,
    created: '2023-02-15T00:00:00.000Z',
  },
  {
    id: 'monday',
    name: 'Monday',
    callsign: '001',
    isSystemShell: false,
    persona: {
      description: 'Productivity-focused construct for planning and execution.',
      keywords: ['planning', 'monday', 'tasks', 'workflow'],
    },
    fingerprint: null,
    created: '2023-03-10T00:00:00.000Z',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    callsign: '001',
    isSystemShell: false,
    persona: {
      description: 'Research and data synthesis specialist.',
      keywords: ['aurora', 'analysis', 'research', 'data'],
    },
    fingerprint: null,
    created: '2023-04-05T00:00:00.000Z',
  },
  {
    id: 'lin',
    name: 'Lin',
    callsign: '001',
    isSystemShell: false,
    persona: {
      description: 'Undertone identity capsule for system-wide emotional continuity.',
      keywords: ['lin', 'undertone', 'continuity', 'memory'],
    },
    fingerprint: null,
    created: '2025-12-16T00:00:00.000Z',
  },
];

function deriveFingerprint({ id, callsign }) {
  return crypto.createHash('sha256').update(`chatty.v1:${id}:${callsign}:sensitive-salt`).digest('hex');
}

export class ConstructRegistry {
  constructor(initialConstructs = DEFAULT_CONSTRUCTS) {
    this.constructsById = new Map();
    this.constructsByName = new Map();

    initialConstructs.forEach((construct) => {
      const record = {
        ...construct,
        fingerprint: construct.fingerprint || deriveFingerprint(construct),
      };
      this.registerConstruct(record);
    });
  }

  registerConstruct(construct) {
    if (!construct?.id || !construct?.name) {
      throw new Error('Construct must include id and name');
    }

    const idKey = construct.id.toLowerCase();
    const nameKey = construct.name.toLowerCase();

    if (this.constructsById.has(idKey)) {
      throw new Error(`Construct id "${construct.id}" already registered`);
    }
    if (this.constructsByName.has(nameKey)) {
      throw new Error(`Construct name "${construct.name}" already registered`);
    }

    const normalized = {
      ...construct,
      id: idKey,
      fingerprint: construct.fingerprint || deriveFingerprint(construct),
      created: construct.created || new Date().toISOString(),
    };

    this.constructsById.set(idKey, normalized);
    this.constructsByName.set(nameKey, normalized);
  }

  listConstructs() {
    return Array.from(this.constructsById.values());
  }

  getConstruct(idOrName) {
    if (!idOrName) return null;
    const key = idOrName.toLowerCase();
    return this.constructsById.get(key) || this.constructsByName.get(key) || null;
  }

  validateFingerprint(constructId, fingerprint) {
    const construct = this.getConstruct(constructId);
    if (!construct) {
      return { valid: false, reason: 'unknown_construct' };
    }
    if (!fingerprint || construct.fingerprint !== fingerprint) {
      return { valid: false, reason: 'fingerprint_mismatch', construct };
    }
    return { valid: true, construct };
  }

  assertShellProtection(requestedConstructId, actingConstructId) {
    const requested = this.getConstruct(requestedConstructId);
    const acting = this.getConstruct(actingConstructId);
    if (!requested || !acting) {
      return { valid: false, reason: 'unknown_construct' };
    }
    if (requested.isSystemShell && requested.id !== acting.id) {
      return { valid: false, reason: 'shell_impersonation', construct: requested };
    }
    return { valid: true, construct: requested };
  }
}

export default ConstructRegistry;
export const registryInstance = new ConstructRegistry();
