// Advanced Theme Management System
// Supports user-defined themes, theme switching, and persistence

import { ThemeTokens, CustomTheme, lightTheme, nightTheme, applyThemeTokens, validateTheme } from './themeTokens';

export type ThemeMode = 'light' | 'night' | 'custom';

export interface ThemeConfig {
  mode: ThemeMode;
  customTheme?: CustomTheme;
  autoSwitch?: boolean; // Auto-switch based on system preference
}

export class ThemeManager {
  private currentConfig: ThemeConfig;
  private listeners: Set<(config: ThemeConfig) => void> = new Set();

  constructor(initialConfig: ThemeConfig = { mode: 'light' }) {
    this.currentConfig = initialConfig;
    this.loadFromStorage();
    this.applyCurrentTheme();
  }

  // Get current theme tokens
  getCurrentTokens(): ThemeTokens {
    switch (this.currentConfig.mode) {
      case 'night':
        return nightTheme;
      case 'custom':
        return this.mergeCustomTheme(this.currentConfig.customTheme);
      default:
        return lightTheme;
    }
  }

  // Merge custom theme with base theme
  private mergeCustomTheme(custom?: CustomTheme): ThemeTokens {
    if (!custom) return lightTheme;
    
    return {
      ...lightTheme,
      ...custom,
    };
  }

  // Apply theme to document
  private applyCurrentTheme(): void {
    const tokens = this.getCurrentTokens();
    applyThemeTokens(tokens);
    
    // Update document class for CSS selectors
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-night', 'theme-custom');
    root.classList.add(`theme-${this.currentConfig.mode}`);
  }

  // Set theme mode
  setThemeMode(mode: ThemeMode, customTheme?: CustomTheme): void {
    if (mode === 'custom' && customTheme) {
      if (!validateTheme(customTheme)) {
        throw new Error('Invalid custom theme: missing required properties');
      }
      this.currentConfig.customTheme = customTheme;
    }
    
    this.currentConfig.mode = mode;
    this.applyCurrentTheme();
    this.saveToStorage();
    this.notifyListeners();
  }

  // Update custom theme
  updateCustomTheme(updates: Partial<ThemeTokens>): void {
    if (this.currentConfig.mode !== 'custom') {
      throw new Error('Cannot update custom theme when not in custom mode');
    }
    
    this.currentConfig.customTheme = {
      ...this.currentConfig.customTheme,
      ...updates,
    };
    
    this.applyCurrentTheme();
    this.saveToStorage();
    this.notifyListeners();
  }

  // Get available themes
  getAvailableThemes(): Array<{ name: string; description?: string; tokens: ThemeTokens }> {
    return [
      {
        name: 'Light',
        description: 'Warm cream theme for daytime use',
        tokens: lightTheme,
      },
      {
        name: 'Night',
        description: 'Dark cocoa theme for nighttime use', 
        tokens: nightTheme,
      },
      ...(this.currentConfig.customTheme ? [{
        name: this.currentConfig.customTheme.name,
        description: this.currentConfig.customTheme.description,
        tokens: this.mergeCustomTheme(this.currentConfig.customTheme),
      }] : []),
    ];
  }

  // Theme persistence
  private saveToStorage(): void {
    try {
      localStorage.setItem('chatty-theme-config', JSON.stringify(this.currentConfig));
    } catch (error) {
      console.warn('Failed to save theme config:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('chatty-theme-config');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.mode && ['light', 'night', 'custom'].includes(parsed.mode)) {
          this.currentConfig = parsed;
        }
      }
    } catch (error) {
      console.warn('Failed to load theme config:', error);
    }
  }

  // Event system
  subscribe(listener: (config: ThemeConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentConfig));
  }

  // Export/Import themes
  exportTheme(): string {
    return JSON.stringify(this.currentConfig, null, 2);
  }

  importTheme(themeJson: string): void {
    try {
      const imported = JSON.parse(themeJson);
      if (imported.mode && validateTheme(imported.customTheme || {})) {
        this.setThemeMode(imported.mode, imported.customTheme);
      }
    } catch (error) {
      throw new Error('Invalid theme file format');
    }
  }

  // System theme detection
  detectSystemTheme(): 'light' | 'dark' {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }

  // Auto-switch based on system preference
  enableAutoSwitch(): void {
    this.currentConfig.autoSwitch = true;
    
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        if (this.currentConfig.autoSwitch) {
          this.setThemeMode(e.matches ? 'night' : 'light');
        }
      };
      
      mediaQuery.addEventListener('change', handleChange);
    }
  }

  disableAutoSwitch(): void {
    this.currentConfig.autoSwitch = false;
  }
}

// Global theme manager instance
export const themeManager = new ThemeManager();
