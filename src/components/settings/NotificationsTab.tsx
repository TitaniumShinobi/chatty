import React from 'react';
import { useSettings } from '../../context/SettingsContext';
import StarToggleWithAssets from '../StarToggleWithAssets';

const NotificationsTab: React.FC = () => {
  const { settings, updateNotifications } = useSettings();

  const ToggleSwitch: React.FC<{
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    leftPosition?: string;
  }> = ({ enabled, onChange, leftPosition = 'calc(40px)' }) => (
    <StarToggleWithAssets
      toggled={enabled}
      onToggle={onChange}
      size="md"
      useNova={false}
      leftPosition={leftPosition}
    />
  );

  return (
    <div>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
        Notifications
      </h3>
      <div className="space-y-6">
        {/* Responses */}
        <div className="pb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1 relative">
                <h4 className="font-medium" style={{ color: 'var(--chatty-text)' }}>Responses</h4>
                <div className="flex items-center gap-2 absolute right-0">
                  <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Push</span>
                  <ToggleSwitch
                    enabled={settings.notifications.responsesPush}
                    onChange={(enabled) => updateNotifications({ responsesPush: enabled })}
                  />
                </div>
              </div>
              <p className="text-sm mb-3 mr-32" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Get notified when ChatGPT responds to requests that take time for research or image generation.
              </p>
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="pb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-medium" style={{ color: 'var(--chatty-text)' }}>Tasks</h4>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Push</span>
                    <ToggleSwitch
                      enabled={settings.notifications.tasksPush}
                      onChange={(enabled) => updateNotifications({ tasksPush: enabled })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Email</span>
                    <ToggleSwitch
                      enabled={settings.notifications.tasksEmail}
                      onChange={(enabled) => updateNotifications({ tasksEmail: enabled })}
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm mb-2 mr-32" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Get notified when tasks you've created have updates.
              </p>
              <button 
                className="text-sm underline hover:no-underline transition-all" 
                style={{ color: 'var(--chatty-text)', opacity: 0.8 }}
                onClick={() => {
                  // TODO: Implement manage tasks functionality
                  console.log('Manage tasks clicked');
                }}
              >
                Manage tasks
              </button>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-medium" style={{ color: 'var(--chatty-text)' }}>Recommendations</h4>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Push</span>
                    <ToggleSwitch
                      enabled={settings.notifications.recommendationsPush}
                      onChange={(enabled) => updateNotifications({ recommendationsPush: enabled })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Email</span>
                    <ToggleSwitch
                      enabled={settings.notifications.recommendationsEmail}
                      onChange={(enabled) => updateNotifications({ recommendationsEmail: enabled })}
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm mr-32" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Stay in the loop on new tools, tips, and features from ChatGPT.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsTab;
