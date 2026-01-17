import React, { useState } from 'react'
import { Search, MessageSquare, Calendar, X } from 'lucide-react'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectConversation?: (id: string) => void
}

export default function SearchModal({ isOpen, onClose, onSelectConversation }: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<any[]>([])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div 
        className="relative w-full max-w-2xl max-h-[80vh] rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--chatty-bg-main)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--chatty-line)' }}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--chatty-text)' }}>
            Search Chats
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-black/10"
            style={{ color: 'var(--chatty-text)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 opacity-50" style={{ color: 'var(--chatty-text)' }} />
            <input
              type="text"
              placeholder="Search your conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-lg outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--chatty-bg-sidebar)',
                color: 'var(--chatty-text)',
                borderColor: 'var(--chatty-line)'
              }}
            />
          </div>
        </div>
        
        <div className="max-h-[50vh] overflow-y-auto px-6 pb-6">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 opacity-50">
              <MessageSquare className="w-12 h-12 mb-4" style={{ color: 'var(--chatty-text)' }} />
              <p style={{ color: 'var(--chatty-text)' }}>
                {searchQuery ? 'No results found' : 'Enter a search term to find conversations'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: 'var(--chatty-bg-sidebar)' }}
                  onClick={() => {
                    if (onSelectConversation && result.id) {
                      onSelectConversation(result.id)
                      onClose()
                    }
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 opacity-50" />
                    <span className="text-sm opacity-50">{result.date}</span>
                  </div>
                  <p style={{ color: 'var(--chatty-text)' }}>{result.preview}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
