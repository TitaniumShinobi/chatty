import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getRandomStarters } from '../lib/chatStarters'

interface LayoutContext {
  threads: any[]
  sendMessage: (threadId: string, text: string, files: File[]) => void
  renameThread: (threadId: string, title: string) => void
  newThread: () => void
}

export default function Home() {
  const { newThread } = useOutletContext<LayoutContext>()
  const [starters, setStarters] = useState<string[]>([])

  useEffect(() => {
    setStarters(getRandomStarters(4))
  }, [])

  const handleSuggestionClick = () => {
    // Create a new thread and navigate to it
    newThread()
    // The thread will be created and we'll navigate to it
    // The actual message sending will be handled by the chat interface
  }

  const handleRefreshStarters = () => {
    setStarters(getRandomStarters(4))
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#ffffeb' }}>
      <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
        <h1 className="text-3xl font-semibold mb-2" style={{ color: '#4c3d1e' }}>Welcome to Chatty</h1>
        <p className="mb-8" style={{ color: '#4c3d1e', opacity: 0.7 }}>Your AI assistant is ready. Ask anything!</p>
        
        <div className="max-w-2xl w-full">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium" style={{ color: '#4c3d1e', opacity: 0.6 }}>Try asking:</span>
            <button
              className="p-2 rounded-md transition-colors"
              style={{ color: '#4c3d1e' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fde047'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              onClick={handleRefreshStarters}
              title="Get new suggestions"
            >
              ↻
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {starters.map((starter, index) => (
              <button
                key={index}
                className="p-4 text-left text-sm rounded-lg transition-colors"
                style={{ 
                  color: '#4c3d1e',
                  backgroundColor: '#E1C28B',
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
                onClick={handleSuggestionClick}
              >
                {starter}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

