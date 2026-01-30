import React, { useState } from 'react'
import { 
  X, Settings, Bell, User, Plus, Clock, ShoppingCart, Database, Lock, ShieldCheck
} from 'lucide-react'
import { User as UserType } from '../lib/auth'
import AccountTab from './settings/AccountTab'
import GeneralTab from './settings/GeneralTab'
import NotificationsTab from './settings/NotificationsTab'
import PersonalizationTab from './settings/PersonalizationTab'
import DataControlsTab from './settings/DataControlsTab'
import StubTab from './settings/StubTab'
import { SettingsProvider } from '../context/SettingsContext'

interface SettingsModalProps {
  isVisible: boolean
  onClose: () => void
  user: UserType | null
  onLogout: () => void
}

type Tab = 'general' | 'notifications' | 'personalization' | 'apps' | 'schedules' | 
  'orders' | 'data' | 'security' | 'parental' | 'account'

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isVisible, 
  onClose, 
  user, 
  onLogout 
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('general')

  if (!isVisible) return null

  const sidebarItems = [
    { id: 'general' as Tab, label: 'General', icon: Settings },
    { id: 'notifications' as Tab, label: 'Notifications', icon: Bell },
    { id: 'personalization' as Tab, label: 'Personalization', icon: User },
    { id: 'apps' as Tab, label: 'Apps & Connectors', icon: Plus },
    { id: 'schedules' as Tab, label: 'Schedules', icon: Clock },
    { id: 'orders' as Tab, label: 'Orders', icon: ShoppingCart },
    { id: 'data' as Tab, label: 'Data Controls', icon: Database },
    { id: 'security' as Tab, label: 'Security', icon: Lock },
    { id: 'parental' as Tab, label: 'Parental Controls', icon: ShieldCheck },
    { id: 'account' as Tab, label: 'Account', icon: User }
  ]

  return (
    <SettingsProvider>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
        <div 
          className="rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex" 
          style={{ backgroundColor: 'var(--chatty-bg-main)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sidebar */}
          <div className="w-64 flex flex-col rounded-l-lg" style={{ backgroundColor: 'var(--chatty-bg-sidebar)' }}>
            <div className="flex-1 overflow-y-auto">
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
              <div className="px-4 pb-4">
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
              <div className="flex-1">
                {sidebarItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
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
                      <Icon size={16} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Help button at bottom of sidebar */}
              <div className="p-4 border-t" style={{ borderColor: 'var(--chatty-line)' }}>
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
          <div className="flex-1 overflow-y-auto rounded-r-lg">
            <div className="p-6">
              {activeTab === 'general' && <GeneralTab />}
              {activeTab === 'notifications' && <NotificationsTab />}
              {activeTab === 'personalization' && <PersonalizationTab />}
              {activeTab === 'apps' && <StubTab title="Apps & Connectors" description="App integrations coming soon..." />}
              {activeTab === 'schedules' && <StubTab title="Schedules" description="Schedule management coming soon..." />}
              {activeTab === 'orders' && <StubTab title="Orders" description="Order history coming soon..." />}
              {activeTab === 'data' && <DataControlsTab />}
              {activeTab === 'security' && <StubTab title="Security" description="Security options coming soon..." />}
              {activeTab === 'parental' && <StubTab title="Parental Controls" description="Parental control settings coming soon..." />}
              {activeTab === 'account' && <AccountTab user={user} onLogout={onLogout} />}
            </div>
          </div>
        </div>
      </div>
    </SettingsProvider>
  )
}

export default SettingsModal
