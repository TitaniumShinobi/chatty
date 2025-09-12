import React, { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Plus, Bot, Settings, Trash2 } from 'lucide-react'
import { GPTCreator } from '../lib/gptCreator'
import GPTCreatorComponent from '../components/GPTCreator'
import { cn } from '../lib/utils'

interface GPTsPageProps {
  initialOpen?: boolean
}

export default function GPTsPage({ initialOpen = false }: GPTsPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const gptCreator = useMemo(() => GPTCreator.getInstance(), [])
  const [isCreatorOpen, setCreatorOpen] = useState(initialOpen)
  const [personalities, setPersonalities] = useState(() => gptCreator.getAllPersonalities())

  // Route controls modal state
  useEffect(() => {
    setCreatorOpen(location.pathname.endsWith('/new'))
  }, [location.pathname])

  // Refresh personalities when component mounts or creator changes
  useEffect(() => {
    setPersonalities(gptCreator.getAllPersonalities())
  }, [gptCreator])

  const refresh = () => {
    setPersonalities(gptCreator.getAllPersonalities())
  }

  const handleDelete = (id: string) => {
    if (id === 'default-chatty') return // Don't delete default
    if (gptCreator.deletePersonality(id)) {
      refresh()
    }
  }

  const handleClose = () => {
    setCreatorOpen(false)
    navigate('/app/gpts')
    refresh()
  }

  const handlePersonalityChange = () => {
    refresh()
  }

  const customGPTs = personalities.filter(p => p.id !== 'default-chatty')

  return (
    <div className="min-h-screen bg-app-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-app-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Your GPTs</h1>
            <p className="text-app-gray-400 mt-1">Manage and create custom AI assistants</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/app/gpts/new')}
            className="flex items-center gap-2 px-4 py-2 bg-app-green-600 hover:bg-app-green-700 rounded-lg text-white font-medium transition-colors"
          >
            <Plus size={16} />
            Create GPT
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {customGPTs.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-app-gray-800 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Bot size={24} className="text-app-gray-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">No GPTs yet</h3>
            <p className="text-app-gray-400 mb-6">Create your first custom AI assistant to get started.</p>
            <button
              type="button"
              onClick={() => navigate('/app/gpts/new')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-app-green-600 hover:bg-app-green-700 rounded-lg text-white font-medium transition-colors"
            >
              <Plus size={16} />
              Create GPT
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customGPTs.map((gpt) => (
              <div
                key={gpt.id}
                className="bg-app-gray-900 border border-app-gray-800 rounded-lg p-4 hover:bg-app-gray-800 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-app-gray-700 rounded-lg flex items-center justify-center">
                      <Bot size={16} className="text-app-gray-300" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{gpt.name}</h3>
                      <p className="text-sm text-app-gray-400">{gpt.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(gpt.id)}
                      className="p-1 hover:bg-app-gray-700 rounded text-app-gray-400 hover:text-red-400 transition-colors"
                      title="Delete GPT"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-app-gray-500 mb-1">Instructions</p>
                    <p className="text-sm text-app-gray-300 line-clamp-2">
                      {gpt.instructions || 'No instructions provided'}
                    </p>
                  </div>
                  
                  {gpt.conversationStarters.length > 0 && (
                    <div>
                      <p className="text-xs text-app-gray-500 mb-1">Conversation Starters</p>
                      <div className="flex flex-wrap gap-1">
                        {gpt.conversationStarters.slice(0, 2).map((starter, index) => (
                          <span
                            key={index}
                            className="text-xs bg-app-gray-800 text-app-gray-300 px-2 py-1 rounded"
                          >
                            {starter}
                          </span>
                        ))}
                        {gpt.conversationStarters.length > 2 && (
                          <span className="text-xs text-app-gray-500">
                            +{gpt.conversationStarters.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-app-gray-500">Model:</span>
                      <span className="text-xs bg-app-gray-800 text-app-gray-300 px-2 py-1 rounded">
                        {gpt.modelId}
                      </span>
                    </div>
                    <Link
                      to="/"
                      className="text-xs text-app-green-400 hover:text-app-green-300 transition-colors"
                    >
                      Use GPT →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GPT Creator Modal */}
      <GPTCreatorComponent
        isVisible={isCreatorOpen}
        onClose={handleClose}
        onPersonalityChange={handlePersonalityChange}
      />
    </div>
  )
}
