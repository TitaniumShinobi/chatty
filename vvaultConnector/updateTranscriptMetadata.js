const fs = require('fs').promises;
const path = require('path');
const { VVAULT_ROOT } = require('./config');

/**
 * Update import metadata in a transcript file
 * Adds or updates the connectedConstructId field in the IMPORT_METADATA comment
 * 
 * @param {string} userId - User ID
 * @param {string} sessionId - Session/thread ID (e.g., "zen-001" or detected construct ID)
 * @param {string} connectedConstructId - The construct ID to connect this conversation to
 * @returns {Promise<boolean>} - True if update was successful
 */
async function updateTranscriptConstructConnection(userId, sessionId, connectedConstructId) {
  try {
    const shard = 'shard_0000'; // Sequential sharding
    
    // Try to find the transcript file
    // First, try to extract construct from sessionId
    const constructMatch = sessionId.match(/^([a-z-]+)/);
    const possibleConstructId = constructMatch ? constructMatch[1] : null;
    
    // Search for the transcript file in user's instances
    const userInstancesPath = path.join(VVAULT_ROOT, 'users', shard, userId, 'instances');
    
    let transcriptFile = null;
    
    // Try to find the file by searching through construct folders
    try {
      const instanceFolders = await fs.readdir(userInstancesPath);
      
      for (const folder of instanceFolders) {
        const chattyDir = path.join(userInstancesPath, folder, 'chatty');
        try {
          const files = await fs.readdir(chattyDir);
          const transcriptMatch = files.find(f => f.startsWith('chat_with_') && f.endsWith('.md'));
          
          if (transcriptMatch) {
            const candidateFile = path.join(chattyDir, transcriptMatch);
            const content = await fs.readFile(candidateFile, 'utf8');
            
            // Check if this file has the sessionId in its import metadata
            const importMetadataMatch = content.match(/<!-- IMPORT_METADATA\n([\s\S]*?)\n-->/);
            if (importMetadataMatch) {
              try {
                const metadata = JSON.parse(importMetadataMatch[1]);
                // Check if conversationId matches or if sessionId matches the file pattern
                if (metadata.conversationId === sessionId || 
                    transcriptMatch.includes(sessionId.replace(/-/g, '_')) ||
                    transcriptMatch.includes(sessionId)) {
                  transcriptFile = candidateFile;
                  break;
                }
              } catch (e) {
                // Continue searching
              }
            }
          }
        } catch (e) {
          // Continue searching
        }
      }
    } catch (error) {
      console.warn('[updateTranscriptMetadata] Could not search constructs:', error.message);
    }
    
    if (!transcriptFile) {
      console.warn(`[updateTranscriptMetadata] Could not find transcript file for sessionId: ${sessionId}`);
      return false;
    }
    
    // Read the file
    let content = await fs.readFile(transcriptFile, 'utf8');
    
    // Find and update the IMPORT_METADATA block
    const importMetadataRegex = /<!-- IMPORT_METADATA\n([\s\S]*?)\n-->/;
    const match = content.match(importMetadataRegex);
    
    if (match) {
      try {
        const metadata = JSON.parse(match[1]);
        // Update the connectedConstructId
        metadata.connectedConstructId = connectedConstructId;
        metadata.connectedAt = new Date().toISOString();
        
        // Replace the metadata block
        const updatedMetadataBlock = `<!-- IMPORT_METADATA\n${JSON.stringify(metadata, null, 2)}\n-->`;
        content = content.replace(importMetadataRegex, updatedMetadataBlock);
        
        // Write back to file
        await fs.writeFile(transcriptFile, content, 'utf8');
        console.log(`✅ [updateTranscriptMetadata] Updated construct connection to ${connectedConstructId} in ${transcriptFile}`);
        return true;
      } catch (error) {
        console.error('[updateTranscriptMetadata] Failed to parse/update metadata:', error);
        return false;
      }
    } else {
      // No import metadata found - this might not be an imported conversation
      console.warn(`[updateTranscriptMetadata] No IMPORT_METADATA found in ${transcriptFile}`);
      return false;
    }
  } catch (error) {
    console.error('[updateTranscriptMetadata] Error updating transcript:', error);
    return false;
  }
}

module.exports = {
  updateTranscriptConstructConnection
};

