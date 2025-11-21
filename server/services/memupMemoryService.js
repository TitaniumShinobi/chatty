/**
 * Memup Memory Service
 * Wrapper around Frame's UnifiedMemoryBank for Chatty integration
 * Provides Node.js-compatible API for memory operations
 */

import { resolveVVAULTUserId } from '../../vvaultConnector/writeTranscript.js';
import { VVAULT_ROOT } from '../../vvaultConnector/config.js';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to Frame's Memup system
const FRAME_ROOT = path.resolve(__dirname, '../../../frame');
const MEMUP_BANK_SCRIPT = path.join(FRAME_ROOT, 'Terminal', 'Memup', 'bank.py');

class MemupMemoryService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Resolve Chatty user ID to VVAULT LIFE format
   */
  async resolveUserId(chattyUserId, email = null) {
    try {
      const vvaultUserId = await resolveVVAULTUserId(chattyUserId, email);
      if (!vvaultUserId) {
        throw new Error(`Cannot resolve VVAULT user ID for: ${chattyUserId}`);
      }
      return vvaultUserId;
    } catch (error) {
      console.error('❌ [MemupMemoryService] Failed to resolve user ID:', error);
      throw error;
    }
  }

  /**
   * Execute Python script for memory operations
   * Uses Frame's bank.py via subprocess
   */
  async executePythonCommand(command, args = {}) {
    return new Promise((resolve, reject) => {
      // Check if Python script exists
      fs.access(MEMUP_BANK_SCRIPT)
        .then(() => {
          const pythonProcess = spawn('python3', [
            MEMUP_BANK_SCRIPT,
            command,
            JSON.stringify(args)
          ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.dirname(MEMUP_BANK_SCRIPT)
          });

          let stdout = '';
          let stderr = '';

          pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          pythonProcess.on('close', (code) => {
            if (code === 0) {
              try {
                const result = stdout.trim() ? JSON.parse(stdout) : { success: true };
                resolve(result);
              } catch (error) {
                // If output is not JSON, return as string
                resolve({ success: true, output: stdout });
              }
            } else {
              reject(new Error(`Python process failed with code ${code}: ${stderr || stdout}`));
            }
          });

          pythonProcess.on('error', (error) => {
            reject(new Error(`Failed to start Python process: ${error.message}`));
          });
        })
        .catch(() => {
          // Fallback: Direct ChromaDB access if Python bridge not available
          console.warn('⚠️ [MemupMemoryService] Frame Python script not found, using direct ChromaDB access');
          return this.executeDirectChromaDB(command, args)
            .then(resolve)
            .catch(reject);
        });
    });
  }

  /**
   * Direct ChromaDB access (fallback if Python bridge unavailable)
   * Requires chromadb npm package
   */
  async executeDirectChromaDB(command, args) {
    try {
      // Try to import chromadb (may not be installed)
      const { ChromaClient } = await import('chromadb').catch(() => {
        throw new Error('ChromaDB client not available. Install chromadb package or ensure Frame Python scripts are accessible.');
      });

      const client = new ChromaClient({
        path: path.join(VVAULT_ROOT, 'nova-001', 'Memories', 'chroma_db')
      });

      // Construct-specific collection name
      const constructCallsign = args.constructCallsign || 'synth-001';
      const collectionName = `${constructCallsign}_${args.memoryType || 'long_term'}_memory`;

      switch (command) {
        case 'add_memory':
          const collection = await client.getOrCreateCollection({
            name: collectionName
          });
          
          const document = {
            session_id: args.sessionId,
            context: args.context,
            response: args.response,
            timestamp: args.timestamp || new Date().toISOString(),
            memory_type: args.memoryType || 'short-term'
          };

          await collection.add({
            documents: [JSON.stringify(document)],
            metadatas: [{
              session_id: args.sessionId,
              timestamp: document.timestamp,
              memory_type: document.memory_type
            }],
            ids: [`${args.sessionId}_${Date.now()}`]
          });

          return { success: true, id: `${args.sessionId}_${Date.now()}` };

        case 'query_memories':
          const queryCollection = await client.getCollection({ name: collectionName });
          const results = await queryCollection.query({
            queryTexts: Array.isArray(args.query) ? args.query : [args.query],
            nResults: args.limit || 10,
            where: args.sessionId ? { session_id: args.sessionId } : {}
          });

          return {
            success: true,
            memories: results.documents.map((doc, i) => ({
              content: JSON.parse(doc),
              distance: results.distances?.[0]?.[i],
              id: results.ids[0]?.[i]
            }))
          };

        default:
          throw new Error(`Unknown command: ${command}`);
      }
    } catch (error) {
      console.error('❌ [MemupMemoryService] Direct ChromaDB access failed:', error);
      throw error;
    }
  }

  /**
   * Add memory to Memup memory bank
   * @param {string} userId - Chatty user ID (will be resolved to VVAULT format)
   * @param {string} constructCallsign - Construct-callsign (e.g., "luna-001")
   * @param {string} context - User message/context
   * @param {string} response - AI response
   * @param {object} metadata - Additional metadata
   */
  async addMemory(userId, constructCallsign, context, response, metadata = {}) {
    try {
      // Resolve user ID to VVAULT format
      const vvaultUserId = await this.resolveUserId(userId, metadata.email);

      // Determine memory type (short-term vs long-term)
      const memoryType = metadata.memoryType || this.determineMemoryType(metadata.timestamp);

      // Call Python script or direct ChromaDB
      const result = await this.executePythonCommand('add_memory', {
        userId: vvaultUserId,
        constructCallsign,
        sessionId: metadata.sessionId || `${constructCallsign}_${Date.now()}`,
        context,
        response,
        memoryType,
        timestamp: metadata.timestamp || new Date().toISOString(),
        sourceModel: metadata.sourceModel || 'gpt-4o',
        userPreference: metadata.userPreference || ''
      });

      console.log(`✅ [MemupMemoryService] Memory added for ${constructCallsign}`);
      return result;
    } catch (error) {
      console.error('❌ [MemupMemoryService] Failed to add memory:', error);
      throw error;
    }
  }

  /**
   * Query memories from Memup memory bank
   * @param {string} userId - Chatty user ID
   * @param {string} constructCallsign - Construct-callsign (e.g., "luna-001")
   * @param {string|string[]} query - Query text(s)
   * @param {number} limit - Maximum number of results
   */
  async queryMemories(userId, constructCallsign, query, limit = 10) {
    try {
      // Resolve user ID to VVAULT format
      const vvaultUserId = await this.resolveUserId(userId);

      // Call Python script or direct ChromaDB
      const result = await this.executePythonCommand('query_memories', {
        userId: vvaultUserId,
        constructCallsign,
        query: Array.isArray(query) ? query : [query],
        limit,
        sessionId: null // Query across all sessions for this construct
      });

      if (result.success && result.memories) {
        // Format memories for prompt injection
        return result.memories.map(m => {
          const content = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
          return {
            context: content.context,
            response: content.response,
            timestamp: content.timestamp,
            relevance: 1 - (m.distance || 0) // Convert distance to relevance score
          };
        });
      }

      return [];
    } catch (error) {
      console.error('❌ [MemupMemoryService] Failed to query memories:', error);
      // Return empty array on error (don't break conversation flow)
      return [];
    }
  }

  /**
   * Import transcript markdown file into Memup memory bank
   * @param {string} userId - Chatty user ID
   * @param {string} constructCallsign - Construct-callsign
   * @param {string} transcriptPath - Path to transcript markdown file
   */
  async importTranscriptAsMemory(userId, constructCallsign, transcriptPath) {
    try {
      // Resolve user ID
      const vvaultUserId = await this.resolveUserId(userId);

      // Read transcript file
      const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');

      // Parse transcript to extract user/assistant message pairs
      const messages = this.parseTranscriptMarkdown(transcriptContent);

      let importedCount = 0;

      // Import each message pair as a memory
      for (const messagePair of messages) {
        if (messagePair.user && messagePair.assistant) {
          await this.addMemory(
            userId,
            constructCallsign,
            messagePair.user.content,
            messagePair.assistant.content,
            {
              sessionId: messagePair.sessionId || constructCallsign,
              timestamp: messagePair.timestamp,
              memoryType: this.determineMemoryType(messagePair.timestamp)
            }
          );
          importedCount++;
        }
      }

      console.log(`✅ [MemupMemoryService] Imported ${importedCount} memories from transcript`);
      return { success: true, importedCount };
    } catch (error) {
      console.error('❌ [MemupMemoryService] Failed to import transcript:', error);
      throw error;
    }
  }

  /**
   * Parse transcript markdown to extract message pairs
   * @param {string} markdown - Transcript markdown content
   * @returns {Array} Array of {user, assistant, timestamp, sessionId} objects
   */
  parseTranscriptMarkdown(markdown) {
    const messages = [];
    const lines = markdown.split('\n');
    
    let currentUser = null;
    let currentAssistant = null;
    let currentTimestamp = null;
    let currentSessionId = null;

    // Extract session ID from IMPORT_METADATA if present
    const metadataMatch = markdown.match(/<!-- IMPORT_METADATA[\s\S]*?conversationId["\s:]+([^"}\s]+)/);
    if (metadataMatch) {
      currentSessionId = metadataMatch[1];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match user message: **TIME - UserName**: content
      const userMatch = line.match(/^\*\*([^*]+)\s*-\s*([^*]+)\*\*:\s*(.+)$/);
      if (userMatch) {
        const [, time, userName, content] = userMatch;
        // Check if this is a user (not a construct name)
        if (!this.isConstructName(userName)) {
          currentUser = { content: content.trim(), timestamp: time.trim() };
          currentTimestamp = time.trim();
        }
        continue;
      }

      // Match assistant message: **TIME - ConstructName**: content
      const assistantMatch = line.match(/^\*\*([^*]+)\s*-\s*([^*]+)\*\*:\s*(.+)$/);
      if (assistantMatch) {
        const [, time, constructName, content] = assistantMatch;
        if (this.isConstructName(constructName)) {
          currentAssistant = { content: content.trim(), timestamp: time.trim() };
          currentTimestamp = time.trim();
        }
        continue;
      }

      // If we have both user and assistant, create a memory pair
      if (currentUser && currentAssistant) {
        messages.push({
          user: currentUser,
          assistant: currentAssistant,
          timestamp: currentTimestamp,
          sessionId: currentSessionId
        });
        currentUser = null;
        currentAssistant = null;
      }
    }

    return messages;
  }

  /**
   * Check if a name is a construct name (not a user)
   */
  isConstructName(name) {
    const normalized = name.toLowerCase().trim();
    const knownConstructs = [
      'synth', 'lin', 'nova', 'katana', 'aurora', 'monday', 
      'frame', 'chatty', 'assistant', 'ai', 'luna', 'sera'
    ];
    return knownConstructs.some(c => normalized.includes(c));
  }

  /**
   * Determine memory type based on timestamp
   * Short-term: < 7 days, Long-term: >= 7 days
   */
  determineMemoryType(timestamp) {
    if (!timestamp) return 'short-term';

    try {
      const memoryDate = new Date(timestamp);
      const ageDays = (Date.now() - memoryDate.getTime()) / (1000 * 60 * 60 * 24);
      return ageDays < 7 ? 'short-term' : 'long-term';
    } catch {
      return 'short-term';
    }
  }
}

// Export singleton instance
let instance = null;
export function getMemupMemoryService() {
  if (!instance) {
    instance = new MemupMemoryService();
  }
  return instance;
}

export default MemupMemoryService;

