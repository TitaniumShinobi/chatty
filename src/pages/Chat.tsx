import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
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
  reloadThreadMessages?: (threadId: string) => Promise<void>
}

export default function Chat() {
  const { threads, sendMessage: onSendMessage, reloadThreadMessages } = useOutletContext<LayoutContext>()
  const { threadId } = useParams<{ threadId: string }>()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isFocused, setIsFocused] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [reloadAttempted, setReloadAttempted] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [zenMarkdown, setZenMarkdown] = useState<string | null>(null)
  const [zenMarkdownError, setZenMarkdownError] = useState<string | null>(null)
  const [isZenMarkdownLoading, setIsZenMarkdownLoading] = useState(false)

  const thread = threads.find(t => t.id === threadId) || 
                 threads.find(t => {
                   // Handle transformed IDs from routeIdForThread
                   if (t.isPrimary && t.constructId) {
                     const transformedId = `${t.constructId}_chat_with_${t.constructId}`;
                     return transformedId === threadId;
                   }
                   return false;
                 });

  const isZenSessionThread = Boolean(threadId && threadId.startsWith('zen-001_chat_with_'));

  // Debug: Log thread details when found
  if (thread) {
    console.log('📋 [Chat] Thread found with details:', {
      id: thread.id,
      title: thread.title,
      messageCount: thread.messages?.length || 0,
      messages: thread.messages?.map((m, i) => ({
        index: i,
        id: m.id,
        role: m.role,
        hasText: !!m.text,
        textLength: m.text?.length || 0,
        hasPackets: !!m.packets,
        packetsCount: m.packets?.length || 0,
        textPreview: m.text ? m.text.substring(0, 100) : (m.packets?.[0]?.payload?.content?.substring(0, 100) || 'no content')
      })) || []
    });
  }

  useEffect(() => {
    console.log('🔍 [Chat] Thread lookup:', {
      threadId,
      found: !!thread,
      threadIds: threads.map(t => t.id),
      threadConstructIds: threads.map(t => t.constructId),
      messageCount: thread?.messages?.length || 0,
      messages: thread?.messages?.map(m => ({
        id: m.id,
        role: m.role,
        textPreview: (m.text || '').substring(0, 50)
      })) || []
    });
    
    if (!thread && threadId) {
      if (isZenSessionThread) {
        console.warn('⚠️ [Chat] Zen thread not found yet - loading transcript fallback', { threadId });
        return;
      }
      console.warn('⚠️ [Chat] Thread not found, redirecting');
      navigate('/app');
    }
  }, [thread, threadId, navigate, threads, isZenSessionThread])

  useEffect(() => {
    if (thread || !threadId || !isZenSessionThread) return

    let cancelled = false

    const loadZenTranscript = async () => {
      setIsZenMarkdownLoading(true)
      setZenMarkdown(null)
      setZenMarkdownError(null)

      try {
        const response = await fetch(`http://localhost:5000/api/vvault/chat/${encodeURIComponent(threadId)}`, {
          credentials: 'include'
        })
        const data = await response.json()

        if (!response.ok || !data.ok) {
          throw new Error(data?.error || response.statusText || 'Failed to load Zen transcript')
        }

        if (!cancelled) {
          setZenMarkdown(data.content || '')
        }
      } catch (error) {
        if (!cancelled) {
          setZenMarkdownError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (!cancelled) {
          setIsZenMarkdownLoading(false)
        }
      }
    }

    loadZenTranscript()
    return () => {
      cancelled = true
    }
  }, [thread, threadId, isZenSessionThread])

  // Hydration check: If thread has no messages, attempt to reload
  useEffect(() => {
    if (!thread || !threadId || !reloadThreadMessages) return;
    
    // If thread has no messages, attempt to reload (only once per threadId)
    if (thread.messages.length === 0 && !isReloading && !reloadAttempted) {
      console.log('⚠️ [Chat] Thread has no messages, attempting reload...', {
        threadId: thread.id,
        urlThreadId: threadId,
        title: thread.title,
        constructId: thread.constructId,
        threadsCount: threads.length,
        allThreadIds: threads.map(t => t.id)
      });
      setIsReloading(true);
      setReloadAttempted(true);
      
      // Add timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        console.warn('⏱️ [Chat] Reload timeout after 10s - resetting loading state');
        setIsReloading(false);
      }, 10000); // 10 second timeout
      
      reloadThreadMessages(threadId)
        .then(() => {
          clearTimeout(timeoutId);
          console.log('✅ [Chat] Reload function completed');
          // Don't set isReloading to false immediately - let React re-render with updated threads
          // The thread will update and messages.length > 0 will prevent this from running again
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          console.error('❌ [Chat] Failed to reload thread messages:', error);
          setIsReloading(false);
        });
    } else if (thread.messages.length > 0 && isReloading) {
      // If messages are now present, clear loading state
      console.log(`✅ [Chat] Messages now present (${thread.messages.length}), clearing loading state`);
      setIsReloading(false);
    }
  }, [thread?.id, thread?.messages.length, threadId, reloadThreadMessages, threads.length, isReloading, reloadAttempted]) // Watch threads.length to detect updates

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
    if (isZenSessionThread) {
      if (isZenMarkdownLoading) {
        return (
          <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
            <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--chatty-text)' }}>Loading Zen transcript…</h2>
              <p style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Fetching the saved markdown from VVAULT.</p>
            </div>
          </div>
        )
      }

      if (zenMarkdownError) {
        return (
          <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
            <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--chatty-text)' }}>Unable to load Zen transcript</h2>
              <p className="mb-4" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>{zenMarkdownError}</p>
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

      if (zenMarkdown) {
        return (
          <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
            <div className="flex-1 overflow-auto p-6">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--chatty-text)' }}>Zen transcript</h2>
              <div className="prose max-w-none break-words" style={{ color: 'var(--chatty-text)', lineHeight: 1.7 }}>
                <ReactMarkdown>{zenMarkdown}</ReactMarkdown>
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--chatty-text)' }}>Zen transcript unavailable</h2>
            <p style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>We couldn't render the saved transcript right now.</p>
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

        {/* Fallback UI for empty messages */}
        {thread.messages.length === 0 && !isReloading && (
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <p className="text-lg mb-2" style={{ color: 'var(--chatty-text)' }}>Zen is listening.</p>
            <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Say something to begin.</p>
          </div>
        )}

        {/* Loading state while reloading */}
        {isReloading && (
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Loading conversation...</p>
          </div>
        )}

        {thread.messages.length > 0 && thread.messages.map(m => {
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
            const totalSeconds = ms / 1000
            if (totalSeconds < 60) {
              // Show seconds with 1 decimal for quick responses (e.g., "3.2s")
              return `${totalSeconds.toFixed(1)}s`
            } else {
              // Show mm:ss for longer generations (e.g., "01:23")
              const minutes = Math.floor(totalSeconds / 60)
              const seconds = Math.floor(totalSeconds % 60)
              return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            }
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
