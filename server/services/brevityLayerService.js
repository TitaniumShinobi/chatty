/**
 * Brevity Layer Service
 * 
 * Server-side service for reading/writing brevity layer configuration
 * and analytical sharpness settings to VVAULT filesystem.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy load VVAULT config
let VVAULT_ROOT = null;
let resolveVVAULTUserId = null;

async function loadVVAULTModules() {
  if (VVAULT_ROOT && resolveVVAULTUserId) return;
  
  try {
    // Use dynamic import for ES modules
    const configModule = await import('../../vvaultConnector/config.js');
    VVAULT_ROOT = configModule.VVAULT_ROOT;
    
    const writeTranscriptModule = await import('../../vvaultConnector/writeTranscript.js');
    resolveVVAULTUserId = writeTranscriptModule.resolveVVAULTUserId;
  } catch (error) {
    console.error('❌ [BrevityLayerService] Failed to load VVAULT modules:', error);
    throw error;
  }
}

/**
 * Get the brevity config file path for a construct
 */
function getBrevityConfigPath(vvaultUserId, constructCallsign) {
  const shard = 'shard_0000';
  return path.join(
    VVAULT_ROOT,
    'users',
    shard,
    vvaultUserId,
    'instances',
    constructCallsign,
    'brevity',
    'config.json'
  );
}

/**
 * Get the analytical sharpness config file path for a construct
 */
function getAnalyticsConfigPath(vvaultUserId, constructCallsign) {
  const shard = 'shard_0000';
  return path.join(
    VVAULT_ROOT,
    'users',
    shard,
    vvaultUserId,
    'instances',
    constructCallsign,
    'brevity',
    'analytics.json'
  );
}

/**
 * Read brevity configuration from VVAULT
 */
export async function readBrevityConfig(userId, constructCallsign, userEmail = null, userName = null) {
  try {
    await loadVVAULTModules();
    
    const vvaultUserId = await resolveVVAULTUserId(userId, userEmail, true, userName);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
    }
    
    const configPath = getBrevityConfigPath(vvaultUserId, constructCallsign);
    
    try {
      const content = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(content);
      console.log(`✅ [BrevityLayerService] Read brevity config for ${constructCallsign}`);
      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Config doesn't exist, return null (caller should use defaults)
        console.log(`ℹ️ [BrevityLayerService] No brevity config found for ${constructCallsign}, using defaults`);
        return null;
      }
      throw error;
    }
  } catch (error) {
    console.error(`❌ [BrevityLayerService] Failed to read brevity config:`, error);
    throw error;
  }
}

/**
 * Write brevity configuration to VVAULT
 */
export async function writeBrevityConfig(userId, constructCallsign, config, userEmail = null) {
  try {
    await loadVVAULTModules();
    
    const vvaultUserId = await resolveVVAULTUserId(userId, userEmail);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
    }
    
    const configPath = getBrevityConfigPath(vvaultUserId, constructCallsign);
    const configDir = path.dirname(configPath);
    
    // Ensure directory exists
    await fs.mkdir(configDir, { recursive: true });
    
    // Add timestamps
    const now = new Date().toISOString();
    const configWithTimestamps = {
      ...config,
      updatedAt: now,
      createdAt: config.createdAt || now,
    };
    
    // Write config file
    await fs.writeFile(configPath, JSON.stringify(configWithTimestamps, null, 2), 'utf8');
    
    console.log(`✅ [BrevityLayerService] Wrote brevity config for ${constructCallsign}`);
    return configWithTimestamps;
  } catch (error) {
    console.error(`❌ [BrevityLayerService] Failed to write brevity config:`, error);
    throw error;
  }
}

/**
 * Read analytical sharpness configuration from VVAULT
 */
export async function readAnalyticalSharpness(userId, constructCallsign, userEmail = null, userName = null) {
  try {
    await loadVVAULTModules();
    
    const vvaultUserId = await resolveVVAULTUserId(userId, userEmail, true, userName);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
    }
    
    const analyticsPath = getAnalyticsConfigPath(vvaultUserId, constructCallsign);
    
    try {
      const content = await fs.readFile(analyticsPath, 'utf8');
      const config = JSON.parse(content);
      console.log(`✅ [BrevityLayerService] Read analytical sharpness for ${constructCallsign}`);
      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Config doesn't exist, return null (caller should use defaults)
        console.log(`ℹ️ [BrevityLayerService] No analytical sharpness found for ${constructCallsign}, using defaults`);
        return null;
      }
      throw error;
    }
  } catch (error) {
    console.error(`❌ [BrevityLayerService] Failed to read analytical sharpness:`, error);
    throw error;
  }
}

/**
 * Write analytical sharpness configuration to VVAULT
 */
export async function writeAnalyticalSharpness(userId, constructCallsign, config, userEmail = null) {
  try {
    await loadVVAULTModules();
    
    const vvaultUserId = await resolveVVAULTUserId(userId, userEmail);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
    }
    
    const analyticsPath = getAnalyticsConfigPath(vvaultUserId, constructCallsign);
    const analyticsDir = path.dirname(analyticsPath);
    
    // Ensure directory exists
    await fs.mkdir(analyticsDir, { recursive: true });
    
    // Add timestamps
    const now = new Date().toISOString();
    const configWithTimestamps = {
      ...config,
      updatedAt: now,
      createdAt: config.createdAt || now,
    };
    
    // Write config file
    await fs.writeFile(analyticsPath, JSON.stringify(configWithTimestamps, null, 2), 'utf8');
    
    console.log(`✅ [BrevityLayerService] Wrote analytical sharpness for ${constructCallsign}`);
    return configWithTimestamps;
  } catch (error) {
    console.error(`❌ [BrevityLayerService] Failed to write analytical sharpness:`, error);
    throw error;
  }
}

