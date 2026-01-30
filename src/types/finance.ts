export interface FinanceAppDataSource {
  type: 'supabase' | 'api' | 'websocket';
  endpoint?: string;
  tables?: string[];
  refreshInterval?: number;
}

export interface FinanceAppCredential {
  id: string;
  name: string;
  type: 'api_key' | 'oauth' | 'credentials';
  required: boolean;
  description?: string;
}

export interface FinanceAppWidget {
  id: string;
  type: 'chart' | 'tiles' | 'insights' | 'table' | 'metric';
  title: string;
  defaultSize?: 'small' | 'medium' | 'large' | 'full';
}

export interface FinanceApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  version: string;
  author?: string;
  dataSources: FinanceAppDataSource[];
  requiredCredentials: FinanceAppCredential[];
  widgets: FinanceAppWidget[];
  enabled: boolean;
  category: 'trading' | 'analytics' | 'portfolio' | 'research' | 'automation';
}

export interface FinanceConnection {
  id: string;
  appId: string;
  userId: string;
  serviceName: string;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  credentials?: Record<string, string>;
  connectedAt: string;
  lastSyncAt?: string;
  metadata?: Record<string, any>;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: string;
  pnl?: number;
  status: 'open' | 'closed' | 'pending';
  strategy?: string;
}

export interface MarketSnapshot {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
}

export interface PerformanceMetrics {
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  periodStart: string;
  periodEnd: string;
}

export interface KalshiMarket {
  id: string;
  title: string;
  subtitle?: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  expiresAt: string;
  category: string;
  status: 'open' | 'closed' | 'settled';
  userPosition?: {
    side: 'yes' | 'no';
    quantity: number;
    avgPrice: number;
    pnl: number;
  };
}

export interface InsightItem {
  id: string;
  type: 'metric' | 'news' | 'alert' | 'recommendation';
  title: string;
  content: string;
  value?: string | number;
  trend?: 'up' | 'down' | 'neutral';
  timestamp: string;
  source?: string;
  priority?: 'high' | 'medium' | 'low';
}

const fxShinobiApp: FinanceApp = {
  id: 'fxshinobi',
  name: 'FXShinobi',
  description: 'Trading signals, analytics, and automated strategy execution',
  icon: 'TrendingUp',
  route: '/app/finance/fxshinobi',
  version: '1.0.0',
  author: 'LIFE Technology',
  category: 'trading',
  enabled: true,
  dataSources: [
    {
      type: 'api',
      endpoint: '/api/fxshinobi',
      refreshInterval: 30000,
    },
    {
      type: 'supabase',
      tables: ['fx_sessions', 'fx_trades', 'strategy_runs', 'price_snapshots'],
    },
  ],
  requiredCredentials: [
    {
      id: 'broker_api_key',
      name: 'Broker API Key',
      type: 'api_key',
      required: false,
      description: 'API key for your connected broker',
    },
  ],
  widgets: [
    { id: 'chart', type: 'chart', title: 'Price Chart', defaultSize: 'large' },
    { id: 'markets', type: 'tiles', title: 'Active Markets', defaultSize: 'medium' },
    { id: 'insights', type: 'insights', title: 'AI Insights', defaultSize: 'medium' },
    { id: 'trades', type: 'table', title: 'Recent Trades', defaultSize: 'full' },
  ],
};

export const financeAppRegistry: FinanceApp[] = [fxShinobiApp];

export function getFinanceApp(id: string): FinanceApp | undefined {
  return financeAppRegistry.find((app) => app.id === id);
}

export function getEnabledFinanceApps(): FinanceApp[] {
  return financeAppRegistry.filter((app) => app.enabled);
}
