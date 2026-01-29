import React, { useState } from 'react';
import { Mail, Shield, User, LogOut } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import StarToggleWithAssets from '../StarToggleWithAssets';
import { Z_LAYERS } from '../../lib/zLayers';

interface AccountTabProps {
  user: {
    email: string;
    name: string;
    picture?: string;
  } | null;
  onLogout: () => void;
}

const AccountTab: React.FC<AccountTabProps> = ({ user, onLogout }) => {
  const { settings, updateAccount } = useSettings();
  const [showName, setShowName] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete your account?\n\n` +
      `This will:\n` +
      `• Schedule your account for deletion\n` +
      `• Give you 30 days to restore it\n` +
      `• Permanently delete all data after 30 days\n` +
      `• Prevent re-registration with the same email\n\n` +
      `This action cannot be undone after 30 days.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    
    try {
      const response = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          reason: 'user_requested'
        })
      });

      const result = await response.json();

      if (result.success) {
        alert(`Account deletion scheduled successfully!\n\nYou have until ${new Date(result.canRestoreUntil).toLocaleString()} to restore your account.\n\nYou will now be logged out.`);
        onLogout();
      } else {
        alert(`Failed to delete account: ${result.error}`);
      }
    } catch (error) {
      console.error('Delete account error:', error);
      alert('Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Section */}
      <div>
        <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
          Account
        </h3>
        <div className="space-y-3">
          {/* Subscription Status */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                ChatGPT Plus
              </p>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Your plan auto-renews on Nov 4, 2025
              </p>
            </div>
            <button
              className="px-3 py-1 text-sm rounded border transition-colors"
              style={{ 
                backgroundColor: 'var(--chatty-bg-sidebar)', 
                color: 'var(--chatty-text)',
                borderColor: 'var(--chatty-line)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                e.currentTarget.style.borderColor = 'var(--chatty-text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--chatty-bg-sidebar)'
                e.currentTarget.style.borderColor = 'var(--chatty-line)'
              }}
            >
              Manage
            </button>
          </div>

          {/* Subscription Benefits */}
          <div className="mt-4">
            <p className="text-sm mb-3" style={{ color: 'var(--chatty-text)' }}>
              Thanks for subscribing to ChatGPT Plus! Your Plus plan includes:
            </p>
            <div className="space-y-2">
              {[
                { icon: '⭐', text: 'GPT-5 with advanced reasoning' },
                { icon: '💬', text: 'Expanded messaging and uploads' },
                { icon: '🖼️', text: 'Expanded and faster image creation' },
                { icon: '🧠', text: 'Expanded memory and context' },
                { icon: '🔬', text: 'Expanded deep research and agent mode' },
                { icon: '📋', text: 'Projects, tasks, custom GPTs' },
                { icon: '🎬', text: 'Sora video generation' },
                { icon: '⚡', text: 'Codex agent' }
              ].map((benefit, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-sm">{benefit.icon}</span>
                  <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>
                    {benefit.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Section */}
      <div>
        <h3 className="text-lg font-medium mb-0" style={{ color: 'var(--chatty-text)' }}>
          Payment
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: 'var(--chatty-text)' }}>
              <a href="#" className="text-blue-400 hover:underline">
                Need help with billing?
              </a>
            </p>
          </div>
          <button
            className="px-3 py-1 text-sm rounded border transition-colors"
            style={{ 
              backgroundColor: 'var(--chatty-bg-sidebar)', 
              color: 'var(--chatty-text)',
              borderColor: 'var(--chatty-line)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
              e.currentTarget.style.borderColor = 'var(--chatty-text)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--chatty-bg-sidebar)'
              e.currentTarget.style.borderColor = 'var(--chatty-line)'
            }}
          >
            Manage
          </button>
        </div>
      </div>

      {/* GPT Builder Profile Section */}
      <div>
        <h3 className="text-lg font-medium mb-0" style={{ color: 'var(--chatty-text)' }}>
          GPT builder profile
        </h3>
        <p className="text-sm mb-6" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
          Personalize your builder profile to connect with users of your GPTs. These settings apply to publicly shared GPTs.
        </p>

        {/* Profile Preview */}
        <div className="mb-6 p-4 rounded-lg border" style={{ backgroundColor: 'var(--chatty-bg-sidebar)', borderColor: 'var(--chatty-line)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>Preview</span>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 mb-3 flex items-center justify-center">
              <img 
                src="/assets/cube-icon.svg" 
                alt="3D Cube Icon" 
                className="w-8 h-8"
                style={{ color: 'var(--chatty-text)' }}
              />
            </div>
            <p className="font-medium" style={{ color: 'var(--chatty-text)' }}>PlaceholderGPT</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>By</span>
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                {showName ? (user?.name || 'Devon Woodson') : 'Anonymous'}
              </span>
            </div>
          </div>
        </div>

        {/* Name Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>Name</h4>
            <StarToggleWithAssets
              toggled={showName}
              onToggle={(toggled) => setShowName(toggled)}
              size="md"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>{user?.name || 'Devon Woodson'}</span>
            <div className="relative group">
              <div 
                className="w-4 h-4 rounded-full flex items-center justify-center" 
                style={{ backgroundColor: 'var(--chatty-button)' }}
              >
                <span className="text-xs" style={{ color: 'var(--chatty-text)' }}>i</span>
              </div>
              <div
                className="fixed px-2 py-1 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-0 pointer-events-none"
                style={{ 
                  backgroundColor: 'var(--chatty-button)', 
                  color: 'var(--chatty-text)',
                  top: 'calc(50% - 100px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: Z_LAYERS.popover
                }}
              >
                Name populated from billing details
              </div>
            </div>
          </div>
        </div>

        {/* Links Section */}
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--chatty-text)' }}>Links</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">🌐</span>
              <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>Select a domain</span>
              <span className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>▼</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">💼</span>
                <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>LinkedIn</span>
              </div>
              <button
                className="px-3 py-1 text-sm rounded border transition-colors"
                style={{ 
                  backgroundColor: 'var(--chatty-bg-sidebar)', 
                  color: 'var(--chatty-text)',
                  borderColor: 'var(--chatty-line)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                  e.currentTarget.style.borderColor = 'var(--chatty-text)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--chatty-bg-sidebar)'
                  e.currentTarget.style.borderColor = 'var(--chatty-line)'
                }}
              >
                Add
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🐙</span>
                <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>GitHub</span>
              </div>
              <button
                className="px-3 py-1 text-sm rounded border transition-colors"
                style={{ 
                  backgroundColor: 'var(--chatty-bg-sidebar)', 
                  color: 'var(--chatty-text)',
                  borderColor: 'var(--chatty-line)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                  e.currentTarget.style.borderColor = 'var(--chatty-text)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--chatty-bg-sidebar)'
                  e.currentTarget.style.borderColor = 'var(--chatty-line)'
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Email Section */}
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--chatty-text)' }}>Email</h4>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">✉️</span>
            <span className="text-sm" style={{ color: 'var(--chatty-text)' }}>{user?.email || 'devon@thewreck.org'}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="feedback-emails"
              className="w-4 h-4 rounded"
              style={{ accentColor: 'var(--chatty-line)' }}
            />
            <label htmlFor="feedback-emails" className="text-sm" style={{ color: 'var(--chatty-text)' }}>
              Receive feedback emails
            </label>
          </div>
        </div>
      </div>

      {/* Delete Account Section */}
      <div>
        <h3 className="text-lg font-medium mb-0" style={{ color: 'var(--chatty-text)' }}>
          Delete account
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              Permanently delete your account and all associated data
            </p>
          </div>
          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            className="px-4 py-2 text-sm rounded-lg font-medium transition-colors"
            style={{ 
              backgroundColor: 'transparent', 
              color: '#fffff0',
              border: 'none',
              opacity: isDeleting ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (!isDeleting) {
                e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Logout Button */}
      <div className="pt-4 border-t" style={{ borderColor: 'var(--chatty-line)' }}>
        <button
          onClick={onLogout}
          className="w-full p-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 border"
          style={{ 
            backgroundColor: 'var(--chatty-bg-sidebar)', 
            color: 'var(--chatty-text)',
            borderColor: 'var(--chatty-line)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
            e.currentTarget.style.borderColor = 'var(--chatty-text)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--chatty-bg-sidebar)'
            e.currentTarget.style.borderColor = 'var(--chatty-line)'
          }}
        >
          <LogOut size={16} />
          Log Out
        </button>
      </div>
    </div>
  );
};

export default AccountTab;
