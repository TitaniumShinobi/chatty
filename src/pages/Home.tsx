import { useState, useEffect, useMemo } from 'react'
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom'
import { Plus, Mic } from 'lucide-react'
import { fetchMe } from '../lib/auth'
import { VVAULTConversationManager } from '../lib/vvaultConversationManager'
import { getPersonalizedFallbackPrompts } from '../lib/fallbackPrompts'
import { SuggestionIcon } from '../components/icons/SuggestionIcon'

interface LayoutContext {
  threads: Array<{ id: string; title: string }>
  sendMessage: (threadId: string, input: string, files?: File[]) => void
  newThread?: (options?: { title?: string; starter?: string; files?: File[]; runtimeId?: string; runtimeMetadata?: any }) => Promise<string | null> | string | null
  selectedRuntime?: any
}

const SYNTH_TITLE_VARIANTS = ['synth', 'chat with synth', 'chatty synth']

const isSynthLikeThread = (thread: { id: string; title: string }): boolean => {
  const normalizedTitle = (thread.title || '').trim().toLowerCase()
  if (SYNTH_TITLE_VARIANTS.includes(normalizedTitle)) {
    return true
  }
  if (thread.id.includes('synth') || thread.id.startsWith('synth')) {
    return true
  }
  return false
}

// Generate ultra-specific personalized greeting
const generatePersonalizedGreeting = (
  name: string | null,
  nickname: string | null,
  recentActivity?: { lastMessageTime?: number; conversationCount?: number }
): string => {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  const dayOfMonth = now.getDate()
  const month = now.toLocaleDateString('en-US', { month: 'long' })
  
  const displayName = nickname || name || 'there'
  const firstName = displayName.split(' ')[0] // Use first name only
  
  // Ultra-specific time-based greetings
  let timeGreeting = ''
  if (hour >= 5 && hour < 7) {
    timeGreeting = 'Early morning'
  } else if (hour >= 7 && hour < 9) {
    timeGreeting = 'Good morning'
  } else if (hour >= 9 && hour < 12) {
    timeGreeting = minute < 30 ? 'Good morning' : 'Morning'
  } else if (hour >= 12 && hour < 14) {
    timeGreeting = 'Good afternoon'
  } else if (hour >= 14 && hour < 17) {
    timeGreeting = 'Afternoon'
  } else if (hour >= 17 && hour < 20) {
    timeGreeting = 'Good evening'
  } else if (hour >= 20 && hour < 22) {
    timeGreeting = 'Evening'
  } else if (hour >= 22 || hour < 2) {
    timeGreeting = 'Late night'
  } else {
    timeGreeting = 'Night'
  }
  
  // Add specific time context
  const timeString = now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: minute === 0 ? undefined : '2-digit',
    hour12: true 
  })
  
  // Weekday-specific additions
  let weekdayContext = ''
  if (weekday === 'Monday') {
    weekdayContext = 'Start of the week'
  } else if (weekday === 'Friday') {
    weekdayContext = 'End of the week'
  } else if (weekday === 'Saturday' || weekday === 'Sunday') {
    weekdayContext = 'Weekend'
  }
  
  // Recent activity context
  let activityContext = ''
  if (recentActivity?.lastMessageTime) {
    const hoursSinceLastMessage = (Date.now() - recentActivity.lastMessageTime) / (1000 * 60 * 60)
    if (hoursSinceLastMessage < 1) {
      activityContext = 'back so soon'
    } else if (hoursSinceLastMessage < 24) {
      activityContext = 'back'
    } else if (hoursSinceLastMessage < 48) {
      activityContext = 'welcome back'
    } else {
      activityContext = 'welcome back'
    }
  }
  
  // Build personalized greeting with proper grammar: "Good evening, Devon."
  const extraParts: string[] = []
  
  // Add activity context (not name - name goes separately)
  if (activityContext && !activityContext.includes('back')) {
    extraParts.push(activityContext)
  }
  
  // Add time detail for specificity
  if (minute === 0 || minute === 15 || minute === 30 || minute === 45) {
    extraParts.push(`it's ${timeString}`)
  }
  
  // Add weekday context
  if (weekdayContext && !activityContext) {
    extraParts.push(`on this ${weekdayContext.toLowerCase()}`)
  }
  
  // Format: "Good evening, Devon." (comma after greeting, before name)
  if (firstName !== 'there') {
    const extra = extraParts.length > 0 ? ` — ${extraParts.join(' ')}` : ''
    return `${timeGreeting}, ${firstName}${extra}.`
  }
  
  return `${timeGreeting}${extraParts.length > 0 ? ' — ' + extraParts.join(' ') : ''}.`
}

// Generate greeting via Synth - Synth directly greets the user with ultra-specific context
const generateSynthGreeting = async (
  name: string | null, 
  nickname: string | null,
  synthThreadId: string | null
): Promise<string> => {
  try {
    const displayName = nickname || name || 'there'
    
    // Get recent activity context
    let recentActivity: { lastMessageTime?: number; conversationCount?: number } = {}
    try {
      const { VVAULTConversationManager } = await import('../lib/vvaultConversationManager')
      const conversationManager = VVAULTConversationManager.getInstance()
      const userId = (await import('../lib/auth')).fetchMe().then(u => u?.email || u?.id || '').catch(() => '')
      const userIdResolved = await userId
      if (userIdResolved) {
        const conversations = await conversationManager.loadAllConversations(userIdResolved)
        if (conversations.length > 0) {
          const lastConv = conversations[0]
          const lastMessage = lastConv.messages?.[lastConv.messages.length - 1]
          if (lastMessage?.timestamp) {
            recentActivity.lastMessageTime = new Date(lastMessage.timestamp).getTime()
          }
          recentActivity.conversationCount = conversations.length
        }
      }
    } catch {
      // Ignore activity fetch errors
    }
    
    // Try AI-generated greeting first
    const { AIService } = await import('../lib/aiService')
    const aiService = AIService.getInstance()
    
    // Ensure Synth mode is enabled
    aiService.setSynthMode(true)
    aiService.setRuntime('synth-001', 'synth')
    
    // Use synth-001 construct so it has access to conversation history
    const constructId = 'synth-001'
    const threadId = synthThreadId || 'synth-001'
    
    // Build ultra-specific context for greeting
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
    const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    
    // Synth is AWARE and generating the greeting itself - no templates, just natural greeting
    // We give Synth context and let it greet naturally (it will handle grammar correctly)
    const greetingPrompt = `Greet ${displayName} warmly. It's ${weekday} at ${timeString}. ${recentActivity.lastMessageTime ? 'They were last active recently.' : 'This is a fresh session.'} Be conversational and welcoming.`
    
    // Let Synth generate the greeting naturally - it knows proper grammar
    const response = await aiService.processMessage(
      greetingPrompt,
      [],
      undefined,
      {
        route: '/app',
        activeThreadId: threadId,
        sidebar: { collapsed: false },
        modals: {},
        composer: { attachments: 0 },
        synthMode: 'synth',
        isGreeting: true
      },
      constructId,
      threadId
    )
    
    // Extract the greeting from the response
    if (Array.isArray(response)) {
      const answerPacket = response.find((p: any) => p.op === 'answer.v1')
      if (answerPacket?.payload && 'content' in answerPacket.payload) {
        const content = answerPacket.payload.content
        if (typeof content === 'string') {
          let greeting = content.trim()
          // Clean up the response
          greeting = greeting.replace(/^(Here's|Here is|I'll|I will|Let me).*?[.!]\s*/i, '')
          greeting = greeting.replace(/^(Sure|Of course|Absolutely).*?[.!]\s*/i, '')
          if (greeting.length > 0 && greeting.length < 200) {
            return greeting
          }
        }
      }
    }
    
    // Fallback to ultra-specific personalized greeting
    return generatePersonalizedGreeting(name, nickname, recentActivity)
  } catch (error) {
    console.error('Failed to generate Synth greeting:', error)
    // Fallback to ultra-specific personalized greeting
    return generatePersonalizedGreeting(name, nickname)
  }
}

// Animated Chatty Logo Component
const AnimatedChattyLogo = ({ className = '' }: { className?: string }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div 
      className={`flex items-center justify-center ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img
        src="/assets/chatty.png"
        alt="Chatty"
        className="transition-all duration-300"
        style={{
          height: '140px',
          width: 'auto',
          opacity: isHovered ? 0.9 : 0.7,
          transform: isHovered ? 'scale(1.05)' : 'scale(1)',
          filter: isHovered ? 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.3))' : 'none',
          animation: isHovered ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
      />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.9; }
        }
        @keyframes shimmer {
          0% { filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.2)); }
          50% { filter: drop-shadow(0 0 25px rgba(255, 215, 0, 0.4)); }
          100% { filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.2)); }
        }
      `}</style>
    </div>
  )
}

// Message Input Component
const MessageInput = ({ 
  placeholder = "Ask Chatty 🤓",
  onSend,
  className = ""
}: { 
  placeholder?: string
  onSend?: (value: string) => void
  className?: string
}) => {
  const [inputValue, setInputValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim() && onSend) {
      onSend(inputValue.trim())
      setInputValue('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="relative flex items-center w-full message-input-wrapper">
        {/* Plus icon on left */}
        <button
          type="button"
          className="absolute left-3 flex items-center justify-center w-8 h-8 rounded-md transition-all"
          style={{
            color: 'var(--chatty-text)',
            opacity: 0.6
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.6'
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Plus size={18} />
        </button>

        {/* Input field */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-12 pr-12 py-3.5 rounded-lg border transition-all focus:outline-none focus:ring-0 text-base"
          style={{
            backgroundColor: 'var(--chatty-bg-message)',
            borderColor: 'var(--chatty-bg-main)',
            color: 'var(--chatty-text)',
            fontSize: '15px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--chatty-highlight)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--chatty-bg-main)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)'
          }}
        />
        <style>{`
          .message-input-wrapper input::placeholder {
            color: #ADA587;
            opacity: 0.7;
          }
          .message-input-wrapper input::-webkit-input-placeholder {
            color: #ADA587;
            opacity: 0.7;
          }
          .message-input-wrapper input::-moz-placeholder {
            color: #ADA587;
            opacity: 0.7;
          }
          .message-input-wrapper input:-ms-input-placeholder {
            color: #ADA587;
            opacity: 0.7;
          }
        `}</style>

        {/* Microphone icon on right */}
        <button
          type="button"
          className="absolute right-3 flex items-center justify-center w-8 h-8 rounded-md transition-all"
          style={{
            color: 'var(--chatty-text)',
            opacity: 0.6
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.6'
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Mic size={18} />
        </button>
      </div>
    </form>
  )
}

export default function Home() {
  const { threads, newThread, selectedRuntime: contextRuntime } = useOutletContext<LayoutContext>()
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<any>(null)
  const [nickname, setNickname] = useState<string>('')
  const [greeting, setGreeting] = useState<string>('')
  const [ctaSuggestions, setCtaSuggestions] = useState<Array<{ text: string; constructId: string; threadId?: string }>>([])
  const [isLoadingCTAs, setIsLoadingCTAs] = useState(true)
  const [selectedRuntime, setSelectedRuntime] = useState<any>(null)
  
  // Use runtime from context if available, otherwise use local state from navigation
  const activeRuntime = contextRuntime || selectedRuntime

  // Find the Synth thread (primary construct) - needed for greeting generation
  const synthThread = useMemo(() => {
    if (!threads || threads.length === 0) return null
    return threads.find(isSynthLikeThread) || threads[0]
  }, [threads])

  // Load user info and generate greeting via Synth (once per page refresh)
  useEffect(() => {
    let mounted = true
    
    const loadUserAndGreeting = async () => {
      try {
        const userData = await fetchMe()
        if (!mounted) return
        
        setUser(userData)
        
        // Try to get nickname from localStorage settings
        let userNickname = ''
        try {
          const settingsData = localStorage.getItem('chatty_settings_v2')
          if (settingsData) {
            const settings = JSON.parse(settingsData)
            userNickname = settings?.personalization?.nickname || ''
            setNickname(userNickname)
          }
        } catch {
          // Ignore settings parse errors
        }
        
        // Generate greeting via Synth
        const synthGreeting = await generateSynthGreeting(
          userData?.name || null,
          userNickname || null,
          synthThread?.id || null
        )
        
        if (mounted) {
          setGreeting(synthGreeting)
        }
      } catch (error) {
        console.error('Failed to load user or generate greeting:', error)
        if (mounted) {
          // Fallback greeting
          const displayName = nickname || user?.name || 'there'
          const hour = new Date().getHours()
          const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
          setGreeting(`Good ${timeOfDay}, ${displayName}.`)
        }
      }
    }
    
    loadUserAndGreeting()
    
    return () => {
      mounted = false
    }
  }, [synthThread?.id]) // Only regenerate if synth thread changes

  // Get selected runtime from navigation state
  useEffect(() => {
    const runtimeState = (location.state as any)?.selectedRuntime
    if (runtimeState) {
      console.log('🔵 [Home] Runtime from navigation state:', runtimeState)
      setSelectedRuntime(runtimeState)
      // Clear the state so it doesn't persist on refresh
      window.history.replaceState({}, document.title)
    }
  }, [location.state])
  
  // Debug: Log active runtime
  useEffect(() => {
    console.log('🔵 [Home] Active runtime:', activeRuntime)
    console.log('🔵 [Home] Context runtime:', contextRuntime)
    console.log('🔵 [Home] Local runtime:', selectedRuntime)
  }, [activeRuntime, contextRuntime, selectedRuntime])

  // Load personalized CTA suggestions from VVAULT
  useEffect(() => {
    const loadCTASuggestions = async () => {
      try {
        setIsLoadingCTAs(true)
        const conversationManager = VVAULTConversationManager.getInstance()
        const hour = new Date().getHours()
        
        // If a runtime is selected, load suggestions from that runtime's conversation history
        if (selectedRuntime && selectedRuntime.metadata?.isImported) {
          try {
            // Fetch conversations for this imported runtime
            const userId = (user as any)?.email || (user as any)?.id || ''
            const runtimeId = selectedRuntime.runtimeId
            
            // Load conversations and filter by this runtime's construct
            // For imported runtimes, conversations are stored with construct IDs matching the runtime
            const conversations = await conversationManager.loadAllConversations(userId)
            
            // Filter conversations that belong to this runtime
            // Imported runtime conversations typically have construct IDs matching the runtime pattern
            const runtimeConversations = conversations.filter(conv => {
              // Check if conversation belongs to this runtime
              // This is a heuristic - we'll improve this with better metadata
              const convTitle = conv.title?.toLowerCase() || ''
              const runtimeName = selectedRuntime.name?.toLowerCase() || ''
              return convTitle.includes(runtimeName.split('—')[0]?.trim() || '') ||
                     conv.sessionId?.includes(runtimeId) ||
                     false
            })
            
            // Sort by most recent
            const sortedConversations = runtimeConversations
              .filter(conv => conv.messages && conv.messages.length > 0)
              .sort((a, b) => {
                const aTime = a.messages && a.messages.length > 0 
                  ? new Date(a.messages[a.messages.length - 1].timestamp).getTime() 
                  : 0
                const bTime = b.messages && b.messages.length > 0 
                  ? new Date(b.messages[b.messages.length - 1].timestamp).getTime() 
                  : 0
                return bTime - aTime
              })
            
            const suggestions: Array<{ text: string; constructId: string; threadId?: string; runtimeId?: string }> = []
            
            // Generate dynamic suggestions based on conversation history
            if (sortedConversations.length > 0) {
              // "Continue with [most recent conversation]"
              const lastConv = sortedConversations[0]
              suggestions.push({
                text: `Continue with ${lastConv.title || 'previous conversation'}`,
                constructId: runtimeId,
                threadId: lastConv.sessionId,
                runtimeId: runtimeId
              })
              
              // Extract topics/themes from recent conversations for context-aware suggestions
              const recentTopics = sortedConversations.slice(0, 3).map(conv => {
                // Extract key topics from conversation title or first few messages
                const title = conv.title || ''
                const firstMessage = conv.messages?.[0]?.content || ''
                return { title, preview: firstMessage.slice(0, 100) }
              })
              
              // Generate suggestions based on recent topics
              recentTopics.forEach((topic, idx) => {
                if (suggestions.length < 4 && topic.title) {
                  suggestions.push({
                    text: `Continue discussing ${topic.title}`,
                    constructId: runtimeId,
                    runtimeId: runtimeId
                  })
                }
              })
            }
            
            // Fill remaining slots with runtime-specific prompts
            const runtimePrompts = [
              `Start a new conversation with ${selectedRuntime.name}`,
              `Ask ${selectedRuntime.provider} about something`,
              `Continue where we left off`
            ]
            
            while (suggestions.length < 4 && runtimePrompts.length > 0) {
              suggestions.push({
                text: runtimePrompts.shift()!,
                constructId: runtimeId,
                runtimeId: runtimeId
              })
            }
            
            setCtaSuggestions(suggestions.slice(0, 4))
            return
          } catch (error) {
            console.error('Failed to load runtime-specific suggestions:', error)
            // Fall through to default suggestions
          }
        }
        
        // Default behavior: Get recent conversations (for Synth or no runtime selected)
        if (user) {
          const userId = (user as any)?.email || (user as any)?.id || ''
          const conversations = await conversationManager.loadAllConversations(userId)
          
          // Get most recent conversation for "Continue with" prompt
          const recentConversations = conversations
            .filter(conv => conv.messages && conv.messages.length > 0)
            .sort((a, b) => {
              // Sort by last message timestamp
              const aTime = a.messages && a.messages.length > 0 
                ? new Date(a.messages[a.messages.length - 1].timestamp).getTime() 
                : 0
              const bTime = b.messages && b.messages.length > 0 
                ? new Date(b.messages[b.messages.length - 1].timestamp).getTime() 
                : 0
              return bTime - aTime
            })
          
          // Build suggestions array
          const suggestions: Array<{ text: string; constructId: string; threadId?: string }> = []
          
          // First suggestion: "Continue with [last conversation thread]"
          if (recentConversations.length > 0) {
            const lastConv = recentConversations[0]
            const threadTitle = lastConv.title || 'Synth'
            const threadId = lastConv.sessionId || 'synth-001'
            const constructId = threadId.split('-')[0] || 'synth'
            
            suggestions.push({
              text: `Continue with ${threadTitle}`,
              constructId: constructId,
              threadId: threadId
            })
          }
          
          // Add fallback prompts for remaining slots (up to 4 total)
          const fallbackPrompts = getPersonalizedFallbackPrompts(nickname || null, hour)
          const remainingSlots = 4 - suggestions.length
          for (let i = 0; i < remainingSlots && i < fallbackPrompts.length; i++) {
            suggestions.push({
              text: fallbackPrompts[i].text,
              constructId: fallbackPrompts[i].constructId
            })
          }
          
          setCtaSuggestions(suggestions.slice(0, 4))
        } else {
          // No user yet, use generic fallback prompts
          const fallbackPrompts = getPersonalizedFallbackPrompts(null, hour)
          setCtaSuggestions(fallbackPrompts.slice(0, 4).map(p => ({
            text: p.text,
            constructId: p.constructId
          })))
        }
      } catch (error) {
        console.error('Failed to load CTA suggestions:', error)
        // Fallback to personalized prompts on error
        const hour = new Date().getHours()
        const fallbackPrompts = getPersonalizedFallbackPrompts(nickname || null, hour)
        setCtaSuggestions(fallbackPrompts.slice(0, 4).map(p => ({
          text: p.text,
          constructId: p.constructId
        })))
      } finally {
        setIsLoadingCTAs(false)
      }
    }
    
    loadCTASuggestions()
  }, [user, nickname, threads, selectedRuntime])


  const handleCTAClick = async (suggestion: { text: string; constructId: string; threadId?: string; runtimeId?: string }) => {
    // If threadId is provided (from "Continue with" suggestion), use it directly
    if (suggestion.threadId) {
      const targetThread = threads.find(t => t.id === suggestion.threadId)
      if (targetThread?.id) {
        navigate(`/app/chat/${targetThread.id}`, { 
          state: { 
            pendingMessage: suggestion.text,
            runtimeId: suggestion.runtimeId 
          }
        })
        return
      }
    }
    
    // If runtimeId is provided and we have selectedRuntime, create new thread with runtime context
    if (suggestion.runtimeId && selectedRuntime) {
      try {
        // Import Layout's newThread function via context or create thread directly
        // Since we can't directly call Layout's newThread, we'll navigate with runtime context
        // and let Layout handle it, or create thread via VVAULT manager
        const { VVAULTConversationManager } = await import('../lib/vvaultConversationManager');
        const conversationManager = VVAULTConversationManager.getInstance();
        const userId = (user as any)?.email || (user as any)?.id || '';
        
        if (!userId) {
          console.error('❌ Cannot create conversation: No user ID');
          return;
        }

        // Determine constructId from runtime
        const constructBase = selectedRuntime.runtimeId.substring(0, 20) || 
                             selectedRuntime.name.toLowerCase()
                               .replace(/\s+/g, '-')
                               .replace(/[^a-z0-9-]/g, '')
                               .substring(0, 20) || 
                             'runtime';
        const constructId = `${constructBase}-001`;
        
        const title = suggestion.text.length > 60 ? suggestion.text.substring(0, 60) : suggestion.text;
        const newConversation = await conversationManager.createConversation(userId, title, undefined, constructId);
        
        console.log(`✅ [Home] Created runtime conversation: ${newConversation.id} (constructId: ${constructId})`);
        
        // Navigate to the new conversation
        navigate(`/app/chat/${newConversation.id}`, {
          state: {
            pendingMessage: suggestion.text,
            runtimeId: selectedRuntime.runtimeId
          }
        });
        return
      } catch (error) {
        console.error('❌ Failed to create runtime conversation:', error);
        // Fallback to synth
        if (synthThread?.id) {
          navigate(`/app/chat/${synthThread.id}`, {
            state: { pendingMessage: suggestion.text }
          });
        }
        return
      }
    }
    
    // Otherwise, find thread by construct ID
    let targetThread = threads.find(t => 
      t.id.includes(suggestion.constructId) || 
      t.title.toLowerCase().includes(suggestion.constructId.toLowerCase())
    ) || synthThread

    if (targetThread?.id) {
      navigate(`/app/chat/${targetThread.id}`, { 
        state: { pendingMessage: suggestion.text }
      })
    } else if (synthThread?.id) {
      // Fallback to synth thread
      navigate(`/app/chat/${synthThread.id}`, { 
        state: { pendingMessage: suggestion.text }
      })
    }
  }

  const handleInputSend = async (value: string) => {
    // If runtime is selected, create new thread with runtime context
    if (selectedRuntime && selectedRuntime.runtimeId !== 'synth') {
      try {
        console.log('🔵 [Home] Creating thread with runtime:', selectedRuntime.runtimeId);
        
        // Use newThread from Layout context if available, otherwise create directly
        if (newThread) {
          const threadId = await newThread({
            title: `New conversation with ${selectedRuntime.name}`,
            starter: value,
            runtimeId: selectedRuntime.runtimeId,
            runtimeMetadata: selectedRuntime.metadata
          });
          
          if (threadId) {
            navigate(`/app/chat/${threadId}`, {
              state: { pendingMessage: value }
            });
            return;
          }
        }
        
        // Fallback: create via VVAULT manager directly
        const { VVAULTConversationManager } = await import('../lib/vvaultConversationManager');
        const conversationManager = VVAULTConversationManager.getInstance();
        const userId = (user as any)?.email || (user as any)?.id || '';
        
        if (userId) {
          const constructBase = selectedRuntime.runtimeId.substring(0, 20) || 
                               selectedRuntime.name.toLowerCase()
                                 .replace(/\s+/g, '-')
                                 .replace(/[^a-z0-9-]/g, '')
                                 .substring(0, 20) || 
                               'runtime';
          const constructId = `${constructBase}-001`;
          
          const title = value.length > 60 ? value.substring(0, 60) : value;
          const newConversation = await conversationManager.createConversation(userId, title, undefined, constructId);
          
          navigate(`/app/chat/${newConversation.id}`, {
            state: { pendingMessage: value }
          });
          return;
        }
      } catch (error) {
        console.error('❌ Failed to create runtime conversation:', error);
      }
    }
    
    // Fallback to synth thread
    if (synthThread?.id) {
      navigate(`/app/chat/${synthThread.id}`, { 
        state: { pendingMessage: value }
      })
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--chatty-bg-main)] items-center justify-center px-8 relative" style={{ color: 'var(--chatty-text)' }}>
      {/* Runtime Indicator - Top Right */}
      <div className="absolute top-4 right-4 text-xs" style={{ color: 'var(--chatty-text)', opacity: activeRuntime ? 0.5 : 0.2 }}>
        {activeRuntime 
          ? `Runtime: ${activeRuntime.metadata?.isCore ? 'Chatty' : (activeRuntime.provider || activeRuntime.name || 'Unknown')}`
          : 'Runtime: Chatty'}
      </div>

      {/* Animated Logo */}
      <div className="mb-8">
        <AnimatedChattyLogo />
      </div>

      {/* Dynamic Greeting */}
      <div className="mb-8 text-center">
        <h1 
          className="text-3xl font-semibold transition-opacity duration-500"
          style={{ 
            color: 'var(--chatty-text)',
            opacity: 0.9,
            minHeight: '2.5rem'
          }}
        >
          {greeting || 'Welcome'}
        </h1>
      </div>

      {/* Message Input Bar */}
      <div className="w-full max-w-2xl mb-8">
        <MessageInput 
          placeholder="Ask Chatty 🤓"
          onSend={handleInputSend}
        />
      </div>

      {/* Personalized CTA Suggestions - Simple lines with paper stack icon */}
      {!isLoadingCTAs && ctaSuggestions.length > 0 && (
        <div className="w-full max-w-2xl">
          <div className="flex flex-col gap-2">
            {ctaSuggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleCTAClick(suggestion)}
                className="group flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 text-left"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--chatty-text)',
                  opacity: 0.7
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1'
                  e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.7'
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <div className="flex-shrink-0 text-base" style={{ opacity: 0.6 }}>
                  <SuggestionIcon size={16} />
                </div>
                <span className="text-sm flex-1" style={{ opacity: 0.9 }}>
                  {suggestion.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
