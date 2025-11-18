// Enhanced settings types for Chatty
export interface PersonalizationSettings {
  enableCustomization: boolean;
  allowMemory: boolean;
  nickname: string;
  occupation: string;
  tags: string[];
  aboutYou: string;
}

export interface NotificationSettings {
  responsesPush: boolean;
  tasksPush: boolean;
  tasksEmail: boolean;
  recommendationsPush: boolean;
  recommendationsEmail: boolean;
}

export interface GeneralSettings {
  theme: 'system' | 'light' | 'night';
  accentColor: string;
  language: string;
  spokenLanguage: string;
  voice: string;
  showAdditionalModels: boolean;
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  sessionTimeout: number;
  loginNotifications: boolean;
  suspiciousActivityAlerts: boolean;
}

export interface DataControlSettings {
  dataStorage: 'local' | 'cloud' | 'hybrid';
  enableVVAULTMemory: boolean;
  memoryRetentionDays: number;
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  dataExport: boolean;
  improveModel: boolean;
  remoteBrowserData: boolean;
}

export interface ParentalControlSettings {
  enabled: boolean;
  contentFiltering: boolean;
  timeRestrictions: boolean;
  allowedHours: { start: string; end: string };
}

export interface AccountSettings {
  email: string;
  name: string;
  accountType: 'free' | 'premium' | 'enterprise';
  subscriptionStatus: string;
}

export interface BackupSettings {
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  cloudSync: boolean;
  localBackup: boolean;
}

export interface ChattySettings {
  // Core settings (existing)
  openaiApiKey: string;
  openaiBaseUrl: string;
  model: string;
  enableMemory: boolean;
  enableReasoning: boolean;
  enableFileProcessing: boolean;
  enableNarrativeSynthesis: boolean;
  enableLargeFileIntelligence: boolean;
  enableSynthMode: boolean;
  theme: 'night' | 'light';
  maxHistory: number;
  autoSave: boolean;
  memoryRetentionDays: number;
  maxFileSize: number;
  chunkSize: number;
  reasoningDepth: number;
  showDebugPanel: boolean;
  showAdvancedFeatures: boolean;
  compactMode: boolean;

  // New comprehensive settings
  personalization: PersonalizationSettings;
  notifications: NotificationSettings;
  general: GeneralSettings;
  security: SecuritySettings;
  dataControls: DataControlSettings;
  parentalControls: ParentalControlSettings;
  account: AccountSettings;
  backup: BackupSettings;
}

export type SettingsTab = 
  | 'general' 
  | 'notifications' 
  | 'personalization' 
  | 'apps' 
  | 'schedules' 
  | 'orders' 
  | 'data' 
  | 'security' 
  | 'parental' 
  | 'account' 
  | 'backup';

export interface SettingsContextType {
  settings: ChattySettings;
  updateSettings: (updates: Partial<ChattySettings>) => void;
  updatePersonalization: (updates: Partial<PersonalizationSettings>) => void;
  updateNotifications: (updates: Partial<NotificationSettings>) => void;
  updateGeneral: (updates: Partial<GeneralSettings>) => void;
  updateSecurity: (updates: Partial<SecuritySettings>) => void;
  updateDataControls: (updates: Partial<DataControlSettings>) => void;
  updateParentalControls: (updates: Partial<ParentalControlSettings>) => void;
  updateAccount: (updates: Partial<AccountSettings>) => void;
  updateBackup: (updates: Partial<BackupSettings>) => void;
  resetSettings: () => void;
  exportSettings: () => string;
  importSettings: (jsonData: string) => boolean;
  loaded: boolean;
}
