import React, { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export interface WorkerStep {
  id: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  message: string;
  timestamp?: number;
  details?: string;
}

interface WorkerNotificationProps {
  isVisible: boolean;
  title: string;
  steps: WorkerStep[];
  onClose?: () => void;
}

const WorkerNotification: React.FC<WorkerNotificationProps> = ({
  isVisible,
  title,
  steps,
  onClose
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new steps are added
  useEffect(() => {
    if (scrollContainerRef.current && isVisible) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [steps, isVisible]);

  if (!isVisible) return null;

  const getStepIcon = (status: WorkerStep['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />;
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'error':
        return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'skipped':
        return <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />;
      default:
        return <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20" />;
    }
  };

  const getStepTextColor = (status: WorkerStep['status']) => {
    switch (status) {
      case 'running':
        return 'text-sky-100';
      case 'success':
        return 'text-emerald-100';
      case 'error':
        return 'text-rose-100';
      case 'skipped':
        return 'text-yellow-100';
      default:
        return 'text-white/60';
    }
  };

  const hasActiveStep = steps.some(s => s.status === 'running');
  const hasError = steps.some(s => s.status === 'error');
  const allComplete = steps.length > 0 && steps.every(s => s.status === 'success' || s.status === 'error' || s.status === 'skipped');

  return (
    <div
      className={cn(
        'fixed top-4 right-4 w-80 bg-[#0f1420] border border-white/10 rounded-lg shadow-2xl',
        'flex flex-col z-50 transition-all duration-300',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      )}
      style={{ maxHeight: 'calc(100vh - 2rem)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          {hasActiveStep && (
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
          )}
          {allComplete && !hasError && (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          )}
          {hasError && (
            <XCircle className="w-4 h-4 text-rose-400" />
          )}
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Scrollable Steps */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
        style={{ maxHeight: '400px' }}
      >
        {steps.length === 0 ? (
          <div className="text-xs text-white/60 py-2">Waiting for progress updates...</div>
        ) : (
          steps.map((step, index) => (
            <div
              key={step.id || index}
              className={cn(
                'flex items-start gap-2 text-xs transition-colors',
                getStepTextColor(step.status)
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getStepIcon(step.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{step.message}</div>
                {step.details && (
                  <div className="text-white/50 mt-0.5 text-[10px] leading-relaxed">
                    {step.details}
                  </div>
                )}
                {step.timestamp && (
                  <div className="text-white/30 mt-0.5 text-[10px]">
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer with summary */}
      {steps.length > 0 && (
        <div className="px-4 py-2 border-t border-white/5 text-xs text-white/60">
          {hasActiveStep ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
              <span>Processing...</span>
            </div>
          ) : allComplete ? (
            <div className="flex items-center gap-2">
              {hasError ? (
                <>
                  <XCircle className="w-3 h-3 text-rose-400" />
                  <span>Completed with errors</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Completed successfully</span>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default WorkerNotification;

