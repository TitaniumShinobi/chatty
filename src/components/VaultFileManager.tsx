import React, { useState, useEffect, useRef } from 'react';
import { Save, FolderOpen, FileText, Plus, RefreshCw, CheckCircle, AlertCircle, Upload, Edit3, X } from 'lucide-react';

interface GPT {
  id: string;
  name: string;
  constructCallsign: string;
}

interface VaultFile {
  id: string;
  filename: string;
  file_type: string;
  construct_id: string;
  metadata: any;
  content_length: number;
}

const FOLDER_OPTIONS = [
  { value: 'identity', label: 'Identity', description: 'prompt.json, conditioning.txt, avatar' },
  { value: 'config', label: 'Config', description: 'metadata.json, personality.json' },
  { value: 'chatty', label: 'Chatty', description: 'Conversation transcripts' },
  { value: 'logs', label: 'Logs', description: 'System logs' },
  { value: 'data', label: 'Data', description: 'General data storage' },
  { value: 'assets', label: 'Assets', description: 'Images and media' },
  { value: 'memup', label: 'Memup', description: 'Capsule memory storage' },
  { value: 'documents', label: 'Documents', description: 'Raw files' },
];

export function VaultFileManager() {
  const [constructs, setConstructs] = useState<GPT[]>([]);
  const [selectedConstruct, setSelectedConstruct] = useState<string>('');
  const [selectedFolder, setSelectedFolder] = useState<string>('identity');
  const [filename, setFilename] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [showNewFile, setShowNewFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConstructs();
  }, []);

  useEffect(() => {
    if (selectedConstruct) {
      fetchFiles();
    }
  }, [selectedConstruct]);

  useEffect(() => {
    const handleVaultRefresh = () => {
      if (selectedConstruct) {
        fetchFiles();
      }
    };
    window.addEventListener('vault-files-changed', handleVaultRefresh);
    return () => window.removeEventListener('vault-files-changed', handleVaultRefresh);
  }, [selectedConstruct]);

  const fetchConstructs = async () => {
    try {
      const response = await fetch('/api/ais', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : data.ais || [];
        setConstructs(list);
        if (list.length > 0 && !selectedConstruct) {
          setSelectedConstruct(list[0].constructCallsign);
        }
      }
    } catch (error) {
      console.error('Failed to fetch constructs:', error);
    }
  };

  const fetchFiles = async () => {
    if (!selectedConstruct) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/vvault/files/list?constructCallsign=${selectedConstruct}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedConstruct || !filename.trim() || content === null) {
      setStatus({ type: 'error', message: 'Please select a construct, enter a filename, and provide content.' });
      return;
    }

    setIsSaving(true);
    setStatus(null);

    try {
      const response = await fetch('/api/vvault/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          constructCallsign: selectedConstruct,
          folder: selectedFolder,
          filename: filename.trim(),
          content,
          fileType: guessFileType(filename.trim()),
        })
      });

      const data = await response.json();

      if (data.ok) {
        setStatus({
          type: 'success',
          message: `File ${data.action}: ${data.path}`
        });
        setShowNewFile(false);
        setEditingFile(null);
        fetchFiles();
      } else {
        setStatus({ type: 'error', message: data.error || 'Save failed' });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message || 'Save failed' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setContent(text);
      if (!filename) {
        setFilename(file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleOpenFile = async (file: VaultFile) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/vvault/files/read?path=${encodeURIComponent(file.filename)}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.file) {
          const parts = file.filename.split('/');
          const fname = parts[parts.length - 1];
          const folder = parts.length >= 4 ? parts[2] : '';

          setFilename(fname);
          setContent(data.file.content || '');
          setSelectedFolder(folder);
          setEditingFile(file.filename);
          setShowNewFile(false);
        }
      }
    } catch (error) {
      console.error('Failed to read file:', error);
      setStatus({ type: 'error', message: 'Failed to read file' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewFile = () => {
    setFilename('');
    setContent('');
    setSelectedFolder('identity');
    setEditingFile(null);
    setShowNewFile(true);
  };

  const handleCancel = () => {
    setShowNewFile(false);
    setEditingFile(null);
    setFilename('');
    setContent('');
    setStatus(null);
  };

  const guessFileType = (name: string): string => {
    if (name.endsWith('.json')) return 'config';
    if (name.endsWith('.md')) return 'conversation';
    if (name.endsWith('.log')) return 'log';
    if (name.endsWith('.txt')) return 'identity';
    return 'text';
  };

  const getDisplayName = (filepath: string): string => {
    const parts = filepath.split('/');
    return parts[parts.length - 1];
  };

  const getFolderFromPath = (filepath: string): string => {
    const parts = filepath.split('/');
    if (parts.length >= 4) return parts[2];
    if (parts.length >= 2) return parts[parts.length - 2];
    const name = parts[parts.length - 1].toLowerCase();
    if (name.endsWith('.log')) return 'logs';
    if (name === 'prompt.json' || name === 'conditioning.txt' || name.startsWith('avatar')) return 'identity';
    if (name === 'metadata.json' || name === 'personality.json') return 'config';
    if (name.startsWith('chat_with_')) return 'chatty';
    if (name.endsWith('.capsule')) return 'memup';
    return '';
  };

  const groupedFiles = files.reduce<Record<string, VaultFile[]>>((acc, file) => {
    const folder = getFolderFromPath(file.filename) || 'root';
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(file);
    return acc;
  }, {});

  const isEditing = showNewFile || editingFile;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--chatty-text)' }}>
          <FolderOpen size={20} />
          Vault File Manager
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFiles}
            disabled={!selectedConstruct || isLoading}
            className="p-2 rounded-md transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}
            title="Refresh files"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleNewFile}
            disabled={!selectedConstruct}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}
          >
            <Plus size={16} />
            New File
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
          Select Construct
        </label>
        <select
          value={selectedConstruct}
          onChange={(e) => setSelectedConstruct(e.target.value)}
          className="w-full px-3 py-2 rounded-md text-sm border border-[var(--chatty-line)]"
          style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)' }}
        >
          <option value="">-- Select --</option>
          {constructs.map(c => (
            <option key={c.id} value={c.constructCallsign}>
              {c.name} ({c.constructCallsign})
            </option>
          ))}
        </select>
      </div>

      {status && (
        <div className={`flex items-center gap-2 p-3 rounded-md mb-4 text-sm ${
          status.type === 'success' ? 'border border-green-500/50' :
          status.type === 'error' ? 'border border-red-500/50' :
          'border border-blue-500/50'
        }`} style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          {status.type === 'success' ? <CheckCircle size={16} className="text-green-500 flex-shrink-0" /> :
           status.type === 'error' ? <AlertCircle size={16} className="text-red-500 flex-shrink-0" /> :
           <AlertCircle size={16} className="text-blue-500 flex-shrink-0" />}
          <span style={{ color: 'var(--chatty-text)' }}>{status.message}</span>
        </div>
      )}

      {isEditing && (
        <div className="border border-[var(--chatty-line)] rounded-lg p-4 mb-4" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--chatty-text)' }}>
              {editingFile ? `Editing: ${getDisplayName(editingFile)}` : 'New File'}
            </h4>
            <button onClick={handleCancel} className="p-1 rounded hover:opacity-70" style={{ color: 'var(--chatty-text)' }}>
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Folder
              </label>
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                disabled={!!editingFile}
                className="w-full px-3 py-2 rounded-md text-sm border border-[var(--chatty-line)]"
                style={{ backgroundColor: 'var(--chatty-bg-sidebar)', color: 'var(--chatty-text)' }}
              >
                {FOLDER_OPTIONS.map(f => (
                  <option key={f.value} value={f.value}>{f.label} — {f.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Filename
              </label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                disabled={!!editingFile}
                placeholder="e.g. prompt.json"
                className="w-full px-3 py-2 rounded-md text-sm border border-[var(--chatty-line)]"
                style={{ backgroundColor: 'var(--chatty-bg-sidebar)', color: 'var(--chatty-text)' }}
              />
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Content
              </label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:opacity-80"
                style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}
              >
                <Upload size={12} />
                Upload from file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.json,.md,.log,.csv,.xml,.yaml,.yml"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 rounded-md text-sm border border-[var(--chatty-line)] font-mono resize-y"
              style={{ backgroundColor: 'var(--chatty-bg-sidebar)', color: 'var(--chatty-text)' }}
              placeholder="File content..."
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
              Path: instances/{selectedConstruct}/{selectedFolder}/{filename || '...'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-2 rounded-md text-sm transition-colors hover:opacity-80"
                style={{ color: 'var(--chatty-text)', opacity: 0.7 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !filename.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}
              >
                {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {isSaving ? 'Saving...' : editingFile ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedConstruct && !isEditing && (
        <div className="border border-[var(--chatty-line)] rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
              <span className="ml-2 text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>Loading files...</span>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8">
              <FileText size={24} className="mx-auto mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.3 }} />
              <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>No files found for {selectedConstruct}</p>
            </div>
          ) : (
            <div>
              {Object.entries(groupedFiles).sort(([a], [b]) => a.localeCompare(b)).map(([folder, folderFiles]) => (
                <div key={folder}>
                  <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b border-[var(--chatty-line)]"
                       style={{ backgroundColor: 'var(--chatty-bg-sidebar)', color: 'var(--chatty-text)', opacity: 0.6 }}>
                    <FolderOpen size={12} className="inline mr-1.5" style={{ opacity: 1 }} />
                    {folder}
                  </div>
                  {folderFiles.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--chatty-line)] hover:bg-[var(--chatty-highlight)] cursor-pointer transition-colors"
                      onClick={() => handleOpenFile(file)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={14} style={{ color: 'var(--chatty-text)', opacity: 0.5, flexShrink: 0 }} />
                        <span className="text-sm truncate" style={{ color: 'var(--chatty-text)' }}>
                          {getDisplayName(file.filename)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.4 }}>
                          {file.updated_at ? new Date(file.updated_at).toLocaleDateString() : ''}
                        </span>
                        <Edit3 size={14} style={{ color: 'var(--chatty-text)', opacity: 0.4 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
