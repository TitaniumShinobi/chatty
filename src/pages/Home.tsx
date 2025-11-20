import { useState, useEffect, useMemo, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchMe, type User } from '../lib/auth'
import { Layers, Mic, Plus } from 'lucide-react'

interface LayoutContext {
  threads: any[]
  sendMessage: (threadId: string, text: string, files: File[]) => void
  renameThread: (threadId: string, title: string) => void
  newThread: () => void
}

export default function Home() {
  const { newThread, sendMessage } = useOutletContext<LayoutContext>()
  const [user, setUser] = useState<User | null>(null)
  const [greeting, setGreeting] = useState('')
  const [inputValue, setInputValue] = useState('')
  const INACTIVITY_DELAY_MS = 60000
  const primaryHoverFrames = useMemo(
    () => [
      '/assets/logo/Chatty.png',
      '/assets/logo/chatty_collapsed_1.png',
      '/assets/logo/chatty_collapsed_2.png',
      '/assets/logo/chatty_collapsed_3.png',
      '/assets/logo/chatty_collapsed_4.png',
      '/assets/logo/chatty_collapsed.png',
      '/assets/logo/Chatty.png'
    ],
    []
  )
  const letterConfigs = useMemo(
    () => [
      {
        frames: [
          '/assets/logo/Chatty.png',
          "/assets/logo/'C'hatty.png",
          "/assets/logo/'C'hatty_1.png",
          "/assets/logo/'C'hatty.png",
          "/assets/logo/'C'hatty_2.png",
          "/assets/logo/'C'hatty_1.png",
          "/assets/logo/'C'hatty.png",
          "/assets/logo/'C'hatty_2.png",
          "/assets/logo/'C'hatty_1.png",
          "/assets/logo/'C'hatty.png",
          "/assets/logo/'C'hatty_2.png",
          "/assets/logo/'C'hatty.png",
          '/assets/logo/Chatty.png'
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          '/assets/logo/Chatty.png',
          "/assets/logo/c'H'atty.png",
          "/assets/logo/c'H'atty_1.png",
          "/assets/logo/c'H'atty.png",
          "/assets/logo/c'H'atty_2.png",
          "/assets/logo/c'H'atty_1.png",
          "/assets/logo/c'H'atty.png",
          "/assets/logo/c'H'atty_2.png",
          "/assets/logo/c'H'atty_1.png",
          "/assets/logo/c'H'atty.png",
          "/assets/logo/c'H'atty_2.png",
          "/assets/logo/c'H'atty.png",
          '/assets/logo/Chatty.png'
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          '/assets/logo/Chatty.png',
          "/assets/logo/ch'A'tty.png",
          "/assets/logo/ch'A'tty_1.png",
          "/assets/logo/ch'A'tty.png",
          "/assets/logo/ch'A'tty_2.png",
          "/assets/logo/ch'A'tty_1.png",
          "/assets/logo/ch'A'tty.png",
          "/assets/logo/ch'A'tty_2.png",
          "/assets/logo/ch'A'tty_1.png",
          "/assets/logo/ch'A'tty.png",
          "/assets/logo/ch'A'tty_2.png",
          "/assets/logo/ch'A'tty.png",
          '/assets/logo/Chatty.png'
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          '/assets/logo/Chatty.png',
          "/assets/logo/cha'T'ty.png",
          "/assets/logo/cha'T'ty_1.png",
          "/assets/logo/cha'T'ty.png",
          "/assets/logo/cha'T'ty_2.png",
          "/assets/logo/cha'T'ty_1.png",
          "/assets/logo/cha'T'ty.png",
          "/assets/logo/cha'T'ty_2.png",
          "/assets/logo/cha'T'ty_1.png",
          "/assets/logo/cha'T'ty.png",
          "/assets/logo/cha'T'ty_2.png",
          "/assets/logo/cha'T'ty.png",
          '/assets/logo/Chatty.png'
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          '/assets/logo/Chatty.png',
          "/assets/logo/chat'T'y.png",
          "/assets/logo/chat'T'y_1.png",
          "/assets/logo/chat'T'y.png",
          "/assets/logo/chat'T'y_2.png",
          "/assets/logo/chat'T'y_1.png",
          "/assets/logo/chat'T'y.png",
          "/assets/logo/chat'T'y_2.png",
          "/assets/logo/chat'T'y_1.png",
          "/assets/logo/chat'T'y.png",
          "/assets/logo/chat'T'y_2.png",
          "/assets/logo/chat'T'y.png",
          '/assets/logo/Chatty.png'
        ],
        holdMs: 1000,
        stepMs: 80
      },
      {
        frames: [
          '/assets/logo/Chatty.png',
          "/assets/logo/chatt'Y'.png",
          "/assets/logo/chatt'Y'_1.png",
          "/assets/logo/chatt'Y'.png",
          "/assets/logo/chatt'Y'_2.png",
          "/assets/logo/chatt'Y'_1.png",
          "/assets/logo/chatt'Y'.png",
          "/assets/logo/chatt'Y'_2.png",
          "/assets/logo/chatt'Y'_1.png",
          "/assets/logo/chatt'Y'.png",
          "/assets/logo/chatt'Y'_2.png",
          "/assets/logo/chatt'Y'.png",
          '/assets/logo/Chatty.png'
        ],
        holdMs: 1000,
        stepMs: 80
      }
    ],
    []
  )
  const letterScheduleMs = useMemo(
    () => [60000, 120000, 180000, 240000, 300000, 360000],
    []
  )
  const [logoSrc, setLogoSrc] = useState(primaryHoverFrames[0])
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
    newThread()
    setTimeout(() => {
      sendMessage('', trimmed, [])
    }, 100)
    setInputValue('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    dispatchPrompt(inputValue)
  }

  const suggestedPrompts = [
    { emoji: '🧠', text: 'Need a late-night brainstorm?' },
    { emoji: '🌙', text: "Let's explore an idea together." },
    { emoji: '🎨', text: 'Compose a creative concept.' },
    { emoji: '🎧', text: 'Compose a short synthwave track description.' }
  ]

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
