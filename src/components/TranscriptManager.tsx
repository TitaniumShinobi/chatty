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
  id?: string;
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

function parseCharacterAIJson(jsonString: string, filename: string): TranscriptFile[] | null {
  try {
    const data = JSON.parse(jsonString);

    if (data.histories && Array.isArray(data.histories)) {
      const results: TranscriptFile[] = [];
      for (const history of data.histories) {
        const msgs = history.msgs || history.messages || [];
        if (msgs.length === 0) continue;
        const md = convertCAIMessagesToMarkdown(msgs, data.character_name || data.name || 'Character');
        const firstTs = getMessageTimestamp(msgs[0]);
        const dateInfo = extractDateFromTimestamp(firstTs);
        results.push({
          id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: filename.replace(/\.json$/i, '') + `_chat_${results.length + 1}.md`,
          content: md,
          source: 'character_ai',
          year: dateInfo.year,
          month: dateInfo.month,
        });
      }
      return results.length > 0 ? results : null;
    }

    if (data.messages && Array.isArray(data.messages)) {
      const md = convertCAIMessagesToMarkdown(data.messages, data.character_name || data.name || 'Character');
      const firstTs = getMessageTimestamp(data.messages[0]);
      const dateInfo = extractDateFromTimestamp(firstTs);
      return [{
        id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: filename.replace(/\.json$/i, '.md'),
        content: md,
        source: 'character_ai',
        year: dateInfo.year,
        month: dateInfo.month,
      }];
    }

    if (data.chat && Array.isArray(data.chat)) {
      const md = convertCAIMessagesToMarkdown(data.chat, data.character_name || data.name || 'Character');
      const firstTs = getMessageTimestamp(data.chat[0]);
      const dateInfo = extractDateFromTimestamp(firstTs);
      return [{
        id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: filename.replace(/\.json$/i, '.md'),
        content: md,
        source: 'character_ai',
        year: dateInfo.year,
        month: dateInfo.month,
      }];
    }

    return null;
  } catch {
    return null;
  }
}

function parseCharacterAIText(text: string, filename: string): TranscriptFile[] | null {
  const lines = text.split('\n');

  const caiCount = lines.filter(l => l.trim() === 'c.ai').length;
  if (caiCount < 2) return null;

  let characterName = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'c.ai' && i >= 2) {
      const a = lines[i - 2].trim();
      const b = lines[i - 1].trim();
      if (a && a === b) {
        characterName = a;
        break;
      }
    }
  }
  if (!characterName) return null;

  let userName = '';
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i].trim();
    const b = lines[i + 1].trim();
    if (a && a === b && a !== characterName) {
      const after = (i + 2 < lines.length) ? lines[i + 2].trim() : '';
      if (after !== 'c.ai') {
        userName = a;
        break;
      }
    }
  }
  if (!userName) return null;

  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last || /^character\.ai\s*\|/i.test(last) || /^Message\s+\w/i.test(last)) {
      lines.pop();
    } else {
      break;
    }
  }

  const isUIArtifact = (line: string): boolean => {
    const t = line.trim();
    if (/^\d+\s*\/\s*\d+$/.test(t)) return true;
    if (/^Tell us more$/i.test(t)) return true;
    return false;
  };

  const isCharMarker = (idx: number): boolean => {
    return idx + 2 < lines.length &&
      lines[idx].trim() === characterName &&
      lines[idx + 1].trim() === characterName &&
      lines[idx + 2].trim() === 'c.ai';
  };

  const isUserMarker = (idx: number): boolean => {
    if (idx + 1 >= lines.length) return false;
    if (lines[idx].trim() !== userName || lines[idx + 1].trim() !== userName) return false;
    const after = (idx + 2 < lines.length) ? lines[idx + 2].trim() : '';
    return after !== 'c.ai';
  };

  let i = 0;
  while (i < lines.length) {
    if (isCharMarker(i) || isUserMarker(i)) break;
    i++;
  }

  const messages: Array<{ role: string; name: string; content: string }> = [];

  while (i < lines.length) {
    if (isCharMarker(i)) {
      i += 3;
      while (i < lines.length && isUIArtifact(lines[i])) i++;
      const contentLines: string[] = [];
      while (i < lines.length && !isCharMarker(i) && !isUserMarker(i)) {
        contentLines.push(lines[i]);
        i++;
      }
      const content = contentLines.join('\n').trim();
      if (content) {
        messages.push({ role: 'character', name: characterName, content });
      }
    } else if (isUserMarker(i)) {
      i += 2;
      const contentLines: string[] = [];
      while (i < lines.length && !isCharMarker(i) && !isUserMarker(i)) {
        contentLines.push(lines[i]);
        i++;
      }
      const content = contentLines.join('\n').trim();
      if (content) {
        messages.push({ role: 'user', name: userName, content });
      }
    } else {
      i++;
    }
  }

  if (messages.length === 0) return null;

  messages.reverse();

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const displayChar = capitalize(characterName);
  const mdLines: string[] = [`# Character.AI Transcript — ${displayChar}\n`];
  for (const msg of messages) {
    const displayName = msg.role === 'user' ? 'User' : displayChar;
    mdLines.push(`**${displayName}**:\n${msg.content}\n`);
  }

  return [{
    id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: filename.replace(/\.txt$/i, '.md'),
    content: mdLines.join('\n'),
    source: 'character_ai',
    year: '',
    month: '',
  }];
}

function normalizeTimestamp(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts === 'number') {
    const d = ts < 1e12 ? new Date(ts * 1000) : new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function getMessageTimestamp(msg: any): any {
  return msg.created_at || msg.create_time || msg.timestamp || msg.date || msg.sent_at || null;
}

function convertCAIMessagesToMarkdown(messages: any[], characterName: string): string {
  const lines: string[] = [`# Character.AI Transcript — ${characterName}\n`];

  for (const msg of messages) {
    const role = msg.author?.name || msg.src?.name || msg.name || (msg.is_human || msg.role === 'user' ? 'User' : characterName);
    const text = msg.text || msg.content || msg.message || '';
    const ts = getMessageTimestamp(msg);
    const d = normalizeTimestamp(ts);
    const tsLabel = d ? ` _(${d.toLocaleString()})_` : '';
    lines.push(`**${role}**${tsLabel}:\n${text}\n`);
  }

  return lines.join('\n');
}

function extractDateFromTimestamp(ts: any): { year: string; month: string } {
  const d = normalizeTimestamp(ts);
  if (!d) return { year: '', month: '' };
  return {
    year: String(d.getFullYear()),
    month: ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()],
  };
}

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
      const response = await fetch('/api/ais', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const gptList = Array.isArray(data) ? data : (data.ais || data.gpts || []);
        setGpts(gptList);
        if (gptList.length > 0) {
          setSelectedGpt(gptList[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load constructs:', err);
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
          if (!['md', 'txt', 'rtf', 'json'].includes(ext || '')) continue;
          
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

          if (ext === 'json') {
            const parsed = parseCharacterAIJson(content, filename);
            if (parsed) {
              newFiles.push(...parsed.map(p => ({
                ...p,
                source: source === 'transcripts' ? 'character_ai' : source,
                year: year || p.year,
                month: month || p.month,
              })));
              continue;
            }
          }

          if (ext === 'txt') {
            const caiParsed = parseCharacterAIText(content, filename);
            if (caiParsed) {
              newFiles.push(...caiParsed.map(p => ({
                ...p,
                source: source === 'transcripts' ? 'character_ai' : source,
                year: year || p.year,
                month: month || p.month,
              })));
              continue;
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
      } else if (file.name.match(/\.json$/i)) {
        const content = await file.text();
        const parsed = parseCharacterAIJson(content, file.name);
        if (parsed) {
          newFiles.push(...parsed.map(p => ({
            ...p,
            source: transcriptSource || 'character_ai',
            year: transcriptYear || p.year,
            month: transcriptMonth || p.month,
          })));
        } else {
          newFiles.push({
            id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            content,
            source: transcriptSource || 'transcripts',
            year: transcriptYear,
            month: transcriptMonth
          });
        }
      } else if (file.name.match(/\.(md|txt|rtf)$/i)) {
        const content = await file.text();
        const caiParsed = parseCharacterAIText(content, file.name);
        if (caiParsed) {
          newFiles.push(...caiParsed.map(p => ({
            ...p,
            source: transcriptSource || 'character_ai',
            year: transcriptYear || p.year,
            month: transcriptMonth || p.month,
          })));
        } else {
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
      const transcriptsPayload = stagedFiles.map(file => ({
        name: file.name,
        content: file.content,
        source: file.source || transcriptSource || 'transcripts',
        year: file.year || transcriptYear || '',
        month: file.month || transcriptMonth || ''
      }));

      const response = await fetch('/api/transcripts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          constructCallsign: selectedGpt.constructCallsign,
          transcripts: transcriptsPayload
        })
      });

      if (response.ok) {
        const result = await response.json();
        const savedCount = result.saved?.length || transcriptsPayload.length;
        setStagedFiles([]);
        setSuccess(`Uploaded ${savedCount} transcript(s) successfully`);
        loadTranscripts(selectedGpt.constructCallsign);
        window.dispatchEvent(new Event('vault-files-changed'));
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || `Upload failed (${response.status})`);
      }
      
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error('Failed to upload transcripts:', err);
      setError('Failed to upload transcripts');
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

  const handleMoveFile = async (file: TranscriptFileForTree, year: string | null, month: string | null) => {
    if (!selectedGpt || !file.id) return;

    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/transcripts/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileId: file.id,
          year,
          month,
        })
      });

      if (response.ok) {
        setSuccess(`Moved "${file.name}" to ${year || 'Unsorted'}${month ? '/' + month : ''}`);
        loadTranscripts(selectedGpt.constructCallsign);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Move failed');
      }
    } catch (err: any) {
      console.error('Failed to move transcript:', err);
      setError(err.message || 'Failed to move transcript');
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

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.rtf,.zip,.json"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-lg transition-colors"
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
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: '#16a34a',
                  color: 'white',
                  border: '2px solid #15803d'
                }}
              >
                {isUploading ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                Upload {stagedFiles.length} File{stagedFiles.length !== 1 ? 's' : ''} to Vault
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
                id: t.id,
                name: t.filename,
                filename: t.filename,
                source: t.source,
                year: t.year || null,
                month: t.month || null,
                startDate: t.startDate || null,
                dateConfidence: t.dateConfidence
              }))}
              onFileClick={(file) => console.log('Selected:', file)}
              onMoveFile={handleMoveFile}
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
