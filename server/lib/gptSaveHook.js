/**
 * GPT Save Hook - Automatically updates capsules when GPTs are saved
 * 
 * This module intercepts GPT save operations and ensures that capsules
 * are updated with the complete configuration data including:
 * - Instructions (system prompt)
 * - Uploaded files (transcripts, personality docs)
 * - Custom actions
 * - Model settings
 * - Conversation history
 */

import { getCapsuleIntegration } from './capsuleIntegration.js';

export class GPTSaveHook {
  constructor() {
    this.capsuleIntegration = getCapsuleIntegration();
  }

  /**
   * Hook that runs when a GPT is saved
   * @param {string} gptId - The GPT ID
   * @param {Object} gptConfig - Complete GPT configuration
   * @param {Array} recentMessages - Recent conversation messages
   * @returns {Promise<boolean>} Success status
   */
  async onGPTSave(gptId, gptConfig, recentMessages = []) {
    try {
      console.log(`🔗 [GPTSaveHook] Processing save for GPT: ${gptId}`);
      
      // Extract construct ID (e.g., 'gpt-katana-001' -> 'katana-001')
      const constructId = this.extractConstructId(gptId);
      
      // Validate that we have the necessary data
      if (!this.validateGPTConfig(gptConfig)) {
        console.warn(`⚠️ [GPTSaveHook] Invalid GPT config for ${gptId}, skipping capsule update`);
        return false;
      }
      
      // Update the capsule with complete configuration
      const success = await this.capsuleIntegration.saveCapsule(constructId, gptConfig, recentMessages);
      
      if (success) {
        console.log(`✅ [GPTSaveHook] Capsule updated successfully for ${constructId}`);
        
        // Clear cache to ensure fresh data on next load
        this.capsuleIntegration.clearCache();
        
        return true;
      } else {
        console.error(`❌ [GPTSaveHook] Failed to update capsule for ${constructId}`);
        return false;
      }
      
    } catch (error) {
      console.error(`❌ [GPTSaveHook] Error in save hook for ${gptId}:`, error);
      return false;
    }
  }

  /**
   * Extract construct ID from GPT ID
   * @param {string} gptId - Full GPT ID
   * @returns {string} Construct ID
   */
  extractConstructId(gptId) {
    // Handle various formats:
    // 'gpt-katana-001' -> 'katana-001'
    // 'katana-001' -> 'katana-001'
    // 'katana' -> 'katana-001'
    
    let constructId = gptId;
    
    // Remove 'gpt-' prefix if present
    if (constructId.startsWith('gpt-')) {
      constructId = constructId.substring(4);
    }
    
    // Add version number if not present
    if (!constructId.match(/-\d+$/)) {
      constructId += '-001';
    }
    
    return constructId;
  }

  /**
   * Validate GPT configuration has required fields
   * @param {Object} gptConfig - GPT configuration
   * @returns {boolean} Is valid
   */
  validateGPTConfig(gptConfig) {
    if (!gptConfig || typeof gptConfig !== 'object') {
      return false;
    }
    
    // Must have at least a name or instructions
    return !!(gptConfig.name || gptConfig.instructions || gptConfig.description);
  }

  /**
   * Hook for when a conversation message is added
   * This can be used to update capsules with conversation context
   * @param {string} gptId - The GPT ID
   * @param {Object} message - The message object
   * @returns {Promise<boolean>} Success status
   */
  async onMessageAdded(gptId, message) {
    try {
      // Only update capsule for assistant messages (GPT responses)
      if (message.role !== 'assistant') {
        return true;
      }
      
      const constructId = this.extractConstructId(gptId);
      
      // Load existing capsule
      const capsule = await this.capsuleIntegration.loadCapsule(constructId);
      if (!capsule) {
        console.warn(`⚠️ [GPTSaveHook] No capsule found for ${constructId}, cannot update with message`);
        return false;
      }
      
      // Add message to memory log
      capsule.memory_log = capsule.memory_log || [];
      capsule.memory_log.push(`assistant: ${message.content}`);
      
      // Keep only last 50 entries
      if (capsule.memory_log.length > 50) {
        capsule.memory_log = capsule.memory_log.slice(-50);
      }
      
      // Update timestamp
      capsule.metadata.timestamp = new Date().toISOString();
      
      // Save updated capsule (this will create a new version)
      const success = await this.capsuleIntegration.saveCapsule(constructId, {
        name: capsule.metadata.instance_name,
        instructions: capsule.configuration?.system_prompt || '',
        uploadedFiles: capsule.source_materials?.uploaded_files || [],
        actions: capsule.custom_actions || [],
        modelId: capsule.model_config?.model_id || 'default'
      }, [message]);
      
      if (success) {
        console.log(`📝 [GPTSaveHook] Updated capsule with new message for ${constructId}`);
      }
      
      return success;
      
    } catch (error) {
      console.error(`❌ [GPTSaveHook] Error updating capsule with message:`, error);
      return false;
    }
  }

  /**
   * Get capsule statistics for a construct
   * @param {string} constructId - The construct ID
   * @returns {Promise<Object>} Capsule stats
   */
  async getCapsuleStats(constructId) {
    try {
      const capsule = await this.capsuleIntegration.loadCapsule(constructId);
      if (!capsule) {
        return { exists: false };
      }
      
      return {
        exists: true,
        version: capsule.metadata.capsule_version,
        timestamp: capsule.metadata.timestamp,
        memoryEntries: capsule.memory_log?.length || 0,
        uploadedFiles: capsule.source_materials?.uploaded_files?.length || 0,
        customActions: capsule.custom_actions?.length || 0,
        personalityType: capsule.personality?.personality_type || 'Unknown',
        traits: capsule.traits || {}
      };
    } catch (error) {
      console.error(`❌ [GPTSaveHook] Error getting capsule stats:`, error);
      return { exists: false, error: error.message };
    }
  }
}

// Singleton instance
let gptSaveHook = null;

export function getGPTSaveHook() {
  if (!gptSaveHook) {
    gptSaveHook = new GPTSaveHook();
  }
  return gptSaveHook;
}
