import React from 'react'
import { useOutletContext } from 'react-router-dom'

interface LayoutContext {
  threads: any[]
  sendMessage: (threadId: string, text: string, files: File[]) => void
  renameThread: (threadId: string, title: string) => void
  newThread: () => void
}

export default function Home() {
  const { newThread } = useOutletContext<LayoutContext>()

  const handleSuggestionClick = (suggestion: string) => {
    // Create a new thread and navigate to it
    newThread()
    // The thread will be created and we'll navigate to it
    // The actual message sending will be handled by the chat interface
  }

  const suggestions = [
    'Tell me about artificial intelligence',
    'Write a JavaScript function for me', 
    'Create a short story about technology',
    'Explain how machine learning works'
  ]

  return (
    <div style={styles.container}>
      <div style={styles.welcome}>
        <h1 style={styles.title}>Welcome to Chatty</h1>
        <p style={styles.subtitle}>Your AI assistant is ready. Ask anything!</p>
        
        <div style={styles.suggestions}>
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              style={styles.suggestionCard}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </button>
          ))}
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
  suggestions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
    gap: '0.75rem',
    maxWidth: '600px',
    width: '100%'
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
