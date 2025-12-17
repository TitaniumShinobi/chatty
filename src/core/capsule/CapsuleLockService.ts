/**
 * Capsule Lock Service
 * 
 * Ensures capsules are loaded and locked on session start.
 * Validates capsule structure and identity files.
 */

import path from 'path';
import fs from 'fs/promises';
import { VVAULT_ROOT } from '../../../vvaultConnector/config.js';

export interface Capsule {
  metadata: {
    instance_name: string;
    timestamp: string;
    fingerprint_hash: string;
  };
  personality?: {
    traits: Record<string, number>;
    personality_type: string;
  };
  memory?: {
    memory_log: string[];
  };
  [key: string]: unknown;
}

export interface LockedCapsule {
  capsule: Capsule;
  prompt: string;
  conditioning: string;
  lockedAt: number;
  constructId: string;
}

export class CapsuleLockService {
  private lockedCapsules: Map<string, LockedCapsule>;

  constructor() {
    this.lockedCapsules = new Map();
  }

  /**
   * Lock capsule for a construct
   */
  async lockCapsule(constructId: string, userId?: string, shard?: string): Promise<LockedCapsule> {
    // Check if already locked
    const existing = this.lockedCapsules.get(constructId);
    if (existing) {
      return existing;
    }

    // Resolve paths
    const userShard = shard || 'shard_0000';
    const vvaultUserId = userId || 'devon_woodson_1762969514958'; // Would be resolved from context
    
    const instancePath = path.join(
      VVAULT_ROOT,
      'users',
      userShard,
      vvaultUserId,
      'instances',
      constructId,
      'identity'
    );

    const capsulePath = path.join(instancePath, `${constructId}.capsule`);
    const promptPath = path.join(instancePath, 'prompt.txt');
    const conditioningPath = path.join(instancePath, 'conditioning.txt');

    try {
      // Load and validate capsule
      const capsuleContent = await fs.readFile(capsulePath, 'utf8');
      const capsule: Capsule = JSON.parse(capsuleContent);
      
      // Validate capsule structure
      this.validateCapsule(capsule, constructId);

      // Load prompt and conditioning
      const prompt = await fs.readFile(promptPath, 'utf8');
      const conditioning = await fs.readFile(conditioningPath, 'utf8').catch(() => '');

      // Verify identity files exist
      await this.verifyIdentityFiles(instancePath);

      // Lock capsule
      const locked: LockedCapsule = {
        capsule,
        prompt,
        conditioning,
        lockedAt: Date.now(),
        constructId
      };

      this.lockedCapsules.set(constructId, locked);
      
      console.log(`✅ [CapsuleLockService] Locked capsule for ${constructId}`);
      
      return locked;
    } catch (error) {
      console.error(`❌ [CapsuleLockService] Failed to lock capsule for ${constructId}:`, error);
      throw new Error(`Failed to lock capsule for ${constructId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get locked capsule (read-only)
   */
  getLockedCapsule(constructId: string): LockedCapsule | null {
    return this.lockedCapsules.get(constructId) || null;
  }

  /**
   * Validate capsule structure
   */
  private validateCapsule(capsule: Capsule, constructId: string): void {
    if (!capsule.metadata) {
      throw new Error(`Capsule missing metadata for ${constructId}`);
    }

    if (!capsule.metadata.instance_name) {
      throw new Error(`Capsule missing instance_name for ${constructId}`);
    }

    if (capsule.metadata.instance_name !== constructId) {
      console.warn(`⚠️ [CapsuleLockService] Capsule instance_name (${capsule.metadata.instance_name}) doesn't match constructId (${constructId})`);
    }

    // Validate required fields
    if (!capsule.metadata.timestamp) {
      throw new Error(`Capsule missing timestamp for ${constructId}`);
    }

    if (!capsule.metadata.fingerprint_hash) {
      throw new Error(`Capsule missing fingerprint_hash for ${constructId}`);
    }
  }

  /**
   * Verify identity files exist
   */
  private async verifyIdentityFiles(instancePath: string): Promise<void> {
    const promptPath = path.join(instancePath, 'prompt.txt');
    const conditioningPath = path.join(instancePath, 'conditioning.txt');

    try {
      await fs.access(promptPath);
    } catch {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }

    // Conditioning is optional, but log if missing
    try {
      await fs.access(conditioningPath);
    } catch {
      console.warn(`⚠️ [CapsuleLockService] Conditioning file not found: ${conditioningPath} (optional)`);
    }
  }

  /**
   * Unlock capsule (for testing/cleanup)
   */
  unlockCapsule(constructId: string): void {
    this.lockedCapsules.delete(constructId);
    console.log(`🔓 [CapsuleLockService] Unlocked capsule for ${constructId}`);
  }

  /**
   * Check if capsule is locked
   */
  isLocked(constructId: string): boolean {
    return this.lockedCapsules.has(constructId);
  }

  /**
   * Get all locked construct IDs
   */
  getLockedConstructs(): string[] {
    return Array.from(this.lockedCapsules.keys());
  }
}

// Export singleton instance
let capsuleLockInstance: CapsuleLockService | null = null;

export function getCapsuleLockService(): CapsuleLockService {
  if (!capsuleLockInstance) {
    capsuleLockInstance = new CapsuleLockService();
  }
  return capsuleLockInstance;
}

