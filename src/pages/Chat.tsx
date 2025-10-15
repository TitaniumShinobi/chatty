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
      <div className="flex flex-col h-full" style={{ backgroundColor: '#ffffeb' }}>
        <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
          <h2 className="text-xl font-semibold mb-2" style={{ color: '#4c3d1e' }}>Thread not found</h2>
          <p className="mb-4" style={{ color: '#4c3d1e', opacity: 0.7 }}>This conversation could not be found.</p>
          <button 
            className="px-4 py-2 rounded-lg transition-colors"
            style={{ 
              backgroundColor: '#E1C28B',
              color: '#4c3d1e',
              border: '1px solid #d4b078'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#d4b078'
              e.currentTarget.style.borderColor = '#c79d65'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#E1C28B'
              e.currentTarget.style.borderColor = '#d4b078'
            }}
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
    if (!thread) return
    onSendMessage(thread.id, text.trim(), files)
    setText('')
    setFiles([])
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#ffffeb' }}>
      <div className="flex-1 overflow-auto p-4 min-h-0">
        <div className="mb-2">
          {files.length > 0 && (
            <div className="inline-block px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: '#E1C28B', border: '1px solid #d4b078', color: '#4c3d1e' }}>
              Attached files ({files.length})
            </div>
          )}
        </div>

        {thread.messages.map(m => (
          <div key={m.id} className="grid grid-cols-[28px_1fr] gap-3 p-3 mb-3 rounded-lg" style={{ backgroundColor: '#ffffeb', border: '1px solid #d4b078' }}>
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold" style={{ backgroundColor: '#E1C28B', color: '#4c3d1e' }}>
              {m.role === 'assistant' ? 'AI' : 'U'}
            </div>
            <div>
              {m.role === 'assistant' ? (
                <div className="whitespace-normal" style={{ color: '#4c3d1e' }}>
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
                <div className="whitespace-pre-wrap" style={{ color: '#4c3d1e' }}>{m.text}</div>
              )}
              {!!m.files?.length && (
                <div className="mt-2 space-y-1">
                  {m.files.map((f, i) => (
                    <div key={i} className="text-xs" style={{ color: '#4c3d1e', opacity: 0.7 }}>
                      {f.name} <span className="opacity-60">({Math.round(f.size / 1024)} KB)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[32px_1fr_80px] gap-3 p-4 border-t flex-shrink-0" style={{ borderColor: '#d4b078' }}>
        <input 
          type="file" 
          multiple 
          onChange={handleFiles} 
          className="hidden" 
          id="filepick" 
        />
        <label 
          htmlFor="filepick" 
          className="w-8 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors" 
          style={{ backgroundColor: '#E1C28B', border: '1px solid #d4b078' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d4b078'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'}
          title="Attach files"
        >
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
          className="w-full min-h-10 max-h-96 resize-none p-3 rounded-lg outline-none text-base leading-relaxed font-inherit transition-all"
          style={{ 
            backgroundColor: '#ffffeb',
            border: isFocused ? '1px solid #4a9eff' : '1px solid #d4b078',
            color: '#4c3d1e',
            boxShadow: isFocused ? '0 0 0 2px rgba(74, 158, 255, 0.2)' : 'none'
          }}
          rows={1}
        />
        <button
          className="rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ 
            backgroundColor: '#E1C28B',
            border: '1px solid #d4b078',
            color: '#4c3d1e'
          }}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled) {
              e.currentTarget.style.backgroundColor = '#d4b078'
            }
          }}
          onMouseLeave={(e) => {
            if (!e.currentTarget.disabled) {
              e.currentTarget.style.backgroundColor = '#E1C28B'
            }
          }}
          disabled={!text.trim() && files.length === 0}
          onClick={handleSend}
        >
          ➤
        </button>
      </div>

      <div className="text-center text-xs py-2 px-4 flex-shrink-0" style={{ color: '#4c3d1e', opacity: 0.5 }}>
        Chatty can make mistakes. Consider checking important information.
      </div>
    </div>
  )
}

