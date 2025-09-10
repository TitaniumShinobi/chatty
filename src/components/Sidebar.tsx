import React, { useState } from 'react'
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Bot,
  LogOut,
  Settings
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
  onShowGPTCreator,
  onShowGPTs,
  currentUser,
  onLogout,
  onShowSettings
}) => {
  const [gptCreator] = useState(() => GPTCreator.getInstance())
  
  return (
    <div className="flex flex-col h-full bg-app-gray-950 border-r border-app-gray-800">
      {/* Brand Header */}
      <div className="p-4 border-b border-app-gray-800">
        <h1 className="text-lg font-semibold text-white">Chatty</h1>
      </div>

      {/* GPTs Section - List Style */}
      <div className="p-3 border-b border-app-gray-800">
        <div className="space-y-1">
          {/* Default Chatty */}
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-app-gray-800 cursor-pointer">
            <div className="w-6 h-6 bg-app-green-600 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <span className="text-sm font-medium text-white">Chatty</span>
          </div>
          
          {/* GPTs Header */}
          <div 
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-app-gray-800 cursor-pointer"
            onClick={onShowGPTs}
          >
            <div className="w-6 h-6 bg-app-gray-700 rounded flex items-center justify-center">
              <span className="text-white text-xs">□</span>
            </div>
            <span className="text-sm text-app-gray-300">GPTs</span>
          </div>
          
          {/* Create GPT Button */}
          <div 
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-app-gray-800 cursor-pointer"
            onClick={onShowGPTCreator}
          >
            <div className="w-6 h-6 bg-app-gray-600 rounded flex items-center justify-center">
              <Plus size={12} className="text-white" />
            </div>
            <span className="text-sm text-app-gray-300">Create GPT</span>
          </div>
          
          {/* Custom GPTs */}
          {gptCreator.getAllPersonalities().filter(p => p.id !== 'default-chatty').slice(0, 3).map((personality) => (
            <div
              key={personality.id}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                personality.isActive 
                  ? "bg-app-gray-700" 
                  : "hover:bg-app-gray-800"
              )}
              onClick={() => {
                gptCreator.setActivePersonality(personality.id)
                onNewConversationWithGPT(personality.id)
              }}
            >
              <div className="w-6 h-6 bg-app-gray-600 rounded flex items-center justify-center">
                <Bot size={12} className="text-white" />
              </div>
              <span className="text-sm text-app-gray-300">{personality.name}</span>
            </div>
          ))}
          
          {/* Show more indicator if there are more GPTs */}
          {gptCreator.getAllPersonalities().filter(p => p.id !== 'default-chatty').length > 3 && (
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-app-gray-800 cursor-pointer">
              <div className="w-6 h-6 bg-gradient-to-br from-orange-400 to-yellow-400 rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {gptCreator.getAllPersonalities().filter(p => p.id !== 'default-chatty').length - 3}
                </span>
              </div>
              <span className="text-sm text-app-gray-300">
                {gptCreator.getAllPersonalities().filter(p => p.id !== 'default-chatty').length - 3} more
              </span>
              <span className="ml-auto text-app-gray-400">▼</span>
            </div>
          )}
        </div>
      </div>

      {/* Chats Section - List Style */}
      <div className="flex-1 p-3 overflow-y-auto">
        <div className="space-y-1">
          {/* New Chat Button */}
          <div 
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-app-gray-800 cursor-pointer"
            onClick={onNewConversation}
          >
            <div className="w-6 h-6 bg-app-gray-600 rounded flex items-center justify-center">
              <Plus size={12} className="text-white" />
            </div>
            <span className="text-sm text-app-gray-300">New chat</span>
          </div>
          
          {/* Existing Conversations */}
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors group",
                conversation.id === currentConversationId
                  ? "bg-app-gray-700" 
                  : "hover:bg-app-gray-800"
              )}
              onClick={() => onConversationSelect(conversation.id)}
            >
              <div className="w-6 h-6 bg-app-gray-600 rounded flex items-center justify-center">
                <MessageSquare size={12} className="text-white" />
              </div>
              <span className="text-sm text-app-gray-300 truncate flex-1">
                {conversation.title}
              </span>
              <button
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-app-gray-600 rounded transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation(conversation.id);
                }}
              >
                <Trash2 size={10} className="text-app-gray-400" />
              </button>
            </div>
          ))}
          
          {/* Empty state */}
          {conversations.length === 0 && (
            <div className="text-center text-app-gray-400 text-sm py-8">
              <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
              <p>No conversations yet</p>
              <p className="text-xs mt-1">Start a new chat to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* User Profile Section */}
      <div className="p-3 border-t border-app-gray-800">
        {currentUser ? (
          <div className="flex items-center justify-between">
            <button
              onClick={onShowSettings}
              className="flex items-center gap-3 flex-1 p-2 rounded-lg hover:bg-app-gray-800 transition-colors"
            >
              {currentUser.picture ? (
                <img 
                  src={currentUser.picture} 
                  alt={currentUser.name}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 bg-app-gray-600 rounded-full flex items-center justify-center">
                  <span className="text-app-gray-300 text-sm font-medium">
                    {currentUser.name?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
                  </span>
                </div>
              )}
              <div className="flex flex-col text-left">
                <span className="text-sm font-medium text-app-gray-300 truncate">
                  {currentUser.name || currentUser.email || 'User'}
                </span>
                <span className="text-xs text-app-gray-400">
                  {currentUser.email}
                </span>
              </div>
              <Settings size={16} className="text-app-gray-400 ml-auto" />
            </button>
          </div>
        ) : (
          <button 
            onClick={() => window.location.href = "/api/auth/google"}
            className="w-full rounded-xl p-2 bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Continue with Google
          </button>
        )}
      </div>
    </div>
  )
}

export default Sidebar
