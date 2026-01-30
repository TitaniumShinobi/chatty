import { useState, useEffect, useCallback } from 'react';
import type {
  MarketSnapshot,
  TradeRecord,
  PerformanceMetrics,
  KalshiMarket,
  InsightItem,
} from '../types/finance';

const FXSHINOBI_API_BASE = import.meta.env.VITE_FXSHINOBI_API_URL || '/api/fxshinobi';

interface UseFinanceDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useMarketSnapshot(
  symbol: string = 'EURUSD',
  options: UseFinanceDataOptions = {}
) {
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${FXSHINOBI_API_BASE}/snapshot?symbol=${symbol}`);
      if (!res.ok) throw new Error('Failed to fetch market snapshot');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData({
        symbol,
        price: 1.0842,
        change: 0.0023,
        changePercent: 0.21,
        volume: 1245000,
        high: 1.0875,
        low: 1.0801,
        open: 1.0819,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 30000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

export function useTradeHistory(options: UseFinanceDataOptions = {}) {
  const [data, setData] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${FXSHINOBI_API_BASE}/trades/history`);
      if (!res.ok) throw new Error('Failed to fetch trade history');
      const json = await res.json();
      setData(json.trades || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData([
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
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 60000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

export function usePerformanceMetrics(options: UseFinanceDataOptions = {}) {
  const [data, setData] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${FXSHINOBI_API_BASE}/performance`);
      if (!res.ok) throw new Error('Failed to fetch performance metrics');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData({
        totalPnl: 1247.85,
        winRate: 0.68,
        totalTrades: 47,
        avgWin: 52.30,
        avgLoss: 28.15,
        sharpeRatio: 1.42,
        maxDrawdown: 0.085,
        periodStart: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
        periodEnd: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 300000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

export function useKalshiMarkets(options: UseFinanceDataOptions = {}) {
  const [data, setData] = useState<KalshiMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${FXSHINOBI_API_BASE}/markets`);
      if (!res.ok) throw new Error('Failed to fetch markets');
      const json = await res.json();
      setData(json.markets || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData([
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
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 60000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

export function useFinanceInsights(options: UseFinanceDataOptions = {}) {
  const [data, setData] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${FXSHINOBI_API_BASE}/insights`);
      if (!res.ok) throw new Error('Failed to fetch insights');
      const json = await res.json();
      setData(json.insights || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData([
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
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (options.autoRefresh) {
      const interval = setInterval(fetchData, options.refreshInterval || 120000);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.autoRefresh, options.refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}
