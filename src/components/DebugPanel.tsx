import React from 'react'
import { ConversationContext } from '../lib/conversationAI'

interface DebugPanelProps {
  context: ConversationContext
  isVisible: boolean
  onToggle: () => void
}

const DebugPanel: React.FC<DebugPanelProps> = ({ context, isVisible, onToggle }) => {
  if (!isVisible) return null

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-app-gray-800 border border-app-gray-600 rounded-lg p-4 shadow-lg z-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">AI Debug Info</h3>
        <button
          onClick={onToggle}
          className="text-app-gray-400 hover:text-white"
        >
          ×
        </button>
      </div>
      
      <div className="space-y-2 text-xs">
        <div>
          <span className="text-app-gray-400">Topic:</span>
          <span className="text-white ml-2">{context.topic}</span>
        </div>
        
        <div>
          <span className="text-app-gray-400">Mood:</span>
          <span className="text-white ml-2">{context.mood}</span>
        </div>
        
        <div>
          <span className="text-app-gray-400">User Role:</span>
          <span className="text-white ml-2">{context.userRole || 'none'}</span>
        </div>
        
        <div>
          <span className="text-app-gray-400">Current Intent:</span>
          <span className="text-white ml-2">{context.currentIntent}</span>
        </div>
        
        <div>
          <span className="text-app-gray-400">Previous Intents:</span>
          <div className="text-white ml-2">
            {context.previousIntents.slice(-3).map((intent, index) => (
              <span key={index} className="inline-block bg-app-gray-700 px-1 rounded mr-1 mb-1">
                {intent}
              </span>
            ))}
          </div>
        </div>
        
        <div>
          <span className="text-app-gray-400">Message History:</span>
          <div className="text-white ml-2 max-h-20 overflow-y-auto">
            {context.conversationHistory.slice(-3).map((msg, index) => (
              <div key={index} className="text-xs text-app-gray-300 truncate">
                {msg}
              </div>
            ))}
          </div>
        </div>
        
        <div className="pt-2 border-t border-app-gray-600">
          <button
            onClick={() => {
              (localStorage as any).clear();
              sessionStorage.clear();
              window.location.reload();
            }}
            className="w-full px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
            title="Clear all cached state and reload"
          >
            🔄 Reset All Data
          </button>
        </div>
      </div>
    </div>
  )
}

export default DebugPanel
