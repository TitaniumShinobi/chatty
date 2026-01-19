/**
 * Safe Mode System
 * 
 * Prevents module import failures from crashing the entire app.
 * Provides fallback stubs and graceful degradation when modules fail to load.
 */

interface ModuleStatus {
  name: string;
  loaded: boolean;
  error?: Error;
  fallbackUsed: boolean;
  timestamp: number;
}

class SafeModeManager {
  private static instance: SafeModeManager;
  private moduleStatuses: Map<string, ModuleStatus> = new Map();
  private safeModeActive: boolean = false;
  
  static getInstance(): SafeModeManager {
    if (!SafeModeManager.instance) {
      SafeModeManager.instance = new SafeModeManager();
    }
    return SafeModeManager.instance;
  }
  
  registerModuleFailure(name: string, error: Error): void {
    this.moduleStatuses.set(name, {
      name,
      loaded: false,
      error,
      fallbackUsed: true,
      timestamp: Date.now()
    });
    this.safeModeActive = true;
    console.warn(`🛡️ [SafeMode] Module ${name} failed to load, using fallback`);
  }
  
  registerModuleSuccess(name: string): void {
    this.moduleStatuses.set(name, {
      name,
      loaded: true,
      fallbackUsed: false,
      timestamp: Date.now()
    });
  }
  
  isSafeModeActive(): boolean {
    return this.safeModeActive;
  }
  
  getModuleStatus(name: string): ModuleStatus | null {
    return this.moduleStatuses.get(name) || null;
  }
  
  getAllModuleStatuses(): ModuleStatus[] {
    return Array.from(this.moduleStatuses.values());
  }
  
  getFailedModules(): string[] {
    return Array.from(this.moduleStatuses.values())
      .filter(status => !status.loaded)
      .map(status => status.name);
  }
}

export const safeMode = SafeModeManager.getInstance();

/**
 * Safely import a module with fallback support
 * 
 * @param moduleName - Name of the module for logging
 * @param importFn - Function that returns a promise for the module import
 * @param fallback - Fallback value to use if import fails
 * @returns The imported module or fallback
 */
export async function safeImport<T>(
  moduleName: string,
  importFn: () => Promise<{ default?: T; [key: string]: any }>,
  fallback: T
): Promise<T> {
  try {
    const module = await importFn();
    const exported = module.default || module;
    safeMode.registerModuleSuccess(moduleName);
    return exported as T;
  } catch (error) {
    safeMode.registerModuleFailure(moduleName, error as Error);
    console.error(`❌ [SafeMode] Failed to load ${moduleName}:`, error);
    return fallback;
  }
}
