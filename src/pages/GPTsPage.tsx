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
  const [editingConfig, setEditingConfig] = useState<GPTConfig | null>(null)

  // Route controls modal state
  useEffect(() => {
    const editMatch = location.pathname.match(/\/app\/gpts\/edit\/([^/]+)/)
    if (location.pathname.endsWith('/new')) {
      setCreatorOpen(true)
      setEditingConfig(null)
    } else if (editMatch) {
      setCreatorOpen(true)
      loadGPTForEdit(editMatch[1])
    } else {
      setCreatorOpen(false)
      setEditingConfig(null)
    }
  }, [location.pathname])

  // Load GPTs when component mounts
  useEffect(() => {
    loadGPTs()
  }, [])

  const loadGPTs = async () => {
    try {
      setIsLoading(true)
      const allGpts = await gptService.getAllGPTs()
      console.log(`📊 [GPTsPage] Loaded ${allGpts.length} GPTs`)
      console.log(`📊 [GPTsPage] GPTs:`, allGpts.map(g => ({ id: g.id, name: g.name, constructCallsign: g.constructCallsign })))
      setGpts(allGpts)
    } catch (error) {
      console.error('Failed to load GPTs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadGPTForEdit = async (id: string) => {
    try {
      const gpt = await gptService.getGPT(id)
      setEditingConfig(gpt)
    } catch (error) {
      console.error('Failed to load GPT for edit:', error)
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
    setEditingConfig(null)
    loadGPTs() // Refresh the list
  }

  const handleGPTCreated = () => {
    loadGPTs() // Refresh the list
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)' }}>
      {/* Header */}
      <div className="border-b p-6" style={{ borderColor: 'var(--chatty-line)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)' }}>Your GPTs</h1>
            <p className="mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Manage and create custom AI assistants</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/app/gpts/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors"
            style={{ backgroundColor: 'transparent', color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
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
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent mx-auto mb-4" style={{ borderColor: 'var(--chatty-line)' }}></div>
            <p style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Loading GPTs...</p>
          </div>
        ) : gpts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Bot size={24} style={{ color: 'var(--chatty-text)' }} />
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>No GPTs yet</h3>
            <p className="mb-6" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Create your first custom AI assistant to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gpts.map((gpt) => (
              <div
                key={gpt.id}
                className="rounded-lg p-4 transition-colors shadow-sm"
                style={{ 
                  backgroundColor: 'transparent',
                  border: '1px solid var(--chatty-line)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffffd7'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                      {gpt.avatar ? (
                        <img src={gpt.avatar} alt={gpt.name} className="w-full h-full object-cover" />
                      ) : (
                        <Bot size={16} style={{ color: 'var(--chatty-text)' }} />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium" style={{ color: 'var(--chatty-text)' }}>{gpt.name}</h3>
                      <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>{gpt.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(gpt.id)}
                      className="p-1 rounded transition-colors"
                      style={{ color: 'var(--chatty-text)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffffd7'
                        e.currentTarget.style.color = '#dc2626'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                        e.currentTarget.style.color = 'var(--chatty-text)'
                      }}
                      title="Delete GPT"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Instructions</p>
                    <p className="text-sm line-clamp-2" style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>
                      {gpt.instructions || 'No instructions provided'}
                    </p>
                  </div>
                  
                  {gpt.conversationStarters && gpt.conversationStarters.length > 0 && (
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Conversation Starters</p>
                      <div className="flex flex-wrap gap-1">
                        {gpt.conversationStarters.slice(0, 2).map((starter: string, index: number) => (
                          <span
                            key={index}
                            className="text-xs px-2 py-1 rounded"
                            style={{ backgroundColor: 'transparent', color: 'var(--chatty-text)' }}
                          >
                            {starter}
                          </span>
                        ))}
                        {gpt.conversationStarters.length > 2 && (
                          <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                            +{gpt.conversationStarters.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Model:</span>
                      <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'transparent', color: 'var(--chatty-text)' }}>
                        {gpt.modelId}
                      </span>
                    </div>
                    <Link
                      to="/"
                      className="text-xs transition-colors"
                      style={{ color: 'var(--chatty-text)', opacity: 0.7 }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
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
        initialConfig={editingConfig}
      />
    </div>
  )
}
