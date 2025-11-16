 // src/ChattyApp.tsx
import { useEffect, useMemo, useState } from 'react'
import type { User } from './lib/auth'
import { getUserId } from './lib/auth'
import { R } from './runtime/render'
import { useSettings } from './hooks/useSettings'
import { stripSpeakerPrefix } from './lib/utils'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  packets?: import('./types').AssistantPacket[]
  ts: number
  files?: { name: string; size: number }[]
}
type Thread = { id: string; title: string; messages: Message[] }

export default function ChattyApp({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => void
}) {
  const { settings } = useSettings()
  const [threads, setThreads] = useState<Thread[]>(() => {
    // Don't load threads until we have a user
    return []
  })
  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null)
  const active = useMemo(
    () => threads.find(t => t.id === activeId) ?? null,
    [threads, activeId]
  )

  // Get user-specific storage key
  const getStorageKey = (user: User) => `chatty:threads:${getUserId(user)}`
  
  // Load threads when user changes
  useEffect(() => {
    if (user) {
      try {
        // First, try to load user-specific threads
        let userThreads = JSON.parse(localStorage.getItem(getStorageKey(user)) || '[]')
        
        // If no user-specific threads exist, check for old generic threads and migrate them
        if (userThreads.length === 0) {
          const oldThreads = localStorage.getItem('chatty:threads')
          if (oldThreads) {
            console.log('🔄 Found old conversations, migrating to user-specific storage...')
            try {
              userThreads = JSON.parse(oldThreads)
              // Save to user-specific storage
              // Only cache a small recent subset to avoid quota pressure
              const limited = Array.isArray(userThreads) ? userThreads.slice(0, 10) : []
              localStorage.setItem(getStorageKey(user), JSON.stringify(limited))
              console.log('✅ Successfully migrated (cached subset)', limited.length, 'conversations to user-specific storage')
            } catch (migrationError) {
              console.error('Failed to migrate old conversations:', migrationError)
            }
          }
        }
        
        setThreads(userThreads)
      } catch (error) {
        console.error('Failed to load user threads:', error)
        setThreads([])
      }
    } else {
      setThreads([])
    }
  }, [user])

  // Save threads when they change (only if user is logged in)
  useEffect(() => {
    if (user && threads.length > 0) {
      // Cache only the most recent 10 conversations locally to avoid
      // filling user localStorage quota.
      try {
        const limited = threads.slice(0, 10)
        localStorage.setItem(getStorageKey(user), JSON.stringify(limited))
      } catch (e) {
        console.warn('Failed to write local cache for threads:', e)
      }
    }
  }, [threads, user])

  // Migrate legacy messages to packet format
  useEffect(() => {
    setThreads(prev => {
      let dirty = false;
      const fixed = prev.map(t => ({
        ...t,
        messages: t.messages.map(m => {
          if (m.role === 'assistant' && !Array.isArray((m as any).packets)) {
            dirty = true;
            const migratedMessage: Message = {
              id: m.id,
              role: 'assistant',
              ts: (m as any).ts ?? Date.now(),
              packets: [{ op: 'answer.v1' as const, payload: { content: (m as any).text ?? 'Legacy message' } }],
            };
            return migratedMessage;
          }
          return m;
        })
      }));
      if (dirty && user) {
        localStorage.setItem(getStorageKey(user), JSON.stringify(fixed));
      }
      return fixed;
    });
  }, [user])

  function newThread() {
    const t: Thread = { id: crypto.randomUUID(), title: 'New conversation', messages: [] }
    setThreads([t, ...threads]); setActiveId(t.id)
  }
  function renameThread(id: string, title: string) {
    setThreads(ts => ts.map(t => (t.id === id ? { ...t, title } : t)))
  }

  async function sendMessage(input: string, files: File[]) {
    if (!active) return
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: input,
      ts: Date.now(),
      files: files.map(f => ({ name: f.name, size: f.size })),
    }
    
    // Get AI response as packets
    const { AIService } = await import('./lib/aiService')
    const aiService = AIService.getInstance()
    
    // Enable synth mode based on settings
    aiService.setSynthMode(settings.enableSynthMode)
    
    // Pass construct and thread IDs for memory provenance
    const constructId = 'default-construct' // TODO: Get from context/state
    const threadId = null // TODO: Get from active thread
    
    const raw = await aiService.processMessage(input, files, undefined, undefined, constructId, threadId)
    const packets = Array.isArray(raw) ? raw : [{ op: 'answer.v1' as const, payload: { content: String(raw ?? '') } }]
    
    const aiMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      packets: packets as import('./types').AssistantPacket[],
      ts: Date.now() + 1,
    }
    
    // Dev logging for AI packets
    if (process.env.NODE_ENV === 'development') {
      console.debug('AI packets', packets);
    }
    
    setThreads(ts =>
      ts.map(t =>
        t.id === active.id ? { ...t, messages: [...t.messages, userMsg, aiMsg] } : t
      )
    )
    if (active.title === 'New conversation' && input.trim()) {
      renameThread(active.id, input.trim().slice(0, 40))
    }
  }

  return (
    <div style={s.app}>
      <aside style={s.sidebar}>
        <div style={s.brand}>Chatty</div>
        <button style={s.newBtn} onClick={newThread}>+ New chat</button>

        <div style={s.sectionLabel}>Chats</div>
        <div style={s.threadList}>
          {threads.length === 0 && <div style={s.emptySide}>No conversations yet</div>}
          {threads.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
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
          <button style={s.logout} onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <main style={s.main}>
        {!active ? <Welcome onNew={newThread} /> : <ChatView thread={active} onSend={sendMessage} />}
      </main>
    </div>
  )
}

function Welcome({ onNew }: { onNew: () => void }) {
  return (
    <div style={s.welcome}>
      <h1 style={{ margin: 0, fontSize: 26 }}>Welcome to Chatty</h1>
      <p style={{ opacity: .7, marginTop: 8 }}>Your AI assistant is ready. Ask anything!</p>
      <div style={s.cards}>
        {[
          'Tell me about artificial intelligence',
          'Write a JavaScript function for me',
          'Create a short story about technology',
          'Explain how machine learning works',
        ].map((t, i) => (
          <button key={i} style={s.card} onClick={onNew}>{t}</button>
        ))}
      </div>
    </div>
  )
}

function ChatView({
  thread,
  onSend,
}: {
  thread: Thread
  onSend: (text: string, files: File[]) => void
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const f = Array.from(e.target.files ?? [])
    setFiles(prev => [...prev, ...f])
    e.currentTarget.value = ''
  }

  return (
    <div style={s.chatWrap}>
      <div style={s.history}>
        <div style={s.attachRow}>
          {files.length > 0 && <div style={s.attachPill}>Attached files ({files.length})</div>}
        </div>

        {thread.messages.map(m => (
          <div key={m.id} style={{ ...s.msg, ...(m.role === 'assistant' ? s.msgAI : s.msgUser) }}>
            <div style={s.msgRole}>{m.role === 'assistant' ? 'AI' : 'U'}</div>
            <div>
            {m.role === 'assistant' ? (
              <div style={{ whiteSpace: 'normal' }}>
                <R
                  packets={
                    Array.isArray((m as any).packets)
                      ? (m as any).packets
                      : [
                          // fallback for legacy/invalid assistant messages
                          { op: 'answer.v1', payload: { content: (m as any).text ?? 'Legacy message' } }
                        ]
                  }
                />
              </div>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap' }}>{typeof m.text === 'string' ? stripSpeakerPrefix(m.text) : m.text}</div>
            )}
              {!!m.files?.length && (
                <div style={s.fileList}>
                  {m.files.map((f, i) => (
                    <div key={i} style={s.fileItem}>
                      {f.name} <span style={{ opacity: .6 }}>({Math.round(f.size / 1024)} KB)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={s.composer}>
        <input type="file" multiple onChange={handleFiles} style={{ display: 'none' }} id="filepick" />
        <label htmlFor="filepick" style={s.iconBtn} title="Attach files">📎</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend(text.trim(), files)
              setText('')
              setFiles([])
            }
          }}
          placeholder="Ask anything"
          style={s.input}
          rows={1}
        />
        <button
          style={s.send}
          disabled={!text.trim() && files.length === 0}
          onClick={() => { onSend(text.trim(), files); setText(''); setFiles([]) }}
        >
          ➤
        </button>
      </div>

      <div style={s.footerNote}>
        Chatty can make mistakes. Consider checking important information.
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  app: { display: 'flex', height: '100vh', background: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', overflow: 'hidden' },
  sidebar: { width: 260, background: 'var(--chatty-button)', borderRight: '1px solid var(--chatty-line)', display: 'flex', flexDirection: 'column' },
  brand: { padding: '14px 14px 10px', fontWeight: 700 },
  newBtn: { margin: '0 12px 8px', padding: '10px', borderRadius: 8, border: '1px solid var(--chatty-line)', background: 'var(--chatty-button)', color: 'var(--chatty-text)', cursor: 'pointer' },
  sectionLabel: { padding: '6px 14px', opacity: .6, fontSize: 12 },
  threadList: { flex: 1, overflow: 'auto', padding: 6 },
  threadItem: { width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'var(--chatty-text)', cursor: 'pointer' },
  threadItemActive: { background: 'var(--chatty-highlight)', borderColor: 'var(--chatty-line)' },
  emptySide: { opacity: .6, padding: '10px 12px' },
  footer: { borderTop: '1px solid var(--chatty-line)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  userBox: { display: 'flex', gap: 10, alignItems: 'center' },
  avatar: { width: 28, height: 28, borderRadius: 6, background: 'var(--chatty-button)', display: 'grid', placeItems: 'center', fontWeight: 700 },
  logout: { padding: '8px', borderRadius: 8, border: '1px solid var(--chatty-line)', background: 'var(--chatty-button)', color: 'var(--chatty-text)', cursor: 'pointer' },

  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  welcome: { margin: 'auto', textAlign: 'center' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12, marginTop: 18 },
  card: { padding: '14px', borderRadius: 10, border: '1px solid var(--chatty-line)', background: 'var(--chatty-button)', color: 'var(--chatty-text)', cursor: 'pointer', textAlign: 'left' },

  chatWrap: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  history: { flex: 1, overflow: 'auto', padding: '18px 18px 0', minHeight: 0 },
  attachRow: { marginBottom: 10 },
  attachPill: { display: 'inline-block', padding: '8px 10px', borderRadius: 8, background: 'var(--chatty-highlight)', border: '1px solid var(--chatty-line)', fontSize: 12, opacity: .9 },
  msg: { display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, padding: '12px', borderRadius: 10, border: '1px solid var(--chatty-line)', marginBottom: 12, background: 'var(--chatty-button)' },
  msgAI: {},
  msgUser: { background: 'var(--chatty-highlight)' },
  msgRole: { width: 28, height: 28, borderRadius: 6, background: 'var(--chatty-button)', display: 'grid', placeItems: 'center', opacity: .8, fontWeight: 700 },
  fileList: { marginTop: 8, display: 'grid', gap: 6 },
  fileItem: { fontSize: 12, opacity: .85 },

  composer: { display: 'grid', gridTemplateColumns: '32px 1fr 80px', gap: 10, padding: 18, borderTop: '1px solid var(--chatty-line)', flexShrink: 0 },
  iconBtn: { display: 'grid', placeItems: 'center', width: 32, height: 38, borderRadius: 8, background: 'var(--chatty-button)', border: '1px solid var(--chatty-line)', cursor: 'pointer' },
  input: { width: '100%', minHeight: 38, maxHeight: 160, resize: 'vertical', padding: '10px 12px', borderRadius: 8, background: 'var(--chatty-button)', color: 'var(--chatty-text)', border: '1px solid var(--chatty-line)', outline: 'none' },
  send: { borderRadius: 8, border: '1px solid var(--chatty-line)', background: 'var(--chatty-button)', color: 'var(--chatty-text)', cursor: 'pointer' },

  footerNote: { textAlign: 'center', opacity: .5, fontSize: 12, padding: '6px 0 14px', flexShrink: 0 },
}
