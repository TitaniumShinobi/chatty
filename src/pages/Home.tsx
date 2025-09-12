import React, { useState, useEffect } from 'react'
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

  const handleSuggestionClick = (suggestion: string) => {
    // Create a new thread and navigate to it
    newThread()
    // The thread will be created and we'll navigate to it
    // The actual message sending will be handled by the chat interface
  }

  const handleRefreshStarters = () => {
    setStarters(getRandomStarters(4))
  }

  return (
    <div style={styles.container}>
      <div style={styles.welcome}>
        <h1 style={styles.title}>Welcome to Chatty</h1>
        <p style={styles.subtitle}>Your AI assistant is ready. Ask anything!</p>
        
        <div style={styles.suggestionsContainer}>
          <div style={styles.suggestionsHeader}>
            <span style={styles.suggestionsTitle}>Try asking:</span>
            <button
              className="refresh-button"
              style={styles.refreshButton}
              onClick={handleRefreshStarters}
              title="Get new suggestions"
            >
              ↻
            </button>
          </div>
          <div style={styles.suggestions}>
            {starters.map((starter, index) => (
              <button
                key={index}
                className="suggestion-card"
                style={styles.suggestionCard}
                onClick={() => handleSuggestionClick(starter)}
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden'
  },
  welcome: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '2rem',
    textAlign: 'center'
  },
  title: {
    margin: 0,
    fontSize: '2rem',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '0.5rem'
  },
  subtitle: {
    margin: 0,
    fontSize: '1rem',
    color: '#8e8ea0',
    marginBottom: '2rem'
  },
  suggestionsContainer: {
    maxWidth: '600px',
    width: '100%'
  },
  suggestionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  suggestionsTitle: {
    fontSize: '0.875rem',
    color: '#8e8ea0',
    fontWeight: 500
  },
  refreshButton: {
    background: 'none',
    border: '1px solid #2f3036',
    borderRadius: '0.375rem',
    color: '#8e8ea0',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.375rem 0.5rem',
    transition: 'all 0.2s ease',
    outline: 'none'
  },
  suggestions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
    gap: '0.75rem'
  },
  suggestionCard: {
    padding: '1rem',
    borderRadius: '0.5rem',
    border: '1px solid #2f3036',
    background: '#23242a',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    transition: 'all 0.2s ease',
    outline: 'none'
  }
}

// Add hover effects via CSS-in-JS
const hoverStyles = `
  .suggestion-card:hover {
    background: #2a2b32 !important;
    border-color: #40414f !important;
  }
  .refresh-button:hover {
    background: #2a2b32 !important;
    border-color: #40414f !important;
    color: #fff !important;
  }
`

// Inject hover styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style')
  styleElement.textContent = hoverStyles
  document.head.appendChild(styleElement)
}
