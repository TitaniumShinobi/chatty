// Theme Customizer Component
// Provides UI for users to create and manage custom themes

import React, { useState, useEffect } from 'react';
import { Palette, Download, Upload, RotateCcw, Check } from 'lucide-react';
import { themeManager, ThemeConfig } from '../lib/themeManager';
import { ThemeTokens, lightTheme, nightTheme } from '../lib/themeTokens';
import { Z_LAYERS } from '../lib/zLayers';

interface ThemeCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({ isOpen, onClose }) => {
  const [currentConfig, setCurrentConfig] = useState<ThemeConfig>({ mode: 'light' });
  const [customTheme, setCustomTheme] = useState<Partial<ThemeTokens>>({});
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    const unsubscribe = themeManager.subscribe((config) => {
      setCurrentConfig(config);
    });
    return unsubscribe;
  }, []);

  const handleThemeModeChange = (mode: 'light' | 'night' | 'custom') => {
    if (mode === 'custom') {
      setCustomTheme(lightTheme); // Start with light theme as base
    }
    themeManager.setThemeMode(mode, mode === 'custom' ? customTheme : undefined);
  };

  const handleCustomThemeChange = (key: keyof ThemeTokens, value: string) => {
    const updated = { ...customTheme, [key]: value };
    setCustomTheme(updated);
    
    if (currentConfig.mode === 'custom') {
      themeManager.updateCustomTheme(updated);
    }
  };

  const handlePreview = () => {
    if (currentConfig.mode === 'custom') {
      setIsPreview(!isPreview);
      if (!isPreview) {
        // Apply preview
        themeManager.setThemeMode('custom', customTheme);
      } else {
        // Revert to saved
        themeManager.setThemeMode('custom', currentConfig.customTheme);
      }
    }
  };

  const handleSave = () => {
    if (currentConfig.mode === 'custom') {
      themeManager.setThemeMode('custom', customTheme);
    }
    setIsPreview(false);
  };

  const handleReset = () => {
    setCustomTheme(lightTheme);
    if (currentConfig.mode === 'custom') {
      themeManager.setThemeMode('custom', lightTheme);
    }
  };

  const handleExport = () => {
    const themeData = themeManager.exportTheme();
    const blob = new Blob([themeData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatty-theme-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          themeManager.importTheme(content);
        } catch (error) {
          alert('Invalid theme file');
        }
      };
      reader.readAsText(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      style={{ zIndex: Z_LAYERS.modal }}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{ 
          backgroundColor: 'var(--chatty-bg-primary)',
          color: 'var(--chatty-text-primary)',
          border: '1px solid var(--chatty-interactive-primary)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--chatty-interactive-primary)' }}>
          <div className="flex items-center gap-3">
            <Palette size={24} style={{ color: 'var(--chatty-interactive-primary)' }} />
            <h2 className="text-xl font-semibold">Theme Customizer</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            style={{ 
              backgroundColor: 'var(--chatty-bg-tertiary)',
              color: 'var(--chatty-text-primary)'
            }}
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Theme Mode Selection */}
          <div>
            <h3 className="text-lg font-medium mb-4">Theme Mode</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { mode: 'light' as const, name: 'Light', description: 'Warm cream theme' },
                { mode: 'night' as const, name: 'Night', description: 'Dark cocoa theme' },
                { mode: 'custom' as const, name: 'Custom', description: 'Your own theme' }
              ].map(({ mode, name, description }) => (
                <button
                  key={mode}
                  onClick={() => handleThemeModeChange(mode)}
                  className={`p-4 rounded-lg border text-left transition-colors ${
                    currentConfig.mode === mode ? 'ring-2' : ''
                  }`}
                  style={{
                    backgroundColor: currentConfig.mode === mode 
                      ? 'var(--chatty-bg-tertiary)' 
                      : 'var(--chatty-bg-secondary)',
                    borderColor: 'var(--chatty-interactive-primary)',
                    color: 'var(--chatty-text-primary)'
                  }}
                >
                  <div className="font-medium">{name}</div>
                  <div className="text-sm opacity-70">{description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Theme Editor */}
          {currentConfig.mode === 'custom' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Custom Theme</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handlePreview}
                    className="px-3 py-1 rounded text-sm"
                    style={{ 
                      backgroundColor: 'var(--chatty-interactive-primary)',
                      color: 'var(--chatty-text-inverse)'
                    }}
                  >
                    {isPreview ? 'Revert' : 'Preview'}
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-3 py-1 rounded text-sm flex items-center gap-1"
                    style={{ 
                      backgroundColor: 'var(--chatty-status-success)',
                      color: 'white'
                    }}
                  >
                    <Check size={14} />
                    Save
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {Object.entries(lightTheme).map(([key, defaultValue]) => (
                  <div key={key}>
                    <label className="block text-sm font-medium mb-1 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={customTheme[key as keyof ThemeTokens] || defaultValue}
                        onChange={(e) => handleCustomThemeChange(key as keyof ThemeTokens, e.target.value)}
                        className="w-12 h-8 rounded border"
                        style={{ borderColor: 'var(--chatty-interactive-primary)' }}
                      />
                      <input
                        type="text"
                        value={customTheme[key as keyof ThemeTokens] || defaultValue}
                        onChange={(e) => handleCustomThemeChange(key as keyof ThemeTokens, e.target.value)}
                        className="flex-1 px-2 py-1 rounded border text-sm"
                        style={{ 
                          borderColor: 'var(--chatty-interactive-primary)',
                          backgroundColor: 'var(--chatty-bg-primary)',
                          color: 'var(--chatty-text-primary)'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded flex items-center gap-2"
                  style={{ 
                    backgroundColor: 'var(--chatty-bg-tertiary)',
                    color: 'var(--chatty-text-primary)'
                  }}
                >
                  <RotateCcw size={16} />
                  Reset to Light
                </button>
              </div>
            </div>
          )}

          {/* Import/Export */}
          <div>
            <h3 className="text-lg font-medium mb-4">Theme Management</h3>
            <div className="flex gap-4">
              <button
                onClick={handleExport}
                className="px-4 py-2 rounded flex items-center gap-2"
                style={{ 
                  backgroundColor: 'var(--chatty-interactive-primary)',
                  color: 'var(--chatty-text-inverse)'
                }}
              >
                <Download size={16} />
                Export Theme
              </button>
              
              <label className="px-4 py-2 rounded flex items-center gap-2 cursor-pointer"
                style={{ 
                  backgroundColor: 'var(--chatty-bg-tertiary)',
                  color: 'var(--chatty-text-primary)'
                }}
              >
                <Upload size={16} />
                Import Theme
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
