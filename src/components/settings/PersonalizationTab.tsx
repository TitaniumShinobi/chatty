import React, { useState } from 'react';
import { User, Tag, Briefcase, FileText, Brain } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import StarToggleWithAssets from '../StarToggleWithAssets';

const PersonalizationTab: React.FC = () => {
  const { settings, updatePersonalization } = useSettings();
  const [newTag, setNewTag] = useState('');

  const handleAddTag = () => {
    if (newTag.trim() && !settings.personalization.tags.includes(newTag.trim())) {
      updatePersonalization({
        tags: [...settings.personalization.tags, newTag.trim()]
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updatePersonalization({
      tags: settings.personalization.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTag();
    }
  };

  return (
    <div>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
        Personalization Settings
      </h3>
      <div className="space-y-6">
        {/* Enable Customization Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg">
          <div className="flex items-center gap-3">
            <User size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Customization
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Allow Chatty to learn from your preferences and interactions
              </p>
            </div>
          </div>
          <StarToggleWithAssets
            toggled={settings.personalization.enableCustomization}
            onToggle={(toggled) => updatePersonalization({ enableCustomization: toggled })}
            size="md"
            spacing="63px"
          />
        </div>

        {/* Allow Memory Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg">
          <div className="flex items-center gap-3">
            <Brain size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Allow memory
              </span>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Let Chatty remember your conversations and learn from your interactions
              </p>
            </div>
          </div>
          <StarToggleWithAssets
            toggled={settings.personalization.allowMemory}
            onToggle={(toggled) => updatePersonalization({ allowMemory: toggled })}
            size="md"
            spacing="63px"
          />
        </div>

        {/* Nickname */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
            Nickname
          </label>
          <input
            type="text"
            value={settings.personalization.nickname}
            onChange={(e) => updatePersonalization({ nickname: e.target.value })}
            placeholder="How would you like to be addressed?"
            className="w-full p-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 placeholder-[#ADA587]"
            style={{
              backgroundColor: 'var(--chatty-bg-main)',
              borderColor: 'var(--chatty-line)',
              color: 'var(--chatty-text)'
            }}
          />
        </div>

        {/* Occupation */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--chatty-text)' }}>
            <Briefcase size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            Occupation
          </label>
          <input
            type="text"
            value={settings.personalization.occupation}
            onChange={(e) => updatePersonalization({ occupation: e.target.value })}
            placeholder="What do you do for work?"
            className="w-full p-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 placeholder-[#ADA587]"
            style={{
              backgroundColor: 'var(--chatty-bg-main)',
              borderColor: 'var(--chatty-line)',
              color: 'var(--chatty-text)'
            }}
          />
        </div>

        {/* Tags/Preferences */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--chatty-text)' }}>
            <Tag size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            Style & Tone Preferences
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Add a preference tag (e.g., 'formal', 'casual', 'technical')"
              className="flex-1 p-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 placeholder-[#ADA587]"
              style={{
                backgroundColor: 'var(--chatty-bg-main)',
                borderColor: 'var(--chatty-line)',
                color: 'var(--chatty-text)'
              }}
            />
            <button
              onClick={handleAddTag}
              className="px-4 py-3 rounded-lg transition-colors font-medium"
              style={{
                backgroundColor: 'var(--chatty-button)',
                color: 'var(--chatty-text)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-button)'}
            >
              Add
            </button>
          </div>
          
          {/* Display existing tags */}
          {settings.personalization.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {settings.personalization.tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm"
                  style={{
                    backgroundColor: 'var(--chatty-highlight)',
                    color: 'var(--chatty-text)'
                  }}
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--chatty-text)' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* About You */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--chatty-text)' }}>
            <FileText size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            More about you
          </label>
          <textarea
            value={settings.personalization.aboutYou}
            onChange={(e) => updatePersonalization({ aboutYou: e.target.value })}
            placeholder="Tell Chatty more about yourself, your interests, and how you prefer to communicate..."
            rows={4}
            className="w-full p-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 resize-none placeholder-[#ADA587]"
            style={{
              backgroundColor: 'var(--chatty-bg-main)',
              borderColor: 'var(--chatty-line)',
              color: 'var(--chatty-text)'
            }}
          />
          <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
            This information helps Chatty provide more personalized and relevant responses.
          </p>
        </div>

        {/* Memory Integration Preview */}
        <div className="p-4 rounded-lg border-2 border-dashed" style={{ borderColor: 'var(--chatty-line)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10B981' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
              VVAULT Memory Integration
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
            When enabled, your personalization settings will be stored in VVAULT for enhanced memory capabilities 
            and cross-device synchronization. This feature is coming soon.
          </p>
        </div>

        {/* Memory Toggle Info */}
        {!settings.personalization.allowMemory && (
          <div className="p-3 rounded-lg" style={{ backgroundColor: '#fef3c7', borderColor: '#f59e0b' }}>
            <div className="flex items-start gap-2">
              <Brain size={16} style={{ color: '#f59e0b' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: '#92400e' }}>
                  Memory is currently disabled
                </p>
                <p className="text-xs mt-1" style={{ color: '#92400e', opacity: 0.8 }}>
                  Enable "Allow memory" above to let Chatty learn from your conversations and provide more personalized responses.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonalizationTab;
