import React, { useState } from 'react'
import { Search, MessageSquare, Calendar } from 'lucide-react'

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<any[]>([])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      <div className="p-6 border-b" style={{ borderColor: 'var(--chatty-line)' }}>
        <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--chatty-text)' }}>
          Search Chats
        </h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 opacity-50" style={{ color: 'var(--chatty-text)' }} />
          <input
            type="text"
            placeholder="Search your conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--chatty-bg-sidebar)',
              color: 'var(--chatty-text)',
              borderColor: 'var(--chatty-line)'
            }}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50">
            <MessageSquare className="w-16 h-16 mb-4" style={{ color: 'var(--chatty-text)' }} />
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
  )
}
