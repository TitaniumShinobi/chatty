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
  const vvaultUrl = import.meta.env.VITE_VVAULT_API_URL || '/api/vault';
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

export type ServiceStatusLevel = 'live' | 'connected' | 'degraded' | 'offline' | 'not_configured' | 'checking';

export interface ServiceStatus {
  name: string;
  status: ServiceStatusLevel;
  liveMode?: boolean;
  brokerConfigured?: boolean;
  oandaConfigured?: boolean;
  activeBrokerId?: string | null;
  activeBrokerName?: string | null;
  accountType?: string;
  environment?: string;
  accountBalance?: number | null;
  equity?: number | null;
  pnlToday?: number | null;
  openPnl?: number | null;
  account?: FXShinobiAccountData | null;
  brokers?: FXShinobiBrokerData[] | null;
  message?: string;
  lastChecked?: string;
  version?: string;
  details?: {
    vvaultStatus?: string;
    supabaseStatus?: string;
    activeStrategies?: number;
    openPositions?: number;
  };
}

export interface FXShinobiAccountData {
  broker_id?: string;
  connected?: boolean;
  balance?: number | null;
  equity?: number | null;
  pnl_today?: number | null;
  open_pnl?: number | null;
  open_positions?: number;
  open_trade_count?: number;
  margin_used?: number | null;
  margin_available?: number | null;
}

export interface FXShinobiBrokerData {
  id: string;
  name: string;
  configured: boolean;
  connected: boolean;
  environment?: string;
}

export interface FXShinobiStatusResponse {
  status: string;
  live_mode?: boolean;
  broker_configured?: boolean;
  oanda_configured?: boolean;
  active_broker_id?: string | null;
  active_broker_name?: string | null;
  account_type?: string;
  environment?: string;
  account_balance?: number | null;
  equity?: number | null;
  pnl_today?: number | null;
  open_pnl?: number | null;
  account?: FXShinobiAccountData | null;
  brokers?: FXShinobiBrokerData[] | null;
  vvault_status?: string;
  supabase_status?: string;
  version?: string;
  uptime?: number;
  active_strategies?: number;
  open_positions?: number;
  message?: string;
}

export async function checkFXShinobiStatus(): Promise<ServiceStatus> {
  const config = getFinanceConfig();
  try {
    const res = await fetch(`${config.fxshinobi.apiBaseUrl}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    if (res.ok) {
      const data: FXShinobiStatusResponse = await res.json();
      
      if (data.status === 'not_configured') {
        return {
          name: 'FXShinobi',
          status: 'not_configured',
          liveMode: false,
          brokerConfigured: false,
          oandaConfigured: false,
          activeBrokerId: null,
          activeBrokerName: null,
          accountType: 'unknown',
          environment: 'unknown',
          accountBalance: null,
          equity: null,
          pnlToday: null,
          openPnl: null,
          message: 'Not configured',
          lastChecked: new Date().toISOString(),
        };
      }
      
      const isDegraded = data.vvault_status === 'offline' || data.supabase_status === 'offline';
      const statusLevel: ServiceStatusLevel = data.live_mode
        ? (isDegraded ? 'degraded' : 'live')
        : 'connected';
      
      const oandaConfigured = data.oanda_configured ?? false;
      const isOandaActive = data.active_broker_id === 'oanda' && oandaConfigured;
      
      const activeBrokerFromArray = data.brokers?.find(
        (b: { id: string; name?: string; configured?: boolean; connected?: boolean }) => b.id === data.active_broker_id
      );
      const brokerConfigured = activeBrokerFromArray?.configured ?? data.broker_configured ?? isOandaActive;
      
      return {
        name: 'FXShinobi',
        status: statusLevel,
        liveMode: data.live_mode ?? false,
        brokerConfigured,
        oandaConfigured,
        activeBrokerId: data.active_broker_id ?? null,
        activeBrokerName: activeBrokerFromArray?.name ?? data.active_broker_name ?? (isOandaActive ? 'OANDA' : null),
        accountType: data.account_type || (data.live_mode ? 'live' : 'demo'),
        environment: data.environment || (data.live_mode ? 'live' : 'demo'),
        accountBalance: data.account?.balance ?? data.account_balance ?? null,
        equity: data.account?.equity ?? data.equity ?? null,
        pnlToday: data.account?.pnl_today ?? data.pnl_today ?? null,
        openPnl: data.account?.open_pnl ?? data.open_pnl ?? null,
        account: data.account ?? null,
        brokers: data.brokers ?? null,
        message: data.live_mode
          ? (isDegraded ? 'Live (Degraded)' : `Live v${data.version || '1.0'}`)
          : 'Simulation mode',
        version: data.version,
        lastChecked: new Date().toISOString(),
        details: {
          vvaultStatus: data.vvault_status,
          supabaseStatus: data.supabase_status,
          activeStrategies: data.active_strategies,
          openPositions: data.account?.open_positions ?? data.open_positions,
        },
      };
    } else {
      return {
        name: 'FXShinobi',
        status: 'offline',
        liveMode: false,
        brokerConfigured: false,
        oandaConfigured: false,
        activeBrokerId: null,
        activeBrokerName: null,
        accountType: 'unknown',
        message: `HTTP ${res.status}`,
        lastChecked: new Date().toISOString(),
      };
    }
  } catch (err) {
    return {
      name: 'FXShinobi',
      status: 'offline',
      liveMode: false,
      brokerConfigured: false,
      oandaConfigured: false,
      activeBrokerId: null,
      activeBrokerName: null,
      accountType: 'unknown',
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
      const data = await res.json();
      
      if (data.status === 'not_configured') {
        return {
          name: 'VVAULT',
          status: 'not_configured',
          message: 'Not configured',
          lastChecked: new Date().toISOString(),
        };
      }
      
      return {
        name: 'VVAULT',
        status: 'live',
        message: 'Vault accessible',
        version: data.version,
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
        status: 'offline',
        message: `HTTP ${res.status}`,
        lastChecked: new Date().toISOString(),
      };
    }
  } catch (err) {
    return {
      name: 'VVAULT',
      status: 'offline',
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
      status: 'not_configured',
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
        status: 'live',
        message: 'Database accessible',
        lastChecked: new Date().toISOString(),
      };
    } else {
      return {
        name: 'Supabase',
        status: 'offline',
        message: `HTTP ${res.status}`,
        lastChecked: new Date().toISOString(),
      };
    }
  } catch (err) {
    return {
      name: 'Supabase',
      status: 'offline',
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

export function getStatusColor(status: ServiceStatusLevel): string {
  switch (status) {
    case 'live':
      return 'text-green-500';
    case 'connected':
      return 'text-blue-500';
    case 'degraded':
      return 'text-amber-500';
    case 'offline':
      return 'text-red-500';
    case 'not_configured':
      return 'text-gray-400';
    case 'checking':
    default:
      return 'text-gray-400';
  }
}

export function getStatusLabel(status: ServiceStatusLevel, liveMode?: boolean): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'connected':
      return liveMode === false ? 'Simulation' : 'Connected';
    case 'degraded':
      return 'Degraded';
    case 'offline':
      return 'Offline';
    case 'not_configured':
      return 'Not Configured';
    case 'checking':
    default:
      return 'Checking...';
  }
}
