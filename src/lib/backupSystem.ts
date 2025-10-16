// src/lib/backupSystem.ts
import type { User } from './auth';
import { getUserId } from './auth';
import { conversationManager } from './conversationManager';

export interface BackupData {
  timestamp: number;
  user: User;
  conversations: any[];
  settings?: any;
  metadata: {
    version: string;
    totalConversations: number;
    totalMessages: number;
    backupType: 'full' | 'conversations_only';
  };
}

/**
 * Creates a comprehensive backup of all user data
 */
export function createUserBackup(user: User): BackupData {
  const userId = getUserId(user);
  const timestamp = Date.now();
  
  // Get conversations
  const conversationKey = `chatty:threads:${userId}`;
  const conversations = JSON.parse(localStorage.getItem(conversationKey) || '[]');
  
  // Get settings if they exist
  const settingsKey = `chatty:settings:${userId}`;
  const settings = localStorage.getItem(settingsKey) ? JSON.parse(localStorage.getItem(settingsKey)!) : null;
  
  // Calculate metadata
  const totalMessages = conversations.reduce((total: number, conv: any) => {
    return total + (conv.messages ? conv.messages.length : 0);
  }, 0);
  
  const backup: BackupData = {
    timestamp,
    user,
    conversations,
    settings,
    metadata: {
      version: '1.0.0',
      totalConversations: conversations.length,
      totalMessages,
      backupType: 'full'
    }
  };
  
  return backup;
}

/**
 * Creates a backup of only conversations
 */
export function createConversationBackup(user: User): BackupData {
  const userId = getUserId(user);
  const timestamp = Date.now();
  
  // Get conversations
  const conversationKey = `chatty:threads:${userId}`;
  const conversations = JSON.parse(localStorage.getItem(conversationKey) || '[]');
  
  // Calculate metadata
  const totalMessages = conversations.reduce((total: number, conv: any) => {
    return total + (conv.messages ? conv.messages.length : 0);
  }, 0);
  
  const backup: BackupData = {
    timestamp,
    user,
    conversations,
    metadata: {
      version: '1.0.0',
      totalConversations: conversations.length,
      totalMessages,
      backupType: 'conversations_only'
    }
  };
  
  return backup;
}

/**
 * Downloads backup data as a JSON file
 */
export function downloadBackup(backup: BackupData, filename?: string): void {
  const defaultFilename = `chatty-backup-${backup.user.email}-${new Date(backup.timestamp).toISOString().split('T')[0]}.json`;
  const finalFilename = filename || defaultFilename;
  
  const dataStr = JSON.stringify(backup, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = finalFilename;
  link.click();
  
  URL.revokeObjectURL(link.href);
}

/**
 * Restores backup data from a JSON file
 */
export function restoreBackup(backup: BackupData, user: User): boolean {
  try {
    const userId = getUserId(user);
    
    // Validate backup data
    if (!backup.conversations || !Array.isArray(backup.conversations)) {
      throw new Error('Invalid backup data: conversations not found or not an array');
    }
    
    if (!backup.user || !backup.user.email) {
      throw new Error('Invalid backup data: user information not found');
    }
    
    // Check if this backup belongs to the current user
    if (backup.user.email !== user.email) {
      throw new Error('Backup does not belong to current user');
    }
    
    // Prefer saving to backend (source-of-truth) when available.
    try {
      // conversationManager.saveUserConversations is backend-first and will
      // persist the conversations remotely and then cache a small subset.
      conversationManager.saveUserConversations(user, backup.conversations as any)
      console.log('✅ Backup restored successfully via backend save');
      return true;
    } catch (err) {
      console.warn('⚠️ Backend save failed during restore; falling back to cached restore in localStorage', err);
      // Fall back to writing a small cached snapshot only (no timestamped backups)
      try {
        const conversationKey = `chatty:threads:${userId}`;
        const limited = backup.conversations.slice(0, 10);
        localStorage.setItem(conversationKey, JSON.stringify(limited));
        if (backup.settings) {
          const settingsKey = `chatty:settings:${userId}`;
          localStorage.setItem(settingsKey, JSON.stringify(backup.settings));
        }
        console.log('✅ Backup restored to local cache (limited to 10 conversations)');
        return true;
      } catch (e) {
        console.error('❌ Failed to restore backup to localStorage:', e);
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Failed to restore backup:', error);
    return false;
  }
}

/**
 * Uploads and restores backup from a file
 */
export function uploadAndRestoreBackup(file: File, user: User): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string) as BackupData;
        const success = restoreBackup(backup, user);
        resolve(success);
      } catch (error) {
        console.error('❌ Failed to parse backup file:', error);
        resolve(false);
      }
    };
    
    reader.onerror = () => {
      console.error('❌ Failed to read backup file');
      resolve(false);
    };
    
    reader.readAsText(file);
  });
}

/**
 * Gets all backup files for a user
 */
export function getUserBackups(user: User): { key: string; timestamp: number; size: number }[] {
  const userId = getUserId(user);
  // Local timestamped backups are disabled to avoid quota issues. Return
  // an empty list and instruct operators to use downloadable backup
  // utilities instead.
  console.info('Local timestamped backups are disabled; use downloadBackup/createUserBackup to obtain a snapshot');
  return [];
}

/**
 * Cleans up old backups (keeps last 10)
 */
export function cleanupOldBackups(user: User): void {
  // No-op: backups are not stored in localStorage at runtime. If legacy
  // backup keys exist, this function intentionally avoids aggressive
  // mass-deletion to prevent accidental data loss. Operators may run a
  // dedicated cleanup script if needed.
  console.info('cleanupOldBackups is a no-op; local backups disabled to avoid quota issues');
}

/**
 * Exports all localStorage data for debugging
 */
export function exportAllLocalStorage(): { [key: string]: any } {
  const allData: { [key: string]: any } = {};
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      try {
        allData[key] = JSON.parse(localStorage.getItem(key) || '');
      } catch {
        allData[key] = localStorage.getItem(key);
      }
    }
  }
  
  return allData;
}

/**
 * Downloads all localStorage data as a debug file
 */
export function downloadAllLocalStorage(): void {
  const allData = exportAllLocalStorage();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `chatty-debug-${timestamp}.json`;
  
  const dataStr = JSON.stringify(allData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = filename;
  link.click();
  
  URL.revokeObjectURL(link.href);
}
