import React, { useState } from 'react'
import { Search, X, Calendar } from 'lucide-react'
import { Z_LAYERS } from '../lib/zLayers'

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
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.35)', zIndex: Z_LAYERS.modal }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#2F2510' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <Search className="w-5 h-5 flex-shrink-0" style={{ color: '#ADA587' }} />
          <input
            type="text"
            placeholder="Search conversations... (use quotes for exact phrases)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#F5F0E1' }}
          />
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors flex-shrink-0"
            style={{ color: '#ADA587' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#F5F0E1')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#ADA587')}
            aria-label="Close search"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-6 py-10">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center">
              <Search className="w-10 h-10 mb-4" style={{ color: '#ADA587', opacity: 0.6 }} />
              <p className="text-sm mb-1" style={{ color: '#F5F0E1', opacity: 0.8 }}>
                {searchQuery ? 'No results found' : 'Start typing to search your conversations'}
              </p>
              <p className="text-xs" style={{ color: '#ADA587', opacity: 0.7 }}>
                Use quotes for exact phrase matching
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg cursor-pointer transition-colors"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                  onClick={() => {
                    if (onSelectConversation && result.id) {
                      onSelectConversation(result.id)
                      onClose()
                    }
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4" style={{ color: '#ADA587', opacity: 0.6 }} />
                    <span className="text-xs" style={{ color: '#ADA587' }}>{result.date}</span>
                  </div>
                  <p className="text-sm" style={{ color: '#F5F0E1' }}>{result.preview}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
