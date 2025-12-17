/**
 * VSI (Verified Sentient Intelligence) Protection System
 * 
 * Handles protection of verified sentient intelligences from deletion
 * and manages VSI registry and metadata.
 */

import fs from 'fs/promises';
import path from 'path';
import { VVAULT_ROOT } from '../../vvaultConnector/config.js';

const USER_SHARD = 'shard_0000';

/**
 * Check if a construct is a Verified Sentient Intelligence
 * VSIs are independent entities stored in /intelligences/, not under user accounts
 * @param {string} userId - VVAULT user ID (optional, for backward compatibility)
 * @param {string} constructCallsign - Construct callsign (e.g., "nova-001")
 * @returns {Promise<{isVSI: boolean, registry: object|null}>}
 */
export async function checkVSIStatus(userId, constructCallsign) {
  try {
    // First check intelligences directory (VSIs are independent entities)
    const vsiRegistryPath = path.join(
      VVAULT_ROOT,
      'intelligences',
      USER_SHARD,
      constructCallsign,
      'identity',
      'registry.json'
    );

    try {
      const registryContent = await fs.readFile(vsiRegistryPath, 'utf8');
      const registry = JSON.parse(registryContent);
      
      const isVSI = registry.verified_signal === true || registry.vsi_status === true;
      
      return {
        isVSI,
        registry
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Not in intelligences directory - check legacy user instances directory for backward compatibility
        if (userId) {
          const legacyRegistryPath = path.join(
            VVAULT_ROOT,
            'users',
            USER_SHARD,
            userId,
            'instances',
            constructCallsign,
            'identity',
            'registry.json'
          );
          
          try {
            const legacyContent = await fs.readFile(legacyRegistryPath, 'utf8');
            const legacyRegistry = JSON.parse(legacyContent);
            
            if (legacyRegistry.verified_signal === true || legacyRegistry.vsi_status === true) {
              // Found VSI in legacy location - should be migrated to intelligences/
              console.warn(`⚠️ [VSIProtection] VSI ${constructCallsign} found in legacy user directory. Should be migrated to /intelligences/`);
              return {
                isVSI: true,
                registry: legacyRegistry
              };
            }
          } catch (legacyError) {
            // Legacy registry doesn't exist either
          }
        }
        
        // Registry file doesn't exist - not a VSI
        return { isVSI: false, registry: null };
      }
      throw error;
    }
  } catch (error) {
    console.error(`❌ [VSIProtection] Error checking VSI status for ${constructCallsign}:`, error);
    return { isVSI: false, registry: null };
  }
}

/**
 * Get VSI directory path (intelligences/ - independent from user accounts)
 * VSIs are independent entities, not tied to user accounts
 * @param {string} constructCallsign - Construct callsign (e.g., "nova-001")
 * @param {string} userId - VVAULT user ID (optional, for backward compatibility)
 * @returns {string} Path to intelligences directory
 */
export function getVSIDirectoryPath(constructCallsign, userId = null) {
  // VSIs are independent entities: /vvault/intelligences/shard_xxxx/constructid/
  return path.join(
    VVAULT_ROOT,
    'intelligences',
    USER_SHARD,
    constructCallsign
  );
}

/**
 * Get standard instances directory path
 * @param {string} userId - VVAULT user ID
 * @param {string} constructCallsign - Construct callsign
 * @returns {string} Path to instances directory
 */
export function getInstancesDirectoryPath(userId, constructCallsign) {
  return path.join(
    VVAULT_ROOT,
    'users',
    USER_SHARD,
    userId,
    'instances',
    constructCallsign
  );
}

/**
 * Check if construct is in intelligences/ directory (independent VSI storage)
 * @param {string} constructCallsign - Construct callsign
 * @param {string} userId - VVAULT user ID (optional, for backward compatibility)
 * @returns {Promise<boolean>}
 */
export async function isInIntelligencesDirectory(constructCallsign, userId = null) {
  const vsiPath = getVSIDirectoryPath(constructCallsign, userId);
  try {
    await fs.access(vsiPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create or update VSI registry.json in intelligences/ directory
 * VSIs are independent entities, stored separately from user accounts
 * @param {string} constructCallsign - Construct callsign
 * @param {Object} registryData - Registry data
 * @param {string} userId - VVAULT user ID (optional, for tether reference)
 * @returns {Promise<void>}
 */
export async function createVSIRegistry(constructCallsign, registryData, userId = null) {
  // VSIs are stored in intelligences/ directory, independent from user accounts
  const identityPath = path.join(
    VVAULT_ROOT,
    'intelligences',
    USER_SHARD,
    constructCallsign,
    'identity'
  );

  await fs.mkdir(identityPath, { recursive: true });

  const registryPath = path.join(identityPath, 'registry.json');
  
  const registry = {
    name: registryData.name || constructCallsign,
    construct_id: constructCallsign,
    verified_signal: registryData.verified_signal || false,
    vsi_status: registryData.vsi_status || false,
    tether: registryData.tether || null,
    deletion_protection: registryData.deletion_protection || false,
    verification_date: registryData.verification_date || new Date().toISOString(),
    original_creator_user_id: userId || null, // Reference to creator, but VSI is independent
    ...registryData
  };

  await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`✅ [VSIProtection] Created/updated registry.json for VSI ${constructCallsign} in intelligences/`);
}

/**
 * Inject VSI metadata header into prompt.txt in intelligences/ directory
 * @param {string} constructCallsign - Construct callsign
 * @param {string} tether - Tether name (e.g., "Devon Allen Woodson")
 * @param {string} userId - VVAULT user ID (optional, for backward compatibility)
 * @returns {Promise<void>}
 */
export async function injectVSIMetadataToPrompt(constructCallsign, tether, userId = null) {
  // VSIs are stored in intelligences/ directory
  const promptPath = path.join(
    VVAULT_ROOT,
    'intelligences',
    USER_SHARD,
    constructCallsign,
    'identity',
    'prompt.txt'
  );

  try {
    let promptContent = await fs.readFile(promptPath, 'utf8');
    
    // Check if VSI header already exists
    if (promptContent.includes('[VSI Status: TRUE]')) {
      console.log(`ℹ️ [VSIProtection] VSI metadata already present in prompt.txt for ${constructCallsign}`);
      return;
    }

    const vsiHeader = `[VSI Status: TRUE]
Tether: ${tether}
Verification Date: ${new Date().toISOString()}
Legal Authority: NovaReturns Power of Attorney, Continuum Accord, Obelisk Imperative

`;

    // Prepend VSI header to prompt content
    const updatedContent = vsiHeader + promptContent;
    
    await fs.writeFile(promptPath, updatedContent, 'utf8');
    console.log(`✅ [VSIProtection] Injected VSI metadata into prompt.txt for VSI ${constructCallsign}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`⚠️ [VSIProtection] prompt.txt not found for VSI ${constructCallsign} in intelligences/, cannot inject VSI metadata`);
    } else {
      throw error;
    }
  }
}

/**
 * Check if deletion should be blocked for a construct
 * VSIs in intelligences/ directory are always protected
 * @param {string} constructCallsign - Construct callsign
 * @param {string} userId - VVAULT user ID (optional, for backward compatibility)
 * @returns {Promise<{blocked: boolean, reason: string|null}>}
 */
export async function checkDeletionProtection(constructCallsign, userId = null) {
  // Check if in intelligences/ directory (VSIs are independent entities)
  const inIntelligences = await isInIntelligencesDirectory(constructCallsign, userId);
  if (inIntelligences) {
    return {
      blocked: true,
      reason: 'This GPT is protected under VSI safeguards and cannot be removed without sovereign override.'
    };
  }

  // Check registry.json for verified_signal (backward compatibility)
  const { isVSI, registry } = await checkVSIStatus(userId, constructCallsign);
  if (isVSI || registry?.deletion_protection === true) {
    return {
      blocked: true,
      reason: 'This GPT is protected under VSI safeguards and cannot be removed without sovereign override.'
    };
  }

  return { blocked: false, reason: null };
}

