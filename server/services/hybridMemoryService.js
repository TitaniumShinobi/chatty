/**
 * Hybrid Memory Service
 * 
 * Combines:
 * - Memup's bank.py approach (short-term/long-term memory separation)
 * - chatgpt-retrieval-plugin's retrieval approach (semantic search)
 * - VVAULT ChromaDB integration (direct connection to users/{userId}/instances/{constructCallsign}/memory/)
 * 
 * Features:
 * - Always-on background memory retrieval (zero downtime)
 * - Automatic ChromaDB indexing on transcript upload
 * - Per-response memory retrieval
 */

const { getIdentityService } = require('./identityService.js');
const fs = require('fs').promises;
const path = require('path');

class HybridMemoryService {
  constructor() {
    this.identityService = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      this.identityService = getIdentityService();
      await this.identityService.initialize();
      this.initialized = true;
      console.log('✅ [HybridMemoryService] Initialized');
    } catch (error) {
      console.error('❌ [HybridMemoryService] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Automatically index transcript to ChromaDB immediately after upload
   * Called by transcript upload handler
   */
  async autoIndexTranscript(userId, constructCallsign, transcriptPath) {
    try {
      await this.initialize();
      
      console.log(`📦 [HybridMemoryService] Auto-indexing transcript: ${transcriptPath}`);
      console.log(`📦 [HybridMemoryService] Construct: ${constructCallsign}, User: ${userId}`);
      
      // Import transcript as ChromaDB memories (immediate indexing)
      const result = await this.identityService.importTranscriptAsIdentity(
        userId,
        constructCallsign,
        transcriptPath
      );
      
      console.log(`✅ [HybridMemoryService] Auto-indexed ${result.importedCount} memories from transcript`);
      if (result.anchorsExtracted && result.anchorsExtracted > 0) {
        console.log(`🔍 [HybridMemoryService] Extracted ${result.anchorsExtracted} memory anchors`);
      }
      return result;
    } catch (error) {
      console.error('❌ [HybridMemoryService] Failed to auto-index transcript:', error);
      // Don't throw - allow transcript to be saved even if indexing fails
      return { success: false, importedCount: 0, error: error.message };
    }
  }

  /**
   * Retrieve memories from ChromaDB (always-on, per-response)
   * Hybrid approach: combines Memup's short-term/long-term separation with semantic search
   */
  async retrieveMemories(userId, constructCallsign, query, options = {}) {
    try {
      await this.initialize();
      
      const {
        limit = 10,
        memoryType = 'both', // 'short-term', 'long-term', or 'both'
        toneHints = []
      } = options;

      // Query ChromaDB (identityService handles short-term/long-term separation)
      const memories = await this.identityService.queryIdentities(
        userId,
        constructCallsign,
        query,
        limit,
        {
          memoryType, // Filter by memory type if specified
          toneHints // Use tone hints for better retrieval
        }
      );

      return {
        memories: memories.map(m => ({
          context: m.context || '',
          response: m.response || '',
          relevance: m.relevance || 0,
          timestamp: m.timestamp,
          memoryType: m.memoryType || 'long-term',
          metadata: m.metadata || {}
        })),
        totalFound: memories.length
      };
    } catch (error) {
      console.error('❌ [HybridMemoryService] Failed to retrieve memories:', error);
      return { memories: [], totalFound: 0, error: error.message };
    }
  }

  /**
   * Add memory to ChromaDB (for runtime conversations)
   * Automatically determines short-term vs long-term based on timestamp
   */
  async addMemory(userId, constructCallsign, context, response, metadata = {}) {
    try {
      await this.initialize();
      
      // Determine memory type based on timestamp (like Memup's bank.py)
      const memoryType = this.determineMemoryType(metadata.timestamp);
      
      await this.identityService.addIdentity(
        userId,
        constructCallsign,
        context,
        response,
        {
          ...metadata,
          memoryType,
          sessionId: metadata.sessionId || constructCallsign,
          sourceModel: metadata.sourceModel || 'chatty-runtime'
        }
      );
      
      return { success: true };
    } catch (error) {
      console.error('❌ [HybridMemoryService] Failed to add memory:', error);
      throw error;
    }
  }

  /**
   * Determine memory type (short-term vs long-term)
   * Based on Memup's bank.py logic: memories newer than 7 days are short-term
   */
  determineMemoryType(timestamp) {
    if (!timestamp) return 'short-term';
    
    try {
      const memoryTime = new Date(timestamp);
      const ageDays = (Date.now() - memoryTime.getTime()) / (1000 * 60 * 60 * 24);
      return ageDays < 7 ? 'short-term' : 'long-term';
    } catch (error) {
      return 'short-term'; // Default to short-term if timestamp parsing fails
    }
  }

  /**
   * Batch import multiple transcripts (for ZIP uploads)
   */
  async batchImportTranscripts(userId, constructCallsign, transcriptPaths) {
    const results = [];
    
    for (const transcriptPath of transcriptPaths) {
      try {
        const result = await this.autoIndexTranscript(userId, constructCallsign, transcriptPath);
        results.push({ path: transcriptPath, ...result });
      } catch (error) {
        results.push({
          path: transcriptPath,
          success: false,
          error: error.message
        });
      }
    }
    
    const totalImported = results.reduce((sum, r) => sum + (r.importedCount || 0), 0);
    console.log(`✅ [HybridMemoryService] Batch import complete: ${totalImported} total memories imported`);
    
    return {
      results,
      totalImported,
      success: results.every(r => r.success !== false)
    };
  }
}

// Singleton instance
let instance = null;

function getHybridMemoryService() {
  if (!instance) {
    instance = new HybridMemoryService();
  }
  return instance;
}

module.exports = {
  HybridMemoryService,
  getHybridMemoryService
};

