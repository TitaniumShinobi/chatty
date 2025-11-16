import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Bot, Edit2, MoreVertical, Lock, Globe, MessageCircle } from 'lucide-react'
import GPTCreator from '../components/GPTCreator'
import SimForge from '../components/SimForge'
import { GPTService, GPTConfig } from '../lib/gptService'

interface GPTsPageProps {
  initialOpen?: boolean
}

export default function GPTsPage({ initialOpen = false }: GPTsPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const gptService = GPTService.getInstance()
  const [isCreatorOpen, setCreatorOpen] = useState(initialOpen)
  const [isSimForgeOpen, setSimForgeOpen] = useState(false)
  const [gpts, setGpts] = useState<GPTConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingGptId, setEditingGptId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Route controls modal state
  useEffect(() => {
    const isNew = location.pathname.endsWith('/new')
    const editMatch = location.pathname.match(/\/edit\/([^/]+)$/)
    if (isNew) {
      setCreatorOpen(true)
      setEditingGptId(null)
    } else if (editMatch) {
      setCreatorOpen(true)
      setEditingGptId(editMatch[1])
    } else {
      setCreatorOpen(false)
      setEditingGptId(null)
    }
  }, [location.pathname])

  // Load GPTs when component mounts
  useEffect(() => {
    loadGPTs()
  }, [])

  useEffect(() => {
    const handleDocumentClick = () => setOpenMenuId(null)
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  const loadGPTs = async () => {
    try {
      setIsLoading(true)
      // Use helper method to get only user-created GPTs (excludes imported runtimes)
      const userCreatedGPTs = await gptService.getUserCreatedGPTs()
      setGpts(userCreatedGPTs)
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
    setEditingGptId(null)
    navigate('/app/gpts')
    loadGPTs() // Refresh the list
  }

  const handleEdit = (id: string) => {
    navigate(`/app/gpts/edit/${id}`)
  }

  const toggleMenu = (event: React.MouseEvent, id: string) => {
    event.stopPropagation()
    setOpenMenuId((current) => (current === id ? null : id))
  }

  const handleGPTCreated = () => {
    loadGPTs() // Refresh the list
  }

  return (
    <div className="min-h-screen bg-[var(--chatty-bg-main)] text-[var(--chatty-text)]">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-4xl font-semibold tracking-tight">My GPTs</h1>

        <div className="mt-8 space-y-4">
          <button
            type="button"
            onClick={() => navigate('/app/gpts/new')}
            className="group flex w-full items-center gap-4 rounded-2xl border border-[var(--chatty-line)] bg-[var(--chatty-bg-secondary)] px-5 py-4 text-left transition-colors hover:bg-[var(--chatty-highlight)]"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--chatty-highlight)] text-[var(--chatty-text)]">
              <Plus size={24} />
            </div>
            <div>
              <p className="text-lg font-semibold">Create a GPT</p>
              <p className="text-sm text-[var(--chatty-text)] opacity-70">
                Customize a version of ChatGPT for a specific purpose
              </p>
            </div>
          </button>

          {isLoading ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[var(--chatty-line)] border-t-transparent"></div>
              <p className="text-sm text-[var(--chatty-text)] opacity-70">Loading GPTs...</p>
            </div>
          ) : gpts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--chatty-line)] bg-[var(--chatty-bg-secondary)] px-5 py-10 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--chatty-highlight)]">
                <Bot size={20} className="text-[var(--chatty-icon)]" />
              </div>
              <p className="text-lg font-medium">No GPTs yet</p>
              <p className="mt-2 text-sm text-[var(--chatty-text)] opacity-70">Start by creating your first GPT.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {gpts.map((gpt) => {
                const isPublic = gpt.isPublic ?? false
                const usageCount = gpt.usageCount ?? 0
                return (
                  <div
                    key={gpt.id}
                    className="group relative flex items-center gap-4 rounded-2xl border border-[var(--chatty-line)] bg-[var(--chatty-bg-secondary)] px-5 py-4 transition-colors hover:bg-[var(--chatty-highlight)]"
                  >
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[var(--chatty-highlight)]">
                      {gpt.avatar ? (
                        <img src={gpt.avatar} alt={gpt.name} className="h-full w-full object-cover" />
                      ) : (
                        <Bot size={20} className="text-[var(--chatty-icon)] opacity-80" />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-[var(--chatty-text)]">{gpt.name}</p>
                          <p className="mt-1 line-clamp-1 text-sm text-[var(--chatty-text)] opacity-70">
                            {gpt.description || 'No description provided'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleEdit(gpt.id)
                            }}
                            className="rounded-full p-2 text-[var(--chatty-text)] transition-colors hover:bg-[var(--chatty-highlight)]"
                            title="Edit GPT"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => toggleMenu(event, gpt.id)}
                            className="rounded-full p-2 text-[var(--chatty-text)] transition-colors hover:bg-[var(--chatty-highlight)]"
                            title="More options"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--chatty-text)] opacity-80">
                        <span className="flex items-center gap-2">
                          {isPublic ? <Globe size={14} /> : <Lock size={14} />}
                          {isPublic ? 'Everyone' : 'Only me'}
                        </span>
                        {usageCount > 0 && (
                          <span className="flex items-center gap-2">
                            <MessageCircle size={14} />
                            {usageCount} {usageCount === 1 ? 'Chat' : 'Chats'}
                          </span>
                        )}
                      </div>
                    </div>

                    {openMenuId === gpt.id && (
                      <div
                        className="absolute right-5 top-16 z-20 w-40 rounded-2xl border border-[var(--chatty-line)] bg-[var(--chatty-bg-secondary)] p-1 shadow-2xl backdrop-blur"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--chatty-text)] transition-colors hover:bg-[var(--chatty-highlight)]"
                          onClick={() => {
                            setOpenMenuId(null)
                            handleEdit(gpt.id)
                          }}
                        >
                          <Edit2 size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--chatty-text)] transition-colors hover:bg-[var(--chatty-highlight)]"
                          onClick={() => {
                            setOpenMenuId(null)
                            if (confirm(`Are you sure you want to delete "${gpt.name}"?`)) {
                              handleDelete(gpt.id)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* GPT Creator Modal */}
      <GPTCreator
        isVisible={isCreatorOpen}
        onClose={handleClose}
        onGPTCreated={handleGPTCreated}
        gptId={editingGptId || undefined}
      />

      {/* SimForge Modal */}
      <SimForge
        isVisible={isSimForgeOpen}
        onClose={() => setSimForgeOpen(false)}
        onConstructRegistered={() => {
          setSimForgeOpen(false)
          loadGPTs() // Refresh the list
        }}
      />
    </div>
  )
}
