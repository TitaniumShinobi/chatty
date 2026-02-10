export interface ConstructStatus {
  constructId: string;
  initialized: boolean;
  lastHeartbeat?: string;
  identityBound?: boolean;
  capabilities: string[];
}

export interface MasterScriptsBootstrapResult {
  success: boolean;
  constructs: ConstructStatus[];
  errors?: string[];
}

export interface IdentityCheckResult {
  constructId: string;
  identityBound: boolean;
  identityFiles: string[];
  driftScore?: number;
  needsRecalibration?: boolean;
}

export interface StateManagerResult {
  constructId: string;
  state: Record<string, any>;
  lastUpdated: string;
}

const API_BASE = "/api/master";

export async function bootstrapConstructs(constructIds?: string[]): Promise<MasterScriptsBootstrapResult> {
  try {
    const response = await fetch(`${API_BASE}/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ constructIds }),
    });
    return await response.json();
  } catch (error) {
    console.error("❌ [MasterScripts] Bootstrap failed:", error);
    return {
      success: false,
      constructs: [],
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

export async function initializeConstruct(constructId: string): Promise<{ success: boolean; status?: ConstructStatus; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/initialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ constructId }),
    });
    return await response.json();
  } catch (error) {
    console.error(`❌ [MasterScripts] Initialize ${constructId} failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getConstructsStatus(constructIds?: string[]): Promise<{ constructs: ConstructStatus[] }> {
  try {
    const params = constructIds ? `?constructIds=${constructIds.join(",")}` : "";
    const response = await fetch(`${API_BASE}/status${params}`, {
      credentials: "include",
    });
    return await response.json();
  } catch (error) {
    console.error("❌ [MasterScripts] Status check failed:", error);
    return { constructs: [] };
  }
}

export async function checkIdentity(constructId: string): Promise<IdentityCheckResult | null> {
  try {
    const response = await fetch(`${API_BASE}/identity-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ constructId }),
    });
    return await response.json();
  } catch (error) {
    console.error(`❌ [MasterScripts] Identity check for ${constructId} failed:`, error);
    return null;
  }
}

export async function aviatorScan(constructId: string, targetPath?: string): Promise<{ success: boolean; results?: any; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ constructId, targetPath }),
    });
    return await response.json();
  } catch (error) {
    console.error(`❌ [MasterScripts] Aviator scan for ${constructId} failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function navigatorNavigate(constructId: string, targetPath: string): Promise<{ success: boolean; contents?: any[]; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/navigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ constructId, targetPath }),
    });
    return await response.json();
  } catch (error) {
    console.error(`❌ [MasterScripts] Navigator navigate for ${constructId} failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getConstructState(constructId: string): Promise<StateManagerResult | null> {
  try {
    const response = await fetch(`${API_BASE}/state/${constructId}`, {
      credentials: "include",
    });
    return await response.json();
  } catch (error) {
    console.error(`❌ [MasterScripts] Get state for ${constructId} failed:`, error);
    return null;
  }
}

export async function updateConstructState(constructId: string, updates: Record<string, any>): Promise<{ success: boolean; state?: Record<string, any>; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/state/${constructId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ updates }),
    });
    return await response.json();
  } catch (error) {
    console.error(`❌ [MasterScripts] Update state for ${constructId} failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
