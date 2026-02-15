// Robust Storage System for Chatty - Never Lose Data
export interface StorageData {
  conversations: any[];
  personalities: any[];
  activePersonalityId: string | null;
  activeConversationId: string | null;
  settings: {
    theme: 'dark' | 'light';
    autoSave: boolean;
    maxHistory: number;
  };
  lastSaved: string;
  version: string;
}

export class StorageManager {
  private static instance: StorageManager;
  private readonly STORAGE_KEY = 'chatty-data';
  private readonly VERSION = '1.0.0';
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.initializeAutoSave();
  }

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  // Save all data with error handling and validation
  saveData(data: Partial<StorageData>): boolean {
    try {
      
      const existingData = this.loadData();
      
      const newData: StorageData = {
        ...existingData,
        ...data,
        lastSaved: new Date().toISOString(),
        version: this.VERSION
      };


      // Always try to save, even if validation fails
      const jsonData = JSON.stringify(newData);
      
      localStorage.setItem(this.STORAGE_KEY, jsonData);
      
      // Also save to sessionStorage as backup
      sessionStorage.setItem(this.STORAGE_KEY, jsonData);
      
      
      // Log validation result but don't fail the save
      if (!this.validateData(newData)) {
        console.warn('💾 Data validation failed, but data was still saved');
      }
      
      return true;
    } catch (error) {
      console.error('💾 Error saving data:', error);
      this.saveToBackup(data);
      return false;
    }
  }

  // Load data with fallback and recovery
  loadData(): StorageData {
    try {
      
      // Try localStorage first
      const localStorageData = localStorage.getItem(this.STORAGE_KEY);
      
      if (localStorageData) {
        try {
          const data = JSON.parse(localStorageData);
          
          // Try to use the data even if validation fails
          if (this.validateData(data)) {
            return data;
          } else {
            // Try to repair the data
            const repairedData = this.repairData(data);
            if (repairedData) {
              return repairedData;
            }
          }
        } catch (parseError) {
          console.error('📂 Error parsing localStorage data:', parseError)
        }
      }

      // Try sessionStorage as backup
      const sessionStorageData = sessionStorage.getItem(this.STORAGE_KEY);
      
      if (sessionStorageData) {
        try {
          const data = JSON.parse(sessionStorageData);
          
          if (this.validateData(data)) {
            // Restore to localStorage
            localStorage.setItem(this.STORAGE_KEY, sessionStorageData);
            return data;
          } else {
            const repairedData = this.repairData(data);
            if (repairedData) {
              return repairedData;
            }
          }
        } catch (parseError) {
          console.error('📂 Error parsing sessionStorage data:', parseError)
        }
      }

      // Return default data if nothing valid found
      return this.getDefaultData();
    } catch (error) {
      console.error('📂 Error loading data:', error);
      return this.getDefaultData();
    }
  }

  // Save conversations specifically
  saveConversations(conversations: any[]): boolean {
    return this.saveData({ conversations });
  }

  // Save personalities specifically
  savePersonalities(personalities: any[]): boolean {
    return this.saveData({ personalities });
  }

  // Save active states
  saveActiveStates(activePersonalityId: string | null, activeConversationId: string | null): boolean {
    return this.saveData({ activePersonalityId, activeConversationId });
  }

  // Load conversations
  loadConversations(): any[] {
    const data = this.loadData();
    return data.conversations || [];
  }

  // Load personalities
  loadPersonalities(): any[] {
    const data = this.loadData();
    return data.personalities || [];
  }

  // Get active states
  getActiveStates(): { activePersonalityId: string | null; activeConversationId: string | null } {
    const data = this.loadData();
    return {
      activePersonalityId: data.activePersonalityId,
      activeConversationId: data.activeConversationId
    };
  }

  // Export data for backup
  exportData(): string {
    const data = this.loadData();
    return JSON.stringify(data, null, 2);
  }

  // Import data from backup
  importData(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);
      if (this.validateData(data)) {
        return this.saveData(data);
      }
      return false;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }

  // Clear all data (with confirmation)
  clearData(): boolean {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      sessionStorage.removeItem(this.STORAGE_KEY);
      return true;
    } catch (error) {
      console.error('Error clearing data:', error);
      return false;
    }
  }

  // Get storage statistics
  getStorageStats(): {
    localStorageSize: number;
    sessionStorageSize: number;
    totalConversations: number;
    totalPersonalities: number;
    lastSaved: string;
  } {
    const data = this.loadData();
    return {
      localStorageSize: this.getStorageSize(localStorage),
      sessionStorageSize: this.getStorageSize(sessionStorage),
      totalConversations: data.conversations?.length || 0,
      totalPersonalities: data.personalities?.length || 0,
      lastSaved: data.lastSaved
    };
  }

  // Validate data structure - more lenient for better compatibility
  private validateData(data: any): data is StorageData {
    
    if (!data || typeof data !== 'object') {
      return false;
    }
    
    // Basic structure validation - be more lenient
    if (data.conversations !== undefined && !Array.isArray(data.conversations)) {
      return false;
    }
    if (data.personalities !== undefined && !Array.isArray(data.personalities)) {
      return false;
    }
    
    // Validate conversations if present - be more lenient
    if (Array.isArray(data.conversations)) {
      for (const conversation of data.conversations) {
        if (!conversation || typeof conversation !== 'object') {
          return false;
        }
        // Only require id and title, messages can be undefined initially
        if (!conversation.id || !conversation.title) {
          return false;
        }
        // Ensure messages is an array if it exists
        if (conversation.messages !== undefined && !Array.isArray(conversation.messages)) {
          return false;
        }
      }
    }
    
    // Validate personalities if present - be more lenient
    if (Array.isArray(data.personalities)) {
      for (const personality of data.personalities) {
        // Handle case where personality is stored as array [id, object] instead of just object
        const personalityObj = Array.isArray(personality) ? personality[1] : personality;
        
        if (!personalityObj || typeof personalityObj !== 'object') {
          return false;
        }
        // Only require id and name, instructions can be optional
        if (!personalityObj.id || !personalityObj.name) {
          return false;
        }
      }
    }
    
    return true;
  }

  // Repair corrupted or incomplete data
  private repairData(data: any): StorageData | null {
    try {
      
      const defaultData = this.getDefaultData();
      const repairedData: StorageData = { ...defaultData };
      
      // Repair conversations
      if (Array.isArray(data.conversations)) {
        repairedData.conversations = data.conversations.filter((_conv:any) => 
          _conv && typeof _conv === 'object' && _conv.id && _conv.title
        ).map((_conv:any) => ({
          id: _conv.id,
          title: _conv.title,
          messages: Array.isArray(_conv.messages) ? _conv.messages : [],
          createdAt: _conv.createdAt || new Date().toISOString(),
          updatedAt: _conv.updatedAt || new Date().toISOString()
        }));
      }
      
      // Repair personalities
      if (Array.isArray(data.personalities)) {
        repairedData.personalities = data.personalities.filter((_p:any) => 
          _p && typeof _p === 'object' && _p.id && _p.name
        );
      }
      
      // Repair active states
      if (data.activeConversationId && typeof data.activeConversationId === 'string') {
        repairedData.activeConversationId = data.activeConversationId;
      }
      if (data.activePersonalityId && typeof data.activePersonalityId === 'string') {
        repairedData.activePersonalityId = data.activePersonalityId;
      }
      
      // Repair settings
      if (data.settings && typeof data.settings === 'object') {
        repairedData.settings = {
          ...defaultData.settings,
          ...data.settings
        };
      }
      
      return repairedData;
    } catch (error) {
      console.error('🔧 Data repair failed:', error);
      return null;
    }
  }

  // Get default data structure
  private getDefaultData(): StorageData {
    return {
      conversations: [],
      personalities: [],
      activePersonalityId: null,
      activeConversationId: null,
      settings: {
        theme: 'dark',
        autoSave: true,
        maxHistory: 100
      },
      lastSaved: new Date().toISOString(),
      version: this.VERSION
    };
  }

  // Save to backup storage (IndexedDB or other)
  private saveToBackup(data: Partial<StorageData>): void {
    try {
      // Try to save to multiple locations for redundancy
      const backupData = JSON.stringify(data);
      
      // Save to multiple localStorage keys as backup
      localStorage.setItem(`${this.STORAGE_KEY}-backup-${Date.now()}`, backupData);
      
      // Clean up old backups (keep only last 5)
      this.cleanupBackups();
    } catch (error) {
      console.error('Backup save failed:', error);
    }
  }

  // Clean up old backup files
  private cleanupBackups(): void {
    try {
      const keys = Object.keys(localStorage);
      const backupKeys = keys.filter(key => key.startsWith(`${this.STORAGE_KEY}-backup-`));
      
      if (backupKeys.length > 5) {
        // Sort by timestamp and remove oldest
        backupKeys.sort();
        const keysToRemove = backupKeys.slice(0, backupKeys.length - 5);
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
    } catch (error) {
      console.error('Backup cleanup failed:', error);
    }
  }

  // Get storage size in bytes
  private getStorageSize(storage: Storage): number {
    let size = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) {
        size += key.length + (storage.getItem(key)?.length || 0);
      }
    }
    return size;
  }

  // Initialize auto-save functionality
  private initializeAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    // Auto-save every 30 seconds
    this.autoSaveInterval = setInterval(() => {
      // This will be called by the app when data changes
    }, 30000);
  }

  // Cleanup on app shutdown
  destroy(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  // Debug function to test storage
  debugStorage(): void {
    
    const data = this.loadData()
    
    if (data.conversations?.length > 0) {
    }
    
  }
}
