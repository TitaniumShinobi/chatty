import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import type { ServiceStatus } from '../../lib/financeConfig';

interface ServiceStatusIndicatorProps {
  status: ServiceStatus;
  onRefresh?: () => void;
  compact?: boolean;
}

const statusColors = {
  connected: 'text-green-500',
  disconnected: 'text-red-500',
  error: 'text-amber-500',
  checking: 'text-gray-400',
};

const statusBgColors = {
  connected: 'bg-green-500/10',
  disconnected: 'bg-red-500/10',
  error: 'bg-amber-500/10',
  checking: 'bg-gray-500/10',
};

const StatusIcon: React.FC<{ status: ServiceStatus['status']; size?: number }> = ({
  status,
  size = 16,
}) => {
  switch (status) {
    case 'connected':
      return <CheckCircle size={size} className={statusColors.connected} />;
    case 'disconnected':
      return <XCircle size={size} className={statusColors.disconnected} />;
    case 'error':
      return <AlertCircle size={size} className={statusColors.error} />;
    case 'checking':
      return <Loader2 size={size} className={`${statusColors.checking} animate-spin`} />;
  }
};

export const ServiceStatusIndicator: React.FC<ServiceStatusIndicatorProps> = ({
  status,
  onRefresh,
  compact = false,
}) => {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5" title={`${status.name}: ${status.message || status.status}`}>
        <StatusIcon status={status.status} size={14} />
        <span className={`text-xs ${statusColors[status.status]}`}>{status.name}</span>
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
          <div className="font-medium text-sm">{status.name}</div>
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
  const allConnected = statuses.every((s) => s.status === 'connected');
  const anyError = statuses.some((s) => s.status === 'error' || s.status === 'disconnected');

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
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : allConnected ? (
            <CheckCircle size={16} className="text-green-500" />
          ) : anyError ? (
            <AlertCircle size={16} className="text-amber-500" />
          ) : (
            <XCircle size={16} className="text-red-500" />
          )}
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

      {anyError && (
        <div className="mt-3 p-2 rounded-lg bg-amber-500/10 text-xs text-amber-400">
          Some services are unavailable. Data may be limited or use fallbacks.
        </div>
      )}
    </div>
  );
};

export default ServiceStatusIndicator;
