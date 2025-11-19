import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Unlock, ChevronDown, X, Check, AlertCircle } from 'lucide-react';
import { Z_LAYERS } from '../lib/zLayers';

interface GPTConfig {
  name: string;
  description?: string;
  instructions?: string;
  capabilities?: any;
  conversationStarters?: string[];
}

interface ImportMetadata {
  importedFrom?: string;
  conversationId?: string;
  detectedModel?: string;
  gptConfig?: GPTConfig | null;
  isPlaceholder?: boolean;
}

interface ImportUnlockProps {
  isVisible: boolean;
  importMetadata: ImportMetadata | null;
  currentConstructId?: string;
  availableConstructs: Array<{ id: string; name: string }>;
  onConnect: (constructId: string, gptConfig?: GPTConfig | null) => Promise<void>;
  onDismiss: () => void;
}

const ImportUnlock: React.FC<ImportUnlockProps> = ({
  isVisible,
  importMetadata,
  currentConstructId,
  availableConstructs,
  onConnect,
  onDismiss,
}) => {
  const [selectedConstructId, setSelectedConstructId] = useState<string>(currentConstructId || '');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    // Check if there's a connectedConstructId in metadata (from previous connection)
    const connectedId = (importMetadata as any)?.connectedConstructId;
    if (connectedId) {
      setSelectedConstructId(connectedId);
    } else if (currentConstructId) {
      setSelectedConstructId(currentConstructId);
    } else if (importMetadata?.gptConfig?.name) {
      // Try to match by name
      const matched = availableConstructs.find(
        c => c.name.toLowerCase() === importMetadata.gptConfig!.name.toLowerCase()
      );
      if (matched) {
        setSelectedConstructId(matched.id);
      }
    }
  }, [currentConstructId, importMetadata, availableConstructs]);

  if (!isVisible || !importMetadata) return null;

  const hasFullConfig = !!(importMetadata.gptConfig?.instructions || importMetadata.gptConfig?.description);
  const connectedId = (importMetadata as any)?.connectedConstructId;
  const isLocked = !currentConstructId && !connectedId;
  const detectedConstructName = importMetadata.gptConfig?.name || importMetadata.detectedModel || 'Unknown';

  const handleConnect = async () => {
    if (!selectedConstructId) return;
    
    setIsConnecting(true);
    try {
      await onConnect(selectedConstructId, importMetadata.gptConfig || null);
      setShowConfirm(false);
    } catch (error) {
      console.error('Failed to connect conversation:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const selectedConstruct = availableConstructs.find(c => c.id === selectedConstructId);

  return createPortal(
    <>
      {/* Backdrop */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50"
          style={{ zIndex: Z_LAYERS.modal - 1 }}
          onClick={() => setShowConfirm(false)}
        />
      )}

      {/* Unlock Banner */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4 border-t"
        style={{
          zIndex: Z_LAYERS.modal,
          backgroundColor: 'var(--chatty-bg-main)',
          borderColor: 'var(--chatty-line)',
        }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-1">
              {isLocked ? (
                <Lock size={20} style={{ color: 'var(--chatty-text)' }} />
              ) : (
                <Unlock size={20} style={{ color: 'var(--chatty-accent)' }} />
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold" style={{ color: 'var(--chatty-text)' }}>
                  {isLocked ? 'Imported Conversation - Connect to Construct' : 'Connected to Construct'}
                </h3>
                <button
                  onClick={onDismiss}
                  className="p-1 rounded hover:bg-[var(--chatty-button)] transition-colors"
                  style={{ color: 'var(--chatty-text)' }}
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-sm mb-4" style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>
                {isLocked ? (
                  hasFullConfig ? (
                    <>
                      This conversation was imported from <strong>{importMetadata.importedFrom || 'ChatGPT'}</strong>. 
                      GPT configuration detected: <strong>{detectedConstructName}</strong>. 
                      Connect it to a construct to continue chatting.
                    </>
                  ) : (
                    <>
                      This conversation was imported from <strong>{importMetadata.importedFrom || 'ChatGPT'}</strong>. 
                      Detected model: <strong>{detectedConstructName}</strong>. 
                      Connect it to a construct to continue chatting.
                    </>
                  )
                ) : (
                  <>
                    Connected to: <strong>{selectedConstruct?.name || selectedConstructId}</strong>
                    {hasFullConfig && ' (with full configuration)'}
                  </>
                )}
              </p>

              {isLocked && (
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => setShowDropdown(!showDropdown)}
                      className="w-full px-4 py-2 text-left border rounded-lg flex items-center justify-between"
                      style={{
                        backgroundColor: 'var(--chatty-bg-secondary)',
                        borderColor: 'var(--chatty-line)',
                        color: 'var(--chatty-text)',
                      }}
                    >
                      <span>
                        {selectedConstruct ? selectedConstruct.name : 'Select a construct...'}
                      </span>
                      <ChevronDown size={16} className={showDropdown ? 'rotate-180' : ''} />
                    </button>

                    {showDropdown && (
                      <div
                        className="absolute z-10 w-full mt-1 border rounded-lg shadow-lg max-h-60 overflow-y-auto"
                        style={{
                          backgroundColor: 'var(--chatty-bg-secondary)',
                          borderColor: 'var(--chatty-line)',
                        }}
                      >
                        {availableConstructs.map((construct) => (
                          <button
                            key={construct.id}
                            type="button"
                            onClick={() => {
                              setSelectedConstructId(construct.id);
                              setShowDropdown(false);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-[var(--chatty-button)] transition-colors"
                            style={{ color: 'var(--chatty-text)' }}
                          >
                            {construct.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowConfirm(true)}
                    disabled={!selectedConstructId || isConnecting}
                    className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'var(--chatty-accent)',
                      color: 'white',
                    }}
                  >
                    Connect
                  </button>
                </div>
              )}

              {!isLocked && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedConstructId('');
                    setShowConfirm(true);
                  }}
                  className="px-4 py-2 rounded-lg font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--chatty-button)',
                    color: 'var(--chatty-text)',
                  }}
                >
                  Change Connection
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Popup */}
      {showConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: Z_LAYERS.modal + 1 }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-[var(--chatty-bg-main)] border rounded-lg shadow-xl p-6 max-w-md w-full"
            style={{ borderColor: 'var(--chatty-line)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle size={20} style={{ color: 'var(--chatty-accent)' }} className="mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1" style={{ color: 'var(--chatty-text)' }}>
                  {currentConstructId ? 'Change Construct Connection?' : 'Connect to Construct?'}
                </h3>
                <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>
                  {currentConstructId ? (
                    <>
                      This conversation is currently connected to <strong>{selectedConstruct?.name || currentConstructId}</strong>. 
                      Do you want to change it to <strong>{availableConstructs.find(c => c.id === selectedConstructId)?.name || selectedConstructId}</strong>?
                    </>
                  ) : (
                    <>
                      Connect this imported conversation to <strong>{selectedConstruct?.name || selectedConstructId}</strong>?
                      {hasFullConfig && ' The full GPT configuration will be applied.'}
                    </>
                  )}
                </p>
              </div>
            </div>

            {hasFullConfig && importMetadata.gptConfig && (
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--chatty-button)' }}>
                <div className="font-medium mb-1" style={{ color: 'var(--chatty-text)' }}>
                  GPT Configuration:
                </div>
                <div style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>
                  <div><strong>Name:</strong> {importMetadata.gptConfig.name}</div>
                  {importMetadata.gptConfig.description && (
                    <div><strong>Description:</strong> {importMetadata.gptConfig.description}</div>
                  )}
                  {importMetadata.gptConfig.instructions && (
                    <div className="mt-1">
                      <strong>Instructions:</strong> {importMetadata.gptConfig.instructions.substring(0, 100)}
                      {importMetadata.gptConfig.instructions.length > 100 && '...'}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--chatty-button)',
                  color: 'var(--chatty-text)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={!selectedConstructId || isConnecting}
                className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{
                  backgroundColor: 'var(--chatty-accent)',
                  color: 'white',
                }}
              >
                {isConnecting ? (
                  <>Connecting...</>
                ) : (
                  <>
                    <Check size={16} />
                    Confirm
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
};

export default ImportUnlock;

