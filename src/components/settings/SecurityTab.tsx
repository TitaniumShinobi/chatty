import React, { useState } from 'react';
import { Timer, Check, Shield, Bell } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { Z_LAYERS } from '../../lib/zLayers';

const SCREEN_TIMEOUT_OPTIONS = [
  { value: 0, label: 'Never' },
  { value: 1, label: '1 minute' },
  { value: 2, label: '2 minutes' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '60 minutes' },
];

const SecurityTab: React.FC = () => {
  const { settings, updateSecurity } = useSettings();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const currentTimeout = settings.security.screenTimeout || 0;
  const currentLabel = SCREEN_TIMEOUT_OPTIONS.find(o => o.value === currentTimeout)?.label || 'Never';

  return (
    <div>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
        Security
      </h3>
      <div className="space-y-3">
        <div className="relative dropdown-container">
          <div
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => setOpenDropdown(openDropdown === 'screenTimeout' ? null : 'screenTimeout')}
          >
            <div className="flex items-center gap-3">
              <Timer size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
              <div>
                <span className="text-sm transition-colors hover:opacity-80" style={{ color: 'var(--chatty-text)' }}>
                  Screen Timeout
                </span>
                <p className="text-xs mt-0.5" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
                  Lock screen after inactivity
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                {currentLabel}
              </span>
              <span style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>›</span>
            </div>
          </div>
          {openDropdown === 'screenTimeout' && (
            <div
              className="absolute top-full right-0 mt-1 rounded-lg shadow-lg border w-48 max-h-60 overflow-y-auto"
              style={{
                backgroundColor: 'var(--chatty-bg-main)',
                borderColor: 'var(--chatty-line)',
                zIndex: Z_LAYERS.popover,
              }}
            >
              {SCREEN_TIMEOUT_OPTIONS.map(option => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{
                    backgroundColor: currentTimeout === option.value ? 'var(--chatty-highlight)' : 'transparent',
                  }}
                  onClick={() => {
                    updateSecurity({ screenTimeout: option.value });
                    setOpenDropdown(null);
                  }}
                >
                  <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>
                    {option.label}
                  </span>
                  {currentTimeout === option.value && (
                    <Check size={16} style={{ color: 'var(--chatty-text)' }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <Bell size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>
                Login Notifications
              </span>
              <p className="text-xs mt-0.5" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
                Get notified of new sign-ins
              </p>
            </div>
          </div>
          <button
            onClick={() => updateSecurity({ loginNotifications: !settings.security.loginNotifications })}
            className="relative w-10 h-5 rounded-full transition-colors"
            style={{
              backgroundColor: settings.security.loginNotifications ? '#10B981' : 'var(--chatty-line)',
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{
                transform: settings.security.loginNotifications ? 'translateX(20px)' : 'translateX(2px)',
              }}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <Shield size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
            <div>
              <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>
                Suspicious Activity Alerts
              </span>
              <p className="text-xs mt-0.5" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
                Alert on unusual account activity
              </p>
            </div>
          </div>
          <button
            onClick={() => updateSecurity({ suspiciousActivityAlerts: !settings.security.suspiciousActivityAlerts })}
            className="relative w-10 h-5 rounded-full transition-colors"
            style={{
              backgroundColor: settings.security.suspiciousActivityAlerts ? '#10B981' : 'var(--chatty-line)',
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{
                transform: settings.security.suspiciousActivityAlerts ? 'translateX(20px)' : 'translateX(2px)',
              }}
            />
          </button>
        </div>

        {currentTimeout > 0 && (
          <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-highlight)' }}>
            <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              After {currentLabel} of inactivity, you will be signed out and returned to the login screen.
              {' '}When 18+ content is enabled, re-authentication will be required.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityTab;
