// Browser-compatible construct registry using localStorage
// Simplified version for browser environment

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
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export interface ConstructMetadata {
  constructId: string;
  roleLock: RoleLock;
  fingerprint: string;
  lastValidated: number;
}

export class BrowserConstructRegistry {
  private static instance: BrowserConstructRegistry;
  private constructs = new Map<string, ConstructMetadata>();

  static getInstance(): BrowserConstructRegistry {
    if (!BrowserConstructRegistry.instance) {
      BrowserConstructRegistry.instance = new BrowserConstructRegistry();
    }
    return BrowserConstructRegistry.instance;
  }

  /**
   * Register a new construct with identity provenance
   */
  async registerConstruct(config: Omit<ConstructConfig, 'createdAt' | 'updatedAt' | 'isActive'>): Promise<void> {
    try {
      const now = Date.now();
      
      // Store in localStorage
      const key = `chatty_construct_${config.id}`;
      const constructData = {
        ...config,
        createdAt: now,
        updatedAt: now,
        isActive: true
      };
      
      localStorage.setItem(key, JSON.stringify(constructData));
      
      // Cache construct metadata
      this.constructs.set(config.id, {
        constructId: config.id,
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
   * Get construct metadata by ID
   */
  async getConstruct(constructId: string): Promise<ConstructMetadata | null> {
    // Check cache first
    const cached = this.constructs.get(constructId);
    if (cached) {
      return cached;
    }
    
    try {
      const key = `chatty_construct_${constructId}`;
      const stored = localStorage.getItem(key);
      
      if (!stored) {
        return null;
      }
      
      const constructData = JSON.parse(stored);
      if (!constructData.isActive) {
        return null;
      }
      
      const metadata: ConstructMetadata = {
        constructId: constructData.id,
        roleLock: constructData.roleLock,
        fingerprint: constructData.fingerprint,
        lastValidated: constructData.updatedAt
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
      const key = `chatty_construct_${constructId}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        const constructData = JSON.parse(stored);
        constructData.fingerprint = newFingerprint;
        constructData.updatedAt = Date.now();
        localStorage.setItem(key, JSON.stringify(constructData));
      }
      
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
      const constructs: ConstructConfig[] = [];
      
      // Iterate through localStorage to find all constructs
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chatty_construct_')) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const constructData = JSON.parse(stored);
            if (constructData.isActive) {
              constructs.push(constructData);
            }
          }
        }
      }
      
      return constructs.sort((a, b) => b.createdAt - a.createdAt);
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
      const key = `chatty_construct_${constructId}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        const constructData = JSON.parse(stored);
        constructData.isActive = false;
        constructData.updatedAt = Date.now();
        localStorage.setItem(key, JSON.stringify(constructData));
      }
      
      // Remove from cache
      this.constructs.delete(constructId);
      
      console.log(`🔒 Deactivated construct: ${constructId}`);
    } catch (error) {
      console.error('Failed to deactivate construct:', error);
      throw error;
    }
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
      let totalConstructs = 0;
      let activeConstructs = 0;
      let oldestConstruct: number | undefined;
      let newestConstruct: number | undefined;
      
      // Count constructs in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chatty_construct_')) {
          totalConstructs++;
          const stored = localStorage.getItem(key);
          if (stored) {
            const constructData = JSON.parse(stored);
            if (constructData.isActive) {
              activeConstructs++;
            }
            if (!oldestConstruct || constructData.createdAt < oldestConstruct) {
              oldestConstruct = constructData.createdAt;
            }
            if (!newestConstruct || constructData.createdAt > newestConstruct) {
              newestConstruct = constructData.createdAt;
            }
          }
        }
      }
      
      return {
        totalConstructs,
        activeConstructs,
        totalVaultEntries: 0, // Would need to count vault entries separately
        oldestConstruct,
        newestConstruct
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
      let cleanedCount = 0;
      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      // Remove old inactive constructs
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chatty_construct_')) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const constructData = JSON.parse(stored);
            if (!constructData.isActive && constructData.updatedAt < cutoffTime) {
              localStorage.removeItem(key);
              cleanedCount++;
            }
          }
        }
      }
      
      console.log(`🧹 Cleaned up ${cleanedCount} inactive constructs`);
      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup constructs:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const browserConstructRegistry = BrowserConstructRegistry.getInstance();
