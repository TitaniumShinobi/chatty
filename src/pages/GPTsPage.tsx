import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Bot, Trash2, Lock } from 'lucide-react'
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

  const handleEdit = (id: string) => {
    navigate(`/app/gpts/edit/${id}`)
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
      <div className="px-6 pt-6 pb-8">
        <div className="flex items-center justify-between gap-4 max-w-6xl mx-auto">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)' }}>My GPTs</h1>
          <button
            onClick={() => navigate('/app/gpts/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'transparent', color: 'var(--chatty-text)', border: 'none', marginTop: '10px' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <Plus size={16} style={{ color: 'var(--chatty-text)' }} />
            Create GPT
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 pt-0 max-w-5xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent mx-auto mb-4" style={{ borderColor: 'var(--chatty-line)' }}></div>
            <p style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Loading GPTs...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* GPT Cards */}
            {gpts.map((gpt) => (
              <div
                key={gpt.id}
                className="group rounded-lg px-4 py-3 cursor-pointer transition-colors flex items-center gap-4"
                style={{ backgroundColor: 'transparent', border: 'none' }}
                onClick={() => handleEdit(gpt.id)}
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
                  {gpt.avatar ? (
                    <img src={gpt.avatar} alt={gpt.name} className="w-full h-full object-cover" />
                  ) : (
                    <Bot size={20} style={{ color: 'var(--chatty-text)' }} />
                  )}
                </div>
                {/* Content on RIGHT */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate" style={{ color: 'var(--chatty-text)' }}>{gpt.name}</h3>
                  <p className="text-sm truncate" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>{gpt.description}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Lock size={12} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
                    <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Only me</span>
                  </div>
                </div>
                {/* Delete button - only visible on hover */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(gpt.id); }}
                  className="p-1 transition-colors opacity-0 group-hover:opacity-100"
                  style={{ color: 'var(--chatty-text)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--chatty-text)' }}
                  title="Delete GPT"
                >
                  <Trash2 size={14} />
                </button>
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
