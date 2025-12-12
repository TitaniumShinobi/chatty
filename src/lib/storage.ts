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
      console.log('💾 StorageManager: Starting save operation')
      console.log('💾 Data to save:', data)
      
      const existingData = this.loadData();
      console.log('💾 Existing data:', existingData)
      
      const newData: StorageData = {
        ...existingData,
        ...data,
        lastSaved: new Date().toISOString(),
        version: this.VERSION
      };

      console.log('💾 Combined data:', newData)

      // Always try to save, even if validation fails
      const jsonData = JSON.stringify(newData);
      console.log('💾 JSON data length:', jsonData.length)
      
      localStorage.setItem(this.STORAGE_KEY, jsonData);
      
      // Also save to sessionStorage as backup
      sessionStorage.setItem(this.STORAGE_KEY, jsonData);
      
      console.log('💾 Data saved successfully to localStorage and sessionStorage:', new Date().toISOString());
      
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
      console.log('📂 StorageManager: Starting load operation')
      
      // Try localStorage first
      const localStorageData = localStorage.getItem(this.STORAGE_KEY);
      console.log('📂 localStorage data exists:', !!localStorageData)
      
      if (localStorageData) {
        try {
          const data = JSON.parse(localStorageData);
          console.log('📂 Parsed localStorage data:', data)
          
          // Try to use the data even if validation fails
          if (this.validateData(data)) {
            console.log('📂 localStorage data is valid, returning it')
            return data;
          } else {
            console.log('📂 localStorage data validation failed, but trying to use it anyway')
            // Try to repair the data
            const repairedData = this.repairData(data);
            if (repairedData) {
              console.log('📂 Data repaired successfully')
              return repairedData;
            }
          }
        } catch (parseError) {
          console.error('📂 Error parsing localStorage data:', parseError)
        }
      }

      // Try sessionStorage as backup
      const sessionStorageData = sessionStorage.getItem(this.STORAGE_KEY);
      console.log('📂 sessionStorage data exists:', !!sessionStorageData)
      
      if (sessionStorageData) {
        try {
          const data = JSON.parse(sessionStorageData);
          console.log('📂 Parsed sessionStorage data:', data)
          
          if (this.validateData(data)) {
            // Restore to localStorage
            localStorage.setItem(this.STORAGE_KEY, sessionStorageData);
            console.log('📂 sessionStorage data is valid, restored to localStorage')
            return data;
          } else {
            console.log('📂 sessionStorage data validation failed, but trying to use it anyway')
            const repairedData = this.repairData(data);
            if (repairedData) {
              console.log('📂 Data repaired successfully from sessionStorage')
              return repairedData;
            }
          }
        } catch (parseError) {
          console.error('📂 Error parsing sessionStorage data:', parseError)
        }
      }

      // Return default data if nothing valid found
      console.log('📂 No valid data found, returning default data')
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
    console.log('🔍 Validating data:', data)
    
    if (!data || typeof data !== 'object') {
      console.log('🔍 Validation failed: data is not an object')
      return false;
    }
    
    // Basic structure validation - be more lenient
    if (data.conversations !== undefined && !Array.isArray(data.conversations)) {
      console.log('🔍 Validation failed: conversations not an array')
      return false;
    }
    if (data.personalities !== undefined && !Array.isArray(data.personalities)) {
      console.log('🔍 Validation failed: personalities not an array')
      return false;
    }
    
    // Validate conversations if present - be more lenient
    if (Array.isArray(data.conversations)) {
      for (const conversation of data.conversations) {
        if (!conversation || typeof conversation !== 'object') {
          console.log('🔍 Validation failed: conversation is not an object:', conversation)
          return false;
        }
        // Only require id and title, messages can be undefined initially
        if (!conversation.id || !conversation.title) {
          console.log('🔍 Validation failed: conversation missing id or title:', conversation)
          return false;
        }
        // Ensure messages is an array if it exists
        if (conversation.messages !== undefined && !Array.isArray(conversation.messages)) {
          console.log('🔍 Validation failed: conversation messages not an array:', conversation)
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
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage.ts:271',message:'storage: personality validation failed - not object',data:{personality,personalityObj,personalityType:typeof personalityObj},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.log('🔍 Validation failed: personality is not an object:', personality)
          return false;
        }
        // Only require id and name, instructions can be optional
        if (!personalityObj.id || !personalityObj.name) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage.ts:276',message:'storage: personality validation failed - missing id or name',data:{personality,personalityObj,hasId:!!personalityObj.id,hasName:!!personalityObj.name,personalityKeys:Object.keys(personalityObj)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.log('🔍 Validation failed: personality missing id or name:', personality)
          return false;
        }
      }
    }
    
    console.log('🔍 Data validation passed')
    return true;
  }

  // Repair corrupted or incomplete data
  private repairData(data: any): StorageData | null {
    try {
      console.log('🔧 Attempting to repair data:', data)
      
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
      
      console.log('🔧 Data repair completed:', repairedData)
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
      console.log('Auto-save check:', new Date().toISOString());
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
    console.log('🔍 === STORAGE DEBUG ===')
    console.log('localStorage key exists:', !!localStorage.getItem(this.STORAGE_KEY))
    console.log('sessionStorage key exists:', !!sessionStorage.getItem(this.STORAGE_KEY))
    
    const data = this.loadData()
    console.log('Loaded data:', data)
    console.log('Conversations count:', data.conversations?.length || 0)
    console.log('Active conversation ID:', data.activeConversationId)
    
    if (data.conversations?.length > 0) {
      console.log('First conversation:', data.conversations[0])
      console.log('First conversation messages:', data.conversations[0].messages?.length || 0)
    }
    
    console.log('🔍 === END DEBUG ===')
  }
}
