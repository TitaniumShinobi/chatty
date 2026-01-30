import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Settings,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Lightbulb,
  Newspaper,
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import {
  useMarketSnapshot,
  useTradeHistory,
  usePerformanceMetrics,
  useKalshiMarkets,
  useFinanceInsights,
} from '../../hooks/useFinanceData';
import { useFXShinobiStatus } from '../../hooks/useServiceStatus';
import type { InsightItem, KalshiMarket, TradeRecord } from '../../types/finance';

const FXShinobiPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedSymbol] = useState('EURUSD');

  const { data: snapshot, loading: snapshotLoading } = useMarketSnapshot(selectedSymbol, {
    autoRefresh: true,
    refreshInterval: 30000,
  });
  const { data: trades, loading: tradesLoading } = useTradeHistory({ autoRefresh: true });
  const { data: performance, loading: perfLoading } = usePerformanceMetrics();
  const { data: markets, loading: marketsLoading } = useKalshiMarkets({ autoRefresh: true });
  const { data: insights, loading: insightsLoading } = useFinanceInsights({ autoRefresh: true });
  const { status: fxshinobiStatus, refresh: refreshStatus } = useFXShinobiStatus(true, 60000);

  const getStatusIcon = () => {
    switch (fxshinobiStatus.status) {
      case 'connected':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'error':
        return <AlertCircle size={14} className="text-amber-500" />;
      case 'disconnected':
        return <XCircle size={14} className="text-red-500" />;
      default:
        return <Loader2 size={14} className="animate-spin text-gray-400" />;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getInsightIcon = (type: InsightItem['type']) => {
    switch (type) {
      case 'alert':
        return <AlertCircle size={16} className="text-amber-500" />;
      case 'recommendation':
        return <Lightbulb size={16} className="text-blue-500" />;
      case 'news':
        return <Newspaper size={16} className="text-purple-500" />;
      default:
        return <BarChart3 size={16} className="text-green-500" />;
    }
  };

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{
        backgroundColor: 'var(--chatty-bg)',
        color: 'var(--chatty-text)',
      }}
    >
      <div
        className="flex items-center justify-between p-4 border-b"
        style={{ borderColor: 'var(--chatty-border)' }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/app/finance')}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--chatty-highlight)]"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp size={24} className="text-green-500" />
              FXShinobi
            </h1>
            <p className="text-sm opacity-70 flex items-center gap-2">
              Trading Dashboard
              <span className="flex items-center gap-1 text-xs" title={fxshinobiStatus.message}>
                {getStatusIcon()}
                <span className={fxshinobiStatus.status === 'connected' ? 'text-green-500' : fxshinobiStatus.status === 'error' ? 'text-amber-500' : fxshinobiStatus.status === 'disconnected' ? 'text-red-500' : 'opacity-50'}>
                  {fxshinobiStatus.status === 'connected' ? 'Live' : fxshinobiStatus.status === 'checking' ? 'Checking...' : 'Offline'}
                </span>
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshStatus()}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--chatty-highlight)]"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="p-2 rounded-lg transition-colors hover:bg-[var(--chatty-highlight)]"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                border: '1px solid var(--chatty-border)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">TradingView Chart</h2>
                <span className="text-xs opacity-50">{selectedSymbol}</span>
              </div>
              <div
                className="rounded-lg overflow-hidden"
                style={{ height: '400px' }}
              >
                <iframe
                  src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${selectedSymbol}&interval=15&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=exchange&withdateranges=1&showpopupbutton=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&showpopupbutton=1&locale=en&utm_source=chatty`}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                  title="TradingView Chart"
                  allow="clipboard-write"
                />
              </div>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                border: '1px solid var(--chatty-border)',
              }}
            >
              <h2 className="font-semibold mb-4">Prediction Markets</h2>
              {marketsLoading ? (
                <div className="text-center py-8 opacity-50">Loading markets...</div>
              ) : markets.length === 0 ? (
                <div className="text-center py-8 opacity-50">No markets available</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {markets.map((market: KalshiMarket) => (
                    <div
                      key={market.id}
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: 'var(--chatty-bg)',
                        border: '1px solid var(--chatty-border)',
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: 'var(--chatty-highlight)',
                          }}
                        >
                          {market.category}
                        </span>
                        <span className="text-xs opacity-50">
                          {new Date(market.expiresAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h3 className="font-medium text-sm mb-1">{market.title}</h3>
                      {market.subtitle && (
                        <p className="text-xs opacity-60 mb-3">{market.subtitle}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          className="flex-1 py-2 rounded text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            color: '#10B981',
                          }}
                        >
                          Yes {formatPercent(market.yesPrice)}
                        </button>
                        <button
                          className="flex-1 py-2 rounded text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.2)',
                            color: '#EF4444',
                          }}
                        >
                          No {formatPercent(market.noPrice)}
                        </button>
                      </div>
                      <div className="mt-2 text-xs opacity-50 text-center">
                        Vol: ${(market.volume / 1000).toFixed(0)}K
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                border: '1px solid var(--chatty-border)',
              }}
            >
              <h2 className="font-semibold mb-4">Recent Trades</h2>
              {tradesLoading ? (
                <div className="text-center py-8 opacity-50">Loading trades...</div>
              ) : trades.length === 0 ? (
                <div className="text-center py-8 opacity-50">No trades yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--chatty-border)' }}>
                        <th className="text-left py-2 opacity-70 font-medium">Symbol</th>
                        <th className="text-left py-2 opacity-70 font-medium">Side</th>
                        <th className="text-right py-2 opacity-70 font-medium">Qty</th>
                        <th className="text-right py-2 opacity-70 font-medium">Price</th>
                        <th className="text-right py-2 opacity-70 font-medium">P&L</th>
                        <th className="text-left py-2 opacity-70 font-medium">Status</th>
                        <th className="text-right py-2 opacity-70 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade: TradeRecord) => (
                        <tr
                          key={trade.id}
                          className="border-b"
                          style={{ borderColor: 'var(--chatty-border)' }}
                        >
                          <td className="py-2 font-medium">{trade.symbol}</td>
                          <td className="py-2">
                            <span
                              className={
                                trade.side === 'buy' ? 'text-green-500' : 'text-red-500'
                              }
                            >
                              {trade.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {trade.quantity.toLocaleString()}
                          </td>
                          <td className="py-2 text-right">{trade.price.toFixed(4)}</td>
                          <td className="py-2 text-right">
                            {trade.pnl !== undefined ? (
                              <span
                                className={trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}
                              >
                                {trade.pnl >= 0 ? '+' : ''}
                                {formatCurrency(trade.pnl)}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2">
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                trade.status === 'open'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : trade.status === 'closed'
                                  ? 'bg-gray-500/20 text-gray-400'
                                  : 'bg-amber-500/20 text-amber-400'
                              }`}
                            >
                              {trade.status}
                            </span>
                          </td>
                          <td className="py-2 text-right text-xs opacity-60">
                            {new Date(trade.timestamp).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                border: '1px solid var(--chatty-border)',
              }}
            >
              <h2 className="font-semibold mb-4">Performance</h2>
              {perfLoading ? (
                <div className="text-center py-4 opacity-50">Loading...</div>
              ) : performance ? (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <div className="text-3xl font-bold text-green-500">
                      {formatCurrency(performance.totalPnl)}
                    </div>
                    <div className="text-sm opacity-70">Total P&L (30 days)</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      className="p-3 rounded-lg text-center"
                      style={{ backgroundColor: 'var(--chatty-bg)' }}
                    >
                      <div className="text-lg font-semibold">
                        {formatPercent(performance.winRate)}
                      </div>
                      <div className="text-xs opacity-60">Win Rate</div>
                    </div>
                    <div
                      className="p-3 rounded-lg text-center"
                      style={{ backgroundColor: 'var(--chatty-bg)' }}
                    >
                      <div className="text-lg font-semibold">{performance.totalTrades}</div>
                      <div className="text-xs opacity-60">Total Trades</div>
                    </div>
                    <div
                      className="p-3 rounded-lg text-center"
                      style={{ backgroundColor: 'var(--chatty-bg)' }}
                    >
                      <div className="text-lg font-semibold text-green-500">
                        {formatCurrency(performance.avgWin)}
                      </div>
                      <div className="text-xs opacity-60">Avg Win</div>
                    </div>
                    <div
                      className="p-3 rounded-lg text-center"
                      style={{ backgroundColor: 'var(--chatty-bg)' }}
                    >
                      <div className="text-lg font-semibold text-red-500">
                        {formatCurrency(performance.avgLoss)}
                      </div>
                      <div className="text-xs opacity-60">Avg Loss</div>
                    </div>
                  </div>
                  {performance.sharpeRatio && (
                    <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: 'var(--chatty-border)' }}>
                      <span className="text-sm opacity-70">Sharpe Ratio</span>
                      <span className="font-medium">{performance.sharpeRatio.toFixed(2)}</span>
                    </div>
                  )}
                  {performance.maxDrawdown && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm opacity-70">Max Drawdown</span>
                      <span className="font-medium text-red-500">
                        {formatPercent(performance.maxDrawdown)}
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                border: '1px solid var(--chatty-border)',
              }}
            >
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Lightbulb size={18} className="text-amber-500" />
                AI Insights
              </h2>
              {insightsLoading ? (
                <div className="text-center py-4 opacity-50">Loading insights...</div>
              ) : insights.length === 0 ? (
                <div className="text-center py-4 opacity-50">No insights available</div>
              ) : (
                <div className="space-y-3">
                  {insights.map((insight: InsightItem) => (
                    <div
                      key={insight.id}
                      className="p-3 rounded-lg"
                      style={{
                        backgroundColor: 'var(--chatty-bg)',
                        border:
                          insight.priority === 'high'
                            ? '1px solid rgba(245, 158, 11, 0.3)'
                            : '1px solid transparent',
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {getInsightIcon(insight.type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-medium text-sm">{insight.title}</h4>
                            {insight.value && (
                              <span
                                className={`text-sm font-semibold ${
                                  insight.trend === 'up'
                                    ? 'text-green-500'
                                    : insight.trend === 'down'
                                    ? 'text-red-500'
                                    : ''
                                }`}
                              >
                                {insight.trend === 'up' && <TrendingUp size={14} className="inline mr-1" />}
                                {insight.trend === 'down' && <TrendingDown size={14} className="inline mr-1" />}
                                {insight.value}
                              </span>
                            )}
                          </div>
                          <p className="text-xs opacity-70 mt-1">{insight.content}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs opacity-50">
                            <Clock size={10} />
                            {new Date(insight.timestamp).toLocaleTimeString()}
                            {insight.source && <span>| {insight.source}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {snapshotLoading ? null : snapshot ? (
              <div
                className="rounded-xl p-4"
                style={{
                  backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                  border: '1px solid var(--chatty-border)',
                }}
              >
                <h2 className="font-semibold mb-3">{snapshot.symbol}</h2>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{snapshot.price.toFixed(4)}</span>
                  <span
                    className={`text-sm font-medium ${
                      snapshot.change >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {snapshot.change >= 0 ? '+' : ''}
                    {snapshot.change.toFixed(4)} ({formatPercent(snapshot.changePercent / 100)})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="opacity-60">High</span>
                    <span>{snapshot.high.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Low</span>
                    <span>{snapshot.low.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Open</span>
                    <span>{snapshot.open.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Volume</span>
                    <span>{(snapshot.volume / 1000).toFixed(0)}K</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FXShinobiPage;
