// Construct Registry: Identity-locked agents with role locks and legal provenance
// Manages construct metadata, role boundaries, and vault pointers

import db from '../lib/db';
import { createVaultStore, VaultStore } from '../core/vault/VaultStore';

export interface RoleLock {
  allowedRoles: string[];
  prohibitedRoles: string[];
  contextBoundaries: string[];
  behaviorConstraints: string[];
}

export interface ConstructConfig {
  id: string;
  name: string;
  description?: string;
  roleLock: RoleLock;
  legalDocSha256: string;
  vaultPointer?: string;
  fingerprint: string;
  isSystemShell: boolean; // false for all constructs, true only for runtime like Chatty
  hostingRuntime?: string; // Runtime that hosts this construct (e.g., 'synth', 'lin') - separate from construct identity
  currentPersona?: string; // Optional persona identifier
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export interface ConstructMetadata {
  constructId: string;
  vaultStore: VaultStore;
  roleLock: RoleLock;
  fingerprint: string;
  lastValidated: number;
}

export class ConstructRegistry {
  private static instance: ConstructRegistry;
  private constructs = new Map<string, ConstructMetadata>();
  private vaultStores = new Map<string, VaultStore>();

  static getInstance(): ConstructRegistry {
    if (!ConstructRegistry.instance) {
      ConstructRegistry.instance = new ConstructRegistry();
    }
    return ConstructRegistry.instance;
  }

  /**
   * Register a new construct with identity provenance
   */
  async registerConstruct(config: Omit<ConstructConfig, 'createdAt' | 'updatedAt' | 'isActive'>): Promise<void> {
    try {
      // Validate identity boundaries
      await this.validateConstructIdentity(config);
      
      const now = Date.now();
      
      const stmt = db.prepare(`
        INSERT INTO constructs (id, name, description, role_lock_json, legal_doc_sha256, vault_pointer, fingerprint, is_system_shell, hosting_runtime, current_persona, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        config.id,
        config.name,
        config.description || null,
        JSON.stringify(config.roleLock),
        config.legalDocSha256,
        config.vaultPointer || null,
        config.fingerprint,
        config.isSystemShell ? 1 : 0,
        config.hostingRuntime || null,
        config.currentPersona || null,
        now,
        now,
        1
      );
      
      // Create vault store for this construct
      const vaultStore = createVaultStore(config.id);
      this.vaultStores.set(config.id, vaultStore);
      
      // Cache construct metadata
      this.constructs.set(config.id, {
        constructId: config.id,
        vaultStore,
        roleLock: config.roleLock,
        fingerprint: config.fingerprint,
        lastValidated: now
      });
      
      console.log(`✅ Registered construct: ${config.name} (${config.id})`);
    } catch (error) {
      console.error('Failed to register construct:', error);
      throw error;
    }
  }

  /**
   * Validate construct identity to prevent conflicts
   * Enforces strict identity awareness: constructs are discrete entities
   */
  private async validateConstructIdentity(config: Omit<ConstructConfig, 'createdAt' | 'updatedAt' | 'isActive'>): Promise<void> {
    const knownConstructs = ['Nova', 'Monday', 'Aurora', 'Katana', 'Synth'];
    const systemShellName = 'Chatty';

    // System shell validation
    if (config.isSystemShell && config.name !== systemShellName) {
      throw new Error(
        `System shell misidentification: expected ${systemShellName}, found ${config.name}`
      );
    }

    // If not a system shell, must be a known construct
    if (!config.isSystemShell && !knownConstructs.includes(config.name as any)) {
      throw new Error(`Unregistered construct: ${config.name}`);
    }

    // Synth must not be used as a surrogate identity
    // Only the actual Synth construct can use the name "Synth"
    if (config.name === 'Synth' && config.isSystemShell) {
      throw new Error(
        `Synth is a construct, not a system shell. Set isSystemShell=false for Synth.`
      );
    }

    // Check for duplicate construct IDs
    const existing = await this.getConstruct(config.id);
    if (existing) {
      throw new Error(`Construct with ID "${config.id}" already exists`);
    }

    // Check for fingerprint collisions (enforced by IdentityEnforcementService)
    // This is a basic check - full enforcement happens in IdentityEnforcementService
    const allConstructs = await this.getAllConstructs();
    const duplicateFingerprint = allConstructs.find(
      c => c.id !== config.id && c.fingerprint === config.fingerprint
    );
    if (duplicateFingerprint) {
      throw new Error(
        `Identity drift detected: ${config.name} shares fingerprint with ${duplicateFingerprint.name}`
      );
    }
  }

  /**
   * Get construct metadata by ID
   */
  async getConstruct(constructId: string): Promise<ConstructMetadata | null> {
    // Check cache first
    const cached = this.constructs.get(constructId);
    if (cached) {
      return cached;
    }
    
    try {
      const stmt = db.prepare(`
        SELECT id, name, description, role_lock_json, legal_doc_sha256, vault_pointer, fingerprint, is_system_shell, hosting_runtime, current_persona, created_at, updated_at, is_active
        FROM constructs 
        WHERE id = ? AND is_active = 1
      `);
      
      const row = stmt.get(constructId);
      if (!row) {
        return null;
      }
      
      const roleLock = JSON.parse(row.role_lock_json);
      const vaultStore = this.vaultStores.get(constructId) || createVaultStore(constructId);
      this.vaultStores.set(constructId, vaultStore);
      
      const metadata: ConstructMetadata = {
        constructId: row.id,
        vaultStore,
        roleLock,
        fingerprint: row.fingerprint,
        lastValidated: row.updated_at
      };
      
      this.constructs.set(constructId, metadata);
      return metadata;
    } catch (error) {
      console.error('Failed to get construct:', error);
      return null;
    }
  }

  /**
   * Update construct fingerprint (for drift detection)
   */
  async updateFingerprint(constructId: string, newFingerprint: string): Promise<void> {
    try {
      const stmt = db.prepare(`
        UPDATE constructs 
        SET fingerprint = ?, updated_at = ? 
        WHERE id = ?
      `);
      
      stmt.run(newFingerprint, Date.now(), constructId);
      
      // Update cache
      const cached = this.constructs.get(constructId);
      if (cached) {
        cached.fingerprint = newFingerprint;
        cached.lastValidated = Date.now();
      }
      
      console.log(`🔄 Updated fingerprint for construct: ${constructId}`);
    } catch (error) {
      console.error('Failed to update construct fingerprint:', error);
      throw error;
    }
  }

  /**
   * Validate construct against role lock constraints
   */
  validateRoleLock(constructId: string, requestedRole: string, context: string): boolean {
    const construct = this.constructs.get(constructId);
    if (!construct) {
      console.warn(`Construct not found: ${constructId}`);
      return false;
    }
    
    const { roleLock } = construct;
    
    // Check prohibited roles
    if (roleLock.prohibitedRoles.includes(requestedRole)) {
      console.warn(`Role ${requestedRole} is prohibited for construct ${constructId}`);
      return false;
    }
    
    // Check allowed roles (if specified)
    if (roleLock.allowedRoles.length > 0 && !roleLock.allowedRoles.includes(requestedRole)) {
      console.warn(`Role ${requestedRole} is not in allowed roles for construct ${constructId}`);
      return false;
    }
    
    // Check context boundaries
    if (roleLock.contextBoundaries.length > 0) {
      const isWithinBoundary = roleLock.contextBoundaries.some(boundary => 
        context.toLowerCase().includes(boundary.toLowerCase())
      );
      if (!isWithinBoundary) {
        console.warn(`Context "${context}" is outside allowed boundaries for construct ${constructId}`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get all active constructs
   */
  async getAllConstructs(): Promise<ConstructConfig[]> {
    try {
      const stmt = db.prepare(`
        SELECT id, name, description, role_lock_json, legal_doc_sha256, vault_pointer, fingerprint, is_system_shell, hosting_runtime, current_persona, created_at, updated_at, is_active
        FROM constructs 
        WHERE is_active = 1
        ORDER BY created_at DESC
      `);
      
      const rows = stmt.all();
      
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        roleLock: JSON.parse(row.role_lock_json),
        legalDocSha256: row.legal_doc_sha256,
        vaultPointer: row.vault_pointer,
        fingerprint: row.fingerprint,
        isSystemShell: Boolean(row.is_system_shell),
        hostingRuntime: row.hosting_runtime || undefined,
        currentPersona: row.current_persona || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: Boolean(row.is_active)
      }));
    } catch (error) {
      console.error('Failed to get all constructs:', error);
      return [];
    }
  }

  /**
   * Deactivate a construct
   */
  async deactivateConstruct(constructId: string): Promise<void> {
    try {
      const stmt = db.prepare(`
        UPDATE constructs 
        SET is_active = 0, updated_at = ? 
        WHERE id = ?
      `);
      
      stmt.run(Date.now(), constructId);
      
      // Remove from cache
      this.constructs.delete(constructId);
      this.vaultStores.delete(constructId);
      
      console.log(`🔒 Deactivated construct: ${constructId}`);
    } catch (error) {
      console.error('Failed to deactivate construct:', error);
      throw error;
    }
  }

  /**
   * Get vault store for a construct
   */
  getVaultStore(constructId: string): VaultStore | null {
    return this.vaultStores.get(constructId) || null;
  }

  /**
   * Get construct statistics
   */
  async getStats(): Promise<{
    totalConstructs: number;
    activeConstructs: number;
    totalVaultEntries: number;
    oldestConstruct?: number;
    newestConstruct?: number;
  }> {
    try {
      // Total constructs
      const totalStmt = db.prepare('SELECT COUNT(*) as count FROM constructs');
      const totalResult = totalStmt.get();
      
      // Active constructs
      const activeStmt = db.prepare('SELECT COUNT(*) as count FROM constructs WHERE is_active = 1');
      const activeResult = activeStmt.get();
      
      // Total vault entries
      const vaultStmt = db.prepare('SELECT COUNT(*) as count FROM vault_entries');
      const vaultResult = vaultStmt.get();
      
      // Time range
      const timeStmt = db.prepare('SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM constructs');
      const timeResult = timeStmt.get();
      
      return {
        totalConstructs: totalResult.count,
        activeConstructs: activeResult.count,
        totalVaultEntries: vaultResult.count,
        oldestConstruct: timeResult.oldest,
        newestConstruct: timeResult.newest
      };
    } catch (error) {
      console.error('Failed to get construct stats:', error);
      return {
        totalConstructs: 0,
        activeConstructs: 0,
        totalVaultEntries: 0
      };
    }
  }

  /**
   * Cleanup inactive constructs
   */
  async cleanup(): Promise<number> {
    try {
      const stmt = db.prepare(`
        DELETE FROM constructs 
        WHERE is_active = 0 AND updated_at < ?
      `);
      
      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
      const result = stmt.run(cutoffTime);
      
      console.log(`🧹 Cleaned up ${result.changes} inactive constructs`);
      return result.changes;
    } catch (error) {
      console.error('Failed to cleanup constructs:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const constructRegistry = ConstructRegistry.getInstance();
