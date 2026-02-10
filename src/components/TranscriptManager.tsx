import React, { useState, useEffect, useRef } from 'react';
import { Upload, FolderTree, RefreshCw, FileText, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import { TranscriptFolderTree } from './TranscriptFolderTree';
import JSZip from 'jszip';

interface Transcript {
  id: string;
  filename: string;
  source: string;
  year?: string;
  month?: string;
  content?: string;
  metadata?: any;
  startDate?: string;
  dateConfidence?: number;
}

interface TranscriptFileForTree {
  name: string;
  type?: string;
  source?: string;
  year?: string | null;
  month?: string | null;
  startDate?: string | null;
  dateConfidence?: number;
  uploadedAt?: string;
  filename?: string;
}

interface TranscriptFile {
  id: string;
  name: string;
  content: string;
  source: string;
  year?: string;
  month?: string;
}

interface GPT {
  id: string;
  name: string;
  constructCallsign: string;
  avatar?: string;
}

const TRANSCRIPT_SOURCES = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'grok', label: 'Grok' },
  { value: 'copilot', label: 'Copilot' },
  { value: 'claude', label: 'Claude' },
  { value: 'chai', label: 'Chai' },
  { value: 'character_ai', label: 'Character.AI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'other', label: 'Other' }
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function TranscriptManager() {
  const [gpts, setGpts] = useState<GPT[]>([]);
  const [selectedGpt, setSelectedGpt] = useState<GPT | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [stagedFiles, setStagedFiles] = useState<TranscriptFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAutoOrganizing, setIsAutoOrganizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [transcriptSource, setTranscriptSource] = useState('');
  const [transcriptYear, setTranscriptYear] = useState('');
  const [transcriptMonth, setTranscriptMonth] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadGpts();
  }, []);

  useEffect(() => {
    if (selectedGpt) {
      loadTranscripts(selectedGpt.constructCallsign);
    }
  }, [selectedGpt]);

  const loadGpts = async () => {
    try {
      const response = await fetch('/api/gpts', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        // API returns { success: true, gpts: [...] } or just array
        const gptList = Array.isArray(data) ? data : (data.gpts || []);
        setGpts(gptList);
        if (gptList.length > 0) {
          setSelectedGpt(gptList[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load GPTs:', err);
    }
  };

  const loadTranscripts = async (constructCallsign: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/transcripts/list/${encodeURIComponent(constructCallsign)}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setTranscripts(data.transcripts || []);
      }
    } catch (err) {
      console.error('Failed to load transcripts:', err);
      setError('Failed to load transcripts');
    } finally {
      setIsLoading(false);
    }
  };

  const getUploadPath = () => {
    const parts: string[] = [];
    if (transcriptSource) parts.push(transcriptSource);
    if (transcriptYear) parts.push(transcriptYear);
    if (transcriptMonth) parts.push(transcriptMonth);
    if (parts.length === 0) parts.push('transcripts');
    return parts.join('/');
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newFiles: TranscriptFile[] = [];

    for (const file of Array.from(files)) {
      if (file.name.endsWith('.zip')) {
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);
        
        for (const [path, zipEntry] of Object.entries(contents.files)) {
          if (zipEntry.dir) continue;
          const ext = path.split('.').pop()?.toLowerCase();
          if (!['md', 'txt', 'rtf'].includes(ext || '')) continue;
          
          const content = await zipEntry.async('string');
          const pathParts = path.split('/').filter(p => p);
          const filename = pathParts.pop() || 'unknown';
          
          let source = transcriptSource || 'transcripts';
          let year = transcriptYear;
          let month = transcriptMonth;
          
          for (const part of pathParts) {
            if (/^\d{4}$/.test(part)) year = part;
            else if (MONTHS.some(m => m.toLowerCase() === part.toLowerCase())) {
              month = MONTHS.find(m => m.toLowerCase() === part.toLowerCase()) || part;
            }
            else if (TRANSCRIPT_SOURCES.some(s => s.value === part.toLowerCase())) {
              source = part.toLowerCase();
            }
          }
          
          newFiles.push({
            id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: filename,
            content,
            source,
            year,
            month
          });
        }
      } else if (file.name.match(/\.(md|txt|rtf)$/i)) {
        const content = await file.text();
        newFiles.push({
          id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          content,
          source: transcriptSource || 'transcripts',
          year: transcriptYear,
          month: transcriptMonth
        });
      }
    }

    setStagedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadStagedFiles = async () => {
    if (!selectedGpt || stagedFiles.length === 0) return;

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      let successCount = 0;
      for (const file of stagedFiles) {
        const response = await fetch('/api/transcripts/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            constructId: selectedGpt.constructCallsign,
            filename: file.name,
            content: file.content,
            source: file.source,
            year: file.year,
            month: file.month
          })
        });
        if (response.ok) successCount++;
      }
      
      setStagedFiles([]);
      setSuccess(`Uploaded ${successCount} transcript(s) successfully`);
      loadTranscripts(selectedGpt.constructCallsign);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to upload transcripts:', err);
      setError('Failed to upload some transcripts');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAutoOrganize = async () => {
    if (!selectedGpt) return;

    setIsAutoOrganizing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/transcripts/auto-organize/${encodeURIComponent(selectedGpt.constructCallsign)}`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setSuccess(`Auto-organized ${data.organized || 0} transcript(s)`);
        loadTranscripts(selectedGpt.constructCallsign);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error('Auto-organize failed');
      }
    } catch (err) {
      console.error('Auto-organize failed:', err);
      setError('Failed to auto-organize transcripts');
    } finally {
      setIsAutoOrganizing(false);
    }
  };

  const totalFiles = stagedFiles.length + transcripts.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <FolderTree size={24} style={{ color: 'var(--chatty-accent)' }} />
        <h2 className="text-xl font-semibold" style={{ color: 'var(--chatty-text)' }}>
          Transcript Memory Manager
        </h2>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/20 border border-red-500/50">
          <AlertCircle size={16} className="text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/20 border border-green-500/50">
          <CheckCircle size={16} className="text-green-400" />
          <span className="text-sm text-green-400">{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>
              Select Construct
            </label>
            <select
              value={selectedGpt?.id || ''}
              onChange={(e) => setSelectedGpt(gpts.find(g => g.id === e.target.value) || null)}
              className="w-full p-3 rounded-lg border"
              style={{
                backgroundColor: 'var(--chatty-bg-sidebar)',
                borderColor: 'var(--chatty-line)',
                color: 'var(--chatty-text)'
              }}
            >
              {gpts.map(gpt => (
                <option key={gpt.id} value={gpt.id}>{gpt.name} ({gpt.constructCallsign})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>Source</label>
              <select
                value={transcriptSource}
                onChange={(e) => setTranscriptSource(e.target.value)}
                className="w-full p-2 rounded text-sm"
                style={{
                  backgroundColor: 'var(--chatty-bg-sidebar)',
                  borderColor: 'var(--chatty-line)',
                  color: 'var(--chatty-text)'
                }}
              >
                <option value="">Any</option>
                {TRANSCRIPT_SOURCES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>Year</label>
              <select
                value={transcriptYear}
                onChange={(e) => setTranscriptYear(e.target.value)}
                className="w-full p-2 rounded text-sm"
                style={{
                  backgroundColor: 'var(--chatty-bg-sidebar)',
                  borderColor: 'var(--chatty-line)',
                  color: 'var(--chatty-text)'
                }}
              >
                <option value="">Any</option>
                {[2026, 2025, 2024, 2023].map(y => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>Month</label>
              <select
                value={transcriptMonth}
                onChange={(e) => setTranscriptMonth(e.target.value)}
                className="w-full p-2 rounded text-sm"
                style={{
                  backgroundColor: 'var(--chatty-bg-sidebar)',
                  borderColor: 'var(--chatty-line)',
                  color: 'var(--chatty-text)'
                }}
              >
                <option value="">Any</option>
                {MONTHS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs p-2 rounded" style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', opacity: 0.7 }}>
            Upload path: <code className="font-mono">{selectedGpt?.constructCallsign}/{getUploadPath()}/</code>
          </div>

          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.rtf,.zip"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--chatty-button)',
                color: 'var(--chatty-text)'
              }}
            >
              <Upload size={18} />
              Select Files
              {totalFiles > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--chatty-accent)', color: 'white' }}>
                  {totalFiles}
                </span>
              )}
            </button>
            
            {stagedFiles.length > 0 && (
              <button
                onClick={uploadStagedFiles}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-3 rounded-lg transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--chatty-accent)',
                  color: 'white'
                }}
              >
                {isUploading ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                Upload {stagedFiles.length}
              </button>
            )}
          </div>

          {stagedFiles.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {stagedFiles.map(file => (
                <div key={file.id} className="flex items-center justify-between p-2 rounded"
                  style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
                  <div className="flex items-center gap-2">
                    <FileText size={14} style={{ color: 'var(--chatty-accent)' }} />
                    <span className="text-sm truncate" style={{ color: 'var(--chatty-text)' }}>{file.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--chatty-bg-sidebar)', color: 'var(--chatty-text)', opacity: 0.7 }}>
                      {file.source}
                    </span>
                  </div>
                  <button onClick={() => removeStagedFile(file.id)} className="p-1 hover:bg-red-500/20 rounded">
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleAutoOrganize}
            disabled={isAutoOrganizing || !selectedGpt || transcripts.length === 0}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-lg transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'var(--chatty-bg-sidebar)',
              borderColor: 'var(--chatty-line)',
              color: 'var(--chatty-text)'
            }}
          >
            {isAutoOrganizing ? <RefreshCw size={18} className="animate-spin" /> : <FolderTree size={18} />}
            Auto-Organize by Date
          </button>
        </div>

        <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--chatty-bg-sidebar)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--chatty-accent)' }} />
            </div>
          ) : selectedGpt ? (
            <TranscriptFolderTree
              transcripts={transcripts.map((t): TranscriptFileForTree => ({
                name: t.filename,
                filename: t.filename,
                source: t.source,
                year: t.year || null,
                month: t.month || null,
                startDate: t.startDate || null,
                dateConfidence: t.dateConfidence
              }))}
              onFileClick={(file) => console.log('Selected:', file)}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-center" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
              <p>Select a construct to view transcripts</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
