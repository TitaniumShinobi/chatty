/**
 * Capsule Integrity Validator
 * 
 * Ensures UUIDs, fingerprint hashes, and tether signatures are NEVER modified.
 * These are immutable identifiers (like SSNs) that must remain constant.
 * 
 * Rules:
 * - UUID: Never changes (only generated for NEW capsules)
 * - fingerprint_hash: Only changes when content actually changes
 * - tether_signature: Never changes
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Immutable fields that must NEVER be modified
const IMMUTABLE_FIELDS = {
  metadata: [
    'uuid',
    'tether_signature',
    'instance_name',
    'capsule_version'
  ],
  root: [
    'traits',
    'personality',
    'signatures'
  ]
};

// Mutable fields that can be safely updated
const MUTABLE_FIELDS = [
  'metadata.timestamp',
  'memory.memory_log',
  'memory.short_term_memories',
  'memory.episodic_memories',
  'memory.last_memory_timestamp'
];

/**
 * Extract immutable fields from capsule
 * @param {Object} capsule - Capsule object
 * @returns {Object} Immutable fields snapshot
 */
function extractImmutableFields(capsule) {
  if (!capsule || !capsule.metadata) {
    return null;
  }

  const immutable = {
    metadata: {},
    traits: null,
    personality: null,
    signatures: null
  };

  // Extract immutable metadata fields
  IMMUTABLE_FIELDS.metadata.forEach(field => {
    if (capsule.metadata[field] !== undefined) {
      immutable.metadata[field] = capsule.metadata[field];
    }
  });

  // Extract root-level immutable fields
  IMMUTABLE_FIELDS.root.forEach(field => {
    if (capsule[field] !== undefined) {
      immutable[field] = JSON.parse(JSON.stringify(capsule[field])); // Deep clone
    }
  });

  return immutable;
}

/**
 * Restore immutable fields to capsule
 * @param {Object} capsule - Capsule to restore
 * @param {Object} immutableFields - Immutable fields snapshot
 */
function restoreImmutableFields(capsule, immutableFields) {
  if (!immutableFields || !capsule) {
    return;
  }

  // Restore immutable metadata fields
  if (immutableFields.metadata) {
    Object.keys(immutableFields.metadata).forEach(field => {
      if (capsule.metadata) {
        capsule.metadata[field] = immutableFields.metadata[field];
      }
    });
  }

  // Restore root-level immutable fields
  IMMUTABLE_FIELDS.root.forEach(field => {
    if (immutableFields[field] !== undefined) {
      capsule[field] = JSON.parse(JSON.stringify(immutableFields[field])); // Deep clone
    }
  });
}

/**
 * Recalculate fingerprint hash from capsule content
 * @param {Object} capsule - Capsule object
 * @returns {string} SHA-256 hash
 */
function recalculateFingerprint(capsule) {
  try {
    // Create deep copy
    const copy = JSON.parse(JSON.stringify(capsule));
    
    // Remove fingerprint_hash for calculation (it shouldn't affect the hash)
    if (copy.metadata) {
      delete copy.metadata.fingerprint_hash;
    }
    
    // Serialize to JSON with sorted keys for consistency
    const json = JSON.stringify(copy, Object.keys(copy).sort(), 2);
    
    // Calculate SHA-256 hash
    const hash = crypto.createHash('sha256').update(json, 'utf8').digest('hex');
    
    return hash;
  } catch (error) {
    console.error('[CapsuleIntegrityValidator] Error recalculating fingerprint:', error);
    throw new Error(`Failed to recalculate fingerprint: ${error.message}`);
  }
}

/**
 * Check if capsule content actually changed (excluding metadata timestamps)
 * @param {Object} original - Original capsule
 * @param {Object} updated - Updated capsule
 * @returns {boolean} True if content changed
 */
function contentChanged(original, updated) {
  try {
    // Create copies without timestamps for comparison
    const origCopy = JSON.parse(JSON.stringify(original));
    const updCopy = JSON.parse(JSON.stringify(updated));
    
    // Remove timestamps and fingerprint_hash for comparison
    if (origCopy.metadata) {
      delete origCopy.metadata.timestamp;
      delete origCopy.metadata.fingerprint_hash;
    }
    if (updCopy.metadata) {
      delete updCopy.metadata.timestamp;
      delete updCopy.metadata.fingerprint_hash;
    }
    
    // Compare JSON strings
    const origJson = JSON.stringify(origCopy, Object.keys(origCopy).sort());
    const updJson = JSON.stringify(updCopy, Object.keys(updCopy).sort());
    
    return origJson !== updJson;
  } catch (error) {
    console.error('[CapsuleIntegrityValidator] Error checking content change:', error);
    return true; // Assume changed if comparison fails (safer)
  }
}

/**
 * Validate capsule integrity (fingerprint matches content)
 * @param {Object} capsule - Capsule to validate
 * @returns {Object} Validation result { valid: boolean, error?: string }
 */
function validateCapsuleIntegrity(capsule) {
  try {
    if (!capsule || !capsule.metadata) {
      return { valid: false, error: 'Invalid capsule structure' };
    }

    const storedFingerprint = capsule.metadata.fingerprint_hash;
    if (!storedFingerprint) {
      return { valid: false, error: 'Missing fingerprint_hash' };
    }

    // Recalculate fingerprint
    const calculatedFingerprint = recalculateFingerprint(capsule);

    // Compare
    if (storedFingerprint !== calculatedFingerprint) {
      return {
        valid: false,
        error: 'Fingerprint mismatch',
        stored: storedFingerprint.substring(0, 16),
        calculated: calculatedFingerprint.substring(0, 16)
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Validate immutable fields were not modified
 * @param {Object} original - Original capsule
 * @param {Object} updated - Updated capsule
 * @returns {Object} Validation result { valid: boolean, violations?: Array }
 */
function validateImmutableFields(original, updated) {
  const violations = [];

  if (!original || !updated) {
    return { valid: false, violations: ['Missing original or updated capsule'] };
  }

  // Check metadata fields
  if (original.metadata && updated.metadata) {
    IMMUTABLE_FIELDS.metadata.forEach(field => {
      const originalValue = original.metadata[field];
      const updatedValue = updated.metadata[field];
      
      if (originalValue !== updatedValue) {
        violations.push({
          field: `metadata.${field}`,
          original: originalValue,
          updated: updatedValue,
          message: `Immutable field metadata.${field} was modified`
        });
      }
    });
  }

  // Check root-level fields
  IMMUTABLE_FIELDS.root.forEach(field => {
    const originalValue = original[field];
    const updatedValue = updated[field];
    
    const origJson = JSON.stringify(originalValue || {});
    const updJson = JSON.stringify(updatedValue || {});
    
    if (origJson !== updJson) {
      violations.push({
        field: field,
        original: originalValue,
        updated: updatedValue,
        message: `Immutable field ${field} was modified`
      });
    }
  });

  return {
    valid: violations.length === 0,
    violations: violations.length > 0 ? violations : undefined
  };
}

/**
 * Validate capsule before write operation
 * @param {string} capsulePath - Path to capsule file (optional, for loading original)
 * @param {Object} capsuleData - Capsule data to validate
 * @returns {Promise<Object>} Validation result
 */
async function validateBeforeWrite(capsulePath, capsuleData) {
  try {
    // Load original capsule if path provided
    let originalCapsule = null;
    if (capsulePath) {
      try {
        const content = await fs.readFile(capsulePath, 'utf8');
        originalCapsule = JSON.parse(content);
      } catch (error) {
        // File doesn't exist yet (new capsule) - that's okay
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    // If original exists, validate immutable fields weren't changed
    if (originalCapsule) {
      const immutableValidation = validateImmutableFields(originalCapsule, capsuleData);
      if (!immutableValidation.valid) {
        return {
          valid: false,
          error: 'Immutable fields were modified',
          violations: immutableValidation.violations
        };
      }
    }

    // Validate integrity (fingerprint matches content)
    const integrityValidation = validateCapsuleIntegrity(capsuleData);
    if (!integrityValidation.valid) {
      return integrityValidation;
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Validation error: ${error.message}`
    };
  }
}

/**
 * Prepare capsule for update (preserves immutable fields, recalculates fingerprint if needed)
 * @param {Object} originalCapsule - Original capsule
 * @param {Object} updates - Updates to apply
 * @returns {Object} Updated capsule with preserved immutable fields and recalculated fingerprint
 */
function prepareCapsuleUpdate(originalCapsule, updates) {
  // Extract immutable fields
  const immutableFields = extractImmutableFields(originalCapsule);
  
  // Create deep copy
  const updatedCapsule = JSON.parse(JSON.stringify(originalCapsule));
  
  // Apply updates (only mutable fields should be in updates)
  if (updates.metadata) {
    Object.assign(updatedCapsule.metadata, updates.metadata);
  }
  if (updates.memory) {
    updatedCapsule.memory = { ...updatedCapsule.memory, ...updates.memory };
  }
  
  // Restore immutable fields (in case updates tried to modify them)
  restoreImmutableFields(updatedCapsule, immutableFields);
  
  // Recalculate fingerprint if content changed
  if (contentChanged(originalCapsule, updatedCapsule)) {
    updatedCapsule.metadata.fingerprint_hash = recalculateFingerprint(updatedCapsule);
    console.log('[CapsuleIntegrityValidator] Content changed, recalculated fingerprint');
  }
  
  // Update timestamp
  updatedCapsule.metadata.timestamp = new Date().toISOString();
  
  return updatedCapsule;
}

/**
 * Custom error class for capsule integrity violations
 */
class CapsuleIntegrityError extends Error {
  constructor(field, originalValue, newValue) {
    const message = `Capsule integrity violation: ${field} changed from ${JSON.stringify(originalValue)} to ${JSON.stringify(newValue)}`;
    super(message);
    this.name = 'CapsuleIntegrityError';
    this.field = field;
    this.originalValue = originalValue;
    this.newValue = newValue;
  }
}

module.exports = {
  extractImmutableFields,
  restoreImmutableFields,
  recalculateFingerprint,
  contentChanged,
  validateCapsuleIntegrity,
  validateImmutableFields,
  validateBeforeWrite,
  prepareCapsuleUpdate,
  CapsuleIntegrityError,
  IMMUTABLE_FIELDS,
  MUTABLE_FIELDS
};

