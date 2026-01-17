/**
 * Capsule Updater Service
 * 
 * Handles Safe Metadata Updates for Capsules.
 * Strictly enforces the "Never-Update" policy for core identity fields.
 * Uses capsuleIntegrityValidator for UUID/fingerprint preservation.
 */

export class CapsuleIntegrityError extends Error {
    constructor(type, expected, received) {
        super(`Capsule integrity error: ${type}. Expected ${expected}, received ${received}`);
        this.name = 'CapsuleIntegrityError';
    }
}

const SAFE_FIELDS = [
    'metadata.timestamp',
    'memory.last_memory_timestamp',
    'memory.memory_log',
    'memory.short_term_memories',
    'memory.episodic_memories'
];

const NEVER_UPDATE_FIELDS = [
    'metadata.instance_name',
    'metadata.uuid',
    'metadata.fingerprint_hash',
    'metadata.tether_signature',
    'metadata.capsule_version',
    'traits',
    'personality',
    'environment',
    'signatures'
];

/**
 * Updates a capsule's metadata while preserving core identity structure.
 * @param {Object} originalCapsule - The existing capsule object
 * @param {Object} updates - The new data to merge in (only safe fields will be used)
 * @returns {Object} - The safely updated capsule
 */
export function updateCapsuleMetadata(originalCapsule, updates) {
    if (!originalCapsule || !updates) {
        throw new Error('Invalid input: originalCapsule and updates are required');
    }

    // Use integrity validator to prepare update (preserves immutable fields, recalculates fingerprint if needed)
    const updatedCapsule = prepareCapsuleUpdate(originalCapsule, updates);

    // Apply memory updates
    if (updates.memory) {
        // Update Memory Log (if provided)
        if (updates.memory.memory_log) {
            if (!updatedCapsule.memory) updatedCapsule.memory = {};
            
            // Append new logs to existing ones, keeping last 50
            const currentLogs = updatedCapsule.memory.memory_log || [];
            const newLogs = updates.memory.memory_log || [];
            const mergedLogs = [...currentLogs, ...newLogs];
            
            // Sort by timestamp if available, else just take last 50
            updatedCapsule.memory.memory_log = mergedLogs.slice(-50);
        }

        // Update Short Term Memories (if provided - REPLACE strategy for short term)
        if (updates.memory.short_term_memories) {
            if (!updatedCapsule.memory) updatedCapsule.memory = {};
            updatedCapsule.memory.short_term_memories = updates.memory.short_term_memories;
        }

        // Update Episodic Memories (append strategy)
        if (updates.memory.episodic_memories) {
            if (!updatedCapsule.memory) updatedCapsule.memory = {};
            const currentEpisodic = updatedCapsule.memory.episodic_memories || [];
            const newEpisodic = updates.memory.episodic_memories || [];
            updatedCapsule.memory.episodic_memories = [...currentEpisodic, ...newEpisodic].slice(-10);
        }

        // Update last memory timestamp
        updatedCapsule.memory.last_memory_timestamp = new Date().toISOString();
    }

    // Recalculate fingerprint if content changed (prepareCapsuleUpdate already handles this, but ensure it's done)
    const {
        recalculateFingerprint,
        contentChanged
    } = await import('./capsuleIntegrityValidator.js');
    
    if (contentChanged(originalCapsule, updatedCapsule)) {
        updatedCapsule.metadata.fingerprint_hash = recalculateFingerprint(updatedCapsule);
    }

    // VALIDATION: Ensure NO core fields were touched
    const immutableValidation = validateImmutableFields(originalCapsule, updatedCapsule);
    if (!immutableValidation.valid) {
        const violations = immutableValidation.violations.map(v => v.message).join(', ');
        throw new CapsuleIntegrityError('immutable_fields', 'preserved', violations);
    }

    // Validate integrity (fingerprint matches content)
    const integrityValidation = validateCapsuleIntegrity(updatedCapsule);
    if (!integrityValidation.valid) {
        throw new Error(`Capsule integrity validation failed: ${integrityValidation.error}`);
    }

    return updatedCapsule;
}

// ESM Exports
// module.exports = {
//     updateCapsuleMetadata,
//     CapsuleIntegrityError
// };
