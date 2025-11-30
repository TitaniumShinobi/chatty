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

    // FORCE MODE: Skip ChromaDB initialization if disabled
    if (process.env.ENABLE_CHROMADB !== 'true') {
      console.log('🚫 [IdentityService] ChromaDB disabled in FORCE MODE - skipping initialization');
      this.initialized = true; // Mark as initialized to prevent retry loops
      return;
    }

    try {
      // Try to import ChromaDB (may not be installed)
      const chromadb = await import('chromadb').catch(() => null);
      
      if (!chromadb) {
        console.warn('⚠️ [IdentityService] chromadb package not installed. Run: npm install chromadb');
        throw new Error('ChromaDB package not installed');
      }

      ChromaClient = chromadb.ChromaClient;

      // ChromaDB Node.js client connects to a server (local or cloud)
      // For local development, ChromaDB server should be running (chroma run)
      // Default: http://localhost:8000
      const chromaServerUrl = process.env.CHROMA_SERVER_URL || 'http://localhost:8000';
      const chromaUrl = new URL(chromaServerUrl);
      const useSsl = chromaUrl.protocol === 'https:';
      const port = chromaUrl.port ? Number(chromaUrl.port) : useSsl ? 443 : 80;

      // Initialize client (connects to ChromaDB server)
      this.client = new ChromaClient({
        host: chromaUrl.hostname,
        port,
        ssl: useSsl
      });

      // Test connection with retry logic
      const maxRetries = 10;
      const retryDelay = 1000; // 1 second between retries
      let connected = false;
      let lastError = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client.heartbeat();
          connected = true;
          console.log(`✅ [IdentityService] Connected to ChromaDB at ${chromaServerUrl}${attempt > 1 ? ` (after ${attempt} attempts)` : ''}`);
          break;
      } catch (heartbeatError) {
          lastError = heartbeatError;
          
          // If this is not the last attempt, wait and retry
          if (attempt < maxRetries) {
            console.log(`🔄 [IdentityService] ChromaDB not ready yet, retrying in ${retryDelay}ms... (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!connected) {
        console.warn(`⚠️ [IdentityService] ChromaDB server not available at ${chromaServerUrl} after ${maxRetries} attempts.`);
        console.warn(`⚠️ [IdentityService] Run 'chroma run' to start local server, or set CHROMA_SERVER_URL env var.`);
        console.warn(`⚠️ [IdentityService] Memory operations will fail until ChromaDB is running.`);
        // Clear client if connection failed - don't allow operations with unconnected client
        this.client = null;
        // Don't throw - allow graceful degradation
      }

      // Only mark as initialized if we have a connected client
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
   * Get or create collection for a construct (USER-SCOPED)
   * @param {string} vvaultUserId - VVAULT user ID (for isolation)
   * @param {string} constructCallsign - Construct-callsign (e.g., "synth-001")
   * @param {string} memoryType - "short-term" or "long-term"
   */
  async getCollection(vvaultUserId, constructCallsign, memoryType) {
    if (!this.initialized || !this.client) {
      throw new Error('ChromaDB not initialized. Ensure ChromaDB server is running.');
    }

    // User-scoped collection name to match /instances/ isolation
    const collectionName = `${vvaultUserId}_${constructCallsign}_${memoryType}_identity`;
    
    try {
      // Try to get existing collection
      const collectionOptions = { name: collectionName };
      if (this.embedder) {
        collectionOptions.embeddingFunction = this.embedder;
      }
      const collection = await this.client.getCollection(collectionOptions);
      return collection;
    } catch (error) {
      // Collection doesn't exist, create it
      const collection = await this.client.createCollection({
        name: collectionName,
        ...(this.embedder ? { embeddingFunction: this.embedder } : {}),
        metadata: {
          vvaultUserId,
          constructCallsign,
          memoryType,
          created: new Date().toISOString()
        }
      });
      console.log(`✅ [IdentityService] Created user-scoped collection: ${collectionName}`);
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

      // Check if ChromaDB is available (graceful degradation)
      if (!this.initialized || !this.client) {
        console.warn('⚠️ [IdentityService] ChromaDB not available. Skipping memory storage. Run "chroma run" to enable persistent memory.');
        // Return success but mark as skipped (don't fail the conversation)
        return { success: true, skipped: true, reason: 'ChromaDB not available' };
      }

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
        memory_type: memoryType,
        anchorType: metadata.anchorType || metadata.anchor_type || null,
        names: metadata.names || metadata.people || null,
        dates: metadata.dates || null,
        relationshipPattern: metadata.relationshipPattern || null,
        significance: metadata.significance || null,
        emotionalState: metadata.emotionalState || null,
        seedSource: metadata.seedSource || null,
        testMemory: metadata.testMemory || false
      };

      // Strip null fields to avoid bloating stored document
      Object.keys(document).forEach((key) => {
        if (document[key] === null || document[key] === undefined) {
          delete document[key];
        }
      });

      const metadataForStorage = {
        session_id: sessionId,
        timestamp,
        memory_type: memoryType,
        construct_callsign: constructCallsign,
        anchorType: metadata.anchorType || metadata.anchor_type,
        names: metadata.names || metadata.people,
        dates: metadata.dates,
        relationshipPattern: metadata.relationshipPattern,
        significance: metadata.significance,
        emotionalState: metadata.emotionalState,
        seedSource: metadata.seedSource,
        testMemory: metadata.testMemory === true,
        sourceModel: metadata.sourceModel || 'gpt-4o'
      };

      Object.keys(metadataForStorage).forEach((key) => {
        if (metadataForStorage[key] === undefined || metadataForStorage[key] === null) {
          delete metadataForStorage[key];
        }
      });

      // Get appropriate collection (user-scoped)
      const collection = await this.getCollection(vvaultUserId, constructCallsign, memoryType);

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
        metadatas: [metadataForStorage]
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
   * @param {object} options - Additional query options
   * @param {string} options.queryMode - 'semantic' (default) or 'anchor' for anchor-based queries
   * @param {string[]} options.anchorTypes - Filter by anchor types: 'claim', 'vow', 'boundary', 'core-statement', 'defining-moment', 'relationship-marker'
   * @param {number} options.minSignificance - Minimum significance score for anchors (0-1)
   * @param {string[]} options.relationshipPatterns - Filter by relationship pattern types
   * @param {string} options.emotionalState - Filter by emotional state
   */
  async queryIdentities(userId, constructCallsign, query, limit = 10, options = {}) {
    try {
      await this.initialize();

      // Check if ChromaDB is available
      if (!this.initialized || !this.client) {
        console.warn(`⚠️ [IdentityService] ChromaDB not initialized. Cannot query memories for ${constructCallsign}.`);
        return [];
      }

      // Resolve user ID to VVAULT format
      const vvaultUserId = await this.resolveUserId(userId);

      const queryTexts = Array.isArray(query) ? query : [query];
      const results = [];
      const queryMode = options.queryMode || 'semantic';
      const anchorTypes = options.anchorTypes || [];
      const minSignificance = options.minSignificance || 0;
      const relationshipPatterns = options.relationshipPatterns || [];
      const emotionalState = options.emotionalState;

      // Log query details for debugging
      console.log(`🔍 [IdentityService] Querying memories for ${constructCallsign}:`, {
        query: queryTexts.join(', '),
        limit,
        queryMode,
        anchorTypes: anchorTypes.length > 0 ? anchorTypes : 'none',
        userId: vvaultUserId
      });

      // Build metadata filter for anchor-based queries
      const whereFilter = {};
      if (queryMode === 'anchor') {
        if (anchorTypes.length > 0) {
          whereFilter.anchorType = { $in: anchorTypes };
        }
        if (minSignificance > 0) {
          whereFilter.significance = { $gte: minSignificance };
        }
        if (relationshipPatterns.length > 0) {
          whereFilter.relationshipPattern = { $in: relationshipPatterns };
        }
        if (emotionalState) {
          whereFilter.emotionalState = emotionalState;
        }
      }

      // Query both short-term and long-term collections (user-scoped)
      for (const memoryType of ['short-term', 'long-term']) {
        try {
          const collection = await this.getCollection(vvaultUserId, constructCallsign, memoryType);
          const collectionName = `${vvaultUserId}_${constructCallsign}_${memoryType}`;
          console.log(`🔍 [IdentityService] Querying collection: ${collectionName}`);
          
          const queryResult = await collection.query({
            queryTexts,
            nResults: Math.ceil(limit / 2), // Split limit between ST and LT
            where: Object.keys(whereFilter).length > 0 ? whereFilter : {} // Use metadata filter for anchor queries
          });
          
          console.log(`📊 [IdentityService] Collection ${collectionName} returned ${queryResult.documents?.[0]?.length || 0} results`);

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
                
                // For anchor-based queries, prioritize by significance if available
                const significance = metadata.significance || content.significance || (queryMode === 'anchor' ? 0.8 : 0.5);
                const relevance = queryMode === 'anchor' && significance > 0
                  ? significance // Use significance for anchor queries
                  : (distance > 0 ? 1 - Math.min(distance, 1) : 1); // Use distance for semantic queries
                
                results.push({
                  context: content.context || '',
                  response: content.response || '',
                  timestamp: content.timestamp || metadata.timestamp || new Date().toISOString(),
                  relevance,
                  memoryType: content.memory_type || memoryType,
                  metadata: {
                    ...metadata,
                    anchorType: metadata.anchorType || content.anchorType,
                    significance: significance,
                    relationshipPattern: metadata.relationshipPattern || content.relationshipPattern,
                    emotionalState: metadata.emotionalState || content.emotionalState,
                  }
                });
              } catch (parseError) {
                console.warn('⚠️ [IdentityService] Failed to parse identity document:', parseError);
              }
            }
          }
        } catch (error) {
          // Collection may not exist yet, or ChromaDB server unavailable - which is fine
          console.debug(`[IdentityService] Collection ${vvaultUserId}_${constructCallsign}_${memoryType}_identity not accessible (expected if no memories yet or server unavailable):`, error.message);
        }
      }

      // Sort by relevance (or significance for anchor queries) and limit
      if (queryMode === 'anchor') {
        // For anchor queries, prioritize by significance, then relevance
        results.sort((a, b) => {
          const aSig = a.metadata?.significance || 0;
          const bSig = b.metadata?.significance || 0;
          if (Math.abs(aSig - bSig) > 0.1) {
            return bSig - aSig; // Sort by significance first
          }
          return b.relevance - a.relevance; // Then by relevance
        });
      } else {
        // For semantic queries, sort by relevance
        results.sort((a, b) => b.relevance - a.relevance);
      }
      const finalResults = results.slice(0, limit);
      console.log(`✅ [IdentityService] Query complete for ${constructCallsign}: Found ${finalResults.length} memories (from ${results.length} total)`);
      return finalResults;
    } catch (error) {
      console.error('❌ [IdentityService] Failed to query identities:', error);
      console.error('❌ [IdentityService] Error details:', {
        userId,
        constructCallsign,
        query: queryTexts,
        error: error.message
      });
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
      let anchorsExtracted = 0;

      // Extract memory anchors from transcript (if DeepTranscriptParser is available)
      let memoryAnchors = [];
      try {
        // Convert message pairs to format expected by DeepTranscriptParser
        const conversationPairs = messages
          .filter(m => m.user && m.assistant)
          .map((m, idx) => ({
            user: m.user.content,
            assistant: m.assistant.content,
            timestamp: m.timestamp || new Date().toISOString(),
            context: {
              sessionId: m.sessionId || constructCallsign,
              pairIndex: idx
            }
          }));

        if (conversationPairs.length > 0) {
          // Try to import DeepTranscriptParser (TypeScript file, may need compilation)
          try {
            const { DeepTranscriptParser } = await import('../../src/engine/transcript/DeepTranscriptParser.js');
            const parser = new DeepTranscriptParser('phi3:latest'); // Use default model
            
            // Extract memory anchors
            memoryAnchors = await parser.findMemoryAnchors(conversationPairs);
            anchorsExtracted = memoryAnchors.length;
            
            if (memoryAnchors.length > 0) {
              console.log(`🔍 [IdentityService] Extracted ${memoryAnchors.length} memory anchors from transcript`);
              
              // Store anchors in blueprint (if IdentityMatcher is available)
              try {
                const { IdentityMatcher } = await import('../../src/engine/character/IdentityMatcher.js');
                const matcher = new IdentityMatcher(VVAULT_ROOT);
                
                // Get or create blueprint
                const blueprint = await matcher.loadPersonalityBlueprint(userId, 'gpt', constructCallsign) || {
                  constructId: 'gpt',
                  callsign: constructCallsign,
                  coreTraits: [],
                  speechPatterns: [],
                  behavioralMarkers: [],
                  worldview: [],
                  memoryAnchors: [],
                  personalIdentifiers: [],
                  consistencyRules: []
                };
                
                // Merge extracted anchors with existing blueprint anchors
                const existingAnchors = new Map(blueprint.memoryAnchors.map(a => [a.anchor, a]));
                for (const anchor of memoryAnchors) {
                  const key = anchor.anchor;
                  if (!existingAnchors.has(key) || existingAnchors.get(key).significance < anchor.significance) {
                    existingAnchors.set(key, anchor);
                  }
                }
                blueprint.memoryAnchors = Array.from(existingAnchors.values());
                
                // Persist updated blueprint
                await matcher.persistPersonalityBlueprint(userId, 'gpt', constructCallsign, blueprint);
                console.log(`✅ [IdentityService] Updated blueprint with ${blueprint.memoryAnchors.length} memory anchors`);
              } catch (blueprintError) {
                console.warn(`⚠️ [IdentityService] Could not update blueprint with anchors (non-critical):`, blueprintError.message);
                // Continue - anchors are still extracted and can be used
              }
            }
          } catch (parserError) {
            console.warn(`⚠️ [IdentityService] Could not extract memory anchors (non-critical):`, parserError.message);
            // Continue - still import conversation pairs even if anchor extraction fails
          }
        }
      } catch (anchorError) {
        console.warn(`⚠️ [IdentityService] Anchor extraction error (non-critical, continuing import):`, anchorError.message);
      }

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

      console.log(`✅ [IdentityService] Imported ${importedCount} identities from transcript${anchorsExtracted > 0 ? ` (${anchorsExtracted} anchors extracted)` : ''}`);
      return { success: true, importedCount, anchorsExtracted };
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
