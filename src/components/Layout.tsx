import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { fetchMe, logout, type User } from '../lib/auth'

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
  
  const [threads, setThreads] = useState<Thread[]>(() => {
    try { return JSON.parse(localStorage.getItem('chatty:threads') || '[]') } catch { return [] }
  })
  
  const activeId = useMemo(() => {
    const match = location.pathname.match(/^\/app\/chat\/(.+)$/)
    return match ? match[1] : null
  }, [location.pathname])

  useEffect(() => {
    localStorage.setItem('chatty:threads', JSON.stringify(threads))
  }, [threads])

  // Handle authentication
  useEffect(() => {
    (async () => {
      try {
        const me = await fetchMe()
        if (me) {
          setUser(me)
        } else {
          navigate('/')
        }
      } catch (error) {
        navigate('/')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [navigate])

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  // Migrate legacy messages to packet format
  useEffect(() => {
    setThreads(prev => {
      let dirty = false;
      const fixed = prev.map(t => ({
        ...t,
        messages: t.messages.map(m => {
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
      if (dirty) {
        localStorage.setItem('chatty:threads', JSON.stringify(fixed));
      }
      return fixed;
    });
  }, [])

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

  function handleHomeClick() {
    navigate('/app')
  }

  function handleGPTsClick() {
    navigate('/app/gpts')
  }

  function handleCreateGPTClick() {
    navigate('/app/gpts/new')
  }

  if (isLoading) {
    return (
      <div style={s.app}>
        <div style={s.loading}>Loading…</div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect to login
  }

  return (
    <div style={s.app}>
      <aside style={s.sidebar}>
        <div style={s.brand}>Chatty</div>
        
        {/* Navigation */}
        <nav style={s.nav}>
          <button 
            style={{ ...s.navItem, ...(location.pathname === '/app' ? s.navItemActive : {}) }}
            onClick={handleHomeClick}
          >
            Chatty
          </button>
          <button 
            style={{ ...s.navItem, ...(location.pathname.startsWith('/app/gpts') ? s.navItemActive : {}) }}
            onClick={handleGPTsClick}
          >
            GPTs
          </button>
          <button 
            style={{ ...s.navItem, ...(location.pathname === '/app/gpts/new' ? s.navItemActive : {}) }}
            onClick={handleCreateGPTClick}
          >
            Create GPT
          </button>
        </nav>

        <button style={s.newBtn} onClick={newThread}>+ New chat</button>

        <div style={s.sectionLabel}>Chats</div>
        <div style={s.threadList}>
          {threads.length === 0 && <div style={s.emptySide}>No conversations yet</div>}
          {threads.map(t => (
            <button
              key={t.id}
              onClick={() => handleThreadClick(t.id)}
              style={{ ...s.threadItem, ...(t.id === activeId ? s.threadItemActive : {}) }}
              title={t.title}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </div>
            </button>
          ))}
        </div>

        <div style={s.footer}>
          <div style={s.userBox}>
            <div style={s.avatar}>{user.name?.[0] ?? '?'}</div>
            <div>
              <div style={{ fontSize: 13 }}>{user.name}</div>
              <div style={{ opacity: .6, fontSize: 11 }}>{user.email}</div>
            </div>
          </div>
          <button style={s.logout} onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <main style={s.main}>
        <Outlet context={{ threads, sendMessage, renameThread, newThread }} />
      </main>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  app: { 
    display: 'flex', 
    height: '100vh', 
    background: '#202123', 
    color: '#fff', 
    overflow: 'hidden' 
  },
  sidebar: { 
    width: 260, 
    background: '#17181A', 
    borderRight: '1px solid #2a2b32', 
    display: 'flex', 
    flexDirection: 'column' 
  },
  brand: { 
    padding: '14px 14px 10px', 
    fontWeight: 700 
  },
  nav: {
    padding: '0 14px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  navItem: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '14px',
    transition: 'background-color 0.2s'
  },
  navItemActive: {
    background: '#2a2b32'
  },
  newBtn: { 
    margin: '0 12px 8px', 
    padding: '10px', 
    borderRadius: 8, 
    border: '1px solid #3a3b42', 
    background: '#2a2b32', 
    color: '#fff', 
    cursor: 'pointer' 
  },
  sectionLabel: { 
    padding: '6px 14px', 
    opacity: .6, 
    fontSize: 12 
  },
  threadList: { 
    flex: 1, 
    overflow: 'auto', 
    padding: 6 
  },
  threadItem: { 
    width: '100%', 
    textAlign: 'left', 
    padding: '10px 12px', 
    borderRadius: 8, 
    border: '1px solid transparent', 
    background: 'transparent', 
    color: '#fff', 
    cursor: 'pointer' 
  },
  threadItemActive: { 
    background: '#2a2b32', 
    borderColor: '#3a3b42' 
  },
  emptySide: { 
    opacity: .6, 
    padding: '10px 12px' 
  },
  footer: { 
    borderTop: '1px solid #2a2b32', 
    padding: 12, 
    display: 'flex', 
    flexDirection: 'column', 
    gap: 8 
  },
  userBox: { 
    display: 'flex', 
    gap: 10, 
    alignItems: 'center' 
  },
  avatar: { 
    width: 28, 
    height: 28, 
    borderRadius: 6, 
    background: '#2a2b32', 
    display: 'grid', 
    placeItems: 'center', 
    fontWeight: 700 
  },
  logout: { 
    padding: '8px', 
    borderRadius: 8, 
    border: '1px solid #3a3b42', 
    background: '#2a2b32', 
    color: '#fff', 
    cursor: 'pointer' 
  },
  main: { 
    flex: 1, 
    display: 'flex', 
    flexDirection: 'column', 
    overflow: 'hidden' 
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontSize: '1.2rem',
    opacity: 0.7
  }
}
