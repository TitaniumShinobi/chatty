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
  Radio,
  ScrollText,
  Building2,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  useMarketSnapshot,
  useTradeHistory,
  usePerformanceMetrics,
  useKalshiMarkets,
  useFinanceInsights,
  useAccountData,
  useScriptLogs,
} from '../../hooks/useFinanceData';
import { useFXShinobiStatus } from '../../hooks/useServiceStatus';
import { getStatusColor, getStatusLabel } from '../../lib/financeConfig';
import { ChartProvider } from '../../components/finance/ChartProvider';
import { ConnectBrokerModal } from '../../components/finance/ConnectBrokerModal';
import {
  ForexFactoryCalendar,
  FinvizHeatmap,
  CurrencyStrength,
  CompoundCalculator,
  WeekendTraining,
} from '../../components/finance/ExternalIntel';
import type { InsightItem, KalshiMarket, TradeRecord } from '../../types/finance';

type TradeFilter = 'all' | 'fxshinobi' | 'manual';

const TRADES_PER_PAGE = 10;

const FXShinobiPage: React.FC = () => {
  const navigate = useNavigate();
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showExternalIntel, setShowExternalIntel] = useState(true);
  const [showBrokerModal, setShowBrokerModal] = useState(false);

  const { data: snapshot, loading: snapshotLoading } = useMarketSnapshot({
    autoRefresh: true,
    refreshInterval: 30000,
  });
  
  const chartSymbol = snapshot?.current_symbol || 'EURUSD';
  const chartTimeframe = snapshot?.current_timeframe || '15m';
  const { data: trades, loading: tradesLoading } = useTradeHistory({ autoRefresh: true });
  const { data: performance, loading: perfLoading } = usePerformanceMetrics();
  const { data: markets, loading: marketsLoading } = useKalshiMarkets({ autoRefresh: true });
  const { data: insights, loading: insightsLoading } = useFinanceInsights({ autoRefresh: true });
  const { data: accountData, loading: accountLoading } = useAccountData({ autoRefresh: true, refreshInterval: 30000 });
  const { data: scriptLogs, loading: logsLoading } = useScriptLogs({ autoRefresh: true, refreshInterval: 15000 });
  const { status: fxshinobiStatus, refresh: refreshStatus } = useFXShinobiStatus(true, 30000);

  const filteredTrades = trades.filter((trade: TradeRecord) => {
    if (tradeFilter === 'all') return true;
    const source = (trade as TradeRecord & { source?: string }).source || 'fxshinobi';
    if (tradeFilter === 'fxshinobi') return source === 'fxshinobi' || (trade as TradeRecord & { is_fxshinobi?: boolean }).is_fxshinobi;
    if (tradeFilter === 'manual') return source === 'manual' || source === 'other';
    return true;
  });

  const totalPages = Math.ceil(filteredTrades.length / TRADES_PER_PAGE);
  const paginatedTrades = filteredTrades.slice(
    (currentPage - 1) * TRADES_PER_PAGE,
    currentPage * TRADES_PER_PAGE
  );

  const handleFilterChange = (newFilter: TradeFilter) => {
    setTradeFilter(newFilter);
    setCurrentPage(1);
  };

  const getStatusIcon = () => {
    switch (fxshinobiStatus.status) {
      case 'live':
        return <Radio size={14} className="text-green-500 animate-pulse" />;
      case 'connected':
        return <CheckCircle size={14} className="text-blue-500" />;
      case 'degraded':
        return <AlertCircle size={14} className="text-amber-500" />;
      case 'offline':
        return <XCircle size={14} className="text-red-500" />;
      case 'not_configured':
        return <Settings size={14} className="text-gray-400" />;
      case 'checking':
      default:
        return <Loader2 size={14} className="animate-spin text-gray-400" />;
    }
  };

  const statusColorClass = getStatusColor(fxshinobiStatus.status);
  const statusLabel = getStatusLabel(fxshinobiStatus.status, fxshinobiStatus.liveMode);

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
                <span className={statusColorClass}>
                  {statusLabel}
                </span>
                {fxshinobiStatus.liveMode && fxshinobiStatus.status === 'live' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400 font-medium">
                    LIVE
                  </span>
                )}
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
            onClick={() => setShowBrokerModal(true)}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--chatty-highlight)]"
            title="Broker Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
            border: '1px solid var(--chatty-border)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Building2 size={20} className="text-blue-500" />
              <h2 className="font-semibold">
                Broker: {fxshinobiStatus.activeBrokerName || 'Not Selected'}
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  fxshinobiStatus.liveMode
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                {fxshinobiStatus.liveMode ? 'LIVE' : 'DEMO'}
              </span>
              {fxshinobiStatus.brokerConfigured ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle size={12} />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <XCircle size={12} />
                  Not Configured
                </span>
              )}
            </div>
            <button
              onClick={() => setShowBrokerModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--chatty-highlight)]"
              style={{ border: '1px solid var(--chatty-border)' }}
            >
              <Settings size={14} />
              Configure
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div
              className="p-3 rounded-lg text-center"
              style={{ backgroundColor: 'var(--chatty-bg)' }}
            >
              {accountLoading ? (
                <Loader2 size={20} className="animate-spin mx-auto" />
              ) : (
                <>
                  <div className="text-xl font-bold">
                    {accountData?.account_balance !== null && accountData?.account_balance !== undefined
                      ? formatCurrency(accountData.account_balance)
                      : '--'}
                  </div>
                  <div className="text-xs opacity-60">Balance</div>
                </>
              )}
            </div>
            <div
              className="p-3 rounded-lg text-center"
              style={{ backgroundColor: 'var(--chatty-bg)' }}
            >
              {accountLoading ? (
                <Loader2 size={20} className="animate-spin mx-auto" />
              ) : (
                <>
                  <div className="text-xl font-bold">
                    {fxshinobiStatus.equity !== null && fxshinobiStatus.equity !== undefined
                      ? formatCurrency(fxshinobiStatus.equity)
                      : '--'}
                  </div>
                  <div className="text-xs opacity-60">Equity</div>
                </>
              )}
            </div>
            <div
              className="p-3 rounded-lg text-center"
              style={{ backgroundColor: 'var(--chatty-bg)' }}
            >
              {accountLoading ? (
                <Loader2 size={20} className="animate-spin mx-auto" />
              ) : (
                <>
                  <div className={`text-xl font-bold ${
                    (accountData?.open_pnl ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {accountData?.open_pnl !== null && accountData?.open_pnl !== undefined
                      ? formatCurrency(accountData.open_pnl)
                      : '--'}
                  </div>
                  <div className="text-xs opacity-60">Open P&L</div>
                </>
              )}
            </div>
            <div
              className="p-3 rounded-lg text-center"
              style={{ backgroundColor: 'var(--chatty-bg)' }}
            >
              {accountLoading ? (
                <Loader2 size={20} className="animate-spin mx-auto" />
              ) : (
                <>
                  <div className={`text-xl font-bold ${
                    (accountData?.pnl_today ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {accountData?.pnl_today !== null && accountData?.pnl_today !== undefined
                      ? formatCurrency(accountData.pnl_today)
                      : '--'}
                  </div>
                  <div className="text-xs opacity-60">P&L Today</div>
                </>
              )}
            </div>
            <div
              className="p-3 rounded-lg text-center"
              style={{ backgroundColor: 'var(--chatty-bg)' }}
            >
              <div className="text-xl font-bold">
                {fxshinobiStatus.details?.openPositions ?? 0}
              </div>
              <div className="text-xs opacity-60">Open Positions</div>
            </div>
          </div>
        </div>

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
                <h2 className="font-semibold">Chart</h2>
                <span className="text-xs opacity-50">{chartSymbol} · {chartTimeframe}</span>
              </div>
              <ChartProvider symbol={chartSymbol} timeframe={chartTimeframe} height={400} theme="dark" provider="tradingview" />
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                border: '1px solid var(--chatty-border)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Orders / Activity</h2>
                <div className="flex items-center gap-2">
                  <Filter size={14} className="opacity-50" />
                  <select
                    value={tradeFilter}
                    onChange={(e) => handleFilterChange(e.target.value as TradeFilter)}
                    className="text-xs px-2 py-1 rounded-lg outline-none cursor-pointer"
                    style={{
                      backgroundColor: 'var(--chatty-bg)',
                      border: '1px solid var(--chatty-border)',
                      color: 'var(--chatty-text)',
                    }}
                  >
                    <option value="all">All</option>
                    <option value="fxshinobi">FXShinobi</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>
              {tradesLoading ? (
                <div className="text-center py-8 opacity-50">Loading trades...</div>
              ) : filteredTrades.length === 0 ? (
                <div className="text-center py-8 opacity-50">No trades yet</div>
              ) : (
                <>
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0" style={{ backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))' }}>
                        <tr className="border-b" style={{ borderColor: 'var(--chatty-border)' }}>
                          <th className="text-left py-2 opacity-70 font-medium">Time</th>
                          <th className="text-left py-2 opacity-70 font-medium">Symbol</th>
                          <th className="text-left py-2 opacity-70 font-medium">Side</th>
                          <th className="text-right py-2 opacity-70 font-medium">Size</th>
                          <th className="text-right py-2 opacity-70 font-medium">Entry</th>
                          <th className="text-right py-2 opacity-70 font-medium">P&L</th>
                          <th className="text-left py-2 opacity-70 font-medium">Status</th>
                          <th className="text-left py-2 opacity-70 font-medium">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTrades.map((trade: TradeRecord) => {
                          const source = (trade as TradeRecord & { source?: string }).source || 'fxshinobi';
                          return (
                            <tr
                              key={trade.id}
                              className="border-b hover:bg-[var(--chatty-highlight)] transition-colors"
                              style={{ borderColor: 'var(--chatty-border)' }}
                            >
                              <td className="py-2 text-xs opacity-60">
                                {new Date(trade.timestamp).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
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
                              <td className="py-2">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    source === 'fxshinobi'
                                      ? 'bg-purple-500/20 text-purple-400'
                                      : 'bg-gray-500/20 text-gray-400'
                                  }`}
                                >
                                  {source === 'fxshinobi' ? 'FXShinobi' : 'Manual'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: 'var(--chatty-border)' }}>
                      <span className="text-xs opacity-60">
                        Showing {(currentPage - 1) * TRADES_PER_PAGE + 1}-{Math.min(currentPage * TRADES_PER_PAGE, filteredTrades.length)} of {filteredTrades.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--chatty-highlight)] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="text-xs px-2">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--chatty-highlight)] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
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

          </div>

          <div className="space-y-4">
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                border: '1px solid var(--chatty-border)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <ScrollText size={18} className="text-cyan-500" />
                <span className="font-semibold">Script Log</span>
              </div>
              {logsLoading ? (
                <div className="text-center py-4 opacity-50">
                  <Loader2 size={20} className="animate-spin mx-auto" />
                </div>
              ) : scriptLogs.length === 0 ? (
                <div className="text-center py-4 text-sm opacity-50">
                  No recent logs
                </div>
              ) : (
                <div
                  className="space-y-1 max-h-40 overflow-y-auto text-xs font-mono"
                  style={{ backgroundColor: 'var(--chatty-bg)', borderRadius: '8px', padding: '8px' }}
                >
                  {scriptLogs.slice(0, 10).map((log, idx) => (
                    <div
                      key={log.id || idx}
                      className={`flex items-start gap-2 ${
                        log.level === 'error' ? 'text-red-400' :
                        log.level === 'warn' ? 'text-amber-400' :
                        log.level === 'debug' ? 'text-gray-500' :
                        'opacity-80'
                      }`}
                    >
                      <span className="opacity-50 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                      </span>
                      <span className="break-all">{log.message}</span>
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

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                border: '1px solid var(--chatty-border)',
              }}
            >
              <button
                onClick={() => setShowExternalIntel(!showExternalIntel)}
                className="w-full flex items-center justify-between"
              >
                <h2 className="font-semibold flex items-center gap-2">
                  <Newspaper size={18} className="text-cyan-500" />
                  External Intel
                </h2>
                {showExternalIntel ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {showExternalIntel && (
                <div className="mt-4 space-y-4">
                  <ForexFactoryCalendar />
                  <CurrencyStrength />
                  <FinvizHeatmap />
                  <CompoundCalculator />
                  <WeekendTraining />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConnectBrokerModal
        isOpen={showBrokerModal}
        onClose={() => setShowBrokerModal(false)}
        onSuccess={() => refreshStatus()}
      />
    </div>
  );
};

export default FXShinobiPage;
