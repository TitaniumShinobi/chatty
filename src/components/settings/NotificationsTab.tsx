import React from 'react';
import { useSettings } from '../../context/SettingsContext';
import StarToggleWithAssets from '../StarToggleWithAssets';

const NotificationsTab: React.FC = () => {
  const { settings, updateNotifications } = useSettings();

  // Debug logging
  console.log('NotificationsTab settings:', settings.notifications);

  return (
    <div>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
        Notifications
      </h3>
      <div className="space-y-6">
        {/* Responses */}
        <div className="pb-6">
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <div className="grid grid-cols-3 items-center">
                <h4 className="font-medium" style={{ color: 'var(--chatty-text)' }}>Responses</h4>
                <div></div>
                <div className="flex justify-end items-center gap-1" style={{ marginRight: 'calc(1rem - 1px)' }}>
                  <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Push</span>
                  <StarToggleWithAssets
                    toggled={settings.notifications.responsesPush}
                    onToggle={(toggled) => updateNotifications({ responsesPush: toggled })}
                    size="md"
                    spacing="63px"
                  />
                </div>
              </div>
              <p className="text-sm mb-3 pr-32 -mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Get notified when ChatGPT responds to requests that take time for research or image generation.
              </p>
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="pb-6">
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <div>
                <div className="grid grid-cols-3 items-center">
                  <h4 className="font-medium" style={{ color: 'var(--chatty-text)' }}>Tasks</h4>
                  <div></div>
                  <div className="flex justify-end items-center gap-1" style={{ marginRight: 'calc(0.75rem - 1px)' }}>
                    <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Push</span>
                    <StarToggleWithAssets
                      toggled={settings.notifications.tasksPush}
                      onToggle={(toggled) => updateNotifications({ tasksPush: toggled })}
                      size="md"
                      spacing="63px"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 items-center mt-0">
                  <div></div>
                  <div></div>
                  <div className="flex justify-end items-center gap-1" style={{ marginRight: 'calc(0.75rem - 1px)' }}>
                    <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Email</span>
                    <StarToggleWithAssets
                      toggled={settings.notifications.tasksEmail}
                      onToggle={(toggled) => updateNotifications({ tasksEmail: toggled })}
                      size="md"
                      spacing="63px"
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm mb-2 pr-32 -mt-12" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
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
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <div>
                <div className="grid grid-cols-3 items-center">
                  <h4 className="font-medium" style={{ color: 'var(--chatty-text)' }}>Recommendations</h4>
                  <div></div>
                  <div className="flex justify-end items-center gap-1" style={{ marginRight: 'calc(0.75rem - 1px)' }}>
                    <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Push</span>
                    <StarToggleWithAssets
                      toggled={settings.notifications.recommendationsPush}
                      onToggle={(toggled) => updateNotifications({ recommendationsPush: toggled })}
                      size="md"
                      spacing="63px"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 items-center mt-0">
                  <div></div>
                  <div></div>
                  <div className="flex justify-end items-center gap-1" style={{ marginRight: 'calc(0.75rem - 1px)' }}>
                    <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Email</span>
                    <StarToggleWithAssets
                      toggled={settings.notifications.recommendationsEmail}
                      onToggle={(toggled) => updateNotifications({ recommendationsEmail: toggled })}
                      size="md"
                      spacing="63px"
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm pr-32 -mt-12" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
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
