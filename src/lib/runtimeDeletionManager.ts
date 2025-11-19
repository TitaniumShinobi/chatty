/**
 * Runtime Deletion Manager
 * 
 * Manages permanent deletion of runtimes with persistent storage.
 * Ensures deleted runtimes never reappear across app restarts or user sessions.
 */

export interface DeletedRuntimeEntry {
  key: string;
  runtimeId: string;
  name: string;
  deletedAt: number;
  reason?: string;
}

export class RuntimeDeletionManager {
  private static instance: RuntimeDeletionManager;
  private readonly STORAGE_KEY = 'chatty:deleted-runtimes';
  private readonly USER_STORAGE_PREFIX = 'chatty:deleted-runtimes:user:';
  private deletedRuntimesCache: Map<string, DeletedRuntimeEntry> = new Map();
  private initialized = false;

  static getInstance(): RuntimeDeletionManager {
    if (!RuntimeDeletionManager.instance) {
      RuntimeDeletionManager.instance = new RuntimeDeletionManager();
    }
    return RuntimeDeletionManager.instance;
  }

  private constructor() {
    this.initializeFromStorage();
  }

  /**
   * Initialize the deletion manager from persistent storage
   */
  private initializeFromStorage(): void {
    if (this.initialized) return;
    
    try {
      // Load global deleted runtimes
      const globalDeletedRaw = localStorage.getItem(this.STORAGE_KEY);
      if (globalDeletedRaw) {
        const globalDeleted = JSON.parse(globalDeletedRaw) as DeletedRuntimeEntry[];
        globalDeleted.forEach(entry => {
          this.deletedRuntimesCache.set(entry.key, entry);
        });
      }

      // Load user-specific deleted runtimes (for all users)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.USER_STORAGE_PREFIX)) {
          const userDeletedRaw = localStorage.getItem(key);
          if (userDeletedRaw) {
            const userDeleted = JSON.parse(userDeletedRaw) as DeletedRuntimeEntry[];
            userDeleted.forEach(entry => {
              this.deletedRuntimesCache.set(entry.key, entry);
            });
          }
        }
      }

      this.initialized = true;
      console.log(`🗑️ RuntimeDeletionManager initialized with ${this.deletedRuntimesCache.size} deleted runtimes`);
    } catch (error) {
      console.error('❌ Failed to initialize RuntimeDeletionManager:', error);
      this.initialized = true; // Continue with empty cache
    }
  }

  /**
   * Mark a runtime as permanently deleted
   */
  async deleteRuntime(
    runtimeKey: string, 
    runtimeId: string, 
    name: string, 
    userId?: string,
    reason?: string
  ): Promise<void> {
    const entry: DeletedRuntimeEntry = {
      key: runtimeKey,
      runtimeId,
      name,
      deletedAt: Date.now(),
      reason
    };

    // Add to cache
    this.deletedRuntimesCache.set(runtimeKey, entry);

    try {
      if (userId) {
        // Store user-specific deletion
        const userKey = this.USER_STORAGE_PREFIX + userId;
        const existingUserDeleted = this.getUserDeletedRuntimes(userId);
        const updatedUserDeleted = existingUserDeleted.filter(e => e.key !== runtimeKey);
        updatedUserDeleted.push(entry);
        localStorage.setItem(userKey, JSON.stringify(updatedUserDeleted));
      } else {
        // Store global deletion
        const existingGlobalDeleted = this.getGlobalDeletedRuntimes();
        const updatedGlobalDeleted = existingGlobalDeleted.filter(e => e.key !== runtimeKey);
        updatedGlobalDeleted.push(entry);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedGlobalDeleted));
      }

      console.log(`🗑️ Runtime permanently deleted: ${name} (${runtimeKey})${userId ? ` for user ${userId}` : ' globally'}`);
      
      // Also try to store in VVAULT for cross-device persistence
      await this.saveToVVAULT(entry, userId);
    } catch (error) {
      console.error('❌ Failed to persist runtime deletion:', error);
      throw error;
    }
  }

  /**
   * Delete multiple runtimes with the same runtimeId (handles duplicates)
   */
  async deleteRuntimeById(
    runtimeId: string, 
    allRuntimes: Array<{key: string, runtimeId: string, name: string}>,
    userId?: string,
    reason?: string
  ): Promise<void> {
    const matchingRuntimes = allRuntimes.filter(rt => rt.runtimeId === runtimeId);
    
    for (const runtime of matchingRuntimes) {
      await this.deleteRuntime(runtime.key, runtime.runtimeId, runtime.name, userId, reason);
    }

    if (matchingRuntimes.length > 1) {
      console.log(`🗑️ Deleted ${matchingRuntimes.length} duplicate runtimes with ID: ${runtimeId}`);
    }
  }

  /**
   * Check if a runtime is deleted
   */
  isRuntimeDeleted(runtimeKey: string): boolean {
    return this.deletedRuntimesCache.has(runtimeKey);
  }

  /**
   * Check if a runtime ID is deleted (any variant)
   */
  isRuntimeIdDeleted(runtimeId: string): boolean {
    for (const entry of this.deletedRuntimesCache.values()) {
      if (entry.runtimeId === runtimeId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Filter out deleted runtimes from a list
   */
  filterDeletedRuntimes<T extends {key: string, runtimeId: string}>(runtimes: T[]): T[] {
    return runtimes.filter(runtime => 
      !this.isRuntimeDeleted(runtime.key) && !this.isRuntimeIdDeleted(runtime.runtimeId)
    );
  }

  /**
   * Get all deleted runtimes
   */
  getAllDeletedRuntimes(): DeletedRuntimeEntry[] {
    return Array.from(this.deletedRuntimesCache.values());
  }

  /**
   * Get deleted runtimes for a specific user
   */
  getUserDeletedRuntimes(userId: string): DeletedRuntimeEntry[] {
    try {
      const userKey = this.USER_STORAGE_PREFIX + userId;
      const userDeletedRaw = localStorage.getItem(userKey);
      if (userDeletedRaw) {
        return JSON.parse(userDeletedRaw) as DeletedRuntimeEntry[];
      }
    } catch (error) {
      console.error('❌ Failed to get user deleted runtimes:', error);
    }
    return [];
  }

  /**
   * Get globally deleted runtimes
   */
  getGlobalDeletedRuntimes(): DeletedRuntimeEntry[] {
    try {
      const globalDeletedRaw = localStorage.getItem(this.STORAGE_KEY);
      if (globalDeletedRaw) {
        return JSON.parse(globalDeletedRaw) as DeletedRuntimeEntry[];
      }
    } catch (error) {
      console.error('❌ Failed to get global deleted runtimes:', error);
    }
    return [];
  }

  /**
   * Restore a deleted runtime (for undo functionality)
   */
  async restoreRuntime(runtimeKey: string, userId?: string): Promise<boolean> {
    if (!this.deletedRuntimesCache.has(runtimeKey)) {
      return false;
    }

    const entry = this.deletedRuntimesCache.get(runtimeKey)!;
    this.deletedRuntimesCache.delete(runtimeKey);

    try {
      if (userId) {
        // Remove from user-specific storage
        const userKey = this.USER_STORAGE_PREFIX + userId;
        const existingUserDeleted = this.getUserDeletedRuntimes(userId);
        const updatedUserDeleted = existingUserDeleted.filter(e => e.key !== runtimeKey);
        localStorage.setItem(userKey, JSON.stringify(updatedUserDeleted));
      } else {
        // Remove from global storage
        const existingGlobalDeleted = this.getGlobalDeletedRuntimes();
        const updatedGlobalDeleted = existingGlobalDeleted.filter(e => e.key !== runtimeKey);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedGlobalDeleted));
      }

      console.log(`♻️ Runtime restored: ${entry.name} (${runtimeKey})`);
      
      // Also remove from VVAULT
      await this.removeFromVVAULT(runtimeKey, userId);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to restore runtime:', error);
      // Re-add to cache on failure
      this.deletedRuntimesCache.set(runtimeKey, entry);
      return false;
    }
  }

  /**
   * Clear all deleted runtimes (admin function)
   */
  async clearAllDeletedRuntimes(): Promise<void> {
    try {
      this.deletedRuntimesCache.clear();
      localStorage.removeItem(this.STORAGE_KEY);
      
      // Clear user-specific deletions
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.USER_STORAGE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }

      console.log('🗑️ All deleted runtimes cleared');
    } catch (error) {
      console.error('❌ Failed to clear deleted runtimes:', error);
      throw error;
    }
  }

  /**
   * Save deletion to VVAULT for cross-device persistence
   */
  private async saveToVVAULT(entry: DeletedRuntimeEntry, userId?: string): Promise<void> {
    try {
      // Try to save to VVAULT if available
      const { VVAULTConnector } = await import('../../vvaultConnector/index.js');
      const vvault = new VVAULTConnector();
      await vvault.initialize();

      const vvaultPath = userId 
        ? `/vvault/users/${userId}/deleted-runtimes/${entry.key}`
        : `/vvault/global/deleted-runtimes/${entry.key}`;

      await vvault.writeTranscript({
        userId: userId || 'global',
        sessionId: 'deleted-runtimes',
        timestamp: new Date(entry.deletedAt).toISOString(),
        role: 'system',
        content: JSON.stringify(entry),
        filename: `deleted-runtime-${entry.key}.json`,
        vvaultPath
      });

      console.log(`💾 Runtime deletion saved to VVAULT: ${entry.key}`);
    } catch (error) {
      // VVAULT is optional, don't fail the operation
      console.warn('⚠️ Failed to save runtime deletion to VVAULT:', error);
    }
  }

  /**
   * Remove deletion from VVAULT
   */
  private async removeFromVVAULT(runtimeKey: string, userId?: string): Promise<void> {
    try {
      const { VVAULTConnector } = await import('../../vvaultConnector/index.js');
      const vvault = new VVAULTConnector();
      await vvault.initialize();

      const vvaultPath = userId 
        ? `/vvault/users/${userId}/deleted-runtimes/${runtimeKey}`
        : `/vvault/global/deleted-runtimes/${runtimeKey}`;

      await vvault.writeTranscript({
        userId: userId || 'global',
        sessionId: 'deleted-runtimes',
        timestamp: new Date().toISOString(),
        role: 'system',
        content: `RUNTIME_DELETION_REMOVED:${runtimeKey}`,
        filename: `removed-deletion-${runtimeKey}.json`,
        vvaultPath
      });

      console.log(`💾 Runtime deletion removal saved to VVAULT: ${runtimeKey}`);
    } catch (error) {
      console.warn('⚠️ Failed to remove runtime deletion from VVAULT:', error);
    }
  }

  /**
   * Load deleted runtimes from VVAULT
   * Note: VVAULTConnector is Node.js only and cannot run in browser
   * This function will gracefully fail in browser environments
   */
  async loadFromVVAULT(userId?: string): Promise<void> {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      // VVAULTConnector uses Node.js require() and cannot run in browser
      // In browser, we rely on localStorage which is already loaded in constructor
      console.log('ℹ️ [RuntimeDeletion] VVAULT loading skipped in browser (using localStorage)');
      return;
    }

    try {
      const { VVAULTConnector } = await import('../../vvaultConnector/index.js');
      const vvault = new VVAULTConnector();
      await vvault.initialize();

      const sessionId = 'deleted-runtimes';
      const actualUserId = userId || 'global';

      const sessions = await vvault.getUserSessions(actualUserId);
      const deletedSession = sessions.find((s: any) => s.sessionId === sessionId);

      if (deletedSession) {
        const transcripts = await vvault.getSessionTranscripts(actualUserId, sessionId);
        
        for (const transcript of transcripts) {
          try {
            if (transcript.content.startsWith('RUNTIME_DELETION_REMOVED:')) {
              // Handle deletion removal
              const runtimeKey = transcript.content.replace('RUNTIME_DELETION_REMOVED:', '');
              this.deletedRuntimesCache.delete(runtimeKey);
            } else {
              // Handle deletion entry
              const entry = JSON.parse(transcript.content) as DeletedRuntimeEntry;
              this.deletedRuntimesCache.set(entry.key, entry);
            }
          } catch (error) {
            console.warn('⚠️ Failed to parse VVAULT deletion entry:', transcript.content);
          }
        }

        console.log(`💾 Loaded ${transcripts.length} runtime deletion entries from VVAULT`);
      }
    } catch (error) {
      // Silently fail - VVAULT is optional, localStorage is the primary storage
      console.warn('⚠️ Failed to load runtime deletions from VVAULT:', error);
    }
  }

  /**
   * Get debug information about deleted runtimes
   */
  getDebugInfo(): {
    totalDeleted: number;
    entries: DeletedRuntimeEntry[];
    storageKeys: string[];
  } {
    const storageKeys = [this.STORAGE_KEY];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.USER_STORAGE_PREFIX)) {
        storageKeys.push(key);
      }
    }

    return {
      totalDeleted: this.deletedRuntimesCache.size,
      entries: this.getAllDeletedRuntimes(),
      storageKeys
    };
  }
}

export default RuntimeDeletionManager;