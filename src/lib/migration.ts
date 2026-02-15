// src/lib/migration.ts
import type { User } from './auth';

export interface ConversationThread {
  id: string;
  title: string;
  messages: any[];
}

/**
 * Migrates conversations from legacy localStorage keys to user-specific keys
 */
export function migrateConversations(userId: string): boolean {
  const legacyKey = 'chatty:threads';
  const newKey = `chatty:threads:${userId}`;
  
  try {
    // Check if legacy data exists
    const legacyData = localStorage.getItem(legacyKey);
    if (!legacyData) {
      return false;
    }
    
    // Check if user-specific data already exists
    const existingUserData = localStorage.getItem(newKey);
    if (existingUserData) {
      return false;
    }
    
    // Parse and validate legacy data
    const threads: ConversationThread[] = JSON.parse(legacyData);
    if (!Array.isArray(threads)) {
      console.error('❌ Legacy data is not a valid array');
      return false;
    }
    
    // Migrate to user-specific storage
    localStorage.setItem(newKey, legacyData);
    
  // Note: we intentionally avoid creating timestamped localStorage
  // backups to prevent quota exhaustion. Operators who need a full
  // dump can call the downloadable backup utility.
    
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return false;
  }
}

/**
 * Gets all localStorage keys related to chatty conversations
 */
export function getAllChattyKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('chatty:')) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Creates a comprehensive backup of all chatty data
 */
export function createFullBackup(): { [key: string]: any } {
  const backup: { [key: string]: any } = {};
  const keys = getAllChattyKeys();
  
  keys.forEach(key => {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        backup[key] = JSON.parse(data);
      }
    } catch (error) {
      console.error(`Failed to backup key ${key}:`, error);
      backup[key] = localStorage.getItem(key); // Store as string if JSON parsing fails
    }
  });
  
  return backup;
}

/**
 * Saves backup to localStorage with timestamp
 */
export function saveBackupToStorage(backup: { [key: string]: any }): string {
  const timestamp = Date.now();
  const backupKey = `chatty:full_backup:${timestamp}`;
  localStorage.setItem(backupKey, JSON.stringify(backup));
  return backupKey;
}

/**
 * Cleans up old backups (keeps last 5)
 */
export function cleanupOldBackups(): void {
  const backupKeys: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('chatty:threads:backup:') || key.startsWith('chatty:full_backup:'))) {
      backupKeys.push(key);
    }
  }
  
  // Sort by timestamp (newest first)
  backupKeys.sort((a, b) => {
    const timestampA = parseInt(a.split(':').pop() || '0');
    const timestampB = parseInt(b.split(':').pop() || '0');
    return timestampB - timestampA;
  });
  
  // Remove old backups (keep last 3)
  if (backupKeys.length > 3) {
    const toRemove = backupKeys.slice(3);
    toRemove.forEach(key => {
      localStorage.removeItem(key);
    });
  }
}

/**
 * Surgical migration of user data from legacy storage to user-scoped storage
 * This is a recovery fix for symbolic scoping breach
 */
export async function migrateUserData(user: User): Promise<boolean> {
  // 🚨 CRITICAL: Abort if user.sub is undefined
  if (!user.sub) {
    console.error('❌ Migration aborted: user.sub is undefined');
    return false;
  }

  const userId = user.sub;
  const legacyKey = 'chatty:threads';
  const userKey = `chatty:threads:${userId}`;
  const backupKey = 'chatty:threads:backup';
  const migrationRecordKey = `chatty:migration:${userId}:${Date.now()}`;


  try {
    // Step 1: Check if legacy data exists
    const legacyData = localStorage.getItem(legacyKey);
    if (!legacyData) {
      return false;
    }

    // Step 2: Check if user already has migrated data
    const existingUserData = localStorage.getItem(userKey);
    if (existingUserData) {
      return false;
    }

    // Step 3: Validate legacy data
    let legacyThreads;
    try {
      legacyThreads = JSON.parse(legacyData);
      if (!Array.isArray(legacyThreads)) {
        throw new Error('Legacy data is not an array');
      }
    } catch (error) {
      console.error('❌ Invalid legacy data format:', error);
      return false;
    }


  // Step 4: Skip backup creation - backend is the backup. Avoid
  // writing large backups into localStorage which may cause quota
  // exhaustion.

    // Step 5: Migrate data to user-specific key
    localStorage.setItem(userKey, legacyData);

    // Step 6: Create migration record
    const migrationRecord = {
      timestamp: Date.now(),
      userId: userId,
      userEmail: user.email,
      legacyKey: legacyKey,
      userKey: userKey,
      backupKey: backupKey,
      conversationCount: legacyThreads.length,
      status: 'completed'
    };
    localStorage.setItem(migrationRecordKey, JSON.stringify(migrationRecord));

    return true;

  } catch (error) {
    console.error('❌ Migration failed:', error);
    
    // Create error record
    const errorRecord = {
      timestamp: Date.now(),
      userId: userId,
      userEmail: user.email,
      error: error.message,
      status: 'failed'
    };
    localStorage.setItem(`chatty:migration:error:${userId}:${Date.now()}`, JSON.stringify(errorRecord));
    
    return false;
  }
}

/**
 * Comprehensive migration and backup process
 */
export function runFullMigration(user: User): boolean {
  const userId = user.sub || user.email || 'unknown';
  
  // Create full backup first
  // WARNING: Creating full backups in localStorage can exhaust quota. We
  // will NOT automatically persist the full backup here. Use createFullBackup()
  // to obtain a structured backup and then download it via UI if needed.
  
  // Run migration
  const migrated = migrateConversations(userId);
  
  // Clean up legacy backups (best-effort)
  cleanupOldBackups();
  
  if (migrated) {
  } else {
  }
  
  return migrated;
}
