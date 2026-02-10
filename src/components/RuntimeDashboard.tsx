import React, { useEffect, useMemo, useState } from 'react';
import type { RuntimeAwarenessSnapshot } from '../lib/runtimeAwareness';
import { cn } from '../lib/utils';
import { Z_LAYERS } from '../lib/zLayers';
import DataImportModal from './settings/DataImportModal';
import WorkerNotification, { WorkerStep } from './WorkerNotification';
import { Upload } from 'lucide-react';

export interface RuntimeDashboardOption {
  key: string;
  runtimeId: string;
  name: string;
  description?: string;
  provider?: string;
  awareness?: RuntimeAwarenessSnapshot | null;
  metadata?: Record<string, any>;
}

export interface RuntimeImportSummary {
  text: string;
  knownEntries: Array<{
    display: string;
    description: string;
    path: string;
    isDirectory?: boolean;
  }>;
  unknownEntries: string[];
}

interface RuntimeDashboardProps {
  runtimes: RuntimeDashboardOption[];
  onSelect: (runtime: RuntimeDashboardOption) => void;
  onDismiss?: () => void;
  onRequestImport?: () => void;
  importStatus?: 'idle' | 'processing' | 'success' | 'error';
  importMessage?: string | null;
  importSummary?: RuntimeImportSummary | null;
  onRequestRemove?: (runtime: RuntimeDashboardOption) => void;
  removalStatus?: 'idle' | 'processing' | 'success' | 'error';
  removalMessage?: string | null;
}

const RuntimeDashboard: React.FC<RuntimeDashboardProps> = ({
  runtimes,
  onSelect,
  onDismiss,
  onRequestImport,
  importStatus = 'idle',
  importMessage,
  importSummary,
  onRequestRemove,
  removalStatus = 'idle',
  removalMessage,
}) => {
  const [runtimePendingRemoval, setRuntimePendingRemoval] = useState<RuntimeDashboardOption | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState<boolean>(false);
  const [runtimeKeyPendingResult, setRuntimeKeyPendingResult] = useState<string | null>(null);
  const [removedRuntimeKeys, setRemovedRuntimeKeys] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [localImportStatus, setLocalImportStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [localImportMessage, setLocalImportMessage] = useState<string | null>(null);
  const [localImportSummary, setLocalImportSummary] = useState<RuntimeImportSummary | null>(null);
  const [workerSteps, setWorkerSteps] = useState<WorkerStep[]>([]);
  const [showWorkerNotification, setShowWorkerNotification] = useState(false);

  const openConfirmRemoval = (runtime: RuntimeDashboardOption) => {
    setRuntimePendingRemoval(runtime);
  };

  const closeConfirmRemoval = () => {
    setRuntimePendingRemoval(null);
  };

  const confirmRemoval = () => {
    if (!runtimePendingRemoval) return;
    // Optimistically hide card
    setRemovedRuntimeKeys((prev) => {
      const next = new Set(prev);
      next.add(runtimePendingRemoval.key);
      return next;
    });
    setIsResultModalOpen(true);
    setRuntimeKeyPendingResult(runtimePendingRemoval.key);
    // Call parent if provided
    if (onRequestRemove) {
      onRequestRemove(runtimePendingRemoval);
    }
    setRuntimePendingRemoval(null);
  };

  const closeResultModal = () => {
    setIsResultModalOpen(false);
  };

  useEffect(() => {
    if (!isResultModalOpen) return;
    if (!runtimeKeyPendingResult) return;
    if (removalStatus === 'success') {
      // already optimistically removed; just clear tracking
      setRuntimeKeyPendingResult(null);
    } else if (removalStatus === 'error') {
      // revert optimistic removal on error
      setRemovedRuntimeKeys((prev) => {
        const next = new Set(prev);
        next.delete(runtimeKeyPendingResult);
        return next;
      });
      setRuntimeKeyPendingResult(null);
    }
  }, [removalStatus, isResultModalOpen, runtimeKeyPendingResult]);

  const visibleRuntimes = useMemo(() => {
    if (!removedRuntimeKeys.size) return runtimes;
    return runtimes.filter((rt) => !removedRuntimeKeys.has(rt.key));
  }, [runtimes, removedRuntimeKeys]);

  const handleImportClick = () => {
    setShowImportModal(true);
  };

  const formatArchiveSummaryNotice = (summary: RuntimeImportSummary | null): string => {
    if (!summary) return '';
    const knownCount = summary.knownEntries?.length || 0;
    const unknownCount = summary.unknownEntries?.length || 0;
    if (knownCount > 0 && unknownCount > 0) {
      return `Detected ${knownCount} known items (${summary.knownEntries.map(e => e.display).join(', ')}). Found ${unknownCount} unknown files.`;
    } else if (knownCount > 0) {
      return `Detected ${knownCount} known items (${summary.knownEntries.map(e => e.display).join(', ')}).`;
    } else if (unknownCount > 0) {
      return `Found ${unknownCount} unknown files.`;
    }
    return '';
  };

  const addWorkerStep = (message: string, details?: string, status: WorkerStep['status'] = 'running') => {
    const step: WorkerStep = {
      id: `step-${Date.now()}-${Math.random()}`,
      status,
      message,
      details,
      timestamp: Date.now()
    };
    setWorkerSteps(prev => [...prev, step]);
    return step.id;
  };

  const updateWorkerStep = (id: string, updates: Partial<WorkerStep>) => {
    setWorkerSteps(prev => prev.map(step => 
      step.id === id ? { ...step, ...updates } : step
    ));
  };

  const handleImportConfirm = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      setIsImporting(true);
      setLocalImportStatus('processing');
      setShowImportModal(false); // Close modal before import starts
      
      // Initialize worker notification
      setWorkerSteps([]);
      setShowWorkerNotification(true);
      
      // Step 1: Uploading file
      const uploadStepId = addWorkerStep(`Uploading ${file.name}...`, 'Preparing file for import');
      
      const formData = new FormData();
      formData.append('file', file);

      // Use XMLHttpRequest for upload progress tracking
      const response = await new Promise<{ ok: boolean; status: number; text: () => Promise<string> }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            updateWorkerStep(uploadStepId, {
              details: `Uploaded ${percentComplete}% (${formatBytes(e.loaded)} / ${formatBytes(e.total)})`
            });
          }
        });

        xhr.addEventListener('load', () => {
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            text: async () => xhr.responseText
          });
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error'));
        });

        xhr.open('POST', '/api/import/chat-export');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.withCredentials = true;
        xhr.send(formData);
      });

      // Update upload step to success
      updateWorkerStep(uploadStepId, { status: 'success', details: 'File uploaded successfully' });
      
      // Step 2: Processing archive
      const processStepId = addWorkerStep('Processing archive...', 'Extracting and analyzing contents');

      // Check if response is OK before parsing JSON
      let payload;
      try {
        const text = await response.text();
        if (!text || text.trim().length === 0) {
          throw new Error('Empty response from server');
        }
        payload = JSON.parse(text);
      } catch (parseError: any) {
        if (parseError.message.includes('Unexpected end of JSON input') || parseError.message.includes('Empty response')) {
          throw new Error('The server response was incomplete. The export file may be corrupted or incomplete. Please try re-exporting from ChatGPT.');
        }
        throw parseError;
      }

      // Handle duplicate detection (409 Conflict)
      if (response.status === 409 && payload.isDuplicate) {
        setLocalImportStatus('error');
        const existingName = payload.existingRuntime?.name || 'an existing runtime';
        const existingDate = payload.existingRuntime?.createdAt 
          ? new Date(payload.existingRuntime.createdAt).toLocaleDateString()
          : '';
        setLocalImportMessage(
          `⚠️ Duplicate Runtime Detected\n\n` +
          `A runtime already exists for this account:\n` +
          `• ${existingName}${existingDate ? ` (created ${existingDate})` : ''}\n\n` +
          `To import anyway, you can:\n` +
          `1. Delete the existing runtime first, or\n` +
          `2. Import with a different account/email`
        );
        setShowImportModal(false);
        return;
      }

      if (!response.ok || !payload?.ok) {
        updateWorkerStep(processStepId, { status: 'error', details: payload?.error || 'Import failed' });
        throw new Error(payload?.error || 'Failed to import archive');
      }

      updateWorkerStep(processStepId, { status: 'success', details: 'Archive processed successfully' });

      // Step 3: Extracting conversations
      const extractStepId = addWorkerStep('Extracting conversations...', 'Parsing conversation data from archive');
      const totalConversations = payload.metadata?.totalConversations ?? 'unknown';
      const totalMessages = payload.metadata?.totalMessages ?? 'unknown';
      setTimeout(() => {
        updateWorkerStep(extractStepId, { 
          status: 'success', 
          details: `Found ${totalConversations} conversations with ${totalMessages} messages` 
        });
      }, 300);

      // Step 4: Writing to VVAULT
      const writeStepId = addWorkerStep('Writing to VVAULT...', 'Saving conversations to storage');
      setTimeout(() => {
        updateWorkerStep(writeStepId, { 
          status: 'success', 
          details: `Saved ${totalConversations} conversation files` 
        });
      }, 500);

      // Step 5: Creating runtime
      const runtimeStepId = addWorkerStep('Creating runtime...', 'Setting up runtime configuration');
      const runtimeName = payload.runtime?.name ?? 'Imported Runtime';
      const provider = payload.preset || payload.source || 'Imported runtime';
      const email = payload.identity?.email;
      setTimeout(() => {
        updateWorkerStep(runtimeStepId, { 
          status: 'success', 
          details: `Runtime "${runtimeName}" created` 
        });
      }, 300);

      // Format success message (same as DataControlsTab)
      const summaryNotice = formatArchiveSummaryNotice(payload.archiveSummary ?? null);
      const successMessage = [
        `✅ Imported ${provider} archive${email ? ` for ${email}` : ''}.`,
        `Created runtime "${runtimeName}" with ${totalConversations} conversations and ${totalMessages} messages.`,
        summaryNotice
      ].filter(Boolean).join('\n');

      // Set success state (dashboard stays open)
      setLocalImportStatus('success');
      setLocalImportMessage(successMessage);
      setLocalImportSummary(payload.archiveSummary ?? null);
      
      console.log(`✅ [RuntimeDashboard] Import successful: ${totalConversations} conversations, ${totalMessages} messages`);

      // Notify parent component about the import
      if (onRequestImport) {
        onRequestImport();
      }

      // Dispatch event for other components to listen
      window.dispatchEvent(
        new CustomEvent('chatty:runtime-imported', {
          detail: {
            runtime: payload.runtime,
            provider,
            source: payload.source,
            identity: payload.identity,
            metadata: payload.metadata,
            archiveSummary: payload.archiveSummary ?? null,
            message: successMessage,
          },
        })
      );

      // DON'T close the dashboard - stay open to show success and let user see the new runtime
      // Keep worker notification open for a few seconds to show completion
      setTimeout(() => {
        setShowWorkerNotification(false);
      }, 3000);
    } catch (error: any) {
      console.error('[RuntimeDashboard] Import failed:', error);
      setLocalImportStatus('error');
      setLocalImportMessage(`❌ ${error?.message || 'Failed to import archive. Please verify the export ZIP and try again.'}`);
      // Re-open modal to allow retry
      setShowImportModal(true);
      // Keep worker notification open to show error
    } finally {
      setIsImporting(false);
    }
  };

  // Helper function to format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleImportClose = () => {
    setShowImportModal(false);
  };

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top,_#1b2333,_#090b11_70%)] text-white flex flex-col">
      <header className="px-8 pt-10 pb-4 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Choose Your Runtime</h1>
          <p className="text-sm text-white/70 max-w-2xl">
            Chatty can emulate each imported persona alongside the core Synth runtime.
            Select where you'd like to begin, or import a new archive to create a runtime on the fly.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleImportClick}
            disabled={isImporting}
            className="inline-flex items-center gap-2 rounded-md border border-white/20 px-4 py-2 text-sm text-white/80 hover:text-white hover:border-white/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={16} />
            {isImporting ? 'Importing...' : 'Data Import'}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-white/60 hover:text-white transition-colors text-sm"
            >
              Skip for now
            </button>
          )}
        </div>
      </header>

      {(localImportMessage || importMessage || removalMessage) && (
        <div className="px-8 pb-4 space-y-3">
          {(localImportMessage || importMessage) && (
            <div
              className={cn(
                'rounded-lg border px-4 py-3 text-sm transition-colors whitespace-pre-line',
                (localImportStatus !== 'idle' ? localImportStatus : importStatus) === 'processing' && 'border-sky-400/40 bg-sky-400/5 text-sky-100',
                (localImportStatus !== 'idle' ? localImportStatus : importStatus) === 'success' && 'border-emerald-400/40 bg-emerald-400/5 text-emerald-100',
                (localImportStatus !== 'idle' ? localImportStatus : importStatus) === 'error' && 'border-rose-400/40 bg-rose-400/5 text-rose-100',
                (localImportStatus !== 'idle' ? localImportStatus : importStatus) === 'idle' && 'border-white/10 bg-white/5 text-white/80'
              )}
            >
              {localImportMessage || importMessage}
            </div>
          )}
          {removalMessage && (
            <div
              className={cn(
                'rounded-lg border px-4 py-3 text-sm transition-colors',
                removalStatus === 'processing' && 'border-yellow-400/40 bg-yellow-400/5 text-yellow-100',
                removalStatus === 'success' && 'border-emerald-400/40 bg-emerald-400/5 text-emerald-100',
                removalStatus === 'error' && 'border-rose-400/40 bg-rose-400/5 text-rose-100',
                removalStatus === 'idle' && 'border-white/10 bg-white/5 text-white/80'
              )}
            >
              {removalMessage}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 px-8 pb-16 flex flex-col gap-8 overflow-y-auto">
        {(localImportSummary || importSummary) && (
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
            <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Latest Import Summary</h2>
                <p className="text-xs text-white/60 mt-1">
                  Review the contents detected in your uploaded archive before activating the runtime.
                </p>
              </div>
            </div>
            <div className="px-6 py-5">
              <pre className="whitespace-pre-wrap text-sm leading-6 text-white/80">
                {(localImportSummary || importSummary)?.text}
              </pre>
            </div>
          </div>
        )}

        <div
          className={cn(
            'grid gap-6',
            visibleRuntimes.length === 1 ? 'max-w-lg' : 'lg:grid-cols-2',
            'mx-auto w-full'
          )}
        >
          {visibleRuntimes.map((runtime) => {
            const awareness = runtime.awareness;
            const timeInfo =
              awareness?.time?.display ||
              awareness?.time?.localISO ||
              awareness?.time?.server;
            const mood = awareness?.mood?.baseline;
            const locationParts = awareness?.location
              ? [awareness.location.city, awareness.location.region, awareness.location.country]
                  .filter(Boolean)
                  .join(', ')
              : null;

            return (
              <div
                key={runtime.key}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('[data-control="true"]')) return; // ignore clicks from controls
                  onSelect(runtime);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelect(runtime);
                  }
                }}
                className="relative rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-6 text-left shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/60">
                    {runtime.provider || 'Chatty Runtime'}
                  </div>
                  <div className="flex items-center gap-2">
                    {runtime.runtimeId === 'synth' ? (
                      <span className="text-xs font-medium text-emerald-300/80">
                        Primary
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-sky-300/80">
                        Imported
                      </span>
                    )}
                    {runtime.runtimeId !== 'synth' && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openConfirmRemoval(runtime);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if ((e.key === 'Enter' || e.key === ' ') && onRequestRemove) {
                            openConfirmRemoval(runtime);
                          }
                        }}
                        data-control="true"
                        className={cn(
                          'rounded-full border px-2 py-1 text-[11px] font-medium transition-colors',
                          'border-white/20 text-white/70 hover:text-white hover:border-white/40'
                        )}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <h2 className="text-2xl font-semibold mb-2">{runtime.name}</h2>
                {runtime.description && (
                  <p className="text-sm text-white/70 leading-relaxed">
                    {runtime.description}
                  </p>
                )}
                <div className="mt-4 space-y-2 text-xs text-white/60">
                  {timeInfo && <div>Local time: {timeInfo}</div>}
                  {mood && <div>Ambient mood: {mood}</div>}
                  {locationParts && <div>Connected from: {locationParts}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Confirmation Modal */}
      {runtimePendingRemoval && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ zIndex: Z_LAYERS.modal }}
        >
          <div className="absolute inset-0 bg-black/70" onClick={closeConfirmRemoval} />
          <div className="relative w-full max-w-md rounded-xl border border-white/10 bg-[#0f1420] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Remove runtime?</h3>
            <p className="mt-2 text-sm text-white/70">
              You are about to remove <span className="text-white">{runtimePendingRemoval.name}</span>. This action cannot be undone.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmRemoval}
                className="rounded-md border border-white/20 px-4 py-2 text-sm text-white/80 hover:text-white hover:border-white/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoval}
                className="rounded-md bg-rose-500/20 border border-rose-400/30 px-4 py-2 text-sm text-rose-100 hover:bg-rose-500/30 hover:border-rose-400/50 transition-colors"
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result Modal */}
      {isResultModalOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ zIndex: Z_LAYERS.modal }}
        >
          <div className="absolute inset-0 bg-black/70" onClick={closeResultModal} />
          <div
            className={cn(
              'relative w-full max-w-md rounded-xl border p-6 shadow-2xl',
              removalStatus === 'processing' && 'border-yellow-400/40 bg-yellow-400/5',
              removalStatus === 'success' && 'border-emerald-400/40 bg-emerald-400/5',
              removalStatus === 'error' && 'border-rose-400/40 bg-rose-400/5',
              removalStatus === 'idle' && 'border-white/10 bg-white/5'
            )}
          >
            <h3 className="text-lg font-semibold">
              {removalStatus === 'success' && 'Runtime removed'}
              {removalStatus === 'error' && 'Removal failed'}
              {removalStatus === 'processing' && 'Removing runtime...'}
              {removalStatus === 'idle' && 'Removal'}
            </h3>
            <p className="mt-2 text-sm text-white/80">{removalMessage || (removalStatus === 'idle' ? 'Ready.' : 'Working...')}</p>
            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                onClick={closeResultModal}
                className="rounded-md border border-white/20 px-4 py-2 text-sm text-white/80 hover:text-white hover:border-white/40 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Import Modal */}
      <DataImportModal
        isOpen={showImportModal}
        onClose={handleImportClose}
        onConfirm={handleImportConfirm}
        isProcessing={isImporting}
      />

      {/* Worker Notification */}
      <WorkerNotification
        isVisible={showWorkerNotification}
        title="Importing Runtime"
        steps={workerSteps}
        onClose={() => {
          // Only allow closing if not actively processing
          if (!isImporting && localImportStatus !== 'processing') {
            setShowWorkerNotification(false);
          }
        }}
      />
    </div>
  );
};

export default RuntimeDashboard;
