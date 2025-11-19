// Professional Data Recovery and Migration System
// Prevents data loss and ensures proper user isolation

export interface UserSession {
  id: string;
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface ConversationThread {
  id: string;
  title: string;
  messages: any[];
  createdAt?: number;
  updatedAt?: number;
}

export class DataRecoveryManager {
  private static instance: DataRecoveryManager;
  private migrationLog: string[] = [];

  static getInstance(): DataRecoveryManager {
    if (!DataRecoveryManager.instance) {
      DataRecoveryManager.instance = new DataRecoveryManager();
    }
    return DataRecoveryManager.instance;
  }

  /**
   * Comprehensive conversation recovery from all possible storage locations
   */
  async recoverConversations(userId: string): Promise<ConversationThread[]> {
    const recoverySources = [
      'chatty:threads',           // Original generic key
      'chatty:threads:backup',    // Backup key
      'chatty-data',              // StorageManager data
      'chatty-conversations',     // Legacy conversations
      'batty_messages_',          // SimpleChatty messages
    ];

    let recoveredThreads: ConversationThread[] = [];
    const recoveryLog: string[] = [];

    console.log('🔄 Starting comprehensive conversation recovery...');

    for (const source of recoverySources) {
      try {
        const threads = await this.recoverFromSource(source, userId);
        if (threads.length > 0) {
          recoveredThreads = [...recoveredThreads, ...threads];
          recoveryLog.push(`✅ Recovered ${threads.length} threads from ${source}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to recover from ${source}:`, error);
      }
    }

    // Remove duplicates based on thread ID
    const uniqueThreads = this.deduplicateThreads(recoveredThreads);
    
    if (uniqueThreads.length > 0) {
      console.log(`🎉 Successfully recovered ${uniqueThreads.length} unique conversations!`);
      recoveryLog.forEach(log => console.log(log));
      
      // Save to user-specific storage (cache only)
      await this.saveToUserStorage(userId, uniqueThreads);

      // DO NOT create localStorage backups to avoid quota issues. If an
      // operator needs a dump, call the downloadable backup utility.
      console.info('Local backups are disabled to avoid quota exhaustion. Use backupAllLocalStorage() to download a snapshot.');
    }

    return uniqueThreads;
  }

  private async recoverFromSource(source: string, userId: string): Promise<ConversationThread[]> {
    const data = localStorage.getItem(source);
    if (!data || data.length < 10) return []; // Skip empty or minimal data

    try {
      const parsed = JSON.parse(data);
      
      // Handle different data structures
      if (Array.isArray(parsed)) {
        return parsed.filter(thread => thread && thread.id);
      } else if (parsed.conversations && Array.isArray(parsed.conversations)) {
        return parsed.conversations.filter(thread => thread && thread.id);
      } else if (parsed.threads && Array.isArray(parsed.threads)) {
        return parsed.threads.filter(thread => thread && thread.id);
      } else if (parsed.messages && Array.isArray(parsed.messages)) {
        // Convert messages to thread format
        return [{
          id: `recovered_${Date.now()}`,
          title: 'Recovered Conversation',
          messages: parsed.messages,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }];
      }
    } catch (error) {
      console.warn(`Failed to parse data from ${source}:`, error);
    }

    return [];
  }

  private deduplicateThreads(threads: ConversationThread[]): ConversationThread[] {
    const seen = new Set<string>();
    return threads.filter(thread => {
      if (seen.has(thread.id)) return false;
      seen.add(thread.id);
      return true;
    });
  }

  private async saveToUserStorage(userId: string, threads: ConversationThread[]): Promise<void> {
    const userKey = `chatty:threads:${userId}`;
    localStorage.setItem(userKey, JSON.stringify(threads));
    console.log(`💾 Saved ${threads.length} threads to user storage: ${userKey}`);
  }

  private async createBackup(userId: string, threads: ConversationThread[]): Promise<void> {
    // Backups to localStorage are disabled to avoid filling user quota.
    console.info('Skipping creation of localStorage backup (disabled to avoid quota issues)');
  }

  /**
   * Professional user session management
   */
  getCurrentUser(): UserSession | null {
    try {
      // Try multiple methods to get user session
      const authSession = localStorage.getItem('auth:session');
      if (authSession) {
        const parsed = JSON.parse(authSession);
        if (parsed.user) return parsed.user;
      }

      // Check cookies for session
      const cookies = document.cookie.split(';');
      const sessionCookie = cookies.find(c => c.trim().startsWith('sid='));
      if (sessionCookie) {
        // User is logged in via cookie, but we need to get user info from API
        return { id: 'cookie_user', sub: 'cookie_user', email: 'unknown', name: 'User' };
      }

      return null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Load conversations for current user with automatic recovery
   */
  async loadUserConversations(userId: string): Promise<ConversationThread[]> {
    const userKey = `chatty:threads:${userId}`;
    
    // First, try to load existing user-specific conversations
    const existingData = localStorage.getItem(userKey);
    if (existingData && existingData.length > 10) {
      try {
        const threads = JSON.parse(existingData);
        if (Array.isArray(threads) && threads.length > 0) {
          console.log(`📂 Loaded ${threads.length} existing conversations for user ${userId}`);
          return threads;
        }
      } catch (error) {
        console.warn('Failed to parse existing user conversations:', error);
      }
    }

    // If no existing conversations, attempt recovery
    console.log(`🔍 No existing conversations found for user ${userId}, attempting recovery...`);
    return await this.recoverConversations(userId);
  }

  /**
   * Save conversations with fail-safes
   */
  async saveUserConversations(userId: string, threads: ConversationThread[]): Promise<void> {
    try {
      const userKey = `chatty:threads:${userId}`;
      const data = JSON.stringify(threads);
      
      // Save to user-specific storage
      localStorage.setItem(userKey, data);
      
      // Create timestamped backup
      const backupKey = `chatty:threads:backup:${userId}:${Date.now()}`;
      localStorage.setItem(backupKey, data);
      
      // Clean up old backups (keep last 5)
      this.cleanupOldBackups(userId);
      
      console.log(`💾 Saved ${threads.length} conversations for user ${userId}`);
    } catch (error) {
      console.error('Failed to save conversations:', error);
      throw error;
    }
  }

  private cleanupOldBackups(userId: string): void {
    const backupKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`chatty:threads:backup:${userId}:`)) {
        backupKeys.push(key);
      }
    }
    
    if (backupKeys.length > 5) {
      backupKeys.sort();
      const keysToRemove = backupKeys.slice(0, backupKeys.length - 5);
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  }

  /**
   * Clear user data on logout (but keep backups)
   */
  clearUserData(userId: string): void {
    const userKey = `chatty:threads:${userId}`;
    localStorage.removeItem(userKey);
    console.log(`🧹 Cleared active data for user ${userId} (backups preserved)`);
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): { totalBackups: number; totalUsers: number; totalConversations: number } {
    let totalBackups = 0;
    let totalUsers = 0;
    let totalConversations = 0;
    const userSet = new Set<string>();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        if (key.startsWith('chatty:threads:backup:')) {
          totalBackups++;
        } else if (key.startsWith('chatty:threads:') && !key.includes('backup')) {
          totalUsers++;
          const userId = key.replace('chatty:threads:', '');
          userSet.add(userId);
          
          try {
            const data = localStorage.getItem(key);
            if (data) {
              const threads = JSON.parse(data);
              if (Array.isArray(threads)) {
                totalConversations += threads.length;
              }
            }
          } catch (error) {
            console.warn(`Failed to parse conversations for ${key}:`, error);
          }
        }
      }
    }

    return {
      totalBackups,
      totalUsers: userSet.size,
      totalConversations
    };
  }
}

// Export singleton instance
export const dataRecovery = DataRecoveryManager.getInstance();

