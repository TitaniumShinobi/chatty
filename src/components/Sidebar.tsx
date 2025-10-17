import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  MessageSquare,
  Trash2,
  Search,
  Library,
  Clock,
  FolderPlus,
  PanelLeftClose,
  ChevronRight
} from 'lucide-react'
import { SidebarProps } from '../types'
import { GPTCreator } from '../lib/gptCreator'

const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  onNewConversationWithGPT,
  onDeleteConversation,
  currentUser,
  onShowSettings
}) => {
  const [gptCreator] = useState(() => GPTCreator.getInstance())
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!currentUser || !currentUser.sub) return
    const img = new Image()
    img.src = currentUser.picture || `/api/profile-image/${currentUser.sub}`
    img.onerror = () => {
      console.warn('Profile thumbnail preload failed')
    }
  }, [currentUser])

  return (
    <div className={`${collapsed ? 'w-12 overflow-visible' : 'w-64'} flex flex-col h-full bg-white group`}>
      {/* Logo & Toggle */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} p-4`}>
        <div className={`w-12 h-12 rounded-lg overflow-hidden relative ${collapsed ? 'absolute left-1/2 top-4 -translate-x-1/2' : ''}`}>
          <img
            src="/assets/chatty_star.png"
            alt="ChattyStar"
            className={`h-full w-full object-cover ${collapsed ? 'scale-[0.7]' : 'scale-100'}`}
          />
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="absolute w-8 h-8 flex items-center justify-center rounded transition-opacity duration-150 opacity-0 group-hover:opacity-100 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              aria-label="Open sidebar"
              style={{ backgroundColor: 'transparent' }}
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-yellow-100">
                <ChevronRight size={14} className="text-gray-600" />
              </span>
            </button>
          )}
        </div>
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} className="p-1 rounded transition-colors">
            <PanelLeftClose size={16} className="text-gray-600" />
          </button>
        )}
      </div>

      {/* Navigation (when expanded) */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <button onClick={onNewConversation} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
            <Plus size={16} /> New chat
          </button>
          {/* Add more nav buttons here */}
        </div>
      )}

      {/* GPTs section */}
      <div className="px-4 pb-4">
        <h3 className="text-xs text-gray-500 uppercase mb-2">GPTs</h3>
        <button onClick={() => navigate('/app/gpts')} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
          <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">□</div>
          Explore
        </button>
        {gptCreator.getAllPersonalities().filter(p => p.id !== 'default-chatty').slice(0, 2).map(p => (
          <button
            key={p.id}
            onClick={() => {
              gptCreator.setActivePersonality(p.id)
              onNewConversationWithGPT(p.id)
            }}
            className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
          >
            <div className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">{p.name.charAt(0)}</span>
            </div>
            {p.name}
          </button>
        ))}
      </div>

      {/* Chats */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto">
        <h3 className="text-xs text-gray-500 uppercase mb-2">Chats</h3>
        {conversations.map(conv => (
          <button
            key={conv.id}
            onClick={() => onConversationSelect(conv.id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md ${conv.id === currentConversationId ? 'bg-gray-100' : ''}`}
          >
            <span className="truncate flex-1">{conv.title}</span>
            <button
              onClick={e => {
                e.stopPropagation()
                onDeleteConversation(conv.id)
              }}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <Trash2 size={12} className="text-gray-500" />
            </button>
          </button>
        ))}
        {conversations.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">
            <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
            <p>No conversations yet</p>
          </div>
        )}
      </div>

      {/* User Profile / Sign-Out section */}
      <div className="p-4 border-t border-gray-200 relative">
        {currentUser ? (
          <button onClick={onShowSettings} className="flex items-center gap-3 w-full p-2 hover:bg-gray-100 rounded-md">
            {currentUser.picture || currentUser.sub ? (
              <img
                src={currentUser.picture || `/api/profile-image/${currentUser.sub}`}
                alt={currentUser.name}
                className="w-8 h-8 rounded-full"
                onError={e => {
                  console.warn('Thumbnail failed to load, fallback to initial');
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : null}
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center"
                 style={{ display: (currentUser.picture || currentUser.sub) ? 'none' : 'flex' }}>
              <span className="text-white text-sm font-medium">
                {currentUser.name?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="flex flex-col text-left truncate">
              <span className="text-sm font-medium text-gray-900 truncate">
                {currentUser.name || currentUser.email || 'User'}
              </span>
              <span className="text-xs text-gray-500">Plus</span>
            </div>
          </button>
        ) : (
          <button
            onClick={() => window.location.href = "/api/auth/google"}
            className="w-full rounded-md p-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Continue with Google
          </button>
        )}
        {collapsed && currentUser && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            {currentUser.picture ? (
              <img
                src={currentUser.picture || `/api/profile-image/${currentUser.sub}`}
                alt={currentUser.name}
                className="w-8 h-8 rounded-full"
                onError={e => {
                  console.warn('Collapsed thumbnail load failed');
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm">
                {currentUser.name?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Sidebar