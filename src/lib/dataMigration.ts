// Data Migration Utility - Migrate old localStorage data to new StorageManager format
import { StorageManager } from './storage'

export interface MigrationData {
  conversations?: any[];
  personalities?: any[];
  activePersonalityId?: string | null;
  activeConversationId?: string | null;
}

export class DataMigration {
  private static instance: DataMigration;
  private storageManager: StorageManager;

  private constructor() {
    this.storageManager = StorageManager.getInstance();
  }

  static getInstance(): DataMigration {
    if (!DataMigration.instance) {
      DataMigration.instance = new DataMigration();
    }
    return DataMigration.instance;
  }

  // Check if migration is needed and perform it
  async migrateIfNeeded(): Promise<boolean> {
    try {
      // Check for old localStorage data
      const oldConversations = localStorage.getItem('chatty-conversations');
      const oldPersonalities = localStorage.getItem('chatty-personalities');
      
      if (!oldConversations && !oldPersonalities) {
        return false; // No migration needed
      }

      console.log('Migrating old data to new StorageManager format...');

      const migrationData: MigrationData = {};

      // Migrate conversations
      if (oldConversations) {
        try {
          const conversations = JSON.parse(oldConversations);
          migrationData.conversations = conversations;
          console.log(`Migrated ${conversations.length} conversations`);
        } catch (error) {
          console.error('Error migrating conversations:', error);
        }
      }

      // Migrate personalities
      if (oldPersonalities) {
        try {
          const data = JSON.parse(oldPersonalities);
          migrationData.personalities = data.personalities || [];
          migrationData.activePersonalityId = data.activePersonalityId;
          console.log(`Migrated ${data.personalities?.length || 0} personalities`);
        } catch (error) {
          console.error('Error migrating personalities:', error);
        }
      }

      // Save migrated data to StorageManager
      if (Object.keys(migrationData).length > 0) {
        this.storageManager.saveData(migrationData);
        
        // Clean up old localStorage data
        localStorage.removeItem('chatty-conversations');
        localStorage.removeItem('chatty-personalities');
        
        console.log('Data migration completed successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error during data migration:', error);
      return false;
    }
  }

  // Export current data for backup
  exportData(): string {
    try {
      const data = this.storageManager.loadData();
      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error('Error exporting data:', error);
      return '';
    }
  }

  // Import data from backup
  importData(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);
      return this.storageManager.saveData(data);
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }

  // Get storage statistics
  getStorageStats(): any {
    try {
      return this.storageManager.getStorageStats();
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {};
    }
  }

  // Migrate old assistant prose to packets
  migrateProseToPackets(): boolean {
    try {
      const data = this.storageManager.loadData();
      let migrated = false;

      if (data.conversations) {
        data.conversations = data.conversations.map(conv => {
          if (conv.messages) {
            const updatedMessages = conv.messages.map((msg: any) => {
              if (msg.role === 'assistant' && typeof msg.content === 'string') {
                // Convert prose to "Acknowledged." packet
                return {
                  ...msg,
                  content: { op: 190, ts: Date.now() } // "Acknowledged."
                };
              }
              return msg;
            });
            
            if (JSON.stringify(conv.messages) !== JSON.stringify(updatedMessages)) {
              migrated = true;
              console.log(`Migrated prose in conversation: ${conv.id}`);
            }
            
            return { ...conv, messages: updatedMessages };
          }
          return conv;
        });
      }

      if (migrated) {
        this.storageManager.saveData(data);
        console.log('Prose migration completed successfully');
      }

      return migrated;
    } catch (error) {
      console.error('Error during prose migration:', error);
      return false;
    }
  }
}
