// Professional Conversation Management System
// Handles localStorage backup, migration, and backend sync

import { type User, getUserId } from './auth'

export interface ConversationThread {
  id: string;
  title: string;
  messages: any[];
  createdAt?: number;
  updatedAt?: number;
}

export class ConversationManager {
  private static instance: ConversationManager;
  // Max bytes we'll allow for the per-user local cache (approx).
  // Keeping this modest avoids quota pressure from big conversation histories.
  private readonly MAX_CACHE_BYTES = 256 * 1024; // 256KB

  // Optional callback that the app can register to show a graceful UI when
  // storage-related failures occur (quota exceeded, corruption, etc.).
  public storageFailureCallback?: (info: { reason: string; key?: string; sizeBytes?: number }) => void;
  
  static getInstance(): ConversationManager {
    if (!ConversationManager.instance) {
      ConversationManager.instance = new ConversationManager();
    }
    return ConversationManager.instance;
  }

  /**
   * 1. BACKUP ALL LOCALSTORAGE TO DISK
   */
  async backupAllLocalStorage(): Promise<void> {
    console.log('💾 Creating localStorage backup...');
    
    const allData: Record<string, string> = {};
    
    // Collect all localStorage data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        allData[key] = localStorage.getItem(key) || '';
      }
    }
    
    // Create downloadable backup
    const blob = new Blob([JSON.stringify(allData, null, 2)], {
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatty-localStorage-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('✅ localStorage backup created and downloaded');
  }

  /**
   * 2. MIGRATE OLD CONVERSATIONS TO USER-SPECIFIC STORAGE
   */
  async migrateConversations(user: User): Promise<ConversationThread[]> {
    // Handle missing user.sub by using fallback ID
    const userId = user.sub || user.id || user.email || 'unknown';
    console.log(`🔄 Migrating conversations for user: ${user.email} (ID: ${userId})`);
    console.log('User object for migration:', user);
    
  const newKey = `chatty:threads:${userId}`;
  // We intentionally DO NOT create localStorage backups here to avoid
  // filling up user quota. The backend is the source-of-truth and
  // manual downloads exist via `backupAllLocalStorage()`.
    
    // Check multiple sources for old conversations
    const sources = [
      'chatty:threads',
      'chatty-data', 
      'chatty:threads:backup',
      'chatty-conversations'
    ];
    
    let oldData = null;
    let sourceKey = null;
    
    for (const source of sources) {
      const data = localStorage.getItem(source);
      if (data && data.length > 10) {
        oldData = data;
        sourceKey = source;
        console.log(`📦 Found data in ${source}: ${data.length} characters`);
        break;
      }
    }
    
    if (!oldData) {
      console.log('ℹ️ No old conversations found to migrate');
      return [];
    }
    
    // Check if already migrated
    if (localStorage.getItem(newKey)) {
      console.log('ℹ️ Conversations already migrated for this user');
      try {
        return JSON.parse(localStorage.getItem(newKey) || '[]');
      } catch (e) {
        console.warn('Failed to parse existing user conversations:', e);
        return [];
      }
    }
    
    try {
      // Parse old conversations
      const parsed = JSON.parse(oldData);
      let oldThreads = [];
      
      if (Array.isArray(parsed)) {
        oldThreads = parsed;
      } else if (parsed.conversations && Array.isArray(parsed.conversations)) {
        oldThreads = parsed.conversations;
      } else if (parsed.threads && Array.isArray(parsed.threads)) {
        oldThreads = parsed.threads;
      } else if (parsed.messages && Array.isArray(parsed.messages)) {
        // Convert messages to thread
        oldThreads = [{
          id: `recovered_${Date.now()}`,
          title: 'Recovered Conversation',
          messages: parsed.messages,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }];
      }
      
      if (!Array.isArray(oldThreads) || oldThreads.length === 0) {
        console.warn('No valid conversations found in data');
        return [];
      }
      
      // Migrate to user-specific storage
      localStorage.setItem(newKey, JSON.stringify(oldThreads));
      console.log(`✅ Migrated ${oldThreads.length} conversations from ${sourceKey} to ${newKey}`);
      
      // Show success message
      this.showMigrationSuccess(user, oldThreads.length);
      
      return oldThreads;
    } catch (error) {
      console.error('❌ Migration failed:', error);
      return [];
    }
  }

  /**
   * 3. LOAD CONVERSATIONS FOR USER (with migration)
   */
  async loadUserConversations(user: User): Promise<ConversationThread[]> {
    // Handle missing user.sub by using fallback ID
    const userId = getUserId(user);
    console.log(`📂 Loading conversations for user: ${user.email} (ID: ${userId})`);
    
    const userKey = `chatty:threads:${userId}`;
    
    // PRIMARY: Always try backend first
    try {
      const backendThreads = await this.loadFromBackend(user);
      if (backendThreads.length > 0) {
        console.log(`✅ Loaded ${backendThreads.length} conversations from backend`);
        
  // Cache only recent conversations locally (last 10). Use a safe
  // setter that checks size and quota before attempting to write.
  const recentThreads = this.ensureCacheLimit(backendThreads);
  const cacheData = JSON.stringify(recentThreads);
  this.setItemWithQuotaCheck(userKey, cacheData);
        
        return backendThreads;
      }
    } catch (error) {
      console.warn('Backend load failed, trying localStorage cache:', error);
    }
    
    // FALLBACK: Try localStorage cache (only recent conversations)
    const existingData = localStorage.getItem(userKey);
    if (existingData && existingData.length > 10) {
      try {
        const threads = JSON.parse(existingData);
        if (Array.isArray(threads) && threads.length > 0) {
          console.log(`✅ Loaded ${threads.length} conversations from localStorage cache`);
          return threads;
        }
      } catch (error) {
        console.warn('Failed to parse cached conversations:', error);
      }
    }
    
    // LAST RESORT: Attempt migration (but don't store backups)
    console.log('🔍 No conversations found, attempting migration...');
    return await this.migrateConversations(user);
  }

  /**
   * 4. SAVE CONVERSATIONS (localStorage + backend)
   */
  async saveUserConversations(user: User, threads: ConversationThread[]): Promise<void> {
    const userId = getUserId(user);
    const userKey = `chatty:threads:${userId}`;
    
    try {
      // PRIMARY: Save to backend first (this is the main storage)
      await this.saveToBackend(user, threads);
      
  // SECONDARY: Only cache recent conversations in localStorage (last 10)
  const recentThreads = this.ensureCacheLimit(threads);
  const cacheData = JSON.stringify(recentThreads);
  this.setItemWithQuotaCheck(userKey, cacheData);
      
  // NO BACKUPS - Backend is the backup. Ensure existing legacy backups are
  // removed to free any space they may be consuming.
  this.cleanupAllBackups(userId);
      
      console.log(`💾 Saved ${threads.length} conversations to backend, cached ${recentThreads.length} locally`);
    } catch (error) {
      console.error('❌ Failed to save conversations:', error);
      // Don't throw error to prevent app crash
    }
  }

  /**
   * 5. BACKEND STORAGE (TODO: Implement)
   */
  private async saveToBackend(user: User, threads: ConversationThread[]): Promise<void> {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ conversations: threads })
      });
      
      if (!response.ok) {
        throw new Error(`Backend save failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.ok) {
        throw new Error(result.error || 'Backend save failed');
      }
      
      console.log('☁️ Conversations saved to backend');
    } catch (error) {
      console.warn('⚠️ Backend save failed, using localStorage only:', error);
      // Don't throw error - localStorage is still working
    }
  }

  private async loadFromBackend(user: User): Promise<ConversationThread[]> {
    try {
      const response = await fetch('/api/conversations', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Backend load failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Backend load failed');
      }
      
      console.log('☁️ Conversations loaded from backend');
      return data.conversations || [];
    } catch (error) {
      console.warn('⚠️ Backend load failed, using localStorage:', error);
      return [];
    }
  }

  /**
   * 6. USER SESSION MANAGEMENT
   */
  getCurrentUser(): User | null {
    try {
      // Try to get from auth session
      const authSession = localStorage.getItem('auth:session');
      if (authSession) {
        const parsed = JSON.parse(authSession);
        if (parsed.user && getUserId(parsed.user)) {
          return parsed.user;
        }
      }
      
      // Try to get from API (if user is logged in via cookie)
      const cookies = document.cookie.split(';');
      const sessionCookie = cookies.find(c => c.trim().startsWith('sid='));
      if (sessionCookie) {
        // User is logged in but we need to fetch user info
        return { sub: 'cookie_user', email: 'unknown', name: 'User' };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * 7. STORAGE CLEANUP
   */
  cleanupAllBackups(userId: string): void {
    try {
      // Remove all backup files for this user
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        // Only remove known legacy backup keys. We avoid touching the
        // active `chatty:threads:<userId>` cache unless absolutely needed.
        if (
          key.startsWith(`chatty:threads:backup:`) ||
          key.startsWith(`chatty:full_backup:`) ||
          key.startsWith(`chatty:migration:`) ||
          key.startsWith(`chatty:restore_backup:`)
        ) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`🗑️ Cleaned up backup: ${key}`);
      });

      console.log(`🧹 Cleaned up ${keysToRemove.length} backup files (legacy) for user ${userId}`);
    } catch (error) {
      console.error('Failed to cleanup backups:', error);
    }
  }

  /**
   * 8. USER DATA ISOLATION
   */
  clearUserData(userId: string): void {
    try {
      // Clear user-specific conversations + settings from cache only.
      // The backend remains the source of truth.
      const userKey = `chatty:threads:${userId}`;
      localStorage.removeItem(userKey);

      const settingsKey = `chatty:settings:${userId}`;
      localStorage.removeItem(settingsKey);

      console.log(`🧹 Cleared user data for: ${userId}`);
    } catch (error) {
      console.error('Failed to clear user data:', error);
    }
  }

  /**
   * 8. QUOTA MANAGEMENT
   */
  private setItemWithQuotaCheck(key: string, value: string): void {
    // Fast size check: if value is too large, skip writing to avoid quota
    // pressure. We measure bytes using TextEncoder for reliability.
    try {
      const bytes = this.byteLength(value);
      if (bytes > this.MAX_CACHE_BYTES) {
        console.warn(`⚠️ Cache for ${key} is too large (${bytes} bytes). Skipping local cache.`);
        this.reportStorageEvent('oversize', { key, sizeBytes: bytes }).catch(() => {})
        if (this.storageFailureCallback) {
          this.storageFailureCallback({ reason: 'oversize', key, sizeBytes: bytes });
        }
        return;
      }

      // If StorageManager estimate is available we can make an informed
      // decision. This avoids triggering a QuotaExceededError in most
      // browsers that implement it.
      const nav: any = navigator;
      if (nav.storage && typeof nav.storage.estimate === 'function') {
        try {
          nav.storage.estimate().then((estimate: any) => {
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const remaining = quota - usage;
            if (remaining < bytes * 1.1) {
              console.warn(`⚠️ Not enough storage remaining to cache ${key} (${bytes} bytes). Remaining: ${remaining}`);
              this.reportStorageEvent('low_quota', { key, sizeBytes: bytes, remaining }).catch(() => {})
              if (this.storageFailureCallback) {
                this.storageFailureCallback({ reason: 'low_quota', key, sizeBytes: bytes });
              }
              // Try to free legacy backups and retry once.
              this.emergencyCleanup();
              try {
                localStorage.setItem(key, value);
              } catch (e) {
                console.error('❌ Still unable to write cache after cleanup', e);
                if (this.storageFailureCallback) {
                  this.storageFailureCallback({ reason: 'quota_exceeded_after_cleanup', key, sizeBytes: bytes });
                }
              }
              return;
            }
            // Enough space according to estimate: attempt write.
            try {
              localStorage.setItem(key, value);
            } catch (e) {
              // Fallback: emergency cleanup and retry once.
                if (e && (e as any).name === 'QuotaExceededError') {
                console.warn('⚠️ localStorage quota exceeded during setItem, running emergency cleanup');
                this.reportStorageEvent('quota_exceeded', { key, sizeBytes: bytes }).catch(() => {})
                this.emergencyCleanup();
                try { localStorage.setItem(key, value); } catch (_) {
                  console.error('❌ Still quota exceeded after cleanup, data not saved');
                  if (this.storageFailureCallback) {
                    this.storageFailureCallback({ reason: 'quota_exceeded', key, sizeBytes: bytes });
                  }
                }
              } else {
                console.error('Failed to set localStorage key:', e);
              }
            }
          }).catch((estimateErr: any) => {
            // If estimate fails, fall back to try/catch write path.
            try {
              localStorage.setItem(key, value);
                  } catch (e) {
              if (e && (e as any).name === 'QuotaExceededError') {
                console.warn('⚠️ localStorage quota exceeded, cleaning up...');
                this.reportStorageEvent('quota_exceeded', { key, sizeBytes: bytes }).catch(() => {})
                this.emergencyCleanup();
                try { localStorage.setItem(key, value); } catch (_) {
                  console.error('❌ Still quota exceeded after cleanup, data not saved');
                  if (this.storageFailureCallback) {
                    this.storageFailureCallback({ reason: 'quota_exceeded', key, sizeBytes: bytes });
                  }
                }
              } else {
                throw e;
              }
            }
          });
        } catch (err) {
          // If anything unexpected happens with estimate, fall back to
          // simple write-with-catch.
          try { localStorage.setItem(key, value); } catch (e) {
            if (e && (e as any).name === 'QuotaExceededError') {
              this.emergencyCleanup();
              try { localStorage.setItem(key, value); } catch (_) {
                console.error('❌ Still quota exceeded after cleanup, data not saved');
                if (this.storageFailureCallback) {
                  this.storageFailureCallback({ reason: 'quota_exceeded', key, sizeBytes: bytes });
                }
              }
            } else {
              throw e;
            }
          }
        }
      } else {
        // No StorageManager API — try writing and react to QuotaExceededError.
        try {
          localStorage.setItem(key, value);
        } catch (e) {
          if (e && (e as any).name === 'QuotaExceededError') {
            console.warn('⚠️ localStorage quota exceeded, cleaning up...');
            this.emergencyCleanup();
            try { localStorage.setItem(key, value); } catch (_) {
              console.error('❌ Still quota exceeded after cleanup, data not saved');
              if (this.storageFailureCallback) {
                this.storageFailureCallback({ reason: 'quota_exceeded', key, sizeBytes: bytes });
              }
            }
          } else {
            throw e;
          }
        }
      }
    } catch (error) {
      console.error('setItemWithQuotaCheck encountered unexpected error:', error);
    }
  }

  private async reportStorageEvent(event: string, details: any): Promise<void> {
    try {
      await fetch('/api/telemetry/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ event, details })
      });
    } catch (e) {
      // swallow errors - telemetry must not interfere with app
      console.debug('Telemetry send failed', e);
    }
  }

  private emergencyCleanup(): void {
    // Remove legacy backup keys that are known to be large consumers of
    // quota. We avoid touching active caches unless there's no other
    // choice.
    const prefixes = [
      'chatty:threads:backup:',
      'chatty:full_backup:',
      'chatty:migration:',
      'chatty:restore_backup:'
    ];

    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (prefixes.some(p => key.startsWith(p))) {
        toRemove.push(key);
      }
    }

    toRemove.forEach(k => {
      try { localStorage.removeItem(k); console.log(`🗑️ Emergency cleanup: removed ${k}`); } catch (e) { /* noop */ }
    });
  }

  // Public wrapper so UI code can request an emergency cleanup without
  // accessing private internals.
  public triggerEmergencyCleanup(): void {
    try {
      this.emergencyCleanup();
    } catch (e) {
      console.error('triggerEmergencyCleanup failed', e);
    }
  }

  private createBackup(userId: string, threads: ConversationThread[]): void {
    // Backups to localStorage are intentionally disabled. Use
    // `backupAllLocalStorage()` to create a downloadable backup instead.
    console.info('createBackup called but local backups are disabled to avoid quota issues');
  }

  /**
   * 9. UTILITY METHODS
   */
  private cleanupOldBackups(userId: string): void {
    // No-op: localStorage backups are disabled to avoid quota issues.
  }

  private showMigrationSuccess(user: User, count: number): void {
    // Create a temporary banner to show migration success
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #10B981;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      max-width: 300px;
    `;
    banner.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">✅ Conversations Recovered!</div>
      <div>Restored ${count} conversations for ${user.name || user.email}</div>
    `;
    
    document.body.appendChild(banner);
    
    // Remove after 5 seconds
    setTimeout(() => {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 5000);
  }

  /**
   * 8. DEBUG METHODS
   */
  getStorageStats(): { totalKeys: number; chattyKeys: number; userKeys: number } {
    let totalKeys = 0;
    let chattyKeys = 0;
    let userKeys = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        totalKeys++;
        if (key.includes('chatty')) {
          chattyKeys++;
          if (key.includes(':')) {
            userKeys++;
          }
        }
      }
    }
    
    return { totalKeys, chattyKeys, userKeys };
  }

  // Utility: return approximate byte length of a string
  private byteLength(str: string): number {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    // Fallback naive calculation
    return new Blob([str]).size;
  }

  // Trim thread list to recent N and remove heavy fields if needed.
  private ensureCacheLimit(threads: ConversationThread[], limit = 10): ConversationThread[] {
    if (!Array.isArray(threads)) return [];
    const trimmed = threads.slice(0, limit).map(t => ({
      ...t,
      // Remove any unusually large attachments or binaries stored inline.
      // This is a best-effort; adjust fields based on actual schema.
      messages: Array.isArray(t.messages) ? t.messages.map(m => {
        // If messages include large `blob` or `attachment` fields, drop them
        if (m && typeof m === 'object') {
          const copy = { ...m } as any;
          if (copy.blob || copy.attachment) {
            delete copy.blob;
            delete copy.attachment;
            copy._droppedLargeFields = true;
          }
          return copy;
        }
        return m;
      }) : t.messages
    }));
    return trimmed;
  }
}

// Export singleton instance
export const conversationManager = ConversationManager.getInstance();
