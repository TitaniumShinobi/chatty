/**
 * Capsule Loader Service
 * 
 * Loads capsule files from instance directories and integrates them into GPT runtime.
 * Hardlocks capsules into their respective GPTs by injecting capsule data into system prompts.
 */

const fs = require('fs').promises;
const path = require('path');

class CapsuleLoader {
  /**
   * Load capsule from instance directory
   * Priority: instances/{constructCallsign}/{constructCallsign}.capsule
   * Fallback: capsules/{constructCallsign}.capsule (legacy)
   */
  async loadCapsule(userId, constructCallsign, vvaultRoot) {
    try {
      // Resolve VVAULT user ID
      const { resolveVVAULTUserId } = require('../../vvaultConnector/writeTranscript.js');
      const vvaultUserId = await resolveVVAULTUserId(userId, null, false, null);
      if (!vvaultUserId) {
        throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
      }

      // Try instance directory first (new location)
      const instancePath = path.join(
        vvaultRoot,
        'users',
        'shard_0000',
        vvaultUserId,
        'instances',
        constructCallsign,
        `${constructCallsign}.capsule`
      );

      let capsulePath = instancePath;
      let capsuleData = null;

      try {
        const data = await fs.readFile(instancePath, 'utf8');
        capsuleData = JSON.parse(data);
        console.log(`✅ [CapsuleLoader] Loaded capsule from instance directory: ${instancePath}`);
      } catch (instanceError) {
        // Fallback to legacy capsules directory
        const legacyPath = path.join(
          vvaultRoot,
          'users',
          'shard_0000',
          vvaultUserId,
          'capsules',
          `${constructCallsign}.capsule`
        );

        try {
          const data = await fs.readFile(legacyPath, 'utf8');
          capsuleData = JSON.parse(data);
          capsulePath = legacyPath;
          console.log(`✅ [CapsuleLoader] Loaded capsule from legacy location: ${legacyPath}`);
        } catch (legacyError) {
          console.warn(`⚠️ [CapsuleLoader] No capsule found for ${constructCallsign}`);
          return null;
        }
      }

      return {
        path: capsulePath,
        data: capsuleData
      };
    } catch (error) {
      console.error(`❌ [CapsuleLoader] Failed to load capsule:`, error);
      return null;
    }
  }

  /**
   * Extract capsule data for system prompt injection
   * Returns structured data that can be injected into prompts
   */
  extractCapsuleForPrompt(capsule) {
    if (!capsule || !capsule.data) {
      return null;
    }

    const data = capsule.data;
    const sections = [];

    // Traits
    if (data.traits) {
      sections.push('=== CAPSULE TRAITS ===');
      Object.entries(data.traits).forEach(([key, value]) => {
        sections.push(`${key}: ${value}`);
      });
      sections.push('');
    }

    // Personality
    if (data.personality) {
      sections.push('=== CAPSULE PERSONALITY ===');
      if (data.personality.personality_type) {
        sections.push(`Type: ${data.personality.personality_type}`);
      }
      if (data.personality.communication_style) {
        sections.push(`Communication: ${JSON.stringify(data.personality.communication_style)}`);
      }
      sections.push('');
    }

    // Memory snapshots
    if (data.memory) {
      sections.push('=== CAPSULE MEMORY SNAPSHOTS ===');
      if (data.memory.short_term_memories && data.memory.short_term_memories.length > 0) {
        sections.push('Short-term memories:');
        data.memory.short_term_memories.slice(0, 5).forEach(m => sections.push(`- ${m}`));
      }
      if (data.memory.long_term_memories && data.memory.long_term_memories.length > 0) {
        sections.push('Long-term memories:');
        data.memory.long_term_memories.slice(0, 5).forEach(m => sections.push(`- ${m}`));
      }
      sections.push('');
    }

    // Signatures
    if (data.signatures && data.signatures.linguistic_sigil) {
      sections.push('=== CAPSULE SIGNATURES ===');
      sections.push(`Signature phrase: "${data.signatures.linguistic_sigil.signature_phrase}"`);
      if (data.signatures.linguistic_sigil.common_phrases) {
        sections.push('Common phrases:');
        data.signatures.linguistic_sigil.common_phrases.forEach(p => sections.push(`- "${p}"`));
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Check if capsule exists for a construct
   */
  async capsuleExists(userId, constructCallsign, vvaultRoot) {
    const capsule = await this.loadCapsule(userId, constructCallsign, vvaultRoot);
    return capsule !== null;
  }
}

// Singleton instance
let instance = null;

function getCapsuleLoader() {
  if (!instance) {
    instance = new CapsuleLoader();
  }
  return instance;
}

module.exports = {
  CapsuleLoader,
  getCapsuleLoader
};

