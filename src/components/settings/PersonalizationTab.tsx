import React, { useState } from 'react';
import { Briefcase, FileText, Brain, Search, Code, Layout, Mic, Zap, Wifi } from 'lucide-react';
import type { PersonalizationLevel } from '../../types/settings';
import { useSettings } from '../../context/SettingsContext';
import StarToggleWithAssets from '../StarToggleWithAssets';

const PERSONALIZATION_LEVELS: PersonalizationLevel[] = ['Less', 'Default', 'More'];

function LevelSegmentedControl({
  value,
  onChange,
}: {
  value: PersonalizationLevel;
  onChange: (v: PersonalizationLevel) => void;
}) {
  return (
    <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--chatty-line)' }}>
      {PERSONALIZATION_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          className="flex-1 py-2 px-3 text-sm transition-colors"
          style={{
            backgroundColor: value === level ? 'var(--chatty-highlight)' : 'var(--chatty-bg-main)',
            color: 'var(--chatty-text)',
            borderRight: level !== 'More' ? '1px solid var(--chatty-line)' : 'none',
          }}
          onClick={() => onChange(level)}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

const inputClass =
  'w-full p-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 placeholder-[#ADA587]';
const inputStyle = {
  backgroundColor: 'var(--chatty-bg-main)',
  borderColor: 'var(--chatty-line)',
  color: 'var(--chatty-text)',
};

const sectionTitleClass = 'text-sm font-medium mt-6 mb-2 first:mt-0';
const sectionTitleStyle = { color: 'var(--chatty-text)' };

const PersonalizationTab: React.FC = () => {
  const { settings, updatePersonalization } = useSettings();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const p = settings.personalization;

  return (
    <div>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
        Personalization
      </h3>
      <div className="space-y-4">
        {/* 1. Base style and tone */}
        <section>
          <h4 className={sectionTitleClass} style={sectionTitleStyle}>
            Base style and tone
          </h4>
          <div className="relative">
            <div
              className="flex items-center justify-between p-3 rounded-lg border cursor-pointer"
              style={{ ...inputStyle, borderColor: 'var(--chatty-line)' }}
              onClick={() => setOpenDropdown(openDropdown === 'baseStyleTone' ? null : 'baseStyleTone')}
            >
              <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>
                {p.baseStyleTone}
              </span>
              <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>›</span>
            </div>
            {openDropdown === 'baseStyleTone' && (
              <div
                className="absolute top-full left-0 mt-1 rounded-lg shadow-lg border w-40 z-10"
                style={{
                  backgroundColor: 'var(--chatty-bg-main)',
                  borderColor: 'var(--chatty-line)',
                }}
              >
                <div
                  className="p-3 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--chatty-highlight)',
                    color: 'var(--chatty-text)',
                  }}
                  onClick={() => {
                    updatePersonalization({ baseStyleTone: 'Default' });
                    setOpenDropdown(null);
                  }}
                >
                  Default
                </div>
              </div>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
            Affects style and tone of responses, not capabilities.
          </p>
        </section>

        {/* 2. Characteristics */}
        <section>
          <h4 className={sectionTitleClass} style={sectionTitleStyle}>
            Characteristics
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm shrink-0 w-28" style={{ color: 'var(--chatty-text)' }}>Warm</span>
              <LevelSegmentedControl value={p.warm} onChange={(v) => updatePersonalization({ warm: v })} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm shrink-0 w-28" style={{ color: 'var(--chatty-text)' }}>Enthusiastic</span>
              <LevelSegmentedControl value={p.enthusiastic} onChange={(v) => updatePersonalization({ enthusiastic: v })} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm shrink-0 w-28" style={{ color: 'var(--chatty-text)' }}>Headers & Lists</span>
              <LevelSegmentedControl value={p.headersLists} onChange={(v) => updatePersonalization({ headersLists: v })} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm shrink-0 w-28" style={{ color: 'var(--chatty-text)' }}>Emojis</span>
              <LevelSegmentedControl value={p.emojis} onChange={(v) => updatePersonalization({ emojis: v })} />
            </div>
          </div>
        </section>

        {/* 3. Custom instructions */}
        <section>
          <h4 className={sectionTitleClass} style={sectionTitleStyle}>
            Custom instructions
          </h4>
          <textarea
            value={p.customInstructions}
            onChange={(e) => updatePersonalization({ customInstructions: e.target.value })}
            placeholder="Additional behaviour, style, or tone preferences..."
            rows={4}
            className={`${inputClass} resize-none`}
            style={inputStyle}
          />
        </section>

        {/* 4. About you */}
        <section>
          <h4 className={sectionTitleClass} style={sectionTitleStyle}>
            About you
          </h4>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--chatty-text)' }}>
                Nickname
              </label>
              <input
                type="text"
                value={p.nickname}
                onChange={(e) => updatePersonalization({ nickname: e.target.value })}
                placeholder="How would you like to be addressed?"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-1" style={{ color: 'var(--chatty-text)' }}>
                <Briefcase size={14} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                Occupation
              </label>
              <input
                type="text"
                value={p.occupation}
                onChange={(e) => updatePersonalization({ occupation: e.target.value })}
                placeholder="What do you do for work?"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-1" style={{ color: 'var(--chatty-text)' }}>
                <FileText size={14} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                More about you
              </label>
              <textarea
                value={p.aboutYou}
                onChange={(e) => updatePersonalization({ aboutYou: e.target.value })}
                placeholder="Tell Chatty more about yourself, your interests, and how you prefer to communicate..."
                rows={3}
                className={`${inputClass} resize-none`}
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        {/* 5. Memories */}
        <section>
          <h4 className={sectionTitleClass} style={sectionTitleStyle}>
            Memories
          </h4>
          <p className="text-xs mb-3" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
            Choose which sources Chatty can use to personalize responses.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Brain size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                    Reference saved memories
                  </span>
                  <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                    Use memories you have explicitly saved.
                  </p>
                </div>
              </div>
              <StarToggleWithAssets
                toggled={p.referenceSavedMemories}
                onToggle={(t) => updatePersonalization({ referenceSavedMemories: t })}
                size="md"
                spacing="63px"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Brain size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                    Reference browser memories
                  </span>
                  <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                    Use memories from this browser session.
                  </p>
                </div>
              </div>
              <StarToggleWithAssets
                toggled={p.referenceBrowserMemories}
                onToggle={(t) => updatePersonalization({ referenceBrowserMemories: t })}
                size="md"
                spacing="63px"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Brain size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                    Reference chat history
                  </span>
                  <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                    Use context from current and recent conversations.
                  </p>
                </div>
              </div>
              <StarToggleWithAssets
                toggled={p.referenceChatHistory}
                onToggle={(t) => updatePersonalization({ referenceChatHistory: t })}
                size="md"
                spacing="63px"
              />
            </div>
          </div>
        </section>

        {/* 6. Record mode */}
        <section>
          <h4 className={sectionTitleClass} style={sectionTitleStyle}>
            Record mode
          </h4>
          <div className="flex items-center justify-between p-3 rounded-lg">
            <div className="flex items-center gap-3">
              <Mic size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                  Reference record history
                </span>
                <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                  Use record history when supported.
                </p>
              </div>
            </div>
            <StarToggleWithAssets
              toggled={p.recordHistory}
              onToggle={(t) => updatePersonalization({ recordHistory: t })}
              size="md"
              spacing="63px"
            />
          </div>
        </section>

        {/* 7. Advanced */}
        <section>
          <h4 className={sectionTitleClass} style={sectionTitleStyle}>
            Advanced
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Search size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>Web search</span>
              </div>
              <StarToggleWithAssets toggled={p.webSearch} onToggle={(t) => updatePersonalization({ webSearch: t })} size="md" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Code size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>Code</span>
              </div>
              <StarToggleWithAssets toggled={p.code} onToggle={(t) => updatePersonalization({ code: t })} size="md" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Layout size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>Canvas</span>
              </div>
              <StarToggleWithAssets toggled={p.canvas} onToggle={(t) => updatePersonalization({ canvas: t })} size="md" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Mic size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>Chatty Voice</span>
              </div>
              <StarToggleWithAssets toggled={p.chattyVoice} onToggle={(t) => updatePersonalization({ chattyVoice: t })} size="md" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Zap size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>Advanced voice</span>
              </div>
              <StarToggleWithAssets toggled={p.advancedVoice} onToggle={(t) => updatePersonalization({ advancedVoice: t })} size="md" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Wifi size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>Connector search</span>
              </div>
              <StarToggleWithAssets toggled={p.connectorSearch} onToggle={(t) => updatePersonalization({ connectorSearch: t })} size="md" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PersonalizationTab;
