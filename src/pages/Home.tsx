import { useState, useEffect, useMemo, useRef } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { fetchMe, type User } from '../lib/auth'
import { Layers, Mic, Plus } from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'

// Logo assets
import chattyChristmas from '@assets/logo/christmas/Chatty_Christmas.svg'
import chattyLogo from '@assets/logo/Chatty.png'

// Collapse animation frames (default theme)
import collapseFrame0 from '@assets/logo/collapseToggle/chatty_collapsed.png'
import collapseFrame1 from '@assets/logo/collapseToggle/chatty_collapsed_1.png'
import collapseFrame2 from '@assets/logo/collapseToggle/chatty_collapsed_2.png'
import collapseFrame3 from '@assets/logo/collapseToggle/chatty_collapsed_3.png'
import collapseFrame4 from '@assets/logo/collapseToggle/chatty_collapsed_4.png'

// Collapse animation frames (Christmas theme)
import collapseChristmas0 from '@assets/logo/christmas/collapseToggle_Christmas/chatty_collapsed_Christmas.svg'
import collapseChristmas1 from '@assets/logo/christmas/collapseToggle_Christmas/chatty_collapsed_1_Christmas.svg'
import collapseChristmas2 from '@assets/logo/christmas/collapseToggle_Christmas/chatty_collapsed_2_Christmas.svg'
import collapseChristmas3 from '@assets/logo/christmas/collapseToggle_Christmas/chatty_collapsed_3_Christmas.svg'
import collapseChristmas4 from '@assets/logo/christmas/collapseToggle_Christmas/chatty_collapsed_4_Christmas.svg'

interface LayoutContext {
  threads: any[]
  sendMessage: (threadId: string, text: string, files: File[]) => void
  renameThread: (threadId: string, title: string) => void
  newThread: () => void
}

const DEFAULT_ZEN_CANONICAL_SESSION_ID = 'zen-001_chat_with_zen-001';

export default function Home() {
  // #region agent log
  const outletContext = useOutletContext<LayoutContext>();
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Home.tsx:16',message:'useOutletContext result',data:{outletContext:outletContext,isUndefined:outletContext===undefined,hasThreads:!!outletContext?.threads,threadsType:typeof outletContext?.threads},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  const { threads, sendMessage, newThread } = useOutletContext<LayoutContext>()
  const navigate = useNavigate()
  const { activeThemeScript } = useTheme()
  const isChristmasTheme = activeThemeScript?.id === 'christmas'
  const [, setUser] = useState<User | null>(null)
  const [greeting, setGreeting] = useState('')
  const [inputValue, setInputValue] = useState('')
  const primaryHoverFrames = useMemo(
    () => isChristmasTheme ? [
      chattyChristmas,
      collapseChristmas0,
      collapseChristmas1,
      collapseChristmas2,
      collapseChristmas3,
      collapseChristmas4,
      chattyChristmas
    ] : [
      chattyLogo,
      collapseFrame0,
      collapseFrame1,
      collapseFrame2,
      collapseFrame3,
      collapseFrame4,
      chattyLogo
    ],
    [isChristmasTheme]
  )
  const baseLogo = isChristmasTheme ? chattyChristmas : chattyLogo
  const inactivityBase = isChristmasTheme ? '/assets/logo/christmas/inactivityAnimations_Christmas' : '/assets/logo'
  const ext = isChristmasTheme ? '_Christmas.svg' : '.png'
  const letterConfigs = useMemo(
    () => [
      {
        frames: [
          baseLogo,
          `${inactivityBase}/'C'hatty${ext}`,
          `${inactivityBase}/'C'hatty_1${ext}`,
          `${inactivityBase}/'C'hatty${ext}`,
          `${inactivityBase}/'C'hatty_2${ext}`,
          `${inactivityBase}/'C'hatty_1${ext}`,
          `${inactivityBase}/'C'hatty${ext}`,
          `${inactivityBase}/'C'hatty_2${ext}`,
          `${inactivityBase}/'C'hatty_1${ext}`,
          `${inactivityBase}/'C'hatty${ext}`,
          `${inactivityBase}/'C'hatty_2${ext}`,
          `${inactivityBase}/'C'hatty${ext}`,
          baseLogo
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          baseLogo,
          `${inactivityBase}/c'H'atty${ext}`,
          `${inactivityBase}/c'H'atty_1${ext}`,
          `${inactivityBase}/c'H'atty${ext}`,
          `${inactivityBase}/c'H'atty_2${ext}`,
          `${inactivityBase}/c'H'atty_1${ext}`,
          `${inactivityBase}/c'H'atty${ext}`,
          `${inactivityBase}/c'H'atty_2${ext}`,
          `${inactivityBase}/c'H'atty_1${ext}`,
          `${inactivityBase}/c'H'atty${ext}`,
          `${inactivityBase}/c'H'atty_2${ext}`,
          `${inactivityBase}/c'H'atty${ext}`,
          baseLogo
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          baseLogo,
          `${inactivityBase}/ch'A'tty${ext}`,
          `${inactivityBase}/ch'A'tty_1${ext}`,
          `${inactivityBase}/ch'A'tty${ext}`,
          `${inactivityBase}/ch'A'tty_2${ext}`,
          `${inactivityBase}/ch'A'tty_1${ext}`,
          `${inactivityBase}/ch'A'tty${ext}`,
          `${inactivityBase}/ch'A'tty_2${ext}`,
          `${inactivityBase}/ch'A'tty_1${ext}`,
          `${inactivityBase}/ch'A'tty${ext}`,
          `${inactivityBase}/ch'A'tty_2${ext}`,
          `${inactivityBase}/ch'A'tty${ext}`,
          baseLogo
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          baseLogo,
          `${inactivityBase}/cha'T'ty${ext}`,
          `${inactivityBase}/cha'T'ty_1${ext}`,
          `${inactivityBase}/cha'T'ty${ext}`,
          `${inactivityBase}/cha'T'ty_2${ext}`,
          `${inactivityBase}/cha'T'ty_1${ext}`,
          `${inactivityBase}/cha'T'ty${ext}`,
          `${inactivityBase}/cha'T'ty_2${ext}`,
          `${inactivityBase}/cha'T'ty_1${ext}`,
          `${inactivityBase}/cha'T'ty${ext}`,
          `${inactivityBase}/cha'T'ty_2${ext}`,
          `${inactivityBase}/cha'T'ty${ext}`,
          baseLogo
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          baseLogo,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y${ext}` : `${inactivityBase}/Chat'T'y.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y_1${ext}` : `${inactivityBase}/chat'T'y_1.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y${ext}` : `${inactivityBase}/Chat'T'y.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y_2${ext}` : `${inactivityBase}/chat'T'y_2.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y_1${ext}` : `${inactivityBase}/chat'T'y_1.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y${ext}` : `${inactivityBase}/Chat'T'y.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y_2${ext}` : `${inactivityBase}/chat'T'y_2.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y_1${ext}` : `${inactivityBase}/chat'T'y_1.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y${ext}` : `${inactivityBase}/Chat'T'y.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y_2${ext}` : `${inactivityBase}/chat'T'y_2.png`,
          isChristmasTheme ? `${inactivityBase}/Chat'T'y${ext}` : `${inactivityBase}/Chat'T'y.png`,
          baseLogo
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          baseLogo,
          `${inactivityBase}/Chatt'Y'${ext}`,
          `${inactivityBase}/Chatt'Y'_1${ext}`,
          `${inactivityBase}/Chatt'Y'${ext}`,
          `${inactivityBase}/Chatt'Y'_2${ext}`,
          `${inactivityBase}/Chatt'Y'_1${ext}`,
          `${inactivityBase}/Chatt'Y'${ext}`,
          `${inactivityBase}/Chatt'Y'_2${ext}`,
          `${inactivityBase}/Chatt'Y'_1${ext}`,
          `${inactivityBase}/Chatt'Y'${ext}`,
          `${inactivityBase}/Chatt'Y'_2${ext}`,
          `${inactivityBase}/Chatt'Y'${ext}`,
          baseLogo
        ],
        holdMs: 1000,
        stepMs: 80
      }
    ],
    [isChristmasTheme, baseLogo, inactivityBase, ext]
  )
  const letterScheduleMs = useMemo(
    () => [60000, 120000, 180000, 240000, 300000, 360000],
    []
  )
  const [logoSrc, setLogoSrc] = useState(primaryHoverFrames[0])
  
  // Update logo when Christmas theme changes
  useEffect(() => {
    setLogoSrc(primaryHoverFrames[0])
  }, [isChristmasTheme, primaryHoverFrames])
  
  const logoTimerRef = useRef<number | null>(null)
  const inactivityTimerRef = useRef<number | null>(null)
  const inactivityStartTimeRef = useRef<number | null>(null)
  const lastTriggeredLetterRef = useRef(-1)
  const hoverFrameRef = useRef(0)
  const hoverLockedRef = useRef(false)
  const isHoveringRef = useRef(false)
  const resetInactivityTimerRef = useRef<(() => void) | null>(null)
  const findPendingLetterIndex = (
    elapsedMs: number,
    lastIndex: number,
    schedule: number[]
  ) => {
    for (let i = lastIndex + 1; i < schedule.length; i++) {
      if (elapsedMs >= schedule[i]) return i
    }
    return -1
  }

  useEffect(() => {
    // Fetch user for personalized greeting
    fetchMe().then(u => {
      if (u) {
        setUser(u)
        setGreeting(generateSynthGreeting(u.name || 'there'))
      } else {
        setGreeting(generateSynthGreeting())
      }
    })
  }, [])

  useEffect(() => {
    return () => {
      if (logoTimerRef.current) clearTimeout(logoTimerRef.current)
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const scheduleCheck = (delayMs: number) => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = window.setTimeout(runLetterCheck, delayMs)
    }

    const resetCycle = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      inactivityStartTimeRef.current = Date.now()
      lastTriggeredLetterRef.current = -1
      scheduleCheck(letterScheduleMs[0])
    }

    const runLetterCheck = () => {
      if (!inactivityStartTimeRef.current) {
        resetCycle()
        return
      }
      const now = Date.now()
      const elapsed = now - inactivityStartTimeRef.current

      const nextLetterIndex =
        findPendingLetterIndex(elapsed, lastTriggeredLetterRef.current, letterScheduleMs)

      if (nextLetterIndex === -1) {
        const upcomingIndex = lastTriggeredLetterRef.current + 1
        const nextThreshold = letterScheduleMs[upcomingIndex] ?? letterScheduleMs[0]
        const delay = Math.max(nextThreshold - elapsed, 0)
        scheduleCheck(delay)
        return
      }

      if (isHoveringRef.current) {
        scheduleCheck(1000)
        return
      }

      const config = letterConfigs[nextLetterIndex]
      if (!config) {
        scheduleCheck(letterScheduleMs[0])
        return
      }

      hoverLockedRef.current = true
      runFrameSequence(config.frames, () => {
        hoverLockedRef.current = false
        lastTriggeredLetterRef.current = nextLetterIndex

        if (nextLetterIndex === letterConfigs.length - 1) {
          inactivityStartTimeRef.current = Date.now()
          lastTriggeredLetterRef.current = -1
          scheduleCheck(letterScheduleMs[0])
        } else {
          const nextThreshold = letterScheduleMs[nextLetterIndex + 1]
          const newElapsed = Date.now() - (inactivityStartTimeRef.current ?? Date.now())
          const delay = Math.max(nextThreshold - newElapsed, 0)
          scheduleCheck(delay)
        }
      }, config.holdMs, config.stepMs)
    }

    resetInactivityTimerRef.current = resetCycle
    resetCycle()

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    }
  }, [letterConfigs, letterScheduleMs])

  useEffect(() => {
    let activityTimeout: number | null = null
    const handleActivity = () => {
      if (activityTimeout) return
      activityTimeout = window.setTimeout(() => {
        resetInactivityTimerRef.current?.()
        activityTimeout = null
      }, 1000)
    }
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click']
    events.forEach(evt => window.addEventListener(evt, handleActivity))
    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleActivity))
      if (activityTimeout) clearTimeout(activityTimeout)
    }
  }, [])

  const runFrameSequence = (
    frames: string[],
    onComplete?: () => void,
    holdFirstMs = 1000,
    stepMs = 80
  ) => {
    hoverFrameRef.current = 0
    const advance = (delay: number) => {
      logoTimerRef.current = window.setTimeout(() => {
        hoverFrameRef.current += 1
        const nextIndex = Math.min(hoverFrameRef.current, frames.length - 1)
        setLogoSrc(frames[nextIndex])
        if (nextIndex === frames.length - 1) {
          if (logoTimerRef.current) {
            clearTimeout(logoTimerRef.current)
            logoTimerRef.current = null
          }
          onComplete?.()
          return
        }
        const nextDelay = hoverFrameRef.current === 1 ? holdFirstMs : stepMs
        advance(nextDelay)
      }, delay)
    }
    setLogoSrc(frames[0])
    advance(holdFirstMs)
  }

  const startLogoCycle = () => {
    isHoveringRef.current = true
    if (logoTimerRef.current || hoverLockedRef.current) return
    hoverLockedRef.current = true
    runFrameSequence(primaryHoverFrames, () => {
      hoverLockedRef.current = false
    }, 80, 80)
  }

  const stopLogoCycle = () => {
    if (logoTimerRef.current) {
      clearTimeout(logoTimerRef.current)
      logoTimerRef.current = null
    }
    hoverLockedRef.current = false
    hoverFrameRef.current = 0
    setLogoSrc(primaryHoverFrames[0])
    isHoveringRef.current = false
  }

  const dispatchPrompt = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    
    // Find the zen-001 canonical thread
    const zenThread = threads.find(t => 
      t.id === DEFAULT_ZEN_CANONICAL_SESSION_ID || 
      (t.constructId === 'zen-001' && t.isPrimary)
    )
    
    if (zenThread) {
      // Navigate to zen-001 thread and send message
      navigate(`/app/chat/${DEFAULT_ZEN_CANONICAL_SESSION_ID}`)
      // Small delay to ensure navigation completes before sending
      setTimeout(() => {
        sendMessage(DEFAULT_ZEN_CANONICAL_SESSION_ID, trimmed, [])
      }, 100)
    } else {
      // Fallback: create new thread if zen thread doesn't exist yet
    newThread()
    setTimeout(() => {
      sendMessage('', trimmed, [])
    }, 100)
    }
    
    setInputValue('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    dispatchPrompt(inputValue)
  }

  // Time-aware suggestions
  const [suggestedPrompts, setSuggestedPrompts] = useState([
    { emoji: '🧠', text: 'Need a late-night brainstorm?' },
    { emoji: '🌙', text: "Let's explore an idea together." },
    { emoji: '🎨', text: 'Compose a creative concept.' },
    { emoji: '🎧', text: 'Compose a short synthwave track description.' }
  ])

  // Load time-aware suggestions
  useEffect(() => {
    const loadTimeAwareSuggestions = async () => {
      try {
        const { getTimeContext } = await import('../lib/timeAwareness');
        const timeContext = await getTimeContext();
        
        const hour = timeContext.hour;
        const isWeekend = timeContext.isWeekend;
        
        let prompts: Array<{ emoji: string; text: string }> = [];
        
        // Morning suggestions (5 AM - 12 PM)
        if (hour >= 5 && hour < 12) {
          prompts = [
            { emoji: '☀️', text: 'Good morning! What should we build today?' },
            { emoji: '🚀', text: 'Start a new project idea.' },
            { emoji: '📝', text: 'Plan your day with me.' },
            { emoji: '💡', text: 'Brainstorm something creative.' }
          ];
        }
        // Afternoon suggestions (12 PM - 5 PM)
        else if (hour >= 12 && hour < 17) {
          prompts = [
            { emoji: '🌤️', text: 'Afternoon session - what are you working on?' },
            { emoji: '🔧', text: 'Debug or optimize something.' },
            { emoji: '📚', text: 'Learn something new together.' },
            { emoji: '🎯', text: 'Focus on a specific goal.' }
          ];
        }
        // Evening suggestions (5 PM - 9 PM)
        else if (hour >= 17 && hour < 21) {
          prompts = [
            { emoji: '🌆', text: 'Evening wind-down - what\'s on your mind?' },
            { emoji: '🎨', text: 'Create something artistic.' },
            { emoji: '📖', text: 'Explore a topic deeply.' },
            { emoji: '💭', text: 'Reflect on the day.' }
          ];
        }
        // Night suggestions (9 PM - 5 AM)
        else {
          prompts = [
            { emoji: '🌙', text: 'Late night session - what are you thinking about?' },
            { emoji: '🧠', text: 'Deep dive into an idea.' },
            { emoji: '🎧', text: 'Compose a short synthwave track description.' },
            { emoji: '✨', text: 'Explore something creative.' }
          ];
        }
        
        // Weekend adjustments
        if (isWeekend) {
          prompts = prompts.map(p => ({
            ...p,
            text: p.text.replace(/today|day/, 'this weekend')
          }));
        }
        
        setSuggestedPrompts(prompts);
      } catch (error) {
        console.warn('Failed to load time-aware suggestions:', error);
        // Keep default suggestions on error
      }
    };
    
    loadTimeAwareSuggestions();
  }, [])

  const isCollapsedFrame = logoSrc.includes('chatty_collapsed')
  const isCycleFrame =
    logoSrc.includes("'C'") ||
    logoSrc.includes("'H'") ||
    logoSrc.includes("c'H'") ||
    logoSrc.includes("ch'A'") ||
    logoSrc.includes("cha'T'") ||
    logoSrc.includes("chat'T'") ||
    logoSrc.includes("chatt'Y'")
  const isBaseLogo = !isCollapsedFrame && !isCycleFrame && logoSrc.endsWith('Chatty.png')
  const logoClassName = 'chatty-logo w-auto object-contain'

  return (
    <div className="flex flex-col h-full items-center justify-center p-8 gap-0" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      {/* Large CHATTY Logo */}
      <div
        className="flex items-center justify-center"
        style={{ height: '26rem' }}
        onMouseEnter={startLogoCycle}
        onMouseLeave={stopLogoCycle}
      >
        <img 
          src={logoSrc} 
          alt="CHATTY" 
          className={`${logoClassName} transition-transform duration-200`}
          style={{
            transform: isCollapsedFrame
              ? 'scale(0.5)'
              : isCycleFrame
              ? 'scale(0.525)'
              : isBaseLogo
              ? 'scale(0.5) translateY(25px)'
              : 'scale(0.5)',
            height: '100%'
          }}
        />
      </div>

      {/* Personalized Greeting */}
      {greeting && (
        <p 
          className="text-xl mb-4 mt-2"
          style={{ color: 'var(--chatty-text)', opacity: 0.9 }}
        >
          {greeting}
        </p>
      )}

      {/* Ask Chatty Input Field */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-6">
        <div 
          className="flex items-center gap-2 px-4 py-3 rounded-xl transition-all"
          style={{
            backgroundColor: 'var(--chatty-bg-message)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
        >
          <Plus 
            size={20} 
            style={{ color: 'var(--chatty-text)', opacity: 0.6 }} 
            className="flex-shrink-0"
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask Chatty 🤓"
            className="flex-1 bg-transparent outline-none text-lg chatty-placeholder"
            style={{ color: 'var(--chatty-text)' }}
          />
          <button
            type="button"
            className="p-2 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--chatty-text)', opacity: 0.7 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
              e.currentTarget.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.opacity = '0.7'
            }}
            title="Voice input"
          >
            <Mic size={20} />
          </button>
        </div>
      </form>

      {/* Suggested Prompts */}
      <div className="w-full max-w-2xl space-y-2">
        {suggestedPrompts.map((prompt, index) => (
          <button
            key={index}
            onClick={() => dispatchPrompt(prompt.text)}
            className="flex items-center gap-3 w-full text-left px-1 py-2 rounded-md transition-colors"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Layers size={18} />
            <span className="text-lg">{prompt.emoji}</span>
            <span className="text-sm md:text-base">{prompt.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function generateSynthGreeting(name?: string) {
  const now = new Date()
  const hour = now.getHours()
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
  const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const isWeekend = dayName === 'Saturday' || dayName === 'Sunday'
  const nameSegment = name ? `, ${name}` : ''
  const weekendPhrase = isWeekend ? 'weekend' : 'end of the week'

  let intro = 'Good day'
  let flourishes: string[] = []

  if (hour < 5) {
    intro = `Late night${nameSegment}`
    flourishes = [
      `— it's ${timeString} on this ${weekendPhrase}.`,
      `— on this quiet ${weekendPhrase}.`
    ]
  } else if (hour < 12) {
    intro = `Good morning${nameSegment}`
    flourishes = [
      `— ${dayName} is ready for you.`,
      `— ${timeString} feels like a fresh start.`
    ]
  } else if (hour < 17) {
    intro = `Good afternoon${nameSegment}`
    flourishes = [
      `— let's keep ${dayName} moving.`,
      `— ${timeString} check-ins keep momentum.` 
    ]
  } else if (hour < 22) {
    intro = `Good evening${nameSegment}`
    flourishes = [
      `— ${timeString} is a nice pause.`,
      `— ${dayName} has room for one more idea.`
    ]
  } else {
    intro = `Late night${nameSegment}`
    flourishes = [
      `— it's ${timeString} on this ${weekendPhrase}.`,
      `— ${dayName} is winding down with you.`
    ]
  }

  const flourish = flourishes[Math.floor(Math.random() * flourishes.length)]
  return `${intro} ${flourish}`.trim()
}
