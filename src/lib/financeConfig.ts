export interface FinanceConfig {
  fxshinobi: {
    apiBaseUrl: string;
    enabled: boolean;
  };
  vvault: {
    apiBaseUrl: string;
    enabled: boolean;
  };
  supabase: {
    url: string;
    anonKey: string;
    enabled: boolean;
  };
}

export function getFinanceConfig(): FinanceConfig {
  const fxshinobiUrl = import.meta.env.VITE_FXSHINOBI_API_URL || '/api/fxshinobi';
  const vvaultUrl = import.meta.env.VITE_VVAULT_API_URL || '/api/vvault';
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  return {
    fxshinobi: {
      apiBaseUrl: fxshinobiUrl,
      enabled: true,
    },
    vvault: {
      apiBaseUrl: vvaultUrl,
      enabled: true,
    },
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      enabled: Boolean(supabaseUrl && supabaseAnonKey),
    },
  };
}

export interface ServiceStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error' | 'checking';
  message?: string;
  lastChecked?: string;
}

export async function checkFXShinobiStatus(): Promise<ServiceStatus> {
  const config = getFinanceConfig();
  try {
    const res = await fetch(`${config.fxshinobi.apiBaseUrl}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    if (res.ok) {
      const data = await res.json();
      return {
        name: 'FXShinobi',
        status: 'connected',
        message: data.version ? `v${data.version}` : 'Engine running',
        lastChecked: new Date().toISOString(),
      };
    } else {
      return {
        name: 'FXShinobi',
        status: 'error',
        message: `HTTP ${res.status}`,
        lastChecked: new Date().toISOString(),
      };
    }
  } catch (err) {
    return {
      name: 'FXShinobi',
      status: 'disconnected',
      message: 'API unreachable',
      lastChecked: new Date().toISOString(),
    };
  }
}

export async function checkVVAULTStatus(): Promise<ServiceStatus> {
  const config = getFinanceConfig();
  try {
    const res = await fetch(`${config.vvault.apiBaseUrl}/health`, {
      method: 'GET',
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    
    if (res.ok) {
      return {
        name: 'VVAULT',
        status: 'connected',
        message: 'Vault accessible',
        lastChecked: new Date().toISOString(),
      };
    } else if (res.status === 401) {
      return {
        name: 'VVAULT',
        status: 'connected',
        message: 'API accessible (auth required)',
        lastChecked: new Date().toISOString(),
      };
    } else {
      return {
        name: 'VVAULT',
        status: 'error',
        message: `HTTP ${res.status}`,
        lastChecked: new Date().toISOString(),
      };
    }
  } catch (err) {
    return {
      name: 'VVAULT',
      status: 'disconnected',
      message: 'Vault unreachable',
      lastChecked: new Date().toISOString(),
    };
  }
}

export async function checkSupabaseStatus(): Promise<ServiceStatus> {
  const config = getFinanceConfig();
  
  if (!config.supabase.enabled) {
    return {
      name: 'Supabase',
      status: 'disconnected',
      message: 'Not configured',
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    const res = await fetch(`${config.supabase.url}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey: config.supabase.anonKey,
      },
      signal: AbortSignal.timeout(5000),
    });
    
    if (res.ok || res.status === 400) {
      return {
        name: 'Supabase',
        status: 'connected',
        message: 'Database accessible',
        lastChecked: new Date().toISOString(),
      };
    } else {
      return {
        name: 'Supabase',
        status: 'error',
        message: `HTTP ${res.status}`,
        lastChecked: new Date().toISOString(),
      };
    }
  } catch (err) {
    return {
      name: 'Supabase',
      status: 'disconnected',
      message: 'Database unreachable',
      lastChecked: new Date().toISOString(),
    };
  }
}

export async function checkAllServices(): Promise<ServiceStatus[]> {
  const [fxshinobi, vvault, supabase] = await Promise.all([
    checkFXShinobiStatus(),
    checkVVAULTStatus(),
    checkSupabaseStatus(),
  ]);
  
  return [fxshinobi, vvault, supabase];
}
