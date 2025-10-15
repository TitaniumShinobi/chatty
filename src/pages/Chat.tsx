import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { R } from '../runtime/render'

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

interface LayoutContext {
  threads: Thread[]
  sendMessage: (threadId: string, text: string, files: File[]) => void
  renameThread: (threadId: string, title: string) => void
  newThread: () => void
}

export default function Chat() {
  const { threads, sendMessage: onSendMessage } = useOutletContext<LayoutContext>()
  const { threadId } = useParams<{ threadId: string }>()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const thread = threads.find(t => t.id === threadId)

  useEffect(() => {
    if (!thread && threadId) {
      // Thread not found, redirect to home
      navigate('/app')
    }
  }, [thread, threadId, navigate])

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      const maxHeight = 15 * 24 // 15 lines * 24px line height
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`
    }
  }

  useEffect(() => {
    adjustTextareaHeight()
  }, [text])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFocus = () => setIsFocused(true)
  const handleBlur = () => setIsFocused(false)

  if (!thread) {
    return (
      <div style={styles.container}>
        <div style={styles.notFound}>
          <h2>Thread not found</h2>
          <p>This conversation could not be found.</p>
          <button 
            style={styles.button}
            onClick={() => navigate('/app')}
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const f = Array.from(e.target.files ?? [])
    setFiles(prev => [...prev, ...f])
    e.currentTarget.value = ''
  }

  function handleSend() {
    if (!text.trim() && files.length === 0) return
    onSendMessage(thread.id, text.trim(), files)
    setText('')
    setFiles([])
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.history}>
        <div style={styles.attachRow}>
          {files.length > 0 && (
            <div style={styles.attachPill}>
              Attached files ({files.length})
            </div>
          )}
        </div>

        {thread.messages.map(m => (
          <div key={m.id} style={{ ...styles.msg, ...(m.role === 'assistant' ? styles.msgAI : styles.msgUser) }}>
            <div style={styles.msgRole}>
              {m.role === 'assistant' ? 'AI' : 'U'}
            </div>
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
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
              )}
              {!!m.files?.length && (
                <div style={styles.fileList}>
                  {m.files.map((f, i) => (
                    <div key={i} style={styles.fileItem}>
                      {f.name} <span style={{ opacity: .6 }}>({Math.round(f.size / 1024)} KB)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.composer}>
        <input 
          type="file" 
          multiple 
          onChange={handleFiles} 
          style={{ display: 'none' }} 
          id="filepick" 
        />
        <label htmlFor="filepick" style={styles.iconBtn} title="Attach files">
          📎
        </label>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Message Chatty…"
          style={{
            ...styles.input,
            ...(isFocused ? styles.inputFocused : {})
          }}
          rows={1}
        />
        <button
          style={styles.send}
          disabled={!text.trim() && files.length === 0}
          onClick={handleSend}
        >
          ➤
        </button>
      </div>

      <div style={styles.footerNote}>
        Chatty can make mistakes. Consider checking important information.
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden'
  },
  notFound: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    textAlign: 'center',
    padding: '2rem'
  },
  button: {
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid #3a3b42',
    background: '#2a2b32',
    color: '#fff',
    cursor: 'pointer',
    marginTop: '1rem'
  },
  history: {
    flex: 1,
    overflow: 'auto',
    padding: '18px 18px 0',
    minHeight: 0
  },
  attachRow: {
    marginBottom: 10
  },
  attachPill: {
    display: 'inline-block',
    padding: '8px 10px',
    borderRadius: 8,
    background: '#2a2b32',
    border: '1px solid #3a3b42',
    fontSize: 12,
    opacity: .9
  },
  msg: {
    display: 'grid',
    gridTemplateColumns: '28px 1fr',
    gap: 10,
    padding: '12px',
    borderRadius: 10,
    border: '1px solid #2f3036',
    marginBottom: 12,
    background: '#23242a',
    animation: 'fadeIn 0.3s ease-out',
    opacity: 0,
    animationFillMode: 'forwards'
  },
  msgAI: {},
  msgUser: {
    background: '#1e2026'
  },
  msgRole: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: '#2a2b32',
    display: 'grid',
    placeItems: 'center',
    opacity: .8,
    fontWeight: 700
  },
  fileList: {
    marginTop: 8,
    display: 'grid',
    gap: 6
  },
  fileItem: {
    fontSize: 12,
    opacity: .85
  },
  composer: {
    display: 'grid',
    gridTemplateColumns: '32px 1fr 80px',
    gap: 10,
    padding: 18,
    borderTop: '1px solid #2f3036',
    flexShrink: 0
  },
  iconBtn: {
    display: 'grid',
    placeItems: 'center',
    width: 32,
    height: 38,
    borderRadius: 8,
    background: '#2a2b32',
    border: '1px solid #3a3b42',
    cursor: 'pointer'
  },
  input: {
    width: '100%',
    minHeight: 38,
    maxHeight: 360, // 15 lines * 24px
    resize: 'none',
    padding: '10px 12px',
    borderRadius: 8,
    background: '#1f2025',
    color: '#fff',
    border: '1px solid #3a3b42',
    outline: 'none',
    fontSize: 16,
    lineHeight: 1.5,
    fontFamily: 'inherit',
    transition: 'height 0.2s ease-out, border-color 0.2s ease-out',
    overflow: 'auto'
  },
  inputFocused: {
    borderColor: '#4a9eff',
    boxShadow: '0 0 0 2px rgba(74, 158, 255, 0.2)'
  },
  send: {
    borderRadius: 8,
    border: '1px solid #3a3b42',
    background: '#2a2b32',
    color: '#fff',
    cursor: 'pointer'
  },
  footerNote: {
    textAlign: 'center',
    opacity: .5,
    fontSize: 12,
    padding: '6px 0 14px',
    flexShrink: 0
  }
}
