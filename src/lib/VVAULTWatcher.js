/**
 * VVAULT File Watcher
 *
 * Monitors transcript files for changes and automatically re-indexes them.
 * Maintains fresh memory index without manual intervention.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { getVVAULTTranscriptLoader } from './VVAULTTranscriptLoader.js';
export class VVAULTWatcher {
    constructor(vvaultBasePath = '/Users/devonwoodson/Documents/GitHub/vvault') {
        this.vvaultBasePath = vvaultBasePath;
        this.transcriptLoader = getVVAULTTranscriptLoader();
        this.watchedConstructs = new Map();
        this.watchInterval = null;
        this.isWatching = false;
        this.scanIntervalMs = 30000; // 30 seconds
    }
    /**
     * Start watching transcript files for changes
     */
    async startWatching(scanIntervalMs = 30000) {
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
            }
            catch (error) {
                console.error('[VVAULTWatcher] Error during periodic scan:', error);
            }
        }, scanIntervalMs);
        console.log('✅ [VVAULTWatcher] File watching started');
    }
    /**
     * Stop watching transcript files
     */
    stopWatching() {
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
    async addConstruct(constructCallsign, userId = 'devon_woodson_1762969514958') {
        const transcriptDir = path.join(this.vvaultBasePath, 'users', 'shard_0000', userId, 'instances', constructCallsign, 'chatgpt');
        const watchKey = `${userId}-${constructCallsign}`;
        try {
            // Check if directory exists
            await fs.access(transcriptDir);
            const watched = {
                constructCallsign,
                userId,
                transcriptDir,
                lastScan: Date.now()
            };
            this.watchedConstructs.set(watchKey, watched);
            // Initial load of transcripts
            await this.transcriptLoader.loadTranscriptFragments(constructCallsign, userId);
            console.log(`📁 [VVAULTWatcher] Added construct to watch: ${constructCallsign} (${transcriptDir})`);
        }
        catch (error) {
            console.warn(`⚠️ [VVAULTWatcher] Failed to add construct ${constructCallsign}:`, error);
        }
    }
    /**
     * Remove a construct from watching
     */
    removeConstruct(constructCallsign, userId = 'devon_woodson_1762969514958') {
        const watchKey = `${userId}-${constructCallsign}`;
        if (this.watchedConstructs.delete(watchKey)) {
            console.log(`🗑️ [VVAULTWatcher] Removed construct from watch: ${constructCallsign}`);
        }
    }
    /**
     * Scan all constructs in VVAULT for transcript directories
     */
    async scanAllConstructs() {
        try {
            const usersDir = path.join(this.vvaultBasePath, 'users');
            const shards = await fs.readdir(usersDir);
            for (const shard of shards) {
                if (!shard.startsWith('shard_'))
                    continue;
                const shardDir = path.join(usersDir, shard);
                const users = await fs.readdir(shardDir);
                for (const userId of users) {
                    const instancesDir = path.join(shardDir, userId, 'instances');
                    try {
                        const constructs = await fs.readdir(instancesDir);
                        for (const constructCallsign of constructs) {
                            const chatgptDir = path.join(instancesDir, constructCallsign, 'chatgpt');
                            try {
                                await fs.access(chatgptDir);
                                await this.addConstruct(constructCallsign, userId);
                            }
                            catch {
                                // No chatgpt directory, skip
                            }
                        }
                    }
                    catch {
                        // No instances directory, skip user
                    }
                }
            }
        }
        catch (error) {
            console.warn('[VVAULTWatcher] Failed to scan all constructs:', error);
        }
    }
    /**
     * Scan watched constructs for file changes
     */
    async scanForChanges() {
        const changedConstructs = [];
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
            }
            catch (error) {
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
    async checkForChanges(watched) {
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
        }
        catch (error) {
            console.warn(`[VVAULTWatcher] Failed to check changes in ${watched.transcriptDir}:`, error);
            return false;
        }
    }
    /**
     * Force reload all watched constructs
     */
    async forceReloadAll() {
        console.log('🔄 [VVAULTWatcher] Force reloading all watched constructs');
        for (const [watchKey, watched] of this.watchedConstructs) {
            try {
                await this.transcriptLoader.reloadTranscripts(watched.constructCallsign, watched.userId);
                watched.lastScan = Date.now();
                console.log(`✅ [VVAULTWatcher] Reloaded ${watched.constructCallsign}`);
            }
            catch (error) {
                console.error(`❌ [VVAULTWatcher] Failed to reload ${watched.constructCallsign}:`, error);
            }
        }
    }
    /**
     * Get status of watched constructs
     */
    getWatchStatus() {
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
    async scanConstruct(constructCallsign, userId = 'devon_woodson_1762969514958') {
        const watchKey = `${userId}-${constructCallsign}`;
        const watched = this.watchedConstructs.get(watchKey);
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
        }
        catch (error) {
            console.error(`❌ [VVAULTWatcher] Failed to scan ${constructCallsign}:`, error);
            return false;
        }
    }
}
// Singleton instance
let vvaultWatcher = null;
export function getVVAULTWatcher(vvaultBasePath) {
    if (!vvaultWatcher) {
        vvaultWatcher = new VVAULTWatcher(vvaultBasePath);
    }
    return vvaultWatcher;
}
