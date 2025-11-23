import React, { useEffect, useMemo, useState } from 'react'
import {
  Image,
  Video,
  FileText,
  File as FileIcon,
  Music2,
  Download,
  Trash2,
  Search,
  Filter,
  LayoutGrid,
  List
} from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'

type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'file'

interface MediaItem {
  id: string
  type: MediaKind
  title: string
  url: string
  thumbnail?: string
  size: number
  createdAt: number
  conversationId?: string
  conversationTitle?: string
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i
const PDF_EXT = /\.pdf$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg)$/i

export default function LibraryPage() {
  const { actualTheme } = useTheme()
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'media' | 'pdf' | 'file'>('all')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const normalizeType = (rawType: string, title: string): MediaKind => {
    const lower = title.toLowerCase()
    if (rawType === 'image' || IMAGE_EXT.test(lower)) return 'image'
    if (rawType === 'video' || VIDEO_EXT.test(lower)) return 'video'
    if (rawType === 'audio' || AUDIO_EXT.test(lower)) return 'audio'
    if (rawType === 'document' && PDF_EXT.test(lower)) return 'pdf'
    if (PDF_EXT.test(lower)) return 'pdf'
    return 'file'
  }

  // Load media files (should point to user-space storage, not VVAULT core)
  useEffect(() => {
    const loadMedia = async () => {
      try {
        setIsLoading(true)
        const response = await fetch('/api/library/media', { credentials: 'include' })
        if (!response.ok) throw new Error('Failed to load media files')

        const data = await response.json()
        if (data.ok && data.media) {
          const mapped: MediaItem[] = data.media.map((item: any) => ({
            id: item.id,
            type: normalizeType(item.type, item.title),
            title: item.title,
            url: item.url,
            thumbnail: item.thumbnail,
            size: item.size,
            createdAt: item.createdAt,
            conversationTitle: item.conversationTitle
          }))
          setMediaItems(mapped)
        } else {
          setMediaItems([])
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

  const filteredItems = mediaItems.filter(item => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.conversationTitle?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'media' && (item.type === 'image' || item.type === 'video' || item.type === 'audio')) ||
      (filterType === 'pdf' && item.type === 'pdf') ||
      (filterType === 'file' && item.type !== 'image' && item.type !== 'pdf' && item.type !== 'video' && item.type !== 'audio')

    return matchesSearch && matchesFilter
  })

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

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

  const toggleSelection = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDownload = (item: MediaItem) => {
    const link = document.createElement('a')
    link.href = item.url
    link.download = item.title
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDelete = (itemId: string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return
    setMediaItems(prev => prev.filter(item => item.id !== itemId))
    setSelectedItems(prev => {
      const next = new Set(prev)
      next.delete(itemId)
      return next
    })
  }

  const handleBulkDelete = () => {
    if (selectedItems.size === 0) return
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.size} item(s)?`)) return
    setMediaItems(prev => prev.filter(item => !selectedItems.has(item.id)))
    setSelectedItems(new Set())
  }

  const emptyStateIconColor = useMemo(
    () => (actualTheme === 'night' ? '#ffffeb' : '#3A2E14'),
    [actualTheme]
  )

  const renderThumbnail = (item: MediaItem) => {
    if (item.type === 'image') {
      return (
        <div className="aspect-square rounded-lg overflow-hidden bg-black/5">
          <img src={item.thumbnail || item.url} alt={item.title} className="w-full h-full object-cover" />
        </div>
      )
    }
    if (item.type === 'pdf') {
      return (
        <div className="aspect-square rounded-lg flex items-center justify-center bg-black/5">
          <FileText size={28} style={{ color: 'var(--chatty-text)' }} />
        </div>
      )
    }
    if (item.type === 'video') {
      return (
        <div className="aspect-square rounded-lg flex items-center justify-center bg-black/5">
          <Video size={24} style={{ color: 'var(--chatty-text)' }} />
        </div>
      )
    }
    if (item.type === 'audio') {
      return (
        <div className="aspect-square rounded-lg flex items-center justify-center bg-black/5">
          <Music2 size={24} style={{ color: 'var(--chatty-text)' }} />
        </div>
      )
    }
    return (
      <div className="aspect-square rounded-lg flex items-center justify-center bg-black/5">
        <FileIcon size={24} style={{ color: 'var(--chatty-text)' }} />
      </div>
    )
  }

  const renderGridCard = (item: MediaItem) => (
    <div
      key={item.id}
      className="rounded-xl p-3 flex flex-col gap-3 cursor-pointer transition-transform hover:-translate-y-1"
      style={{ backgroundColor: 'var(--chatty-bg-message)' }}
      onClick={() => toggleSelection(item.id)}
    >
      <div className="flex justify-between items-start">
        {renderThumbnail(item)}
        <input
          type="checkbox"
          checked={selectedItems.has(item.id)}
          onChange={() => toggleSelection(item.id)}
          className="mt-1"
        />
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>{item.title}</div>
        <div className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
          {formatFileSize(item.size)} • {formatDate(item.createdAt)}
        </div>
        {item.conversationTitle && (
          <div className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
            {item.conversationTitle}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--chatty-text)' }}>
        <button onClick={(e) => { e.stopPropagation(); handleDownload(item) }} className="flex items-center gap-1 hover:underline">
          <Download size={14} /> Download
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }} className="flex items-center gap-1 hover:underline">
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  )

  const renderListRow = (item: MediaItem) => (
    <div
      key={item.id}
      className="grid items-center px-3 py-2 text-sm"
      style={{ gridTemplateColumns: '1fr 140px 160px 120px 100px', color: 'var(--chatty-text)' }}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selectedItems.has(item.id)}
          onChange={() => toggleSelection(item.id)}
        />
        <div className="flex items-center gap-2">
          {item.type === 'image' ? <Image size={16} /> : item.type === 'pdf' ? <FileText size={16} /> : item.type === 'video' ? <Video size={16} /> : item.type === 'audio' ? <Music2 size={16} /> : <FileIcon size={16} />}
          <span className="truncate">{item.title}</span>
        </div>
      </div>
      <div className="truncate">{item.conversationTitle || '—'}</div>
      <div>{formatDate(item.createdAt)}</div>
      <div>{formatFileSize(item.size)}</div>
      <div className="flex items-center gap-3">
        <button onClick={() => handleDownload(item)} className="hover:underline text-xs">Download</button>
        <button onClick={() => handleDelete(item.id)} className="hover:underline text-xs">Delete</button>
      </div>
    </div>
  )

  const tabs: { key: typeof filterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'media', label: 'Media' },
    { key: 'pdf', label: 'PDFs' },
    { key: 'file', label: 'Raw files' }
  ]

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)' }}>Library</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              User-side media (audio, video, images, PDFs, files) kept outside sovereign VVAULT cores
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
            >
              <Trash2 size={16} />
              Delete ({selectedItems.size})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: 'var(--chatty-text)', opacity: 0.75 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--chatty-bg-message)',
                color: 'var(--chatty-text)'
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} style={{ color: 'var(--chatty-text)', opacity: 0.75 }} />
            <div className="flex rounded-lg overflow-hidden">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilterType(tab.key)}
                  className={`px-3 py-2 text-sm ${filterType === tab.key ? '' : 'opacity-70'}`}
                  style={{ backgroundColor: filterType === tab.key ? 'var(--chatty-bg-message)' : 'transparent', color: 'var(--chatty-text)' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg ${viewMode === 'grid' ? 'opacity-100' : 'opacity-70'}`}
              style={{ color: 'var(--chatty-text)' }}
              aria-label="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg ${viewMode === 'list' ? 'opacity-100' : 'opacity-70'}`}
              style={{ color: 'var(--chatty-text)' }}
              aria-label="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: 'var(--chatty-text)' }}>
            <div className="w-12 h-12 rounded-full animate-spin" style={{ backgroundColor: 'var(--chatty-bg-message)' }} />
            <p>Loading your library...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3" style={{ color: 'var(--chatty-text)' }}>
            <Image size={48} color={emptyStateIconColor} />
            <div>
              <p className="text-lg font-medium">No media found</p>
              <p className="text-sm" style={{ opacity: 0.7 }}>Upload media (audio, video, images, PDFs, files) to see it here.</p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems.map(renderGridCard)}
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden">
                <div
                  className="grid px-3 py-2 text-xs font-semibold"
                  style={{ gridTemplateColumns: '1fr 140px 160px 120px 100px', color: 'var(--chatty-text)', backgroundColor: 'var(--chatty-bg-message)' }}
                >
                  <div>Name</div>
                  <div>Conversation</div>
                  <div>Date</div>
                  <div>Size</div>
                  <div>Actions</div>
                </div>
                <div>
                  {filteredItems.map(renderListRow)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
