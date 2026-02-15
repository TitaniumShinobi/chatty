import React, { useState, useEffect, useCallback } from 'react';
import { Timer, Check, Shield, Bell, ShieldCheck, AlertTriangle } from 'lucide-react';
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
  const [ageVerified, setAgeVerified] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [stepUpRequired, setStepUpRequired] = useState(false);

  const currentTimeout = settings.security.screenTimeout || 0;
  const currentLabel = SCREEN_TIMEOUT_OPTIONS.find(o => o.value === currentTimeout)?.label || 'Never';

  const checkAgeVerification = useCallback(async () => {
    try {
      const res = await fetch('/api/family/age-verification', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAgeVerified(data.verified);
      }
    } catch {}
  }, []);

  const checkStepUp = useCallback(async () => {
    try {
      const res = await fetch('/api/family/step-up', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStepUpRequired(data.required);
      }
    } catch {}
  }, []);

  useEffect(() => {
    checkAgeVerification();
    checkStepUp();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkAgeVerification();
        checkStepUp();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [checkAgeVerification, checkStepUp]);

  const handleAgeVerify = async () => {
    setVerifying(true);
    try {
      const res = await fetch('/api/family/age-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setAgeVerified(true);
        setShowConfirm(false);
      }
    } catch {} finally {
      setVerifying(false);
    }
  };

  const handleClearStepUp = async () => {
    try {
      const res = await fetch('/api/family/step-up/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.ok) {
        setStepUpRequired(false);
      }
    } catch {}
  };

  return (
    <div>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
        Security
      </h3>
      <div className="space-y-3">
        <div className="p-3 rounded-lg border" style={{ borderColor: ageVerified ? '#10B981' : '#F59E0B' }}>
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck size={16} style={{ color: ageVerified ? '#10B981' : '#F59E0B' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
              Age Verification (18+)
            </span>
            {ageVerified && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#10B981', color: 'white' }}>
                Verified
              </span>
            )}
          </div>
          {ageVerified === null ? (
            <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>Loading...</p>
          ) : ageVerified ? (
            <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              Your account is verified for 18+ content. Roleplay and intimate constructs are unlocked.
            </p>
          ) : (
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                Verify your age to access roleplay and intimate content. This is required for constructs with 18+ features enabled.
              </p>
              {showConfirm ? (
                <div className="p-2 rounded border mt-2" style={{ borderColor: 'var(--chatty-line)', backgroundColor: 'var(--chatty-highlight)' }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--chatty-text)' }}>
                    By confirming, you declare that you are 18 years of age or older. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAgeVerify}
                      disabled={verifying}
                      className="text-xs px-3 py-1 rounded"
                      style={{ backgroundColor: '#10B981', color: 'white' }}
                    >
                      {verifying ? 'Verifying...' : 'I confirm I am 18+'}
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="text-xs px-3 py-1 rounded"
                      style={{ backgroundColor: 'var(--chatty-line)', color: 'var(--chatty-text)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="text-xs px-3 py-1.5 rounded transition-colors"
                  style={{ backgroundColor: '#F59E0B', color: 'white' }}
                >
                  Verify Age
                </button>
              )}
            </div>
          )}
        </div>

        {stepUpRequired && (
          <div className="p-3 rounded-lg border" style={{ borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.05)' }}>
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={16} style={{ color: '#EF4444' }} />
              <span className="text-sm font-medium" style={{ color: '#EF4444' }}>
                Re-authentication Required
              </span>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              Your session timed out while 18+ content was active. You must re-authenticate to continue accessing mature content.
            </p>
            <button
              onClick={handleClearStepUp}
              className="text-xs px-3 py-1.5 rounded transition-colors"
              style={{ backgroundColor: '#EF4444', color: 'white' }}
            >
              Re-authenticate Now
            </button>
          </div>
        )}

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
              {ageVerified && ' Since you have 18+ verification, a step-up re-authentication will be required before you can access mature content again.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityTab;
