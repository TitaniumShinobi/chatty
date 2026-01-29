import React, { useState, useEffect, useRef } from 'react'
import { Search, X, MessageSquare, Clock } from 'lucide-react'
import { Z_LAYERS } from '../lib/zLayers'

interface SearchResult {
  threadId: string
  threadTitle: string
  messageId: string
  messageText: string
  messageRole: 'user' | 'assistant'
  timestamp: number
  matchIndex: number
  matchLength: number
}

interface SearchPopupProps {
  isOpen: boolean
  onClose: () => void
  threads: Array<{
    id: string
    title: string
    messages: Array<{
      id: string
      role: 'user' | 'assistant'
      text?: string
      packets?: any[]
      ts: number
    }>
  }>
  onResultClick: (threadId: string, messageId: string) => void
}

export default function SearchPopup({ isOpen, onClose, threads, onResultClick }: SearchPopupProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when popup opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Search function
  const searchMessages = (searchQuery: string): SearchResult[] => {
    if (!searchQuery.trim()) return []

    const searchResults: SearchResult[] = []
    const normalizedQuery = searchQuery.toLowerCase()

    // Handle quoted phrases
    const quotedMatches = searchQuery.match(/"([^"]+)"/g)
    const quotedPhrases = quotedMatches ? quotedMatches.map(match => match.slice(1, -1).toLowerCase()) : []
    const remainingQuery = searchQuery.replace(/"([^"]+)"/g, '').trim().toLowerCase()

    threads.forEach(thread => {
      thread.messages.forEach(message => {
        let messageText = ''
        
        // Extract text from message
        if (message.text) {
          messageText = message.text
        } else if (message.packets) {
          // Extract text from packets
          messageText = message.packets
            .filter(packet => packet.op === 'answer.v1' && packet.payload?.content)
            .map(packet => packet.payload.content)
            .join(' ')
        }

        if (!messageText) return

        const normalizedText = messageText.toLowerCase()
        let hasMatch = false
        let matchIndex = -1
        let matchLength = 0

        // Check quoted phrases first
        if (quotedPhrases.length > 0) {
          for (const phrase of quotedPhrases) {
            const index = normalizedText.indexOf(phrase)
            if (index !== -1) {
              hasMatch = true
              matchIndex = index
              matchLength = phrase.length
              break
            }
          }
        }

        // Check remaining query terms
        if (!hasMatch && remainingQuery) {
          const terms = remainingQuery.split(/\s+/).filter(term => term.length > 0)
          for (const term of terms) {
            const index = normalizedText.indexOf(term)
            if (index !== -1) {
              hasMatch = true
              matchIndex = index
              matchLength = term.length
              break
            }
          }
        }

        if (hasMatch) {
          searchResults.push({
            threadId: thread.id,
            threadTitle: thread.title,
            messageId: message.id,
            messageText,
            messageRole: message.role,
            timestamp: message.ts,
            matchIndex,
            matchLength
          })
        }
      })
    })

    // Sort by timestamp (newest first)
    return searchResults.sort((a, b) => b.timestamp - a.timestamp)
  }

  // Update results when query changes
  useEffect(() => {
    const searchResults = searchMessages(query)
    setResults(searchResults)
    setSelectedIndex(0)
  }, [query, threads])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      const selectedResult = results[selectedIndex]
      onResultClick(selectedResult.threadId, selectedResult.messageId)
      onClose()
    }
  }

  // Highlight matching text
  const highlightText = (text: string, matchIndex: number, matchLength: number) => {
    if (matchIndex === -1) return text
    
    const before = text.slice(0, matchIndex)
    const match = text.slice(matchIndex, matchIndex + matchLength)
    const after = text.slice(matchIndex + matchLength)
    
    return (
      <>
        {before}
        <mark style={{ backgroundColor: '#feffaf', color: 'var(--chatty-text)' }}>{match}</mark>
        {after}
      </>
    )
  }

  // Format timestamp
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 flex items-start justify-center pt-20"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', zIndex: Z_LAYERS.modal }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl mx-4 rounded-lg shadow-xl"
        style={{ backgroundColor: 'var(--chatty-bg-main)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center p-4">
          <Search size={20} style={{ color: 'var(--chatty-text)', marginRight: 12 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search conversations... (use quotes for exact phrases)"
            className="flex-1 bg-transparent outline-none text-sm placeholder:[color:var(--chatty-button)] placeholder-opacity-70"
            style={{ color: 'var(--chatty-text)' }}
          />
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors hover:bg-[#feffaf]"
            style={{ color: 'var(--chatty-text)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Results */}
        <div className="max-h-96 overflow-y-auto message-area-scrollable">
          {query.trim() === '' ? (
            <div className="p-8 text-center" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              <Search size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Start typing to search your conversations</p>
              <p className="text-xs mt-1 opacity-75">Use quotes for exact phrase matching</p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              <MessageSquare size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">No results found for "{query}"</p>
            </div>
          ) : (
            <div className="py-2">
              {results.map((result, index) => (
                <button
                  key={`${result.threadId}-${result.messageId}`}
                  onClick={() => {
                    onResultClick(result.threadId, result.messageId)
                    onClose()
                  }}
                  className="w-full text-left p-4 rounded-md transition-colors hover:bg-[#feffaf]"
                  style={{
                    backgroundColor: index === selectedIndex ? '#feffaf' : 'transparent'
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {result.messageRole === 'user' ? (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ backgroundColor: 'var(--chatty-button)', color: 'var(--chatty-text)' }}>
                          U
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ backgroundColor: '#3A2E14', color: '#fffff0' }}>
                          AI
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--chatty-text)' }}>
                          {result.threadTitle}
                        </span>
                        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                          <Clock size={12} />
                          {formatTimestamp(result.timestamp)}
                        </div>
                      </div>
                      
                      <div className="text-sm leading-relaxed" style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>
                        {highlightText(result.messageText, result.matchIndex, result.matchLength)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t text-xs" style={{ borderColor: 'var(--chatty-line)', color: 'var(--chatty-text)', opacity: 0.6 }}>
            {results.length} result{results.length !== 1 ? 's' : ''} • Use ↑↓ to navigate • Enter to select • Esc to close
          </div>
        )}
      </div>
    </div>
  )
}
