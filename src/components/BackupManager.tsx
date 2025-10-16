// src/components/BackupManager.tsx
import React, { useState, useRef } from 'react';
import { Download, Upload, Trash2, FileText, AlertCircle } from 'lucide-react';
import type { User } from '../lib/auth';
import { 
  createUserBackup, 
  createConversationBackup, 
  downloadBackup, 
  uploadAndRestoreBackup, 
  getUserBackups, 
  cleanupOldBackups,
  downloadAllLocalStorage 
} from '../lib/backupSystem';

interface BackupManagerProps {
  user: User;
  onBackupRestored?: () => void;
}

export default function BackupManager({ user, onBackupRestored }: BackupManagerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadFullBackup = () => {
    const backup = createUserBackup(user);
    downloadBackup(backup);
  };

  const handleDownloadConversationsOnly = () => {
    const backup = createConversationBackup(user);
    downloadBackup(backup);
  };

  const handleDownloadDebugData = () => {
    downloadAllLocalStorage();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const success = await uploadAndRestoreBackup(file, user);
      if (success) {
        setUploadSuccess(true);
        onBackupRestored?.();
        // Clean up old backups after successful restore
        cleanupOldBackups(user);
      } else {
        setUploadError('Failed to restore backup. Please check the file format.');
      }
    } catch (error) {
      setUploadError('An error occurred while restoring the backup.');
      console.error('Backup restore error:', error);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const backups = getUserBackups(user);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4" style={{ color: '#4c3d1e' }}>
          Backup & Restore
        </h3>
        <p className="text-sm opacity-75 mb-6" style={{ color: '#4c3d1e' }}>
          Create backups of your conversations and settings, or restore from a previous backup.
        </p>
      </div>

      {/* Download Backups */}
      <div className="space-y-4">
        <h4 className="font-medium" style={{ color: '#4c3d1e' }}>Download Backups</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={handleDownloadFullBackup}
            className="flex items-center gap-3 p-4 rounded-lg border transition-colors"
            style={{ 
              borderColor: '#E1C28B',
              backgroundColor: '#ffffd7',
              color: '#4c3d1e'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffd7'}
          >
            <Download size={20} />
            <div className="text-left">
              <div className="font-medium">Full Backup</div>
              <div className="text-sm opacity-75">Conversations + Settings</div>
            </div>
          </button>

          <button
            onClick={handleDownloadConversationsOnly}
            className="flex items-center gap-3 p-4 rounded-lg border transition-colors"
            style={{ 
              borderColor: '#E1C28B',
              backgroundColor: '#ffffd7',
              color: '#4c3d1e'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffd7'}
          >
            <FileText size={20} />
            <div className="text-left">
              <div className="font-medium">Conversations Only</div>
              <div className="text-sm opacity-75">Just your chat history</div>
            </div>
          </button>
        </div>

        <button
          onClick={handleDownloadDebugData}
          className="flex items-center gap-3 p-3 rounded-lg border transition-colors text-sm"
          style={{ 
            borderColor: '#E1C28B',
            backgroundColor: 'transparent',
            color: '#4c3d1e'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <AlertCircle size={16} />
          Download Debug Data (All localStorage)
        </button>
      </div>

      {/* Upload & Restore */}
      <div className="space-y-4">
        <h4 className="font-medium" style={{ color: '#4c3d1e' }}>Restore Backup</h4>
        
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="hidden"
          />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-3 p-4 rounded-lg border transition-colors disabled:opacity-50"
            style={{ 
              borderColor: '#E1C28B',
              backgroundColor: '#ffffd7',
              color: '#4c3d1e'
            }}
            onMouseEnter={(e) => !isUploading && (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => !isUploading && (e.currentTarget.style.backgroundColor = '#ffffd7')}
          >
            <Upload size={20} />
            <div className="text-left">
              <div className="font-medium">
                {isUploading ? 'Uploading...' : 'Upload Backup File'}
              </div>
              <div className="text-sm opacity-75">
                {isUploading ? 'Please wait...' : 'Select a .json backup file'}
              </div>
            </div>
          </button>

          {uploadError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
              {uploadError}
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm">
              ✅ Backup restored successfully! Please refresh the page to see your conversations.
            </div>
          )}
        </div>
      </div>

      {/* Local Backups */}
      {backups.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium" style={{ color: '#4c3d1e' }}>
            Local Backups ({backups.length})
          </h4>
          
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {backups.slice(0, 5).map((backup) => (
              <div
                key={backup.key}
                className="flex items-center justify-between p-3 rounded-lg border"
                style={{ 
                  borderColor: '#E1C28B',
                  backgroundColor: '#ffffd7',
                  color: '#4c3d1e'
                }}
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {new Date(backup.timestamp).toLocaleString()}
                  </div>
                  <div className="opacity-75">
                    {(backup.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem(backup.key);
                    window.location.reload();
                  }}
                  className="p-1 rounded transition-colors"
                  style={{ color: '#4c3d1e' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          
          {backups.length > 5 && (
            <p className="text-sm opacity-75" style={{ color: '#4c3d1e' }}>
              Showing 5 most recent backups. Total: {backups.length}
            </p>
          )}
        </div>
      )}

      {/* Info */}
      <div className="p-4 rounded-lg border" style={{ 
        borderColor: '#E1C28B',
        backgroundColor: '#feffaf',
        color: '#4c3d1e'
      }}>
        <h5 className="font-medium mb-2">💡 Backup Tips</h5>
        <ul className="text-sm space-y-1 opacity-75">
          <li>• Create regular backups to protect your conversations</li>
          <li>• Full backups include settings and preferences</li>
          <li>• Backups are stored locally and can be downloaded</li>
          <li>• Restoring a backup will replace your current data</li>
        </ul>
      </div>
    </div>
  );
}
