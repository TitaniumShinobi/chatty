/**
 * Capsule Maintenance Service
 * 
 * Orchestrates the weekly maintenance of all system capsules.
 * Scans directories, identifies stale capsules, and applies metadata updates.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { updateCapsuleMetadata } from './capsuleUpdater.js';

export class CapsuleMaintenanceService {
    constructor(vvaultRoot) {
        this.vvaultRoot = vvaultRoot || '/Users/devonwoodson/Documents/GitHub/vvault';
    }

    /**
     * Run the maintenance cycle
     * @param {Object} options - { force: boolean, dryRun: boolean }
     */
    async runMaintenance(options = {}) {
        console.log(`🧹 [Maintenance] Starting capsule maintenance run (Force: ${options.force || false})`);

        const stats = {
            scanned: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            updatedCapsules: []
        };

        try {
            // 1. Find all user shards
            const usersDir = path.join(this.vvaultRoot, 'users', 'shard_0000');
            const users = await fs.readdir(usersDir);

            for (const userId of users) {
                if (userId.startsWith('.')) continue; // Skip hidden

                const instancesDir = path.join(usersDir, userId, 'instances');

                // Check if instances dir exists
                try {
                    await fs.access(instancesDir);
                } catch {
                    continue; // No instances for this user
                }

                const constructs = await fs.readdir(instancesDir);

                for (const constructId of constructs) {
                    if (constructId.startsWith('.')) continue;

                    // Path to capsule: instances/{constructName}/identity/{constructId}.capsule
                    // Where constructName = constructId without version suffix (zen-001 -> zen)
                    // ALSO support legacy paths: instances/{constructName}/identity/capsule.json

                    const identityDir = path.join(instancesDir, constructId, 'identity');

                    try {
                        const identityFiles = await fs.readdir(identityDir);
                        const capsuleFile = identityFiles.find(f => f.endsWith('.capsule') || f === 'capsule.json');

                        if (!capsuleFile) continue;

                        stats.scanned++;
                        const capsulePath = path.join(identityDir, capsuleFile);

                        await this.processCapsule(capsulePath, options, stats, constructId);

                    } catch (err) {
                        // Identity dir might not exist or be empty
                        continue;
                    }
                }
            }

        } catch (error) {
            console.error('❌ [Maintenance] Critical failure during maintenance run:', error);
        }

        console.log(`✅ [Maintenance] Run complete. Scanned: ${stats.scanned}, Updated: ${stats.updated}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
        return stats;
    }

    async processCapsule(filePath, options, stats, constructId) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const capsule = JSON.parse(content);

            // Check last update time
            const lastUpdate = capsule.metadata?.timestamp ? new Date(capsule.metadata.timestamp) : new Date(0);
            const now = new Date();
            const needsUpdate = options.force || (now - lastUpdate) > (7 * 24 * 60 * 60 * 1000); // > 7 days

            if (!needsUpdate) {
                stats.skipped++;
                return;
            }

            if (options.dryRun) {
                console.log(`📝 [Maintenance] [DryRun] Would update capsule: ${constructId}`);
                stats.updated++;
                stats.updatedCapsules.push(constructId);
                return;
            }

            // Perform Update
            // For now, we are just refreshing the timestamp. 
            // In a real scenario, we might also prune old memory logs here.
            const updatedCapsule = await updateCapsuleMetadata(capsule, {});

            // Save back to file
            await fs.writeFile(filePath, JSON.stringify(updatedCapsule, null, 2), 'utf8');

            console.log(`✨ [Maintenance] Updated capsule: ${constructId} (${path.basename(filePath)})`);
            stats.updated++;
            stats.updatedCapsules.push(constructId);

        } catch (error) {
            console.error(`❌ [Maintenance] Failed to process capsule ${constructId}:`, error.message);
            stats.errors++;
        }
    }
}
