import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Bot, Trash2, Lock, Copy, Link2, Store } from 'lucide-react'
import AICreator from '../components/GPTCreator'
import { AIService, AIConfig } from '../lib/aiService'

interface AIsPageProps {
  initialOpen?: boolean
}

export default function AIsPage({ initialOpen = false }: AIsPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const aiService = AIService.getInstance()
  const [isCreatorOpen, setCreatorOpen] = useState(initialOpen)
  const [ais, setAIs] = useState<AIConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null)

  // Route controls modal state
  useEffect(() => {
    const editMatch = location.pathname.match(/\/app\/ais\/edit\/([^/]+)/)
    if (location.pathname.endsWith('/new')) {
      setCreatorOpen(true)
      setEditingConfig(null)
    } else if (editMatch) {
      setCreatorOpen(true)
      loadAIForEdit(editMatch[1])
    } else {
      setCreatorOpen(false)
      setEditingConfig(null)
    }
  }, [location.pathname])

  // Load AIs when component mounts
  useEffect(() => {
    loadAIs()
  }, [])

  const loadAIs = async () => {
    try {
      setIsLoading(true)
      const allAIs = await aiService.getAllAIs()
      console.log(`📊 [AIsPage] Loaded ${allAIs.length} AIs`)
      console.log(`📊 [AIsPage] AIs:`, allAIs.map(a => ({ id: a.id, name: a.name, constructCallsign: a.constructCallsign })))
      setAIs(allAIs)
    } catch (error) {
      console.error('Failed to load AIs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadAIForEdit = async (id: string) => {
    try {
      const ai = await aiService.getAI(id)
      setEditingConfig(ai)
    } catch (error) {
      console.error('Failed to load AI for edit:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await aiService.deleteAI(id)
      await loadAIs() // Refresh the list
    } catch (error) {
      console.error('Failed to delete AI:', error)
    }
  }

  const handleClone = async (id: string) => {
    try {
      const clonedAI = await aiService.cloneAI(id)
      console.log(`✅ [AIsPage] Cloned AI ${id} → ${clonedAI.id} (${clonedAI.constructCallsign})`)
      // Open cloned AI in editor
      setEditingConfig(clonedAI)
      setCreatorOpen(true)
      navigate(`/app/ais/edit/${clonedAI.id}`)
      // Refresh the list to show the new clone
      await loadAIs()
    } catch (error) {
      console.error('Failed to clone AI:', error)
    }
  }

  const handleEdit = (id: string) => {
    navigate(`/app/ais/edit/${id}`)
  }

  const handleClose = () => {
    setCreatorOpen(false)
    navigate('/app/ais')
    setEditingConfig(null)
    loadAIs() // Refresh the list
  }

  const handleAICreated = () => {
    loadAIs() // Refresh the list
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-8">
        <div className="flex items-center justify-between gap-4 max-w-6xl mx-auto">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)' }}>My AIs</h1>
          <button
            onClick={() => navigate('/app/ais/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'transparent', color: 'var(--chatty-text)', border: 'none', marginTop: '10px' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <Plus size={16} style={{ color: 'var(--chatty-text)' }} />
            Create AI
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 pt-0 max-w-5xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent mx-auto mb-4" style={{ borderColor: 'var(--chatty-line)' }}></div>
            <p style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Loading AIs...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* AI Cards */}
            {ais.map((ai) => {
              // DEBUG: Log avatar information for each AI card
              const avatarValue = ai.avatar;
              const avatarType = avatarValue === null ? 'null' : avatarValue === undefined ? 'undefined' : typeof avatarValue;
              const avatarLength = typeof avatarValue === 'string' ? avatarValue.length : 'N/A';
              const avatarIsEmpty = !avatarValue || (typeof avatarValue === 'string' && avatarValue.trim() === '');
              const avatarPreview = typeof avatarValue === 'string' && avatarValue.length > 0 
                ? avatarValue.substring(0, 50) + (avatarValue.length > 50 ? '...' : '')
                : avatarValue;
              
              console.log(`🖼️ [AIsPage] Avatar debug for ${ai.id} (${ai.name}):`, {
                type: avatarType,
                length: avatarLength,
                isEmpty: avatarIsEmpty,
                preview: avatarPreview,
                hasValue: !!avatarValue,
                fullValue: avatarValue
              });

              return (
              <div
                key={ai.id}
                className="group rounded-lg px-4 py-3 cursor-pointer transition-colors flex items-center gap-4"
                style={{ backgroundColor: 'transparent', border: 'none' }}
                onClick={() => handleEdit(ai.id)}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                  e.currentTarget.style.color = 'var(--chatty-bg-main)'
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--chatty-text)'
                }}
              >
                {/* Avatar on LEFT */}
                <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden">
                  {ai.avatar ? (
                    <img src={ai.avatar} alt={ai.name} className="w-full h-full object-cover" />
                      ) : (
                    <Bot size={20} style={{ color: 'var(--chatty-text)' }} />
                      )}
                    </div>
                {/* Content on RIGHT */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate" style={{ color: 'var(--chatty-text)' }}>{ai.name}</h3>
                  <p className="text-sm truncate" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>{ai.description}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {ai.privacy === 'store' ? (
                      <>
                        <Store size={12} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
                        <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>GPT Store</span>
                      </>
                    ) : ai.privacy === 'link' ? (
                      <>
                        <Link2 size={12} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
                        <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Anyone with link</span>
                      </>
                    ) : (
                      <>
                        <Lock size={12} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
                        <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Only me</span>
                      </>
                    )}
                  </div>
                </div>
                {/* Action buttons - only visible on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Clone button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleClone(ai.id); }}
                    className="p-1 transition-colors"
                    style={{ color: 'var(--chatty-text)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--chatty-highlight)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--chatty-text)' }}
                    title="Clone AI"
                          >
                    <Copy size={14} />
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(ai.id); }}
                    className="p-1 transition-colors"
                    style={{ color: 'var(--chatty-text)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--chatty-text)' }}
                    title="Delete AI"
                    >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Creator Modal */}
      <AICreator
        isVisible={isCreatorOpen}
        onClose={handleClose}
        onAICreated={handleAICreated}
        initialConfig={editingConfig}
      />
    </div>
  )
}
