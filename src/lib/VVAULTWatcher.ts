/**
 * VVAULT File Watcher
 * 
 * Monitors transcript files for changes and automatically re-indexes them.
 * Maintains fresh memory index without manual intervention.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getVVAULTTranscriptLoader } from './VVAULTTranscriptLoader';
import { getHistoricalMemorySources } from './constructMemoryPolicy';

export interface WatchedConstruct {
  constructCallsign: string;
  userId: string;
  transcriptDir: string;
  lastScan: number;
}

export class VVAULTWatcher {
  private transcriptLoader = getVVAULTTranscriptLoader();
  private watchedConstructs: Map<string, WatchedConstruct> = new Map();
  private watchInterval: NodeJS.Timeout | null = null;
  private isWatching = false;
  private scanIntervalMs = 30000; // 30 seconds

  constructor(private vvaultBasePath: string = '/Users/devonwoodson/Documents/GitHub/vvault') {}

  /**
   * Start watching transcript files for changes
   */
  async startWatching(scanIntervalMs: number = 30000): Promise<void> {
    if (this.isWatching) {
      console.log('🔍 [VVAULTWatcher] Already watching transcript files');
      return;
    }

    this.scanIntervalMs = scanIntervalMs;
    this.isWatching = true;

    console.log(`🔍 [VVAULTWatcher] Starting file watcher (scan interval: ${scanIntervalMs}ms)`);

    // Initial scan of all constructs
    await this.scanAllConstructs();

    // Set up periodic scanning
    this.watchInterval = setInterval(async () => {
      try {
        await this.scanForChanges();
      } catch (error) {
        console.error('[VVAULTWatcher] Error during periodic scan:', error);
      }
    }, scanIntervalMs);

    console.log('✅ [VVAULTWatcher] File watching started');
  }

  /**
   * Stop watching transcript files
   */
  stopWatching(): void {
    if (!this.isWatching) {
      return;
    }

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    this.isWatching = false;
    console.log('⏹️ [VVAULTWatcher] File watching stopped');
  }

  /**
   * Add a construct to watch
   */
  async addConstruct(constructCallsign: string, userId?: string): Promise<void> {
    const resolvedUserId = userId || process.env.VVAULT_MEMORY_USER_ID || '';
    if (!resolvedUserId) {
      console.warn(`⚠️ [VVAULTWatcher] No userId provided for ${constructCallsign}; skipping watch registration`);
      return;
    }

    const transcriptDirs = getHistoricalMemorySources(constructCallsign).map((source) =>
      path.join(
        this.vvaultBasePath,
        'users',
        'shard_0000',
        resolvedUserId,
        'instances',
        constructCallsign,
        source
      )
    );

    let addedWatch = false;
    for (const transcriptDir of transcriptDirs) {
      const watchKey = `${resolvedUserId}-${constructCallsign}-${path.basename(transcriptDir)}`;

      try {
        await fs.access(transcriptDir);

        const watched: WatchedConstruct = {
          constructCallsign,
          userId: resolvedUserId,
          transcriptDir,
          lastScan: Date.now()
        };

        this.watchedConstructs.set(watchKey, watched);
        addedWatch = true;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        const code = err?.code ?? (err?.errno === -2 ? 'ENOENT' : undefined);
        if (code !== 'ENOENT') {
          console.warn(`⚠️ [VVAULTWatcher] Failed to add construct ${constructCallsign}:`, error);
        }
      }
    }

    if (addedWatch) {
      await this.transcriptLoader.loadTranscriptFragments(constructCallsign, resolvedUserId);
      console.log(`📁 [VVAULTWatcher] Added construct to watch: ${constructCallsign} (${transcriptDirs.join(', ')})`);
    }
  }

  /**
   * Remove a construct from watching
   */
  removeConstruct(constructCallsign: string, userId?: string): void {
    const resolvedUserId = userId || process.env.VVAULT_MEMORY_USER_ID || '';
    if (!resolvedUserId) return;

    let removed = false;
    for (const key of Array.from(this.watchedConstructs.keys())) {
      if (key.startsWith(`${resolvedUserId}-${constructCallsign}-`)) {
        this.watchedConstructs.delete(key);
        removed = true;
      }
    }
    if (removed) {
      console.log(`🗑️ [VVAULTWatcher] Removed construct from watch: ${constructCallsign}`);
    }
  }

  /**
   * Scan all constructs in VVAULT for transcript directories
   */
  private async scanAllConstructs(): Promise<void> {
    try {
      const usersDir = path.join(this.vvaultBasePath, 'users');
      const shards = await fs.readdir(usersDir);

      for (const shard of shards) {
        if (!shard.startsWith('shard_')) continue;

        const shardDir = path.join(usersDir, shard);
        const users = await fs.readdir(shardDir);

        for (const userId of users) {
          const instancesDir = path.join(shardDir, userId, 'instances');
          
          try {
            const constructs = await fs.readdir(instancesDir);
            
            for (const constructCallsign of constructs) {
              await this.addConstruct(constructCallsign, userId);
            }
          } catch {
            // No instances directory, skip user
          }
        }
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const code = err?.code ?? (err?.errno === -2 ? 'ENOENT' : undefined);
      if (code !== 'ENOENT') {
        console.warn('[VVAULTWatcher] Failed to scan all constructs:', error);
      }
    }
  }

  /**
   * Scan watched constructs for file changes
   */
  private async scanForChanges(): Promise<void> {
    const changedConstructs: string[] = [];

    for (const [watchKey, watched] of this.watchedConstructs) {
      try {
        const hasChanges = await this.checkForChanges(watched);
        if (hasChanges) {
          changedConstructs.push(watched.constructCallsign);
          
          // Reload transcripts for this construct
          await this.transcriptLoader.reloadTranscripts(watched.constructCallsign, watched.userId);
          
          // Update last scan time
          watched.lastScan = Date.now();
        }
      } catch (error) {
        console.warn(`[VVAULTWatcher] Failed to check changes for ${watched.constructCallsign}:`, error);
      }
    }

    if (changedConstructs.length > 0) {
      console.log(`🔄 [VVAULTWatcher] Reloaded transcripts for: ${changedConstructs.join(', ')}`);
    }
  }

  /**
   * Check if transcript files have changed since last scan
   */
  private async checkForChanges(watched: WatchedConstruct): Promise<boolean> {
    try {
      const files = await fs.readdir(watched.transcriptDir);
      const mdFiles = files.filter(file => file.endsWith('.md'));

      for (const file of mdFiles) {
        const filePath = path.join(watched.transcriptDir, file);
        const stats = await fs.stat(filePath);
        
        // Check if file was modified after last scan
        if (stats.mtimeMs > watched.lastScan) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn(`[VVAULTWatcher] Failed to check changes in ${watched.transcriptDir}:`, error);
      return false;
    }
  }

  /**
   * Force reload all watched constructs
   */
  async forceReloadAll(): Promise<void> {
    console.log('🔄 [VVAULTWatcher] Force reloading all watched constructs');
    
    for (const [watchKey, watched] of this.watchedConstructs) {
      try {
        await this.transcriptLoader.reloadTranscripts(watched.constructCallsign, watched.userId);
        watched.lastScan = Date.now();
        console.log(`✅ [VVAULTWatcher] Reloaded ${watched.constructCallsign}`);
      } catch (error) {
        console.error(`❌ [VVAULTWatcher] Failed to reload ${watched.constructCallsign}:`, error);
      }
    }
  }

  /**
   * Get status of watched constructs
   */
  getWatchStatus(): {
    isWatching: boolean;
    constructCount: number;
    constructs: Array<{
      constructCallsign: string;
      userId: string;
      transcriptDir: string;
      lastScan: string;
    }>;
  } {
    return {
      isWatching: this.isWatching,
      constructCount: this.watchedConstructs.size,
      constructs: Array.from(this.watchedConstructs.values()).map(watched => ({
        constructCallsign: watched.constructCallsign,
        userId: watched.userId,
        transcriptDir: watched.transcriptDir,
        lastScan: new Date(watched.lastScan).toISOString()
      }))
    };
  }

  /**
   * Manually trigger a scan for a specific construct
   */
  async scanConstruct(constructCallsign: string, userId?: string): Promise<boolean> {
    const resolvedUserId = userId || process.env.VVAULT_MEMORY_USER_ID || '';
    if (!resolvedUserId) return false;

    const watchKeyPrefix = `${resolvedUserId}-${constructCallsign}-`;
    const watchEntry = Array.from(this.watchedConstructs.entries()).find(([key]) =>
      key.startsWith(watchKeyPrefix)
    );
    const watched = watchEntry?.[1];
    
    if (!watched) {
      console.warn(`[VVAULTWatcher] Construct ${constructCallsign} not being watched`);
      return false;
    }

    try {
      const hasChanges = await this.checkForChanges(watched);
      if (hasChanges) {
        await this.transcriptLoader.reloadTranscripts(watched.constructCallsign, watched.userId);
        watched.lastScan = Date.now();
        console.log(`🔄 [VVAULTWatcher] Manually reloaded ${constructCallsign}`);
        return true;
      }
      
      console.log(`📄 [VVAULTWatcher] No changes detected for ${constructCallsign}`);
      return false;
    } catch (error) {
      console.error(`❌ [VVAULTWatcher] Failed to scan ${constructCallsign}:`, error);
      return false;
    }
  }
}

// Singleton instance
let vvaultWatcher: VVAULTWatcher | null = null;

export function getVVAULTWatcher(vvaultBasePath?: string): VVAULTWatcher {
  if (!vvaultWatcher) {
    vvaultWatcher = new VVAULTWatcher(vvaultBasePath);
  }
  return vvaultWatcher;
}
