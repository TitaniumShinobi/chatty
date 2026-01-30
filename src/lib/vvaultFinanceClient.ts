import type { FinanceConnection } from '../types/finance';

const VVAULT_API_BASE = import.meta.env.VITE_VVAULT_API_URL || '/api/vvault';

export interface VVAULTFinanceCredentials {
  serviceId: string;
  serviceName: string;
  credentials: Record<string, string>;
  metadata?: Record<string, any>;
}

export async function storeFinanceCredentials(
  userId: string,
  credentials: VVAULTFinanceCredentials
): Promise<{ success: boolean; connectionId?: string; error?: string }> {
  try {
    const response = await fetch(`${VVAULT_API_BASE}/finance/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        userId,
        ...credentials,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Failed to store credentials' };
    }

    const result = await response.json();
    return { success: true, connectionId: result.connectionId };
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
  try {
    const response = await fetch(
      `${VVAULT_API_BASE}/finance/credentials/${serviceId}?userId=${userId}`,
      {
        credentials: 'include',
      }
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch credentials');
    }

    return await response.json();
  } catch (error) {
    console.error('[VVAULT] Failed to get finance credentials:', error);
    return null;
  }
}

export async function listFinanceConnections(
  userId: string
): Promise<FinanceConnection[]> {
  try {
    const response = await fetch(
      `${VVAULT_API_BASE}/finance/connections?userId=${userId}`,
      {
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch connections');
    }

    const result = await response.json();
    return result.connections || [];
  } catch (error) {
    console.error('[VVAULT] Failed to list finance connections:', error);
    return [];
  }
}

export async function disconnectFinanceService(
  userId: string,
  connectionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${VVAULT_API_BASE}/finance/connections/${connectionId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Failed to disconnect' };
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
  connectionId: string
): Promise<{ success: boolean; status: string; error?: string }> {
  try {
    const response = await fetch(
      `${VVAULT_API_BASE}/finance/connections/${connectionId}/test`,
      {
        method: 'POST',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return { success: false, status: 'error', error: error.message };
    }

    const result = await response.json();
    return { success: true, status: result.status };
  } catch (error) {
    console.error('[VVAULT] Failed to test finance connection:', error);
    return {
      success: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
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
  try {
    const response = await fetch(`${VVAULT_API_BASE}/finance/construct-state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        userId,
        constructId,
        financeAppId,
        state,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message };
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
  try {
    const response = await fetch(
      `${VVAULT_API_BASE}/finance/construct-state/${constructId}/${financeAppId}?userId=${userId}`,
      {
        credentials: 'include',
      }
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch construct state');
    }

    return await response.json();
  } catch (error) {
    console.error('[VVAULT] Failed to get construct finance state:', error);
    return null;
  }
}
