import React from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Z_LAYERS, getZIndex } from '../../lib/zLayers';

interface DataExportConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isExporting?: boolean;
  exportStatus?: 'idle' | 'processing' | 'success' | 'error';
  exportMessage?: string;
  userEmail?: string | null;
}

const DataExportConfirmationModal: React.FC<DataExportConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isExporting = false,
  exportStatus = 'idle',
  exportMessage = '',
  userEmail = null,
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      style={{ 
        zIndex: getZIndex('modal', 5),
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      <div 
        className="p-6 rounded-lg shadow-lg max-w-sm w-full mx-4"
        style={{ 
          backgroundColor: 'var(--chatty-bg-main)',
          zIndex: getZIndex('modal', 6)
        }}
      >
        {exportStatus === 'idle' && (
          <>
            <h3 
              className="text-lg font-bold mb-4"
              style={{ color: 'var(--chatty-text)' }}
            >
              Request data export - are you sure?
            </h3>
            <ul 
              className="list-disc list-inside text-sm mb-6 space-y-2"
              style={{ color: 'var(--chatty-text)', opacity: 0.8 }}
            >
              <li>Your account details and chats will be included in the export.</li>
              <li>The data will be sent to your registered email in a downloadable file.</li>
              <li>The download link will expire 24 hours after you receive it.</li>
              <li>Processing may take some time. You'll be notified when it's ready.</li>
            </ul>
            <p 
              className="text-sm mb-6"
              style={{ color: 'var(--chatty-text)', opacity: 0.8 }}
            >
              To proceed, click "Confirm export" below.
            </p>
          </>
        )}

        {(exportStatus === 'processing' || exportStatus === 'success' || exportStatus === 'error') && (
          <>
            <div className="flex items-center justify-center mb-4">
              {exportStatus === 'processing' && (
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--chatty-text)' }} />
              )}
              {exportStatus === 'success' && (
                <CheckCircle className="w-8 h-8" style={{ color: '#10B981' }} />
              )}
              {exportStatus === 'error' && (
                <XCircle className="w-8 h-8" style={{ color: '#EF4444' }} />
              )}
            </div>
            <h3 
              className="text-lg font-bold mb-4 text-center"
              style={{ color: 'var(--chatty-text)' }}
            >
              {exportStatus === 'processing' && 'Processing Export...'}
              {exportStatus === 'success' && 'Export Successful!'}
              {exportStatus === 'error' && 'Export Failed'}
            </h3>
            
            {/* Dynamic progress indicator for processing */}
            {exportStatus === 'processing' && (
              <div className="mb-4">
                <div className="flex items-center justify-center mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                </div>
                <p className="text-xs text-center" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                  This may take a few moments...
                </p>
              </div>
            )}
            
            <p 
              className="text-sm mb-6 text-center"
              style={{ color: 'var(--chatty-text)', opacity: 0.8 }}
            >
              {exportStatus === 'success' && userEmail ? (
                <>
                  ✅ Export email sent to <strong style={{ color: '#10B981' }}>{userEmail}</strong>. Check your inbox for the verification link.
                </>
              ) : (
                <span style={{ 
                  color: exportStatus === 'error' ? '#EF4444' : 'var(--chatty-text)',
                  fontWeight: exportStatus === 'error' ? '500' : 'normal'
                }}>
                  {exportMessage}
                </span>
              )}
            </p>
            
            {/* Success details */}
            {exportStatus === 'success' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <div className="flex items-start">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div className="text-xs" style={{ color: '#059669' }}>
                    <p className="font-medium mb-1">What happens next:</p>
                    <ul className="space-y-1">
                      <li>• Check your email for the verification link</li>
                      <li>• Click the link to complete 2FA verification</li>
                      <li>• Download your data export securely</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            
            {/* Error details */}
            {exportStatus === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-start">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div className="text-xs" style={{ color: '#DC2626' }}>
                    <p className="font-medium mb-1">Troubleshooting:</p>
                    <ul className="space-y-1">
                      <li>• Check your internet connection</li>
                      <li>• Try again in a few moments</li>
                      <li>• Contact support if the issue persists</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div className="flex justify-end space-x-3">
          {exportStatus === 'idle' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-md border transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'var(--chatty-bg-main)',
                  borderColor: 'var(--chatty-line)',
                  color: 'var(--chatty-text)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 rounded-md transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'var(--chatty-text)',
                  color: 'var(--chatty-bg-main)'
                }}
              >
                Confirm export
              </button>
            </>
          )}
          
          {(exportStatus === 'processing' || exportStatus === 'success' || exportStatus === 'error') && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md transition-colors hover:opacity-80"
              style={{
                backgroundColor: exportStatus === 'success' ? '#10B981' : exportStatus === 'error' ? '#EF4444' : 'var(--chatty-text)',
                color: 'white'
              }}
            >
              {exportStatus === 'processing' && 'Processing...'}
              {exportStatus === 'success' && 'Close'}
              {exportStatus === 'error' && 'Try Again'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataExportConfirmationModal;
