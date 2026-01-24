import React, { useEffect, useMemo, useState, useRef } from 'react'
import {
  Image,
  Video,
  FileText,
  File as FileIcon,
  Music2,
  Download,
  Trash2,
  Search,
  LayoutGrid,
  List,
  Plus,
  Upload,
  FolderPlus,
  Folder,
  MoreVertical,
  HardDrive,
  ChevronDown,
  Clock,
  Star,
  Users,
  X
} from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'
import { cn } from '../lib/utils'

type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'file' | 'folder'

interface MediaItem {
  id: string
  type: MediaKind
  title: string
  url: string
  thumbnail?: string
  size: number
  createdAt: number
  lastOpened?: number
  conversationId?: string
  conversationTitle?: string
  isFolder?: boolean
  parentId?: string
}

interface FolderItem {
  id: string
  name: string
  itemCount: number
  color?: string
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i
const PDF_EXT = /\.pdf$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg)$/i
const DOC_EXT = /\.(doc|docx|txt|md|rtf)$/i

export default function LibraryPage() {
  const { actualTheme } = useTheme()
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [storageUsed, setStorageUsed] = useState({ used: 0, total: 15 * 1024 * 1024 * 1024 }) // 15GB default
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const newMenuRef = useRef<HTMLDivElement>(null)

  const normalizeType = (rawType: string, title: string): MediaKind => {
    const lower = title.toLowerCase()
    if (rawType === 'folder') return 'folder'
    if (rawType === 'image' || IMAGE_EXT.test(lower)) return 'image'
    if (rawType === 'video' || VIDEO_EXT.test(lower)) return 'video'
    if (rawType === 'audio' || AUDIO_EXT.test(lower)) return 'audio'
    if (rawType === 'document' && PDF_EXT.test(lower)) return 'pdf'
    if (PDF_EXT.test(lower)) return 'pdf'
    if (DOC_EXT.test(lower)) return 'document'
    return 'file'
  }

  // Close new menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load media files
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
            lastOpened: item.lastOpened || item.createdAt,
            conversationTitle: item.conversationTitle
          }))
          setMediaItems(mapped)
          
          // Calculate storage
          const totalUsed = mapped.reduce((acc, item) => acc + (item.size || 0), 0)
          setStorageUsed(prev => ({ ...prev, used: totalUsed }))
        } else {
          setMediaItems([])
        }
        
        // Load folders
        if (data.folders) {
          setFolders(data.folders)
        } else {
          // Default suggested folders
          setFolders([
            { id: 'documents', name: 'Documents', itemCount: 0, color: '#4285f4' },
            { id: 'images', name: 'Images', itemCount: 0, color: '#ea4335' },
            { id: 'transcripts', name: 'Transcripts', itemCount: 0, color: '#34a853' },
          ])
        }
      } catch (error) {
        console.error('Failed to load library:', error)
        setMediaItems([])
        setFolders([
          { id: 'documents', name: 'Documents', itemCount: 0, color: '#4285f4' },
          { id: 'images', name: 'Images', itemCount: 0, color: '#ea4335' },
          { id: 'transcripts', name: 'Transcripts', itemCount: 0, color: '#34a853' },
        ])
      } finally {
        setIsLoading(false)
      }
    }
    loadMedia()
  }, [])

  const filteredItems = useMemo(() => {
    if (!searchQuery) return mediaItems
    const query = searchQuery.toLowerCase()
    return mediaItems.filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.conversationTitle?.toLowerCase().includes(query)
    )
  }, [mediaItems, searchQuery])

  // Sort by last opened for "Suggested files"
  const suggestedFiles = useMemo(() => {
    return [...filteredItems]
      .sort((a, b) => (b.lastOpened || b.createdAt) - (a.lastOpened || a.createdAt))
      .slice(0, 10)
  }, [filteredItems])

  const formatRelativeDate = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60))
      if (hours === 0) {
        const mins = Math.floor(diff / (1000 * 60))
        return mins <= 1 ? 'Just now' : `${mins} minutes ago`
      }
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`
    }
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatStorageSize = (bytes: number) => {
    if (bytes === 0) return '0 GB'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(2)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    // TODO: Implement file upload
    console.log('Uploading files:', files)
    setShowNewMenu(false)
  }

  const handleNewFolder = () => {
    const name = prompt('Enter folder name:')
    if (name) {
      setFolders(prev => [...prev, {
        id: `folder-${Date.now()}`,
        name,
        itemCount: 0,
        color: '#fbbc04'
      }])
    }
    setShowNewMenu(false)
  }

  const getFileIcon = (type: MediaKind, size: number = 24) => {
    switch (type) {
      case 'image': return <Image size={size} />
      case 'video': return <Video size={size} />
      case 'audio': return <Music2 size={size} />
      case 'pdf': return <FileText size={size} style={{ color: '#ea4335' }} />
      case 'document': return <FileText size={size} style={{ color: '#4285f4' }} />
      case 'folder': return <Folder size={size} />
      default: return <FileIcon size={size} />
    }
  }

  const renderFileCard = (item: MediaItem) => (
    <div
      key={item.id}
      className="group rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-lg"
      style={{ 
        backgroundColor: 'var(--chatty-bg-message)',
        border: selectedItems.has(item.id) ? '2px solid var(--chatty-accent, #4285f4)' : '1px solid var(--chatty-border)'
      }}
      onClick={() => {
        const newSelected = new Set(selectedItems)
        if (newSelected.has(item.id)) {
          newSelected.delete(item.id)
        } else {
          newSelected.add(item.id)
        }
        setSelectedItems(newSelected)
      }}
    >
      {/* Preview Area */}
      <div 
        className="aspect-[4/3] flex items-center justify-center relative"
        style={{ backgroundColor: 'var(--chatty-bg)' }}
      >
        {item.type === 'image' && item.thumbnail ? (
          <img 
            src={item.thumbnail || item.url} 
            alt={item.title} 
            className="w-full h-full object-cover"
          />
        ) : item.type === 'pdf' || item.type === 'document' ? (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#f8f9fa' }}>
            <div className="text-center p-4">
              {getFileIcon(item.type, 48)}
              <div className="mt-2 text-xs opacity-50 line-clamp-3" style={{ color: '#5f6368' }}>
                {item.title}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
            {getFileIcon(item.type, 48)}
          </div>
        )}
        
        {/* Hover Menu */}
        <button 
          className="absolute top-2 right-2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { e.stopPropagation() }}
        >
          <MoreVertical size={16} className="text-white" />
        </button>
      </div>
      
      {/* Info Area */}
      <div className="p-3">
        <div className="flex items-start gap-2">
          <div className="flex-shrink-0 mt-0.5">
            {getFileIcon(item.type, 18)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate" style={{ color: 'var(--chatty-text)' }}>
              {item.title}
            </h4>
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              <span className="w-5 h-5 rounded-full bg-[var(--chatty-accent)] flex items-center justify-center text-white text-[10px]">
                Y
              </span>
              You opened • {formatRelativeDate(item.lastOpened || item.createdAt)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderFolderCard = (folder: FolderItem) => (
    <div
      key={folder.id}
      className="flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-all hover:shadow-md"
      style={{ 
        backgroundColor: 'var(--chatty-bg-message)',
        border: '1px solid var(--chatty-border)'
      }}
    >
      <Folder size={24} style={{ color: folder.color || 'var(--chatty-text)' }} />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium truncate" style={{ color: 'var(--chatty-text)' }}>
          {folder.name}
        </h4>
      </div>
      <button className="p-1 rounded hover:bg-[var(--chatty-highlight)]">
        <MoreVertical size={16} style={{ color: 'var(--chatty-text)', opacity: 0.6 }} />
      </button>
    </div>
  )

  const renderListRow = (item: MediaItem) => (
    <div
      key={item.id}
      className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--chatty-highlight)] cursor-pointer transition-colors"
      style={{ borderBottom: '1px solid var(--chatty-border)' }}
    >
      <input
        type="checkbox"
        checked={selectedItems.has(item.id)}
        onChange={() => {
          const newSelected = new Set(selectedItems)
          if (newSelected.has(item.id)) newSelected.delete(item.id)
          else newSelected.add(item.id)
          setSelectedItems(newSelected)
        }}
        className="w-4 h-4"
      />
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {getFileIcon(item.type, 20)}
        <span className="text-sm truncate" style={{ color: 'var(--chatty-text)' }}>{item.title}</span>
      </div>
      <div className="text-xs w-32 truncate" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
        {item.conversationTitle || '—'}
      </div>
      <div className="text-xs w-28" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
        You opened • {formatRelativeDate(item.lastOpened || item.createdAt)}
      </div>
      <button className="p-1 rounded hover:bg-[var(--chatty-highlight)]">
        <MoreVertical size={16} style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
      </button>
    </div>
  )

  const storagePercent = (storageUsed.used / storageUsed.total) * 100

  return (
    <div className="h-full flex" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      {/* Left Sidebar */}
      <div 
        className="w-60 flex-shrink-0 flex flex-col p-4 border-r"
        style={{ borderColor: 'var(--chatty-border)' }}
      >
        {/* New Button */}
        <div className="relative mb-6" ref={newMenuRef}>
          <button
            onClick={() => setShowNewMenu(!showNewMenu)}
            className="flex items-center gap-3 px-6 py-3 rounded-2xl shadow-md transition-all hover:shadow-lg"
            style={{ 
              backgroundColor: 'var(--chatty-bg-message)',
              color: 'var(--chatty-text)'
            }}
          >
            <Plus size={24} />
            <span className="font-medium">New</span>
            <ChevronDown size={16} className="ml-auto" />
          </button>
          
          {showNewMenu && (
            <div 
              className="absolute top-full left-0 mt-2 w-56 rounded-lg shadow-xl overflow-hidden z-50"
              style={{ 
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-bg-message))',
                border: '1px solid var(--chatty-border)'
              }}
            >
              <button 
                onClick={handleNewFolder}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
                style={{ color: 'var(--chatty-text)' }}
              >
                <FolderPlus size={20} />
                New folder
              </button>
              <div className="h-px" style={{ backgroundColor: 'var(--chatty-border)' }} />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
                style={{ color: 'var(--chatty-text)' }}
              >
                <Upload size={20} />
                File upload
              </button>
              <button 
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
                style={{ color: 'var(--chatty-text)' }}
              >
                <FolderPlus size={20} />
                Folder upload
              </button>
            </div>
          )}
          
          <input 
            ref={fileInputRef}
            type="file" 
            multiple 
            className="hidden"
            onChange={handleFileUpload}
          />
          <input 
            ref={folderInputRef}
            type="file" 
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Quick Access */}
        <nav className="space-y-1 flex-1">
          <button 
            className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
            style={{ color: 'var(--chatty-text)' }}
          >
            <HardDrive size={18} />
            My Library
          </button>
          <button 
            className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
            style={{ color: 'var(--chatty-text)' }}
          >
            <Users size={18} />
            Shared with me
          </button>
          <button 
            className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
            style={{ color: 'var(--chatty-text)' }}
          >
            <Clock size={18} />
            Recent
          </button>
          <button 
            className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
            style={{ color: 'var(--chatty-text)' }}
          >
            <Star size={18} />
            Starred
          </button>
          <button 
            className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
            style={{ color: 'var(--chatty-text)' }}
          >
            <Trash2 size={18} />
            Trash
          </button>
        </nav>

        {/* Storage */}
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--chatty-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <HardDrive size={16} style={{ color: 'var(--chatty-text)', opacity: 0.7 }} />
            <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Storage</span>
          </div>
          <div 
            className="h-1 rounded-full overflow-hidden mb-2"
            style={{ backgroundColor: 'var(--chatty-border)' }}
          >
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                width: `${Math.min(storagePercent, 100)}%`,
                backgroundColor: storagePercent > 90 ? '#ea4335' : 'var(--chatty-accent, #4285f4)'
              }}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
            {formatStorageSize(storageUsed.used)} of {formatStorageSize(storageUsed.total)} used
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b" style={{ borderColor: 'var(--chatty-border)' }}>
          {/* Search */}
          <div 
            className="flex-1 max-w-2xl flex items-center gap-3 px-4 py-2.5 rounded-full"
            style={{ 
              backgroundColor: 'var(--chatty-bg-message)',
              border: '1px solid var(--chatty-border)'
            }}
          >
            <Search size={20} style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in Library"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--chatty-text)' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}>
                <X size={16} style={{ color: 'var(--chatty-text)', opacity: 0.5 }} />
              </button>
            )}
          </div>
          
          {/* View Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)' }}>
            <button
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded", viewMode === 'list' && "bg-[var(--chatty-highlight)]")}
              style={{ color: 'var(--chatty-text)' }}
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn("p-2 rounded", viewMode === 'grid' && "bg-[var(--chatty-highlight)]")}
              style={{ color: 'var(--chatty-text)' }}
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--chatty-accent, #4285f4)' }} />
            </div>
          ) : (
            <>
              {/* Welcome */}
              <h1 className="text-2xl font-normal mb-6" style={{ color: 'var(--chatty-text)' }}>
                Welcome to Library
              </h1>

              {/* Suggested Folders */}
              {folders.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
                    Suggested folders
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {folders.map(renderFolderCard)}
                  </div>
                </section>
              )}

              {/* Suggested Files */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                    Suggested files
                  </h2>
                </div>
                
                {suggestedFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Image size={64} style={{ color: 'var(--chatty-text)', opacity: 0.3 }} />
                    <h3 className="text-lg font-medium mt-4" style={{ color: 'var(--chatty-text)' }}>
                      No files yet
                    </h3>
                    <p className="text-sm mt-2" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                      Upload files to see them here
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 px-6 py-2 rounded-full text-sm font-medium transition-colors"
                      style={{ 
                        backgroundColor: 'var(--chatty-accent, #4285f4)',
                        color: 'white'
                      }}
                    >
                      Upload files
                    </button>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {suggestedFiles.map(renderFileCard)}
                  </div>
                ) : (
                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--chatty-border)' }}>
                    {suggestedFiles.map(renderListRow)}
                  </div>
                )}
                
                {filteredItems.length > 10 && (
                  <button 
                    className="mt-4 text-sm font-medium"
                    style={{ color: 'var(--chatty-accent, #4285f4)' }}
                  >
                    View more
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
