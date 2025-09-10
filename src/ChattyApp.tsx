// src/ChattyApp.tsx
import { useEffect, useMemo, useState } from 'react'
import type { User } from './lib/auth'
import { AIService } from './lib/aiService'
type UserMsg = {
  id: string
  role: 'user'
  text: string
  ts: number
  files?: { name: string; size: number }[]
}

type AssistantMsg = {
  id: string
  role: 'assistant'
  text: string
  ts: number
}

type Message = UserMsg | AssistantMsg
type Thread = { id: string; title: string; messages: Message[] }

export default function ChattyApp({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => void
}) {
  const [threads, setThreads] = useState<Thread[]>(() => {
    try { return JSON.parse(localStorage.getItem('chatty:threads') || '[]') } catch { return [] }
  })
  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null)
  const active = useMemo(
    () => threads.find(t => t.id === activeId) ?? null,
    [threads, activeId]
  )

  useEffect(() => {
    localStorage.setItem('chatty:threads', JSON.stringify(threads))
  }, [threads])

  function newThread() {
    const t: Thread = { id: crypto.randomUUID(), title: 'New conversation', messages: [] }
    setThreads([t, ...threads]); setActiveId(t.id)
  }
  function renameThread(id: string, title: string) {
    setThreads(ts => ts.map(t => (t.id === id ? { ...t, title } : t)))
  }

  async function sendMessage(input: string, files: File[]) {
    if (!active) return
    const userMsg: UserMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      text: input,
      ts: Date.now(),
      files: files.map(f => ({ name:f.name, size:f.size })),
    }
  
    // get simple string response from AI service
    const response = await AIService.getInstance().processMessage(input, files)
  
    const aiMsg: AssistantMsg = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: response,
      ts: Date.now()+1,
    }
  
    setThreads(ts => ts.map(t =>
      t.id === active!.id ? { ...t, messages: [...t.messages, userMsg, aiMsg] } : t
    ))
  
    if (active!.title === 'New conversation' && input.trim()) {
      renameThread(active!.id, input.trim().slice(0, 40))
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
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {m.text || 'I apologize, but I couldn\'t generate a response.'}
                </div>
              ) : (
                <>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  {!!m.files?.length && (
                    <div style={s.fileList}>
                      {m.files.map((f, i) => (
                        <div key={i} style={s.fileItem}>
                          {f.name} <span style={{ opacity: .6 }}>({Math.round(f.size / 1024)} KB)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
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
          placeholder="Message Chatty…"
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
  app: { display: 'flex', minHeight: '100vh', background: '#202123', color: '#fff' },
  sidebar: { width: 260, background: '#17181A', borderRight: '1px solid #2a2b32', display: 'flex', flexDirection: 'column' },
  brand: { padding: '14px 14px 10px', fontWeight: 700 },
  newBtn: { margin: '0 12px 8px', padding: '10px', borderRadius: 8, border: '1px solid #3a3b42', background: '#2a2b32', color: '#fff', cursor: 'pointer' },
  sectionLabel: { padding: '6px 14px', opacity: .6, fontSize: 12 },
  threadList: { flex: 1, overflow: 'auto', padding: 6 },
  threadItem: { width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: '#fff', cursor: 'pointer' },
  threadItemActive: { background: '#2a2b32', borderColor: '#3a3b42' },
  emptySide: { opacity: .6, padding: '10px 12px' },
  footer: { borderTop: '1px solid #2a2b32', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  userBox: { display: 'flex', gap: 10, alignItems: 'center' },
  avatar: { width: 28, height: 28, borderRadius: 6, background: '#2a2b32', display: 'grid', placeItems: 'center', fontWeight: 700 },
  logout: { padding: '8px', borderRadius: 8, border: '1px solid #3a3b42', background: '#2a2b32', color: '#fff', cursor: 'pointer' },

  main: { flex: 1, display: 'flex', alignItems: 'stretch', justifyContent: 'stretch' },
  welcome: { margin: 'auto', textAlign: 'center' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12, marginTop: 18 },
  card: { padding: '14px', borderRadius: 10, border: '1px solid #2f3036', background: '#23242a', color: '#fff', cursor: 'pointer', textAlign: 'left' },

  chatWrap: { display: 'flex', flexDirection: 'column', width: '100%' },
  history: { flex: 1, overflow: 'auto', padding: '18px 18px 0' },
  attachRow: { marginBottom: 10 },
  attachPill: { display: 'inline-block', padding: '8px 10px', borderRadius: 8, background: '#2a2b32', border: '1px solid #3a3b42', fontSize: 12, opacity: .9 },
  msg: { display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, padding: '12px', borderRadius: 10, border: '1px solid #2f3036', marginBottom: 12, background: '#23242a' },
  msgAI: {},
  msgUser: { background: '#1e2026' },
  msgRole: { width: 28, height: 28, borderRadius: 6, background: '#2a2b32', display: 'grid', placeItems: 'center', opacity: .8, fontWeight: 700 },
  fileList: { marginTop: 8, display: 'grid', gap: 6 },
  fileItem: { fontSize: 12, opacity: .85 },

  composer: { display: 'grid', gridTemplateColumns: '32px 1fr 80px', gap: 10, padding: 18, borderTop: '1px solid #2f3036' },
  iconBtn: { display: 'grid', placeItems: 'center', width: 32, height: 38, borderRadius: 8, background: '#2a2b32', border: '1px solid #3a3b42', cursor: 'pointer' },
  input: { width: '100%', minHeight: 38, maxHeight: 160, resize: 'vertical', padding: '10px 12px', borderRadius: 8, background: '#1f2025', color: '#fff', border: '1px solid #3a3b42', outline: 'none' },
  send: { borderRadius: 8, border: '1px solid #3a3b42', background: '#2a2b32', color: '#fff', cursor: 'pointer' },

  footerNote: { textAlign: 'center', opacity: .5, fontSize: 12, padding: '6px 0 14px' },
}