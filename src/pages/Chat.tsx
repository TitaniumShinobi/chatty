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
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
        <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--chatty-text)' }}>Thread not found</h2>
          <p className="mb-4" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>This conversation could not be found.</p>
          <button 
            className="px-4 py-2 rounded-lg transition-colors"
            style={{ 
              backgroundColor: 'var(--chatty-button)',
              color: 'var(--chatty-text-inverse, #ffffeb)',
              border: '1px solid var(--chatty-line)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--chatty-button)'
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

  const isUser = (role: string) => role === 'user'

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      <div className="flex-1 overflow-auto min-h-0">
        <div className="mb-2 px-4 pt-4">
          {files.length > 0 && (
            <div className="inline-block px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--chatty-button)', border: '1px solid var(--chatty-line)', color: 'var(--chatty-text-inverse, #ffffeb)' }}>
              Attached files ({files.length})
            </div>
          )}
        </div>

        {thread.messages.map(m => {
          const user = isUser(m.role)
          
          // User messages: right-aligned with iMessage-style bubble
          if (user) {
            // Calculate dynamic max-width based on content length
            const content = m.text || ''
            const contentLength = content.length
            let maxWidth = 'max-w-[85%] sm:max-w-[80%] md:max-w-[75%] lg:max-w-[70%]'
            if (contentLength <= 20) {
              maxWidth = 'max-w-[200px]'
            } else if (contentLength <= 100) {
              maxWidth = 'max-w-[300px] sm:max-w-[400px]'
            }
            
            return (
              <div key={m.id} className="flex items-end gap-3 py-3 px-4 flex-row-reverse">
                <div className="flex flex-col items-end">
                  <div 
                    className={`px-4 py-3 shadow-sm transition-colors inline-block ${maxWidth} ml-auto text-left`}
                    style={{
                      backgroundColor: '#ADA587',
                      borderRadius: '22px 22px 6px 22px',
                      border: '1px solid rgba(76, 61, 30, 0.18)',
                      boxShadow: '0 1px 0 rgba(58, 46, 20, 0.12)',
                      color: 'var(--chatty-text-inverse, #ffffeb)'
                    }}
                  >
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {!!m.files?.length && (
                      <div className="mt-2 space-y-1">
                        {m.files.map((f, i) => (
                          <div key={i} className="text-xs" style={{ opacity: 0.7 }}>
                            {f.name} <span className="opacity-60">({Math.round(f.size / 1024)} KB)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          }
          
          // AI/Construct messages: left-aligned, full screen width, no bubble styling
          const formatGenerationTime = (ms: number): string => {
            if (ms < 1000) return `${ms}ms`
            return `${(ms / 1000).toFixed(1)}s`
          }
          
          const responseTimeMs = (m as any).metadata?.responseTimeMs
          const formattedResponseTime = responseTimeMs ? formatGenerationTime(responseTimeMs) : null
          
          return (
            <div key={m.id} className="flex items-start gap-3 py-3 px-4">
              <div className="flex flex-col items-start text-left w-full">
                {formattedResponseTime && (
                  <div 
                    className="text-xs mb-1" 
                    style={{ 
                      color: 'var(--chatty-text)', 
                      opacity: 0.55 
                    }}
                  >
                    Generated in {formattedResponseTime}
            </div>
                )}
                <div className="whitespace-normal w-full" style={{ color: 'var(--chatty-text)' }}>
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
              {!!m.files?.length && (
                <div className="mt-2 space-y-1">
                  {m.files.map((f, i) => (
                      <div key={i} className="text-xs" style={{ opacity: 0.7 }}>
                      {f.name} <span className="opacity-60">({Math.round(f.size / 1024)} KB)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )
        })}
      </div>

      <div className="grid grid-cols-[32px_1fr_80px] gap-3 p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--chatty-line)' }}>
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
          style={{ backgroundColor: 'var(--chatty-button)', border: '1px solid var(--chatty-line)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-button)'}
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
            backgroundColor: 'var(--chatty-bg-main)',
            border: isFocused ? '1px solid var(--chatty-button)' : '1px solid var(--chatty-line)',
            color: 'var(--chatty-text)',
            boxShadow: isFocused ? '0 0 0 2px rgba(173, 165, 135, 0.2)' : 'none'
          }}
          rows={1}
        />
        <button
          className="rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ 
            backgroundColor: 'var(--chatty-button)',
            border: '1px solid var(--chatty-line)',
            color: 'var(--chatty-text-inverse, #ffffeb)'
          }}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled) {
              e.currentTarget.style.backgroundColor = 'var(--chatty-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (!e.currentTarget.disabled) {
              e.currentTarget.style.backgroundColor = 'var(--chatty-button)'
            }
          }}
          disabled={!text.trim() && files.length === 0}
          onClick={handleSend}
        >
          ➤
        </button>
      </div>

      <div className="text-center text-xs py-2 px-4 flex-shrink-0" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
        Chatty can make mistakes. Consider checking important information.
      </div>
    </div>
  )
}

