import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Plus, Bot, Trash2 } from 'lucide-react'
import GPTCreator from '../components/GPTCreator'
import { GPTService, GPTConfig } from '../lib/gptService'

interface GPTsPageProps {
  initialOpen?: boolean
}

export default function GPTsPage({ initialOpen = false }: GPTsPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const gptService = GPTService.getInstance()
  const [isCreatorOpen, setCreatorOpen] = useState(initialOpen)
  const [gpts, setGpts] = useState<GPTConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Route controls modal state
  useEffect(() => {
    setCreatorOpen(location.pathname.endsWith('/new'))
  }, [location.pathname])

  // Load GPTs when component mounts
  useEffect(() => {
    loadGPTs()
  }, [])

  const loadGPTs = async () => {
    try {
      setIsLoading(true)
      const allGpts = await gptService.getAllGPTs()
      setGpts(allGpts)
    } catch (error) {
      console.error('Failed to load GPTs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await gptService.deleteGPT(id)
      await loadGPTs() // Refresh the list
    } catch (error) {
      console.error('Failed to delete GPT:', error)
    }
  }

  const handleClose = () => {
    setCreatorOpen(false)
    navigate('/app/gpts')
    loadGPTs() // Refresh the list
  }

  const handleGPTCreated = () => {
    loadGPTs() // Refresh the list
  }

  return (
    <div className="min-h-screen bg-[#ffffeb] text-[#4C3D1E]">
      {/* Header */}
      <div className="border-b border-[#E1C28B] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Your GPTs</h1>
            <p className="mt-1 text-[#4C3D1E] opacity-70">Manage and create custom AI assistants</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/app/gpts/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-[#E1C28B] text-[#4C3D1E] hover:bg-[#feffaf]"
          >
            <Plus size={16} />
            Create GPT
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent border-[#E1C28B] mx-auto mb-4"></div>
            <p className="text-[#4C3D1E] opacity-70">Loading GPTs...</p>
          </div>
        ) : gpts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4 bg-[#feffaf]">
              <Bot size={24} className="text-[#4C3D1E]" />
            </div>
            <h3 className="text-lg font-medium mb-2">No GPTs yet</h3>
            <p className="mb-6 text-[#4C3D1E] opacity-70">Create your first custom AI assistant to get started.</p>
            <button
              type="button"
              onClick={() => navigate('/app/gpts/new')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-[#E1C28B] text-[#4C3D1E] hover:bg-[#feffaf]"
            >
              <Plus size={16} />
              Create GPT
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gpts.map((gpt) => (
              <div
                key={gpt.id}
                className="border border-[#E1C28B] rounded-lg p-4 transition-colors shadow-sm bg-[#feffaf] hover:bg-[#ffffd7]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-[#E1C28B]">
                      {gpt.avatar ? (
                        <img src={gpt.avatar} alt={gpt.name} className="w-full h-full object-cover" />
                      ) : (
                        <Bot size={16} className="text-[#4C3D1E]" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium">{gpt.name}</h3>
                      <p className="text-sm text-[#4C3D1E] opacity-70">{gpt.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(gpt.id)}
                      className="p-1 rounded transition-colors text-[#4C3D1E] hover:bg-[#feffaf]"
                      title="Delete GPT"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <p className="text-xs mb-1 text-[#4C3D1E] opacity-60">Instructions</p>
                    <p className="text-sm line-clamp-2 text-[#4C3D1E] opacity-80">
                      {gpt.instructions || 'No instructions provided'}
                    </p>
                  </div>
                  
                  {gpt.conversationStarters && gpt.conversationStarters.length > 0 && (
                    <div>
                      <p className="text-xs mb-1 text-[#4C3D1E] opacity-60">Conversation Starters</p>
                      <div className="flex flex-wrap gap-1">
                        {gpt.conversationStarters.slice(0, 2).map((starter: string, index: number) => (
                          <span
                            key={index}
                            className="text-xs px-2 py-1 rounded bg-[#feffaf] text-[#4C3D1E]"
                          >
                            {starter}
                          </span>
                        ))}
                        {gpt.conversationStarters.length > 2 && (
                          <span className="text-xs text-[#4C3D1E] opacity-60">
                            +{gpt.conversationStarters.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#4C3D1E] opacity-60">Model:</span>
                      <span className="text-xs px-2 py-1 rounded bg-[#feffaf] text-[#4C3D1E]">
                        {gpt.modelId}
                      </span>
                    </div>
                    <Link
                      to="/"
                      className="text-xs transition-colors text-[#4C3D1E] opacity-80 hover:opacity-100"
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
      <GPTCreator
        isVisible={isCreatorOpen}
        onClose={handleClose}
        onGPTCreated={handleGPTCreated}
      />
    </div>
  )
}