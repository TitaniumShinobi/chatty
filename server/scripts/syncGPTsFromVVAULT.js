/**
 * Sync GPTs from VVAULT File System to Database
 * 
 * Scans VVAULT instances directory for GPT folders and registers them
 * in the database if they don't already exist.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { VVAULT_ROOT } from '../../vvaultConnector/config.js';
import { AIManager } from '../lib/aiManager.js';
import { FileManagementAutomation } from '../lib/fileManagementAutomation.js';
import { parsePromptTxt, validatePromptFormat } from '../lib/promptParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const aiManager = AIManager.getInstance();

/**
 * Scan VVAULT for GPT instances
 * @param {string} userId - VVAULT user ID
 * @param {string} shard - Shard ID (default: shard_0000)
 * @returns {Promise<Array>} Array of GPT info objects
 */
async function scanVVAULTForGPTs(userId, shard = 'shard_0000') {
  const instancesDir = path.join(VVAULT_ROOT, 'users', shard, userId, 'instances');
  
  try {
    await fs.access(instancesDir);
  } catch (error) {
    console.warn(`⚠️ [Sync] Instances directory not found: ${instancesDir}`);
    return [];
  }

  try {
    const constructs = await fs.readdir(instancesDir);
    const gpts = [];
    
    for (const constructCallsign of constructs) {
      // Skip canonical constructs (zen-001, lin-001)
      if (constructCallsign === 'zen-001' || constructCallsign === 'lin-001') {
        continue;
      }
      
      const instancePath = path.join(instancesDir, constructCallsign);
      
      // Check if this is a GPT instance (has identity directory)
      const identityPath = path.join(instancePath, 'identity');
      
      try {
        await fs.access(identityPath);
        
        // Try to read prompt.txt to extract GPT info
        let name = constructCallsign;
        let description = null; // Will be set from prompt.txt or remain null
        let instructions = '';
        let privacy = 'private'; // Default to private, user can update manually
        
        try {
          const promptPath = path.join(identityPath, 'prompt.txt');
          const promptContent = await fs.readFile(promptPath, 'utf-8');
          
          // Use centralized parser
          const parsed = parsePromptTxt(promptContent);
          
          // Validate format and log warnings
          const validation = validatePromptFormat(promptContent);
          if (!validation.valid && validation.warnings.length > 0) {
            console.warn(`⚠️ [Sync] Prompt format warnings for ${constructCallsign}:`);
            validation.warnings.forEach(warning => {
              console.warn(`   - ${warning}`);
            });
          }
          
          // Use parsed values (with fallbacks)
          if (parsed.name) {
            name = parsed.name;
          }
          if (parsed.description) {
            description = parsed.description;
          }
          if (parsed.instructions) {
            // Limit instructions length to prevent database issues
            instructions = parsed.instructions.substring(0, 10000);
          }
          
          // Fallback: if no description was parsed, use a default
          if (!description) {
            description = `GPT instance: ${name || constructCallsign}`;
          }
        } catch (promptError) {
          console.warn(`⚠️ [Sync] Could not read prompt.txt for ${constructCallsign}: ${promptError.message}`);
          // Use fallback description if prompt.txt read fails
          description = `GPT instance: ${constructCallsign}`;
        }
        
        // Try to read privacy from capsule metadata if available
        try {
          const capsulePath = path.join(identityPath, `${constructCallsign}.capsule`);
          const capsuleContent = await fs.readFile(capsulePath, 'utf-8');
          const capsuleData = JSON.parse(capsuleContent);
          
          // Check if privacy is stored in capsule metadata
          if (capsuleData.metadata?.privacy) {
            privacy = capsuleData.metadata.privacy;
            console.log(`📋 [Sync] Found privacy setting in capsule for ${constructCallsign}: ${privacy}`);
          } else if (capsuleData.additional_data?.privacy) {
            privacy = capsuleData.additional_data.privacy;
            console.log(`📋 [Sync] Found privacy setting in additional_data for ${constructCallsign}: ${privacy}`);
          }
        } catch (capsuleError) {
          // Capsule might not exist or might not be JSON, that's okay
          // Default to 'private' will be used
        }
        
        gpts.push({
          constructCallsign,
          name,
          description,
          instructions,
          privacy,
          instancePath
        });
      } catch {
        // No identity directory, skip
        continue;
      }
    }
    
    return gpts;
  } catch (error) {
    console.error(`❌ [Sync] Failed to scan VVAULT for user ${userId}:`, error);
    return [];
  }
}

/**
 * Sync GPTs from VVAULT to database
 * @param {string} userId - VVAULT user ID
 * @returns {Promise<Object>} Sync results
 */
async function syncGPTsToDatabase(userId) {
  console.log(`🔍 [Sync] Scanning VVAULT for GPTs for user: ${userId}`);
  
  const gpts = await scanVVAULTForGPTs(userId);
  console.log(`📊 [Sync] Found ${gpts.length} GPT instances in VVAULT`);
  
  if (gpts.length === 0) {
    return { synced: [], skipped: [], total: 0, errors: [] };
  }
  
  const fileManager = new FileManagementAutomation(userId);
  const synced = [];
  const skipped = [];
  const errors = [];
  
  for (const gpt of gpts) {
    try {
      // Check if already exists in database
      const existing = await aiManager.getAIByCallsign(gpt.constructCallsign, userId);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'syncGPTsFromVVAULT.js:132',message:'checking existing GPT',data:{constructCallsign:gpt.constructCallsign,exists:!!existing,existingId:existing?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-run',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      if (existing) {
        console.log(`⏭️  [Sync] Skipping ${gpt.constructCallsign} - already in database as ${existing.id}`);
        skipped.push({
          constructCallsign: gpt.constructCallsign,
          reason: 'already_exists',
          existingId: existing.id
        });
        continue;
      }
      
      // Create in database
      // Note: Privacy defaults to 'private' for synced GPTs
      // If GPT was previously in store, user will need to update privacy manually after sync
      const aiData = {
        name: gpt.name,
        description: gpt.description,
        instructions: gpt.instructions || '',
        constructCallsign: gpt.constructCallsign,
        userId,
        privacy: gpt.privacy || 'private', // Use detected privacy or default to 'private'
        isActive: gpt.privacy === 'store' || gpt.privacy === 'link', // Set isActive based on privacy
        modelId: 'gpt-4' // Default model
      };
      
      if (gpt.privacy === 'store') {
        console.log(`🏪 [Sync] Syncing ${gpt.constructCallsign} as store GPT (privacy='store')`);
      }
      
      const ai = await aiManager.createAI(aiData);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'syncGPTsFromVVAULT.js:183',message:'GPT created in database',data:{constructCallsign:gpt.constructCallsign,aiId:ai.id,privacy:ai.privacy},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-run',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      console.log(`✅ [Sync] Created database entry for ${gpt.constructCallsign} → ${ai.id}`);
      
      // Ensure all required files exist
      try {
        await fileManager.ensureGPTCreationFiles(gpt.constructCallsign, aiData);
        console.log(`📁 [Sync] Ensured files exist for ${gpt.constructCallsign}`);
      } catch (fileError) {
        console.warn(`⚠️ [Sync] File creation failed for ${gpt.constructCallsign}: ${fileError.message}`);
        // Don't fail the sync if file creation fails
      }
      
      synced.push({
        constructCallsign: gpt.constructCallsign,
        aiId: ai.id,
        name: gpt.name
      });
    } catch (error) {
      console.error(`❌ [Sync] Failed to sync ${gpt.constructCallsign}:`, error);
      errors.push({
        constructCallsign: gpt.constructCallsign,
        error: error.message
      });
    }
  }
  
  return { synced, skipped, total: gpts.length, errors };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('syncGPTsFromVVAULT.js')) {
  const userId = process.argv[2] || 'devon_woodson_1762969514958';
  
  syncGPTsToDatabase(userId)
    .then(result => {
      console.log(`\n✅ Sync complete:`);
      console.log(`   - Synced: ${result.synced.length}`);
      console.log(`   - Skipped: ${result.skipped.length}`);
      console.log(`   - Errors: ${result.errors.length}`);
      console.log(`   - Total found: ${result.total}`);
      
      if (result.synced.length > 0) {
        console.log(`\n📋 Synced GPTs:`);
        result.synced.forEach(gpt => {
          console.log(`   - ${gpt.constructCallsign} → ${gpt.aiId} (${gpt.name})`);
        });
        console.log(`\n⚠️  Note: Synced GPTs default to privacy='private'.`);
        console.log(`   If any GPTs should be in the store, update their privacy setting manually:`);
        console.log(`   - Edit the GPT in GPTsPage`);
        console.log(`   - Set privacy to "GPT Store"`);
        console.log(`   - Or use: UPDATE ais SET privacy='store' WHERE construct_callsign='<callsign>';`);
      }
      
      if (result.errors.length > 0) {
        console.log(`\n❌ Errors:`);
        result.errors.forEach(err => {
          console.log(`   - ${err.constructCallsign}: ${err.error}`);
        });
      }
      
      process.exit(result.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Sync failed:', error);
      process.exit(1);
    });
}

export { syncGPTsToDatabase, scanVVAULTForGPTs };

