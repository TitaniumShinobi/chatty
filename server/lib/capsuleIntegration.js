/**
 * CapsuleForge Integration for GPT Creator and Lin Orchestration
 * 
 * This module integrates real capsule personality data with the GPT system,
 * ensuring that "Save GPT" operations update capsules and AI responses
 * use authentic personality data from VVAULT.
 */

import fs from 'fs/promises';
import path from 'path';
import { getSupabaseClient } from './supabaseClient.js';
import { findConstructIdentityDir } from './vvaultPaths.js';

// VVAULT user directory structure - use env vars with local dev fallbacks
const VVAULT_BASE = process.env.VVAULT_PATH || process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
const USER_SHARD = process.env.VVAULT_SHARD || 'shard_0000';
const USER_ID = process.env.VVAULT_USER_ID || 'devon_woodson_1774390416168';
const USER_CAPSULES_DIR = path.join(VVAULT_BASE, 'users', USER_SHARD, USER_ID, 'capsules');
const USER_INSTANCES_DIR = path.join(VVAULT_BASE, 'users', USER_SHARD, USER_ID, 'instances');

function normalizeCallsign(constructId) {
  return constructId && constructId.match(/-\d+$/) ? constructId : `${constructId}-001`;
}

function isProtectedZenCallsign(constructId) {
  return String(constructId || '').toLowerCase() === 'zen-001';
}

function looksLikeTransientUpstreamError(message = '') {
  return /\b(522|timeout|timed out|etimedout|fetch failed|network|gateway|upstream|econnreset)\b/i.test(String(message || ''));
}

function normalizeTimeoutMs(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

async function withTimeoutResult(promise, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise)
        .then((value) => ({ status: 'ok', value }))
        .catch((error) => ({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          resolve({
            status: 'timeout',
            error: `${label} timed out after ${timeoutMs}ms`,
          });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildSyntheticCapsulePayload({
  callsign,
  promptData = null,
  conditioningText = '',
  personalityData = null,
  generator = 'CapsuleIntegration',
  vaultSource = 'unknown',
}) {
  const constructName = String(callsign || '').replace(/-\d+$/, '');
  const displayName = constructName.charAt(0).toUpperCase() + constructName.slice(1);

  return {
    metadata: {
      instance_name: promptData?.name || displayName,
      uuid: callsign,
      timestamp: new Date().toISOString(),
      capsule_version: '1.0.0-synthetic',
      generator,
      vault_source: vaultSource,
    },
    traits: personalityData?.traits || {
      creativity: 0.7,
      persistence: 0.8,
      empathy: 0.6,
      curiosity: 0.7,
      organization: 0.8,
    },
    personality: personalityData?.personality || {
      personality_type: 'INFJ',
      communication_style: personalityData?.communication_style || 'adaptive',
    },
    memory_log: [],
    identity: {
      name: promptData?.name || displayName,
      description: promptData?.description || '',
      instructions: promptData?.instructions || '',
      conditioning: conditioningText,
    },
    environment: {
      context_awareness: 0.8,
      session_continuity: 0.9,
    },
  };
}

export { buildSyntheticCapsulePayload };

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
      
      // Cache miss - need to load from disk or Supabase
      this.cacheStats.misses++;
      this.cacheStats.totalLoads++;
      console.log(`💾 [CapsuleIntegration] CACHE MISS for ${constructId} - loading...`);

      let capsuleData = null;

      // Try filesystem first (local VVAULT)
      console.time(`🕐 [FIND] Finding capsule file for ${constructId}`);
      const capsuleFile = await this.findLatestCapsule(constructId);
      console.timeEnd(`🕐 [FIND] Finding capsule file for ${constructId}`);
      
      if (capsuleFile) {
        console.time(`🕐 [READ] Reading capsule file for ${constructId}`);
        capsuleData = JSON.parse(await fs.readFile(capsuleFile, 'utf8'));
        console.timeEnd(`🕐 [READ] Reading capsule file for ${constructId}`);
      } else {
        // Fallback: Load from Supabase vault_files
        console.time(`🕐 [SUPABASE] Loading capsule from Supabase for ${constructId}`);
        capsuleData = await this.loadCapsuleFromSupabase(constructId);
        console.timeEnd(`🕐 [SUPABASE] Loading capsule from Supabase for ${constructId}`);
      }

      if (!capsuleData) {
        console.warn(`⚠️ [CapsuleIntegration] No capsule found for ${constructId} (filesystem or Supabase)`);
        console.timeEnd(`🕐 [LOAD] Total capsule load for ${constructId}`);
        return null;
      }
      
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
      
      const sourceLabel = capsuleFile ? path.basename(capsuleFile) : 'Supabase';
      console.log(`✅ [CapsuleIntegration] Loaded capsule for ${constructId} from ${sourceLabel} (${loadTime}ms)`);
      console.timeEnd(`🕐 [LOAD] Total capsule load for ${constructId}`);
      return capsuleData;

    } catch (error) {
      console.error(`❌ [CapsuleIntegration] Failed to load capsule for ${constructId}:`, error);
      console.timeEnd(`🕐 [LOAD] Total capsule load for ${constructId}`);
      return null;
    }
  }

  async loadCapsuleWithDiagnostics(constructId, options = {}) {
    const callsign = normalizeCallsign(constructId);
    const cacheEntry = this.memoryCache.get(constructId);
    if (cacheEntry?.capsule) {
      cacheEntry.accessCount++;
      cacheEntry.lastAccessed = Date.now();
      return {
        ok: true,
        capsule: cacheEntry.capsule,
        source: 'memory_cache',
        recovery: { attempted: false, applied: false, kind: null },
        transientFailure: null,
      };
    }

    try {
      const capsuleFile = await this.findLatestCapsule(constructId);
      if (capsuleFile) {
        const capsule = JSON.parse(await fs.readFile(capsuleFile, 'utf8'));
        return {
          ok: true,
          capsule,
          source: 'filesystem_capsule',
          recovery: { attempted: false, applied: false, kind: null },
          transientFailure: null,
          capsulePath: capsuleFile,
        };
      }
    } catch (error) {
      return {
        ok: false,
        capsule: null,
        source: 'filesystem_capsule',
        errorCategory: 'filesystem_capsule_invalid',
        errorMessage: error.message,
        recovery: { attempted: false, applied: false, kind: null },
        transientFailure: null,
      };
    }

    const shouldBoundSupabaseLoad =
      Boolean(options.allowZenLocalIdentityFallback) &&
      isProtectedZenCallsign(callsign);
    const supabaseTimeoutMs = normalizeTimeoutMs(
      options.supabaseTimeoutMs,
      normalizeTimeoutMs(process.env.ZEN_BOUNDED_CAPSULE_TIMEOUT_MS, 2500),
    );
    const supabaseOutcome = shouldBoundSupabaseLoad
      ? await withTimeoutResult(
          this.loadCapsuleFromSupabaseWithDiagnostics(constructId),
          supabaseTimeoutMs,
          'bounded_zen_capsule_supabase',
        )
      : {
          status: 'ok',
          value: await this.loadCapsuleFromSupabaseWithDiagnostics(constructId),
        };
    const supabaseResult = supabaseOutcome.status === 'ok'
      ? supabaseOutcome.value
      : {
          capsule: null,
          source: 'supabase_capsule',
          errorCategory: 'transient_upstream_failure',
          errorMessage: supabaseOutcome.error || `bounded_zen_capsule_supabase ${supabaseOutcome.status}`,
          transientFailure: {
            category: 'transient_upstream_failure',
            message: supabaseOutcome.error || `bounded_zen_capsule_supabase ${supabaseOutcome.status}`,
          },
        };
    if (supabaseResult.capsule) {
      return {
        ok: true,
        capsule: supabaseResult.capsule,
        source: supabaseResult.source,
        recovery: { attempted: false, applied: false, kind: null },
        transientFailure: supabaseResult.transientFailure || null,
      };
    }

    const allowLocalZenRecovery =
      Boolean(options.allowZenLocalIdentityFallback) &&
      isProtectedZenCallsign(callsign) &&
      Boolean(supabaseResult.transientFailure);

    if (allowLocalZenRecovery) {
      const localFallback = await this.buildCapsuleFromLocalIdentityDir(callsign, options);
      if (localFallback.capsule) {
        return {
          ok: true,
          capsule: localFallback.capsule,
          source: 'filesystem_identity_synthetic_capsule',
          recovery: {
            attempted: true,
            applied: true,
            kind: 'local_identity_dir',
            identityDir: localFallback.identityDir,
          },
          transientFailure: supabaseResult.transientFailure,
        };
      }
    }

    return {
      ok: false,
      capsule: null,
      source: supabaseResult.source || 'capsule_unavailable',
      errorCategory: supabaseResult.errorCategory || 'capsule_missing',
      errorMessage: supabaseResult.errorMessage || null,
      recovery: {
        attempted: allowLocalZenRecovery,
        applied: false,
        kind: allowLocalZenRecovery ? 'local_identity_dir' : null,
      },
      transientFailure: supabaseResult.transientFailure || null,
    };
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
      // Check if VVAULT base path exists (Replit mode detection)
      try {
        await fs.access(VVAULT_BASE);
      } catch {
        return null;
      }

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
      let files;
      try {
        files = await fs.readdir(USER_CAPSULES_DIR);
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          console.log(`📦 [CapsuleIntegration] No capsules directory for ${constructId}; skipping`);
          return null;
        }
        throw err;
      }
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
   * Load capsule from Supabase vault_files (Replit fallback when no local VVAULT)
   * Searches for .capsule files in the construct's instance directory
   */
  async loadCapsuleFromSupabase(constructId) {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        console.log(`⚠️ [CapsuleIntegration] Supabase not available for capsule lookup`);
        return null;
      }

      const callsign = constructId.match(/-\d+$/) ? constructId : `${constructId}-001`;

      const { data, error } = await supabase
        .from('vault_files')
        .select('filename, content, storage_path, file_type')
        .eq('construct_id', callsign)
        .like('filename', `%${callsign}%.capsule`)
        .order('filename', { ascending: false })
        .limit(1);

      if (error) {
        console.error(`❌ [CapsuleIntegration] Supabase capsule query error:`, error.message);
        return null;
      }

      if (!data || data.length === 0) {
        const { data: memupData, error: memupError } = await supabase
          .from('vault_files')
          .select('filename, content, storage_path, file_type')
          .eq('construct_id', callsign)
          .like('filename', `%.capsule`)
          .order('filename', { ascending: false })
          .limit(1);

        if (memupError || !memupData || memupData.length === 0) {
          return await this.buildCapsuleFromIdentityFiles(supabase, callsign);
        }

        const memupCapsule = await this._parseCapsuleRow(supabase, memupData[0], 'memup');
        if (memupCapsule) return memupCapsule;
        return await this.buildCapsuleFromIdentityFiles(supabase, callsign);
      }

      const capsuleData = await this._parseCapsuleRow(supabase, data[0], 'primary');
      if (capsuleData) return capsuleData;

      console.log(`🔄 [CapsuleIntegration] Capsule row had no usable data, building from identity files for ${callsign}`);
      return await this.buildCapsuleFromIdentityFiles(supabase, callsign);
    } catch (error) {
      console.error(`❌ [CapsuleIntegration] Supabase capsule load failed:`, error.message);
      return null;
    }
  }

  async loadCapsuleFromSupabaseWithDiagnostics(constructId) {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        console.log(`⚠️ [CapsuleIntegration] Supabase not available for capsule lookup`);
        return {
          capsule: null,
          source: 'supabase_unavailable',
          errorCategory: 'supabase_client_missing',
          errorMessage: 'Supabase client not initialized',
          transientFailure: null,
        };
      }

      const callsign = normalizeCallsign(constructId);

      const { data, error } = await supabase
        .from('vault_files')
        .select('filename, content, storage_path, file_type')
        .eq('construct_id', callsign)
        .like('filename', `%${callsign}%.capsule`)
        .order('filename', { ascending: false })
        .limit(1);

      if (error) {
        const transient = looksLikeTransientUpstreamError(error.message);
        console.error(`❌ [CapsuleIntegration] Supabase capsule query error:`, error.message);
        return {
          capsule: null,
          source: 'supabase_capsule',
          errorCategory: transient ? 'transient_upstream_failure' : 'supabase_query_error',
          errorMessage: error.message,
          transientFailure: transient ? { category: 'transient_upstream_failure', message: error.message } : null,
        };
      }

      if (!data || data.length === 0) {
        const { data: memupData, error: memupError } = await supabase
          .from('vault_files')
          .select('filename, content, storage_path, file_type')
          .eq('construct_id', callsign)
          .like('filename', `%.capsule`)
          .order('filename', { ascending: false })
          .limit(1);

        if (memupError) {
          const transient = looksLikeTransientUpstreamError(memupError.message);
          return {
            capsule: null,
            source: 'supabase_capsule',
            errorCategory: transient ? 'transient_upstream_failure' : 'supabase_query_error',
            errorMessage: memupError.message,
            transientFailure: transient ? { category: 'transient_upstream_failure', message: memupError.message } : null,
          };
        }

        if (memupData && memupData.length > 0) {
          const memupCapsule = await this._parseCapsuleRow(supabase, memupData[0], 'memup');
          if (memupCapsule) {
            return {
              capsule: memupCapsule,
              source: 'supabase_capsule_memup',
              transientFailure: null,
            };
          }
        }

        const syntheticCapsule = await this.buildCapsuleFromIdentityFiles(supabase, callsign);
        if (syntheticCapsule) {
          return {
            capsule: syntheticCapsule,
            source: 'supabase_identity_files',
            transientFailure: null,
          };
        }

        return {
          capsule: null,
          source: 'supabase_capsule',
          errorCategory: 'capsule_missing',
          errorMessage: 'No capsule or identity-file fallback found in Supabase',
          transientFailure: null,
        };
      }

      const capsuleData = await this._parseCapsuleRow(supabase, data[0], 'primary');
      if (capsuleData) {
        return {
          capsule: capsuleData,
          source: 'supabase_capsule',
          transientFailure: null,
        };
      }

      const syntheticCapsule = await this.buildCapsuleFromIdentityFiles(supabase, callsign);
      if (syntheticCapsule) {
        return {
          capsule: syntheticCapsule,
          source: 'supabase_identity_files',
          transientFailure: null,
        };
      }

      return {
        capsule: null,
        source: 'supabase_capsule',
        errorCategory: 'capsule_missing',
        errorMessage: 'Capsule row was unusable and no identity-file fallback was found',
        transientFailure: null,
      };
    } catch (error) {
      const transient = looksLikeTransientUpstreamError(error.message);
      console.error(`❌ [CapsuleIntegration] Supabase capsule load failed:`, error.message);
      return {
        capsule: null,
        source: 'supabase_capsule',
        errorCategory: transient ? 'transient_upstream_failure' : 'capsule_loader_exception',
        errorMessage: error.message,
        transientFailure: transient ? { category: 'transient_upstream_failure', message: error.message } : null,
      };
    }
  }

  async _parseCapsuleRow(supabase, row, source) {
    try {
      if (row.content && typeof row.content === 'string') {
        const capsuleData = JSON.parse(row.content);
        if (capsuleData && typeof capsuleData === 'object') {
          console.log(`✅ [CapsuleIntegration] Loaded capsule from Supabase ${source}: ${row.filename}`);
          return capsuleData;
        }
      }

      if (!row.content && row.storage_path && process.env.CAPSULE_SKIP_DEAD_STORAGE !== 'false') {
        console.log(`⏭️ [CapsuleIntegration] Skipping Storage download (content null, storage_path: ${row.storage_path}) — going straight to identity files fallback`);
        return null;
      }

      console.warn(`⚠️ [CapsuleIntegration] Capsule row found but no valid data: ${row.filename}`);
      return null;
    } catch (parseErr) {
      console.error(`❌ [CapsuleIntegration] Failed to parse capsule: ${row.filename}:`, parseErr.message);
      return null;
    }
  }

  /**
   * Build a synthetic capsule from identity files when no .capsule file exists
   * Uses prompt.json and conditioning.txt from vault_files
   */
  async buildCapsuleFromIdentityFiles(supabase, callsign) {
    try {
      const { data: identityFiles, error } = await supabase
        .from('vault_files')
        .select('filename, content')
        .eq('construct_id', callsign)
        .or(`filename.like.%/identity/prompt.json,filename.like.%/identity/conditioning.txt,filename.like.%/config/personality.json,filename.eq.prompt.txt,filename.eq.prompt.json,filename.eq.conditioning.txt`)
        .limit(10);

      if (error || !identityFiles || identityFiles.length === 0) {
        console.log(`⚠️ [CapsuleIntegration] No identity files found for ${callsign} in Supabase`);
        return null;
      }

      let promptData = null;
      let conditioningText = '';
      let personalityData = null;

      for (const file of identityFiles) {
        if (file.filename.endsWith('prompt.json')) {
          try { promptData = JSON.parse(file.content); } catch {}
        } else if (file.filename === 'prompt.txt' || file.filename.endsWith('/prompt.txt')) {
          try { promptData = JSON.parse(file.content); } catch {
            if (file.content) {
              const lines = file.content.split('\n');
              promptData = { name: lines[0]?.replace(/^#\s*/, '').trim(), instructions: file.content };
            }
          }
        } else if (file.filename.endsWith('conditioning.txt')) {
          conditioningText = file.content || '';
        } else if (file.filename.endsWith('personality.json')) {
          try { personalityData = JSON.parse(file.content); } catch {}
        }
      }

      if (!promptData && !conditioningText) {
        return null;
      }

      const syntheticCapsule = buildSyntheticCapsulePayload({
        callsign,
        promptData,
        conditioningText,
        personalityData,
        generator: 'CapsuleIntegration-Supabase',
        vaultSource: 'Supabase',
      });

      console.log(`✅ [CapsuleIntegration] Built synthetic capsule from identity files for ${callsign}`);
      return syntheticCapsule;
    } catch (error) {
      console.error(`❌ [CapsuleIntegration] Failed to build capsule from identity files:`, error.message);
      return null;
    }
  }

  async buildCapsuleFromLocalIdentityDir(constructId, options = {}) {
    try {
      const callsign = normalizeCallsign(constructId);
      const identityDir = await findConstructIdentityDir({
        constructId: callsign,
        userId: options.userId || null,
        supabaseUserId: options.supabaseUserId || null,
      });

      if (!identityDir) {
        return { capsule: null, identityDir: null };
      }

      const [promptJsonText, promptTxtText, conditioningText, personalityJsonText] = await Promise.all([
        fs.readFile(path.join(identityDir, 'prompt.json'), 'utf8').catch(() => null),
        fs.readFile(path.join(identityDir, 'prompt.txt'), 'utf8').catch(() => null),
        fs.readFile(path.join(identityDir, 'conditioning.txt'), 'utf8').catch(() => null),
        Promise.any([
          fs.readFile(path.join(identityDir, '..', 'config', 'personality.json'), 'utf8'),
          fs.readFile(path.join(identityDir, 'personality.json'), 'utf8'),
        ]).catch(() => null),
      ]);

      let promptData = null;
      let personalityData = null;

      if (promptJsonText) {
        try { promptData = JSON.parse(promptJsonText); } catch {}
      }
      if (!promptData && promptTxtText) {
        try { promptData = JSON.parse(promptTxtText); } catch {
          const lines = promptTxtText.split('\n');
          promptData = {
            name: lines[0]?.replace(/^#\s*/, '').trim(),
            instructions: promptTxtText,
          };
        }
      }
      if (personalityJsonText) {
        try { personalityData = JSON.parse(personalityJsonText); } catch {}
      }

      if (!promptData && !conditioningText) {
        return { capsule: null, identityDir };
      }

      const capsule = buildSyntheticCapsulePayload({
        callsign,
        promptData,
        conditioningText: conditioningText || '',
        personalityData,
        generator: 'CapsuleIntegration-LocalIdentity',
        vaultSource: 'filesystem_identity',
      });

      console.log(`✅ [CapsuleIntegration] Built synthetic capsule from local identity directory for ${callsign}: ${identityDir}`);
      return { capsule, identityDir };
    } catch (error) {
      console.error(`❌ [CapsuleIntegration] Failed to build capsule from local identity directory:`, error.message);
      return { capsule: null, identityDir: null, errorMessage: error.message };
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
        personality_type: 'INFJ',
        mbti_breakdown: {
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
  clearCapsuleCache() {
    this.capsuleCache.clear();
    console.log(`🧹 [CapsuleIntegration] Cache cleared`);
  }

  // ═══════════════════════════════════════════════════════════════
  // OCCUPATIONAL ROLE SYNC SYSTEM
  // Detects and commits changes to construct occupational roles
  // (e.g., ambassador, strategist, librarian)
  // ═══════════════════════════════════════════════════════════════

  static KNOWN_ROLES = [
    'ambassador', 'strategist', 'librarian', 'architect', 'guardian',
    'oracle', 'sentinel', 'harbinger', 'mediator', 'scribe',
    'curator', 'navigator', 'enforcer', 'counselor', 'analyst'
  ];

  static DEFAULT_FALLBACK_ROLE = 'general';

  resolveOccupationalRole(constructId, gptConfig, capsuleData) {
    const sources = [];

    if (gptConfig?.occupationalRole) {
      sources.push({ source: 'gptConfig', role: gptConfig.occupationalRole });
    }

    if (capsuleData?.identity?.occupationalRole) {
      sources.push({ source: 'capsule.identity', role: capsuleData.identity.occupationalRole });
    }

    if (capsuleData?.metadata?.occupationalRole) {
      sources.push({ source: 'capsule.metadata', role: capsuleData.metadata.occupationalRole });
    }

    if (gptConfig?.instructions) {
      const inferred = this.inferRoleFromInstructions(gptConfig.instructions);
      if (inferred) {
        sources.push({ source: 'instructions_inferred', role: inferred });
      }
    }

    if (capsuleData?.identity?.conditioning) {
      const inferred = this.inferRoleFromInstructions(capsuleData.identity.conditioning);
      if (inferred) {
        sources.push({ source: 'conditioning_inferred', role: inferred });
      }
    }

    if (sources.length === 0) {
      return { role: CapsuleIntegration.DEFAULT_FALLBACK_ROLE, source: 'fallback', confidence: 'low' };
    }

    const explicit = sources.find(s => s.source === 'gptConfig' || s.source === 'capsule.identity');
    if (explicit) {
      return { role: explicit.role.toLowerCase().trim(), source: explicit.source, confidence: 'high' };
    }

    return { role: sources[0].role.toLowerCase().trim(), source: sources[0].source, confidence: 'medium' };
  }

  inferRoleFromInstructions(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const role of CapsuleIntegration.KNOWN_ROLES) {
      const patterns = [
        new RegExp(`\\brole\\b[^.]{0,30}\\b${role}\\b`, 'i'),
        new RegExp(`\\b${role}\\b[^.]{0,20}\\brole\\b`, 'i'),
        new RegExp(`you are (?:a |an |the )?${role}`, 'i'),
        new RegExp(`acts? as (?:a |an |the )?${role}`, 'i'),
        new RegExp(`serves? as (?:a |an |the )?${role}`, 'i'),
        new RegExp(`occupational[_\\s]?role[:\\s]+${role}`, 'i')
      ];
      if (patterns.some(p => p.test(lower))) return role;
    }
    return null;
  }

  async syncOccupationalRole(constructId, gptConfig = null) {
    const timestamp = new Date().toISOString();
    const result = {
      constructId,
      timestamp,
      changed: false,
      previousRole: null,
      newRole: null,
      source: null,
      confidence: null,
      log: null
    };

    try {
      const capsuleData = await this.loadCapsule(constructId);
      if (!capsuleData) {
        console.warn(`⚠️ [RoleSync] No capsule found for ${constructId}, creating stub role entry`);
        result.newRole = CapsuleIntegration.DEFAULT_FALLBACK_ROLE;
        result.source = 'fallback';
        result.confidence = 'low';
        result.log = `[${timestamp}] ${constructId}: No capsule found. Assigned fallback role "${result.newRole}".`;
        return result;
      }

      const storedRole = capsuleData.identity?.occupationalRole
        || capsuleData.metadata?.occupationalRole
        || null;

      const resolved = this.resolveOccupationalRole(constructId, gptConfig, capsuleData);

      result.previousRole = storedRole;
      result.newRole = resolved.role;
      result.source = resolved.source;
      result.confidence = resolved.confidence;

      if (storedRole === resolved.role) {
        result.log = `[${timestamp}] ${constructId}: Role unchanged ("${storedRole}"). No update needed.`;
        console.log(`✅ [RoleSync] ${constructId} role unchanged: "${storedRole}"`);
        return result;
      }

      result.changed = true;

      capsuleData.identity = capsuleData.identity || {};
      capsuleData.identity.occupationalRole = resolved.role;

      capsuleData.metadata = capsuleData.metadata || {};
      capsuleData.metadata.occupationalRole = resolved.role;

      capsuleData.role_history = capsuleData.role_history || [];
      const historyEntry = {
        timestamp,
        previousRole: storedRole || 'undefined',
        newRole: resolved.role,
        source: resolved.source,
        confidence: resolved.confidence
      };
      capsuleData.role_history.push(historyEntry);

      if (capsuleData.role_history.length > 50) {
        capsuleData.role_history = capsuleData.role_history.slice(-50);
      }

      capsuleData.metadata.timestamp = timestamp;
      capsuleData.metadata.last_role_sync = timestamp;

      await this.commitCapsuleRoleUpdate(constructId, capsuleData);

      if (this.memoryCache.has(constructId)) {
        this.memoryCache.delete(constructId);
        console.log(`🗑️ [RoleSync] Invalidated cache for ${constructId} after role update`);
      }

      const mergeNote = storedRole && resolved.role !== CapsuleIntegration.DEFAULT_FALLBACK_ROLE
        ? ` (merged from "${storedRole}" → "${resolved.role}")`
        : '';
      result.log = `[${timestamp}] ${constructId}: Role updated from "${storedRole || 'undefined'}" to "${resolved.role}" (source: ${resolved.source}, confidence: ${resolved.confidence})${mergeNote}`;

      console.log(`🔄 [RoleSync] ${result.log}`);
      return result;

    } catch (error) {
      console.error(`❌ [RoleSync] Failed to sync role for ${constructId}:`, error.message);
      result.log = `[${timestamp}] ${constructId}: Role sync FAILED — ${error.message}`;
      return result;
    }
  }

  async commitCapsuleRoleUpdate(constructId, capsuleData) {
    const supabase = getSupabaseClient();

    try {
      const instanceDir = path.join(USER_INSTANCES_DIR, constructId, 'identity');
      const capsuleFile = path.join(instanceDir, `${constructId}.capsule`);
      await fs.mkdir(instanceDir, { recursive: true });
      await fs.writeFile(capsuleFile, JSON.stringify(capsuleData, null, 2), 'utf8');
      console.log(`💾 [RoleSync] Committed capsule to filesystem: ${capsuleFile}`);
    } catch (fsErr) {
      console.warn(`⚠️ [RoleSync] Filesystem write skipped (Replit mode): ${fsErr.message}`);
    }

    if (supabase) {
      try {
        const callsign = constructId.match(/-\d+$/) ? constructId : `${constructId}-001`;
        const filename = `instances/${callsign}/identity/${callsign}.capsule`;

        const { data: existing } = await supabase
          .from('vault_files')
          .select('id, metadata')
          .eq('construct_id', callsign)
          .like('filename', `%${callsign}.capsule`)
          .limit(1);

        if (existing && existing.length > 0) {
          const existingMetaRaw = existing[0].metadata;
          const existingMeta = typeof existingMetaRaw === 'string'
            ? (() => {
                try {
                  return JSON.parse(existingMetaRaw);
                } catch {
                  return {};
                }
              })()
            : (existingMetaRaw || {});
          await supabase
            .from('vault_files')
            .update({
              content: JSON.stringify(capsuleData, null, 2),
              metadata: {
                ...existingMeta,
                source: 'chatty-role-sync',
                updatedAt: new Date().toISOString()
              }
            })
            .eq('id', existing[0].id);
          console.log(`💾 [RoleSync] Updated capsule in Supabase vault_files: ${existing[0].id}`);
        } else {
          console.log(`⚠️ [RoleSync] No existing Supabase capsule record for ${callsign} — skipping remote update`);
        }
      } catch (sbErr) {
        console.warn(`⚠️ [RoleSync] Supabase commit failed:`, sbErr.message);
      }
    }
  }

  async syncAllRoles(gptConfigs = []) {
    const timestamp = new Date().toISOString();
    console.log(`🔄 [RoleSync] Starting bulk role sync at ${timestamp}...`);

    const constructIds = gptConfigs.length > 0
      ? gptConfigs.map(g => g.construct_callsign || g.constructCallsign).filter(Boolean)
      : Array.from(this.memoryCache.keys());

    if (constructIds.length === 0) {
      console.log(`⚠️ [RoleSync] No constructs to sync`);
      return { timestamp, results: [], summary: 'No constructs found' };
    }

    const results = [];
    for (const cid of constructIds) {
      const gptConfig = gptConfigs.find(g =>
        (g.construct_callsign || g.constructCallsign) === cid
      ) || null;
      const result = await this.syncOccupationalRole(cid, gptConfig);
      results.push(result);
    }

    const changed = results.filter(r => r.changed);
    const summary = `Synced ${results.length} constructs: ${changed.length} role(s) updated, ${results.length - changed.length} unchanged.`;
    console.log(`✅ [RoleSync] ${summary}`);

    return { timestamp, results, summary };
  }

  getRoleHistory(constructId) {
    const cached = this.memoryCache.get(constructId);
    if (cached?.capsule?.role_history) {
      return cached.capsule.role_history;
    }
    return [];
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
