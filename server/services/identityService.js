/**
 * Identity Service
 * Native Chatty implementation of Memup functionality (no Frame dependency)
 * Provides identity/memory management with ChromaDB for conversational continuity
 */

import { resolveVVAULTUserId } from '../../vvaultConnector/writeTranscript.js';
import { VVAULT_ROOT } from '../../vvaultConnector/config.js';
import path from 'path';
import fs from 'fs/promises';

// ChromaDB will be imported dynamically (check if installed)
let ChromaClient = null;
let DefaultEmbeddingFunction = null;

const SHORT_TERM_THRESHOLD_DAYS = 7; // Memories newer than this go to short-term

class IdentityService {
  constructor() {
    this.client = null;
    this.embedder = null;
    this.initialized = false;
  }

  /**
   * Initialize ChromaDB client and embedding function
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Try to import ChromaDB (may not be installed)
      const chromadb = await import('chromadb').catch(() => null);
      
      if (!chromadb) {
        console.warn('⚠️ [IdentityService] chromadb package not installed. Run: npm install chromadb');
        throw new Error('ChromaDB package not installed');
      }

      ChromaClient = chromadb.ChromaClient;
      DefaultEmbeddingFunction = chromadb.DefaultEmbeddingFunction;

      // ChromaDB Node.js client connects to a server (local or cloud)
      // For local development, ChromaDB server should be running (chroma run)
      // Default: http://localhost:8000
      const chromaServerUrl = process.env.CHROMA_SERVER_URL || 'http://localhost:8000';

      // Initialize client (connects to ChromaDB server)
      this.client = new ChromaClient({
        path: chromaServerUrl
      });

      // Initialize embedding function (uses all-MiniLM-L6-v2 by default)
      this.embedder = new DefaultEmbeddingFunction();

      // Test connection
      try {
        await this.client.heartbeat();
        console.log(`✅ [IdentityService] Connected to ChromaDB at ${chromaServerUrl}`);
      } catch (heartbeatError) {
        console.warn(`⚠️ [IdentityService] ChromaDB server not available at ${chromaServerUrl}. Run 'chroma run' to start local server, or set CHROMA_SERVER_URL env var.`);
        // Don't throw - allow graceful degradation
      }

      this.initialized = true;
    } catch (error) {
      console.error('❌ [IdentityService] Failed to initialize:', error);
      // Don't throw - allow graceful degradation if ChromaDB unavailable
      this.initialized = false;
    }
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
      console.error('❌ [IdentityService] Failed to resolve user ID:', error);
      throw error;
    }
  }

  /**
   * Get or create collection for a construct
   * @param {string} constructCallsign - Construct-callsign (e.g., "synth-001")
   * @param {string} memoryType - "short-term" or "long-term"
   */
  async getCollection(constructCallsign, memoryType) {
    if (!this.initialized || !this.client) {
      throw new Error('ChromaDB not initialized. Ensure ChromaDB server is running.');
    }

    const collectionName = `${constructCallsign}_${memoryType}_identity`;
    
    try {
      // Try to get existing collection
      const collection = await this.client.getCollection({
        name: collectionName,
        embeddingFunction: this.embedder
      });
      return collection;
    } catch (error) {
      // Collection doesn't exist, create it
      const collection = await this.client.createCollection({
        name: collectionName,
        embeddingFunction: this.embedder,
        metadata: {
          constructCallsign,
          memoryType,
          created: new Date().toISOString()
        }
      });
      console.log(`✅ [IdentityService] Created collection: ${collectionName}`);
      return collection;
    }
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
      return ageDays < SHORT_TERM_THRESHOLD_DAYS ? 'short-term' : 'long-term';
    } catch {
      return 'short-term';
    }
  }

  /**
   * Add identity/memory to ChromaDB
   * @param {string} userId - Chatty user ID
   * @param {string} constructCallsign - Construct-callsign (e.g., "luna-001")
   * @param {string} context - User message/context
   * @param {string} response - AI response
   * @param {object} metadata - Additional metadata
   */
  async addIdentity(userId, constructCallsign, context, response, metadata = {}) {
    try {
      await this.initialize();

      // Resolve user ID to VVAULT format
      const vvaultUserId = await this.resolveUserId(userId, metadata.email);

      // Determine memory type
      const memoryType = metadata.memoryType || this.determineMemoryType(metadata.timestamp);

      // Create unique ID
      const sessionId = metadata.sessionId || `${constructCallsign}_${Date.now()}`;
      const uniqueId = `${sessionId}_${this.hashString(context)}`;

      // Create document
      const timestamp = metadata.timestamp || new Date().toISOString();
      const document = {
        session_id: sessionId,
        context,
        response,
        user_preference: metadata.userPreference || '',
        source_model: metadata.sourceModel || 'gpt-4o',
        timestamp,
        memory_type: memoryType
      };

      // Get appropriate collection
      const collection = await this.getCollection(constructCallsign, memoryType);

      // Check for duplicates
      try {
        const existing = await collection.get({ ids: [uniqueId] });
        if (existing.ids && existing.ids.length > 0) {
          console.log(`🛑 [IdentityService] Duplicate detected. Skipping ID ${uniqueId}`);
          return { success: true, id: uniqueId, duplicate: true };
        }
      } catch (error) {
        // Collection.get may throw if ID doesn't exist, which is fine
      }

      // Add to collection (ChromaDB Node.js API)
      await collection.add({
        ids: [uniqueId],
        documents: [JSON.stringify(document)],
        metadatas: [{
          session_id: sessionId,
          timestamp,
          memory_type: memoryType,
          construct_callsign: constructCallsign
        }]
      });

      // Verify storage
      try {
        const stored = await collection.get({ ids: [uniqueId] });
        if (stored.ids && stored.ids.length > 0) {
          console.log(`✅ [IdentityService] Identity verified as stored for ID ${uniqueId}`);
        } else {
          console.warn(`⚠️ [IdentityService] Identity may not have been stored properly for ID ${uniqueId}`);
        }
      } catch (error) {
        console.error(`❌ [IdentityService] Error verifying identity storage: ${error}`);
      }

      console.log(`📦 [IdentityService] Added ${memoryType} identity for ${constructCallsign} with ID ${uniqueId}`);
      return { success: true, id: uniqueId, memoryType };
    } catch (error) {
      console.error('❌ [IdentityService] Failed to add identity:', error);
      throw error;
    }
  }

  /**
   * Query identities/memories from ChromaDB
   * @param {string} userId - Chatty user ID
   * @param {string} constructCallsign - Construct-callsign (e.g., "luna-001")
   * @param {string|string[]} query - Query text(s)
   * @param {number} limit - Maximum number of results
   */
  async queryIdentities(userId, constructCallsign, query, limit = 10) {
    try {
      await this.initialize();

      // Resolve user ID to VVAULT format
      const vvaultUserId = await this.resolveUserId(userId);

      const queryTexts = Array.isArray(query) ? query : [query];
      const results = [];

      // Query both short-term and long-term collections
      for (const memoryType of ['short-term', 'long-term']) {
        try {
          const collection = await this.getCollection(constructCallsign, memoryType);
          
          const queryResult = await collection.query({
            queryTexts,
            nResults: Math.ceil(limit / 2), // Split limit between ST and LT
            where: {} // Can add session_id filter here if needed (metadata filter)
          });

          // Process results
          if (queryResult.documents && queryResult.documents.length > 0) {
            // ChromaDB returns documents as array of arrays (one per query text)
            const documents = Array.isArray(queryResult.documents[0]) ? queryResult.documents[0] : queryResult.documents;
            const metadatas = Array.isArray(queryResult.metadatas?.[0]) ? queryResult.metadatas[0] : (queryResult.metadatas || []);
            const distances = Array.isArray(queryResult.distances?.[0]) ? queryResult.distances[0] : (queryResult.distances || []);
            
            for (let i = 0; i < documents.length; i++) {
              const docStr = documents[i];
              const metadata = metadatas[i] || {};
              const distance = distances[i] || 0;

              try {
                const content = typeof docStr === 'string' ? JSON.parse(docStr) : docStr;
                results.push({
                  context: content.context || '',
                  response: content.response || '',
                  timestamp: content.timestamp || metadata.timestamp || new Date().toISOString(),
                  relevance: distance > 0 ? 1 - Math.min(distance, 1) : 1, // Convert distance to relevance score (0-1)
                  memoryType: content.memory_type || memoryType
                });
              } catch (parseError) {
                console.warn('⚠️ [IdentityService] Failed to parse identity document:', parseError);
              }
            }
          }
        } catch (error) {
          // Collection may not exist yet, or ChromaDB server unavailable - which is fine
          console.debug(`[IdentityService] Collection ${constructCallsign}_${memoryType}_identity not accessible (expected if no memories yet or server unavailable):`, error.message);
        }
      }

      // Sort by relevance and limit
      results.sort((a, b) => b.relevance - a.relevance);
      return results.slice(0, limit);
    } catch (error) {
      console.error('❌ [IdentityService] Failed to query identities:', error);
      // Return empty array on error (don't break conversation flow)
      return [];
    }
  }

  /**
   * Import transcript markdown file into ChromaDB
   * @param {string} userId - Chatty user ID
   * @param {string} constructCallsign - Construct-callsign
   * @param {string} transcriptPath - Path to transcript markdown file
   */
  async importTranscriptAsIdentity(userId, constructCallsign, transcriptPath) {
    try {
      await this.initialize();

      // Resolve user ID
      const vvaultUserId = await this.resolveUserId(userId);

      // Read transcript file
      const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');

      // Parse transcript to extract user/assistant message pairs
      const messages = this.parseTranscriptMarkdown(transcriptContent);

      let importedCount = 0;

      // Import each message pair as an identity
      for (const messagePair of messages) {
        if (messagePair.user && messagePair.assistant) {
          await this.addIdentity(
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

      console.log(`✅ [IdentityService] Imported ${importedCount} identities from transcript`);
      return { success: true, importedCount };
    } catch (error) {
      console.error('❌ [IdentityService] Failed to import transcript:', error);
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

      // If we have both user and assistant, create an identity pair
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
   * Simple hash function for content-based deduplication
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Health check - verify ChromaDB is accessible
   */
  async healthCheck() {
    try {
      await this.initialize();
      if (!this.client) {
        return {
          healthy: false,
          error: 'ChromaDB client not initialized'
        };
      }
      
      // Test connection
      await this.client.heartbeat();
      const collections = await this.client.listCollections();
      return {
        healthy: true,
        collections: collections.length,
        serverUrl: process.env.CHROMA_SERVER_URL || 'http://localhost:8000'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        note: 'ChromaDB server may not be running. Run "chroma run" to start local server, or set CHROMA_SERVER_URL env var.'
      };
    }
  }
}

// Export singleton instance
let instance = null;
export function getIdentityService() {
  if (!instance) {
    instance = new IdentityService();
  }
  return instance;
}

export default IdentityService;

