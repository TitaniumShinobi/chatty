/**
 * GPTManager Factory - Browser-Safe Instantiation
 * 
 * Provides environment-aware GPTManager instantiation:
 * - Server-side: Real GPTManager with database access
 * - Browser-side: Lightweight stub with clear error messages
 */

import type { GPTConfig, GPTRuntime } from './gptManager';

// Browser-safe interface that matches GPTManager API
export interface IGPTManager {
  getInstance(): IGPTManager;
  getAllGPTs(): Promise<GPTConfig[]>;
  getGPT(id: string): Promise<GPTConfig | null>;
  getGPTByCallsign(callsign: string): Promise<GPTConfig | null>;
  loadGPTForRuntime(gptId: string): Promise<GPTRuntime | null>;
  createGPT(config: Omit<GPTConfig, 'id' | 'createdAt'>): Promise<GPTConfig>;
  updateGPT(id: string, updates: Partial<GPTConfig>): Promise<GPTConfig | null>;
  deleteGPT(id: string): Promise<boolean>;
}

// Browser stub implementation
class BrowserGPTManagerStub implements IGPTManager {
  private static instance: BrowserGPTManagerStub;

  static getInstance(): BrowserGPTManagerStub {
    if (!BrowserGPTManagerStub.instance) {
      BrowserGPTManagerStub.instance = new BrowserGPTManagerStub();
    }
    return BrowserGPTManagerStub.instance;
  }

  getInstance(): IGPTManager {
    return this;
  }

  async getAllGPTs(): Promise<GPTConfig[]> {
    console.warn('[GPTManager] Browser stub: getAllGPTs() not available in browser environment');
    return [];
  }

  async getGPT(id: string): Promise<GPTConfig | null> {
    console.warn(`[GPTManager] Browser stub: getGPT(${id}) not available in browser environment`);
    return null;
  }

  async getGPTByCallsign(callsign: string): Promise<GPTConfig | null> {
    console.warn(`[GPTManager] Browser stub: getGPTByCallsign(${callsign}) not available in browser environment`);
    return null;
  }

  async loadGPTForRuntime(gptId: string): Promise<GPTRuntime | null> {
    console.warn(`[GPTManager] Browser stub: loadGPTForRuntime(${gptId}) not available in browser environment`);
    return null;
  }

  async createGPT(config: Omit<GPTConfig, 'id' | 'createdAt'>): Promise<GPTConfig> {
    throw new Error('[GPTManager] Browser stub: createGPT() not available in browser environment. Use server-side API.');
  }

  async updateGPT(id: string, updates: Partial<GPTConfig>): Promise<GPTConfig | null> {
    throw new Error(`[GPTManager] Browser stub: updateGPT(${id}) not available in browser environment. Use server-side API.`);
  }

  async deleteGPT(id: string): Promise<boolean> {
    throw new Error(`[GPTManager] Browser stub: deleteGPT(${id}) not available in browser environment. Use server-side API.`);
  }
}

// Environment detection
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof process === 'undefined';
}

function isServerSide(): boolean {
  return typeof window === 'undefined' && typeof process !== 'undefined' && process.cwd;
}

/**
 * Create GPTManager instance based on environment
 */
export async function createGPTManager(): Promise<IGPTManager> {
  if (isBrowser()) {
    console.log('[GPTManagerFactory] Creating browser stub (no database access)');
    return BrowserGPTManagerStub.getInstance();
  }

  if (isServerSide()) {
    try {
      // Dynamically import the real GPTManager only on server-side
      const { GPTManager } = await import('./gptManager');
      console.log('[GPTManagerFactory] Creating server-side GPTManager with database access');
      return GPTManager.getInstance();
    } catch (error) {
      console.error('[GPTManagerFactory] Failed to load server-side GPTManager:', error);
      // Fallback to stub even on server if import fails
      return BrowserGPTManagerStub.getInstance();
    }
  }

  // Unknown environment - use stub as safe fallback
  console.warn('[GPTManagerFactory] Unknown environment, using browser stub as fallback');
  return BrowserGPTManagerStub.getInstance();
}

/**
 * Synchronous factory for environments where we know the context
 */
export function createGPTManagerSync(): IGPTManager {
  if (isBrowser()) {
    return BrowserGPTManagerStub.getInstance();
  }

  // For server-side, we need to use the async version
  throw new Error('[GPTManagerFactory] Use createGPTManager() async function for server-side instantiation');
}

/**
 * Check if GPTManager functionality is available
 */
export function isGPTManagerAvailable(): boolean {
  return isServerSide();
}

/**
 * Get environment info for debugging
 */
export function getEnvironmentInfo(): {
  isBrowser: boolean;
  isServerSide: boolean;
  hasProcess: boolean;
  hasWindow: boolean;
  gptManagerAvailable: boolean;
} {
  return {
    isBrowser: isBrowser(),
    isServerSide: isServerSide(),
    hasProcess: typeof process !== 'undefined',
    hasWindow: typeof window !== 'undefined',
    gptManagerAvailable: isGPTManagerAvailable()
  };
}
