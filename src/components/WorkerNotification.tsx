import React from 'react';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Z_LAYERS } from '../lib/zLayers';
import { cn } from '../lib/utils';

export interface WorkerStep {
  id: string;
  status: 'running' | 'success' | 'error';
  message: string;
  details?: string;
  timestamp: number;
}

interface WorkerNotificationProps {
  isVisible: boolean;
  title: string;
  steps: WorkerStep[];
  onClose: () => void;
}

const WorkerNotification: React.FC<WorkerNotificationProps> = ({
  isVisible,
  title,
  steps,
  onClose,
}) => {
  if (!isVisible) return null;

  const getStatusIcon = (status: WorkerStep['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={16} className="text-emerald-400" />;
      case 'error':
        return <AlertCircle size={16} className="text-rose-400" />;
      case 'running':
        return <Loader2 size={16} className="text-sky-400 animate-spin" />;
    }
  };

  const getStatusColor = (status: WorkerStep['status']) => {
    switch (status) {
      case 'success':
        return 'text-emerald-100';
      case 'error':
        return 'text-rose-100';
      case 'running':
        return 'text-sky-100';
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4 pointer-events-none"
      style={{ zIndex: Z_LAYERS.modal }}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-white/10 bg-[#0f1420] p-6 shadow-2xl pointer-events-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors text-white/60 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border',
                step.status === 'success' && 'border-emerald-400/20 bg-emerald-400/5',
                step.status === 'error' && 'border-rose-400/20 bg-rose-400/5',
                step.status === 'running' && 'border-sky-400/20 bg-sky-400/5'
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getStatusIcon(step.status)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', getStatusColor(step.status))}>
                  {step.message}
                </p>
                {step.details && (
                  <p className="text-xs text-white/60 mt-1">{step.details}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkerNotification;



