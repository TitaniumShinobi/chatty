import React, { useState } from 'react';
import { Palette, Globe, Volume2, Play, Check, Sun, Moon, Monitor } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../lib/ThemeContext';
import StarToggleWithAssets from '../StarToggleWithAssets';
import { Z_LAYERS } from '../../lib/zLayers';

const GeneralTab: React.FC = () => {
  const { settings, updateGeneral } = useSettings();
  const { setTheme } = useTheme();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const themeOptions = [
    { value: 'System', label: 'System', icon: Monitor },
    { value: 'Light', label: 'Light', icon: Sun },
    { value: 'Night', label: 'Dark', icon: Moon }
  ];

  const accentColorOptions = [
    { value: 'Default', label: 'Default', color: '#6B7280' },
    { value: 'Blue', label: 'Blue', color: '#3B82F6' },
    { value: 'Green', label: 'Green', color: '#10B981' },
    { value: 'Yellow', label: 'Yellow', color: '#F59E0B' },
    { value: 'Pink', label: 'Pink', color: '#EC4899' },
    { value: 'Orange', label: 'Orange', color: '#F97316' },
    { value: 'Purple', label: 'Purple', color: '#8B5CF6' }
  ];

  const languageOptions = [
    { value: 'Auto-detect', label: 'Auto-detect' },
    { value: 'English (US)', label: 'English (US)' },
    { value: 'English (UK)', label: 'English (UK)' },
    { value: 'Spanish', label: 'Spanish' },
    { value: 'French', label: 'French' },
    { value: 'German', label: 'German' },
    { value: 'Italian', label: 'Italian' },
    { value: 'Portuguese', label: 'Portuguese' },
    { value: 'Russian', label: 'Russian' },
    { value: 'Chinese', label: 'Chinese' },
    { value: 'Japanese', label: 'Japanese' },
    { value: 'Korean', label: 'Korean' }
  ];

  const voiceOptions = [
    { value: 'Maple', label: 'Maple' },
    { value: 'Alloy', label: 'Alloy' },
    { value: 'Echo', label: 'Echo' },
    { value: 'Fable', label: 'Fable' },
    { value: 'Onyx', label: 'Onyx' },
    { value: 'Nova', label: 'Nova' },
    { value: 'Shimmer', label: 'Shimmer' }
  ];

  const handleDropdownToggle = (dropdown: string) => {
    setOpenDropdown(openDropdown === dropdown ? null : dropdown);
  };

  const handleOptionSelect = (setting: string, value: string) => {
    updateGeneral({ [setting]: value });
    
    // === THEME INTEGRATION - START ===
    // Also update the theme context when theme setting changes
    if (setting === 'theme') {
      setTheme(value as 'System' | 'Light' | 'Night');
    }
    // === THEME INTEGRATION - END ===
    
    setOpenDropdown(null);
  };

  return (
    <div>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
        General
      </h3>
      <div className="space-y-3">
        {/* Theme */}
        <div className="relative dropdown-container">
          <div 
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle('theme')}
          >
            <div className="flex items-center gap-3">
              <Palette size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
              <span className="text-sm transition-colors hover:opacity-80" style={{ color: 'var(--chatty-text)' }}>
                Theme
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                {settings.general.theme}
              </span>
              <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>›</span>
            </div>
          </div>
          {openDropdown === 'theme' && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-48"
              style={{
                backgroundColor: 'var(--chatty-bg-main)',
                borderColor: 'var(--chatty-line)',
                zIndex: Z_LAYERS.popover
              }}
            >
              {themeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <div
                    key={option.value}
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                    style={{ backgroundColor: settings.general.theme === option.value ? '#feffaf' : 'transparent' }}
                    onClick={() => handleOptionSelect('theme', option.value)}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                      <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>{option.label}</span>
                    </div>
                    {settings.general.theme === option.value && <Check size={16} style={{ color: 'var(--chatty-text)' }} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Accent Color */}
        <div className="relative dropdown-container">
          <div 
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle('accentColor')}
          >
            <div className="flex items-center gap-3">
              <Palette size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
              <span className="text-sm transition-colors hover:opacity-80" style={{ color: 'var(--chatty-text)' }}>
                Accent color
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: accentColorOptions.find(opt => opt.value === settings.general.accentColor)?.color || '#10B981' }}
              />
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                {settings.general.accentColor}
              </span>
              <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>›</span>
            </div>
          </div>
          {openDropdown === 'accentColor' && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-48"
              style={{
                backgroundColor: 'var(--chatty-bg-main)',
                borderColor: 'var(--chatty-line)',
                zIndex: Z_LAYERS.popover
              }}
            >
              {accentColorOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{ backgroundColor: settings.general.accentColor === option.value ? '#feffaf' : 'transparent' }}
                  onClick={() => handleOptionSelect('accentColor', option.value)}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: option.color }}
                    />
                    <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>{option.label}</span>
                  </div>
                  {settings.general.accentColor === option.value && <Check size={16} style={{ color: 'var(--chatty-text)' }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Language */}
        <div className="relative dropdown-container">
          <div 
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle('language')}
          >
            <div className="flex items-center gap-3">
              <Globe size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
              <span className="text-sm transition-colors hover:opacity-80" style={{ color: 'var(--chatty-text)' }}>
                Language
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                {settings.general.language}
              </span>
              <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>›</span>
            </div>
          </div>
          {openDropdown === 'language' && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-64 max-h-60 overflow-y-auto"
              style={{
                backgroundColor: 'var(--chatty-bg-main)',
                borderColor: 'var(--chatty-line)',
                zIndex: Z_LAYERS.popover
              }}
            >
              {languageOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{ backgroundColor: settings.general.language === option.value ? '#feffaf' : 'transparent' }}
                  onClick={() => handleOptionSelect('language', option.value)}
                >
                  <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>{option.label}</span>
                  {settings.general.language === option.value && <Check size={16} style={{ color: 'var(--chatty-text)' }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spoken Language */}
        <div className="relative dropdown-container">
          <div 
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle('spokenLanguage')}
          >
            <div className="flex items-center gap-3">
              <Globe size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
              <span className="text-sm transition-colors hover:opacity-80" style={{ color: 'var(--chatty-text)' }}>
                Spoken language
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                {settings.general.spokenLanguage}
              </span>
              <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>›</span>
            </div>
          </div>
          {openDropdown === 'spokenLanguage' && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-64 max-h-60 overflow-y-auto"
              style={{
                backgroundColor: 'var(--chatty-bg-main)',
                borderColor: 'var(--chatty-line)',
                zIndex: Z_LAYERS.popover
              }}
            >
              {languageOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{ backgroundColor: settings.general.spokenLanguage === option.value ? '#feffaf' : 'transparent' }}
                  onClick={() => handleOptionSelect('spokenLanguage', option.value)}
                >
                  <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>{option.label}</span>
                  {settings.general.spokenLanguage === option.value && <Check size={16} style={{ color: 'var(--chatty-text)' }} />}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs mt-1 px-3" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
            For best results, select the language you mainly speak. If it's not listed, it may still be supported via auto-detection.
          </p>
        </div>

        {/* Voice */}
        <div className="relative dropdown-container">
          <div 
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle('voice')}
          >
            <div className="flex items-center gap-3">
              <Volume2 size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
              <span className="text-sm transition-colors hover:opacity-80" style={{ color: 'var(--chatty-text)' }}>
                Voice
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                className="p-1 rounded hover:bg-gray-100 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Implement voice preview
                  console.log('Playing voice preview');
                }}
              >
                <Play size={12} style={{ color: 'var(--chatty-text)' }} />
              </button>
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                {settings.general.voice}
              </span>
              <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>›</span>
            </div>
          </div>
          {openDropdown === 'voice' && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-48"
              style={{
                backgroundColor: 'var(--chatty-bg-main)',
                borderColor: 'var(--chatty-line)',
                zIndex: Z_LAYERS.popover
              }}
            >
              {voiceOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{ backgroundColor: settings.general.voice === option.value ? '#feffaf' : 'transparent' }}
                  onClick={() => handleOptionSelect('voice', option.value)}
                >
                  <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>{option.label}</span>
                  {settings.general.voice === option.value && <Check size={16} style={{ color: 'var(--chatty-text)' }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Show Additional Models */}
        <div className="flex items-center justify-between p-3">
          <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>
            Show additional models
          </span>
          <StarToggleWithAssets
            toggled={settings.general.showAdditionalModels}
            onToggle={(toggled) => updateGeneral({ showAdditionalModels: toggled })}
            size="md"
            useNova={false}
          />
        </div>
      </div>
    </div>
  );
};

export default GeneralTab;
