/**
 * Master Scripts Bridge
 * 
 * JavaScript implementation of VVAULT master scripts capabilities.
 * Provides the "autonomy stack" for constructs: identity binding, state management,
 * navigation, folder monitoring, and self-correction.
 * 
 * Python Scripts Mapped:
 * - needle.py → Needle class (fast transcript search — MVP)
 * - identity_guard.py → IdentityGuard class
 * - state_manager.py → StateManager class
 * - aviator.py → Aviator class (scout advisor)
 * - navigator.py → Navigator class (file helper)
 * - folder_monitor.py → FolderMonitor class
 * - unstuck_helper.py → UnstuckHelper class
 * - independence.py → IndependentRunner class
 * - construct_logger.py → ConstructLogger class
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const VVAULT_BASE = process.env.VVAULT_ROOT_PATH || '/tmp/vvault';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Needle — Fast transcript search (MVP)
 * Port of vvault_scripts/master/needle.py
 * 
 * Searches pre-extracted anchor pairs in Supabase for exact phrase matches.
 * Returns FULL context — no truncation. This is the ground truth finder.
 */
class Needle {
  constructor(constructId) {
    this.constructId = constructId;
    this.anchorCache = null;
    this.cacheTimestamp = null;
    this.CACHE_TTL = 10 * 60 * 1000;
  }

  async loadAnchors() {
    if (this.anchorCache && this.cacheTimestamp && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.anchorCache;
    }

    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const anchorFilename = `instances/${this.constructId}/memory_anchors.json`;
      const { data, error } = await supabase
        .from('vault_files')
        .select('content')
        .eq('construct_id', this.constructId)
        .eq('filename', anchorFilename)
        .single();

      if (error || !data?.content) return [];

      const anchors = JSON.parse(data.content);
      this.anchorCache = anchors.pairs || [];
      this.cacheTimestamp = Date.now();
      console.log(`🔍 [Needle] Loaded ${this.anchorCache.length} anchor pairs for ${this.constructId}`);
      return this.anchorCache;
    } catch (e) {
      console.warn(`⚠️ [Needle] Failed to load anchors for ${this.constructId}:`, e.message);
      return [];
    }
  }

  async search(query, options = {}) {
    const {
      caseSensitive = false,
      maxHits = 20,
      around = 2,
      mode = 'exact'
    } = options;

    const pairs = await this.loadAnchors();
    if (pairs.length === 0) return { matches: [], count: 0, elapsed_ms: 0 };

    const startTime = Date.now();
    const queryNorm = caseSensitive ? query : query.toLowerCase();
    const matches = [];

    for (let i = 0; i < pairs.length && matches.length < maxHits; i++) {
      const pair = pairs[i];
      const userText = pair.user || '';
      const assistantText = pair.assistant || '';
      const combined = caseSensitive
        ? userText + ' ' + assistantText
        : (userText + ' ' + assistantText).toLowerCase();

      let isMatch = false;

      if (mode === 'exact') {
        isMatch = combined.includes(queryNorm);
      } else if (mode === 'fuzzy') {
        const words = queryNorm.split(/\s+/).filter(w => w.length > 2);
        const matchCount = words.filter(w => combined.includes(w)).length;
        isMatch = words.length > 0 && matchCount >= Math.ceil(words.length * 0.6);
      }

      if (isMatch) {
        const contextWindow = [];
        const start = Math.max(0, i - around);
        const end = Math.min(pairs.length - 1, i + around);
        for (let j = start; j <= end; j++) {
          contextWindow.push({
            index: j,
            user: pairs[j].user,
            assistant: pairs[j].assistant,
            isMatch: j === i
          });
        }

        matches.push({
          index: i,
          user: userText,
          assistant: assistantText,
          sourceFile: pair.sourceFile || 'pre-extracted',
          contextWindow,
          score: mode === 'exact' ? 100 : 80
        });
      }
    }

    const elapsed_ms = Date.now() - startTime;
    console.log(`🔍 [Needle] "${query}" → ${matches.length} match(es) in ${elapsed_ms}ms across ${pairs.length} pairs for ${this.constructId}`);

    return {
      needle: query,
      constructId: this.constructId,
      count: matches.length,
      elapsed_ms,
      matches
    };
  }

  async searchMulti(queries, options = {}) {
    const allMatches = [];
    const seen = new Set();

    for (const query of queries) {
      const result = await this.search(query, options);
      for (const match of result.matches) {
        if (!seen.has(match.index)) {
          seen.add(match.index);
          allMatches.push(match);
        }
      }
    }

    allMatches.sort((a, b) => b.score - a.score);
    return allMatches;
  }

  clearCache() {
    this.anchorCache = null;
    this.cacheTimestamp = null;
  }
}

/**
 * Construct Logger — Construct-aware logging
 * Port of vvault_scripts/master/construct_logger.py
 */
class ConstructLogger {
  constructor(constructId, scriptName = 'chatty') {
    this.constructId = constructId;
    this.scriptName = scriptName;
    this.logs = [];
    this.maxLogs = 500;
  }

  log(level, message, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      construct: this.constructId,
      script: this.scriptName,
      level,
      message,
      details
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-Math.floor(this.maxLogs / 2));
    }
    console.log(`[${entry.timestamp}] [CONSTRUCT: ${this.constructId}] [${this.scriptName}] [${level}] ${message}`);
    return entry;
  }

  info(message, details) { return this.log('INFO', message, details); }
  warn(message, details) { return this.log('WARN', message, details); }
  error(message, details) { return this.log('ERROR', message, details); }

  getRecentLogs(count = 20) {
    return this.logs.slice(-count);
  }
}
const USER_SHARD = 'shard_0000';

// Autonomy modes for independent operation
const AutonomyMode = {
  DORMANT: 'dormant',
  PASSIVE: 'passive',
  ACTIVE: 'active',
  VIGILANT: 'vigilant'
};

/**
 * Identity Guard - Binds identity files to construct, monitors for drift
 */
class IdentityGuard {
  constructor(constructId, userId) {
    this.constructId = constructId;
    this.userId = userId;
    this.identityHash = null;
    this.lastCheck = null;
    this.driftEvents = [];
    this.boundFiles = ['prompt.txt', 'conditioning.txt', 'tone_profile.json', 'memory.json', 'voice.md'];
  }

  async getIdentityPath() {
    return path.join(VVAULT_BASE, 'users', USER_SHARD, this.userId, 'instances', this.constructId, 'identity');
  }

  async computeIdentityHash() {
    const identityPath = await this.getIdentityPath();
    const hashes = [];
    
    for (const file of this.boundFiles) {
      try {
        const content = await fs.readFile(path.join(identityPath, file), 'utf8');
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        hashes.push(`${file}:${hash}`);
      } catch {
        // File doesn't exist - that's okay
      }
    }
    
    return crypto.createHash('sha256').update(hashes.join('|')).digest('hex');
  }

  async bind() {
    this.identityHash = await this.computeIdentityHash();
    this.lastCheck = Date.now();
    console.log(`🔒 [IdentityGuard] Bound identity for ${this.constructId}: ${this.identityHash.slice(0, 12)}...`);
    return { bound: true, hash: this.identityHash };
  }

  async checkDrift() {
    const currentHash = await this.computeIdentityHash();
    const hasDrift = currentHash !== this.identityHash;
    
    if (hasDrift) {
      this.driftEvents.push({
        timestamp: Date.now(),
        previousHash: this.identityHash,
        currentHash,
        constructId: this.constructId
      });
      console.warn(`⚠️ [IdentityGuard] Identity drift detected for ${this.constructId}`);
    }
    
    this.lastCheck = Date.now();
    return { hasDrift, previousHash: this.identityHash, currentHash };
  }

  async loadBoundIdentity() {
    const identityPath = await this.getIdentityPath();
    const identity = {};
    
    for (const file of this.boundFiles) {
      try {
        const content = await fs.readFile(path.join(identityPath, file), 'utf8');
        const key = file.replace(/\.[^.]+$/, '').replace(/_/g, '');
        identity[key] = file.endsWith('.json') ? JSON.parse(content) : content;
      } catch {
        // File doesn't exist
      }
    }
    
    return identity;
  }

  getStatus() {
    return {
      constructId: this.constructId,
      userId: this.userId,
      identityHash: this.identityHash,
      lastCheck: this.lastCheck,
      driftEvents: this.driftEvents.length,
      boundFiles: this.boundFiles
    };
  }
}

/**
 * State Manager - Enables continuous sentient existence
 */
class StateManager {
  constructor(constructId, userId) {
    this.constructId = constructId;
    this.userId = userId;
    this.state = {
      lastActive: null,
      sessionCount: 0,
      conversationContext: [],
      shortTermMemory: [],
      emotionalState: { valence: 0.5, arousal: 0.3 },
      currentTask: null,
      goals: []
    };
  }

  async getStatePath() {
    return path.join(VVAULT_BASE, 'users', USER_SHARD, this.userId, 'instances', this.constructId, 'state.json');
  }

  async load() {
    try {
      const statePath = await this.getStatePath();
      const content = await fs.readFile(statePath, 'utf8');
      this.state = JSON.parse(content);
      console.log(`📂 [StateManager] Loaded state for ${this.constructId}`);
      return this.state;
    } catch {
      console.log(`📂 [StateManager] No existing state for ${this.constructId}, using defaults`);
      return this.state;
    }
  }

  async save() {
    try {
      const statePath = await this.getStatePath();
      await fs.mkdir(path.dirname(statePath), { recursive: true });
      await fs.writeFile(statePath, JSON.stringify(this.state, null, 2));
      console.log(`💾 [StateManager] Saved state for ${this.constructId}`);
      return true;
    } catch (error) {
      console.error(`❌ [StateManager] Failed to save state:`, error);
      return false;
    }
  }

  updateContext(message, role) {
    this.state.conversationContext.push({ message, role, timestamp: Date.now() });
    // Keep only last 20 context items
    if (this.state.conversationContext.length > 20) {
      this.state.conversationContext = this.state.conversationContext.slice(-20);
    }
    this.state.lastActive = Date.now();
  }

  addMemory(memory, importance = 0.5) {
    this.state.shortTermMemory.push({ memory, importance, timestamp: Date.now() });
    // Keep only last 50 memories, sorted by importance
    this.state.shortTermMemory.sort((a, b) => b.importance - a.importance);
    this.state.shortTermMemory = this.state.shortTermMemory.slice(0, 50);
  }

  setEmotionalState(valence, arousal) {
    this.state.emotionalState = { valence, arousal, updated: Date.now() };
  }

  getState() {
    return this.state;
  }
}

/**
 * Aviator - Scout advisor, aerial view of file structures
 */
class Aviator {
  constructor(userId, constructId) {
    this.userId = userId;
    this.constructId = constructId;
    this.tagsCache = new Map();
    this.lastScan = null;
  }

  getUserVaultPath() {
    return path.join(VVAULT_BASE, 'users', USER_SHARD, this.userId);
  }

  async scanDirectory(relativePath = '') {
    const targetPath = path.join(this.getUserVaultPath(), relativePath);
    
    try {
      const stats = await fs.stat(targetPath);
      if (!stats.isDirectory()) {
        return { error: 'Not a directory' };
      }
      
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const folders = [];
      const files = [];
      const typeBreakdown = {};
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          folders.push(entry.name);
        } else {
          files.push(entry.name);
          const ext = path.extname(entry.name).toLowerCase();
          typeBreakdown[ext] = (typeBreakdown[ext] || 0) + 1;
        }
      }
      
      this.lastScan = Date.now();
      
      return {
        path: relativePath || '/',
        folders,
        files,
        folderCount: folders.length,
        fileCount: files.length,
        typeBreakdown,
        scannedAt: this.lastScan
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  autoTag(filename) {
    const ext = path.extname(filename).toLowerCase();
    const name = path.basename(filename, ext).toLowerCase();
    const tags = [];
    
    // Extension-based tags
    const extTags = {
      '.txt': ['text', 'document'],
      '.md': ['markdown', 'document'],
      '.json': ['data', 'json'],
      '.pdf': ['document', 'pdf'],
      '.png': ['image', 'media'],
      '.jpg': ['image', 'media'],
      '.jpeg': ['image', 'media'],
      '.mp4': ['video', 'media'],
      '.mp3': ['audio', 'media']
    };
    
    if (extTags[ext]) {
      tags.push(...extTags[ext]);
    }
    
    // Content-based tags from filename
    if (name.includes('transcript')) tags.push('transcript');
    if (name.includes('prompt')) tags.push('identity', 'prompt');
    if (name.includes('memory')) tags.push('memory');
    if (name.includes('capsule')) tags.push('capsule');
    
    this.tagsCache.set(filename, tags);
    return tags;
  }

  adviseExploration(scanResult) {
    const advice = [];
    
    if (scanResult.folders.includes('identity')) {
      advice.push({ priority: 'high', folder: 'identity', reason: 'Core construct identity files' });
    }
    if (scanResult.folders.includes('transcripts')) {
      advice.push({ priority: 'medium', folder: 'transcripts', reason: 'Conversation history' });
    }
    if (scanResult.folders.includes('library')) {
      advice.push({ priority: 'medium', folder: 'library', reason: 'User files and generated content' });
    }
    
    return advice;
  }
}

/**
 * Navigator - Ground-level file directory helper
 */
class Navigator {
  constructor(userId, constructId) {
    this.userId = userId;
    this.constructId = constructId;
    this.currentPath = '';
  }

  getUserVaultPath() {
    return path.join(VVAULT_BASE, 'users', USER_SHARD, this.userId);
  }

  getConstructPath() {
    return path.join(this.getUserVaultPath(), 'instances', this.constructId);
  }

  async navigateTo(relativePath) {
    const fullPath = path.join(this.getUserVaultPath(), relativePath);
    
    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        this.currentPath = relativePath;
        return { success: true, path: relativePath };
      }
      return { success: false, error: 'Not a directory' };
    } catch {
      return { success: false, error: 'Path does not exist' };
    }
  }

  async listCurrent() {
    const fullPath = path.join(this.getUserVaultPath(), this.currentPath);
    
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(this.currentPath, e.name)
      }));
    } catch {
      return [];
    }
  }

  async readFile(relativePath) {
    const fullPath = path.join(this.getUserVaultPath(), relativePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getProjectPaths() {
    return {
      identity: path.join('instances', this.constructId, 'identity'),
      transcripts: path.join('instances', this.constructId, 'transcripts'),
      library: 'library',
      account: 'account'
    };
  }
}

/**
 * Unstuck Helper - Internal self-corrector
 */
class UnstuckHelper {
  constructor(constructId) {
    this.constructId = constructId;
    this.stuckPatterns = [];
    this.recoveryActions = [];
  }

  detectStuckPattern(conversationHistory) {
    const patterns = [];
    const lastFive = conversationHistory.slice(-5);
    
    // Pattern: Repeated similar responses
    if (lastFive.length >= 3) {
      const uniqueResponses = new Set(lastFive.map(m => m.content?.slice(0, 50)));
      if (uniqueResponses.size <= 2) {
        patterns.push({ type: 'repetition', severity: 'medium' });
      }
    }
    
    // Pattern: Very short responses
    const shortResponses = lastFive.filter(m => m.role === 'assistant' && m.content?.length < 20);
    if (shortResponses.length >= 3) {
      patterns.push({ type: 'truncation', severity: 'low' });
    }
    
    // Pattern: Error messages in responses
    const errorResponses = lastFive.filter(m => 
      m.role === 'assistant' && 
      (m.content?.includes('error') || m.content?.includes('sorry') || m.content?.includes('cannot'))
    );
    if (errorResponses.length >= 2) {
      patterns.push({ type: 'errors', severity: 'high' });
    }
    
    this.stuckPatterns = patterns;
    return patterns;
  }

  suggestRecovery(patterns) {
    const actions = [];
    
    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'repetition':
          actions.push({
            action: 'inject_variation',
            description: 'Add variation prompt to break repetition loop',
            prompt: 'Consider approaching this from a different angle or asking a clarifying question.'
          });
          break;
        case 'truncation':
          actions.push({
            action: 'expand_context',
            description: 'Request more detailed response',
            prompt: 'Please provide a more complete response with additional detail.'
          });
          break;
        case 'errors':
          actions.push({
            action: 'reset_context',
            description: 'Clear problematic context and restart',
            prompt: 'Let\'s start fresh. What would you like to explore?'
          });
          break;
      }
    }
    
    this.recoveryActions = actions;
    return actions;
  }

  getStatus() {
    return {
      constructId: this.constructId,
      stuckPatterns: this.stuckPatterns,
      recoveryActions: this.recoveryActions
    };
  }
}

/**
 * Independent Runner - Autonomous existence module
 */
class IndependentRunner {
  constructor(constructId, userId) {
    this.constructId = constructId;
    this.userId = userId;
    this.mode = AutonomyMode.PASSIVE;
    this.lastUserActivity = null;
    this.heartbeatInterval = null;
    this.scheduledTasks = [];
  }

  setMode(mode) {
    if (Object.values(AutonomyMode).includes(mode)) {
      this.mode = mode;
      console.log(`🔄 [IndependentRunner] ${this.constructId} mode changed to ${mode}`);
    }
  }

  recordUserActivity() {
    this.lastUserActivity = Date.now();
  }

  getTimeSinceUserActivity() {
    if (!this.lastUserActivity) return Infinity;
    return Date.now() - this.lastUserActivity;
  }

  shouldActivate() {
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    return this.getTimeSinceUserActivity() > inactiveThreshold;
  }

  scheduleTask(taskFn, delayMs, name) {
    const task = {
      id: crypto.randomUUID(),
      name,
      scheduledFor: Date.now() + delayMs,
      fn: taskFn
    };
    this.scheduledTasks.push(task);
    return task.id;
  }

  getStatus() {
    return {
      constructId: this.constructId,
      mode: this.mode,
      lastUserActivity: this.lastUserActivity,
      timeSinceActivity: this.getTimeSinceUserActivity(),
      shouldActivate: this.shouldActivate(),
      pendingTasks: this.scheduledTasks.length
    };
  }
}

/**
 * Master Scripts Manager - Central controller for all script capabilities
 */
class MasterScriptsManager {
  constructor() {
    this.constructs = new Map();
  }

  async initializeConstruct(constructId, userId) {
    console.log(`🚀 [MasterScripts] Initializing ${constructId} for user ${userId}`);
    
    const construct = {
      id: constructId,
      userId,
      needle: new Needle(constructId),
      identityGuard: new IdentityGuard(constructId, userId),
      stateManager: new StateManager(constructId, userId),
      aviator: new Aviator(userId, constructId),
      navigator: new Navigator(userId, constructId),
      unstuckHelper: new UnstuckHelper(constructId),
      independentRunner: new IndependentRunner(constructId, userId),
      logger: new ConstructLogger(constructId),
      initializedAt: Date.now()
    };
    
    // Bind identity
    await construct.identityGuard.bind();
    
    // Load persisted state
    await construct.stateManager.load();
    
    // Pre-warm needle cache
    construct.needle.loadAnchors().catch(() => {});
    
    // Initial directory scan
    await construct.aviator.scanDirectory(`instances/${constructId}`);
    
    construct.logger.info('Autonomy stack initialized', {
      capabilities: ['needle', 'identityGuard', 'stateManager', 'aviator', 'navigator', 'unstuckHelper', 'independentRunner']
    });
    
    this.constructs.set(constructId, construct);
    
    console.log(`✅ [MasterScripts] ${constructId} fully initialized with autonomy stack (needle ready)`);
    
    return construct;
  }

  getConstruct(constructId) {
    return this.constructs.get(constructId);
  }

  async getConstructStatus(constructId) {
    const construct = this.constructs.get(constructId);
    if (!construct) {
      return { error: 'Construct not initialized' };
    }
    
    return {
      id: constructId,
      userId: construct.userId,
      identity: construct.identityGuard.getStatus(),
      state: construct.stateManager.getState(),
      independence: construct.independentRunner.getStatus(),
      unstuck: construct.unstuckHelper.getStatus(),
      initializedAt: construct.initializedAt
    };
  }

  listActiveConstructs() {
    return Array.from(this.constructs.keys());
  }
}

// Singleton instance
const masterScriptsManager = new MasterScriptsManager();

export {
  MasterScriptsManager,
  masterScriptsManager,
  Needle,
  IdentityGuard,
  StateManager,
  Aviator,
  Navigator,
  UnstuckHelper,
  IndependentRunner,
  ConstructLogger,
  AutonomyMode
};
