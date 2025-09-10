import React from 'react';
import { Brain, Zap, Settings, Info } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';

interface ModeToggleProps {
  mode: 'simple' | 'advanced';
  onToggle: (mode: 'simple' | 'advanced') => void;
  className?: string;
}

export function ModeToggle({ mode, onToggle, className = '' }: ModeToggleProps) {
  const { settings } = useSettings();

  const handleToggle = () => {
    const newMode = mode === 'simple' ? 'advanced' : 'simple';
    onToggle(newMode);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Mode Toggle Button */}
      <button
        onClick={handleToggle}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
          mode === 'simple'
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {mode === 'simple' ? (
          <>
            <Zap size={16} />
            <span>Simple</span>
          </>
        ) : (
          <>
            <Brain size={16} />
            <span>Advanced</span>
          </>
        )}
      </button>

      {/* Mode Info */}
      <div className="flex items-center gap-1 text-app-gray-400">
        <Info size={14} />
        <span className="text-sm">
          {mode === 'simple' ? 'Clean & Fast' : 'Full Features'}
        </span>
      </div>

      {/* Feature Indicators */}
      {mode === 'advanced' && (
        <div className="flex items-center gap-2 text-xs">
          {settings.enableMemory && (
            <span className="px-2 py-1 bg-purple-600 text-white rounded-full">
              Memory
            </span>
          )}
          {settings.enableReasoning && (
            <span className="px-2 py-1 bg-orange-600 text-white rounded-full">
              Reasoning
            </span>
          )}
          {settings.enableFileProcessing && (
            <span className="px-2 py-1 bg-green-600 text-white rounded-full">
              Files
            </span>
          )}
          {settings.enableNarrativeSynthesis && (
            <span className="px-2 py-1 bg-pink-600 text-white rounded-full">
              Narrative
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Settings Panel Component
interface SettingsPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isVisible, onClose }: SettingsPanelProps) {
  const { settings, update } = useSettings();

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-app-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-app-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Settings size={20} />
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-app-gray-400 hover:text-white hover:bg-app-gray-700 rounded-lg transition-colors"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Core Settings */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">Core Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-white">OpenAI API Key</label>
                <input
                  type="password"
                  value={settings.openaiApiKey}
                  onChange={(e) => update({ openaiApiKey: e.target.value })}
                  className="px-3 py-2 bg-app-gray-700 border border-app-gray-600 rounded-lg text-white"
                  placeholder="sk-..."
                />
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-white">Model</label>
                <select
                  value={settings.model}
                  onChange={(e) => update({ model: e.target.value })}
                  className="px-3 py-2 bg-app-gray-700 border border-app-gray-600 rounded-lg text-white"
                >
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Advanced Features */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">Advanced Features</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-white">Enable Memory</label>
                <input
                  type="checkbox"
                  checked={settings.enableMemory}
                  onChange={(e) => update({ enableMemory: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-app-gray-700 border-app-gray-600 rounded focus:ring-blue-500"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-white">Enable Reasoning</label>
                <input
                  type="checkbox"
                  checked={settings.enableReasoning}
                  onChange={(e) => update({ enableReasoning: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-app-gray-700 border-app-gray-600 rounded focus:ring-blue-500"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-white">Enable File Processing</label>
                <input
                  type="checkbox"
                  checked={settings.enableFileProcessing}
                  onChange={(e) => update({ enableFileProcessing: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-app-gray-700 border-app-gray-600 rounded focus:ring-blue-500"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-white">Enable Narrative Synthesis</label>
                <input
                  type="checkbox"
                  checked={settings.enableNarrativeSynthesis}
                  onChange={(e) => update({ enableNarrativeSynthesis: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-app-gray-700 border-app-gray-600 rounded focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* UI Preferences */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">UI Preferences</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-white">Theme</label>
                <select
                  value={settings.theme}
                  onChange={(e) => update({ theme: e.target.value as 'dark' | 'light' })}
                  className="px-3 py-2 bg-app-gray-700 border border-app-gray-600 rounded-lg text-white"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-white">Show Debug Panel</label>
                <input
                  type="checkbox"
                  checked={settings.showDebugPanel}
                  onChange={(e) => update({ showDebugPanel: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-app-gray-700 border-app-gray-600 rounded focus:ring-blue-500"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-white">Compact Mode</label>
                <input
                  type="checkbox"
                  checked={settings.compactMode}
                  onChange={(e) => update({ compactMode: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-app-gray-700 border-app-gray-600 rounded focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
