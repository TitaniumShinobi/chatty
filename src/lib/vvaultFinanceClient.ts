import type { FinanceConnection } from '../types/finance';
import { getFinanceConfig } from './financeConfig';

/**
 * VVAULT Finance Client
 * 
 * Uses the VVAULT proxy routes at /api/vault which forward to the real VVAULT service:
 * - POST /api/vault/credentials - Store encrypted credentials
 * - GET /api/vault/credentials/:key - Retrieve credentials
 * - DELETE /api/vault/credentials/:key - Delete credentials
 * - GET /api/vault/connections - List all connections
 * - GET /api/vault/health - Check vault health
 */

function getApiBaseUrl(): string {
  return getFinanceConfig().vvault.apiBaseUrl;
}

export interface VVAULTCredentialPayload {
  key: string;
  service_id: string;
  service_name: string;
  credentials: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface VVAULTFinanceCredentials {
  serviceId: string;
  serviceName: string;
  credentials: Record<string, string>;
  metadata?: Record<string, any>;
}

export async function storeFinanceCredentials(
  userId: string,
  data: VVAULTFinanceCredentials
): Promise<{ success: boolean; connectionId?: string; error?: string }> {
  const apiBase = getApiBaseUrl();
  
  try {
    const payload: VVAULTCredentialPayload = {
      key: `${data.serviceId}_${userId}`,
      service_id: data.serviceId,
      service_name: data.serviceName,
      credentials: data.credentials,
      metadata: {
        ...data.metadata,
        user_id: userId,
        created_at: new Date().toISOString(),
      },
    };

    const response = await fetch(`${apiBase}/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: error.error || error.message || 'Failed to store credentials' };
    }

    const result = await response.json();
    return { success: true, connectionId: result.key || payload.key };
  } catch (error) {
    console.error('[VVAULT] Failed to store finance credentials:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function getFinanceCredentials(
  userId: string,
  serviceId: string
): Promise<VVAULTFinanceCredentials | null> {
  const apiBase = getApiBaseUrl();
  const key = `${serviceId}_${userId}`;
  
  try {
    const response = await fetch(`${apiBase}/credentials/${encodeURIComponent(key)}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch credentials');
    }

    const data = await response.json();
    return {
      serviceId: data.service_id || serviceId,
      serviceName: data.service_name || serviceId,
      credentials: data.credentials || {},
      metadata: data.metadata,
    };
  } catch (error) {
    console.error('[VVAULT] Failed to get finance credentials:', error);
    return null;
  }
}

export async function listFinanceConnections(
  userId: string
): Promise<FinanceConnection[]> {
  const apiBase = getApiBaseUrl();
  
  try {
    const response = await fetch(`${apiBase}/connections?userId=${encodeURIComponent(userId)}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch connections');
    }

    const result = await response.json();
    return (result.connections || []).map((conn: any) => ({
      id: conn.id,
      serviceId: conn.serviceId,
      serviceName: conn.serviceName,
      status: conn.status || 'active',
      connectedAt: conn.connectedAt,
      lastUsed: conn.lastUsed,
    }));
  } catch (error) {
    console.error('[VVAULT] Failed to list finance connections:', error);
    return [];
  }
}

export async function disconnectFinanceService(
  userId: string,
  serviceId: string
): Promise<{ success: boolean; error?: string }> {
  const apiBase = getApiBaseUrl();
  const key = `${serviceId}_${userId}`;
  
  try {
    const response = await fetch(`${apiBase}/credentials/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok && response.status !== 404) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: error.error || 'Failed to disconnect' };
    }

    return { success: true };
  } catch (error) {
    console.error('[VVAULT] Failed to disconnect finance service:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function testFinanceConnection(
  userId: string,
  serviceId: string
): Promise<{ success: boolean; status: string; error?: string }> {
  const creds = await getFinanceCredentials(userId, serviceId);
  
  if (!creds) {
    return { success: false, status: 'not_found', error: 'Connection not found' };
  }
  
  return { success: true, status: 'active' };
}

export interface ConstructFinanceState {
  constructId: string;
  financeAppId: string;
  state: Record<string, any>;
  updatedAt: string;
}

export async function saveConstructFinanceState(
  userId: string,
  constructId: string,
  financeAppId: string,
  state: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  const apiBase = getApiBaseUrl();
  const key = `state_${financeAppId}_${constructId}_${userId}`;
  
  try {
    const response = await fetch(`${apiBase}/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        key,
        service_id: 'construct_state',
        service_name: 'Construct Finance State',
        credentials: {},
        metadata: {
          user_id: userId,
          construct_id: constructId,
          finance_app_id: financeAppId,
          state,
          updated_at: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: error.error || error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[VVAULT] Failed to save construct finance state:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function getConstructFinanceState(
  userId: string,
  constructId: string,
  financeAppId: string
): Promise<ConstructFinanceState | null> {
  const apiBase = getApiBaseUrl();
  const key = `state_${financeAppId}_${constructId}_${userId}`;
  
  try {
    const response = await fetch(`${apiBase}/credentials/${encodeURIComponent(key)}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch construct state');
    }

    const data = await response.json();
    return {
      constructId: data.metadata?.construct_id || constructId,
      financeAppId: data.metadata?.finance_app_id || financeAppId,
      state: data.metadata?.state || {},
      updatedAt: data.metadata?.updated_at || new Date().toISOString(),
    };
  } catch (error) {
    console.error('[VVAULT] Failed to get construct finance state:', error);
    return null;
  }
}
