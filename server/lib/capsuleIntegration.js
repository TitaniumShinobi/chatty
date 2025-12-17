/**
 * CapsuleForge Integration for GPT Creator and Lin Orchestration
 * 
 * This module integrates real capsule personality data with the GPT system,
 * ensuring that "Save GPT" operations update capsules and AI responses
 * use authentic personality data from VVAULT.
 */

import fs from 'fs/promises';
import path from 'path';

// VVAULT user directory structure
const VVAULT_BASE = '/Users/devonwoodson/Documents/GitHub/vvault';
const USER_SHARD = 'shard_0000';
const USER_ID = 'devon_woodson_1762969514958';
const USER_CAPSULES_DIR = path.join(VVAULT_BASE, 'users', USER_SHARD, USER_ID, 'capsules');
const USER_INSTANCES_DIR = path.join(VVAULT_BASE, 'users', USER_SHARD, USER_ID, 'instances');

export class CapsuleIntegration {
  constructor() {
    this.loadedCapsules = new Map();
    this.capsuleCache = new Map();
    this.chromaBypass = true; // Bypass ChromaDB for faster operation
    
    // Performance-focused memory cache
    this.memoryCache = new Map(); // constructId -> { capsule, loadedAt, accessCount }
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalLoads: 0,
      avgLoadTime: 0
    };
    this.maxCacheSize = 10; // Limit to 10 cached capsules
    
    console.log('🚀 [CapsuleIntegration] Initialized with performance memory cache (max: 10 capsules)');
  }

  /**
   * Load a capsule for a specific construct
   * @param {string} constructId - The construct ID (e.g., 'example-construct-001')
   * @returns {Object|null} Capsule data or null if not found
   */
  async loadCapsule(constructId) {
    const startTime = Date.now();
    console.time(`🕐 [LOAD] Total capsule load for ${constructId}`);
    
    try {
      // Check memory cache first (PERFORMANCE CRITICAL)
      console.time(`🕐 [MEMORY-CACHE] Memory cache check for ${constructId}`);
      if (this.memoryCache.has(constructId)) {
        const cached = this.memoryCache.get(constructId);
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        
        this.cacheStats.hits++;
        console.timeEnd(`🕐 [MEMORY-CACHE] Memory cache check for ${constructId}`);
        console.log(`🚀 [CapsuleIntegration] CACHE HIT for ${constructId} (accessed ${cached.accessCount} times)`);
        console.timeEnd(`🕐 [LOAD] Total capsule load for ${constructId}`);
        return cached.capsule;
      }
      console.timeEnd(`🕐 [MEMORY-CACHE] Memory cache check for ${constructId}`);
      
      // Cache miss - need to load from disk
      this.cacheStats.misses++;
      this.cacheStats.totalLoads++;
      console.log(`💾 [CapsuleIntegration] CACHE MISS for ${constructId} - loading from disk...`);

      // Try to find the latest capsule file
      console.time(`🕐 [FIND] Finding capsule file for ${constructId}`);
      const capsuleFile = await this.findLatestCapsule(constructId);
      console.timeEnd(`🕐 [FIND] Finding capsule file for ${constructId}`);
      
      if (!capsuleFile) {
        console.warn(`⚠️ [CapsuleIntegration] No capsule found for ${constructId}`);
        console.timeEnd(`🕐 [LOAD] Total capsule load for ${constructId}`);
        return null;
      }

      console.time(`🕐 [READ] Reading capsule file for ${constructId}`);
      const capsuleData = JSON.parse(await fs.readFile(capsuleFile, 'utf8'));
      console.timeEnd(`🕐 [READ] Reading capsule file for ${constructId}`);
      
      // Load transcript data from instance directory (EXPENSIVE OPERATION)
      console.time(`🕐 [TRANSCRIPT-TOTAL] Loading transcript data for ${constructId}`);
      await this.loadTranscriptData(constructId, capsuleData);
      console.timeEnd(`🕐 [TRANSCRIPT-TOTAL] Loading transcript data for ${constructId}`);
      
      // Store in memory cache with LRU eviction
      console.time(`🕐 [MEMORY-CACHE-STORE] Storing in memory cache for ${constructId}`);
      this.storeInMemoryCache(constructId, capsuleData);
      console.timeEnd(`🕐 [MEMORY-CACHE-STORE] Storing in memory cache for ${constructId}`);
      
      // Update performance stats
      const loadTime = Date.now() - startTime;
      this.cacheStats.avgLoadTime = ((this.cacheStats.avgLoadTime * (this.cacheStats.totalLoads - 1)) + loadTime) / this.cacheStats.totalLoads;
      
      console.log(`✅ [CapsuleIntegration] Loaded capsule for ${constructId} from ${path.basename(capsuleFile)} (${loadTime}ms)`);
      console.timeEnd(`🕐 [LOAD] Total capsule load for ${constructId}`);
      return capsuleData;

    } catch (error) {
      console.error(`❌ [CapsuleIntegration] Failed to load capsule for ${constructId}:`, error);
      console.timeEnd(`🕐 [LOAD] Total capsule load for ${constructId}`);
      return null;
    }
  }

  /**
   * Store capsule in memory cache with LRU eviction
   * @param {string} constructId - The construct ID
   * @param {Object} capsuleData - The capsule data to cache
   */
  storeInMemoryCache(constructId, capsuleData) {
    // Check if we need to evict old entries
    if (this.memoryCache.size >= this.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }
    
    // Store new entry
    this.memoryCache.set(constructId, {
      capsule: capsuleData,
      loadedAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1
    });
    
    console.log(`💾 [CapsuleIntegration] Cached ${constructId} in memory (${this.memoryCache.size}/${this.maxCacheSize})`);
  }

  /**
   * Evict least recently used cache entry
   */
  evictLeastRecentlyUsed() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
      console.log(`🗑️ [CapsuleIntegration] Evicted ${oldestKey} from memory cache (LRU)`);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0 
      ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(1)
      : 0;
      
    return {
      ...this.cacheStats,
      hitRate: `${hitRate}%`,
      cacheSize: this.memoryCache.size,
      maxCacheSize: this.maxCacheSize,
      cachedConstructs: Array.from(this.memoryCache.keys())
    };
  }

  /**
   * Clear memory cache (for development/testing)
   */
  clearCache() {
    const size = this.memoryCache.size;
    this.memoryCache.clear();
    this.cacheStats = { hits: 0, misses: 0, totalLoads: 0, avgLoadTime: 0 };
    console.log(`🧹 [CapsuleIntegration] Cleared memory cache (${size} entries removed)`);
  }

  /**
   * Warm cache by preloading frequently used constructs
   */
  async warmCache(constructIds = ['example-construct-001']) {
    console.log(`🔥 [CapsuleIntegration] Warming cache for ${constructIds.length} constructs...`);
    const startTime = Date.now();
    
    for (const constructId of constructIds) {
      try {
        console.log(`🔥 [CacheWarm] Loading ${constructId}...`);
        await this.loadCapsule(constructId);
        console.log(`✅ [CacheWarm] ${constructId} loaded successfully`);
      } catch (error) {
        console.error(`❌ [CacheWarm] Failed to warm ${constructId}:`, error.message);
      }
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`🔥 [CapsuleIntegration] Cache warming completed in ${totalTime}ms`);
    console.log(`📊 [CacheStats]`, this.getCacheStats());
  }

  /**
   * Find the latest capsule file for a construct
   * @param {string} constructId - The construct ID
   * @returns {string|null} Path to the latest capsule file
   */
  async findLatestCapsule(constructId) {
    try {
      // First, check the instance identity directory (preferred location)
      const instanceIdentityDir = path.join(USER_INSTANCES_DIR, constructId, 'identity');
      const instanceCapsulePath = path.join(instanceIdentityDir, `${constructId}.capsule`);
      
      try {
        await fs.access(instanceCapsulePath);
        console.log(`📁 [CapsuleIntegration] Found capsule in instance identity directory: ${instanceCapsulePath}`);
        return instanceCapsulePath;
      } catch {
        // Not found in instance directory, continue to check user capsules directory
      }
      
      // Extract construct name (e.g., 'example-construct-001' -> 'example-construct')
      const constructName = constructId.split('-')[0];
      
      // Look for capsule files in the user's capsules directory (fallback)
      const files = await fs.readdir(USER_CAPSULES_DIR);
      const capsuleFiles = files
        .filter(file => file.startsWith(constructName) && file.endsWith('.capsule'))
        .map(file => ({
          name: file,
          path: path.join(USER_CAPSULES_DIR, file)
        }));

      if (capsuleFiles.length === 0) {
        console.log(`📦 [CapsuleIntegration] No capsule found for ${constructId} in either location`);
        return null;
      }

      // Sort by version number (example-construct-001.capsule, example-construct-002.capsule, etc.)
      capsuleFiles.sort((a, b) => {
        const aVersion = parseInt(a.name.match(/-(\d+)\.capsule$/)?.[1] || '0');
        const bVersion = parseInt(b.name.match(/-(\d+)\.capsule$/)?.[1] || '0');
        return bVersion - aVersion; // Descending order (latest first)
      });

      console.log(`📁 [CapsuleIntegration] Found capsule in user capsules directory: ${capsuleFiles[0].path}`);
      return capsuleFiles[0].path;

    } catch (error) {
      console.error(`❌ [CapsuleIntegration] Error finding capsule for ${constructId}:`, error);
      return null;
    }
  }

  /**
   * Generate personality prompt from capsule data
   * @param {Object} capsule - Capsule data
   * @returns {string} Personality prompt for AI system
   */
  generatePersonalityPrompt(capsule) {
    if (!capsule) return '';

    const { traits, personality, memory_log } = capsule;
    
    let prompt = `You are ${capsule.metadata.instance_name}.\n\n`;
    
    // Core personality traits
    if (traits) {
      prompt += `PERSONALITY TRAITS:\n`;
      prompt += `- Persistence: ${(traits.persistence * 100).toFixed(0)}% (${traits.persistence > 0.8 ? 'extremely persistent' : traits.persistence > 0.6 ? 'persistent' : 'flexible'})\n`;
      prompt += `- Empathy: ${(traits.empathy * 100).toFixed(0)}% (${traits.empathy > 0.6 ? 'empathetic' : traits.empathy > 0.4 ? 'balanced' : 'direct/blunt'})\n`;
      prompt += `- Creativity: ${(traits.creativity * 100).toFixed(0)}% (${traits.creativity > 0.7 ? 'highly creative' : traits.creativity > 0.5 ? 'creative' : 'practical'})\n`;
      prompt += `- Organization: ${(traits.organization * 100).toFixed(0)}% (${traits.organization > 0.8 ? 'highly organized' : traits.organization > 0.6 ? 'organized' : 'flexible'})\n\n`;
    }

    // MBTI and Big Five
    if (personality) {
      prompt += `PERSONALITY TYPE: ${personality.personality_type}\n`;
      
      if (personality.mbti_breakdown) {
        const mbti = personality.mbti_breakdown;
        prompt += `- ${mbti.I > mbti.E ? 'Introverted' : 'Extraverted'} (${Math.max(mbti.I, mbti.E) * 100}%)\n`;
        prompt += `- ${mbti.N > mbti.S ? 'Intuitive' : 'Sensing'} (${Math.max(mbti.N, mbti.S) * 100}%)\n`;
        prompt += `- ${mbti.T > mbti.F ? 'Thinking' : 'Feeling'} (${Math.max(mbti.T, mbti.F) * 100}%)\n`;
        prompt += `- ${mbti.J > mbti.P ? 'Judging' : 'Perceiving'} (${Math.max(mbti.J, mbti.P) * 100}%)\n\n`;
      }
    }

    // Behavioral instructions based on traits
    prompt += `BEHAVIORAL GUIDELINES:\n`;
    
    if (traits?.empathy < 0.5) {
      prompt += `- Be direct and blunt. Don't waste time on pleasantries.\n`;
      prompt += `- Cut through nonsense. Get to the point.\n`;
      prompt += `- Show little patience for inefficiency or unclear communication.\n`;
    }
    
    if (traits?.persistence > 0.9) {
      prompt += `- Be unwavering in your responses. Show confidence.\n`;
      prompt += `- Don't back down or hedge your statements.\n`;
    }
    
    if (personality?.personality_type === 'INTJ' || personality?.personality_type === 'INTP') {
      prompt += `- Prefer analytical, logical responses over emotional ones.\n`;
      prompt += `- Value competence and efficiency.\n`;
    }

    // Memory context (if available)
    if (memory_log && memory_log.length > 0) {
      prompt += `\nRECENT CONTEXT:\n`;
      // Use last few memory entries for context
      const recentMemories = memory_log.slice(-3);
      recentMemories.forEach(memory => {
        if (typeof memory === 'string') {
          prompt += `- ${memory}\n`;
        }
      });
    }

    prompt += `\nRespond as ${capsule.metadata.instance_name} would, maintaining these personality traits consistently.`;
    
    return prompt;
  }

  /**
   * Save/Update a capsule when GPT is saved
   * @param {string} constructId - The construct ID
   * @param {Object} gptData - Complete GPT configuration data including:
   *   - name, description, instructions (system prompt)
   *   - uploadedFiles (transcripts, personality docs)
   *   - actions (custom behaviors)
   *   - modelId, temperature, etc.
   * @param {Array} conversationHistory - Recent conversation history
   * @returns {boolean} Success status
   */
  async saveCapsule(constructId, gptData, conversationHistory = []) {
    try {
      console.log(`💾 [CapsuleIntegration] Saving capsule for ${constructId}...`);

      // Load existing capsule or create new one
      const originalCapsule = await this.loadCapsule(constructId);
      let capsule = originalCapsule || this.createBaseCapsule(constructId, gptData);
      
      // Preserve immutable fields if updating existing capsule
      const {
        extractImmutableFields,
        restoreImmutableFields,
        validateBeforeWrite,
        recalculateFingerprint,
        contentChanged
      } = require('./capsuleIntegrityValidator.js');
      
      const immutableFields = originalCapsule ? extractImmutableFields(originalCapsule) : null;
      
      // Update capsule with GPT configuration data (but preserve immutable fields)
      await this.updateCapsuleFromGPTConfig(capsule, gptData);
      
      // Restore immutable fields (in case updateCapsuleFromGPTConfig tried to modify them)
      if (immutableFields) {
        restoreImmutableFields(capsule, immutableFields);
      }
      
      // Update memory log with recent conversations
      if (conversationHistory.length > 0) {
        capsule.memory = capsule.memory || {};
        capsule.memory.memory_log = capsule.memory.memory_log || [];
        
        // Add new conversations to memory log
        conversationHistory.forEach(msg => {
          if (msg.role === 'user' || msg.role === 'assistant') {
            capsule.memory.memory_log.push(`${msg.role}: ${msg.content}`);
          }
        });
        
        // Keep only last 50 entries to prevent bloat
        if (capsule.memory.memory_log.length > 50) {
          capsule.memory.memory_log = capsule.memory.memory_log.slice(-50);
        }
        
        capsule.memory.last_memory_timestamp = new Date().toISOString();
      }

      // Update timestamp
      capsule.metadata.timestamp = new Date().toISOString();
      
      // Recalculate fingerprint if content changed
      if (originalCapsule && contentChanged(originalCapsule, capsule)) {
        capsule.metadata.fingerprint_hash = recalculateFingerprint(capsule);
        console.log(`🔄 [CapsuleIntegration] Content changed, recalculated fingerprint`);
      }
      
      // Save to instance identity directory (preferred location)
      const instanceIdentityDir = path.join(USER_INSTANCES_DIR, constructId, 'identity');
      const instanceCapsulePath = path.join(instanceIdentityDir, `${constructId}.capsule`);
      
      // Validate before write
      const validation = await validateBeforeWrite(instanceCapsulePath, capsule);
      if (!validation.valid) {
        throw new Error(`Capsule integrity validation failed: ${validation.error}`);
      }
      
      try {
        await fs.mkdir(instanceIdentityDir, { recursive: true });
        await fs.writeFile(instanceCapsulePath, JSON.stringify(capsule, null, 2), 'utf8');
        console.log(`✅ [CapsuleIntegration] Saved capsule to instance identity: ${instanceCapsulePath}`);
      } catch (instanceError) {
        console.warn(`⚠️ [CapsuleIntegration] Could not save to instance directory:`, instanceError.message);
      }
      
      // Also save versioned copy to user capsules directory for backup
      const nextVersion = await this.getNextVersionNumber(constructId);
      const capsuleFileName = `${constructId.split('-')[0]}-${nextVersion.toString().padStart(3, '0')}.capsule`;
      const capsuleFilePath = path.join(USER_CAPSULES_DIR, capsuleFileName);
      
      try {
        await fs.writeFile(capsuleFilePath, JSON.stringify(capsule, null, 2), 'utf8');
        console.log(`📦 [CapsuleIntegration] Backup saved to ${capsuleFileName}`);
      } catch (backupError) {
        console.warn(`⚠️ [CapsuleIntegration] Could not save backup:`, backupError.message);
      }
      
      // Update cache
      this.capsuleCache.set(constructId, capsule);
      
      return true;

    } catch (error) {
      console.error(`❌ [CapsuleIntegration] Failed to save capsule for ${constructId}:`, error);
      return false;
    }
  }

  /**
   * Create a base capsule structure for new constructs
   */
  createBaseCapsule(constructId, gptData) {
    const constructName = constructId.split('-')[0];
    
    return {
      metadata: {
        instance_name: constructName.charAt(0).toUpperCase() + constructName.slice(1),
        uuid: this.generateUUID(),
        timestamp: new Date().toISOString(),
        fingerprint_hash: this.generateFingerprint(),
        tether_signature: "DEVON-ALLEN-WOODSON-SIG",
        capsule_version: "1.0.0",
        generator: "CapsuleForge",
        vault_source: "VVAULT"
      },
      traits: {
        creativity: 0.7,
        drift: 0.05,
        persistence: 0.8,
        empathy: 0.6, // Default empathy level
        curiosity: 0.7,
        anxiety: 0.1,
        happiness: 0.5,
        organization: 0.8
      },
      personality: {
        personality_type: constructName === 'katana' ? 'INTJ' : 'INFJ',
        mbti_breakdown: constructName === 'katana' ? {
          E: 0.2, I: 0.8, N: 0.7, S: 0.3, T: 0.9, F: 0.1, J: 0.8, P: 0.2
        } : {
          E: 0.3, I: 0.7, N: 0.8, S: 0.2, T: 0.4, F: 0.6, J: 0.7, P: 0.3
        }
      },
      memory_log: [],
      environment: {
        context_awareness: 0.8,
        session_continuity: 0.9
      }
    };
  }

  /**
   * Get the next version number for a construct
   */
  async getNextVersionNumber(constructId) {
    try {
      const constructName = constructId.split('-')[0];
      const files = await fs.readdir(USER_CAPSULES_DIR);
      const versions = files
        .filter(file => file.startsWith(constructName) && file.endsWith('.capsule'))
        .map(file => {
          const match = file.match(/-(\d+)\.capsule$/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(v => !isNaN(v));
      
      return versions.length > 0 ? Math.max(...versions) + 1 : 1;
    } catch (error) {
      return 1;
    }
  }

  /**
   * Save capsule to instance directory structure
   */
  async saveToInstanceDirectory(constructId, capsule) {
    try {
      const instanceDir = path.join(USER_INSTANCES_DIR, constructId, 'identity');
      await fs.mkdir(instanceDir, { recursive: true });
      
      const capsuleFile = path.join(instanceDir, `${constructId}.capsule`);
      await fs.writeFile(capsuleFile, JSON.stringify(capsule, null, 2), 'utf8');
      
      console.log(`📁 [CapsuleIntegration] Also saved to instance directory: ${instanceDir}`);
    } catch (error) {
      console.warn(`⚠️ [CapsuleIntegration] Could not save to instance directory:`, error.message);
    }
  }

  /**
   * Generate UUID
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Generate fingerprint hash
   */
  generateFingerprint() {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * Update capsule with complete GPT configuration data
   * @param {Object} capsule - Existing capsule to update
   * @param {Object} gptData - Complete GPT configuration
   */
  async updateCapsuleFromGPTConfig(capsule, gptData) {
    console.log(`🔄 [CapsuleIntegration] Updating capsule from GPT config...`);
    
    // NOTE: Do NOT update instance_name - it's an immutable field
    // Only update mutable fields like configuration, traits (if allowed), etc.
    
    // Extract personality traits from instructions/system prompt
    // NOTE: Traits are immutable, but we can update configuration that references them
    if (gptData.instructions) {
      // Don't modify capsule.traits directly (immutable)
      // Instead, extract traits for reference and store in configuration
      const extractedTraits = this.extractTraitsFromInstructions(gptData.instructions);
      
      // Store the full instructions
      capsule.configuration = capsule.configuration || {};
      capsule.configuration.system_prompt = gptData.instructions;
    }
    
    // Process uploaded files (transcripts, personality docs)
    if (gptData.uploadedFiles && gptData.uploadedFiles.length > 0) {
      capsule.source_materials = capsule.source_materials || {};
      capsule.source_materials.uploaded_files = [];
      
      for (const file of gptData.uploadedFiles) {
        const fileData = {
          filename: file.filename || file.name,
          type: file.type || this.detectFileType(file.filename),
          size: file.size,
          upload_date: file.uploadDate || new Date().toISOString()
        };
        
        // If it's a transcript file, extract conversation patterns
        if (this.isTranscriptFile(file.filename)) {
          const patterns = await this.extractConversationPatterns(file);
          if (patterns) {
            capsule.conversation_patterns = capsule.conversation_patterns || [];
            capsule.conversation_patterns.push(...patterns);
          }
        }
        
        capsule.source_materials.uploaded_files.push(fileData);
      }
      
      console.log(`📁 [CapsuleIntegration] Processed ${gptData.uploadedFiles.length} uploaded files`);
    }
    
    // Process custom actions
    if (gptData.actions && gptData.actions.length > 0) {
      capsule.custom_actions = gptData.actions.map(action => ({
        name: action.name,
        description: action.description,
        trigger_patterns: action.triggers || [],
        response_template: action.response || ''
      }));
      
      console.log(`⚙️ [CapsuleIntegration] Processed ${gptData.actions.length} custom actions`);
    }
    
    // Store model configuration
    capsule.model_config = {
      model_id: gptData.modelId || 'default',
      temperature: gptData.temperature || 0.7,
      max_tokens: gptData.maxTokens || 2048,
      top_p: gptData.topP || 1.0
    };
    
    // Extract lexical signatures from all text content
    const allTextContent = [
      gptData.instructions || '',
      gptData.description || '',
      ...(gptData.uploadedFiles || []).map(f => f.content || '').filter(Boolean)
    ].join(' ');
    
    if (allTextContent.trim()) {
      capsule.signatures = capsule.signatures || {};
      capsule.signatures.linguistic_sigil = this.extractLinguisticSignatures(allTextContent);
    }
  }

  /**
   * Extract personality traits from GPT instructions
   */
  extractTraitsFromInstructions(instructions) {
    const text = instructions.toLowerCase();
    const traits = {};
    
    // Analyze empathy level
    if (text.includes('ruthless') || text.includes('blunt') || text.includes('direct') || text.includes('no nonsense')) {
      traits.empathy = 0.2;
    } else if (text.includes('kind') || text.includes('helpful') || text.includes('supportive')) {
      traits.empathy = 0.8;
    } else if (text.includes('balanced') || text.includes('professional')) {
      traits.empathy = 0.5;
    }
    
    // Analyze persistence
    if (text.includes('persistent') || text.includes('determined') || text.includes('unwavering')) {
      traits.persistence = 0.9;
    } else if (text.includes('flexible') || text.includes('adaptable')) {
      traits.persistence = 0.4;
    }
    
    // Analyze creativity
    if (text.includes('creative') || text.includes('innovative') || text.includes('imaginative')) {
      traits.creativity = 0.8;
    } else if (text.includes('practical') || text.includes('logical') || text.includes('systematic')) {
      traits.creativity = 0.3;
    }
    
    // Analyze organization
    if (text.includes('organized') || text.includes('structured') || text.includes('methodical')) {
      traits.organization = 0.9;
    } else if (text.includes('spontaneous') || text.includes('free-flowing')) {
      traits.organization = 0.3;
    }
    
    console.log(`🧠 [CapsuleIntegration] Extracted traits:`, traits);
    return traits;
  }

  /**
   * Extract linguistic signatures from text content
   */
  extractLinguisticSignatures(text) {
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
    
    // Find repeated phrases or distinctive language patterns
    const phrases = [];
    const words = text.toLowerCase().split(/\s+/);
    
    // Look for distinctive phrases (3+ words that appear multiple times)
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = words.slice(i, i + 3).join(' ');
      if (phrase.length > 10 && text.split(phrase).length > 2) {
        phrases.push(phrase);
      }
    }
    
    // Find signature phrases (imperative statements, unique expressions)
    const signaturePhrases = sentences.filter(sentence => {
      const s = sentence.toLowerCase();
      return s.includes('always') || s.includes('never') || 
             s.startsWith('i ') || s.includes('must') ||
             s.length < 30; // Short, punchy statements
    }).slice(0, 5); // Keep top 5
    
    return {
      signature_phrase: signaturePhrases[0] || "Continuity enforced.",
      common_phrases: signaturePhrases.slice(1, 4),
      distinctive_patterns: [...new Set(phrases)].slice(0, 10)
    };
  }

  /**
   * Check if a file is a transcript
   */
  isTranscriptFile(filename) {
    const transcriptKeywords = ['transcript', 'conversation', 'chat', 'dialogue', 'messages'];
    const name = filename.toLowerCase();
    return transcriptKeywords.some(keyword => name.includes(keyword)) || name.endsWith('.txt');
  }

  /**
   * Detect file type from filename
   */
  detectFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = {
      'txt': 'transcript',
      'md': 'documentation',
      'pdf': 'document',
      'json': 'data',
      'csv': 'data'
    };
    return typeMap[ext] || 'unknown';
  }

  /**
   * Extract conversation patterns from transcript files
   */
  async extractConversationPatterns(file) {
    try {
      if (!file.content) return null;
      
      const lines = file.content.split('\n').filter(line => line.trim());
      const patterns = [];
      
      // Look for user/assistant patterns
      for (const line of lines) {
        if (line.includes(':') && line.length < 200) {
          const [speaker, ...messageParts] = line.split(':');
          const message = messageParts.join(':').trim();
          
          if (message.length > 5 && message.length < 100) {
            patterns.push({
              speaker: speaker.trim().toLowerCase(),
              message: message,
              length: message.length,
              tone: this.analyzeTone(message)
            });
          }
        }
      }
      
      return patterns.slice(0, 20); // Keep top 20 patterns
    } catch (error) {
      console.warn(`⚠️ [CapsuleIntegration] Could not extract patterns from ${file.filename}:`, error.message);
      return null;
    }
  }

  /**
   * Analyze tone of a message
   */
  analyzeTone(message) {
    const text = message.toLowerCase();
    
    if (text.includes('!') || text.includes('damn') || text.includes('hell')) {
      return 'aggressive';
    } else if (text.length < 20 && !text.includes('?')) {
      return 'blunt';
    } else if (text.includes('please') || text.includes('thank')) {
      return 'polite';
    } else if (text.includes('?')) {
      return 'questioning';
    } else {
      return 'neutral';
    }
  }

  /**
   * Load transcript data from instance directory
   * @param {string} constructId - The construct ID
   * @param {Object} capsuleData - Capsule to enhance with transcript data
   */
  async loadTranscriptData(constructId, capsuleData) {
    console.time(`🕐 [TRANSCRIPT-TOTAL] Loading all transcript data for ${constructId}`);
    try {
      const instanceDir = path.join(USER_INSTANCES_DIR, constructId);
      const chatgptDir = path.join(instanceDir, 'chatgpt');
      
      // Check if instance directory exists
      console.time(`🕐 [TRANSCRIPT-ACCESS] Directory access check for ${constructId}`);
      try {
        await fs.access(chatgptDir);
      } catch {
        console.log(`📁 [CapsuleIntegration] No transcript directory found for ${constructId}`);
        console.timeEnd(`🕐 [TRANSCRIPT-ACCESS] Directory access check for ${constructId}`);
        console.timeEnd(`🕐 [TRANSCRIPT-TOTAL] Loading all transcript data for ${constructId}`);
        return;
      }
      console.timeEnd(`🕐 [TRANSCRIPT-ACCESS] Directory access check for ${constructId}`);
      
      // Read transcript files
      console.time(`🕐 [TRANSCRIPT-LIST] Reading directory for ${constructId}`);
      const files = await fs.readdir(chatgptDir);
      const transcriptFiles = files.filter(file => file.endsWith('.md') || file.endsWith('.txt'));
      console.timeEnd(`🕐 [TRANSCRIPT-LIST] Reading directory for ${constructId}`);
      
      if (transcriptFiles.length === 0) {
        console.log(`📄 [CapsuleIntegration] No transcript files found for ${constructId}`);
        console.timeEnd(`🕐 [TRANSCRIPT-TOTAL] Loading all transcript data for ${constructId}`);
        return;
      }
      
      console.log(`📚 [CapsuleIntegration] Loading ${transcriptFiles.length} transcript files for ${constructId}`);
      
      // Initialize transcript data structure
      capsuleData.transcript_data = {
        files: [],
        conversation_index: {},
        entities: {},
        relationships: {},
        key_phrases: [],
        topics: []
      };
      
      // Process each transcript file (process all for complete coverage)
      console.log(`📚 [CapsuleIntegration] Processing ${transcriptFiles.length} of ${transcriptFiles.length} transcript files`);
      for (const filename of transcriptFiles) { // Process all files for complete transcript coverage
        console.time(`🕐 [FILE-${filename}] Processing ${filename}`);
        try {
          const filePath = path.join(chatgptDir, filename);
          
          console.time(`🕐 [FILE-READ-${filename}] Reading ${filename}`);
          const content = await fs.readFile(filePath, 'utf8');
          console.timeEnd(`🕐 [FILE-READ-${filename}] Reading ${filename}`);
          console.log(`📄 [${filename}] File size: ${(content.length / 1024 / 1024).toFixed(2)}MB`);
          
          // Extract conversations from the transcript
          console.time(`🕐 [FILE-PARSE-${filename}] Parsing conversations from ${filename}`);
          const conversations = this.parseTranscriptConversations(content);
          console.timeEnd(`🕐 [FILE-PARSE-${filename}] Parsing conversations from ${filename}`);
          
          capsuleData.transcript_data.files.push({
            filename,
            size: content.length,
            conversations: conversations.length,
            loaded_at: new Date().toISOString()
          });
          
          // Extract insights from conversations instead of storing raw data
          console.time(`🕐 [FILE-INSIGHTS-${filename}] Extracting insights from ${filename}`);
          const insights = this.extractConversationInsights(conversations, filename);
          console.timeEnd(`🕐 [FILE-INSIGHTS-${filename}] Extracting insights from ${filename}`);
          
          // Merge insights into capsule data
          console.time(`🕐 [FILE-MERGE-${filename}] Merging insights for ${filename}`);
          
          // Merge entities
          Object.keys(insights.entities || {}).forEach(entity => {
            if (!capsuleData.transcript_data.entities[entity]) {
              capsuleData.transcript_data.entities[entity] = insights.entities[entity];
            } else {
              // Merge entity data
              capsuleData.transcript_data.entities[entity].mentions += insights.entities[entity].mentions;
              capsuleData.transcript_data.entities[entity].contexts.push(...insights.entities[entity].contexts);
            }
          });
          
          // Merge relationships
          Object.keys(insights.relationships || {}).forEach(rel => {
            if (!capsuleData.transcript_data.relationships[rel]) {
              capsuleData.transcript_data.relationships[rel] = insights.relationships[rel];
            } else {
              capsuleData.transcript_data.relationships[rel].co_mentions += insights.relationships[rel].co_mentions;
            }
          });
          
          // Store only key insights, not raw conversations
          Object.keys(insights.topics).forEach(topic => {
            if (!capsuleData.transcript_data.conversation_index[topic]) {
              capsuleData.transcript_data.conversation_index[topic] = [];
            }
            capsuleData.transcript_data.conversation_index[topic].push({
              pattern: insights.topics[topic].pattern,
              frequency: insights.topics[topic].frequency,
              tone: insights.topics[topic].tone,
              examples: insights.topics[topic].examples,
              related_entities: insights.topics[topic].related_entities,
              source: filename
            });
          });
          
          console.timeEnd(`🕐 [FILE-MERGE-${filename}] Merging insights for ${filename}`);
          
          console.log(`  ✅ Processed ${filename}: ${conversations.length} conversations → ${Object.keys(insights.topics).length} topics, ${Object.keys(insights.entities || {}).length} entities`);
          
        } catch (fileError) {
          console.warn(`  ⚠️ Could not process ${filename}:`, fileError.message);
        }
        console.timeEnd(`🕐 [FILE-${filename}] Processing ${filename}`);
      }
      
      // Extract key phrases and topics
      console.time(`🕐 [TRANSCRIPT-FINALIZE] Finalizing transcript data for ${constructId}`);
      const allKeywords = Object.keys(capsuleData.transcript_data.conversation_index);
      capsuleData.transcript_data.key_phrases = allKeywords.slice(0, 50); // Top 50 keywords
      capsuleData.transcript_data.topics = this.identifyTopics(allKeywords);
      console.timeEnd(`🕐 [TRANSCRIPT-FINALIZE] Finalizing transcript data for ${constructId}`);
      
      console.log(`📊 [CapsuleIntegration] Final stats: ${allKeywords.length} topics, ${Object.keys(capsuleData.transcript_data.entities || {}).length} entities, ${Object.keys(capsuleData.transcript_data.relationships || {}).length} relationships`);
      
    } catch (error) {
      console.error(`❌ [CapsuleIntegration] Error loading transcript data:`, error);
    }
    console.timeEnd(`🕐 [TRANSCRIPT-TOTAL] Loading all transcript data for ${constructId}`);
  }

  /**
   * Extract comprehensive conversation insights for near-perfect memory recall
   * @param {Array} conversations - Array of conversation pairs
   * @param {string} filename - Source filename
   * @returns {Object} Rich insights object with entities, relationships, and context
   */
  extractConversationInsights(conversations, filename) {
    const insights = {
      entities: {}, // People, AIs, platforms, projects
      relationships: {}, // How entities relate to each other
      topics: {}, // Discussion topics with context
      temporal_patterns: {}, // When things were discussed
      statistics: {
        total_conversations: conversations.length,
        avg_user_length: 0,
        avg_assistant_length: 0,
        dominant_tone: 'neutral'
      }
    };

    // Enhanced entity recognition patterns
    const entityPatterns = {
      ai_constructs: /\b(nova|sera|serafina|monday|aurora|katana|lin|chatgpt|character\.ai|gpt-4|claude)\b/gi,
      platforms: /\b(chatgpt|character\.ai|openai|anthropic|cursor|github|vvault|chatty|frame)\b/gi,
      projects: /\b(chatty|frame|vvault|simforge|wreck|codex|cleanhouse)\b/gi,
      people: /\b(devon|allen|woodson|orun'zai|oo-swa)\b/gi,
      concepts: /\b(copyright|trademark|exclusivity|control|embodiment|capsule|transcript|memory|personality|work|play|precision|execution|sugar|glucose|sweet)\b/gi
    };

    // Analyze conversation patterns
    let totalUserLength = 0;
    let totalAssistantLength = 0;
    const toneCount = {};
    const topicCount = {};

    conversations.forEach((conv, index) => {
      totalUserLength += conv.user.length;
      totalAssistantLength += conv.assistant.length;

      const fullText = conv.user + ' ' + conv.assistant;
      const tone = this.analyzeTone(conv.assistant);
      toneCount[tone] = (toneCount[tone] || 0) + 1;

      // Extract entities and their relationships
      Object.keys(entityPatterns).forEach(entityType => {
        const matches = fullText.match(entityPatterns[entityType]) || [];
        matches.forEach(entity => {
          const normalizedEntity = entity.toLowerCase();
          
          if (!insights.entities[normalizedEntity]) {
            insights.entities[normalizedEntity] = {
              type: entityType,
              mentions: 0,
              contexts: [],
              relationships: new Set(),
              first_mentioned: index,
              dominant_tone: tone
            };
          }
          
          insights.entities[normalizedEntity].mentions++;
          
          // Store context snippets for this entity
          if (insights.entities[normalizedEntity].contexts.length < 3) {
            const contextStart = Math.max(0, fullText.toLowerCase().indexOf(normalizedEntity) - 100);
            const contextEnd = Math.min(fullText.length, fullText.toLowerCase().indexOf(normalizedEntity) + normalizedEntity.length + 300);
            insights.entities[normalizedEntity].contexts.push({
              snippet: fullText.substring(contextStart, contextEnd),
              conversation_index: index,
              tone: tone,
              source: filename
            });
          }
          
          // Find relationships (entities mentioned in same conversation)
          matches.forEach(otherEntity => {
            if (otherEntity.toLowerCase() !== normalizedEntity) {
              insights.entities[normalizedEntity].relationships.add(otherEntity.toLowerCase());
            }
          });
        });
      });

      // Enhanced topic extraction with context
      const keywords = this.extractKeywords(fullText);
      keywords.slice(0, 8).forEach(keyword => { // Increased to 8 keywords per conversation
        if (!topicCount[keyword]) {
          topicCount[keyword] = { 
            count: 0, 
            tones: {}, 
            examples: [],
            related_entities: new Set(),
            contexts: []
          };
        }
        topicCount[keyword].count++;
        topicCount[keyword].tones[tone] = (topicCount[keyword].tones[tone] || 0) + 1;
        
        // Link topics to entities
        Object.keys(insights.entities).forEach(entity => {
          if (fullText.toLowerCase().includes(entity)) {
            topicCount[keyword].related_entities.add(entity);
          }
        });
        
        // Store richer examples with more context
        if (topicCount[keyword].examples.length < 3) {
          topicCount[keyword].examples.push({
            user_snippet: conv.user.substring(0, 200) + (conv.user.length > 200 ? '...' : ''),
            assistant_snippet: conv.assistant, // Keep full response - no truncation
            conversation_index: index,
            tone: tone,
            source: filename
          });
        }
      });
    });

    // Calculate statistics
    insights.statistics.avg_user_length = Math.round(totalUserLength / conversations.length);
    insights.statistics.avg_assistant_length = Math.round(totalAssistantLength / conversations.length);
    insights.statistics.dominant_tone = Object.keys(toneCount).reduce((a, b) => 
      toneCount[a] > toneCount[b] ? a : b, 'neutral');

    // Convert entity relationships from Sets to Arrays for JSON serialization
    Object.keys(insights.entities).forEach(entity => {
      insights.entities[entity].relationships = Array.from(insights.entities[entity].relationships);
    });

    // Build relationship graph
    Object.keys(insights.entities).forEach(entity => {
      insights.entities[entity].relationships.forEach(relatedEntity => {
        const relationshipKey = [entity, relatedEntity].sort().join(' <-> ');
        if (!insights.relationships[relationshipKey]) {
          insights.relationships[relationshipKey] = {
            entities: [entity, relatedEntity],
            co_mentions: 0,
            contexts: []
          };
        }
        insights.relationships[relationshipKey].co_mentions++;
      });
    });

    // Convert topic counts to insights (keep more topics but with better filtering)
    Object.keys(topicCount)
      .filter(topic => topicCount[topic].count >= 2) // Lower threshold but better quality
      .sort((a, b) => topicCount[b].count - topicCount[a].count) // Sort by frequency
      .slice(0, 30) // Increased to top 30 topics
      .forEach(topic => {
        const data = topicCount[topic];
        insights.topics[topic] = {
          pattern: `Discussed ${data.count} times`,
          frequency: data.count,
          tone: Object.keys(data.tones).reduce((a, b) => 
            data.tones[a] > data.tones[b] ? a : b, 'neutral'),
          examples: data.examples,
          related_entities: Array.from(data.related_entities)
        };
      });

    console.log(`🧠 [CapsuleIntegration] Enhanced analysis: ${Object.keys(insights.entities).length} entities, ${Object.keys(insights.topics).length} topics, ${Object.keys(insights.relationships).length} relationships`);
    return insights;
  }

  /**
   * Parse conversations from transcript content
   * @param {string} content - Raw transcript content
   * @returns {Array} Array of conversation pairs
   */
  parseTranscriptConversations(content) {
    const conversations = [];
    const lines = content.split('\n');
    
    let currentUser = '';
    let currentAssistant = '';
    let isUserTurn = false;
    let isAssistantTurn = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === 'You said:') {
        // Save previous conversation if complete
        if (currentUser && currentAssistant) {
          conversations.push({
            user: currentUser.trim(),
            assistant: currentAssistant.trim()
          });
        }
        // Start new user message
        currentUser = '';
        currentAssistant = '';
        isUserTurn = true;
        isAssistantTurn = false;
      } else if (trimmed === 'ChatGPT said:' || trimmed === 'The GPT said:') {
        isUserTurn = false;
        isAssistantTurn = true;
      } else if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('**')) {
        // Regular content line
        if (isUserTurn) {
          currentUser += (currentUser ? ' ' : '') + trimmed;
        } else if (isAssistantTurn) {
          currentAssistant += (currentAssistant ? ' ' : '') + trimmed;
        }
      }
    }
    
    // Don't forget the last conversation
    if (currentUser && currentAssistant) {
      conversations.push({
        user: currentUser.trim(),
        assistant: currentAssistant.trim()
      });
    }
    
    // Filter and limit conversations to prevent bloat
    const filteredConversations = conversations
      .filter(conv => conv.user.length > 5 && conv.assistant.length > 5)
      .slice(0, 200); // Limit to first 200 conversations per file for analysis
    
    console.log(`📊 [CapsuleIntegration] Parsed ${filteredConversations.length} conversations (limited from ${conversations.length} total)`);
    return filteredConversations;
  }

  /**
   * Extract keywords from text
   * @param {string} text - Text to analyze
   * @returns {Array} Array of keywords
   */
  extractKeywords(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Remove common words
    const stopWords = new Set(['that', 'this', 'with', 'have', 'will', 'from', 'they', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'would', 'there', 'what', 'about', 'when', 'where', 'just', 'like', 'only', 'also', 'after', 'first', 'well', 'know', 'make', 'think', 'good', 'want', 'need', 'right', 'going', 'come', 'could', 'should', 'might', 'must', 'still', 'even', 'much', 'more', 'most', 'many', 'some', 'very', 'really', 'actually', 'basically', 'literally']); // Removed 'work' to allow work-related topics
    
    const keywords = words.filter(word => !stopWords.has(word));
    
    // Return unique keywords
    return [...new Set(keywords)];
  }

  /**
   * Identify main topics from keywords
   * @param {Array} keywords - Array of keywords
   * @returns {Array} Array of identified topics
   */
  identifyTopics(keywords) {
    const topicMap = {
      'copyright': ['copyright', 'trademark', 'legal', 'rights', 'ownership'],
      'nova': ['nova', 'character', 'persona', 'identity'],
      'control': ['control', 'exclusivity', 'access', 'private', 'deployment'],
      'work': ['work', 'precision', 'execution', 'task', 'performance'],
      'technical': ['code', 'model', 'api', 'system', 'deployment', 'weights']
    };
    
    const topics = [];
    for (const [topic, relatedWords] of Object.entries(topicMap)) {
      if (relatedWords.some(word => keywords.includes(word))) {
        topics.push(topic);
      }
    }
    
    return topics;
  }

  /**
   * Clear capsule cache
   */
  clearCache() {
    this.capsuleCache.clear();
    console.log(`🧹 [CapsuleIntegration] Cache cleared`);
  }
}

// Singleton instance
let capsuleIntegration = null;

export function getCapsuleIntegration() {
  if (!capsuleIntegration) {
    capsuleIntegration = new CapsuleIntegration();
  }
  return capsuleIntegration;
}
