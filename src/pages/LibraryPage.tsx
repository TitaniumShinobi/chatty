import React, { useMemo, useState, useEffect } from 'react'
import { Image, Video, FileText, Download, Trash2, Search, Filter } from 'lucide-react'
import { Z_LAYERS } from '../lib/zLayers'
import { useTheme } from '../lib/ThemeContext'

interface MediaItem {
  id: string
  type: 'image' | 'video' | 'document'
  title: string
  url: string
  thumbnail?: string
  size: number
  createdAt: number
  conversationId?: string
  conversationTitle?: string
}

export default function LibraryPage() {
  const { actualTheme } = useTheme()
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'document'>('all')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  // Load media files from VVAULT
  useEffect(() => {
    const loadMedia = async () => {
      try {
        setIsLoading(true)
        
        // Wait for backend to be ready
        const { waitForBackendReady } = await import('../lib/backendReady');
        try {
          await waitForBackendReady(5);
        } catch (error) {
          console.warn('⚠️ Backend readiness check failed, continuing anyway:', error);
        }
        
        const response = await fetch('/api/library/media', {
          credentials: 'include'
        })
        
        if (!response.ok) {
          throw new Error('Failed to load media files')
        }
        
        const data = await response.json()
        if (data.ok && data.media) {
          // Map API response to MediaItem format
          const mappedMedia: MediaItem[] = data.media.map((item: any) => ({
            id: item.id,
            type: item.type === 'audio' ? 'document' : item.type, // Map audio to document for UI
            title: item.title,
            url: item.url,
            size: item.size,
            createdAt: item.createdAt,
            conversationTitle: item.conversationTitle
          }))
          
          setMediaItems(mappedMedia)
          console.log(`✅ Loaded ${mappedMedia.length} media files`)
        }
      } catch (error) {
        console.error('❌ Failed to load media files:', error)
        setMediaItems([])
      } finally {
        setIsLoading(false)
      }
    }
    
    loadMedia()
  }, [])

  // Filter and search media items
  const filteredItems = mediaItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.conversationTitle?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterType === 'all' || item.type === filterType
    return matchesSearch && matchesFilter
  })

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString([], { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Handle item selection
  const toggleSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }

  // Handle download
  const handleDownload = (item: MediaItem) => {
    const link = document.createElement('a')
    link.href = item.url
    link.download = item.title
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Handle delete
  const handleDelete = (itemId: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      setMediaItems(prev => prev.filter(item => item.id !== itemId))
      setSelectedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }
  }

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedItems.size === 0) return
    if (window.confirm(`Are you sure you want to delete ${selectedItems.size} item(s)?`)) {
      setMediaItems(prev => prev.filter(item => !selectedItems.has(item.id)))
      setSelectedItems(new Set())
    }
  }

  const emptyStateIconColor = useMemo(() => actualTheme === 'night' ? '#ffffeb' : '#3A2E14', [actualTheme])

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      {/* Header */}
      <div className="p-6 border-b" style={{ borderColor: 'var(--chatty-line)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)' }}>
              Library
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              All media generated by Chatty models
            </p>
          </div>
          
          {selectedItems.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ 
                backgroundColor: 'var(--chatty-button)', 
                color: 'var(--chatty-text)' 
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ADA587'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ADA587'}
            >
              <Trash2 size={16} />
              Delete ({selectedItems.size})
            </button>
          )}
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: '#ffffeb', opacity: 0.75 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search media..."
              className="library-search-input w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
              style={{ 
                backgroundColor: 'var(--chatty-button)',
                borderColor: 'var(--chatty-line)',
                color: '#ffffeb'
              }}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter size={16} style={{ color: '#ffffeb', opacity: 0.75 }} />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ 
                backgroundColor: 'var(--chatty-button)',
                borderColor: 'var(--chatty-line)',
                color: '#ffffeb'
              }}
            >
              <option value="all">All Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="document">Documents</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {isLoading ? (
          // Loading state
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex items-center justify-center mb-6">
              <Image size={32} style={{ color: emptyStateIconColor, opacity: 0.6 }} className="animate-pulse" />
            </div>
            <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              Loading media files...
            </p>
          </div>
        ) : mediaItems.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="flex items-center justify-center mb-6">
            <Image size={32} style={{ color: emptyStateIconColor, opacity: 0.6 }} />
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
              No media yet
            </h3>
            <p className="text-sm max-w-md" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              Upload images or files in conversations, or import a ChatGPT export to see media here.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          // No search results
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Search size={48} style={{ color: emptyStateIconColor, opacity: 0.3 }} className="mb-4" />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
              No results found
            </h3>
            <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              Try adjusting your search or filter criteria.
            </p>
          </div>
        ) : (
          // Media grid
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`relative group rounded-lg border overflow-hidden transition-all cursor-pointer ${
                  selectedItems.has(item.id) ? 'ring-2' : ''
                }`}
                style={{ 
                  backgroundColor: 'var(--chatty-button)',
                  borderColor: selectedItems.has(item.id) ? '#3A2E14' : '#ADA587'
                }}
                onClick={() => toggleSelection(item.id)}
              >
                {/* Selection checkbox */}
                <div
                  className="absolute top-2 left-2"
                  style={{ zIndex: Z_LAYERS.popover }}
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleSelection(item.id)}
                    className="w-4 h-4 rounded border-2"
                    style={{ 
                      backgroundColor: selectedItems.has(item.id) ? '#3A2E14' : 'transparent',
                      borderColor: '#3A2E14'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Media preview */}
                <div
                  className="aspect-square flex items-center justify-center overflow-hidden rounded"
                  style={{ backgroundColor: 'var(--chatty-bg-main)' }}
                >
                  {item.type === 'image' ? (
                    <img 
                      src={item.url} 
                      alt={item.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to icon if image fails to load
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.innerHTML = '<div class="flex items-center justify-center w-full h-full"><svg class="w-8 h-8" style="color: var(--chatty-text); opacity: 0.5;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>';
                      }}
                    />
                  ) : item.type === 'video' ? (
                    <Video size={32} style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
                  ) : (
                    <FileText size={32} style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
                  )}
                </div>

                {/* Item info */}
                <div className="p-3">
                  <h4 className="text-sm font-medium truncate mb-1" style={{ color: 'var(--chatty-text)' }}>
                    {item.title}
                  </h4>
                  <p className="text-xs mb-2" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                    {formatFileSize(item.size)} • {formatDate(item.createdAt)}
                  </p>
                  {item.conversationTitle && (
                    <p className="text-xs truncate" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
                      From: {item.conversationTitle}
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownload(item)
                      }}
                      className="p-1 rounded shadow-sm"
                      style={{ 
                        backgroundColor: 'var(--chatty-surface)',
                        color: 'var(--chatty-text)' 
                      }}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(item.id)
                      }}
                      className="p-1 rounded shadow-sm"
                      style={{ 
                        backgroundColor: 'var(--chatty-surface)',
                        color: 'var(--chatty-text)' 
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
