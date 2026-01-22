import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { 
  ChattySettings, 
  PersonalizationSettings, 
  NotificationSettings, 
  GeneralSettings,
  SecuritySettings,
  DataControlSettings,
  ParentalControlSettings,
  AccountSettings,
  BackupSettings,
  SettingsContextType 
} from '../types/settings';

// Default settings
const DEFAULT_PERSONALIZATION: PersonalizationSettings = {
  enableCustomization: false,
  allowMemory: false,
  nickname: '',
  occupation: '',
  tags: [],
  aboutYou: ''
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  responsesPush: true,
  tasksPush: true,
  tasksEmail: true,
  recommendationsPush: true,
  recommendationsEmail: true
};

const DEFAULT_GENERAL: GeneralSettings = {
  theme: 'system',
  accentColor: 'Default',
  language: 'Auto-detect',
  spokenLanguage: 'Auto-detect',
  voice: 'Maple',
  showAdditionalModels: true
};

const DEFAULT_SECURITY: SecuritySettings = {
  twoFactorEnabled: false,
  sessionTimeout: 30,
  loginNotifications: true,
  suspiciousActivityAlerts: true
};

const DEFAULT_DATA_CONTROLS: DataControlSettings = {
  dataStorage: 'local',
  enableVVAULTMemory: false,
  memoryRetentionDays: 30,
  autoBackup: false,
  backupFrequency: 'weekly',
  dataExport: false,
  improveModel: false,
  remoteBrowserData: false
};

const DEFAULT_PARENTAL_CONTROLS: ParentalControlSettings = {
  enabled: false,
  contentFiltering: false,
  timeRestrictions: false,
  allowedHours: { start: '08:00', end: '22:00' }
};

const DEFAULT_ACCOUNT: AccountSettings = {
  email: '',
  name: '',
  accountType: 'free',
  subscriptionStatus: 'active'
};

const DEFAULT_BACKUP: BackupSettings = {
  autoBackup: false,
  backupFrequency: 'weekly',
  cloudSync: false,
  localBackup: true
};

const DEFAULT_SETTINGS: ChattySettings = {
  // Core settings (existing)
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  enableMemory: true,
  enableReasoning: true,
  enableFileProcessing: true,
  enableNarrativeSynthesis: true,
  enableLargeFileIntelligence: true,
  enableZenMode: true,
  theme: 'dark',
  maxHistory: 100,
  autoSave: true,
  memoryRetentionDays: 30,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  chunkSize: 1000,
  reasoningDepth: 3,
  showDebugPanel: false,
  showAdvancedFeatures: false,
  compactMode: false,

  // New comprehensive settings
  personalization: DEFAULT_PERSONALIZATION,
  notifications: DEFAULT_NOTIFICATIONS,
  general: DEFAULT_GENERAL,
  security: DEFAULT_SECURITY,
  dataControls: DEFAULT_DATA_CONTROLS,
  parentalControls: DEFAULT_PARENTAL_CONTROLS,
  account: DEFAULT_ACCOUNT,
  backup: DEFAULT_BACKUP
};

const STORAGE_KEY = "chatty_settings_v2";

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ChattySettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge with defaults to handle new settings
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }
    setLoaded(true);
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (!loaded) return;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }
  }, [loaded, settings]);

  const updateSettings = useCallback((updates: Partial<ChattySettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const updatePersonalization = useCallback(async (updates: Partial<PersonalizationSettings>) => {
    const newPersonalization = { ...settings.personalization, ...updates };
    setSettings(prev => ({
      ...prev,
      personalization: newPersonalization
    }));
    
    // Sync to VVAULT profile.json in background
    try {
      const response = await fetch('/api/vvault/profile/personalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newPersonalization)
      });
      
      if (!response.ok) {
        console.warn('[SettingsContext] Failed to sync personalization to profile:', response.statusText);
      }
    } catch (error) {
      // Don't block UI if sync fails - just log warning
      console.warn('[SettingsContext] Failed to sync personalization to profile:', error);
    }
  }, [settings.personalization]);

  const updateNotifications = useCallback((updates: Partial<NotificationSettings>) => {
    setSettings(prev => ({
      ...prev,
      notifications: { ...prev.notifications, ...updates }
    }));
  }, []);

  const updateGeneral = useCallback((updates: Partial<GeneralSettings>) => {
    setSettings(prev => ({
      ...prev,
      general: { ...prev.general, ...updates }
    }));
  }, []);

  const updateSecurity = useCallback((updates: Partial<SecuritySettings>) => {
    setSettings(prev => ({
      ...prev,
      security: { ...prev.security, ...updates }
    }));
  }, []);

  const updateDataControls = useCallback((updates: Partial<DataControlSettings>) => {
    setSettings(prev => ({
      ...prev,
      dataControls: { ...prev.dataControls, ...updates }
    }));
  }, []);

  const updateParentalControls = useCallback((updates: Partial<ParentalControlSettings>) => {
    setSettings(prev => ({
      ...prev,
      parentalControls: { ...prev.parentalControls, ...updates }
    }));
  }, []);

  const updateAccount = useCallback((updates: Partial<AccountSettings>) => {
    setSettings(prev => ({
      ...prev,
      account: { ...prev.account, ...updates }
    }));
  }, []);

  const updateBackup = useCallback((updates: Partial<BackupSettings>) => {
    setSettings(prev => ({
      ...prev,
      backup: { ...prev.backup, ...updates }
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const exportSettings = useCallback(() => {
    return JSON.stringify(settings, null, 2);
  }, [settings]);

  const importSettings = useCallback((jsonData: string) => {
    try {
      const imported = JSON.parse(jsonData);
      setSettings({ ...DEFAULT_SETTINGS, ...imported });
      return true;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  }, []);

  const contextValue = useMemo(() => ({
    settings,
    updateSettings,
    updatePersonalization,
    updateNotifications,
    updateGeneral,
    updateSecurity,
    updateDataControls,
    updateParentalControls,
    updateAccount,
    updateBackup,
    resetSettings,
    exportSettings,
    importSettings,
    loaded
  }), [
    settings,
    updateSettings,
    updatePersonalization,
    updateNotifications,
    updateGeneral,
    updateSecurity,
    updateDataControls,
    updateParentalControls,
    updateAccount,
    updateBackup,
    resetSettings,
    exportSettings,
    importSettings,
    loaded
  ]);

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);if (context === undefined) {throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
