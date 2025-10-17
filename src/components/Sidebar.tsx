import React, { useState } from 'react'
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
import { cn } from '../lib/utils'
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

  return (
    <div
      className={`${collapsed ? 'w-12 overflow-visible' : 'w-64'} flex flex-col h-full group relative`}
      style={{ backgroundColor: '#ffffd7', color: '#4C3D1E' }}
    >
      {/* Top Section - Logo and Panel Toggle */}
      <div className="relative p-4">
        {/* Logo - Chatty Starburst */}
        <div className="flex items-center justify-center">
          <div className="w-12 h-12 rounded-lg overflow-hidden">
            <img 
              src="/assets/chatty_star.png" 
              alt="Chatty" 
              className="h-full w-full object-cover" 
            />
          </div>
        </div>

        {/* Toggle Button */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="absolute right-4 top-4 p-1 rounded transition-colors duration-150"
            aria-label="Close sidebar"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <PanelLeftClose size={16} />
          </button>
        )}

        {/* Expand Button (when collapsed) */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute right-2 top-4 p-1 rounded transition-opacity duration-150 opacity-0 group-hover:opacity-100"
            aria-label="Open sidebar"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Navigation Options - Flat List Style */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <div className="space-y-1">
            <button 
              onClick={onNewConversation}
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              <Plus size={16} className="text-gray-600" />
              New chat
            </button>

            <button className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <Search size={16} className="text-gray-600" />
              Search chats
            </button>

            <button className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <Library size={16} className="text-gray-600" />
              Library
            </button>

            <button className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <Clock size={16} className="text-gray-600" />
              Codex
            </button>

            <button className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <FolderPlus size={16} className="text-gray-600" />
              Projects
            </button>
          </div>
        </div>
      )}

      {/* Collapsed Navigation Icons */}
      {collapsed && (
        <div className="flex flex-col items-center py-2 space-y-2">
          <button 
            onClick={onNewConversation} 
            className="p-2 rounded transition-colors duration-150" 
            aria-label="New chat"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Plus size={16} />
          </button>
          <button 
            onClick={() => { /* open search */ }} 
            className="p-2 rounded transition-colors duration-150" 
            aria-label="Search chats"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Search size={16} />
          </button>
          <button 
            onClick={() => navigate('/app/library')} 
            className="p-2 rounded transition-colors duration-150" 
            aria-label="Library"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Library size={16} />
          </button>
          <button 
            onClick={() => navigate('/app/codex')} 
            className="p-2 rounded transition-colors duration-150" 
            aria-label="Codex"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Clock size={16} />
          </button>
          <button 
            className="p-2 rounded transition-colors duration-150" 
            aria-label="Projects"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <FolderPlus size={16} />
          </button>
          <button 
            onClick={() => navigate('/app/gpts')} 
            className="p-2 rounded transition-colors duration-150" 
            aria-label="Explore"
            style={{ color: '#4C3D1E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div className="w-5 h-5 flex items-center justify-center">□</div>
          </button>
        </div>
      )}

      {/* GPTs Section - Only show when expanded */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <h3 className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: '#4C3D1E', opacity: 0.6 }}>GPTs</h3>
          <div className="space-y-1">
            <button 
              onClick={() => navigate('/app/gpts')}
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ color: '#4C3D1E' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: '#E1C28B' }}>
                <span className="text-xs" style={{ color: '#4C3D1E' }}>□</span>
              </div>
              Explore
            </button>

            {/* Custom GPTs */}
            {gptCreator.getAllPersonalities().filter(p => p.id !== 'default-chatty').slice(0, 2).map((personality) => (
              <button
                key={personality.id}
                onClick={() => {
                  gptCreator.setActivePersonality(personality.id)
                  onNewConversationWithGPT(personality.id)
                }}
                className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
                style={{ color: '#4C3D1E' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#4C3D1E' }}>
                  <span className="text-white text-xs font-bold">
                    {personality.name.charAt(0)}
                  </span>
                </div>
                {personality.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chats Section */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Chats</h3>
        <div className="space-y-1">
          {/* Existing Conversations - No borders, just hover highlights */}
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onConversationSelect(conversation.id)}
              className={cn(
                "flex items-center justify-between w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors group",
                conversation.id === currentConversationId && "bg-gray-100"
              )}
            >
              <span className="truncate flex-1">
                {conversation.title}
              </span>
              <button
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation(conversation.id);
                }}
              >
                <Trash2 size={12} className="text-gray-500" />
              </button>
            </button>
          ))}

          {/* Empty state */}
          {conversations.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-8">
              <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
              <p>No conversations yet</p>
            </div>
          )}
        </div>
      </div>

      {/* User Profile Section - Anchored at Bottom (expanded only) */}
      {!collapsed && (
        <div className="p-4 border-t" style={{ borderColor: '#E1C28B' }}>
          {currentUser ? (
            <button
              onClick={onShowSettings}
              className="flex items-center gap-3 w-full p-2 rounded-md transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#feffaf')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {currentUser.picture ? (
                <img 
                  src={`/api/profile-image/${currentUser.sub}`}
                  alt={currentUser.name}
                  className="w-8 h-8 rounded-full"
                  onError={(e) => {
                    console.log('Sidebar image failed to load, falling back to initial');
                    e.currentTarget.style.display = 'none';
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                    if (fallback) {
                      fallback.style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ display: currentUser && currentUser.picture ? 'none' : 'flex', backgroundColor: '#E1C28B' }}
              >
                <span className="text-sm font-medium" style={{ color: '#4C3D1E' }}>
                  {currentUser?.name?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-medium truncate" style={{ color: '#4C3D1E' }}>
                  {currentUser?.name || currentUser?.email || 'User'}
                </span>
                <span className="text-xs" style={{ color: '#4C3D1E', opacity: 0.6 }}>
                  Plus
                </span>
              </div>
            </button>
          ) : (
            <button 
              onClick={() => window.location.href = "/api/auth/google"}
              className="w-full rounded-md p-2 text-sm font-medium transition-colors"
              style={{ backgroundColor: '#E1C28B', color: '#4C3D1E' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#caa66b')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#E1C28B')}
            >
              Continue with Google
            </button>
          )}
        </div>
      )}
      {/* Collapsed profile thumbnail */}
      {collapsed && currentUser && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          {(currentUser.picture || currentUser.sub) ? (
            <img
              src={currentUser.picture ? currentUser.picture : `/api/profile-image/${currentUser.sub}`}
              alt={currentUser.name || 'User'}
              className="w-8 h-8 rounded-full"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-8 h-8 bg-[#E1C28B] rounded-full flex items-center justify-center text-white text-sm font-medium">
              {currentUser.name?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Sidebar

