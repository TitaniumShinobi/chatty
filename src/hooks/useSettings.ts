"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type AppSettings = {
  // Core settings (from Small Chatty)
  openaiApiKey: string;
  openaiBaseUrl: string;
  model: string;
  
  // Batty-specific settings
  enableMemory: boolean;
  enableReasoning: boolean;
  enableFileProcessing: boolean;
  enableNarrativeSynthesis: boolean;
  enableLargeFileIntelligence: boolean;
  theme: 'dark' | 'light';
  maxHistory: number;
  autoSave: boolean;
  
  // Advanced features
  memoryRetentionDays: number;
  maxFileSize: number;
  chunkSize: number;
  reasoningDepth: number;
  
  // UI preferences
  showDebugPanel: boolean;
  showAdvancedFeatures: boolean;
  compactMode: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  // Core settings
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  
  // Batty features
  enableMemory: true,
  enableReasoning: true,
  enableFileProcessing: true,
  enableNarrativeSynthesis: true,
  enableLargeFileIntelligence: true,
  theme: 'dark',
  maxHistory: 100,
  autoSave: true,
  
  // Advanced features
  memoryRetentionDays: 30,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  chunkSize: 1000,
  reasoningDepth: 3,
  
  // UI preferences
  showDebugPanel: false,
  showAdvancedFeatures: false,
  compactMode: false,
};

const STORAGE_KEY = "batty_settings_v1";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

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

  useEffect(() => {
    if (!loaded) return;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }
  }, [loaded, settings]);

  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
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

  // Computed values
  const isAdvancedMode = useMemo(() => 
    settings.showAdvancedFeatures || 
    settings.enableMemory || 
    settings.enableReasoning || 
    settings.enableFileProcessing
  , [settings]);

  const isSimpleMode = useMemo(() => !isAdvancedMode, [isAdvancedMode]);

  const hasApiKey = useMemo(() => 
    settings.openaiApiKey && settings.openaiApiKey.length > 0
  , [settings.openaiApiKey]);

  return useMemo(() => ({ 
    settings, 
    update, 
    reset,
    exportSettings,
    importSettings,
    loaded,
    isAdvancedMode,
    isSimpleMode,
    hasApiKey
  }), [
    loaded, 
    settings, 
    update, 
    reset,
    exportSettings,
    importSettings,
    isAdvancedMode,
    isSimpleMode,
    hasApiKey
  ]);
}
