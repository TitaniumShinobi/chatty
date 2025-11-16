import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams, useLocation } from 'react-router-dom'
import ChatArea from '../components/ChatArea'
import ImportUnlock from '../components/ImportUnlock'
import { fetchMe, type User } from '../lib/auth'
import type { Conversation, Message as ChatMessage } from '../types'

type ThreadMessage = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  packets?: import('../types').AssistantPacket[]
  ts: number
  files?: { name: string; size: number; type?: string }[]
  typing?: boolean
  responseTimeMs?: number
  thinkingLog?: string[]
  metadata?: {
    responseTimeMs?: number
    thinkingLog?: string[]
  }
}

type Thread = {
  id: string
  title: string
  messages: ThreadMessage[]
  createdAt?: number
  updatedAt?: number
  archived?: boolean
  importMetadata?: any
}

type LayoutContext = {
  threads: Thread[]
  sendMessage: (threadId: string, input: string, files: File[], uiOverrides?: any) => void
  renameThread: (threadId: string, title: string) => void
  newThread: (options?: { title?: string; starter?: string; files?: File[] }) => string | void
  toggleSidebar: () => void
  activeThreadId: string | null
  appendMessageToThread?: (threadId: string, message: ChatMessage) => void
  activeRuntimeKey?: string | null
}

const mapPseudoFiles = (files?: { name: string; size: number; type?: string }[]): File[] | undefined => {
  if (!files || files.length === 0) return undefined
  return files.map(file => ({
    name: file.name,
    size: file.size,
    type: file.type ?? 'application/octet-stream'
  }) as File)
}

const isFiniteTimestamp = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value)
}

const safeIsoString = (
  value: number | string | undefined,
  contextLabel: string
): string => {
  let candidate: number | undefined

  if (isFiniteTimestamp(value)) {
    candidate = value
  } else if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      candidate = parsed
    }
  }

  if (candidate === undefined) {
    console.warn(`[Chat] Invalid timestamp for ${contextLabel}; defaulting to now`, value)
    return new Date().toISOString()
  }

  const dt = new Date(candidate)
  if (Number.isNaN(dt.getTime())) {
    console.warn(`[Chat] Failed to convert timestamp for ${contextLabel}; defaulting to now`, value)
    return new Date().toISOString()
  }

  return dt.toISOString()
}

const threadMessageToChatMessage = (message: ThreadMessage): ChatMessage | null => {
  const timestamp = safeIsoString(message.ts, `message:${message.id}`)

  if (message.typing) {
    return null
  }

  if (message.role === 'user') {
    return {
      id: message.id,
      role: 'user',
      content: message.text ?? '',
      timestamp,
      files: mapPseudoFiles(message.files)
    }
  }

  const packets =
    message.packets && message.packets.length > 0
      ? message.packets
      : [{ op: 'answer.v1', payload: { content: message.text ?? '' } } as import('../types').AssistantPacket]

  const metadata = {
    responseTimeMs: message.responseTimeMs ?? message.metadata?.responseTimeMs,
    thinkingLog: message.thinkingLog ?? message.metadata?.thinkingLog
  }

  return {
    id: message.id,
    role: 'assistant',
    content: packets,
    timestamp,
    files: mapPseudoFiles(message.files),
    metadata:
      metadata.responseTimeMs !== undefined ||
      (metadata.thinkingLog && metadata.thinkingLog.length > 0)
        ? metadata
        : undefined
  }
}

const threadToConversation = (thread: Thread): Conversation => {
  const createdAtIso = safeIsoString(thread.createdAt, `thread:${thread.id}:createdAt`)
  const updatedAtIso = safeIsoString(thread.updatedAt ?? thread.createdAt, `thread:${thread.id}:updatedAt`)

  const messages = thread.messages
    .map(threadMessageToChatMessage)
    .filter((msg): msg is ChatMessage => Boolean(msg))

  return {
    id: thread.id,
    title: thread.title ?? 'New conversation',
    messages,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
    archived: thread.archived
  }
}

const SYNTH_RUNTIME_KEY = 'runtime:synth'
const SYNTH_TITLE = 'Synth'
const SYNTH_TITLE_VARIANTS = ['synth', 'chat with synth', 'chatty synth']

const containsSynthMarker = (message: ThreadMessage): boolean => {
  if (!message) return false
  const text = typeof message.text === 'string' ? message.text : ''
  const packets =
    Array.isArray(message.packets) && message.packets.length > 0
      ? message.packets
          .map(pkt => {
            if (!pkt) return ''
            const payload = (pkt as any)?.payload
            if (payload && typeof payload.content === 'string') {
              return payload.content
            }
            return ''
          })
          .join('\n')
      : ''
  return `${text}\n${packets}`.includes('CONVERSATION_CREATED:Synth')
}

const isSynthLikeThread = (thread: Thread | undefined | null): thread is Thread => {
  if (!thread) return false
  const normalizedTitle = (thread.title || '').trim().toLowerCase()
  if (SYNTH_TITLE_VARIANTS.includes(normalizedTitle)) {
    return true
  }
  if (Array.isArray(thread.messages) && thread.messages.some(containsSynthMarker)) {
    return true
  }
  return false
}

export default function Chat() {
  const { threadId } = useParams<{ threadId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    threads,
    sendMessage,
    toggleSidebar,
    appendMessageToThread
  } = useOutletContext<LayoutContext>()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    fetchMe().then(setUser).catch(() => setUser(null))
  }, [])

  const synthThread = useMemo(() => {
    if (!threads || threads.length === 0) return undefined
    return threads.find(isSynthLikeThread) ?? threads.find(t => t.id === SYNTH_RUNTIME_KEY)
  }, [threads])

  // Handle pending message from navigation (e.g., from Home page starter prompts)
  const pendingMessageRef = useRef<string | null>(null)
  const hasSentPendingMessageRef = useRef(false)
  
  useEffect(() => {
    const pendingMessage = (location.state as any)?.pendingMessage
    
    // Only process if we have a pending message and haven't sent it yet
    if (pendingMessage && !hasSentPendingMessageRef.current) {
      // Find the thread we're navigating to (could be synthThread or any thread matching threadId)
      const targetThread = threadId ? threads.find(t => t.id === threadId) : synthThread
      
      if (targetThread) {
        // Clear the navigation state to prevent re-sending
        navigate(location.pathname, { replace: true, state: {} })
        hasSentPendingMessageRef.current = true
        
        // Send message after a brief delay to ensure component is ready
        setTimeout(() => {
          console.log('📤 [Chat] Sending pending message from navigation:', pendingMessage)
          sendMessage(targetThread.id, pendingMessage)
          pendingMessageRef.current = null
        }, 300)
      } else {
        // Thread not ready yet, store message and wait
        pendingMessageRef.current = pendingMessage
      }
    }
    
    // Reset flag when threadId changes (new conversation)
    if (threadId !== pendingMessageRef.current) {
      hasSentPendingMessageRef.current = false
    }
  }, [location.state, synthThread, threadId, threads, navigate, sendMessage])
  
  // Also check if we have a stored pending message and thread is now available
  useEffect(() => {
    if (pendingMessageRef.current && threadId) {
      const targetThread = threads.find(t => t.id === threadId)
      if (targetThread && !hasSentPendingMessageRef.current) {
        hasSentPendingMessageRef.current = true
        setTimeout(() => {
          console.log('📤 [Chat] Sending stored pending message:', pendingMessageRef.current)
          sendMessage(targetThread.id, pendingMessageRef.current!)
          pendingMessageRef.current = null
        }, 300)
      }
    }
  }, [threadId, threads, sendMessage])

  const resolvedSynthId = synthThread?.id ?? SYNTH_RUNTIME_KEY
  const lastSynthIdRef = useRef<string | null>(null)

  // Navigate to Synth when it becomes available, but don't jump away from valid threads
  useEffect(() => {
    if (!resolvedSynthId) return
    
    // If Synth ID changed (e.g., from temporary to canonical), navigate to new one
    if (lastSynthIdRef.current && lastSynthIdRef.current !== resolvedSynthId && threadId === lastSynthIdRef.current) {
      navigate(`/app/chat/${resolvedSynthId}`, { replace: true })
      lastSynthIdRef.current = resolvedSynthId
      return
    }
    
    // If we're already on Synth thread, update ref and return
    if (threadId === resolvedSynthId) {
      lastSynthIdRef.current = resolvedSynthId
      return
    }
    
    // If we're on a different valid thread, don't navigate away
    if (threadId) {
      const currentThread = threads.find(t => t.id === threadId)
      if (currentThread) {
        // Current thread exists and is valid, don't navigate away
        return
      }
    }
    
    // Otherwise, navigate to Synth (first load, invalid thread, etc.)
    if (lastSynthIdRef.current !== resolvedSynthId) {
      navigate(`/app/chat/${resolvedSynthId}`, { replace: true })
      lastSynthIdRef.current = resolvedSynthId
    }
  }, [navigate, resolvedSynthId, threadId, threads])

  // Get current thread (could be synthThread or threadId match)
  const currentThread = useMemo(() => {
    console.log('🔍 [Chat.tsx] Resolving current thread:', {
      threadId,
      threadsCount: threads.length,
      threadIds: threads.map(t => t.id),
      synthThreadId: synthThread?.id
    });
    
    if (threadId) {
      // If we have a specific threadId in URL, only use that thread (don't fallback to synthThread)
      // This prevents showing wrong conversation while threads are loading
      const foundThread = threads.find(t => t.id === threadId)
      if (foundThread) {
        console.log('✅ [Chat.tsx] Found thread matching URL threadId:', {
          id: foundThread.id,
          title: foundThread.title,
          messageCount: foundThread.messages.length
        });
        return foundThread
      }
      // Thread not found yet - return undefined to show loading/empty state instead of wrong conversation
      console.warn('⚠️ [Chat.tsx] Thread not found for URL threadId:', threadId, '- showing loading state');
      return undefined
    }
    console.log('ℹ️ [Chat.tsx] No threadId in URL, using synthThread:', synthThread?.id);
    return synthThread
  }, [threadId, threads, synthThread])

  // Initialize AI service history when thread is opened
  useEffect(() => {
    if (currentThread && currentThread.messages && currentThread.messages.length > 0) {
      (async () => {
        const { AIService } = await import('../lib/aiService')
        const aiService = AIService.getInstance()
        aiService.initializeHistoryFromThread(currentThread.id, currentThread.messages)
        console.log(`📚 [Chat] Initialized AI history for thread ${currentThread.id}: ${currentThread.messages.length} messages`)
      })()
    }
  }, [currentThread?.id, currentThread?.messages?.length])

  const conversation = useMemo<Conversation>(() => {
    const thread = currentThread
    if (thread) {
      console.log(`💬 [Chat] Building conversation from thread:`, {
        id: thread.id,
        title: thread.title,
        messageCount: thread.messages?.length || 0,
        messageIds: thread.messages?.map(m => m.id).slice(0, 5) || []
      });
      const mapped = threadToConversation(thread)
      console.log(`💬 [Chat] Converted to conversation with ${mapped.messages.length} messages`);
      return {
        ...mapped,
        id: thread.id,
        title: thread.title || SYNTH_TITLE
      }
    }
    console.warn(`⚠️ [Chat] No thread found, creating empty conversation`);
    const nowIso = new Date().toISOString()
    return {
      id: resolvedSynthId,
      title: SYNTH_TITLE,
      messages: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      archived: false
    }
  }, [resolvedSynthId, currentThread])

  // Import unlock state
  const [showImportUnlock, setShowImportUnlock] = useState(false)
  const [dismissedImportUnlock, setDismissedImportUnlock] = useState<string | null>(null)

  useEffect(() => {
    if (currentThread?.importMetadata && currentThread.id !== dismissedImportUnlock) {
      setShowImportUnlock(true)
    } else {
      setShowImportUnlock(false)
    }
  }, [currentThread, dismissedImportUnlock])

  // Available constructs (default + user's registered constructs)
  const availableConstructs = useMemo(() => {
    const defaults = [
      { id: 'synth', name: 'Synth' },
      { id: 'nova', name: 'Nova' },
      { id: 'monday', name: 'Monday' },
      { id: 'aurora', name: 'Aurora' },
      { id: 'katana', name: 'Katana' },
    ]
    // TODO: Add user's registered constructs from GPTs/SimForge
    return defaults
  }, [])

  // Extract current construct ID from thread ID or import metadata
  const currentConstructId = useMemo(() => {
    // First check if there's a connectedConstructId in import metadata
    const connectedId = (currentThread as any)?.importMetadata?.connectedConstructId;
    if (connectedId) {
      return connectedId;
    }
    // Otherwise extract from thread ID (e.g., "synth-001" -> "synth")
    if (!currentThread?.id) return undefined
    const match = currentThread.id.match(/^([a-z-]+)/)
    return match ? match[1] : undefined
  }, [currentThread])

  const handleConnectConstruct = async (constructId: string, gptConfig?: any) => {
    if (!currentThread?.id || !user) {
      console.warn('🔗 [Chat] Cannot connect: missing thread or user')
      return
    }

    try {
      console.log('🔗 [Chat] Connecting conversation to construct:', constructId, gptConfig)
      
      // Call backend API to update the transcript metadata
      const userId = (user as any).sub || (user as any).id || (user as any).email
      const response = await fetch(`/api/vvault/conversations/${currentThread.id}/connect-construct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          constructId,
          gptConfig: gptConfig || null
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to connect conversation to construct')
      }

      console.log('✅ [Chat] Successfully connected conversation to construct')
      
      // Dismiss the unlock UI
      setDismissedImportUnlock(currentThread.id)
      setShowImportUnlock(false)
      
      // Optionally refresh the conversation to show updated state
      // The importMetadata will be updated on next load
    } catch (error: any) {
      console.error('❌ [Chat] Failed to connect conversation:', error)
      // TODO: Show error message to user
    }
  }

  const handleSendMessage = (message: ChatMessage) => {
    const targetThreadId = synthThread?.id
    if (!targetThreadId) {
      return
    }

    if (message.role === 'user') {
      sendMessage(targetThreadId, message.content, message.files ?? [])
      return
    }

    appendMessageToThread?.(targetThreadId, message)
  }

  return (
    <>
      <ChatArea
        conversation={conversation}
        onSendMessage={handleSendMessage}
        onToggleSidebar={toggleSidebar}
      />
      <ImportUnlock
        isVisible={showImportUnlock && !!currentThread?.importMetadata}
        importMetadata={currentThread?.importMetadata || null}
        currentConstructId={currentConstructId}
        availableConstructs={availableConstructs}
        onConnect={handleConnectConstruct}
        onDismiss={() => {
          setDismissedImportUnlock(currentThread?.id || null)
          setShowImportUnlock(false)
        }}
      />
    </>
  )
}
