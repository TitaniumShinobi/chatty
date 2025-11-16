import React, { useState } from 'react'
import { 
  X, Bell, Database, 
  Settings, User, Lock, Clock, ShoppingCart, ShieldCheck, 
  Plus
} from 'lucide-react'
import { User as UserType } from '../lib/auth'
import BackupManager from './BackupManager'
import { SettingsProvider } from '../context/SettingsContext'
import { SettingsTab } from '../types/settings'
import { Z_LAYERS } from '../lib/zLayers'

// Import tab components
import GeneralTab from './settings/GeneralTab'
import NotificationsTab from './settings/NotificationsTab'
import PersonalizationTab from './settings/PersonalizationTab'
import DataControlsTab from './settings/DataControlsTab'
import AccountTab from './settings/AccountTab'
import StubTab from './settings/StubTab'

interface SettingsModalProps {
  isVisible: boolean
  onClose: () => void
  user: UserType | null
  onLogout: () => void
  onDeleteAllConversations?: () => void
}

const SettingsModalContent: React.FC<SettingsModalProps> = ({ 
  isVisible, 
  onClose, 
  user, 
  onLogout,
  onDeleteAllConversations 
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  const sidebarItems = [
    { id: 'general' as SettingsTab, label: 'General', icon: Settings },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: Bell },
    { id: 'personalization' as SettingsTab, label: 'Personalization', icon: User },
    { id: 'apps' as SettingsTab, label: 'Apps & Connectors', icon: Plus },
    { id: 'schedules' as SettingsTab, label: 'Schedules', icon: Clock },
    { id: 'orders' as SettingsTab, label: 'Orders', icon: ShoppingCart },
    { id: 'data' as SettingsTab, label: 'Data Controls', icon: Database },
    { id: 'security' as SettingsTab, label: 'Security', icon: Lock },
    { id: 'parental' as SettingsTab, label: 'Parental Controls', icon: ShieldCheck },
    { id: 'account' as SettingsTab, label: 'Account', icon: User },
    { id: 'backup' as SettingsTab, label: 'Backup', icon: Database }
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralTab />
      case 'notifications':
        return <NotificationsTab />
      case 'personalization':
        return <PersonalizationTab />
      case 'data':
        return <DataControlsTab user={user} onDeleteAllConversations={onDeleteAllConversations} />
      case 'account':
        return <AccountTab user={user} onLogout={onLogout} />
      case 'apps':
        return <StubTab title="Apps & Connectors" description="Manage your app integrations and connectors." icon={<Plus size={24} style={{ color: 'var(--chatty-icon)' }} />} />
      case 'schedules':
        return <StubTab title="Schedules" description="Set up automated tasks and recurring conversations." icon={<Clock size={24} style={{ color: 'var(--chatty-icon)' }} />} />
      case 'orders':
        return <StubTab title="Orders" description="View your subscription and billing history." icon={<ShoppingCart size={24} style={{ color: 'var(--chatty-icon)' }} />} />
      case 'security':
        return <StubTab title="Security" description="Manage your account security and privacy settings." icon={<Lock size={24} style={{ color: 'var(--chatty-icon)' }} />} />
      case 'parental':
        return <StubTab title="Parental Controls" description="Set up content filtering and usage restrictions." icon={<ShieldCheck size={24} style={{ color: 'var(--chatty-icon)' }} />} />
      case 'backup':
        return (
          <div>
            <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
              Backup & Recovery
            </h3>
            {user && (
              <BackupManager 
                user={user} 
                onBackupRestored={() => {
                  // Optionally refresh the page or show a success message
                  window.location.reload();
                }}
              />
            )}
          </div>
        )
      default:
        return <GeneralTab />
    }
  }

  // Early return after all hooks to maintain hook order consistency
  if (!isVisible) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      style={{ zIndex: Z_LAYERS.modal }}
    >
      <div className="rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[70vh] flex" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
        {/* Sidebar */}
        <div className="w-64 rounded-l-lg" style={{ backgroundColor: 'var(--chatty-bg-sidebar)' }}>
          <div className="h-full overflow-y-auto">
            {/* Close Button */}
            <div className="flex justify-start p-4">
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--chatty-text)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={20} />
              </button>
            </div>

            {/* User Email and Upgrade Plan */}
            <div className="p-4">
              <div className="text-sm mb-2" style={{ color: 'var(--chatty-text)' }}>
                {user?.email}
              </div>
              <button 
                className="text-sm underline hover:no-underline transition-all" 
                style={{ color: 'var(--chatty-text)' }}
                onClick={() => {
                  // TODO: Implement upgrade plan functionality
                  console.log('Upgrade plan clicked');
                }}
              >
                Upgrade plan
              </button>
            </div>

            {/* Navigation Items */}
            {sidebarItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    activeTab === item.id ? 'border-r-2' : ''
                  }`}
                  style={{
                    color: 'var(--chatty-text)',
                    backgroundColor: activeTab === item.id ? 'var(--chatty-highlight)' : 'transparent',
                    borderRightColor: activeTab === item.id ? 'var(--chatty-line)' : 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== item.id) {
                      e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== item.id) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  <Icon size={16} style={{ color: 'var(--chatty-icon)', opacity: 0.7 }} />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              )
            })}

            {/* Help button at bottom of sidebar */}
            <div className="p-4">
              <button 
                className="text-sm underline hover:no-underline transition-all" 
                style={{ color: 'var(--chatty-text)' }}
                onClick={() => {
                  // TODO: Implement help functionality
                  console.log('Help clicked');
                }}
              >
                Help
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  return (
    <SettingsProvider>
      <SettingsModalContent {...props} />
    </SettingsProvider>
  );
};

export default SettingsModal
