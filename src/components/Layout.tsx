import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { fetchMe, logout, getUserId, type User } from '../lib/auth'
import { conversationManager, type ConversationThread } from '../lib/conversationManager'
import StorageFailureFallback from './StorageFailureFallback'
import { runFullMigration } from '../lib/migration'
import { 
  Plus, 
  Search,
  Library,
  Clock,
  FolderPlus,
  PanelLeftClose,
  MessageSquare,
  Trash2
} from 'lucide-react'
import SearchPopup from './SearchPopup'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  packets?: import('../types').AssistantPacket[]
  ts: number
  files?: { name: string; size: number }[]
  typing?: boolean  // For typing indicators
}
type Thread = { id: string; title: string; messages: Message[] }

export default function Layout() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  
  const [threads, setThreads] = useState<Thread[]>([])
  const [isRecovering, setIsRecovering] = useState(false)
  const [storageFailureInfo, setStorageFailureInfo] = useState<{ reason: string; key?: string; sizeBytes?: number } | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  
  const activeId = useMemo(() => {
    const match = location.pathname.match(/^\/app\/chat\/(.+)$/)
    return match ? match[1] : null
  }, [location.pathname])

  // Professional conversation loading with automatic recovery
  useEffect(() => {
    // Register storage failure callback so we can show a friendly UI
    conversationManager.storageFailureCallback = (info) => {
      setStorageFailureInfo(info)
    }

    if (user && user.sub) {
      setIsRecovering(true)
      console.log('🔄 Loading conversations for user:', user.email, '(', user.sub, ')')
      
      // Run migration first (migration is now handled in App.tsx, but keep this as fallback)
      runFullMigration(user)
      
      conversationManager.loadUserConversations(user)
        .then((recoveredThreads) => {
          console.log('📂 Loaded conversations:', recoveredThreads.length)
          setThreads(recoveredThreads)
          setIsRecovering(false)
          
          if (recoveredThreads.length > 0) {
            console.log('✅ Conversations loaded successfully')
          } else {
            console.log('ℹ️ No conversations found - starting fresh')
          }
        })
        .catch((error) => {
          console.error('❌ Failed to load conversations:', error)
          setThreads([])
          setIsRecovering(false)
        })
    } else {
      setThreads([])
      setIsRecovering(false)
    }
  }, [user])

  // Startup health check for storage quota (non-blocking)
  useEffect(() => {
    const nav: any = navigator
    const check = async () => {
      try {
        if (nav.storage && typeof nav.storage.estimate === 'function') {
          const est = await nav.storage.estimate()
          const remaining = (est.quota || 0) - (est.usage || 0)
          // If remaining is less than 200KB, warn the user
          if (remaining < 200 * 1024) {
            conversationManager.storageFailureCallback?.({ reason: 'low_quota', sizeBytes: remaining })
          }
        }
      } catch (e) {
        // ignore
      }
    }
    check()
  }, [])

  function closeStorageFailure() {
    setStorageFailureInfo(null)
  }

  // Professional conversation saving with fail-safes
  useEffect(() => {
    if (user && user.sub && threads.length > 0) {
      conversationManager.saveUserConversations(user, threads)
        .catch((error) => {
          console.error('❌ Failed to save conversations:', error)
        })
    }
  }, [threads, user])

  // Handle authentication
  useEffect(() => {
    (async () => {
      try {
        const me = await fetchMe()
        if (me) {
          console.log('User data:', me);
          console.log('User picture:', me.picture);
          
          // Check if this is a different user than before
          const currentUserId = getUserId(me);
          const previousUserId = user ? getUserId(user) : null;
          
          if (previousUserId && previousUserId !== currentUserId) {
            console.log('🔄 User switched, clearing previous user data');
            conversationManager.clearUserData(previousUserId);
            setThreads([]);
          }
          
          setUser(me)
        } else {
          navigate('/')
        }
      } catch (error) {
        console.error('Auth error:', error);
        navigate('/')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [navigate])

  async function handleLogout() {
    if (user) {
      const userId = getUserId(user);
      // Clear user data but preserve backups
      conversationManager.clearUserData(userId);
    }
    await logout()
    navigate('/')
  }

  // Migrate legacy messages to packet format
  useEffect(() => {
    setThreads(prev => {
      if (!Array.isArray(prev)) {
        return [];
      }
      let dirty = false;
      const fixed = prev.map(t => ({
        ...t,
        messages: (t.messages || []).map(m => {
          if (m.role === 'assistant' && !Array.isArray((m as any).packets)) {
            dirty = true;
            return {
              id: m.id,
              role: 'assistant' as const,
              ts: (m as any).ts ?? Date.now(),
              packets: [{ op: 'answer.v1', payload: { content: (m as any).text ?? 'Legacy message' } } as import('../types').AssistantPacket],
            } as Message;
          }
          return m;
        })
      }));
      if (dirty && user && user.sub) {
        conversationManager.saveUserConversations(user, fixed);
      }
      return fixed;
    });
  }, [user])

  function newThread() {
    const t: Thread = { id: crypto.randomUUID(), title: 'New conversation', messages: [] }
    setThreads([t, ...threads])
    navigate(`/app/chat/${t.id}`)
  }

  function renameThread(id: string, title: string) {
    setThreads(ts => ts.map(t => (t.id === id ? { ...t, title } : t)))
  }

  async function sendMessage(threadId: string, input: string, files: File[]) {
    const thread = threads.find(t => t.id === threadId)
    if (!thread) return
    
    // 1. Show user message immediately
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: input,
      ts: Date.now(),
      files: files.map(f => ({ name: f.name, size: f.size })),
    }
    
    // 2. Add typing indicator message
    const typingMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      typing: true,
      ts: Date.now() + 1,
    }
    
    // 3. Update UI immediately with user message and typing indicator
    setThreads(ts =>
      ts.map(t =>
        t.id === threadId ? { ...t, messages: [...t.messages, userMsg, typingMsg] } : t
      )
    )
    
    // 4. Generate AI response with callbacks
    const { AIService } = await import('../lib/aiService')
    const aiService = AIService.getInstance()
    
    try {
      const raw = await aiService.processMessage(input, files, {
        onPartialUpdate: (partialContent: string) => {
          // Update typing message with partial content
          setThreads(ts =>
            ts.map(t =>
              t.id === threadId 
                ? { 
                    ...t, 
                    messages: t.messages.map(m => 
                      m.id === typingMsg.id 
                        ? { ...m, text: partialContent, typing: true }
                        : m
                    )
                  } 
                : t
            )
          )
        },
        onFinalUpdate: (finalPackets: import('../types').AssistantPacket[]) => {
          // Replace typing message with final response
          const aiMsg: Message = {
            id: typingMsg.id, // Use same ID to replace
            role: 'assistant',
            packets: finalPackets,
            ts: Date.now() + 2,
          }
          
          setThreads(ts =>
            ts.map(t =>
              t.id === threadId 
                ? { 
                    ...t, 
                    messages: t.messages.map(m => 
                      m.id === typingMsg.id ? aiMsg : m
                    )
                  } 
                : t
            )
          )
        }
      })
      
      // Fallback: if callbacks weren't used, handle the response normally
      if (raw && !Array.isArray(raw)) {
        const packets: import('../types').AssistantPacket[] = [{ op: 'answer.v1', payload: { content: String(raw ?? '') } }]
        const aiMsg: Message = {
          id: typingMsg.id,
          role: 'assistant',
          packets: packets,
          ts: Date.now() + 2,
        }
        
        setThreads(ts =>
          ts.map(t =>
            t.id === threadId 
              ? { 
                  ...t, 
                  messages: t.messages.map(m => 
                    m.id === typingMsg.id ? aiMsg : m
                  )
                } 
              : t
          )
        )
      }
      
    } catch (error) {
      // Handle error by replacing typing message with error
      const errorMsg: Message = {
        id: typingMsg.id,
        role: 'assistant',
        packets: [{ op: 'error.v1', payload: { message: 'Sorry, I encountered an error. Please try again.' } }],
        ts: Date.now() + 2,
      }
      
      setThreads(ts =>
        ts.map(t =>
          t.id === threadId 
            ? { 
                ...t, 
                messages: t.messages.map(m => 
                  m.id === typingMsg.id ? errorMsg : m
                )
              } 
            : t
        )
      )
    }
    
    // Update thread title if needed
    if (thread.title === 'New conversation' && input.trim()) {
      renameThread(threadId, input.trim().slice(0, 40))
    }
  }

  function handleThreadClick(threadId: string) {
    navigate(`/app/chat/${threadId}`)
  }


  function handleGPTsClick() {
    navigate('/app/gpts')
  }

  function handleCreateGPTClick() {
    navigate('/app/gpts/new')
  }

  function handleSearchClick() {
    setIsSearchOpen(true)
  }

  function handleLibraryClick() {
    navigate('/app/library')
  }

  function handleCodexClick() {
    navigate('/app/codex')
  }

  function handleExploreClick() {
    navigate('/app/explore')
  }

  function handleSearchResultClick(threadId: string, messageId: string) {
    navigate(`/app/chat/${threadId}`)
    // TODO: Scroll to specific message
  }

  if (isLoading) {
    return (
      <div className="flex h-screen" style={{ backgroundColor: '#ffffeb' }}>
        <div style={loadingStyles}>Loading…</div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect to login
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: '#ffffeb' }}>
      {/* Sidebar */}
      <aside className="w-64 border-r flex flex-col bg-[#ffffd7] border-[#E1C28B]" style={{ backgroundColor: '#ffffd7 !important' }}>
        {/* Top Section - Logo and Panel Toggle */}
        <div className="flex items-center justify-between p-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden">
              <img src="/assets/chatty_star.png" alt="ChattyStar" className="h-full w-full object-cover" />
            </div>
          </div>
          
          {/* Panel Toggle Button */}
          <button className="p-1 rounded transition-colors" style={{ color: '#4c3d1e' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* Navigation Options - Flat List Style */}
        <div className="px-4 pb-4">
          <div className="space-y-1">
            <button 
              onClick={newThread}
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ color: '#4c3d1e' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Plus size={16} />
              New chat
            </button>
            
            <button 
              onClick={handleSearchClick}
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ color: '#4c3d1e' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Search size={16} />
              Search chats
            </button>
            
            <button 
              onClick={handleLibraryClick}
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ color: '#4c3d1e' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Library size={16} />
              Library
            </button>
            
            <button 
              onClick={handleCodexClick}
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ color: '#4c3d1e' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Clock size={16} />
              Codex
            </button>
            
            <button 
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ color: '#4c3d1e' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <FolderPlus size={16} />
              Projects
            </button>
          </div>
        </div>

        {/* GPTs Section */}
        <div className="px-4 pb-4">
          <h3 className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: '#4c3d1e', opacity: 0.6 }}>GPTs</h3>
          <div className="space-y-1">
            <button 
              onClick={handleExploreClick}
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ color: '#4c3d1e' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: '#E1C28B' }}>
                <span className="text-xs" style={{ color: '#4c3d1e' }}>□</span>
              </div>
              Explore
            </button>
            
            <button 
              onClick={handleCreateGPTClick}
              className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-md transition-colors"
              style={{ color: '#4c3d1e' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#4c3d1e' }}>
                <span className="text-white text-xs font-bold">+</span>
              </div>
              Create GPT
            </button>
          </div>
        </div>

        {/* Chats Section */}
        <div className="flex-1 px-4 pb-4 overflow-y-auto">
          <h3 className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: '#4c3d1e', opacity: 0.6 }}>Chats</h3>
          <div className="space-y-1">
            {/* Existing Conversations - No borders, just hover highlights */}
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => handleThreadClick(thread.id)}
                className="flex items-center justify-between w-full px-3 py-2 text-left text-sm rounded-md transition-colors group"
                style={{ 
                  color: '#4c3d1e',
                  backgroundColor: thread.id === activeId ? '#feffaf' : 'transparent'
                }}
                onMouseEnter={(e) => {
                  if (thread.id !== activeId) {
                    e.currentTarget.style.backgroundColor = '#feffaf'
                  }
                }}
                onMouseLeave={(e) => {
                  if (thread.id !== activeId) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
                title={thread.title}
              >
                <span className="truncate flex-1">
                  {thread.title}
                </span>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all ml-2"
                  style={{ color: '#4c3d1e' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Add delete functionality here if needed
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))}
            
            {/* Recovery state */}
            {isRecovering && (
              <div className="text-center text-sm py-8" style={{ color: '#4c3d1e', opacity: 0.6 }}>
                <div className="animate-spin w-4 h-4 border-2 border-app-button-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                <p>Recovering conversations...</p>
              </div>
            )}
            
            {/* Empty state */}
            {!isRecovering && threads.length === 0 && (
              <div className="text-center text-sm py-8" style={{ color: '#4c3d1e', opacity: 0.6 }}>
                <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
                <p>No conversations yet</p>
              </div>
            )}
          </div>
        </div>

        {/* User Profile Section - Anchored at Bottom */}
        <div className="p-4 border-t" style={{ borderColor: '#E1C28B' }}>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full p-2 rounded-md transition-colors"
            style={{ color: '#4c3d1e' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {user.picture ? (
              <img 
                src={user.picture} 
                alt={user.name || 'User'}
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E1C28B' }}>
                <span className="text-sm font-medium" style={{ color: '#4c3d1e' }}>
                  {user.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                </span>
              </div>
            )}
            <div className="flex flex-col text-left">
              <span className="text-sm font-medium truncate" style={{ color: '#4c3d1e' }}>
                {user.name || user.email || 'User'}
              </span>
              <span className="text-xs" style={{ color: '#4c3d1e', opacity: 0.6 }}>
                Plus
              </span>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet context={{ threads, sendMessage, renameThread, newThread }} />
      </main>
      <StorageFailureFallback info={storageFailureInfo} onClose={closeStorageFailure} />

      {/* Search Popup */}
      <SearchPopup
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        threads={threads}
        onResultClick={handleSearchResultClick}
      />
    </div>
  )
}// Loading styles for the loading state
const loadingStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  fontSize: '1.2rem',
  opacity: 0.7
}


