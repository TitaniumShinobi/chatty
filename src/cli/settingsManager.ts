// settingsManager.ts - CLI settings and configuration management

import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

export interface CLISettings {
  // Display settings
  showTimestamps: boolean;
  showModelInfo: boolean;
  showPerformanceMetrics: boolean;
  colorScheme: 'default' | 'dark' | 'light' | 'minimal';
  
  // Memory settings
  maxHistoryMessages: number;
  maxContextLength: number;
  enableMemoryPruning: boolean;
  enableContextCompression: boolean;
  
  // Performance settings
  defaultTimeout: number;
  enableTimeoutFallback: boolean;
  enableFastSummary: boolean;
  
  // Model settings
  defaultModel: string;
  autoSwitchModel: boolean;
  
  // File operations
  defaultFileOperationsPath: string;
  enableFileOperations: boolean;
  
  // Conversation settings
  autoSaveConversations: boolean;
  conversationSavePath: string;
  
  // Advanced settings
  enableDebugMode: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  enableExternalMessaging: boolean;
}

export class SettingsManager {
  private settingsFile: string;
  private settings: CLISettings;

  constructor(settingsFile = './chatty-cli-settings.json') {
    this.settingsFile = path.resolve(settingsFile);
    this.settings = this.getDefaultSettings();
    this.loadSettings();
  }

  /**
   * Get default settings
   */
  private getDefaultSettings(): CLISettings {
    return {
      // Display settings
      showTimestamps: true,
      showModelInfo: false,
      showPerformanceMetrics: false,
      colorScheme: 'default',
      
      // Memory settings
      maxHistoryMessages: 50,
      maxContextLength: 8000,
      enableMemoryPruning: true,
      enableContextCompression: true,
      
      // Performance settings
      defaultTimeout: 45000,
      enableTimeoutFallback: true,
      enableFastSummary: true,
      
      // Model settings
      defaultModel: 'synth',
      autoSwitchModel: false,
      
      // File operations
      defaultFileOperationsPath: process.cwd(),
      enableFileOperations: true,
      
      // Conversation settings
      autoSaveConversations: false,
      conversationSavePath: './chatty-conversations',
      
      // Advanced settings
      enableDebugMode: false,
      logLevel: 'info',
      enableExternalMessaging: true
    };
  }

  /**
   * Load settings from file
   */
  private async loadSettings(): Promise<void> {
    try {
      const content = await readFile(this.settingsFile, 'utf-8');
      const loadedSettings = JSON.parse(content);
      
      // Merge with defaults to handle new settings
      this.settings = { ...this.settings, ...loadedSettings };
    } catch (error) {
      // File doesn't exist or is invalid, use defaults
      await this.saveSettings();
    }
  }

  /**
   * Save settings to file
   */
  async saveSettings(): Promise<void> {
    try {
      const content = JSON.stringify(this.settings, null, 2);
      await writeFile(this.settingsFile, content);
    } catch (error: any) {
      throw new Error(`Failed to save settings: ${error.message}`);
    }
  }

  /**
   * Get a setting value
   */
  get<K extends keyof CLISettings>(key: K): CLISettings[K] {
    return this.settings[key];
  }

  /**
   * Set a setting value
   */
  async set<K extends keyof CLISettings>(key: K, value: CLISettings[K]): Promise<void> {
    this.settings[key] = value;
    await this.saveSettings();
  }

  /**
   * Get all settings
   */
  getAll(): CLISettings {
    return { ...this.settings };
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults(): Promise<void> {
    this.settings = this.getDefaultSettings();
    await this.saveSettings();
  }

  /**
   * Update multiple settings at once
   */
  async updateSettings(updates: Partial<CLISettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };
    await this.saveSettings();
  }

  /**
   * Get settings as formatted string for display
   */
  getFormattedSettings(): string {
    const sections = [
      {
        title: '🎨 Display Settings',
        settings: [
          { key: 'showTimestamps', label: 'Show timestamps', type: 'boolean' },
          { key: 'showModelInfo', label: 'Show model info', type: 'boolean' },
          { key: 'showPerformanceMetrics', label: 'Show performance metrics', type: 'boolean' },
          { key: 'colorScheme', label: 'Color scheme', type: 'select', options: ['default', 'dark', 'light', 'minimal'] }
        ]
      },
      {
        title: '🧠 Memory Settings',
        settings: [
          { key: 'maxHistoryMessages', label: 'Max history messages', type: 'number' },
          { key: 'maxContextLength', label: 'Max context length', type: 'number' },
          { key: 'enableMemoryPruning', label: 'Enable memory pruning', type: 'boolean' },
          { key: 'enableContextCompression', label: 'Enable context compression', type: 'boolean' }
        ]
      },
      {
        title: '⚡ Performance Settings',
        settings: [
          { key: 'defaultTimeout', label: 'Default timeout (ms)', type: 'number' },
          { key: 'enableTimeoutFallback', label: 'Enable timeout fallback', type: 'boolean' },
          { key: 'enableFastSummary', label: 'Enable fast summary', type: 'boolean' }
        ]
      },
      {
        title: '🤖 Model Settings',
        settings: [
          { key: 'defaultModel', label: 'Default model', type: 'text' },
          { key: 'autoSwitchModel', label: 'Auto switch model', type: 'boolean' }
        ]
      },
      {
        title: '📁 File Operations',
        settings: [
          { key: 'defaultFileOperationsPath', label: 'Default file operations path', type: 'text' },
          { key: 'enableFileOperations', label: 'Enable file operations', type: 'boolean' }
        ]
      },
      {
        title: '💬 Conversation Settings',
        settings: [
          { key: 'autoSaveConversations', label: 'Auto save conversations', type: 'boolean' },
          { key: 'conversationSavePath', label: 'Conversation save path', type: 'text' }
        ]
      },
      {
        title: '🔧 Advanced Settings',
        settings: [
          { key: 'enableDebugMode', label: 'Enable debug mode', type: 'boolean' },
          { key: 'logLevel', label: 'Log level', type: 'select', options: ['error', 'warn', 'info', 'debug'] },
          { key: 'enableExternalMessaging', label: 'Enable external messaging', type: 'boolean' }
        ]
      }
    ];

    let output = '';
    
    for (const section of sections) {
      output += `${section.title}\n`;
      output += '─'.repeat(section.title.length) + '\n';
      
      for (const setting of section.settings) {
        const value = this.settings[setting.key as keyof CLISettings];
        const formattedValue = this.formatSettingValue(value, setting.type);
        output += `  ${setting.label}: ${formattedValue}\n`;
      }
      
      output += '\n';
    }
    
    return output.trim();
  }

  /**
   * Format setting value for display
   */
  private formatSettingValue(value: any, type: string): string {
    switch (type) {
      case 'boolean':
        return value ? '✅ Enabled' : '❌ Disabled';
      case 'number':
        return value.toString();
      case 'select':
        return value;
      case 'text':
        return `"${value}"`;
      default:
        return String(value);
    }
  }

  /**
   * Validate setting value
   */
  validateSetting<K extends keyof CLISettings>(key: K, value: any): boolean {
    const setting = this.settings[key];
    
    // Type validation
    if (typeof value !== typeof setting) {
      return false;
    }
    
    // Specific validations
    switch (key) {
      case 'maxHistoryMessages':
        return typeof value === 'number' && value > 0 && value <= 1000;
      case 'maxContextLength':
        return typeof value === 'number' && value > 0 && value <= 50000;
      case 'defaultTimeout':
        return typeof value === 'number' && value > 0 && value <= 300000;
      case 'colorScheme':
        return ['default', 'dark', 'light', 'minimal'].includes(value);
      case 'logLevel':
        return ['error', 'warn', 'info', 'debug'].includes(value);
      case 'defaultModel':
        return typeof value === 'string' && value.length > 0;
      default:
        return true;
    }
  }

  /**
   * Get settings file path
   */
  getSettingsFilePath(): string {
    return this.settingsFile;
  }

  /**
   * Export settings to file
   */
  async exportSettings(exportPath: string): Promise<void> {
    const content = JSON.stringify(this.settings, null, 2);
    await writeFile(exportPath, content);
  }

  /**
   * Import settings from file
   */
  async importSettings(importPath: string): Promise<void> {
    const content = await readFile(importPath, 'utf-8');
    const importedSettings = JSON.parse(content);
    
    // Validate imported settings
    for (const [key, value] of Object.entries(importedSettings)) {
      if (key in this.settings && this.validateSetting(key as keyof CLISettings, value)) {
        this.settings[key as keyof CLISettings] = value as any;
      }
    }
    
    await this.saveSettings();
  }
}
