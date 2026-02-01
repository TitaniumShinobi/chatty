import { useState, useEffect, useCallback } from 'react';
import { getFinanceConfig } from '../lib/financeConfig';
import type {
  MarketSnapshot,
  TradeRecord,
  PerformanceMetrics,
  KalshiMarket,
  InsightItem,
} from '../types/finance';

function getApiBaseUrl(): string {
  return getFinanceConfig().fxshinobi.apiBaseUrl;
}

interface UseFinanceDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface FinanceDataState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  liveMode: boolean;
  isFallback: boolean;
}

export function useMarketSnapshot(
  symbol: string = 'EURUSD',
  options: UseFinanceDataOptions = {}
) {
  const [state, setState] = useState<FinanceDataState<MarketSnapshot | null>>({
    data: null,
    loading: true,
    error: null,
    liveMode: false,
    isFallback: false,
  });

  const fetchData = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/snapshot?symbol=${symbol}`, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) throw new Error('Failed to fetch market snapshot');
      const json = await res.json();
      
      if (json.fallback || json.error) {
        throw new Error(json.error || 'Using fallback data');
      }
      
      setState({
        data: json,
        loading: false,
        error: null,
        liveMode: json.live_mode ?? false,
        isFallback: false,
      });
    } catch (err) {
      setState({
        data: {
          symbol,
          price: 1.0842,
          change: 0.0023,
          changePercent: 0.21,
          volume: 1245000,
          high: 1.0875,
          low: 1.0801,
          open: 1.0819,
          timestamp: new Date().toISOString(),
        },
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        liveMode: false,
        isFallback: true,
      });
    }
  }, [symbol]);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 30000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { ...state, refetch: fetchData };
}

export function useTradeHistory(options: UseFinanceDataOptions = {}) {
  const [state, setState] = useState<FinanceDataState<TradeRecord[]>>({
    data: [],
    loading: true,
    error: null,
    liveMode: false,
    isFallback: false,
  });

  const fetchData = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/trades/history`, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) throw new Error('Failed to fetch trade history');
      const json = await res.json();
      
      if (json.fallback || json.error) {
        throw new Error(json.error || 'Using fallback data');
      }
      
      setState({
        data: json.trades || [],
        loading: false,
        error: null,
        liveMode: json.live_mode ?? false,
        isFallback: false,
      });
    } catch (err) {
      setState({
        data: [
          {
            id: '1',
            symbol: 'EURUSD',
            side: 'buy',
            quantity: 10000,
            price: 1.0825,
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            pnl: 45.50,
            status: 'closed',
            strategy: 'momentum',
          },
          {
            id: '2',
            symbol: 'GBPUSD',
            side: 'sell',
            quantity: 5000,
            price: 1.2654,
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            pnl: -12.30,
            status: 'closed',
            strategy: 'mean_reversion',
          },
          {
            id: '3',
            symbol: 'USDJPY',
            side: 'buy',
            quantity: 15000,
            price: 149.85,
            timestamp: new Date(Date.now() - 1800000).toISOString(),
            status: 'open',
            strategy: 'trend_follow',
          },
        ],
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        liveMode: false,
        isFallback: true,
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 60000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { ...state, refetch: fetchData };
}

export function usePerformanceMetrics(options: UseFinanceDataOptions = {}) {
  const [state, setState] = useState<FinanceDataState<PerformanceMetrics | null>>({
    data: null,
    loading: true,
    error: null,
    liveMode: false,
    isFallback: false,
  });

  const fetchData = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/performance`, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) throw new Error('Failed to fetch performance metrics');
      const json = await res.json();
      
      if (json.fallback || json.error) {
        throw new Error(json.error || 'Using fallback data');
      }
      
      setState({
        data: json,
        loading: false,
        error: null,
        liveMode: json.live_mode ?? false,
        isFallback: false,
      });
    } catch (err) {
      setState({
        data: {
          totalPnl: 1247.85,
          winRate: 0.68,
          totalTrades: 47,
          avgWin: 52.30,
          avgLoss: 28.15,
          sharpeRatio: 1.42,
          maxDrawdown: 0.085,
          periodStart: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
          periodEnd: new Date().toISOString(),
        },
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        liveMode: false,
        isFallback: true,
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 300000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { ...state, refetch: fetchData };
}

export function useKalshiMarkets(options: UseFinanceDataOptions = {}) {
  const [state, setState] = useState<FinanceDataState<KalshiMarket[]>>({
    data: [],
    loading: true,
    error: null,
    liveMode: false,
    isFallback: false,
  });

  const fetchData = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/markets`, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) throw new Error('Failed to fetch markets');
      const json = await res.json();
      
      if (json.fallback || json.error) {
        throw new Error(json.error || 'Using fallback data');
      }
      
      setState({
        data: json.markets || [],
        loading: false,
        error: null,
        liveMode: json.live_mode ?? false,
        isFallback: false,
      });
    } catch (err) {
      setState({
        data: [
          {
            id: 'fed-rate-jan',
            title: 'Fed Holds Rates in January',
            subtitle: 'Will the Federal Reserve maintain current rates?',
            yesPrice: 0.72,
            noPrice: 0.28,
            volume: 125000,
            expiresAt: '2026-01-29T19:00:00Z',
            category: 'Economics',
            status: 'open',
          },
          {
            id: 'sp500-above-6k',
            title: 'S&P 500 Above 6000 by Feb',
            subtitle: 'Will SPX close above 6000 by end of February?',
            yesPrice: 0.58,
            noPrice: 0.42,
            volume: 89000,
            expiresAt: '2026-02-28T21:00:00Z',
            category: 'Markets',
            status: 'open',
          },
          {
            id: 'btc-100k',
            title: 'Bitcoin Reaches $100K',
            subtitle: 'Will BTC trade above $100,000 in Q1 2026?',
            yesPrice: 0.45,
            noPrice: 0.55,
            volume: 234000,
            expiresAt: '2026-03-31T23:59:59Z',
            category: 'Crypto',
            status: 'open',
          },
        ],
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        liveMode: false,
        isFallback: true,
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 60000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { ...state, refetch: fetchData };
}

export function useFinanceInsights(options: UseFinanceDataOptions = {}) {
  const [state, setState] = useState<FinanceDataState<InsightItem[]>>({
    data: [],
    loading: true,
    error: null,
    liveMode: false,
    isFallback: false,
  });

  const fetchData = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/insights`, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) throw new Error('Failed to fetch insights');
      const json = await res.json();
      
      if (json.fallback || json.error) {
        throw new Error(json.error || 'Using fallback data');
      }
      
      setState({
        data: json.insights || [],
        loading: false,
        error: null,
        liveMode: json.live_mode ?? false,
        isFallback: false,
      });
    } catch (err) {
      setState({
        data: [
          {
            id: '1',
            type: 'metric',
            title: 'Win Rate',
            content: 'Your win rate has improved 8% this week',
            value: '68%',
            trend: 'up',
            timestamp: new Date().toISOString(),
            priority: 'high',
          },
          {
            id: '2',
            type: 'alert',
            title: 'Volatility Alert',
            content: 'EURUSD volatility spiking ahead of ECB decision',
            timestamp: new Date().toISOString(),
            source: 'Market Analysis',
            priority: 'high',
          },
          {
            id: '3',
            type: 'recommendation',
            title: 'Strategy Suggestion',
            content: 'Consider reducing position size during high-impact news events',
            timestamp: new Date().toISOString(),
            priority: 'medium',
          },
          {
            id: '4',
            type: 'news',
            title: 'Fed Minutes Released',
            content: 'Federal Reserve signals potential rate hold through Q1',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            source: 'Reuters',
            priority: 'medium',
          },
        ],
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        liveMode: false,
        isFallback: true,
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 120000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { ...state, refetch: fetchData };
}

export interface AccountData {
  account_balance: number | null;
  open_pnl: number | null;
  pnl_today: number | null;
  currency: string;
  margin_used?: number | null;
  margin_available?: number | null;
}

export function useAccountData(options: UseFinanceDataOptions = {}) {
  const [state, setState] = useState<FinanceDataState<AccountData | null>>({
    data: null,
    loading: true,
    error: null,
    liveMode: false,
    isFallback: false,
  });

  const fetchData = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/account`, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) throw new Error('Failed to fetch account data');
      const json = await res.json();
      
      if (json.fallback) {
        throw new Error(json.message || 'Using fallback data');
      }
      
      setState({
        data: json,
        loading: false,
        error: null,
        liveMode: false,
        isFallback: false,
      });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        liveMode: false,
        isFallback: true,
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 30000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { ...state, refetch: fetchData };
}

export interface ScriptLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

export function useScriptLogs(options: UseFinanceDataOptions = {}) {
  const [state, setState] = useState<FinanceDataState<ScriptLogEntry[]>>({
    data: [],
    loading: true,
    error: null,
    liveMode: false,
    isFallback: false,
  });

  const fetchData = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/logs/recent?limit=20`, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) throw new Error('Failed to fetch logs');
      const json = await res.json();
      
      if (json.fallback) {
        throw new Error(json.message || 'Using fallback data');
      }
      
      setState({
        data: json.logs || [],
        loading: false,
        error: null,
        liveMode: false,
        isFallback: false,
      });
    } catch (err) {
      setState({
        data: [],
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        liveMode: false,
        isFallback: true,
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 15000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { ...state, refetch: fetchData };
}
