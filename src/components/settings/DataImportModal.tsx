import React, { useRef, useState, useEffect } from 'react';
import { Z_LAYERS } from '../../lib/zLayers';

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (file: File | null) => void;
  isProcessing?: boolean;
}

const ACCEPTED_TYPES = ['application/zip', 'application/x-zip-compressed'];

const DataImportModal: React.FC<DataImportModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isProcessing = false,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const validateFile = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.zip')) {
      setError('Unsupported file type. Please select a ZIP export archive.');
      return false;
    }
    if (file.size === 0) {
      setError('The selected file is empty.');
      return false;
    }
    return true;
  };

  const handleFile = (file: File | null) => {
    if (!file) {
      return;
    }
    if (!validateFile(file)) {
      setSelectedFile(null);
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      handleFile(event.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleBrowseClick = () => {
    inputRef.current?.click();
  };

  const handleConfirm = () => {
    onConfirm(selectedFile);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"
      style={{ zIndex: Z_LAYERS.modal }}
    >
      <div
        className="w-full max-w-lg rounded-lg shadow-xl"
        style={{ backgroundColor: 'var(--chatty-bg-main)', border: `1px solid var(--chatty-line)` }}
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--chatty-text)' }}>
            Import Chatty Backup
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
  Upload the export `.zip` file you downloaded from ChatGPT, Gemini, or another provider.
          </p>

          <div
            className="rounded-lg border-2 border-dashed p-6 text-center transition-colors"
            style={{
              borderColor: error ? '#ef4444' : 'var(--chatty-line)',
              backgroundColor: 'var(--chatty-bg-main)',
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <p className="text-sm mb-2" style={{ color: 'var(--chatty-text)' }}>
            Drag &amp; drop your export archive here, or
            </p>
            <button
              type="button"
              className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-gray-50"
              style={{
                borderColor: 'var(--chatty-line)',
                color: 'var(--chatty-text)',
              }}
              onClick={handleBrowseClick}
              disabled={isProcessing}
            >
              Browse files
            </button>
            {selectedFile && (
              <div className="mt-4 text-xs" style={{ color: 'var(--chatty-text)' }}>
                <span>Selected: <strong>{selectedFile.name}</strong></span>
                <span className="block" style={{ opacity: 0.7 }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </span>
              </div>
            )}
            {error && (
              <p className="mt-4 text-xs text-red-500">
                {error}
              </p>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          />

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-gray-50"
              style={{
                borderColor: 'var(--chatty-line)',
                color: 'var(--chatty-text)',
              }}
              onClick={onClose}
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm rounded-lg border transition-colors"
              style={{
                borderColor: 'var(--chatty-line)',
                color: 'var(--chatty-text-inverse)',
                backgroundColor: selectedFile ? 'var(--chatty-button)' : 'var(--chatty-line)',
                opacity: selectedFile ? 1 : 0.6,
              }}
              onClick={handleConfirm}
              disabled={!selectedFile || isProcessing}
            >
              {isProcessing ? 'Importing…' : 'Import backup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataImportModal;
