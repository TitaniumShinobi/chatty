/**
 * Master Scripts Bridge
 * 
 * JavaScript implementation of VVAULT master scripts capabilities.
 * Provides the "autonomy stack" for constructs: identity binding, state management,
 * navigation, folder monitoring, and self-correction.
 * 
 * Python Scripts Mapped:
 * - identity_guard.py → IdentityGuard class
 * - state_manager.py → StateManager class
 * - aviator.py → Aviator class (scout advisor)
 * - navigator.py → Navigator class (file helper)
 * - folder_monitor.py → FolderMonitor class
 * - unstuck_helper.py → UnstuckHelper class
 * - independence.py → IndependentRunner class
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const VVAULT_BASE = process.env.VVAULT_ROOT_PATH || '/tmp/vvault';
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
      identityGuard: new IdentityGuard(constructId, userId),
      stateManager: new StateManager(constructId, userId),
      aviator: new Aviator(userId, constructId),
      navigator: new Navigator(userId, constructId),
      unstuckHelper: new UnstuckHelper(constructId),
      independentRunner: new IndependentRunner(constructId, userId),
      initializedAt: Date.now()
    };
    
    // Bind identity
    await construct.identityGuard.bind();
    
    // Load persisted state
    await construct.stateManager.load();
    
    // Initial directory scan
    await construct.aviator.scanDirectory(`instances/${constructId}`);
    
    this.constructs.set(constructId, construct);
    
    console.log(`✅ [MasterScripts] ${constructId} fully initialized with autonomy stack`);
    
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
  IdentityGuard,
  StateManager,
  Aviator,
  Navigator,
  UnstuckHelper,
  IndependentRunner,
  AutonomyMode
};
