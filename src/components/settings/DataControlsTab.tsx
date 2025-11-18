import React, { useState, useEffect, useRef } from 'react';
import { Database, Shield, Download, Upload, HardDrive, Cloud, Check, AlertTriangle } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import StarToggleWithAssets from '../StarToggleWithAssets';
import DataExportConfirmationModal from './DataExportConfirmationModal';
import { ConversationManager } from '../../lib/conversationManager';
import { getUserId, User } from '../../lib/auth';
import DataImportModal from './DataImportModal';
import { Z_LAYERS } from '../../lib/zLayers';

const formatArchiveSummaryNotice = (
  summary?: {
    knownEntries?: Array<{ display?: string; path: string }>;
    unknownEntries?: string[];
  } | null
): string => {
  if (!summary) return '';
  const known = summary?.knownEntries ?? [];
  const unknown = summary?.unknownEntries ?? [];
  if (known.length === 0 && unknown.length === 0) {
    return 'Archive contained no recognizable files.';
  }
  const listedKnown = known
    .slice(0, 6)
    .map(entry => entry.display || entry.path)
    .join(', ');
  const remaining = Math.max(0, known.length - 6);
  const knownLine = known.length > 0
    ? `Detected ${known.length} known item${known.length === 1 ? '' : 's'}${listedKnown ? ` (${listedKnown}${remaining > 0 ? `, +${remaining} more` : ''})` : ''}.`
    : '';
  const unknownLine = unknown.length > 0
    ? `Found ${unknown.length} unknown file${unknown.length === 1 ? '' : 's'}.`
    : 'No unknown files detected.';
  return [knownLine, unknownLine].filter(Boolean).join(' ');
};

interface DataControlsTabProps {
  user: User | null;
  onDeleteAllConversations?: () => void;
}

const DataControlsTab: React.FC<DataControlsTabProps> = ({ user, onDeleteAllConversations }) => {
  const { settings, updateDataControls } = useSettings();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllStatus, setDeleteAllStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [deleteAllMessage, setDeleteAllMessage] = useState('');

  const dataStorageOptions = [
    { value: 'local', label: 'Local Only', icon: HardDrive, description: 'Store data only on this device' },
    { value: 'cloud', label: 'Cloud Only', icon: Cloud, description: 'Store data in secure cloud storage' },
    { value: 'hybrid', label: 'Hybrid', icon: Database, description: 'Balance between local and cloud storage' }
  ];

  const backupFrequencyOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];

  const getStatusStyle = (status: typeof importStatus | typeof deleteAllStatus | typeof exportStatus) => {
    switch (status) {
      case 'success':
        return { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' };
      case 'processing':
        return { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.3)' };
      case 'error':
        return { backgroundColor: 'rgba(220,38,38,0.12)', borderColor: 'rgba(220,38,38,0.3)' };
      default:
        return { backgroundColor: 'transparent', borderColor: 'transparent' };
    }
  };

  const isImporting = importStatus === 'processing';

  const handleDropdownToggle = (dropdown: string) => {
    setOpenDropdown(openDropdown === dropdown ? null : dropdown);
  };

  const handleStorageSelect = (value: string) => {
    updateDataControls({ dataStorage: value as 'local' | 'cloud' | 'hybrid' });
    setOpenDropdown(null);
  };

  const handleImportConfirm = async (file: File | null) => {
    setShowImportModal(false);

    if (!file) {
      setImportStatus('error');
      setImportMessage('Please select a Chatty export (.zip) to import.');
      return;
    }

    try {
      setImportStatus('processing');
      setImportMessage(`Uploading ${file.name}...`);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/chat-export', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      const responseText = await response.text();
      let payload: any = null;
      if (responseText && responseText.trim()) {
        try {
          payload = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[DataControls] Import response was not valid JSON:', {
            status: response.status,
            statusText: response.statusText,
            bodyPreview: responseText.slice(0, 500)
          });
          const looksLikeHtml = responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html');
          const hint = looksLikeHtml
            ? 'The server returned an HTML error page (likely a proxy or auth redirect).'
            : `Response preview: ${responseText.slice(0, 200)}`;
          throw new Error(`Server returned an unexpected response (${response.status}). ${hint}`);
        }
      } else {
        payload = {};
      }

      // Handle duplicate detection (409 Conflict)
      if (response.status === 409 && payload.isDuplicate) {
        setImportStatus('error');
        const existingName = payload.existingRuntime?.name || 'an existing runtime';
        const existingDate = payload.existingRuntime?.createdAt 
          ? new Date(payload.existingRuntime.createdAt).toLocaleDateString()
          : '';
        setImportMessage(
          `⚠️ Duplicate Runtime Detected\n\n` +
          `A runtime already exists for this account:\n` +
          `• ${existingName}${existingDate ? ` (created ${existingDate})` : ''}\n\n` +
          `To import anyway, you can:\n` +
          `1. Delete the existing runtime first, or\n` +
          `2. Import with a different account/email`
        );
        return;
      }

      if (!response.ok || !payload?.ok) {
        const detailText = payload?.details ? `\n${payload.details}` : '';
        throw new Error(`${payload?.error || 'Failed to import archive'}${detailText}`);
      }

      const totalConversations = payload.metadata?.totalConversations ?? 'unknown';
      const totalMessages = payload.metadata?.totalMessages ?? 'unknown';
      const runtimeName = payload.runtime?.name ?? 'Imported Runtime';
      const provider = payload.preset || payload.source || 'Imported runtime';
      const email = payload.identity?.email;

      const summaryNotice = formatArchiveSummaryNotice(payload.archiveSummary ?? null);
      const successMessage = [
        `✅ Imported ${provider} archive${email ? ` for ${email}` : ''}.`,
        `Created runtime "${runtimeName}" with ${totalConversations} conversations and ${totalMessages} messages.`,
        summaryNotice
      ].filter(Boolean).join('\n');

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

      setImportStatus('success');
      setImportMessage(successMessage);
      
      // Store runtime info for auto-navigation
      const runtimeInfo = {
        runtime: payload.runtime,
        runtimeId: payload.runtime?.runtimeId || payload.metadata?.constructId,
        runtimeName: runtimeName,
        provider,
        metadata: payload.metadata
      };
      
      // Dispatch event for auto-navigation after 5 seconds
      setTimeout(() => {
        console.log('🚀 [DataControls] Auto-navigating to imported runtime:', runtimeInfo.runtimeId);
        window.dispatchEvent(
          new CustomEvent('chatty:navigate-to-imported-runtime', {
            detail: runtimeInfo
          })
        );
      }, 5000); // 5 seconds
    } catch (error: any) {
      console.error('[DataControls] Import failed:', error);
      setImportStatus('error');
      setImportMessage(
        `❌ ${error?.message || 'Failed to import archive. Please verify the export ZIP and try again.'}`
      );
    }
  };

  const handleImportClose = () => {
    setShowImportModal(false);
  };

  const handleDeleteAllConfirm = async () => {
    setDeleteAllStatus('processing');
    setDeleteAllMessage('Deleting all conversations...');
    
    try {
      // Check if user is available
      if (!user) {
        throw new Error('No user logged in');
      }

      // Get user ID using the proper function
      const userId = getUserId(user);
      if (!userId) {
        throw new Error('Unable to determine user ID');
      }

      // Get conversation manager instance
      const conversationManager = ConversationManager.getInstance();
      
      // Clear all user data (conversations, backups, etc.)
      conversationManager.clearUserData(userId);
      
      // Also clear localStorage for this user
      const userKey = `chatty:threads:${userId}`;
      localStorage.removeItem(userKey);
      
      // Clear any backup keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith(`chatty:threads:backup:${userId}`) ||
          key.startsWith(`chatty:full_backup:${userId}`) ||
          key.startsWith(`chatty:migration:${userId}`) ||
          key.startsWith(`chatty:restore_backup:${userId}`)
        )) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Call the callback to clear UI state
      if (onDeleteAllConversations) {
        onDeleteAllConversations();
      }
      
      setDeleteAllStatus('success');
      setDeleteAllMessage(`✅ Successfully deleted all conversations and data for user ${userId}. ${keysToRemove.length} backup files were also removed.`);
      
    } catch (error) {
      console.error('Delete all chats failed:', error);
      setDeleteAllStatus('error');
      setDeleteAllMessage(`❌ Failed to delete all chats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };



  const handleExportConfirm = async () => {
    setIsExporting(true);
    setExportStatus('processing');
    setExportMessage('Preparing export file, this may take a few seconds...');
    
    try {
      console.log('Processing data export...');
      
      // Step 1: Create export and ZIP file
      setExportMessage('Creating export archive...');
      
      const response = await fetch('/api/export/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        // Step 2: Email sending phase
        setExportMessage('Sending verification email...');
        
        // Simulate a brief delay to show the email sending phase
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if email was actually sent successfully
        if (data.userEmail && data.verificationUrl) {
          setExportStatus('success');
          setUserEmail(data.userEmail);
          
          // Enhanced success message with export details
          const exportDetails = data.exportDetails;
          let successMessage = `✅ Export email sent to ${data.userEmail}. Check your inbox for the verification link.`;
          
          if (exportDetails) {
            successMessage += `\n\n📊 Export contains ${exportDetails.totalConversations} conversations and ${exportDetails.totalMessages} messages.`;
            successMessage += `\n⏰ Link expires: ${new Date(exportDetails.expiresAt).toLocaleString()}`;
          }
          
          setExportMessage(successMessage);
          console.log('Export successful:', data.message);
          console.log('Export details:', exportDetails);
        } else {
          throw new Error('Email sending failed - missing user email or verification URL');
        }
      } else {
        // Handle specific error responses from backend
        if (data.troubleshooting) {
          throw new Error(`${data.error}\n\nTroubleshooting:\n• ${data.troubleshooting.checkSMTP}\n• ${data.troubleshooting.checkNetwork}\n• ${data.troubleshooting.checkCredentials}`);
        } else {
          throw new Error(data.error || 'Export failed');
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('error');
      
      // Provide more specific error messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Email')) {
        setExportMessage(`❌ Email sending failed: ${errorMessage}. Please check your email configuration.`);
      } else if (errorMessage.includes('ZIP') || errorMessage.includes('archive')) {
        setExportMessage(`❌ Could not create export archive: ${errorMessage}`);
      } else if (errorMessage.includes('database') || errorMessage.includes('MongoDB')) {
        setExportMessage(`❌ Database connection failed: ${errorMessage}`);
      } else {
        setExportMessage(`❌ Export failed: ${errorMessage || 'Please try again.'}`);
      }
    } finally {
      setIsExporting(false);
      // Keep modal open to show status, user can close it manually
    }
  };

  return (
    <div>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
        Data Controls
      </h3>
      <div className="space-y-6">
        {/* Data Storage */}
        <div className="relative dropdown-container">
          <div 
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle('dataStorage')}
          >
            <div className="flex items-center gap-3">
              <Database size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
              <span className="text-sm transition-colors hover:opacity-80" style={{ color: 'var(--chatty-text)' }}>
                Data Storage
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                {dataStorageOptions.find(opt => opt.value === settings.dataControls.dataStorage)?.label}
              </span>
              <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>›</span>
            </div>
          </div>
          {openDropdown === 'dataStorage' && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-56"
              style={{
                backgroundColor: 'var(--chatty-bg-main)',
                borderColor: 'var(--chatty-line)',
                zIndex: Z_LAYERS.popover
              }}
            >
              {dataStorageOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <div
                    key={option.value}
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                    style={{ backgroundColor: settings.dataControls.dataStorage === option.value ? 'var(--chatty-highlight)' : 'transparent' }}
                    onClick={() => handleStorageSelect(option.value)}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                      <div className="flex-1">
                        <div className="text-sm" style={{ color: 'var(--chatty-text)' }}>{option.label}</div>
                        <div className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>{option.description}</div>
                      </div>
                    </div>
                    {settings.dataControls.dataStorage === option.value && <Check size={16} style={{ color: 'var(--chatty-text)' }} />}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs mt-1 px-3" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
            Choose where your conversation data is stored for optimal performance and security.
          </p>
        </div>


        {/* Auto Backup */}
        <div className="relative dropdown-container">
          <div 
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle('autoBackup')}
          >
            <div className="flex items-center gap-3">
              <Upload size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
              <span className="text-sm transition-colors hover:opacity-80" style={{ color: 'var(--chatty-text)' }}>
                Auto Backup
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                {settings.dataControls.autoBackup 
                  ? (backupFrequencyOptions.find(opt => opt.value === settings.dataControls.backupFrequency)?.label || 'Daily')
                  : 'Off'
                }
              </span>
              <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>›</span>
            </div>
          </div>
          {openDropdown === 'autoBackup' && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-48"
              style={{
                backgroundColor: 'var(--chatty-bg-main)',
                borderColor: 'var(--chatty-line)',
                zIndex: Z_LAYERS.popover
              }}
            >
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                style={{ backgroundColor: !settings.dataControls.autoBackup ? 'var(--chatty-highlight)' : 'transparent' }}
                onClick={() => {
                  updateDataControls({ autoBackup: false });
                  setOpenDropdown(null);
                }}
              >
                <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>Off</span>
                {!settings.dataControls.autoBackup && <Check size={16} style={{ color: 'var(--chatty-text)' }} />}
              </div>
              {backupFrequencyOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{ backgroundColor: settings.dataControls.autoBackup && settings.dataControls.backupFrequency === option.value ? 'var(--chatty-highlight)' : 'transparent' }}
                  onClick={() => {
                    updateDataControls({ autoBackup: true, backupFrequency: option.value as 'daily' | 'weekly' | 'monthly' });
                    setOpenDropdown(null);
                  }}
                >
                  <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>{option.label}</span>
                  {settings.dataControls.autoBackup && settings.dataControls.backupFrequency === option.value && <Check size={16} style={{ color: 'var(--chatty-text)' }} />}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs mt-1 px-3" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
            Automatically backup your data at the selected frequency.
          </p>
        </div>

        {/* Data Import */}
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          <div className="flex items-center gap-3">
            <Upload size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Data Import
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Restore a Chatty-compatible export (.zip)
              </p>
            </div>
          </div>
          <button
            className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              backgroundColor: 'var(--chatty-bg-main)', 
              borderColor: 'var(--chatty-line)',
              color: 'var(--chatty-text)'
            }}
            onClick={() => setShowImportModal(true)}
            disabled={isImporting}
          >
            {isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
        {importStatus !== 'idle' && (
          <div
            className="px-3 py-2 rounded-md text-xs whitespace-pre-line border"
            style={{
              ...getStatusStyle(importStatus),
              color: 'var(--chatty-text)'
            }}
          >
            {importMessage}
          </div>
        )}
        {/* Data Export */}
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          <div className="flex items-center gap-3">
            <Download size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Data Export
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Export your account data and conversations
              </p>
            </div>
          </div>
          <button
            className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-gray-50"
            style={{ 
              backgroundColor: 'var(--chatty-bg-main)', 
              borderColor: 'var(--chatty-line)',
              color: 'var(--chatty-text)'
            }}
            onClick={() => setShowExportModal(true)}
          >
            Export
          </button>
        </div>

        {/* Improve the model for everyone */}
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-highlight)' }}>
          <div className="flex items-center gap-3">
            <Database size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Improve the model for everyone
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Help improve ChatGPT by sharing your conversations
              </p>
            </div>
          </div>
          <StarToggleWithAssets
            toggled={settings.dataControls.improveModel}
            onToggle={(toggled) => updateDataControls({ improveModel: toggled })}
            size="md"
            spacing="36px"
          />
        </div>

        {/* Remote browser data */}
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-highlight)' }}>
          <div className="flex items-center gap-3">
            <Cloud size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Remote browser data
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Allow ChatGPT to access your browser data
              </p>
            </div>
          </div>
          <StarToggleWithAssets
            toggled={settings.dataControls.remoteBrowserData}
            onToggle={(toggled) => updateDataControls({ remoteBrowserData: toggled })}
            size="md"
            spacing="48px"
          />
        </div>

        {/* Shared links */}
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          <div className="flex items-center gap-3">
            <Upload size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Shared links
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Manage your shared conversation links
              </p>
            </div>
          </div>
          <button
            className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-gray-50"
            style={{ 
              backgroundColor: 'var(--chatty-bg-main)', 
              borderColor: 'var(--chatty-line)',
              color: 'var(--chatty-text)'
            }}
            onClick={() => {
              // TODO: Implement shared links management
              console.log('Manage shared links clicked');
            }}
          >
            Manage
          </button>
        </div>

        {/* Archived chats */}
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          <div className="flex items-center gap-3">
            <Database size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Archived chats
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                View and manage your archived conversations
              </p>
            </div>
          </div>
          <button
            className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-gray-50"
            style={{ 
              backgroundColor: 'var(--chatty-bg-main)', 
              borderColor: 'var(--chatty-line)',
              color: 'var(--chatty-text)'
            }}
            onClick={() => {
              // TODO: Implement archived chats management
              console.log('Manage archived chats clicked');
            }}
          >
            Manage
          </button>
        </div>

        {/* Archive all chats */}
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          <div className="flex items-center gap-3">
            <Download size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Archive all chats
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Archive all your current conversations
              </p>
            </div>
          </div>
          <button
            className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-gray-50"
            style={{ 
              backgroundColor: 'var(--chatty-bg-main)', 
              borderColor: 'var(--chatty-line)',
              color: 'var(--chatty-text)'
            }}
            onClick={() => {
              // TODO: Implement archive all chats
              console.log('Archive all chats clicked');
            }}
          >
            Archive all
          </button>
        </div>

        {/* Delete all chats */}
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          <div className="flex items-center gap-3">
            <Shield size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Delete all chats
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Permanently delete all your conversations
              </p>
            </div>
          </div>
          <button
            className="px-4 py-2 text-sm rounded-lg border transition-colors hover:bg-red-50 whitespace-nowrap"
            style={{ 
              backgroundColor: 'var(--chatty-bg-main)', 
              borderColor: '#ef4444',
              color: '#ef4444'
            }}
            onClick={() => setShowDeleteAllModal(true)}
          >
            Delete all
          </button>
        </div>

        {/* Data Privacy Notice */}
        <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--chatty-line)', backgroundColor: 'var(--chatty-bg-main)' }}>
          <div className="flex items-start gap-3">
            <Shield size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <h4 className="text-sm font-medium mb-1" style={{ color: 'var(--chatty-text)' }}>
                Data Privacy
              </h4>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Your data is encrypted and stored securely. We never share your personal information with third parties. 
                VVAULT integration provides additional security layers for sensitive data.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <DataImportModal
        isOpen={showImportModal}
        onClose={handleImportClose}
        onConfirm={handleImportConfirm}
        isProcessing={isImporting}
      />

      {/* Data Export Confirmation Modal */}
      <DataExportConfirmationModal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setExportStatus('idle');
          setExportMessage('');
          setUserEmail(null);
        }}
        onConfirm={handleExportConfirm}
        isExporting={isExporting}
        exportStatus={exportStatus}
        exportMessage={exportMessage}
        userEmail={userEmail}
      />

      {/* Delete All Chats Confirmation Modal */}
      {showDeleteAllModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
          style={{ zIndex: Z_LAYERS.modal }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
            <div className="p-6">
              {/* Show confirmation screen or result screen */}
              {deleteAllStatus === 'idle' ? (
                // Confirmation Screen
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-full" style={{ backgroundColor: '#fef2f2' }}>
                      <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                    </div>
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--chatty-text)' }}>
                      Delete All Conversations
                    </h3>
                  </div>
                  
                  <div className="mb-6">
                    <p className="text-sm mb-3" style={{ color: 'var(--chatty-text)' }}>
                      This action will permanently delete <strong>all</strong> your conversations and cannot be undone.
                    </p>
                    <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                      This includes:
                    </p>
                    <ul className="text-sm mt-2 ml-4 space-y-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                      <li>• All conversation threads</li>
                      <li>• All messages and chat history</li>
                      <li>• All backup files</li>
                      <li>• All associated data</li>
                    </ul>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteAllModal(false);
                        setDeleteAllStatus('idle');
                        setDeleteAllMessage('');
                      }}
                      className="flex-1 px-4 py-2 text-sm rounded-lg border transition-colors"
                      style={{ 
                        backgroundColor: 'var(--chatty-bg-sidebar)', 
                        color: 'var(--chatty-text)',
                        borderColor: 'var(--chatty-line)'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAllConfirm}
                      className="flex-1 px-4 py-2 text-sm rounded-lg font-medium transition-colors"
                      style={{ 
                        backgroundColor: '#ef4444', 
                        color: 'white',
                        border: 'none'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#dc2626'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#ef4444'
                      }}
                    >
                      Delete All
                    </button>
                  </div>
                </>
              ) : (
                // Result Screen
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-full" style={{ 
                      backgroundColor: deleteAllStatus === 'success' ? '#f0fdf4' : deleteAllStatus === 'error' ? '#fef2f2' : '#fefce8'
                    }}>
                      {deleteAllStatus === 'success' ? (
                        <Check size={24} style={{ color: '#22c55e' }} />
                      ) : deleteAllStatus === 'error' ? (
                        <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                      ) : (
                        <AlertTriangle size={24} style={{ color: '#eab308' }} />
                      )}
                    </div>
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--chatty-text)' }}>
                      {deleteAllStatus === 'success' ? 'Deletion Complete' : 
                       deleteAllStatus === 'error' ? 'Deletion Failed' : 
                       'Deleting Conversations...'}
                    </h3>
                  </div>
                  
                  <div className="mb-6">
                    <p className="text-sm whitespace-pre-line" style={{ 
                      color: deleteAllStatus === 'success' ? '#16a34a' : 
                             deleteAllStatus === 'error' ? '#dc2626' : 
                             '#ca8a04'
                    }}>
                      {deleteAllMessage}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    {deleteAllStatus === 'success' ? (
                      <button
                        onClick={() => {
                          setShowDeleteAllModal(false);
                          setDeleteAllStatus('idle');
                          setDeleteAllMessage('');
                        }}
                        className="w-full px-4 py-2 text-sm rounded-lg font-medium transition-colors"
                        style={{ 
                          backgroundColor: '#22c55e', 
                          color: 'white',
                          border: 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#16a34a'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#22c55e'
                        }}
                      >
                        Done
                      </button>
                    ) : deleteAllStatus === 'error' ? (
                      <>
                        <button
                          onClick={() => {
                            setShowDeleteAllModal(false);
                            setDeleteAllStatus('idle');
                            setDeleteAllMessage('');
                          }}
                          className="flex-1 px-4 py-2 text-sm rounded-lg border transition-colors"
                          style={{ 
                            backgroundColor: 'var(--chatty-bg-sidebar)', 
                            color: 'var(--chatty-text)',
                            borderColor: 'var(--chatty-line)'
                          }}
                        >
                          Close
                        </button>
                        <button
                          onClick={handleDeleteAllConfirm}
                          className="flex-1 px-4 py-2 text-sm rounded-lg font-medium transition-colors"
                          style={{ 
                            backgroundColor: '#ef4444', 
                            color: 'white',
                            border: 'none'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#dc2626'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#ef4444'
                          }}
                        >
                          Try Again
                        </button>
                      </>
                    ) : (
                      <div className="w-full px-4 py-2 text-sm rounded-lg text-center" style={{ 
                        backgroundColor: 'var(--chatty-bg-sidebar)', 
                        color: 'var(--chatty-text)',
                        borderColor: 'var(--chatty-line)'
                      }}>
                        Processing...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataControlsTab;
