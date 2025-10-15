import React from 'react'
import { X, Mail, Shield, Bell, Palette, Globe, Database } from 'lucide-react'
import { User as UserType } from '../lib/auth'

interface SettingsModalProps {
  isVisible: boolean
  onClose: () => void
  user: UserType | null
  onLogout: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isVisible, 
  onClose, 
  user, 
  onLogout 
}) => {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-app-orange-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-app-orange-700">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 text-app-orange-400 hover:text-white hover:bg-app-orange-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Account Section */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">Account</h3>
            <div className="space-y-3">
              {/* User Info */}
              <div className="flex items-center gap-3 p-3 bg-app-orange-700 rounded-lg">
{user?.picture ? (
  <img 
    src={`${user.picture}?cb=${Date.now()}`} // cache-busting
    alt={user.name}
    className="w-10 h-10 rounded-full object-cover border border-app-orange-500"
    onError={(e) => {
      console.warn('Failed to load profile image, showing fallback.');
      e.currentTarget.style.display = 'none';
      const fallback = e.currentTarget.nextElementSibling as HTMLElement;
      if (fallback) {
        fallback.style.display = 'flex';
      }
    }}
    onLoad={() => {
      console.log('✅ Profile image loaded from:', user.picture);
    }}
    loading="lazy"
    style={{ 
      transition: 'opacity 0.2s ease-in-out',
      opacity: 1
    }}
  />
) : null}
<div 
  className="w-10 h-10 bg-app-orange-600 rounded-full flex items-center justify-center border border-app-orange-500"
  style={{ display: user?.picture ? 'none' : 'flex' }}
>
  <span className="text-app-orange-300 font-medium text-lg">
    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
  </span>
</div>
                <div className="flex-1">
                  <p className="text-white font-medium">{user?.name || 'User'}</p>
                  <p className="text-app-orange-400 text-sm">{user?.email}</p>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3 p-3 bg-app-orange-700 rounded-lg">
                <Mail size={16} className="text-app-orange-400" />
                <div className="flex-1">
                  <p className="text-white text-sm">Email</p>
                  <p className="text-app-orange-400 text-sm">{user?.email}</p>
                </div>
              </div>

              {/* Account Type */}
              <div className="flex items-center gap-3 p-3 bg-app-orange-700 rounded-lg">
                <Shield size={16} className="text-app-orange-400" />
                <div className="flex-1">
                  <p className="text-white text-sm">Account Type</p>
                  <p className="text-app-orange-400 text-sm">Free</p>
                </div>
              </div>
            </div>
          </div>

          {/* App Section */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">App</h3>
            <div className="space-y-3">
              {/* Language */}
              <div className="flex items-center justify-between p-3 bg-app-orange-700 rounded-lg cursor-pointer hover:bg-app-orange-600 transition-colors">
                <div className="flex items-center gap-3">
                  <Globe size={16} className="text-app-orange-400" />
                  <span className="text-white text-sm">Language</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-app-orange-400 text-sm">English</span>
                  <span className="text-app-orange-400">›</span>
                </div>
              </div>

              {/* Theme */}
              <div className="flex items-center justify-between p-3 bg-app-orange-700 rounded-lg cursor-pointer hover:bg-app-orange-600 transition-colors">
                <div className="flex items-center gap-3">
                  <Palette size={16} className="text-app-orange-400" />
                  <span className="text-white text-sm">Theme</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-app-orange-400 text-sm">Dark</span>
                  <span className="text-app-orange-400">›</span>
                </div>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between p-3 bg-app-orange-700 rounded-lg cursor-pointer hover:bg-app-orange-600 transition-colors">
                <div className="flex items-center gap-3">
                  <Bell size={16} className="text-app-orange-400" />
                  <span className="text-white text-sm">Notifications</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-app-orange-400 text-sm">Off</span>
                  <span className="text-app-orange-400">›</span>
                </div>
              </div>

              {/* Data Storage */}
              <div className="flex items-center justify-between p-3 bg-app-orange-700 rounded-lg cursor-pointer hover:bg-app-orange-600 transition-colors">
                <div className="flex items-center gap-3">
                  <Database size={16} className="text-app-orange-400" />
                  <span className="text-white text-sm">Data Storage</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-app-orange-400 text-sm">Local</span>
                  <span className="text-app-orange-400">›</span>
                </div>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <div className="pt-4 border-t border-app-orange-700">
            <button
              onClick={onLogout}
              className="w-full p-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
