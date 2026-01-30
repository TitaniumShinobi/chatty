import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw, Radio, Settings } from 'lucide-react';
import type { ServiceStatus, ServiceStatusLevel } from '../../lib/financeConfig';
import { getStatusColor, getStatusLabel } from '../../lib/financeConfig';

interface ServiceStatusIndicatorProps {
  status: ServiceStatus;
  onRefresh?: () => void;
  compact?: boolean;
}

const StatusIcon: React.FC<{ status: ServiceStatusLevel; size?: number }> = ({
  status,
  size = 16,
}) => {
  const colorClass = getStatusColor(status);
  
  switch (status) {
    case 'live':
      return <Radio size={size} className={`${colorClass} animate-pulse`} />;
    case 'connected':
      return <CheckCircle size={size} className={colorClass} />;
    case 'degraded':
      return <AlertCircle size={size} className={colorClass} />;
    case 'offline':
      return <XCircle size={size} className={colorClass} />;
    case 'not_configured':
      return <Settings size={size} className={colorClass} />;
    case 'checking':
    default:
      return <Loader2 size={size} className={`${colorClass} animate-spin`} />;
  }
};

const statusBgColors: Record<ServiceStatusLevel, string> = {
  live: 'bg-green-500/10',
  connected: 'bg-blue-500/10',
  degraded: 'bg-amber-500/10',
  offline: 'bg-red-500/10',
  not_configured: 'bg-gray-500/10',
  checking: 'bg-gray-500/10',
};

export const ServiceStatusIndicator: React.FC<ServiceStatusIndicatorProps> = ({
  status,
  onRefresh,
  compact = false,
}) => {
  const colorClass = getStatusColor(status.status);
  
  if (compact) {
    return (
      <div className="flex items-center gap-1.5" title={`${status.name}: ${status.message || getStatusLabel(status.status, status.liveMode)}`}>
        <StatusIcon status={status.status} size={14} />
        <span className={`text-xs ${colorClass}`}>{status.name}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg ${statusBgColors[status.status]}`}
    >
      <div className="flex items-center gap-3">
        <StatusIcon status={status.status} size={20} />
        <div>
          <div className="font-medium text-sm flex items-center gap-2">
            {status.name}
            {status.liveMode && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                LIVE
              </span>
            )}
          </div>
          {status.message && (
            <div className="text-xs opacity-70">{status.message}</div>
          )}
        </div>
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title="Refresh status"
        >
          <RefreshCw size={14} />
        </button>
      )}
    </div>
  );
};

interface ServiceStatusPanelProps {
  statuses: ServiceStatus[];
  loading?: boolean;
  onRefresh?: () => void;
  title?: string;
}

export const ServiceStatusPanel: React.FC<ServiceStatusPanelProps> = ({
  statuses,
  loading,
  onRefresh,
  title = 'Service Status',
}) => {
  const allLive = statuses.every((s) => s.status === 'live');
  const allConnected = statuses.every((s) => s.status === 'live' || s.status === 'connected');
  const anyDegraded = statuses.some((s) => s.status === 'degraded');
  const anyOffline = statuses.some((s) => s.status === 'offline');
  const anyNotConfigured = statuses.some((s) => s.status === 'not_configured');

  const getHeaderIcon = () => {
    if (loading) return <Loader2 size={16} className="animate-spin" />;
    if (allLive) return <Radio size={16} className="text-green-500 animate-pulse" />;
    if (allConnected) return <CheckCircle size={16} className="text-blue-500" />;
    if (anyDegraded) return <AlertCircle size={16} className="text-amber-500" />;
    if (anyOffline) return <XCircle size={16} className="text-red-500" />;
    if (anyNotConfigured) return <Settings size={16} className="text-gray-400" />;
    return <CheckCircle size={16} className="text-green-500" />;
  };

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
        border: '1px solid var(--chatty-border)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          {getHeaderIcon()}
          {title}
        </h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
            title="Refresh all"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {statuses.map((status) => (
          <ServiceStatusIndicator key={status.name} status={status} compact />
        ))}
      </div>

      {anyOffline && (
        <div className="mt-3 p-2 rounded-lg bg-red-500/10 text-xs text-red-400">
          Some services are offline. Data may be limited or use fallbacks.
        </div>
      )}
      
      {anyDegraded && !anyOffline && (
        <div className="mt-3 p-2 rounded-lg bg-amber-500/10 text-xs text-amber-400">
          Some services are degraded. Live trading may be affected.
        </div>
      )}
      
      {anyNotConfigured && !anyOffline && !anyDegraded && (
        <div className="mt-3 p-2 rounded-lg bg-gray-500/10 text-xs text-gray-400">
          Some services are not configured. Set environment variables to enable.
        </div>
      )}
    </div>
  );
};

export default ServiceStatusIndicator;
