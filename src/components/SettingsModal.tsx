import React, { useState } from 'react'
import { X, Mail, Shield, Bell, Palette, Globe, Database, Download } from 'lucide-react'
import { User as UserType } from '../lib/auth'
import BackupManager from './BackupManager'

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
  const [activeTab, setActiveTab] = useState<'account' | 'app' | 'backup'>('account')
  
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" style={{ backgroundColor: '#ffffd7' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: '#E1C28B' }}>
          <h2 className="text-xl font-semibold" style={{ color: '#4C3D1E' }}>Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: '#E1C28B' }}>
          <button
            onClick={() => setActiveTab('account')}
            className={`flex-1 p-4 text-sm font-medium transition-colors ${
              activeTab === 'account' ? 'border-b-2' : ''
            }`}
            style={{ 
              color: activeTab === 'account' ? '#4C3D1E' : '#4C3D1E',
              opacity: activeTab === 'account' ? 1 : 0.7,
              borderBottomColor: activeTab === 'account' ? '#4C3D1E' : 'transparent'
            }}
          >
            Account
          </button>
          <button
            onClick={() => setActiveTab('app')}
            className={`flex-1 p-4 text-sm font-medium transition-colors ${
              activeTab === 'app' ? 'border-b-2' : ''
            }`}
            style={{ 
              color: activeTab === 'app' ? '#4C3D1E' : '#4C3D1E',
              opacity: activeTab === 'app' ? 1 : 0.7,
              borderBottomColor: activeTab === 'app' ? '#4C3D1E' : 'transparent'
            }}
          >
            App
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`flex-1 p-4 text-sm font-medium transition-colors ${
              activeTab === 'backup' ? 'border-b-2' : ''
            }`}
            style={{ 
              color: activeTab === 'backup' ? '#4C3D1E' : '#4C3D1E',
              opacity: activeTab === 'backup' ? 1 : 0.7,
              borderBottomColor: activeTab === 'backup' ? '#4C3D1E' : 'transparent'
            }}
          >
            <Download size={16} className="inline mr-1" />
            Backup
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {activeTab === 'account' && (
            <>
              {/* Account Section */}
              <div>
            <h3 className="text-lg font-medium mb-4" style={{ color: '#4C3D1E' }}>Account</h3>
            <div className="space-y-3">
              {/* User Info */}
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: '#feffaf' }}>
{user?.picture ? (
  <img 
    src={`${user.picture}?cb=${Date.now()}`} // cache-busting
    alt={user.name}
    className="w-10 h-10 rounded-full object-cover border"
    style={{ borderColor: '#E1C28B' }}
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
  className="w-10 h-10 rounded-full flex items-center justify-center border"
  style={{ 
    display: user?.picture ? 'none' : 'flex',
    backgroundColor: '#E1C28B',
    borderColor: '#E1C28B'
  }}
>
  <span className="font-medium text-lg" style={{ color: '#4C3D1E' }}>
    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
  </span>
</div>
                <div className="flex-1">
                  <p className="font-medium" style={{ color: '#4C3D1E' }}>{user?.name || 'User'}</p>
                  <p className="text-sm" style={{ color: '#4C3D1E', opacity: 0.7 }}>{user?.email}</p>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: '#feffaf' }}>
                <Mail size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
                <div className="flex-1">
                  <p className="text-sm" style={{ color: '#4C3D1E' }}>Email</p>
                  <p className="text-sm" style={{ color: '#4C3D1E', opacity: 0.7 }}>{user?.email}</p>
                </div>
              </div>

              {/* Account Type */}
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: '#feffaf' }}>
                <Shield size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
                <div className="flex-1">
                  <p className="text-sm" style={{ color: '#4C3D1E' }}>Account Type</p>
                  <p className="text-sm" style={{ color: '#4C3D1E', opacity: 0.7 }}>Free</p>
                </div>
              </div>
            </div>
          </div>
            </>
          )}

          {activeTab === 'app' && (
            <>
              {/* App Section */}
              <div>
            <h3 className="text-lg font-medium mb-4" style={{ color: '#4C3D1E' }}>App</h3>
            <div className="space-y-3">
              {/* Language */}
              <div className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors" style={{ backgroundColor: '#feffaf' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}>
                <div className="flex items-center gap-3">
                  <Globe size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
                  <span className="text-sm" style={{ color: '#4C3D1E' }}>Language</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: '#4C3D1E', opacity: 0.7 }}>English</span>
                  <span style={{ color: '#4C3D1E', opacity: 0.7 }}>›</span>
                </div>
              </div>

              {/* Theme */}
              <div className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors" style={{ backgroundColor: '#feffaf' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}>
                <div className="flex items-center gap-3">
                  <Palette size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
                  <span className="text-sm" style={{ color: '#4C3D1E' }}>Theme</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: '#4C3D1E', opacity: 0.7 }}>Light</span>
                  <span style={{ color: '#4C3D1E', opacity: 0.7 }}>›</span>
                </div>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors" style={{ backgroundColor: '#feffaf' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}>
                <div className="flex items-center gap-3">
                  <Bell size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
                  <span className="text-sm" style={{ color: '#4C3D1E' }}>Notifications</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: '#4C3D1E', opacity: 0.7 }}>Off</span>
                  <span style={{ color: '#4C3D1E', opacity: 0.7 }}>›</span>
                </div>
              </div>

              {/* Data Storage */}
              <div className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors" style={{ backgroundColor: '#feffaf' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}>
                <div className="flex items-center gap-3">
                  <Database size={16} style={{ color: '#4C3D1E', opacity: 0.7 }} />
                  <span className="text-sm" style={{ color: '#4C3D1E' }}>Data Storage</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: '#4C3D1E', opacity: 0.7 }}>Local</span>
                  <span style={{ color: '#4C3D1E', opacity: 0.7 }}>›</span>
                </div>
              </div>
            </div>
          </div>
            </>
          )}

          {activeTab === 'backup' && user && (
            <BackupManager 
              user={user} 
              onBackupRestored={() => {
                // Optionally refresh the page or show a success message
                window.location.reload();
              }}
            />
          )}

          {/* Logout Button - only show on account tab */}
          {activeTab === 'account' && (
            <div className="pt-4 border-t" style={{ borderColor: '#E1C28B' }}>
            <button
              onClick={onLogout}
              className="w-full p-3 rounded-lg transition-colors font-medium"
              style={{ backgroundColor: '#dc2626', color: '#fff' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            >
              Log Out
            </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
