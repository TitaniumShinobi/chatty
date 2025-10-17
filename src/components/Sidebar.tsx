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
    <div className={`${collapsed ? 'w-12 overflow-visible' : 'w-64'} flex flex-col h-full bg-white group`}>
      {/* Top Section - Logo and Panel Toggle */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} p-4`}>
        {/* Logo + overlay toggle */}
        <div className="flex items-center gap-2 relative">
          <div className={`w-12 h-12 rounded-lg overflow-hidden relative ${collapsed ? 'absolute left-1/2 top-4 -translate-x-1/2' : ''}`}>
            <img src="/assets/chatty_star.png" alt="ChattyStar" className={`h-full w-full object-cover ${collapsed ? 'scale-[0.7]' : 'scale-100'}`} />

            {/* When collapsed, overlay the open button on the star and reveal on hover */}
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
          {collapsed && (
            <div style={{ position: 'absolute', left: '50%', top: '56px', transform: 'translateX(-50%)' }} className="flex flex-col items-center mt-2 space-y-2 -translate-x-1/2">
              <button onClick={onNewConversation} className="w-8 h-8 flex items-center justify-center rounded hover:bg-yellow-100" aria-label="New chat"><Plus size={16} /></button>
              <button onClick={() => { /* open search */ }} className="w-8 h-8 flex items-center justify-center rounded hover:bg-yellow-100" aria-label="Search chats"><Search size={16} /></button>
              <button onClick={() => navigate('/app/library')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-yellow-100" aria-label="Library"><Library size={16} /></button>
              <button onClick={() => navigate('/app/codex')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-yellow-100" aria-label="Codex"><Clock size={16} /></button>
              <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-yellow-100" aria-label="Projects"><FolderPlus size={16} /></button>
              <button onClick={() => navigate('/app/gpts')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-yellow-100" aria-label="Explore"><div className="w-5 h-5 flex items-center justify-center">□</div></button>
            </div>
          )}
        </div>

        {/* Toggle in normal position when expanded */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded transition-colors"
            aria-label="Close sidebar"
          >
            <PanelLeftClose size={16} className="text-gray-600" />
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

      {/* Collapsed icon strip (icons only) */}
      {collapsed && (
        <div className="flex flex-col items-center py-2 space-y-2">
          <button onClick={onNewConversation} className="p-2 rounded hover:bg-yellow-100" aria-label="New chat"><Plus size={16} /></button>
          <button onClick={() => { /* open search */ }} className="p-2 rounded hover:bg-yellow-100" aria-label="Search chats"><Search size={16} /></button>
          <button onClick={() => navigate('/app/library')} className="p-2 rounded hover:bg-yellow-100" aria-label="Library"><Library size={16} /></button>
          <button onClick={() => navigate('/app/codex')} className="p-2 rounded hover:bg-yellow-100" aria-label="Codex"><Clock size={16} /></button>
          <button className="p-2 rounded hover:bg-yellow-100" aria-label="Projects"><FolderPlus size={16} /></button>
          <button onClick={() => navigate('/app/gpts')} className="p-2 rounded hover:bg-yellow-100" aria-label="Explore"><div className="w-5 h-5 flex items-center justify-center">□</div></button>
        </div>
      )}

      {/* GPTs Section */}
      <div className="px-4 pb-4">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">GPTs</h3>
        <div className="space-y-1">
          <button 
            onClick={() => navigate('/app/gpts')}
            className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
              <span className="text-gray-600 text-xs">□</span>
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
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              <div className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {personality.name.charAt(0)}
                </span>
              </div>
              {personality.name}
            </button>
          ))}
        </div>
      </div>

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

      {/* User Profile Section - Anchored at Bottom */}
      <div className="p-4 border-t border-gray-200">
        {currentUser ? (
          <button
            onClick={onShowSettings}
            className="flex items-center gap-3 w-full p-2 hover:bg-gray-100 rounded-md transition-colors"
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
              className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center"
              style={{ display: currentUser.picture ? 'none' : 'flex' }}
            >
              <span className="text-white text-sm font-medium">
                {currentUser.name?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-medium text-gray-900 truncate">
                {currentUser.name || currentUser.email || 'User'}
              </span>
              <span className="text-xs text-gray-500">
                Plus
              </span>
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
      </div>
      {/* Collapsed profile thumbnail */}
      {collapsed && currentUser && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          {currentUser.picture ? (
            <img src={`/api/profile-image/${currentUser.sub}`} alt={currentUser.name} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
              {currentUser.name?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Sidebar

