import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchMe, type User } from '../lib/auth'
import { Mic, Plus } from 'lucide-react'

interface LayoutContext {
  threads: any[]
  sendMessage: (threadId: string, text: string, files: File[]) => void
  renameThread: (threadId: string, title: string) => void
  newThread: () => void
}

export default function Home() {
  const { newThread } = useOutletContext<LayoutContext>()
  const [user, setUser] = useState<User | null>(null)
  const [greeting, setGreeting] = useState('')
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    // Fetch user for personalized greeting
    fetchMe().then(u => {
      if (u) {
        setUser(u)
        // Generate time-based greeting
        const hour = new Date().getHours()
        let timeGreeting = 'Hey'
        if (hour < 12) timeGreeting = 'Good morning'
        else if (hour < 17) timeGreeting = 'Good afternoon'
        else timeGreeting = 'Good evening'
        
        setGreeting(`${timeGreeting}, ${u.name || 'there'}.`)
      }
    })
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      newThread()
      // The message will be sent when the thread is created
      setTimeout(() => {
        const { sendMessage } = useOutletContext<LayoutContext>()
        sendMessage('', inputValue.trim(), [])
      }, 100)
      setInputValue('')
    }
  }

  const suggestedPrompts = [
    { icon: '📄', text: 'Continue with Synth' },
    { icon: '🌙', text: 'Reflect on your day and plan tomorrow.' },
    { icon: '🎨', text: 'Create something creative together.' },
    { icon: '📚', text: 'Explain a concept you\'ve been curious about.' }
  ]

  return (
    <div className="flex flex-col h-full items-center justify-center p-8" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      {/* Large CHATTY Logo */}
      <div className="mb-8">
        <img 
          src="/assets/Chatty.png" 
          alt="CHATTY" 
          className="chatty-logo w-auto h-32 md:h-40 object-contain"
        />
      </div>

      {/* Personalized Greeting */}
      {greeting && (
        <p 
          className="text-xl mb-8"
          style={{ color: 'var(--chatty-text)', opacity: 0.9 }}
        >
          {greeting}
        </p>
      )}

      {/* Ask Chatty Input Field */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-8">
        <div 
          className="flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all"
          style={{
            backgroundColor: 'var(--chatty-bg-message)',
            borderColor: 'var(--chatty-line)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--chatty-button)'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(173, 165, 135, 0.3)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--chatty-line)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)'
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
            placeholder="Ask Chatty"
            className="flex-1 bg-transparent outline-none text-lg chatty-placeholder"
            style={{ color: 'var(--chatty-text)' }}
          />
          <span className="text-xl">😎</span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
        {suggestedPrompts.map((prompt, index) => (
          <button
            key={index}
            onClick={() => {
              setInputValue(prompt.text)
              handleSubmit({ preventDefault: () => {} } as React.FormEvent)
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors"
            style={{
              backgroundColor: 'var(--chatty-bg-message)',
              border: `1px solid var(--chatty-line)`,
              color: 'var(--chatty-text)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
              e.currentTarget.style.borderColor = 'var(--chatty-button)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--chatty-bg-message)'
              e.currentTarget.style.borderColor = 'var(--chatty-line)'
            }}
          >
            <span className="text-2xl">{prompt.icon}</span>
            <span className="text-sm">{prompt.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
